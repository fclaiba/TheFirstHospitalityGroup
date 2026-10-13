import { beforeEach, describe, expect, it } from "vitest";
import { World } from "./support/engine";
import { previewSecret } from "../lib/demo/engine";
import { DEMO_PASSWORD } from "../lib/demo/accounts";
import { nyDateKey } from "../lib/time";

// People module (BLUEPRINT 15): warnings, messages, pay and staff accounts, through the real Convex handlers.

let w: World;
beforeEach(async () => {
  w = await World.create();
}, 30_000);

/** The rule with this key in a role's company rule set. */
function ruleOf(role: string, key: string): string {
  const set = w.rows("ruleSets").find((s) => s.role === role)!;
  return w.rows("rules").find((r) => r.setId === set._id && r.key === key)!._id;
}

describe("warnings", () => {
  it("a captain logs a major warning and the person's state reaches Review", async () => {
    await w.as("luis.c");
    const kevin = w.user("kevin.d");
    const r = await w.m<{ state: string }>("warnings:create", { venueId: w.venue("v1")._id, userId: kevin._id, ruleId: ruleOf("busser", "spills"), severity: "major", note: "Left a spill unmarked at table 23", formMs: 18_000 });
    expect(r.state).toBe("review");
    expect(w.rows("auditLogs").some((a) => a.action === "warning.created")).toBe(true);
    expect(w.rows("analyticsEvents").some((e) => e.name === "warning_logged")).toBe(true);
  });

  it("never puts the warning content in the notification", async () => {
    await w.as("luis.c");
    const kevin = w.user("kevin.d");
    await w.m("warnings:create", { venueId: w.venue("v1")._id, userId: kevin._id, ruleId: ruleOf("busser", "spills"), severity: "minor", note: "SECRET-NOTE-TEXT" });
    const push = w.rows("outbound").filter((o) => o.userId === kevin._id && o.topic === "warning");
    expect(push.length).toBe(1);
    expect(JSON.stringify(push[0]!.payload)).not.toContain("SECRET-NOTE-TEXT");
  });

  it("refuses a rule that is not in the person's role set (RULE_NOT_FOR_ROLE)", async () => {
    await w.as("maria.m");
    expect(await w.code("warnings:create", { venueId: w.venue("v1")._id, userId: w.user("ana.p")._id, ruleId: ruleOf("bartender", "bottles"), severity: "minor" })).toBe("RULE_NOT_FOR_ROLE");
  });

  it("requires a rule (RULE_REQUIRED)", async () => {
    await w.as("maria.m");
    expect(await w.code("warnings:create", { venueId: w.venue("v1")._id, userId: w.user("ana.p")._id, severity: "minor" })).toBe("RULE_REQUIRED");
  });

  it("forbids warning yourself and staff logging warnings", async () => {
    await w.as("luis.c");
    expect(await w.code("warnings:create", { venueId: w.venue("v1")._id, userId: w.user("luis.c")._id, ruleId: ruleOf("captain", "phones"), severity: "minor" })).toBe("FORBIDDEN");
    await w.as("ana.p");
    expect(await w.code("warnings:create", { venueId: w.venue("v1")._id, userId: w.user("tom.b")._id, ruleId: ruleOf("server", "phones"), severity: "minor" })).toBe("FORBIDDEN");
  });

  it("keeps venues apart (VENUE_FORBIDDEN)", async () => {
    await w.as("james.k");
    expect(await w.code("warnings:create", { venueId: w.venue("v1")._id, userId: w.user("ana.p")._id, ruleId: ruleOf("server", "phones"), severity: "minor" })).toBe("VENUE_FORBIDDEN");
    expect(await w.qcode("warnings:forVenue", { venueId: w.venue("v1")._id })).toBe("VENUE_FORBIDDEN");
  });

  it("only the warned person acknowledges, with a response", async () => {
    const pending = w.rows("warnings").find((x) => x.userId === w.user("kevin.d")._id && !x.acknowledgedAt)!;
    await w.as("ana.p");
    expect(await w.code("warnings:acknowledge", { warningId: pending._id })).toBe("FORBIDDEN");
    await w.as("kevin.d");
    await w.m("warnings:acknowledge", { warningId: pending._id, response: "I understand. It will not happen again." });
    const after = w.rows("warnings").find((x) => x._id === pending._id)!;
    expect(after.acknowledgedAt).toBeTypeOf("number");
    expect(after.response).toBe("I understand. It will not happen again.");
  });

  it("voids within 24 h with a reason; never later; never by a captain", async () => {
    await w.as("luis.c");
    const { warningId } = await w.m<{ warningId: string }>("warnings:create", { venueId: w.venue("v1")._id, userId: w.user("ana.p")._id, ruleId: ruleOf("server", "uniform"), severity: "minor" });
    expect(await w.code("warnings:void", { warningId, reason: "Wrong person" })).toBe("FORBIDDEN");
    await w.as("maria.m");
    expect(await w.code("warnings:void", { warningId, reason: "" })).toBe("INVALID_INPUT");
    await w.m("warnings:void", { warningId, reason: "Wrong person" });
    expect(w.rows("warnings").find((x) => x._id === warningId)!.voidedAt).toBeTypeOf("number");
    const old = w.rows("warnings").find((x) => x.userId === w.user("kevin.d")._id && (x.at as number) < Date.now() - 5 * 24 * 3600_000)!;
    expect(await w.code("warnings:void", { warningId: old._id, reason: "Too old" })).toBe("TOO_LATE");
  });

  it("mine returns only my own warnings and my state", async () => {
    await w.as("kevin.d");
    const mine = await w.q<{ state: string; items: Array<{ personName: string }> }>("warnings:mine");
    expect(mine.items.length).toBe(3);
    expect(mine.items.every((i) => i.personName === "Kevin Duarte")).toBe(true);
    expect(mine.state).toBe("follow_up");
    await w.as("ana.p");
    expect((await w.q<{ items: unknown[] }>("warnings:mine")).items).toHaveLength(0);
  });

  it("thresholds: owner only, ordered", async () => {
    await w.as("maria.m");
    expect(await w.code("warnings:setThresholds", { attentionMinor: 1, followUpMinor: 3, followUpMajor: 1, reviewMajor: 2, windowDays: 30 })).toBe("FORBIDDEN");
    await w.as("owner");
    expect(await w.code("warnings:setThresholds", { attentionMinor: 4, followUpMinor: 3, followUpMajor: 1, reviewMajor: 2, windowDays: 30 })).toBe("INVALID_INPUT");
    await w.m("warnings:setThresholds", { attentionMinor: 1, followUpMinor: 2, followUpMajor: 2, reviewMajor: 3, windowDays: 14 });
    expect(w.rows("auditLogs").some((a) => a.action === "warning.thresholds_changed")).toBe(true);
  });

  it("the form lists the person's role rules and the digest only notifies owners", async () => {
    await w.as("luis.c");
    const rules = await w.q<Array<{ key: string }>>("warnings:rulesFor", { venueId: w.venue("v1")._id, userId: w.user("lucia.f")._id });
    expect(rules.map((r) => r.key)).toContain("bottles");
    const people = await w.q<Array<{ name: string; role: string }>>("warnings:people", { venueId: w.venue("v1")._id });
    expect(people.some((p) => p.role === "manager" || p.role === "captain")).toBe(false);
    await w.m("warnings:create", { venueId: w.venue("v1")._id, userId: w.user("kevin.d")._id, ruleId: ruleOf("busser", "spills"), severity: "major" });
    const before = w.rows("outbound").length;
    await w.m("warnings:digest");
    const sent = w.rows("outbound").slice(before);
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.every((o) => o.userId === w.user("owner")._id)).toBe(true);
  });
});

describe("messages", () => {
  it("sends to one venue only, with a read row per recipient", async () => {
    await w.as("maria.m");
    const r = await w.m<{ messageId: string; recipients: number }>("messages:send", { venueIds: [w.venue("v1")._id], title: { en: "Line-up at 4", es: "Line-up a las 4" }, body: { en: "Be on time.", es: "Llega a tiempo." }, requiresConfirmation: true });
    const reads = w.rows("messageReads").filter((x) => x.messageId === r.messageId);
    expect(reads.length).toBe(r.recipients);
    const v1People = new Set(w.rows("assignments").filter((a) => a.venueId === w.venue("v1")._id).map((a) => a.userId));
    expect(reads.every((x) => v1People.has(x.userId as string))).toBe(true);
    expect(reads.some((x) => x.userId === w.user("maria.m")._id)).toBe(false);
    expect(reads.some((x) => x.userId === w.user("emma.t")._id)).toBe(false);
  });

  it("NO_RECIPIENTS for an empty audience and VENUE_FORBIDDEN for another venue", async () => {
    await w.as("james.k");
    expect(await w.code("messages:send", { venueIds: [w.venue("v2")._id], roles: ["kitchen"], title: { en: "a", es: "a" }, body: { en: "b", es: "b" }, requiresConfirmation: false })).toBe("NO_RECIPIENTS");
    expect(await w.code("messages:send", { venueIds: [w.venue("v1")._id], title: { en: "a", es: "a" }, body: { en: "b", es: "b" }, requiresConfirmation: false })).toBe("VENUE_FORBIDDEN");
  });

  it("marks read, confirms, and the sender sees receipts", async () => {
    await w.as("maria.m");
    const { messageId } = await w.m<{ messageId: string }>("messages:send", { venueIds: [w.venue("v1")._id], roles: ["server"], title: { en: "New wine list", es: "Nueva carta de vinos" }, body: { en: "Read it.", es: "Léela." }, requiresConfirmation: true });
    await w.as("ana.p");
    const before = await w.q<number>("messages:unreadCount");
    await w.m("messages:markRead", { messageId });
    expect(await w.q<number>("messages:unreadCount")).toBe(before - 1);
    await w.m("messages:confirm", { messageId });
    expect(await w.qcode("messages:receipts", { messageId })).toBe("NOT_FOUND");
    await w.as("maria.m");
    const r = await w.q<{ total: number; read: number; confirmed: number }>("messages:receipts", { messageId });
    expect(r.total).toBe(3);
    expect(r.read).toBe(1);
    expect(r.confirmed).toBe(1);
    await w.as("sam.r");
    expect(await w.qcode("messages:get", { messageId })).toBe("NOT_FOUND");
  });
});

describe("pay", () => {
  it("rates are readable by the owner and the person only", async () => {
    const ana = w.user("ana.p");
    await w.as("maria.m");
    expect(await w.qcode("pay:records", { userId: ana._id })).toBe("FORBIDDEN");
    expect(await w.qcode("pay:records", {})).toBe("FORBIDDEN");
    await w.as("ana.p");
    expect((await w.q<{ people: unknown[] }>("pay:records", { userId: ana._id })).people).toHaveLength(1);
    await w.as("owner");
    expect((await w.q<{ people: unknown[] }>("pay:records", {})).people.length).toBeGreaterThan(10);
  });

  it("never proposes a deduction (NO_DEDUCTIONS)", async () => {
    await w.as("maria.m");
    const base = { userId: w.user("ana.p")._id, venueId: w.venue("v1")._id, reason: "Late to line-up" };
    expect(await w.code("pay:propose", { ...base, kind: "bonus", amountCents: -2000 })).toBe("NO_DEDUCTIONS");
    expect(await w.code("pay:propose", { ...base, kind: "correction", amountCents: -2000, reason: "Deduct for the warning" })).toBe("NO_DEDUCTIONS");
  });

  it("an approver above the proposer switches it on; never your own", async () => {
    const proposal = w.rows("payAdjustments").find((a) => a.userId === w.user("carlos.g")._id && a.status === "proposed")!;
    await w.as("luis.c");
    expect(await w.code("pay:switchOn", { adjustmentId: proposal._id })).toBe("SELF_APPROVAL");
    await w.as("maria.m");
    await w.m("pay:switchOn", { adjustmentId: proposal._id });
    expect(w.rows("payAdjustments").find((a) => a._id === proposal._id)!.status).toBe("on");
    expect(w.rows("auditLogs").some((a) => a.action === "pay.switched_on")).toBe(true);
    const own = w.rows("payAdjustments").find((a) => a.proposedBy === w.user("maria.m")._id && a.status === "proposed")!;
    expect(await w.code("pay:switchOn", { adjustmentId: own._id })).toBe("SELF_APPROVAL");
  });

  it("a manager cannot switch on another manager's proposal (PAY_FORBIDDEN)", async () => {
    const own = w.rows("payAdjustments").find((a) => a.proposedBy === w.user("maria.m")._id && a.status === "proposed")!;
    await w.as("james.k");
    expect(await w.code("pay:switchOn", { adjustmentId: own._id })).toBe("PAY_FORBIDDEN");
  });

  it("the owner exports the month as CSV, audited", async () => {
    const on = w.rows("payAdjustments").find((a) => a.status === "on")!;
    await w.as("owner");
    const r = await w.m<{ csv: string; count: number }>("pay:exportMonth", { month: nyDateKey(on.approvedAt as number).slice(0, 7) });
    expect(r.count).toBeGreaterThan(0);
    expect(r.csv.split("\r\n")[0]).toBe("name,username,kind,amount_usd,reason,approved_at");
    expect(w.rows("payAdjustments").find((a) => a._id === on._id)!.status).toBe("exported");
    expect(w.rows("auditLogs").some((a) => a.action === "pay.exported")).toBe(true);
    await w.as("maria.m");
    expect(await w.code("pay:exportMonth", { month: "2026-10" })).toBe("FORBIDDEN");
  });

  it("the person sees their own rate and approved adjustments", async () => {
    await w.as("ana.p");
    const mine = await w.q<{ current: { rateCents: number } | null; adjustments: unknown[] }>("pay:mine");
    expect(mine.current?.rateCents).toBe(1800);
    expect(mine.adjustments).toHaveLength(1);
  });
});

describe("staff accounts", () => {
  const base = { name: "New Hire", username: "new.hire", role: "server", level: "C", locale: "en" };

  it("a manager creates a server with a temporary password and a forced change", async () => {
    await w.as("maria.m");
    const r = await w.m<{ userId: string; tempPassword: string }>("staff:upsert", { ...base, venueIds: [w.venue("v1")._id] });
    expect(r.tempPassword).toMatch(/^[a-z]+-[a-z]+-\d{2}$/);
    const u = w.rows("users").find((x) => x._id === r.userId)!;
    expect(u.mustChangePassword).toBe(true);
    expect(await w.code("staff:upsert", { ...base, venueIds: [w.venue("v1")._id] })).toBe("USERNAME_TAKEN");
  });

  it("a manager cannot create a manager, nor a bartender without the legal age check", async () => {
    await w.as("maria.m");
    expect(await w.code("staff:upsert", { ...base, role: "manager", venueIds: [w.venue("v1")._id] })).toBe("FORBIDDEN");
    expect(await w.code("staff:upsert", { ...base, role: "bartender", venueIds: [w.venue("v1")._id] })).toBe("INVALID_INPUT");
  });

  it("deactivation ends access at once", async () => {
    await w.as("maria.m");
    await w.m("staff:deactivate", { userId: w.user("kevin.d")._id });
    const r = await w.m<{ ok: boolean; error?: string }>("auth:signIn", { login: "kevin.d", password: DEMO_PASSWORD, secret: previewSecret() });
    expect(r).toMatchObject({ ok: false, error: "INVALID_CREDENTIALS" });
  });
});
