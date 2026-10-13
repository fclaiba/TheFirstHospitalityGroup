// The schedule (ADR 0019, BLUEPRINT 2.6, 3.3): versioned weeks per venue, shifts per person and position, doubles,
// events in the same calendar, publish with a confirmation per person and version, reminders at 24 h, availability,
// time off, swaps through the manager (ADR 0026: the system asks the colleague, the manager decides), open shifts and
// attendance marks without a time clock. Nothing published is overwritten silently: a change after publishing is
// stamped with the next version, and the next publish notifies only the people it touches.
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { actorCan, requireCan, requireVenue, worksAt } from "./lib/auth";
import type { Actor } from "./lib/auth";
import { appError } from "./lib/errors";
import { audit } from "./lib/audit";
import { enqueue } from "./lib/notify";
import { rateLimit } from "./lib/rateLimit";
import { parseOrThrow } from "./lib/validate";
import { closeTimeOf, venueManagers } from "./lib/shift";
import { attendanceInput, availabilityInput, plannedShiftInput, swapInput, timeOffInput } from "../schemas";
import {
  changedPeople,
  eventCoverage,
  isDouble,
  needsConfirm,
  openShiftEligible,
  swapProblem,
  versionToConfirm,
  weekDates,
  weekOf,
  weeklyHours,
  DEFAULT_WEEKLY_HOURS,
} from "../lib/domain/schedule";
import { isConfirmLate } from "../lib/domain/states";
import { canWork } from "../lib/domain/positions";
import { addDays, nyDateKey, nyTimeOn } from "../lib/time";
import type { ConfirmState, Position } from "../lib/domain/types";

type Ctx = QueryCtx | MutationCtx;
type Planned = Doc<"shiftsPlanned">;
type Week = Doc<"scheduleWeeks">;

const URL = "/schedule";
const isDateKey = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

async function getWeek(ctx: Ctx, venueId: Id<"venues">, weekStart: string): Promise<Week | null> {
  return await ctx.db
    .query("scheduleWeeks")
    .withIndex("by_venue_week", (q) => q.eq("venueId", venueId).eq("weekStart", weekStart))
    .unique();
}

async function ensureWeek(ctx: MutationCtx, venueId: Id<"venues">, weekStart: string): Promise<Week> {
  const found = await getWeek(ctx, venueId, weekStart);
  if (found) return found;
  const id = await ctx.db.insert("scheduleWeeks", { venueId, weekStart, status: "draft", version: 0 });
  return (await ctx.db.get(id))!;
}

async function shiftsOf(ctx: Ctx, weekId: Id<"scheduleWeeks">): Promise<Planned[]> {
  return await ctx.db
    .query("shiftsPlanned")
    .withIndex("by_week", (q) => q.eq("weekId", weekId))
    .collect();
}

/** What staff see: published, not removed. Open shifts are published once their version is published. */
const isPublished = (s: Planned, week: Week) => week.status === "published" && s.changedInVersion <= week.version;
const isLive = (s: Planned, week: Week) => !s.removed && isPublished(s, week);

async function acksOf(ctx: Ctx, weekId: Id<"scheduleWeeks">) {
  return await ctx.db
    .query("scheduleAcks")
    .withIndex("by_week_user", (q) => q.eq("weekId", weekId))
    .collect();
}

async function eventsBetween(ctx: Ctx, venueId: Id<"venues">, from: string, to: string) {
  return await ctx.db
    .query("venueEvents")
    .withIndex("by_venue_date", (q) => q.eq("venueId", venueId).gte("date", from).lte("date", to))
    .collect();
}

const nextVersion = (week: Week) => week.version + 1;

/** A person must be assigned to the venue and enabled for the position (NOT_ENABLED). */
async function checkPerson(ctx: Ctx, userId: Id<"users">, venueId: Id<"venues">, position: Position): Promise<Doc<"users">> {
  const u = await ctx.db.get(userId);
  if (!u || !u.active) throw appError("NOT_FOUND");
  if (!(await worksAt(ctx, u, venueId))) throw appError("VENUE_FORBIDDEN");
  if (!canWork(u, position)) throw appError("NOT_ENABLED");
  return u;
}

/**
 * Moves a shift to another person without overwriting what was published: the published row is kept as removed for
 * its old owner (so they are told) and a new row is created for the new owner, both stamped with the next version.
 */
async function reassign(ctx: MutationCtx, s: Planned, week: Week, userId: Id<"users"> | undefined, patch: Partial<Planned> = {}): Promise<Id<"shiftsPlanned">> {
  const stamp = nextVersion(week);
  if (week.version > 0 && s.userId) {
    await ctx.db.patch(s._id, { removed: true, changedInVersion: stamp });
    const { _id, _creationTime, ...rest } = s;
    void _id;
    void _creationTime;
    return await ctx.db.insert("shiftsPlanned", { ...rest, ...patch, userId, removed: undefined, attendance: undefined, remindedAt: undefined, changedInVersion: stamp });
  }
  await ctx.db.patch(s._id, { ...patch, userId, changedInVersion: stamp });
  return s._id;
}

async function names(ctx: Ctx, ids: Array<Id<"users"> | undefined>) {
  const out = new Map<string, { name: string; primaryPosition: Position }>();
  for (const id of new Set(ids.filter((x): x is Id<"users"> => !!x))) {
    const u = await ctx.db.get(id);
    if (u) out.set(id, { name: u.name, primaryPosition: u.primaryPosition });
  }
  return out;
}

function confirmState(userId: string, week: Week, shifts: Planned[], acks: Array<{ userId: string; version: number }>, now: number): ConfirmState | null {
  const required = versionToConfirm(userId, shifts, week.version);
  if (required === null || week.status !== "published") return null;
  if (!needsConfirm(userId, week, shifts, acks)) return "confirmed";
  return week.publishedAt && isConfirmLate(week.publishedAt, now) ? "late" : "pending";
}

function view(s: Planned, people: Map<string, { name: string }>, week: Week) {
  return {
    _id: s._id,
    userId: s.userId ?? null,
    name: s.userId ? (people.get(s.userId)?.name ?? "") : null,
    position: s.position,
    date: s.date,
    start: s.start,
    end: s.end ?? null,
    untilClose: s.untilClose,
    breakMin: s.breakMin ?? null,
    eventId: s.eventId ?? null,
    open: s.open,
    removed: !!s.removed,
    pending: s.changedInVersion > week.version,
    attendance: s.attendance ? { status: s.attendance.status, minutes: s.attendance.minutes ?? null } : null,
  };
}

/** Publishes the next version: everyone scheduled the first time, then only the people whose shifts changed. */
async function publishWeek(ctx: MutationCtx, actor: Actor, week: Week): Promise<{ version: number; notified: number }> {
  const shifts = await shiftsOf(ctx, week._id);
  const first = week.status !== "published" || week.version === 0;
  const affected = first ? [...new Set(shifts.filter((s) => !s.removed && s.userId).map((s) => s.userId!))] : changedPeople(shifts, week.version);
  const newOpen = shifts.filter((s) => s.open && !s.removed && s.changedInVersion > week.version);
  const version = nextVersion(week);
  const now = Date.now();
  await ctx.db.patch(week._id, { status: "published", version, publishedAt: now, publishedBy: actor._id, remindedAt: undefined });
  const venue = await ctx.db.get(week.venueId);
  const vars = { venue: venue?.name ?? "", week: week.weekStart };
  const notified = await enqueue(ctx, affected as Id<"users">[], { topic: "schedule", key: first ? "schedulePublished" : "scheduleChanged", vars, url: URL });
  if (newOpen.length) await notifyOpenShifts(ctx, week.venueId, newOpen);
  await audit(ctx, { actorId: actor._id, venueId: week.venueId, action: "schedule.published", entity: "scheduleWeeks", entityId: week._id, meta: { version, affected: affected.length } });
  await ctx.db.insert("analyticsEvents", { name: "schedule_published", userId: actor._id, venueId: week.venueId, props: { version, affected: affected.length }, at: now });
  return { version, notified };
}

async function notifyOpenShifts(ctx: MutationCtx, venueId: Id<"venues">, open: Planned[]) {
  const venue = await ctx.db.get(venueId);
  const rows = await ctx.db
    .query("assignments")
    .withIndex("by_venue", (q) => q.eq("venueId", venueId))
    .collect();
  for (const s of open) {
    const ids: Id<"users">[] = [];
    for (const r of rows) {
      const u = await ctx.db.get(r.userId);
      if (u && u.active && canWork(u, s.position)) ids.push(u._id);
    }
    await enqueue(ctx, ids, { topic: "schedule", key: "openShift", vars: { venue: venue?.name ?? "", date: s.date }, url: URL });
  }
}

// ---------------------------------------------------------------------------------------------------------- Queries

/**
 * A venue week. Managers see every shift, including changes not yet published (`pending`) and removals; staff see
 * only their own published shifts. Events with coverage (required vs filled per position) and my confirmation state.
 */
export const week = query({
  args: { venueId: v.id("venues"), weekStart: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "schedule.own");
    requireVenue(actor, args.venueId);
    const weekStart = weekOf(args.weekStart && isDateKey(args.weekStart) ? args.weekStart : nyDateKey(Date.now()));
    const manager = actorCan(actor, "schedule.manage");
    const w = await getWeek(ctx, args.venueId, weekStart);
    const dates = weekDates(weekStart);
    const events = await eventsBetween(ctx, args.venueId, dates[0]!, dates[6]!);
    const venue = await ctx.db.get(args.venueId);
    if (!w) {
      return { weekStart, dates, weekId: null, status: "draft" as const, version: 0, publishedAt: null, canManage: manager, shifts: [], events: events.map((e) => ({ ...eventView(e), coverage: eventCoverage(e, []) })), myState: null, closeAt: closeTimeOf(venue) };
    }
    const all = await shiftsOf(ctx, w._id);
    const visible = manager ? all.filter((s) => !s.removed || s.changedInVersion > w.version) : all.filter((s) => isLive(s, w) && s.userId === actor._id);
    const people = await names(
      ctx,
      visible.map((s) => s.userId),
    );
    const live = all.filter((s) => !s.removed && (manager || isPublished(s, w)));
    const acks = await acksOf(ctx, w._id);
    return {
      weekStart,
      dates,
      weekId: w._id,
      status: w.status,
      version: w.version,
      publishedAt: w.publishedAt ?? null,
      canManage: manager,
      hasPendingChanges: manager ? all.some((s) => s.changedInVersion > w.version) : false,
      shifts: visible.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)).map((s) => view(s, people, w)),
      events: events.map((e) => ({ ...eventView(e), coverage: eventCoverage(e, live) })),
      myState: confirmState(actor._id, w, all, acks, Date.now()),
      closeAt: closeTimeOf(venue),
    };
  },
});

function eventView(e: Doc<"venueEvents">) {
  return { _id: e._id, venueId: e.venueId, kind: e.kind, name: e.name, date: e.date, start: e.start, end: e.end, notes: e.notes, required: e.required };
}

/**
 * My week across my venues (BLUEPRINT 3.7: "Confirm schedule"): my blocks per day (a double is two blocks), events,
 * whether I still have to confirm, open shifts I can claim, my swaps and my time off.
 */
export const myWeek = query({
  args: { weekStart: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "schedule.own");
    const now = Date.now();
    const weekStart = weekOf(args.weekStart && isDateKey(args.weekStart) ? args.weekStart : nyDateKey(now));
    const dates = weekDates(weekStart);
    const venues = [];
    const mine: Array<ReturnType<typeof view> & { venueId: Id<"venues">; venueName: string }> = [];
    const openShifts = [];
    const events = [];
    for (const venueId of actor.venueIds) {
      const venue = await ctx.db.get(venueId);
      if (!venue) continue;
      const w = await getWeek(ctx, venueId, weekStart);
      events.push(...(await eventsBetween(ctx, venueId, dates[0]!, dates[6]!)).map((e) => ({ ...eventView(e), venueName: venue.name })));
      if (!w || w.status !== "published") continue;
      const all = await shiftsOf(ctx, w._id);
      const acks = await acksOf(ctx, w._id);
      const own = all.filter((s) => isLive(s, w) && s.userId === actor._id);
      for (const s of own) mine.push({ ...view(s, new Map([[actor._id, { name: actor.name }]]), w), venueId, venueName: venue.name });
      const state = confirmState(actor._id, w, all, acks, now);
      venues.push({ venueId, venueName: venue.name, weekId: w._id, version: w.version, publishedAt: w.publishedAt ?? null, state, toConfirm: versionToConfirm(actor._id, all, w.version) });
      const closeAt = closeTimeOf(venue);
      for (const s of all.filter((x) => x.open && isLive(x, w) && x.date >= nyDateKey(now))) {
        if (openShiftEligible(actor, s, own, closeAt)) continue;
        const claim = (
          await ctx.db
            .query("openShiftClaims")
            .withIndex("by_shift", (q) => q.eq("shiftPlannedId", s._id))
            .collect()
        ).find((c) => c.userId === actor._id);
        openShifts.push({ ...view(s, new Map(), w), venueId, venueName: venue.name, claim: claim ? { _id: claim._id, status: claim.status } : null });
      }
    }
    const swapsOut = await ctx.db
      .query("swaps")
      .withIndex("by_requester", (q) => q.eq("requestedBy", actor._id))
      .collect();
    const swapsIn = await ctx.db
      .query("swaps")
      .withIndex("by_colleague", (q) => q.eq("colleagueId", actor._id))
      .collect();
    const swaps = [];
    for (const s of [...swapsOut, ...swapsIn].filter((x) => x.at > now - 14 * 24 * 3600_000)) {
      const from = await ctx.db.get(s.fromShiftId);
      const other = await ctx.db.get(s.requestedBy === actor._id ? s.colleagueId : s.requestedBy);
      swaps.push({ _id: s._id, status: s.status, mine: s.requestedBy === actor._id, otherName: other?.name ?? "", date: from?.date ?? null, start: from?.start ?? null, position: from?.position ?? null, note: s.note ?? null, at: s.at });
    }
    const timeOff = (
      await ctx.db
        .query("timeOff")
        .withIndex("by_user", (q) => q.eq("userId", actor._id))
        .collect()
    )
      .filter((t) => t.to >= addDays(nyDateKey(now), -7))
      .map((t) => ({ _id: t._id, from: t.from, to: t.to, reason: t.reason ?? null, status: t.status }));
    const days = dates.map((date) => {
      const blocks = mine.filter((s) => s.date === date).sort((a, b) => a.start.localeCompare(b.start));
      return { date, blocks, double: isDouble(blocks.map((b) => ({ date: b.date, userId: actor._id }))) };
    });
    return { weekStart, dates, venues, days, events, openShifts, swaps: swaps.sort((a, b) => b.at - a.at), timeOff, needsConfirm: venues.some((x) => x.state === "pending" || x.state === "late") };
  },
});

/** Who confirmed which version (managers): people by state with names, never percentages (ADR 0027). */
export const confirmations = query({
  args: { venueId: v.id("venues"), weekStart: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "schedule.manage");
    requireVenue(actor, args.venueId);
    const w = await getWeek(ctx, args.venueId, weekOf(args.weekStart));
    if (!w || w.status !== "published") return { version: w?.version ?? 0, publishedAt: null, people: [], counts: { confirmed: 0, pending: 0, late: 0 } };
    const all = await shiftsOf(ctx, w._id);
    const acks = await acksOf(ctx, w._id);
    const now = Date.now();
    const userIds = [...new Set(all.filter((s) => s.userId && s.changedInVersion <= w.version).map((s) => s.userId!))];
    const people = await names(ctx, userIds);
    const rows = userIds
      .map((id) => {
        const state = confirmState(id, w, all, acks, now);
        const ack = acks.filter((a) => a.userId === id).sort((a, b) => b.version - a.version)[0];
        return { userId: id, name: people.get(id)?.name ?? "", position: people.get(id)?.primaryPosition ?? null, state, confirmedAt: ack?.at ?? null };
      })
      .filter((r): r is typeof r & { state: ConfirmState } => r.state !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
    const count = (s: ConfirmState) => rows.filter((r) => r.state === s).length;
    return { version: w.version, publishedAt: w.publishedAt ?? null, people: rows, counts: { confirmed: count("confirmed"), pending: count("pending"), late: count("late") } };
  },
});

/** Weekly hours per person against the company threshold (managers). States, not scores. */
export const hours = query({
  args: { venueId: v.id("venues"), weekStart: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "schedule.manage");
    requireVenue(actor, args.venueId);
    const w = await getWeek(ctx, args.venueId, weekOf(args.weekStart));
    if (!w) return { threshold: DEFAULT_WEEKLY_HOURS, people: [] };
    const company = await ctx.db.get(actor.companyId);
    const threshold = company?.thresholds.weeklyHours ?? DEFAULT_WEEKLY_HOURS;
    const closeAt = closeTimeOf(await ctx.db.get(args.venueId));
    const all = (await shiftsOf(ctx, w._id)).filter((s) => !s.removed && s.userId && !s.open);
    const byUser = new Map<string, Planned[]>();
    for (const s of all) byUser.set(s.userId!, [...(byUser.get(s.userId!) ?? []), s]);
    const people = await names(ctx, [...byUser.keys()] as Id<"users">[]);
    return {
      threshold,
      people: [...byUser.entries()]
        .map(([userId, shifts]) => {
          const h = weeklyHours(shifts, closeAt);
          return { userId, name: people.get(userId)?.name ?? "", hours: h, shifts: shifts.length, state: h > threshold ? ("over_limit" as const) : ("within_limit" as const) };
        })
        .sort((a, b) => b.hours - a.hours),
    };
  },
});

/** Weekly availability of the people of a venue (for the week grid). */
export const availabilityFor = query({
  args: { venueId: v.id("venues") },
  handler: async (ctx, { venueId }) => {
    const actor = await requireCan(ctx, "schedule.manage");
    requireVenue(actor, venueId);
    const rows = await ctx.db
      .query("assignments")
      .withIndex("by_venue", (q) => q.eq("venueId", venueId))
      .collect();
    const out = [];
    for (const r of rows) {
      const u = await ctx.db.get(r.userId);
      if (!u || !u.active || u.isDev) continue;
      const av = await ctx.db
        .query("availability")
        .withIndex("by_user", (q) => q.eq("userId", u._id))
        .collect();
      const off = (
        await ctx.db
          .query("timeOff")
          .withIndex("by_user", (q) => q.eq("userId", u._id))
          .collect()
      ).filter((t) => t.status === "approved");
      out.push({ userId: u._id, name: u.name, primaryPosition: u.primaryPosition, enabledPositions: u.enabledPositions, availability: av.map((a) => ({ weekday: a.weekday, from: a.from, to: a.to, available: a.available })), timeOff: off.map((t) => ({ from: t.from, to: t.to })) });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const myAvailability = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireCan(ctx, "schedule.own");
    const rows = await ctx.db
      .query("availability")
      .withIndex("by_user", (q) => q.eq("userId", actor._id))
      .collect();
    return rows.map((a) => ({ weekday: a.weekday, from: a.from, to: a.to, available: a.available })).sort((a, b) => a.weekday - b.weekday || a.from.localeCompare(b.from));
  },
});

/**
 * Colleagues a person may name in a swap request (ADR 0026: the request goes to the manager; the system asks the
 * colleague). Same venue, enabled for the shift's position, not the requester. Names only, plus their published shifts
 * of that week so the requester can offer one in exchange.
 */
export const swapCandidates = query({
  args: { shiftId: v.id("shiftsPlanned") },
  handler: async (ctx, { shiftId }) => {
    const actor = await requireCan(ctx, "schedule.own");
    const s = await ctx.db.get(shiftId);
    if (!s || s.userId !== actor._id) throw appError("NOT_FOUND");
    requireVenue(actor, s.venueId);
    const week = (await ctx.db.get(s.weekId))!;
    const all = (await shiftsOf(ctx, week._id)).filter((x) => isLive(x, week) && !x.open);
    const rows = await ctx.db
      .query("assignments")
      .withIndex("by_venue", (q) => q.eq("venueId", s.venueId))
      .collect();
    const out = [];
    for (const r of rows) {
      const u = await ctx.db.get(r.userId);
      if (!u || !u.active || u.isDev || u._id === actor._id || !canWork(u, s.position)) continue;
      const theirs = all
        .filter((x) => x.userId === u._id && x.date >= nyDateKey(Date.now()) && canWork(actor, x.position))
        .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
        .map((x) => ({ _id: x._id, date: x.date, start: x.start, end: x.end ?? null, untilClose: x.untilClose, position: x.position }));
      out.push({ userId: u._id, name: u.name, shifts: theirs });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** The manager's queue: time off, swaps accepted by the colleague, open-shift claims. */
export const queue = query({
  args: { venueId: v.id("venues") },
  handler: async (ctx, { venueId }) => {
    const actor = await requireCan(ctx, "schedule.manage");
    requireVenue(actor, venueId);
    const timeOff = await ctx.db
      .query("timeOff")
      .withIndex("by_venue_status", (q) => q.eq("venueId", venueId).eq("status", "pending"))
      .collect();
    const swaps = [
      ...(await ctx.db
        .query("swaps")
        .withIndex("by_venue_status", (q) => q.eq("venueId", venueId).eq("status", "accepted"))
        .collect()),
      ...(await ctx.db
        .query("swaps")
        .withIndex("by_venue_status", (q) => q.eq("venueId", venueId).eq("status", "asked"))
        .collect()),
    ];
    const claims = await ctx.db
      .query("openShiftClaims")
      .withIndex("by_venue_status", (q) => q.eq("venueId", venueId).eq("status", "pending"))
      .collect();
    const people = await names(ctx, [...timeOff.map((t) => t.userId), ...swaps.flatMap((s) => [s.requestedBy, s.colleagueId]), ...claims.map((c) => c.userId)]);
    const nm = (id: string) => people.get(id)?.name ?? "";
    const swapRows = [];
    for (const s of swaps) {
      const from = await ctx.db.get(s.fromShiftId);
      const to = s.toShiftId ? await ctx.db.get(s.toShiftId) : null;
      swapRows.push({ _id: s._id, status: s.status, requester: nm(s.requestedBy), colleague: nm(s.colleagueId), note: s.note ?? null, from: from ? { date: from.date, start: from.start, position: from.position } : null, to: to ? { date: to.date, start: to.start, position: to.position } : null, at: s.at });
    }
    const claimRows = [];
    for (const c of claims) {
      const s = await ctx.db.get(c.shiftPlannedId);
      claimRows.push({ _id: c._id, name: nm(c.userId), shift: s ? { date: s.date, start: s.start, position: s.position } : null, at: c.at });
    }
    return {
      timeOff: timeOff.map((t) => ({ _id: t._id, name: nm(t.userId), from: t.from, to: t.to, reason: t.reason ?? null, at: t.at })),
      swaps: swapRows,
      claims: claimRows,
    };
  },
});

/** Kept for the manager screen name in BLUEPRINT 7.2 ("timeOffQueue"). */
export const timeOffQueue = query({
  args: { venueId: v.id("venues") },
  handler: async (ctx, { venueId }) => {
    const actor = await requireCan(ctx, "schedule.manage");
    requireVenue(actor, venueId);
    const rows = await ctx.db
      .query("timeOff")
      .withIndex("by_venue_status", (q) => q.eq("venueId", venueId).eq("status", "pending"))
      .collect();
    const people = await names(
      ctx,
      rows.map((r) => r.userId),
    );
    return rows.map((t) => ({ _id: t._id, userId: t.userId, name: people.get(t.userId)?.name ?? "", from: t.from, to: t.to, reason: t.reason ?? null, at: t.at }));
  },
});

// -------------------------------------------------------------------------------------------------------- Mutations

/** Creates or edits a planned shift (managers). Editing a published week stamps the next version (never silent). */
export const upsertShift = mutation({
  args: {
    shiftId: v.optional(v.string()),
    venueId: v.id("venues"),
    userId: v.optional(v.string()),
    position: v.string(),
    date: v.string(),
    start: v.string(),
    end: v.optional(v.string()),
    untilClose: v.boolean(),
    breakMin: v.optional(v.number()),
    eventId: v.optional(v.string()),
    open: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "schedule.manage");
    requireVenue(actor, args.venueId);
    const p = parseOrThrow(plannedShiftInput, args);
    if (!p.untilClose && !p.end) throw appError("INVALID_INPUT", undefined, { fields: { end: "required" } });
    const open = !!p.open || !p.userId;
    const userId = open ? undefined : (ctx.db.normalizeId("users", p.userId!) ?? undefined);
    if (!open && !userId) throw appError("NOT_FOUND");
    if (userId) await checkPerson(ctx, userId, args.venueId, p.position);
    const eventId = p.eventId ? ctx.db.normalizeId("venueEvents", p.eventId) : null;
    if (p.eventId) {
      const e = eventId ? await ctx.db.get(eventId) : null;
      if (!e || e.venueId !== args.venueId) throw appError("NOT_FOUND");
    }
    const week = await ensureWeek(ctx, args.venueId, weekOf(p.date));
    const fields = { position: p.position, date: p.date, start: p.start, end: p.untilClose ? undefined : p.end, untilClose: p.untilClose, breakMin: p.breakMin, eventId: eventId ?? undefined, open };
    let id: Id<"shiftsPlanned">;
    if (p.shiftId) {
      const sid = ctx.db.normalizeId("shiftsPlanned", p.shiftId);
      const s = sid ? await ctx.db.get(sid) : null;
      if (!s || s.venueId !== args.venueId || s.removed) throw appError("NOT_FOUND");
      if (s.weekId !== week._id) {
        // Moved to another week: remove here, create there.
        await removePlanned(ctx, s);
        id = await ctx.db.insert("shiftsPlanned", { weekId: week._id, venueId: args.venueId, userId, ...fields, changedInVersion: nextVersion(week) });
      } else if ((s.userId ?? null) !== (userId ?? null)) {
        id = await reassign(ctx, s, week, userId, fields);
      } else {
        await ctx.db.patch(s._id, { ...fields, changedInVersion: nextVersion(week) });
        id = s._id;
      }
    } else {
      id = await ctx.db.insert("shiftsPlanned", { weekId: week._id, venueId: args.venueId, userId, ...fields, changedInVersion: nextVersion(week) });
    }
    if (week.status === "published") await audit(ctx, { actorId: actor._id, venueId: args.venueId, action: "schedule.changed", entity: "shiftsPlanned", entityId: id, meta: { version: nextVersion(week) } });
    return { shiftId: id, weekId: week._id, pendingVersion: nextVersion(week) };
  },
});

async function removePlanned(ctx: MutationCtx, s: Planned) {
  const week = (await ctx.db.get(s.weekId))!;
  // Never published: nobody saw it, delete it. Published: keep it as removed so the person is told on publish.
  if (week.version === 0) await ctx.db.delete(s._id);
  else await ctx.db.patch(s._id, { removed: true, changedInVersion: nextVersion(week) });
}

export const removeShift = mutation({
  args: { shiftId: v.id("shiftsPlanned") },
  handler: async (ctx, { shiftId }) => {
    const actor = await requireCan(ctx, "schedule.manage");
    const s = await ctx.db.get(shiftId);
    if (!s || s.removed) throw appError("NOT_FOUND");
    requireVenue(actor, s.venueId);
    const week = (await ctx.db.get(s.weekId))!;
    await removePlanned(ctx, s);
    if (week.status === "published") await audit(ctx, { actorId: actor._id, venueId: s.venueId, action: "schedule.changed", entity: "shiftsPlanned", entityId: s._id, meta: { removed: true } });
    return { ok: true };
  },
});

/** An open shift anyone enabled for the position can claim; the manager decides (BLUEPRINT 2.6). */
export const offerOpenShift = mutation({
  args: { venueId: v.id("venues"), position: v.string(), date: v.string(), start: v.string(), end: v.optional(v.string()), untilClose: v.boolean(), breakMin: v.optional(v.number()), eventId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "schedule.manage");
    requireVenue(actor, args.venueId);
    const p = parseOrThrow(plannedShiftInput, { ...args, open: true });
    if (!p.untilClose && !p.end) throw appError("INVALID_INPUT", undefined, { fields: { end: "required" } });
    const week = await ensureWeek(ctx, args.venueId, weekOf(p.date));
    const eventId = p.eventId ? (ctx.db.normalizeId("venueEvents", p.eventId) ?? undefined) : undefined;
    // In a published week an open shift has no person to confirm it, so it is visible at once.
    const published = week.status === "published";
    const id = await ctx.db.insert("shiftsPlanned", {
      weekId: week._id,
      venueId: args.venueId,
      position: p.position,
      date: p.date,
      start: p.start,
      end: p.untilClose ? undefined : p.end,
      untilClose: p.untilClose,
      breakMin: p.breakMin,
      eventId,
      open: true,
      changedInVersion: published ? week.version : nextVersion(week),
    });
    if (published) await notifyOpenShifts(ctx, args.venueId, [(await ctx.db.get(id))!]);
    return { shiftId: id };
  },
});

export const publish = mutation({
  args: { venueId: v.id("venues"), weekStart: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "schedule.manage");
    requireVenue(actor, args.venueId);
    const week = await getWeek(ctx, args.venueId, weekOf(args.weekStart));
    if (!week) throw appError("NOT_FOUND");
    const shifts = await shiftsOf(ctx, week._id);
    if (week.status === "published" && !shifts.some((s) => s.changedInVersion > week.version)) return { version: week.version, notified: 0 };
    return await publishWeek(ctx, actor, week);
  },
});

/** "I saw it" for a published week (ADR 0022). VERSION_STALE when a newer version touched my shifts. */
export const confirm = mutation({
  args: { venueId: v.id("venues"), weekStart: v.string(), version: v.number() },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "schedule.own");
    requireVenue(actor, args.venueId);
    const week = await getWeek(ctx, args.venueId, weekOf(args.weekStart));
    if (!week || week.status !== "published") throw appError("WEEK_NOT_PUBLISHED");
    const shifts = await shiftsOf(ctx, week._id);
    const required = versionToConfirm(actor._id, shifts, week.version);
    if (required === null) throw appError("NOT_FOUND");
    if (args.version < required || args.version > week.version) throw appError("VERSION_STALE");
    const existing = (await acksOf(ctx, week._id)).find((a) => a.userId === actor._id);
    const now = Date.now();
    if (existing) {
      if (existing.version < args.version) await ctx.db.patch(existing._id, { version: args.version, at: now });
    } else {
      await ctx.db.insert("scheduleAcks", { weekId: week._id, userId: actor._id, version: args.version, at: now });
    }
    await ctx.db.insert("analyticsEvents", { name: "schedule_confirmed", userId: actor._id, venueId: args.venueId, props: { version: args.version, afterMs: week.publishedAt ? now - week.publishedAt : null }, at: now });
    return { ok: true, version: args.version };
  },
});

export const setAvailability = mutation({
  args: { rows: v.array(v.object({ weekday: v.number(), from: v.string(), to: v.string(), available: v.boolean() })) },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "schedule.own");
    const p = parseOrThrow(availabilityInput, args);
    if (p.rows.some((r) => r.from >= r.to)) throw appError("INVALID_INPUT", undefined, { fields: { rows: "order" } });
    const old = await ctx.db
      .query("availability")
      .withIndex("by_user", (q) => q.eq("userId", actor._id))
      .collect();
    for (const r of old) await ctx.db.delete(r._id);
    for (const r of p.rows) await ctx.db.insert("availability", { userId: actor._id, ...r });
    return { ok: true };
  },
});

export const requestTimeOff = mutation({
  args: { venueId: v.id("venues"), from: v.string(), to: v.string(), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "schedule.own");
    requireVenue(actor, args.venueId);
    const p = parseOrThrow(timeOffInput, args);
    if (p.from < nyDateKey(Date.now())) throw appError("TOO_LATE");
    const id = await ctx.db.insert("timeOff", { userId: actor._id, venueId: args.venueId, from: p.from, to: p.to, reason: p.reason, status: "pending", at: Date.now() });
    const managers = (await venueManagers(ctx, args.venueId)).map((u) => u._id);
    await enqueue(ctx, managers, { topic: "approval", key: "timeOffToDecide", vars: { name: actor.name }, url: "/manage/schedule" });
    return { timeOffId: id };
  },
});

export const cancelTimeOff = mutation({
  args: { timeOffId: v.id("timeOff") },
  handler: async (ctx, { timeOffId }) => {
    const actor = await requireCan(ctx, "schedule.own");
    const t = await ctx.db.get(timeOffId);
    if (!t || t.userId !== actor._id) throw appError("NOT_FOUND");
    if (t.status !== "pending") throw appError("INVALID_TRANSITION");
    await ctx.db.delete(t._id);
    return { ok: true };
  },
});

export const decideTimeOff = mutation({
  args: { timeOffId: v.id("timeOff"), approve: v.boolean() },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "schedule.manage");
    const t = await ctx.db.get(args.timeOffId);
    if (!t) throw appError("NOT_FOUND");
    requireVenue(actor, t.venueId);
    if (t.userId === actor._id) throw appError("FORBIDDEN");
    if (t.status !== "pending") throw appError("INVALID_TRANSITION");
    const status = args.approve ? "approved" : "denied";
    await ctx.db.patch(t._id, { status, decidedBy: actor._id });
    await audit(ctx, { actorId: actor._id, venueId: t.venueId, action: "time_off.decided", entity: "timeOff", entityId: t._id, meta: { status } });
    await enqueue(ctx, [t.userId], { topic: "schedule", key: "timeOffDecided", url: URL });
    return { ok: true, status };
  },
});

/**
 * A swap is a request to the manager naming a colleague (ADR 0026): the system asks the colleague, then the manager
 * decides. Optionally the requester takes one of the colleague's shifts in exchange (`toShiftId`).
 */
export const requestSwap = mutation({
  args: { fromShiftId: v.string(), colleagueId: v.string(), toShiftId: v.optional(v.string()), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "schedule.own");
    const p = parseOrThrow(swapInput, args);
    const fromId = ctx.db.normalizeId("shiftsPlanned", p.fromShiftId);
    const from = fromId ? await ctx.db.get(fromId) : null;
    if (!from || from.userId !== actor._id) throw appError("NOT_FOUND");
    requireVenue(actor, from.venueId);
    const week = (await ctx.db.get(from.weekId))!;
    if (!isLive(from, week) || from.open) throw appError("SWAP_CONFLICT");
    const colleagueId = ctx.db.normalizeId("users", p.colleagueId);
    const colleague = colleagueId ? await ctx.db.get(colleagueId) : null;
    if (!colleague || !colleague.active || !(await worksAt(ctx, colleague, from.venueId))) throw appError("NOT_FOUND");
    let to: Planned | null = null;
    if (p.toShiftId) {
      const toId = ctx.db.normalizeId("shiftsPlanned", p.toShiftId);
      to = toId ? await ctx.db.get(toId) : null;
      if (!to || to.venueId !== from.venueId) throw appError("NOT_FOUND");
      const toWeek = (await ctx.db.get(to.weekId))!;
      if (!isLive(to, toWeek)) throw appError("SWAP_CONFLICT");
    }
    if (to && !to.userId) throw appError("SWAP_CONFLICT");
    const problem = swapProblem({ ...from, userId: from.userId! }, to ? { ...to, userId: to.userId! } : null, actor, colleague, Date.now());
    if (problem) throw appError(problem);
    const active = (
      await ctx.db
        .query("swaps")
        .withIndex("by_requester", (q) => q.eq("requestedBy", actor._id))
        .collect()
    ).some((s) => s.fromShiftId === from._id && (s.status === "asked" || s.status === "accepted"));
    if (active) throw appError("SWAP_CONFLICT");
    await rateLimit(ctx, `swap:${actor._id}`, 10, 24 * 3600_000);
    const id = await ctx.db.insert("swaps", { venueId: from.venueId, fromShiftId: from._id, toShiftId: to?._id, requestedBy: actor._id, colleagueId: colleague._id, note: p.note, status: "asked", at: Date.now() });
    // The system asks the colleague; the text says the manager decides. No conversation between them.
    await enqueue(ctx, [colleague._id], { topic: "schedule", key: "swapAsked", vars: { name: actor.name }, url: URL });
    return { swapId: id };
  },
});

/** The colleague answers through the system; an accepted swap goes to the managers. */
export const answerSwap = mutation({
  args: { swapId: v.id("swaps"), accept: v.boolean() },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "schedule.own");
    const s = await ctx.db.get(args.swapId);
    if (!s || s.colleagueId !== actor._id) throw appError("NOT_FOUND");
    if (s.status !== "asked") throw appError("INVALID_TRANSITION");
    if (args.accept) {
      await ctx.db.patch(s._id, { status: "accepted" });
      const managers = (await venueManagers(ctx, s.venueId)).map((u) => u._id);
      await enqueue(ctx, managers, { topic: "approval", key: "swapToDecide", url: "/manage/schedule" });
    } else {
      await ctx.db.patch(s._id, { status: "denied", decidedBy: actor._id });
      await enqueue(ctx, [s.requestedBy], { topic: "schedule", key: "swapDecided", url: URL });
    }
    return { ok: true };
  },
});

export const cancelSwap = mutation({
  args: { swapId: v.id("swaps") },
  handler: async (ctx, { swapId }) => {
    const actor = await requireCan(ctx, "schedule.own");
    const s = await ctx.db.get(swapId);
    if (!s || s.requestedBy !== actor._id) throw appError("NOT_FOUND");
    if (s.status !== "asked" && s.status !== "accepted") throw appError("INVALID_TRANSITION");
    await ctx.db.patch(s._id, { status: "canceled" });
    return { ok: true };
  },
});

/** The manager decides an accepted swap. Approval moves both shifts atomically and publishes the change. */
export const decideSwap = mutation({
  args: { swapId: v.id("swaps"), approve: v.boolean() },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "schedule.manage");
    const s = await ctx.db.get(args.swapId);
    if (!s) throw appError("NOT_FOUND");
    requireVenue(actor, s.venueId);
    if (s.status !== "accepted") throw appError("INVALID_TRANSITION");
    if (actor._id === s.requestedBy || actor._id === s.colleagueId) throw appError("FORBIDDEN");
    if (!args.approve) {
      await ctx.db.patch(s._id, { status: "denied", decidedBy: actor._id });
      await audit(ctx, { actorId: actor._id, venueId: s.venueId, action: "swap.decided", entity: "swaps", entityId: s._id, meta: { status: "denied" } });
      await enqueue(ctx, [s.requestedBy, s.colleagueId], { topic: "schedule", key: "swapDecided", url: URL });
      return { ok: true, status: "denied" as const };
    }
    const from = await ctx.db.get(s.fromShiftId);
    const to = s.toShiftId ? await ctx.db.get(s.toShiftId) : null;
    const requester = await ctx.db.get(s.requestedBy);
    const colleague = await ctx.db.get(s.colleagueId);
    if (!from || !requester || !colleague || (s.toShiftId && !to)) throw appError("SWAP_CONFLICT");
    const problem = swapProblem({ ...from, userId: from.userId ?? "" }, to ? { ...to, userId: to.userId ?? "" } : null, requester, colleague, Date.now());
    if (problem) throw appError(problem === "FORBIDDEN" ? "SWAP_CONFLICT" : problem);
    const week = (await ctx.db.get(from.weekId))!;
    await reassign(ctx, from, week, colleague._id);
    if (to) {
      const toWeek = (await ctx.db.get(to.weekId))!;
      await reassign(ctx, to, toWeek, requester._id);
      if (toWeek._id !== week._id) await publishWeek(ctx, actor, (await ctx.db.get(toWeek._id))!);
    }
    await ctx.db.patch(s._id, { status: "approved", decidedBy: actor._id });
    await audit(ctx, { actorId: actor._id, venueId: s.venueId, action: "swap.decided", entity: "swaps", entityId: s._id, meta: { status: "approved" } });
    const published = await publishWeek(ctx, actor, (await ctx.db.get(week._id))!);
    return { ok: true, status: "approved" as const, version: published.version };
  },
});

export const claimOpenShift = mutation({
  args: { shiftId: v.id("shiftsPlanned") },
  handler: async (ctx, { shiftId }) => {
    const actor = await requireCan(ctx, "schedule.own");
    const s = await ctx.db.get(shiftId);
    if (!s || s.removed) throw appError("NOT_FOUND");
    requireVenue(actor, s.venueId);
    const week = (await ctx.db.get(s.weekId))!;
    if (!isPublished(s, week)) throw appError("NOT_FOUND");
    if (!s.open) throw appError("ALREADY_CLAIMED");
    const claims = await ctx.db
      .query("openShiftClaims")
      .withIndex("by_shift", (q) => q.eq("shiftPlannedId", s._id))
      .collect();
    if (claims.some((c) => c.status === "approved")) throw appError("ALREADY_CLAIMED");
    const mine = claims.find((c) => c.userId === actor._id);
    if (mine && mine.status === "pending") return { claimId: mine._id };
    const own = (
      await ctx.db
        .query("shiftsPlanned")
        .withIndex("by_user_date", (q) => q.eq("userId", actor._id).eq("date", s.date))
        .collect()
    ).filter((x) => !x.removed);
    const problem = openShiftEligible(actor, s, own, closeTimeOf(await ctx.db.get(s.venueId)));
    if (problem) throw appError(problem);
    const id = await ctx.db.insert("openShiftClaims", { shiftPlannedId: s._id, venueId: s.venueId, userId: actor._id, status: "pending", at: Date.now() });
    const managers = (await venueManagers(ctx, s.venueId)).map((u) => u._id);
    await enqueue(ctx, managers, { topic: "approval", key: "claimToDecide", vars: { name: actor.name }, url: "/manage/schedule" });
    return { claimId: id };
  },
});

/** The manager decides a claim; the first approved claim takes the shift and the others are denied. */
export const decideClaim = mutation({
  args: { claimId: v.id("openShiftClaims"), approve: v.boolean() },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "schedule.manage");
    const c = await ctx.db.get(args.claimId);
    if (!c) throw appError("NOT_FOUND");
    requireVenue(actor, c.venueId);
    if (c.status !== "pending") throw appError("INVALID_TRANSITION");
    const s = await ctx.db.get(c.shiftPlannedId);
    if (!s || s.removed) throw appError("NOT_FOUND");
    if (!args.approve) {
      await ctx.db.patch(c._id, { status: "denied", decidedBy: actor._id });
      await enqueue(ctx, [c.userId], { topic: "schedule", key: "claimDecided", url: URL });
      await audit(ctx, { actorId: actor._id, venueId: c.venueId, action: "open_shift.decided", entity: "openShiftClaims", entityId: c._id, meta: { status: "denied" } });
      return { ok: true, status: "denied" as const };
    }
    if (!s.open) throw appError("ALREADY_CLAIMED");
    const claimant = await ctx.db.get(c.userId);
    if (!claimant || !canWork(claimant, s.position)) throw appError("NOT_ENABLED");
    const week = (await ctx.db.get(s.weekId))!;
    // The claimant asked for it: the shift is theirs at once, in the published version, and they confirm it like any change.
    await ctx.db.patch(s._id, { open: false, userId: claimant._id, changedInVersion: week.status === "published" ? week.version : nextVersion(week) });
    await ctx.db.patch(c._id, { status: "approved", decidedBy: actor._id });
    const others = await ctx.db
      .query("openShiftClaims")
      .withIndex("by_shift", (q) => q.eq("shiftPlannedId", s._id))
      .collect();
    for (const o of others.filter((x) => x._id !== c._id && x.status === "pending")) {
      await ctx.db.patch(o._id, { status: "denied", decidedBy: actor._id });
    }
    await enqueue(ctx, [c.userId, ...others.filter((x) => x._id !== c._id && x.status === "pending").map((x) => x.userId)], { topic: "schedule", key: "claimDecided", url: URL });
    await audit(ctx, { actorId: actor._id, venueId: c.venueId, action: "open_shift.decided", entity: "openShiftClaims", entityId: c._id, meta: { status: "approved" } });
    return { ok: true, status: "approved" as const };
  },
});

/** Late and no-show marks by the manager (no time clock). A late or no-show offers "Log a warning" with the punctuality rule. */
export const markAttendance = mutation({
  args: { shiftId: v.id("shiftsPlanned"), status: v.string(), minutes: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "schedule.manage");
    const p = parseOrThrow(attendanceInput, args);
    const s = await ctx.db.get(args.shiftId);
    if (!s || s.removed || s.open || !s.userId) throw appError("NOT_FOUND");
    requireVenue(actor, s.venueId);
    if (s.date > nyDateKey(Date.now())) throw appError("INVALID_TRANSITION");
    await ctx.db.patch(s._id, { attendance: { status: p.status, minutes: p.status === "late" ? p.minutes : undefined, by: actor._id, at: Date.now() } });
    await audit(ctx, { actorId: actor._id, venueId: s.venueId, action: "attendance.marked", entity: "shiftsPlanned", entityId: s._id, meta: { status: p.status, minutes: p.minutes ?? null } });
    return { ok: true, suggestWarning: p.status === "on_time" ? null : { userId: s.userId, ruleKey: "punctuality" } };
  },
});

// ------------------------------------------------------------------------------------------------------------ Crons

/**
 * Hourly (crons.ts): 24 h after a publish, reminds every person who has not confirmed (once per version) and sends
 * the venue's managers the list.
 */
export const remind = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const today = nyDateKey(now);
    let reminded = 0;
    for (const venue of await ctx.db.query("venues").collect()) {
      if (!venue.active) continue;
      const weeks = await ctx.db
        .query("scheduleWeeks")
        .withIndex("by_venue_week", (q) => q.eq("venueId", venue._id).gte("weekStart", addDays(weekOf(today), -7)))
        .collect();
      for (const w of weeks) {
        if (w.status !== "published" || !w.publishedAt || w.remindedAt || now - w.publishedAt < 24 * 3600_000) continue;
        if (addDays(w.weekStart, 6) < today) continue;
        const shifts = await shiftsOf(ctx, w._id);
        const acks = await acksOf(ctx, w._id);
        const ids = [...new Set(shifts.filter((s) => s.userId).map((s) => s.userId!))].filter((id) => needsConfirm(id, w, shifts, acks));
        await ctx.db.patch(w._id, { remindedAt: now });
        if (!ids.length) continue;
        reminded += await enqueue(ctx, ids, { topic: "schedule", key: "scheduleReminder", vars: { venue: venue.name, week: w.weekStart }, url: URL });
        const managers = (await venueManagers(ctx, venue._id)).map((u) => u._id);
        await enqueue(ctx, managers, { topic: "approval", key: "scheduleUnconfirmed", vars: { count: ids.length, week: w.weekStart }, url: "/manage/schedule" });
      }
    }
    return { reminded };
  },
});

/** Every 15 minutes (crons.ts): a push about an hour before each published shift, once. */
export const shiftReminder = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const today = nyDateKey(now);
    let sent = 0;
    for (const venue of await ctx.db.query("venues").collect()) {
      if (!venue.active) continue;
      for (const date of [today, addDays(today, 1)]) {
        const rows = await ctx.db
          .query("shiftsPlanned")
          .withIndex("by_venue_date", (q) => q.eq("venueId", venue._id).eq("date", date))
          .collect();
        for (const s of rows) {
          if (!s.userId || s.removed || s.open || s.remindedAt) continue;
          const week = await ctx.db.get(s.weekId);
          if (!week || !isPublished(s, week)) continue;
          const startsAt = nyTimeOn(s.date, s.start);
          if (startsAt <= now || startsAt - now > 60 * 60_000) continue;
          await ctx.db.patch(s._id, { remindedAt: now });
          sent += await enqueue(ctx, [s.userId], { topic: "schedule", key: "shiftSoon", vars: { venue: venue.name, time: s.start }, url: URL });
        }
      }
    }
    return { sent };
  },
});
