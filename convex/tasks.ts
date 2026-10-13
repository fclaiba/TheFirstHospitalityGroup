// Side work (BLUEPRINT 2.6, ADR 0015): templates per venue, positions, optional section and phase, with a weekly
// schedule and estimated minutes; runs per person and shift; live progress for leads and managers; late only for
// leaders (never shown to the person, ADR 0027); the side-work indicator for tipped positions (NY limit).
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireCan, requireVenue, pickVenue } from "./lib/auth";
import { appError } from "./lib/errors";
import { audit } from "./lib/audit";
import { enqueue } from "./lib/notify";
import { getShift, liveShiftOf, venueManagers } from "./lib/shift";
import { asPlan, attachFile, pendingRuleSets, planOf, sideWorkRows } from "./lib/service";
import { parseOrThrow } from "./lib/validate";
import { taskTemplateInput } from "../schemas";
import { canCheck, isComplete, isLate, runProgress } from "../lib/domain/tasks";
import { isLive } from "../lib/domain/shift";
import { areaOf } from "../lib/domain/positions";

async function withLabels(ctx: QueryCtx, run: Doc<"taskRuns">) {
  const template = await ctx.db.get(run.templateId);
  const items = run.items.map((it, i) => {
    const t = template?.items[run.itemIndexes[i]!];
    return { done: it.done, at: it.at ?? null, photoId: it.photoId ?? null, index: i, label: t?.label ?? { en: "", es: "" }, photoRequired: !!t?.photoRequired, critical: !!t?.critical };
  });
  const p = runProgress(run);
  return {
    _id: run._id,
    shiftId: run.shiftId,
    position: run.position,
    phase: run.phase,
    title: template?.title ?? { en: "", es: "" },
    dueAt: run.dueAt,
    completedAt: run.completedAt ?? null,
    excused: run.excused ? { reason: run.excused.reason, at: run.excused.at } : null,
    items,
    done: p.done,
    total: p.total,
  };
}

/** My side work in the live shift of a venue (or a given shift). Never says "late" to the person. */
export const myRuns = query({
  args: { venueId: v.optional(v.id("venues")), shiftId: v.optional(v.id("shifts")) },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "tasks.own");
    const shift = args.shiftId ? await getShift(ctx, actor, args.shiftId) : await liveShiftOf(ctx, pickVenue(actor, args.venueId));
    if (!shift) return { shift: null, runs: [], rulesPending: false };
    const runs = await ctx.db
      .query("taskRuns")
      .withIndex("by_user_shift", (q) => q.eq("userId", actor._id).eq("shiftId", shift._id))
      .collect();
    const out = [];
    for (const r of runs.sort((a, b) => a.dueAt - b.dueAt)) out.push(await withLabels(ctx, r));
    return {
      shift: { _id: shift._id, status: shift.status, service: shift.service, date: shift.date },
      runs: out,
      rulesPending: (await pendingRuleSets(ctx, actor, shift.venueId)).length > 0,
    };
  },
});

export const check = mutation({
  args: { runId: v.id("taskRuns"), itemIndex: v.number(), done: v.boolean(), photoId: v.optional(v.id("_storage")) },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "tasks.own");
    const run = await ctx.db.get(args.runId);
    if (!run) throw appError("NOT_FOUND");
    requireVenue(actor, run.venueId);
    if (run.userId !== actor._id) throw appError("FORBIDDEN");
    const shift = await ctx.db.get(run.shiftId);
    if (!shift || !isLive(shift.status)) throw appError("SHIFT_NOT_OPEN");
    if ((await pendingRuleSets(ctx, actor, run.venueId)).length) throw appError("RULES_NOT_ACKNOWLEDGED");
    const template = await ctx.db.get(run.templateId);
    const item = template?.items[run.itemIndexes[args.itemIndex] ?? -1];
    const problem = canCheck(run, args.itemIndex, item, args.done, args.photoId);
    if (problem) throw appError(problem);
    // Ticking an item that is already in that state changes nothing (two taps, two phones).
    if (run.items[args.itemIndex]!.done === args.done && !args.photoId) return { done: runProgress(run).done, total: run.items.length, complete: isComplete(run) };
    if (args.photoId) await attachFile(ctx, actor, args.photoId, `taskRuns:${run._id}`);
    const now = Date.now();
    const items = run.items.map((it, i) =>
      i === args.itemIndex ? { done: args.done, at: args.done ? now : undefined, by: args.done ? actor._id : undefined, photoId: args.photoId ?? it.photoId } : it,
    );
    const complete = isComplete({ items });
    await ctx.db.patch(run._id, { items, completedAt: complete ? (run.completedAt ?? now) : undefined, late: complete ? (run.completedAt ?? now) > run.dueAt : run.late });
    await ctx.db.insert("analyticsEvents", { name: "task_checked", userId: actor._id, venueId: run.venueId, at: now });
    const p = runProgress({ items });
    return { done: p.done, total: p.total, complete };
  },
});

export const excuse = mutation({
  args: { runId: v.id("taskRuns"), reason: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "tasks.excuse");
    const run = await ctx.db.get(args.runId);
    if (!run) throw appError("NOT_FOUND");
    requireVenue(actor, run.venueId);
    const shift = await ctx.db.get(run.shiftId);
    if (!shift || !isLive(shift.status)) throw appError("SHIFT_NOT_OPEN");
    const reason = args.reason.trim();
    if (!reason || reason.length > 200) throw appError("INVALID_INPUT", undefined, { fields: { reason: "required" } });
    await ctx.db.patch(run._id, { excused: { by: actor._id, reason, at: Date.now() }, late: false });
    await audit(ctx, { actorId: actor._id, venueId: run.venueId, action: "task.excused", entity: "taskRuns", entityId: run._id, meta: { reason } });
    return { ok: true };
  },
});

/** Live side work per person and area (leads, managers). States, not scores: done/total feeds a bar, late is a state. */
export const progress = query({
  args: { shiftId: v.id("shifts") },
  handler: async (ctx, { shiftId }) => {
    const actor = await requireCan(ctx, "tasks.progress");
    const shift = await getShift(ctx, actor, shiftId);
    const runs = await ctx.db
      .query("taskRuns")
      .withIndex("by_shift", (q) => q.eq("shiftId", shift._id))
      .collect();
    const now = Date.now();
    const byUser = new Map<string, Doc<"taskRuns">[]>();
    for (const r of runs) byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), r]);
    const people = [];
    for (const [userId, list] of byUser) {
      const user = await ctx.db.get(userId as Id<"users">);
      if (!user) continue;
      const detailed = [];
      for (const r of list.sort((a, b) => a.dueAt - b.dueAt)) detailed.push({ ...(await withLabels(ctx, r)), late: isLate(r, now) });
      const done = list.reduce((n, r) => n + runProgress(r).done, 0);
      const total = list.reduce((n, r) => n + runProgress(r).total, 0);
      const position = list[0]!.position;
      const late = list.some((r) => isLate(r, now));
      people.push({ userId, name: user.name, position, area: areaOf(position), done, total, state: late ? "late" : done === total ? "done" : "on_time", runs: detailed });
    }
    people.sort((a, b) => Number(b.state === "late") - Number(a.state === "late") || a.done / (a.total || 1) - b.done / (b.total || 1) || a.name.localeCompare(b.name));
    return { shift: { _id: shift._id, status: shift.status, service: shift.service, date: shift.date }, people, late: people.filter((p) => p.state === "late").length };
  },
});

export const templates = query({
  args: { venueId: v.id("venues") },
  handler: async (ctx, { venueId }) => {
    const actor = await requireCan(ctx, "tasks.templates");
    requireVenue(actor, venueId);
    const all = [];
    for (const phase of ["open", "mid", "close"] as const)
      all.push(
        ...(await ctx.db
          .query("taskTemplates")
          .withIndex("by_venue_phase", (q) => q.eq("venueId", venueId).eq("phase", phase))
          .collect()),
      );
    return all;
  },
});

export const upsertTemplate = mutation({
  args: {
    templateId: v.optional(v.id("taskTemplates")),
    venueId: v.id("venues"),
    positions: v.array(v.string()),
    sectionId: v.optional(v.string()),
    phase: v.string(),
    title: v.object({ en: v.string(), es: v.string() }),
    schedule: v.any(),
    items: v.any(),
    dueOffsetMin: v.number(),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "tasks.templates");
    const p = parseOrThrow(taskTemplateInput, args);
    requireVenue(actor, args.venueId);
    if (p.sectionId && !asPlan(await planOf(ctx, args.venueId)).sections.some((s) => s.id === p.sectionId)) throw appError("INVALID_INPUT", undefined, { fields: { sectionId: "unknown" } });
    const doc = { venueId: args.venueId, positions: p.positions, sectionId: p.sectionId, phase: p.phase, title: p.title, schedule: p.schedule, items: p.items, dueOffsetMin: p.dueOffsetMin, active: p.active };
    if (args.templateId) {
      const prev = await ctx.db.get(args.templateId);
      if (!prev) throw appError("NOT_FOUND");
      requireVenue(actor, prev.venueId);
      await ctx.db.patch(prev._id, { ...doc, version: prev.version + 1 });
      await audit(ctx, { actorId: actor._id, venueId: args.venueId, action: "task.template_changed", entity: "taskTemplates", entityId: prev._id });
      return { templateId: prev._id };
    }
    const templateId = await ctx.db.insert("taskTemplates", { ...doc, version: 1 });
    await audit(ctx, { actorId: actor._id, venueId: args.venueId, action: "task.template_changed", entity: "taskTemplates", entityId: templateId, meta: { created: true } });
    return { templateId };
  },
});

/** Templates are never deleted (runs point at them): removing one deactivates it. */
export const removeTemplate = mutation({
  args: { templateId: v.id("taskTemplates") },
  handler: async (ctx, { templateId }) => {
    const actor = await requireCan(ctx, "tasks.templates");
    const t = await ctx.db.get(templateId);
    if (!t) throw appError("NOT_FOUND");
    requireVenue(actor, t.venueId);
    await ctx.db.patch(t._id, { active: false, version: t.version + 1 });
    await audit(ctx, { actorId: actor._id, venueId: t.venueId, action: "task.template_changed", entity: "taskTemplates", entityId: t._id, meta: { removed: true } });
    return { ok: true };
  },
});

/**
 * Side-work indicator (BLUEPRINT 2.6, managers only): for each tipped planned shift of a week, the estimated
 * non-tipped minutes from the templates that apply, against the company limit (2 h or 20 % by default).
 */
export const sideWorkLoad = query({
  args: { venueId: v.id("venues"), weekStart: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "schedule.manage");
    requireVenue(actor, args.venueId);
    const venue = await ctx.db.get(args.venueId);
    if (!venue) throw appError("NOT_FOUND");
    const { limit, rows } = await sideWorkRows(ctx, venue, args.weekStart);
    return { limit, rows, over: rows.filter((r) => r.state === "over_limit").length };
  },
});

/** Every 15 min (crons.ts): marks runs late and tells the managers on duty once per batch. */
export const lateCheck = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let marked = 0;
    for (const status of ["open", "closing"] as const) {
      for (const shift of await ctx.db
        .query("shifts")
        .withIndex("by_status", (q) => q.eq("status", status))
        .collect()) {
        const runs = await ctx.db
          .query("taskRuns")
          .withIndex("by_shift", (q) => q.eq("shiftId", shift._id))
          .collect();
        const newly = runs.filter((r) => !r.late && isLate(r, now));
        for (const r of newly) await ctx.db.patch(r._id, { late: true, lateNotifiedAt: now });
        marked += newly.length;
        if (newly.length) {
          const managers = (await venueManagers(ctx, shift.venueId, ["floor_manager", "agm"])).map((u) => u._id);
          await enqueue(ctx, managers, { topic: "task_late", key: "tasksLate", vars: { count: newly.length }, url: "/manage" });
        }
      }
    }
    return { marked };
  },
});

