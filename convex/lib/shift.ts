// Shift helpers shared by the modules that act inside a shift (tasks, floor, bar, close, preshift).
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { appError } from "./errors";
import { requireVenue } from "./auth";
import type { Actor } from "./auth";
import { isLive } from "../../lib/domain/shift";
import { appliesOn, buildRun, templateFor } from "../../lib/domain/tasks";
import { isAtLeast, isCorporate } from "../../lib/domain/positions";
import { shiftSpan } from "../../lib/domain/schedule";
import type { Phase, Position } from "../../lib/domain/types";

type Ctx = QueryCtx | MutationCtx;

export async function getShift(ctx: Ctx, actor: Actor, shiftId: Id<"shifts">): Promise<Doc<"shifts">> {
  const shift = await ctx.db.get(shiftId);
  if (!shift) throw appError("NOT_FOUND");
  requireVenue(actor, shift.venueId);
  return shift;
}

/** Side work, shortages, requests and notes need an open or closing shift (SHIFT_NOT_OPEN). */
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

export type RosterPerson = { user: Doc<"users">; position: Position; plannedId?: Id<"shiftsPlanned"> };

/** The venue's closing time for "until close" shifts on a date: the latest service end. */
export function closeTimeOf(venue: Doc<"venues"> | null): string {
  if (!venue?.services.length) return "23:30";
  return venue.services.map((s) => s.endsAt).sort((a, b) => (a < "06:00" ? "3" + a : a).localeCompare(b < "06:00" ? "3" + b : b)).pop()!;
}

/**
 * People working a shift (ADR 0019): the planned shifts of the published schedule whose hours overlap the service,
 * each with the position they work. Without a published schedule for that day, every active staff account assigned to
 * the venue, at their primary position (no time clock, ADR 0011). Corporate and dev accounts are never on a roster.
 */
export async function rosterOf(ctx: Ctx, shift: Doc<"shifts">): Promise<RosterPerson[]> {
  const venue = await ctx.db.get(shift.venueId);
  const planned = (
    await ctx.db
      .query("shiftsPlanned")
      .withIndex("by_venue_date", (q) => q.eq("venueId", shift.venueId).eq("date", shift.date))
      .collect()
  ).filter((p) => !p.removed && !p.open && p.userId && p.attendance?.status !== "no_show");
  const published: typeof planned = [];
  for (const p of planned) {
    const week = await ctx.db.get(p.weekId);
    if (!week || week.status !== "published" || p.changedInVersion > week.version) continue;
    const span = shiftSpan(p, closeTimeOf(venue));
    if (span.from < shift.endsAt && shift.startsAt < span.to) published.push(p);
  }
  const out: RosterPerson[] = [];
  const seen = new Set<string>();
  if (published.length) {
    for (const p of published) {
      if (seen.has(p.userId!)) continue;
      const u = await ctx.db.get(p.userId!);
      if (!u || !u.active || u.isDev || isCorporate(u.primaryPosition)) continue;
      seen.add(u._id);
      out.push({ user: u, position: p.position, plannedId: p._id });
    }
    return out;
  }
  const rows = await ctx.db
    .query("assignments")
    .withIndex("by_venue", (q) => q.eq("venueId", shift.venueId))
    .collect();
  for (const r of rows) {
    const u = await ctx.db.get(r.userId);
    if (!u || !u.active || u.isDev || isCorporate(u.primaryPosition) || seen.has(u._id)) continue;
    seen.add(u._id);
    out.push({ user: u, position: u.primaryPosition });
  }
  return out;
}

/** Sections each person holds in a shift. */
export async function sectionsByUser(ctx: Ctx, shiftId: Id<"shifts">): Promise<Map<string, string[]>> {
  const rows = await ctx.db
    .query("sectionAssignments")
    .withIndex("by_shift", (q) => q.eq("shiftId", shiftId))
    .collect();
  const out = new Map<string, string[]>();
  for (const r of rows) {
    for (const u of r.userIds) out.set(u, [...(out.get(u) ?? []), r.sectionId]);
    if (r.leadId) out.set(r.leadId, [...(out.get(r.leadId) ?? []), r.sectionId]);
  }
  return out;
}

/** Creates the side-work runs of one phase for everyone on the roster, from the templates that apply today (ADR 0015). */
export async function createRuns(ctx: MutationCtx, shift: Doc<"shifts">, phase: Phase): Promise<number> {
  const roster = await rosterOf(ctx, shift);
  const sections = await sectionsByUser(ctx, shift._id);
  const existing = await ctx.db
    .query("taskRuns")
    .withIndex("by_shift", (q) => q.eq("shiftId", shift._id))
    .collect();
  const templates = (
    await ctx.db
      .query("taskTemplates")
      .withIndex("by_venue_phase", (q) => q.eq("venueId", shift.venueId).eq("phase", phase))
      .collect()
  ).filter((t) => t.active && appliesOn(t, shift.date, shift.service));
  let created = 0;
  for (const person of roster) {
    for (const template of templates) {
      if (!templateFor(template, { position: person.position, sectionIds: sections.get(person.user._id) })) continue;
      if (existing.some((r) => r.userId === person.user._id && r.templateId === template._id)) continue;
      const run = buildRun(template, shift);
      if (!run) continue;
      await ctx.db.insert("taskRuns", {
        shiftId: shift._id,
        venueId: shift.venueId,
        userId: person.user._id,
        position: person.position,
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

/** Managers of a venue (manager layer, excluding the chef), from assignments: the fallback audience for escalations. */
export async function venueManagers(ctx: Ctx, venueId: Id<"venues">, positions: Position[] = ["floor_manager", "agm", "gm"]): Promise<Doc<"users">[]> {
  const rows = await ctx.db
    .query("assignments")
    .withIndex("by_venue", (q) => q.eq("venueId", venueId))
    .collect();
  const out: Doc<"users">[] = [];
  for (const r of rows) {
    const u = await ctx.db.get(r.userId);
    if (u && u.active && positions.includes(u.primaryPosition)) out.push(u);
  }
  return out;
}

/** Leads and managers on a shift's roster, plus the venue's managers if none is on it. */
export async function leadsOf(ctx: Ctx, shift: Doc<"shifts">): Promise<Doc<"users">[]> {
  const roster = await rosterOf(ctx, shift);
  const leads = roster.filter((p) => isAtLeast(p.position, "lead")).map((p) => p.user);
  if (!leads.some((u) => isAtLeast(u.primaryPosition, "manager"))) leads.push(...(await venueManagers(ctx, shift.venueId)));
  return leads;
}

/** Owners and directors of the company. */
export async function corporateOf(ctx: Ctx, companyId: Id<"companies">, positions: Position[] = ["owner", "director"]): Promise<Doc<"users">[]> {
  const out: Doc<"users">[] = [];
  for (const p of positions) {
    const rows = await ctx.db
      .query("users")
      .withIndex("by_company_position", (q) => q.eq("companyId", companyId).eq("primaryPosition", p))
      .collect();
    out.push(...rows.filter((u) => u.active && !u.isDev));
  }
  return out;
}
