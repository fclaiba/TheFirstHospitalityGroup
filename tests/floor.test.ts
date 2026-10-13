import { describe, expect, it } from "vitest";
import { World } from "./support/engine";

// Floor (ADR 0013, 0016, 0021; BLUEPRINT 15 "Requests" and concurrency gates) over the real handlers (ADR 0028).

const T = 30_000;

async function requestAs(w: World, who: string, args: Record<string, unknown>) {
  await w.as(who);
  return w.m<{ requestId: string; recipients: number }>("requests:create", { shiftId: w.liveShift()._id, ...args });
}

const req = (w: World, id: string) => w.rows("requests").find((r) => r._id === id)!;
const ids = (w: World, ...names: string[]) => names.map((n) => w.user(n)._id).sort();

describe("requests", () => {
  it("routes water to the busser and runner of the table's section, never to a named person", async () => {
    const w = await World.create();
    const { requestId } = await requestAs(w, "ana.p", { kind: "water", table: "24" });
    const r = req(w, requestId);
    expect([...(r.recipients as string[])].sort()).toEqual(ids(w, "carlos.g", "pedro.l"));
    expect(r.sectionId).toBe("b");
    expect(w.rows("outbound").filter((o) => o.topic === "request").length).toBe(2);
  }, T);

  it("routes help to the leads and managers on duty, urgent, and never rate limits it", async () => {
    const w = await World.create();
    const { requestId } = await requestAs(w, "carlos.g", { kind: "help", table: "22" });
    expect([...(req(w, requestId).recipients as string[])].sort()).toEqual(ids(w, "luis.c", "claire.d", "maria.m", "ryan.p", "elena.g"));
    expect(w.rows("outbound").filter((o) => o.topic === "help").every((o) => (o.payload as { urgent?: boolean }).urgent)).toBe(true);
    for (let i = 0; i < 45; i++) await w.m("requests:create", { shiftId: w.liveShift()._id, kind: "help" });
    expect(await w.code("requests:create", { shiftId: w.liveShift()._id, kind: "help" })).toBeNull();
  }, T);

  it("rate limits water and clear at 40 per hour", async () => {
    const w = await World.create();
    await w.as("ana.p");
    for (let i = 0; i < 40; i++) await w.m("requests:create", { shiftId: w.liveShift()._id, kind: "water", table: "24" });
    expect(await w.code("requests:create", { shiftId: w.liveShift()._id, kind: "water", table: "24" })).toBe("RATE_LIMITED");
  }, T);

  it("only water, clear and help exist (no voids or comps, ADR 0018)", async () => {
    const w = await World.create();
    await w.as("ana.p");
    expect(await w.code("requests:create", { shiftId: w.liveShift()._id, kind: "comp", table: "24" })).toBe("INVALID_INPUT");
  }, T);

  it("support positions cannot raise water or clear, only help", async () => {
    const w = await World.create();
    await w.as("kevin.d");
    expect(await w.code("requests:create", { shiftId: w.liveShift()._id, kind: "water", table: "11" })).toBe("FORBIDDEN");
    expect(await w.code("requests:create", { shiftId: w.liveShift()._id, kind: "help" })).toBeNull();
  }, T);

  it("escalates an unclaimed request after 90 s to every receiver and the managers", async () => {
    const w = await World.create();
    const { requestId } = await requestAs(w, "ana.p", { kind: "clear", table: "24" });
    expect(await w.m<{ escalated: boolean }>("requests:escalate", { requestId })).toEqual({ escalated: false });
    req(w, requestId).at = Date.now() - 91_000;
    const out = await w.m<{ escalated: boolean; added: number }>("requests:escalate", { requestId });
    expect(out.escalated).toBe(true);
    expect(req(w, requestId).recipients).toEqual(expect.arrayContaining(ids(w, "nina.s", "kevin.d", "maria.m", "carlos.g", "pedro.l")));
    const second = await requestAs(w, "ana.p", { kind: "water", table: "24" });
    await w.as("carlos.g");
    await w.m("requests:claim", { requestId: second.requestId });
    req(w, second.requestId).at = Date.now() - 91_000;
    expect((await w.m<{ escalated: boolean }>("requests:escalate", { requestId: second.requestId })).escalated).toBe(false);
  }, T);

  it("a second claim answers REQUEST_CLOSED", async () => {
    const w = await World.create();
    const { requestId } = await requestAs(w, "ana.p", { kind: "water", table: "24" });
    await w.as("carlos.g");
    await w.m("requests:claim", { requestId });
    await w.as("pedro.l");
    expect(await w.code("requests:claim", { requestId })).toBe("REQUEST_CLOSED");
    await w.as("carlos.g");
    await w.m("requests:done", { requestId });
    expect(req(w, requestId).status).toBe("done");
    await w.as("ana.p");
    const mine = await w.q<Array<{ status: string; claimedByName: string }>>("requests:mine", { shiftId: w.liveShift()._id });
    expect(mine.find((r) => r.status === "done")?.claimedByName).toBe("Carlos Gómez");
  }, T);

  it("needs an open shift (SHIFT_NOT_OPEN) and keeps venues apart", async () => {
    const w = await World.create();
    const closed = w.rows("shifts").find((s) => s.status === "closed" && s.venueId === w.venue("v1")._id)!;
    await w.as("ana.p");
    expect(await w.code("requests:create", { shiftId: closed._id, kind: "water", table: "24" })).toBe("SHIFT_NOT_OPEN");
    await w.as("emma.t");
    expect(await w.code("requests:create", { shiftId: w.liveShift()._id, kind: "water", table: "24" })).toBe("VENUE_FORBIDDEN");
  }, T);

  it("the queue shows leads everything and staff only what they receive", async () => {
    const w = await World.create();
    await requestAs(w, "ana.p", { kind: "water", table: "12" });
    await w.as("luis.c");
    expect((await w.q<unknown[]>("requests:queue", { shiftId: w.liveShift()._id })).length).toBeGreaterThanOrEqual(3);
    await w.as("kevin.d");
    const kevin = await w.q<Array<{ table: string | null }>>("requests:queue", { shiftId: w.liveShift()._id });
    expect(kevin.every((r) => r.table === "12")).toBe(true);
  }, T);
});

describe("table notes and the pass", () => {
  it("an allergy note needs the seat and reaches the expo, who confirms it", async () => {
    const w = await World.create();
    await w.as("ana.p");
    expect(await w.code("tableNotes:add", { shiftId: w.liveShift()._id, table: "23", kind: "allergy", text: "Peanuts" })).toBe("SEAT_REQUIRED");
    const { noteId } = await w.m<{ noteId: string }>("tableNotes:add", { shiftId: w.liveShift()._id, table: "23", seat: 3, kind: "allergy", text: "Peanuts" });
    const expo = w.user("irene.k")._id;
    expect(w.rows("outbound").some((o) => o.userId === expo && o.topic === "note")).toBe(true);
    await w.as("ana.p");
    expect(await w.code("tableNotes:confirmAllergy", { noteId })).toBe("FORBIDDEN");
    await w.as("irene.k");
    const pass = await w.q<{ allergies: Array<{ _id: string; seat: number | null; expoConfirmedAt: number | null }>; eightySix: unknown[]; sections: unknown[] }>("tableNotes:pass", {});
    expect(pass.allergies[0]!._id).toBe(noteId);
    expect(pass.allergies[0]!.seat).toBe(3);
    expect(pass.eightySix.length).toBe(1);
    expect(pass.sections.length).toBe(4);
    await w.m("tableNotes:confirmAllergy", { noteId });
    expect(w.rows("tableNotes").find((n) => n._id === noteId)!.expoConfirmedAt).toBeTypeOf("number");
  }, T);

  it("refuses contact details (CONTACT_DETAILS) and long notes", async () => {
    const w = await World.create();
    await w.as("ana.p");
    expect(await w.code("tableNotes:add", { shiftId: w.liveShift()._id, table: "24", kind: "vip", text: "Call him at 917 555 0199" })).toBe("CONTACT_DETAILS");
    expect(await w.code("tableNotes:add", { shiftId: w.liveShift()._id, table: "24", kind: "vip", text: "x".repeat(141) })).toBe("INVALID_INPUT");
  }, T);

  it("bussers cannot write notes", async () => {
    const w = await World.create();
    await w.as("pedro.l");
    expect(await w.code("tableNotes:add", { shiftId: w.liveShift()._id, table: "24", kind: "vip", text: "Regular" })).toBe("FORBIDDEN");
  }, T);

  it("purges archived notes after 30 days", async () => {
    const w = await World.create();
    const note = w.rows("tableNotes")[0]!;
    note.archivedAt = Date.now() - 31 * 24 * 3600_000;
    const r = await w.m<{ deleted: number }>("tableNotes:purge", {});
    expect(r.deleted).toBe(1);
  }, T);
});

describe("floor plan and sections", () => {
  it("staff see their section with seats, notes and the requests for them", async () => {
    const w = await World.create();
    await requestAs(w, "ana.p", { kind: "water", table: "24" });
    await w.as("carlos.g");
    const mine = await w.q<{ sections: Array<{ id: string; tables: Array<{ seats: number }> }>; notes: Array<{ table: string }>; requests: unknown[] }>("floor:mySection", {});
    expect(mine.sections.map((s) => s.id)).toEqual(["b"]);
    expect(mine.sections[0]!.tables.every((t) => t.seats > 0)).toBe(true);
    expect(mine.notes.some((n) => n.table === "24")).toBe(true);
    expect(mine.requests.length).toBeGreaterThanOrEqual(2);
  }, T);

  it("leads see the live map with who is where; staff cannot", async () => {
    const w = await World.create();
    await w.as("claire.d");
    const map = await w.q<{ sections: Array<{ id: string; lead: string | null; people: string[] }> }>("floor:map", {});
    const c = map.sections.find((s) => s.id === "c")!;
    expect(c.lead).toBe("Luis Castillo");
    expect(c.people).toEqual(["Jade Williams"]);
    await w.as("maya.j");
    expect(await w.qcode("floor:map", {})).toBeNull();
    await w.as("ana.p");
    expect(await w.qcode("floor:map", {})).toBe("FORBIDDEN");
  }, T);

  it("a captain assigns sections to people on the shift only", async () => {
    const w = await World.create();
    await w.as("luis.c");
    await w.m("floor:assignSections", { shiftId: w.liveShift()._id, assignments: [{ sectionId: "a", userIds: [w.user("ana.p")._id] }] });
    expect(w.rows("sectionAssignments").filter((a) => a.shiftId === w.liveShift()._id).length).toBe(1);
    expect(await w.code("floor:assignSections", { shiftId: w.liveShift()._id, assignments: [{ sectionId: "a", userIds: [w.user("emma.t")._id] }] })).toBe("INVALID_INPUT");
    expect(await w.code("floor:assignSections", { shiftId: w.liveShift()._id, assignments: [{ sectionId: "zz", userIds: [] }] })).toBe("INVALID_INPUT");
    expect(w.rows("auditLogs").some((a) => a.action === "sections.assigned")).toBe(true);
    await w.as("ana.p");
    expect(await w.code("floor:assignSections", { shiftId: w.liveShift()._id, assignments: [] })).toBe("FORBIDDEN");
  }, T);

  it("a manager publishes a new plan version; duplicate tables are refused", async () => {
    const w = await World.create();
    await w.as("maria.m");
    const sections = [{ id: "a", name: "A", tables: [{ number: "1", seats: 2, x: 10, y: 10 }] }];
    const r = await w.m<{ version: number }>("floor:upsertPlan", { venueId: w.venue("v1")._id, sections });
    expect(r.version).toBe(2);
    expect(await w.code("floor:upsertPlan", { venueId: w.venue("v1")._id, sections: [...sections, { id: "b", name: "B", tables: [{ number: "1", seats: 2, x: 1, y: 1 }] }] })).toBe("INVALID_INPUT");
    expect((await w.q<{ version: number }>("floor:plan", { venueId: w.venue("v1")._id })).version).toBe(2);
    await w.as("luis.c");
    expect(await w.code("floor:upsertPlan", { venueId: w.venue("v1")._id, sections })).toBe("FORBIDDEN");
    await w.as("james.k");
    expect(await w.code("floor:upsertPlan", { venueId: w.venue("v1")._id, sections })).toBe("VENUE_FORBIDDEN");
  }, T);
});

describe("pre-shift notes", () => {
  it("leads publish notes that the team reads in Today; staff cannot write", async () => {
    const w = await World.create();
    await w.as("sam.r");
    await w.m("preshift:upsert", { shiftId: w.liveShift()._id, text: { en: "Campari runs low: suggest the Negroni bianco.", es: "" } });
    const note = w.rows("preShiftNotes").at(-1)!;
    expect((note.text as { es: string }).es).toBe("Campari runs low: suggest the Negroni bianco.");
    await w.as("zoe.a");
    const notes = await w.q<{ notes: unknown[]; canWrite: boolean }>("preshift:notes", {});
    expect(notes.notes.length).toBe(3);
    expect(notes.canWrite).toBe(false);
    expect(await w.code("preshift:upsert", { shiftId: w.liveShift()._id, text: { en: "Hi", es: "" } })).toBe("FORBIDDEN");
  }, T);
});
