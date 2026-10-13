import { describe, expect, it } from "vitest";
import { World } from "./support/engine";

// States, not scores (ADR 0027; BLUEPRINT 15): the GM sees the venue in states with names, the director and owner the
// four venues with one overall state and reasons; nobody gets money or percentages. Plus the position × function ×
// venue matrix of the service modules, over the real handlers (ADR 0028).

const T = 30_000;
type Reason = { key: string; count?: number; names?: string[]; level: string };
type VenueState = { state: string; reasons: Reason[] };

describe("venue and company states", () => {
  it("Midtown needs action: Kevin in Review, schedule confirmations late, a bottle out; reasons carry the names", async () => {
    const w = await World.create();
    await w.as("elena.g");
    const s = await w.q<VenueState & { names: { unconfirmed: string[]; reviews: string[] } }>("reports:venueState", { venueId: w.venue("v1")._id });
    expect(s.state).toBe("action_required");
    const keys = s.reasons.map((r) => r.key);
    expect(keys).toEqual(expect.arrayContaining(["peopleInReview", "confirmationsLate", "shortagesOut", "shortagesLow", "proposalsWaiting", "sideWorkOverLimit"]));
    expect(s.reasons.find((r) => r.key === "peopleInReview")!.names).toEqual(["Kevin Duarte"]);
    expect(s.names.unconfirmed).toEqual(expect.arrayContaining(["Jade Williams", "Kevin Duarte"]));
    expect(JSON.stringify(s)).not.toContain("%");
  }, T);

  it("the company view lists the four venues, most urgent first; Brooklyn needs action for the missed close", async () => {
    const w = await World.create();
    await w.as("victor.h");
    const c = await w.q<{ venues: Array<VenueState & { venue: { slug: string } }> }>("reports:company", {});
    expect(c.venues.length).toBe(4);
    const order = ["action_required", "needs_attention", "on_track"];
    const idx = c.venues.map((v) => order.indexOf(v.state));
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    const brooklyn = c.venues.find((v) => v.venue.slug === "v4")!;
    expect(brooklyn.state).toBe("action_required");
    expect(brooklyn.reasons.map((r) => r.key)).toContain("autoClosed");
    expect(JSON.stringify(c)).not.toMatch(/%|cents|sales|price/);
    await w.as("elena.g");
    expect(await w.qcode("reports:company", {})).toBe("FORBIDDEN");
  }, T);

  it("reviewing the auto-closed shift clears that reason", async () => {
    const w = await World.create();
    const auto = w.rows("shifts").find((s) => s.autoClosedAt)!;
    await w.as("owner");
    await w.m("shifts:review", { shiftId: auto._id });
    const s = await w.q<VenueState>("reports:venueState", { venueId: w.venue("v4")._id });
    expect(s.reasons.map((r) => r.key)).not.toContain("autoClosed");
  }, T);

  it("the team board shows people by area with states and recognition, never a score", async () => {
    const w = await World.create();
    await w.as("maria.m");
    const { people } = await w.q<{ people: Array<{ name: string; area: string; warnings: string; confirmation: string; recognition: number }> }>("reports:team", { venueId: w.venue("v1")._id });
    expect(people.find((p) => p.name === "Kevin Duarte")).toMatchObject({ warnings: "review", confirmation: "late" });
    expect(people.find((p) => p.name === "Jade Williams")).toMatchObject({ warnings: "attention" });
    expect(people.find((p) => p.name === "Ana Pérez")).toMatchObject({ warnings: "up_to_date", confirmation: "confirmed" });
    expect(people[0]!.area).toBe("floor");
    expect(people.some((p) => p.area === "kitchen")).toBe(true);
    expect(JSON.stringify(people)).not.toMatch(/%|"pct"|"score"|"onTime"/);
    await w.as("luis.c");
    expect(await w.qcode("reports:team", { venueId: w.venue("v1")._id })).toBe("FORBIDDEN");
    await w.as("james.k");
    expect(await w.qcode("reports:team", { venueId: w.venue("v1")._id })).toBe("VENUE_FORBIDDEN");
  }, T);
});

describe("position × function × venue matrix (service modules)", () => {
  const live = (w: World) => w.liveShift()._id;
  type Case = { fn: string; kind: "q" | "m"; args: (w: World) => Record<string, unknown>; allow: string[]; deny: string[] };
  const cases: Case[] = [
    { fn: "floor:map", kind: "q", args: () => ({}), allow: ["luis.c", "claire.d", "maya.j", "maria.m", "owner"], deny: ["ana.p", "pedro.l", "zoe.a", "ken.w"] },
    { fn: "tableNotes:pass", kind: "q", args: () => ({}), allow: ["irene.k", "ken.w", "rosa.h", "maria.m"], deny: ["ana.p", "luis.c", "zoe.a"] },
    { fn: "bar:open", kind: "q", args: () => ({}), allow: ["zoe.a", "lucia.f", "sam.r", "luis.c", "maria.m"], deny: ["ana.p", "pedro.l", "jose.r"] },
    { fn: "tasks:progress", kind: "q", args: (w) => ({ shiftId: live(w) }), allow: ["luis.c", "sam.r", "rosa.h", "maria.m", "elena.g"], deny: ["ana.p", "irene.k", "maya.j"] },
    { fn: "close:draft", kind: "q", args: (w) => ({ shiftId: live(w) }), allow: ["maria.m", "luis.c", "elena.g", "victor.h"], deny: ["ana.p", "zoe.a", "jose.r"] },
    { fn: "reports:venueState", kind: "q", args: (w) => ({ venueId: w.venue("v1")._id }), allow: ["maria.m", "elena.g", "ryan.p", "victor.h", "owner"], deny: ["luis.c", "ana.p", "sam.r"] },
    { fn: "menu:quiz", kind: "q", args: () => ({}), allow: ["ana.p", "omar.b", "jose.r"], deny: [] },
    { fn: "preshift:upsert", kind: "m", args: (w) => ({ shiftId: live(w), text: { en: "Note", es: "Nota" } }), allow: ["luis.c", "claire.d", "sam.r", "rosa.h", "maria.m"], deny: ["ana.p", "zoe.a", "irene.k", "maya.j"] },
    { fn: "menu:set86", kind: "m", args: (w) => ({ shiftId: live(w), itemId: w.rows("menuItems")[0]!._id }), allow: ["irene.k", "rosa.h", "luis.c", "maria.m"], deny: ["ana.p", "ken.w", "zoe.a"] },
  ];
  for (const c of cases) {
    it(`${c.fn}`, async () => {
      const w = await World.create();
      const base = w.state;
      for (const u of c.allow) {
        w.state = base;
        await w.as(u);
        const code = c.kind === "q" ? await w.qcode(c.fn, c.args(w)) : await w.code(c.fn, c.args(w));
        expect(code, `${u} on ${c.fn}`).toBeNull();
      }
      for (const u of c.deny) {
        w.state = base;
        await w.as(u);
        const code = c.kind === "q" ? await w.qcode(c.fn, c.args(w)) : await w.code(c.fn, c.args(w));
        expect(code, `${u} on ${c.fn}`).toBe("FORBIDDEN");
      }
    }, T);
  }

  it("another venue's people get VENUE_FORBIDDEN on Midtown's shift", async () => {
    const w = await World.create();
    for (const [u, fn, kind] of [
      ["james.k", "close:draft", "q"],
      ["olivia.n", "tasks:progress", "q"],
      ["diego.v", "bar:report", "m"],
      ["emma.t", "tableNotes:add", "m"],
    ] as const) {
      await w.as(u);
      const args = fn === "bar:report" ? { shiftId: w.liveShift()._id, itemId: w.rows("barItems")[0]!._id, level: "low" } : fn === "tableNotes:add" ? { shiftId: w.liveShift()._id, table: "24", kind: "vip", text: "Regular" } : { shiftId: w.liveShift()._id };
      const code = kind === "q" ? await w.qcode(fn, args) : await w.code(fn, args);
      expect(code, `${u} ${fn}`).toBe("VENUE_FORBIDDEN");
    }
  }, T);
});
