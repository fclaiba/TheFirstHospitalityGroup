import { describe, expect, it } from "vitest";
import { World } from "./support/engine";

// Bar shortages (ADR 0023) over the real handlers: Low or Out by bar staff, Restocked or Ordered by the head
// bartender or manager, carried over, in the close. No counts, no costs.

const T = 30_000;
const item = (w: World, name: string) => w.rows("barItems").find((b) => b.venueId === w.venue("v1")._id && b.name === name)!;

describe("bar shortages", () => {
  it("a barback reports Low, the head bartender and manager hear it, the head bartender restocks it", async () => {
    const w = await World.create();
    // Arrange a new item: demo history may already have an unchanged Low report for a seeded bottle.
    await w.as("maria.m");
    const { itemId } = await w.m<{ itemId: string }>("bar:upsertItem", { venueId: w.venue("v1")._id, name: "Service training bottle", kind: "bottle", active: true });
    await w.as("lucia.f");
    const { shortageId } = await w.m<{ shortageId: string }>("bar:report", { shiftId: w.liveShift()._id, itemId, level: "low" });
    for (const u of ["sam.r", "maria.m"]) expect(w.rows("outbound").some((o) => o.userId === w.user(u)._id && o.topic === "shortage")).toBe(true);
    const notifications = w.rows("outbound").length;
    expect(await w.m("bar:report", { shiftId: w.liveShift()._id, itemId, level: "low" })).toEqual({ shortageId, updated: false });
    expect(w.rows("outbound")).toHaveLength(notifications);
    await w.as("zoe.a");
    const open = await w.q<{ open: Array<{ _id: string; level: string }> }>("bar:open", {});
    expect(open.open.map((s) => s._id)).toContain(shortageId);
    // Reporting again updates the same shortage.
    const again = await w.m<{ shortageId: string; updated: boolean }>("bar:report", { shiftId: w.liveShift()._id, itemId, level: "out" });
    expect(again).toEqual({ shortageId, updated: true });
    expect(await w.code("bar:resolve", { shortageId, status: "restocked" })).toBe("FORBIDDEN");
    await w.as("sam.r");
    await w.m("bar:resolve", { shortageId, status: "restocked" });
    expect(w.rows("shortages").find((s) => s._id === shortageId)!.status).toBe("restocked");
    expect(w.rows("auditLogs").some((a) => a.action === "shortage.resolved")).toBe(true);
    expect(await w.code("bar:resolve", { shortageId, status: "ordered" })).toBe("INVALID_TRANSITION");
  }, T);

  it("ordered shortages carry over until restocked", async () => {
    const w = await World.create();
    const lime = w.rows("shortages").find((s) => s.level === "out" && s.status === "open")!;
    await w.as("maria.m");
    await w.m("bar:resolve", { shortageId: lime._id, status: "ordered" });
    const r = await w.q<{ open: unknown[]; ordered: Array<{ _id: string }> }>("bar:open", { venueId: w.venue("v1")._id });
    expect(r.ordered.map((s) => s._id)).toContain(lime._id);
    await w.m("bar:resolve", { shortageId: lime._id, status: "restocked" });
  }, T);

  it("needs a live shift, a bar position, and the venue's own items", async () => {
    const w = await World.create();
    const closed = w.rows("shifts").find((s) => s.status === "closed" && s.venueId === w.venue("v1")._id)!;
    await w.as("lucia.f");
    expect(await w.code("bar:report", { shiftId: closed._id, itemId: item(w, "Vodka")._id, level: "low" })).toBe("SHIFT_NOT_OPEN");
    const v2Item = w.rows("barItems").find((b) => b.venueId === w.venue("v2")._id)!;
    expect(await w.code("bar:report", { shiftId: w.liveShift()._id, itemId: v2Item._id, level: "low" })).toBe("NOT_FOUND");
    await w.as("ana.p");
    expect(await w.code("bar:report", { shiftId: w.liveShift()._id, itemId: item(w, "Vodka")._id, level: "low" })).toBe("FORBIDDEN");
    await w.as("diego.v");
    expect(await w.qcode("bar:open", { venueId: w.venue("v1")._id })).toBe("VENUE_FORBIDDEN");
  }, T);

  it("managers add items; the data model has no counts or costs", async () => {
    const w = await World.create();
    await w.as("maria.m");
    const { itemId } = await w.m<{ itemId: string }>("bar:upsertItem", { venueId: w.venue("v1")._id, name: "Orgeat", kind: "other", active: true });
    expect(w.rows("barItems").find((b) => b._id === itemId)).toMatchObject({ name: "Orgeat" });
    await w.as("sam.r");
    expect(await w.code("bar:upsertItem", { venueId: w.venue("v1")._id, name: "X", kind: "other", active: true })).toBe("FORBIDDEN");
    const keys = Object.keys(w.rows("shortages")[0]!).join(" ");
    expect(keys).not.toMatch(/cost|price|cents|qty/i);
  }, T);
});
