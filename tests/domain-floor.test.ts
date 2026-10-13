import { describe, expect, it } from "vitest";
import {
  ESCALATE_AFTER_MS,
  canDecide,
  canRequest,
  escalationDue,
  escalationRecipients,
  initialStatus,
  isApproval,
  isOpenStatus,
  routeRequest,
  transition,
} from "../lib/domain/requests";
import type { RosterEntry } from "../lib/domain/requests";
import { NOTE_MAX, kitchenNeeds, noteProblem, purgeDue } from "../lib/domain/tableNotes";

const roster: RosterEntry[] = [
  { userId: "server", role: "server", sectionIds: ["B"], onDuty: true },
  { userId: "runnerB", role: "runner", sectionIds: ["B"], onDuty: true },
  { userId: "busserB", role: "busser", sectionIds: ["B"], onDuty: true },
  { userId: "runnerA", role: "runner", sectionIds: ["A"], onDuty: true },
  { userId: "busserMuted", role: "busser", sectionIds: ["A"], onDuty: true, muted: true },
  { userId: "busserOff", role: "busser", sectionIds: ["B"], onDuty: false },
  { userId: "captain", role: "captain", sectionIds: ["C"], onDuty: true },
  { userId: "manager", role: "manager", sectionIds: [], onDuty: true },
];

describe("routeRequest", () => {
  it("sends water and clear to the section's runners and bussers on duty", () => {
    expect(routeRequest("water", "B", roster, "server")).toEqual(["runnerB", "busserB"]);
    expect(routeRequest("clear", "A", roster, "server")).toEqual(["runnerA"]);
  });
  it("falls back to every unmuted receiver when the section has none or is unknown", () => {
    expect(routeRequest("water", "C", roster, "server")).toEqual(["runnerB", "busserB", "runnerA"]);
    expect(routeRequest("water", undefined, roster, "server")).toEqual(["runnerB", "busserB", "runnerA"]);
  });
  it("never routes to the requester", () => {
    expect(routeRequest("water", "B", roster, "runnerB")).toEqual(["busserB"]);
    expect(routeRequest("help", undefined, roster, "captain")).toEqual(["manager"]);
  });
  it("sends help to captains and managers and approvals to managers", () => {
    expect(routeRequest("help", "B", roster, "server")).toEqual(["captain", "manager"]);
    expect(routeRequest("comp", "B", roster, "server")).toEqual(["manager"]);
    expect(routeRequest("void", "B", roster, "manager")).toEqual([]);
  });
});

describe("escalation", () => {
  it("widens water to the venue's receivers and the manager, help to the leads", () => {
    expect(escalationRecipients("water", roster, "server")).toEqual(["runnerB", "busserB", "runnerA", "busserMuted", "manager"]);
    expect(escalationRecipients("help", roster, "server")).toEqual(["captain", "manager"]);
  });
  it("is due at 90 s for an open, unescalated service request only", () => {
    const at = 1_000_000;
    const base = { status: "open" as const, kind: "water" as const, at };
    expect(escalationDue(base, at + ESCALATE_AFTER_MS - 1)).toBe(false);
    expect(escalationDue(base, at + ESCALATE_AFTER_MS)).toBe(true);
    expect(escalationDue({ ...base, escalatedAt: at + 1 }, at + 200_000)).toBe(false);
    expect(escalationDue({ ...base, status: "claimed" }, at + 200_000)).toBe(false);
    expect(escalationDue({ ...base, kind: "comp", status: "pending" }, at + 200_000)).toBe(false);
  });
});

describe("request lifecycle", () => {
  it("starts service requests open and approvals pending", () => {
    expect(initialStatus("water")).toBe("open");
    expect(initialStatus("help")).toBe("open");
    expect(initialStatus("void")).toBe("pending");
    expect(isApproval("comp")).toBe(true);
    expect(isApproval("clear")).toBe(false);
  });
  it("allows only the documented transitions", () => {
    expect(transition("open", "claim")).toBe("claimed");
    expect(transition("claimed", "claim")).toBe("REQUEST_CLOSED");
    expect(transition("open", "done")).toBe("done");
    expect(transition("claimed", "done")).toBe("done");
    expect(transition("done", "done")).toBe("REQUEST_CLOSED");
    expect(transition("pending", "approve")).toBe("approved");
    expect(transition("pending", "deny")).toBe("denied");
    expect(transition("approved", "deny")).toBe("REQUEST_CLOSED");
    expect(transition("pending", "cancel")).toBe("canceled");
    expect(transition("denied", "cancel")).toBe("REQUEST_CLOSED");
  });
  it("knows which statuses are still open", () => {
    expect(["open", "claimed", "pending"].every((s) => isOpenStatus(s as never))).toBe(true);
    expect(["done", "canceled", "approved", "denied"].some((s) => isOpenStatus(s as never))).toBe(false);
  });
});

describe("canRequest", () => {
  it("opens help to every role", () => {
    for (const role of ["busser", "kitchen", "server", "manager"] as const) expect(canRequest(role, "C", "help")).toBeNull();
  });
  it("limits water and clear to service roles", () => {
    expect(canRequest("server", "C", "water")).toBeNull();
    expect(canRequest("busser", "B", "water")).toBe("FORBIDDEN");
    expect(canRequest("kitchen", "A", "clear")).toBe("FORBIDDEN");
  });
  it("needs level B for a comp, not for a void, and no level for managers", () => {
    expect(canRequest("server", "C", "comp")).toBe("LEVEL_FORBIDDEN");
    expect(canRequest("server", undefined, "comp")).toBe("LEVEL_FORBIDDEN");
    expect(canRequest("server", "B", "comp")).toBeNull();
    expect(canRequest("server", "C", "void")).toBeNull();
    expect(canRequest("manager", "C", "comp")).toBeNull();
    expect(canRequest("runner", "A", "void")).toBe("FORBIDDEN");
  });
});

describe("canDecide", () => {
  const req = { createdBy: "server", kind: "comp" as const };
  it("refuses self-approval first", () => {
    expect(canDecide({ id: "server", role: "manager" }, req, { captainApprovesComps: true })).toBe("SELF_APPROVAL");
  });
  it("lets managers and owners decide, captains only with the setting", () => {
    expect(canDecide({ id: "m", role: "manager" }, req, { captainApprovesComps: false })).toBeNull();
    expect(canDecide({ id: "o", role: "owner" }, req, { captainApprovesComps: false })).toBeNull();
    expect(canDecide({ id: "c", role: "captain" }, req, { captainApprovesComps: false })).toBe("FORBIDDEN");
    expect(canDecide({ id: "c", role: "captain" }, req, { captainApprovesComps: true })).toBeNull();
    expect(canDecide({ id: "s", role: "server" }, req, { captainApprovesComps: true })).toBe("FORBIDDEN");
  });
  it("has nothing to decide on a service request", () => {
    expect(canDecide({ id: "m", role: "manager" }, { createdBy: "server", kind: "water" }, { captainApprovesComps: false })).toBe("FORBIDDEN");
  });
});

describe("table notes", () => {
  it("accepts a short note and refuses empty or long ones", () => {
    expect(noteProblem("Anniversary, candle on dessert")).toBeNull();
    expect(noteProblem("   ")).toBe("EMPTY");
    expect(noteProblem("x".repeat(NOTE_MAX))).toBeNull();
    expect(noteProblem("x".repeat(NOTE_MAX + 1))).toBe("TOO_LONG");
  });
  it("refuses emails and phone numbers in any common format", () => {
    expect(noteProblem("write to ana@example.com")).toBe("CONTACT_DETAILS");
    expect(noteProblem("(212) 555-0199")).toBe("CONTACT_DETAILS");
    expect(noteProblem("call 2125550199")).toBe("CONTACT_DETAILS");
    expect(noteProblem("party of 12 at 8:30")).toBeNull();
  });
  it("sends only allergies to the kitchen", () => {
    expect(kitchenNeeds({ kind: "allergy" })).toBe(true);
    expect(kitchenNeeds({ kind: "vip" })).toBe(false);
  });
  it("purges archived notes after 30 days only", () => {
    const now = 100 * 24 * 3600_000;
    expect(purgeDue({}, now)).toBe(false);
    expect(purgeDue({ archivedAt: now - 29 * 24 * 3600_000 }, now)).toBe(false);
    expect(purgeDue({ archivedAt: now - 31 * 24 * 3600_000 }, now)).toBe(true);
  });
});
