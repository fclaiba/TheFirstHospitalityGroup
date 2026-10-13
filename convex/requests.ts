// Floor requests (ADR 0013, amended by 0018 and 0026): water, clear and help only, routed to roles, never to a named
// person. Water and clear go to the bussers and runners of the table's section and widen after 90 s; help goes to the
// leads and managers on duty and is never rate limited. Not a chat.
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { actorCan, requireCan, requireUser } from "./lib/auth";
import type { Actor } from "./lib/auth";
import { appError } from "./lib/errors";
import { enqueue } from "./lib/notify";
import { rateLimit } from "./lib/rateLimit";
import { getShift, requireLiveShift, rosterOf, sectionsByUser } from "./lib/shift";
import { asPlan, nameOf, planOf } from "./lib/service";
import { parseOrThrow } from "./lib/validate";
import { requestInput } from "../schemas";
import { ESCALATE_AFTER_MS, REQUESTS_PER_HOUR, escalationDue, escalationRecipients, isOpenStatus, routeRequest, transition } from "../lib/domain/requests";
import type { RosterEntry } from "../lib/domain/requests";
import { sectionOf } from "../lib/domain/floor";
import type { RequestKind } from "../lib/domain/types";

type Ctx = QueryCtx | MutationCtx;

async function rosterEntries(ctx: Ctx, shift: Doc<"shifts">): Promise<RosterEntry[]> {
  const roster = await rosterOf(ctx, shift);
  const sections = await sectionsByUser(ctx, shift._id);
  return roster.map((r) => ({ userId: r.user._id, position: r.position, sectionIds: sections.get(r.user._id) ?? [], onDuty: true }));
}

async function enrich(ctx: Ctx, r: Doc<"requests">) {
  return {
    _id: r._id,
    kind: r.kind,
    table: r.table ?? null,
    sectionId: r.sectionId ?? null,
    note: r.note ?? null,
    status: r.status,
    at: r.at,
    escalated: !!r.escalatedAt,
    byName: (await nameOf(ctx, r.createdBy)) ?? "",
    claimedByName: await nameOf(ctx, r.claimedBy),
    mine: false,
  };
}

async function loadRequest(ctx: Ctx, actor: Actor, requestId: Id<"requests">): Promise<Doc<"requests">> {
  const r = await ctx.db.get(requestId);
  if (!r) throw appError("NOT_FOUND");
  await getShift(ctx, actor, r.shiftId);
  return r;
}

const notifyKey = (kind: RequestKind, table?: string) => (kind === "help" ? (table ? "help" : "helpNoTable") : kind);

export const create = mutation({
  args: { shiftId: v.id("shifts"), kind: v.string(), table: v.optional(v.string()), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const p = parseOrThrow(requestInput, args);
    if (!actorCan(actor, p.kind === "help" ? "requests.help" : "requests.service")) throw appError("FORBIDDEN");
    const shift = await requireLiveShift(ctx, actor, args.shiftId);
    // Help is never rate limited (BLUEPRINT 7.8).
    if (p.kind !== "help") await rateLimit(ctx, `req:${actor._id}`, REQUESTS_PER_HOUR, 3600_000);
    const sectionId = p.table ? (sectionOf(p.table, asPlan(await planOf(ctx, shift.venueId)))?.id ?? undefined) : undefined;
    const roster = await rosterEntries(ctx, shift);
    const recipients = routeRequest(p.kind, sectionId, roster, actor._id) as Id<"users">[];
    const now = Date.now();
    const requestId = await ctx.db.insert("requests", {
      venueId: shift.venueId,
      shiftId: shift._id,
      kind: p.kind,
      table: p.table,
      sectionId,
      note: p.note,
      createdBy: actor._id,
      status: "open",
      recipients,
      at: now,
    });
    await enqueue(ctx, recipients, {
      topic: p.kind === "help" ? "help" : "request",
      key: notifyKey(p.kind, p.table),
      vars: { table: p.table ?? "", name: actor.name },
      url: p.kind === "help" ? "/lead/floor" : "/section",
      urgent: p.kind === "help",
    });
    await ctx.db.insert("analyticsEvents", { name: "request_created", userId: actor._id, venueId: shift.venueId, props: { kind: p.kind }, at: now });
    await ctx.scheduler.runAfter(ESCALATE_AFTER_MS, internal.requests.escalate, { requestId });
    return { requestId, recipients: recipients.length };
  },
});

/** "I'm on it": the first receiver wins; a second claim answers REQUEST_CLOSED. */
export const claim = mutation({
  args: { requestId: v.id("requests") },
  handler: async (ctx, { requestId }) => {
    const actor = await requireUser(ctx);
    const r = await loadRequest(ctx, actor, requestId);
    if (!r.recipients.includes(actor._id) && !actorCan(actor, "requests.queue")) throw appError("FORBIDDEN");
    const next = transition(r.status, "claim");
    if (next === "REQUEST_CLOSED") throw appError("REQUEST_CLOSED");
    await ctx.db.patch(r._id, { status: next, claimedBy: actor._id, claimedAt: Date.now() });
    return { ok: true };
  },
});

export const done = mutation({
  args: { requestId: v.id("requests") },
  handler: async (ctx, { requestId }) => {
    const actor = await requireUser(ctx);
    const r = await loadRequest(ctx, actor, requestId);
    const allowed = r.claimedBy === actor._id || (!r.claimedBy && r.recipients.includes(actor._id)) || actorCan(actor, "requests.queue") || r.createdBy === actor._id;
    if (!allowed) throw appError(r.claimedBy ? "REQUEST_CLOSED" : "FORBIDDEN");
    const next = transition(r.status, "done");
    if (next === "REQUEST_CLOSED") throw appError("REQUEST_CLOSED");
    const now = Date.now();
    await ctx.db.patch(r._id, { status: next, doneAt: now, claimedBy: r.claimedBy ?? actor._id, claimedAt: r.claimedAt ?? now });
    return { ok: true };
  },
});

export const cancel = mutation({
  args: { requestId: v.id("requests") },
  handler: async (ctx, { requestId }) => {
    const actor = await requireUser(ctx);
    const r = await loadRequest(ctx, actor, requestId);
    if (r.createdBy !== actor._id && !actorCan(actor, "requests.queue")) throw appError("FORBIDDEN");
    const next = transition(r.status, "cancel");
    if (next === "REQUEST_CLOSED") throw appError("REQUEST_CLOSED");
    await ctx.db.patch(r._id, { status: next, doneAt: Date.now() });
    return { ok: true };
  },
});

/** The live queue: what I receive; leads and managers see every open request of the shift. Help first. */
export const queue = query({
  args: { shiftId: v.id("shifts") },
  handler: async (ctx, { shiftId }) => {
    const actor = await requireUser(ctx);
    const shift = await getShift(ctx, actor, shiftId);
    const all = actorCan(actor, "requests.queue");
    const out = [];
    for (const status of ["open", "claimed"] as const) {
      for (const r of await ctx.db
        .query("requests")
        .withIndex("by_shift_status", (q) => q.eq("shiftId", shift._id).eq("status", status))
        .collect()) {
        if (!all && !r.recipients.includes(actor._id) && r.claimedBy !== actor._id) continue;
        out.push({ ...(await enrich(ctx, r)), mine: r.claimedBy === actor._id });
      }
    }
    return out.sort((a, b) => Number(b.kind === "help") - Number(a.kind === "help") || a.at - b.at);
  },
});

/** My own requests in a shift, newest first, so I see "Pedro is on it" live. */
export const mine = query({
  args: { shiftId: v.id("shifts") },
  handler: async (ctx, { shiftId }) => {
    const actor = await requireUser(ctx);
    const shift = await getShift(ctx, actor, shiftId);
    const rows = (
      await ctx.db
        .query("requests")
        .withIndex("by_creator", (q) => q.eq("createdBy", actor._id))
        .order("desc")
        .take(50)
    ).filter((r) => r.shiftId === shift._id);
    const out = [];
    for (const r of rows) out.push({ ...(await enrich(ctx, r)), mine: true });
    return out;
  },
});

/** Every request of a shift (leads and managers): the history behind the close. */
export const forShift = query({
  args: { shiftId: v.id("shifts") },
  handler: async (ctx, { shiftId }) => {
    const actor = await requireCan(ctx, "requests.queue");
    const shift = await getShift(ctx, actor, shiftId);
    const rows = await ctx.db
      .query("requests")
      .withIndex("by_shift_status", (q) => q.eq("shiftId", shift._id))
      .collect();
    const out = [];
    for (const r of rows.sort((a, b) => b.at - a.at)) out.push(await enrich(ctx, r));
    return out;
  },
});

/** Scheduled 90 s after a request: still unclaimed widens to every receiver and the managers on duty. */
export const escalate = internalMutation({
  args: { requestId: v.id("requests") },
  handler: async (ctx, { requestId }) => {
    const r = await ctx.db.get(requestId);
    if (!r || !isOpenStatus(r.status)) return { escalated: false };
    if (!escalationDue(r, Date.now())) return { escalated: false };
    const shift = await ctx.db.get(r.shiftId);
    if (!shift) return { escalated: false };
    const roster = await rosterEntries(ctx, shift);
    const wider = escalationRecipients(r.kind, roster, r.createdBy) as Id<"users">[];
    const added = wider.filter((id) => !r.recipients.includes(id));
    await ctx.db.patch(r._id, { escalatedAt: Date.now(), recipients: [...r.recipients, ...added] });
    await enqueue(ctx, [...r.recipients, ...added], { topic: r.kind === "help" ? "help" : "request", key: "escalated", vars: { table: r.table ?? "" }, url: "/section", urgent: r.kind === "help" });
    return { escalated: true, added: added.length };
  },
});
