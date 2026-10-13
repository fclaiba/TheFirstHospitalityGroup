// One shift's bar report from the tables (BLUEPRINT 2.2, 2.4): used by inventory.shiftReport, the close summary and
// the owner dashboard, so the three always agree. The arithmetic is lib/domain/stock.ts.
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { shiftStockReport, sumBy } from "../../lib/domain/stock";
import type { Move } from "../../lib/domain/stock";

export async function shiftStock(ctx: QueryCtx, shift: Doc<"shifts">) {
  const items = (
    await ctx.db
      .query("inventoryItems")
      .withIndex("by_venue_sort", (q) => q.eq("venueId", shift.venueId))
      .collect()
  ).filter((i) => i.active);
  const counts = await ctx.db
    .query("inventoryCounts")
    .withIndex("by_shift", (q) => q.eq("shiftId", shift._id))
    .collect();
  const latest = (phase: "open" | "close") => {
    const out: Record<string, number> = {};
    for (const c of counts.filter((c) => c.phase === phase).sort((a, b) => a.at - b.at)) out[c.itemId] = c.qtyTenths;
    return out;
  };
  const opening = latest("open");
  const closing = latest("close");

  const previousClosing: Record<string, number | undefined> = {};
  const purchasesBetween: Record<string, number> = {};
  const purchasesDuring: Record<string, number> = {};
  const losses: Record<string, number> = {};
  const openedAt = shift.openedAt ?? shift.startsAt;
  for (const item of items) {
    // The last closing count of this item before this shift opened.
    const prior = await ctx.db
      .query("inventoryCounts")
      .withIndex("by_item", (q) => q.eq("itemId", item._id).lt("at", openedAt))
      .order("desc")
      .take(40);
    const prev = prior.find((c) => c.phase === "close" && c.shiftId !== shift._id);
    previousClosing[item._id] = prev?.qtyTenths;
    const since = prev?.at ?? 0;
    const moves = (await ctx.db
      .query("stockMoves")
      .withIndex("by_item_at", (q) => q.eq("itemId", item._id).gt("at", since))
      .collect()) as unknown as Move[];
    const between = moves.filter((m) => m.at < openedAt && m.shiftId !== (shift._id as string));
    const during = moves.filter((m) => m.shiftId === (shift._id as string) || m.at >= openedAt);
    purchasesBetween[item._id] = sumBy(between, ["purchase", "transfer_in"])[item._id] ?? 0;
    purchasesDuring[item._id] = sumBy(during, ["purchase", "transfer_in"])[item._id] ?? 0;
    losses[item._id] = -(sumBy(during, ["waste", "comp", "transfer_out"])[item._id] ?? 0);
  }
  const report = shiftStockReport({
    items: items.map((i) => ({ id: i._id, name: i.name, unit: i.unit, avgCostCents: i.avgCostCents, parLevel: i.parLevel })),
    previousClosing,
    purchasesBetween,
    opening,
    purchasesDuring,
    losses,
    closing,
  });
  const missing = (phase: "open" | "close") => items.filter((i) => (phase === "open" ? opening : closing)[i._id] === undefined).map((i) => i._id as Id<"inventoryItems">);
  return { ...report, items, missingOpen: missing("open"), missingClose: missing("close") };
}
