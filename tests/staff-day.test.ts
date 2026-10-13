import { describe, expect, it } from "vitest";
import { World } from "./support/engine";
import type { Doc } from "../lib/demo/db";

// Staff day (BLUEPRINT 2.2, 15): Today, checklists and house rules, with the role × venue matrix.

type Summary = {
  shift: { status: string } | null;
  rulesPending: boolean;
  runs: Array<{ _id: string; total: number; done: number; next: { en: string } | null }>;
  section: { name: string; tables: string[]; notes: Array<{ table: string; kind: string }> } | null;
  openRequests: number;
  unread: { count: number };
  pendingWarnings: number;
  notes: { shift: string | null; fromLastClose: string | null };
};

const runsOf = (w: World, username: string, shiftId: string) => w.rows("taskRuns").filter((r) => r.userId === w.user(username)._id && r.shiftId === shiftId);

async function storedPhoto(w: World): Promise<string> {
  const id = `_storage|9${String(w.state.seq++).padStart(5, "0")}`;
  (w.state.tables._storage ??= []).push({ _id: id, _creationTime: Date.now(), contentType: "image/jpeg", size: 120_000 } as Doc);
  await w.m("files:register", { storageId: id, purpose: "task" });
  return id;
}

describe("today.summary", () => {
  it("gives a server tonight's runs, section, notes and open requests", async () => {
    const w = await (await World.create()).as("ana.p");
    const s = await w.q<Summary>("today:summary", { venueId: w.venue("v1")._id });
    expect(s.shift?.status).toBe("open");
    expect(s.rulesPending).toBe(false);
    expect(s.runs.length).toBeGreaterThan(0);
    expect(s.runs[0]!.done).toBe(2);
    expect(s.runs[0]!.next).not.toBeNull();
    expect(s.section?.name).toBe("B");
    expect(s.section?.notes.map((n) => n.table).sort()).toEqual(["22", "24"]);
    expect(s.openRequests).toBe(3);
    expect(s.notes.shift).toContain("VIP");
    expect(s.notes.fromLastClose).toContain("Private party");
  }, 30_000);

  it("tells a new hire to confirm the rules and counts her pending warning", async () => {
    const w = await (await World.create()).as("jade.w");
    const s = await w.q<Summary>("today:summary", { venueId: w.venue("v1")._id });
    expect(s.rulesPending).toBe(true);
    expect(s.pendingWarnings).toBe(1);
  }, 30_000);

  it("keeps staff out of another venue", async () => {
    const w = await (await World.create()).as("emma.t");
    expect(await w.qcode("today:summary", { venueId: w.venue("v1")._id })).toBe("VENUE_FORBIDDEN");
    expect(await (await w.as(null)).qcode("today:summary", { venueId: w.venue("v1")._id })).toBe("UNAUTHENTICATED");
  }, 30_000);
});

describe("tasks.check", () => {
  it("requires a photo where the template asks for one, then accepts it", async () => {
    const w = await (await World.create()).as("ana.p");
    const shift = w.liveShift();
    const run = runsOf(w, "ana.p", shift._id)[0]!;
    // Item 1 of the server opening is "Set tables" (photo required); seeded as done without evidence.
    expect(await w.code("tasks:check", { runId: run._id, itemIndex: 1, done: false })).toBeNull();
    expect(await w.code("tasks:check", { runId: run._id, itemIndex: 1, done: true })).toBe("PHOTO_REQUIRED");
    const photo = await storedPhoto(w);
    const r = await w.m<{ progress: { done: number } }>("tasks:check", { runId: run._id, itemIndex: 1, done: true, photoId: photo });
    expect(r.progress.done).toBe(2);
    const after = w.rows("taskRuns").find((x) => x._id === run._id)!;
    expect((after.items as Array<{ photoId?: string }>)[1]!.photoId).toBe(photo);
    expect(w.rows("files").find((f) => f.storageId === photo)!.attachedTo).toBe(`taskRuns:${run._id}`);
  }, 30_000);

  it("completes a run and records completedAt", async () => {
    const w = await (await World.create()).as("carlos.g");
    const run = runsOf(w, "carlos.g", w.liveShift()._id)[0]!;
    const items = run.items as Array<{ done: boolean }>;
    let last: { complete: boolean } | null = null;
    for (const [i, it] of items.entries()) if (!it.done) last = await w.m("tasks:check", { runId: run._id, itemIndex: i, done: true });
    if (last) expect(last.complete).toBe(true);
    expect(w.rows("taskRuns").find((x) => x._id === run._id)!.completedAt).toBeTypeOf("number");
  }, 30_000);

  it("blocks checks until the new rules are confirmed (RULES_NOT_ACKNOWLEDGED)", async () => {
    const w = await (await World.create()).as("jade.w");
    const run = runsOf(w, "jade.w", w.liveShift()._id)[0]!;
    expect(await w.code("tasks:check", { runId: run._id, itemIndex: 0, done: true })).toBe("RULES_NOT_ACKNOWLEDGED");
    const rules = await w.q<{ set: { _id: string; version: number }; mustAck: boolean; rules: unknown[] }>("rules:forRole", { venueId: w.venue("v1")._id });
    expect(rules.mustAck).toBe(true);
    expect(rules.rules.length).toBeGreaterThan(0);
    expect(await w.code("rules:acknowledge", { setId: rules.set._id, version: rules.set.version + 1 })).toBe("INVALID_TRANSITION");
    await w.m("rules:acknowledge", { setId: rules.set._id, version: rules.set.version });
    expect(await w.code("tasks:check", { runId: run._id, itemIndex: 0, done: true })).toBeNull();
    const again = await w.q<{ mustAck: boolean; ackedAt: number | null }>("rules:forRole", { venueId: w.venue("v1")._id });
    expect(again.mustAck).toBe(false);
    expect(again.ackedAt).toBeTypeOf("number");
  }, 30_000);

  it("refuses a closed shift, someone else's run and another venue", async () => {
    const w = await (await World.create()).as("kevin.d");
    const closed = w.rows("taskRuns").find((r) => r.userId === w.user("kevin.d")._id && w.rows("shifts").find((s) => s._id === r.shiftId)!.status === "closed")!;
    expect(await w.code("tasks:check", { runId: closed._id, itemIndex: 0, done: false })).toBe("SHIFT_NOT_OPEN");
    const toms = runsOf(w, "tom.b", w.liveShift()._id)[0]!;
    expect(await w.code("tasks:check", { runId: toms._id, itemIndex: 0, done: true })).toBe("FORBIDDEN");
    await w.as("emma.t");
    expect(await w.code("tasks:check", { runId: toms._id, itemIndex: 0, done: true })).toBe("VENUE_FORBIDDEN");
  }, 30_000);

  it("returns my run with labels and never a late flag", async () => {
    const w = await (await World.create()).as("ana.p");
    const r = await w.q<{ runs: Array<{ late: boolean; items: Array<{ label: { en: string } }> }> }>("tasks:myRun", { venueId: w.venue("v1")._id });
    expect(r.runs.every((x) => x.late === false)).toBe(true);
    expect(r.runs[0]!.items[0]!.label.en.length).toBeGreaterThan(0);
  }, 30_000);
});

describe("rules", () => {
  const rule = (en: string) => ({ title: { en, es: `${en} es` }, body: { en: "Body", es: "Cuerpo" }, howTo: { en: "How", es: "Cómo" } });

  it("a manager publishes a venue version and everyone with the role must confirm again", async () => {
    const w = await (await World.create()).as("maria.m");
    const v1 = w.venue("v1")._id;
    const sets = await w.q<Array<{ role: string; set: { version: number; scope: string } | null; rules: Array<{ _id: string; title: { en: string }; body: { en: string; es: string }; howTo: { en: string; es: string } }> }>>("rules:sets", { venueId: v1 });
    const server = sets.find((s) => s.role === "server")!;
    expect(server.set?.scope).toBe("company");
    const kept = server.rules[0]!;
    const r = await w.m<{ version: number }>("rules:upsertSet", {
      venueId: v1,
      role: "server",
      rules: [{ id: kept._id, title: { en: "Edited", es: "Editada" }, body: kept.body, howTo: kept.howTo }, rule("Smile at the door")],
    });
    expect(r.version).toBe(2);
    expect(w.rows("auditLogs").some((a) => a.action === "rules.published")).toBe(true);
    expect(w.rows("outbound").some((o) => o.userId === w.user("ana.p")._id && o.topic === "message")).toBe(true);
    await w.as("ana.p");
    const mine = await w.q<{ mustAck: boolean; set: { version: number }; rules: Array<{ title: { en: string } }> }>("rules:forRole", { venueId: v1 });
    expect(mine.mustAck).toBe(true);
    expect(mine.set.version).toBe(2);
    expect(mine.rules.map((x) => x.title.en)).toEqual(["Edited", "Smile at the door"]);
    // Kept rule keeps its id so warnings still point at it.
    expect(w.rows("rules").find((x) => x._id === kept._id)!.retiredAt).toBeUndefined();
  }, 30_000);

  it("only the owner publishes company rules; staff cannot publish", async () => {
    const w = await (await World.create()).as("maria.m");
    expect(await w.code("rules:upsertSet", { role: "server", rules: [rule("X")] })).toBe("FORBIDDEN");
    expect(await w.code("rules:upsertSet", { venueId: w.venue("v2")._id, role: "server", rules: [rule("X")] })).toBe("VENUE_FORBIDDEN");
    await w.as("ana.p");
    expect(await w.code("rules:upsertSet", { venueId: w.venue("v1")._id, role: "server", rules: [rule("X")] })).toBe("FORBIDDEN");
    await w.as("owner");
    const r = await w.m<{ version: number }>("rules:upsertSet", { role: "kitchen", rules: [rule("Label everything")] });
    expect(r.version).toBe(2);
    expect(await w.code("rules:upsertSet", { venueId: w.venue("v1")._id, role: "kitchen", rules: [] })).toBe("INVALID_INPUT");
  }, 30_000);
});

describe("task templates", () => {
  const template = (venueId: string) => ({
    venueId,
    role: "server",
    phase: "open",
    title: { en: "Friday polish", es: "Pulido del viernes" },
    schedule: { kind: "weekly", weekdays: [5] },
    items: [{ label: { en: "Polish silver", es: "Pulir la platería" }, photoRequired: false, critical: false, minLevel: "B" }],
    dueOffsetMin: 15,
    active: true,
  });

  it("only managers edit templates of their venue, and edits bump the version", async () => {
    const w = await (await World.create()).as("ana.p");
    const v1 = w.venue("v1")._id;
    expect(await w.code("tasks:upsertTemplate", template(v1))).toBe("FORBIDDEN");
    await w.as("maria.m");
    expect(await w.code("tasks:upsertTemplate", template(w.venue("v2")._id))).toBe("VENUE_FORBIDDEN");
    const { templateId } = await w.m<{ templateId: string }>("tasks:upsertTemplate", template(v1));
    await w.m("tasks:upsertTemplate", { ...template(v1), templateId, dueOffsetMin: 20 });
    const t = w.rows("taskTemplates").find((x) => x._id === templateId)!;
    expect(t.version).toBe(2);
    expect(t.dueOffsetMin).toBe(20);
    await w.m("tasks:removeTemplate", { templateId });
    expect(w.rows("taskTemplates").find((x) => x._id === templateId)!.active).toBe(false);
    const list = await w.q<unknown[]>("tasks:templates", { venueId: v1 });
    expect(list.length).toBeGreaterThan(10);
  }, 30_000);

  it("rejects a template without both languages", async () => {
    const w = await (await World.create()).as("maria.m");
    const bad = { ...template(w.venue("v1")._id), title: { en: "Only English", es: "" } };
    expect(await w.code("tasks:upsertTemplate", bad)).toBe("INVALID_INPUT");
  }, 30_000);
});
