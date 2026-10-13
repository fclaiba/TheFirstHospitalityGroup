// Checklists (BLUEPRINT 2.2, ADR 0015).
import { weekdayOf } from "../time";
import type { Phase, Position, RunItem, Schedule, Service, TemplateItem } from "./types";

export type RunLike = { items: RunItem[]; dueAt: number; completedAt?: number; excused?: { by: string; reason: string } };

export function runProgress(run: { items: RunItem[] }): { done: number; total: number; pct: number } {
  const total = run.items.length;
  const done = run.items.filter((i) => i.done).length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 100 };
}

export const isComplete = (run: { items: RunItem[] }) => run.items.every((i) => i.done);

/** Late for the manager only (never shown in red to the person). Excused or complete runs are never late. */
export function isLate(run: RunLike, now: number): boolean {
  if (run.excused) return false;
  if (run.completedAt !== undefined) return run.completedAt > run.dueAt;
  return now > run.dueAt;
}

export function nextItem(run: { items: RunItem[] }): number | null {
  const i = run.items.findIndex((x) => !x.done);
  return i === -1 ? null : i;
}

/** Whether a template creates runs on a NY date and service. */
export function appliesOn(template: { schedule: Schedule }, date: string, service: Service): boolean {
  const s = template.schedule;
  if (s.kind === "every_shift") return true;
  if (!s.weekdays.includes(weekdayOf(date))) return false;
  return !s.services?.length || s.services.includes(service);
}

/** Whether a template applies to a person: one of its positions is the one they work, and its section (if any) is theirs. */
export function templateFor(template: { positions: Position[]; sectionId?: string }, person: { position: Position; sectionIds?: string[] }): boolean {
  if (!template.positions.includes(person.position)) return false;
  return !template.sectionId || !!person.sectionIds?.includes(template.sectionId);
}

/** Indexes of every item of a template (kept so a run can map back to the template after edits). */
export const itemsFor = (items: TemplateItem[]): number[] => items.map((_, i) => i);

export type BuiltRun = { phase: Phase; templateId: string; templateVersion: number; itemIndexes: number[]; items: RunItem[]; dueAt: number };

export function buildRun(
  template: { _id: string; phase: Phase; version: number; items: TemplateItem[]; dueOffsetMin: number },
  shift: { startsAt: number; endsAt: number },
): BuiltRun | null {
  const itemIndexes = itemsFor(template.items);
  if (!itemIndexes.length) return null;
  const anchor = template.phase === "close" ? shift.endsAt : shift.startsAt;
  return {
    phase: template.phase,
    templateId: template._id,
    templateVersion: template.version,
    itemIndexes,
    items: itemIndexes.map(() => ({ done: false })),
    dueAt: anchor + template.dueOffsetMin * 60_000,
  };
}

export function canCheck(run: { items: RunItem[] }, index: number, item: TemplateItem | undefined, done: boolean, photoId?: string): "NOT_FOUND" | "PHOTO_REQUIRED" | null {
  if (!item || index < 0 || index >= run.items.length) return "NOT_FOUND";
  if (done && item.photoRequired && !photoId && !run.items[index]!.photoId) return "PHOTO_REQUIRED";
  return null;
}

/** On-time rate of finished runs (internal success metric only, never shown on a staff screen, ADR 0027). */
export function onTimeRate(runs: RunLike[], now: number): number | null {
  const due = runs.filter((r) => r.dueAt <= now || r.completedAt !== undefined);
  if (!due.length) return null;
  const ok = due.filter((r) => r.excused || (r.completedAt !== undefined && r.completedAt <= r.dueAt)).length;
  return Math.round((ok / due.length) * 100);
}
