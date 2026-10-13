// The schedule (ADR 0019, BLUEPRINT 2.6): versioned weeks, shifts per person and position, doubles, events with
// required positions, confirmations per person and version, swaps through the manager, open shifts, weekly hours.
import { addDays, nyTimeOn, weekdayOf } from "../time";
import { canWork } from "./positions";
import type { Position } from "./types";

/** Weeks start on Monday (to be validated against TFHG's 7shifts setup). */
export function weekOf(date: string): string {
  const wd = weekdayOf(date); // 0 = Sunday
  return addDays(date, wd === 0 ? -6 : 1 - wd);
}

export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export type PlannedLike = {
  _id?: string;
  userId?: string;
  position: Position;
  date: string;
  start: string;
  end?: string;
  untilClose: boolean;
  breakMin?: number;
  open?: boolean;
  removed?: boolean;
  changedInVersion: number;
  eventId?: string;
};

const HHMM = /^([01]?\d|2[0-9]):[0-5]\d$/;
export const validTime = (t: string) => HHMM.test(t) && +t.split(":")[0]! < 30;

/** Start and end (epoch ms) of a planned shift. "Until close" ends at the venue's close time for that date. */
export function shiftSpan(s: Pick<PlannedLike, "date" | "start" | "end" | "untilClose">, closeAt = "23:30"): { from: number; to: number } {
  const from = nyTimeOn(s.date, s.start);
  let to = nyTimeOn(s.date, s.untilClose || !s.end ? closeAt : s.end);
  if (to <= from) to += 24 * 3600_000;
  return { from, to };
}

/** Worked minutes of a planned shift, minus its break. */
export function shiftMinutes(s: Pick<PlannedLike, "date" | "start" | "end" | "untilClose" | "breakMin">, closeAt?: string): number {
  const { from, to } = shiftSpan(s, closeAt);
  return Math.max(0, Math.round((to - from) / 60_000) - (s.breakMin ?? 0));
}

/** A double: two blocks on the same day for the same person (BLUEPRINT 2.6). */
export function isDouble(shifts: Array<Pick<PlannedLike, "date" | "userId" | "removed">>): boolean {
  const live = shifts.filter((s) => !s.removed);
  return live.length >= 2 && live.every((s) => s.date === live[0]!.date && s.userId === live[0]!.userId);
}

export function overlaps(a: Pick<PlannedLike, "date" | "start" | "end" | "untilClose">, b: Pick<PlannedLike, "date" | "start" | "end" | "untilClose">, closeAt?: string): boolean {
  const x = shiftSpan(a, closeAt);
  const y = shiftSpan(b, closeAt);
  return x.from < y.to && y.from < x.to;
}

/** People whose shifts changed after the published version: only they are notified and must confirm again. */
export function changedPeople(shifts: PlannedLike[], publishedVersion: number): string[] {
  const out = new Set<string>();
  for (const s of shifts) if (s.userId && s.changedInVersion > publishedVersion) out.add(s.userId);
  return [...out];
}

/** The version a person must confirm: the last published version that touched one of their shifts. */
export function versionToConfirm(userId: string, shifts: PlannedLike[], publishedVersion: number): number | null {
  let v: number | null = null;
  for (const s of shifts) {
    if (s.userId !== userId || s.changedInVersion > publishedVersion) continue;
    v = Math.max(v ?? 0, s.changedInVersion);
  }
  return v;
}

/** Whether a person still has to tap "I saw it" for a published week. */
export function needsConfirm(userId: string, week: { status: string; version: number }, shifts: PlannedLike[], acks: Array<{ userId: string; version: number }>): boolean {
  if (week.status !== "published") return false;
  const required = versionToConfirm(userId, shifts, week.version);
  if (required === null) return false;
  // A person whose only shift was removed still confirms they saw the change.
  const acked = acks.filter((a) => a.userId === userId).reduce((m, a) => Math.max(m, a.version), 0);
  return acked < required;
}

/** Swap validation (ADR 0026: through the manager). Each person must be able to work the other's position. */
export function swapProblem(
  a: PlannedLike & { userId: string },
  b: (PlannedLike & { userId: string }) | null,
  requester: { _id: string; primaryPosition: Position; enabledPositions: Position[] },
  colleague: { _id: string; primaryPosition: Position; enabledPositions: Position[] },
  now: number,
): "FORBIDDEN" | "NOT_ENABLED" | "SWAP_CONFLICT" | "TOO_LATE" | null {
  if (a.userId !== requester._id || requester._id === colleague._id) return "FORBIDDEN";
  if (a.removed || b?.removed) return "SWAP_CONFLICT";
  if (shiftSpan(a).from <= now || (b && shiftSpan(b).from <= now)) return "TOO_LATE";
  if (!canWork(colleague, a.position)) return "NOT_ENABLED";
  if (b) {
    if (b.userId !== colleague._id) return "SWAP_CONFLICT";
    if (!canWork(requester, b.position)) return "NOT_ENABLED";
  }
  return null;
}

/** Whether a person may claim an open shift: enabled for the position and free at that time. */
export function openShiftEligible(user: { primaryPosition: Position; enabledPositions: Position[] }, shift: PlannedLike, own: PlannedLike[], closeAt?: string): "NOT_ENABLED" | "SWAP_CONFLICT" | null {
  if (!canWork(user, shift.position)) return "NOT_ENABLED";
  if (own.some((s) => !s.removed && overlaps(s, shift, closeAt))) return "SWAP_CONFLICT";
  return null;
}

export function weeklyHours(shifts: PlannedLike[], closeAt?: string): number {
  const min = shifts.filter((s) => !s.removed && !s.open).reduce((n, s) => n + shiftMinutes(s, closeAt), 0);
  return Math.round((min / 60) * 10) / 10;
}

export const DEFAULT_WEEKLY_HOURS = 40;

export const overHours = (shifts: PlannedLike[], threshold = DEFAULT_WEEKLY_HOURS, closeAt?: string) => weeklyHours(shifts, closeAt) > threshold;

/** Required vs filled per position for an event (shown as states: Staffed, Short). */
export function eventCoverage(event: { _id: string; required: Array<{ position: Position; count: number }> }, shifts: PlannedLike[]): Array<{ position: Position; required: number; filled: number; staffed: boolean }> {
  return event.required.map((r) => {
    const filled = shifts.filter((s) => s.eventId === event._id && !s.removed && !s.open && s.userId && s.position === r.position).length;
    return { position: r.position, required: r.count, filled, staffed: filled >= r.count };
  });
}

/** Whether a person is unavailable for a date and time per their weekly availability. */
export function availableAt(av: Array<{ weekday: number; from: string; to: string; available: boolean }>, date: string, start: string): boolean {
  const wd = weekdayOf(date);
  const rows = av.filter((a) => a.weekday === wd);
  if (!rows.length) return true;
  return rows.some((a) => a.available && a.from <= start && start < a.to) || rows.every((a) => a.available);
}

/** Time off covering a date (approved only). */
export const onTimeOff = (off: Array<{ from: string; to: string; status: string }>, date: string) => off.some((o) => o.status === "approved" && o.from <= date && date <= o.to);
