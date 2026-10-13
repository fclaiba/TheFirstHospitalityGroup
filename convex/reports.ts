// Performance board and owner dashboard (BLUEPRINT 2.2, 7.2 reports). Bounded by venue and date windows (8.2).
import { v } from "convex/values";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireRole, requireVenue } from "./lib/auth";
import type { Actor } from "./lib/auth";
import { appError } from "./lib/errors";
import { liveShiftOf } from "./lib/shift";
import { shiftStock } from "./lib/stockReport";
import { DAY_MS, DEFAULT_THRESHOLDS, STATE_ORDER, countable, streak, warningState } from "../lib/domain/warnings";
import { onTimeRate } from "../lib/domain/tasks";
import { readRate } from "../lib/domain/messages";
import { nyDateKey } from "../lib/time";
import type { CloseSummary } from "../lib/domain/close";
import type { Thresholds, WarningState } from "../lib/domain/types";

async function thresholdsOf(ctx: QueryCtx, actor: Actor): Promise<Thresholds> {
  return (await ctx.db.get(actor.companyId))?.warningThresholds ?? DEFAULT_THRESHOLDS;
}

async function peopleOf(ctx: QueryCtx, venueId: Id<"venues">): Promise<Doc<"users">[]> {
  const rows = await ctx.db
    .query("assignments")
    .withIndex("by_venue", (q) => q.eq("venueId", venueId))
    .collect();
  const out: Doc<"users">[] = [];
  for (const r of rows) {
    const u = await ctx.db.get(r.userId);
    if (u && u.active && u.role !== "owner" && !u.isDev) out.push(u);
  }
  return out;
}

const ruleTitle = async (ctx: QueryCtx, ruleId: Id<"rules">) => (await ctx.db.get(ruleId))?.title ?? { en: "", es: "" };

/** Everything the board shows for one person over a window. */
async function stats(ctx: QueryCtx, user: Doc<"users">, t: Thresholds, from: number, to: number, now: number) {
  const warnings = await ctx.db
    .query("warnings")
    .withIndex("by_user_at", (q) => q.eq("userId", user._id).gte("at", Math.min(from, now - t.windowDays * DAY_MS)))
    .collect();
  const live = warnings.filter((w) => countable(w, now, t.windowDays));
  const state = warningState(warnings, now, t);
  const missed = new Map<string, number>();
  for (const w of live) missed.set(w.ruleId, (missed.get(w.ruleId) ?? 0) + 1);
  const topRules = [];
  for (const [ruleId, count] of [...missed].sort((a, b) => b[1] - a[1]).slice(0, 3)) topRules.push({ ruleId, count, title: await ruleTitle(ctx, ruleId as Id<"rules">) });
  const runs = await ctx.db
    .query("taskRuns")
    .withIndex("by_user_due", (q) => q.eq("userId", user._id).gte("dueAt", from).lte("dueAt", to))
    .collect();
  const reads = (
    await ctx.db
      .query("messageReads")
      .withIndex("by_user", (q) => q.eq("userId", user._id).gte("at", from))
      .collect()
  ).filter((r) => r.at <= to);
  const shiftStarts: number[] = [];
  for (const id of new Set(runs.map((r) => r.shiftId))) {
    const s = await ctx.db.get(id);
    if (s) shiftStarts.push(s.startsAt);
  }
  const s = streak(shiftStarts, warnings);
  return {
    id: user._id,
    name: user.name,
    role: user.role,
    level: user.level,
    state,
    warnings: live.length,
    major: live.filter((w) => w.severity === "major").length,
    unacknowledged: live.filter((w) => !w.acknowledgedAt).length,
    topRules,
    onTime: onTimeRate(runs, now),
    runs: runs.length,
    readRate: readRate(reads, reads.length),
    streak: s.current,
    bestStreak: s.best,
  };
}

const severity = (s: WarningState) => STATE_ORDER.indexOf(s);

export const team = query({
  args: { venueId: v.id("venues"), from: v.optional(v.number()), to: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, ["manager"]);
    requireVenue(actor, args.venueId);
    const now = Date.now();
    const t = await thresholdsOf(ctx, actor);
    const from = args.from ?? now - t.windowDays * DAY_MS;
    const to = args.to ?? now;
    const people = [];
    for (const u of await peopleOf(ctx, args.venueId)) people.push(await stats(ctx, u, t, from, to, now));
    people.sort((a, b) => severity(b.state) - severity(a.state) || a.name.localeCompare(b.name));
    const roles = new Map<string, { role: string; people: number; onTimeSum: number; onTimeN: number; states: Record<WarningState, number> }>();
    for (const p of people) {
      const r = roles.get(p.role) ?? { role: p.role, people: 0, onTimeSum: 0, onTimeN: 0, states: { up_to_date: 0, attention: 0, follow_up: 0, review: 0 } };
      r.people += 1;
      r.states[p.state] += 1;
      if (p.onTime !== null) {
        r.onTimeSum += p.onTime;
        r.onTimeN += 1;
      }
      roles.set(p.role, r);
    }
    return {
      thresholds: t,
      from,
      to,
      people,
      roles: [...roles.values()].map((r) => ({ role: r.role, people: r.people, onTime: r.onTimeN ? Math.round(r.onTimeSum / r.onTimeN) : null, states: r.states })),
      recognition: [...people]
        .filter((p) => p.streak > 0)
        .sort((a, b) => b.streak - a.streak || b.bestStreak - a.bestStreak)
        .slice(0, 3)
        .map((p) => ({ id: p.id, name: p.name, role: p.role, streak: p.streak })),
    };
  },
});

export const person = query({
  args: { userId: v.id("users"), venueId: v.id("venues") },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, ["manager"]);
    requireVenue(actor, args.venueId);
    const user = await ctx.db.get(args.userId);
    if (!user || user.companyId !== actor.companyId) throw appError("NOT_FOUND");
    const assigned = await ctx.db
      .query("assignments")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    if (!assigned.some((a) => a.venueId === args.venueId)) throw appError("VENUE_FORBIDDEN");
    const now = Date.now();
    const t = await thresholdsOf(ctx, actor);
    const from = now - 30 * DAY_MS;
    const summary = await stats(ctx, user, t, from, now, now);
    const all = await ctx.db
      .query("warnings")
      .withIndex("by_user_at", (q) => q.eq("userId", user._id).gte("at", now - 180 * DAY_MS))
      .order("desc")
      .collect();
    const warnings = [];
    for (const w of all) {
      const by = await ctx.db.get(w.loggedBy);
      warnings.push({
        _id: w._id,
        at: w.at,
        severity: w.severity,
        note: w.note ?? null,
        rule: await ruleTitle(ctx, w.ruleId),
        loggedBy: by?.name ?? "",
        acknowledgedAt: w.acknowledgedAt ?? null,
        response: w.response ?? null,
        voidedAt: w.voidedAt ?? null,
        voidReason: w.voidReason ?? null,
        counts: countable(w, now, t.windowDays),
      });
    }
    const runs = (
      await ctx.db
        .query("taskRuns")
        .withIndex("by_user_due", (q) => q.eq("userId", user._id).gte("dueAt", from))
        .order("desc")
        .take(20)
    ).map((r) => ({
      _id: r._id,
      phase: r.phase,
      dueAt: r.dueAt,
      completedAt: r.completedAt ?? null,
      late: r.late,
      excused: !!r.excused,
      done: r.items.filter((i) => i.done).length,
      total: r.items.length,
      date: nyDateKey(r.dueAt),
    }));
    return { person: { ...summary, username: user.username, languageLevel: user.languageLevel ?? null }, warnings, runs };
  },
});

type VenueStatus = "open" | "closing" | "overdue" | "auto_closed" | "closed" | "idle";

/** Tonight's status, last close and live exceptions of one venue. */
async function venueCard(ctx: QueryCtx, venue: Doc<"venues">, t: Thresholds, now: number) {
  const live = await liveShiftOf(ctx, venue._id);
  const last = await ctx.db
    .query("closeReports")
    .withIndex("by_venue_submitted", (q) => q.eq("venueId", venue._id).gt("submittedAt", 0))
    .order("desc")
    .first();
  const lastShift = last ? await ctx.db.get(last.shiftId) : null;
  let status: VenueStatus = "idle";
  if (live) status = now > live.endsAt + 4 * 3600_000 ? "overdue" : live.status === "closing" ? "closing" : "open";
  else if (lastShift?.autoClosedAt && !lastShift.reviewedAt) status = "auto_closed";
  else if (lastShift && nyDateKey(lastShift.closedAt ?? 0) === nyDateKey(now)) status = "closed";
  const summary = (last?.summary ?? null) as CloseSummary | null;
  let shortages = summary?.shortages ?? { items: 0, lostCostCents: 0 };
  if (live) {
    const s = await shiftStock(ctx, live);
    shortages = { items: s.totals.shortItems, lostCostCents: s.totals.lostCostCents };
  }
  const states: Record<WarningState, number> = { up_to_date: 0, attention: 0, follow_up: 0, review: 0 };
  for (const u of await peopleOf(ctx, venue._id)) {
    const ws = await ctx.db
      .query("warnings")
      .withIndex("by_user_at", (q) => q.eq("userId", u._id).gte("at", now - t.windowDays * DAY_MS))
      .collect();
    states[warningState(ws, now, t)] += 1;
  }
  const weekRuns = await ctx.db
    .query("taskRuns")
    .withIndex("by_venue_due", (q) => q.eq("venueId", venue._id).gte("dueAt", now - 7 * DAY_MS).lte("dueAt", now))
    .collect();
  return {
    id: venue._id,
    name: venue.name,
    status,
    live: live ? { _id: live._id, service: live.service, status: live.status, openedAt: live.openedAt ?? null, endsAt: live.endsAt } : null,
    lastClose: last
      ? {
          shiftId: last.shiftId,
          date: lastShift?.date ?? null,
          service: lastShift?.service ?? null,
          auto: last.status === "auto",
          coversCount: last.coversCount,
          netSalesCents: last.netSalesCents,
          compsCents: last.compsCents,
          voidsCents: last.voidsCents,
          flagged: !!summary?.flagged,
          submittedAt: last.submittedAt ?? null,
        }
      : null,
    shortages,
    states,
    onTimeWeek: onTimeRate(weekRuns, now),
  };
}

export const owner = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireRole(ctx, ["owner"]);
    const now = Date.now();
    const t = await thresholdsOf(ctx, actor);
    const venues = (
      await ctx.db
        .query("venues")
        .withIndex("by_company", (q) => q.eq("companyId", actor.companyId))
        .collect()
    ).filter((v) => v.active);
    const cards = [];
    for (const venue of venues) cards.push(await venueCard(ctx, venue, t, now));
    const rated = cards.filter((c) => c.onTimeWeek !== null);
    return {
      venues: cards,
      totals: {
        netSalesCents: cards.reduce((n, c) => n + (c.lastClose?.netSalesCents ?? 0), 0),
        coversCount: cards.reduce((n, c) => n + (c.lastClose?.coversCount ?? 0), 0),
        lostCostCents: cards.reduce((n, c) => n + c.shortages.lostCostCents, 0),
        review: cards.reduce((n, c) => n + c.states.review, 0),
        followUp: cards.reduce((n, c) => n + c.states.follow_up, 0),
        onTimeWeek: rated.length ? Math.round(rated.reduce((n, c) => n + c.onTimeWeek!, 0) / rated.length) : null,
        exceptions: cards.filter((c) => c.status === "overdue" || c.status === "auto_closed" || c.lastClose?.flagged || c.shortages.items > 0).length,
      },
    };
  },
});

export const venue = query({
  args: { venueId: v.id("venues") },
  handler: async (ctx, { venueId }) => {
    const actor = await requireRole(ctx, ["owner"]);
    const venue = await ctx.db.get(venueId);
    if (!venue || venue.companyId !== actor.companyId) throw appError("NOT_FOUND");
    const now = Date.now();
    const t = await thresholdsOf(ctx, actor);
    const card = await venueCard(ctx, venue, t, now);
    const reports = await ctx.db
      .query("closeReports")
      .withIndex("by_venue_submitted", (q) => q.eq("venueId", venueId).gt("submittedAt", 0))
      .order("desc")
      .take(14);
    const closes = [];
    for (const r of reports) {
      const shift = await ctx.db.get(r.shiftId);
      if (!shift) continue;
      const summary = (r.summary ?? null) as CloseSummary | null;
      const by = r.submittedBy ? await ctx.db.get(r.submittedBy) : null;
      closes.push({
        shiftId: shift._id,
        date: shift.date,
        service: shift.service,
        status: r.status,
        autoClosed: !!shift.autoClosedAt,
        reviewed: !!shift.reviewedAt,
        coversCount: r.coversCount,
        netSalesCents: r.netSalesCents,
        compsCents: r.compsCents,
        voidsCents: r.voidsCents,
        flagged: !!summary?.flagged,
        compsDiffCents: summary?.compsDiffCents ?? 0,
        voidsDiffCents: summary?.voidsDiffCents ?? 0,
        shortages: summary?.shortages ?? { items: 0, lostCostCents: 0 },
        lateRuns: summary?.runs.late ?? 0,
        incidents: r.incidents.length,
        incidentTexts: r.incidents.map((i) => i.text),
        nextShiftNotes: r.nextShiftNotes,
        submittedBy: by?.name ?? null,
        submittedAt: r.submittedAt ?? null,
      });
    }
    return { venue: { id: venue._id, name: venue.name, address: venue.address ?? null, services: venue.services }, card, closes };
  },
});
