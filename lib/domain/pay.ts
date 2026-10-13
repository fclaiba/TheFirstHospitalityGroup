// Pay records and adjustments (ADR 0017). No deductions: NY Labor Law section 193.
import type { AdjustmentKind, Role } from "./types";

/** Rates are readable by the owner and the person only. */
export function canSeePay(actor: { id: string; role: Role }, userId: string): boolean {
  return actor.role === "owner" || actor.role === "dev" || actor.id === userId;
}

/** The role that must switch a proposal ON: above the proposer. */
export function approverFor(proposerRole: Role): Role | null {
  if (proposerRole === "captain") return "manager";
  if (proposerRole === "manager") return "owner";
  if (proposerRole === "owner" || proposerRole === "dev") return "owner";
  return null;
}

export function canSwitchOn(actor: { id: string; role: Role }, adjustment: { proposedBy: string; proposerRole: Role }): "SELF_APPROVAL" | "PAY_FORBIDDEN" | null {
  if (actor.id === adjustment.proposedBy) return "SELF_APPROVAL";
  if (actor.role === "owner" || actor.role === "dev") return null;
  return approverFor(adjustment.proposerRole) === actor.role ? null : "PAY_FORBIDDEN";
}

const PUNITIVE = /\b(warning|warn|mistake|penalt|fine|deduct|late|broke|breakage|multa|descuento|error|sanci)/i;

/**
 * Bonuses and awards are positive. A correction may be negative only to fix a rate typed wrong, and never when its
 * reason points to a warning, a mistake or a penalty (NO_DEDUCTIONS).
 */
export function adjustmentProblem(input: { kind: AdjustmentKind; amountCents: number; reason: string; warningId?: string }): "NO_DEDUCTIONS" | "INVALID_INPUT" | null {
  if (!Number.isInteger(input.amountCents) || input.amountCents === 0 || Math.abs(input.amountCents) > 10_000_000) return "INVALID_INPUT";
  if (!input.reason.trim()) return "INVALID_INPUT";
  if (input.amountCents < 0) {
    if (input.kind !== "correction") return "NO_DEDUCTIONS";
    if (input.warningId || PUNITIVE.test(input.reason)) return "NO_DEDUCTIONS";
  }
  return null;
}

/** Rate in effect on a date: the latest record whose effectiveFrom is not after it. */
export function rateOn<T extends { effectiveFrom: string }>(records: T[], date: string): T | null {
  return [...records].filter((r) => r.effectiveFrom <= date).sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0] ?? null;
}

const csvCell = (v: string | number) => {
  const s = String(v);
  // Formula injection guard for spreadsheets, then RFC 4180 quoting.
  const safe = /^[=+\-@]/.test(s) && typeof v === "string" ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function toPayrollCsv(rows: Array<{ name: string; username: string; kind: string; amountCents: number; reason: string; approvedAt: string }>): string {
  const head = ["name", "username", "kind", "amount_usd", "reason", "approved_at"];
  const body = rows.map((r) => [r.name, r.username, r.kind, (r.amountCents / 100).toFixed(2), r.reason, r.approvedAt].map(csvCell).join(","));
  return [head.join(","), ...body].join("\r\n") + "\r\n";
}
