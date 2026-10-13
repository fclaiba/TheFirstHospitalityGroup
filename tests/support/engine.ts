// Backend test harness (BLUEPRINT 15, ADR 0028): runs the real Convex handlers over the in-memory database with the
// demo seed. `as(username)` signs in through the bridge; `q` and `m` run a query or a mutation as that person and
// keep mutation writes, like a sequence of Convex transactions.
import { previewSecret, runMutation, runQuery } from "../../lib/demo/engine";
import { emptyState } from "../../lib/demo/state";
import type { DemoState } from "../../lib/demo/state";
import type { Doc } from "../../lib/demo/db";
import { DEMO_PASSWORD } from "../../lib/demo/accounts";

let seedCache: DemoState | null = null;

/** A fresh copy of the seeded demo database (seeded once per test file). */
export async function seeded(): Promise<DemoState> {
  if (!seedCache) seedCache = (await runMutation(emptyState(), "seed:demo", {})).state;
  return structuredClone(seedCache);
}

export class World {
  constructor(public state: DemoState) {}

  static async create(): Promise<World> {
    return new World(await seeded());
  }

  /** Signs in as a demo person (or signs out with null). */
  async as(username: string | null): Promise<this> {
    if (!username) {
      this.state = { ...this.state, session: null };
      return this;
    }
    const { result, state } = await runMutation({ ...this.state, session: null }, "auth:signIn", { login: username, password: DEMO_PASSWORD, secret: previewSecret() });
    const r = result as { ok: boolean; subject?: string; error?: string };
    if (!r.ok || !r.subject) throw new Error(`sign-in failed for ${username}: ${r.error}`);
    this.state = { ...state, session: r.subject };
    return this;
  }

  async q<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    return (await runQuery(this.state, name, args)) as T;
  }

  async m<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const { result, state } = await runMutation(this.state, name, args);
    this.state = { ...state, session: this.state.session };
    return result as T;
  }

  /** Runs a mutation and returns the error code it throws (or null when it succeeds). */
  async code(name: string, args: Record<string, unknown> = {}): Promise<string | null> {
    try {
      await this.m(name, args);
      return null;
    } catch (e) {
      const data = (e as { data?: { code?: string } }).data;
      if (data?.code) return data.code;
      throw e;
    }
  }

  async qcode(name: string, args: Record<string, unknown> = {}): Promise<string | null> {
    try {
      await this.q(name, args);
      return null;
    } catch (e) {
      const data = (e as { data?: { code?: string } }).data;
      if (data?.code) return data.code;
      throw e;
    }
  }

  rows(table: string): Doc[] {
    return this.state.tables[table] ?? [];
  }

  user(username: string): Doc {
    const u = this.rows("users").find((x) => x.username === username);
    if (!u) throw new Error(`no user ${username}`);
    return u;
  }

  venue(slug: "v1" | "v2" | "v3" | "v4"): Doc {
    return this.rows("venues").find((v) => v.slug === slug)!;
  }

  /** Tonight's open dinner shift at Midtown (seeded). */
  liveShift(): Doc {
    return this.rows("shifts").find((s) => s.status === "open")!;
  }

  /** This week's published schedule week of a venue (seeded). */
  week(slug: "v1" | "v2" | "v3" | "v4" = "v1"): Doc {
    const venueId = this.venue(slug)._id;
    return this.rows("scheduleWeeks").filter((w) => w.venueId === venueId && w.status === "published")[0]!;
  }

  /** The rule with this key in a set ("company" or a position). */
  rule(set: string, key: string): string {
    const s = this.rows("ruleSets").find((x) => (set === "company" ? x.scope === "company" : x.scope === "position" && x.position === set))!;
    return this.rows("rules").find((r) => r.setId === s._id && r.key === key)!._id;
  }
}
