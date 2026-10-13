// Manager close report (ADR 0008, BLUEPRINT 2.2, 3.4): figures typed from the POS end-of-day report, incidents,
// notes, and the auto parts (runs, bar shortages, approved voids and comps, warnings tonight). Submit closes the
// shift and makes runs, counts and the report read-only.
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireRole } from "./lib/auth";
import { appError } from "./lib/errors";
import { audit } from "./lib/audit";
import { getShift } from "./lib/shift";
import { shiftStock } from "./lib/stockReport";
import { parseOrThrow } from "./lib/validate";
import { closeInput } from "../schemas";
import { closeSummary, openRuns } from "../lib/domain/close";
import { isComplete, isLate } from "../lib/domain/tasks";

async function reportOf(ctx: QueryCtx, shiftId: Id<"shifts">) {
  return await ctx.db
    .query("closeReports")
    .withIndex("by_shift", (q) => q.eq("shiftId", shiftId))
    .unique();
}

/** Everything the close computes on its own, plus the figures saved so far. */
async function autoParts(ctx: QueryCtx, shift: Doc<"shifts">) {
  const runs = await ctx.db
    .query("taskRuns")
    .withIndex("by_shift", (q) => q.eq("shiftId", shift._id))
    .collect();
  const stock = await shiftStock(ctx, shift);
  const approvals = (
    await ctx.db
      .query("requests")
      .withIndex("by_shift_status", (q) => q.eq("shiftId", shift._id).eq("status", "approved"))
      .collect()
  ).filter((r) => r.kind === "void" || r.kind === "comp");
  const since = shift.openedAt ?? shift.startsAt;
  const warnings = (
    await ctx.db
      .query("warnings")
      .withIndex("by_venue_at", (q) => q.eq("venueId", shift.venueId).gte("at", since))
      .collect()
  ).filter((w) => !w.voidedAt && (!shift.closedAt || w.at <= shift.closedAt));
  return { runs, stock, approvals, warnings };
}

function summarize(parts: Awaited<ReturnType<typeof autoParts>>, report: { coversCount: number; netSalesCents: number; compsCents: number; voidsCents: number }, now: number) {
  return closeSummary({
    runs: parts.runs,
    shortages: { items: parts.stock.totals.shortItems, lostCostCents: parts.stock.totals.lostCostCents },
    warnings: parts.warnings.length,
    approvals: parts.approvals.map((a) => ({ kind: a.kind as "void" | "comp", amountCents: a.amountCents ?? 0 })),
    report,
    now,
  });
}

const EMPTY = { coversCount: 0, netSalesCents: 0, compsCents: 0, voidsCents: 0, incidents: [] as Array<{ text: string; photoId?: Id<"_storage"> }>, staffNotes: "", nextShiftNotes: "" };

/** Prefilled draft (manager of the venue, owner). */
export const draft = query({
  args: { shiftId: v.id("shifts") },
  handler: async (ctx, { shiftId }) => {
    const actor = await requireRole(ctx, ["manager"]);
    const shift = await getShift(ctx, actor, shiftId);
    const report = await reportOf(ctx, shift._id);
    const parts = await autoParts(ctx, shift);
    const now = Date.now();
    const figures = report ?? EMPTY;
    const people = new Map<string, string>();
    for (const r of parts.runs) {
      if (!people.has(r.userId)) people.set(r.userId, (await ctx.db.get(r.userId))?.name ?? "");
    }
    const approvals = [];
    for (const a of parts.approvals) {
      const by = await ctx.db.get(a.createdBy);
      approvals.push({ _id: a._id, kind: a.kind, table: a.table ?? null, item: a.item ?? null, amountCents: a.amountCents ?? 0, reason: a.reason ?? null, by: by?.name ?? "", at: a.at });
    }
    const pendingRuns = openRuns(parts.runs).map((r) => ({ _id: r._id, phase: r.phase, name: people.get(r.userId) ?? "", late: isLate(r, now), done: r.items.filter((i) => i.done).length, total: r.items.length }));
    return {
      shift,
      report: report ?? null,
      figures: {
        coversCount: figures.coversCount,
        netSalesCents: figures.netSalesCents,
        compsCents: figures.compsCents,
        voidsCents: figures.voidsCents,
        incidents: figures.incidents,
        staffNotes: figures.staffNotes,
        nextShiftNotes: figures.nextShiftNotes,
      },
      summary: summarize(parts, figures, now),
      pendingRuns,
      shortages: parts.stock.rows.filter((r) => r.status === "short").map((r) => ({ itemId: r.itemId, name: r.name, difference: r.difference ?? 0, lostCostCents: r.lostCostCents })),
      missingCounts: parts.stock.items.length ? parts.stock.missingClose.length : 0,
      approvals,
      warnings: parts.warnings.length,
      readOnly: shift.status === "closed",
    };
  },
});

export const save = mutation({
  args: {
    shiftId: v.id("shifts"),
    coversCount: v.number(),
    netSalesCents: v.number(),
    compsCents: v.number(),
    voidsCents: v.number(),
    incidents: v.array(v.object({ text: v.string(), photoId: v.optional(v.id("_storage")) })),
    staffNotes: v.string(),
    nextShiftNotes: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, ["manager"]);
    const p = parseOrThrow(closeInput, args);
    const shift = await getShift(ctx, actor, args.shiftId);
    if (shift.status === "closed" || shift.status === "scheduled") throw appError("INVALID_TRANSITION");
    const existing = await reportOf(ctx, shift._id);
    if (existing && existing.status !== "draft") throw appError("INVALID_TRANSITION");
    const doc = {
      coversCount: p.coversCount,
      netSalesCents: p.netSalesCents,
      compsCents: p.compsCents,
      voidsCents: p.voidsCents,
      incidents: p.incidents.map((i) => ({ text: i.text, photoId: i.photoId as Id<"_storage"> | undefined })),
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
    const actor = await requireRole(ctx, ["manager"]);
    const shift = await getShift(ctx, actor, shiftId);
    if (shift.status !== "closing") throw appError("INVALID_TRANSITION");
    const parts = await autoParts(ctx, shift);
    const blocking = openRuns(parts.runs);
    if (blocking.length) throw appError("RUNS_OPEN", undefined, { count: blocking.length });
    if (parts.stock.items.length && parts.stock.missingClose.length) throw appError("MISSING_COUNTS", undefined, { count: parts.stock.missingClose.length });
    const existing = await reportOf(ctx, shift._id);
    if (existing && existing.status !== "draft") throw appError("INVALID_TRANSITION");
    const now = Date.now();
    const figures = existing ?? EMPTY;
    const summary = summarize(parts, figures, now);
    if (existing) await ctx.db.patch(existing._id, { summary, status: "submitted", submittedBy: actor._id, submittedAt: now, updatedAt: now });
    else await ctx.db.insert("closeReports", { ...EMPTY, shiftId: shift._id, venueId: shift.venueId, summary, status: "submitted", submittedBy: actor._id, submittedAt: now, updatedAt: now });
    await ctx.db.patch(shift._id, { status: "closed", closedAt: now, closedBy: actor._id });
    for (const r of parts.runs) {
      if (!r.late && !r.excused && isComplete(r) && r.completedAt && r.completedAt > r.dueAt) await ctx.db.patch(r._id, { late: true });
    }
    for (const n of await ctx.db
      .query("tableNotes")
      .withIndex("by_shift", (q) => q.eq("shiftId", shift._id))
      .collect())
      if (!n.archivedAt) await ctx.db.patch(n._id, { archivedAt: now });
    await audit(ctx, { actorId: actor._id, venueId: shift.venueId, action: "close.submitted", entity: "shifts", entityId: shift._id, meta: { flagged: summary.flagged } });
    await audit(ctx, { actorId: actor._id, venueId: shift.venueId, action: "shift.closed", entity: "shifts", entityId: shift._id });
    await ctx.db.insert("analyticsEvents", { name: "close_submitted", userId: actor._id, venueId: shift.venueId, at: now });
    return { summary };
  },
});

export const get = query({
  args: { shiftId: v.id("shifts") },
  handler: async (ctx, { shiftId }) => {
    const actor = await requireRole(ctx, ["manager"]);
    const shift = await getShift(ctx, actor, shiftId);
    const report = await reportOf(ctx, shift._id);
    const by = report?.submittedBy ? await ctx.db.get(report.submittedBy) : null;
    return { shift, report, submittedByName: by?.name ?? null };
  },
});

/** Closed shifts of a venue with their reports, newest first. */
export const list = query({
  args: { venueId: v.id("venues"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, ["manager"]);
    if (actor.role !== "owner" && actor.role !== "dev" && !actor.venueIds.includes(args.venueId)) throw appError("VENUE_FORBIDDEN");
    const reports = await ctx.db
      .query("closeReports")
      .withIndex("by_venue_submitted", (q) => q.eq("venueId", args.venueId).gt("submittedAt", 0))
      .order("desc")
      .take(Math.min(args.limit ?? 14, 60));
    const out = [];
    for (const r of reports) {
      const shift = await ctx.db.get(r.shiftId);
      if (!shift) continue;
      out.push({ report: r, shift });
    }
    return out;
  },
});
