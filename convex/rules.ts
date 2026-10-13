// House rules per role, versioned (BLUEPRINT 2.2, 2.3). A person confirms a new version before their next run
// starts (tasks.check answers RULES_NOT_ACKNOWLEDGED). Every warning points to one of these rules (ADR 0007).
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireRole, requireUser, requireVenue } from "./lib/auth";
import type { Actor } from "./lib/auth";
import { appError } from "./lib/errors";
import { audit } from "./lib/audit";
import { enqueue } from "./lib/notify";
import { parseOrThrow } from "./lib/validate";
import { ruleSetInput } from "../schemas";
import { needsAck, nextVersion, setFor, slugKey } from "../lib/domain/rules";
import type { Role } from "../lib/domain/types";

const EDITABLE_ROLES: Role[] = ["server", "runner", "busser", "bartender", "barback", "kitchen", "captain", "manager"];

async function setsForRole(ctx: QueryCtx, companyId: Id<"companies">, role: Role): Promise<Doc<"ruleSets">[]> {
  return (
    await ctx.db
      .query("ruleSets")
      .withIndex("by_role_venue", (q) => q.eq("role", role))
      .collect()
  ).filter((s) => s.companyId === companyId);
}

/** The set that applies to a role at a venue: the venue's own set wins over the company set. */
async function effectiveSet(ctx: QueryCtx, companyId: Id<"companies">, role: Role, venueId: Id<"venues"> | undefined): Promise<Doc<"ruleSets"> | null> {
  const sets = await setsForRole(ctx, companyId, role);
  const picked = setFor(
    sets.map((s) => ({ ...s, venueId: s.venueId as string | undefined })),
    role,
    venueId,
  );
  return picked ? (sets.find((s) => s._id === picked._id) ?? null) : null;
}

async function liveRules(ctx: QueryCtx, setId: Id<"ruleSets">) {
  return (
    await ctx.db
      .query("rules")
      .withIndex("by_set", (q) => q.eq("setId", setId))
      .collect()
  )
    .filter((r) => !r.retiredAt)
    .sort((a, b) => a.sort - b.sort);
}

function pickVenueFor(actor: Actor, venueId: Id<"venues"> | undefined): Id<"venues"> | undefined {
  if (venueId) {
    requireVenue(actor, venueId);
    return venueId;
  }
  return actor.venueIds[0];
}

/** My role's rules at a venue, and whether I must confirm this version. Readable before any shift. */
export const forRole = query({
  args: { venueId: v.optional(v.id("venues")) },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const venueId = pickVenueFor(actor, args.venueId);
    const set = await effectiveSet(ctx, actor.companyId, actor.role, venueId);
    if (!set) return { set: null, rules: [], mustAck: false, ackedAt: null };
    const acks = await ctx.db
      .query("ruleAcks")
      .withIndex("by_user_set", (q) => q.eq("userId", actor._id).eq("setId", set._id))
      .collect();
    const mine = acks.filter((a) => a.version >= set.version).sort((a, b) => b.at - a.at)[0];
    return {
      set: { _id: set._id, role: set.role, version: set.version, publishedAt: set.publishedAt, venueId: set.venueId ?? null },
      rules: (await liveRules(ctx, set._id)).map((r) => ({ _id: r._id, key: r.key, title: r.title, body: r.body, howTo: r.howTo })),
      mustAck: needsAck(set, acks),
      ackedAt: mine?.at ?? null,
    };
  },
});

/** Editor view (manager, owner): the effective set of every role at a venue, with its rules. */
export const sets = query({
  args: { venueId: v.id("venues") },
  handler: async (ctx, { venueId }) => {
    const actor = await requireRole(ctx, ["manager"]);
    requireVenue(actor, venueId);
    const out = [];
    for (const role of EDITABLE_ROLES) {
      const set = await effectiveSet(ctx, actor.companyId, role, venueId);
      out.push({
        role,
        set: set ? { _id: set._id, version: set.version, publishedAt: set.publishedAt, venueId: set.venueId ?? null, scope: set.venueId ? ("venue" as const) : ("company" as const) } : null,
        rules: set ? (await liveRules(ctx, set._id)).map((r) => ({ _id: r._id, key: r.key, title: r.title, body: r.body, howTo: r.howTo })) : [],
      });
    }
    return out;
  },
});

/**
 * Publishes a new version of a role's rule set. Managers publish for their venue (a venue override); the owner for
 * the company or a venue. Rules keep their id when edited (warnings keep pointing at them), removed rules are retired,
 * new ones are added. Everybody with the role must confirm the new version.
 */
export const upsertSet = mutation({
  args: {
    venueId: v.optional(v.id("venues")),
    role: v.string(),
    rules: v.array(v.object({ id: v.optional(v.string()), title: v.object({ en: v.string(), es: v.string() }), body: v.object({ en: v.string(), es: v.string() }), howTo: v.object({ en: v.string(), es: v.string() }) })),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, ["manager"]);
    const p = parseOrThrow(ruleSetInput, args);
    const role = p.role as Role;
    if (!EDITABLE_ROLES.includes(role)) throw appError("INVALID_INPUT", undefined, { fields: { role: "invalid" } });
    const isOwner = actor.role === "owner" || actor.role === "dev";
    if (!args.venueId && !isOwner) throw appError("FORBIDDEN");
    if (args.venueId) requireVenue(actor, args.venueId);

    const existing = (await setsForRole(ctx, actor.companyId, role)).find((s) => (s.venueId ?? null) === (args.venueId ?? null)) ?? null;
    // A venue's first override starts from the company set's version so the number keeps going up for people.
    const base = existing ?? (args.venueId ? await effectiveSet(ctx, actor.companyId, role, undefined) : null);
    const version = nextVersion(base);
    const now = Date.now();
    let setId: Id<"ruleSets">;
    const previous: Doc<"rules">[] = existing ? await liveRules(ctx, existing._id) : [];
    if (existing) {
      await ctx.db.patch(existing._id, { version, publishedAt: now, publishedBy: actor._id });
      setId = existing._id;
    } else {
      setId = await ctx.db.insert("ruleSets", { companyId: actor.companyId, venueId: args.venueId, role, version, publishedAt: now, publishedBy: actor._id });
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

    await audit(ctx, { actorId: actor._id, venueId: args.venueId, action: "rules.published", entity: "ruleSets", entityId: setId, meta: { role, version, rules: p.rules.length } });

    // Tell the people with this role (at the venue, or company-wide) to confirm.
    const people = (
      await ctx.db
        .query("users")
        .withIndex("by_company_role", (q) => q.eq("companyId", actor.companyId).eq("role", role))
        .collect()
    ).filter((u) => u.active && u._id !== actor._id);
    let targets = people.map((u) => u._id);
    if (args.venueId) {
      const assigned = new Set(
        (
          await ctx.db
            .query("assignments")
            .withIndex("by_venue", (q) => q.eq("venueId", args.venueId!))
            .collect()
        ).map((a) => a.userId),
      );
      targets = targets.filter((id) => assigned.has(id));
    }
    await enqueue(ctx, targets, { topic: "message", key: "rules", url: "/rules" });
    return { setId, version };
  },
});

export const acknowledge = mutation({
  args: { setId: v.id("ruleSets"), version: v.number() },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const set = await ctx.db.get(args.setId);
    if (!set || set.companyId !== actor.companyId) throw appError("NOT_FOUND");
    if (set.venueId) requireVenue(actor, set.venueId);
    if (set.role !== actor.role && actor.role !== "owner" && actor.role !== "dev") throw appError("FORBIDDEN");
    if (args.version !== set.version) throw appError("INVALID_TRANSITION");
    const acks = await ctx.db
      .query("ruleAcks")
      .withIndex("by_user_set", (q) => q.eq("userId", actor._id).eq("setId", set._id))
      .collect();
    if (!needsAck(set, acks)) return { ok: true };
    await ctx.db.insert("ruleAcks", { userId: actor._id, setId: set._id, version: set.version, at: Date.now() });
    return { ok: true };
  },
});
