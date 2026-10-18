import { beforeEach, describe, expect, it } from "vitest";
import { World } from "./support/engine";

let w: World;
beforeEach(async () => { w = await World.create(); });
const venue = () => w.venue("v1")._id;
const paginationOpts = { numItems: 20, cursor: null };
type Course = { version: number; position: string; title: { en: string; es: string }; steps: Array<{ key: string; label: { en: string; es: string }; evidence: { en: string; es: string } }> };
type Mine = { program: Course; steps: Array<{ key: string; state: string; recordId: string | null; revision: number; history: Array<{ state: string; note: string; actorName: string }> }> };
type Queue = { page: Array<{ recordId: string; name: string; revision: number }>; isDone: boolean; continueCursor: string };
async function ask(username = "ana.p", position = "server") {
  await w.as(username);
  return w.m<{ recordId: string }>("training:requestReview", { venueId: venue(), position, version: 1, stepKey: "i1", note: "Practiced with the service team." });
}

describe("supervised training", () => {
  it("works on an existing database without reseeding and exposes primary/next programs", async () => {
    await w.as("ana.p");
    const mine = await w.q<Mine>("training:mine", { venueId: venue() });
    expect(mine.program.position).toBe("server");
    expect(mine.steps).toHaveLength(4);
    expect(mine.steps.every((s) => s.state === "not_started")).toBe(true);
    expect((await w.q<Mine>("training:mine", { venueId: venue(), position: "captain" })).program.position).toBe("captain");
    expect(await w.qcode("training:mine", { venueId: venue(), position: "owner" })).toBe("FORBIDDEN");
  });

  it("records learner evidence, supervisor observation, private history and audit", async () => {
    const { recordId } = await ask();
    await w.as("luis.c");
    const queue = await w.q<Queue>("training:queue", { venueId: venue(), paginationOpts });
    expect(queue.page.some((r) => r.recordId === recordId)).toBe(true);
    await w.m("training:review", { recordId, revision: 1, decision: "verified", note: "Observed a correct menu explanation and allergen handoff." });
    await w.as("ana.p");
    const mine = await w.q<Mine>("training:mine", { venueId: venue() });
    expect(mine.steps[0]).toMatchObject({ state: "verified", revision: 2 });
    expect(mine.steps[0]!.history.map((e) => e.state)).toEqual(["verified", "ready"]);
    expect(mine.steps[0]!.history[0]!.actorName).toBe("Luis Castillo");
    expect(w.rows("auditLogs").filter((r) => String(r.action).startsWith("training.")).map((r) => r.action)).toEqual(["training.requested", "training.reviewed"]);
  });

  it("requires actionable feedback and keeps it when practice is resubmitted", async () => {
    const { recordId } = await ask();
    await w.as("luis.c");
    expect(await w.code("training:review", { recordId, revision: 1, decision: "needs_practice", note: "" })).toBe("INVALID_INPUT");
    await w.m("training:review", { recordId, revision: 1, decision: "needs_practice", note: "Practice naming the milk allergen before describing the dish." });
    await ask();
    await w.as("ana.p");
    const mine = await w.q<Mine>("training:mine", { venueId: venue() });
    expect(mine.steps[0]!.state).toBe("ready");
    expect(mine.steps[0]!.revision).toBe(3);
    expect(mine.steps[0]!.history).toHaveLength(3);
    expect(mine.steps[0]!.history.some((e) => e.state === "needs_practice")).toBe(true);
  });

  it("keeps duplicate requests idempotent and rejects duplicate/stale reviews", async () => {
    const { recordId } = await ask();
    expect((await ask()).recordId).toBe(recordId);
    expect(w.rows("trainingEvents")).toHaveLength(1);
    await w.as("luis.c");
    expect(await w.code("training:review", { recordId, revision: 0, decision: "verified", note: "Observed the demonstration." })).toBe("VERSION_STALE");
    await w.m("training:review", { recordId, revision: 1, decision: "verified", note: "Observed the demonstration." });
    expect(await w.code("training:review", { recordId, revision: 1, decision: "verified", note: "Observed the demonstration." })).toBe("INVALID_TRANSITION");
    await w.as("ana.p");
    expect(await w.code("training:requestReview", { venueId: venue(), position: "server", version: 1, stepKey: "i1" })).toBe("INVALID_TRANSITION");
  });

  it("does not expose another person's training to a peer or an unrelated area lead", async () => {
    const { recordId } = await ask();
    for (const person of ["ana.p", "tom.b", "sam.r", "rosa.h"]) {
      await w.as(person);
      expect(await w.code("training:review", { recordId, revision: 1, decision: "verified", note: "Observed the demonstration." })).toBe("FORBIDDEN");
    }
    await w.as("sam.r");
    expect((await w.q<Queue>("training:queue", { venueId: venue(), paginationOpts })).page).toEqual([]);
  });

  it("uses the trained position's chain for next-position learning", async () => {
    const { recordId } = await ask("ana.p", "captain");
    await w.as("luis.c");
    expect(await w.code("training:review", { recordId, revision: 1, decision: "verified", note: "Observed the demonstration." })).toBe("FORBIDDEN");
    await w.as("claire.d");
    await w.m("training:review", { recordId, revision: 1, decision: "verified", note: "Observed section leadership at pre-shift." });
    expect(w.user("ana.p").primaryPosition).toBe("server");
    expect(w.user("ana.p").enabledPositions).not.toContain("captain");
  });

  it("allows a bartender to review barback practice through their reporting line", async () => {
    const { recordId } = await ask("lucia.f", "barback");
    await w.as("zoe.a");
    await w.m("training:review", { recordId, revision: 1, decision: "verified", note: "Observed correct ice and glassware setup." });
    expect(w.rows("trainingRecords")[0]!.state).toBe("verified");
  });

  it("enforces venue isolation and configured reporting overrides", async () => {
    const { recordId } = await ask();
    await w.as("james.k");
    expect(await w.code("training:review", { recordId, revision: 1, decision: "verified", note: "Observed the demonstration." })).toBe("VENUE_FORBIDDEN");
    await w.as("owner");
    await w.m("org:setChainOverride", { venueId: venue(), position: "server", reportsTo: "maitre_d" });
    await w.as("luis.c");
    expect(await w.code("training:review", { recordId, revision: 1, decision: "verified", note: "Observed the demonstration." })).toBe("FORBIDDEN");
  });

  it("publishes immutable bilingual criteria and preserves evidence for old versions", async () => {
    const { recordId } = await ask();
    await w.as("victor.h");
    const initial = await w.q<Course>("training:program", { venueId: venue(), position: "server" });
    const published = await w.m<{ version: number }>("training:publish", { venueId: venue(), position: "server", expectedVersion: 1, title: initial.title, steps: initial.steps });
    expect(published.version).toBe(2);
    expect(await w.code("training:publish", { venueId: venue(), position: "server", expectedVersion: 1, title: initial.title, steps: initial.steps })).toBe("VERSION_STALE");
    await w.as("luis.c");
    expect(await w.code("training:review", { recordId, revision: 1, decision: "verified", note: "Observed the demonstration." })).toBe("VERSION_STALE");
    expect((await w.q<Queue>("training:queue", { venueId: venue(), paginationOpts })).page).toEqual([]);
    await w.as("ana.p");
    const current = await w.q<Mine & { archived: Array<{ version: number; state: string }> }>("training:mine", { venueId: venue() });
    expect(current.program.version).toBe(2);
    expect(current.steps[0]!.state).toBe("not_started");
    expect(current.archived[0]).toMatchObject({ version: 1, state: "ready" });
    expect(w.rows("trainingEvents")).toHaveLength(1);
    expect(await w.code("training:requestReview", { venueId: venue(), position: "server", version: 1, stepKey: "i1" })).toBe("VERSION_STALE");
  });

  it("validates criteria and restricts publication without deleting any records", async () => {
    await w.as("ana.p");
    expect(await w.code("training:publish", { venueId: venue(), position: "server", expectedVersion: 1, title: { en: "Title", es: "Título" }, steps: [] })).toBe("FORBIDDEN");
    await w.as("owner");
    expect(await w.code("training:publish", { venueId: venue(), position: "server", expectedVersion: 1, title: { en: "Title", es: "" }, steps: [] })).toBe("INVALID_INPUT");
    expect(w.rows("trainingPrograms")).toEqual([]);
  });
});
