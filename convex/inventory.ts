// Bar inventory (BLUEPRINT 2.2, 2.4, 7.2): items per venue, counts in integer tenths at open and close, purchases and
// moves that are append-only, and the shift report (shortages against the last close plus purchases).
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireRole, requireVenue } from "./lib/auth";
import type { Actor } from "./lib/auth";
import { appError } from "./lib/errors";
import { audit } from "./lib/audit";
import { getShift, liveShiftOf, requireLiveShift } from "./lib/shift";
import { shiftStock } from "./lib/stockReport";
import { parseOrThrow } from "./lib/validate";
import { countInput, inventoryItemInput, moveInput, purchaseInput } from "../schemas";
import { isValidCount, weightedAvgCost } from "../lib/domain/stock";

const BAR = ["bartender", "barback", "manager"] as const;
const canSeeMoney = (a: Actor) => a.role === "manager" || a.role === "owner" || a.role === "dev";

/** Current on-hand (tenths): the latest count plus every move recorded after it; all moves when never counted. */
async function onHandOf(ctx: QueryCtx, itemId: Id<"inventoryItems">): Promise<{ qty: number; lastCount: Doc<"inventoryCounts"> | null }> {
  const lastCount = await ctx.db
    .query("inventoryCounts")
    .withIndex("by_item", (q) => q.eq("itemId", itemId))
    .order("desc")
    .first();
  const since = lastCount?.at ?? -1;
  const moves = await ctx.db
    .query("stockMoves")
    .withIndex("by_item_at", (q) => q.eq("itemId", itemId).gt("at", since))
    .collect();
  return { qty: (lastCount?.qtyTenths ?? 0) + moves.reduce((n, m) => n + m.qtyTenths, 0), lastCount };
}

async function itemInVenue(ctx: QueryCtx, itemId: string, venueId: Id<"venues">): Promise<Doc<"inventoryItems">> {
  const id = ctx.db.normalizeId("inventoryItems", itemId);
  const item = id ? await ctx.db.get(id) : null;
  if (!item || item.venueId !== venueId) throw appError("NOT_FOUND");
  return item;
}

async function attachPhoto(ctx: MutationCtx, actor: Actor, storageId: string, to: string): Promise<Id<"_storage">> {
  const file = await ctx.db
    .query("files")
    .withIndex("by_storage", (q) => q.eq("storageId", storageId as Id<"_storage">))
    .unique();
  if (!file || file.ownerId !== actor._id) throw appError("NOT_FOUND");
  await ctx.db.patch(file._id, { attachedTo: to });
  return file.storageId;
}

export const items = query({
  args: { venueId: v.id("venues"), includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, [...BAR]);
    requireVenue(actor, args.venueId);
    const rows = await ctx.db
      .query("inventoryItems")
      .withIndex("by_venue_sort", (q) => q.eq("venueId", args.venueId))
      .collect();
    const money = canSeeMoney(actor);
    const out = [];
    for (const item of rows) {
      if (!item.active && !args.includeInactive) continue;
      const { qty, lastCount } = await onHandOf(ctx, item._id);
      out.push({
        _id: item._id,
        name: item.name,
        category: item.category,
        unit: item.unit,
        parLevel: item.parLevel ?? null,
        avgCostCents: money ? item.avgCostCents : null,
        active: item.active,
        sort: item.sort,
        photoId: item.photoId ?? null,
        photoUrl: item.photoId ? await ctx.storage.getUrl(item.photoId) : null,
        onHandTenths: qty,
        lastCountAt: lastCount?.at ?? null,
        belowPar: !!item.parLevel && qty < item.parLevel,
      });
    }
    return out;
  },
});

export const upsertItem = mutation({
  args: {
    itemId: v.optional(v.id("inventoryItems")),
    venueId: v.id("venues"),
    name: v.string(),
    category: v.string(),
    unit: v.string(),
    parLevel: v.optional(v.number()),
    avgCostCents: v.number(),
    photoId: v.optional(v.string()),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, ["manager"]);
    const p = parseOrThrow(inventoryItemInput, args);
    requireVenue(actor, args.venueId);
    const prev = args.itemId ? await itemInVenue(ctx, args.itemId, args.venueId) : null;
    // A new upload is attached to its uploader's file; the photo the item already has is kept as is; none removes it.
    const photoId = !p.photoId ? undefined : prev?.photoId === p.photoId ? prev.photoId : await attachPhoto(ctx, actor, p.photoId, "inventoryItems");
    const doc = { name: p.name, category: p.category, unit: p.unit, parLevel: p.parLevel, avgCostCents: p.avgCostCents, active: p.active };
    if (prev) {
      await ctx.db.patch(prev._id, { ...doc, photoId });
      await audit(ctx, { actorId: actor._id, venueId: args.venueId, action: "stock.item_changed", entity: "inventoryItems", entityId: prev._id });
      return { itemId: prev._id };
    }
    const count = (
      await ctx.db
        .query("inventoryItems")
        .withIndex("by_venue_sort", (q) => q.eq("venueId", args.venueId))
        .collect()
    ).length;
    const itemId = await ctx.db.insert("inventoryItems", { ...doc, venueId: args.venueId, photoId, sort: count });
    await audit(ctx, { actorId: actor._id, venueId: args.venueId, action: "stock.item_changed", entity: "inventoryItems", entityId: itemId, meta: { created: true } });
    return { itemId };
  },
});

/** Opening or closing count. A new row per item; the latest count of a phase wins in the report. */
export const count = mutation({
  args: {
    shiftId: v.id("shifts"),
    phase: v.string(),
    counts: v.array(v.object({ itemId: v.string(), qtyTenths: v.number(), photoId: v.optional(v.string()) })),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, [...BAR]);
    const p = parseOrThrow(countInput, args);
    const shift = await requireLiveShift(ctx, actor, args.shiftId);
    const now = Date.now();
    const seen = new Set<string>();
    for (const c of p.counts) {
      if (!isValidCount(c.qtyTenths) || seen.has(c.itemId)) throw appError("INVALID_INPUT", undefined, { fields: { counts: "invalid" } });
      seen.add(c.itemId);
      const item = await itemInVenue(ctx, c.itemId, shift.venueId);
      const photoId = c.photoId ? await attachPhoto(ctx, actor, c.photoId, `inventoryCounts:${shift._id}`) : undefined;
      await ctx.db.insert("inventoryCounts", { shiftId: shift._id, venueId: shift.venueId, itemId: item._id, phase: p.phase, qtyTenths: c.qtyTenths, by: actor._id, at: now, photoId });
    }
    await audit(ctx, { actorId: actor._id, venueId: shift.venueId, action: "stock.count", entity: "shifts", entityId: shift._id, meta: { phase: p.phase, items: p.counts.length } });
    return { counted: p.counts.length };
  },
});

export const recordPurchase = mutation({
  args: { venueId: v.id("venues"), itemId: v.string(), qtyTenths: v.number(), unitCostCents: v.number(), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, ["manager"]);
    const p = parseOrThrow(purchaseInput, args);
    requireVenue(actor, args.venueId);
    const item = await itemInVenue(ctx, p.itemId, args.venueId);
    const { qty } = await onHandOf(ctx, item._id);
    const live = await liveShiftOf(ctx, args.venueId);
    const now = Date.now();
    const moveId = await ctx.db.insert("stockMoves", {
      itemId: item._id,
      venueId: args.venueId,
      qtyTenths: p.qtyTenths,
      type: "purchase",
      unitCostCents: p.unitCostCents,
      shiftId: live?._id,
      note: p.note,
      by: actor._id,
      at: now,
    });
    const avgCostCents = weightedAvgCost(qty, item.avgCostCents, p.qtyTenths, p.unitCostCents);
    await ctx.db.patch(item._id, { avgCostCents });
    await audit(ctx, { actorId: actor._id, venueId: args.venueId, action: "stock.move", entity: "stockMoves", entityId: moveId, meta: { type: "purchase", qtyTenths: p.qtyTenths, unitCostCents: p.unitCostCents } });
    return { moveId, avgCostCents };
  },
});

/** Waste, comp, adjustment or a transfer to another venue. Always a new row with a reason: moves are never edited. */
export const recordMove = mutation({
  args: { venueId: v.id("venues"), itemId: v.string(), type: v.string(), qtyTenths: v.number(), toVenueId: v.optional(v.string()), note: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, ["manager"]);
    const p = parseOrThrow(moveInput, args);
    requireVenue(actor, args.venueId);
    const item = await itemInVenue(ctx, p.itemId, args.venueId);
    const live = await liveShiftOf(ctx, args.venueId);
    const now = Date.now();
    // Losses always take bottles off the shelf; an adjustment keeps its sign.
    const qtyTenths = p.type === "adjustment" ? p.qtyTenths : -Math.abs(p.qtyTenths);
    let toItemId: Id<"inventoryItems"> | undefined;
    if (p.type === "transfer_out") {
      const toId = p.toVenueId ? ctx.db.normalizeId("venues", p.toVenueId) : null;
      const to = toId ? await ctx.db.get(toId) : null;
      const from = await ctx.db.get(args.venueId);
      if (!to || !from || to.companyId !== from.companyId || to._id === from._id || !to.active) {
        throw appError("INVALID_INPUT", undefined, { fields: { toVenueId: "invalid" } });
      }
      const there = (
        await ctx.db
          .query("inventoryItems")
          .withIndex("by_venue_sort", (q) => q.eq("venueId", to._id))
          .collect()
      );
      const match = there.find((i) => i.name.trim().toLowerCase() === item.name.trim().toLowerCase());
      toItemId =
        match?._id ??
        (await ctx.db.insert("inventoryItems", {
          venueId: to._id,
          name: item.name,
          category: item.category,
          unit: item.unit,
          parLevel: item.parLevel,
          avgCostCents: item.avgCostCents,
          active: true,
          sort: there.length,
        }));
      const inId = await ctx.db.insert("stockMoves", {
        itemId: toItemId,
        venueId: to._id,
        qtyTenths: Math.abs(p.qtyTenths),
        type: "transfer_in",
        unitCostCents: item.avgCostCents,
        note: `${from.name}: ${p.note}`,
        by: actor._id,
        at: now,
      });
      await audit(ctx, { actorId: actor._id, venueId: to._id, action: "stock.move", entity: "stockMoves", entityId: inId, meta: { type: "transfer_in", from: from._id } });
    }
    const moveId = await ctx.db.insert("stockMoves", {
      itemId: item._id,
      venueId: args.venueId,
      qtyTenths,
      type: p.type,
      unitCostCents: item.avgCostCents,
      shiftId: live?._id,
      note: p.note,
      by: actor._id,
      at: now,
    });
    await audit(ctx, { actorId: actor._id, venueId: args.venueId, action: "stock.move", entity: "stockMoves", entityId: moveId, meta: { type: p.type, qtyTenths, toItemId } });
    return { moveId, toItemId: toItemId ?? null };
  },
});

/** The shift's bar report. Lost cost is money: only managers and owners get it (BLUEPRINT 2.4). */
export const shiftReport = query({
  args: { shiftId: v.id("shifts") },
  handler: async (ctx, { shiftId }) => {
    const actor = await requireRole(ctx, [...BAR]);
    const shift = await getShift(ctx, actor, shiftId);
    const r = await shiftStock(ctx, shift);
    const money = canSeeMoney(actor);
    return {
      shift: { _id: shift._id, date: shift.date, service: shift.service, status: shift.status },
      money,
      rows: r.rows.map((row) => ({ ...row, lostCostCents: money ? row.lostCostCents : 0 })),
      totals: { ...r.totals, lostCostCents: money ? r.totals.lostCostCents : 0 },
      missingOpen: r.missingOpen,
      missingClose: r.missingClose,
    };
  },
});

/** What to count now at a venue: the live shift, the phase, each item with its last count and tonight's count. */
export const countSheet = query({
  args: { venueId: v.id("venues") },
  handler: async (ctx, { venueId }) => {
    const actor = await requireRole(ctx, [...BAR]);
    requireVenue(actor, venueId);
    const shift = await liveShiftOf(ctx, venueId);
    const rows = (
      await ctx.db
        .query("inventoryItems")
        .withIndex("by_venue_sort", (q) => q.eq("venueId", venueId))
        .collect()
    ).filter((i) => i.active);
    if (!shift) return { shift: null, phase: null, items: [], counted: 0 };
    const phase: "open" | "close" = shift.status === "closing" ? "close" : "open";
    const tonight = (
      await ctx.db
        .query("inventoryCounts")
        .withIndex("by_shift", (q) => q.eq("shiftId", shift._id))
        .collect()
    )
      .filter((c) => c.phase === phase)
      .sort((a, b) => a.at - b.at);
    const mine: Record<string, Doc<"inventoryCounts">> = {};
    for (const c of tonight) mine[c.itemId] = c;
    const items = [];
    for (const item of rows) {
      const last = await ctx.db
        .query("inventoryCounts")
        .withIndex("by_item", (q) => q.eq("itemId", item._id))
        .order("desc")
        .first();
      const now = mine[item._id];
      items.push({
        _id: item._id,
        name: item.name,
        category: item.category,
        unit: item.unit,
        parLevel: item.parLevel ?? null,
        photoUrl: item.photoId ? await ctx.storage.getUrl(item.photoId) : null,
        lastTenths: last?.qtyTenths ?? null,
        countedTenths: now?.qtyTenths ?? null,
        countedAt: now?.at ?? null,
        countPhotoId: now?.photoId ?? null,
      });
    }
    return {
      shift: { _id: shift._id, status: shift.status, service: shift.service, date: shift.date },
      phase,
      items,
      counted: items.filter((i) => i.countedTenths !== null).length,
    };
  },
});

/** Recent moves of a venue, newest first, with item and person names (manager, owner). */
export const history = query({
  args: { venueId: v.id("venues"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, ["manager"]);
    requireVenue(actor, args.venueId);
    const moves = await ctx.db
      .query("stockMoves")
      .withIndex("by_venue_at", (q) => q.eq("venueId", args.venueId))
      .order("desc")
      .take(Math.min(Math.max(args.limit ?? 30, 1), 100));
    const names = new Map<string, string>();
    const name = async (id: Id<"inventoryItems"> | Id<"users">) => {
      if (!names.has(id)) {
        const d = (await ctx.db.get(id)) as { name?: string } | null;
        names.set(id, d?.name ?? "");
      }
      return names.get(id)!;
    };
    const out = [];
    for (const m of moves) {
      out.push({ _id: m._id, type: m.type, qtyTenths: m.qtyTenths, unitCostCents: m.unitCostCents ?? null, note: m.note ?? null, at: m.at, itemName: await name(m.itemId), byName: await name(m.by) });
    }
    return out;
  },
});
