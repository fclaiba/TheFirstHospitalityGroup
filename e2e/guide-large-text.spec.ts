import { test, expect } from "@playwright/test";
import { signInAs, expectAccessible } from "./helpers";
test("English Large text keeps both help controls separate and the guide usable", async ({
  page,
}) => {
  await signInAs(page, /Tom Becker/);
  await page.goto("/me");
  await page.getByRole("switch", { name: "Large text", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-large-text", "true");
  await page.goto("/guide");
  await expect(page.locator("main h1")).toBeVisible();
  const guide = page.getByRole("button", {
    name: "Interactive guide",
    exact: true,
  });
  const request = page.getByRole("button", { name: "Request", exact: true });
  const g = await guide.boundingBox(),
    r = await request.boundingBox();
  expect(g!.x >= r!.x + r!.width + 8 || g!.y >= r!.y + r!.height + 8).toBe(
    true,
  );
  expect(g!.height).toBeGreaterThanOrEqual(48);
  expect(r!.height).toBeGreaterThanOrEqual(48);
  await guide.click();
  await expect(
    page.getByRole("dialog", { name: "Interactive guide", exact: true }),
  ).toBeVisible();
  await expectAccessible(page);
  await page.keyboard.press("Escape");
  await expect(guide).toBeFocused();
});
