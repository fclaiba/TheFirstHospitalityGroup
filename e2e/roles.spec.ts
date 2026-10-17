import { expect, test } from "@playwright/test";
import { expectAccessible, signInAs } from "./helpers";

// Walk the primary navigation for areas not covered by the service-day scenarios.
for (const [role, person, home] of [
  ["polisher", "Omar Benali", "/today"],
  ["host", "Maya Johnson", "/lead/floor"],
  ["expo", "Irene Kowalski", "/lead/pass"],
  ["head-bartender", "Sam Rivera", "/lead/bar"],
  ["sous-chef", "Rosa Hernández", "/lead/kitchen"],
  ["chef", "Marco Bianchi", "/lead/kitchen"],
  ["director", "Victor Hale", "/company"],
]) {
  test(`${role}: every primary tab opens an accessible screen`, async ({ page }, info) => {
    await signInAs(page, person!);
    await expect(page).toHaveURL(new RegExp(`${home}$`));
    const links = page.locator("nav a");
    const count = await links.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(5);
    const hrefs = await links.evaluateAll((nodes) => nodes.map((a) => a.getAttribute("href")!));
    await expect(page.locator("main h1").first()).toBeVisible();
    await page.screenshot({ path: `.tmp/preview-${role}-${info.project.name}.png`, fullPage: true });
    for (const href of hrefs) {
      await page.goto(href);
      await expect(page.locator("main h1").first()).toBeVisible();
      await expect(page.locator("main")).not.toContainText(/You do not have access|No tienes acceso|Something went wrong|Algo salió mal/);
      await expectAccessible(page);
    }
  });
}
