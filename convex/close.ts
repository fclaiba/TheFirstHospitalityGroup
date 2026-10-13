// Manager close (ADR 0008, amended by 0018; BLUEPRINT 2.6, 3.4): incidents, attendance, side work still open, open
// shortages, 86s of the service, cleaning status, staff notes and notes for the next shift. No money. Submitting
// closes the shift, makes it read-only, archives the service items and sends the close to the GM and director.
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireCan, requireVenue } from "./lib/auth";
import { appError } from "./lib/errors";
import { audit } from "./lib/audit";
import { enqueue } from "./lib/notify";
import { corporateOf, getShift, venueManagers } from "./lib/shift";
import { nameOf } from "./lib/service";
import { parseOrThrow } from "./lib/validate";
import { expireServiceItems } from "./shifts";
import { closeInput } from "../schemas";
import { closeSummary, openRuns } from "../lib/domain/close";
import { isComplete, isLate } from "../lib/domain/tasks";
import type { Attendance, Cleaning } from "../lib/domain/types";

async function reportOf(ctx: QueryCtx, shiftId: Id<"shifts">) {
  return await ctx.db
    .query("closeReports")
    .withIndex("by_shift", (q) => q.eq("shiftId", shiftId))
    .unique();
}

/** What the close gathers on its own. */
async function autoParts(ctx: QueryCtx, shift: Doc<"shifts">) {
  const runs = await ctx.db
    .query("taskRuns")
    .withIndex("by_shift", (q) => q.eq("shiftId", shift._id))
    .collect();
  const attendance: Array<{ userId: Id<"users">; name: string; position: string; status: Attendance; minutes: number | null }> = [];
  for (const p of await ctx.db
    .query("shiftsPlanned")
    .withIndex("by_venue_date", (q) => q.eq("venueId", shift.venueId).eq("date", shift.date))
    .collect()) {
    if (!p.attendance || !p.userId || p.removed) continue;
    attendance.push({ userId: p.userId, name: (await nameOf(ctx, p.userId)) ?? "", position: p.position, status: p.attendance.status, minutes: p.attendance.minutes ?? null });
  }
  const shortages = await ctx.db
    .query("shortages")
    .withIndex("by_venue_status", (q) => q.eq("venueId", shift.venueId).eq("status", "open"))
    .collect();
  const eightySix = await ctx.db
    .query("eightySix")
    .withIndex("by_shift", (q) => q.eq("shiftId", shift._id))
    .collect();
  const since = shift.openedAt ?? shift.startsAt;
  const warnings = (
    await ctx.db
      .query("warnings")
      .withIndex("by_venue_at", (q) => q.eq("venueId", shift.venueId).gte("at", since))
      .collect()
  ).filter((w) => !w.voidedAt && (!shift.closedAt || w.at <= shift.closedAt));
  return { runs, attendance, shortages, eightySix, warnings };
}

function summarize(parts: Awaited<ReturnType<typeof autoParts>>, report: { incidents: unknown[]; cleaning: Cleaning }, now: number) {
  return closeSummary({
    runs: parts.runs,
    attendance: parts.attendance,
    shortages: parts.shortages,
    eightySixes: parts.eightySix.length,
    warnings: parts.warnings.length,
    incidents: report.incidents.length,
    cleaning: report.cleaning,
    now,
  });
}

const EMPTY = { incidents: [] as Array<{ text: string; photoId?: Id<"_storage"> }>, openItems: [] as string[], cleaning: "done" as Cleaning, staffNotes: "", nextShiftNotes: "" };

/** Prefilled draft (manager on duty; leads and corporate read). */
export const draft = query({
  args: { shiftId: v.id("shifts") },
  handler: async (ctx, { shiftId }) => {
    const actor = await requireCan(ctx, "close.read");
    const shift = await getShift(ctx, actor, shiftId);
    const report = await reportOf(ctx, shift._id);
    const parts = await autoParts(ctx, shift);
    const now = Date.now();
    const content = report ?? EMPTY;
    const names = new Map<string, string>();
    for (const r of parts.runs) if (!names.has(r.userId)) names.set(r.userId, (await nameOf(ctx, r.userId)) ?? "");
    const pendingRuns = openRuns(parts.runs).map((r) => ({ _id: r._id, phase: r.phase, name: names.get(r.userId) ?? "", position: r.position, late: isLate(r, now), done: r.items.filter((i) => i.done).length, total: r.items.length }));
    const shortages = [];
    for (const s of parts.shortages) shortages.push({ _id: s._id, itemName: (await ctx.db.get(s.itemId))?.name ?? "", level: s.level, carriedOver: s.shiftId !== shift._id });
    const eightySix = [];
    for (const e of parts.eightySix) eightySix.push({ itemId: e.itemId, name: (await ctx.db.get(e.itemId))?.name ?? { en: "", es: "" }, note: e.note ?? null });
    return {
      shift,
      report: report ?? null,
      content: { incidents: content.incidents, openItems: content.openItems, cleaning: content.cleaning, staffNotes: content.staffNotes, nextShiftNotes: content.nextShiftNotes },
      summary: summarize(parts, content, now),
      pendingRuns,
      attendance: parts.attendance,
      shortages,
      eightySix,
      warnings: parts.warnings.length,
      readOnly: shift.status === "closed" || (!!report && report.status !== "draft"),
      canFile: shift.status === "closing" && (!report || report.status === "draft"),
    };
  },
});

export const save = mutation({
  args: {
    shiftId: v.id("shifts"),
    incidents: v.array(v.object({ text: v.string(), photoId: v.optional(v.id("_storage")) })),
    openItems: v.array(v.string()),
    cleaning: v.string(),
    staffNotes: v.string(),
    nextShiftNotes: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "close.file");
    const p = parseOrThrow(closeInput, args);
    const shift = await getShift(ctx, actor, args.shiftId);
    if (shift.status === "closed" || shift.status === "scheduled") throw appError("INVALID_TRANSITION");
    const existing = await reportOf(ctx, shift._id);
    if (existing && existing.status !== "draft") throw appError("INVALID_TRANSITION");
    const doc = {
      incidents: p.incidents.map((i) => ({ text: i.text, photoId: i.photoId as Id<"_storage"> | undefined })),
      openItems: p.openItems,
      cleaning: p.cleaning,
      staffNotes: p.staffNotes,
      nextShiftNotes: p.nextShiftNotes,
      updatedAt: Date.now(),
    };
    for (const i of doc.incidents) {
      if (!i.photoId) continue;
      const f = await ctx.db
        .query("files")
        .withIndex("by_storage", (q) => q.eq("storageId", i.photoId!))
        .unique();
      if (f && !f.attachedTo) await ctx.db.patch(f._id, { attachedTo: `closeReports:${shift._id}` });
    }
    if (existing) await ctx.db.patch(existing._id, doc);
    else await ctx.db.insert("closeReports", { ...doc, shiftId: shift._id, venueId: shift.venueId, status: "draft" });
    return { ok: true };
  },
});

export const submit = mutation({
  args: { shiftId: v.id("shifts") },
  handler: async (ctx, { shiftId }) => {
    const actor = await requireCan(ctx, "close.file");
    const shift = await getShift(ctx, actor, shiftId);
    if (shift.status !== "closing") throw appError("INVALID_TRANSITION");
    const existing = await reportOf(ctx, shift._id);
    if (existing && existing.status !== "draft") throw appError("INVALID_TRANSITION");
    const parts = await autoParts(ctx, shift);
    const blocking = openRuns(parts.runs);
    if (blocking.length) throw appError("RUNS_OPEN", undefined, { count: blocking.length });
    const now = Date.now();
    const content = existing ?? EMPTY;
    const summary = summarize(parts, content, now);
    if (existing) await ctx.db.patch(existing._id, { summary, status: "submitted", submittedBy: actor._id, submittedAt: now, updatedAt: now });
    else await ctx.db.insert("closeReports", { ...EMPTY, shiftId: shift._id, venueId: shift.venueId, summary, status: "submitted", submittedBy: actor._id, submittedAt: now, updatedAt: now });
    await ctx.db.patch(shift._id, { status: "closed", closedAt: now, closedBy: actor._id });
    for (const r of parts.runs) {
      if (!r.late && !r.excused && isComplete(r) && r.completedAt && r.completedAt > r.dueAt) await ctx.db.patch(r._id, { late: true });
    }
    await expireServiceItems(ctx, shift, now);
    await audit(ctx, { actorId: actor._id, venueId: shift.venueId, action: "close.submitted", entity: "shifts", entityId: shift._id });
    await audit(ctx, { actorId: actor._id, venueId: shift.venueId, action: "shift.closed", entity: "shifts", entityId: shift._id });
    await ctx.db.insert("analyticsEvents", { name: "close_submitted", userId: actor._id, venueId: shift.venueId, at: now });
    const venue = await ctx.db.get(shift.venueId);
    const leaders = [...(await venueManagers(ctx, shift.venueId, ["gm"])), ...(venue ? await corporateOf(ctx, venue.companyId, ["director"]) : [])].map((u) => u._id).filter((id) => id !== actor._id);
    await enqueue(ctx, leaders, { topic: "shift", key: "closeFiled", vars: { venue: venue?.name ?? "" }, url: `/manage/close?shift=${shift._id}` });
    return { summary };
  },
});

export const get = query({
  args: { shiftId: v.id("shifts") },
  handler: async (ctx, { shiftId }) => {
    const actor = await requireCan(ctx, "close.read");
    const shift = await getShift(ctx, actor, shiftId);
    const report = await reportOf(ctx, shift._id);
    return { shift, report, submittedByName: await nameOf(ctx, report?.submittedBy) };
  },
});

/** Filed closes of a venue, newest first (GM, director, owner; leads read). */
export const list = query({
  args: { venueId: v.id("venues"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "close.read");
    requireVenue(actor, args.venueId);
    const reports = await ctx.db
      .query("closeReports")
      .withIndex("by_venue_submitted", (q) => q.eq("venueId", args.venueId).gt("submittedAt", 0))
      .order("desc")
      .take(Math.min(args.limit ?? 14, 60));
    const out = [];
    for (const r of reports) {
      const shift = await ctx.db.get(r.shiftId);
      if (!shift) continue;
      out.push({ report: r, shift, submittedByName: await nameOf(ctx, r.submittedBy) });
    }
    return out;
  },
});
