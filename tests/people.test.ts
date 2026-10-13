import { beforeEach, describe, expect, it } from "vitest";
import { World } from "./support/engine";
import { previewSecret } from "../lib/demo/engine";
import { DEMO_PASSWORD } from "../lib/demo/accounts";

// People and org (BLUEPRINT 15): auth, staff and the ladder, rules, warnings through the chain, announcements and the
// tip policy, through the real Convex handlers with the demo seed.

let w: World;
beforeEach(async () => {
  w = await World.create();
}, 30_000);

const v1 = () => w.venue("v1")._id as string;
const uid = (u: string) => w.user(u)._id as string;
const minor = (u: string, set: string, key: string) => ({ venueId: v1(), userId: uid(u), ruleId: w.rule(set, key), severity: "minor" });

describe("auth and me", () => {
  it("me returns positions, layer and area instead of a role", async () => {
    await w.as("luis.c");
    const me = await w.q<{ primaryPosition: string; position: string; layer: string; area: string; venues: Array<{ slug: string }> }>("auth:me");
    expect(me).toMatchObject({ primaryPosition: "captain", position: "captain", layer: "lead", area: "floor" });
    expect(me.venues.map((v) => v.slug)).toEqual(["v1"]);
    await w.as("victor.h");
    const dir = await w.q<{ layer: string; venues: unknown[] }>("auth:me");
    expect(dir.layer).toBe("corporate");
    expect(dir.venues).toHaveLength(4);
  });

  it("sign-in gives staff the 12 h session class and leaders the 7 day one", async () => {
    const r = await w.m<{ role: string; position: string }>("auth:signIn", { login: "ana.p", password: DEMO_PASSWORD, secret: previewSecret() });
    expect(r).toMatchObject({ role: "server", position: "server" });
    const m = await w.m<{ role: string }>("auth:signIn", { login: "maria.m", password: DEMO_PASSWORD, secret: previewSecret() });
    expect(m.role).toBe("manager");
  });

  it("my position history shows the ladder climbed", async () => {
    await w.as("tom.b");
    const h = await w.q<{ steps: Array<{ fromPosition: string | null; toPosition: string }> }>("me:history");
    expect(h.steps.slice(0, 2).map((s) => [s.fromPosition, s.toPosition])).toEqual([
      ["runner", "server"],
      ["busser", "runner"],
    ]);
  });

  it("notification preferences include the schedule", async () => {
    await w.as("ana.p");
    await w.m("me:updatePrefs", { notify: { schedule: false, messages: true, warnings: true, tasks: true, requests: true } });
    expect((w.user("ana.p").notifyPrefs as { schedule: boolean }).schedule).toBe(false);
  });
});

describe("org", () => {
  it("the chart shows every name to leads and only the own lead's names to staff", async () => {
    await w.as("luis.c");
    const lead = await w.q<{ areas: Array<{ positions: Array<{ position: string; people: Array<{ name: string }> }> }> }>("org:chart", { venueId: v1() });
    const all = lead.areas.flatMap((a) => a.positions);
    expect(all.find((p) => p.position === "busser")!.people.length).toBe(2);
    await w.as("kevin.d");
    const staff = await w.q<{ myLead: string; areas: Array<{ positions: Array<{ position: string; count: number; people: Array<{ name: string; isMe: boolean }> }> }> }>("org:chart", { venueId: v1() });
    const pos = staff.areas.flatMap((a) => a.positions);
    expect(staff.myLead).toBe("captain");
    expect(pos.find((p) => p.position === "captain")!.people.map((x) => x.name)).toEqual(["Luis Castillo"]);
    expect(pos.find((p) => p.position === "server")!.people).toHaveLength(0);
    expect(pos.find((p) => p.position === "server")!.count).toBe(3);
    expect(pos.find((p) => p.position === "busser")!.people.map((x) => x.name)).toEqual(["Kevin Duarte"]);
    expect(await w.qcode("org:chart", { venueId: w.venue("v2")._id })).toBe("VENUE_FORBIDDEN");
  });

  it("chain overrides change who leads a position (owner only, audited)", async () => {
    await w.as("maria.m");
    expect(await w.code("org:setChainOverride", { venueId: v1(), position: "runner", reportsTo: "expo" })).toBe("FORBIDDEN");
    await w.as("owner");
    await w.m("org:setChainOverride", { venueId: v1(), position: "runner", reportsTo: "expo" });
    expect(w.rows("auditLogs").some((a) => a.action === "chain.changed")).toBe(true);
    // The captain no longer leads runners there: proposing for a runner is now refused.
    await w.as("luis.c");
    expect(await w.code("warnings:propose", minor("nina.s", "company", "phones"))).toBe("FORBIDDEN");
  });

  it("only the owner edits venues; positions carry local names", async () => {
    await w.as("james.k");
    const pos = await w.q<Array<{ position: string; localName: { en: string } | null }>>("org:positions", { venueId: w.venue("v2")._id });
    expect(pos.find((p) => p.position === "captain")!.localName?.en).toBe("Head waiter");
    expect(await w.code("org:upsertVenue", { name: "X", slug: "x", services: [], positionsUsed: ["server"], localNames: [], active: true })).toBe("FORBIDDEN");
  });
});

describe("staff and the ladder", () => {
  const base = { name: "New Hire", username: "new.hire", primaryPosition: "busser", enabledPositions: [], locale: "en" };

  it("a manager creates staff with a temporary password and a first history row", async () => {
    await w.as("maria.m");
    const r = await w.m<{ userId: string; tempPassword: string }>("staff:upsert", { ...base, venueIds: [v1()] });
    expect(r.tempPassword).toMatch(/^[a-z]+-[a-z]+-\d{2}$/);
    expect(w.rows("users").find((x) => x._id === r.userId)!.mustChangePassword).toBe(true);
    expect(w.rows("positionHistory").some((h) => h.userId === r.userId && h.toPosition === "busser")).toBe(true);
    expect(await w.code("staff:upsert", { ...base, venueIds: [v1()] })).toBe("USERNAME_TAKEN");
  });

  it("managers never create managers; alcohol positions need the legal age check", async () => {
    await w.as("maria.m");
    expect(await w.code("staff:upsert", { ...base, primaryPosition: "floor_manager", venueIds: [v1()] })).toBe("FORBIDDEN");
    expect(await w.code("staff:upsert", { ...base, enabledPositions: ["barback"], venueIds: [v1()] })).toBe("INVALID_INPUT");
    await w.m("staff:upsert", { ...base, enabledPositions: ["barback"], legalAgeConfirmed: true, venueIds: [v1()] });
    expect(await w.code("staff:upsert", { ...base, username: "x.other", venueIds: [w.venue("v2")._id] })).toBe("VENUE_FORBIDDEN");
  });

  it("staff and leads cannot manage accounts", async () => {
    for (const u of ["ana.p", "luis.c"]) {
      await w.as(u);
      expect(await w.code("staff:upsert", { ...base, venueIds: [v1()] })).toBe("FORBIDDEN");
      expect(await w.code("staff:resetPassword", { userId: uid("kevin.d") })).toBe("FORBIDDEN");
      expect(await w.qcode("staff:list", { venueId: v1() })).toBe("FORBIDDEN");
    }
  });

  it("deactivation ends access at once", async () => {
    await w.as("maria.m");
    await w.m("staff:deactivate", { userId: uid("kevin.d") });
    const r = await w.m<{ ok: boolean; error?: string }>("auth:signIn", { login: "kevin.d", password: DEMO_PASSWORD, secret: previewSecret() });
    expect(r).toMatchObject({ ok: false, error: "INVALID_CREDENTIALS" });
  });

  it("the GM proposes, the director approves: primary changes and the history keeps both", async () => {
    await w.as("elena.g");
    const { historyId, status } = await w.m<{ historyId: string; status: string }>("staff:promote", { userId: uid("pedro.l"), toPosition: "runner", effectiveFrom: "2026-11-01" });
    expect(status).toBe("pending");
    expect(w.user("pedro.l").primaryPosition).toBe("busser");
    expect(w.rows("outbound").some((o) => o.userId === uid("victor.h") && o.topic === "approval")).toBe(true);
    expect(await w.code("staff:decidePromotion", { historyId, approve: true })).toBe("FORBIDDEN");
    await w.as("victor.h");
    const pending = await w.q<Array<{ _id: string }>>("staff:pendingPromotions");
    expect(pending.some((p) => p._id === historyId)).toBe(true);
    await w.m("staff:decidePromotion", { historyId, approve: true });
    expect(w.user("pedro.l").primaryPosition).toBe("runner");
    const hist = w.rows("positionHistory").filter((h) => h.userId === uid("pedro.l"));
    expect(hist.map((h) => h.toPosition)).toEqual(expect.arrayContaining(["busser", "runner"]));
    expect(w.rows("auditLogs").some((a) => a.action === "staff.promotion_decided")).toBe(true);
  });

  it("a lead proposes for their own team only, below their layer", async () => {
    await w.as("luis.c");
    await w.m("staff:promote", { userId: uid("kevin.d"), toPosition: "runner", effectiveFrom: "2026-11-01" });
    expect(await w.code("staff:promote", { userId: uid("lucia.f"), toPosition: "bartender", effectiveFrom: "2026-11-01" })).toBe("FORBIDDEN");
    expect(await w.code("staff:promote", { userId: uid("ana.p"), toPosition: "captain", effectiveFrom: "2026-11-01" })).toBe("FORBIDDEN");
    await w.as("ana.p");
    expect(await w.code("staff:promote", { userId: uid("kevin.d"), toPosition: "runner", effectiveFrom: "2026-11-01" })).toBe("FORBIDDEN");
  });
});

describe("rules", () => {
  it("forMe lists company and position sets; Jade still has to confirm", async () => {
    await w.as("jade.w");
    const r = await w.q<{ mustAck: boolean; sets: Array<{ set: { _id: string; scope: string; position: string | null; version: number }; mustAck: boolean }> }>("rules:forMe", {});
    expect(r.mustAck).toBe(true);
    expect(r.sets.map((s) => s.set.scope)).toEqual(expect.arrayContaining(["company", "position"]));
    for (const s of r.sets) await w.m("rules:acknowledge", { setId: s.set._id, version: s.set.version });
    expect((await w.q<{ mustAck: boolean }>("rules:forMe", {})).mustAck).toBe(false);
  });

  it("a manager publishes a venue copy of a position set; staff must confirm again", async () => {
    await w.as("maria.m");
    const rules = [{ title: { en: "Polish every stem", es: "Pule cada tallo" }, body: { en: "b", es: "b" }, howTo: { en: "h", es: "h" } }];
    expect(await w.code("rules:upsertSet", { scope: "company", rules })).toBe("FORBIDDEN");
    const { version } = await w.m<{ version: number }>("rules:upsertSet", { scope: "position", position: "polisher", venueId: v1(), rules });
    expect(version).toBe(2);
    expect(w.rows("outbound").some((o) => o.userId === uid("omar.b") && o.topic === "message")).toBe(true);
    await w.as("omar.b");
    expect((await w.q<{ mustAck: boolean }>("rules:forMe", {})).mustAck).toBe(true);
    await w.as("ana.p");
    expect(await w.code("rules:upsertSet", { scope: "venue", venueId: v1(), rules })).toBe("FORBIDDEN");
  });
});

describe("warnings through the chain", () => {
  it("a captain proposes for a busser; the manager issues; the person gets a generic push", async () => {
    await w.as("luis.c");
    const { proposalId } = await w.m<{ proposalId: string }>("warnings:propose", { ...minor("kevin.d", "company", "spills"), note: "SECRET-NOTE-TEXT", formMs: 15_000 });
    expect(w.rows("warnings").some((x) => x.note === "SECRET-NOTE-TEXT")).toBe(false);
    expect(w.rows("outbound").some((o) => o.userId === uid("maria.m") && o.topic === "warning")).toBe(true);
    expect(await w.code("warnings:issue", { proposalId })).toBe("FORBIDDEN");
    await w.as("maria.m");
    const props = await w.q<Array<{ _id: string }>>("warnings:proposals", { venueId: v1() });
    expect(props.some((p) => p._id === proposalId)).toBe(true);
    const r = await w.m<{ state: string }>("warnings:issue", { proposalId });
    expect(r.state).toBe("review");
    const push = w.rows("outbound").filter((o) => o.userId === uid("kevin.d") && o.topic === "warning");
    expect(push.length).toBe(1);
    expect(JSON.stringify(push[0]!.payload)).not.toContain("SECRET-NOTE-TEXT");
    expect(w.rows("auditLogs").filter((a) => a.action === "warning.proposed" || a.action === "warning.issued")).toHaveLength(2);
    expect(await w.code("warnings:issue", { proposalId })).toBe("INVALID_TRANSITION");
  });

  it("leads propose only for their own team, never issue; staff do neither (no peer to peer)", async () => {
    await w.as("luis.c");
    expect(await w.code("warnings:propose", minor("lucia.f", "company", "phones"))).toBe("FORBIDDEN");
    expect(await w.code("warnings:propose", minor("claire.d", "company", "phones"))).toBe("FORBIDDEN");
    expect(await w.code("warnings:issue", minor("kevin.d", "company", "phones"))).toBe("FORBIDDEN");
    await w.as("sam.r");
    await w.m("warnings:propose", minor("lucia.f", "company", "phones"));
    await w.as("rosa.h");
    await w.m("warnings:propose", minor("ken.w", "company", "phones"));
    expect(await w.code("warnings:propose", minor("ana.p", "company", "phones"))).toBe("FORBIDDEN");
    for (const staff of ["ana.p", "kevin.d", "lucia.f", "irene.k"]) {
      await w.as(staff);
      expect(await w.code("warnings:propose", minor("jade.w", "company", "phones"))).toBe("FORBIDDEN");
      expect(await w.code("warnings:issue", minor("jade.w", "company", "phones"))).toBe("FORBIDDEN");
      expect(await w.code("messages:send", { venueIds: [v1()], title: { en: "a", es: "a" }, body: { en: "b", es: "b" }, requiresConfirmation: false })).toBe("FORBIDDEN");
      expect(await w.qcode("warnings:forUser", { userId: uid("jade.w"), venueId: v1() })).toBe("FORBIDDEN");
      expect(await w.qcode("warnings:people", { venueId: v1() })).toBe("FORBIDDEN");
    }
  });

  it("rules must apply to the person (RULE_REQUIRED, RULE_NOT_FOR_POSITION)", async () => {
    await w.as("maria.m");
    expect(await w.code("warnings:issue", { venueId: v1(), userId: uid("ana.p"), severity: "minor" })).toBe("RULE_REQUIRED");
    expect(await w.code("warnings:issue", { ...minor("ana.p", "company", "phones"), ruleId: w.rule("barback", "glassware") })).toBe("RULE_NOT_FOR_POSITION");
    const rules = await w.q<Array<{ key: string }>>("warnings:rulesFor", { venueId: v1(), userId: uid("lucia.f") });
    expect(rules.map((r) => r.key)).toEqual(expect.arrayContaining(["shortages", "glassware", "phones"]));
  });

  it("keeps venues apart (VENUE_FORBIDDEN)", async () => {
    await w.as("james.k");
    expect(await w.code("warnings:issue", minor("ana.p", "company", "phones"))).toBe("VENUE_FORBIDDEN");
    expect(await w.qcode("warnings:forVenue", { venueId: v1() })).toBe("VENUE_FORBIDDEN");
    expect(await w.qcode("warnings:proposals", { venueId: v1() })).toBe("VENUE_FORBIDDEN");
  });

  it("a captain reads their own team only, read-only; the manager reads the venue", async () => {
    await w.as("luis.c");
    const lead = await w.q<{ items: Array<{ personName: string }>; readOnly: boolean; canVoid: boolean }>("warnings:forVenue", { venueId: v1() });
    expect(lead.readOnly).toBe(true);
    expect(lead.canVoid).toBe(false);
    expect(new Set(lead.items.map((i) => i.personName))).toEqual(new Set(["Kevin Duarte", "Jade Williams"]));
    await w.as("sam.r");
    expect((await w.q<{ items: unknown[] }>("warnings:forVenue", { venueId: v1() })).items).toHaveLength(0);
    await w.as("maria.m");
    expect((await w.q<{ items: unknown[] }>("warnings:forVenue", { venueId: v1() })).items.length).toBe(5);
  });

  it("the person acknowledges with a response; voids within 24 h by managers only", async () => {
    const pending = w.rows("warnings").find((x) => x.userId === uid("kevin.d") && !x.acknowledgedAt)!;
    await w.as("ana.p");
    expect(await w.code("warnings:acknowledge", { warningId: pending._id })).toBe("FORBIDDEN");
    await w.as("kevin.d");
    await w.m("warnings:acknowledge", { warningId: pending._id, response: "Understood." });
    expect(w.rows("warnings").find((x) => x._id === pending._id)!.response).toBe("Understood.");
    await w.as("maria.m");
    const { warningId } = await w.m<{ warningId: string }>("warnings:issue", minor("ana.p", "company", "uniform"));
    await w.as("luis.c");
    expect(await w.code("warnings:void", { warningId, reason: "Wrong person" })).toBe("FORBIDDEN");
    await w.as("maria.m");
    expect(await w.code("warnings:void", { warningId, reason: "" })).toBe("INVALID_INPUT");
    await w.m("warnings:void", { warningId, reason: "Wrong person" });
    const old = w.rows("warnings").find((x) => x.userId === uid("kevin.d") && (x.at as number) < Date.now() - 5 * 24 * 3600_000)!;
    expect(await w.code("warnings:void", { warningId: old._id, reason: "Too old" })).toBe("TOO_LATE");
  });

  it("mine returns only my own warnings and my state", async () => {
    await w.as("kevin.d");
    const mine = await w.q<{ state: string; items: Array<{ personName: string; proposedByName: string | null }> }>("warnings:mine");
    expect(mine.items.length).toBe(4);
    expect(mine.items.every((i) => i.personName === "Kevin Duarte" && i.proposedByName === "Luis Castillo")).toBe(true);
    expect(mine.state).toBe("review");
    await w.as("ana.p");
    expect((await w.q<{ items: unknown[] }>("warnings:mine")).items).toHaveLength(0);
  });

  it("proposals waiting more than 24 h escalate to the GM, once", async () => {
    await w.as("luis.c");
    const { proposalId } = await w.m<{ proposalId: string }>("warnings:propose", minor("kevin.d", "company", "spills"));
    const p = w.rows("warningProposals").find((x) => x._id === proposalId)!;
    p.at = Date.now() - 25 * 3600_000;
    const before = w.rows("outbound").length;
    await w.m("warnings:escalate");
    const sent = w.rows("outbound").slice(before);
    expect(sent.some((o) => o.userId === uid("elena.g") && o.topic === "escalation")).toBe(true);
    expect(JSON.stringify(sent.map((o) => o.payload))).not.toContain("spill");
    expect(w.rows("auditLogs").some((a) => a.action === "warning.escalated" && a.entityId === proposalId)).toBe(true);
    const again = w.rows("outbound").length;
    await w.m("warnings:escalate");
    expect(w.rows("outbound").length).toBe(again);
  });

  it("a manager discards a proposal; the digest goes to the director and the owner only", async () => {
    await w.as("maria.m");
    const open = (await w.q<Array<{ _id: string }>>("warnings:proposals", { venueId: v1() }))[0]!;
    await w.m("warnings:discard", { proposalId: open._id, reason: "Talked it through" });
    expect(w.rows("warningProposals").find((x) => x._id === open._id)!.status).toBe("discarded");
    const before = w.rows("outbound").length;
    await w.m("warnings:digest");
    const sent = w.rows("outbound").slice(before);
    expect(sent.length).toBeGreaterThan(0);
    expect(new Set(sent.map((o) => o.userId))).toEqual(new Set([uid("owner"), uid("victor.h")]));
  });

  it("thresholds: corporate only, ordered", async () => {
    await w.as("maria.m");
    expect(await w.code("warnings:setThresholds", { attentionMinor: 1, followUpMinor: 3, followUpMajor: 1, reviewMajor: 2, windowDays: 30 })).toBe("FORBIDDEN");
    await w.as("owner");
    expect(await w.code("warnings:setThresholds", { attentionMinor: 4, followUpMinor: 3, followUpMajor: 1, reviewMajor: 2, windowDays: 30 })).toBe("INVALID_INPUT");
    await w.m("warnings:setThresholds", { attentionMinor: 1, followUpMinor: 2, followUpMajor: 2, reviewMajor: 3, windowDays: 14 });
    expect(w.rows("auditLogs").some((a) => a.action === "warning.thresholds_changed")).toBe(true);
  });
});

describe("announcements", () => {
  const msg = { title: { en: "Pre-shift at 4", es: "Pre-shift a las 4" }, body: { en: "Be on time.", es: "Llega a tiempo." }, requiresConfirmation: true };

  it("one venue, one read row per recipient, never the sender or corporate", async () => {
    await w.as("maria.m");
    const r = await w.m<{ messageId: string; recipients: number }>("messages:send", { ...msg, venueIds: [v1()] });
    const reads = w.rows("messageReads").filter((x) => x.messageId === r.messageId);
    expect(reads.length).toBe(r.recipients);
    const ids = new Set(reads.map((x) => x.userId));
    expect(ids.has(uid("maria.m")) || ids.has(uid("owner")) || ids.has(uid("emma.t"))).toBe(false);
    expect(w.rows("auditLogs").some((a) => a.action === "message.sent")).toBe(true);
  });

  it("audience by position; NO_RECIPIENTS; VENUE_FORBIDDEN; many venues only for corporate", async () => {
    await w.as("james.k");
    expect(await w.code("messages:send", { ...msg, venueIds: [w.venue("v2")._id], positions: ["dishwasher"] })).toBe("NO_RECIPIENTS");
    expect(await w.code("messages:send", { ...msg, venueIds: [v1()] })).toBe("VENUE_FORBIDDEN");
    await w.as("victor.h");
    const r = await w.m<{ recipients: number }>("messages:send", { ...msg, venueIds: [v1(), w.venue("v2")._id], positions: ["server"] });
    // Servers of both venues plus Carlos, a runner enabled to work as a server.
    expect(r.recipients).toBe(5);
  });

  it("marks read, confirms, and the sender sees names by state", async () => {
    await w.as("maria.m");
    const { messageId } = await w.m<{ messageId: string }>("messages:send", { ...msg, venueIds: [v1()], positions: ["server"] });
    await w.as("ana.p");
    const before = await w.q<number>("messages:unreadCount");
    await w.m("messages:markRead", { messageId });
    expect(await w.q<number>("messages:unreadCount")).toBe(before - 1);
    await w.m("messages:confirm", { messageId });
    expect(await w.qcode("messages:receipts", { messageId })).toBe("NOT_FOUND");
    await w.as("maria.m");
    const r = await w.q<{ total: number; state: string; people: Array<{ name: string; state: string }> }>("messages:receipts", { messageId });
    expect(r.total).toBe(4);
    expect(r.state).toBe("pending");
    expect(r.people.find((p) => p.name === "Ana Pérez")!.state).toBe("confirmed");
    expect(JSON.stringify(r)).not.toContain("readRate");
    await w.as("sam.r");
    expect(await w.qcode("messages:get", { messageId })).toBe("NOT_FOUND");
  });
});

describe("tip policy (P3)", () => {
  const text = { en: "Written policy", es: "Política escrita" };

  it("managers cannot be in the pool; owner only; tipped staff confirm", async () => {
    await w.as("maria.m");
    expect(await w.code("tips:setPolicy", { venueId: v1(), participants: [{ position: "server", points: 1 }], text })).toBe("FORBIDDEN");
    await w.as("owner");
    expect(await w.code("tips:setPolicy", { venueId: v1(), participants: [{ position: "server", points: 1 }, { position: "floor_manager", points: 1 }], text })).toBe("MANAGER_IN_POOL");
    const { policyId, version } = await w.m<{ policyId: string; version: number }>("tips:setPolicy", { venueId: v1(), participants: [{ position: "server", points: 1 }, { position: "busser", points: 0.5 }], text });
    expect(JSON.stringify(w.rows("tipPolicies"))).not.toMatch(/amount|cents/i);
    await w.as("ana.p");
    expect((await w.q<{ mustAck: boolean }>("tips:policy", { venueId: v1() })).mustAck).toBe(true);
    await w.m("tips:acknowledge", { policyId, version });
    expect((await w.q<{ mustAck: boolean }>("tips:policy", { venueId: v1() })).mustAck).toBe(false);
    await w.as("sam.r");
    expect(await w.code("tips:acknowledge", { policyId, version })).toBe("FORBIDDEN");
  });
});

describe("audit and files", () => {
  it("the audit log is owner only", async () => {
    await w.as("maria.m");
    expect(await w.qcode("audit:list", {})).toBe("FORBIDDEN");
    await w.as("victor.h");
    expect(await w.qcode("audit:list", {})).toBe("FORBIDDEN");
    await w.as("owner");
    expect(await w.qcode("audit:list", {})).toBe(null);
  });
});

describe("position x function x venue matrix", () => {
  // null = allowed. Every row is one person; every column one function at Midtown (v1).
  const fns = ["staff:list", "rules:sets", "warnings:proposals", "warnings:people", "org:chainOverrides", "staff:pendingPromotions"] as const;
  const matrix: Record<string, Array<string | null>> = {
    "kevin.d": ["FORBIDDEN", "FORBIDDEN", "FORBIDDEN", "FORBIDDEN", "FORBIDDEN", "FORBIDDEN"],
    "ana.p": ["FORBIDDEN", "FORBIDDEN", "FORBIDDEN", "FORBIDDEN", "FORBIDDEN", "FORBIDDEN"],
    "irene.k": ["FORBIDDEN", "FORBIDDEN", "FORBIDDEN", "FORBIDDEN", "FORBIDDEN", "FORBIDDEN"],
    "luis.c": ["FORBIDDEN", "FORBIDDEN", "FORBIDDEN", null, "FORBIDDEN", "FORBIDDEN"],
    "maria.m": [null, null, null, null, "FORBIDDEN", "FORBIDDEN"],
    "elena.g": [null, null, null, null, "FORBIDDEN", "FORBIDDEN"],
    "james.k": ["VENUE_FORBIDDEN", "VENUE_FORBIDDEN", "VENUE_FORBIDDEN", "VENUE_FORBIDDEN", "FORBIDDEN", "FORBIDDEN"],
    "victor.h": [null, null, null, null, null, null],
    owner: [null, null, null, null, null, null],
  };
  for (const [user, expected] of Object.entries(matrix)) {
    it(`${user}`, async () => {
      await w.as(user);
      const got = [];
      for (const fn of fns) got.push(await w.qcode(fn, fn === "staff:pendingPromotions" ? {} : { venueId: v1() }));
      expect(got).toEqual(expected);
    });
  }
});
