// Shift helpers shared by the modules that act inside a shift (tasks, inventory, floor, close).
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { appError } from "./errors";
import { requireVenue } from "./auth";
import type { Actor } from "./auth";
import { isLive } from "../../lib/domain/shift";
import { buildRun } from "../../lib/domain/tasks";
import { appliesOn } from "../../lib/domain/tasks";
import type { Phase } from "../../lib/domain/types";

type Ctx = QueryCtx | MutationCtx;

export async function getShift(ctx: Ctx, actor: Actor, shiftId: Id<"shifts">): Promise<Doc<"shifts">> {
  const shift = await ctx.db.get(shiftId);
  if (!shift) throw appError("NOT_FOUND");
  requireVenue(actor, shift.venueId);
  return shift;
}

/** Task checks, counts, requests and notes need an open or closing shift (SHIFT_NOT_OPEN). */
export async function requireLiveShift(ctx: Ctx, actor: Actor, shiftId: Id<"shifts">): Promise<Doc<"shifts">> {
  const shift = await getShift(ctx, actor, shiftId);
  if (!isLive(shift.status)) throw appError("SHIFT_NOT_OPEN");
  return shift;
}

export async function liveShiftOf(ctx: Ctx, venueId: Id<"venues">): Promise<Doc<"shifts"> | null> {
  for (const status of ["open", "closing"] as const) {
    const s = await ctx.db
      .query("shifts")
      .withIndex("by_venue_status", (q) => q.eq("venueId", venueId).eq("status", status))
      .first();
    if (s) return s;
  }
  return null;
}

/**
 * People working a shift. With a published schedule for that service, the people on it; otherwise every active staff
 * account assigned to the venue (no time clock in v1, ADR 0011). Owners and dev accounts are never on a roster.
 */
export async function rosterOf(ctx: Ctx, shift: Doc<"shifts">): Promise<Doc<"users">[]> {
  const scheduled = (
    await ctx.db
      .query("scheduleEntries")
      .withIndex("by_venue_date", (q) => q.eq("venueId", shift.venueId).eq("date", shift.date))
      .collect()
  ).filter((e) => e.service === shift.service && e.publishedAt);
  const ids = scheduled.length
    ? scheduled.map((e) => e.userId)
    : (
        await ctx.db
          .query("assignments")
          .withIndex("by_venue", (q) => q.eq("venueId", shift.venueId))
          .collect()
      ).map((a) => a.userId);
  const out: Doc<"users">[] = [];
  for (const id of new Set(ids)) {
    const u = await ctx.db.get(id);
    if (u && u.active && u.role !== "owner" && !u.isDev) out.push(u);
  }
  return out;
}

/** Sections each person holds in a shift. */
export async function sectionsByUser(ctx: Ctx, shiftId: Id<"shifts">): Promise<Map<string, Id<"sections">[]>> {
  const rows = await ctx.db
    .query("sectionAssignments")
    .withIndex("by_shift", (q) => q.eq("shiftId", shiftId))
    .collect();
  const out = new Map<string, Id<"sections">[]>();
  for (const r of rows) for (const u of r.userIds) out.set(u, [...(out.get(u) ?? []), r.sectionId]);
  return out;
}

/** Creates the runs of one phase for everyone on the roster, from the templates that apply today (ADR 0015). */
export async function createRuns(ctx: MutationCtx, shift: Doc<"shifts">, phase: Phase): Promise<number> {
  const roster = await rosterOf(ctx, shift);
  const sections = await sectionsByUser(ctx, shift._id);
  const existing = await ctx.db
    .query("taskRuns")
    .withIndex("by_shift", (q) => q.eq("shiftId", shift._id))
    .collect();
  let created = 0;
  const byRole = new Map<string, Doc<"taskTemplates">[]>();
  for (const person of roster) {
    if (!byRole.has(person.role)) {
      const templates = (
        await ctx.db
          .query("taskTemplates")
          .withIndex("by_venue_role_phase", (q) => q.eq("venueId", shift.venueId).eq("role", person.role).eq("phase", phase))
          .collect()
      ).filter((t) => t.active && appliesOn(t, shift.date, shift.service));
      byRole.set(person.role, templates);
    }
    for (const template of byRole.get(person.role)!) {
      if (existing.some((r) => r.userId === person._id && r.templateId === template._id)) continue;
      const run = buildRun(template, shift, { level: person.level, sectionId: sections.get(person._id)?.[0] });
      if (!run) continue;
      await ctx.db.insert("taskRuns", {
        shiftId: shift._id,
        venueId: shift.venueId,
        userId: person._id,
        templateId: template._id,
        templateVersion: template.version,
        phase,
        itemIndexes: run.itemIndexes,
        items: run.items.map(() => ({ done: false })),
        dueAt: run.dueAt,
        late: false,
      });
      created += 1;
    }
  }
  return created;
}

/** Managers and captains on a shift's roster, for help and approvals; plus the venue's managers if none is on it. */
export async function leadsOf(ctx: Ctx, shift: Doc<"shifts">): Promise<Doc<"users">[]> {
  const roster = await rosterOf(ctx, shift);
  return roster.filter((u) => u.role === "manager" || u.role === "captain");
}

export async function ownersOf(ctx: Ctx, companyId: Id<"companies">): Promise<Doc<"users">[]> {
  return (
    await ctx.db
      .query("users")
      .withIndex("by_company_role", (q) => q.eq("companyId", companyId).eq("role", "owner"))
      .collect()
  ).filter((u) => u.active);
}
