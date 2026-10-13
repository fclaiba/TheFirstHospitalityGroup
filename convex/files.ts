// Photos (ADR 0005): direct upload to Convex storage, images only, ≤ 5 MB; the client compresses to ≤ 400 KB first.
// Records keep the storage id; URLs only come from queries that check access. Unattached uploads go after 24 h.
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireCan, requireUser } from "./lib/auth";
import type { Actor } from "./lib/auth";
import { appError } from "./lib/errors";
import { audit } from "./lib/audit";
import { rateLimit } from "./lib/rateLimit";
import { isAtLeast } from "../lib/domain/positions";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const actor = await requireUser(ctx);
    await rateLimit(ctx, `upload:${actor._id}`, 60, 3600_000);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Registers an uploaded file to its owner after checking its type and size. Returns the storage id. */
export const register = mutation({
  args: { storageId: v.id("_storage"), purpose: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const meta = await ctx.db.system.get(args.storageId);
    if (!meta) throw appError("NOT_FOUND");
    const bad = !meta.contentType || !TYPES.includes(meta.contentType) ? "FILE_TYPE" : meta.size > MAX_UPLOAD_BYTES ? "FILE_TOO_LARGE" : null;
    if (bad) {
      await ctx.storage.delete(args.storageId);
      throw appError(bad);
    }
    const purpose = ["task", "menu", "shortage", "incident", "warning", "message"].includes(args.purpose) ? args.purpose : "other";
    await ctx.db.insert("files", { storageId: args.storageId, ownerId: actor._id, purpose, createdAt: Date.now() });
    return { storageId: args.storageId };
  },
});

/**
 * Who may see a photo: its uploader, managers and above, and for menu, shortage and message photos everybody signed in.
 * Task, incident and warning evidence is private otherwise (leads see their team's task evidence).
 */
async function canSee(ctx: QueryCtx, actor: Actor, storageId: Id<"_storage">): Promise<boolean> {
  const file = await ctx.db
    .query("files")
    .withIndex("by_storage", (q) => q.eq("storageId", storageId))
    .unique();
  const leader = isAtLeast(actor.primaryPosition, "manager") || isAtLeast(actor.position, "manager");
  if (!file) return leader;
  if (file.ownerId === actor._id) return true;
  if (file.purpose === "menu" || file.purpose === "shortage" || file.purpose === "message") return true;
  if (leader) return true;
  // A warned person sees the photo of their own warning.
  if (file.purpose === "warning" && file.attachedTo?.startsWith("warnings:")) {
    const w = await ctx.db.get(file.attachedTo.slice("warnings:".length) as Id<"warnings">);
    return !!w && w.userId === actor._id;
  }
  return file.purpose === "task" && isAtLeast(actor.position, "lead");
}

export const url = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    const actor = await requireUser(ctx);
    if (!(await canSee(ctx, actor, storageId))) return null;
    return await ctx.storage.getUrl(storageId);
  },
});

/** A manager can delete a photo (for example, a guest's face in task evidence), audited (BLUEPRINT 10). */
export const remove = mutation({
  args: { storageId: v.id("_storage"), reason: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "tasks.excuse");
    const file = await ctx.db
      .query("files")
      .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
      .unique();
    if (file) await ctx.db.delete(file._id);
    await ctx.storage.delete(args.storageId);
    await audit(ctx, { actorId: actor._id, action: "file.deleted", entity: "_storage", entityId: args.storageId, meta: { reason: args.reason.slice(0, 200) } });
    return { ok: true };
  },
});

/** Daily (crons.ts): uploads never attached after 24 h. Menu photos attach through their item. */
export const gc = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 24 * 3600_000;
    const stale = await ctx.db
      .query("files")
      .withIndex("by_unattached", (q) => q.eq("attachedTo", undefined).lt("createdAt", cutoff))
      .take(200);
    for (const f of stale) {
      await ctx.storage.delete(f.storageId);
      await ctx.db.delete(f._id);
    }
    return { deleted: stale.length };
  },
});
