import { expect, test } from "@playwright/test";
import { expectAccessible, signInAs } from "./helpers";
import enTraining from "../messages/en/training.json";

test("practice, supervisor feedback, resubmission and verification survive reload", async ({
  page,
}, info) => {
  await signInAs(page, /Ana Pérez/);
  await page.goto("/training");
  await page
    .getByLabel("¿Qué practicaste?")
    .first()
    .fill("Practiqué la explicación del menú y sus alérgenos.");
  await page
    .getByRole("button", { name: "Ya practiqué; solicitar revisión" })
    .first()
    .click();
  await expect(
    page.getByText("Espera revisión", { exact: true }).first(),
  ).toBeVisible();
  await signInAs(page, /Luis Castillo/);
  await page.goto("/lead/training");
  await expect(page.getByRole("heading", { name: "Ana Pérez" })).toBeVisible();
  await page
    .getByLabel("Evidencia observada o siguiente práctica")
    .fill(
      "Practica explicar los ingredientes antes de ofrecer una alternativa.",
    );
  await page.getByRole("button", { name: "Necesita más práctica" }).click();
  await expect(
    page.getByText("No hay demostraciones pendientes"),
  ).toBeVisible();
  await signInAs(page, /Ana Pérez/);
  await page.goto("/training");
  await expect(
    page
      .getByText(
        "Practica explicar los ingredientes antes de ofrecer una alternativa.",
      )
      .first(),
  ).toBeVisible();
  await page
    .getByLabel("¿Qué practicaste?")
    .first()
    .fill("Repetí la práctica siguiendo las indicaciones.");
  await page
    .getByRole("button", { name: "Ya practiqué; solicitar revisión" })
    .first()
    .click();
  await expect(
    page.getByText("Espera revisión", { exact: true }).first(),
  ).toBeVisible();
  await signInAs(page, /Luis Castillo/);
  await page.goto("/lead/training");
  await page
    .getByLabel("Evidencia observada o siguiente práctica")
    .fill(
      "Observé una explicación correcta y una consulta de alergia bien comunicada.",
    );
  await page.getByRole("button", { name: "Verificar demostración" }).click();
  await expect(
    page.getByText("No hay demostraciones pendientes"),
  ).toBeVisible();
  await signInAs(page, /Ana Pérez/);
  await page.goto("/training");
  await page.reload();
  await expect(
    page.getByText("Verificado", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page
      .getByText(
        "Observé una explicación correcta y una consulta de alergia bien comunicada.",
      )
      .first(),
  ).toBeVisible();
  await expectAccessible(page);
  await page.screenshot({
    path: `.tmp/training-verified-${info.project.name}.png`,
    fullPage: false,
  });
});

test("all production positions have a daily operating playbook", async ({
  page,
}, info) => {
  await signInAs(page, /Alexandra Reyes/);
  await page.goto("/guide");
  const select = page.getByLabel("Explore a position");
  for (const [position, process] of Object.entries(
    enTraining.operations.roles,
  )) {
    await select.selectOption(position);
    await expect(
      page.getByText(process.outcome, { exact: false }),
    ).toBeVisible();
    await expect(page.getByText(process.before, { exact: true })).toBeVisible();
    await expect(page.getByText(process.during, { exact: true })).toBeVisible();
    await expect(page.getByText(process.after, { exact: true })).toBeVisible();
  }
  await expectAccessible(page);
  await page.screenshot({
    path: `.tmp/operating-playbook-${info.project.name}.png`,
    fullPage: false,
  });
});

test("published program versions preserve earlier learner evidence", async ({
  page,
}) => {
  await signInAs(page, /Ana Pérez/);
  await page.goto("/training");
  await page
    .getByRole("button", { name: "Ya practiqué; solicitar revisión" })
    .first()
    .click();
  await expect(
    page.getByText("Espera revisión", { exact: true }).first(),
  ).toBeVisible();
  await signInAs(page, /Alexandra Reyes/);
  await page.goto("/company/setup/training");
  await page.getByLabel("Program title (EN)").fill("Server service readiness");
  await page
    .getByLabel("Program title (ES)")
    .fill("Preparación para servicio de mesero");
  const publish = page.getByRole("button", {
    name: "Publish new program version",
    exact: true,
  });
  await publish.click();
  await publish.click();
  await expect(
    page.getByText("Program version 2", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Program version 2", { exact: true }),
  ).toBeInViewport();
  await expect(
    page.getByText("Program version 2", { exact: true }),
  ).toBeFocused();
  await expectAccessible(page);
  await signInAs(page, /Ana Pérez/);
  await page.goto("/training");
  await expect(
    page.getByText("Versión del programa 2", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Practica primero", { exact: true })).toHaveCount(
    4,
  );
  await expect(
    page.getByRole("heading", { name: "Evidencia de programas anteriores" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  const earlier = page.getByRole("button", { name: /Versión del programa 1/ });
  await expect(earlier).toHaveAttribute("aria-expanded", "false");
  await earlier.click();
  await expect(earlier).toHaveAttribute("aria-expanded", "true");
  const archive = page
    .locator("section")
    .filter({
      has: page.getByRole("heading", {
        name: "Evidencia de programas anteriores",
      }),
    });
  await archive.getByText("Historial de evidencia", { exact: true }).click();
  await expect(
    archive.getByText("Espera revisión", { exact: true }),
  ).toBeVisible();
  await expectAccessible(page);
});

test("offline training stays readable and does not accept review requests", async ({
  page,
  context,
}) => {
  await signInAs(page, /Ana Pérez/);
  await page.goto("/training");
  await expect(
    page
      .getByRole("button", { name: "Ya practiqué; solicitar revisión" })
      .first(),
  ).toBeEnabled();
  await context.setOffline(true);
  await expect(
    page
      .getByRole("button", { name: "Ya practiqué; solicitar revisión" })
      .first(),
  ).toBeDisabled();
  await expect(
    page.getByRole("heading", { name: "Formación", exact: true }),
  ).toBeVisible();
  await context.setOffline(false);
});

test("simultaneous requests in two tabs retain both demonstrations", async ({
  page,
  context,
}) => {
  await signInAs(page, /Ana Pérez/);
  await page.goto("/training");
  const other = await context.newPage();
  await signInAs(other, /Ana Pérez/);
  await other.goto("/training");
  await Promise.all([
    page
      .getByRole("button", { name: "Ya practiqué; solicitar revisión" })
      .nth(0)
      .click(),
    other
      .getByRole("button", { name: "Ya practiqué; solicitar revisión" })
      .nth(1)
      .click(),
  ]);
  await expect(
    page.getByRole("button", { name: "Ya practiqué; solicitar revisión" }),
  ).toHaveCount(2);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Ya practiqué; solicitar revisión" }),
  ).toHaveCount(2);
  await other.close();
});
