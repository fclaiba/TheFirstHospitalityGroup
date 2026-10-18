import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireCan, requireVenue, overridesOf, worksAt } from "./lib/auth";
import type { Actor } from "./lib/auth";
import { audit } from "./lib/audit";
import { appError } from "./lib/errors";
import { parseOrThrow } from "./lib/validate";
import {
  positionSchema,
  trainingProgramInput,
  trainingRequestInput,
  trainingReviewInput,
} from "../schemas";
import { canReviewPosition, trainingPositions } from "../lib/domain/training";
import { POSITIONS } from "../lib/domain/types";
import type { Position } from "../lib/domain/types";
import { defaultProgram } from "./trainingDefaults";
import type { Program } from "./trainingDefaults";

type Ctx = QueryCtx | MutationCtx;
async function checkVenue(ctx: Ctx, actor: Actor, venueId: Id<"venues">) {
  requireVenue(actor, venueId);
  const venue = await ctx.db.get(venueId);
  if (!venue || venue.companyId !== actor.companyId || !venue.active)
    throw appError("NOT_FOUND");
}
async function currentProgram(
  ctx: Ctx,
  companyId: Id<"companies">,
  position: Position,
): Promise<Program | null> {
  const stored = await ctx.db
    .query("trainingPrograms")
    .withIndex("by_company_position_version", (q) =>
      q.eq("companyId", companyId).eq("position", position),
    )
    .order("desc")
    .first();
  return stored
    ? {
        position,
        version: stored.version,
        title: stored.title,
        steps: stored.steps,
        isDefault: false,
      }
    : defaultProgram(position);
}
async function eventView(ctx: Ctx, event: Doc<"trainingEvents">) {
  const actor = await ctx.db.get(event.actorId);
  return {
    state: event.state,
    revision: event.revision,
    note: event.note,
    at: event.at,
    actorName: actor?.name ?? null,
  };
}

export const mine = query({
  args: { venueId: v.id("venues"), position: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "training.own");
    await checkVenue(ctx, actor, args.venueId);
    const positions = trainingPositions(actor.primaryPosition);
    const position = args.position
      ? parseOrThrow(positionSchema, args.position)
      : positions[0];
    if (position && !positions.includes(position)) throw appError("FORBIDDEN");
    const program = position
      ? await currentProgram(ctx, actor.companyId, position)
      : null;
    if (!program) return { positions, program: null, steps: [], archived: [] };
    const records = await ctx.db
      .query("trainingRecords")
      .withIndex("by_venue_user_position_version_step", (q) =>
        q
          .eq("venueId", args.venueId)
          .eq("userId", actor._id)
          .eq("position", program.position)
          .eq("version", program.version),
      )
      .take(12);
    const older = await ctx.db
      .query("trainingRecords")
      .withIndex("by_venue_user_position_version_step", (q) =>
        q
          .eq("venueId", args.venueId)
          .eq("userId", actor._id)
          .eq("position", program.position)
          .lt("version", program.version),
      )
      .order("desc")
      .take(50);
    const steps = await Promise.all(
      program.steps.map(async (step) => {
        const record = records.find((r) => r.stepKey === step.key);
        const events = record
          ? await ctx.db
              .query("trainingEvents")
              .withIndex("by_record", (q) => q.eq("recordId", record._id))
              .order("desc")
              .take(20)
          : [];
        return {
          ...step,
          state: record?.state ?? "not_started",
          recordId: record?._id ?? null,
          revision: record?.revision ?? 0,
          history: await Promise.all(events.map((e) => eventView(ctx, e))),
        };
      }),
    );
    return {
      positions,
      program,
      steps,
      archived: older.map((r) => ({
        recordId: r._id,
        version: r.version,
        state: r.state,
        label: r.label,
      })),
    };
  },
});

export const requestReview = mutation({
  args: {
    venueId: v.id("venues"),
    position: v.string(),
    version: v.number(),
    stepKey: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "training.own");
    await checkVenue(ctx, actor, args.venueId);
    const input = parseOrThrow(trainingRequestInput, args);
    if (!trainingPositions(actor.primaryPosition).includes(input.position))
      throw appError("FORBIDDEN");
    const program = await currentProgram(ctx, actor.companyId, input.position);
    if (!program || program.version !== input.version)
      throw appError("VERSION_STALE");
    const step = program.steps.find((s) => s.key === input.stepKey);
    if (!step) throw appError("NOT_FOUND");
    const record = await ctx.db
      .query("trainingRecords")
      .withIndex("by_venue_user_position_version_step", (q) =>
        q
          .eq("venueId", args.venueId)
          .eq("userId", actor._id)
          .eq("position", input.position)
          .eq("version", input.version)
          .eq("stepKey", input.stepKey),
      )
      .unique();
    if (record?.state === "ready") return { recordId: record._id };
    if (record?.state === "verified") throw appError("INVALID_TRANSITION");
    const revision = (record?.revision ?? 0) + 1;
    const at = Date.now();
    const recordId =
      record?._id ??
      (await ctx.db.insert("trainingRecords", {
        venueId: args.venueId,
        userId: actor._id,
        position: input.position,
        version: input.version,
        stepKey: step.key,
        label: step.label,
        evidence: step.evidence,
        state: "ready",
        revision,
        updatedAt: at,
      }));
    if (record)
      await ctx.db.patch(recordId, { state: "ready", revision, updatedAt: at });
    await ctx.db.insert("trainingEvents", {
      venueId: args.venueId,
      recordId,
      actorId: actor._id,
      state: "ready",
      revision,
      note: input.note ?? "",
      at,
    });
    await audit(ctx, {
      actorId: actor._id,
      venueId: args.venueId,
      action: "training.requested",
      entity: "trainingRecords",
      entityId: recordId,
    });
    return { recordId };
  },
});

export const queue = query({
  args: { venueId: v.id("venues"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "training.review");
    await checkVenue(ctx, actor, args.venueId);
    if (args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 50)
      throw appError("INVALID_INPUT");
    const overrides = await overridesOf(ctx, args.venueId);
    const allowed = POSITIONS.filter((p) =>
      canReviewPosition(actor, p, overrides),
    );
    if (!allowed.length) return { page: [], isDone: true, continueCursor: "" };
    const programs = (
      await Promise.all(
        allowed.map((p) => currentProgram(ctx, actor.companyId, p)),
      )
    ).filter((p): p is Program => p !== null);
    const result = await ctx.db
      .query("trainingRecords")
      .withIndex("by_venue_state", (q) =>
        q.eq("venueId", args.venueId).eq("state", "ready"),
      )
      .filter((q) =>
        q.or(
          ...programs.map((p) =>
            q.and(
              q.eq(q.field("position"), p.position),
              q.eq(q.field("version"), p.version),
            ),
          ),
        ),
      )
      .paginate(args.paginationOpts);
    const page = [];
    for (const record of result.page) {
      if (record.userId === actor._id) continue;
      const user = await ctx.db.get(record.userId);
      if (
        !user?.active ||
        user.companyId !== actor.companyId ||
        !(await worksAt(ctx, user, args.venueId))
      )
        continue;
      const program = programs.find((p) => p.position === record.position);
      if (program?.version !== record.version) continue;
      const events = await ctx.db
        .query("trainingEvents")
        .withIndex("by_record", (q) => q.eq("recordId", record._id))
        .order("desc")
        .take(20);
      page.push({
        recordId: record._id,
        name: user.name,
        position: record.position,
        version: record.version,
        revision: record.revision,
        label: record.label,
        evidence: record.evidence,
        history: await Promise.all(events.map((e) => eventView(ctx, e))),
      });
    }
    return { ...result, page };
  },
});

export const review = mutation({
  args: {
    recordId: v.id("trainingRecords"),
    revision: v.number(),
    decision: v.union(v.literal("verified"), v.literal("needs_practice")),
    note: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "training.review");
    const input = parseOrThrow(trainingReviewInput, args);
    const record = await ctx.db.get(args.recordId);
    if (!record) throw appError("NOT_FOUND");
    await checkVenue(ctx, actor, record.venueId);
    const target = await ctx.db.get(record.userId);
    if (
      !target?.active ||
      target.companyId !== actor.companyId ||
      !(await worksAt(ctx, target, record.venueId))
    )
      throw appError("NOT_FOUND");
    if (
      record.userId === actor._id ||
      !canReviewPosition(
        actor,
        record.position,
        await overridesOf(ctx, record.venueId),
      )
    )
      throw appError("FORBIDDEN");
    if (record.state !== "ready") throw appError("INVALID_TRANSITION");
    if (record.revision !== input.revision) throw appError("VERSION_STALE");
    if (
      (await currentProgram(ctx, actor.companyId, record.position))?.version !==
      record.version
    )
      throw appError("VERSION_STALE");
    const at = Date.now(),
      revision = record.revision + 1;
    await ctx.db.patch(record._id, {
      state: input.decision,
      revision,
      updatedAt: at,
    });
    await ctx.db.insert("trainingEvents", {
      venueId: record.venueId,
      recordId: record._id,
      actorId: actor._id,
      state: input.decision,
      revision,
      note: input.note,
      at,
    });
    await audit(ctx, {
      actorId: actor._id,
      venueId: record.venueId,
      action: "training.reviewed",
      entity: "trainingRecords",
      entityId: record._id,
      meta: { decision: input.decision, revision },
    });
    return { ok: true };
  },
});

export const history = query({
  args: {
    recordId: v.id("trainingRecords"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "training.own");
    const record = await ctx.db.get(args.recordId);
    if (!record) throw appError("NOT_FOUND");
    await checkVenue(ctx, actor, record.venueId);
    if (
      record.userId !== actor._id &&
      !canReviewPosition(
        actor,
        record.position,
        await overridesOf(ctx, record.venueId),
      )
    )
      throw appError("FORBIDDEN");
    if (args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 50)
      throw appError("INVALID_INPUT");
    const result = await ctx.db
      .query("trainingEvents")
      .withIndex("by_record", (q) => q.eq("recordId", record._id))
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: await Promise.all(result.page.map((e) => eventView(ctx, e))),
    };
  },
});

export const program = query({
  args: { venueId: v.id("venues"), position: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "training.manage");
    await checkVenue(ctx, actor, args.venueId);
    const position = parseOrThrow(positionSchema, args.position);
    const result = await currentProgram(ctx, actor.companyId, position);
    if (!result) throw appError("INVALID_INPUT");
    return result;
  },
});

export const publish = mutation({
  args: {
    venueId: v.id("venues"),
    position: v.string(),
    expectedVersion: v.number(),
    title: v.object({ en: v.string(), es: v.string() }),
    steps: v.array(
      v.object({
        key: v.string(),
        label: v.object({ en: v.string(), es: v.string() }),
        evidence: v.object({ en: v.string(), es: v.string() }),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "training.manage");
    await checkVenue(ctx, actor, args.venueId);
    const input = parseOrThrow(trainingProgramInput, args);
    const current = await currentProgram(ctx, actor.companyId, input.position);
    if (!current || current.version !== input.expectedVersion)
      throw appError("VERSION_STALE");
    const version = current.version + 1;
    const id = await ctx.db.insert("trainingPrograms", {
      companyId: actor.companyId,
      position: input.position,
      version,
      title: input.title,
      steps: input.steps,
      publishedBy: actor._id,
      at: Date.now(),
    });
    await audit(ctx, {
      actorId: actor._id,
      venueId: args.venueId,
      action: "training.published",
      entity: "trainingPrograms",
      entityId: id,
      meta: { position: input.position, version },
    });
    return { version };
  },
});
