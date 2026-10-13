import { describe, expect, it } from "vitest";
import { adjustmentProblem, approverFor, canSeePay, canSwitchOn, rateOn, toPayrollCsv } from "../lib/domain/pay";
import { readRate, recipients } from "../lib/domain/messages";
import { ALCOHOL_ROLES, can, canSeeVenue, isFloorServiceRole, isManagerial, isStaffRole, ROLES, staffRoles } from "../lib/domain/permissions";
import { afterFailedLogin, hashPassword, isUsername, LOCKOUT_MS, MAX_FAILED_LOGINS, normalizeUsername, passwordProblem, tempPassword, verifyPassword } from "../lib/domain/password";
import { formatSubject, parseSubject, sessionMatches } from "../lib/domain/session";

describe("pay (ADR 0017)", () => {
  it("only the owner and the person see a rate", () => {
    expect(canSeePay({ id: "o", role: "owner" }, "u")).toBe(true);
    expect(canSeePay({ id: "d", role: "dev" }, "u")).toBe(true);
    expect(canSeePay({ id: "u", role: "server" }, "u")).toBe(true);
    expect(canSeePay({ id: "m", role: "manager" }, "u")).toBe(false);
  });

  it("the approver sits above the proposer", () => {
    expect(approverFor("captain")).toBe("manager");
    expect(approverFor("manager")).toBe("owner");
    expect(approverFor("owner")).toBe("owner");
    expect(approverFor("dev")).toBe("owner");
    expect(approverFor("server")).toBeNull();
  });

  it("never self-approval; manager for captains; owner for anything", () => {
    expect(canSwitchOn({ id: "a", role: "manager" }, { proposedBy: "a", proposerRole: "manager" })).toBe("SELF_APPROVAL");
    expect(canSwitchOn({ id: "m", role: "manager" }, { proposedBy: "c", proposerRole: "captain" })).toBeNull();
    expect(canSwitchOn({ id: "m", role: "manager" }, { proposedBy: "m2", proposerRole: "manager" })).toBe("PAY_FORBIDDEN");
    expect(canSwitchOn({ id: "o", role: "owner" }, { proposedBy: "m", proposerRole: "manager" })).toBeNull();
    expect(canSwitchOn({ id: "c", role: "captain" }, { proposedBy: "c2", proposerRole: "captain" })).toBe("PAY_FORBIDDEN");
  });

  it("no deductions tied to a warning or a mistake", () => {
    expect(adjustmentProblem({ kind: "bonus", amountCents: 5000, reason: "Great month" })).toBeNull();
    expect(adjustmentProblem({ kind: "bonus", amountCents: -5000, reason: "x" })).toBe("NO_DEDUCTIONS");
    expect(adjustmentProblem({ kind: "correction", amountCents: -500, reason: "Rate typed as 19 instead of 18" })).toBeNull();
    expect(adjustmentProblem({ kind: "correction", amountCents: -500, reason: "Penalty for a broken glass" })).toBe("NO_DEDUCTIONS");
    expect(adjustmentProblem({ kind: "correction", amountCents: -500, reason: "Rate fix", warningId: "w1" })).toBe("NO_DEDUCTIONS");
    expect(adjustmentProblem({ kind: "bonus", amountCents: 0, reason: "x" })).toBe("INVALID_INPUT");
    expect(adjustmentProblem({ kind: "bonus", amountCents: 1.5, reason: "x" })).toBe("INVALID_INPUT");
    expect(adjustmentProblem({ kind: "bonus", amountCents: 100, reason: "  " })).toBe("INVALID_INPUT");
  });

  it("finds the rate in effect on a date", () => {
    const rows = [
      { effectiveFrom: "2026-01-01", rateCents: 1700 },
      { effectiveFrom: "2026-06-01", rateCents: 1800 },
      { effectiveFrom: "2026-12-01", rateCents: 1900 },
    ];
    expect(rateOn(rows, "2026-10-13")?.rateCents).toBe(1800);
    expect(rateOn(rows, "2025-12-31")).toBeNull();
  });

  it("writes a safe CSV for the payroll provider", () => {
    const csv = toPayrollCsv([
      { name: "Ana, P", username: "ana.p", kind: "bonus", amountCents: 10000, reason: 'Said "great"', approvedAt: "2026-10-08" },
      { name: "=cmd()", username: "x", kind: "award", amountCents: 5050, reason: "Line\nbreak", approvedAt: "2026-10-09" },
    ]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("name,username,kind,amount_usd,reason,approved_at");
    expect(lines[1]).toBe('"Ana, P",ana.p,bonus,100.00,"Said ""great""",2026-10-08');
    expect(csv).toContain("'=cmd()");
    expect(csv).toContain("50.50");
    expect(csv.endsWith("\r\n")).toBe(true);
  });
});

describe("messages audience", () => {
  const users = [
    { _id: "a", role: "server" as const, active: true },
    { _id: "b", role: "bartender" as const, active: true },
    { _id: "c", role: "server" as const, active: false },
    { _id: "d", role: "dev" as const, active: true },
    { _id: "m", role: "manager" as const, active: true },
    { _id: "x", role: "server" as const, active: true },
  ];
  const assignments = [
    { userId: "a", venueId: "v1" },
    { userId: "b", venueId: "v1" },
    { userId: "c", venueId: "v1" },
    { userId: "d", venueId: "v1" },
    { userId: "m", venueId: "v1" },
    { userId: "x", venueId: "v2" },
  ];
  it("resolves venue and role, never the sender, inactive or dev accounts", () => {
    expect(recipients({ venueIds: ["v1"] }, users, assignments, "m").sort()).toEqual(["a", "b"]);
    expect(recipients({ venueIds: ["v1"], roles: ["server"] }, users, assignments)).toEqual(["a"]);
    expect(recipients({ venueIds: ["v1", "v2"], roles: [] }, users, assignments).sort()).toEqual(["a", "b", "m", "x"]);
  });
  it("read rate", () => {
    expect(readRate([{ readAt: 1 }, {}, { readAt: 2 }, {}], 4)).toBe(50);
    expect(readRate([], 0)).toBeNull();
  });
});

describe("permissions", () => {
  it("owner and dev can do everything; staff only their set", () => {
    expect(can("owner", "audit.read")).toBe(true);
    expect(can("dev", "pay.records")).toBe(true);
    expect(can("server", "requests.voidcomp")).toBe(true);
    expect(can("busser", "requests.voidcomp")).toBe(false);
    expect(can("captain", "warnings.log")).toBe(true);
    expect(can("captain", "warnings.void")).toBe(false);
    expect(can("manager", "warnings.void")).toBe(true);
    expect(can("kitchen", "notes.kitchen")).toBe(true);
    expect(can("manager", "pay.records")).toBe(false);
    expect(ROLES).toContain("barback");
  });
  it("venue scope", () => {
    expect(canSeeVenue({ role: "owner", venueIds: [] }, "v1")).toBe(true);
    expect(canSeeVenue({ role: "dev", venueIds: [] }, "v1")).toBe(true);
    expect(canSeeVenue({ role: "server", venueIds: ["v1"] }, "v1")).toBe(true);
    expect(canSeeVenue({ role: "manager", venueIds: ["v1"] }, "v2")).toBe(false);
  });
  it("who a role may create", () => {
    expect(staffRoles("owner")).toContain("manager");
    expect(staffRoles("dev")).toContain("owner");
    expect(staffRoles("manager")).not.toContain("manager");
    expect(staffRoles("manager")).toContain("captain");
    expect(staffRoles("captain")).toEqual([]);
  });
  it("role helpers", () => {
    expect(isStaffRole("runner")).toBe(true);
    expect(isStaffRole("manager")).toBe(false);
    expect(isManagerial("manager")).toBe(true);
    expect(isManagerial("captain")).toBe(false);
    expect(isFloorServiceRole("server")).toBe(true);
    expect(isFloorServiceRole("kitchen")).toBe(false);
    expect(ALCOHOL_ROLES).toEqual(["bartender", "barback"]);
  });
});

describe("password (ADR 0003)", () => {
  it("hashes and verifies with PBKDF2", async () => {
    const h = await hashPassword("correct horse", 1000);
    expect(h.startsWith("pbkdf2$1000$")).toBe(true);
    expect(await verifyPassword("correct horse", h)).toBe(true);
    expect(await verifyPassword("wrong horse", h)).toBe(false);
    expect(await verifyPassword("x", undefined)).toBe(false);
    expect(await verifyPassword("x", "md5$1$a$b")).toBe(false);
    expect(await verifyPassword("x", "pbkdf2$0$a$b")).toBe(false);
    expect(await verifyPassword("correct horse", h.slice(0, -2))).toBe(false);
  });
  it("normalizes and validates usernames and lengths", () => {
    expect(normalizeUsername("  Ana.P ")).toBe("ana.p");
    expect(isUsername("ana.p")).toBe(true);
    expect(isUsername("a")).toBe(false);
    expect(passwordProblem("short")).toBe("short");
    expect(passwordProblem("x".repeat(200))).toBe("long");
    expect(passwordProblem("long enough")).toBeNull();
  });
  it("locks after five failures", () => {
    expect(afterFailedLogin(0, 1000)).toEqual({ failedLogins: 1 });
    expect(afterFailedLogin(MAX_FAILED_LOGINS - 1, 1000)).toEqual({ failedLogins: 0, lockedUntil: 1000 + LOCKOUT_MS });
  });
  it("temporary passwords are three easy parts", () => {
    expect(tempPassword()).toMatch(/^[a-z]+-[a-z]+-\d{2}$/);
  });
});

describe("session subjects", () => {
  it("round-trips user and email subjects", () => {
    expect(parseSubject(formatSubject({ kind: "user", username: "ana.p", version: 3 }))).toEqual({ kind: "user", username: "ana.p", version: 3 });
    expect(parseSubject(formatSubject({ kind: "email", email: "M@X.COM", version: 0 }))).toEqual({ kind: "email", email: "m@x.com", version: 0 });
  });
  it("rejects malformed subjects", () => {
    expect(parseSubject("user|ana")).toBeNull();
    expect(parseSubject("user||1")).toBeNull();
    expect(parseSubject("user|ana|-1")).toBeNull();
    expect(parseSubject("guest|g|1")).toBeNull();
  });
  it("matches the stored version", () => {
    expect(sessionMatches(2, { version: 2 })).toBe(true);
    expect(sessionMatches(undefined, { version: 0 })).toBe(true);
    expect(sessionMatches(3, { version: 2 })).toBe(false);
  });
});
