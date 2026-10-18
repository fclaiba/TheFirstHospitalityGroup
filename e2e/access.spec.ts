import { expect, test } from "@playwright/test";
import { PEOPLE } from "../convex/seedData";
import { signInAs } from "./helpers";

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
    await page.goto("/me");
    await expect(page.getByRole("heading", { name: person.name, exact: true })).toBeVisible();
  }
});
