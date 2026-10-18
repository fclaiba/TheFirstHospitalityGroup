import { afterEach, expect, it, vi } from "vitest";
import { FakeDb } from "../lib/demo/db";

afterEach(() => vi.restoreAllMocks());
it("keeps same-millisecond inserts in a deterministic order for seeded data and evidence", async () => {
  vi.spyOn(Date, "now").mockReturnValue(1_000);
  vi.spyOn(Math, "random").mockReturnValueOnce(0.9).mockReturnValueOnce(0.1);
  let seq = 0;
  const db = new FakeDb({}, {}, () => String(++seq).padStart(6, "0"));
  const first = await db.insert("records", { label: "First" });
  const second = await db.insert("records", { label: "Second" });
  expect((await db.query("records").collect()).map((r) => r._id)).toEqual([first, second]);
  expect((await db.query("records").order("desc").collect()).map((r) => r._id)).toEqual([second, first]);
});
