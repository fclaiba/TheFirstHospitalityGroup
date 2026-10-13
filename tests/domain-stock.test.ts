import { describe, expect, it } from "vitest";
import { formatTenths, isValidCount, onHand, shiftStockReport, shortage, sumBy, TOLERANCE_TENTHS, usage, weightedAvgCost } from "../lib/domain/stock";
import type { Move } from "../lib/domain/stock";

// lib/domain/stock.ts (BLUEPRINT 14): integer tenths, append-only moves, shortages against the tolerance.

const moves: Move[] = [
  { itemId: "a", qtyTenths: 50, type: "purchase", unitCostCents: 2000, at: 1 },
  { itemId: "a", qtyTenths: -5, type: "waste", at: 2, shiftId: "s1" },
  { itemId: "b", qtyTenths: 10, type: "transfer_in", at: 3 },
  { itemId: "a", qtyTenths: 20, type: "purchase", at: 4, shiftId: "s1" },
];

describe("counts and on-hand", () => {
  it("accepts integer tenths from 0 to 100 000 only", () => {
    expect(isValidCount(0)).toBe(true);
    expect(isValidCount(100_000)).toBe(true);
    expect(isValidCount(-1)).toBe(false);
    expect(isValidCount(2.5)).toBe(false);
    expect(isValidCount(100_001)).toBe(false);
    expect(isValidCount(Number.NaN)).toBe(false);
  });

  it("sums moves per item", () => {
    expect(onHand(moves)).toEqual({ a: 65, b: 10 });
    expect(onHand([])).toEqual({});
  });

  it("sums by type, optionally filtered", () => {
    expect(sumBy(moves, ["purchase"])).toEqual({ a: 70 });
    expect(sumBy(moves, ["purchase", "waste"], (m) => m.shiftId === "s1")).toEqual({ a: 15 });
    expect(sumBy(moves, ["comp"])).toEqual({});
  });

  it("computes usage and shortage against the tolerance", () => {
    expect(usage(30, 10, 25)).toBe(15);
    expect(TOLERANCE_TENTHS).toBe(2.5);
    expect(shortage(-2)).toBe(false);
    expect(shortage(-3)).toBe(true);
    expect(shortage(-3, 5)).toBe(false);
    expect(shortage(4)).toBe(false);
  });

  it("weights the average cost", () => {
    expect(weightedAvgCost(10, 2000, 10, 3000)).toBe(2500);
    expect(weightedAvgCost(0, 2000, 10, 3000)).toBe(3000);
    expect(weightedAvgCost(-5, 2000, 10, 3333.4)).toBe(3333);
    expect(weightedAvgCost(10, 2000, 0, 9999)).toBe(2000);
  });

  it("formats tenths as bottles", () => {
    expect(formatTenths(37)).toBe("3.7");
    expect(formatTenths(0)).toBe("0.0");
  });
});

describe("shiftStockReport", () => {
  const items = [
    { id: "gin", name: "Gin", unit: "bottle" as const, avgCostCents: 2600, parLevel: 40 },
    { id: "rum", name: "Rum", unit: "bottle" as const, avgCostCents: 2000 },
    { id: "new", name: "New", unit: "unit" as const, avgCostCents: 500, parLevel: 10 },
    { id: "idle", name: "Idle", unit: "bottle" as const, avgCostCents: 1000 },
  ];
  const r = shiftStockReport({
    items,
    previousClosing: { gin: 50, rum: 20, new: undefined, idle: 5 },
    purchasesBetween: { gin: 10 },
    opening: { gin: 52, rum: 19, new: 6 },
    purchasesDuring: { gin: 12 },
    losses: { gin: 2 },
    closing: { gin: 30, new: 4 },
  });

  it("flags a shortage beyond the tolerance and costs it", () => {
    const gin = r.rows[0]!;
    expect(gin).toMatchObject({ expectedOpening: 60, opening: 52, difference: -8, status: "short", used: 34, purchases: 12, losses: 2, closing: 30, belowPar: true });
    expect(gin.lostCostCents).toBe(Math.round(0.8 * 2600));
  });

  it("keeps a small difference ok and an uncounted closing pending usage", () => {
    expect(r.rows[1]).toMatchObject({ difference: -1, status: "ok", used: null, closing: null, lostCostCents: 0, belowPar: false });
  });

  it("has no expected opening without a previous close", () => {
    expect(r.rows[2]).toMatchObject({ expectedOpening: null, difference: null, status: "pending", used: 2, belowPar: true });
  });

  it("leaves an item counted nowhere as pending", () => {
    expect(r.rows[3]).toMatchObject({ opening: null, closing: null, difference: null, status: "pending", belowPar: false });
  });

  it("totals short items, lost cost and counted items", () => {
    expect(r.totals).toEqual({ shortItems: 1, lostCostCents: Math.round(0.8 * 2600), counted: 3 });
  });

  it("uses a custom tolerance", () => {
    const loose = shiftStockReport({
      items: [items[0]!],
      previousClosing: { gin: 50 },
      purchasesBetween: {},
      opening: { gin: 45 },
      purchasesDuring: {},
      losses: {},
      closing: {},
      toleranceTenths: 10,
    });
    expect(loose.rows[0]!.status).toBe("ok");
    expect(loose.rows[0]!.belowPar).toBe(false);
  });
});
