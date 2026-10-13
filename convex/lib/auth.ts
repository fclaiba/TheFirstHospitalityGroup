// requireUser / requireRole / requireVenue (BLUEPRINT 7.3). Called at the top of every protected function.
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { appError } from "./errors";
import { formatSubject, parseSubject, sessionMatches } from "../../lib/domain/session";
import type { Role } from "../../lib/domain/types";

type Ctx = QueryCtx | MutationCtx;

export type Actor = Doc<"users"> & { venueIds: Id<"venues">[]; effectiveRole: Role };

async function userFromSubject(ctx: Ctx, raw: string): Promise<Doc<"users"> | null> {
  const who = parseSubject(raw);
  if (!who) return null;
  const user =
    who.kind === "user"
      ? await ctx.db
          .query("users")
          .withIndex("by_username", (q) => q.eq("username", who.username))
          .unique()
      : await ctx.db
          .query("users")
          .withIndex("by_email", (q) => q.eq("email", who.email))
          .unique();
  return user && user.active && sessionMatches(user.sessionVersion, who) ? user : null;
}

export async function getUser(ctx: Ctx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return userFromSubject(ctx, identity.subject);
}

export async function venueIdsOf(ctx: Ctx, user: Doc<"users">): Promise<Id<"venues">[]> {
  if (user.role === "owner" || user.role === "dev") {
    const venues = await ctx.db
      .query("venues")
      .withIndex("by_company", (q) => q.eq("companyId", user.companyId))
      .collect();
    return venues.filter((v) => v.active).map((v) => v._id);
  }
  const rows = await ctx.db
    .query("assignments")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .collect();
  return rows.map((r) => r.venueId);
}

/**
 * The signed-in account with its venues. A person whose temporary password was never changed can only read `me` and
 * change it (ADR 0003): every other function answers PASSWORD_CHANGE_REQUIRED.
 */
export async function requireUser(ctx: Ctx, opts: { allowMustChange?: boolean } = {}): Promise<Actor> {
  const user = await getUser(ctx);
  if (!user) throw appError("UNAUTHENTICATED");
  if (user.mustChangePassword && !opts.allowMustChange) throw appError("PASSWORD_CHANGE_REQUIRED");
  return { ...user, venueIds: await venueIdsOf(ctx, user), effectiveRole: user.role };
}

/** Passes if the account holds one of the roles. Owner and dev pass every role check (BLUEPRINT 2.1). */
export async function requireRole(ctx: Ctx, roles: Role[]): Promise<Actor> {
  const user = await requireUser(ctx);
  if (user.role === "owner" || user.role === "dev" || roles.includes(user.role)) return user;
  throw appError("FORBIDDEN");
}

/** Venue isolation (ADR 0002): staff of venue A get VENUE_FORBIDDEN on venue B. */
export function requireVenue(actor: Actor, venueId: Id<"venues">): void {
  if (actor.role === "owner" || actor.role === "dev") return;
  if (!actor.venueIds.includes(venueId)) throw appError("VENUE_FORBIDDEN");
}

export const isOwner = (u: { role: Role }) => u.role === "owner" || u.role === "dev";

/** Functions only the Next.js routes may call: they carry the shared secret and get a session subject back. */
export function requireBridge(secret: string) {
  // In preview mode (no backend) lib/demo/engine.ts sets a per-tab secret; on Convex only the env var exists.
  const expected = process.env.AUTH_BRIDGE_SECRET || (globalThis as { __TF_PREVIEW_BRIDGE__?: string }).__TF_PREVIEW_BRIDGE__;
  if (!expected || secret !== expected) throw appError("FORBIDDEN");
}

export async function accountFromSubject(ctx: Ctx, raw: string): Promise<Doc<"users"> | null> {
  return userFromSubject(ctx, raw);
}

export function userSubject(u: Doc<"users">, version = u.sessionVersion): string {
  return formatSubject({ kind: "user", username: u.username, version });
}

/** A venue the actor may act on: the given one (checked) or their first assignment. */
export function pickVenue(actor: Actor, venueId?: Id<"venues">): Id<"venues"> {
  if (venueId) {
    requireVenue(actor, venueId);
    return venueId;
  }
  const first = actor.venueIds[0];
  if (!first) throw appError("VENUE_FORBIDDEN");
  return first;
}
