// Staff levels A, B, C (ADR 0014). C in training, B trained, A lead (to be validated).
import type { Level } from "./types";

export { LEVELS } from "./types";

const RANK: Record<Level, number> = { C: 0, B: 1, A: 2 };

export function atLeast(level: Level | undefined, min: Level | undefined): boolean {
  if (!min) return true;
  return RANK[level ?? "C"] >= RANK[min];
}

export type LevelAction = "comp_request" | "section_lead";

const MIN: Record<LevelAction, Level> = { comp_request: "B", section_lead: "A" };

export function canDo(level: Level | undefined, action: LevelAction): boolean {
  return atLeast(level, MIN[action]);
}
