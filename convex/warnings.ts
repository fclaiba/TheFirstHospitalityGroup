// Warnings through the chain (ADR 0007, 0026; BLUEPRINT 2.6, 3.5): area leads (captain, maître d', head bartender,
// sous chef) propose for their own team; the manager on duty or above issues or discards; proposals waiting more than
// 24 h escalate to the GM. Always tied to a rule valid for the person's positions, minor or major, acknowledged by the
// person with an optional response, void only within 24 h with a reason. State over a rolling window with company
// thresholds. Visible to the person and their leaders, never to peers. Notifications never carry the content.
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { actorCan, inChainOf, overridesOf, requireCan, requireUser, requireVenue, worksAt } from "./lib/auth";
import type { Actor } from "./lib/auth";
import { appError } from "./lib/errors";
import { audit } from "./lib/audit";
import { enqueue } from "./lib/notify";
import { rateLimit } from "./lib/rateLimit";
import { parseOrThrow } from "./lib/validate";
import { applicableSets, liveRules } from "./lib/rules";
import { corporateOf, venueManagers } from "./lib/shift";
import { proposalInput, thresholdsInput, warningAckInput, warningInput, warningVoidInput } from "../schemas";
import { canVoid, countable, DAY_MS, DEFAULT_THRESHOLDS, proposalStale, validThresholds, warningState } from "../lib/domain/warnings";
import { canIssueFor, canProposeFor } from "../lib/domain/chain";
import { isCorporate } from "../lib/domain/positions";
import type { Thresholds } from "../lib/domain/types";

type Ctx = QueryCtx | MutationCtx;

async function thresholdsOf(ctx: Ctx, companyId: Id<"companies">): Promise<Thresholds> {
  return (await ctx.db.get(companyId))?.thresholds.warnings ?? DEFAULT_THRESHOLDS;
}

async function warningsOf(ctx: Ctx, userId: Id<"users">): Promise<Doc<"warnings">[]> {
  return await ctx.db
    .query("warnings")
    .withIndex("by_user_at", (q) => q.eq("userId", userId))
    .order("desc")
    .collect();
}

async function stateOf(ctx: Ctx, user: Doc<"users">, now = Date.now()) {
  return warningState(await warningsOf(ctx, user._id), now, await thresholdsOf(ctx, user.companyId));
}

/** Whether the actor (by working or primary position) may propose or issue for the target at the venue. */
async function mode(ctx: Ctx, actor: Actor, target: Doc<"users">, venueId: Id<"venues">): Promise<"issue" | "propose" | null> {
  if (target._id === actor._id || isCorporate(target.primaryPosition) || target.isDev) return null;
  const o = await overridesOf(ctx, venueId);
  const positions = [actor.position, actor.primaryPosition];
  if (actorCan(actor, "warnings.issue") && positions.some((p) => canIssueFor(p, target.primaryPosition, o))) return "issue";
  if (actorCan(actor, "warnings.propose") && positions.some((p) => canProposeFor(p, target.primaryPosition, o))) return "propose";
  return null;
}

/** The target person, checked: same company, active, works at the venue. */
async function targetOf(ctx: Ctx, actor: Actor, userId: Id<"users">, venueId: Id<"venues">): Promise<Doc<"users">> {
  if (userId === actor._id) throw appError("FORBIDDEN");
  const target = await ctx.db.get(userId);
  if (!target || !target.active || target.companyId !== actor.companyId) throw appError("NOT_FOUND");
  if (!(await worksAt(ctx, target, venueId))) throw appError("VENUE_FORBIDDEN");
  return target;
}

/** A rule that applies to the person at the venue (RULE_REQUIRED, RULE_NOT_FOR_POSITION). */
async function ruleFor(ctx: Ctx, target: Doc<"users">, venueId: Id<"venues">, raw: string | undefined): Promise<Doc<"rules">> {
  if (!raw) throw appError("RULE_REQUIRED");
  const ruleId = ctx.db.normalizeId("rules", raw);
  const rule = ruleId ? await ctx.db.get(ruleId) : null;
  if (!rule || rule.retiredAt) throw appError("RULE_REQUIRED");
  const sets = await applicableSets(ctx, target, venueId);
  if (!sets.some((s) => s._id === rule.setId)) throw appError("RULE_NOT_FOR_POSITION");
  return rule;
}

async function attachPhoto(ctx: MutationCtx, actor: Actor, photoId: Id<"_storage"> | undefined, attachedTo?: string) {
  if (!photoId) return;
  const file = await ctx.db
    .query("files")
    .withIndex("by_storage", (q) => q.eq("storageId", photoId))
    .unique();
  if (!file || (file.ownerId !== actor._id && !attachedTo?.startsWith("warnings:"))) throw appError("NOT_FOUND");
  if (attachedTo) await ctx.db.patch(file._id, { attachedTo });
}

/** A warning as the UI shows it: rule texts, who issued it (and who proposed it), state flags. */
async function present(ctx: Ctx, w: Doc<"warnings">, now: number, windowDays: number) {
  const rule = await ctx.db.get(w.ruleId);
  const issuer = await ctx.db.get(w.issuedBy);
  const person = await ctx.db.get(w.userId);
  const proposal = w.proposalId ? await ctx.db.get(w.proposalId) : null;
  const proposer = proposal ? await ctx.db.get(proposal.proposedBy) : null;
  return {
    _id: w._id,
    venueId: w.venueId,
    userId: w.userId,
    personName: person?.name ?? "",
    personPosition: person?.primaryPosition ?? null,
    rule: rule ? { _id: rule._id, key: rule.key, title: rule.title, body: rule.body, howTo: rule.howTo } : null,
    severity: w.severity,
    note: w.note ?? null,
    photoId: w.photoId ?? null,
    issuedByName: issuer?.name ?? "",
    proposedByName: proposer?.name ?? null,
    at: w.at,
    acknowledgedAt: w.acknowledgedAt ?? null,
    response: w.response ?? null,
    voidedAt: w.voidedAt ?? null,
    voidReason: w.voidReason ?? null,
    counts: countable(w, now, windowDays),
    canVoidUntil: w.at + DAY_MS,
  };
}

const warnArgs = {
  venueId: v.id("venues"),
  userId: v.id("users"),
  ruleId: v.optional(v.string()),
  severity: v.string(),
  note: v.optional(v.string()),
  photoId: v.optional(v.id("_storage")),
  formMs: v.optional(v.number()),
};

/** An area lead proposes a warning for someone in their own team; the manager on duty decides (ADR 0026). */
export const propose = mutation({
  args: warnArgs,
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "warnings.propose");
    if (!args.ruleId) throw appError("RULE_REQUIRED");
    const p = parseOrThrow(proposalInput, args);
    requireVenue(actor, args.venueId);
    const target = await targetOf(ctx, actor, args.userId, args.venueId);
    if (!(await mode(ctx, actor, target, args.venueId))) throw appError("FORBIDDEN");
    const rule = await ruleFor(ctx, target, args.venueId, p.ruleId);
    await rateLimit(ctx, `warn:${actor._id}`, 30, 3600_000);
    await attachPhoto(ctx, actor, args.photoId);
    const now = Date.now();
    const proposalId = await ctx.db.insert("warningProposals", {
      venueId: args.venueId,
      userId: target._id,
      ruleId: rule._id,
      severity: p.severity,
      note: p.note,
      photoId: args.photoId,
      proposedBy: actor._id,
      at: now,
      formMs: p.formMs,
      status: "open",
    });
    if (args.photoId) await attachPhoto(ctx, actor, args.photoId, `warningProposals:${proposalId}`);
    await audit(ctx, { actorId: actor._id, venueId: args.venueId, action: "warning.proposed", entity: "warningProposals", entityId: proposalId, meta: { userId: target._id, ruleId: rule._id, severity: p.severity } });
    await ctx.db.insert("analyticsEvents", { name: "warning_proposed", userId: actor._id, venueId: args.venueId, props: { formMs: p.formMs ?? null, severity: p.severity }, at: now });
    const managers = (await venueManagers(ctx, args.venueId)).filter((u) => u._id !== target._id).map((u) => u._id);
    await enqueue(ctx, managers, { topic: "warning", key: "warningProposed", url: "/manage/warnings" });
    return { proposalId };
  },
});

async function issueWarning(
  ctx: MutationCtx,
  actor: Actor,
  input: { venueId: Id<"venues">; target: Doc<"users">; rule: Doc<"rules">; severity: "minor" | "major"; note?: string; photoId?: Id<"_storage">; formMs?: number; proposalId?: Id<"warningProposals"> },
) {
  const now = Date.now();
  const warningId = await ctx.db.insert("warnings", {
    venueId: input.venueId,
    userId: input.target._id,
    ruleId: input.rule._id,
    ruleVersion: input.rule.version,
    severity: input.severity,
    note: input.note,
    photoId: input.photoId,
    issuedBy: actor._id,
    proposalId: input.proposalId,
    at: now,
    formMs: input.formMs,
  });
  if (input.photoId) await attachPhoto(ctx, actor, input.photoId, `warnings:${warningId}`);
  await audit(ctx, { actorId: actor._id, venueId: input.venueId, action: "warning.issued", entity: "warnings", entityId: warningId, meta: { userId: input.target._id, ruleId: input.rule._id, severity: input.severity, proposalId: input.proposalId ?? null } });
  await ctx.db.insert("analyticsEvents", { name: "warning_issued", userId: actor._id, venueId: input.venueId, props: { formMs: input.formMs ?? null, severity: input.severity, fromProposal: !!input.proposalId }, at: now });
  // Generic line only (project rule 12): the content stays in the app.
  await enqueue(ctx, [input.target._id], { topic: "warning", key: "warning", url: "/me" });
  return { warningId, state: await stateOf(ctx, input.target, now) };
}

/** Managers and above issue: a proposal (`proposalId`) or directly (the same fields as a proposal). */
export const issue = mutation({
  args: {
    proposalId: v.optional(v.id("warningProposals")),
    venueId: v.optional(v.id("venues")),
    userId: v.optional(v.id("users")),
    ruleId: v.optional(v.string()),
    severity: v.optional(v.string()),
    note: v.optional(v.string()),
    photoId: v.optional(v.id("_storage")),
    formMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "warnings.issue");
    if (args.proposalId) {
      const proposal = await ctx.db.get(args.proposalId);
      if (!proposal) throw appError("NOT_FOUND");
      requireVenue(actor, proposal.venueId);
      if (proposal.status !== "open") throw appError("INVALID_TRANSITION");
      const target = await targetOf(ctx, actor, proposal.userId, proposal.venueId);
      if ((await mode(ctx, actor, target, proposal.venueId)) !== "issue") throw appError("FORBIDDEN");
      const rule = await ruleFor(ctx, target, proposal.venueId, proposal.ruleId);
      await ctx.db.patch(proposal._id, { status: "issued", decidedBy: actor._id, decidedAt: Date.now() });
      return await issueWarning(ctx, actor, {
        venueId: proposal.venueId,
        target,
        rule,
        severity: (args.severity === "minor" || args.severity === "major" ? args.severity : proposal.severity) as "minor" | "major",
        note: proposal.note,
        photoId: proposal.photoId,
        formMs: proposal.formMs,
        proposalId: proposal._id,
      });
    }
    if (!args.venueId || !args.userId) throw appError("INVALID_INPUT", undefined, { fields: { userId: "required" } });
    if (!args.ruleId) throw appError("RULE_REQUIRED");
    const p = parseOrThrow(warningInput, args);
    requireVenue(actor, args.venueId);
    const target = await targetOf(ctx, actor, args.userId, args.venueId);
    if ((await mode(ctx, actor, target, args.venueId)) !== "issue") throw appError("FORBIDDEN");
    const rule = await ruleFor(ctx, target, args.venueId, p.ruleId);
    await rateLimit(ctx, `warn:${actor._id}`, 30, 3600_000);
    await attachPhoto(ctx, actor, args.photoId);
    return await issueWarning(ctx, actor, { venueId: args.venueId, target, rule, severity: p.severity, note: p.note, photoId: args.photoId, formMs: p.formMs });
  },
});

/** The manager discards a proposal (nothing reaches the person). */
export const discard = mutation({
  args: { proposalId: v.id("warningProposals"), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "warnings.issue");
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal) throw appError("NOT_FOUND");
    requireVenue(actor, proposal.venueId);
    if (proposal.status !== "open") throw appError("INVALID_TRANSITION");
    await ctx.db.patch(proposal._id, { status: "discarded", decidedBy: actor._id, decidedAt: Date.now() });
    await audit(ctx, { actorId: actor._id, venueId: proposal.venueId, action: "warning.discarded", entity: "warningProposals", entityId: proposal._id, meta: { reason: args.reason?.slice(0, 300) ?? null } });
    return { ok: true };
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
    // The response goes to the issuer, not to colleagues (BLUEPRINT 2.6).
    if (p.response) await enqueue(ctx, [w.issuedBy], { topic: "warning", key: "warningProposed", url: "/manage/warnings" });
    return { ok: true };
  },
});

const voidWarning = mutation({
  args: { warningId: v.id("warnings"), reason: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "warnings.void");
    const p = parseOrThrow(warningVoidInput, args);
    const w = await ctx.db.get(args.warningId);
    if (!w) throw appError("NOT_FOUND");
    requireVenue(actor, w.venueId);
    const problem = canVoid(w, actor.primaryPosition, Date.now());
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
    const actor = await requireCan(ctx, "warnings.own");
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

/** Whether the actor may read warnings of a person: managers of the venue, corporate, or a lead in the person's chain. */
async function canRead(ctx: Ctx, actor: Actor, target: Doc<"users">, venueId: Id<"venues">): Promise<boolean> {
  if (target._id === actor._id) return true;
  if (actorCan(actor, "warnings.read_venue")) return true;
  return actorCan(actor, "warnings.read_team") && (await inChainOf(ctx, actor, target, venueId));
}

/** Warnings of a venue, newest first, with filters. Leads read their own team only; nothing for peers. */
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
    const actor = await requireUser(ctx);
    if (!actorCan(actor, "warnings.read_venue") && !actorCan(actor, "warnings.read_team")) throw appError("FORBIDDEN");
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
    const readable = new Map<string, boolean>();
    for (const w of rows) {
      if (args.userId && w.userId !== args.userId) continue;
      if (args.severity && w.severity !== args.severity) continue;
      if (args.to !== undefined && w.at > args.to) continue;
      if (!readable.has(w.userId)) {
        const target = await ctx.db.get(w.userId);
        readable.set(w.userId, !!target && (await canRead(ctx, actor, target, args.venueId)));
      }
      if (!readable.get(w.userId)) continue;
      const item = await present(ctx, w, now, t.windowDays);
      if (args.ruleKey && item.rule?.key !== args.ruleKey) continue;
      out.push(item);
    }
    return { items: out, canVoid: actorCan(actor, "warnings.void"), readOnly: !actorCan(actor, "warnings.issue"), now };
  },
});

/** One person's record with their state (their leads read, managers, corporate). */
export const forUser = query({
  args: { userId: v.id("users"), venueId: v.id("venues") },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    requireVenue(actor, args.venueId);
    const target = await ctx.db.get(args.userId);
    if (!target || target.companyId !== actor.companyId) throw appError("NOT_FOUND");
    if (!(await worksAt(ctx, target, args.venueId))) throw appError("VENUE_FORBIDDEN");
    if (!(await canRead(ctx, actor, target, args.venueId))) throw appError("FORBIDDEN");
    const now = Date.now();
    const t = await thresholdsOf(ctx, actor.companyId);
    const rows = await warningsOf(ctx, target._id);
    const items = [];
    for (const w of rows) items.push(await present(ctx, w, now, t.windowDays));
    return { state: warningState(rows, now, t), items, person: { _id: target._id, name: target.name, primaryPosition: target.primaryPosition, title: target.title ?? null } };
  },
});

/** The people the actor can propose for (leads) or issue for (managers) at a venue, with their state. */
export const people = query({
  args: { venueId: v.id("venues") },
  handler: async (ctx, { venueId }) => {
    const actor = await requireUser(ctx);
    if (!actorCan(actor, "warnings.propose") && !actorCan(actor, "warnings.issue")) throw appError("FORBIDDEN");
    requireVenue(actor, venueId);
    const rows = await ctx.db
      .query("assignments")
      .withIndex("by_venue", (q) => q.eq("venueId", venueId))
      .collect();
    const now = Date.now();
    const out = [];
    for (const r of rows) {
      const u = await ctx.db.get(r.userId);
      if (!u || !u.active || u.isDev) continue;
      const m = await mode(ctx, actor, u, venueId);
      if (!m) continue;
      out.push({ _id: u._id, name: u.name, primaryPosition: u.primaryPosition, title: u.title ?? null, mode: m, state: await stateOf(ctx, u, now) });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** Rules a person can be warned on at a venue: every set that applies to them (RULE_NOT_FOR_POSITION otherwise). */
export const rulesFor = query({
  args: { userId: v.id("users"), venueId: v.id("venues") },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    if (!actorCan(actor, "warnings.propose") && !actorCan(actor, "warnings.issue")) throw appError("FORBIDDEN");
    requireVenue(actor, args.venueId);
    const target = await ctx.db.get(args.userId);
    if (!target || target.companyId !== actor.companyId) throw appError("NOT_FOUND");
    const out = [];
    for (const set of await applicableSets(ctx, target, args.venueId)) {
      for (const r of await liveRules(ctx, set._id)) out.push({ _id: r._id, key: r.key, title: r.title, body: r.body, howTo: r.howTo, scope: set.scope, position: set.position ?? null });
    }
    return out;
  },
});

async function presentProposal(ctx: Ctx, p: Doc<"warningProposals">, now: number) {
  const person = await ctx.db.get(p.userId);
  const by = await ctx.db.get(p.proposedBy);
  const rule = await ctx.db.get(p.ruleId);
  return {
    _id: p._id,
    venueId: p.venueId,
    userId: p.userId,
    personName: person?.name ?? "",
    personPosition: person?.primaryPosition ?? null,
    proposedByName: by?.name ?? "",
    rule: rule ? { _id: rule._id, key: rule.key, title: rule.title, howTo: rule.howTo } : null,
    severity: p.severity,
    note: p.note ?? null,
    photoId: p.photoId ?? null,
    status: p.status,
    at: p.at,
    escalated: !!p.escalatedAt || proposalStale(p, now),
  };
}

/** Open proposals of a venue for the managers who decide them (oldest first). */
export const proposals = query({
  args: { venueId: v.id("venues") },
  handler: async (ctx, { venueId }) => {
    const actor = await requireCan(ctx, "warnings.issue");
    requireVenue(actor, venueId);
    const rows = await ctx.db
      .query("warningProposals")
      .withIndex("by_venue_status", (q) => q.eq("venueId", venueId).eq("status", "open"))
      .collect();
    const now = Date.now();
    const out = [];
    for (const p of rows.sort((a, b) => a.at - b.at)) out.push(await presentProposal(ctx, p, now));
    return out;
  },
});

/** What a lead proposed at a venue in the last 30 days, with the decision (no content of other people's records). */
export const myProposals = query({
  args: { venueId: v.id("venues") },
  handler: async (ctx, { venueId }) => {
    const actor = await requireCan(ctx, "warnings.propose");
    requireVenue(actor, venueId);
    const now = Date.now();
    const out = [];
    for (const status of ["open", "issued", "discarded"] as const) {
      const rows = await ctx.db
        .query("warningProposals")
        .withIndex("by_venue_status", (q) => q.eq("venueId", venueId).eq("status", status))
        .collect();
      for (const p of rows) if (p.proposedBy === actor._id && now - p.at < 30 * DAY_MS) out.push(await presentProposal(ctx, p, now));
    }
    return out.sort((a, b) => b.at - a.at);
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
    const actor = await requireCan(ctx, "warnings.thresholds");
    const t = parseOrThrow(thresholdsInput, args);
    if (!validThresholds(t)) throw appError("INVALID_INPUT", undefined, { fields: { thresholds: "order" } });
    const company = await ctx.db.get(actor.companyId);
    if (!company) throw appError("NOT_FOUND");
    await ctx.db.patch(company._id, { thresholds: { ...company.thresholds, warnings: t } });
    await audit(ctx, { actorId: actor._id, action: "warning.thresholds_changed", entity: "companies", entityId: actor.companyId, meta: { before: company.thresholds.warnings, after: t } });
    return { ok: true };
  },
});

/** Hourly (crons.ts): proposals waiting more than 24 h go to the GM of the venue (ADR 0026). */
export const escalate = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const open = await ctx.db
      .query("warningProposals")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .collect();
    let escalated = 0;
    for (const p of open.filter((x) => proposalStale(x, now))) {
      await ctx.db.patch(p._id, { escalatedAt: now });
      const gms = await venueManagers(ctx, p.venueId, ["gm"]);
      const venue = await ctx.db.get(p.venueId);
      const to = gms.length ? gms : venue ? await corporateOf(ctx, venue.companyId, ["director"]) : [];
      await enqueue(ctx, to.filter((u) => u._id !== p.userId).map((u) => u._id), { topic: "escalation", key: "warningEscalated", url: "/manage/warnings" });
      await audit(ctx, { venueId: p.venueId, action: "warning.escalated", entity: "warningProposals", entityId: p._id, meta: { to: to.map((u) => u._id) } });
      escalated += 1;
    }
    return { escalated };
  },
});

/** Daily (crons.ts): director and owner digest, venues that need action and new Review states. Generic text only. */
export const digest = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let sent = 0;
    for (const company of await ctx.db.query("companies").collect()) {
      const t = company.thresholds.warnings;
      const venues = await ctx.db
        .query("venues")
        .withIndex("by_company", (q) => q.eq("companyId", company._id))
        .collect();
      let review = 0;
      let action = 0;
      for (const venue of venues.filter((x) => x.active)) {
        const recent = await ctx.db
          .query("warnings")
          .withIndex("by_venue_at", (q) => q.eq("venueId", venue._id).gte("at", now - t.windowDays * DAY_MS))
          .collect();
        let inReview = 0;
        const seen = new Set<string>();
        for (const w of recent) {
          if (seen.has(w.userId)) continue;
          seen.add(w.userId);
          if (warningState(await warningsOf(ctx, w.userId), now, t) === "review") {
            inReview += 1;
            if (w.at > now - DAY_MS) review += 1;
          }
        }
        const closes = await ctx.db
          .query("shifts")
          .withIndex("by_venue_date", (q) => q.eq("venueId", venue._id))
          .order("desc")
          .take(6);
        const unreviewed = closes.some((s) => s.autoClosedAt && !s.reviewedAt && now - s.autoClosedAt < 7 * DAY_MS);
        if (inReview > 0 || unreviewed) action += 1;
      }
      if (!review && !action) continue;
      const to = (await corporateOf(ctx, company._id)).map((o) => o._id);
      sent += await enqueue(ctx, to, { topic: "warning", key: "warningDigest", vars: { review, action }, url: "/company" });
    }
    return { sent };
  },
});

export type WarningView = Awaited<ReturnType<typeof present>>;
