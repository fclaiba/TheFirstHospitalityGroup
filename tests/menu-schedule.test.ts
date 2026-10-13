import { describe, expect, it } from "vitest";
import { World } from "./support/engine";
import { addDays, nyDateKey } from "../lib/time";

// Menu and schedule contracts (BLUEPRINT 7.2) over the real handlers (ADR 0018).

type Item = { _id: string; name: { en: string }; available: boolean; priceCents: number; basePriceCents: number; category: string; allergens: string[] };

const souffle = (items: Item[]) => items.find((i) => i.name.en === "Chocolate soufflé")!;

describe("menu", () => {
  it("shows the 86'd soufflé unavailable at Midtown only", async () => {
    const w = await World.create();
    await w.as("ana.p");
    const midtown = await w.q<Item[]>("menu:list", { venueId: w.venue("v1")._id });
    expect(souffle(midtown).available).toBe(false);
    expect(midtown.filter((i) => !i.available)).toHaveLength(1);
    await w.as("owner");
    const tribeca = await w.q<Item[]>("menu:list", { venueId: w.venue("v2")._id });
    expect(souffle(tribeca).available).toBe(true);
  });

  it("sorts by category order and filters by search in both languages", async () => {
    const w = await World.create();
    await w.as("ana.p");
    const items = await w.q<Item[]>("menu:list", { venueId: w.venue("v1")._id });
    expect(items[0]!.category).toBe("starters");
    const hits = await w.q<Item[]>("menu:list", { venueId: w.venue("v1")._id, q: "langosta" });
    expect(hits.map((i) => i.name.en)).toEqual(["Lobster linguine"]);
  });

  it("lets staff read but not another venue", async () => {
    const w = await World.create();
    await w.as("ana.p");
    expect(await w.qcode("menu:list", { venueId: w.venue("v2")._id })).toBe("VENUE_FORBIDDEN");
    const item = (await w.q<Item[]>("menu:list", { venueId: w.venue("v1")._id }))[0]!;
    const got = await w.q<Item>("menu:get", { itemId: item._id, venueId: w.venue("v1")._id });
    expect(got._id).toBe(item._id);
  });

  it("owner creates and reprices catalog items, with audit", async () => {
    const w = await World.create();
    await w.as("owner");
    const base = { name: { en: "Gazpacho", es: "Gazpacho" }, description: { en: "", es: "" }, ingredients: { en: "", es: "" }, allergens: ["celery"], category: "starters", priceCents: 1400, tags: [], active: true };
    const { itemId } = await w.m<{ itemId: string }>("menu:upsert", base);
    await w.m("menu:upsert", { ...base, itemId, priceCents: 1600 });
    const audits = w.rows("auditLogs").filter((a) => a.entityId === itemId);
    expect(audits.map((a) => a.action)).toEqual(expect.arrayContaining(["menu.changed", "menu.price_changed"]));
    expect(audits.find((a) => a.action === "menu.price_changed")!.meta).toEqual({ from: 1400, to: 1600 });
  });

  it("rejects invalid catalog input", async () => {
    const w = await World.create();
    await w.as("owner");
    const code = await w.code("menu:upsert", { name: { en: "", es: "x" }, description: { en: "", es: "" }, ingredients: { en: "", es: "" }, allergens: ["nope"], category: "mains", priceCents: 100, tags: [], active: true });
    expect(code).toBe("INVALID_INPUT");
  });

  it("manager cannot edit the catalog but sets availability and price for their venue", async () => {
    const w = await World.create();
    await w.as("maria.m");
    const items = await w.q<Item[]>("menu:list", { venueId: w.venue("v1")._id });
    const s = souffle(items);
    expect(await w.code("menu:upsert", { itemId: s._id, name: { en: "x", es: "x" }, description: { en: "", es: "" }, ingredients: { en: "", es: "" }, allergens: [], category: "desserts", priceCents: 1, tags: [], active: true })).toBe("FORBIDDEN");
    await w.m("menu:setAvailability", { itemId: s._id, venueId: w.venue("v1")._id, available: true, priceOverrideCents: 1800 });
    const after = souffle(await w.q<Item[]>("menu:list", { venueId: w.venue("v1")._id }));
    expect(after.available).toBe(true);
    expect(after.priceCents).toBe(1800);
    expect(after.basePriceCents).toBe(1600);
    expect(await w.code("menu:setAvailability", { itemId: s._id, venueId: w.venue("v2")._id, available: false })).toBe("VENUE_FORBIDDEN");
    const actions = w.rows("auditLogs").filter((a) => a.entityId === s._id).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["menu.availability", "menu.price_changed"]));
  });

  it("staff cannot set availability", async () => {
    const w = await World.create();
    await w.as("ana.p");
    const s = souffle(await w.q<Item[]>("menu:list", { venueId: w.venue("v1")._id }));
    expect(await w.code("menu:setAvailability", { itemId: s._id, venueId: w.venue("v1")._id, available: true })).toBe("FORBIDDEN");
  });

  it("records menu_item_viewed", async () => {
    const w = await World.create();
    await w.as("ana.p");
    const s = souffle(await w.q<Item[]>("menu:list", { venueId: w.venue("v1")._id }));
    await w.m("menu:viewed", { itemId: s._id, venueId: w.venue("v1")._id });
    expect(w.rows("analyticsEvents").some((e) => e.name === "menu_item_viewed")).toBe(true);
  });
});

type Week = { days: Array<{ date: string; services: Array<{ service: string; people: Array<{ userId: string; mine: boolean; published: boolean }> }> }>; unpublished: number };

describe("schedule", () => {
  it("shows the published week and my shifts", async () => {
    const w = await World.create();
    await w.as("ana.p");
    const week = await w.q<Week>("schedule:week", { venueId: w.venue("v1")._id });
    expect(week.days).toHaveLength(7);
    expect(week.days.flatMap((d) => d.services).length).toBeGreaterThan(0);
    const mine = await w.q<Array<{ date: string; service: string }>>("schedule:mine", { venueId: w.venue("v1")._id });
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((m) => m.service === "dinner")).toBe(true);
  });

  it("manager drafts, staff do not see drafts until published", async () => {
    const w = await World.create();
    await w.as("maria.m");
    const date = addDays(nyDateKey(Date.now()), 10);
    const venueId = w.venue("v1")._id;
    const ana = w.user("ana.p")._id;
    await w.m("schedule:upsertEntry", { venueId, userId: ana, date, service: "lunch" });
    const draft = await w.q<Week>("schedule:week", { venueId, from: date });
    expect(draft.unpublished).toBe(1);
    await w.as("ana.p");
    const hidden = await w.q<Week>("schedule:week", { venueId, from: date });
    expect(hidden.days[0]!.services.find((s) => s.service === "lunch")).toBeUndefined();
    expect(await w.code("schedule:publish", { venueId, from: date })).toBe("FORBIDDEN");
    await w.as("maria.m");
    expect(await w.m<{ published: number }>("schedule:publish", { venueId, from: date })).toEqual({ published: 1 });
    expect(w.rows("auditLogs").some((a) => a.action === "schedule.published")).toBe(true);
    await w.as("ana.p");
    const shown = await w.q<Week>("schedule:week", { venueId, from: date });
    expect(shown.days[0]!.services.find((s) => s.service === "lunch")!.people[0]!.mine).toBe(true);
  });

  it("refuses people and services that do not belong to the venue", async () => {
    const w = await World.create();
    await w.as("maria.m");
    const date = addDays(nyDateKey(Date.now()), 3);
    expect(await w.code("schedule:upsertEntry", { venueId: w.venue("v1")._id, userId: w.user("emma.t")._id, date, service: "dinner" })).toBe("VENUE_FORBIDDEN");
    expect(await w.code("schedule:upsertEntry", { venueId: w.venue("v1")._id, userId: w.user("ana.p")._id, date, service: "late" })).toBe("NOT_SCHEDULED");
    expect(await w.code("schedule:upsertEntry", { venueId: w.venue("v2")._id, userId: w.user("emma.t")._id, date, service: "dinner" })).toBe("VENUE_FORBIDDEN");
  });

  it("manages events with validation and audit", async () => {
    const w = await World.create();
    await w.as("maria.m");
    const venueId = w.venue("v1")._id;
    const date = addDays(nyDateKey(Date.now()), 2);
    const ev = { venueId, date, title: { en: "Buyout", es: "Evento privado" }, kind: "buyout", startsAt: "18:00", guests: 80, notes: { en: "", es: "" } };
    const { eventId } = await w.m<{ eventId: string }>("schedule:upsertEvent", ev);
    expect((await w.q<Array<{ _id: string }>>("schedule:events", { venueId })).some((e) => e._id === eventId)).toBe(true);
    expect(await w.code("schedule:upsertEvent", { ...ev, startsAt: "6pm" })).toBe("INVALID_INPUT");
    await w.m("schedule:removeEvent", { eventId });
    expect(w.rows("auditLogs").filter((a) => a.entityId === eventId).map((a) => a.action)).toEqual(["event.changed", "event.changed"]);
    await w.as("ana.p");
    expect(await w.code("schedule:upsertEvent", ev)).toBe("FORBIDDEN");
  });
});
