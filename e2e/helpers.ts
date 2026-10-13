import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** Each test gets a fresh browser context, so a fresh demo database seeded by seed:demo (ADR 0028). */
export async function signInAs(page: Page, name: RegExp | string, opts: { locale?: "en" | "es" } = {}) {
  if (opts.locale === "es") await page.context().addCookies([{ name: "tf_lang", value: "es", url: page.url().startsWith("http") ? page.url() : (process.env.BASE_URL ?? "http://localhost:3300") }]);
  await page.goto("/login");
  await page.getByRole("button", { name }).first().click();
  await page.waitForFunction(() => !location.pathname.startsWith("/login") && location.pathname !== "/start", null, { timeout: 45_000 });
}

/** axe: no serious or critical violations (BLUEPRINT 15). */
export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`)).toEqual([]);
}

/** States, not scores (ADR 0018, 0027): no money and no percentages in the page content of a staff route. */
export async function expectNoScores(page: Page) {
  const text = await page.locator("main").innerText();
  expect(text, "money sign on a staff screen").not.toMatch(/\$\s?\d|USD/);
  expect(text, "percentage on a staff screen").not.toMatch(/\d\s?%/);
}
