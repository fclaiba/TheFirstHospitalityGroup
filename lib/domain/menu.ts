// Menu confirmations and 86s (ADR 0021, 0022). No prices (ADR 0018).
import { confirmsMenu } from "./positions";
import type { MenuKind, Position } from "./types";

export type ItemLike = { _id: string; kind: MenuKind; version: number; active: boolean; status?: "published" | "proposed" };
export type AckLike = { itemId: string; version: number };

/** Items a person must confirm: active, published, of a kind their position confirms, new or changed since their last confirmation. */
export function pendingAcks<T extends ItemLike>(items: T[], acks: AckLike[], position: Position): T[] {
  const seen = new Map<string, number>();
  for (const a of acks) seen.set(a.itemId, Math.max(seen.get(a.itemId) ?? 0, a.version));
  return items.filter((i) => i.active && (i.status ?? "published") === "published" && confirmsMenu(position, i.kind) && (seen.get(i._id) ?? 0) < i.version);
}

export function is86(itemId: string, shift86s: Array<{ itemId: string; clearedAt?: number }>): boolean {
  return shift86s.some((e) => e.itemId === itemId && e.clearedAt === undefined);
}

/** The menu quiz is passed at 80 % correct; the screen shows Passed or Not yet, never the score (ADR 0027). */
export const QUIZ_PASS_RATIO = 0.8;
export function quizPassed(correct: number, total: number): boolean {
  return total > 0 && correct / total >= QUIZ_PASS_RATIO;
}

/** Same set of allergens, order free. */
export function sameAllergens(a: string[], b: string[]): boolean {
  const x = [...new Set(a)].sort();
  const y = [...new Set(b)].sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
}
