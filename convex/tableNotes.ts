// Table notes and the kitchen allergy board (ADR 0016): a few words on a table for tonight, never contact details,
// never a guest database. Allergy notes reach the kitchen, which confirms them. Archived at close, deleted after 30 days.
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireRole, requireUser, requireVenue } from "./lib/auth";
import { appError } from "./lib/errors";
import { enqueue } from "./lib/notify";
import { getShift, liveShiftOf, requireLiveShift, rosterOf } from "./lib/shift";
import { parseOrThrow } from "./lib/validate";
import { tableNoteInput } from "../schemas";
import { kitchenNeeds, noteProblem, purgeDue } from "../lib/domain/tableNotes";

export const add = mutation({
  args: { shiftId: v.id("shifts"), table: v.string(), kind: v.string(), text: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, ["server", "captain", "manager"]);
    const problem = noteProblem(args.text);
    if (problem === "CONTACT_DETAILS") throw appError("CONTACT_DETAILS", undefined, { fields: { text: "contact" } });
    if (problem) throw appError("INVALID_INPUT", undefined, { fields: { text: problem.toLowerCase() } });
    const p = parseOrThrow(tableNoteInput, args);
    const shift = await requireLiveShift(ctx, actor, args.shiftId);
    const noteId = await ctx.db.insert("tableNotes", { venueId: shift.venueId, shiftId: shift._id, table: p.table, kind: p.kind, text: p.text, by: actor._id, at: Date.now() });
    if (kitchenNeeds(p)) {
      const kitchen = (await rosterOf(ctx, shift)).filter((u) => u.role === "kitchen").map((u) => u._id);
      await enqueue(ctx, kitchen, { topic: "note", key: "allergy", vars: { table: p.table }, url: "/kitchen", urgent: true });
    }
    return { noteId };
  },
});

/** The author, a captain or a manager can take a note off the table before the close. */
export const archive = mutation({
  args: { noteId: v.id("tableNotes") },
  handler: async (ctx, { noteId }) => {
    const actor = await requireUser(ctx);
    const note = await ctx.db.get(noteId);
    if (!note) throw appError("NOT_FOUND");
    requireVenue(actor, note.venueId);
    const lead = ["captain", "manager", "owner", "dev"].includes(actor.role);
    if (note.by !== actor._id && !lead) throw appError("FORBIDDEN");
    if (!note.archivedAt) await ctx.db.patch(note._id, { archivedAt: Date.now() });
    return { ok: true };
  },
});

/** The kitchen confirms an allergy note before the course fires. */
export const confirm = mutation({
  args: { noteId: v.id("tableNotes") },
  handler: async (ctx, { noteId }) => {
    const actor = await requireRole(ctx, ["kitchen", "manager"]);
    const note = await ctx.db.get(noteId);
    if (!note) throw appError("NOT_FOUND");
    requireVenue(actor, note.venueId);
    if (note.kind !== "allergy") throw appError("INVALID_INPUT");
    if (note.archivedAt) throw appError("REQUEST_CLOSED");
    if (!note.kitchenConfirmedAt) await ctx.db.patch(note._id, { kitchenConfirmedAt: Date.now(), kitchenConfirmedBy: actor._id });
    return { ok: true };
  },
});

export const forShift = query({
  args: { shiftId: v.id("shifts") },
  handler: async (ctx, { shiftId }) => {
    const actor = await requireUser(ctx);
    const shift = await getShift(ctx, actor, shiftId);
    const notes = (
      await ctx.db
        .query("tableNotes")
        .withIndex("by_shift", (q) => q.eq("shiftId", shift._id))
        .collect()
    ).filter((n) => !n.archivedAt);
    const out = [];
    for (const n of notes.sort((a, b) => b.at - a.at)) out.push({ ...n, byName: (await ctx.db.get(n.by))?.name ?? "" });
    return out;
  },
});

/** Tonight's allergy notes at a venue: unconfirmed first, then newest. */
export const allergyBoard = query({
  args: { venueId: v.id("venues") },
  handler: async (ctx, { venueId }) => {
    const actor = await requireRole(ctx, ["kitchen", "captain", "manager"]);
    requireVenue(actor, venueId);
    const shift = await liveShiftOf(ctx, venueId);
    if (!shift) return { shift: null, notes: [] };
    const notes = (
      await ctx.db
        .query("tableNotes")
        .withIndex("by_shift_kind", (q) => q.eq("shiftId", shift._id).eq("kind", "allergy"))
        .collect()
    ).filter((n) => !n.archivedAt);
    notes.sort((a, b) => Number(!!a.kitchenConfirmedAt) - Number(!!b.kitchenConfirmedAt) || b.at - a.at);
    const out = [];
    for (const n of notes) {
      out.push({
        _id: n._id,
        table: n.table,
        text: n.text,
        at: n.at,
        byName: (await ctx.db.get(n.by))?.name ?? "",
        kitchenConfirmedAt: n.kitchenConfirmedAt ?? null,
        confirmedByName: n.kitchenConfirmedBy ? ((await ctx.db.get(n.kitchenConfirmedBy as Id<"users">))?.name ?? "") : null,
      });
    }
    return { shift: { _id: shift._id, service: shift.service, date: shift.date }, notes: out };
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
