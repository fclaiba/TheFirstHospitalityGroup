// Company, venues, positions and the chain of supervision (ADR 0002, 0020, 0026; BLUEPRINT 2.1, 2.3).
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { overridesOf, requireCan, requireUser, requireVenue } from "./lib/auth";
import { appError } from "./lib/errors";
import { audit } from "./lib/audit";
import { parseOrThrow } from "./lib/validate";
import { chainOverrideInput, companyLimitsInput, venueInput } from "../schemas";
import { AREAS, POSITIONS } from "../lib/domain/types";
import type { Position } from "../lib/domain/types";
import { areaOf, isAtLeast, isCorporate, layerOf } from "../lib/domain/positions";
import { leadOf, reportsTo } from "../lib/domain/chain";

/** Venues the caller can see: corporate all of the company's, everybody else their assignments. */
export const venues = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireUser(ctx);
    const out = [];
    for (const id of actor.venueIds) {
      const v = await ctx.db.get(id);
      if (v) out.push(v);
    }
    return out.sort((a, b) => a.sort - b.sort);
  },
});

/** Every venue of the company, active or not (company setup). */
export const allVenues = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireCan(ctx, "company.view");
    return await ctx.db
      .query("venues")
      .withIndex("by_company", (q) => q.eq("companyId", actor.companyId))
      .collect();
  },
});

const serviceV = v.object({
  key: v.union(v.literal("lunch"), v.literal("dinner"), v.literal("late")),
  weekdays: v.array(v.number()),
  startsAt: v.string(),
  endsAt: v.string(),
  preShiftMin: v.number(),
});

/** Owner: create or edit a venue, its services per weekday, the positions it uses and their local names. */
export const upsertVenue = mutation({
  args: {
    venueId: v.optional(v.id("venues")),
    name: v.string(),
    slug: v.string(),
    address: v.optional(v.string()),
    services: v.array(serviceV),
    positionsUsed: v.array(v.string()),
    localNames: v.array(v.object({ position: v.string(), name: v.object({ en: v.string(), es: v.string() }) })),
    reservationsUrl: v.optional(v.string()),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "company.setup");
    const p = parseOrThrow(venueInput, args);
    const fields = {
      name: p.name,
      slug: p.slug,
      address: p.address,
      services: p.services,
      positionsUsed: p.positionsUsed.filter((x) => x !== "dev"),
      localNames: p.localNames,
      reservationsUrl: p.reservationsUrl,
      active: p.active,
    };
    const all = await ctx.db
      .query("venues")
      .withIndex("by_company", (q) => q.eq("companyId", actor.companyId))
      .collect();
    if (all.some((x) => x.slug === p.slug && x._id !== args.venueId)) throw appError("INVALID_INPUT", undefined, { fields: { slug: "taken" } });
    if (args.venueId) {
      const venue = await ctx.db.get(args.venueId);
      if (!venue || venue.companyId !== actor.companyId) throw appError("NOT_FOUND");
      await ctx.db.patch(venue._id, fields);
      await audit(ctx, { actorId: actor._id, venueId: venue._id, action: "venue.changed", entity: "venues", entityId: venue._id });
      return { venueId: venue._id };
    }
    const venueId = await ctx.db.insert("venues", { companyId: actor.companyId, ...fields, sort: all.length });
    await ctx.db.insert("floorPlans", { venueId, version: 1, sections: [], updatedBy: actor._id, at: Date.now() });
    await audit(ctx, { actorId: actor._id, venueId, action: "venue.changed", entity: "venues", entityId: venueId, meta: { created: true } });
    return { venueId };
  },
});

export const company = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireUser(ctx);
    const c = await ctx.db.get(actor.companyId);
    if (!c) throw appError("NOT_FOUND");
    return { _id: c._id, name: c.name, slug: c.slug, timezone: c.timezone, thresholds: c.thresholds };
  },
});

export const setCompany = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "company.setup");
    const name = args.name.trim();
    if (!name || name.length > 80) throw appError("INVALID_INPUT", undefined, { fields: { name: "invalid" } });
    await ctx.db.patch(actor.companyId, { name });
    await audit(ctx, { actorId: actor._id, action: "company.changed", entity: "companies", entityId: actor.companyId, meta: { name } });
    return { ok: true };
  },
});

/** Weekly hours alert and the side-work limit for tipped positions (BLUEPRINT 2.6, 2.9). */
export const setLimits = mutation({
  args: { weeklyHours: v.number(), sideWorkMaxMinutes: v.number(), sideWorkMaxPct: v.number() },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "warnings.thresholds");
    const p = parseOrThrow(companyLimitsInput, args);
    const c = await ctx.db.get(actor.companyId);
    if (!c) throw appError("NOT_FOUND");
    const thresholds = { ...c.thresholds, weeklyHours: p.weeklyHours, sideWork: { maxMinutes: p.sideWorkMaxMinutes, maxPct: p.sideWorkMaxPct } };
    await ctx.db.patch(c._id, { thresholds });
    await audit(ctx, { actorId: actor._id, action: "company.changed", entity: "companies", entityId: c._id, meta: { limits: p } });
    return { ok: true };
  },
});

/** Positions a venue uses, with area, layer and local name (BLUEPRINT 2.1: local names are configuration). */
export const positions = query({
  args: { venueId: v.id("venues") },
  handler: async (ctx, { venueId }) => {
    const actor = await requireUser(ctx);
    requireVenue(actor, venueId);
    const venue = await ctx.db.get(venueId);
    if (!venue) throw appError("NOT_FOUND");
    return venue.positionsUsed.map((p) => ({
      position: p,
      area: areaOf(p),
      layer: layerOf(p),
      localName: venue.localNames.find((l) => l.position === p)?.name ?? null,
    }));
  },
});

async function peopleOf(ctx: Parameters<typeof overridesOf>[0], venue: Doc<"venues">) {
  const rows = await ctx.db
    .query("assignments")
    .withIndex("by_venue", (q) => q.eq("venueId", venue._id))
    .collect();
  const out: Doc<"users">[] = [];
  for (const r of rows) {
    const u = await ctx.db.get(r.userId);
    if (u && u.active && !u.isDev) out.push(u);
  }
  return out;
}

/**
 * The organization chart of a venue (BLUEPRINT 2.1, ADR 0026): areas, positions, who reports to whom, and the people.
 * Leads and above see every name; staff see the positions, their own name and the names of their lead's position only.
 */
export const chart = query({
  args: { venueId: v.id("venues") },
  handler: async (ctx, { venueId }) => {
    const actor = await requireCan(ctx, "org.chart");
    requireVenue(actor, venueId);
    const venue = await ctx.db.get(venueId);
    if (!venue) throw appError("NOT_FOUND");
    const o = await overridesOf(ctx, venueId);
    const people = await peopleOf(ctx, venue);
    const corporate = (await ctx.db.query("users").withIndex("by_company_position", (q) => q.eq("companyId", actor.companyId)).collect()).filter((u) => u.active && !u.isDev && isCorporate(u.primaryPosition));
    const everyone = [...people, ...corporate];
    const seesAll = isAtLeast(actor.position, "lead") || isAtLeast(actor.primaryPosition, "lead");
    const myLead = leadOf(actor.position, o) ?? reportsTo(actor.position, o);
    const used = new Set<Position>([...venue.positionsUsed, "director", "owner"]);
    const areas = AREAS.map((area) => ({
      area,
      positions: POSITIONS.filter((p) => p !== "dev" && used.has(p) && areaOf(p) === area).map((p) => {
        const holders = everyone.filter((u) => u.primaryPosition === p);
        const visible = seesAll || p === myLead;
        return {
          position: p,
          layer: layerOf(p),
          localName: venue.localNames.find((l) => l.position === p)?.name ?? null,
          reportsTo: reportsTo(p, o),
          count: holders.length,
          people: holders
            .filter((u) => visible || u._id === actor._id)
            .map((u) => ({ _id: u._id, name: u.name, title: u.title ?? null, isMe: u._id === actor._id }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        };
      }),
    })).filter((a) => a.positions.length > 0);
    return { venueId, myPosition: actor.position, myLead, areas };
  },
});

export const chainOverrides = query({
  args: { venueId: v.id("venues") },
  handler: async (ctx, { venueId }) => {
    const actor = await requireCan(ctx, "company.view");
    requireVenue(actor, venueId);
    return await ctx.db
      .query("chainOverrides")
      .withIndex("by_venue", (q) => q.eq("venueId", venueId))
      .collect();
  },
});

/** Owner: change who a position reports to at one venue (null restores the default). */
export const setChainOverride = mutation({
  args: { venueId: v.id("venues"), position: v.string(), reportsTo: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "company.setup");
    const p = parseOrThrow(chainOverrideInput, args);
    requireVenue(actor, args.venueId);
    const venue = await ctx.db.get(args.venueId);
    if (!venue || venue.companyId !== actor.companyId) throw appError("NOT_FOUND");
    if (p.reportsTo === p.position) throw appError("INVALID_INPUT", undefined, { fields: { reportsTo: "self" } });
    const rows = await ctx.db
      .query("chainOverrides")
      .withIndex("by_venue", (q) => q.eq("venueId", args.venueId))
      .collect();
    for (const r of rows.filter((x) => x.position === p.position)) await ctx.db.delete(r._id);
    let id: Id<"chainOverrides"> | null = null;
    if (p.reportsTo) id = await ctx.db.insert("chainOverrides", { venueId: args.venueId, position: p.position, reportsTo: p.reportsTo });
    await audit(ctx, { actorId: actor._id, venueId: args.venueId, action: "chain.changed", entity: "chainOverrides", entityId: id ?? args.venueId, meta: { position: p.position, reportsTo: p.reportsTo } });
    return { ok: true };
  },
});
