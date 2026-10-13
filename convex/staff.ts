// Staff accounts (ADR 0003, 0014): managers create and reset staff of their venues, never managers or owners; the
// owner manages everybody. Temporary passwords force a change at first sign-in. Deactivation ends every session.
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireRole, requireVenue } from "./lib/auth";
import type { Actor } from "./lib/auth";
import { appError } from "./lib/errors";
import { audit } from "./lib/audit";
import { parseOrThrow } from "./lib/validate";
import { staffInput, levelSchema } from "../schemas";
import { hashPassword, tempPassword } from "../lib/domain/password";
import { ALCOHOL_ROLES, staffRoles } from "../lib/domain/permissions";
import type { Role } from "../lib/domain/types";

const DEFAULT_NOTIFY = { messages: true, warnings: true, tasks: true, requests: true };

async function venuesOf(ctx: MutationCtx, userId: Id<"users">): Promise<Id<"venues">[]> {
  return (
    await ctx.db
      .query("assignments")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect()
  ).map((a) => a.venueId);
}

/** May the actor manage this person? Owners anyone; managers only staff roles who share one of their venues. */
async function requireManages(ctx: MutationCtx, actor: Actor, target: Doc<"users">) {
  if (target.companyId !== actor.companyId) throw appError("NOT_FOUND");
  if (actor.role === "owner" || actor.role === "dev") return;
  if (!staffRoles(actor.role).includes(target.role)) throw appError("FORBIDDEN");
  const theirs = await venuesOf(ctx, target._id);
  if (!theirs.some((id) => actor.venueIds.includes(id))) throw appError("VENUE_FORBIDDEN");
}

/** Team of a venue (manager) or of the company (owner), with venues and level. Never password data. */
export const list = query({
  args: { venueId: v.optional(v.id("venues")), includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, ["manager", "captain"]);
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
    if ((actor.role === "owner" || actor.role === "dev") && !args.venueId) {
      for (const role of ["owner", "manager"] as const) {
        for (const u of await ctx.db
          .query("users")
          .withIndex("by_company_role", (q) => q.eq("companyId", actor.companyId).eq("role", role))
          .collect())
          ids.add(u._id);
      }
    }
    const out = [];
    for (const id of ids) {
      const u = await ctx.db.get(id);
      if (!u || u.isDev || (!u.active && !args.includeInactive)) continue;
      out.push({
        id: u._id,
        name: u.name,
        username: u.username,
        email: u.email ?? null,
        locale: u.locale,
        role: u.role,
        level: u.level,
        languageLevel: u.languageLevel ?? null,
        active: u.active,
        mustChangePassword: u.mustChangePassword,
        venueIds: await venuesOf(ctx as unknown as MutationCtx, u._id),
        locked: !!u.lockedUntil && u.lockedUntil > Date.now(),
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const upsert = mutation({
  args: {
    userId: v.optional(v.id("users")),
    name: v.string(),
    username: v.string(),
    email: v.optional(v.string()),
    role: v.string(),
    level: v.string(),
    venueIds: v.array(v.id("venues")),
    locale: v.string(),
    legalAgeConfirmed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, ["manager"]);
    const p = parseOrThrow(staffInput, args);
    const role = p.role as Role;
    if (!staffRoles(actor.role).includes(role)) throw appError("FORBIDDEN");
    for (const id of args.venueIds) requireVenue(actor, id);
    if (ALCOHOL_ROLES.includes(role) && !p.legalAgeConfirmed) throw appError("INVALID_INPUT", undefined, { fields: { legalAgeConfirmed: "required" } });
    const taken = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", p.username))
      .unique();
    if (taken && taken._id !== args.userId) throw appError("USERNAME_TAKEN", undefined, { fields: { username: "taken" } });

    if (args.userId) {
      const target = await ctx.db.get(args.userId);
      if (!target) throw appError("NOT_FOUND");
      await requireManages(ctx, actor, target);
      await ctx.db.patch(target._id, { name: p.name, username: p.username, email: p.email, role, level: p.level, locale: p.locale });
      if (target.role !== role) await audit(ctx, { actorId: actor._id, action: "staff.role_changed", entity: "users", entityId: target._id, meta: { from: target.role, to: role } });
      if (target.level !== p.level) await audit(ctx, { actorId: actor._id, action: "staff.level_changed", entity: "users", entityId: target._id, meta: { from: target.level, to: p.level } });
      await syncAssignments(ctx, actor, target._id, args.venueIds);
      await audit(ctx, { actorId: actor._id, action: "staff.updated", entity: "users", entityId: target._id });
      return { userId: target._id, tempPassword: null };
    }

    const temp = tempPassword();
    const userId = await ctx.db.insert("users", {
      companyId: actor.companyId,
      username: p.username,
      email: p.email,
      name: p.name,
      role,
      level: p.level,
      active: true,
      passwordHash: await hashPassword(temp),
      mustChangePassword: true,
      failedLogins: 0,
      sessionVersion: 0,
      locale: p.locale,
      largeText: false,
      theme: "system",
      notifyPrefs: DEFAULT_NOTIFY,
      createdAt: Date.now(),
    });
    await syncAssignments(ctx, actor, userId, args.venueIds);
    await audit(ctx, { actorId: actor._id, action: "staff.created", entity: "users", entityId: userId, meta: { role, legalAgeConfirmed: p.legalAgeConfirmed ?? null } });
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
    if (!venueIds.includes(r.venueId) && (actor.role === "owner" || actor.role === "dev" || actor.venueIds.includes(r.venueId))) await ctx.db.delete(r._id);
  }
  for (const venueId of venueIds) {
    if (!rows.some((r) => r.venueId === venueId)) await ctx.db.insert("assignments", { userId, venueId, since: Date.now() });
  }
  await audit(ctx, { actorId: actor._id, action: "staff.assigned", entity: "users", entityId: userId, meta: { venueIds } });
}

export const resetPassword = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, ["manager"]);
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
    const actor = await requireRole(ctx, ["manager"]);
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

export const setLevel = mutation({
  args: { userId: v.id("users"), level: v.string(), languageLevel: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, ["manager"]);
    const target = await ctx.db.get(args.userId);
    if (!target) throw appError("NOT_FOUND");
    await requireManages(ctx, actor, target);
    const level = parseOrThrow(levelSchema, args.level);
    const languageLevel = args.languageLevel ? parseOrThrow(levelSchema, args.languageLevel) : undefined;
    await ctx.db.patch(target._id, { level, languageLevel });
    await audit(ctx, { actorId: actor._id, action: "staff.level_changed", entity: "users", entityId: target._id, meta: { from: target.level, to: level, languageLevel } });
    return { ok: true };
  },
});
