// Floor requests and approvals (ADR 0013). Water and clear go to the runners and bussers of the table's section and
// widen to the venue after 90 s; help goes to the captain and manager on duty and is never rate limited. Void and comp
// are decided by the manager on duty (a captain only with the company setting), never by the requester. The void
// itself happens in the POS; the close reconciles approved totals with the POS figures.
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireRole, requireUser } from "./lib/auth";
import type { Actor } from "./lib/auth";
import { appError } from "./lib/errors";
import { audit } from "./lib/audit";
import { enqueue } from "./lib/notify";
import { rateLimit } from "./lib/rateLimit";
import { getShift, requireLiveShift, rosterOf, sectionsByUser } from "./lib/shift";
import { parseOrThrow } from "./lib/validate";
import { decisionInput, requestInput } from "../schemas";
import {
  ESCALATE_AFTER_MS,
  REQUESTS_PER_HOUR,
  canDecide,
  canRequest,
  escalationDue,
  escalationRecipients,
  initialStatus,
  isApproval,
  isOpenStatus,
  routeRequest,
  transition,
} from "../lib/domain/requests";
import type { RosterEntry } from "../lib/domain/requests";
import type { RequestKind, RequestStatus } from "../lib/domain/types";

type Ctx = QueryCtx | MutationCtx;

async function rosterEntries(ctx: Ctx, shift: Doc<"shifts">): Promise<RosterEntry[]> {
  const roster = await rosterOf(ctx, shift);
  const sections = await sectionsByUser(ctx, shift._id);
  return roster.map((u) => ({ userId: u._id, role: u.role, sectionIds: (sections.get(u._id) ?? []) as string[], onDuty: true }));
}

async function sectionOfTable(ctx: Ctx, venueId: Id<"venues">, table: string | undefined): Promise<Id<"sections"> | undefined> {
  if (!table) return undefined;
  const sections = await ctx.db
    .query("sections")
    .withIndex("by_venue", (q) => q.eq("venueId", venueId))
    .collect();
  return sections.find((s) => s.tables.includes(table))?._id;
}

const isLead = (role: string) => role === "manager" || role === "captain" || role === "owner" || role === "dev";

async function enrich(ctx: Ctx, r: Doc<"requests">) {
  const name = async (id: Id<"users"> | undefined) => (id ? ((await ctx.db.get(id))?.name ?? "") : null);
  const section = r.sectionId ? await ctx.db.get(r.sectionId) : null;
  return {
    ...r,
    byName: (await name(r.createdBy)) ?? "",
    claimedByName: await name(r.claimedBy),
    decidedByName: await name(r.decidedBy),
    sectionName: section?.name ?? null,
  };
}

async function loadRequest(ctx: Ctx, actor: Actor, requestId: Id<"requests">): Promise<Doc<"requests">> {
  const r = await ctx.db.get(requestId);
  if (!r) throw appError("NOT_FOUND");
  await getShift(ctx, actor, r.shiftId);
  return r;
}

function notifyKey(kind: RequestKind, table?: string): string {
  if (kind === "help") return table ? "help" : "helpNoTable";
  if (isApproval(kind)) return kind === "void" ? "approvalVoid" : "approvalComp";
  return kind;
}

export const create = mutation({
  args: {
    shiftId: v.id("shifts"),
    kind: v.string(),
    table: v.optional(v.string()),
    item: v.optional(v.string()),
    amountCents: v.optional(v.number()),
    reason: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const p = parseOrThrow(requestInput, args);
    const shift = await requireLiveShift(ctx, actor, args.shiftId);
    const problem = canRequest(actor.role, actor.level, p.kind);
    if (problem) throw appError(problem);
    // Help is never rate limited (BLUEPRINT 7.8).
    if (p.kind !== "help") await rateLimit(ctx, `req:${actor._id}`, REQUESTS_PER_HOUR, 3600_000);
    const sectionId = await sectionOfTable(ctx, shift.venueId, p.table);
    const roster = await rosterEntries(ctx, shift);
    const recipients = routeRequest(p.kind, sectionId, roster, actor._id) as Id<"users">[];
    if (!recipients.length && isApproval(p.kind)) throw appError("NO_RECIPIENTS");
    const now = Date.now();
    const requestId = await ctx.db.insert("requests", {
      venueId: shift.venueId,
      shiftId: shift._id,
      kind: p.kind,
      table: p.table,
      sectionId,
      createdBy: actor._id,
      status: initialStatus(p.kind),
      recipients,
      item: isApproval(p.kind) ? p.item : undefined,
      amountCents: isApproval(p.kind) ? p.amountCents : undefined,
      reason: isApproval(p.kind) ? p.reason : undefined,
      note: p.note,
      at: now,
    });
    await enqueue(ctx, recipients, {
      topic: p.kind === "help" ? "help" : isApproval(p.kind) ? "approval" : "request",
      key: notifyKey(p.kind, p.table),
      vars: { table: p.table ?? "", name: actor.name, kind: p.kind },
      url: isApproval(p.kind) ? "/manage/requests" : "/floor",
      urgent: p.kind === "help",
    });
    if (!isApproval(p.kind)) await ctx.scheduler.runAfter(ESCALATE_AFTER_MS, internal.requests.escalate, { requestId });
    return { requestId, recipients: recipients.length };
  },
});

/** "I'm on it": the first receiver wins; a second claim answers REQUEST_CLOSED. */
export const claim = mutation({
  args: { requestId: v.id("requests") },
  handler: async (ctx, { requestId }) => {
    const actor = await requireUser(ctx);
    const r = await loadRequest(ctx, actor, requestId);
    if (isApproval(r.kind)) throw appError("FORBIDDEN");
    if (!r.recipients.includes(actor._id) && !isLead(actor.role)) throw appError("FORBIDDEN");
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
    if (isApproval(r.kind)) throw appError("FORBIDDEN");
    const allowed = r.claimedBy === actor._id || (!r.claimedBy && r.recipients.includes(actor._id)) || isLead(actor.role) || r.createdBy === actor._id;
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
    if (r.createdBy !== actor._id && actor.role !== "manager" && actor.role !== "owner" && actor.role !== "dev") throw appError("FORBIDDEN");
    const next = transition(r.status, "cancel");
    if (next === "REQUEST_CLOSED") throw appError("REQUEST_CLOSED");
    await ctx.db.patch(r._id, { status: next, doneAt: Date.now() });
    return { ok: true };
  },
});

/** Approve or deny a void or comp. Audited in the same mutation (BLUEPRINT 10). */
export const decide = mutation({
  args: { requestId: v.id("requests"), decision: v.string(), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const p = parseOrThrow(decisionInput, args);
    const r = await loadRequest(ctx, actor, args.requestId);
    const company = await ctx.db.get(actor.companyId);
    const problem = canDecide({ id: actor._id, role: actor.role }, r, { captainApprovesComps: !!company?.captainApprovesComps });
    if (problem) throw appError(problem);
    const next = transition(r.status, p.decision === "approve" ? "approve" : "deny");
    if (next === "REQUEST_CLOSED") throw appError("REQUEST_CLOSED");
    const now = Date.now();
    await ctx.db.patch(r._id, { status: next, decision: p.decision, decidedBy: actor._id, decidedAt: now, decisionNote: p.note });
    await audit(ctx, {
      actorId: actor._id,
      venueId: r.venueId,
      action: "request.decided",
      entity: "requests",
      entityId: r._id,
      meta: { kind: r.kind, decision: p.decision, amountCents: r.amountCents ?? null, table: r.table ?? null, requester: r.createdBy },
    });
    await enqueue(ctx, [r.createdBy], { topic: "approval", key: p.decision === "approve" ? "approved" : "denied", vars: { table: r.table ?? "" }, url: "/floor" });
    return { status: next as RequestStatus };
  },
});

/** The live queue for me: what I receive; captains and managers see every open request of the shift. */
export const open = query({
  args: { shiftId: v.id("shifts") },
  handler: async (ctx, { shiftId }) => {
    const actor = await requireUser(ctx);
    const shift = await getShift(ctx, actor, shiftId);
    const out = [];
    for (const status of ["pending", "open", "claimed"] as const) {
      for (const r of await ctx.db
        .query("requests")
        .withIndex("by_shift_status", (q) => q.eq("shiftId", shift._id).eq("status", status))
        .collect()) {
        if (!isLead(actor.role) && !r.recipients.includes(actor._id) && r.claimedBy !== actor._id) continue;
        out.push(await enrich(ctx, r));
      }
    }
    return out.sort((a, b) => Number(b.kind === "help") - Number(a.kind === "help") || a.at - b.at);
  },
});

/** My own requests in a shift, newest first, so I see "Ana is on it" live. */
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
    for (const r of rows) out.push(await enrich(ctx, r));
    return out;
  },
});

/** Every request of a shift (manager, owner): the queue's history and the close reconciliation. */
export const forShift = query({
  args: { shiftId: v.id("shifts") },
  handler: async (ctx, { shiftId }) => {
    const actor = await requireRole(ctx, ["captain", "manager"]);
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

/** Scheduled 90 s after a water, clear or help request: still unclaimed widens to the venue and the manager. */
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
    await enqueue(ctx, [...r.recipients, ...added], { topic: r.kind === "help" ? "help" : "request", key: "escalated", vars: { table: r.table ?? "" }, url: "/floor", urgent: r.kind === "help" });
    return { escalated: true, added: added.length };
  },
});
