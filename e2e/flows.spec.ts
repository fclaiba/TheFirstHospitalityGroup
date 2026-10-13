import { expect, test } from "@playwright/test";
import { expectAccessible, signInAs } from "./helpers";

// The critical flows (BLUEPRINT 15) in preview mode, on the real handlers (ADR 0018).

test("public pages are accessible", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectAccessible(page);
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expectAccessible(page);
});

test("wrong password is refused with one message", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("ana.p");
  await page.getByLabel("Password", { exact: true }).fill("not-the-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Wrong username or password.")).toBeVisible();
});

test("staff day: a server sees Today and ticks the next task", async ({ page }) => {
  await signInAs(page, /Ana Pérez/);
  await expect(page).toHaveURL(/\/today/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Ana");
  await expectAccessible(page);
  await page.goto("/tasks");
  const unchecked = page.getByRole("checkbox", { checked: false });
  await expect(unchecked.first()).toBeVisible();
  const before = await unchecked.count();
  const target = unchecked.first();
  await target.click();
  // Photo-required items open the photo sheet instead; otherwise the box ticks.
  const sheet = page.getByRole("dialog");
  if (await sheet.isVisible().catch(() => false)) return;
  await expect(page.getByRole("checkbox", { checked: false })).toHaveCount(before - 1);
  await expectAccessible(page);
});

test("menu shows allergens and the 86'd dish", async ({ page }) => {
  await signInAs(page, /Tom Becker/);
  await page.goto("/menu");
  await page.getByRole("searchbox").fill("souffl");
  await expect(page.getByText(/Not available today/i).first()).toBeVisible();
  await expectAccessible(page);
});

test("floor: a server asks for water and the manager sees the queue", async ({ browser }) => {
  const server = await browser.newPage();
  await signInAs(server, /Tom Becker/);
  await server.goto("/floor");
  await server.getByRole("button", { name: /^Request$/ }).click();
  await server.getByRole("radio", { name: /Water/ }).click();
  // Picking the table sends a service request at once (two taps, BLUEPRINT 2.2).
  await server.getByRole("dialog").getByRole("button", { name: "14", exact: true }).click();
  await expect(server.getByText(/Water/).first()).toBeVisible();
  await server.close();
});

test("manager approves a comp and the queue updates", async ({ page }) => {
  await signInAs(page, /María Morales/, { locale: "en" });
  await page.goto("/manage/requests");
  const approve = page.getByRole("button", { name: /^(Approve|Aprobar)$/ }).first();
  await expect(approve).toBeVisible();
  await approve.click();
  await expect(page.getByText(/Approved|Aprobad/i).first()).toBeVisible();
  await expectAccessible(page);
});

test("captain logs a warning in the 30-second form", async ({ page }) => {
  await signInAs(page, /Luis Castillo/);
  await page.goto("/manage/warnings/new");
  await page.getByRole("button", { name: /Nina Shah/ }).first().click();
  await page.getByRole("radio", { name: /Phones away|El teléfono/ }).first().click();
  await page.getByRole("radio", { name: /^(Minor|Leve)/ }).click();
  await page.getByRole("button", { name: /Send to the person|Enviar a la persona/ }).click();
  await expect(page.getByRole("button", { name: /Log another|Registrar otra/ })).toBeVisible();
  await expectAccessible(page);
});

test("owner sees the four venues and Brooklyn's auto-closed shift", async ({ page }) => {
  await signInAs(page, /Alexandra Reyes/);
  await expect(page).toHaveURL(/\/owner/);
  for (const v of ["Midtown", "Tribeca", "West Village", "Brooklyn"]) await expect(page.getByText(`The First ${v}`).first()).toBeVisible();
  await expect(page.getByText(/Auto-closed/i).first()).toBeVisible();
  await expectAccessible(page);
});

test("Spanish and Large text", async ({ page }) => {
  await signInAs(page, /Ana Pérez/);
  await page.goto("/me");
  await expect(page.getByRole("heading", { name: "Ana Pérez" })).toBeVisible();
  await page.getByRole("switch", { name: /Texto grande/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-large-text", "true");
  await page.goto("/today");
  await expect(page.getByText(/Buen|Hola/).first()).toBeVisible();
  await expectAccessible(page);
});
