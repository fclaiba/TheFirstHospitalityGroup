// Bar inventory (BLUEPRINT 2.2, 2.4), ported from the OSCURA stock ledger (its ADR 0014) and moved to integer tenths:
// 10 = one bottle, 7 = 0.7 bottle. Moves are append-only. There are no sales in The First (the POS sells), so the
// shortage is what the shelf lost without a record: the opening count against the last closing count plus purchases.
import type { StockMoveType } from "./types";

/** 0.25 bottle per item per shift (from OSCURA ADR 0014), in tenths. */
export const TOLERANCE_TENTHS = 2.5;
export const MAX_COUNT_TENTHS = 100_000;

export type Move = { itemId: string; qtyTenths: number; type: StockMoveType; unitCostCents?: number; shiftId?: string; at: number };

export function isValidCount(qtyTenths: number): boolean {
  return Number.isInteger(qtyTenths) && qtyTenths >= 0 && qtyTenths <= MAX_COUNT_TENTHS;
}

export function onHand(moves: Move[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of moves) out[m.itemId] = (out[m.itemId] ?? 0) + m.qtyTenths;
  return out;
}

/** Bottles consumed during a shift. */
export function usage(openingTenths: number, purchasesTenths: number, closingTenths: number): number {
  return openingTenths + purchasesTenths - closingTenths;
}

export function shortage(diffTenths: number, toleranceTenths = TOLERANCE_TENTHS): boolean {
  return diffTenths < -toleranceTenths;
}

/** Weighted average cost per bottle after a purchase. Empty stock restarts from the purchase cost. */
export function weightedAvgCost(prevTenths: number, prevAvgCents: number, addTenths: number, addCostCents: number): number {
  if (addTenths <= 0) return prevAvgCents;
  if (prevTenths <= 0) return Math.round(addCostCents);
  return Math.round((prevTenths * prevAvgCents + addTenths * addCostCents) / (prevTenths + addTenths));
}

export function sumBy(moves: Move[], types: StockMoveType[], filter?: (m: Move) => boolean): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of moves) {
    if (!types.includes(m.type) || (filter && !filter(m))) continue;
    out[m.itemId] = (out[m.itemId] ?? 0) + m.qtyTenths;
  }
  return out;
}

export type StockRow = {
  itemId: string;
  name: string;
  unit: "bottle" | "unit";
  expectedOpening: number | null;
  opening: number | null;
  purchases: number;
  losses: number;
  closing: number | null;
  used: number | null;
  difference: number | null;
  status: "ok" | "short" | "pending";
  lostCostCents: number;
  belowPar: boolean;
};

/**
 * One shift's report per item.
 *   expectedOpening = last closing count before this shift + purchases recorded in between
 *   difference      = opening - expectedOpening (negative: bottles left the shelf with no record)
 *   used            = opening + purchases during the shift - closing
 */
export function shiftStockReport(input: {
  items: Array<{ id: string; name: string; unit: "bottle" | "unit"; avgCostCents: number; parLevel?: number }>;
  previousClosing: Record<string, number | undefined>;
  purchasesBetween: Record<string, number>;
  opening: Record<string, number | undefined>;
  purchasesDuring: Record<string, number>;
  losses: Record<string, number>;
  closing: Record<string, number | undefined>;
  toleranceTenths?: number;
}): { rows: StockRow[]; totals: { shortItems: number; lostCostCents: number; counted: number } } {
  let shortItems = 0;
  let lostCostCents = 0;
  let counted = 0;
  const rows = input.items.map((it): StockRow => {
    const prev = input.previousClosing[it.id];
    const expectedOpening = prev === undefined ? null : prev + (input.purchasesBetween[it.id] ?? 0);
    const opening = input.opening[it.id] ?? null;
    const closing = input.closing[it.id] ?? null;
    const purchases = input.purchasesDuring[it.id] ?? 0;
    const difference = opening === null || expectedOpening === null ? null : opening - expectedOpening;
    const used = opening === null || closing === null ? null : usage(opening, purchases, closing);
    const short = difference !== null && shortage(difference, input.toleranceTenths);
    const lost = short ? Math.round((-difference! / 10) * it.avgCostCents) : 0;
    if (opening !== null || closing !== null) counted += 1;
    if (short) shortItems += 1;
    lostCostCents += lost;
    const last = closing ?? opening;
    return {
      itemId: it.id,
      name: it.name,
      unit: it.unit,
      expectedOpening,
      opening,
      purchases,
      losses: input.losses[it.id] ?? 0,
      closing,
      used,
      difference,
      status: difference === null ? "pending" : short ? "short" : "ok",
      lostCostCents: lost,
      belowPar: !!it.parLevel && last !== null && last < it.parLevel,
    };
  });
  return { rows, totals: { shortItems, lostCostCents, counted } };
}

export const formatTenths = (t: number) => (t / 10).toFixed(1);
