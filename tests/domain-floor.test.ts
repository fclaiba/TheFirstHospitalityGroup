import { describe, expect, it } from "vitest";
import { ESCALATE_AFTER_MS, escalationDue, escalationRecipients, isOpenStatus, routeRequest, transition } from "../lib/domain/requests";
import type { RosterEntry } from "../lib/domain/requests";
import { NOTE_MAX, NOTE_RETENTION_DAYS, expoNeeds, noteProblem, purgeDue } from "../lib/domain/tableNotes";
import { planProblem, seatCount, seatLabel, sectionOf, tableOf, whoIsWhere } from "../lib/domain/floor";
import type { Plan } from "../lib/domain/floor";
import { is86, pendingAcks, quizPassed, sameAllergens } from "../lib/domain/menu";

// Floor, requests, table notes and menu rules (ADR 0013, 0016, 0021, 0022).

const roster: RosterEntry[] = [
  { userId: "ana", position: "server", sectionIds: ["b"], onDuty: true },
  { userId: "carlos", position: "runner", sectionIds: ["b"], onDuty: true },
  { userId: "pedro", position: "busser", sectionIds: ["b"], onDuty: true, muted: true },
  { userId: "nina", position: "runner", sectionIds: ["a"], onDuty: true },
  { userId: "kevin", position: "busser", sectionIds: ["a"], onDuty: false },
  { userId: "luis", position: "captain", sectionIds: ["c"], onDuty: true },
  { userId: "maria", position: "floor_manager", sectionIds: [], onDuty: true },
];

describe("routeRequest", () => {
  it("sends water and clear to support of the section, skipping muted and off-duty people", () => {
    expect(routeRequest("water", "b", roster, "ana")).toEqual(["carlos"]);
    expect(routeRequest("clear", "a", roster, "ana")).toEqual(["nina"]);
  });
  it("falls back to every receiver when the section has none or none is set", () => {
    expect(routeRequest("water", "c", roster, "ana")).toEqual(["carlos", "nina"]);
    expect(routeRequest("water", undefined, roster, "ana")).toEqual(["carlos", "nina"]);
  });
  it("sends help to leads and managers on duty, never back to the requester", () => {
    expect(routeRequest("help", "b", roster, "ana")).toEqual(["luis", "maria"]);
    expect(routeRequest("help", undefined, roster, "luis")).toEqual(["maria"]);
  });
});

describe("escalation", () => {
  it("widens to every receiver and the managers on duty", () => {
    expect(escalationRecipients("water", roster, "ana")).toEqual(["carlos", "pedro", "nina", "maria"]);
    expect(escalationRecipients("help", roster, "ana")).toEqual(["luis", "maria"]);
  });
  it("is due after 90 s for open requests only, once", () => {
    const at = 1_000_000;
    expect(escalationDue({ status: "open", at }, at + ESCALATE_AFTER_MS - 1)).toBe(false);
    expect(escalationDue({ status: "open", at }, at + ESCALATE_AFTER_MS)).toBe(true);
    expect(escalationDue({ status: "open", at, escalatedAt: at + 1 }, at + ESCALATE_AFTER_MS)).toBe(false);
    expect(escalationDue({ status: "claimed", at }, at + ESCALATE_AFTER_MS)).toBe(false);
  });
});

describe("request lifecycle", () => {
  it("claims, finishes and cancels; a second claim is closed", () => {
    expect(transition("open", "claim")).toBe("claimed");
    expect(transition("claimed", "claim")).toBe("REQUEST_CLOSED");
    expect(transition("claimed", "done")).toBe("done");
    expect(transition("open", "done")).toBe("done");
    expect(transition("open", "cancel")).toBe("canceled");
    expect(transition("done", "cancel")).toBe("REQUEST_CLOSED");
    expect(isOpenStatus("open")).toBe(true);
    expect(isOpenStatus("claimed")).toBe(true);
    expect(isOpenStatus("done")).toBe(false);
    expect(isOpenStatus("canceled")).toBe(false);
  });
});

describe("table notes (never a guest database)", () => {
  it("rejects empty, long, contact details, and allergies without a seat", () => {
    expect(noteProblem("   ")).toBe("EMPTY");
    expect(noteProblem("x".repeat(NOTE_MAX + 1))).toBe("TOO_LONG");
    expect(noteProblem("Call her at 212 555 0199")).toBe("CONTACT_DETAILS");
    expect(noteProblem("guest@example.com likes window seats")).toBe("CONTACT_DETAILS");
    expect(noteProblem("Shellfish", "allergy")).toBe("SEAT_REQUIRED");
    expect(noteProblem("Shellfish", "allergy", 0)).toBe("SEAT_REQUIRED");
    expect(noteProblem("Shellfish", "allergy", 1.5)).toBe("SEAT_REQUIRED");
    expect(noteProblem("Shellfish", "allergy", 2)).toBeNull();
    expect(noteProblem("Regular, table 22", "vip")).toBeNull();
    expect(noteProblem("Anniversary")).toBeNull();
  });
  it("sends allergies to the expo and purges after 30 days archived", () => {
    expect(expoNeeds({ kind: "allergy" })).toBe(true);
    expect(expoNeeds({ kind: "vip" })).toBe(false);
    const day = 24 * 3600_000;
    expect(purgeDue({}, 10 ** 12)).toBe(false);
    expect(purgeDue({ archivedAt: 0 }, NOTE_RETENTION_DAYS * day)).toBe(false);
    expect(purgeDue({ archivedAt: 0 }, NOTE_RETENTION_DAYS * day + 1)).toBe(true);
  });
});

describe("floor plan (ADR 0021)", () => {
  const plan: Plan = {
    sections: [
      { id: "a", name: "A", tables: [{ number: "10", seats: 2, x: 10, y: 10 }, { number: "11", seats: 4, x: 20, y: 10 }] },
      { id: "bar", name: "Bar", tables: [{ number: "B1", seats: 2, x: 90, y: 10 }] },
    ],
  };
  it("finds tables, sections and seats", () => {
    expect(seatLabel("24", 2)).toEqual({ table: "24", seat: 2 });
    expect(seatLabel("24")).toEqual({ table: "24", seat: null });
    expect(sectionOf("B1", plan)?.id).toBe("bar");
    expect(sectionOf("99", plan)).toBeNull();
    expect(tableOf("11", plan)?.seats).toBe(4);
    expect(tableOf("99", plan)).toBeNull();
    expect(seatCount(plan)).toBe(8);
  });
  it("says who is where", () => {
    const users = [
      { _id: "u1", name: "Tom" },
      { _id: "u2", name: "Nina" },
      { _id: "u3", name: "Luis" },
    ];
    expect(whoIsWhere([{ sectionId: "a", userIds: ["u1", "u2"], leadId: "u3" }, { sectionId: "bar", userIds: ["u9"] }], users)).toEqual({
      a: { lead: "Luis", people: ["Tom", "Nina"] },
      bar: { lead: null, people: [""] },
    });
    expect(whoIsWhere([{ sectionId: "a", userIds: [], leadId: "u9" }], users)).toEqual({ a: { lead: null, people: [] } });
  });
  it("validates plans", () => {
    expect(planProblem(plan)).toBeNull();
    expect(planProblem({ sections: [plan.sections[0]!, { ...plan.sections[0]!, tables: [] }] })).toBe("DUPLICATE_SECTION");
    expect(planProblem({ sections: [plan.sections[0]!, { id: "b", name: "B", tables: [{ number: "10", seats: 2, x: 0, y: 0 }] }] })).toBe("DUPLICATE_TABLE");
    expect(planProblem({ sections: [{ id: "a", name: "A", tables: [{ number: "1", seats: 0, x: 0, y: 0 }] }] })).toBe("SEATS");
    expect(planProblem({ sections: [{ id: "a", name: "A", tables: [{ number: "1", seats: 21, x: 0, y: 0 }] }] })).toBe("SEATS");
  });
});

describe("menu confirmations and 86s (ADR 0021, 0022)", () => {
  const items = [
    { _id: "cod", kind: "food" as const, version: 2, active: true },
    { _id: "tartare", kind: "food" as const, version: 1, active: true },
    { _id: "martini", kind: "drink" as const, version: 1, active: true },
    { _id: "barolo", kind: "wine" as const, version: 1, active: true, status: "published" as const },
    { _id: "old", kind: "food" as const, version: 1, active: false },
    { _id: "proposal", kind: "drink" as const, version: 1, active: true, status: "proposed" as const },
  ];
  const acks = [
    { itemId: "cod", version: 1 },
    { itemId: "tartare", version: 1 },
    { itemId: "barolo", version: 1 },
    { itemId: "barolo", version: 0 },
  ];
  it("asks each position only for new or changed items it serves", () => {
    expect(pendingAcks(items, acks, "server").map((i) => i._id)).toEqual(["cod", "martini"]);
    expect(pendingAcks(items, acks, "bartender").map((i) => i._id)).toEqual(["cod", "martini"]);
    expect(pendingAcks(items, acks, "line_cook").map((i) => i._id)).toEqual(["cod"]);
    expect(pendingAcks(items, acks, "prep_cook")).toEqual([]);
    expect(pendingAcks(items, acks, "gm")).toEqual([]);
    expect(pendingAcks(items, [], "expo").map((i) => i._id)).toEqual(["cod", "tartare", "martini", "barolo"]);
  });
  it("marks 86s until cleared", () => {
    expect(is86("souffle", [{ itemId: "souffle" }])).toBe(true);
    expect(is86("souffle", [{ itemId: "souffle", clearedAt: 5 }])).toBe(false);
    expect(is86("cod", [{ itemId: "souffle" }])).toBe(false);
  });
  it("passes the quiz at 80 % and compares allergens as sets", () => {
    expect(quizPassed(8, 10)).toBe(true);
    expect(quizPassed(7, 10)).toBe(false);
    expect(quizPassed(0, 0)).toBe(false);
    expect(sameAllergens(["milk", "eggs"], ["eggs", "milk", "milk"])).toBe(true);
    expect(sameAllergens(["milk"], ["milk", "eggs"])).toBe(false);
    expect(sameAllergens(["milk"], ["eggs"])).toBe(false);
    expect(sameAllergens([], [])).toBe(true);
  });
});
