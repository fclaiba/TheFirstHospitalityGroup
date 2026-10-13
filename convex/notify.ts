// Web Push subscriptions and the outbound queue bookkeeping (ADR 0006). Delivery itself is a Node action in push.ts.
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { appError } from "./lib/errors";

export const subscribe = mutation({
  args: { endpoint: v.string(), keys: v.object({ p256dh: v.string(), auth: v.string() }), ua: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    if (!/^https:\/\//.test(args.endpoint) || args.endpoint.length > 1000) throw appError("INVALID_INPUT");
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .unique();
    if (existing) await ctx.db.patch(existing._id, { userId: actor._id, keys: args.keys, ua: args.ua?.slice(0, 200) });
    else await ctx.db.insert("pushSubscriptions", { userId: actor._id, endpoint: args.endpoint, keys: args.keys, ua: args.ua?.slice(0, 200), createdAt: Date.now() });
    return { ok: true };
  },
});

export const unsubscribe = mutation({
  args: { endpoint: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx, { allowMustChange: true });
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .unique();
    if (existing && existing.userId === actor._id) await ctx.db.delete(existing._id);
    return { ok: true };
  },
});

/** My recent notifications: the in-app inbox stays the source of truth when push does not arrive (ADR 0006). */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireUser(ctx);
    const rows = await ctx.db
      .query("outbound")
      .withIndex("by_user", (q) => q.eq("userId", actor._id))
      .order("desc")
      .take(30);
    return rows.filter((r) => r.kind === "push").map((r) => ({ _id: r._id, topic: r.topic, title: r.payload.title, body: r.payload.body, url: r.payload.url, at: r.createdAt }));
  },
});

export const load = internalQuery({
  args: { id: v.id("outbound") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (!row) return null;
    const user = row.userId ? await ctx.db.get(row.userId) : null;
    const subs = row.userId
      ? await ctx.db
          .query("pushSubscriptions")
          .withIndex("by_user", (q) => q.eq("userId", row.userId!))
          .collect()
      : [];
    return { row, email: user && (user.role === "manager" || user.role === "owner") && user.emailVerifiedAt ? (user.email ?? null) : null, subs };
  },
});

export const settle = internalMutation({
  args: {
    id: v.id("outbound"),
    status: v.union(v.literal("sent"), v.literal("failed"), v.literal("skipped"), v.literal("queued")),
    attempts: v.number(),
    error: v.optional(v.string()),
    providerId: v.optional(v.string()),
    dead: v.optional(v.array(v.string())),
    ok: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: args.status, attempts: args.attempts, error: args.error?.slice(0, 300), providerId: args.providerId });
    // Expired subscriptions (404/410) are removed (BLUEPRINT 7.6).
    for (const endpoint of args.dead ?? []) {
      const s = await ctx.db
        .query("pushSubscriptions")
        .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
        .unique();
      if (s) await ctx.db.delete(s._id);
    }
    for (const endpoint of args.ok ?? []) {
      const s = await ctx.db
        .query("pushSubscriptions")
        .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
        .unique();
      if (s) await ctx.db.patch(s._id, { lastOkAt: Date.now() });
    }
  },
});
