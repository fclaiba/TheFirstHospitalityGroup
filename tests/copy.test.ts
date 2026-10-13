import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { en, es } from "../messages";

// Quality gate (BLUEPRINT 15, ADR 0011): ES and EN share every key; every literal t() key exists; no dashes in UI copy.
type Dict = { [k: string]: string | Dict };
const keys = (o: Dict, p = ""): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
const get = (dict: Dict, key: string): unknown => key.split(".").reduce<unknown>((n, p) => (n && typeof n === "object" ? (n as Dict)[p] : undefined), dict);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === "_generated" || name === "node_modules" ? [] : files(full);
    return /\.(tsx?|ts)$/.test(name) ? [full] : [];
  });
}

const sources = ["app", "components", "lib", "convex"].flatMap(files);

describe("copy dictionaries", () => {
  it("es and en have exactly the same keys", () => {
    const a = keys(en as Dict).sort();
    const b = keys(es as Dict).sort();
    expect(a.filter((k) => !b.includes(k))).toEqual([]);
    expect(b.filter((k) => !a.includes(k))).toEqual([]);
  });

  it("resolves every literal key passed to t() in both languages", () => {
    const missing: string[] = [];
    for (const f of sources) {
      for (const m of readFileSync(f, "utf8").matchAll(/\bt\(\s*"([a-zA-Z0-9_.]+)"/g)) {
        for (const [name, dict] of [
          ["en", en],
          ["es", es],
        ] as const) {
          if (typeof get(dict as Dict, m[1]!) !== "string") missing.push(`${name}:${m[1]} (${f})`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("keeps the same {placeholders} in both languages", () => {
    const vars = (s: unknown) =>
      [...String(s).matchAll(/\{(\w+)\}/g)]
        .map((m) => m[1])
        .sort()
        .join(",");
    const bad = keys(en as Dict).filter((k) => vars(get(en as Dict, k)) !== vars(get(es as Dict, k)));
    expect(bad).toEqual([]);
  });

  it("contains no em-dashes or en-dashes", () => {
    for (const d of [en, es]) {
      const text = JSON.stringify(d);
      expect(text.includes("—")).toBe(false);
      expect(text.includes("–")).toBe(false);
    }
  });

  it("has no em-dashes in component source", () => {
    const offenders = files("components")
      .concat(files("app"))
      .filter((f) => /[—–]/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
