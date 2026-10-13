import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Quality gate (AGENTS.md rule 4, ADR 0015): UI code uses theme tokens only. Each rule names the escape
// it blocks; the few files that must hold literal values (they cannot read CSS variables) are listed.

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return /\.tsx$/.test(name) ? [full] : [];
  });
}

const sources = ["app", "components"].flatMap(files).map((f) => ({ f: f.replaceAll("\\", "/"), src: readFileSync(f, "utf8") }));

const rules: Array<{ name: string; re: RegExp; allow?: string[] }> = [
  { name: "hex colour", re: /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![\w-])/g, allow: ["app/layout.tsx", "app/global-error.tsx"] },
  { name: "rgb() literal", re: /rgba?\(/g },
  { name: "arbitrary font size", re: /\btext-\[\d/g },
  { name: "arbitrary radius", re: /\brounded(-[trbl]{1,2})?-\[/g },
  { name: "arbitrary shadow", re: /\bshadow-\[/g },
  { name: "arbitrary tracking", re: /\btracking-\[/g },
  { name: "Tailwind default size (replaced by the scale)", re: /\btext-(xs|sm|base|lg|xl|[2-9]xl)\b/g },
  { name: "text-white (no such token)", re: /\btext-white\b/g },
  { name: "inline font size", re: /fontSize:/g },
];

describe("design tokens", () => {
  for (const rule of rules) {
    it(`no ${rule.name} in app/ and components/`, () => {
      const hits = sources
        .filter(({ f }) => !rule.allow?.some((a) => f.endsWith(a)))
        .flatMap(({ f, src }) => [...src.matchAll(rule.re)].map((m) => `${f}: ${m[0]}`));
      expect(hits).toEqual([]);
    });
  }
});
