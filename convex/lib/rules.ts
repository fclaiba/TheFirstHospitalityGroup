// Rule sets that apply to a person (BLUEPRINT 2.6): the company set, their venue's set and the set of every position
// they may work. Shared by rules, warnings (RULE_NOT_FOR_POSITION) and the modules that ask for confirmation first.
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { needsAck, setsFor } from "../../lib/domain/rules";
import { workablePositions } from "../../lib/domain/positions";

type Ctx = QueryCtx | MutationCtx;

export async function companySets(ctx: Ctx, companyId: Id<"companies">): Promise<Doc<"ruleSets">[]> {
  const out: Doc<"ruleSets">[] = [];
  for (const scope of ["company", "venue", "position"] as const) {
    out.push(
      ...(await ctx.db
        .query("ruleSets")
        .withIndex("by_company_scope", (q) => q.eq("companyId", companyId).eq("scope", scope))
        .collect()),
    );
  }
  return out;
}

/** The sets that apply to a person at a venue. */
export async function applicableSets(ctx: Ctx, user: Doc<"users">, venueId: Id<"venues"> | undefined): Promise<Doc<"ruleSets">[]> {
  const sets = await companySets(ctx, user.companyId);
  const picked = setsFor(
    sets.map((s) => ({ ...s, venueId: s.venueId as string | undefined })),
    workablePositions(user),
    venueId,
  );
  const ids = new Set(picked.map((s) => s._id));
  return sets.filter((s) => ids.has(s._id));
}

export async function liveRules(ctx: Ctx, setId: Id<"ruleSets">): Promise<Doc<"rules">[]> {
  return (
    await ctx.db
      .query("rules")
      .withIndex("by_set", (q) => q.eq("setId", setId))
      .collect()
  )
    .filter((r) => !r.retiredAt)
    .sort((a, b) => a.sort - b.sort);
}

/** Sets the person still has to confirm at a venue (ACK_REQUIRED before their next shift). */
export async function pendingRuleSets(ctx: Ctx, user: Doc<"users">, venueId: Id<"venues"> | undefined): Promise<Doc<"ruleSets">[]> {
  const out: Doc<"ruleSets">[] = [];
  for (const set of await applicableSets(ctx, user, venueId)) {
    const acks = await ctx.db
      .query("ruleAcks")
      .withIndex("by_user_set", (q) => q.eq("userId", user._id).eq("setId", set._id))
      .collect();
    if (needsAck(set, acks)) out.push(set);
  }
  return out;
}
