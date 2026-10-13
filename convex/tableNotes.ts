// Table notes and the pass view (ADR 0016, 0021): a few words on a table for this service, never contact details,
// never a guest database. Allergy notes carry the seat and go to the expo, who confirms them, and to the line cooks.
// Archived at close, deleted after 30 days.
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { actorCan, requireCan, requireUser, requireVenue, pickVenue } from "./lib/auth";
import { appError } from "./lib/errors";
import { enqueue } from "./lib/notify";
import { getShift, liveShiftOf, requireLiveShift, rosterOf } from "./lib/shift";
import { asPlan, live86s, nameOf, planOf } from "./lib/service";
import { parseOrThrow } from "./lib/validate";
import { tableNoteInput } from "../schemas";
import { expoNeeds, noteProblem, purgeDue } from "../lib/domain/tableNotes";
import type { NoteKind } from "../lib/domain/types";

export const add = mutation({
  args: { shiftId: v.id("shifts"), table: v.string(), seat: v.optional(v.number()), kind: v.string(), text: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "notes.add");
    const problem = noteProblem(args.text, args.kind as NoteKind, args.seat);
    if (problem === "CONTACT_DETAILS") throw appError("CONTACT_DETAILS", undefined, { fields: { text: "contact" } });
    if (problem === "SEAT_REQUIRED") throw appError("SEAT_REQUIRED", undefined, { fields: { seat: "required" } });
    if (problem) throw appError("INVALID_INPUT", undefined, { fields: { text: problem.toLowerCase() } });
    const p = parseOrThrow(tableNoteInput, args);
    const shift = await requireLiveShift(ctx, actor, args.shiftId);
    const noteId = await ctx.db.insert("tableNotes", { venueId: shift.venueId, shiftId: shift._id, table: p.table, seat: p.seat, kind: p.kind, text: p.text, by: actor._id, at: Date.now() });
    if (expoNeeds(p)) {
      const pass = (await rosterOf(ctx, shift)).filter((r) => r.position === "expo" || r.position === "line_cook" || r.position === "sous_chef").map((r) => r.user._id);
      await enqueue(ctx, pass, { topic: "note", key: "allergy", vars: { table: p.table }, url: "/lead/pass", urgent: true });
    }
    return { noteId };
  },
});

/** The author or a lead can take a note off the table before the close. */
export const archive = mutation({
  args: { noteId: v.id("tableNotes") },
  handler: async (ctx, { noteId }) => {
    const actor = await requireUser(ctx);
    const note = await ctx.db.get(noteId);
    if (!note) throw appError("NOT_FOUND");
    requireVenue(actor, note.venueId);
    if (note.by !== actor._id && !actorCan(actor, "floor.sections")) throw appError("FORBIDDEN");
    if (!note.archivedAt) await ctx.db.patch(note._id, { archivedAt: Date.now() });
    return { ok: true };
  },
});

/** The expo confirms an allergy note before the course leaves the pass. */
export const confirmAllergy = mutation({
  args: { noteId: v.id("tableNotes") },
  handler: async (ctx, { noteId }) => {
    const actor = await requireCan(ctx, "notes.allergy");
    const note = await ctx.db.get(noteId);
    if (!note) throw appError("NOT_FOUND");
    requireVenue(actor, note.venueId);
    if (note.kind !== "allergy") throw appError("INVALID_INPUT");
    if (note.archivedAt) throw appError("REQUEST_CLOSED");
    if (!note.expoConfirmedAt) await ctx.db.patch(note._id, { expoConfirmedAt: Date.now(), expoConfirmedBy: actor._id });
    return { ok: true };
  },
});

export const forShift = query({
  args: { shiftId: v.id("shifts") },
  handler: async (ctx, { shiftId }) => {
    const actor = await requireCan(ctx, "floor.view");
    const shift = await getShift(ctx, actor, shiftId);
    const notes = (
      await ctx.db
        .query("tableNotes")
        .withIndex("by_shift", (q) => q.eq("shiftId", shift._id))
        .collect()
    ).filter((n) => !n.archivedAt);
    const out = [];
    for (const n of notes.sort((a, b) => b.at - a.at))
      out.push({ _id: n._id, table: n.table, seat: n.seat ?? null, kind: n.kind, text: n.text, at: n.at, byName: (await nameOf(ctx, n.by)) ?? "", expoConfirmed: !!n.expoConfirmedAt });
    return out;
  },
});

/** The pass (expo, line, managers): allergy notes to confirm first, the 86s, and the plan with seats. */
export const pass = query({
  args: { venueId: v.optional(v.id("venues")) },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "notes.allergy");
    const venueId = pickVenue(actor, args.venueId);
    const plan = asPlan(await planOf(ctx, venueId));
    const shift = await liveShiftOf(ctx, venueId);
    if (!shift) return { shift: null, allergies: [], eightySix: [], sections: plan.sections };
    const notes = (
      await ctx.db
        .query("tableNotes")
        .withIndex("by_shift_kind", (q) => q.eq("shiftId", shift._id).eq("kind", "allergy"))
        .collect()
    ).filter((n) => !n.archivedAt);
    notes.sort((a, b) => Number(!!a.expoConfirmedAt) - Number(!!b.expoConfirmedAt) || b.at - a.at);
    const allergies = [];
    for (const n of notes)
      allergies.push({
        _id: n._id,
        table: n.table,
        seat: n.seat ?? null,
        text: n.text,
        at: n.at,
        byName: (await nameOf(ctx, n.by)) ?? "",
        expoConfirmedAt: n.expoConfirmedAt ?? null,
        confirmedByName: await nameOf(ctx, n.expoConfirmedBy),
      });
    const eightySix = [];
    for (const e of await live86s(ctx, shift._id)) {
      const item = await ctx.db.get(e.itemId);
      eightySix.push({ _id: e._id, itemId: e.itemId, name: item?.name ?? { en: "", es: "" }, kind: item?.kind ?? "food", note: e.note ?? null, at: e.at });
    }
    return { shift: { _id: shift._id, service: shift.service, date: shift.date, status: shift.status }, allergies, eightySix, sections: plan.sections };
  },
});

/** Archives every note of a shift (called by the close). */
export const archiveShift = internalMutation({
  args: { shiftId: v.id("shifts") },
  handler: async (ctx, { shiftId }) => {
    const now = Date.now();
    let n = 0;
    for (const note of await ctx.db
      .query("tableNotes")
      .withIndex("by_shift", (q) => q.eq("shiftId", shiftId))
      .collect())
      if (!note.archivedAt) {
        await ctx.db.patch(note._id, { archivedAt: now });
        n += 1;
      }
    return { archived: n };
  },
});

/** Daily (crons.ts): archived notes older than 30 days are deleted. */
export const purge = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const archived = await ctx.db
      .query("tableNotes")
      .withIndex("by_archived", (q) => q.gt("archivedAt", 0))
      .take(500);
    let deleted = 0;
    for (const n of archived) {
      if (!purgeDue(n, now)) continue;
      await ctx.db.delete(n._id);
      deleted += 1;
    }
    return { deleted };
  },
});
