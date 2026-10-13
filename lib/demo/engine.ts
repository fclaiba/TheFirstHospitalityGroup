// Preview engine (ADR 0010, ADR 0018): runs the real Convex handlers (convex/*.ts) against the in-memory database in
// lib/demo/db.ts, so preview mode and production share one implementation of every contract and rule.
import { getFunctionName } from "convex/server";
import schema from "../../convex/schema";
import { FakeDb, indexesFromSchema } from "./db";
import type { Doc } from "./db";
import type { DemoState } from "./state";
import { REGISTRY } from "./registry";

const INDEXES = indexesFromSchema(schema);

/** Bridge functions check a shared secret; in preview the engine holds one that only exists in this browser tab. */
const PREVIEW_SECRET = "preview-bridge";
(globalThis as { __TF_PREVIEW_BRIDGE__?: string }).__TF_PREVIEW_BRIDGE__ = PREVIEW_SECRET;
export const previewSecret = () => PREVIEW_SECRET;

type Registered = { _handler: (ctx: unknown, args: unknown) => unknown; isQuery?: boolean; isMutation?: boolean; isAction?: boolean };

function lookup(name: string): Registered | null {
  const [mod, fn = "default"] = name.split(":");
  const m = REGISTRY[mod!] as Record<string, Registered> | undefined;
  return m?.[fn] ?? null;
}


type Scheduled = { name: string; args: unknown; at: number };

function makeCtx(state: DemoState, scheduled: Scheduled[], readonly: boolean) {
  const db = new FakeDb(state.tables, INDEXES, () => String(state.seq++).padStart(6, "0"));
  const auth = {
    getUserIdentity: async () => (state.session ? { subject: state.session, tokenIdentifier: `preview|${state.session}`, issuer: "preview" } : null),
  };
  const storage = {
    getUrl: async (id: string) => state.blobs[id] ?? null,
    generateUploadUrl: async () => "preview://upload",
    delete: async (id: string) => {
      delete state.blobs[id];
      await db.delete(id).catch(() => undefined);
    },
    getMetadata: async (id: string) => db.get(id),
  };
  const scheduler = {
    runAfter: async (delayMs: number, ref: unknown, args: unknown) => {
      scheduled.push({ name: getFunctionName(ref as never), args, at: Date.now() + delayMs });
      return `scheduled|${state.seq++}`;
    },
    runAt: async (ts: number, ref: unknown, args: unknown) => {
      scheduled.push({ name: getFunctionName(ref as never), args, at: ts });
      return `scheduled|${state.seq++}`;
    },
    cancel: async () => undefined,
  };
  if (readonly) {
    const deny = async () => {
      throw new Error("Queries cannot write");
    };
    Object.assign(db, { insert: deny, patch: deny, replace: deny, delete: deny });
  }
  return { db, auth, storage, scheduler };
}

export function runQuery(state: DemoState, name: string, args: unknown): unknown {
  const fn = lookup(name);
  if (!fn) throw new Error(`Preview handler missing for ${name}`);
  return fn._handler(makeCtx(state, [], true), args ?? {});
}

/**
 * Runs a mutation on a copy of the state and returns the new state, like a Convex transaction: on a throw nothing is
 * kept. Functions it scheduled come back so the caller can run them later (requests.escalate after 90 s).
 */
export async function runMutation(state: DemoState, name: string, args: unknown): Promise<{ result: unknown; state: DemoState; scheduled: Scheduled[] }> {
  const fn = lookup(name);
  if (!fn) throw new Error(`Preview handler missing for ${name}`);
  const draft = structuredClone(state);
  const scheduled: Scheduled[] = [];
  const result = await fn._handler(makeCtx(draft, scheduled, false), args ?? {});
  return { result, state: draft, scheduled: scheduled.filter((s) => lookup(s.name)?.isMutation) };
}

export const isRegistered = (name: string) => !!lookup(name);
export type { Doc };
