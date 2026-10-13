// Warnings and performance states (ADR 0007, BLUEPRINT 2.4).
import type { Severity, Thresholds, WarningState } from "./types";

export const WARNING_WINDOW_DAYS = 30;
export const VOID_WINDOW_MS = 24 * 3600_000;
export const DAY_MS = 24 * 3600_000;
export const RESPONSE_MAX = 500;

export const DEFAULT_THRESHOLDS: Thresholds = { attentionMinor: 1, followUpMinor: 3, followUpMajor: 1, reviewMajor: 2, windowDays: WARNING_WINDOW_DAYS };

export type WarningLike = { at: number; severity: Severity; voidedAt?: number };

/** Counts only when not voided and inside the rolling window. */
export function countable(w: WarningLike, now: number, windowDays = WARNING_WINDOW_DAYS): boolean {
  return !w.voidedAt && w.at <= now && now - w.at < windowDays * DAY_MS;
}

export function warningState(warnings: WarningLike[], now: number, t: Thresholds = DEFAULT_THRESHOLDS): WarningState {
  const live = warnings.filter((w) => countable(w, now, t.windowDays));
  const major = live.filter((w) => w.severity === "major").length;
  const minor = live.length - major;
  if (major >= t.reviewMajor) return "review";
  if (major >= t.followUpMajor || minor >= t.followUpMinor) return "follow_up";
  if (minor >= t.attentionMinor) return "attention";
  return "up_to_date";
}

export function canVoid(w: { at: number; voidedAt?: number }, actorRole: string, now: number): "TOO_LATE" | "FORBIDDEN" | null {
  if (!["manager", "owner", "dev"].includes(actorRole)) return "FORBIDDEN";
  if (w.voidedAt) return "FORBIDDEN";
  if (now - w.at > VOID_WINDOW_MS) return "TOO_LATE";
  return null;
}

/** Longest and current run of consecutive worked shifts without a countable warning. */
export function streak(shiftStarts: number[], warnings: WarningLike[]): { current: number; best: number } {
  const sorted = [...shiftStarts].sort((a, b) => a - b);
  const marks = warnings.filter((w) => !w.voidedAt).map((w) => w.at);
  let current = 0;
  let best = 0;
  for (let i = 0; i < sorted.length; i++) {
    const from = sorted[i]!;
    const to = sorted[i + 1] ?? Number.POSITIVE_INFINITY;
    const hit = marks.some((m) => m >= from && m < to);
    current = hit ? 0 : current + 1;
    best = Math.max(best, current);
  }
  return { current, best };
}

export function validThresholds(t: Thresholds): boolean {
  const ints = [t.attentionMinor, t.followUpMinor, t.followUpMajor, t.reviewMajor, t.windowDays].every((n) => Number.isInteger(n) && n >= 1);
  return ints && t.attentionMinor <= t.followUpMinor && t.followUpMajor <= t.reviewMajor && t.windowDays <= 365;
}

export const STATE_ORDER: WarningState[] = ["up_to_date", "attention", "follow_up", "review"];
export const worse = (a: WarningState, b: WarningState) => (STATE_ORDER.indexOf(a) >= STATE_ORDER.indexOf(b) ? a : b);
