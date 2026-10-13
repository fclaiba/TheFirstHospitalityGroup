// House rules, versioned (BLUEPRINT 2.6): company, venue and position rule sets. A person confirms each new version
// before their next shift. Every warning points to one of these rules (ADR 0007).
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { actorCan, requireCan, requireUser, requireVenue } from "./lib/auth";
import type { Actor } from "./lib/auth";
import { appError } from "./lib/errors";
import { audit } from "./lib/audit";
import { enqueue } from "./lib/notify";
import { parseOrThrow } from "./lib/validate";
import { applicableSets, companySets, liveRules } from "./lib/rules";
import { ruleSetInput } from "../schemas";
import { needsAck, nextVersion, slugKey } from "../lib/domain/rules";
import { canWork, isCorporate } from "../lib/domain/positions";
import type { Position, RuleScope } from "../lib/domain/types";

const ruleView = (r: Doc<"rules">) => ({ _id: r._id, key: r.key, title: r.title, body: r.body, howTo: r.howTo });
const setView = (s: Doc<"ruleSets">) => ({ _id: s._id, scope: s.scope, position: s.position ?? null, venueId: s.venueId ?? null, version: s.version, publishedAt: s.publishedAt });

function pickVenueFor(actor: Actor, venueId: Id<"venues"> | undefined): Id<"venues"> | undefined {
  if (venueId) {
    requireVenue(actor, venueId);
    return venueId;
  }
  return actor.venueIds[0];
}

/** My rules at a venue: every set that applies to me, with what I still have to confirm. Readable before any shift. */
export const forMe = query({
  args: { venueId: v.optional(v.id("venues")) },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "rules.read");
    const venueId = pickVenueFor(actor, args.venueId);
    const out = [];
    for (const set of await applicableSets(ctx, actor, venueId)) {
      const acks = await ctx.db
        .query("ruleAcks")
        .withIndex("by_user_set", (q) => q.eq("userId", actor._id).eq("setId", set._id))
        .collect();
      const mine = acks.filter((a) => a.version >= set.version).sort((a, b) => b.at - a.at)[0];
      out.push({ set: setView(set), rules: (await liveRules(ctx, set._id)).map(ruleView), mustAck: needsAck(set, acks), ackedAt: mine?.at ?? null });
    }
    return { sets: out, mustAck: out.some((s) => s.mustAck) };
  },
});

/** Editor view (managers, corporate): the company set, the venue's set and every position set used at the venue. */
export const sets = query({
  args: { venueId: v.id("venues") },
  handler: async (ctx, { venueId }) => {
    const actor = await requireCan(ctx, "rules.edit");
    requireVenue(actor, venueId);
    const venue = await ctx.db.get(venueId);
    if (!venue) throw appError("NOT_FOUND");
    const all = await companySets(ctx, actor.companyId);
    const pick = (scope: RuleScope, position?: Position) => {
      const matching = all.filter((s) => s.scope === scope && (s.position ?? null) === (position ?? null));
      return scope === "company" ? (matching[0] ?? null) : (matching.find((s) => s.venueId === venueId) ?? matching.find((s) => !s.venueId) ?? null);
    };
    const rows: Array<{ scope: RuleScope; position: Position | null; set: Doc<"ruleSets"> | null }> = [
      { scope: "company", position: null, set: pick("company") },
      { scope: "venue", position: null, set: all.find((s) => s.scope === "venue" && s.venueId === venueId) ?? null },
      ...venue.positionsUsed.map((p) => ({ scope: "position" as const, position: p, set: pick("position", p) })),
    ];
    const out = [];
    for (const r of rows) {
      out.push({
        scope: r.scope,
        position: r.position,
        set: r.set ? setView(r.set) : null,
        // Managers edit venue-level copies; the company and company-wide position sets need corporate.
        editable: r.scope === "venue" || actorCan(actor, "rules.company") || (r.scope === "position" && (!r.set || r.set.venueId === venueId)),
        rules: r.set ? (await liveRules(ctx, r.set._id)).map(ruleView) : [],
      });
    }
    return out;
  },
});

async function affectedPeople(ctx: MutationCtx, actor: Actor, set: Doc<"ruleSets">): Promise<Id<"users">[]> {
  let users: Doc<"users">[] = [];
  if (set.venueId) {
    const rows = await ctx.db
      .query("assignments")
      .withIndex("by_venue", (q) => q.eq("venueId", set.venueId!))
      .collect();
    for (const r of rows) {
      const u = await ctx.db.get(r.userId);
      if (u) users.push(u);
    }
  } else {
    users = await ctx.db
      .query("users")
      .withIndex("by_company_position", (q) => q.eq("companyId", actor.companyId))
      .collect();
  }
  return users.filter((u) => u.active && !u.isDev && u._id !== actor._id && !isCorporate(u.primaryPosition) && (set.scope !== "position" || canWork(u, set.position!))).map((u) => u._id);
}

/**
 * Publishes a new version of a rule set. The company set and company-wide position sets need corporate rights
 * (owner, director); managers publish their venue's set and venue copies of position sets. Rules keep their id when
 * edited (warnings keep pointing at them), removed rules are retired. Everybody concerned confirms the new version.
 */
export const upsertSet = mutation({
  args: {
    scope: v.string(),
    venueId: v.optional(v.id("venues")),
    position: v.optional(v.string()),
    rules: v.array(v.object({ id: v.optional(v.string()), title: v.object({ en: v.string(), es: v.string() }), body: v.object({ en: v.string(), es: v.string() }), howTo: v.object({ en: v.string(), es: v.string() }) })),
  },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "rules.edit");
    const p = parseOrThrow(ruleSetInput, args);
    const venueId = p.scope === "company" ? undefined : args.venueId;
    if (venueId) requireVenue(actor, venueId);
    if (!venueId && !actorCan(actor, "rules.company")) throw appError("FORBIDDEN");
    const position = p.scope === "position" ? p.position : undefined;
    if (position === "dev" || position === "owner") throw appError("INVALID_INPUT", undefined, { fields: { position: "invalid" } });

    const all = await companySets(ctx, actor.companyId);
    const same = (s: Doc<"ruleSets">) => s.scope === p.scope && (s.position ?? null) === (position ?? null);
    const existing = all.find((s) => same(s) && (s.venueId ?? null) === (venueId ?? null)) ?? null;
    // A venue's first copy starts from the company version so the number keeps going up for people.
    const base = existing ?? (venueId ? (all.find((s) => same(s) && !s.venueId) ?? null) : null);
    const version = nextVersion(base);
    const now = Date.now();
    const previous: Doc<"rules">[] = existing ? await liveRules(ctx, existing._id) : [];
    let setId: Id<"ruleSets">;
    if (existing) {
      await ctx.db.patch(existing._id, { version, publishedAt: now, publishedBy: actor._id });
      setId = existing._id;
    } else {
      setId = await ctx.db.insert("ruleSets", { companyId: actor.companyId, scope: p.scope, venueId, position, version, publishedAt: now, publishedBy: actor._id });
    }
    const keep = new Set<string>();
    const usedKeys = new Set(previous.map((r) => r.key));
    for (const [sort, r] of p.rules.entries()) {
      const prev = r.id ? previous.find((x) => x._id === r.id) : undefined;
      if (prev) {
        keep.add(prev._id);
        await ctx.db.patch(prev._id, { title: r.title, body: r.body, howTo: r.howTo, sort, version });
      } else {
        let key = slugKey(r.title.en);
        while (usedKeys.has(key)) key = `${key}-${sort}`;
        usedKeys.add(key);
        await ctx.db.insert("rules", { setId, key, title: r.title, body: r.body, howTo: r.howTo, sort, version });
      }
    }
    for (const r of previous) if (!keep.has(r._id)) await ctx.db.patch(r._id, { retiredAt: now });
    await audit(ctx, { actorId: actor._id, venueId, action: "rules.published", entity: "ruleSets", entityId: setId, meta: { scope: p.scope, position: position ?? null, version, rules: p.rules.length } });
    const set = (await ctx.db.get(setId))!;
    await enqueue(ctx, await affectedPeople(ctx, actor, set), { topic: "message", key: "rules", url: "/rules" });
    return { setId, version };
  },
});

/** "I read the rules": confirms the current version of a set that applies to me. */
export const acknowledge = mutation({
  args: { setId: v.id("ruleSets"), version: v.number() },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const set = await ctx.db.get(args.setId);
    if (!set || set.companyId !== actor.companyId) throw appError("NOT_FOUND");
    if (set.venueId) requireVenue(actor, set.venueId);
    if (set.scope === "position" && !canWork(actor, set.position!) && !isCorporate(actor.primaryPosition)) throw appError("FORBIDDEN");
    if (args.version !== set.version) throw appError("VERSION_STALE");
    const acks = await ctx.db
      .query("ruleAcks")
      .withIndex("by_user_set", (q) => q.eq("userId", actor._id).eq("setId", set._id))
      .collect();
    if (!needsAck(set, acks)) return { ok: true };
    const now = Date.now();
    await ctx.db.insert("ruleAcks", { userId: actor._id, setId: set._id, version: set.version, at: now });
    await ctx.db.insert("analyticsEvents", { name: "rule_confirmed", userId: actor._id, venueId: set.venueId, props: { setId: set._id, version: set.version }, at: now });
    return { ok: true };
  },
});
