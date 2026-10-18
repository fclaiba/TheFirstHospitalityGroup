import { chainOf } from "./chain";
import type { Overrides } from "./chain";
import { isAtLeast, nextOnLadder } from "./positions";
import type { Position } from "./types";

export const TRAINING_STATES = [
  "not_started",
  "ready",
  "needs_practice",
  "verified",
] as const;
export type TrainingState = (typeof TRAINING_STATES)[number];
export const TRAINING_VERSION = 1;
export function trainingPositions(primary: Position): Position[] {
  if (primary === "owner" || primary === "dev") return [];
  const next = nextOnLadder(primary);
  return next && next !== "owner" ? [primary, next] : [primary];
}
/** Authority follows the trained role, including when the learner is preparing for a promotion. */
export function canReviewPosition(
  actor: { position: Position; primaryPosition: Position },
  trained: Position,
  overrides: Overrides = {},
): boolean {
  const chain = chainOf(trained, overrides);
  return (
    chain.includes(actor.position) ||
    (isAtLeast(actor.primaryPosition, "manager") &&
      chain.includes(actor.primaryPosition))
  );
}
