// Announcements with read receipts (BLUEPRINT 2.2). Extended by the messages module.
import { query } from "./_generated/server";
import { getUser } from "./lib/auth";

/** Unread messages for the header badge. Zero when signed out (the header renders before the gate resolves). */
export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx);
    if (!user) return 0;
    const reads = await ctx.db
      .query("messageReads")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    return reads.filter((r) => !r.readAt).length;
  },
});
