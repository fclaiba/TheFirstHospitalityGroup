import { beforeEach, describe, expect, it } from "vitest";
import { World } from "./support/engine";
import { addDays, nyDateKey } from "../lib/time";
import { weekOf } from "../lib/domain/schedule";
import { DEFAULT_ROLE_MAP, mapRole, parseCsv, parseDate, parseExport, parseTime, primaryOf, usernameFor } from "../lib/domain/sevenShifts";

// 7shifts migration (BLUEPRINT 7.6, 16.2 Sprint 4): pure parsing, then the dry run and apply over the real handlers.

describe("7shifts CSV parsing", () => {
  it("parses quoted fields, doubled quotes, CRLF and a BOM", () => {
    expect(parseCsv('﻿a,"b, c","say ""hi"""\r\n1,2,3\n\n')).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["1", "2", "3"],
    ]);
    expect(parseCsv('x,"line\nbreak"')).toEqual([["x", "line\nbreak"]]);
  });

  it("maps 7shifts roles to positions, with a custom map first and managers of the company never", () => {
    expect(mapRole("Back Waiter")).toBe("busser");
    expect(mapRole("  food runner ")).toBe("runner");
    expect(mapRole("head_bartender")).toBe("head_bartender");
    expect(mapRole("Floor Staff", { "floor staff": "server" })).toBe("server");
    expect(mapRole("Owner")).toBeNull();
    expect(mapRole("Valet")).toBeNull();
    expect(mapRole("")).toBeNull();
    expect(Object.values(DEFAULT_ROLE_MAP)).not.toContain("owner");
  });

  it("reads dates and times in the usual export formats", () => {
    expect(parseDate("2026-10-19")).toBe("2026-10-19");
    expect(parseDate("10/9/2026")).toBe("2026-10-09");
    expect(parseDate("10/19/26")).toBe("2026-10-19");
    expect(parseDate("Oct 19")).toBeNull();
    expect(parseTime("5:00 PM")).toBe("17:00");
    expect(parseTime("12am")).toBe("00:00");
    expect(parseTime("12:30pm")).toBe("12:30");
    expect(parseTime("17:45")).toBe("17:45");
    expect(parseTime("25:00")).toBeNull();
    expect(parseTime("13pm")).toBeNull();
    expect(parseTime("9:75")).toBeNull();
  });

  it("builds people with every position they worked, shifts, unknown roles and line errors", () => {
    const csv = [
      "First Name,Last Name,Email,Role,Date,Start Time,End Time",
      "Ana,Pérez,,Server,10/19/2026,4:00 PM,",
      "Ana,Pérez,,Captain,10/20/2026,4:00 PM,11:30 PM",
      "Ana,Pérez,,Server,10/21/2026,4:00 PM,",
      "Bo,Lee,bo@x.com,Valet,10/19/2026,5pm,",
      ",,,Server,10/19/2026,5pm,",
      "Cy,Dunn,,Busser,someday,5pm,",
      "Di,Fox,DI@X.COM,Runner,,,",
    ].join("\n");
    const r = parseExport(csv);
    expect(r.people.map((p) => p.name)).toEqual(["Ana Pérez", "Cy Dunn", "Di Fox"]);
    const ana = r.people[0]!;
    expect(ana.positions).toEqual(["server", "captain"]);
    expect(primaryOf(ana, r.shifts)).toBe("server");
    expect(r.people[2]!.email).toBe("di@x.com");
    expect(r.shifts).toHaveLength(3);
    expect(r.shifts[1]).toEqual({ personKey: "ana pérez", position: "captain", date: "2026-10-20", start: "16:00", end: "23:30" });
    expect(r.unknownRoles).toEqual(["Valet"]);
    expect(r.errors.map((e) => [e.line, e.message])).toEqual([
      [5, "unknown_role"],
      [6, "missing_name"],
      [7, "bad_date_or_time"],
    ]);
  });

  it("reports missing columns and empty files", () => {
    expect(parseExport("").errors[0]!.message).toBe("empty");
    expect(parseExport("Email,Role\nx@y.com,Server").errors[0]!.message).toBe("missing_name_column");
    expect(parseExport("Name,Date\nAna,2026-10-19").errors[0]!.message).toBe("missing_role_column");
  });

  it("makes unique usernames from names", () => {
    const taken = new Set(["maria.l"]);
    expect(usernameFor("María López", taken)).toBe("maria.l2");
    expect(usernameFor("María Luna", taken)).toBe("maria.l3");
    expect(usernameFor("Bo", taken)).toBe("box"); // usernames have at least 3 characters
    expect(usernameFor("Bo", taken)).toBe("box2");
    expect(usernameFor("Al", new Set())).toBe("alx");
  });
});

describe("imports:sevenShifts", () => {
  let w: World;
  beforeEach(async () => {
    w = await World.create();
  }, 30_000);

  const monday = () => addDays(weekOf(nyDateKey(Date.now())), 14);
  const csv = () =>
    [
      "Name,Email,Role,Date,Start,End",
      `Ana Pérez,,Server,${monday()},16:00,`,
      `Rita Moreno,rita@example.com,Back Waiter,${monday()},16:00,23:00`,
      `Rita Moreno,rita@example.com,Food Runner,${addDays(monday(), 1)},16:00,`,
      `Ana Pérez,,Bartender,${addDays(monday(), 2)},16:00,`,
      `Zed Ray,,Valet,${monday()},16:00,`,
    ].join("\n");

  it("is for the owner only", async () => {
    await w.as("maria.m");
    expect(await w.code("imports:sevenShifts", { venueId: w.venue("v1")._id, csv: csv(), apply: false })).toBe("FORBIDDEN");
    await w.as("victor.h");
    expect(await w.code("imports:sevenShifts", { venueId: w.venue("v1")._id, csv: csv(), apply: false })).toBe("FORBIDDEN");
  });

  it("a dry run reports and writes nothing", async () => {
    await w.as("owner");
    const users = w.rows("users").length;
    const r = await w.m<{ applied: boolean; report: { people: { new: number; existing: number }; shifts: number; unknownRoles: string[]; errors: Array<{ message: string }> } }>("imports:sevenShifts", { venueId: w.venue("v1")._id, csv: csv(), apply: false });
    expect(r.applied).toBe(false);
    expect(r.report.people).toMatchObject({ new: 1, existing: 1 });
    // Ana is not enabled as a bartender: that shift is reported, not imported.
    expect(r.report.shifts).toBe(3);
    expect(r.report.unknownRoles).toEqual(["Valet"]);
    expect(r.report.errors.some((e) => e.message.startsWith("not_enabled:Ana"))).toBe(true);
    expect(w.rows("users").length).toBe(users);
  });

  it("apply creates accounts with temporary passwords, assignments and a draft week, audited", async () => {
    await w.as("owner");
    const r = await w.m<{ applied: boolean; accounts: Array<{ username: string; tempPassword: string }>; importId: string }>("imports:sevenShifts", { venueId: w.venue("v1")._id, csv: csv(), apply: true });
    expect(r.applied).toBe(true);
    expect(r.accounts.map((a) => a.username)).toEqual(["rita.m"]);
    const rita = w.user("rita.m");
    expect(rita).toMatchObject({ primaryPosition: "busser", enabledPositions: ["runner"], mustChangePassword: true, email: "rita@example.com" });
    expect(rita.passwordHash).not.toContain(r.accounts[0]!.tempPassword);
    expect(w.rows("assignments").some((a) => a.userId === rita._id && a.venueId === w.venue("v1")._id)).toBe(true);
    const week = w.rows("scheduleWeeks").find((x) => x.weekStart === monday() && x.venueId === w.venue("v1")._id)!;
    expect(week.status).toBe("draft");
    expect(w.rows("shiftsPlanned").filter((s) => s.weekId === week._id)).toHaveLength(3);
    expect(w.rows("auditLogs").some((a) => a.action === "import.applied")).toBe(true);
    expect((await w.q<unknown[]>("imports:history", {})).length).toBe(1);
  });

  it("rejects a role map to the owner", async () => {
    await w.as("owner");
    expect(await w.code("imports:sevenShifts", { venueId: w.venue("v1")._id, csv: csv(), roleMap: [{ role: "Valet", position: "owner" }], apply: false })).toBe("INVALID_INPUT");
  });
});
