"use client";

// Preview store (ADR 0010): the demo database, persisted locally and synced across tabs, so a server's phone tab, the
// manager tab and the owner tab see the same shift live. Seeded by the real seed:demo mutation on first load.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEMO_VERSION, emptyState } from "./state";
import type { DemoState } from "./state";
import { loadEngine } from "./load";
import { parseSubject, sessionMatches } from "../domain/session";

const KEY = "tfhg-preview-v1";
const SESSION_KEY = "tfhg-preview-session";

function savedSession(): string | null {
  try {
    return typeof window === "undefined" ? null : sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

type Store = DemoState & { hydrated: boolean; seeding: boolean };

export const useDemoStore = create<Store>()(
  persist((): Store => ({ ...emptyState(), session: savedSession(), hydrated: false, seeding: false }), {
    name: KEY,
    storage: createJSONStorage(() => localStorage),
    partialize: ({ hydrated: _h, seeding: _s, session: _session, ...rest }) => rest,
    // Legacy stores included identity. Never import another tab's identity with its shared records.
    merge: (persisted, current) => ({ ...current, ...(persisted as Partial<DemoState>), session: current.session }),
    // Sync storage rehydrates inside create(), before useDemoStore is assigned: defer one microtask.
    onRehydrateStorage: () => (state) =>
      queueMicrotask(() => {
        if (!state?.tables?.users?.length || state.version !== DEMO_VERSION) void reseed();
        else if (!useDemoStore.getState().hydrated) useDemoStore.setState({ hydrated: true });
      }),
  }),
);

const timers = new Set<ReturnType<typeof setTimeout>>();
let pendingCommit: Promise<unknown> = Promise.resolve();

export function getDemoState(): DemoState {
  const { hydrated: _h, seeding: _s, ...rest } = useDemoStore.getState();
  return rest;
}

/** Runs a mutation through the engine, keeps its writes, and arms what it scheduled (requests.escalate at 90 s). */
export async function commit(name: string, args: unknown, opts: { seeding?: boolean } = {}): Promise<unknown> {
  const initiatingSubject = useDemoStore.getState().session;
  // Wait before joining the queue so bootstrap can populate an empty store.
  if (!opts.seeding) await whenReady();
  // Each transaction reads the last committed state. Concurrent UI saves must not overwrite each other.
  const next = pendingCommit.then(() => {
    if (typeof navigator !== "undefined" && navigator.locks) {
      return navigator.locks.request(`${KEY}-transaction`, async () => {
        // Another tab may have committed while this one waited for the origin-wide lock.
        if (!opts.seeding) await useDemoStore.persist.rehydrate();
        return commitOne(name, args, initiatingSubject);
      });
    }
    return commitOne(name, args, initiatingSubject);
  });
  pendingCommit = next.catch(() => undefined);
  return next;
}

async function commitOne(name: string, args: unknown, initiatingSubject: string | null): Promise<unknown> {
  const { runMutation } = await loadEngine();
  const { result, state, scheduled } = await runMutation({ ...getDemoState(), session: initiatingSubject }, name, args);
  // A sign-out or account switch while the handler awaited must remain effective.
  useDemoStore.setState({ ...state, session: useDemoStore.getState().session });
  for (const s of scheduled) {
    const id = setTimeout(
      () => {
        timers.delete(id);
        void commit(s.name, s.args).catch(() => undefined);
      },
      Math.max(0, s.at - Date.now()),
    );
    timers.add(id);
  }
  return result;
}

export async function reseed(keepSession = false): Promise<void> {
  const session = keepSession ? useDemoStore.getState().session : null;
  useDemoStore.setState({ ...emptyState(), seeding: true, hydrated: false });
  await commit("seed:demo", {}, { seeding: true });
  setSession(session);
  useDemoStore.setState({ seeding: false, hydrated: true });
}

export function setSession(subject: string | null) {
  try {
    if (subject) sessionStorage.setItem(SESSION_KEY, subject);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Storage restrictions still allow an in-memory preview for this visit.
  }
  useDemoStore.setState({ session: subject });
}

/** Mirrors subject validity before mounting protected queries; handlers remain the permission authority. */
export function hasValidSession(state: DemoState): boolean {
  const subject = state.session && parseSubject(state.session);
  if (!subject) return false;
  return !!state.tables.users?.some((u) => u.active && sessionMatches(u.sessionVersion as number | undefined, subject) &&
    (subject.kind === "user" ? u.username === subject.username : u.email === subject.email));
}

/** Stores a compressed photo for preview uploads and returns its _storage id. */
export function storeBlob(dataUrl: string, contentType: string, size: number): string {
  const st = getDemoState();
  const id = `_storage|${String(st.seq).padStart(6, "0")}`;
  const doc = { _id: id, _creationTime: Date.now(), contentType, size, sha256: "" };
  useDemoStore.setState({ seq: st.seq + 1, blobs: { ...st.blobs, [id]: dataUrl }, tables: { ...st.tables, _storage: [...(st.tables._storage ?? []), doc] } });
  return id;
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) void useDemoStore.persist.rehydrate();
  });
}

/** Resolves once the demo database is hydrated or seeded, so nothing runs against an empty store. */
export function whenReady(): Promise<void> {
  if (useDemoStore.getState().hydrated) return Promise.resolve();
  return new Promise((resolve) => {
    const stop = useDemoStore.subscribe((s) => {
      if (s.hydrated) {
        stop();
        resolve();
      }
    });
  });
}
