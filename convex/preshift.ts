// Pre-shift notes (ADR 0021): leads and managers write what the team must know before service. They live for one
// service: once the shift is closed they stay in the record but no longer show in Today.
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { actorCan, requireCan, pickVenue } from "./lib/auth";
import { appError } from "./lib/errors";
import { enqueue } from "./lib/notify";
import { getShift, liveShiftOf, requireLiveShift, rosterOf } from "./lib/shift";
import { nameOf } from "./lib/service";
import { parseOrThrow } from "./lib/validate";
import { preShiftInput } from "../schemas";

/** The notes of a shift (the live one by default). Empty once the shift is closed. */
export const notes = query({
  args: { shiftId: v.optional(v.id("shifts")), venueId: v.optional(v.id("venues")) },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "today.view");
    const shift = args.shiftId ? await getShift(ctx, actor, args.shiftId) : await liveShiftOf(ctx, pickVenue(actor, args.venueId));
    if (!shift || shift.status === "closed" || shift.status === "scheduled") return { shiftId: shift?._id ?? null, notes: [], canWrite: actorCan(actor, "preshift.publish") };
    const rows = await ctx.db
      .query("preShiftNotes")
      .withIndex("by_shift", (q) => q.eq("shiftId", shift._id))
      .collect();
    const out = [];
    for (const n of rows.sort((a, b) => a.at - b.at)) out.push({ _id: n._id, text: n.text, at: n.at, byName: (await nameOf(ctx, n.by)) ?? "", mine: n.by === actor._id });
    return { shiftId: shift._id, notes: out, canWrite: actorCan(actor, "preshift.publish") };
  },
});

export const upsert = mutation({
  args: { noteId: v.optional(v.id("preShiftNotes")), shiftId: v.id("shifts"), text: v.object({ en: v.string(), es: v.string() }) },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "preshift.publish");
    const p = parseOrThrow(preShiftInput, args);
    const shift = await requireLiveShift(ctx, actor, args.shiftId);
    // A note written in one language shows in that language to everyone until it is translated.
    const text = { en: p.text.en || p.text.es, es: p.text.es || p.text.en };
    if (args.noteId) {
      const prev = await ctx.db.get(args.noteId);
      if (!prev || prev.shiftId !== shift._id) throw appError("NOT_FOUND");
      if (prev.by !== actor._id && !actorCan(actor, "shift.control")) throw appError("FORBIDDEN");
      await ctx.db.patch(prev._id, { text, at: Date.now() });
      return { noteId: prev._id };
    }
    const noteId = await ctx.db.insert("preShiftNotes", { shiftId: shift._id, venueId: shift.venueId, text, by: actor._id, at: Date.now() });
    const venue = await ctx.db.get(shift.venueId);
    const roster = (await rosterOf(ctx, shift)).map((r) => r.user._id).filter((id) => id !== actor._id);
    await enqueue(ctx, roster, { topic: "shift", key: "preshift", vars: { venue: venue?.name ?? "" }, url: "/today" });
    return { noteId };
  },
});

export const remove = mutation({
  args: { noteId: v.id("preShiftNotes") },
  handler: async (ctx, { noteId }) => {
    const actor = await requireCan(ctx, "preshift.publish");
    const note = await ctx.db.get(noteId);
    if (!note) throw appError("NOT_FOUND");
    await requireLiveShift(ctx, actor, note.shiftId);
    if (note.by !== actor._id && !actorCan(actor, "shift.control")) throw appError("FORBIDDEN");
    await ctx.db.delete(note._id);
    return { ok: true };
  },
});
