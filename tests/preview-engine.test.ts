import { describe, expect, it } from "vitest";
import { previewSecret, runMutation, runQuery } from "../lib/demo/engine";
import { emptyState } from "../lib/demo/state";
import type { DemoState } from "../lib/demo/state";
import { DEMO_PASSWORD } from "../lib/demo/accounts";

// ADR 0028: preview mode runs the real Convex handlers over the in-memory database. These tests prove the engine
// supports what the handlers use: the demo seed, indexes, auth, and transactional rollback on a throw.

async function seeded(): Promise<DemoState> {
  const { state } = await runMutation(emptyState(), "seed:demo", {});
  return state;
}

async function signIn(state: DemoState, login: string): Promise<DemoState> {
  const { result, state: next } = await runMutation(state, "auth:signIn", { login, password: DEMO_PASSWORD, secret: previewSecret() });
  const r = result as { ok: boolean; subject?: string };
  expect(r.ok).toBe(true);
  return { ...next, session: r.subject! };
}

describe("preview engine", () => {
  it("seeds the demo company with four venues and people per role", async () => {
    const s = await seeded();
    expect(s.tables.venues).toHaveLength(4);
    expect(s.tables.users!.length).toBeGreaterThan(20);
    expect(s.tables.shifts!.some((x) => x.status === "open")).toBe(true);
  }, 30_000);

  it("signs in through the bridge and answers me with venues", async () => {
    const s = await signIn(await seeded(), "ana.p");
    const me = (await runQuery(s, "auth:me", {})) as { role: string; venues: Array<{ name: string }> };
    expect(me.role).toBe("server");
    expect(me.venues.map((v) => v.name)).toEqual(["The First Midtown"]);
  }, 30_000);

  it("rejects a wrong password with INVALID_CREDENTIALS and counts the failure", async () => {
    const s = await seeded();
    const { result, state } = await runMutation(s, "auth:signIn", { login: "ana.p", password: "nope", secret: previewSecret() });
    expect(result).toEqual({ ok: false, error: "INVALID_CREDENTIALS" });
    expect(state.tables.users!.find((u) => u.username === "ana.p")!.failedLogins).toBe(1);
  }, 30_000);

  it("keeps nothing from a mutation that throws", async () => {
    const s = await signIn(await seeded(), "ana.p");
    const before = JSON.stringify(s.tables.shifts);
    await expect(runMutation(s, "shifts:open", { venueId: s.tables.venues![0]!._id, service: "dinner", date: "2026-01-01" })).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
    expect(JSON.stringify(s.tables.shifts)).toBe(before);
  }, 30_000);

  it("gives staff their run for tonight", async () => {
    const s = await signIn(await seeded(), "ana.p");
    const venueId = s.tables.venues![0]!._id;
    const r = (await runQuery(s, "tasks:myRun", { venueId })) as { runs: Array<{ items: unknown[] }> };
    expect(r.runs.length).toBeGreaterThan(0);
    expect(r.runs[0]!.items.length).toBeGreaterThan(0);
  }, 30_000);
});
