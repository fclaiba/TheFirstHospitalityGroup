// Tip policy as configuration only (ADR 0024, P3). Never amounts. New York excludes managers with real authority.
import { isAtLeast } from "./positions";
import type { Position } from "./types";

export type Participant = { position: Position; points: number };

/** Points go in quarter steps from 0.25 to 10. */
export function policyProblem(participants: Participant[]): "MANAGER_IN_POOL" | "DUPLICATE" | "POINTS" | "EMPTY" | null {
  if (!participants.length) return "EMPTY";
  const seen = new Set<Position>();
  for (const p of participants) {
    if (isAtLeast(p.position, "manager")) return "MANAGER_IN_POOL";
    if (seen.has(p.position)) return "DUPLICATE";
    seen.add(p.position);
    if (!Number.isInteger(p.points * 4) || p.points <= 0 || p.points > 10) return "POINTS";
  }
  return null;
}
