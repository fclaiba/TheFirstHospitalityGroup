// The staff home (BLUEPRINT 2.2 "Today"): one query with everything the screen shows, bounded by venue and person.
import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUser, requireVenue } from "./lib/auth";
import { appError } from "./lib/errors";
import { liveShiftOf } from "./lib/shift";
import { runProgress } from "../lib/domain/tasks";
import { currentService, serviceWindow } from "../lib/domain/shift";
import { needsAck, setFor } from "../lib/domain/rules";
import { isOpenStatus } from "../lib/domain/requests";
import { addDays, nyDateKey } from "../lib/time";
import type { Service } from "../lib/domain/types";

export const summary = query({
  args: { venueId: v.id("venues") },
  handler: async (ctx, { venueId }) => {
    const actor = await requireUser(ctx);
    requireVenue(actor, venueId);
    const venue = await ctx.db.get(venueId);
    if (!venue) throw appError("NOT_FOUND");
    const now = Date.now();
    const shift = await liveShiftOf(ctx, venueId);

    // What comes next when nothing is open.
    const today = nyDateKey(now);
    let nextService: Service | null = currentService(venue.services, today, now);
    let nextDate = today;
    if (!nextService) {
      nextDate = addDays(today, 1);
      nextService = venue.services[0]?.key ?? null;
    }
    const window = nextService ? serviceWindow(venue.services, nextDate, nextService) : null;

    // Rules to confirm.
    const sets = (
      await ctx.db
        .query("ruleSets")
        .withIndex("by_role_venue", (q) => q.eq("role", actor.role))
        .collect()
    ).filter((s) => s.companyId === actor.companyId);
    const set = setFor(
      sets.map((s) => ({ ...s, venueId: s.venueId as string | undefined })),
      actor.role,
      venueId,
    );
    const acks = set
      ? await ctx.db
          .query("ruleAcks")
          .withIndex("by_user_set", (q) => q.eq("userId", actor._id).eq("setId", set._id as Id<"ruleSets">))
          .collect()
      : [];
    const rulesPending = needsAck(set, acks);

    // My runs in the live shift.
    const runs: Array<{ _id: Id<"taskRuns">; phase: Doc<"taskRuns">["phase"]; title: { en: string; es: string }; done: number; total: number; pct: number; dueAt: number; next: { en: string; es: string } | null }> = [];
    if (shift) {
      const mine = await ctx.db
        .query("taskRuns")
        .withIndex("by_user_shift", (q) => q.eq("userId", actor._id).eq("shiftId", shift._id))
        .collect();
      for (const r of mine.sort((a, b) => a.dueAt - b.dueAt)) {
        const template = await ctx.db.get(r.templateId);
        const p = runProgress(r);
        const i = r.items.findIndex((x) => !x.done);
        runs.push({
          _id: r._id,
          phase: r.phase,
          title: template?.title ?? { en: "", es: "" },
          done: p.done,
          total: p.total,
          pct: p.pct,
          dueAt: r.dueAt,
          next: i === -1 ? null : (template?.items[r.itemIndexes[i]!]?.label ?? null),
        });
      }
    }

    // Messages waiting for me.
    const reads = await ctx.db
      .query("messageReads")
      .withIndex("by_user", (q) => q.eq("userId", actor._id))
      .order("desc")
      .take(100);
    const unread = reads.filter((r) => !r.readAt);
    const latestUnread = [];
    for (const r of unread.slice(0, 2)) {
      const m = await ctx.db.get(r.messageId);
      if (m) latestUnread.push({ _id: m._id, title: m.title, at: m.at, requiresConfirmation: m.requiresConfirmation });
    }

    // Warnings waiting for my acknowledgment (never their content here).
    const warnings = await ctx.db
      .query("warnings")
      .withIndex("by_user_at", (q) => q.eq("userId", actor._id))
      .order("desc")
      .take(50);
    const pendingWarnings = warnings.filter((w) => !w.acknowledgedAt && !w.voidedAt).length;

    // Notes for the shift: the manager's, and what the last close left for this one.
    const lastClose = await ctx.db
      .query("closeReports")
      .withIndex("by_venue_submitted", (q) => q.eq("venueId", venueId).gt("submittedAt", 0))
      .order("desc")
      .first();

    // My section and its table notes.
    let section: { name: string; tables: string[]; lead: boolean; notes: Array<{ _id: Id<"tableNotes">; table: string; kind: Doc<"tableNotes">["kind"]; text: string; kitchenConfirmed: boolean; at: number }> } | null = null;
    let openRequests = 0;
    if (shift) {
      const assignments = await ctx.db
        .query("sectionAssignments")
        .withIndex("by_shift", (q) => q.eq("shiftId", shift._id))
        .collect();
      const a = assignments.find((x) => x.userIds.includes(actor._id));
      if (a) {
        const s = await ctx.db.get(a.sectionId);
        if (s) {
          const notes = (
            await ctx.db
              .query("tableNotes")
              .withIndex("by_shift", (q) => q.eq("shiftId", shift._id))
              .collect()
          )
            .filter((n) => !n.archivedAt && s.tables.includes(n.table))
            .sort((x, y) => y.at - x.at)
            .map((n) => ({ _id: n._id, table: n.table, kind: n.kind, text: n.text, kitchenConfirmed: !!n.kitchenConfirmedAt, at: n.at }));
          section = { name: s.name, tables: s.tables, lead: a.leadId === actor._id, notes };
        }
      }
      openRequests = (
        await ctx.db
          .query("requests")
          .withIndex("by_creator", (q) => q.eq("createdBy", actor._id))
          .order("desc")
          .take(40)
      ).filter((r) => r.shiftId === shift._id && isOpenStatus(r.status)).length;
    }

    return {
      venue: { id: venue._id, name: venue.name },
      shift: shift ? { _id: shift._id, status: shift.status, service: shift.service, date: shift.date, startsAt: shift.startsAt, endsAt: shift.endsAt } : null,
      next: nextService ? { date: nextDate, service: nextService, startsAt: window?.startsAt ?? null } : null,
      rulesPending,
      runs,
      unread: { count: unread.length, latest: latestUnread },
      pendingWarnings,
      notes: { shift: shift?.notes ?? null, fromLastClose: lastClose?.nextShiftNotes?.trim() ? lastClose.nextShiftNotes : null },
      section,
      openRequests,
    };
  },
});
