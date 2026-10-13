// Checklists (BLUEPRINT 2.2, ADR 0015): templates per venue, role and phase with a weekly schedule and per-item
// minimum level and section; runs per person and shift; live progress for the manager; late only for the manager.
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireRole, requireUser, requireVenue } from "./lib/auth";
import type { Actor } from "./lib/auth";
import { appError } from "./lib/errors";
import { audit } from "./lib/audit";
import { enqueue } from "./lib/notify";
import { getShift, liveShiftOf, rosterOf } from "./lib/shift";
import { parseOrThrow } from "./lib/validate";
import { taskTemplateInput } from "../schemas";
import { canCheck, isComplete, isLate, runProgress } from "../lib/domain/tasks";
import { isLive } from "../lib/domain/shift";
import { needsAck, setFor } from "../lib/domain/rules";
import type { Role } from "../lib/domain/types";

async function ruleAckPending(ctx: QueryCtx, user: Doc<"users">, venueId: Id<"venues">): Promise<boolean> {
  const sets = await ctx.db
    .query("ruleSets")
    .withIndex("by_role_venue", (q) => q.eq("role", user.role))
    .collect();
  const set = setFor(
    sets.map((s) => ({ ...s, venueId: s.venueId as string | undefined })),
    user.role,
    venueId,
  );
  if (!set) return false;
  const acks = await ctx.db
    .query("ruleAcks")
    .withIndex("by_user_set", (q) => q.eq("userId", user._id).eq("setId", set._id))
    .collect();
  return needsAck(set, acks);
}

async function withLabels(ctx: QueryCtx, run: Doc<"taskRuns">, now: number) {
  const template = await ctx.db.get(run.templateId);
  const items = run.items.map((it, i) => {
    const t = template?.items[run.itemIndexes[i]!];
    return { ...it, index: i, label: t?.label ?? { en: "", es: "" }, photoRequired: !!t?.photoRequired, critical: !!t?.critical };
  });
  return {
    _id: run._id,
    shiftId: run.shiftId,
    phase: run.phase,
    title: template?.title ?? { en: "", es: "" },
    dueAt: run.dueAt,
    completedAt: run.completedAt ?? null,
    excused: run.excused ?? null,
    items,
    progress: runProgress(run),
    late: isLate(run, now),
  };
}

/** My runs in the live shift of a venue (or a given shift). Late is never sent to staff: the UI does not show it. */
export const myRun = query({
  args: { venueId: v.id("venues"), shiftId: v.optional(v.id("shifts")) },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    requireVenue(actor, args.venueId);
    const shift = args.shiftId ? await getShift(ctx, actor, args.shiftId) : await liveShiftOf(ctx, args.venueId);
    if (!shift) return { shift: null, runs: [], rulesPending: false };
    const runs = await ctx.db
      .query("taskRuns")
      .withIndex("by_user_shift", (q) => q.eq("userId", actor._id).eq("shiftId", shift._id))
      .collect();
    const now = Date.now();
    const out = [];
    for (const r of runs.sort((a, b) => a.dueAt - b.dueAt)) {
      const run = await withLabels(ctx, r, now);
      out.push({ ...run, late: false });
    }
    return { shift: { _id: shift._id, status: shift.status, service: shift.service, date: shift.date }, runs: out, rulesPending: await ruleAckPending(ctx, actor, shift.venueId) };
  },
});

export const check = mutation({
  args: { runId: v.id("taskRuns"), itemIndex: v.number(), done: v.boolean(), photoId: v.optional(v.id("_storage")) },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const run = await ctx.db.get(args.runId);
    if (!run) throw appError("NOT_FOUND");
    requireVenue(actor, run.venueId);
    if (run.userId !== actor._id) throw appError("FORBIDDEN");
    const shift = await ctx.db.get(run.shiftId);
    if (!shift || !isLive(shift.status)) throw appError("SHIFT_NOT_OPEN");
    if (await ruleAckPending(ctx, actor, run.venueId)) throw appError("RULES_NOT_ACKNOWLEDGED");
    const template = await ctx.db.get(run.templateId);
    const item = template?.items[run.itemIndexes[args.itemIndex] ?? -1];
    const problem = canCheck(run, args.itemIndex, item, args.done, args.photoId);
    if (problem) throw appError(problem);
    if (args.photoId) await attachFile(ctx, actor, args.photoId, `taskRuns:${run._id}`);
    const now = Date.now();
    const items = run.items.map((it, i) =>
      i === args.itemIndex ? { done: args.done, at: args.done ? now : undefined, by: args.done ? actor._id : undefined, photoId: args.photoId ?? it.photoId } : it,
    );
    const complete = isComplete({ items });
    await ctx.db.patch(run._id, { items, completedAt: complete ? (run.completedAt ?? now) : undefined, late: complete ? (run.completedAt ?? now) > run.dueAt : run.late });
    if (complete && !run.completedAt) await ctx.db.insert("analyticsEvents", { name: "run_completed", userId: actor._id, venueId: run.venueId, props: { runId: run._id }, at: now });
    await ctx.db.insert("analyticsEvents", { name: "task_checked", userId: actor._id, venueId: run.venueId, at: now });
    return { progress: runProgress({ items }), complete };
  },
});

async function attachFile(ctx: MutationCtx, actor: Actor, storageId: Id<"_storage">, to: string) {
  const file = await ctx.db
    .query("files")
    .withIndex("by_storage", (q) => q.eq("storageId", storageId))
    .unique();
  if (!file || file.ownerId !== actor._id) throw appError("NOT_FOUND");
  await ctx.db.patch(file._id, { attachedTo: to });
}

export const excuse = mutation({
  args: { runId: v.id("taskRuns"), reason: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, ["manager"]);
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

/** Live progress per person (captain, manager): done/total, late, phase. */
export const shiftProgress = query({
  args: { shiftId: v.id("shifts") },
  handler: async (ctx, { shiftId }) => {
    const actor = await requireRole(ctx, ["captain", "manager"]);
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
      for (const r of list.sort((a, b) => a.dueAt - b.dueAt)) detailed.push(await withLabels(ctx, r, now));
      const done = list.reduce((n, r) => n + runProgress(r).done, 0);
      const total = list.reduce((n, r) => n + runProgress(r).total, 0);
      people.push({ userId, name: user.name, role: user.role, level: user.level, done, total, pct: total ? Math.round((done / total) * 100) : 100, late: list.some((r) => isLate(r, now)), runs: detailed });
    }
    people.sort((a, b) => Number(b.late) - Number(a.late) || a.pct - b.pct || a.name.localeCompare(b.name));
    const done = people.reduce((n, p) => n + p.done, 0);
    const total = people.reduce((n, p) => n + p.total, 0);
    return { shift, people, totals: { done, total, pct: total ? Math.round((done / total) * 100) : 100, late: people.filter((p) => p.late).length } };
  },
});

export const templates = query({
  args: { venueId: v.id("venues") },
  handler: async (ctx, { venueId }) => {
    const actor = await requireRole(ctx, ["manager"]);
    requireVenue(actor, venueId);
    const all = [];
    for (const phase of ["open", "mid", "close"] as const) {
      // No index on venue alone: one pass per role keeps it bounded by the role list.
      for (const role of ["server", "runner", "busser", "bartender", "barback", "kitchen", "captain", "manager"] as Role[]) {
        all.push(
          ...(await ctx.db
            .query("taskTemplates")
            .withIndex("by_venue_role_phase", (q) => q.eq("venueId", venueId).eq("role", role).eq("phase", phase))
            .collect()),
        );
      }
    }
    return all;
  },
});

export const upsertTemplate = mutation({
  args: {
    templateId: v.optional(v.id("taskTemplates")),
    venueId: v.id("venues"),
    role: v.string(),
    phase: v.string(),
    title: v.object({ en: v.string(), es: v.string() }),
    schedule: v.any(),
    items: v.any(),
    dueOffsetMin: v.number(),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, ["manager"]);
    const p = parseOrThrow(taskTemplateInput, args);
    requireVenue(actor, args.venueId);
    for (const it of p.items) {
      if (it.sectionId) {
        const section = await ctx.db.get(it.sectionId as Id<"sections">);
        if (!section || section.venueId !== args.venueId) throw appError("INVALID_INPUT", undefined, { fields: { items: "section" } });
      }
    }
    const doc = {
      venueId: args.venueId,
      role: p.role,
      phase: p.phase,
      title: p.title,
      schedule: p.schedule,
      items: p.items.map((i) => ({ ...i, sectionId: i.sectionId as Id<"sections"> | undefined })),
      dueOffsetMin: p.dueOffsetMin,
      active: p.active,
    };
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
    const actor = await requireRole(ctx, ["manager"]);
    const t = await ctx.db.get(templateId);
    if (!t) throw appError("NOT_FOUND");
    requireVenue(actor, t.venueId);
    await ctx.db.patch(t._id, { active: false, version: t.version + 1 });
    await audit(ctx, { actorId: actor._id, venueId: t.venueId, action: "task.template_changed", entity: "taskTemplates", entityId: t._id, meta: { removed: true } });
    return { ok: true };
  },
});

/** Every 15 min (crons.ts): marks runs late and tells the manager on duty once per shift. */
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
          const managers = (await rosterOf(ctx, shift)).filter((u) => u.role === "manager").map((u) => u._id);
          await enqueue(ctx, managers, { topic: "task_late", key: "tasksLate", vars: { count: newly.length }, url: "/manage" });
        }
      }
    }
    return { marked };
  },
});
