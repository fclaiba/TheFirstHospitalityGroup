import { describe, expect, it } from "vitest";
import { World } from "./support/engine";
import { addDays, nyDateKey, weekdayOf } from "../lib/time";

// A service, end to end (BLUEPRINT 3.2, 3.4, 15): Today for every position, side work, the shift lifecycle, the sweep
// and the manager close without money, over the real handlers (ADR 0028).

const T = 30_000;

/** The next date (from today) that falls on a weekday. */
function nextWeekday(wd: number): string {
  let d = nyDateKey(Date.now());
  while (weekdayOf(d) !== wd) d = addDays(d, 1);
  return d;
}

type Today = {
  me: { position: string };
  myShift: { blocks: Array<{ position: string }>; section: { names: string[]; lead: string | null } | null } | null;
  confirm: { schedule: unknown[]; menu: number; rules: number; announcements: unknown[]; warnings: number; tipPolicy: string | null };
  pendingTotal: number;
  preshift: unknown[];
  eightySix: Array<{ name: { en: string } }>;
  sideWork: Array<{ _id: string; done: number; total: number; next: { en: string } | null }>;
  events: Array<{ mine: boolean }>;
  leader: { requestsOpen: number; proposalsWaiting: number; shortagesOpen: number } | null;
};

const MONEY = /price|cents|cost|sales|amount|wage|salary|tip_?amount/i;

describe("Today", () => {
  it("shows a server their shift, section, what to confirm first, pre-shift, 86s and side work, with no numbers that score", async () => {
    const w = await World.create();
    await w.as("ana.p");
    const t = await w.q<Today>("today:summary", {});
    expect(t.me.position).toBe("server");
    expect(t.myShift?.blocks[0]!.position).toBe("server");
    expect(t.myShift?.section?.names).toEqual(["B"]);
    expect(t.confirm.menu).toBeGreaterThan(0);
    expect(t.pendingTotal).toBeGreaterThan(0);
    expect(t.preshift.length).toBe(2);
    expect(t.eightySix.map((e) => e.name.en)).toContain("Chocolate soufflé");
    expect(t.sideWork[0]!.done).toBe(2);
    expect(t.events.some((e) => e.mine)).toBe(true);
    expect(t.leader).toBeNull();
    const json = JSON.stringify(t);
    expect(json).not.toContain("%");
    expect(json).not.toMatch(/"pct"|"score"|"rate"/);
    expect(json.replace(/"(en|es)":"[^"]*"/g, "")).not.toMatch(MONEY);
  }, T);

  it("asks Jade and Kevin to confirm the schedule, Jade the rules", async () => {
    const w = await World.create();
    await w.as("jade.w");
    const jade = await w.q<Today>("today:summary", {});
    expect(jade.confirm.schedule.length).toBe(1);
    expect(jade.confirm.rules).toBeGreaterThan(0);
    await w.as("kevin.d");
    const kevin = await w.q<Today>("today:summary", {});
    expect(kevin.confirm.schedule.length).toBe(1);
    expect(kevin.confirm.warnings).toBeGreaterThan(0);
  }, T);

  it("a bartender hears only drink and wine 86s; leaders get what they act on", async () => {
    const w = await World.create();
    await w.as("zoe.a");
    expect((await w.q<Today>("today:summary", {})).eightySix).toEqual([]);
    await w.as("maria.m");
    const m = await w.q<Today>("today:summary", {});
    expect(m.leader?.proposalsWaiting).toBe(2);
    expect(m.leader?.shortagesOpen).toBe(2);
    expect(m.leader?.requestsOpen).toBe(2);
  }, T);
});

describe("side work", () => {
  it("a server finishes the opening list; photo items need a photo; ticking twice changes nothing", async () => {
    const w = await World.create();
    await w.as("ana.p");
    const mine = await w.q<{ runs: Array<{ _id: string; items: Array<{ done: boolean; photoRequired: boolean }> }> }>("tasks:myRuns", {});
    const run = mine.runs[0]!;
    const last = run.items.length - 1;
    const r = await w.m<{ done: number; total: number; complete: boolean }>("tasks:check", { runId: run._id, itemIndex: last, done: true });
    expect(r.complete).toBe(true);
    expect(await w.m<{ complete: boolean }>("tasks:check", { runId: run._id, itemIndex: last, done: true })).toMatchObject({ complete: true });
    const photoIndex = run.items.findIndex((i) => i.photoRequired);
    await w.m("tasks:check", { runId: run._id, itemIndex: photoIndex, done: false });
    expect(await w.code("tasks:check", { runId: run._id, itemIndex: photoIndex, done: true })).toBe("PHOTO_REQUIRED");
    // Somebody else's run is not theirs to tick.
    await w.as("tom.b");
    expect(await w.code("tasks:check", { runId: run._id, itemIndex: last, done: false })).toBe("FORBIDDEN");
  }, T);

  it("rules waiting to be confirmed block side work (RULES_NOT_ACKNOWLEDGED)", async () => {
    const w = await World.create();
    await w.as("jade.w");
    const mine = await w.q<{ runs: Array<{ _id: string }>; rulesPending: boolean }>("tasks:myRuns", {});
    expect(mine.rulesPending).toBe(true);
    expect(await w.code("tasks:check", { runId: mine.runs[0]!._id, itemIndex: 1, done: true })).toBe("RULES_NOT_ACKNOWLEDGED");
  }, T);

  it("needs an open shift (SHIFT_NOT_OPEN)", async () => {
    const w = await World.create();
    const old = w.rows("taskRuns").find((r) => r.userId === w.user("ana.p")._id && r.shiftId !== w.liveShift()._id)!;
    await w.as("ana.p");
    expect(await w.code("tasks:check", { runId: old._id, itemIndex: 0, done: false })).toBe("SHIFT_NOT_OPEN");
  }, T);

  it("leads see progress by person with late as a state; the person never sees late", async () => {
    const w = await World.create();
    const kevinRun = w.rows("taskRuns").find((r) => r.userId === w.user("kevin.d")._id && r.shiftId === w.liveShift()._id)!;
    kevinRun.dueAt = Date.now() - 60_000;
    await w.as("luis.c");
    const p = await w.q<{ people: Array<{ name: string; state: string; area: string }>; late: number }>("tasks:progress", { shiftId: w.liveShift()._id });
    expect(p.people.find((x) => x.name === "Kevin Duarte")!.state).toBe("late");
    expect(p.people[0]!.state).toBe("late");
    expect(JSON.stringify(p)).not.toContain("pct");
    await w.as("kevin.d");
    expect(JSON.stringify(await w.q("tasks:myRuns", {}))).not.toContain("late");
    expect(await w.qcode("tasks:progress", { shiftId: w.liveShift()._id })).toBe("FORBIDDEN");
    const r = await w.m<{ marked: number }>("tasks:lateCheck", {});
    expect(r.marked).toBeGreaterThan(0);
  }, T);

  it("managers edit templates by position and see the side-work indicator as states", async () => {
    const w = await World.create();
    await w.as("maria.m");
    const { templateId } = await w.m<{ templateId: string }>("tasks:upsertTemplate", {
      venueId: w.venue("v1")._id,
      positions: ["host"],
      phase: "close",
      title: { en: "Host closing", es: "Cierre de host" },
      schedule: { kind: "every_shift" },
      items: [{ label: { en: "Book closed", es: "Libro cerrado" }, photoRequired: false, critical: false, estimatedMin: 10 }],
      dueOffsetMin: 30,
      active: true,
    });
    expect((await w.q<Array<{ _id: string }>>("tasks:templates", { venueId: w.venue("v1")._id })).some((t) => t._id === templateId)).toBe(true);
    const load = await w.q<{ rows: Array<{ position: string; state: string }>; over: number }>("tasks:sideWorkLoad", { venueId: w.venue("v1")._id, weekStart: w.week("v1").weekStart });
    expect(load.rows.length).toBeGreaterThan(0);
    expect(load.rows.find((r) => r.position === "polisher")!.state).toBe("over_limit");
    expect(load.rows.find((r) => r.position === "server")!.state).toBe("within_limit");
    await w.as("luis.c");
    expect(await w.qcode("tasks:sideWorkLoad", { venueId: w.venue("v1")._id, weekStart: w.week("v1").weekStart })).toBe("FORBIDDEN");
  }, T);
});

describe("shift lifecycle and the close", () => {
  it("opens a service only on the weekdays it runs, one at a time, and creates side work from the schedule", async () => {
    const w = await World.create();
    await w.as("james.k");
    expect(await w.code("shifts:open", { venueId: w.venue("v2")._id, service: "dinner", date: nextWeekday(1) })).toBe("NOT_SCHEDULED");
    const r = await w.m<{ shiftId: string; runs: number }>("shifts:open", { venueId: w.venue("v2")._id, service: "dinner", date: nextWeekday(2) });
    expect(r.shiftId).toBeTruthy();
    expect(await w.code("shifts:open", { venueId: w.venue("v2")._id, service: "late", date: nextWeekday(4) })).toBe("OTHER_SHIFT_OPEN");
    await w.as("maria.m");
    expect(await w.code("shifts:open", { venueId: w.venue("v1")._id, service: "lunch", date: nextWeekday(3) })).toBe("OTHER_SHIFT_OPEN");
    await w.as("luis.c");
    expect(await w.code("shifts:startClosing", { shiftId: w.liveShift()._id })).toBe("FORBIDDEN");
    await w.as("chef.marco");
    expect(await w.code("shifts:startClosing", { shiftId: w.liveShift()._id })).toBe("FORBIDDEN");
  }, T);

  it("the manager closes without money: RUNS_OPEN, excuse, submit, read-only, and a second submit fails", async () => {
    const w = await World.create();
    const shiftId = w.liveShift()._id;
    await w.as("maria.m");
    expect(await w.code("close:submit", { shiftId })).toBe("INVALID_TRANSITION");
    await w.m("shifts:startClosing", { shiftId });
    expect(await w.code("close:submit", { shiftId })).toBe("RUNS_OPEN");
    const draft = await w.q<{ pendingRuns: Array<{ _id: string }>; shortages: unknown[]; eightySix: unknown[]; attendance: unknown[]; canFile: boolean }>("close:draft", { shiftId });
    expect(draft.canFile).toBe(true);
    expect(draft.shortages.length).toBe(2);
    expect(draft.eightySix.length).toBe(1);
    for (const r of draft.pendingRuns) await w.m("tasks:excuse", { runId: r._id, reason: "Covered by the closer" });
    await w.m("close:save", { shiftId, incidents: [{ text: "Broken glass at 22, cleaned." }], openItems: ["Lime juice ordered"], cleaning: "done", staffNotes: "", nextShiftNotes: "Restock the lime juice." });
    const { summary } = await w.m<{ summary: Record<string, unknown> }>("close:submit", { shiftId });
    expect(summary).toMatchObject({ incidents: 1, eightySixes: 1, cleaning: "done", shortages: { low: 1, out: 1 } });
    expect(JSON.stringify(summary)).not.toMatch(MONEY);
    expect(w.rows("shifts").find((s) => s._id === shiftId)!.status).toBe("closed");
    expect(w.rows("tableNotes").filter((n) => n.shiftId === shiftId).every((n) => n.archivedAt)).toBe(true);
    expect(w.rows("eightySix").filter((n) => n.shiftId === shiftId).every((n) => n.clearedAt)).toBe(true);
    expect(w.rows("outbound").some((o) => o.userId === w.user("elena.g")._id && o.topic === "shift")).toBe(true);
    expect(w.rows("auditLogs").some((a) => a.action === "close.submitted")).toBe(true);
    expect(await w.code("close:submit", { shiftId })).toBe("INVALID_TRANSITION");
    expect(await w.code("close:save", { shiftId, incidents: [], openItems: [], cleaning: "done", staffNotes: "", nextShiftNotes: "" })).toBe("INVALID_TRANSITION");
    // Pre-shift notes no longer show; the next shift reads the close notes.
    await w.as("ana.p");
    expect((await w.q<{ notes: unknown[] }>("preshift:notes", { shiftId })).notes).toEqual([]);
    expect((await w.q<{ fromLastClose: string | null }>("today:summary", {})).fromLastClose).toBe("Restock the lime juice.");
  }, T);

  it("staff and leads cannot file the close; leads read it", async () => {
    const w = await World.create();
    const shiftId = w.liveShift()._id;
    await w.as("luis.c");
    expect(await w.code("close:save", { shiftId, incidents: [], openItems: [], cleaning: "done", staffNotes: "", nextShiftNotes: "" })).toBe("FORBIDDEN");
    expect(await w.qcode("close:draft", { shiftId })).toBeNull();
    await w.as("ana.p");
    expect(await w.qcode("close:draft", { shiftId })).toBe("FORBIDDEN");
    await w.as("elena.g");
    const list = await w.q<unknown[]>("close:list", { venueId: w.venue("v1")._id });
    expect(list.length).toBe(14);
  }, T);

  it("the sweep notifies at end + 4 h and auto-closes at end + 8 h without money", async () => {
    const w = await World.create();
    const shift = w.liveShift();
    shift.endsAt = Date.now() - 5 * 3600_000;
    expect(await w.m<{ notified: number }>("shifts:sweep", {})).toMatchObject({ notified: 1 });
    w.liveShift().endsAt = Date.now() - 9 * 3600_000;
    expect(await w.m<{ closed: number }>("shifts:sweep", {})).toMatchObject({ closed: 1 });
    const report = w.rows("closeReports").find((r) => r.shiftId === shift._id)!;
    expect(report.status).toBe("auto");
    expect(Object.keys(report).join(" ")).not.toMatch(MONEY);
    await w.as("victor.h");
    await w.m("shifts:review", { shiftId: shift._id });
  }, T);

  it("current answers the live shift or the next service", async () => {
    const w = await World.create();
    await w.as("ana.p");
    const c = await w.q<{ shift: { _id: string } | null; position: string }>("shifts:current", {});
    expect(c.shift?._id).toBe(w.liveShift()._id);
    await w.as("emma.t");
    const v2 = await w.q<{ shift: unknown; next: { service: string } | null }>("shifts:current", {});
    expect(v2.shift).toBeNull();
    expect(v2.next).not.toBeNull();
  }, T);
});
