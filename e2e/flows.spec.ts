import { expect, test } from "@playwright/test";
import { expectAccessible, expectNoScores, signInAs } from "./helpers";

// The critical flows (BLUEPRINT 15, v1.3) in preview mode, on the real handlers (ADR 0028): staff day, publish and
// confirm a week, swap, event staffing, propose and issue a warning, shortage reported and restocked, close, venue and
// company states; EN and ES; Large text; states, not scores on staff routes.

test("public pages are accessible", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectAccessible(page);
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /Sign in|Inicia sesión|Entrar/ })).toBeVisible();
  await expectAccessible(page);
});

test("wrong password is refused with one message", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/Username|Usuario/).fill("ana.p");
  await page.getByLabel(/^(Password|Contraseña)$/).fill("not-the-password");
  await page.getByRole("button", { name: /^(Sign in|Entrar|Iniciar sesión)$/ }).click();
  await expect(page.getByText(/Wrong username or password|Usuario o contraseña incorrectos/)).toBeVisible();
});

test("staff day: Today shows confirmations first and the server ticks side work", async ({ page }) => {
  await signInAs(page, /Ana Pérez/);
  await expect(page).toHaveURL(/\/today/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Ana");
  await expect(page.getByRole("heading", { name: /Waiting for your confirmation|Esperan tu confirmación/ })).toBeVisible();
  await expectAccessible(page);
  await page.goto("/tasks");
  const unchecked = page.getByRole("checkbox", { checked: false });
  await expect(unchecked.first()).toBeVisible();
  const before = await unchecked.count();
  await unchecked.first().click();
  // Photo-required items open the photo sheet instead; otherwise the box ticks.
  if (await page.getByRole("dialog").isVisible().catch(() => false)) return;
  await expect(page.getByRole("checkbox", { checked: false })).toHaveCount(before - 1);
  await expectAccessible(page);
});

test("states, not scores: no money or percentages on staff routes", async ({ page }) => {
  await signInAs(page, /Ana Pérez/);
  for (const route of ["/today", "/tasks", "/schedule", "/menu", "/section", "/rules", "/me"]) {
    await page.goto(route);
    await expect(page.locator("main h1").first()).toBeVisible();
    await expectNoScores(page);
  }
});

test("menu: the 86 shows and a changed dish is confirmed with I saw it", async ({ page }) => {
  await signInAs(page, /Ana Pérez/);
  await page.goto("/menu");
  await expect(page.getByText(/Chocolate soufflé|Soufflé de chocolate/).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /86/ }).first()).toBeVisible();
  await expectAccessible(page);
  await page.goto("/menu?pending=1");
  await page.getByRole("button", { name: /^(I saw it|Lo vi)/ }).first().click();
  await expect(page.getByRole("status").filter({ hasText: /confirmed|confirmados/i }).first()).toBeVisible();
});

test("schedule: the manager sees who has not confirmed and the person confirms the week", async ({ page }) => {
  const manager = page;
  await signInAs(manager, /María Morales/);
  await manager.goto("/manage/schedule");
  await manager.getByRole("tab", { name: /Confirmed|Confirmados/ }).click();
  await expect(manager.getByText("Jade Williams").first()).toBeVisible();
  await expectAccessible(manager);

  const server = page;
  await signInAs(server, /Jade Williams/);
  await server.goto("/schedule");
  await server.getByRole("button", { name: /I saw my schedule|Lo vi/ }).first().click();
  await expect(server.getByText(/Confirmed|Confirmado/).first()).toBeVisible();
  await expectAccessible(server);
});

test("event staffing: the private dinner shows its coverage by position", async ({ page }) => {
  await signInAs(page, /María Morales/);
  await page.goto("/manage/schedule");
  await expect(page.getByText(/Private dinner, party of 12|Cena privada, grupo de 12/).first()).toBeVisible();
  await expect(page.getByText(/Staffed|Cubierto|Short|Falta gente/).first()).toBeVisible();
});

test("swap: a server asks the manager to swap a shift, naming a colleague", async ({ page }) => {
  await signInAs(page, /Ana Pérez/);
  await page.goto("/schedule");
  await page.getByRole("button", { name: /Ask for a swap|Pedir un cambio/ }).last().click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await sheet.getByRole("combobox").first().selectOption({ index: 1 });
  await sheet.getByRole("button", { name: /Send|Enviar|Ask|Pedir/ }).last().click();
  await expect(page.getByText(/manager decides|decide tu manager|Waiting|Esperando/i).first()).toBeVisible();
});

test("warning: the captain proposes and the manager issues it", async ({ page }) => {
  const captain = page;
  await signInAs(captain, /Luis Castillo/);
  await captain.goto("/lead/warnings/new");
  await captain.getByRole("button", { name: /Omar Benali/ }).first().click();
  await captain.getByRole("radio").first().click();
  await captain.getByRole("radio", { name: /^(Minor|Leve)/ }).click();
  await captain.getByRole("button", { name: /Send to the manager|Enviar al manager|Propose|Proponer/ }).last().click();
  await expect(captain.getByText(/Waiting|Esperando/).first()).toBeVisible();
  await expectAccessible(captain);

  const manager = page;
  await signInAs(manager, /María Morales/);
  await manager.goto("/manage/warnings");
  const issue = manager.getByRole("button", { name: /^(Issue|Emitir)$/ }).first();
  await expect(issue).toBeVisible();
  const before = await manager.getByRole("button", { name: /^(Issue|Emitir)$/ }).count();
  await issue.click();
  await expect(manager.getByRole("button", { name: /^(Issue|Emitir)$/ })).toHaveCount(before - 1);
  await expectAccessible(manager);
});

test("bar: a barback marks a bottle Low and the manager restocks it", async ({ page }) => {
  const barback = page;
  await signInAs(barback, /Lucía Fernández/);
  await barback.goto("/bar");
  await barback.getByRole("button", { name: /^(Low|Poca)$/ }).first().click();
  await expect(barback.getByText(/Gin, London Dry/).first()).toBeVisible();
  await expectAccessible(barback);

  const manager = page;
  await signInAs(manager, /María Morales/);
  await manager.goto("/manage/bar");
  const restock = manager.getByRole("button", { name: /^(Restocked|Repuesta)/ }).first();
  await expect(restock).toBeVisible();
  await restock.click();
  await expectAccessible(manager);
});

test("close: the manager sees the close without money and saves a draft", async ({ page }) => {
  await signInAs(page, /María Morales/);
  await page.goto("/manage/close");
  await expect(page.getByRole("heading", { name: /Close|Cierre/, level: 1 })).toBeVisible();
  await expectNoScores(page);
  await page.getByRole("radio", { name: /^(Partial|A medias)$/ }).click();
  await page.getByRole("button", { name: /Save draft|Guardar borrador/ }).click();
  await expect(page.getByText(/Saved|Guardado/).first()).toBeVisible();
  await expectAccessible(page);
});

test("company: the owner sees the four venues in states with reasons", async ({ page }) => {
  await signInAs(page, /Alexandra Reyes/);
  await expect(page).toHaveURL(/\/company/);
  for (const v of ["Midtown", "Tribeca", "West Village", "Brooklyn"]) await expect(page.getByText(`The First ${v}`).first()).toBeVisible();
  await expect(page.getByText(/Action required|Acción necesaria/).first()).toBeVisible();
  await expectAccessible(page);
  await page.goto("/company/org");
  await expect(page.getByText(/Floor|Salón/).first()).toBeVisible();
  await expectAccessible(page);
});

test("Spanish and Large text", async ({ page }) => {
  await signInAs(page, /Ana Pérez/);
  await page.goto("/me");
  await expect(page.getByRole("heading", { name: "Ana Pérez" })).toBeVisible();
  await page.getByRole("switch", { name: /Letra grande|Large text/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-large-text", "true");
  await page.goto("/today");
  await expect(page.getByText(/Buen|Hola/).first()).toBeVisible();
  await expectAccessible(page);
});

test("the mock schedule survives an offline reload without accepting confirmations", async ({ page, context }) => {
  await signInAs(page, /Jade Williams/);
  await page.goto("/schedule");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  const confirm = page.getByRole("button", { name: /I saw my schedule|Lo vi/ }).first();
  await expect(confirm).toBeEnabled();
  const week = await page.locator("main ol").innerText();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("main ol")).toHaveText(week, { useInnerText: true });
  await expect(confirm).toBeDisabled();
  await expect(page.getByRole("button", { name: /Ask for a swap|Pedir un cambio/ }).first()).toBeDisabled();
  await context.setOffline(false);
  await expect(confirm).toBeEnabled();
});
