import { beforeEach, describe, expect, it } from "vitest";
import { World } from "./support/engine";
import { addDays, nyDateKey } from "../lib/time";

// Bar inventory (BLUEPRINT 2.2, 2.4, 7.2): role and venue guards, tenths, append-only moves, the shift report.

let w: World;
beforeEach(async () => {
  w = await World.create();
});

const v1Items = () => w.rows("inventoryItems").filter((i) => i.venueId === w.venue("v1")._id);
const item = (name: string, slug: "v1" | "v2" = "v1") => w.rows("inventoryItems").find((i) => i.name === name && i.venueId === w.venue(slug)._id)!;
const yesterday = () => w.rows("shifts").find((s) => s.venueId === w.venue("v1")._id && s.date === addDays(nyDateKey(Date.now()), -1))!;

describe("inventory.count", () => {
  it("lets the bartender count closing on the live Midtown shift", async () => {
    const shiftId = w.liveShift()._id;
    await w.as("maria.m");
    await w.m("shifts:startClosing", { shiftId });
    await w.as("sam.r");
    const before = w.rows("inventoryCounts").length;
    const counts = v1Items().map((i) => ({ itemId: i._id, qtyTenths: 15 }));
    expect(await w.m("inventory:count", { shiftId, phase: "close", counts })).toEqual({ counted: counts.length });
    expect(w.rows("inventoryCounts").length).toBe(before + counts.length);
    const sheet = await w.q<{ phase: string; counted: number }>("inventory:countSheet", { venueId: w.venue("v1")._id });
    expect(sheet.phase).toBe("close");
    expect(sheet.counted).toBe(counts.length);
    expect(w.rows("auditLogs").some((a) => a.action === "stock.count")).toBe(true);
  });

  it("refuses a server (FORBIDDEN) and staff of another venue (VENUE_FORBIDDEN)", async () => {
    const args = { shiftId: w.liveShift()._id, phase: "open", counts: [{ itemId: v1Items()[0]!._id, qtyTenths: 10 }] };
    await w.as("ana.p");
    expect(await w.code("inventory:count", args)).toBe("FORBIDDEN");
    await w.as("diego.v");
    expect(await w.code("inventory:count", args)).toBe("VENUE_FORBIDDEN");
    expect(await w.qcode("inventory:countSheet", { venueId: w.venue("v1")._id })).toBe("VENUE_FORBIDDEN");
    await w.as("emma.t");
    expect(await w.qcode("inventory:items", { venueId: w.venue("v1")._id })).toBe("FORBIDDEN");
  });

  it("rejects negative or fractional tenths", async () => {
    await w.as("sam.r");
    const base = { shiftId: w.liveShift()._id, phase: "open" };
    expect(await w.code("inventory:count", { ...base, counts: [{ itemId: v1Items()[0]!._id, qtyTenths: -1 }] })).toBe("INVALID_INPUT");
    expect(await w.code("inventory:count", { ...base, counts: [{ itemId: v1Items()[0]!._id, qtyTenths: 2.5 }] })).toBe("INVALID_INPUT");
  });

  it("rejects an item of another venue", async () => {
    await w.as("sam.r");
    expect(await w.code("inventory:count", { shiftId: w.liveShift()._id, phase: "open", counts: [{ itemId: item("Vodka", "v2")._id, qtyTenths: 10 }] })).toBe("NOT_FOUND");
  });

  it("answers SHIFT_NOT_OPEN on a closed shift", async () => {
    await w.as("sam.r");
    expect(await w.code("inventory:count", { shiftId: yesterday()._id, phase: "close", counts: [{ itemId: v1Items()[0]!._id, qtyTenths: 10 }] })).toBe("SHIFT_NOT_OPEN");
  });
});

describe("purchases and moves", () => {
  it("updates the weighted average cost on a purchase", async () => {
    await w.as("maria.m");
    const gin = item("Gin, London Dry");
    const items = await w.q<Array<{ _id: string; onHandTenths: number; avgCostCents: number }>>("inventory:items", { venueId: w.venue("v1")._id });
    const before = items.find((i) => i._id === gin._id)!;
    const r = await w.m<{ avgCostCents: number }>("inventory:recordPurchase", { venueId: w.venue("v1")._id, itemId: gin._id, qtyTenths: 60, unitCostCents: 3200 });
    const expected = Math.round((before.onHandTenths * before.avgCostCents + 60 * 3200) / (before.onHandTenths + 60));
    expect(r.avgCostCents).toBe(expected);
    expect(item("Gin, London Dry").avgCostCents).toBe(expected);
  });

  it("requires a note for waste", async () => {
    await w.as("maria.m");
    expect(await w.code("inventory:recordMove", { venueId: w.venue("v1")._id, itemId: item("Vodka")._id, type: "waste", qtyTenths: 2, note: "" })).toBe("INVALID_INPUT");
  });

  it("keeps moves append-only: every action adds a row and nothing edits or deletes one", async () => {
    await w.as("maria.m");
    const before = w.rows("stockMoves").length;
    await w.m("inventory:recordMove", { venueId: w.venue("v1")._id, itemId: item("Vodka")._id, type: "waste", qtyTenths: 2, note: "Broken bottle" });
    await w.m("inventory:recordMove", { venueId: w.venue("v1")._id, itemId: item("Vodka")._id, type: "adjustment", qtyTenths: 3, note: "Found in storage" });
    const moves = w.rows("stockMoves");
    expect(moves.length).toBe(before + 2);
    expect(moves.at(-2)!.qtyTenths).toBe(-2);
    expect(moves.at(-1)!.qtyTenths).toBe(3);
    const mod = (await import("../convex/inventory")) as Record<string, unknown>;
    expect(Object.keys(mod).filter((k) => /update|delete|remove|edit/i.test(k) && k !== "upsertItem")).toEqual([]);
  });

  it("transfers out of Midtown into Tribeca", async () => {
    await w.as("owner");
    const r = await w.m<{ toItemId: string }>("inventory:recordMove", {
      venueId: w.venue("v1")._id,
      itemId: item("Campari")._id,
      type: "transfer_out",
      qtyTenths: 10,
      toVenueId: w.venue("v2")._id,
      note: "Tribeca ran out",
    });
    expect(r.toItemId).toBe(item("Campari", "v2")._id);
    const moves = w.rows("stockMoves").slice(-2);
    expect(moves.map((m) => [m.type, m.qtyTenths, m.venueId])).toEqual([
      ["transfer_in", 10, w.venue("v2")._id],
      ["transfer_out", -10, w.venue("v1")._id],
    ]);
  });

  it("refuses purchases from bar staff", async () => {
    await w.as("sam.r");
    expect(await w.code("inventory:recordPurchase", { venueId: w.venue("v1")._id, itemId: item("Vodka")._id, qtyTenths: 10, unitCostCents: 100 })).toBe("FORBIDDEN");
  });
});

describe("inventory.shiftReport", () => {
  it("flags last night's Mezcal shortage with its lost cost", async () => {
    await w.as("maria.m");
    const r = await w.q<{ money: boolean; rows: Array<{ name: string; difference: number | null; status: string; lostCostCents: number }>; totals: { shortItems: number; lostCostCents: number } }>(
      "inventory:shiftReport",
      { shiftId: yesterday()._id },
    );
    const mezcal = r.rows.find((x) => x.name === "Mezcal")!;
    expect(mezcal.difference).toBe(-8);
    expect(mezcal.status).toBe("short");
    expect(mezcal.lostCostCents).toBe(Math.round(0.8 * Number(item("Mezcal").avgCostCents)));
    expect(r.totals.lostCostCents).toBeGreaterThanOrEqual(mezcal.lostCostCents);
    expect(r.money).toBe(true);
  });

  it("hides money from bar staff", async () => {
    await w.as("sam.r");
    const r = await w.q<{ money: boolean; totals: { lostCostCents: number } }>("inventory:shiftReport", { shiftId: yesterday()._id });
    expect(r.money).toBe(false);
    expect(r.totals.lostCostCents).toBe(0);
  });

  it("lists recent moves for managers only", async () => {
    await w.as("maria.m");
    const h = await w.q<Array<{ itemName: string }>>("inventory:history", { venueId: w.venue("v1")._id, limit: 5 });
    expect(h).toHaveLength(5);
    expect(h[0]!.itemName).not.toBe("");
    await w.as("sam.r");
    expect(await w.qcode("inventory:history", { venueId: w.venue("v1")._id })).toBe("FORBIDDEN");
  });
});

describe("inventory.upsertItem", () => {
  it("creates and edits an item, audited", async () => {
    await w.as("maria.m");
    const { itemId } = await w.m<{ itemId: string }>("inventory:upsertItem", { venueId: w.venue("v1")._id, name: "Amaro", category: "aperitif", unit: "bottle", parLevel: 20, avgCostCents: 3000, active: true });
    await w.m("inventory:upsertItem", { itemId, venueId: w.venue("v1")._id, name: "Amaro Nonino", category: "aperitif", unit: "bottle", parLevel: 20, avgCostCents: 3000, active: false });
    expect(w.rows("inventoryItems").find((i) => i._id === itemId)!.name).toBe("Amaro Nonino");
    expect(w.rows("auditLogs").filter((a) => a.action === "stock.item_changed")).toHaveLength(2);
    await w.as("james.k");
    expect(await w.code("inventory:upsertItem", { itemId, venueId: w.venue("v1")._id, name: "X", category: "x", unit: "bottle", avgCostCents: 1, active: true })).toBe("VENUE_FORBIDDEN");
  });
});
