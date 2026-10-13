// Shift lifecycle (ADR 0008): scheduled → open → closing → closed. Opening creates the opening runs; starting the
// close creates the closing runs; close.submit closes it. The hourly sweep notifies at end + 4 h and auto-closes at
// end + 8 h, marked to review.
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireRole, requireUser, requireVenue } from "./lib/auth";
import { appError } from "./lib/errors";
import { audit } from "./lib/audit";
import { enqueue } from "./lib/notify";
import { createRuns, getShift, liveShiftOf, ownersOf, rosterOf } from "./lib/shift";
import { parseOrThrow } from "./lib/validate";
import { shiftOpenInput } from "../schemas";
import { currentService, serviceWindow, sweepAction, transition } from "../lib/domain/shift";
import { addDays, nyDateKey } from "../lib/time";
import type { Service } from "../lib/domain/types";

/** The live shift of a venue, or what comes next today, plus the last close notes for the next shift's Today. */
export const current = query({
  args: { venueId: v.id("venues") },
  handler: async (ctx, { venueId }) => {
    const actor = await requireUser(ctx);
    requireVenue(actor, venueId);
    const venue = await ctx.db.get(venueId);
    if (!venue) throw appError("NOT_FOUND");
    const now = Date.now();
    const live = await liveShiftOf(ctx, venueId);
    const today = nyDateKey(now);
    let nextService: Service | null = currentService(venue.services, today, now);
    let nextDate = today;
    if (!nextService) {
      nextDate = addDays(today, 1);
      nextService = venue.services[0]?.key ?? null;
    }
    const window = nextService ? serviceWindow(venue.services, nextDate, nextService) : null;
    const lastClose = await ctx.db
      .query("closeReports")
      .withIndex("by_venue_submitted", (q) => q.eq("venueId", venueId).gt("submittedAt", 0))
      .order("desc")
      .first();
    return {
      venue: { id: venue._id, name: venue.name, services: venue.services },
      shift: live,
      next: nextService ? { date: nextDate, service: nextService, startsAt: window?.startsAt ?? null, endsAt: window?.endsAt ?? null } : null,
      lastClose: lastClose ? { shiftId: lastClose.shiftId, nextShiftNotes: lastClose.nextShiftNotes, submittedAt: lastClose.submittedAt ?? null } : null,
    };
  },
});

export const get = query({
  args: { shiftId: v.id("shifts") },
  handler: async (ctx, { shiftId }) => {
    const actor = await requireUser(ctx);
    return await getShift(ctx, actor, shiftId);
  },
});

/** Recent shifts of a venue, newest first (manager, owner). */
export const list = query({
  args: { venueId: v.id("venues"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, ["manager"]);
    requireVenue(actor, args.venueId);
    return await ctx.db
      .query("shifts")
      .withIndex("by_venue_date", (q) => q.eq("venueId", args.venueId))
      .order("desc")
      .take(Math.min(args.limit ?? 20, 100));
  },
});

export const open = mutation({
  args: { venueId: v.id("venues"), service: v.string(), date: v.string(), notes: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, ["manager"]);
    const p = parseOrThrow(shiftOpenInput, args);
    requireVenue(actor, args.venueId);
    const venue = await ctx.db.get(args.venueId);
    if (!venue || !venue.active) throw appError("NOT_FOUND");
    const window = serviceWindow(venue.services, p.date, p.service);
    if (!window) throw appError("NOT_SCHEDULED");
    if (await liveShiftOf(ctx, venue._id)) throw appError("OTHER_SHIFT_OPEN");
    const same = (
      await ctx.db
        .query("shifts")
        .withIndex("by_venue_date", (q) => q.eq("venueId", venue._id).eq("date", p.date))
        .collect()
    ).find((s) => s.service === p.service);
    let shift: Doc<"shifts">;
    const now = Date.now();
    if (same) {
      if (transition(same.status, "open") === "INVALID_TRANSITION") throw appError("INVALID_TRANSITION");
      await ctx.db.patch(same._id, { status: "open", openedBy: actor._id, openedAt: now, notes: p.notes });
      shift = (await ctx.db.get(same._id))!;
    } else {
      const id = await ctx.db.insert("shifts", { venueId: venue._id, date: p.date, service: p.service, status: "open", ...window, openedBy: actor._id, openedAt: now, notes: p.notes });
      shift = (await ctx.db.get(id))!;
    }
    const runs = await createRuns(ctx, shift, "open");
    await audit(ctx, { actorId: actor._id, venueId: venue._id, action: "shift.opened", entity: "shifts", entityId: shift._id, meta: { service: p.service, date: p.date, runs } });
    const roster = await rosterOf(ctx, shift);
    await enqueue(
      ctx,
      roster.filter((u) => u._id !== actor._id).map((u) => u._id),
      { topic: "shift", key: "shiftOpen", vars: { venue: venue.name }, url: "/today" },
    );
    return { shiftId: shift._id, runs };
  },
});

export const startClosing = mutation({
  args: { shiftId: v.id("shifts") },
  handler: async (ctx, { shiftId }) => {
    const actor = await requireRole(ctx, ["manager"]);
    const shift = await getShift(ctx, actor, shiftId);
    if (transition(shift.status, "start_closing") === "INVALID_TRANSITION") throw appError("INVALID_TRANSITION");
    await ctx.db.patch(shift._id, { status: "closing", closingAt: Date.now() });
    const runs = await createRuns(ctx, { ...shift, status: "closing" }, "close");
    await audit(ctx, { actorId: actor._id, venueId: shift.venueId, action: "shift.closing", entity: "shifts", entityId: shift._id, meta: { runs } });
    return { runs };
  },
});

/** Owner marks an auto-closed shift as reviewed. */
export const review = mutation({
  args: { shiftId: v.id("shifts") },
  handler: async (ctx, { shiftId }) => {
    const actor = await requireRole(ctx, ["owner"]);
    const shift = await getShift(ctx, actor, shiftId);
    if (!shift.autoClosedAt) throw appError("INVALID_TRANSITION");
    await ctx.db.patch(shift._id, { reviewedAt: Date.now() });
    await audit(ctx, { actorId: actor._id, venueId: shift.venueId, action: "shift.reviewed", entity: "shifts", entityId: shift._id });
    return { ok: true };
  },
});

/** Auto-close (ADR 0008): runs, counts and report become read-only; the report is filed as "auto", to review. */
export async function autoClose(ctx: MutationCtx, shift: Doc<"shifts">, now: number) {
  await ctx.db.patch(shift._id, { status: "closed", closedAt: now, autoClosedAt: now });
  const existing = await ctx.db
    .query("closeReports")
    .withIndex("by_shift", (q) => q.eq("shiftId", shift._id))
    .unique();
  if (existing) await ctx.db.patch(existing._id, { status: "auto", submittedAt: now, updatedAt: now });
  else
    await ctx.db.insert("closeReports", {
      shiftId: shift._id,
      venueId: shift.venueId,
      coversCount: 0,
      netSalesCents: 0,
      compsCents: 0,
      voidsCents: 0,
      incidents: [],
      staffNotes: "",
      nextShiftNotes: "",
      status: "auto",
      submittedAt: now,
      updatedAt: now,
    });
  // Table notes archive at close (ADR 0016).
  for (const n of await ctx.db
    .query("tableNotes")
    .withIndex("by_shift", (q) => q.eq("shiftId", shift._id))
    .collect())
    if (!n.archivedAt) await ctx.db.patch(n._id, { archivedAt: now });
  await audit(ctx, { venueId: shift.venueId, action: "shift.auto_closed", entity: "shifts", entityId: shift._id });
}

/** Hourly (crons.ts). */
export const sweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let notified = 0;
    let closed = 0;
    for (const status of ["open", "closing"] as const) {
      for (const shift of await ctx.db
        .query("shifts")
        .withIndex("by_status", (q) => q.eq("status", status))
        .collect()) {
        const action = sweepAction(shift, now);
        if (!action) continue;
        const venue = await ctx.db.get(shift.venueId);
        if (!venue) continue;
        const managers = (await rosterOf(ctx, shift)).filter((u) => u.role === "manager").map((u) => u._id);
        const owners = (await ownersOf(ctx, venue.companyId)).map((u) => u._id);
        if (action === "notify") {
          await ctx.db.patch(shift._id, { sweepNotifiedAt: now });
          await enqueue(ctx, [...managers, ...owners], { topic: "shift", key: "shiftForgotten", vars: { venue: venue.name }, url: "/manage/close" });
          notified += 1;
        } else {
          await autoClose(ctx, shift, now);
          await enqueue(ctx, owners, { topic: "shift", key: "shiftAutoClosed", vars: { venue: venue.name }, url: `/owner/venues/${venue._id}` });
          closed += 1;
        }
      }
    }
    return { notified, closed };
  },
});

