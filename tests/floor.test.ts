import { describe, expect, it } from "vitest";
import { World } from "./support/engine";

// Floor module (ADR 0013, 0016; BLUEPRINT 15 "Requests" and concurrency gates) over the real handlers.

const T = 30_000;

async function requestAs(w: World, who: string, args: Record<string, unknown>) {
  await w.as(who);
  return w.m<{ requestId: string; recipients: number }>("requests:create", { shiftId: w.liveShift()._id, ...args });
}

const req = (w: World, id: string) => w.rows("requests").find((r) => r._id === id)!;
const ids = (w: World, ...names: string[]) => names.map((n) => w.user(n)._id).sort();

describe("floor requests", () => {
  it("routes water to the runners and bussers of the table's section", async () => {
    const w = await World.create();
    const { requestId } = await requestAs(w, "ana.p", { kind: "water", table: "24" });
    const r = req(w, requestId);
    expect([...(r.recipients as string[])].sort()).toEqual(ids(w, "carlos.g", "pedro.l"));
    expect(r.status).toBe("open");
    expect(w.rows("outbound").filter((o) => o.topic === "request" && (r.recipients as string[]).includes(o.userId as string)).length).toBe(2);
  }, T);

  it("routes help to the captain and the manager on duty, urgent", async () => {
    const w = await World.create();
    const { requestId } = await requestAs(w, "carlos.g", { kind: "help", table: "22" });
    expect([...(req(w, requestId).recipients as string[])].sort()).toEqual(ids(w, "luis.c", "maria.m"));
    const push = w.rows("outbound").filter((o) => o.topic === "help");
    expect(push.length).toBe(2);
    expect((push[0]!.payload as { urgent?: boolean }).urgent).toBe(true);
  }, T);

  it("escalates an unclaimed request after 90 s to the venue and the manager", async () => {
    const w = await World.create();
    const { requestId } = await requestAs(w, "ana.p", { kind: "clear", table: "24" });
    // Not yet due: nothing changes.
    expect(await w.m<{ escalated: boolean }>("requests:escalate", { requestId })).toEqual({ escalated: false });
    req(w, requestId).at = Date.now() - 91_000;
    const out = await w.m<{ escalated: boolean; added: number }>("requests:escalate", { requestId });
    expect(out.escalated).toBe(true);
    const r = req(w, requestId);
    expect(r.escalatedAt).toBeTypeOf("number");
    expect(r.recipients).toEqual(expect.arrayContaining(ids(w, "nina.s", "kevin.d", "maria.m", "carlos.g", "pedro.l")));
    // A claimed request never escalates.
    const second = await requestAs(w, "ana.p", { kind: "water", table: "24" });
    await w.as("carlos.g");
    await w.m("requests:claim", { requestId: second.requestId });
    req(w, second.requestId).at = Date.now() - 91_000;
    expect((await w.m<{ escalated: boolean }>("requests:escalate", { requestId: second.requestId })).escalated).toBe(false);
  }, T);

  it("lets only the first receiver claim; the second gets REQUEST_CLOSED", async () => {
    const w = await World.create();
    const { requestId } = await requestAs(w, "ana.p", { kind: "water", table: "24" });
    await w.as("carlos.g");
    expect(await w.code("requests:claim", { requestId })).toBeNull();
    await w.as("pedro.l");
    expect(await w.code("requests:claim", { requestId })).toBe("REQUEST_CLOSED");
    expect(await w.code("requests:done", { requestId })).toBe("REQUEST_CLOSED");
    await w.as("carlos.g");
    expect(await w.code("requests:done", { requestId })).toBeNull();
    expect(req(w, requestId).status).toBe("done");
    // The requester sees who is on it.
    await w.as("ana.p");
    const mine = await w.q<Array<{ _id: string; claimedByName: string | null }>>("requests:mine", { shiftId: w.liveShift()._id });
    expect(mine.find((r) => r._id === requestId)!.claimedByName).toBe("Carlos Gómez");
  }, T);

  it("keeps people who do not receive a request from claiming it", async () => {
    const w = await World.create();
    const { requestId } = await requestAs(w, "ana.p", { kind: "water", table: "24" });
    await w.as("jade.w");
    expect(await w.code("requests:claim", { requestId })).toBe("FORBIDDEN");
  }, T);

  it("gates comps by level and blocks self-approval", async () => {
    const w = await World.create();
    await w.as("jade.w");
    expect(await w.code("requests:create", { shiftId: w.liveShift()._id, kind: "comp", table: "31", item: "Dessert", amountCents: 1400, reason: "courtesy" })).toBe("LEVEL_FORBIDDEN");
    // A busser cannot ask for a void at all.
    await w.as("pedro.l");
    expect(await w.code("requests:create", { shiftId: w.liveShift()._id, kind: "void", table: "24", item: "Wine", amountCents: 2200, reason: "wrong_item" })).toBe("FORBIDDEN");

    const { requestId } = await requestAs(w, "ana.p", { kind: "comp", table: "24", item: "Chocolate soufflé", amountCents: 1600, reason: "quality" });
    expect(req(w, requestId).status).toBe("pending");
    expect(req(w, requestId).recipients).toEqual([w.user("maria.m")._id]);
    expect(await w.code("requests:decide", { requestId, decision: "approve" })).toBe("SELF_APPROVAL");
    // Void and comp details are required.
    expect(await w.code("requests:create", { shiftId: w.liveShift()._id, kind: "void", table: "24" })).toBe("INVALID_INPUT");
  }, T);

  it("lets a captain decide only when the company allows it, and audits the decision", async () => {
    const w = await World.create();
    const { requestId } = await requestAs(w, "ana.p", { kind: "comp", table: "24", item: "Soufflé", amountCents: 1600, reason: "quality" });
    await w.as("luis.c");
    expect(await w.code("requests:decide", { requestId, decision: "approve" })).toBe("FORBIDDEN");
    await w.as("owner");
    await w.m("org:setCompany", { captainApprovesComps: true });
    await w.as("luis.c");
    expect(await w.code("requests:decide", { requestId, decision: "deny", note: "Offer a coffee instead" })).toBeNull();
    expect(req(w, requestId).status).toBe("denied");
    await w.as("maria.m");
    expect(await w.code("requests:decide", { requestId, decision: "approve" })).toBe("REQUEST_CLOSED");
    expect(w.rows("auditLogs").filter((a) => a.action === "request.decided" && a.entityId === requestId)).toHaveLength(1);
  }, T);

  it("lets the manager approve, notifies the requester and lists it for the close", async () => {
    const w = await World.create();
    const { requestId } = await requestAs(w, "ana.p", { kind: "void", table: "22", item: "Barolo", amountCents: 16500, reason: "wrong_item" });
    await w.as("maria.m");
    await w.m("requests:decide", { requestId, decision: "approve" });
    const r = req(w, requestId);
    expect(r).toMatchObject({ status: "approved", decision: "approve", decidedBy: w.user("maria.m")._id });
    expect(w.rows("auditLogs").some((a) => a.action === "request.decided" && a.entityId === requestId && a.actorId === w.user("maria.m")._id)).toBe(true);
    expect(w.rows("outbound").some((o) => o.userId === w.user("ana.p")._id && o.topic === "approval")).toBe(true);
    const all = await w.q<Array<{ _id: string; status: string }>>("requests:forShift", { shiftId: w.liveShift()._id });
    expect(all.find((x) => x._id === requestId)!.status).toBe("approved");
    // Staff cannot read the whole shift's requests.
    await w.as("ana.p");
    expect(await w.qcode("requests:forShift", { shiftId: w.liveShift()._id })).toBe("FORBIDDEN");
  }, T);

  it("never rate limits help, but limits water at 40 an hour", async () => {
    const w = await World.create();
    await w.as("carlos.g");
    const shiftId = w.liveShift()._id;
    for (let i = 0; i < 45; i++) expect(await w.code("requests:create", { shiftId, kind: "help" })).toBeNull();
    for (let i = 0; i < 40; i++) expect(await w.code("requests:create", { shiftId, kind: "water", table: "24" })).toBeNull();
    expect(await w.code("requests:create", { shiftId, kind: "water", table: "24" })).toBe("RATE_LIMITED");
    expect(await w.code("requests:create", { shiftId, kind: "help", table: "24" })).toBeNull();
  }, T);

  it("isolates venues and needs a live shift", async () => {
    const w = await World.create();
    await w.as("emma.t");
    expect(await w.code("requests:create", { shiftId: w.liveShift()._id, kind: "help" })).toBe("VENUE_FORBIDDEN");
    expect(await w.qcode("floor:mySection", { shiftId: w.liveShift()._id })).toBe("VENUE_FORBIDDEN");
    await w.as("ana.p");
    const closed = w.rows("shifts").find((s) => s.status === "closed" && s.venueId === w.venue("v1")._id)!;
    expect(await w.code("requests:create", { shiftId: closed._id, kind: "water", table: "24" })).toBe("SHIFT_NOT_OPEN");
    expect(await w.code("tableNotes:add", { shiftId: closed._id, table: "24", kind: "vip", text: "Regular" })).toBe("SHIFT_NOT_OPEN");
  }, T);

  it("lets the requester cancel, and only them or the manager", async () => {
    const w = await World.create();
    const { requestId } = await requestAs(w, "ana.p", { kind: "water", table: "24" });
    await w.as("carlos.g");
    expect(await w.code("requests:cancel", { requestId })).toBe("FORBIDDEN");
    await w.as("ana.p");
    expect(await w.code("requests:cancel", { requestId })).toBeNull();
    expect(req(w, requestId).status).toBe("canceled");
    expect(await w.code("requests:cancel", { requestId })).toBe("REQUEST_CLOSED");
  }, T);

  it("shows staff only requests addressed to them; leads see every open one", async () => {
    const w = await World.create();
    const shiftId = w.liveShift()._id;
    await requestAs(w, "ana.p", { kind: "water", table: "24" });
    await w.as("pedro.l");
    const forPedro = await w.q<Array<{ kind: string }>>("requests:open", { shiftId });
    expect(forPedro.every((r) => r.kind === "water" || r.kind === "clear")).toBe(true);
    await w.as("maria.m");
    const forMaria = await w.q<Array<{ kind: string }>>("requests:open", { shiftId });
    expect(forMaria.some((r) => r.kind === "comp")).toBe(true);
    expect(forMaria.length).toBeGreaterThan(forPedro.length);
  }, T);
});

describe("sections", () => {
  it("assigns sections and refuses a lead below level A", async () => {
    const w = await World.create();
    const shiftId = w.liveShift()._id;
    const a = w.rows("sections").find((s) => s.venueId === w.venue("v1")._id && s.name === "A")!;
    await w.as("maria.m");
    expect(await w.code("floor:assignSections", { shiftId, assignments: [{ sectionId: a._id, userIds: [w.user("nina.s")._id], leadId: w.user("nina.s")._id }] })).toBe("LEVEL_FORBIDDEN");
    expect(await w.code("floor:assignSections", { shiftId, assignments: [{ sectionId: a._id, userIds: [w.user("luis.c")._id, w.user("nina.s")._id], leadId: w.user("luis.c")._id }] })).toBeNull();
    expect(w.rows("sectionAssignments").filter((x) => x.shiftId === shiftId)).toHaveLength(1);
    expect(w.rows("auditLogs").some((x) => x.action === "sections.assigned")).toBe(true);
    // Staff cannot assign sections.
    await w.as("ana.p");
    expect(await w.code("floor:assignSections", { shiftId, assignments: [] })).toBe("FORBIDDEN");
    // Someone off the roster cannot be assigned.
    await w.as("luis.c");
    expect(await w.code("floor:assignSections", { shiftId, assignments: [{ sectionId: a._id, userIds: [w.user("emma.t")._id] }] })).toBe("INVALID_INPUT");
  }, T);

  it("gives a server their section, tables, notes and requests", async () => {
    const w = await World.create();
    await w.as("carlos.g");
    await w.m("requests:create", { shiftId: w.liveShift()._id, kind: "help", table: "24" });
    await w.as("pedro.l");
    const s = await w.q<{ mine: string[]; sections: Array<{ _id: string; name: string; tables: string[] }>; notes: Array<{ table: string }>; requests: Array<{ kind: string }> }>("floor:mySection", { shiftId: w.liveShift()._id });
    const mine = s.sections.filter((x) => s.mine.includes(x._id));
    expect(mine.map((x) => x.name)).toEqual(["B"]);
    expect(s.notes.some((n) => n.table === "24")).toBe(true);
    expect(s.requests.some((r) => r.kind === "water")).toBe(true);
  }, T);

  it("lets the manager add a section", async () => {
    const w = await World.create();
    await w.as("maria.m");
    const venueId = w.venue("v1")._id;
    await w.m("floor:upsertSection", { venueId, name: "Patio", tables: ["P1", "P2", "P1"] });
    const patio = w.rows("sections").find((s) => s.name === "Patio")!;
    expect(patio.tables).toEqual(["P1", "P2"]);
    await w.as("luis.c");
    expect(await w.code("floor:upsertSection", { venueId, name: "Roof", tables: ["R1"] })).toBe("FORBIDDEN");
  }, T);
});

describe("table notes", () => {
  it("refuses contact details and long notes", async () => {
    const w = await World.create();
    await w.as("ana.p");
    const shiftId = w.liveShift()._id;
    expect(await w.code("tableNotes:add", { shiftId, table: "24", kind: "vip", text: "Call him at 212 555 0199" })).toBe("CONTACT_DETAILS");
    expect(await w.code("tableNotes:add", { shiftId, table: "24", kind: "vip", text: "guest@example.com" })).toBe("CONTACT_DETAILS");
    expect(await w.code("tableNotes:add", { shiftId, table: "24", kind: "vip", text: "x".repeat(141) })).toBe("INVALID_INPUT");
    // Runners cannot write notes.
    await w.as("carlos.g");
    expect(await w.code("tableNotes:add", { shiftId, table: "24", kind: "vip", text: "Regular" })).toBe("FORBIDDEN");
  }, T);

  it("sends allergy notes to the kitchen board, where the kitchen confirms them", async () => {
    const w = await World.create();
    await w.as("ana.p");
    const shiftId = w.liveShift()._id;
    const { noteId } = await w.m<{ noteId: string }>("tableNotes:add", { shiftId, table: "25", kind: "allergy", text: "Peanut allergy" });
    expect(w.rows("outbound").some((o) => o.topic === "note" && o.userId === w.user("rosa.h")._id)).toBe(true);
    await w.as("chef.marco");
    const board = await w.q<{ notes: Array<{ _id: string; kitchenConfirmedAt: number | null }> }>("tableNotes:allergyBoard", { venueId: w.venue("v1")._id });
    expect(board.notes[0]!.kitchenConfirmedAt).toBeNull();
    expect(board.notes.some((n) => n._id === noteId)).toBe(true);
    await w.m("tableNotes:confirm", { noteId });
    const after = await w.q<{ notes: Array<{ _id: string; kitchenConfirmedAt: number | null }> }>("tableNotes:allergyBoard", { venueId: w.venue("v1")._id });
    expect(after.notes.find((n) => n._id === noteId)!.kitchenConfirmedAt).toBeTypeOf("number");
    // Servers do not confirm; non-allergy notes are not confirmed.
    await w.as("ana.p");
    expect(await w.code("tableNotes:confirm", { noteId })).toBe("FORBIDDEN");
    const vip = w.rows("tableNotes").find((n) => n.kind === "vip")!;
    await w.as("chef.marco");
    expect(await w.code("tableNotes:confirm", { noteId: vip._id })).toBe("INVALID_INPUT");
  }, T);

  it("archives a note for its author and deletes archived notes after 30 days", async () => {
    const w = await World.create();
    const vip = w.rows("tableNotes").find((n) => n.kind === "vip")!; // written by luis.c
    await w.as("ana.p");
    expect(await w.code("tableNotes:archive", { noteId: vip._id })).toBe("FORBIDDEN");
    await w.as("luis.c");
    expect(await w.code("tableNotes:archive", { noteId: vip._id })).toBeNull();
    const notes = await w.q<Array<{ _id: string }>>("tableNotes:forShift", { shiftId: w.liveShift()._id });
    expect(notes.some((n) => n._id === vip._id)).toBe(false);
    w.rows("tableNotes").find((n) => n._id === vip._id)!.archivedAt = Date.now() - 31 * 24 * 3600_000;
    expect(await w.m<{ deleted: number }>("tableNotes:purge", {})).toEqual({ deleted: 1 });
    expect(w.rows("tableNotes").some((n) => n._id === vip._id)).toBe(false);
  }, T);
});
