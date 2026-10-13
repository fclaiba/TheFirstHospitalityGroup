// Leader views in states, not scores (ADR 0027; BLUEPRINT 2.6, 7.2 reports). The GM sees the venue in states with the
// names behind each one; the director and owner see the four venues, each with one overall state and the reasons in
// words. Never money, never percentages. Bounded by venue and date windows (BLUEPRINT 8.2).
import { v } from "convex/values";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireCan, requireVenue } from "./lib/auth";
import { appError } from "./lib/errors";
import { liveShiftOf } from "./lib/shift";
import { sideWorkRows } from "./lib/service";
import { DAY_MS, DEFAULT_THRESHOLDS, countable, proposalStale, streak, warningState } from "../lib/domain/warnings";
import { isLate } from "../lib/domain/tasks";
import { needsConfirm, weekOf } from "../lib/domain/schedule";
import { byUrgency, isConfirmLate, personState, venueState } from "../lib/domain/states";
import type { VenueInputs } from "../lib/domain/states";
import { NOTIFY_AFTER_MS } from "../lib/domain/shift";
import { areaOf, isCorporate } from "../lib/domain/positions";
import { AREAS } from "../lib/domain/types";
import type { Thresholds } from "../lib/domain/types";
import { nyDateKey } from "../lib/time";

async function thresholdsOf(ctx: QueryCtx, companyId: Id<"companies">): Promise<Thresholds> {
  return (await ctx.db.get(companyId))?.thresholds.warnings ?? DEFAULT_THRESHOLDS;
}

async function peopleOf(ctx: QueryCtx, venueId: Id<"venues">): Promise<Doc<"users">[]> {
  const rows = await ctx.db
    .query("assignments")
    .withIndex("by_venue", (q) => q.eq("venueId", venueId))
    .collect();
  const out: Doc<"users">[] = [];
  for (const r of rows) {
    const u = await ctx.db.get(r.userId);
    if (u && u.active && !u.isDev && !isCorporate(u.primaryPosition)) out.push(u);
  }
  return out;
}

/** The current published week of a venue with its shifts and acks. */
async function currentWeek(ctx: QueryCtx, venueId: Id<"venues">, now: number) {
  const week = await ctx.db
    .query("scheduleWeeks")
    .withIndex("by_venue_week", (q) => q.eq("venueId", venueId).eq("weekStart", weekOf(nyDateKey(now))))
    .unique();
  if (!week || week.status !== "published") return null;
  const shifts = (
    await ctx.db
      .query("shiftsPlanned")
      .withIndex("by_week", (q) => q.eq("weekId", week._id))
      .collect()
  ).map((s) => ({ ...s, userId: s.userId as string | undefined, eventId: s.eventId as string | undefined }));
  const acks = (
    await ctx.db
      .query("scheduleAcks")
      .withIndex("by_week_user", (q) => q.eq("weekId", week._id))
      .collect()
  ).map((a) => ({ userId: a.userId as string, version: a.version }));
  return { week, shifts, acks };
}

/** Everything venueState() needs, with the names behind each state. */
async function venueInputs(ctx: QueryCtx, venue: Doc<"venues">, now: number): Promise<VenueInputs & { people: Doc<"users">[]; t: Thresholds }> {
  const t = await thresholdsOf(ctx, venue.companyId);
  const since = nyDateKey(now - 7 * DAY_MS);
  const recent = await ctx.db
    .query("shifts")
    .withIndex("by_venue_date", (q) => q.eq("venueId", venue._id).gte("date", since))
    .collect();
  const closesMissing = recent.filter((s) => (s.status === "open" || s.status === "closing") && now >= s.endsAt + NOTIFY_AFTER_MS).length;
  const autoClosed = recent.filter((s) => s.autoClosedAt && !s.reviewedAt).length;
  const people = await peopleOf(ctx, venue._id);
  const name = new Map(people.map((p) => [p._id as string, p.name]));
  const unconfirmed: string[] = [];
  const lateConfirmations: string[] = [];
  const cw = await currentWeek(ctx, venue._id, now);
  if (cw) {
    for (const userId of new Set(cw.shifts.map((s) => s.userId).filter((x): x is string => !!x))) {
      if (!needsConfirm(userId, cw.week, cw.shifts, cw.acks)) continue;
      const n = name.get(userId);
      if (!n) continue;
      unconfirmed.push(n);
      if (cw.week.publishedAt && isConfirmLate(cw.week.publishedAt, now)) lateConfirmations.push(n);
    }
  }
  let lateRuns = 0;
  const live = await liveShiftOf(ctx, venue._id);
  if (live) {
    lateRuns = (
      await ctx.db
        .query("taskRuns")
        .withIndex("by_shift", (q) => q.eq("shiftId", live._id))
        .collect()
    ).filter((r) => isLate(r, now)).length;
  }
  const open = await ctx.db
    .query("shortages")
    .withIndex("by_venue_status", (q) => q.eq("venueId", venue._id).eq("status", "open"))
    .collect();
  const reviews: string[] = [];
  for (const p of people) {
    const ws = await ctx.db
      .query("warnings")
      .withIndex("by_user_at", (q) => q.eq("userId", p._id).gte("at", now - t.windowDays * DAY_MS))
      .collect();
    if (warningState(ws, now, t) === "review") reviews.push(p.name);
  }
  const staleProposals = (
    await ctx.db
      .query("warningProposals")
      .withIndex("by_venue_status", (q) => q.eq("venueId", venue._id).eq("status", "open"))
      .collect()
  ).filter((p) => now - p.at > 24 * 3600_000 || proposalStale(p, now)).length;
  const sw = await sideWorkRows(ctx, venue, weekOf(nyDateKey(now)));
  return {
    closesMissing,
    autoClosed,
    unconfirmed,
    lateConfirmations,
    lateRuns,
    shortagesOut: open.filter((s) => s.level === "out").length,
    shortagesLow: open.filter((s) => s.level === "low").length,
    reviews,
    staleProposals,
    overSideWork: sw.rows.filter((r) => r.state === "over_limit").length,
    people,
    t,
  };
}

async function stateOfVenue(ctx: QueryCtx, venue: Doc<"venues">, now: number) {
  const inputs = await venueInputs(ctx, venue, now);
  return { venue: { _id: venue._id, name: venue.name, slug: venue.slug }, ...venueState(inputs) };
}

/** People of a venue by area, each with their states (warnings, confirmation, side work), never a score. */
export const team = query({
  args: { venueId: v.id("venues") },
  handler: async (ctx, { venueId }) => {
    const actor = await requireCan(ctx, "team.view");
    requireVenue(actor, venueId);
    const now = Date.now();
    const t = await thresholdsOf(ctx, actor.companyId);
    const people = await peopleOf(ctx, venueId);
    const cw = await currentWeek(ctx, venueId, now);
    const live = await liveShiftOf(ctx, venueId);
    const liveRuns = live
      ? await ctx.db
          .query("taskRuns")
          .withIndex("by_shift", (q) => q.eq("shiftId", live._id))
          .collect()
      : [];
    const out = [];
    for (const u of people) {
      const warnings = await ctx.db
        .query("warnings")
        .withIndex("by_user_at", (q) => q.eq("userId", u._id))
        .collect();
      const ws = warningState(warnings, now, t);
      const pending = cw ? (needsConfirm(u._id, cw.week, cw.shifts, cw.acks) ? 1 : 0) : 0;
      const latePending = pending > 0 && !!cw?.week.publishedAt && isConfirmLate(cw.week.publishedAt, now);
      const lateRuns = liveRuns.filter((r) => r.userId === u._id && isLate(r, now)).length;
      const runs = await ctx.db
        .query("taskRuns")
        .withIndex("by_user_due", (q) => q.eq("userId", u._id).gte("dueAt", now - 30 * DAY_MS))
        .collect();
      const starts: number[] = [];
      for (const id of new Set(runs.map((r) => r.shiftId))) {
        const s = await ctx.db.get(id);
        if (s) starts.push(s.startsAt);
      }
      const ruleCounts = new Map<string, number>();
      for (const w of warnings.filter((x) => countable(x, now, t.windowDays))) ruleCounts.set(w.ruleId, (ruleCounts.get(w.ruleId) ?? 0) + 1);
      const topRules = [];
      for (const [ruleId] of [...ruleCounts].sort((a, b) => b[1] - a[1]).slice(0, 2)) topRules.push((await ctx.db.get(ruleId as Id<"rules">))?.title ?? { en: "", es: "" });
      out.push({
        userId: u._id,
        name: u.name,
        position: u.primaryPosition,
        enabledPositions: u.enabledPositions,
        area: areaOf(u.primaryPosition),
        title: u.title ?? null,
        ...personState({ warnings: ws, pendingConfirmations: pending, latePending, lateRuns }),
        topRules,
        recognition: streak(starts, warnings).current,
      });
    }
    const order = (s: string) => ["review", "follow_up", "attention", "up_to_date"].indexOf(s);
    out.sort((a, b) => AREAS.indexOf(a.area) - AREAS.indexOf(b.area) || order(a.warnings) - order(b.warnings) || a.name.localeCompare(b.name));
    return { people: out };
  },
});

/** The venue in states with reasons and names (GM, managers, corporate). */
export const venueStateQuery = query({
  args: { venueId: v.id("venues") },
  handler: async (ctx, { venueId }) => {
    const actor = await requireCan(ctx, "venue.state");
    requireVenue(actor, venueId);
    const venue = await ctx.db.get(venueId);
    if (!venue) throw appError("NOT_FOUND");
    const now = Date.now();
    const inputs = await venueInputs(ctx, venue, now);
    const live = await liveShiftOf(ctx, venueId);
    const lastClose = await ctx.db
      .query("closeReports")
      .withIndex("by_venue_submitted", (q) => q.eq("venueId", venueId).gt("submittedAt", 0))
      .order("desc")
      .first();
    return {
      venue: { _id: venue._id, name: venue.name, slug: venue.slug },
      ...venueState(inputs),
      shift: live ? { _id: live._id, status: live.status, service: live.service } : null,
      lastClose: lastClose ? { shiftId: lastClose.shiftId, status: lastClose.status, submittedAt: lastClose.submittedAt ?? null, nextShiftNotes: lastClose.nextShiftNotes } : null,
      names: { unconfirmed: inputs.unconfirmed, reviews: inputs.reviews },
    };
  },
});
export { venueStateQuery as venueState };

/** The four venues, each with one overall state and its reasons, most urgent first (director, owner). */
export const company = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireCan(ctx, "company.view");
    const now = Date.now();
    const venues = (
      await ctx.db
        .query("venues")
        .withIndex("by_company", (q) => q.eq("companyId", actor.companyId))
        .collect()
    ).filter((x) => x.active);
    const out = [];
    for (const venue of venues) out.push({ ...(await stateOfVenue(ctx, venue, now)), sort: venue.sort });
    return { venues: out.sort((a, b) => byUrgency(a, b) || a.sort - b.sort) };
  },
});
