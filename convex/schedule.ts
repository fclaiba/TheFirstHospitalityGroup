// Schedule and events (P3, ADR 0011): a simple published week per venue and a calendar of private dinners, buyouts
// and tastings. No scheduling engine, time clock or shift trading; if TFHG keeps 7shifts, P3 reads it instead.
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireRole, requireUser, requireVenue } from "./lib/auth";
import { appError } from "./lib/errors";
import { audit } from "./lib/audit";
import { parseOrThrow } from "./lib/validate";
import { venueEventInput } from "../schemas";
import { addDays, nyDateKey } from "../lib/time";
import { SERVICES } from "../lib/domain/types";

const dateKey = v.string();
const isDateKey = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const serviceV = v.union(v.literal("lunch"), v.literal("dinner"), v.literal("late"));

async function names(ctx: QueryCtx, ids: Id<"users">[]) {
  const out = new Map<string, { name: string; role: string; level: string }>();
  for (const id of new Set(ids)) {
    const u = await ctx.db.get(id);
    if (u) out.set(id, { name: u.name, role: u.role, level: u.level });
  }
  return out;
}

/** Seven days from `from` (NY date key): entries per date and service, with names. Staff only see published ones. */
export const week = query({
  args: { venueId: v.id("venues"), from: v.optional(dateKey) },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    requireVenue(actor, args.venueId);
    const from = args.from && isDateKey(args.from) ? args.from : nyDateKey(Date.now());
    const manager = actor.role === "manager" || actor.role === "owner" || actor.role === "dev";
    const days = [];
    const all = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(from, i);
      const rows = await ctx.db
        .query("scheduleEntries")
        .withIndex("by_venue_date", (q) => q.eq("venueId", args.venueId).eq("date", date))
        .collect();
      const visible = rows.filter((r) => manager || r.publishedAt);
      all.push(...visible);
      days.push({ date, rows: visible });
    }
    const people = await names(
      ctx,
      all.map((r) => r.userId),
    );
    return {
      from,
      days: days.map((d) => ({
        date: d.date,
        services: SERVICES.map((service) => ({
          service,
          people: d.rows
            .filter((r) => r.service === service)
            .map((r) => ({ entryId: r._id, userId: r.userId, name: people.get(r.userId)?.name ?? "", role: r.role, published: !!r.publishedAt, mine: r.userId === actor._id }))
            .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name)),
        })).filter((s) => s.people.length),
      })),
      unpublished: all.filter((r) => !r.publishedAt).length,
    };
  },
});

/** My next published shifts at a venue (14 days). */
export const mine = query({
  args: { venueId: v.id("venues") },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    requireVenue(actor, args.venueId);
    const today = nyDateKey(Date.now());
    const rows = await ctx.db
      .query("scheduleEntries")
      .withIndex("by_user_date", (q) => q.eq("userId", actor._id).gte("date", today).lte("date", addDays(today, 14)))
      .collect();
    const venue = await ctx.db.get(args.venueId);
    return rows
      .filter((r) => r.venueId === args.venueId && r.publishedAt)
      .map((r) => {
        const s = venue?.services.find((x) => x.key === r.service);
        return { entryId: r._id, date: r.date, service: r.service, role: r.role, startsAt: s?.startsAt ?? null, endsAt: s?.endsAt ?? null };
      })
      .sort((a, b) => (a.date === b.date ? SERVICES.indexOf(a.service) - SERVICES.indexOf(b.service) : a.date < b.date ? -1 : 1));
  },
});

/** Manager adds a person to a day and service (a draft until published). */
export const upsertEntry = mutation({
  args: { venueId: v.id("venues"), userId: v.id("users"), date: dateKey, service: serviceV },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, ["manager"]);
    requireVenue(actor, args.venueId);
    if (!isDateKey(args.date)) throw appError("INVALID_INPUT", undefined, { fields: { date: "invalid" } });
    const venue = await ctx.db.get(args.venueId);
    if (!venue?.services.some((s) => s.key === args.service)) throw appError("NOT_SCHEDULED");
    const user = await ctx.db.get(args.userId);
    if (!user || !user.active || user.companyId !== actor.companyId) throw appError("NOT_FOUND");
    const assigned = await ctx.db
      .query("assignments")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    if (!assigned.some((a) => a.venueId === args.venueId)) throw appError("VENUE_FORBIDDEN");
    const same = (
      await ctx.db
        .query("scheduleEntries")
        .withIndex("by_venue_date", (q) => q.eq("venueId", args.venueId).eq("date", args.date))
        .collect()
    ).find((e) => e.userId === args.userId && e.service === args.service);
    if (same) return { entryId: same._id };
    const entryId = await ctx.db.insert("scheduleEntries", { venueId: args.venueId, userId: user._id, date: args.date, service: args.service, role: user.role, by: actor._id });
    return { entryId };
  },
});

export const removeEntry = mutation({
  args: { entryId: v.id("scheduleEntries") },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, ["manager"]);
    const e = await ctx.db.get(args.entryId);
    if (!e) throw appError("NOT_FOUND");
    requireVenue(actor, e.venueId);
    await ctx.db.delete(e._id);
    if (e.publishedAt) await audit(ctx, { actorId: actor._id, venueId: e.venueId, action: "schedule.published", entity: "scheduleEntries", entityId: e._id, meta: { removed: true, date: e.date } });
    return { ok: true };
  },
});

/** Publishes every draft entry in a date range (7 days from `from` by default). */
export const publish = mutation({
  args: { venueId: v.id("venues"), from: dateKey, days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, ["manager"]);
    requireVenue(actor, args.venueId);
    if (!isDateKey(args.from)) throw appError("INVALID_INPUT", undefined, { fields: { from: "invalid" } });
    const span = Math.min(Math.max(1, Math.floor(args.days ?? 7)), 31);
    const now = Date.now();
    let published = 0;
    for (let i = 0; i < span; i++) {
      const date = addDays(args.from, i);
      for (const e of await ctx.db
        .query("scheduleEntries")
        .withIndex("by_venue_date", (q) => q.eq("venueId", args.venueId).eq("date", date))
        .collect()) {
        if (e.publishedAt) continue;
        await ctx.db.patch(e._id, { publishedAt: now });
        published += 1;
      }
    }
    await audit(ctx, { actorId: actor._id, venueId: args.venueId, action: "schedule.published", entity: "venues", entityId: args.venueId, meta: { from: args.from, days: span, published } });
    return { published };
  },
});

export const events = query({
  args: { venueId: v.id("venues"), from: v.optional(dateKey), to: v.optional(dateKey) },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    requireVenue(actor, args.venueId);
    const from = args.from && isDateKey(args.from) ? args.from : nyDateKey(Date.now());
    const to = args.to && isDateKey(args.to) ? args.to : addDays(from, 30);
    const rows = await ctx.db
      .query("venueEvents")
      .withIndex("by_venue_date", (q) => q.eq("venueId", args.venueId).gte("date", from).lte("date", to))
      .collect();
    return rows.sort((a, b) => (a.date === b.date ? a.startsAt.localeCompare(b.startsAt) : a.date < b.date ? -1 : 1));
  },
});

export const upsertEvent = mutation({
  args: {
    eventId: v.optional(v.id("venueEvents")),
    venueId: v.id("venues"),
    date: v.string(),
    title: v.object({ en: v.string(), es: v.string() }),
    kind: v.string(),
    startsAt: v.string(),
    guests: v.optional(v.number()),
    notes: v.object({ en: v.string(), es: v.string() }),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, ["manager"]);
    const p = parseOrThrow(venueEventInput, args);
    requireVenue(actor, args.venueId);
    const doc = { venueId: args.venueId, date: p.date, title: p.title, kind: p.kind, startsAt: p.startsAt, guests: p.guests, notes: p.notes, by: actor._id };
    if (args.eventId) {
      const prev = await ctx.db.get(args.eventId);
      if (!prev) throw appError("NOT_FOUND");
      requireVenue(actor, prev.venueId);
      await ctx.db.replace(prev._id, doc);
      await audit(ctx, { actorId: actor._id, venueId: args.venueId, action: "event.changed", entity: "venueEvents", entityId: prev._id });
      return { eventId: prev._id };
    }
    const eventId = await ctx.db.insert("venueEvents", doc);
    await audit(ctx, { actorId: actor._id, venueId: args.venueId, action: "event.changed", entity: "venueEvents", entityId: eventId, meta: { created: true } });
    return { eventId };
  },
});

export const removeEvent = mutation({
  args: { eventId: v.id("venueEvents") },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, ["manager"]);
    const e = await ctx.db.get(args.eventId);
    if (!e) throw appError("NOT_FOUND");
    requireVenue(actor, e.venueId);
    await ctx.db.delete(e._id);
    await audit(ctx, { actorId: actor._id, venueId: e.venueId, action: "event.changed", entity: "venueEvents", entityId: e._id, meta: { removed: true } });
    return { ok: true };
  },
});

