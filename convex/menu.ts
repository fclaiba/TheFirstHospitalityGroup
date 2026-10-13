// Menu with photos (BLUEPRINT 2.2, ADR 0004, 0005): one company catalog with {en, es} content; each venue sets
// availability and an optional price override. Staff read; the owner edits the catalog; managers set availability.
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireRole, requireUser, requireVenue } from "./lib/auth";
import { appError } from "./lib/errors";
import { audit } from "./lib/audit";
import { parseOrThrow } from "./lib/validate";
import { menuItemInput } from "../schemas";
import { MENU_CATEGORIES } from "../lib/domain/types";

async function shape(ctx: QueryCtx, item: Doc<"menuItems">, avail: Doc<"menuAvailability"> | null) {
  return {
    _id: item._id,
    name: item.name,
    description: item.description,
    ingredients: item.ingredients,
    allergens: item.allergens,
    category: item.category,
    tags: item.tags,
    sort: item.sort,
    active: item.active,
    basePriceCents: item.priceCents,
    priceCents: avail?.priceOverrideCents ?? item.priceCents,
    priceOverridden: avail?.priceOverrideCents !== undefined && avail?.priceOverrideCents !== null,
    available: avail ? avail.available : true,
    photoId: item.photoId ?? null,
    photoUrl: item.photoId ? await ctx.storage.getUrl(item.photoId) : null,
  };
}

const catIndex = (c: string) => {
  const i = (MENU_CATEGORIES as readonly string[]).indexOf(c);
  return i === -1 ? 99 : i;
};

async function availabilityFor(ctx: QueryCtx, venueId: Id<"venues">) {
  const rows = await ctx.db
    .query("menuAvailability")
    .withIndex("by_venue_item", (q) => q.eq("venueId", venueId))
    .collect();
  return new Map(rows.map((r) => [r.itemId as string, r]));
}

/** Catalog for a venue: active items (owner sees inactive too with includeInactive), filtered and sorted. */
export const list = query({
  args: { venueId: v.id("venues"), category: v.optional(v.string()), q: v.optional(v.string()), includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    requireVenue(actor, args.venueId);
    const all = await ctx.db
      .query("menuItems")
      .withIndex("by_company_category", (q) => (args.category ? q.eq("companyId", actor.companyId).eq("category", args.category) : q.eq("companyId", actor.companyId)))
      .collect();
    const avail = await availabilityFor(ctx, args.venueId);
    const needle = args.q?.trim().toLowerCase();
    const showInactive = !!args.includeInactive && (actor.role === "owner" || actor.role === "dev");
    const out = [];
    for (const item of all) {
      if (!item.active && !showInactive) continue;
      if (needle) {
        const hay = [item.name.en, item.name.es, item.description.en, item.description.es, item.ingredients.en, item.ingredients.es, ...item.tags].join(" ").toLowerCase();
        if (!hay.includes(needle)) continue;
      }
      out.push(await shape(ctx, item, avail.get(item._id) ?? null));
    }
    return out.sort((a, b) => catIndex(a.category) - catIndex(b.category) || a.sort - b.sort);
  },
});

export const get = query({
  args: { itemId: v.id("menuItems"), venueId: v.id("venues") },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    requireVenue(actor, args.venueId);
    const item = await ctx.db.get(args.itemId);
    if (!item || item.companyId !== actor.companyId) throw appError("NOT_FOUND");
    const avail = (await availabilityFor(ctx, args.venueId)).get(item._id) ?? null;
    return await shape(ctx, item, avail);
  },
});

/** Categories present in the catalog, in the house order. */
export const categories = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireUser(ctx);
    const all = await ctx.db
      .query("menuItems")
      .withIndex("by_company_category", (q) => q.eq("companyId", actor.companyId))
      .collect();
    return [...new Set(all.filter((i) => i.active).map((i) => i.category))].sort((a, b) => catIndex(a) - catIndex(b));
  },
});

export const upsert = mutation({
  args: {
    itemId: v.optional(v.id("menuItems")),
    name: v.object({ en: v.string(), es: v.string() }),
    description: v.object({ en: v.string(), es: v.string() }),
    ingredients: v.object({ en: v.string(), es: v.string() }),
    allergens: v.array(v.string()),
    category: v.string(),
    priceCents: v.number(),
    photoId: v.optional(v.id("_storage")),
    tags: v.array(v.string()),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, ["owner"]);
    const p = parseOrThrow(menuItemInput, args);
    const doc = {
      name: p.name,
      description: p.description,
      ingredients: p.ingredients,
      allergens: p.allergens,
      category: p.category,
      priceCents: p.priceCents,
      photoId: args.photoId,
      tags: p.tags,
      active: p.active,
    };
    let itemId: Id<"menuItems">;
    if (args.itemId) {
      const prev = await ctx.db.get(args.itemId);
      if (!prev || prev.companyId !== actor.companyId) throw appError("NOT_FOUND");
      await ctx.db.patch(prev._id, doc);
      itemId = prev._id;
      if (prev.priceCents !== p.priceCents) {
        await audit(ctx, { actorId: actor._id, action: "menu.price_changed", entity: "menuItems", entityId: itemId, meta: { from: prev.priceCents, to: p.priceCents } });
      }
    } else {
      const last = await ctx.db
        .query("menuItems")
        .withIndex("by_company_category", (q) => q.eq("companyId", actor.companyId).eq("category", p.category))
        .order("desc")
        .first();
      itemId = await ctx.db.insert("menuItems", { companyId: actor.companyId, ...doc, sort: (last?.sort ?? -1) + 1 });
    }
    if (args.photoId) {
      const file = await ctx.db
        .query("files")
        .withIndex("by_storage", (q) => q.eq("storageId", args.photoId!))
        .unique();
      if (file) await ctx.db.patch(file._id, { attachedTo: `menuItems:${itemId}` });
    }
    await audit(ctx, { actorId: actor._id, action: "menu.changed", entity: "menuItems", entityId: itemId, meta: { created: !args.itemId } });
    return { itemId };
  },
});

export const setAvailability = mutation({
  args: { itemId: v.id("menuItems"), venueId: v.id("venues"), available: v.boolean(), priceOverrideCents: v.optional(v.union(v.number(), v.null())) },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, ["manager"]);
    requireVenue(actor, args.venueId);
    const item = await ctx.db.get(args.itemId);
    if (!item || item.companyId !== actor.companyId) throw appError("NOT_FOUND");
    const override = args.priceOverrideCents === null ? undefined : args.priceOverrideCents;
    if (override !== undefined && (!Number.isInteger(override) || override < 0 || override > 100_000_000)) {
      throw appError("INVALID_INPUT", undefined, { fields: { priceOverrideCents: "invalid" } });
    }
    const prev = await ctx.db
      .query("menuAvailability")
      .withIndex("by_venue_item", (q) => q.eq("venueId", args.venueId).eq("itemId", args.itemId))
      .unique();
    const keepOverride = args.priceOverrideCents === undefined ? prev?.priceOverrideCents : override;
    const row = { available: args.available, priceOverrideCents: keepOverride, updatedBy: actor._id, updatedAt: Date.now() };
    if (prev) await ctx.db.patch(prev._id, row);
    else await ctx.db.insert("menuAvailability", { itemId: args.itemId, venueId: args.venueId, ...row });
    if ((prev?.available ?? true) !== args.available) {
      await audit(ctx, { actorId: actor._id, venueId: args.venueId, action: "menu.availability", entity: "menuItems", entityId: item._id, meta: { available: args.available } });
    }
    if ((prev?.priceOverrideCents ?? null) !== (keepOverride ?? null)) {
      await audit(ctx, { actorId: actor._id, venueId: args.venueId, action: "menu.price_changed", entity: "menuItems", entityId: item._id, meta: { override: keepOverride ?? null } });
    }
    return { ok: true };
  },
});

export const reorder = mutation({
  args: { itemIds: v.array(v.id("menuItems")) },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, ["owner"]);
    for (const [i, id] of args.itemIds.entries()) {
      const item = await ctx.db.get(id);
      if (!item || item.companyId !== actor.companyId) throw appError("NOT_FOUND");
      await ctx.db.patch(id, { sort: i });
    }
    await audit(ctx, { actorId: actor._id, action: "menu.changed", entity: "menuItems", entityId: "reorder", meta: { count: args.itemIds.length } });
    return { ok: true };
  },
});

/** Product analytics (BLUEPRINT 6.8): menu_item_viewed. */
export const viewed = mutation({
  args: { itemId: v.id("menuItems"), venueId: v.id("venues") },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    requireVenue(actor, args.venueId);
    await ctx.db.insert("analyticsEvents", { name: "menu_item_viewed", userId: actor._id, venueId: args.venueId, props: { itemId: args.itemId }, at: Date.now() });
    return { ok: true };
  },
});
