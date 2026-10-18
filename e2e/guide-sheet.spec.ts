import { test, expect } from "@playwright/test";
import { signInAs, expectAccessible } from "./helpers";

test("modal task guides explain the current request step without sending or losing selections", async ({
  page,
}) => {
  await signInAs(page, /Ana Pérez/);
  await page.getByRole("button", { name: "Pedido", exact: true }).click();
  const sheet = page
    .getByRole("dialog")
    .filter({ has: page.getByRole("button", { name: "Cerrar", exact: true }) });
  await expect(sheet).toBeVisible();
  const launch = sheet.getByRole("button", {
    name: "Guía interactiva",
    exact: true,
  });
  await expect(launch).toBeVisible();
  const before = await page.evaluate(() =>
    localStorage.getItem("tfhg-preview-v1"),
  );
  await launch.click();
  const guide = page.getByRole("dialog", {
    name: "Guía interactiva",
    exact: true,
  });
  await expect(guide).toBeVisible();
  await expectAccessible(page);
  await guide.getByRole("button", { name: "Siguiente", exact: true }).click();
  await expect(guide.locator("[data-tour-step]")).toContainText("Agua");
  await page.keyboard.press("Escape");
  await expect(guide).not.toBeVisible();
  await expect(launch).toBeFocused();
  expect(
    await page.evaluate(() => localStorage.getItem("tfhg-preview-v1")),
  ).toBe(before);
  await sheet.getByRole("radio", { name: /Agua/ }).click();
  await expect(sheet.getByRole("radiogroup")).not.toBeVisible();
  const title = await sheet.getByRole("heading", { level: 2 }).textContent();
  await launch.click();
  await expect(guide.locator("[data-tour-step] h2")).toHaveText(title!);
  for (let step = 0; step < 26; step++) {
    const finish = guide.getByRole("button", {
      name: "Finalizar guía",
      exact: true,
    });
    if (await finish.isVisible()) {
      await finish.click();
      break;
    }
    await guide.getByRole("button", { name: "Siguiente", exact: true }).click();
  }
  await expect(guide).not.toBeVisible();
  await expect(sheet.getByRole("heading", { level: 2 })).toHaveText(title!);
  await expect(launch).toBeFocused();
  expect(
    await page.evaluate(() => localStorage.getItem("tfhg-preview-v1")),
  ).toBe(before);
  await expectAccessible(page);
});
