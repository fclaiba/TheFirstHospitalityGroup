// Sections per shift (ADR 0013): the manager or captain assigns sections at shift open; a section lead is level A
// (ADR 0014). mySection feeds the staff Floor screen: my tables, their live notes and the requests waiting for me.
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireRole, requireUser, requireVenue } from "./lib/auth";
import { appError } from "./lib/errors";
import { audit } from "./lib/audit";
import { getShift, requireLiveShift, rosterOf } from "./lib/shift";
import { parseOrThrow } from "./lib/validate";
import { sectionInput } from "../schemas";
import { canDo } from "../lib/domain/levels";
import { isOpenStatus } from "../lib/domain/requests";

export const sections = query({
  args: { venueId: v.id("venues") },
  handler: async (ctx, { venueId }) => {
    const actor = await requireUser(ctx);
    requireVenue(actor, venueId);
    return await ctx.db
      .query("sections")
      .withIndex("by_venue", (q) => q.eq("venueId", venueId))
      .collect();
  },
});

export const upsertSection = mutation({
  args: { sectionId: v.optional(v.id("sections")), venueId: v.id("venues"), name: v.string(), tables: v.array(v.string()) },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, ["manager"]);
    const p = parseOrThrow(sectionInput, args);
    requireVenue(actor, args.venueId);
    const tables = [...new Set(p.tables.map((t) => t.trim()))];
    if (args.sectionId) {
      const section = await ctx.db.get(args.sectionId);
      if (!section || section.venueId !== args.venueId) throw appError("NOT_FOUND");
      await ctx.db.patch(section._id, { name: p.name, tables });
      return { sectionId: section._id };
    }
    const count = (
      await ctx.db
        .query("sections")
        .withIndex("by_venue", (q) => q.eq("venueId", args.venueId))
        .collect()
    ).length;
    const sectionId = await ctx.db.insert("sections", { venueId: args.venueId, name: p.name, tables, sort: count });
    return { sectionId };
  },
});

/** Replaces the shift's section assignments. People must be on the shift roster; a lead must be level A. */
export const assignSections = mutation({
  args: {
    shiftId: v.id("shifts"),
    assignments: v.array(v.object({ sectionId: v.id("sections"), userIds: v.array(v.id("users")), leadId: v.optional(v.id("users")) })),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, ["captain", "manager"]);
    const shift = await requireLiveShift(ctx, actor, args.shiftId);
    const roster = await rosterOf(ctx, shift);
    const onRoster = new Map(roster.map((u) => [u._id as string, u]));
    for (const a of args.assignments) {
      const section = await ctx.db.get(a.sectionId);
      if (!section || section.venueId !== shift.venueId) throw appError("NOT_FOUND");
      for (const id of a.userIds) if (!onRoster.has(id)) throw appError("INVALID_INPUT", undefined, { fields: { userIds: "roster" } });
      if (a.leadId) {
        const lead = onRoster.get(a.leadId);
        if (!lead || !a.userIds.includes(a.leadId)) throw appError("INVALID_INPUT", undefined, { fields: { leadId: "member" } });
        if (!canDo(lead.level, "section_lead")) throw appError("LEVEL_FORBIDDEN");
      }
    }
    const previous = await ctx.db
      .query("sectionAssignments")
      .withIndex("by_shift", (q) => q.eq("shiftId", shift._id))
      .collect();
    for (const p of previous) await ctx.db.delete(p._id);
    const now = Date.now();
    for (const a of args.assignments) {
      if (!a.userIds.length) continue;
      await ctx.db.insert("sectionAssignments", { shiftId: shift._id, sectionId: a.sectionId, userIds: [...new Set(a.userIds)], leadId: a.leadId, by: actor._id, at: now });
    }
    await audit(ctx, {
      actorId: actor._id,
      venueId: shift.venueId,
      action: "sections.assigned",
      entity: "shifts",
      entityId: shift._id,
      meta: { sections: args.assignments.map((a) => ({ sectionId: a.sectionId, people: a.userIds.length, leadId: a.leadId ?? null })) },
    });
    return { ok: true };
  },
});

/**
 * Everything the Floor screen needs for one shift: the venue's sections with who holds them, my sections, the live
 * table notes, the requests waiting for me and the roster (names and roles only).
 */
export const mySection = query({
  args: { shiftId: v.id("shifts") },
  handler: async (ctx, { shiftId }) => {
    const actor = await requireUser(ctx);
    const shift = await getShift(ctx, actor, shiftId);
    const sections = await ctx.db
      .query("sections")
      .withIndex("by_venue", (q) => q.eq("venueId", shift.venueId))
      .collect();
    const assignments = await ctx.db
      .query("sectionAssignments")
      .withIndex("by_shift", (q) => q.eq("shiftId", shift._id))
      .collect();
    const roster = await rosterOf(ctx, shift);
    const names = new Map<string, Doc<"users">>(roster.map((u) => [u._id, u]));
    const nameOf = async (id: Id<"users">) => names.get(id)?.name ?? (await ctx.db.get(id))?.name ?? "";

    const bySection = sections.map((s) => {
      const a = assignments.find((x) => x.sectionId === s._id);
      return {
        _id: s._id,
        name: s.name,
        tables: s.tables,
        sort: s.sort,
        people: (a?.userIds ?? []).map((id) => ({ id, name: names.get(id)?.name ?? "", role: names.get(id)?.role ?? "server" })),
        leadId: a?.leadId ?? null,
        mine: !!a?.userIds.includes(actor._id),
      };
    });

    const notes = (
      await ctx.db
        .query("tableNotes")
        .withIndex("by_shift", (q) => q.eq("shiftId", shift._id))
        .collect()
    ).filter((n) => !n.archivedAt);
    const noteRows = [];
    for (const n of notes.sort((a, b) => b.at - a.at)) {
      noteRows.push({ _id: n._id, table: n.table, kind: n.kind, text: n.text, at: n.at, by: n.by, byName: await nameOf(n.by), kitchenConfirmedAt: n.kitchenConfirmedAt ?? null });
    }

    const requests = [];
    for (const status of ["open", "claimed"] as const) {
      for (const r of await ctx.db
        .query("requests")
        .withIndex("by_shift_status", (q) => q.eq("shiftId", shift._id).eq("status", status))
        .collect()) {
        if (!r.recipients.includes(actor._id) && r.claimedBy !== actor._id) continue;
        requests.push({ ...r, byName: await nameOf(r.createdBy), claimedByName: r.claimedBy ? await nameOf(r.claimedBy) : null });
      }
    }
    requests.sort((a, b) => (a.kind === "help" ? -1 : 0) - (b.kind === "help" ? -1 : 0) || a.at - b.at);

    return {
      shift: { _id: shift._id, status: shift.status, service: shift.service, date: shift.date, venueId: shift.venueId },
      live: shift.status === "open" || shift.status === "closing",
      sections: bySection.sort((a, b) => a.sort - b.sort),
      mine: bySection.filter((s) => s.mine).map((s) => s._id),
      notes: noteRows,
      requests: requests.filter((r) => isOpenStatus(r.status)),
      roster: roster.map((u) => ({ id: u._id, name: u.name, role: u.role, level: u.level })).sort((a, b) => a.name.localeCompare(b.name)),
    };
  },
});
