// Company and venues (ADR 0002).
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireRole, requireUser } from "./lib/auth";
import { appError } from "./lib/errors";
import { audit } from "./lib/audit";

/** Venues the caller can see: owners all of the company's, everybody else their assignments. */
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

export const allVenues = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireRole(ctx, ["owner"]);
    return await ctx.db
      .query("venues")
      .withIndex("by_company", (q) => q.eq("companyId", actor.companyId))
      .collect();
  },
});

const serviceV = v.object({ key: v.union(v.literal("lunch"), v.literal("dinner"), v.literal("late")), startsAt: v.string(), endsAt: v.string() });

export const setVenue = mutation({
  args: { venueId: v.optional(v.id("venues")), name: v.string(), address: v.optional(v.string()), services: v.array(serviceV), active: v.boolean() },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, ["owner"]);
    const name = args.name.trim();
    if (!name || name.length > 60) throw appError("INVALID_INPUT", undefined, { fields: { name: "invalid" } });
    if (!args.services.length || args.services.some((s) => !/^\d{1,2}:\d{2}$/.test(s.startsAt) || !/^\d{1,2}:\d{2}$/.test(s.endsAt))) {
      throw appError("INVALID_INPUT", undefined, { fields: { services: "invalid" } });
    }
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    if (args.venueId) {
      const venue = await ctx.db.get(args.venueId);
      if (!venue || venue.companyId !== actor.companyId) throw appError("NOT_FOUND");
      await ctx.db.patch(venue._id, { name, slug, address: args.address?.trim() || undefined, services: args.services, active: args.active });
      await audit(ctx, { actorId: actor._id, venueId: venue._id, action: "venue.changed", entity: "venues", entityId: venue._id });
      return { venueId: venue._id };
    }
    const count = (
      await ctx.db
        .query("venues")
        .withIndex("by_company", (q) => q.eq("companyId", actor.companyId))
        .collect()
    ).length;
    const venueId = await ctx.db.insert("venues", { companyId: actor.companyId, name, slug, address: args.address?.trim() || undefined, services: args.services, active: args.active, sort: count });
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
    return c;
  },
});

export const setCompany = mutation({
  args: { name: v.optional(v.string()), captainApprovesComps: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, ["owner"]);
    const patch: { name?: string; captainApprovesComps?: boolean } = {};
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name || name.length > 80) throw appError("INVALID_INPUT", undefined, { fields: { name: "invalid" } });
      patch.name = name;
    }
    if (args.captainApprovesComps !== undefined) patch.captainApprovesComps = args.captainApprovesComps;
    await ctx.db.patch(actor.companyId, patch);
    await audit(ctx, { actorId: actor._id, action: "company.changed", entity: "companies", entityId: actor.companyId, meta: patch });
    return { ok: true };
  },
});
