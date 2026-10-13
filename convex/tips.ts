// Tip policy as configuration only (ADR 0024, P3): which positions take part, their points and the written policy that
// tipped staff confirm like a rule set. Never amounts; managers with real authority cannot be in the pool.
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireCan, requireUser, requireVenue } from "./lib/auth";
import { appError } from "./lib/errors";
import { audit } from "./lib/audit";
import { enqueue } from "./lib/notify";
import { parseOrThrow } from "./lib/validate";
import { tipPolicyInput } from "../schemas";
import { policyProblem } from "../lib/domain/tips";
import { canWork, isTipped } from "../lib/domain/positions";

async function latest(ctx: QueryCtx, venueId: Id<"venues">): Promise<Doc<"tipPolicies"> | null> {
  return await ctx.db
    .query("tipPolicies")
    .withIndex("by_venue", (q) => q.eq("venueId", venueId))
    .order("desc")
    .first();
}

/** The current policy of a venue and whether I still have to confirm it (tipped positions only). */
export const policy = query({
  args: { venueId: v.id("venues") },
  handler: async (ctx, { venueId }) => {
    const actor = await requireCan(ctx, "tips.read");
    requireVenue(actor, venueId);
    const p = await latest(ctx, venueId);
    if (!p) return null;
    const concerned = p.participants.some((x) => canWork(actor, x.position));
    const ack = await ctx.db
      .query("tipPolicyAcks")
      .withIndex("by_user_policy", (q) => q.eq("userId", actor._id).eq("policyId", p._id))
      .first();
    return {
      _id: p._id,
      venueId: p.venueId,
      participants: p.participants,
      text: p.text,
      version: p.version,
      publishedAt: p.publishedAt,
      concernsMe: concerned,
      mustAck: concerned && (!ack || ack.version < p.version),
    };
  },
});

/** Owner: publish a new version of the written policy for a venue. Counsel validates before (ADR 0024). */
export const setPolicy = mutation({
  args: { venueId: v.id("venues"), participants: v.array(v.object({ position: v.string(), points: v.number() })), text: v.object({ en: v.string(), es: v.string() }) },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "tips.manage");
    const p = parseOrThrow(tipPolicyInput, args);
    requireVenue(actor, args.venueId);
    const problem = policyProblem(p.participants);
    if (problem === "MANAGER_IN_POOL") throw appError("MANAGER_IN_POOL");
    if (problem) throw appError("INVALID_INPUT", undefined, { fields: { participants: problem } });
    if (p.participants.some((x) => !isTipped(x.position))) throw appError("INVALID_INPUT", undefined, { fields: { participants: "NOT_TIPPED" } });
    const prev = await latest(ctx, args.venueId);
    const version = (prev?.version ?? 0) + 1;
    const policyId = await ctx.db.insert("tipPolicies", { venueId: args.venueId, participants: p.participants, text: p.text, version, publishedAt: Date.now(), publishedBy: actor._id });
    await audit(ctx, { actorId: actor._id, venueId: args.venueId, action: "tips.published", entity: "tipPolicies", entityId: policyId, meta: { version, positions: p.participants.map((x) => x.position) } });
    const rows = await ctx.db
      .query("assignments")
      .withIndex("by_venue", (q) => q.eq("venueId", args.venueId))
      .collect();
    const to: Id<"users">[] = [];
    for (const r of rows) {
      const u = await ctx.db.get(r.userId);
      if (u && u.active && p.participants.some((x) => canWork(u, x.position))) to.push(u._id);
    }
    await enqueue(ctx, to, { topic: "message", key: "tipPolicy", url: "/rules" });
    return { policyId, version };
  },
});

/** A tipped person confirms they read the written policy. */
export const acknowledge = mutation({
  args: { policyId: v.id("tipPolicies"), version: v.number() },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const p = await ctx.db.get(args.policyId);
    if (!p) throw appError("NOT_FOUND");
    requireVenue(actor, p.venueId);
    if (!p.participants.some((x) => canWork(actor, x.position))) throw appError("FORBIDDEN");
    if (args.version !== p.version) throw appError("VERSION_STALE");
    const ack = await ctx.db
      .query("tipPolicyAcks")
      .withIndex("by_user_policy", (q) => q.eq("userId", actor._id).eq("policyId", p._id))
      .first();
    if (!ack) await ctx.db.insert("tipPolicyAcks", { userId: actor._id, policyId: p._id, version: p.version, at: Date.now() });
    return { ok: true };
  },
});
