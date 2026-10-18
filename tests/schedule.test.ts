import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { World } from "./support/engine";
import { addDays, nyDateKey, nyTimeOn, nyWallParts } from "../lib/time";
import { weekOf } from "../lib/domain/schedule";

// The schedule core (ADR 0019, BLUEPRINT 15 schedule and concurrency gates) over the real handlers (ADR 0028).

let w: World;
beforeEach(async () => {
  // Keep the seeded swap fixtures on the same service week on every CI run.
  vi.spyOn(Date, "now").mockReturnValue(new Date("2026-10-17T18:00:00Z").getTime());
  w = await World.create();
}, 30_000);

const today = () => nyDateKey(Date.now());
const thisWeek = () => weekOf(today());
const nextWeek = () => addDays(thisWeek(), 7);
afterEach(() => vi.restoreAllMocks());

type Shift = { _id: string; userId: string | null; date: string; start: string; position: string; pending: boolean; removed: boolean; eventId: string | null };
type WeekView = { version: number; status: string; hasPendingChanges: boolean; shifts: Shift[]; events: Array<{ _id: string; coverage: Array<{ position: string; required: number; filled: number; staffed: boolean }> }> };

/** Schedule notifications queued for a person. */
const scheduleOutbound = (who: string) => w.rows("outbound").filter((o) => o.userId === w.user(who)._id && o.topic === "schedule").length;

async function publishNextWeek() {
  await w.as("maria.m");
  return await w.m<{ version: number; notified: number }>("schedule:publish", { venueId: w.venue("v1")._id, weekStart: nextWeek() });
}

describe("publish and confirm", () => {
  it("first publish notifies everyone scheduled; a later change notifies only the people affected", async () => {
    const draftPeople = new Set(w.rows("shiftsPlanned").filter((s) => s.date === nextWeek() && s.userId).map((s) => s.userId));
    const before = Object.fromEntries(["ana.p", "tom.b", "luis.c"].map((u) => [u, scheduleOutbound(u)]));
    const r = await publishNextWeek();
    expect(r.version).toBe(1);
    expect(r.notified).toBe(draftPeople.size);
    for (const u of ["ana.p", "tom.b", "luis.c"]) expect(scheduleOutbound(u)).toBe(before[u]! + 1);
    expect(w.rows("auditLogs").some((a) => a.action === "schedule.published")).toBe(true);

    // Everyone confirms version 1.
    for (const u of ["ana.p", "tom.b"]) {
      await w.as(u);
      await w.m("schedule:confirm", { venueId: w.venue("v1")._id, weekStart: nextWeek(), version: 1 });
    }
    // The manager moves Ana's start: only Ana is told and must confirm again.
    await w.as("maria.m");
    const ana = w.rows("shiftsPlanned").find((s) => s.userId === w.user("ana.p")._id && s.date === nextWeek() && !s.removed)!;
    await w.m("schedule:upsertShift", { shiftId: ana._id, venueId: w.venue("v1")._id, userId: ana.userId, position: "server", date: ana.date, start: "17:00", untilClose: true });
    const tomBefore = scheduleOutbound("tom.b");
    const anaBefore = scheduleOutbound("ana.p");
    const r2 = await w.m<{ version: number; notified: number }>("schedule:publish", { venueId: w.venue("v1")._id, weekStart: nextWeek() });
    expect(r2).toEqual({ version: 2, notified: 1 });
    expect(scheduleOutbound("ana.p")).toBe(anaBefore + 1);
    expect(scheduleOutbound("tom.b")).toBe(tomBefore);

    await w.as("ana.p");
    expect(await w.code("schedule:confirm", { venueId: w.venue("v1")._id, weekStart: nextWeek(), version: 1 })).toBe("VERSION_STALE");
    const mine = await w.q<{ needsConfirm: boolean }>("schedule:myWeek", { weekStart: nextWeek() });
    expect(mine.needsConfirm).toBe(true);
    await w.m("schedule:confirm", { venueId: w.venue("v1")._id, weekStart: nextWeek(), version: 2 });
    expect((await w.q<{ needsConfirm: boolean }>("schedule:myWeek", { weekStart: nextWeek() })).needsConfirm).toBe(false);
    // Tom still has version 1 as his latest relevant version: nothing to confirm.
    await w.as("tom.b");
    expect((await w.q<{ needsConfirm: boolean }>("schedule:myWeek", { weekStart: nextWeek() })).needsConfirm).toBe(false);
  });

  it("publishing with no pending change notifies nobody", async () => {
    await publishNextWeek();
    const r = await w.m<{ notified: number }>("schedule:publish", { venueId: w.venue("v1")._id, weekStart: nextWeek() });
    expect(r.notified).toBe(0);
  });

  it("a change made after publishing stays hidden from staff until the next publish (publish while editing)", async () => {
    await publishNextWeek();
    await w.m("schedule:upsertShift", { venueId: w.venue("v1")._id, userId: w.user("kevin.d")._id, position: "busser", date: nextWeek(), start: "16:00", untilClose: true });
    const view = await w.q<WeekView>("schedule:week", { venueId: w.venue("v1")._id, weekStart: nextWeek() });
    expect(view.hasPendingChanges).toBe(true);
    expect(view.shifts.find((s) => s.userId === w.user("kevin.d")._id)!.pending).toBe(true);
    await w.as("kevin.d");
    const before = await w.q<{ days: Array<{ blocks: unknown[] }> }>("schedule:myWeek", { weekStart: nextWeek() });
    expect(before.days.flatMap((d) => d.blocks)).toHaveLength(0);
    await w.as("maria.m");
    const r = await w.m<{ notified: number }>("schedule:publish", { venueId: w.venue("v1")._id, weekStart: nextWeek() });
    expect(r.notified).toBe(1);
    await w.as("kevin.d");
    const after = await w.q<{ days: Array<{ blocks: unknown[] }>; needsConfirm: boolean }>("schedule:myWeek", { weekStart: nextWeek() });
    expect(after.days.flatMap((d) => d.blocks)).toHaveLength(1);
    expect(after.needsConfirm).toBe(true);
  });

  it("removing a published shift tells its person on the next publish, who confirms the removal", async () => {
    await publishNextWeek();
    const tom = w.rows("shiftsPlanned").find((s) => s.userId === w.user("tom.b")._id && s.date === nextWeek())!;
    await w.m("schedule:removeShift", { shiftId: tom._id });
    const before = scheduleOutbound("tom.b");
    expect((await w.m<{ notified: number }>("schedule:publish", { venueId: w.venue("v1")._id, weekStart: nextWeek() })).notified).toBe(1);
    expect(scheduleOutbound("tom.b")).toBe(before + 1);
    await w.as("tom.b");
    await w.m("schedule:confirm", { venueId: w.venue("v1")._id, weekStart: nextWeek(), version: 2 });
  });

  it("the seeded change to Pedro's shift makes him late to confirm; confirming the new version clears it", async () => {
    await w.as("maria.m");
    const c = await w.q<{ people: Array<{ name: string; state: string }>; counts: { confirmed: number; late: number } }>("schedule:confirmations", { venueId: w.venue("v1")._id, weekStart: thisWeek() });
    const state = (name: string) => c.people.find((p) => p.name === name)?.state;
    expect(state("Pedro López")).toBe("late");
    expect(state("Jade Williams")).toBe("late");
    expect(state("Ana Pérez")).toBe("confirmed");
    expect(JSON.stringify(c)).not.toContain("%");
    await w.as("pedro.l");
    expect(await w.code("schedule:confirm", { venueId: w.venue("v1")._id, weekStart: thisWeek(), version: 1 })).toBe("VERSION_STALE");
    await w.m("schedule:confirm", { venueId: w.venue("v1")._id, weekStart: thisWeek(), version: 2 });
    await w.as("maria.m");
    const c2 = await w.q<{ people: Array<{ name: string; state: string }> }>("schedule:confirmations", { venueId: w.venue("v1")._id, weekStart: thisWeek() });
    expect(c2.people.find((p) => p.name === "Pedro López")!.state).toBe("confirmed");
    expect(w.rows("analyticsEvents").some((e) => e.name === "schedule_confirmed")).toBe(true);
  });

  it("confirming a week that is not published answers WEEK_NOT_PUBLISHED", async () => {
    await w.as("ana.p");
    expect(await w.code("schedule:confirm", { venueId: w.venue("v1")._id, weekStart: nextWeek(), version: 1 })).toBe("WEEK_NOT_PUBLISHED");
  });

  it("reminds unconfirmed people 24 h after publishing, once, and sends the manager the list", async () => {
    const jade = scheduleOutbound("jade.w");
    const ana = scheduleOutbound("ana.p");
    const mariaBefore = w.rows("outbound").filter((o) => o.userId === w.user("maria.m")._id).length;
    await w.as(null);
    await w.m("schedule:remind", {});
    expect(scheduleOutbound("jade.w")).toBe(jade + 1);
    expect(scheduleOutbound("ana.p")).toBe(ana);
    expect(w.rows("outbound").filter((o) => o.userId === w.user("maria.m")._id).length).toBe(mariaBefore + 1);
    await w.m("schedule:remind", {});
    expect(scheduleOutbound("jade.w")).toBe(jade + 1);
  });

  it("does not remind before 24 h", async () => {
    await publishNextWeek();
    const nextWeekId = w.rows("scheduleWeeks").find((x) => x.weekStart === nextWeek())!._id;
    await w.as(null);
    await w.m("schedule:remind", {});
    expect(w.rows("scheduleWeeks").find((x) => x._id === nextWeekId)!.remindedAt).toBeUndefined();
  });
});

describe("permissions and isolation", () => {
  it("staff cannot build or publish; managers of another venue get VENUE_FORBIDDEN", async () => {
    await w.as("ana.p");
    expect(await w.code("schedule:publish", { venueId: w.venue("v1")._id, weekStart: nextWeek() })).toBe("FORBIDDEN");
    expect(await w.code("schedule:upsertShift", { venueId: w.venue("v1")._id, userId: w.user("ana.p")._id, position: "server", date: nextWeek(), start: "16:00", untilClose: true })).toBe("FORBIDDEN");
    expect(await w.qcode("schedule:confirmations", { venueId: w.venue("v1")._id, weekStart: thisWeek() })).toBe("FORBIDDEN");
    await w.as("james.k");
    expect(await w.code("schedule:publish", { venueId: w.venue("v1")._id, weekStart: nextWeek() })).toBe("VENUE_FORBIDDEN");
    expect(await w.qcode("schedule:week", { venueId: w.venue("v1")._id })).toBe("VENUE_FORBIDDEN");
  });

  it("staff see only their own shifts in the venue week", async () => {
    await w.as("ana.p");
    const view = await w.q<WeekView>("schedule:week", { venueId: w.venue("v1")._id, weekStart: thisWeek() });
    expect(view.shifts.length).toBeGreaterThan(0);
    expect(view.shifts.every((s) => s.userId === w.user("ana.p")._id)).toBe(true);
  });

  it("refuses a position the person is not enabled for (NOT_ENABLED)", async () => {
    await w.as("maria.m");
    expect(await w.code("schedule:upsertShift", { venueId: w.venue("v1")._id, userId: w.user("kevin.d")._id, position: "bartender", date: nextWeek(), start: "16:00", untilClose: true })).toBe("NOT_ENABLED");
    // Enabled positions count: Omar the polisher can cover a barback shift.
    expect(await w.code("schedule:upsertShift", { venueId: w.venue("v1")._id, userId: w.user("omar.b")._id, position: "barback", date: nextWeek(), start: "16:00", untilClose: true })).toBeNull();
  });
});

describe("open shifts", () => {
  it("two people claim one open shift: the first approved takes it, the other is denied, later claims get ALREADY_CLAIMED", async () => {
    await w.as("maria.m");
    const date = addDays(thisWeek(), 6);
    const { shiftId } = await w.m<{ shiftId: string }>("schedule:offerOpenShift", { venueId: w.venue("v1")._id, position: "runner", date, start: "10:00", end: "14:00", untilClose: false });
    await w.as("kevin.d");
    expect(await w.code("schedule:claimOpenShift", { shiftId })).toBe("NOT_ENABLED");
    await w.as("carlos.g");
    const a = await w.m<{ claimId: string }>("schedule:claimOpenShift", { shiftId });
    await w.as("nina.s");
    const b = await w.m<{ claimId: string }>("schedule:claimOpenShift", { shiftId });
    await w.as("maria.m");
    await w.m("schedule:decideClaim", { claimId: a.claimId, approve: true });
    expect(await w.code("schedule:decideClaim", { claimId: b.claimId, approve: true })).toBe("INVALID_TRANSITION");
    expect(w.rows("openShiftClaims").find((c) => c._id === b.claimId)!.status).toBe("denied");
    await w.as("pedro.l");
    expect(await w.code("schedule:claimOpenShift", { shiftId })).toBe("ALREADY_CLAIMED");
    const s = w.rows("shiftsPlanned").find((x) => x._id === shiftId)!;
    expect(s.open).toBe(false);
    expect(s.userId).toBe(w.user("carlos.g")._id);
  });
});

describe("swaps through the manager (ADR 0026)", () => {
  async function setup() {
    await w.as("maria.m");
    const tue = addDays(nextWeek(), 1);
    const { shiftId: jadeShift } = await w.m<{ shiftId: string }>("schedule:upsertShift", { venueId: w.venue("v1")._id, userId: w.user("jade.w")._id, position: "server", date: tue, start: "16:00", untilClose: true });
    await w.m("schedule:publish", { venueId: w.venue("v1")._id, weekStart: nextWeek() });
    const anaShift = w.rows("shiftsPlanned").find((s) => s.userId === w.user("ana.p")._id && s.date === nextWeek() && !s.removed)!._id;
    await w.as("ana.p");
    const { swapId } = await w.m<{ swapId: string }>("schedule:requestSwap", { fromShiftId: anaShift, colleagueId: w.user("jade.w")._id, toShiftId: jadeShift });
    return { swapId, anaShift, jadeShift };
  }

  it("asks the colleague through the system, then the manager decides; both shifts move atomically", async () => {
    const jadeBefore = scheduleOutbound("jade.w");
    const { swapId } = await setup();
    expect(scheduleOutbound("jade.w")).toBe(jadeBefore + 2); // the publish, then the swap question
    await w.as("maria.m");
    expect(await w.code("schedule:decideSwap", { swapId, approve: true })).toBe("INVALID_TRANSITION"); // the colleague has not answered
    await w.as("tom.b");
    expect(await w.code("schedule:answerSwap", { swapId, accept: true })).toBe("NOT_FOUND"); // nobody else can answer
    await w.as("jade.w");
    await w.m("schedule:answerSwap", { swapId, accept: true });
    await w.as("ana.p");
    expect(await w.code("schedule:decideSwap", { swapId, approve: true })).toBe("FORBIDDEN");
    await w.as("maria.m");
    const r = await w.m<{ status: string; version: number }>("schedule:decideSwap", { swapId, approve: true });
    expect(r.status).toBe("approved");
    const live = w.rows("shiftsPlanned").filter((s) => !s.removed && (s.date as string) >= nextWeek() && (s.date as string) <= addDays(nextWeek(), 1) && s.position === "server");
    expect(live.find((s) => s.date === nextWeek() && s.userId === w.user("jade.w")._id)).toBeDefined();
    expect(live.find((s) => s.date === addDays(nextWeek(), 1) && s.userId === w.user("ana.p")._id)).toBeDefined();
    expect(live.find((s) => s.date === nextWeek() && s.userId === w.user("ana.p")._id)).toBeUndefined();
    // Both must confirm the new version; the double approval is refused.
    await w.as("ana.p");
    expect((await w.q<{ needsConfirm: boolean }>("schedule:myWeek", { weekStart: nextWeek() })).needsConfirm).toBe(true);
    await w.as("maria.m");
    expect(await w.code("schedule:decideSwap", { swapId, approve: true })).toBe("INVALID_TRANSITION");
    expect(w.rows("auditLogs").some((a) => a.action === "swap.decided")).toBe(true);
  });

  it("a colleague who declines ends the swap; the same shift cannot be asked twice while open", async () => {
    const { swapId, anaShift } = await setup();
    await w.as("ana.p");
    expect(await w.code("schedule:requestSwap", { fromShiftId: anaShift, colleagueId: w.user("tom.b")._id })).toBe("SWAP_CONFLICT");
    await w.as("jade.w");
    await w.m("schedule:answerSwap", { swapId, accept: false });
    expect(w.rows("swaps").find((s) => s._id === swapId)!.status).toBe("denied");
  });

  it("lists only colleagues of the venue enabled for the position, with their shifts to offer; only the shift's person may ask", async () => {
    const { jadeShift } = await setup();
    const anaShift = w.rows("shiftsPlanned").find((s) => s.userId === w.user("ana.p")._id && s.date === nextWeek() && !s.removed)!._id;
    await w.as("ana.p");
    const list = await w.q<Array<{ userId: string; name: string; shifts: Array<{ _id: string }> }>>("schedule:swapCandidates", { shiftId: anaShift });
    const ids = list.map((c) => c.userId);
    expect(ids).toContain(w.user("jade.w")._id);
    expect(ids).toContain(w.user("carlos.g")._id); // runner enabled as server
    expect(ids).not.toContain(w.user("kevin.d")._id); // busser, not enabled
    expect(ids).not.toContain(w.user("ana.p")._id);
    expect(ids).not.toContain(w.user("emma.t")._id); // another venue
    expect(list.find((c) => c.userId === w.user("jade.w")._id)!.shifts.map((s) => s._id)).toContain(jadeShift);
    expect(JSON.stringify(list)).not.toMatch(/username|email/);
    await w.as("tom.b");
    expect(await w.qcode("schedule:swapCandidates", { shiftId: anaShift })).toBe("NOT_FOUND");
  });

  it("a colleague not enabled for the position cannot take it (NOT_ENABLED)", async () => {
    await publishNextWeek();
    const anaShift = w.rows("shiftsPlanned").find((s) => s.userId === w.user("ana.p")._id && s.date === nextWeek())!._id;
    await w.as("ana.p");
    expect(await w.code("schedule:requestSwap", { fromShiftId: anaShift, colleagueId: w.user("kevin.d")._id })).toBe("NOT_ENABLED");
  });
});

describe("events, attendance, time off, hours, reminders", () => {
  it("shows event coverage as staffed or short, and managers edit events", async () => {
    await w.as("maria.m");
    const view = await w.q<WeekView>("schedule:week", { venueId: w.venue("v1")._id, weekStart: thisWeek() });
    const dinner = view.events.find((e) => e.coverage.some((c) => c.position === "sommelier"))!;
    expect(dinner.coverage.every((c) => c.staffed)).toBe(true);
    const ev = w.rows("venueEvents").find((e) => e._id === dinner._id)!;
    await w.m("events:upsert", { eventId: ev._id, venueId: ev.venueId, kind: ev.kind, name: ev.name, date: ev.date, start: ev.start, end: ev.end, notes: ev.notes, required: [{ position: "server", count: 3 }] });
    const list = await w.q<Array<{ _id: string; coverage: Array<{ position: string; filled: number; staffed: boolean }> }>>("events:list", { venueId: w.venue("v1")._id });
    const server = list.find((e) => e._id === ev._id)!.coverage[0]!;
    expect(server).toMatchObject({ position: "server", filled: 2, staffed: false });
    expect(w.rows("auditLogs").some((a) => a.action === "event.changed")).toBe(true);
    await w.as("ana.p");
    expect(await w.code("events:upsert", { venueId: ev.venueId, kind: "tasting", name: ev.name, date: ev.date, start: "15:00", end: "16:00", notes: ev.notes, required: [] })).toBe("FORBIDDEN");
  });

  it("the owner creates a private dinner and the people scheduled that day are told", async () => {
    await w.as("owner");
    const before = scheduleOutbound("ana.p");
    const { eventId } = await w.m<{ eventId: string }>("events:upsert", { venueId: w.venue("v1")._id, kind: "private_dinner", name: { en: "Buy-out", es: "Cierre privado" }, date: today(), start: "19:00", end: "23:00", notes: { en: "", es: "" }, required: [{ position: "captain", count: 1 }] });
    expect(scheduleOutbound("ana.p")).toBe(before + 1);
    await w.m("events:remove", { eventId });
    expect(w.rows("venueEvents").some((e) => e._id === eventId)).toBe(false);
  });

  it("marks attendance without a time clock and suggests the punctuality warning", async () => {
    await w.as("maria.m");
    const kevin = w.rows("shiftsPlanned").find((s) => s.userId === w.user("kevin.d")._id && s.date === today())!;
    const r = await w.m<{ suggestWarning: { ruleKey: string } | null }>("schedule:markAttendance", { shiftId: kevin._id, status: "late", minutes: 20 });
    expect(r.suggestWarning?.ruleKey).toBe("punctuality");
    expect((await w.m<{ suggestWarning: unknown }>("schedule:markAttendance", { shiftId: kevin._id, status: "on_time" })).suggestWarning).toBeNull();
    expect(w.rows("auditLogs").some((a) => a.action === "attendance.marked")).toBe(true);
    const future = w.rows("shiftsPlanned").find((s) => s.userId && s.date === nextWeek())!;
    expect(await w.code("schedule:markAttendance", { shiftId: future._id, status: "no_show" })).toBe("INVALID_TRANSITION");
  });

  it("time off goes to the manager, who decides; staff cannot decide", async () => {
    await w.as("tom.b");
    const { timeOffId } = await w.m<{ timeOffId: string }>("schedule:requestTimeOff", { venueId: w.venue("v1")._id, from: addDays(today(), 20), to: addDays(today(), 21) });
    await w.as("ana.p");
    expect(await w.code("schedule:decideTimeOff", { timeOffId, approve: true })).toBe("FORBIDDEN");
    await w.as("maria.m");
    const q = await w.q<{ timeOff: unknown[]; swaps: unknown[]; claims: unknown[] }>("schedule:queue", { venueId: w.venue("v1")._id });
    expect(q.timeOff.length).toBeGreaterThanOrEqual(2);
    await w.m("schedule:decideTimeOff", { timeOffId, approve: true });
    expect(await w.code("schedule:decideTimeOff", { timeOffId, approve: false })).toBe("INVALID_TRANSITION");
    expect(w.rows("auditLogs").some((a) => a.action === "time_off.decided")).toBe(true);
  });

  it("availability is replaced as a whole", async () => {
    await w.as("ana.p");
    await w.m("schedule:setAvailability", { rows: [{ weekday: 1, from: "09:00", to: "15:00", available: true }] });
    await w.m("schedule:setAvailability", { rows: [{ weekday: 2, from: "16:00", to: "23:59", available: false }] });
    expect(await w.q("schedule:myAvailability", {})).toEqual([{ weekday: 2, from: "16:00", to: "23:59", available: false }]);
    expect(await w.code("schedule:setAvailability", { rows: [{ weekday: 2, from: "18:00", to: "16:00", available: true }] })).toBe("INVALID_INPUT");
  });

  it("weekly hours are reported as states against the company threshold", async () => {
    await w.as("maria.m");
    const h = await w.q<{ threshold: number; people: Array<{ hours: number; state: string }> }>("schedule:hours", { venueId: w.venue("v1")._id, weekStart: thisWeek() });
    expect(h.threshold).toBe(40);
    expect(h.people.length).toBeGreaterThan(5);
    expect(h.people.every((p) => p.state === (p.hours > 40 ? "over_limit" : "within_limit"))).toBe(true);
  });

  it("pushes about an hour before a published shift, once", async () => {
    // Keep seeded lunch shifts outside the reminder window, regardless of when CI runs.
    vi.spyOn(Date, "now").mockReturnValue(nyTimeOn(today(), "06:00"));
    const soon = Date.now() + 30 * 60_000;
    const date = nyDateKey(soon);
    const p = nyWallParts(soon);
    const start = `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
    await w.as("maria.m");
    await w.m("schedule:upsertShift", { venueId: w.venue("v1")._id, userId: w.user("omar.b")._id, position: "polisher", date, start, end: "23:59", untilClose: false });
    await w.m("schedule:publish", { venueId: w.venue("v1")._id, weekStart: weekOf(date) });
    const before = scheduleOutbound("omar.b");
    await w.as(null);
    await w.m("schedule:shiftReminder", {});
    expect(scheduleOutbound("omar.b")).toBe(before + 1);
    await w.m("schedule:shiftReminder", {});
    expect(scheduleOutbound("omar.b")).toBe(before + 1);
  });
});
