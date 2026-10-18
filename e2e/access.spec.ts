import { expect, test } from "@playwright/test";
import { PEOPLE } from "../convex/seedData";
import { expectAccessible, signInAs } from "./helpers";

test("two demo tabs keep their own identity when either signs in or reloads", async ({ page, context }) => {
  await signInAs(page, /Ana Pérez/);
  const manager = await context.newPage();
  await signInAs(manager, /María Morales/);
  await page.goto("/me");
  await expect(page.getByRole("heading", { name: "Ana Pérez", exact: true })).toBeVisible();
  await manager.goto("/me");
  await expect(manager.getByRole("heading", { name: "María Morales", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Ana Pérez", exact: true })).toBeVisible();
  await manager.close();
});

test("all visible demo accounts can sign in from the saved start redirect", async ({ page }) => {
  test.setTimeout(180_000);
  for (const person of PEOPLE.filter((p) => p.position !== "dev")) {
    await page.goto("/login?next=%2Fstart");
    await page.getByRole("button", { name: new RegExp(person.name) }).first().click();
    await page.waitForURL((url) => !["/login", "/start"].includes(url.pathname), { timeout: 15_000 });
    await expect(page.locator("main:visible h1").first()).toBeVisible();
    await expect(page.locator("main:visible")).not.toContainText(/Something went wrong|Algo salió mal|UNAUTHENTICATED/);
    await expect(page.locator("main:visible [data-screen-guide]")).toBeVisible();
    await page.goto("/me");
    await expect(page.getByRole("heading", { name: person.name, exact: true })).toBeVisible();
  }
});

test("demo chooser searches by position and provides a usable empty state", async ({ page }, info) => {
  await page.goto("/login");
  const search = page.getByRole("searchbox");
  await search.fill("ana.p");
  await expect(page.getByRole("button", { name: /Ana Pérez/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /María Morales/ })).toHaveCount(0);
  await search.fill("nonexistent-account");
  await expect(page.locator("main")).toContainText(/No matching accounts|No hay cuentas/);
  await search.fill("");
  await expectAccessible(page);
  await page.screenshot({ path: `.tmp/access-login-${info.project.name}.png`, fullPage: false });
});

for (const [person, routes] of [
  ["owner", ["/company", "/company/org", "/company/setup", "/company/setup/areas", "/company/setup/positions", "/company/setup/venues", "/company/setup/events", "/company/setup/floor-plans", "/company/setup/menu", "/company/setup/rules", "/company/setup/thresholds", "/company/setup/tip-policy", "/company/setup/import", "/company/setup/audit", "/manage/menu"]],
  ["María Morales", ["/manage", "/manage/venue", "/manage/schedule", "/manage/team", "/manage/warnings", "/manage/warnings/new", "/manage/messages/new", "/manage/bar", "/manage/close", "/manage/setup", "/manage/setup/tasks", "/manage/setup/rules", "/manage/setup/staff", "/manage/setup/sections", "/manage/setup/menu-availability"]],
] as const) {
  test(`${person}: setup and operational screens explain their next step`, async ({ page }, info) => {
    test.setTimeout(180_000);
    await signInAs(page, person === "owner" ? /Alexandra Reyes/ : person);
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator("main h1").first()).toBeVisible();
      await expect(page.locator("main")).not.toContainText(/Something went wrong|Algo salió mal|You do not have access|No tienes acceso/);
      await expect(page.locator("[data-screen-guide]")).toBeVisible();
      await page.getByText(/How to use this screen|Cómo usar esta pantalla/, { exact: true }).click();
      await expect(page.getByRole("link", { name: /Open the complete guide|Abrir la guía completa/ })).toBeVisible();
      await expectAccessible(page);
    }
    await page.screenshot({ path: `.tmp/access-${person === "owner" ? "owner" : "manager"}-${info.project.name}.png`, fullPage: true });
  });
}
