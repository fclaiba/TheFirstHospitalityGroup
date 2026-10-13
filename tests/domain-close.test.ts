import { describe, expect, it } from "vitest";
import { closeSummary, openRuns, validFigures, RECONCILE_TOLERANCE_CENTS } from "../lib/domain/close";
import { DAY_MS, DEFAULT_THRESHOLDS, VOID_WINDOW_MS, canVoid, countable, streak, validThresholds, warningState, worse } from "../lib/domain/warnings";
import { MAX_COUNT_TENTHS, TOLERANCE_TENTHS, formatTenths, isValidCount, onHand, shiftStockReport, shortage, sumBy, usage, weightedAvgCost } from "../lib/domain/stock";
import type { Move } from "../lib/domain/stock";

const NOW = Date.UTC(2026, 9, 13, 23, 0);
const run = (done: boolean[], dueAt: number, extra: Record<string, unknown> = {}) => ({ phase: "open", items: done.map((d) => ({ done: d })), dueAt, ...extra });

describe("closeSummary", () => {
  const report = { coversCount: 150, netSalesCents: 1_500_000, compsCents: 2400, voidsCents: 1800 };

  it("counts runs, reconciles approvals and flags only differences over a dollar", () => {
    const s = closeSummary({
      runs: [run([true, true], NOW - 1000, { completedAt: NOW - 2000 }), run([true, false], NOW - 1000), run([false], NOW + 1000, { excused: { by: "m", reason: "r" } })],
      shortages: { items: 1, lostCostCents: 3360 },
      warnings: 2,
      approvals: [
        { kind: "comp", amountCents: 2400 },
        { kind: "void", amountCents: 1750 },
      ],
      report,
      now: NOW,
    });
    expect(s.runs).toEqual({ total: 3, complete: 1, late: 1, excused: 1, open: 1 });
    expect(s.approved).toEqual({ compsCents: 2400, voidsCents: 1750, count: 2 });
    expect(s.compsDiffCents).toBe(0);
    expect(s.voidsDiffCents).toBe(50);
    expect(s.flagged).toBe(false);
    expect(s.figures).toEqual({ coversCount: 150, netSalesCents: 1_500_000 });
    expect(s.pos).toEqual({ compsCents: 2400, voidsCents: 1800 });
    expect(s.shortages.items).toBe(1);
    expect(s.warnings).toBe(2);
  });

  it("flags comps or voids differences above the tolerance", () => {
    const base = { runs: [], shortages: { items: 0, lostCostCents: 0 }, warnings: 0, now: NOW };
    expect(closeSummary({ ...base, approvals: [], report: { ...report, compsCents: RECONCILE_TOLERANCE_CENTS + 1, voidsCents: 0 } }).flagged).toBe(true);
    expect(closeSummary({ ...base, approvals: [], report: { ...report, compsCents: 0, voidsCents: RECONCILE_TOLERANCE_CENTS + 1 } }).flagged).toBe(true);
    expect(closeSummary({ ...base, approvals: [{ kind: "void", amountCents: 500 }], report: { ...report, compsCents: 0, voidsCents: 0 } }).flagged).toBe(true);
    expect(closeSummary({ ...base, approvals: [], report: { ...report, compsCents: RECONCILE_TOLERANCE_CENTS, voidsCents: 0 } }).flagged).toBe(false);
  });

  it("finds runs that block the close", () => {
    const a = run([true], NOW);
    const b = run([false], NOW);
    const c = run([false], NOW, { excused: { by: "m", reason: "r" } });
    expect(openRuns([a, b, c])).toEqual([b]);
  });

  it("validates typed figures", () => {
    expect(validFigures(report)).toBe(true);
    expect(validFigures({ ...report, coversCount: -1 })).toBe(false);
    expect(validFigures({ ...report, netSalesCents: 1.5 })).toBe(false);
    expect(validFigures({ ...report, compsCents: 2_000_000_000 })).toBe(false);
  });
});

describe("warnings", () => {
  const w = (daysAgo: number, severity: "minor" | "major", voided = false) => ({ at: NOW - daysAgo * DAY_MS, severity, voidedAt: voided ? NOW : undefined });

  it("counts only live, non-voided warnings in the window", () => {
    expect(countable(w(1, "minor"), NOW)).toBe(true);
    expect(countable(w(31, "minor"), NOW)).toBe(false);
    expect(countable(w(1, "minor", true), NOW)).toBe(false);
    expect(countable({ at: NOW + 1000, severity: "minor" }, NOW)).toBe(false);
    expect(countable(w(10, "minor"), NOW, 7)).toBe(false);
  });

  it("computes the four states with the default thresholds", () => {
    expect(warningState([], NOW)).toBe("up_to_date");
    expect(warningState([w(1, "minor")], NOW)).toBe("attention");
    expect(warningState([w(1, "minor"), w(2, "minor")], NOW)).toBe("attention");
    expect(warningState([w(1, "minor"), w(2, "minor"), w(3, "minor")], NOW)).toBe("follow_up");
    expect(warningState([w(1, "major")], NOW)).toBe("follow_up");
    expect(warningState([w(1, "major"), w(2, "major")], NOW)).toBe("review");
    expect(warningState([w(1, "major", true), w(40, "major")], NOW)).toBe("up_to_date");
  });

  it("uses company thresholds", () => {
    const t = { ...DEFAULT_THRESHOLDS, attentionMinor: 2, reviewMajor: 3 };
    expect(warningState([w(1, "minor")], NOW, t)).toBe("up_to_date");
    expect(warningState([w(1, "major"), w(2, "major")], NOW, t)).toBe("follow_up");
  });

  it("voids only within 24 h, by managers and owners, once", () => {
    expect(canVoid({ at: NOW - 1000 }, "manager", NOW)).toBeNull();
    expect(canVoid({ at: NOW - 1000 }, "owner", NOW)).toBeNull();
    expect(canVoid({ at: NOW - VOID_WINDOW_MS - 1 }, "manager", NOW)).toBe("TOO_LATE");
    expect(canVoid({ at: NOW - 1000 }, "captain", NOW)).toBe("FORBIDDEN");
    expect(canVoid({ at: NOW - 1000, voidedAt: NOW }, "manager", NOW)).toBe("FORBIDDEN");
  });

  it("computes current and best streaks of shifts without warnings", () => {
    const shifts = [1, 2, 3, 4, 5].map((d) => NOW - (10 - d) * DAY_MS);
    expect(streak(shifts, [])).toEqual({ current: 5, best: 5 });
    expect(streak(shifts, [{ at: shifts[2]! + 3600_000, severity: "minor" }])).toEqual({ current: 2, best: 2 });
    expect(streak(shifts, [{ at: shifts[4]! + 3600_000, severity: "minor" }])).toEqual({ current: 0, best: 4 });
    expect(streak(shifts, [{ at: shifts[0]! + 3600_000, severity: "minor", voidedAt: NOW }])).toEqual({ current: 5, best: 5 });
  });

  it("validates thresholds and orders states", () => {
    expect(validThresholds(DEFAULT_THRESHOLDS)).toBe(true);
    expect(validThresholds({ ...DEFAULT_THRESHOLDS, attentionMinor: 4 })).toBe(false);
    expect(validThresholds({ ...DEFAULT_THRESHOLDS, followUpMajor: 3 })).toBe(false);
    expect(validThresholds({ ...DEFAULT_THRESHOLDS, windowDays: 0 })).toBe(false);
    expect(validThresholds({ ...DEFAULT_THRESHOLDS, windowDays: 400 })).toBe(false);
    expect(worse("attention", "review")).toBe("review");
    expect(worse("follow_up", "up_to_date")).toBe("follow_up");
  });
});

describe("stock", () => {
  const moves: Move[] = [
    { itemId: "a", qtyTenths: 30, type: "purchase", at: 1 },
    { itemId: "a", qtyTenths: -2, type: "waste", at: 2, shiftId: "s1" },
    { itemId: "b", qtyTenths: 10, type: "purchase", at: 3, shiftId: "s1" },
  ];

  it("validates counts in integer tenths", () => {
    expect(isValidCount(0)).toBe(true);
    expect(isValidCount(MAX_COUNT_TENTHS)).toBe(true);
    expect(isValidCount(MAX_COUNT_TENTHS + 1)).toBe(false);
    expect(isValidCount(-1)).toBe(false);
    expect(isValidCount(2.5)).toBe(false);
  });

  it("sums the ledger", () => {
    expect(onHand(moves)).toEqual({ a: 28, b: 10 });
    expect(sumBy(moves, ["purchase"])).toEqual({ a: 30, b: 10 });
    expect(sumBy(moves, ["purchase", "waste"], (m) => m.shiftId === "s1")).toEqual({ a: -2, b: 10 });
    expect(usage(40, 10, 35)).toBe(15);
    expect(formatTenths(37)).toBe("3.7");
  });

  it("flags a shortage beyond a quarter bottle", () => {
    expect(TOLERANCE_TENTHS).toBe(2.5);
    expect(shortage(-2)).toBe(false);
    expect(shortage(-3)).toBe(true);
    expect(shortage(-3, 5)).toBe(false);
  });

  it("weights the average cost", () => {
    expect(weightedAvgCost(10, 2000, 0, 3000)).toBe(2000);
    expect(weightedAvgCost(0, 2000, 10, 3000)).toBe(3000);
    expect(weightedAvgCost(10, 2000, 10, 3000)).toBe(2500);
  });

  it("builds a shift report with differences, usage, losses and par", () => {
    const r = shiftStockReport({
      items: [
        { id: "a", name: "Gin", unit: "bottle", avgCostCents: 2600, parLevel: 40 },
        { id: "b", name: "Vodka", unit: "bottle", avgCostCents: 2200 },
        { id: "c", name: "Mezcal", unit: "bottle", avgCostCents: 4200, parLevel: 10 },
      ],
      previousClosing: { a: 50, b: 30, c: undefined },
      purchasesBetween: { a: 10 },
      opening: { a: 52, b: 30, c: 12 },
      purchasesDuring: { b: 5 },
      losses: { a: 2 },
      closing: { a: 45, b: 33 },
    });
    const [a, b, c] = r.rows;
    expect(a).toMatchObject({ expectedOpening: 60, difference: -8, status: "short", used: 7, losses: 2, lostCostCents: 2080, belowPar: false });
    expect(b).toMatchObject({ expectedOpening: 30, difference: 0, status: "ok", used: 2, lostCostCents: 0, belowPar: false });
    expect(c).toMatchObject({ expectedOpening: null, difference: null, status: "pending", closing: null, used: null, belowPar: false });
    expect(r.totals).toEqual({ shortItems: 1, lostCostCents: 2080, counted: 3 });
    const none = shiftStockReport({ items: [{ id: "d", name: "Rum", unit: "bottle", avgCostCents: 1, parLevel: 5 }], previousClosing: {}, purchasesBetween: {}, opening: {}, purchasesDuring: {}, losses: {}, closing: {} });
    expect(none.rows[0]).toMatchObject({ opening: null, status: "pending", belowPar: false });
    expect(none.totals.counted).toBe(0);
    const low = shiftStockReport({ items: [{ id: "d", name: "Rum", unit: "bottle", avgCostCents: 1, parLevel: 50 }], previousClosing: {}, purchasesBetween: {}, opening: { d: 10 }, purchasesDuring: {}, losses: {}, closing: {}, toleranceTenths: 1 });
    expect(low.rows[0]!.belowPar).toBe(true);
  });
});
