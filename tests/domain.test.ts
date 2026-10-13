import { describe, expect, it } from "vitest";
import { appliesOn, buildRun, canCheck, isComplete, isLate, itemsFor, nextItem, onTimeRate, runProgress, templateFor } from "../lib/domain/tasks";
import { needsAck, nextVersion, setsFor, slugKey } from "../lib/domain/rules";
import { AUTO_CLOSE_AFTER_MS, currentService, isLive, NOTIFY_AFTER_MS, runsOn, serviceWindow, sweepAction, transition } from "../lib/domain/shift";
import { missingTranslations, pickLocalized } from "../lib/domain/i18n";
import { addDays, formatNyTime, nyDateKey, nyTimeOn, nyWallParts, parseDateKey, weekdayOf } from "../lib/time";
import { ago, clock, dateKeyLabel, dateLong, dateShort, time } from "../lib/format";
import type { TemplateItem, VenueService } from "../lib/domain/types";

// BLUEPRINT 15: every pure function in section 14 is tested (tasks, rules, shift, i18n, time, format).

const item = (p: Partial<TemplateItem> = {}): TemplateItem => ({ label: { en: "x", es: "x" }, photoRequired: false, critical: false, ...p });

describe("tasks (side work)", () => {
  it("measures progress, completion and the next item", () => {
    const run = { items: [{ done: true }, { done: false }, { done: false }] };
    expect(runProgress(run)).toEqual({ done: 1, total: 3, pct: 33 });
    expect(runProgress({ items: [] })).toEqual({ done: 0, total: 0, pct: 100 });
    expect(isComplete(run)).toBe(false);
    expect(isComplete({ items: [{ done: true }] })).toBe(true);
    expect(nextItem(run)).toBe(1);
    expect(nextItem({ items: [{ done: true }] })).toBeNull();
  });

  it("is late only for open runs past due, never when excused or done on time", () => {
    expect(isLate({ items: [], dueAt: 100 }, 200)).toBe(true);
    expect(isLate({ items: [], dueAt: 100 }, 50)).toBe(false);
    expect(isLate({ items: [], dueAt: 100, completedAt: 90 }, 500)).toBe(false);
    expect(isLate({ items: [], dueAt: 100, completedAt: 120 }, 500)).toBe(true);
    expect(isLate({ items: [], dueAt: 100, excused: { by: "m", reason: "r" } }, 500)).toBe(false);
  });

  it("decides which templates apply on a NY date and service (weekly Monday clean)", () => {
    const monday = "2026-10-12";
    expect(weekdayOf(monday)).toBe(1);
    expect(appliesOn({ schedule: { kind: "every_shift" } }, monday, "dinner")).toBe(true);
    expect(appliesOn({ schedule: { kind: "weekly", weekdays: [1] } }, monday, "dinner")).toBe(true);
    expect(appliesOn({ schedule: { kind: "weekly", weekdays: [2] } }, monday, "dinner")).toBe(false);
    expect(appliesOn({ schedule: { kind: "weekly", weekdays: [1], services: ["lunch"] } }, monday, "dinner")).toBe(false);
    expect(appliesOn({ schedule: { kind: "weekly", weekdays: [1], services: [] } }, monday, "dinner")).toBe(true);
  });

  it("matches templates to the position worked and the person's sections", () => {
    expect(templateFor({ positions: ["server", "captain"] }, { position: "server" })).toBe(true);
    expect(templateFor({ positions: ["server"] }, { position: "busser" })).toBe(false);
    expect(templateFor({ positions: ["server"], sectionId: "a" }, { position: "server" })).toBe(false);
    expect(templateFor({ positions: ["server"], sectionId: "a" }, { position: "server", sectionIds: ["b"] })).toBe(false);
    expect(templateFor({ positions: ["server"], sectionId: "a" }, { position: "server", sectionIds: ["b", "a"] })).toBe(true);
  });

  it("builds runs with every item, anchored to the phase", () => {
    const items = [item(), item({ estimatedMin: 10 }), item({ photoRequired: true })];
    expect(itemsFor(items)).toEqual([0, 1, 2]);
    const shift = { startsAt: 1_000_000, endsAt: 2_000_000 };
    const open = buildRun({ _id: "t", phase: "open", version: 3, items, dueOffsetMin: -10 }, shift)!;
    expect(open.dueAt).toBe(1_000_000 - 600_000);
    expect(open.itemIndexes).toEqual([0, 1, 2]);
    expect(open.items).toEqual([{ done: false }, { done: false }, { done: false }]);
    expect(open.templateVersion).toBe(3);
    expect(open.templateId).toBe("t");
    const close = buildRun({ _id: "t", phase: "close", version: 1, items, dueOffsetMin: 60 }, shift)!;
    expect(close.dueAt).toBe(2_000_000 + 3_600_000);
    expect(buildRun({ _id: "t", phase: "open", version: 1, items: [], dueOffsetMin: 0 }, shift)).toBeNull();
  });

  it("asks for a photo before ticking an evidence item", () => {
    const run = { items: [{ done: false }, { done: false, photoId: "p" }] };
    expect(canCheck(run, 0, item({ photoRequired: true }), true)).toBe("PHOTO_REQUIRED");
    expect(canCheck(run, 0, item({ photoRequired: true }), true, "p2")).toBeNull();
    expect(canCheck(run, 1, item({ photoRequired: true }), true)).toBeNull();
    expect(canCheck(run, 0, item({ photoRequired: true }), false)).toBeNull();
    expect(canCheck(run, 5, item(), true)).toBe("NOT_FOUND");
    expect(canCheck(run, -1, item(), true)).toBe("NOT_FOUND");
    expect(canCheck(run, 0, undefined, true)).toBe("NOT_FOUND");
  });

  it("computes the internal on-time rate of due runs", () => {
    const now = 1000;
    expect(onTimeRate([], now)).toBeNull();
    expect(onTimeRate([{ items: [], dueAt: 2000 }], now)).toBeNull();
    const runs = [
      { items: [], dueAt: 500, completedAt: 400 },
      { items: [], dueAt: 500, completedAt: 600 },
      { items: [], dueAt: 500, excused: { by: "m", reason: "r" } },
      { items: [], dueAt: 900 },
    ];
    expect(onTimeRate(runs, now)).toBe(50);
  });
});

describe("rules (company, venue and position scopes)", () => {
  const sets = [
    { _id: "c", scope: "company" as const, version: 1 },
    { _id: "v1s", scope: "venue" as const, venueId: "v1", version: 1 },
    { _id: "ps", scope: "position" as const, position: "server" as const, version: 1 },
    { _id: "psv", scope: "position" as const, position: "server" as const, venueId: "v1", version: 2 },
    { _id: "pc", scope: "position" as const, position: "captain" as const, version: 1 },
  ];

  it("collects the company set, the venue set and the set of every position the person works", () => {
    expect(setsFor(sets, ["server", "captain"], "v1").map((s) => s._id)).toEqual(["c", "v1s", "psv", "pc"]);
    expect(setsFor(sets, ["server"], "v2").map((s) => s._id)).toEqual(["c", "ps"]);
    expect(setsFor(sets, ["server"], undefined).map((s) => s._id)).toEqual(["c", "ps"]);
    expect(setsFor(sets, ["busser"], "v2").map((s) => s._id)).toEqual(["c"]);
    expect(setsFor([], ["server"], "v1")).toEqual([]);
    // The same set is never listed twice.
    expect(setsFor(sets, ["server", "server"], "v1").map((s) => s._id)).toEqual(["c", "v1s", "psv"]);
  });

  it("needs an acknowledgment of the current version", () => {
    const set = { _id: "c", scope: "company" as const, version: 2 };
    expect(needsAck(null, [])).toBe(false);
    expect(needsAck(set, [])).toBe(true);
    expect(needsAck(set, [{ setId: "c", version: 1 }])).toBe(true);
    expect(needsAck(set, [{ setId: "c", version: 2 }])).toBe(false);
    expect(needsAck(set, [{ setId: "v", version: 9 }])).toBe(true);
  });

  it("versions and keys", () => {
    expect(nextVersion(null)).toBe(1);
    expect(nextVersion({ version: 4 })).toBe(5);
    expect(slugKey("Check ID before serving alcohol!")).toBe("check-id-before-serving-alcohol");
    expect(slugKey("Confirma las alergias, ¡ya!")).toBe("confirma-las-alergias-ya");
    expect(slugKey("!!!")).toBe("rule");
  });
});

describe("shift lifecycle", () => {
  it("allows only the documented transitions", () => {
    expect(transition("scheduled", "open")).toBe("open");
    expect(transition("open", "start_closing")).toBe("closing");
    expect(transition("closing", "close")).toBe("closed");
    expect(transition("open", "auto_close")).toBe("closed");
    expect(transition("closing", "auto_close")).toBe("closed");
    expect(transition("open", "close")).toBe("INVALID_TRANSITION");
    expect(transition("closed", "open")).toBe("INVALID_TRANSITION");
    expect(isLive("open")).toBe(true);
    expect(isLive("closing")).toBe(true);
    expect(isLive("closed")).toBe(false);
    expect(isLive("scheduled")).toBe(false);
  });

  const services: VenueService[] = [
    { key: "lunch", weekdays: [2, 3, 4, 5], startsAt: "11:30", endsAt: "15:00", preShiftMin: 30 },
    { key: "dinner", weekdays: [], startsAt: "17:00", endsAt: "23:00", preShiftMin: 30 },
    { key: "late", weekdays: [3], startsAt: "23:30", endsAt: "02:00", preShiftMin: 15 },
  ];

  it("computes service windows in New York time, across midnight and DST", () => {
    const w = serviceWindow(services, "2026-07-01", "dinner")!;
    expect(new Date(w.startsAt).toISOString()).toBe("2026-07-01T21:00:00.000Z"); // EDT, UTC-4
    expect(w.endsAt - w.startsAt).toBe(6 * 3600_000);
    const winter = serviceWindow(services, "2026-01-15", "dinner")!;
    expect(new Date(winter.startsAt).toISOString()).toBe("2026-01-15T22:00:00.000Z"); // EST, UTC-5
    const late = serviceWindow(services, "2026-07-01", "late")!;
    expect(late.endsAt - late.startsAt).toBe(2.5 * 3600_000);
    expect(serviceWindow(services.slice(0, 1), "2026-07-01", "dinner")).toBeNull();
  });

  it("knows which services run on a weekday (empty list means every day)", () => {
    const monday = "2026-10-12";
    expect(runsOn(services[0]!, monday)).toBe(false);
    expect(runsOn(services[0]!, "2026-10-13")).toBe(true);
    expect(runsOn(services[1]!, monday)).toBe(true);
  });

  it("finds the running or next service among those that run that day", () => {
    const wednesday = "2026-07-01";
    const lunch = serviceWindow(services, wednesday, "lunch")!;
    expect(currentService(services, wednesday, lunch.startsAt - 3600_000)).toBe("lunch");
    expect(currentService(services, wednesday, lunch.endsAt + 60_000)).toBe("dinner");
    const dinnerEnd = serviceWindow(services, wednesday, "dinner")!.endsAt;
    expect(currentService(services, wednesday, dinnerEnd + 1)).toBe("late");
    expect(currentService(services.slice(0, 2), wednesday, dinnerEnd + 1)).toBeNull();
    // Monday: no lunch, so the morning points to dinner.
    const monday = "2026-10-12";
    expect(currentService(services, monday, nyTimeOn(monday, "09:00"))).toBe("dinner");
  });

  it("sweeps forgotten shifts: notify at +4 h once, auto-close at +8 h", () => {
    const end = 1_000_000_000;
    expect(sweepAction({ status: "open", endsAt: end }, end + 1)).toBeNull();
    expect(sweepAction({ status: "open", endsAt: end }, end + NOTIFY_AFTER_MS)).toBe("notify");
    expect(sweepAction({ status: "closing", endsAt: end, sweepNotifiedAt: 1 }, end + NOTIFY_AFTER_MS)).toBeNull();
    expect(sweepAction({ status: "closing", endsAt: end, sweepNotifiedAt: 1 }, end + AUTO_CLOSE_AFTER_MS)).toBe("auto_close");
    expect(sweepAction({ status: "closed", endsAt: end }, end + AUTO_CLOSE_AFTER_MS)).toBeNull();
  });
});

describe("i18n content", () => {
  it("picks the language and falls back to the other one", () => {
    expect(pickLocalized({ en: "Hello", es: "Hola" }, "es")).toBe("Hola");
    expect(pickLocalized({ en: "Hello", es: " " }, "es")).toBe("Hello");
    expect(pickLocalized({ en: "", es: "Hola" }, "en")).toBe("Hola");
    expect(pickLocalized(undefined, "en")).toBe("");
  });
  it("finds missing translations anywhere in content", () => {
    expect(missingTranslations({ name: { en: "A", es: "B" } })).toEqual([]);
    expect(missingTranslations({ name: { en: "A", es: "" }, items: [{ label: { en: "", es: "x" } }] })).toEqual(["name", "items[0].label"]);
    expect(missingTranslations({ en: "", es: "x" })).toEqual(["."]);
    expect(missingTranslations("text")).toEqual([]);
    expect(missingTranslations(null)).toEqual([]);
  });
});

describe("New York time", () => {
  it("formats date keys and walks the calendar", () => {
    expect(nyDateKey(Date.UTC(2026, 9, 13, 3, 0))).toBe("2026-10-12"); // 11 pm in New York
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(parseDateKey("2026-10-13")).toEqual({ year: 2026, month: 10, day: 13 });
    expect(() => parseDateKey("13/10/2026")).toThrow();
    expect(nyWallParts(Date.UTC(2026, 6, 1, 4, 30)).hour).toBe(0);
    expect(new Date(nyTimeOn("2026-07-01", "25:30")).toISOString()).toBe("2026-07-02T05:30:00.000Z");
    expect(() => nyTimeOn("2026-07-01", "noon")).toThrow();
    expect(formatNyTime(Date.UTC(2026, 6, 1, 21, 0))).toMatch(/^5:00\sPM$/u);
  });
});

describe("display formatting (no money)", () => {
  const at = Date.UTC(2026, 6, 1, 21, 0); // 5 pm in New York
  it("formats times and dates in New York in both languages", () => {
    expect(time("en", at)).toMatch(/^5:00\sPM$/u);
    expect(time("es", at)).toMatch(/5:00/);
    expect(dateShort("en", at)).toContain("Jul");
    expect(dateLong("en", at)).toContain("July");
    expect(dateKeyLabel("en", "2026-07-01")).toContain("Jul 1");
    expect(dateKeyLabel("en", "2026-07-01", true)).toContain("Wednesday");
    expect(dateKeyLabel("es", "2026-07-01").toLowerCase()).toContain("jul");
  });
  it("words elapsed time and shows past-midnight clock times", () => {
    const t = (k: string, v?: Record<string, string | number>) => `${k}${v ? `:${v.n}` : ""}`;
    const now = 10_000_000;
    expect(ago(t, now - 10_000, now)).toBe("common.now");
    expect(ago(t, now - 5 * 60_000, now)).toBe("common.minutesAgo:5");
    expect(ago(t, now - 3 * 3600_000, now)).toBe("common.hoursAgo:3");
    expect(ago(t, now - 2 * 86_400_000, now)).toBe("common.daysAgo:2");
    expect(ago(t, now + 5000, now)).toBe("common.now");
    expect(clock("26:00")).toBe("02:00");
    expect(clock("17:30")).toBe("17:30");
  });
});
