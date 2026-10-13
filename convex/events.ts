// Events (ADR 0019, BLUEPRINT 2.6): private dinners, buy-outs, tastings and holidays are blocks in the same venue
// calendar as the team schedule, with the positions they require. Shifts link to them; coverage is a state.
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireCan, requireVenue } from "./lib/auth";
import { appError } from "./lib/errors";
import { audit } from "./lib/audit";
import { enqueue } from "./lib/notify";
import { parseOrThrow } from "./lib/validate";
import { eventInput } from "../schemas";
import { eventCoverage } from "../lib/domain/schedule";
import { addDays, nyDateKey } from "../lib/time";

const isDateKey = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

async function shiftsOfEvent(ctx: QueryCtx | MutationCtx, eventId: Id<"venueEvents">) {
  return await ctx.db
    .query("shiftsPlanned")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .collect();
}

function view(e: Doc<"venueEvents">) {
  return { _id: e._id, venueId: e.venueId, kind: e.kind, name: e.name, date: e.date, start: e.start, end: e.end, notes: e.notes, required: e.required };
}

/** Events of a venue between two dates (default: today and the next 30 days), with coverage per position. */
export const list = query({
  args: { venueId: v.id("venues"), from: v.optional(v.string()), to: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "schedule.own");
    requireVenue(actor, args.venueId);
    const from = args.from && isDateKey(args.from) ? args.from : nyDateKey(Date.now());
    const to = args.to && isDateKey(args.to) ? args.to : addDays(from, 30);
    const rows = await ctx.db
      .query("venueEvents")
      .withIndex("by_venue_date", (q) => q.eq("venueId", args.venueId).gte("date", from).lte("date", to))
      .collect();
    const out = [];
    for (const e of rows) {
      const shifts = (await shiftsOfEvent(ctx, e._id)).filter((s) => !s.removed);
      out.push({ ...view(e), coverage: eventCoverage(e, shifts) });
    }
    return out.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  },
});

/** People with a shift at the venue on a date, to tell them about an event on their day. */
async function scheduledOn(ctx: MutationCtx, venueId: Id<"venues">, date: string) {
  const rows = await ctx.db
    .query("shiftsPlanned")
    .withIndex("by_venue_date", (q) => q.eq("venueId", venueId).eq("date", date))
    .collect();
  const out: Array<Doc<"users">> = [];
  for (const id of new Set(rows.filter((s) => !s.removed && s.userId).map((s) => s.userId!))) {
    const u = await ctx.db.get(id);
    if (u && u.active) out.push(u);
  }
  return out;
}

export const upsert = mutation({
  args: {
    eventId: v.optional(v.string()),
    venueId: v.id("venues"),
    kind: v.string(),
    name: v.object({ en: v.string(), es: v.string() }),
    date: v.string(),
    start: v.string(),
    end: v.string(),
    notes: v.object({ en: v.string(), es: v.string() }),
    required: v.array(v.object({ position: v.string(), count: v.number() })),
  },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "events.manage");
    requireVenue(actor, args.venueId);
    const p = parseOrThrow(eventInput, args);
    const fields = { kind: p.kind, name: p.name, date: p.date, start: p.start, end: p.end, notes: p.notes, required: p.required };
    let id: Id<"venueEvents">;
    let isNew = false;
    if (p.eventId) {
      const eid = ctx.db.normalizeId("venueEvents", p.eventId);
      const e = eid ? await ctx.db.get(eid) : null;
      if (!e || e.venueId !== args.venueId) throw appError("NOT_FOUND");
      await ctx.db.patch(e._id, fields);
      id = e._id;
    } else {
      id = await ctx.db.insert("venueEvents", { venueId: args.venueId, ...fields, createdBy: actor._id, at: Date.now() });
      isNew = true;
    }
    await audit(ctx, { actorId: actor._id, venueId: args.venueId, action: "event.changed", entity: "venueEvents", entityId: id, meta: { created: isNew, date: p.date } });
    const venue = await ctx.db.get(args.venueId);
    // Each person in their own language (the event name is content, {en, es}).
    for (const u of await scheduledOn(ctx, args.venueId, p.date)) {
      if (u._id === actor._id) continue;
      await enqueue(ctx, [u._id], { topic: "schedule", key: "event", vars: { venue: venue?.name ?? "", name: u.locale === "es" ? p.name.es : p.name.en, date: p.date }, url: "/schedule" });
    }
    return { eventId: id };
  },
});

export const remove = mutation({
  args: { eventId: v.id("venueEvents") },
  handler: async (ctx, { eventId }) => {
    const actor = await requireCan(ctx, "events.manage");
    const e = await ctx.db.get(eventId);
    if (!e) throw appError("NOT_FOUND");
    requireVenue(actor, e.venueId);
    for (const s of await shiftsOfEvent(ctx, e._id)) await ctx.db.patch(s._id, { eventId: undefined });
    await ctx.db.delete(e._id);
    await audit(ctx, { actorId: actor._id, venueId: e.venueId, action: "event.changed", entity: "venueEvents", entityId: e._id, meta: { removed: true } });
    return { ok: true };
  },
});
