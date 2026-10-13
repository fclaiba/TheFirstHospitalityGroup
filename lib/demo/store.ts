"use client";

// Preview store (ADR 0010): the demo database, persisted locally and synced across tabs, so a server's phone tab, the
// manager tab and the owner tab see the same shift live. Seeded by the real seed:demo mutation on first load.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEMO_VERSION, emptyState } from "./state";
import type { DemoState } from "./state";
import { loadEngine } from "./load";

const KEY = "tfhg-preview-v1";

type Store = DemoState & { hydrated: boolean; seeding: boolean };

export const useDemoStore = create<Store>()(
  persist((): Store => ({ ...emptyState(), hydrated: false, seeding: false }), {
    name: KEY,
    storage: createJSONStorage(() => localStorage),
    partialize: ({ hydrated: _h, seeding: _s, ...rest }) => rest,
    // Sync storage rehydrates inside create(), before useDemoStore is assigned: defer one microtask.
    onRehydrateStorage: () => (state) =>
      queueMicrotask(() => {
        if (!state?.tables?.users?.length || state.version !== DEMO_VERSION) void reseed();
        else useDemoStore.setState({ hydrated: true });
      }),
  }),
);

const timers = new Set<ReturnType<typeof setTimeout>>();

export function getDemoState(): DemoState {
  const { hydrated: _h, seeding: _s, ...rest } = useDemoStore.getState();
  return rest;
}

/** Runs a mutation through the engine, keeps its writes, and arms what it scheduled (requests.escalate at 90 s). */
export async function commit(name: string, args: unknown, opts: { seeding?: boolean } = {}): Promise<unknown> {
  if (!opts.seeding) await whenReady();
  const { runMutation } = await loadEngine();
  const { result, state, scheduled } = await runMutation(getDemoState(), name, args);
  useDemoStore.setState(state);
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
  useDemoStore.setState({ session, seeding: false, hydrated: true });
}

export function setSession(subject: string | null) {
  useDemoStore.setState({ session: subject });
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
