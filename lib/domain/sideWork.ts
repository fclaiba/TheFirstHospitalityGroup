// Side-work indicator for tipped positions (BLUEPRINT 2.6): New York limits non-tipped side work to 2 hours or 20 % of
// the shift. Shown to managers as a state ("Over limit"), never to staff as a number.
import type { SideWorkLimit } from "./types";

export const DEFAULT_SIDE_WORK_LIMIT: SideWorkLimit = { maxMinutes: 120, maxPct: 20 };

/** Estimated non-tipped minutes for a person in a shift: the sum of the estimated minutes of their side-work items. */
export function nonTippedMinutes(templates: Array<{ items: Array<{ estimatedMin?: number }> }>, itemIndexes?: number[][]): number {
  let total = 0;
  templates.forEach((t, i) => {
    const idx = itemIndexes?.[i] ?? t.items.map((_, j) => j);
    for (const j of idx) total += t.items[j]?.estimatedMin ?? 0;
  });
  return total;
}

/** More than 120 minutes, or more than 20 % of the shift. */
export function overSideWorkLimit(minutes: number, shiftMinutes: number, limit: SideWorkLimit = DEFAULT_SIDE_WORK_LIMIT): boolean {
  if (minutes <= 0) return false;
  if (minutes > limit.maxMinutes) return true;
  return shiftMinutes > 0 && minutes * 100 > shiftMinutes * limit.maxPct;
}
