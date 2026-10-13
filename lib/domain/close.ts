// Manager close summary (ADR 0008, 0013): late runs, bar shortages, warnings tonight, and the reconciliation of
// approved voids and comps against the figures typed from the POS end-of-day report.
import { isLate, runProgress } from "./tasks";
import type { RunLike } from "./tasks";

/** A difference larger than one dollar is flagged (BLUEPRINT 2.4). */
export const RECONCILE_TOLERANCE_CENTS = 100;

export type CloseSummary = {
  runs: { total: number; complete: number; late: number; excused: number; open: number };
  shortages: { items: number; lostCostCents: number };
  warnings: number;
  approved: { compsCents: number; voidsCents: number; count: number };
  pos: { compsCents: number; voidsCents: number };
  compsDiffCents: number;
  voidsDiffCents: number;
  flagged: boolean;
  figures: { coversCount: number; netSalesCents: number };
};

export function closeSummary(input: {
  runs: Array<RunLike & { phase: string }>;
  shortages: { items: number; lostCostCents: number };
  warnings: number;
  approvals: Array<{ kind: "void" | "comp"; amountCents: number }>;
  report: { coversCount: number; netSalesCents: number; compsCents: number; voidsCents: number };
  now: number;
}): CloseSummary {
  const complete = input.runs.filter((r) => runProgress(r).pct === 100).length;
  const excused = input.runs.filter((r) => r.excused).length;
  const late = input.runs.filter((r) => isLate(r, input.now)).length;
  const compsCents = input.approvals.filter((a) => a.kind === "comp").reduce((n, a) => n + a.amountCents, 0);
  const voidsCents = input.approvals.filter((a) => a.kind === "void").reduce((n, a) => n + a.amountCents, 0);
  const compsDiffCents = input.report.compsCents - compsCents;
  const voidsDiffCents = input.report.voidsCents - voidsCents;
  return {
    runs: { total: input.runs.length, complete, late, excused, open: input.runs.length - complete - excused },
    shortages: input.shortages,
    warnings: input.warnings,
    approved: { compsCents, voidsCents, count: input.approvals.length },
    pos: { compsCents: input.report.compsCents, voidsCents: input.report.voidsCents },
    compsDiffCents,
    voidsDiffCents,
    flagged: Math.abs(compsDiffCents) > RECONCILE_TOLERANCE_CENTS || Math.abs(voidsDiffCents) > RECONCILE_TOLERANCE_CENTS,
    figures: { coversCount: input.report.coversCount, netSalesCents: input.report.netSalesCents },
  };
}

/** Runs that block the close: not complete and not excused. */
export function openRuns<T extends RunLike>(runs: T[]): T[] {
  return runs.filter((r) => !r.excused && runProgress(r).pct < 100);
}

export function validFigures(r: { coversCount: number; netSalesCents: number; compsCents: number; voidsCents: number }): boolean {
  return [r.coversCount, r.netSalesCents, r.compsCents, r.voidsCents].every((n) => Number.isInteger(n) && n >= 0 && n <= 1_000_000_000);
}
