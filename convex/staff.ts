// Staff accounts and the career ladder (ADR 0003, 0020): managers create and reset staff and leads of their venues,
// never managers; the owner manages everybody. Each account has a primary position, enabled positions and a dated
// history. Promotions are proposed (GM, or a lead for their own team) and approved by the director or the owner.
// Temporary passwords force a change at first sign-in. Deactivation ends every session.
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { actorCan, actorSupervises, requireCan, requireUser, requireVenue } from "./lib/auth";
import type { Actor } from "./lib/auth";
import { appError } from "./lib/errors";
import { audit } from "./lib/audit";
import { enqueue } from "./lib/notify";
import { corporateOf } from "./lib/shift";
import { parseOrThrow } from "./lib/validate";
import { promoteInput, promotionDecisionInput, staffInput } from "../schemas";
import { hashPassword, tempPassword } from "../lib/domain/password";
import { manageablePositions } from "../lib/domain/permissions";
import { areaOf, isCorporate, layerOf, rankOf, servesAlcohol } from "../lib/domain/positions";
import { POSITIONS } from "../lib/domain/types";
import type { Position } from "../lib/domain/types";
import { nyDateKey } from "../lib/time";

type Ctx = QueryCtx | MutationCtx;

const DEFAULT_NOTIFY = { schedule: true, messages: true, warnings: true, tasks: true, requests: true };

async function venuesOf(ctx: Ctx, userId: Id<"users">): Promise<Id<"venues">[]> {
  return (
    await ctx.db
      .query("assignments")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect()
  ).map((a) => a.venueId);
}

/** May the actor manage this person? Corporate (by the matrix) anyone below them; managers only staff and leads who share a venue. */
async function requireManages(ctx: Ctx, actor: Actor, target: Doc<"users">) {
  if (target.companyId !== actor.companyId) throw appError("NOT_FOUND");
  const allowed = manageablePositions(actor.primaryPosition, POSITIONS);
  if (!allowed.includes(target.primaryPosition)) throw appError("FORBIDDEN");
  if (isCorporate(actor.primaryPosition)) return;
  const theirs = await venuesOf(ctx, target._id);
  if (!theirs.some((id) => actor.venueIds.includes(id))) throw appError("VENUE_FORBIDDEN");
}

async function present(ctx: Ctx, u: Doc<"users">) {
  return {
    id: u._id,
    _id: u._id,
    name: u.name,
    username: u.username,
    email: u.email ?? null,
    locale: u.locale,
    primaryPosition: u.primaryPosition,
    enabledPositions: u.enabledPositions,
    title: u.title ?? null,
    area: areaOf(u.primaryPosition),
    layer: layerOf(u.primaryPosition),
    active: u.active,
    mustChangePassword: u.mustChangePassword,
    legalAgeConfirmed: !!u.legalAgeConfirmedAt,
    venueIds: await venuesOf(ctx, u._id),
    locked: !!u.lockedUntil && u.lockedUntil > Date.now(),
  };
}

/** Team of a venue (managers) or of the company (corporate), with positions and venues. Never password data. */
export const list = query({
  args: { venueId: v.optional(v.id("venues")), includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "team.view");
    if (args.venueId) requireVenue(actor, args.venueId);
    const venueIds = args.venueId ? [args.venueId] : actor.venueIds;
    const ids = new Set<Id<"users">>();
    for (const venueId of venueIds) {
      for (const a of await ctx.db
        .query("assignments")
        .withIndex("by_venue", (q) => q.eq("venueId", venueId))
        .collect())
        ids.add(a.userId);
    }
    if (isCorporate(actor.primaryPosition) && !args.venueId) {
      for (const p of ["owner", "director"] as const) {
        for (const u of await ctx.db
          .query("users")
          .withIndex("by_company_position", (q) => q.eq("companyId", actor.companyId).eq("primaryPosition", p))
          .collect())
          ids.add(u._id);
      }
    }
    const out = [];
    for (const id of ids) {
      const u = await ctx.db.get(id);
      if (!u || u.isDev || (!u.active && !args.includeInactive)) continue;
      out.push(await present(ctx, u));
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** One person with their position history (team view). */
export const get = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const actor = await requireCan(ctx, "team.view");
    const u = await ctx.db.get(userId);
    if (!u || u.companyId !== actor.companyId) throw appError("NOT_FOUND");
    const theirs = await venuesOf(ctx, u._id);
    if (!isCorporate(actor.primaryPosition) && !theirs.some((id) => actor.venueIds.includes(id))) throw appError("VENUE_FORBIDDEN");
    return { ...(await present(ctx, u)), history: await historyOf(ctx, u._id) };
  },
});

async function historyOf(ctx: Ctx, userId: Id<"users">) {
  const rows = await ctx.db
    .query("positionHistory")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .order("desc")
    .collect();
  const out = [];
  for (const r of rows) {
    const proposer = await ctx.db.get(r.proposedBy);
    const approver = r.approvedBy ? await ctx.db.get(r.approvedBy) : null;
    out.push({
      _id: r._id,
      fromPosition: r.fromPosition ?? null,
      toPosition: r.toPosition,
      effectiveFrom: r.effectiveFrom,
      status: r.status,
      proposedBy: proposer?.name ?? "",
      approvedBy: approver?.name ?? null,
      note: r.note ?? null,
      at: r.at,
    });
  }
  return out;
}

/** Position history of a person: the person themselves, or anyone who sees the team. */
export const history = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const actor = await requireUser(ctx);
    if (actor._id !== userId) {
      if (!actorCan(actor, "team.view")) throw appError("FORBIDDEN");
      const u = await ctx.db.get(userId);
      if (!u || u.companyId !== actor.companyId) throw appError("NOT_FOUND");
      const theirs = await venuesOf(ctx, u._id);
      if (!isCorporate(actor.primaryPosition) && !theirs.some((id) => actor.venueIds.includes(id))) throw appError("VENUE_FORBIDDEN");
    }
    return await historyOf(ctx, userId);
  },
});

export const upsert = mutation({
  args: {
    userId: v.optional(v.id("users")),
    name: v.string(),
    username: v.string(),
    email: v.optional(v.string()),
    primaryPosition: v.string(),
    enabledPositions: v.array(v.string()),
    title: v.optional(v.string()),
    venueIds: v.array(v.id("venues")),
    locale: v.string(),
    legalAgeConfirmed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "staff.manage");
    const p = parseOrThrow(staffInput, args);
    const allowed = manageablePositions(actor.primaryPosition, POSITIONS);
    const enabled = [...new Set(p.enabledPositions.filter((x) => x !== p.primaryPosition))] as Position[];
    if (!allowed.includes(p.primaryPosition) || enabled.some((x) => !allowed.includes(x))) throw appError("FORBIDDEN");
    for (const id of args.venueIds) requireVenue(actor, id);
    const taken = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", p.username))
      .unique();
    if (taken && taken._id !== args.userId) throw appError("USERNAME_TAKEN", undefined, { fields: { username: "taken" } });
    const alcohol = [p.primaryPosition, ...enabled].some(servesAlcohol);
    const now = Date.now();

    if (args.userId) {
      const target = await ctx.db.get(args.userId);
      if (!target) throw appError("NOT_FOUND");
      await requireManages(ctx, actor, target);
      // Legal age for alcohol is confirmed by the manager when enabling such a position (BLUEPRINT 10).
      if (alcohol && !target.legalAgeConfirmedAt && !p.legalAgeConfirmed) throw appError("INVALID_INPUT", undefined, { fields: { legalAgeConfirmed: "required" } });
      const positionsChanged = target.primaryPosition !== p.primaryPosition || target.enabledPositions.join() !== enabled.join();
      await ctx.db.patch(target._id, {
        name: p.name,
        username: p.username,
        email: p.email,
        primaryPosition: p.primaryPosition,
        enabledPositions: enabled,
        title: p.title,
        locale: p.locale,
        ...(alcohol && !target.legalAgeConfirmedAt ? { legalAgeConfirmedAt: now } : {}),
      });
      if (positionsChanged) {
        await audit(ctx, { actorId: actor._id, action: "staff.positions_changed", entity: "users", entityId: target._id, meta: { from: { primary: target.primaryPosition, enabled: target.enabledPositions }, to: { primary: p.primaryPosition, enabled } } });
        if (target.primaryPosition !== p.primaryPosition) {
          await ctx.db.insert("positionHistory", { userId: target._id, companyId: target.companyId, fromPosition: target.primaryPosition, toPosition: p.primaryPosition, effectiveFrom: nyDateKey(now), status: "approved", proposedBy: actor._id, approvedBy: actor._id, note: "Changed in the staff form", at: now, decidedAt: now });
        }
      }
      await syncAssignments(ctx, actor, target._id, args.venueIds);
      await audit(ctx, { actorId: actor._id, action: "staff.updated", entity: "users", entityId: target._id });
      return { userId: target._id, tempPassword: null };
    }
    if (alcohol && !p.legalAgeConfirmed) throw appError("INVALID_INPUT", undefined, { fields: { legalAgeConfirmed: "required" } });
    const temp = tempPassword();
    const userId = await ctx.db.insert("users", {
      companyId: actor.companyId,
      username: p.username,
      email: p.email,
      name: p.name,
      primaryPosition: p.primaryPosition,
      enabledPositions: enabled,
      title: p.title,
      active: true,
      passwordHash: await hashPassword(temp),
      mustChangePassword: true,
      failedLogins: 0,
      sessionVersion: 0,
      locale: p.locale,
      largeText: false,
      theme: "light",
      notifyPrefs: DEFAULT_NOTIFY,
      legalAgeConfirmedAt: alcohol ? now : undefined,
      createdAt: now,
    });
    await ctx.db.insert("positionHistory", { userId, companyId: actor.companyId, toPosition: p.primaryPosition, effectiveFrom: nyDateKey(now), status: "approved", proposedBy: actor._id, approvedBy: actor._id, at: now, decidedAt: now });
    await syncAssignments(ctx, actor, userId, args.venueIds);
    await audit(ctx, { actorId: actor._id, action: "staff.created", entity: "users", entityId: userId, meta: { primaryPosition: p.primaryPosition, enabled, legalAgeConfirmed: p.legalAgeConfirmed ?? null } });
    return { userId, tempPassword: temp };
  },
});

async function syncAssignments(ctx: MutationCtx, actor: Actor, userId: Id<"users">, venueIds: Id<"venues">[]) {
  const rows = await ctx.db
    .query("assignments")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  for (const r of rows) {
    // A manager only touches assignments to their own venues.
    if (!venueIds.includes(r.venueId) && (isCorporate(actor.primaryPosition) || actor.venueIds.includes(r.venueId))) await ctx.db.delete(r._id);
  }
  for (const venueId of venueIds) {
    if (!rows.some((r) => r.venueId === venueId)) await ctx.db.insert("assignments", { userId, venueId, since: Date.now() });
  }
  await audit(ctx, { actorId: actor._id, action: "staff.assigned", entity: "users", entityId: userId, meta: { venueIds } });
}

export const resetPassword = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "staff.manage");
    const target = await ctx.db.get(args.userId);
    if (!target) throw appError("NOT_FOUND");
    await requireManages(ctx, actor, target);
    const temp = tempPassword();
    await ctx.db.patch(target._id, {
      passwordHash: await hashPassword(temp),
      mustChangePassword: true,
      failedLogins: 0,
      lockedUntil: undefined,
      sessionVersion: target.sessionVersion + 1,
    });
    await audit(ctx, { actorId: actor._id, action: "auth.password_reset", entity: "users", entityId: target._id });
    return { tempPassword: temp };
  },
});

/** "Left the company": inactive, every session ends at once; records stay attributed by name (BLUEPRINT 8.4). */
export const deactivate = mutation({
  args: { userId: v.id("users"), active: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "staff.manage");
    const target = await ctx.db.get(args.userId);
    if (!target) throw appError("NOT_FOUND");
    if (target._id === actor._id) throw appError("FORBIDDEN");
    await requireManages(ctx, actor, target);
    const active = args.active ?? false;
    await ctx.db.patch(target._id, { active, sessionVersion: target.sessionVersion + 1, deactivatedAt: active ? undefined : Date.now() });
    await audit(ctx, { actorId: actor._id, action: "staff.deactivated", entity: "users", entityId: target._id, meta: { active } });
    return { ok: true };
  },
});

/** The venue of a person that the actor shares (for chain checks). */
async function sharedVenue(ctx: Ctx, actor: Actor, target: Doc<"users">): Promise<Id<"venues"> | null> {
  const theirs = await venuesOf(ctx, target._id);
  if (isCorporate(actor.primaryPosition)) return theirs[0] ?? null;
  return theirs.find((id) => actor.venueIds.includes(id)) ?? null;
}

/**
 * Proposes a promotion (BLUEPRINT 2.5): the GM, or a lead for their own team. The director approves; when the
 * director or the owner proposes, it is approved at once. Nothing changes until it is approved.
 */
export const promote = mutation({
  args: { userId: v.id("users"), toPosition: v.string(), effectiveFrom: v.string(), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "staff.promote_propose");
    const p = parseOrThrow(promoteInput, args);
    const target = await ctx.db.get(args.userId);
    if (!target || !target.active || target.companyId !== actor.companyId) throw appError("NOT_FOUND");
    if (target._id === actor._id || p.toPosition === "dev" || p.toPosition === target.primaryPosition) throw appError("FORBIDDEN");
    const venueId = await sharedVenue(ctx, actor, target);
    if (!venueId) throw appError("VENUE_FORBIDDEN");
    if (!isCorporate(actor.primaryPosition) && !(await actorSupervises(ctx, actor, target, venueId))) throw appError("FORBIDDEN");
    // Leads and managers propose below their own layer; the GM proposes any venue position; corporate anything.
    if (isCorporate(p.toPosition) && !isCorporate(actor.primaryPosition)) throw appError("FORBIDDEN");
    if (actor.primaryPosition !== "gm" && !isCorporate(actor.primaryPosition) && rankOf(layerOf(p.toPosition)) >= rankOf(layerOf(actor.primaryPosition))) throw appError("FORBIDDEN");
    const pending = (
      await ctx.db
        .query("positionHistory")
        .withIndex("by_user", (q) => q.eq("userId", target._id))
        .collect()
    ).find((r) => r.status === "pending");
    if (pending) throw appError("INVALID_TRANSITION");
    const now = Date.now();
    const approveNow = actorCan(actor, "staff.promote_approve");
    const historyId = await ctx.db.insert("positionHistory", {
      userId: target._id,
      companyId: target.companyId,
      fromPosition: target.primaryPosition,
      toPosition: p.toPosition,
      effectiveFrom: p.effectiveFrom,
      status: approveNow ? "approved" : "pending",
      proposedBy: actor._id,
      approvedBy: approveNow ? actor._id : undefined,
      note: p.note,
      at: now,
      decidedAt: approveNow ? now : undefined,
    });
    await audit(ctx, { actorId: actor._id, venueId, action: "staff.promotion_proposed", entity: "positionHistory", entityId: historyId, meta: { userId: target._id, from: target.primaryPosition, to: p.toPosition } });
    if (approveNow) {
      await applyPromotion(ctx, target, p.toPosition);
      await audit(ctx, { actorId: actor._id, venueId, action: "staff.promotion_decided", entity: "positionHistory", entityId: historyId, meta: { approved: true } });
      await enqueue(ctx, [target._id], { topic: "approval", key: "promotionDecided", url: "/me" });
    } else {
      const approvers = await corporateOf(ctx, actor.companyId, ["director"]);
      const to = approvers.length ? approvers : await corporateOf(ctx, actor.companyId, ["owner"]);
      await enqueue(ctx, to.map((u) => u._id), { topic: "approval", key: "promotionProposed", vars: { name: target.name, position: p.toPosition }, url: "/company/org" });
    }
    return { historyId, status: approveNow ? "approved" : "pending" };
  },
});

async function applyPromotion(ctx: MutationCtx, target: Doc<"users">, to: Position) {
  await ctx.db.patch(target._id, { primaryPosition: to, enabledPositions: target.enabledPositions.filter((x) => x !== to) });
}

/** Director or owner: approve or reject a proposed promotion. Approval changes the primary position; history stays. */
export const decidePromotion = mutation({
  args: { historyId: v.id("positionHistory"), approve: v.boolean(), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "staff.promote_approve");
    const p = parseOrThrow(promotionDecisionInput, args);
    const row = await ctx.db.get(args.historyId);
    if (!row || row.companyId !== actor.companyId) throw appError("NOT_FOUND");
    if (row.status !== "pending") throw appError("INVALID_TRANSITION");
    if (row.proposedBy === actor._id && row.userId === actor._id) throw appError("FORBIDDEN");
    const target = await ctx.db.get(row.userId);
    if (!target) throw appError("NOT_FOUND");
    const now = Date.now();
    await ctx.db.patch(row._id, { status: p.approve ? "approved" : "denied", approvedBy: actor._id, decidedAt: now, note: p.note ?? row.note });
    if (p.approve) await applyPromotion(ctx, target, row.toPosition);
    await audit(ctx, { actorId: actor._id, action: "staff.promotion_decided", entity: "positionHistory", entityId: row._id, meta: { approved: p.approve, userId: target._id, to: row.toPosition } });
    await enqueue(ctx, [row.proposedBy, ...(p.approve ? [target._id] : [])], { topic: "approval", key: "promotionDecided", url: "/me" });
    return { ok: true };
  },
});

/** Promotions waiting for the director (company-wide). */
export const pendingPromotions = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireCan(ctx, "staff.promote_approve");
    const rows = await ctx.db
      .query("positionHistory")
      .withIndex("by_company_status", (q) => q.eq("companyId", actor.companyId).eq("status", "pending"))
      .collect();
    const out = [];
    for (const r of rows) {
      const u = await ctx.db.get(r.userId);
      const by = await ctx.db.get(r.proposedBy);
      out.push({ _id: r._id, userId: r.userId, name: u?.name ?? "", fromPosition: r.fromPosition ?? null, toPosition: r.toPosition, effectiveFrom: r.effectiveFrom, proposedBy: by?.name ?? "", note: r.note ?? null, at: r.at });
    }
    return out.sort((a, b) => a.at - b.at);
  },
});
