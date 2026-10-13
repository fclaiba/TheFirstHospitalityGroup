// Floor plan, sections and the live map (ADR 0021). The owner or a manager loads a versioned plan with sections,
// tables and seats; leads assign today's sections; staff see their section; leads see who is where.
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireCan, requireUser, requireVenue, pickVenue } from "./lib/auth";
import { appError } from "./lib/errors";
import { audit } from "./lib/audit";
import { getShift, liveShiftOf, requireLiveShift, rosterOf } from "./lib/shift";
import { asPlan, nameOf, planOf } from "./lib/service";
import { parseOrThrow } from "./lib/validate";
import { assignSectionsInput, floorPlanInput } from "../schemas";
import { planProblem, seatCount, whoIsWhere } from "../lib/domain/floor";
import { isOpenStatus } from "../lib/domain/requests";

const table = v.object({ number: v.string(), seats: v.number(), x: v.number(), y: v.number() });

/** The current floor plan of a venue. */
export const plan = query({
  args: { venueId: v.id("venues") },
  handler: async (ctx, { venueId }) => {
    const actor = await requireUser(ctx);
    requireVenue(actor, venueId);
    const p = await planOf(ctx, venueId);
    return { venueId, version: p?.version ?? 0, sections: p?.sections ?? [], seats: seatCount(asPlan(p)) };
  },
});

export const upsertPlan = mutation({
  args: { venueId: v.id("venues"), sections: v.array(v.object({ id: v.string(), name: v.string(), tables: v.array(table) })) },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "floor.plans");
    const p = parseOrThrow(floorPlanInput, args);
    requireVenue(actor, args.venueId);
    const problem = planProblem(p);
    if (problem) throw appError("INVALID_INPUT", undefined, { fields: { sections: problem } });
    const prev = await planOf(ctx, args.venueId);
    const version = (prev?.version ?? 0) + 1;
    const planId = await ctx.db.insert("floorPlans", { venueId: args.venueId, version, sections: p.sections, updatedBy: actor._id, at: Date.now() });
    await audit(ctx, { actorId: actor._id, venueId: args.venueId, action: "floor.plan_changed", entity: "floorPlans", entityId: planId, meta: { version } });
    return { planId, version };
  },
});

/** Replaces the shift's section assignments. People and leads must be on the shift roster. */
export const assignSections = mutation({
  args: {
    shiftId: v.id("shifts"),
    assignments: v.array(v.object({ sectionId: v.string(), userIds: v.array(v.id("users")), leadId: v.optional(v.id("users")) })),
  },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "floor.sections");
    parseOrThrow(assignSectionsInput, args);
    const shift = await requireLiveShift(ctx, actor, args.shiftId);
    const sections = new Set(asPlan(await planOf(ctx, shift.venueId)).sections.map((s) => s.id));
    const roster = new Set((await rosterOf(ctx, shift)).map((r) => r.user._id as string));
    for (const a of args.assignments) {
      if (!sections.has(a.sectionId)) throw appError("INVALID_INPUT", undefined, { fields: { sectionId: "unknown" } });
      for (const id of [...a.userIds, ...(a.leadId ? [a.leadId] : [])]) if (!roster.has(id)) throw appError("INVALID_INPUT", undefined, { fields: { userIds: "not_on_shift" } });
    }
    for (const old of await ctx.db
      .query("sectionAssignments")
      .withIndex("by_shift", (q) => q.eq("shiftId", shift._id))
      .collect())
      await ctx.db.delete(old._id);
    const now = Date.now();
    for (const a of args.assignments) {
      if (!a.userIds.length && !a.leadId) continue;
      await ctx.db.insert("sectionAssignments", { shiftId: shift._id, sectionId: a.sectionId, userIds: [...new Set(a.userIds)], leadId: a.leadId, by: actor._id, at: now });
    }
    await audit(ctx, { actorId: actor._id, venueId: shift.venueId, action: "sections.assigned", entity: "shifts", entityId: shift._id, meta: { sections: args.assignments.length } });
    return { ok: true };
  },
});

/** The live map (captain, maître d', host, managers): sections with tables and seats, who is where, notes, open requests. */
export const map = query({
  args: { shiftId: v.optional(v.id("shifts")), venueId: v.optional(v.id("venues")) },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "floor.map");
    const shift = args.shiftId ? await getShift(ctx, actor, args.shiftId) : await liveShiftOf(ctx, pickVenue(actor, args.venueId));
    const venueId = shift?.venueId ?? pickVenue(actor, args.venueId);
    const p = asPlan(await planOf(ctx, venueId));
    if (!shift) return { shift: null, sections: p.sections.map((s) => ({ ...s, lead: null, people: [], notes: [], requests: 0 })), roster: [] };
    const assignments = await ctx.db
      .query("sectionAssignments")
      .withIndex("by_shift", (q) => q.eq("shiftId", shift._id))
      .collect();
    const roster = await rosterOf(ctx, shift);
    const where = whoIsWhere(
      assignments,
      roster.map((r) => ({ _id: r.user._id, name: r.user.name })),
    );
    const notes = (
      await ctx.db
        .query("tableNotes")
        .withIndex("by_shift", (q) => q.eq("shiftId", shift._id))
        .collect()
    ).filter((n) => !n.archivedAt);
    const requests: Doc<"requests">[] = [];
    for (const status of ["open", "claimed"] as const)
      requests.push(
        ...(await ctx.db
          .query("requests")
          .withIndex("by_shift_status", (q) => q.eq("shiftId", shift._id).eq("status", status))
          .collect()),
      );
    const sections = p.sections.map((s) => {
      const tables = new Set(s.tables.map((t) => t.number));
      return {
        ...s,
        lead: where[s.id]?.lead ?? null,
        people: where[s.id]?.people ?? [],
        notes: notes.filter((n) => tables.has(n.table)).map((n) => ({ _id: n._id, table: n.table, seat: n.seat ?? null, kind: n.kind, text: n.text, expoConfirmed: !!n.expoConfirmedAt })),
        requests: requests.filter((r) => r.sectionId === s.id || (r.table !== undefined && tables.has(r.table))).length,
      };
    });
    return {
      shift: { _id: shift._id, status: shift.status, service: shift.service, date: shift.date },
      sections,
      roster: roster.map((r) => ({ userId: r.user._id, name: r.user.name, position: r.position, sectionIds: assignments.filter((a) => a.userIds.includes(r.user._id) || a.leadId === r.user._id).map((a) => a.sectionId) })),
    };
  },
});

/** My section today: its tables with seats, the live notes on them, and the requests waiting for me. */
export const mySection = query({
  args: { shiftId: v.optional(v.id("shifts")), venueId: v.optional(v.id("venues")) },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "floor.view");
    const shift = args.shiftId ? await getShift(ctx, actor, args.shiftId) : await liveShiftOf(ctx, pickVenue(actor, args.venueId));
    if (!shift) return { shift: null, sections: [], lead: null, notes: [], requests: [] };
    const assignments = (
      await ctx.db
        .query("sectionAssignments")
        .withIndex("by_shift", (q) => q.eq("shiftId", shift._id))
        .collect()
    ).filter((a) => a.userIds.includes(actor._id) || a.leadId === actor._id);
    const p = asPlan(await planOf(ctx, shift.venueId));
    const mine = p.sections.filter((s) => assignments.some((a) => a.sectionId === s.id));
    const tables = new Set(mine.flatMap((s) => s.tables.map((t) => t.number)));
    const notes = (
      await ctx.db
        .query("tableNotes")
        .withIndex("by_shift", (q) => q.eq("shiftId", shift._id))
        .collect()
    )
      .filter((n) => !n.archivedAt && tables.has(n.table))
      .sort((a, b) => b.at - a.at)
      .map((n) => ({ _id: n._id, table: n.table, seat: n.seat ?? null, kind: n.kind, text: n.text, expoConfirmed: !!n.expoConfirmedAt, at: n.at }));
    const requests = [];
    for (const status of ["open", "claimed"] as const) {
      for (const r of await ctx.db
        .query("requests")
        .withIndex("by_shift_status", (q) => q.eq("shiftId", shift._id).eq("status", status))
        .collect()) {
        if (!isOpenStatus(r.status) || !(r.recipients.includes(actor._id) || r.claimedBy === actor._id)) continue;
        requests.push({ _id: r._id, kind: r.kind, table: r.table ?? null, status: r.status, byName: (await nameOf(ctx, r.createdBy)) ?? "", claimedByName: await nameOf(ctx, r.claimedBy), at: r.at });
      }
    }
    const leadId = assignments.find((a) => a.leadId)?.leadId as Id<"users"> | undefined;
    return {
      shift: { _id: shift._id, status: shift.status, service: shift.service, date: shift.date },
      sections: mine,
      lead: await nameOf(ctx, leadId),
      notes,
      requests,
    };
  },
});
