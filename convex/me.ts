// My preferences (BLUEPRINT 2.2 "Settings for me"): language, Large text, theme, notifications.
import { v } from "convex/values";
import { mutation } from "./_generated/server";
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
