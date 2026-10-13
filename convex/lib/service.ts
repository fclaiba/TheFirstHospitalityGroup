// Helpers shared by the service modules (floor, notes, requests, menu, bar, close, today, reports).
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { appError } from "./errors";
import type { Actor } from "./auth";
import type { Plan } from "../../lib/domain/floor";
import { needsAck, setsFor } from "../../lib/domain/rules";
import { closeTimeOf } from "./shift";
import { appliesOn, templateFor } from "../../lib/domain/tasks";
import { isTipped } from "../../lib/domain/positions";
import { shiftMinutes, weekDates } from "../../lib/domain/schedule";
import { runsOn } from "../../lib/domain/shift";
import { DEFAULT_SIDE_WORK_LIMIT, overSideWorkLimit } from "../../lib/domain/sideWork";

type Ctx = QueryCtx | MutationCtx;

/** The current floor plan of a venue (highest version), or an empty plan. */
export async function planOf(ctx: Ctx, venueId: Id<"venues">): Promise<Doc<"floorPlans"> | null> {
  return await ctx.db
    .query("floorPlans")
    .withIndex("by_venue", (q) => q.eq("venueId", venueId))
    .order("desc")
    .first();
}

export const asPlan = (p: Doc<"floorPlans"> | null): Plan => ({ sections: p?.sections ?? [] });

/** Marks an uploaded file as attached; only its owner may attach it. */
export async function attachFile(ctx: MutationCtx, actor: Actor, storageId: Id<"_storage">, to: string): Promise<void> {
  const file = await ctx.db
    .query("files")
    .withIndex("by_storage", (q) => q.eq("storageId", storageId))
    .unique();
  if (!file || file.ownerId !== actor._id) throw appError("NOT_FOUND");
  await ctx.db.patch(file._id, { attachedTo: to });
}

export async function nameOf(ctx: Ctx, id: Id<"users"> | undefined | null): Promise<string | null> {
  if (!id) return null;
  return (await ctx.db.get(id))?.name ?? "";
}

/** Live 86s of a shift. */
export async function live86s(ctx: Ctx, shiftId: Id<"shifts">): Promise<Doc<"eightySix">[]> {
  return (
    await ctx.db
      .query("eightySix")
      .withIndex("by_shift", (q) => q.eq("shiftId", shiftId))
      .collect()
  ).filter((e) => e.clearedAt === undefined);
}

/** Rule sets that apply to a person at a venue and are not yet confirmed at their current version (BLUEPRINT 2.6). */
export async function pendingRuleSets(ctx: Ctx, user: Doc<"users">, venueId: Id<"venues"> | undefined): Promise<Doc<"ruleSets">[]> {
  const sets: Doc<"ruleSets">[] = [];
  for (const scope of ["company", "venue", "position"] as const)
    sets.push(
      ...(await ctx.db
        .query("ruleSets")
        .withIndex("by_company_scope", (q) => q.eq("companyId", user.companyId).eq("scope", scope))
        .collect()),
    );
  const applying = setsFor(sets, [user.primaryPosition, ...user.enabledPositions], venueId);
  const out: Doc<"ruleSets">[] = [];
  for (const s of applying) {
    const acks = await ctx.db
      .query("ruleAcks")
      .withIndex("by_user_set", (q) => q.eq("userId", user._id).eq("setId", s._id))
      .collect();
    if (needsAck(s, acks)) out.push(s);
  }
  return out;
}

/** The side-work indicator rows of a venue's week: each tipped planned shift with its estimated non-tipped minutes. */
export async function sideWorkRows(ctx: Ctx, venue: Doc<"venues">, weekStart: string) {
  const limit = (await ctx.db.get(venue.companyId))?.thresholds.sideWork ?? DEFAULT_SIDE_WORK_LIMIT;
  const templates: Doc<"taskTemplates">[] = [];
  for (const phase of ["open", "mid", "close"] as const)
    templates.push(
      ...(
        await ctx.db
          .query("taskTemplates")
          .withIndex("by_venue_phase", (q) => q.eq("venueId", venue._id).eq("phase", phase))
          .collect()
      ).filter((t) => t.active),
    );
  const rows = [];
  for (const date of weekDates(weekStart)) {
    const planned = (
      await ctx.db
        .query("shiftsPlanned")
        .withIndex("by_venue_date", (q) => q.eq("venueId", venue._id).eq("date", date))
        .collect()
    ).filter((s) => !s.removed && !s.open && s.userId && isTipped(s.position));
    const services = venue.services.filter((x) => runsOn(x, date)).map((x) => x.key);
    for (const s of planned) {
      const minutes = templates
        .filter((t) => templateFor(t, { position: s.position }) && !t.sectionId && services.some((svc) => appliesOn(t, date, svc)))
        .reduce((n, t) => n + t.items.reduce((m, i) => m + (i.estimatedMin ?? 0), 0), 0);
      const worked = shiftMinutes(s, closeTimeOf(venue));
      const user = await ctx.db.get(s.userId!);
      rows.push({
        shiftId: s._id,
        userId: s.userId!,
        name: user?.name ?? "",
        position: s.position,
        date,
        minutes,
        shiftMinutes: worked,
        state: (overSideWorkLimit(minutes, worked, limit) ? "over_limit" : "within_limit") as "over_limit" | "within_limit",
      });
    }
  }
  return { limit, rows };
}
