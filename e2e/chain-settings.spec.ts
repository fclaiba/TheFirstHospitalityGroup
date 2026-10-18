import { test, expect } from "@playwright/test";
import { signInAs, expectAccessible } from "./helpers";

test("position editor explains circular reporting, preserves unsaved names and saves a valid edit together", async ({page}) => {
  await signInAs(page, /Alexandra Reyes/);
  await page.goto("/company/setup/positions");
  await page.getByRole("button", {name:/^Captain/}).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Name in English", {exact:true}).fill("Service captain");
  await sheet.getByLabel("Name in Spanish", {exact:true}).fill("Capitán de servicio");
  const before = await page.evaluate(()=>localStorage.getItem("tfhg-preview-v1"));
  await sheet.getByLabel("Reports to", {exact:true}).selectOption("busser");
  await expect(sheet.getByRole("alert")).toContainText("circular");
  await expect(sheet.getByRole("button", {name:"Save",exact:true})).toBeDisabled();
  expect(await page.evaluate(()=>localStorage.getItem("tfhg-preview-v1"))).toBe(before);
  await expectAccessible(page);
  await sheet.getByLabel("Reports to", {exact:true}).selectOption("owner");
  await expect(sheet.getByRole("button", {name:"Save",exact:true})).toBeEnabled();
  await sheet.getByRole("button", {name:"Save",exact:true}).click();
  await expect(sheet).not.toBeVisible();
  await page.reload();
  await page.getByRole("button", {name:/^Service captain/}).click();
  await expect(sheet.getByLabel("Name in English", {exact:true})).toHaveValue("Service captain");
  await expect(sheet.getByLabel("Reports to", {exact:true})).toHaveValue("owner");
  await expectAccessible(page);
});
