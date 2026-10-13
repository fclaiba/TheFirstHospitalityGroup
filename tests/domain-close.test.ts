import { describe, expect, it } from "vitest";
import { closeSummary, openRuns } from "../lib/domain/close";
import { DAY_MS, DEFAULT_THRESHOLDS, PROPOSAL_ESCALATE_MS, VOID_WINDOW_MS, canVoid, countable, proposalStale, streak, validThresholds, warningState, worse } from "../lib/domain/warnings";
import { CONFIRM_LATE_MS, EMPTY_VENUE_INPUTS, byUrgency, isConfirmLate, personState, venueState } from "../lib/domain/states";
import {
  DEFAULT_WEEKLY_HOURS,
  availableAt,
  changedPeople,
  eventCoverage,
  isDouble,
  needsConfirm,
  onTimeOff,
  openShiftEligible,
  overHours,
  overlaps,
  shiftMinutes,
  shiftSpan,
  swapProblem,
  validTime,
  versionToConfirm,
  weekDates,
  weekOf,
  weeklyHours,
} from "../lib/domain/schedule";
import type { PlannedLike } from "../lib/domain/schedule";
import { DEFAULT_SIDE_WORK_LIMIT, nonTippedMinutes, overSideWorkLimit } from "../lib/domain/sideWork";

const NOW = Date.UTC(2026, 9, 13, 18);

describe("closeSummary (no money, ADR 0018)", () => {
  it("summarizes side work, attendance, shortages and the rest", () => {
    const runs = [
      { phase: "open", items: [{ done: true }], dueAt: NOW - 1000, completedAt: NOW - 2000 },
      { phase: "close", items: [{ done: false }], dueAt: NOW - 1000 },
      { phase: "close", items: [{ done: false }], dueAt: NOW + 1000, excused: { by: "m", reason: "Sick" } },
      { phase: "close", items: [{ done: true }, { done: false }], dueAt: NOW + 1000 },
    ];
    const s = closeSummary({
      runs,
      attendance: [{ status: "on_time" }, { status: "late" }, { status: "no_show" }, { status: "on_time" }],
      shortages: [{ level: "low" }, { level: "out" }, { level: "out" }],
      eightySixes: 2,
      warnings: 1,
      incidents: 3,
      cleaning: "partial",
      now: NOW,
    });
    expect(s.runs).toEqual({ total: 4, complete: 1, late: 1, excused: 1, open: 2 });
    expect(s.attendance).toEqual({ onTime: 2, late: 1, noShow: 1 });
    expect(s.shortages).toEqual({ low: 1, out: 2 });
    expect(s).toMatchObject({ eightySixes: 2, warnings: 1, incidents: 3, cleaning: "partial" });
    expect(JSON.stringify(s)).not.toMatch(/cents|sales|comps|voids/i);
    expect(openRuns(runs)).toHaveLength(2);
  });
});

describe("warnings (ADR 0007, 0026)", () => {
  const w = (daysAgo: number, severity: "minor" | "major", voided = false) => ({ at: NOW - daysAgo * DAY_MS, severity, voidedAt: voided ? NOW : undefined });

  it("counts only live, non-voided warnings in the window", () => {
    expect(countable(w(1, "minor"), NOW)).toBe(true);
    expect(countable(w(31, "minor"), NOW)).toBe(false);
    expect(countable(w(1, "minor", true), NOW)).toBe(false);
    expect(countable({ at: NOW + 1000, severity: "minor" }, NOW)).toBe(false);
    expect(countable(w(10, "minor"), NOW, 7)).toBe(false);
  });

  it("computes the four states with the default and company thresholds", () => {
    expect(warningState([], NOW)).toBe("up_to_date");
    expect(warningState([w(1, "minor")], NOW)).toBe("attention");
    expect(warningState([w(1, "minor"), w(2, "minor"), w(3, "minor")], NOW)).toBe("follow_up");
    expect(warningState([w(1, "major")], NOW)).toBe("follow_up");
    expect(warningState([w(1, "major"), w(2, "major")], NOW)).toBe("review");
    expect(warningState([w(1, "major", true), w(40, "major")], NOW)).toBe("up_to_date");
    const t = { ...DEFAULT_THRESHOLDS, attentionMinor: 2, reviewMajor: 3 };
    expect(warningState([w(1, "minor")], NOW, t)).toBe("up_to_date");
    expect(warningState([w(1, "major"), w(2, "major")], NOW, t)).toBe("follow_up");
  });

  it("voids only within 24 h, by managers and above, once", () => {
    expect(canVoid({ at: NOW - 1000 }, "floor_manager", NOW)).toBeNull();
    expect(canVoid({ at: NOW - 1000 }, "gm", NOW)).toBeNull();
    expect(canVoid({ at: NOW - 1000 }, "owner", NOW)).toBeNull();
    expect(canVoid({ at: NOW - VOID_WINDOW_MS - 1 }, "floor_manager", NOW)).toBe("TOO_LATE");
    expect(canVoid({ at: NOW - 1000 }, "captain", NOW)).toBe("FORBIDDEN");
    expect(canVoid({ at: NOW - 1000, voidedAt: NOW }, "floor_manager", NOW)).toBe("FORBIDDEN");
  });

  it("escalates open proposals after 24 h, once", () => {
    expect(proposalStale({ status: "open", at: NOW - PROPOSAL_ESCALATE_MS - 1 }, NOW)).toBe(true);
    expect(proposalStale({ status: "open", at: NOW - 1000 }, NOW)).toBe(false);
    expect(proposalStale({ status: "open", at: 0, escalatedAt: 5 }, NOW)).toBe(false);
    expect(proposalStale({ status: "issued", at: 0 }, NOW)).toBe(false);
  });

  it("computes streaks of shifts without warnings (recognition)", () => {
    const shifts = [1, 2, 3, 4, 5].map((d) => NOW - (10 - d) * DAY_MS);
    expect(streak(shifts, [])).toEqual({ current: 5, best: 5 });
    expect(streak(shifts, [{ at: shifts[2]! + 3600_000, severity: "minor" }])).toEqual({ current: 2, best: 2 });
    expect(streak(shifts, [{ at: shifts[4]! + 3600_000, severity: "minor" }])).toEqual({ current: 0, best: 4 });
    expect(streak(shifts, [{ at: shifts[0]! + 3600_000, severity: "minor", voidedAt: NOW }])).toEqual({ current: 5, best: 5 });
  });

  it("validates thresholds and orders states", () => {
    expect(validThresholds(DEFAULT_THRESHOLDS)).toBe(true);
    expect(validThresholds({ ...DEFAULT_THRESHOLDS, attentionMinor: 4 })).toBe(false);
    expect(validThresholds({ ...DEFAULT_THRESHOLDS, followUpMajor: 3 })).toBe(false);
    expect(validThresholds({ ...DEFAULT_THRESHOLDS, windowDays: 0 })).toBe(false);
    expect(validThresholds({ ...DEFAULT_THRESHOLDS, windowDays: 400 })).toBe(false);
    expect(worse("attention", "review")).toBe("review");
    expect(worse("follow_up", "up_to_date")).toBe("follow_up");
  });
});

describe("states, not scores (ADR 0027)", () => {
  it("is on track with nothing pending", () => {
    expect(venueState(EMPTY_VENUE_INPUTS)).toEqual({ state: "on_track", reasons: [] });
  });

  it("needs attention for pending items, with names", () => {
    const r = venueState({ ...EMPTY_VENUE_INPUTS, unconfirmed: ["Ana", "Jade"], lateRuns: 2, shortagesLow: 1, staleProposals: 1, overSideWork: 3 });
    expect(r.state).toBe("needs_attention");
    expect(r.reasons.map((x) => x.key)).toEqual(["confirmationsPending", "sideWorkLate", "shortagesLow", "proposalsWaiting", "sideWorkOverLimit"]);
    expect(r.reasons[0]).toEqual({ key: "confirmationsPending", count: 2, names: ["Ana", "Jade"], level: "needs_attention" });
  });

  it("requires action for missing closes, late confirmations, bottles out and people in Review", () => {
    const r = venueState({ ...EMPTY_VENUE_INPUTS, closesMissing: 1, autoClosed: 1, unconfirmed: ["Ana", "Jade"], lateConfirmations: ["Jade"], shortagesOut: 1, reviews: ["Kevin"] });
    expect(r.state).toBe("action_required");
    expect(r.reasons.map((x) => x.key)).toEqual(["closeMissing", "autoClosed", "confirmationsLate", "shortagesOut", "peopleInReview", "confirmationsPending"]);
    expect(r.reasons.find((x) => x.key === "confirmationsPending")!.names).toEqual(["Ana"]);
    expect(JSON.stringify(r)).not.toContain("%");
  });

  it("sorts venues worst first", () => {
    const list = [{ state: "on_track" as const }, { state: "action_required" as const }, { state: "needs_attention" as const }].sort(byUrgency);
    expect(list.map((v) => v.state)).toEqual(["action_required", "needs_attention", "on_track"]);
  });

  it("describes a person with states and reasons, never a number", () => {
    expect(personState({ warnings: "up_to_date", pendingConfirmations: 0, latePending: false, lateRuns: 0 })).toEqual({ warnings: "up_to_date", confirmation: "confirmed", reasons: [] });
    expect(personState({ warnings: "review", pendingConfirmations: 2, latePending: true, lateRuns: 1 })).toEqual({ warnings: "review", confirmation: "late", reasons: ["warnings.review", "confirm.late", "sideWorkLate"] });
    expect(personState({ warnings: "up_to_date", pendingConfirmations: 1, latePending: false, lateRuns: 0 }).confirmation).toBe("pending");
    expect(isConfirmLate(0, CONFIRM_LATE_MS + 1)).toBe(true);
    expect(isConfirmLate(0, CONFIRM_LATE_MS)).toBe(false);
  });
});

describe("schedule (ADR 0019)", () => {
  const s = (p: Partial<PlannedLike> = {}): PlannedLike => ({ userId: "ana", position: "server", date: "2026-10-14", start: "17:00", untilClose: true, changedInVersion: 1, ...p });

  it("starts weeks on Monday", () => {
    expect(weekOf("2026-10-12")).toBe("2026-10-12");
    expect(weekOf("2026-10-14")).toBe("2026-10-12");
    expect(weekOf("2026-10-18")).toBe("2026-10-12");
    expect(weekOf("2026-10-19")).toBe("2026-10-19");
    expect(weekDates("2026-10-12")).toEqual(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]);
  });

  it("measures shifts until close, with breaks, and past midnight", () => {
    expect(validTime("17:30")).toBe(true);
    expect(validTime("26:00")).toBe(true);
    expect(validTime("31:00")).toBe(false);
    expect(validTime("5pm")).toBe(false);
    const span = shiftSpan(s());
    expect(span.to - span.from).toBe(6.5 * 3600_000);
    expect(shiftMinutes(s({ breakMin: 30 }))).toBe(360);
    expect(shiftMinutes(s({ untilClose: false, end: "02:00" }))).toBe(540);
    expect(shiftMinutes(s(), "02:00")).toBe(540);
    expect(shiftMinutes(s({ untilClose: false }))).toBe(390);
    expect(shiftMinutes(s({ start: "10:30", end: "15:00", untilClose: false, breakMin: 300 }))).toBe(0);
  });

  it("recognizes doubles and overlaps", () => {
    const lunch = s({ start: "10:30", end: "15:00", untilClose: false });
    expect(isDouble([lunch, s()])).toBe(true);
    expect(isDouble([s()])).toBe(false);
    expect(isDouble([lunch, s({ date: "2026-10-15" })])).toBe(false);
    expect(isDouble([lunch, s({ userId: "tom" })])).toBe(false);
    expect(isDouble([lunch, s({ removed: true })])).toBe(false);
    expect(overlaps(lunch, s())).toBe(false);
    expect(overlaps(s({ start: "10:30", end: "17:30", untilClose: false }), s())).toBe(true);
  });

  it("knows who changed after publishing and what each person must confirm", () => {
    const shifts = [s({ userId: "ana", changedInVersion: 1 }), s({ userId: "tom", changedInVersion: 2 }), s({ userId: "jade", changedInVersion: 3 }), s({ userId: undefined, open: true, changedInVersion: 3 })];
    expect(changedPeople(shifts, 2)).toEqual(["jade"]);
    expect(changedPeople(shifts, 0).sort()).toEqual(["ana", "jade", "tom"]);
    expect(versionToConfirm("tom", shifts, 2)).toBe(2);
    expect(versionToConfirm("jade", shifts, 2)).toBeNull();
    expect(versionToConfirm("nobody", shifts, 2)).toBeNull();
    const week = { status: "published", version: 2 };
    expect(needsConfirm("tom", week, shifts, [{ userId: "tom", version: 1 }])).toBe(true);
    expect(needsConfirm("tom", week, shifts, [{ userId: "tom", version: 2 }])).toBe(false);
    expect(needsConfirm("ana", week, shifts, [{ userId: "ana", version: 1 }])).toBe(false);
    expect(needsConfirm("ana", week, shifts, [{ userId: "tom", version: 9 }])).toBe(true);
    expect(needsConfirm("jade", week, shifts, [])).toBe(false);
    expect(needsConfirm("tom", { status: "draft", version: 0 }, shifts, [])).toBe(false);
  });

  it("asks a person whose only shift was removed to confirm the change", () => {
    const shifts = [s({ userId: "kevin", removed: true, changedInVersion: 2 })];
    expect(needsConfirm("kevin", { status: "published", version: 2 }, shifts, [{ userId: "kevin", version: 1 }])).toBe(true);
    expect(needsConfirm("kevin", { status: "published", version: 2 }, shifts, [{ userId: "kevin", version: 2 }])).toBe(false);
  });

  it("validates swaps through the manager", () => {
    const ana = { _id: "ana", primaryPosition: "server" as const, enabledPositions: [] };
    const tom = { _id: "tom", primaryPosition: "server" as const, enabledPositions: ["captain" as const] };
    const kevin = { _id: "kevin", primaryPosition: "busser" as const, enabledPositions: [] };
    const mine = s({ userId: "ana" }) as PlannedLike & { userId: string };
    const his = s({ userId: "tom", date: "2026-10-15" }) as PlannedLike & { userId: string };
    expect(swapProblem(mine, null, ana, tom, 0)).toBeNull();
    expect(swapProblem(mine, his, ana, tom, 0)).toBeNull();
    expect(swapProblem(mine, null, tom, ana, 0)).toBe("FORBIDDEN");
    expect(swapProblem(mine, null, ana, ana, 0)).toBe("FORBIDDEN");
    expect(swapProblem({ ...mine, removed: true }, null, ana, tom, 0)).toBe("SWAP_CONFLICT");
    expect(swapProblem(mine, { ...his, removed: true }, ana, tom, 0)).toBe("SWAP_CONFLICT");
    expect(swapProblem(mine, null, ana, tom, Date.UTC(2030, 0, 1))).toBe("TOO_LATE");
    expect(swapProblem(mine, { ...his, date: "2020-01-01" }, ana, tom, Date.UTC(2025, 0, 1))).toBe("TOO_LATE");
    expect(swapProblem(mine, null, ana, kevin, 0)).toBe("NOT_ENABLED");
    expect(swapProblem(mine, { ...his, userId: "kevin" }, ana, tom, 0)).toBe("SWAP_CONFLICT");
    expect(swapProblem(mine, { ...his, position: "captain" }, ana, tom, 0)).toBe("NOT_ENABLED");
  });

  it("lets enabled, free people claim open shifts", () => {
    const open = s({ userId: undefined, position: "runner", open: true });
    const carlos = { primaryPosition: "runner" as const, enabledPositions: [] };
    expect(openShiftEligible(carlos, open, [])).toBeNull();
    expect(openShiftEligible({ primaryPosition: "server", enabledPositions: [] }, open, [])).toBe("NOT_ENABLED");
    expect(openShiftEligible(carlos, open, [s({ userId: "carlos" })])).toBe("SWAP_CONFLICT");
    expect(openShiftEligible(carlos, open, [s({ userId: "carlos", removed: true })])).toBeNull();
  });

  it("adds weekly hours and flags too many", () => {
    const week = [s(), s({ date: "2026-10-15" }), s({ removed: true }), s({ open: true, userId: undefined })];
    expect(weeklyHours(week)).toBe(13);
    expect(overHours(week, 12)).toBe(true);
    expect(overHours(week)).toBe(false);
    expect(DEFAULT_WEEKLY_HOURS).toBe(40);
  });

  it("measures event coverage as staffed or short", () => {
    const event = { _id: "e", required: [{ position: "server" as const, count: 2 }, { position: "captain" as const, count: 1 }] };
    const shifts = [s({ eventId: "e" }), s({ eventId: "e", userId: "tom" }), s({ eventId: "e", position: "captain", open: true, userId: undefined }), s({ eventId: "x", position: "captain" })];
    expect(eventCoverage(event, shifts)).toEqual([
      { position: "server", required: 2, filled: 2, staffed: true },
      { position: "captain", required: 1, filled: 0, staffed: false },
    ]);
  });

  it("respects availability and approved time off", () => {
    const monday = "2026-10-12";
    expect(availableAt([], monday, "17:00")).toBe(true);
    expect(availableAt([{ weekday: 2, from: "00:00", to: "23:59", available: false }], monday, "17:00")).toBe(true);
    expect(availableAt([{ weekday: 1, from: "00:00", to: "23:59", available: false }], monday, "17:00")).toBe(false);
    expect(availableAt([{ weekday: 1, from: "10:00", to: "15:00", available: true }], monday, "17:00")).toBe(false);
    expect(availableAt([{ weekday: 1, from: "16:00", to: "23:59", available: true }], monday, "17:00")).toBe(true);
    expect(onTimeOff([{ from: "2026-10-10", to: "2026-10-12", status: "approved" }], monday)).toBe(true);
    expect(onTimeOff([{ from: "2026-10-10", to: "2026-10-12", status: "pending" }], monday)).toBe(false);
    expect(onTimeOff([{ from: "2026-10-13", to: "2026-10-14", status: "approved" }], monday)).toBe(false);
  });
});

describe("side-work limit for tipped positions (NY)", () => {
  it("adds estimated minutes", () => {
    const templates = [{ items: [{ estimatedMin: 10 }, { estimatedMin: 20 }, {}] }, { items: [{ estimatedMin: 5 }] }];
    expect(nonTippedMinutes(templates)).toBe(35);
    expect(nonTippedMinutes(templates, [[1], []])).toBe(20);
    expect(nonTippedMinutes(templates, [[9]])).toBe(5);
  });
  it("flags more than 2 hours or 20 % of the shift", () => {
    expect(DEFAULT_SIDE_WORK_LIMIT).toEqual({ maxMinutes: 120, maxPct: 20 });
    expect(overSideWorkLimit(0, 400)).toBe(false);
    expect(overSideWorkLimit(121, 1000)).toBe(true);
    expect(overSideWorkLimit(90, 400)).toBe(true);
    expect(overSideWorkLimit(60, 400)).toBe(false);
    expect(overSideWorkLimit(60, 0)).toBe(false);
    expect(overSideWorkLimit(30, 100, { maxMinutes: 120, maxPct: 50 })).toBe(false);
  });
});
