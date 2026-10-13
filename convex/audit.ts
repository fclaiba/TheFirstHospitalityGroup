// Audit log for the owner (BLUEPRINT 7.2, 10): newest first, filtered by actor, entity and date.
import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireCan } from "./lib/auth";

export const list = query({
  args: { actorId: v.optional(v.id("users")), entity: v.optional(v.string()), from: v.optional(v.number()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireCan(ctx, "audit.read");
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
    const base = args.actorId
      ? ctx.db.query("auditLogs").withIndex("by_actor", (q) => (args.from ? q.eq("actorId", args.actorId).gte("at", args.from) : q.eq("actorId", args.actorId)))
      : ctx.db.query("auditLogs").withIndex("by_at", (q) => (args.from ? q.gte("at", args.from) : q));
    const ordered = base.order("desc");
    const rows = await (args.entity ? ordered.filter((q) => q.eq(q.field("entity"), args.entity!)) : ordered).take(limit);
    const names = new Map<string, string>();
    const venues = new Map<string, string>();
    const out = [];
    for (const r of rows) {
      if (r.actorId && !names.has(r.actorId)) names.set(r.actorId, (await ctx.db.get(r.actorId))?.name ?? "");
      if (r.venueId && !venues.has(r.venueId)) venues.set(r.venueId, (await ctx.db.get(r.venueId as Id<"venues">))?.name ?? "");
      out.push({
        _id: r._id,
        at: r.at,
        action: r.action,
        entity: r.entity,
        entityId: r.entityId,
        actor: r.actorId ? (names.get(r.actorId) ?? "") : null,
        actorId: r.actorId ?? null,
        venue: r.venueId ? (venues.get(r.venueId) ?? "") : null,
      });
    }
    return out;
  },
});
