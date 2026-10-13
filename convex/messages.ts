// One-way announcements with receipts (BLUEPRINT 2.6, ADR 0026): down the chain only. Managers write to their venue,
// its areas or positions; the owner and director to any venue. No replies, no threads. Every recipient gets a
// messageReads row; "requires confirmation" announcements ask for "I read it".
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { actorCan, getUser, requireCan, requireUser, requireVenue } from "./lib/auth";
import type { Actor } from "./lib/auth";
import { appError } from "./lib/errors";
import { audit } from "./lib/audit";
import { enqueue } from "./lib/notify";
import { rateLimit } from "./lib/rateLimit";
import { parseOrThrow } from "./lib/validate";
import { messageInput } from "../schemas";
import { receiptState, recipients } from "../lib/domain/messages";
import { isCorporate } from "../lib/domain/positions";
import type { Position } from "../lib/domain/types";

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

export const send = mutation({
  args: {
    venueIds: v.array(v.id("venues")),
    positions: v.optional(v.array(v.string())),
    title: v.object({ en: v.string(), es: v.string() }),
    body: v.object({ en: v.string(), es: v.string() }),
    requiresConfirmation: v.boolean(),
    photoId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "messages.send");
    const p = parseOrThrow(messageInput, args);
    for (const id of args.venueIds) requireVenue(actor, id);
    if (args.venueIds.length > 1 && !actorCan(actor, "messages.send_all")) throw appError("FORBIDDEN");
    await rateLimit(ctx, `msg:${actor._id}`, 20, 3600_000);
    const positions = p.positions?.length ? (p.positions as Position[]) : undefined;
    const users = (
      await ctx.db
        .query("users")
        .withIndex("by_company_position", (q) => q.eq("companyId", actor.companyId))
        .collect()
    ).filter((u) => !isCorporate(u.primaryPosition));
    const assignments = [];
    for (const venueId of args.venueIds) {
      assignments.push(
        ...(await ctx.db
          .query("assignments")
          .withIndex("by_venue", (q) => q.eq("venueId", venueId))
          .collect()),
      );
    }
    const ids = recipients({ venueIds: args.venueIds, positions }, users, assignments, actor._id) as Id<"users">[];
    if (!ids.length) throw appError("NO_RECIPIENTS");
    const now = Date.now();
    const messageId = await ctx.db.insert("messages", {
      companyId: actor.companyId,
      audience: { venueIds: args.venueIds, positions },
      title: p.title,
      body: p.body,
      requiresConfirmation: p.requiresConfirmation,
      photoId: args.photoId,
      sentBy: actor._id,
      at: now,
      recipients: ids.length,
    });
    if (args.photoId) {
      const file = await ctx.db
        .query("files")
        .withIndex("by_storage", (q) => q.eq("storageId", args.photoId!))
        .unique();
      if (file) await ctx.db.patch(file._id, { attachedTo: `messages:${messageId}` });
    }
    for (const userId of ids) await ctx.db.insert("messageReads", { messageId, userId, at: now });
    const venues = await ctx.db
      .query("venues")
      .withIndex("by_company", (q) => q.eq("companyId", actor.companyId))
      .collect();
    const allVenues = venues.filter((x) => x.active).every((x) => args.venueIds.includes(x._id));
    await audit(ctx, { actorId: actor._id, venueId: args.venueIds.length === 1 ? args.venueIds[0] : undefined, action: "message.sent", entity: "messages", entityId: messageId, meta: { recipients: ids.length, allVenues, positions: positions ?? null } });
    // The title travels in each person's own language (enqueue picks the locale; the title goes as a var).
    for (const userId of ids) {
      const u = users.find((x) => x._id === userId);
      await enqueue(ctx, [userId], { topic: "message", key: "message", vars: { title: u?.locale === "es" ? p.title.es : p.title.en }, url: `/messages/${messageId}` });
    }
    return { messageId, recipients: ids.length };
  },
});

async function view(ctx: QueryCtx, m: Doc<"messages">, read: Doc<"messageReads"> | null) {
  const sender = await ctx.db.get(m.sentBy);
  return {
    _id: m._id,
    title: m.title,
    body: m.body,
    requiresConfirmation: m.requiresConfirmation,
    photoId: m.photoId ?? null,
    senderName: sender?.name ?? "",
    senderPosition: sender?.primaryPosition ?? null,
    sentBy: m.sentBy,
    at: m.at,
    recipients: m.recipients,
    readAt: read?.readAt ?? null,
    confirmedAt: read?.confirmedAt ?? null,
    audience: m.audience,
  };
}

/** My messages, newest first, with my read and confirm state. */
export const inbox = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireUser(ctx);
    const reads = await ctx.db
      .query("messageReads")
      .withIndex("by_user", (q) => q.eq("userId", actor._id))
      .order("desc")
      .take(100);
    const out = [];
    for (const r of reads) {
      const m = await ctx.db.get(r.messageId);
      if (m) out.push(await view(ctx, m, r));
    }
    return out.sort((a, b) => b.at - a.at);
  },
});

async function canManage(ctx: QueryCtx, actor: Actor, m: Doc<"messages">) {
  if (m.companyId !== actor.companyId) return false;
  if (m.sentBy === actor._id || isCorporate(actor.primaryPosition)) return true;
  return actorCan(actor, "messages.send") && m.audience.venueIds.some((id) => actor.venueIds.includes(id));
}

/** One announcement. Recipients, its sender, the venue's managers and corporate can open it. Marks nothing. */
export const get = query({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => {
    const actor = await requireUser(ctx);
    const m = await ctx.db.get(messageId);
    if (!m) throw appError("NOT_FOUND");
    const read = await ctx.db
      .query("messageReads")
      .withIndex("by_message_user", (q) => q.eq("messageId", m._id).eq("userId", actor._id))
      .unique();
    const manages = await canManage(ctx, actor, m);
    if (!read && !manages) throw appError("NOT_FOUND");
    return { ...(await view(ctx, m, read)), isRecipient: !!read, canSeeReceipts: manages };
  },
});

async function myRead(ctx: QueryCtx, userId: Id<"users">, messageId: Id<"messages">) {
  const read = await ctx.db
    .query("messageReads")
    .withIndex("by_message_user", (q) => q.eq("messageId", messageId).eq("userId", userId))
    .unique();
  if (!read) throw appError("NOT_FOUND");
  return read;
}

export const markRead = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => {
    const actor = await requireUser(ctx);
    const read = await myRead(ctx, actor._id, messageId);
    if (!read.readAt) {
      await ctx.db.patch(read._id, { readAt: Date.now() });
      await ctx.db.insert("analyticsEvents", { name: "message_read", userId: actor._id, props: { messageId }, at: Date.now() });
    }
    return { ok: true };
  },
});

export const confirm = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => {
    const actor = await requireUser(ctx);
    const m = await ctx.db.get(messageId);
    if (!m) throw appError("NOT_FOUND");
    if (!m.requiresConfirmation) throw appError("INVALID_TRANSITION");
    const read = await myRead(ctx, actor._id, messageId);
    const now = Date.now();
    await ctx.db.patch(read._id, { readAt: read.readAt ?? now, confirmedAt: read.confirmedAt ?? now });
    if (!read.confirmedAt) await ctx.db.insert("analyticsEvents", { name: "message_confirmed", userId: actor._id, props: { messageId }, at: now });
    return { ok: true };
  },
});

/** Who read and who confirmed, by name and state (sender, the venue's managers, corporate). No percentages (ADR 0027). */
export const receipts = query({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => {
    const actor = await requireUser(ctx);
    const m = await ctx.db.get(messageId);
    if (!m || !(await canManage(ctx, actor, m))) throw appError("NOT_FOUND");
    const reads = await ctx.db
      .query("messageReads")
      .withIndex("by_message", (q) => q.eq("messageId", m._id))
      .collect();
    const people = [];
    for (const r of reads) {
      const u = await ctx.db.get(r.userId);
      const done = m.requiresConfirmation ? !!r.confirmedAt : !!r.readAt;
      people.push({ userId: r.userId, name: u?.name ?? "", position: u?.primaryPosition ?? null, state: done ? ("confirmed" as const) : ("pending" as const), readAt: r.readAt ?? null, confirmedAt: r.confirmedAt ?? null });
    }
    people.sort((a, b) => Number(a.state === "confirmed") - Number(b.state === "confirmed") || a.name.localeCompare(b.name));
    return {
      requiresConfirmation: m.requiresConfirmation,
      total: reads.length,
      read: reads.filter((r) => r.readAt).length,
      confirmed: reads.filter((r) => r.confirmedAt).length,
      state: receiptState(reads, m.requiresConfirmation),
      people,
    };
  },
});

/** Announcements sent to a venue, newest first, with receipt state (managers, corporate). */
export const sent = query({
  args: { venueId: v.id("venues") },
  handler: async (ctx, { venueId }) => {
    const actor = await requireCan(ctx, "messages.send");
    requireVenue(actor, venueId);
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_company_at", (q) => q.eq("companyId", actor.companyId))
      .order("desc")
      .take(100);
    const out = [];
    for (const m of rows.filter((x) => x.audience.venueIds.includes(venueId))) {
      const reads = await ctx.db
        .query("messageReads")
        .withIndex("by_message", (q) => q.eq("messageId", m._id))
        .collect();
      out.push({ ...(await view(ctx, m, null)), read: reads.filter((r) => r.readAt).length, confirmed: reads.filter((r) => r.confirmedAt).length, total: reads.length, state: receiptState(reads, m.requiresConfirmation) });
    }
    return out;
  },
});
