import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { World } from "./support/engine";

let store: typeof import("../lib/demo/store");

beforeAll(async () => {
  const data = new Map<string, string>();
  const sessions = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => sessions.get(key) ?? null,
    setItem: (key: string, value: string) => sessions.set(key, value),
    removeItem: (key: string) => sessions.delete(key),
  });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  });
  store = await import("../lib/demo/store");
});

beforeEach(async () => {
  const w = await World.create();
  await w.as("ana.p");
  store.useDemoStore.setState({ ...w.state, hydrated: true });
});

afterAll(() => vi.unstubAllGlobals());

const ana = () => store.getDemoState().tables.users!.find((u) => u.username === "ana.p")!;

describe("browser preview transactions", () => {
  it("persists shared records without sharing the tab identity", () => {
    store.setSession("user|ana.p|0");
    const persisted = JSON.parse(localStorage.getItem("tfhg-preview-v1")!);
    expect(persisted.state.session).toBeUndefined();
    expect(sessionStorage.getItem("tfhg-preview-session")).toBe("user|ana.p|0");
    store.setSession(null);
    expect(sessionStorage.getItem("tfhg-preview-session")).toBeNull();
  });

  it("ignores a legacy shared identity and rehydrates without writing it back", async () => {
    const session = store.getDemoState().session;
    const saved = JSON.parse(localStorage.getItem("tfhg-preview-v1")!);
    saved.state.session = "user|owner|0";
    localStorage.setItem("tfhg-preview-v1", JSON.stringify(saved));
    const write = vi.spyOn(localStorage, "setItem");
    await store.useDemoStore.persist.rehydrate();
    await Promise.resolve();
    expect(store.getDemoState().session).toBe(session);
    expect(write).not.toHaveBeenCalled();
    write.mockRestore();
  });

  it("rejects expired, malformed and inactive identities before protected queries mount", () => {
    const state = store.getDemoState();
    expect(store.hasValidSession(state)).toBe(true);
    expect(store.hasValidSession({ ...state, session: "user|ana.p|999" })).toBe(false);
    expect(store.hasValidSession({ ...state, session: "invalid" })).toBe(false);
    expect(store.hasValidSession({ ...state, session: null })).toBe(false);
    expect(store.hasValidSession({ ...state, tables: { ...state.tables, users: state.tables.users!.map((u) => ({ ...u, active: false })) } })).toBe(false);
  });

  it("keeps both changes when preferences are saved concurrently", async () => {
    await Promise.all([
      store.commit("me:updatePrefs", { theme: "dark" }),
      store.commit("me:updatePrefs", { largeText: true }),
    ]);
    expect(ana()).toMatchObject({ theme: "dark", largeText: true });
  });

  it("rolls back a failed mutation and continues processing later saves", async () => {
    const results = await Promise.allSettled([
      store.commit("me:updatePrefs", { theme: "invalid" }),
      store.commit("me:updatePrefs", { largeText: true }),
    ]);
    expect(results.map((r) => r.status)).toEqual(["rejected", "fulfilled"]);
    expect(ana()).toMatchObject({ theme: "light", largeText: true });
  });

  it("does not restore a signed-out session when an in-flight save finishes", async () => {
    const save = store.commit("me:updatePrefs", { largeText: true });
    await Promise.resolve();
    store.setSession(null);
    await save.catch(() => undefined);
    expect(store.getDemoState().session).toBeNull();
  });
});
