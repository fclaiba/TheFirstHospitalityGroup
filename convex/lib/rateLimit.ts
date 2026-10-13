// Fixed-window rate limiter (BLUEPRINT 7.8), transactional inside the calling mutation.
import type { MutationCtx } from "../_generated/server";
import { appError } from "./errors";

export async function rateLimit(ctx: MutationCtx, key: string, limit: number, windowMs: number): Promise<void> {
  const now = Date.now();
  const row = await ctx.db
    .query("rateLimits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (!row || now - row.windowStart >= windowMs) {
    if (row) await ctx.db.patch(row._id, { windowStart: now, count: 1 });
    else await ctx.db.insert("rateLimits", { key, windowStart: now, count: 1 });
    return;
  }
  if (row.count >= limit) {
    throw appError("RATE_LIMITED", undefined, { retryAfterMs: windowMs - (now - row.windowStart) });
  }
  await ctx.db.patch(row._id, { count: row.count + 1 });
}

export async function nextCounter(ctx: MutationCtx, name: string): Promise<number> {
  const row = await ctx.db
    .query("counters")
    .withIndex("by_name", (q) => q.eq("name", name))
    .unique();
  if (!row) {
    await ctx.db.insert("counters", { name, value: 1 });
    return 1;
  }
  await ctx.db.patch(row._id, { value: row.value + 1 });
  return row.value + 1;
}
