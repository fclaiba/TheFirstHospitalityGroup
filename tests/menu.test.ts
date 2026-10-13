import { describe, expect, it } from "vitest";
import { World } from "./support/engine";

// Menu (ADR 0018, 0021, 0022) over the real handlers: no prices, 86s for one service, confirmations of new and changed
// items, drinks and wine proposals approved by the GM, the quiz as Passed or Not yet.

const T = 30_000;
type Item = { _id: string; name: { en: string }; kind: string; is86: boolean; available: boolean; pendingAck: boolean; version: number };
const byName = (w: World, en: string) => w.rows("menuItems").find((i) => (i.name as { en: string }).en === en)!;

describe("menu", () => {
  it("lists food, drinks and wine with no price field and the soufflé 86'd tonight", async () => {
    const w = await World.create();
    await w.as("ana.p");
    const items = await w.q<Item[]>("menu:list", {});
    expect(items.length).toBe(19);
    expect(Object.keys(items[0]!).join(" ")).not.toMatch(/price|cents|cost/i);
    expect(items.find((i) => i.name.en === "Chocolate soufflé")!.is86).toBe(true);
    const drinks = await w.q<Item[]>("menu:list", { kind: "drink" });
    expect(drinks.every((i) => i.kind === "drink")).toBe(true);
  }, T);

  it("a changed item asks front of house to confirm it; confirming clears it", async () => {
    const w = await World.create();
    await w.as("ana.p");
    const pending = await w.q<Array<{ _id: string; name: { en: string } }>>("menu:pendingAcks", {});
    expect(pending.map((p) => p.name.en)).toContain("Black cod, miso");
    await w.m("menu:confirm", { itemIds: pending.map((p) => p._id) });
    expect(await w.q<unknown[]>("menu:pendingAcks", {})).toEqual([]);
    // Line cooks confirm food, never drinks; the dishwasher confirms nothing.
    await w.as("ken.w");
    expect((await w.q<Array<{ kind: string }>>("menu:pendingAcks", {})).every((p) => p.kind === "food")).toBe(true);
    await w.as("jose.r");
    expect(await w.q<unknown[]>("menu:pendingAcks", {})).toEqual([]);
  }, T);

  it("the chef edits food: a content change bumps the version and notifies front of house", async () => {
    const w = await World.create();
    const cod = byName(w, "Black cod, miso");
    await w.as("chef.marco");
    const before = w.rows("outbound").length;
    await w.m("menu:upsert", {
      itemId: cod._id,
      kind: "food",
      name: cod.name,
      description: { en: "New garnish", es: "Nueva guarnición" },
      ingredients: cod.ingredients,
      allergens: cod.allergens,
      category: "mains",
      tags: [],
      active: true,
    });
    expect(byName(w, "Black cod, miso").version).toBe(3);
    expect(w.rows("outbound").length).toBeGreaterThan(before);
    expect(w.rows("outbound").at(-1)!.topic).toBe("menu");
    // The chef does not edit drinks; staff do not edit anything.
    const martini = byName(w, "The First Martini");
    expect(await w.code("menu:upsert", { itemId: martini._id, kind: "drink", name: martini.name, description: martini.description, ingredients: martini.ingredients, allergens: [], category: "cocktails", tags: [], active: true })).toBe("FORBIDDEN");
    await w.as("ana.p");
    expect(await w.code("menu:upsert", { kind: "food", name: { en: "X", es: "X" }, description: { en: "", es: "" }, ingredients: { en: "", es: "" }, allergens: [], category: "mains", tags: [], active: true })).toBe("FORBIDDEN");
  }, T);

  it("the head bartender proposes a drink and the GM approves it", async () => {
    const w = await World.create();
    await w.as("sam.r");
    const { itemId } = await w.m<{ itemId: string }>("menu:propose", { kind: "drink", name: { en: "Pear Collins", es: "Collins de pera" }, description: { en: "Gin, pear, lemon, soda.", es: "Gin, pera, limón, soda." }, ingredients: { en: "Gin, pear, lemon, soda", es: "Gin, pera, limón, soda" }, allergens: [], category: "cocktails", tags: [], active: true });
    expect(w.rows("outbound").some((o) => o.userId === w.user("elena.g")._id && o.topic === "approval")).toBe(true);
    expect(await w.code("menu:propose", { kind: "food", name: { en: "X", es: "X" }, description: { en: "", es: "" }, ingredients: { en: "", es: "" }, allergens: [], category: "mains", tags: [], active: true })).toBe("FORBIDDEN");
    // Not on the staff menu until approved.
    await w.as("ana.p");
    expect((await w.q<Item[]>("menu:list", {})).some((i) => i._id === itemId)).toBe(false);
    await w.as("maria.m");
    expect(await w.code("menu:decideProposal", { itemId, approve: true })).toBe("FORBIDDEN");
    await w.as("elena.g");
    const props = await w.q<Array<{ _id: string; canDecide: boolean }>>("menu:proposals", {});
    expect(props.find((p) => p._id === itemId)?.canDecide).toBe(true);
    await w.m("menu:decideProposal", { itemId, approve: true });
    await w.as("ana.p");
    const list = await w.q<Item[]>("menu:list", {});
    expect(list.find((i) => i._id === itemId)?.pendingAck).toBe(true);
  }, T);

  it("a proposed change to an existing wine applies to it with a new version", async () => {
    const w = await World.create();
    const barolo = byName(w, "Barolo, Piedmont 2018");
    await w.as("henri.l");
    const { itemId } = await w.m<{ itemId: string }>("menu:propose", { replaces: barolo._id, kind: "wine", name: barolo.name, description: { en: "Rose, tar, firm tannins. Decant 30 minutes.", es: "Rosa, alquitrán, taninos firmes. Decantar 30 minutos." }, ingredients: barolo.ingredients, allergens: barolo.allergens, category: "wine_red", tags: [], active: true });
    await w.as("victor.h");
    await w.m("menu:decideProposal", { itemId, approve: true });
    expect(w.rows("menuItems").some((i) => i._id === itemId)).toBe(false);
    expect(byName(w, "Barolo, Piedmont 2018").version).toBe(2);
  }, T);

  it("the expo 86s an item for the service, everyone on the floor hears it, and clears it", async () => {
    const w = await World.create();
    const tuna = byName(w, "Tuna crudo");
    await w.as("irene.k");
    await w.m("menu:set86", { shiftId: w.liveShift()._id, itemId: tuna._id, note: "Last two portions gone" });
    expect(w.rows("outbound").some((o) => o.userId === w.user("ana.p")._id && (o.payload as { title: string }).title.includes("Tuna"))).toBe(true);
    expect(w.rows("auditLogs").some((a) => a.action === "menu.86")).toBe(true);
    await w.as("ana.p");
    expect((await w.q<Item[]>("menu:list", {})).find((i) => i._id === tuna._id)!.is86).toBe(true);
    expect(await w.code("menu:set86", { shiftId: w.liveShift()._id, itemId: tuna._id })).toBe("FORBIDDEN");
    await w.as("irene.k");
    await w.m("menu:clear86", { shiftId: w.liveShift()._id, itemId: tuna._id });
    const live = await w.q<Array<{ itemId: string }>>("menu:eightySixes", { shiftId: w.liveShift()._id });
    expect(live.some((e) => e.itemId === tuna._id)).toBe(false);
  }, T);

  it("availability per venue is a manager's call", async () => {
    const w = await World.create();
    const fries = byName(w, "Hand-cut fries");
    await w.as("maria.m");
    await w.m("menu:setAvailability", { itemId: fries._id, venueId: w.venue("v1")._id, available: false });
    await w.as("ana.p");
    expect((await w.q<Item[]>("menu:list", {})).find((i) => i._id === fries._id)!.available).toBe(false);
    expect(await w.code("menu:setAvailability", { itemId: fries._id, venueId: w.venue("v1")._id, available: true })).toBe("FORBIDDEN");
  }, T);

  it("the quiz never sends the answers and answers Passed or Not yet, never a score", async () => {
    const w = await World.create();
    await w.as("carlos.g");
    const quiz = await w.q<{ questions: Array<{ itemId: string }> }>("menu:quiz", {});
    expect(quiz.questions.length).toBe(10);
    expect(JSON.stringify(quiz.questions)).not.toContain("allergens");
    const answers = quiz.questions.map((q) => ({ itemId: q.itemId, allergens: (w.rows("menuItems").find((i) => i._id === q.itemId)!.allergens as string[]) }));
    const r = await w.m<Record<string, unknown>>("menu:submitQuiz", { answers });
    expect(r).toEqual({ passed: true });
    const bad = await w.m<{ passed: boolean }>("menu:submitQuiz", { answers: answers.map((a) => ({ ...a, allergens: ["lupin"] })) });
    expect(bad.passed).toBe(false);
  }, T);
});
