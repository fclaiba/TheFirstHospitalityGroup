// Bar shortages (ADR 0023): bartender and barback mark an item Low or Out; the head bartender or the manager marks it
// Restocked or Ordered; open shortages carry over to the next shift and go into the close. No counts, no costs.
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireCan, requireVenue, pickVenue } from "./lib/auth";
import { appError } from "./lib/errors";
import { audit } from "./lib/audit";
import { enqueue } from "./lib/notify";
import { getShift, requireLiveShift, rosterOf, venueManagers } from "./lib/shift";
import { attachFile, nameOf } from "./lib/service";
import { parseOrThrow } from "./lib/validate";
import { barItemInput, shortageInput, shortageResolveInput } from "../schemas";
import { makeT } from "../lib/i18n";

async function present(ctx: QueryCtx, s: Doc<"shortages">) {
  const item = await ctx.db.get(s.itemId);
  return {
    _id: s._id,
    itemId: s.itemId,
    itemName: item?.name ?? "",
    kind: item?.kind ?? "other",
    level: s.level,
    note: s.note ?? null,
    photoUrl: s.photoId ? await ctx.storage.getUrl(s.photoId) : null,
    status: s.status,
    at: s.at,
    byName: (await nameOf(ctx, s.by)) ?? "",
    resolvedByName: await nameOf(ctx, s.resolvedBy),
    resolvedAt: s.resolvedAt ?? null,
    shiftId: s.shiftId,
  };
}

async function openOf(ctx: QueryCtx, venueId: Id<"venues">) {
  return await ctx.db
    .query("shortages")
    .withIndex("by_venue_status", (q) => q.eq("venueId", venueId).eq("status", "open"))
    .collect();
}

/** The bar items of a venue (the shortage list's rows). */
export const items = query({
  args: { venueId: v.optional(v.id("venues")), includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "bar.report");
    const venueId = pickVenue(actor, args.venueId);
    const rows = await ctx.db
      .query("barItems")
      .withIndex("by_venue", (q) => q.eq("venueId", venueId))
      .collect();
    const open = await openOf(ctx, venueId);
    return rows
      .filter((r) => r.active || args.includeInactive)
      .map((r) => {
        const s = open.find((x) => x.itemId === r._id);
        return { _id: r._id, name: r.name, kind: r.kind, active: r.active, sort: r.sort, open: s ? { shortageId: s._id, level: s.level } : null };
      });
  },
});

export const upsertItem = mutation({
  args: { itemId: v.optional(v.id("barItems")), venueId: v.id("venues"), name: v.string(), kind: v.string(), active: v.boolean() },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "bar.items");
    const p = parseOrThrow(barItemInput, args);
    requireVenue(actor, args.venueId);
    let itemId: Id<"barItems">;
    if (args.itemId) {
      const prev = await ctx.db.get(args.itemId);
      if (!prev || prev.venueId !== args.venueId) throw appError("NOT_FOUND");
      await ctx.db.patch(prev._id, { name: p.name, kind: p.kind, active: p.active });
      itemId = prev._id;
    } else {
      const count = (
        await ctx.db
          .query("barItems")
          .withIndex("by_venue", (q) => q.eq("venueId", args.venueId))
          .collect()
      ).length;
      itemId = await ctx.db.insert("barItems", { venueId: args.venueId, name: p.name, kind: p.kind, active: p.active, sort: count });
    }
    await audit(ctx, { actorId: actor._id, venueId: args.venueId, action: "bar.item_changed", entity: "barItems", entityId: itemId, meta: { created: !args.itemId } });
    return { itemId };
  },
});

/** Mark an item Low or Out. One open shortage per item: reporting again updates its level. */
export const report = mutation({
  args: { shiftId: v.id("shifts"), itemId: v.id("barItems"), level: v.string(), note: v.optional(v.string()), photoId: v.optional(v.id("_storage")) },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "bar.report");
    const p = parseOrThrow(shortageInput, args);
    const shift = await requireLiveShift(ctx, actor, args.shiftId);
    const item = await ctx.db.get(args.itemId);
    if (!item || item.venueId !== shift.venueId || !item.active) throw appError("NOT_FOUND");
    const now = Date.now();
    const existing = (await openOf(ctx, shift.venueId)).find((s) => s.itemId === item._id);
    let shortageId: Id<"shortages">;
    if (existing) {
      if (existing.level === p.level) return { shortageId: existing._id, updated: false };
      await ctx.db.patch(existing._id, { level: p.level, note: p.note ?? existing.note, by: actor._id, at: now });
      shortageId = existing._id;
    } else {
      shortageId = await ctx.db.insert("shortages", { venueId: shift.venueId, shiftId: shift._id, itemId: item._id, level: p.level, note: p.note, photoId: args.photoId, by: actor._id, at: now, status: "open" });
    }
    if (args.photoId) await attachFile(ctx, actor, args.photoId, `shortages:${shortageId}`);
    await ctx.db.insert("analyticsEvents", { name: "shortage_reported", userId: actor._id, venueId: shift.venueId, props: { level: p.level }, at: now });
    const onDuty = (await rosterOf(ctx, shift)).filter((r) => r.position === "head_bartender").map((r) => r.user._id);
    const managers = (await venueManagers(ctx, shift.venueId, ["floor_manager"])).map((u) => u._id);
    const to = [...onDuty, ...managers].filter((id) => id !== actor._id);
    for (const id of new Set(to)) {
      const u = await ctx.db.get(id);
      const t = makeT(u?.locale ?? "en");
      await enqueue(ctx, [id], { topic: "shortage", key: "shortage", vars: { item: item.name, level: t(`states.${p.level}`).toLowerCase(), name: actor.name }, url: "/manage/bar" });
    }
    return { shortageId, updated: !!existing };
  },
});

export const resolve = mutation({
  args: { shortageId: v.id("shortages"), status: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "bar.resolve");
    const p = parseOrThrow(shortageResolveInput, args);
    const s = await ctx.db.get(args.shortageId);
    if (!s) throw appError("NOT_FOUND");
    requireVenue(actor, s.venueId);
    if (s.status !== "open" && !(s.status === "ordered" && p.status === "restocked")) throw appError("INVALID_TRANSITION");
    const now = Date.now();
    await ctx.db.patch(s._id, { status: p.status, resolvedBy: actor._id, resolvedAt: now });
    await audit(ctx, { actorId: actor._id, venueId: s.venueId, action: "shortage.resolved", entity: "shortages", entityId: s._id, meta: { status: p.status } });
    return { ok: true };
  },
});

/** The live list of a venue: open shortages (carried over from earlier shifts too) and the ones waiting for an order. */
export const open = query({
  args: { venueId: v.optional(v.id("venues")) },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "bar.report");
    const venueId = pickVenue(actor, args.venueId);
    const out = [];
    for (const s of await openOf(ctx, venueId)) out.push(await present(ctx, s));
    const ordered = [];
    for (const s of await ctx.db
      .query("shortages")
      .withIndex("by_venue_status", (q) => q.eq("venueId", venueId).eq("status", "ordered"))
      .collect())
      ordered.push(await present(ctx, s));
    out.sort((a, b) => Number(b.level === "out") - Number(a.level === "out") || b.at - a.at);
    return { open: out, ordered: ordered.sort((a, b) => b.at - a.at) };
  },
});

/** Everything reported in a shift, for the close. */
export const forShift = query({
  args: { shiftId: v.id("shifts") },
  handler: async (ctx, { shiftId }) => {
    const actor = await requireCan(ctx, "close.read");
    const shift = await getShift(ctx, actor, shiftId);
    const rows = await ctx.db
      .query("shortages")
      .withIndex("by_shift", (q) => q.eq("shiftId", shift._id))
      .collect();
    const out = [];
    for (const s of rows.sort((a, b) => b.at - a.at)) out.push(await present(ctx, s));
    return out;
  },
});
