// Pay records and adjustments (ADR 0017, P3). Rates are readable only by the owner and the person. Captains and
// managers propose bonuses, awards or corrections; an approver above the proposer switches them ON. Never a deduction
// for a warning or a mistake (NO_DEDUCTIONS, NY Labor Law section 193). Exports are audited. No payroll processing.
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireRole, requireUser, requireVenue } from "./lib/auth";
import type { Actor } from "./lib/auth";
import { appError } from "./lib/errors";
import { audit } from "./lib/audit";
import { enqueue } from "./lib/notify";
import { rateLimit } from "./lib/rateLimit";
import { parseOrThrow } from "./lib/validate";
import { ownersOf } from "./lib/shift";
import { adjustmentInput, payRateInput } from "../schemas";
import { adjustmentProblem, canSeePay, canSwitchOn, rateOn, toPayrollCsv } from "../lib/domain/pay";
import { nyDateKey } from "../lib/time";
import type { Role } from "../lib/domain/types";

type Ctx = QueryCtx | MutationCtx;

async function ratesOf(ctx: Ctx, userId: Id<"users">) {
  return await ctx.db
    .query("payRecords")
    .withIndex("by_user_from", (q) => q.eq("userId", userId))
    .collect();
}

async function venuesOf(ctx: Ctx, userId: Id<"users">) {
  return (
    await ctx.db
      .query("assignments")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect()
  ).map((a) => a.venueId);
}

async function adjustmentView(ctx: Ctx, a: Doc<"payAdjustments">) {
  const person = await ctx.db.get(a.userId);
  const proposer = await ctx.db.get(a.proposedBy);
  const approver = a.approvedBy ? await ctx.db.get(a.approvedBy) : null;
  const venue = await ctx.db.get(a.venueId);
  return {
    _id: a._id,
    userId: a.userId,
    personName: person?.name ?? "",
    personRole: person?.role ?? null,
    venueId: a.venueId,
    venueName: venue?.name ?? "",
    kind: a.kind,
    amountCents: a.amountCents,
    reason: a.reason,
    proposedBy: a.proposedBy,
    proposerName: proposer?.name ?? "",
    proposerRole: a.proposerRole,
    status: a.status,
    approverName: approver?.name ?? null,
    approvedAt: a.approvedAt ?? null,
    decisionNote: a.decisionNote ?? null,
    exportedAt: a.exportedAt ?? null,
    at: a.at,
  };
}

/**
 * Pay records. With a userId: that person's history (owner, or the person themself; anybody else FORBIDDEN).
 * Without: the owner's board, every active person with their current rate.
 */
export const records = query({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    if (args.userId) {
      if (!canSeePay({ id: actor._id, role: actor.role }, args.userId)) throw appError("FORBIDDEN");
      const target = await ctx.db.get(args.userId);
      if (!target || target.companyId !== actor.companyId) throw appError("NOT_FOUND");
      const history = (await ratesOf(ctx, target._id)).sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));
      return { people: [{ userId: target._id, name: target.name, role: target.role, current: rateOn(history, nyDateKey(Date.now())), history }] };
    }
    if (actor.role !== "owner" && actor.role !== "dev") throw appError("FORBIDDEN");
    const users = (
      await ctx.db
        .query("users")
        .withIndex("by_company_role", (q) => q.eq("companyId", actor.companyId))
        .collect()
    ).filter((u) => u.active && u.role !== "owner" && !u.isDev);
    const today = nyDateKey(Date.now());
    const people = [];
    for (const u of users) {
      const history = (await ratesOf(ctx, u._id)).sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));
      const venueIds = await venuesOf(ctx, u._id);
      people.push({ userId: u._id, name: u.name, role: u.role, venueIds, current: rateOn(history, today), history });
    }
    return { people: people.sort((a, b) => a.name.localeCompare(b.name)) };
  },
});

export const setRate = mutation({
  args: { userId: v.id("users"), type: v.string(), rateCents: v.number(), effectiveFrom: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, ["owner"]);
    const p = parseOrThrow(payRateInput, args);
    const target = await ctx.db.get(args.userId);
    if (!target || target.companyId !== actor.companyId) throw appError("NOT_FOUND");
    const id = await ctx.db.insert("payRecords", { userId: target._id, type: p.type, rateCents: p.rateCents, effectiveFrom: p.effectiveFrom, by: actor._id, at: Date.now() });
    await audit(ctx, { actorId: actor._id, action: "pay.rate_changed", entity: "users", entityId: target._id, meta: { type: p.type, rateCents: p.rateCents, effectiveFrom: p.effectiveFrom, recordId: id } });
    return { recordId: id };
  },
});

export const propose = mutation({
  args: { userId: v.id("users"), venueId: v.id("venues"), kind: v.string(), amountCents: v.number(), reason: v.string(), warningId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, ["captain", "manager"]);
    // The amount rules come first: a deduction is refused for what it is, whatever else is wrong (NO_DEDUCTIONS).
    const problem = adjustmentProblem({ kind: args.kind as "bonus", amountCents: args.amountCents, reason: args.reason, warningId: args.warningId });
    if (problem) throw appError(problem);
    const p = parseOrThrow(adjustmentInput, args);
    requireVenue(actor, args.venueId);
    if (args.userId === actor._id) throw appError("SELF_APPROVAL");
    const target = await ctx.db.get(args.userId);
    if (!target || !target.active || target.companyId !== actor.companyId) throw appError("NOT_FOUND");
    if (target.role === "owner" || target.role === "dev") throw appError("PAY_FORBIDDEN");
    // Captains propose for staff of their venue; managers for staff and captains of theirs.
    if (actor.role === "captain" && (target.role === "manager" || target.role === "captain")) throw appError("PAY_FORBIDDEN");
    if (actor.role === "manager" && target.role === "manager") throw appError("PAY_FORBIDDEN");
    if (!(await venuesOf(ctx, target._id)).includes(args.venueId)) throw appError("VENUE_FORBIDDEN");
    await rateLimit(ctx, `pay:${actor._id}`, 20, 3600_000);
    const proposerRole: Role = actor.role === "dev" ? "owner" : actor.role;
    const adjustmentId = await ctx.db.insert("payAdjustments", {
      userId: target._id,
      venueId: args.venueId,
      kind: p.kind,
      amountCents: p.amountCents,
      reason: p.reason,
      proposedBy: actor._id,
      proposerRole,
      status: "proposed",
      at: Date.now(),
    });
    await audit(ctx, { actorId: actor._id, venueId: args.venueId, action: "pay.proposed", entity: "payAdjustments", entityId: adjustmentId, meta: { userId: target._id, kind: p.kind, amountCents: p.amountCents } });
    const approvers = await approversFor(ctx, actor, args.venueId, proposerRole);
    await enqueue(ctx, approvers, { topic: "pay", key: "payProposed", url: proposerRole === "captain" ? "/manage/pay" : "/owner/pay" });
    return { adjustmentId };
  },
});

async function approversFor(ctx: Ctx, actor: Actor, venueId: Id<"venues">, proposerRole: Role): Promise<Id<"users">[]> {
  if (proposerRole === "captain") {
    const rows = await ctx.db
      .query("assignments")
      .withIndex("by_venue", (q) => q.eq("venueId", venueId))
      .collect();
    const out: Id<"users">[] = [];
    for (const r of rows) {
      const u = await ctx.db.get(r.userId);
      if (u && u.active && u.role === "manager" && u._id !== actor._id) out.push(u._id);
    }
    return out;
  }
  return (await ownersOf(ctx, actor.companyId)).filter((o) => o._id !== actor._id).map((o) => o._id);
}

async function decide(ctx: MutationCtx, actor: Actor, adjustmentId: Id<"payAdjustments">) {
  const a = await ctx.db.get(adjustmentId);
  if (!a) throw appError("NOT_FOUND");
  const target = await ctx.db.get(a.userId);
  if (!target || target.companyId !== actor.companyId) throw appError("NOT_FOUND");
  const problem = canSwitchOn({ id: actor._id, role: actor.role }, { proposedBy: a.proposedBy, proposerRole: a.proposerRole });
  if (problem) throw appError(problem);
  if (actor.role === "manager") requireVenue(actor, a.venueId);
  if (a.status !== "proposed") throw appError("INVALID_TRANSITION");
  return a;
}

export const switchOn = mutation({
  args: { adjustmentId: v.id("payAdjustments"), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    // Captains reach decide() too, so their own proposal answers SELF_APPROVAL and others PAY_FORBIDDEN.
    const actor = await requireRole(ctx, ["captain", "manager"]);
    const a = await decide(ctx, actor, args.adjustmentId);
    const note = args.note?.trim().slice(0, 200) || undefined;
    await ctx.db.patch(a._id, { status: "on", approvedBy: actor._id, approvedAt: Date.now(), decisionNote: note });
    await audit(ctx, { actorId: actor._id, venueId: a.venueId, action: "pay.switched_on", entity: "payAdjustments", entityId: a._id, meta: { amountCents: a.amountCents } });
    await enqueue(ctx, [a.userId], { topic: "pay", key: "payOn", url: "/me" });
    return { ok: true };
  },
});

export const reject = mutation({
  args: { adjustmentId: v.id("payAdjustments"), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    // Captains reach decide() too, so their own proposal answers SELF_APPROVAL and others PAY_FORBIDDEN.
    const actor = await requireRole(ctx, ["captain", "manager"]);
    const a = await decide(ctx, actor, args.adjustmentId);
    const note = args.note?.trim().slice(0, 200) || undefined;
    await ctx.db.patch(a._id, { status: "rejected", approvedBy: actor._id, approvedAt: Date.now(), decisionNote: note });
    await audit(ctx, { actorId: actor._id, venueId: a.venueId, action: "pay.rejected", entity: "payAdjustments", entityId: a._id });
    return { ok: true };
  },
});

/** My rate and my approved adjustments (BLUEPRINT 2.2: the employee sees their own). */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireUser(ctx);
    const history = await ratesOf(ctx, actor._id);
    const adjustments = (
      await ctx.db
        .query("payAdjustments")
        .withIndex("by_user", (q) => q.eq("userId", actor._id))
        .order("desc")
        .take(50)
    ).filter((a) => a.status === "on" || a.status === "exported");
    const out = [];
    for (const a of adjustments) out.push(await adjustmentView(ctx, a));
    return { current: rateOn(history, nyDateKey(Date.now())), adjustments: out };
  },
});

/** Proposals waiting for the caller (manager: captains' proposals in their venues; owner: everything proposed). */
export const pending = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireRole(ctx, ["manager"]);
    const rows = await ctx.db
      .query("payAdjustments")
      .withIndex("by_status", (q) => q.eq("status", "proposed"))
      .order("desc")
      .take(200);
    const out = [];
    for (const a of rows) {
      if (a.proposedBy === actor._id) continue;
      if (canSwitchOn({ id: actor._id, role: actor.role }, { proposedBy: a.proposedBy, proposerRole: a.proposerRole })) continue;
      if (actor.role === "manager" && !actor.venueIds.includes(a.venueId)) continue;
      const view = await adjustmentView(ctx, a);
      const person = await ctx.db.get(a.userId);
      if (person?.companyId === actor.companyId) out.push(view);
    }
    return out;
  },
});

/** Proposals I made, newest first. */
export const proposedByMe = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireRole(ctx, ["captain", "manager"]);
    const rows = await ctx.db
      .query("payAdjustments")
      .withIndex("by_proposer", (q) => q.eq("proposedBy", actor._id))
      .order("desc")
      .take(100);
    const out = [];
    for (const a of rows) out.push(await adjustmentView(ctx, a));
    return out;
  },
});

/** Every adjustment, newest first (owner history). */
export const history = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireRole(ctx, ["owner"]);
    const out = [];
    for (const status of ["on", "exported", "rejected"] as const) {
      for (const a of await ctx.db
        .query("payAdjustments")
        .withIndex("by_status", (q) => q.eq("status", status))
        .order("desc")
        .take(200)) {
        const person = await ctx.db.get(a.userId);
        if (person?.companyId === actor.companyId) out.push(await adjustmentView(ctx, a));
      }
    }
    return out.sort((a, b) => (b.approvedAt ?? b.at) - (a.approvedAt ?? a.at));
  },
});

/** People a captain or manager can propose for at a venue. Names and roles only: never rates. */
export const eligible = query({
  args: { venueId: v.id("venues") },
  handler: async (ctx, { venueId }) => {
    const actor = await requireRole(ctx, ["captain", "manager"]);
    requireVenue(actor, venueId);
    const rows = await ctx.db
      .query("assignments")
      .withIndex("by_venue", (q) => q.eq("venueId", venueId))
      .collect();
    const out = [];
    for (const r of rows) {
      const u = await ctx.db.get(r.userId);
      if (!u || !u.active || u._id === actor._id || u.role === "owner" || u.isDev || u.role === "manager") continue;
      if (actor.role === "captain" && u.role === "captain") continue;
      out.push({ _id: u._id, name: u.name, role: u.role, level: u.level });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** Monthly CSV for the payroll provider: adjustments switched ON in that NY month. Marks them exported; audited. */
export const exportMonth = mutation({
  args: { month: v.string() },
  handler: async (ctx, { month }) => {
    const actor = await requireRole(ctx, ["owner"]);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw appError("INVALID_INPUT", undefined, { fields: { month: "invalid" } });
    const rows = (
      await ctx.db
        .query("payAdjustments")
        .withIndex("by_status", (q) => q.eq("status", "on"))
        .collect()
    ).filter((a) => a.approvedAt !== undefined && nyDateKey(a.approvedAt).startsWith(month));
    const lines = [];
    const now = Date.now();
    for (const a of rows) {
      const person = await ctx.db.get(a.userId);
      if (!person || person.companyId !== actor.companyId) continue;
      lines.push({ name: person.name, username: person.username, kind: a.kind, amountCents: a.amountCents, reason: a.reason, approvedAt: nyDateKey(a.approvedAt!) });
      await ctx.db.patch(a._id, { status: "exported", exportedAt: now });
    }
    await audit(ctx, { actorId: actor._id, action: "pay.exported", entity: "payAdjustments", entityId: month, meta: { count: lines.length } });
    return { csv: toPayrollCsv(lines), count: lines.length };
  },
});
