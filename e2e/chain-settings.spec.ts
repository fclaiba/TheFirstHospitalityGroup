import { test, expect } from "@playwright/test";
import { signInAs, expectAccessible } from "./helpers";

test("position editor explains circular reporting, preserves unsaved names and saves a valid edit together", async ({
  page,
  context,
}) => {
  await signInAs(page, /Alexandra Reyes/);
  await page.goto("/company/setup/positions");
  await page.getByRole("button", { name: /^Captain/ }).click();
  const sheet = page.getByRole("dialog");
  await sheet
    .getByLabel("Name in English", { exact: true })
    .fill("Service captain");
  await sheet
    .getByLabel("Name in Spanish", { exact: true })
    .fill("Capitán de servicio");
  const before = await page.evaluate(() =>
    localStorage.getItem("tfhg-preview-v1"),
  );
  await sheet.getByLabel("Reports to", { exact: true }).selectOption("busser");
  await expect(sheet.getByRole("alert")).toContainText("circular");
  await expect(
    sheet.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(() => localStorage.getItem("tfhg-preview-v1")),
  ).toBe(before);
  await expectAccessible(page);
  await sheet.getByLabel("Reports to", { exact: true }).selectOption("owner");
  await expect(
    sheet.getByRole("button", { name: "Save", exact: true }),
  ).toBeEnabled();
  await context.setOffline(true);
  await expect(
    sheet.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  await context.setOffline(false);
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await expect(sheet).not.toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /^Service captain/ }).click();
  await expect(
    sheet.getByLabel("Name in English", { exact: true }),
  ).toHaveValue("Service captain");
  await expect(sheet.getByLabel("Reports to", { exact: true })).toHaveValue(
    "owner",
  );
  await expectAccessible(page);
});

test("a stale position editor keeps its draft and refuses to overwrite another tab", async ({
  page,
  context,
}) => {
  await signInAs(page, /Alexandra Reyes/);
  await page.goto("/company/setup/positions");
  await page.getByRole("button", { name: /^Captain/ }).click();
  const first = page.getByRole("dialog");
  await first
    .getByLabel("Name in English", { exact: true })
    .fill("My unsaved captain");
  await first
    .getByLabel("Name in Spanish", { exact: true })
    .fill("Mi capitán sin guardar");
  await first.getByLabel("Reports to", { exact: true }).selectOption("owner");
  const other = await context.newPage();
  await signInAs(other, /Alexandra Reyes/);
  await other.goto("/company/setup/positions");
  await other.getByRole("button", { name: /^Captain/ }).click();
  const second = other.getByRole("dialog");
  await second
    .getByLabel("Name in English", { exact: true })
    .fill("Reviewed captain");
  await second
    .getByLabel("Name in Spanish", { exact: true })
    .fill("Capitán revisado");
  await second.getByLabel("Reports to", { exact: true }).selectOption("gm");
  await second.getByRole("button", { name: "Save", exact: true }).click();
  await expect(second).not.toBeVisible();
  await first.getByRole("button", { name: "Save", exact: true }).click();
  await expect(first.getByRole("alert")).toContainText(
    "Settings changed elsewhere",
  );
  await expect(
    first.getByLabel("Name in English", { exact: true }),
  ).toHaveValue("My unsaved captain");
  await expect(
    first.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  await expectAccessible(page);
  await first.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: /^Reviewed captain/ }).click();
  await expect(first.getByLabel("Reports to", { exact: true })).toHaveValue(
    "gm",
  );
  await other.close();
});
