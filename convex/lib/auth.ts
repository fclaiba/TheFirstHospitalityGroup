// requireUser / requireVenue / requireCan (BLUEPRINT 7.3). Called at the top of every protected function.
// Permissions come from the layer of the position worked in the shift (ADR 0020): a server covering a captain shift
// today acts as a captain; outside a planned shift, the primary position counts. Managers and corporate keep theirs.
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { appError } from "./errors";
import { formatSubject, parseSubject, sessionMatches } from "../../lib/domain/session";
import { can } from "../../lib/domain/permissions";
import type { Action } from "../../lib/domain/permissions";
import { isAtLeast, isCorporate, layerOf } from "../../lib/domain/positions";
import { chainOf, supervises } from "../../lib/domain/chain";
import type { Overrides } from "../../lib/domain/chain";
import type { Layer, Position } from "../../lib/domain/types";
import { nyDateKey } from "../../lib/time";

type Ctx = QueryCtx | MutationCtx;

export type Actor = Doc<"users"> & { venueIds: Id<"venues">[]; position: Position; layer: Layer };

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
  if (isCorporate(user.primaryPosition)) {
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

/** The position a person works today (first planned shift of the day), or their primary position. */
export async function workingPosition(ctx: Ctx, user: Doc<"users">, now = Date.now()): Promise<Position> {
  if (isAtLeast(user.primaryPosition, "manager")) return user.primaryPosition;
  const today = nyDateKey(now);
  const planned = await ctx.db
    .query("shiftsPlanned")
    .withIndex("by_user_date", (q) => q.eq("userId", user._id).eq("date", today))
    .collect();
  const live = planned.filter((s) => !s.removed).sort((a, b) => a.start.localeCompare(b.start));
  return live[0]?.position ?? user.primaryPosition;
}

/**
 * The signed-in account with its venues and working position. A person whose temporary password was never changed
 * can only read `me` and change it (ADR 0003): every other function answers PASSWORD_CHANGE_REQUIRED.
 */
export async function requireUser(ctx: Ctx, opts: { allowMustChange?: boolean } = {}): Promise<Actor> {
  const user = await getUser(ctx);
  if (!user) throw appError("UNAUTHENTICATED");
  if (user.mustChangePassword && !opts.allowMustChange) throw appError("PASSWORD_CHANGE_REQUIRED");
  const position = await workingPosition(ctx, user);
  return { ...user, venueIds: await venueIdsOf(ctx, user), position, layer: layerOf(position) };
}

/** Whether the actor may do an action, by their working position or their primary position (a promotion is never lost by covering a lower shift). */
export function actorCan(actor: Pick<Actor, "position" | "primaryPosition">, action: Action): boolean {
  return can(actor.position, action) || (isAtLeast(actor.primaryPosition, "manager") && can(actor.primaryPosition, action));
}

/** The permission check of every protected function (BLUEPRINT 7.2). */
export async function requireCan(ctx: Ctx, action: Action, opts: { allowMustChange?: boolean } = {}): Promise<Actor> {
  const actor = await requireUser(ctx, opts);
  if (!actorCan(actor, action)) throw appError("FORBIDDEN");
  return actor;
}

/** Venue isolation (ADR 0002): staff of venue A get VENUE_FORBIDDEN on venue B. Corporate sees every venue. */
export function requireVenue(actor: Actor, venueId: Id<"venues">): void {
  if (isCorporate(actor.primaryPosition)) return;
  if (!actor.venueIds.includes(venueId)) throw appError("VENUE_FORBIDDEN");
}

export const isCorporateActor = (u: { primaryPosition: Position }) => isCorporate(u.primaryPosition);

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

/** Whether a person is assigned to a venue (corporate counts as assigned everywhere in their company). */
export async function worksAt(ctx: Ctx, user: Doc<"users">, venueId: Id<"venues">): Promise<boolean> {
  if (isCorporate(user.primaryPosition)) return true;
  const rows = await ctx.db
    .query("assignments")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .collect();
  return rows.some((r) => r.venueId === venueId);
}

/** The venue's chain overrides (ADR 0026). */
export async function overridesOf(ctx: Ctx, venueId: Id<"venues">): Promise<Overrides> {
  const rows = await ctx.db
    .query("chainOverrides")
    .withIndex("by_venue", (q) => q.eq("venueId", venueId))
    .collect();
  const out: Overrides = {};
  for (const r of rows) out[r.position] = r.reportsTo;
  return out;
}

/** Whether the actor supervises the target at a venue (by the target's primary position). */
export async function actorSupervises(ctx: Ctx, actor: Actor, target: Doc<"users">, venueId: Id<"venues">): Promise<boolean> {
  if (actor._id === target._id) return false;
  const o = await overridesOf(ctx, venueId);
  return supervises(actor.position, target.primaryPosition, o) || (actor.position !== actor.primaryPosition && supervises(actor.primaryPosition, target.primaryPosition, o));
}

/** Whether the actor is in the target's chain (used by "own team" reads for leads). */
export async function inChainOf(ctx: Ctx, actor: Actor, target: Doc<"users">, venueId: Id<"venues">): Promise<boolean> {
  const o = await overridesOf(ctx, venueId);
  const chain = chainOf(target.primaryPosition, o);
  return chain.includes(actor.position) || chain.includes(actor.primaryPosition);
}
