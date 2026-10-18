import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sources = ["docs/brand/tokens.css", "app/globals.css"];
const luminance = (hex: string) => {
  const rgb = hex.slice(1).match(/../g)!.map((v) => parseInt(v, 16) / 255).map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
};
const contrast = (a: string, b: string) => {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

function palette(source: string, dark: boolean) {
  const css = readFileSync(source, "utf8");
  const tokens = Object.fromEntries([...css.split("@media")[0]!.matchAll(/--color-([\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
  if (dark) {
    const explicit = css.slice(css.indexOf(':root[data-theme="dark"]'));
    for (const m of explicit.matchAll(/--color-([\w-]+):\s*([^;]+);/g)) tokens[m[1]!] = m[2]!.trim();
  }
  const get = (name: string): string => {
    const value = tokens[name]!;
    return value.startsWith("var(") ? get(value.match(/--color-([\w-]+)/)![1]!) : value;
  };
  return get;
}

describe("burgundy identity and readable brand controls", () => {
  for (const source of sources) {
    it(`${source} uses the owner's burgundy primary`, () => {
      expect(palette(source, false)("brand")).toBe("#6b2337");
    });
    for (const dark of [false, true]) {
      it(`${source} meets AA for brand text and controls (${dark ? "dark" : "light"})`, () => {
        const color = palette(source, dark);
        expect(contrast(color("brand"), color("on-brand"))).toBeGreaterThanOrEqual(4.5);
        expect(contrast(color("brand-pressed"), color("on-brand"))).toBeGreaterThanOrEqual(4.5);
        expect(contrast(color("brand"), color("canvas"))).toBeGreaterThanOrEqual(4.5);
        expect(contrast(color("brand"), color("brand-soft"))).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
