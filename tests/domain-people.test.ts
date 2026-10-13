import { describe, expect, it } from "vitest";
import {
  AREA_LEADS,
  LADDERS,
  areaOf,
  canWork,
  confirmsMenu,
  isAtLeast,
  isCorporate,
  isManagerial,
  isPosition,
  isStaff,
  isTipped,
  ladderOf,
  layerOf,
  nextOnLadder,
  positionsIn,
  rankOf,
  servesAlcohol,
  workablePositions,
} from "../lib/domain/positions";
import { FRONT_OF_HOUSE, isFrontOfHouse, areaOf as areaOfArea } from "../lib/domain/areas";
import { REPORTS_TO, canIssueFor, canProposeFor, chainOf, escalationTarget, leadOf, mayAddress, recipientsFor, reportsTo, supervises } from "../lib/domain/chain";
import { can, canSeeVenue, canSeeWarningsOf, manageablePositions } from "../lib/domain/permissions";
import { receiptState, recipients } from "../lib/domain/messages";
import { policyProblem } from "../lib/domain/tips";
import { afterFailedLogin, hashPassword, isUsername, LOCKOUT_MS, MAX_FAILED_LOGINS, normalizeUsername, passwordProblem, tempPassword, verifyPassword } from "../lib/domain/password";
import { formatSubject, parseSubject, sessionMatches } from "../lib/domain/session";
import { POSITIONS } from "../lib/domain/types";

describe("positions, layers and areas (ADR 0020)", () => {
  it("maps each position to its area and layer", () => {
    expect(layerOf("polisher")).toBe("support");
    expect(layerOf("server")).toBe("service");
    expect(layerOf("captain")).toBe("lead");
    expect(layerOf("chef_de_cuisine")).toBe("manager");
    expect(layerOf("gm")).toBe("manager");
    expect(layerOf("director")).toBe("corporate");
    expect(areaOf("expo")).toBe("pass");
    expect(areaOf("host")).toBe("reception");
    expect(areaOf("sommelier")).toBe("bar");
    expect(areaOf("dishwasher")).toBe("kitchen");
    expect(areaOf("agm")).toBe("venue_management");
    expect(areaOfArea("owner")).toBe("corporate");
  });

  it("orders layers and classifies positions", () => {
    expect(rankOf("support")).toBeLessThan(rankOf("lead"));
    expect(isAtLeast("captain", "lead")).toBe(true);
    expect(isAtLeast("server", "lead")).toBe(false);
    expect(isManagerial("floor_manager")).toBe(true);
    expect(isManagerial("sous_chef")).toBe(false);
    expect(isCorporate("owner")).toBe(true);
    expect(isCorporate("gm")).toBe(false);
    expect(isStaff("head_bartender")).toBe(true);
    expect(isStaff("agm")).toBe(false);
    expect(isTipped("busser")).toBe(true);
    expect(isTipped("host")).toBe(false);
    expect(servesAlcohol("barback")).toBe(true);
    expect(servesAlcohol("runner")).toBe(false);
    expect(positionsIn("bar")).toEqual(["barback", "bartender", "head_bartender", "sommelier"]);
    expect(positionsIn("corporate")).toEqual(["director", "owner"]);
    expect(AREA_LEADS).toEqual(["captain", "maitre_d", "head_bartender", "sous_chef"]);
    expect(isPosition("expo")).toBe(true);
    expect(isPosition("manager")).toBe(false);
  });

  it("decides who confirms which menu changes", () => {
    expect(confirmsMenu("server", "wine")).toBe(true);
    expect(confirmsMenu("host", "drink")).toBe(true);
    expect(confirmsMenu("expo", "food")).toBe(true);
    expect(confirmsMenu("line_cook", "food")).toBe(true);
    expect(confirmsMenu("line_cook", "drink")).toBe(false);
    expect(confirmsMenu("prep_cook", "food")).toBe(false);
    expect(confirmsMenu("floor_manager", "food")).toBe(false);
  });

  it("walks the four ladders", () => {
    expect(LADDERS.floor[0]).toBe("polisher");
    expect(ladderOf("polisher")).toBe("floor");
    expect(ladderOf("maitre_d")).toBe("floor");
    expect(ladderOf("barback")).toBe("bar");
    expect(ladderOf("head_bartender")).toBe("bar");
    expect(ladderOf("sommelier")).toBeNull();
    expect(ladderOf("dishwasher")).toBe("kitchen");
    expect(ladderOf("floor_manager")).toBe("management");
    expect(ladderOf("director")).toBe("management");
    expect(ladderOf("host")).toBeNull();
    expect(ladderOf("expo")).toBeNull();
    expect(nextOnLadder("server")).toBe("captain");
    expect(nextOnLadder("bartender")).toBe("head_bartender");
    expect(nextOnLadder("line_cook")).toBe("sous_chef");
    expect(nextOnLadder("agm")).toBe("gm");
    expect(nextOnLadder("director")).toBeNull();
    expect(nextOnLadder("chef_de_cuisine")).toBeNull();
    expect(nextOnLadder("host")).toBeNull();
    expect(nextOnLadder("polisher", "bar")).toBe("barback");
    expect(nextOnLadder("host", "floor")).toBeNull();
  });

  it("knows which positions a person may work", () => {
    const tom = { primaryPosition: "server" as const, enabledPositions: ["captain" as const, "server" as const] };
    expect(canWork(tom, "server")).toBe(true);
    expect(canWork(tom, "captain")).toBe(true);
    expect(canWork(tom, "busser")).toBe(false);
    expect(workablePositions(tom)).toEqual(["server", "captain"]);
  });

  it("groups front of house", () => {
    expect(FRONT_OF_HOUSE).toEqual(["floor", "reception", "pass", "bar"]);
    expect(isFrontOfHouse("bar")).toBe(true);
    expect(isFrontOfHouse("kitchen")).toBe(false);
  });
});

describe("chain of supervision (ADR 0026)", () => {
  it("follows reporting lines with venue overrides and cuts cycles", () => {
    expect(REPORTS_TO.owner).toBeNull();
    expect(reportsTo("runner")).toBe("captain");
    expect(reportsTo("runner", { runner: "expo" })).toBe("expo");
    expect(chainOf("busser")).toEqual(["captain", "maitre_d", "floor_manager", "agm", "gm", "director", "owner"]);
    expect(chainOf("owner")).toEqual([]);
    expect(chainOf("busser", { captain: "busser" })).toEqual(["captain"]);
  });

  it("finds the area lead", () => {
    expect(leadOf("busser")).toBe("captain");
    expect(leadOf("barback")).toBe("head_bartender");
    expect(leadOf("dishwasher")).toBe("sous_chef");
    expect(leadOf("host")).toBe("maitre_d");
    expect(leadOf("busser", { busser: "maitre_d" })).toBe("maitre_d");
    expect(leadOf("captain")).toBeNull();
    expect(leadOf("gm")).toBeNull();
    expect(leadOf("expo")).toBeNull();
  });

  it("decides who supervises whom", () => {
    expect(supervises("captain", "busser")).toBe(true);
    expect(supervises("busser", "captain")).toBe(false);
    expect(supervises("captain", "captain")).toBe(false);
    expect(supervises("captain", "bartender")).toBe(false);
    expect(supervises("server", "busser")).toBe(false);
    expect(supervises("floor_manager", "bartender")).toBe(true);
    expect(supervises("floor_manager", "agm")).toBe(false);
    expect(supervises("gm", "agm")).toBe(true);
    expect(supervises("chef_de_cuisine", "line_cook")).toBe(true);
    expect(supervises("director", "gm")).toBe(true);
    expect(supervises("director", "owner")).toBe(false);
    expect(supervises("owner", "director")).toBe(true);
    expect(supervises("dev", "owner")).toBe(false);
  });

  it("lets leads propose for their own team and managers issue", () => {
    expect(canProposeFor("captain", "server")).toBe(true);
    expect(canProposeFor("captain", "bartender")).toBe(false);
    expect(canProposeFor("head_bartender", "barback")).toBe(true);
    expect(canProposeFor("sous_chef", "line_cook")).toBe(true);
    expect(canProposeFor("maitre_d", "captain")).toBe(false);
    expect(canProposeFor("floor_manager", "server")).toBe(false);
    expect(canIssueFor("floor_manager", "server")).toBe(true);
    expect(canIssueFor("captain", "server")).toBe(false);
    expect(canIssueFor("gm", "floor_manager")).toBe(true);
    expect(canIssueFor("floor_manager", "gm")).toBe(false);
  });

  it("escalates and routes to roles, never to peers", () => {
    expect(escalationTarget("request")).toEqual(["floor_manager", "agm", "gm"]);
    expect(escalationTarget("warning_proposal")).toEqual(["gm"]);
    expect(escalationTarget("venue_action_required")).toEqual(["director"]);
    expect(recipientsFor("water")).toEqual(["busser", "runner"]);
    expect(recipientsFor("help")).toContain("captain");
    expect(mayAddress("server", "busser")).toBe(false);
    expect(mayAddress("server", "server")).toBe(false);
    expect(mayAddress("captain", "busser")).toBe(true);
  });
});

describe("permissions (layer x action, BLUEPRINT 2.4)", () => {
  it("gives owner and dev everything", () => {
    expect(can("owner", "import.run")).toBe(true);
    expect(can("dev", "tips.manage")).toBe(true);
  });

  it("follows the layers", () => {
    expect(can("busser", "today.view")).toBe(true);
    expect(can("busser", "warnings.propose")).toBe(false);
    expect(can("captain", "warnings.propose")).toBe(true);
    expect(can("captain", "warnings.issue")).toBe(false);
    expect(can("floor_manager", "warnings.issue")).toBe(true);
    expect(can("floor_manager", "schedule.manage")).toBe(true);
    expect(can("floor_manager", "menu.approve")).toBe(false);
    expect(can("server", "schedule.manage")).toBe(false);
  });

  it("adds position grants (EXTRA)", () => {
    expect(can("expo", "menu.86")).toBe(true);
    expect(can("expo", "notes.allergy")).toBe(true);
    expect(can("server", "menu.86")).toBe(false);
    expect(can("server", "notes.add")).toBe(true);
    expect(can("bartender", "bar.report")).toBe(true);
    expect(can("busser", "bar.report")).toBe(false);
    expect(can("host", "floor.map")).toBe(true);
    expect(can("runner", "requests.receive")).toBe(true);
    expect(can("server", "requests.receive")).toBe(false);
    expect(can("head_bartender", "menu.propose")).toBe(true);
    expect(can("head_bartender", "bar.resolve")).toBe(true);
    expect(can("line_cook", "notes.allergy")).toBe(true);
    expect(can("gm", "menu.approve")).toBe(true);
    expect(can("chef_de_cuisine", "menu.edit")).toBe(true);
  });

  it("removes grants the layer gives but the position does not get (NOT_FOR)", () => {
    expect(can("chef_de_cuisine", "shift.control")).toBe(false);
    expect(can("chef_de_cuisine", "close.file")).toBe(false);
    expect(can("chef_de_cuisine", "warnings.issue")).toBe(true);
    expect(can("director", "company.setup")).toBe(false);
    expect(can("director", "audit.read")).toBe(false);
    expect(can("director", "staff.promote_approve")).toBe(true);
    expect(can("director", "company.view")).toBe(true);
  });

  it("isolates venues except for corporate", () => {
    expect(canSeeVenue({ position: "director", venueIds: [] }, "v1")).toBe(true);
    expect(canSeeVenue({ position: "server", venueIds: ["v1"] }, "v1")).toBe(true);
    expect(canSeeVenue({ position: "gm", venueIds: ["v1"] }, "v2")).toBe(false);
  });

  it("shows warnings to the person, their leads and managers, never peers", () => {
    const ana = { id: "a", position: "server" as const };
    expect(canSeeWarningsOf(ana, ana, false)).toBe(true);
    expect(canSeeWarningsOf({ id: "o", position: "owner" }, ana, false)).toBe(true);
    expect(canSeeWarningsOf({ id: "c", position: "captain" }, ana, true)).toBe(true);
    expect(canSeeWarningsOf({ id: "c", position: "captain" }, ana, false)).toBe(false);
    expect(canSeeWarningsOf({ id: "t", position: "server" }, ana, true)).toBe(false);
  });

  it("limits who creates and resets which accounts", () => {
    expect(manageablePositions("owner", POSITIONS)).toHaveLength(POSITIONS.length - 1);
    expect(manageablePositions("director", POSITIONS)).not.toContain("owner");
    expect(manageablePositions("director", POSITIONS)).toContain("gm");
    const fm = manageablePositions("floor_manager", POSITIONS);
    expect(fm).toHaveLength(16);
    expect(fm).not.toContain("agm");
    expect(manageablePositions("chef_de_cuisine", POSITIONS)).toEqual(["dishwasher", "prep_cook", "line_cook", "sous_chef"]);
    expect(manageablePositions("captain", POSITIONS)).toEqual([]);
  });
});

describe("announcements (one way, ADR 0026)", () => {
  const users = [
    { _id: "a", primaryPosition: "server" as const, enabledPositions: [], active: true },
    { _id: "b", primaryPosition: "bartender" as const, enabledPositions: [], active: true },
    { _id: "c", primaryPosition: "runner" as const, enabledPositions: ["server" as const], active: true },
    { _id: "d", primaryPosition: "server" as const, enabledPositions: [], active: false },
    { _id: "e", primaryPosition: "server" as const, enabledPositions: [], active: true, isDev: true },
    { _id: "f", primaryPosition: "floor_manager" as const, enabledPositions: [], active: true },
    { _id: "g", primaryPosition: "server" as const, enabledPositions: [], active: true },
  ];
  const assignments = ["a", "b", "c", "d", "e", "f"].map((userId) => ({ userId, venueId: "v1" })).concat([{ userId: "g", venueId: "v2" }]);

  it("resolves the audience by venue and position, without the sender", () => {
    expect(recipients({ venueIds: ["v1"] }, users, assignments, "f").sort()).toEqual(["a", "b", "c"]);
    expect(recipients({ venueIds: ["v1"], positions: ["server"] }, users, assignments).sort()).toEqual(["a", "c"]);
    expect(recipients({ venueIds: ["v1", "v2"], positions: [] }, users, assignments).sort()).toEqual(["a", "b", "c", "f", "g"]);
  });

  it("reports receipts as a state", () => {
    expect(receiptState([{ readAt: 1 }, { readAt: 2 }], false)).toBe("all_done");
    expect(receiptState([{ readAt: 1 }, {}], false)).toBe("pending");
    expect(receiptState([{ readAt: 1 }], true)).toBe("pending");
    expect(receiptState([{ readAt: 1, confirmedAt: 2 }], true)).toBe("all_done");
  });
});

describe("tip policy (ADR 0024, configuration only)", () => {
  it("rejects managers, duplicates and odd points", () => {
    expect(policyProblem([])).toBe("EMPTY");
    expect(policyProblem([{ position: "floor_manager", points: 1 }])).toBe("MANAGER_IN_POOL");
    expect(policyProblem([{ position: "server", points: 1 }, { position: "server", points: 1 }])).toBe("DUPLICATE");
    expect(policyProblem([{ position: "server", points: 0.3 }])).toBe("POINTS");
    expect(policyProblem([{ position: "server", points: 0 }])).toBe("POINTS");
    expect(policyProblem([{ position: "server", points: 11 }])).toBe("POINTS");
    expect(policyProblem([{ position: "server", points: 1 }, { position: "busser", points: 0.75 }, { position: "captain", points: 1.25 }])).toBeNull();
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
