import { describe, expect, it } from "vitest";
import { World } from "./support/engine";

// Manager shift control, close report, team board, owner dashboard and audit log (BLUEPRINT 2.2, 3.4, 15).

async function closing() {
  const w = await (await World.create()).as("maria.m");
  const shift = w.liveShift();
  await w.m("shifts:startClosing", { shiftId: shift._id });
  return { w, shift };
}

function openRunIds(w: World, shiftId: string) {
  return w
    .rows("taskRuns")
    .filter((r) => r.shiftId === shiftId && !r.excused && !(r.items as Array<{ done: boolean }>).every((i) => i.done))
    .map((r) => r._id);
}

function countEverything(w: World, shift: { _id: string; [k: string]: unknown }) {
  const items = w.rows("inventoryItems").filter((i) => i.venueId === shift.venueId && i.active);
  const by = w.user("sam.r")._id;
  for (const [n, item] of items.entries()) {
    w.state.tables.inventoryCounts!.push({ _id: `inventoryCounts|t${n}`, _creationTime: Date.now(), shiftId: shift._id, venueId: shift.venueId, itemId: item._id, phase: "close", qtyTenths: 10, by, at: Date.now() });
  }
}

describe("shift control", () => {
  it("refuses a second live shift at the venue", async () => {
    const w = await (await World.create()).as("maria.m");
    const venueId = w.venue("v1")._id;
    expect(await w.code("shifts:open", { venueId, service: "lunch", date: "2030-01-07" })).toBe("OTHER_SHIFT_OPEN");
  }, 30_000);

  it("opens a service at another venue's own manager and builds opening runs", async () => {
    const w = await (await World.create()).as("james.k");
    const venueId = w.venue("v2")._id;
    const r = await w.m<{ shiftId: string; runs: number }>("shifts:open", { venueId, service: "dinner", date: "2030-01-07" });
    expect(r.runs).toBeGreaterThan(0);
  }, 30_000);

  it("start closing creates closing runs", async () => {
    const { w, shift } = await closing();
    expect(w.rows("taskRuns").filter((r) => r.shiftId === shift._id && r.phase === "close").length).toBeGreaterThan(0);
    expect(w.rows("shifts").find((s) => s._id === shift._id)!.status).toBe("closing");
  }, 30_000);
});

describe("close report", () => {
  it("blocks submit while runs are open, then while counts are missing", async () => {
    const { w, shift } = await closing();
    expect(await w.code("close:submit", { shiftId: shift._id })).toBe("RUNS_OPEN");
    for (const runId of openRunIds(w, shift._id)) await w.m("tasks:excuse", { runId, reason: "Short staffed" });
    expect(await w.code("close:submit", { shiftId: shift._id })).toBe("MISSING_COUNTS");
  }, 30_000);

  it("submits once, closes the shift, archives notes, and refuses a second submit", async () => {
    const { w, shift } = await closing();
    for (const runId of openRunIds(w, shift._id)) await w.m("tasks:excuse", { runId, reason: "Short staffed" });
    countEverything(w, shift);
    const r = await w.m<{ summary: { flagged: boolean } }>("close:submit", { shiftId: shift._id });
    expect(r.summary).toBeTruthy();
    expect(w.rows("shifts").find((s) => s._id === shift._id)!.status).toBe("closed");
    expect(w.rows("tableNotes").filter((n) => n.shiftId === shift._id).every((n) => n.archivedAt)).toBe(true);
    expect(await w.code("close:submit", { shiftId: shift._id })).toBe("INVALID_TRANSITION");
    expect(await w.code("close:save", { shiftId: shift._id, coversCount: 1, netSalesCents: 1, compsCents: 0, voidsCents: 0, incidents: [], staffNotes: "", nextShiftNotes: "" })).toBe("INVALID_TRANSITION");
    expect(w.rows("auditLogs").some((a) => a.action === "close.submitted" && a.entityId === shift._id)).toBe(true);
  }, 30_000);

  it("flags POS comps that differ from the approved total by more than a dollar", async () => {
    const { w, shift } = await closing();
    await w.m("close:save", { shiftId: shift._id, coversCount: 180, netSalesCents: 1_850_000, compsCents: 2500, voidsCents: 6800, incidents: [{ text: "Spill at 24" }], staffNotes: "", nextShiftNotes: "Prep soufflé" });
    const d = await w.q<{ summary: { flagged: boolean; compsDiffCents: number; voidsDiffCents: number; approved: { voidsCents: number } } }>("close:draft", { shiftId: shift._id });
    expect(d.summary.approved.voidsCents).toBe(6800);
    expect(d.summary.voidsDiffCents).toBe(0);
    expect(d.summary.compsDiffCents).toBe(2500);
    expect(d.summary.flagged).toBe(true);
  }, 30_000);

  it("keeps close figures to managers of the venue and the owner", async () => {
    const w = await World.create();
    const shiftId = w.liveShift()._id;
    await w.as("ana.p");
    expect(await w.qcode("close:draft", { shiftId })).toBe("FORBIDDEN");
    await w.as("james.k");
    expect(await w.qcode("close:draft", { shiftId })).toBe("VENUE_FORBIDDEN");
    await w.as("owner");
    expect(await w.qcode("close:draft", { shiftId })).toBeNull();
    const list = await w.q<unknown[]>("close:list", { venueId: w.venue("v1")._id });
    expect(list.length).toBeGreaterThan(5);
  }, 30_000);
});

describe("reports", () => {
  it("shows the owner four venues and Brooklyn's auto-closed shift", async () => {
    const w = await (await World.create()).as("owner");
    const r = await w.q<{ venues: Array<{ name: string; status: string; lastClose: unknown }>; totals: { exceptions: number } }>("reports:owner");
    expect(r.venues).toHaveLength(4);
    expect(r.venues.find((v) => v.name === "The First Brooklyn")!.status).toBe("auto_closed");
    expect(r.venues.find((v) => v.name === "The First Midtown")!.status).toBe("open");
    expect(r.totals.exceptions).toBeGreaterThan(0);
    await w.as("maria.m");
    expect(await w.qcode("reports:owner")).toBe("FORBIDDEN");
  }, 30_000);

  it("puts Kevin in follow-up or review and Jade in attention on the team board", async () => {
    const w = await (await World.create()).as("maria.m");
    const r = await w.q<{ people: Array<{ name: string; state: string; onTime: number | null }>; recognition: unknown[] }>("reports:team", { venueId: w.venue("v1")._id });
    const kevin = r.people.find((p) => p.name === "Kevin Duarte")!;
    expect(["follow_up", "review"]).toContain(kevin.state);
    expect(r.people.find((p) => p.name === "Jade Williams")!.state).toBe("attention");
    expect(r.people[0]!.state).not.toBe("up_to_date");
    expect(r.recognition.length).toBeGreaterThan(0);
    const detail = await w.q<{ warnings: unknown[] }>("reports:person", { userId: w.user("kevin.d")._id, venueId: w.venue("v1")._id });
    expect(detail.warnings.length).toBe(3);
    await w.as("james.k");
    expect(await w.qcode("reports:team", { venueId: w.venue("v1")._id })).toBe("VENUE_FORBIDDEN");
  }, 30_000);

  it("gives the owner a venue detail with the last closes", async () => {
    const w = await (await World.create()).as("owner");
    const r = await w.q<{ closes: Array<{ autoClosed: boolean }> }>("reports:venue", { venueId: w.venue("v4")._id });
    expect(r.closes.length).toBe(14);
    expect(r.closes[0]!.autoClosed).toBe(true);
    await w.m("shifts:review", { shiftId: w.rows("shifts").find((s) => s.venueId === w.venue("v4")._id && s.autoClosedAt)!._id });
    const after = await w.q<{ venues: Array<{ name: string; status: string }> }>("reports:owner");
    expect(after.venues.find((v) => v.name === "The First Brooklyn")!.status).not.toBe("auto_closed");
  }, 30_000);
});

describe("audit log", () => {
  it("is owner only and newest first", async () => {
    const w = await (await World.create()).as("maria.m");
    await w.m("shifts:startClosing", { shiftId: w.liveShift()._id });
    expect(await w.qcode("audit:list")).toBe("FORBIDDEN");
    await w.as("owner");
    const rows = await w.q<Array<{ action: string; actor: string | null; at: number }>>("audit:list", { limit: 10 });
    expect(rows[0]!.action).toBe("auth.signed_in");
    expect(rows.some((r) => r.action === "shift.closing" && r.actor === "María Morales")).toBe(true);
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1]!.at).toBeGreaterThanOrEqual(rows[i]!.at);
    const filtered = await w.q<Array<{ entity: string }>>("audit:list", { entity: "shifts" });
    expect(filtered.every((r) => r.entity === "shifts")).toBe(true);
  }, 30_000);
});
