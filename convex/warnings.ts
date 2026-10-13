// Warnings (ADR 0007, BLUEPRINT 2.2, 3.2): always tied to a rule valid for the person's role, minor or major,
// acknowledged by the person with an optional response, void only within 24 h with a reason. State is computed over a
// rolling window with company thresholds. Staff see only their own. Notifications never carry the content.
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireRole, requireUser, requireVenue } from "./lib/auth";
import { appError } from "./lib/errors";
import { audit } from "./lib/audit";
import { enqueue } from "./lib/notify";
import { rateLimit } from "./lib/rateLimit";
import { parseOrThrow } from "./lib/validate";
import { ownersOf } from "./lib/shift";
import { thresholdsInput, warningAckInput, warningInput, warningVoidInput } from "../schemas";
import { canVoid, countable, DEFAULT_THRESHOLDS, validThresholds, warningState, DAY_MS } from "../lib/domain/warnings";
import { setFor } from "../lib/domain/rules";
import type { Role, Thresholds } from "../lib/domain/types";

type Ctx = QueryCtx | MutationCtx;

async function thresholdsOf(ctx: Ctx, companyId: Id<"companies">): Promise<Thresholds> {
  return (await ctx.db.get(companyId))?.warningThresholds ?? DEFAULT_THRESHOLDS;
}

async function warningsOf(ctx: Ctx, userId: Id<"users">): Promise<Doc<"warnings">[]> {
  return await ctx.db
    .query("warnings")
    .withIndex("by_user_at", (q) => q.eq("userId", userId))
    .order("desc")
    .collect();
}

async function stateOf(ctx: Ctx, user: Doc<"users">, now = Date.now()) {
  const t = await thresholdsOf(ctx, user.companyId);
  return warningState(await warningsOf(ctx, user._id), now, t);
}

/** The rule set that applies to a role at a venue (venue set wins over the company set). */
async function currentSet(ctx: Ctx, role: Role, venueId: Id<"venues">) {
  const sets = await ctx.db
    .query("ruleSets")
    .withIndex("by_role_venue", (q) => q.eq("role", role))
    .collect();
  return setFor(
    sets.map((s) => ({ ...s, venueId: s.venueId as string | undefined })),
    role,
    venueId,
  );
}

async function sharesVenue(ctx: Ctx, userId: Id<"users">, venueId: Id<"venues">) {
  const rows = await ctx.db
    .query("assignments")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return rows.some((r) => r.venueId === venueId);
}

/** A warning as the UI shows it: rule texts, who logged it, state flags. */
async function present(ctx: Ctx, w: Doc<"warnings">, now: number, windowDays: number) {
  const rule = await ctx.db.get(w.ruleId);
  const logger = await ctx.db.get(w.loggedBy);
  const person = await ctx.db.get(w.userId);
  return {
    _id: w._id,
    venueId: w.venueId,
    userId: w.userId,
    personName: person?.name ?? "",
    personRole: person?.role ?? null,
    rule: rule ? { _id: rule._id, key: rule.key, title: rule.title, body: rule.body, howTo: rule.howTo } : null,
    severity: w.severity,
    note: w.note ?? null,
    photoId: w.photoId ?? null,
    loggedByName: logger?.name ?? "",
    at: w.at,
    acknowledgedAt: w.acknowledgedAt ?? null,
    response: w.response ?? null,
    voidedAt: w.voidedAt ?? null,
    voidReason: w.voidReason ?? null,
    counts: countable(w, now, windowDays),
    canVoidUntil: w.at + DAY_MS,
  };
}

export const create = mutation({
  args: {
    venueId: v.id("venues"),
    userId: v.id("users"),
    ruleId: v.optional(v.string()),
    severity: v.string(),
    note: v.optional(v.string()),
    photoId: v.optional(v.id("_storage")),
    formMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, ["captain", "manager"]);
    if (!args.ruleId) throw appError("RULE_REQUIRED");
    const p = parseOrThrow(warningInput, args);
    requireVenue(actor, args.venueId);
    if (args.userId === actor._id) throw appError("FORBIDDEN");
    const target = await ctx.db.get(args.userId);
    if (!target || !target.active || target.companyId !== actor.companyId) throw appError("NOT_FOUND");
    if (target.role === "owner" || target.role === "dev") throw appError("FORBIDDEN");
    if (!(await sharesVenue(ctx, target._id, args.venueId))) throw appError("VENUE_FORBIDDEN");
    // A captain logs warnings for staff, never for managers.
    if (actor.role === "captain" && (target.role === "manager" || target.role === "captain")) throw appError("FORBIDDEN");
    const ruleId = ctx.db.normalizeId("rules", p.ruleId);
    const rule = ruleId ? await ctx.db.get(ruleId) : null;
    if (!rule || rule.retiredAt) throw appError("RULE_REQUIRED");
    const set = await currentSet(ctx, target.role, args.venueId);
    if (!set || rule.setId !== set._id) throw appError("RULE_NOT_FOR_ROLE");
    await rateLimit(ctx, `warn:${actor._id}`, 30, 3600_000);
    if (args.photoId) {
      const file = await ctx.db
        .query("files")
        .withIndex("by_storage", (q) => q.eq("storageId", args.photoId!))
        .unique();
      if (!file || file.ownerId !== actor._id) throw appError("NOT_FOUND");
    }
    const now = Date.now();
    const warningId = await ctx.db.insert("warnings", {
      venueId: args.venueId,
      userId: target._id,
      ruleId: rule._id,
      ruleVersion: rule.version,
      severity: p.severity,
      note: p.note,
      photoId: args.photoId,
      loggedBy: actor._id,
      at: now,
      formMs: p.formMs,
    });
    if (args.photoId) {
      const file = await ctx.db
        .query("files")
        .withIndex("by_storage", (q) => q.eq("storageId", args.photoId!))
        .unique();
      if (file) await ctx.db.patch(file._id, { attachedTo: `warnings:${warningId}` });
    }
    await audit(ctx, { actorId: actor._id, venueId: args.venueId, action: "warning.created", entity: "warnings", entityId: warningId, meta: { userId: target._id, ruleId: rule._id, severity: p.severity } });
    await ctx.db.insert("analyticsEvents", { name: "warning_logged", userId: actor._id, venueId: args.venueId, props: { formMs: p.formMs ?? null, severity: p.severity }, at: now });
    // Generic line only (project rule 9): the content stays in the app.
    await enqueue(ctx, [target._id], { topic: "warning", key: "warning", url: "/me" });
    return { warningId, state: await stateOf(ctx, target, now) };
  },
});

export const acknowledge = mutation({
  args: { warningId: v.id("warnings"), response: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const p = parseOrThrow(warningAckInput, args);
    const w = await ctx.db.get(args.warningId);
    if (!w) throw appError("NOT_FOUND");
    if (w.userId !== actor._id) throw appError("FORBIDDEN");
    if (w.voidedAt) throw appError("INVALID_TRANSITION");
    await ctx.db.patch(w._id, { acknowledgedAt: w.acknowledgedAt ?? Date.now(), response: p.response ?? w.response });
    await audit(ctx, { actorId: actor._id, venueId: w.venueId, action: "warning.acknowledged", entity: "warnings", entityId: w._id, meta: { responded: !!p.response } });
    return { ok: true };
  },
});

const voidWarning = mutation({
  args: { warningId: v.id("warnings"), reason: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, ["manager"]);
    const p = parseOrThrow(warningVoidInput, args);
    const w = await ctx.db.get(args.warningId);
    if (!w) throw appError("NOT_FOUND");
    requireVenue(actor, w.venueId);
    const problem = canVoid(w, actor.role, Date.now());
    if (problem) throw appError(problem);
    await ctx.db.patch(w._id, { voidedAt: Date.now(), voidedBy: actor._id, voidReason: p.reason });
    await audit(ctx, { actorId: actor._id, venueId: w.venueId, action: "warning.voided", entity: "warnings", entityId: w._id, meta: { reason: p.reason } });
    return { ok: true };
  },
});

/** Exported as `void` (BLUEPRINT 7.2 warnings.void); a reserved word cannot name a const. */
export { voidWarning as void };

/** My warnings: everything stored about them, plus my state (BLUEPRINT 8.4: staff see all of it on /me). */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireUser(ctx);
    const now = Date.now();
    const t = await thresholdsOf(ctx, actor.companyId);
    const rows = await warningsOf(ctx, actor._id);
    const items = [];
    for (const w of rows) items.push(await present(ctx, w, now, t.windowDays));
    return {
      state: warningState(rows, now, t),
      windowDays: t.windowDays,
      pending: items.filter((w) => !w.acknowledgedAt && !w.voidedAt).length,
      items,
    };
  },
});

/** Warnings of a venue (captain read, manager, owner), newest first, with filters. */
export const forVenue = query({
  args: {
    venueId: v.id("venues"),
    userId: v.optional(v.id("users")),
    ruleKey: v.optional(v.string()),
    severity: v.optional(v.string()),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, ["captain", "manager"]);
    requireVenue(actor, args.venueId);
    const now = Date.now();
    const t = await thresholdsOf(ctx, actor.companyId);
    const rows = await ctx.db
      .query("warnings")
      .withIndex("by_venue_at", (q) => {
        const base = q.eq("venueId", args.venueId);
        return args.from !== undefined ? base.gte("at", args.from) : base;
      })
      .order("desc")
      .take(Math.min(args.limit ?? 200, 500));
    const out = [];
    for (const w of rows) {
      if (args.userId && w.userId !== args.userId) continue;
      if (args.severity && w.severity !== args.severity) continue;
      if (args.to !== undefined && w.at > args.to) continue;
      const item = await present(ctx, w, now, t.windowDays);
      if (args.ruleKey && item.rule?.key !== args.ruleKey) continue;
      out.push(item);
    }
    return { items: out, canVoid: actor.role !== "captain", now };
  },
});

/** One person's record with their state (captain read, manager, owner). */
export const forUser = query({
  args: { userId: v.id("users"), venueId: v.id("venues") },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, ["captain", "manager"]);
    requireVenue(actor, args.venueId);
    const target = await ctx.db.get(args.userId);
    if (!target || target.companyId !== actor.companyId) throw appError("NOT_FOUND");
    if (actor.role !== "owner" && actor.role !== "dev" && !(await sharesVenue(ctx, target._id, args.venueId))) throw appError("VENUE_FORBIDDEN");
    const now = Date.now();
    const t = await thresholdsOf(ctx, actor.companyId);
    const rows = await warningsOf(ctx, target._id);
    const items = [];
    for (const w of rows) items.push(await present(ctx, w, now, t.windowDays));
    return { state: warningState(rows, now, t), items, person: { _id: target._id, name: target.name, role: target.role, level: target.level } };
  },
});

/** The people a captain or manager can warn at a venue, with their current state (the form's person picker). */
export const people = query({
  args: { venueId: v.id("venues") },
  handler: async (ctx, { venueId }) => {
    const actor = await requireRole(ctx, ["captain", "manager"]);
    requireVenue(actor, venueId);
    const rows = await ctx.db
      .query("assignments")
      .withIndex("by_venue", (q) => q.eq("venueId", venueId))
      .collect();
    const now = Date.now();
    const out = [];
    for (const r of rows) {
      const u = await ctx.db.get(r.userId);
      if (!u || !u.active || u._id === actor._id || u.role === "owner" || u.isDev) continue;
      if (actor.role === "captain" && (u.role === "manager" || u.role === "captain")) continue;
      out.push({ _id: u._id, name: u.name, role: u.role, level: u.level, state: await stateOf(ctx, u, now) });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** Rules a person can be warned on: their role's current set at the venue (RULE_NOT_FOR_ROLE otherwise). */
export const rulesFor = query({
  args: { userId: v.id("users"), venueId: v.id("venues") },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, ["captain", "manager"]);
    requireVenue(actor, args.venueId);
    const target = await ctx.db.get(args.userId);
    if (!target || target.companyId !== actor.companyId) throw appError("NOT_FOUND");
    const set = await currentSet(ctx, target.role, args.venueId);
    if (!set) return [];
    const rules = await ctx.db
      .query("rules")
      .withIndex("by_set", (q) => q.eq("setId", set._id as Id<"ruleSets">))
      .collect();
    return rules.filter((r) => !r.retiredAt).map((r) => ({ _id: r._id, key: r.key, title: r.title, body: r.body, howTo: r.howTo }));
  },
});

export const thresholds = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireUser(ctx);
    return await thresholdsOf(ctx, actor.companyId);
  },
});

export const setThresholds = mutation({
  args: { attentionMinor: v.number(), followUpMinor: v.number(), followUpMajor: v.number(), reviewMajor: v.number(), windowDays: v.number() },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, ["owner"]);
    const t = parseOrThrow(thresholdsInput, args);
    if (!validThresholds(t)) throw appError("INVALID_INPUT", undefined, { fields: { thresholds: "order" } });
    const before = await thresholdsOf(ctx, actor.companyId);
    await ctx.db.patch(actor.companyId, { warningThresholds: t });
    await audit(ctx, { actorId: actor._id, action: "warning.thresholds_changed", entity: "companies", entityId: actor.companyId, meta: { before, after: t } });
    return { ok: true };
  },
});

/** Daily owner digest (crons.ts): new Review states and warnings unacknowledged for 48 h. Generic text only. */
export const digest = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let sent = 0;
    for (const company of await ctx.db.query("companies").collect()) {
      const t = company.warningThresholds;
      const venues = await ctx.db
        .query("venues")
        .withIndex("by_company", (q) => q.eq("companyId", company._id))
        .collect();
      let review = 0;
      let stale = 0;
      const seen = new Set<string>();
      for (const venue of venues) {
        const recent = await ctx.db
          .query("warnings")
          .withIndex("by_venue_at", (q) => q.eq("venueId", venue._id).gte("at", now - t.windowDays * DAY_MS))
          .collect();
        for (const w of recent) {
          if (!w.voidedAt && !w.acknowledgedAt && now - w.at > 2 * DAY_MS) stale += 1;
          // A Review state is "new" when a warning in the last day pushed the person there.
          if (w.at > now - DAY_MS && !seen.has(w.userId)) {
            seen.add(w.userId);
            if (warningState(await warningsOf(ctx, w.userId), now, t) === "review") review += 1;
          }
        }
      }
      if (!review && !stale) continue;
      const owners = (await ownersOf(ctx, company._id)).map((o) => o._id);
      sent += await enqueue(ctx, owners, { topic: "warning", key: "warningDigest", vars: { review, stale }, url: "/manage/warnings" });
    }
    return { sent };
  },
});

export type WarningView = Awaited<ReturnType<typeof present>>;
