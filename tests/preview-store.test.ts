import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { World } from "./support/engine";

let store: typeof import("../lib/demo/store");

beforeAll(async () => {
  const data = new Map<string, string>();
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
