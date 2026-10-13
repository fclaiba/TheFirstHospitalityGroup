// Today, the home of every position (BLUEPRINT 2.6 "Today"): one query with everything the screen shows, bounded by
// venue and person. Things waiting for my confirmation come first (ADR 0022). States and progress bars only: no
// percentages, no money (ADR 0018, 0027).
import { v } from "convex/values";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { actorCan, requireUser, pickVenue } from "./lib/auth";
import type { Actor } from "./lib/auth";
import { appError } from "./lib/errors";
import { liveShiftOf } from "./lib/shift";
import { asPlan, live86s, nameOf, pendingRuleSets, planOf } from "./lib/service";
import { runProgress } from "../lib/domain/tasks";
import { currentService, runsOn, serviceWindow } from "../lib/domain/shift";
import { pendingAcks } from "../lib/domain/menu";
import { needsConfirm, weekOf } from "../lib/domain/schedule";
import { isOpenStatus } from "../lib/domain/requests";
import { areaOf } from "../lib/domain/positions";
import { addDays, nyDateKey } from "../lib/time";
import type { MenuKind, Service } from "../lib/domain/types";

/** The menu kinds an area hears 86s for. */
function kindsFor(area: string): MenuKind[] {
  if (area === "bar") return ["drink", "wine"];
  if (area === "kitchen") return ["food"];
  return ["food", "drink", "wine"];
}

async function scheduleToConfirm(ctx: QueryCtx, actor: Actor, venueId: Id<"venues">, today: string) {
  const out: Array<{ weekId: Id<"scheduleWeeks">; weekStart: string; version: number }> = [];
  for (const weekStart of [weekOf(today), addDays(weekOf(today), 7)]) {
    const week = await ctx.db
      .query("scheduleWeeks")
      .withIndex("by_venue_week", (q) => q.eq("venueId", venueId).eq("weekStart", weekStart))
      .unique();
    if (!week || week.status !== "published") continue;
    const shifts = (
      await ctx.db
        .query("shiftsPlanned")
        .withIndex("by_week", (q) => q.eq("weekId", week._id))
        .collect()
    ).map((s) => ({ ...s, userId: s.userId as string | undefined, eventId: s.eventId as string | undefined }));
    const acks = (
      await ctx.db
        .query("scheduleAcks")
        .withIndex("by_week_user", (q) => q.eq("weekId", week._id).eq("userId", actor._id))
        .collect()
    ).map((a) => ({ userId: a.userId as string, version: a.version }));
    if (needsConfirm(actor._id, week, shifts, acks)) out.push({ weekId: week._id, weekStart, version: week.version });
  }
  return out;
}

async function tipPolicyPending(ctx: QueryCtx, actor: Actor, venueId: Id<"venues">): Promise<Id<"tipPolicies"> | null> {
  const policy = await ctx.db
    .query("tipPolicies")
    .withIndex("by_venue", (q) => q.eq("venueId", venueId))
    .order("desc")
    .first();
  if (!policy || !policy.participants.some((p) => p.position === actor.primaryPosition || actor.enabledPositions.includes(p.position))) return null;
  const acks = await ctx.db
    .query("tipPolicyAcks")
    .withIndex("by_user_policy", (q) => q.eq("userId", actor._id).eq("policyId", policy._id))
    .collect();
  return acks.some((a) => a.version >= policy.version) ? null : policy._id;
}

export const summary = query({
  args: { venueId: v.optional(v.id("venues")) },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const venueId = pickVenue(actor, args.venueId);
    const venue = await ctx.db.get(venueId);
    if (!venue) throw appError("NOT_FOUND");
    const now = Date.now();
    const today = nyDateKey(now);
    const shift = await liveShiftOf(ctx, venueId);

    // What comes next when nothing is open.
    let nextService: Service | null = currentService(venue.services, today, now);
    let nextDate = today;
    for (let d = 1; !nextService && d <= 7; d++) {
      nextDate = addDays(today, d);
      nextService = venue.services.filter((s) => runsOn(s, nextDate)).sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0]?.key ?? null;
    }
    const window = nextService ? serviceWindow(venue.services, nextDate, nextService) : null;

    // My planned shift today, with my area, section and lead.
    const planned = (
      await ctx.db
        .query("shiftsPlanned")
        .withIndex("by_user_date", (q) => q.eq("userId", actor._id).eq("date", today))
        .collect()
    ).filter((s) => s.venueId === venueId && !s.removed);
    const blocks = planned.sort((a, b) => a.start.localeCompare(b.start)).map((s) => ({ _id: s._id, position: s.position, start: s.start, end: s.end ?? null, untilClose: s.untilClose, eventId: s.eventId ?? null }));
    let section: { names: string[]; lead: string | null } | null = null;
    if (shift) {
      const assignments = (
        await ctx.db
          .query("sectionAssignments")
          .withIndex("by_shift", (q) => q.eq("shiftId", shift._id))
          .collect()
      ).filter((a) => a.userIds.includes(actor._id) || a.leadId === actor._id);
      if (assignments.length) {
        const plan = asPlan(await planOf(ctx, venueId));
        section = {
          names: assignments.map((a) => plan.sections.find((s) => s.id === a.sectionId)?.name ?? a.sectionId),
          lead: await nameOf(ctx, assignments.find((a) => a.leadId && a.leadId !== actor._id)?.leadId),
        };
      }
    }

    // Waiting for my confirmation (first on the screen).
    const schedule = await scheduleToConfirm(ctx, actor, venueId, today);
    const items = await ctx.db
      .query("menuItems")
      .withIndex("by_company_status", (q) => q.eq("companyId", actor.companyId).eq("status", "published"))
      .collect();
    const acks = (
      await ctx.db
        .query("menuAcks")
        .withIndex("by_user_item", (q) => q.eq("userId", actor._id))
        .collect()
    ).map((a) => ({ itemId: a.itemId as string, version: a.version }));
    const menu = pendingAcks(items, acks, actor.position).length;
    const rules = (await pendingRuleSets(ctx, actor, venueId)).length;
    const reads = await ctx.db
      .query("messageReads")
      .withIndex("by_user", (q) => q.eq("userId", actor._id))
      .order("desc")
      .take(100);
    const announcementsToConfirm: Array<{ _id: Id<"messages">; title: Doc<"messages">["title"]; at: number }> = [];
    const unread: Array<{ _id: Id<"messages">; title: Doc<"messages">["title"]; at: number; requiresConfirmation: boolean }> = [];
    for (const r of reads) {
      if (r.confirmedAt && r.readAt) continue;
      const m = await ctx.db.get(r.messageId);
      if (!m) continue;
      if (m.requiresConfirmation && !r.confirmedAt) announcementsToConfirm.push({ _id: m._id, title: m.title, at: m.at });
      else if (!r.readAt && unread.length < 3) unread.push({ _id: m._id, title: m.title, at: m.at, requiresConfirmation: m.requiresConfirmation });
    }
    const warnings = (
      await ctx.db
        .query("warnings")
        .withIndex("by_user_at", (q) => q.eq("userId", actor._id))
        .order("desc")
        .take(50)
    ).filter((w) => !w.acknowledgedAt && !w.voidedAt).length;
    const tipPolicy = await tipPolicyPending(ctx, actor, venueId);

    // Pre-shift notes and 86s for my area during a live shift.
    const preshift = [];
    const eightySix = [];
    if (shift) {
      for (const n of (
        await ctx.db
          .query("preShiftNotes")
          .withIndex("by_shift", (q) => q.eq("shiftId", shift._id))
          .collect()
      ).sort((a, b) => a.at - b.at))
        preshift.push({ _id: n._id, text: n.text, at: n.at, byName: (await nameOf(ctx, n.by)) ?? "" });
      const kinds = kindsFor(areaOf(actor.position));
      for (const e of await live86s(ctx, shift._id)) {
        const item = await ctx.db.get(e.itemId);
        if (item && kinds.includes(item.kind)) eightySix.push({ itemId: item._id, name: item.name, kind: item.kind, note: e.note ?? null });
      }
    }

    // My side work: the next item and a progress bar (done of total, never a percentage).
    const sideWork = [];
    if (shift) {
      const mine = await ctx.db
        .query("taskRuns")
        .withIndex("by_user_shift", (q) => q.eq("userId", actor._id).eq("shiftId", shift._id))
        .collect();
      for (const r of mine.sort((a, b) => a.dueAt - b.dueAt)) {
        const template = await ctx.db.get(r.templateId);
        const p = runProgress(r);
        const i = r.items.findIndex((x) => !x.done);
        sideWork.push({ _id: r._id, phase: r.phase, title: template?.title ?? { en: "", es: "" }, done: p.done, total: p.total, dueAt: r.dueAt, next: i === -1 ? null : (template?.items[r.itemIndexes[i]!]?.label ?? null) });
      }
    }

    // Today's event at the venue.
    const events = [];
    for (const e of await ctx.db
      .query("venueEvents")
      .withIndex("by_venue_date", (q) => q.eq("venueId", venueId).eq("date", today))
      .collect())
      events.push({ _id: e._id, kind: e.kind, name: e.name, start: e.start, end: e.end, mine: blocks.some((b) => b.eventId === e._id) });

    // What leaders act on, as counts in words.
    let leader: { requestsOpen: number; proposalsWaiting: number; shortagesOpen: number } | null = null;
    if (actorCan(actor, "requests.queue") || actorCan(actor, "warnings.issue")) {
      let requestsOpen = 0;
      if (shift)
        for (const status of ["open", "claimed"] as const)
          requestsOpen += (
            await ctx.db
              .query("requests")
              .withIndex("by_shift_status", (q) => q.eq("shiftId", shift._id).eq("status", status))
              .collect()
          ).filter((r) => isOpenStatus(r.status)).length;
      const proposalsWaiting = actorCan(actor, "warnings.issue")
        ? (
            await ctx.db
              .query("warningProposals")
              .withIndex("by_venue_status", (q) => q.eq("venueId", venueId).eq("status", "open"))
              .collect()
          ).length
        : 0;
      const shortagesOpen = (
        await ctx.db
          .query("shortages")
          .withIndex("by_venue_status", (q) => q.eq("venueId", venueId).eq("status", "open"))
          .collect()
      ).length;
      leader = { requestsOpen, proposalsWaiting, shortagesOpen };
    }

    const lastClose = await ctx.db
      .query("closeReports")
      .withIndex("by_venue_submitted", (q) => q.eq("venueId", venueId).gt("submittedAt", 0))
      .order("desc")
      .first();

    return {
      venue: { id: venue._id, name: venue.name, reservationsUrl: venue.reservationsUrl ?? null },
      me: { name: actor.name, position: actor.position, area: areaOf(actor.position) },
      shift: shift ? { _id: shift._id, status: shift.status, service: shift.service, date: shift.date, startsAt: shift.startsAt, endsAt: shift.endsAt, notes: shift.notes ?? null } : null,
      next: nextService ? { date: nextDate, service: nextService, startsAt: window?.startsAt ?? null } : null,
      myShift: blocks.length ? { blocks, double: blocks.length > 1, section } : null,
      confirm: { schedule, menu, rules, announcements: announcementsToConfirm, warnings, tipPolicy },
      pendingTotal: schedule.length + (menu ? 1 : 0) + (rules ? 1 : 0) + announcementsToConfirm.length + (warnings ? 1 : 0) + (tipPolicy ? 1 : 0),
      preshift,
      eightySix,
      sideWork,
      unread,
      events,
      leader,
      fromLastClose: lastClose?.nextShiftNotes?.trim() ? lastClose.nextShiftNotes : null,
    };
  },
});
