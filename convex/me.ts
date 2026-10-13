// My preferences (BLUEPRINT 2.6 "/me"): language, Large text, theme, notifications per type; my position history.
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { parseOrThrow } from "./lib/validate";
import { prefsInput } from "../schemas";

export const updatePrefs = mutation({
  args: { locale: v.optional(v.string()), largeText: v.optional(v.boolean()), theme: v.optional(v.string()), notify: v.optional(v.any()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, { allowMustChange: true });
    const p = parseOrThrow(prefsInput, args);
    await ctx.db.patch(user._id, {
      ...(p.locale ? { locale: p.locale } : {}),
      ...(p.largeText !== undefined ? { largeText: p.largeText } : {}),
      ...(p.theme ? { theme: p.theme } : {}),
      ...(p.notify ? { notifyPrefs: p.notify } : {}),
    });
    return { ok: true };
  },
});

/** My climb on the ladder (ADR 0020): approved steps, newest first, plus a promotion waiting for approval. */
export const history = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("positionHistory")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
    return {
      primaryPosition: user.primaryPosition,
      enabledPositions: user.enabledPositions,
      steps: rows.filter((r) => r.status === "approved").map((r) => ({ _id: r._id, fromPosition: r.fromPosition ?? null, toPosition: r.toPosition, effectiveFrom: r.effectiveFrom })),
      pending: rows.some((r) => r.status === "pending"),
    };
  },
});
