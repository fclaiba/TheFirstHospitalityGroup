import { test, expect } from "@playwright/test";
import { signInAs, expectAccessible } from "./helpers";
import { SCREEN_GUIDES } from "../lib/screen-guide";

test("guide spotlights the actual screen, moves both ways and restores keyboard focus", async ({
  page,
}, info) => {
  await signInAs(page, /Ana Pérez/);
  await page.goto("/guide");
  const launcher = page.getByRole("button", {
    name: "Guía interactiva",
    exact: true,
  });
  const before = await page.evaluate(() =>
    localStorage.getItem("tfhg-preview-v1"),
  );
  const requestBox = await page
    .getByRole("button", { name: "Pedido", exact: true })
    .boundingBox();
  const guideBox = await launcher.boundingBox();
  expect(requestBox?.y).toBe(guideBox?.y);
  const work = page.locator("main");
  await work.evaluate(el => { el.scrollTop = 200; });
  const originalScroll = await work.evaluate(el => el.scrollTop);
  expect(originalScroll).toBeGreaterThan(0);
  await launcher.click();
  const dialog = page.getByRole("dialog", {
    name: "Guía interactiva",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expectAccessible(page);
  await expect(
    dialog.getByRole("button", { name: "Anterior", exact: true }),
  ).toBeDisabled();
  const first = (await dialog.locator("[data-tour-step]").textContent()) ?? "";
  await dialog.getByRole("button", { name: "Siguiente", exact: true }).click();
  await expect(dialog.locator("[data-tour-step]")).not.toHaveText(first);
  await expect(dialog.locator("[data-tour-spotlight]")).toBeVisible();
  const blur = await dialog
    .locator("[data-tour-backdrop]")
    .first()
    .evaluate((e) => getComputedStyle(e).backdropFilter);
  expect(blur).toContain("blur");
  await dialog.getByRole("button", { name: "Anterior", exact: true }).click();
  await expect(dialog.locator("[data-tour-step]")).toHaveText(first);
  await page.screenshot({
    path: `.tmp/interactive-guide-${info.project.name}.png`,
    fullPage: false,
  });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(launcher).toBeFocused();
  expect(await work.evaluate(el => el.scrollTop)).toBe(originalScroll);
  expect(
    await page.evaluate(() => localStorage.getItem("tfhg-preview-v1")),
  ).toBe(before);
});
test("walkthroughs cover public and role views without submitting or navigating", async ({
  page,
}) => {
  await page.goto("/login");
  await page
    .getByRole("button", {
      name: /Interactive guide|Guía interactiva/,
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await signInAs(page, /María Morales/);
  for (const path of [
    "/today",
    "/manage",
    "/manage/schedule",
    "/manage/close",
    "/manage/team",
    "/actions",
    "/actions/new",
    "/training",
    "/lead/training",
    "/menu",
    "/rules",
    "/messages",
    "/me",
  ]) {
    await page.goto(path);
    await page
      .getByRole("button", { name: "Guía interactiva", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Guía interactiva",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    const before = page.url();
    for (let step = 0; step < 30; step++) {
      const finish = dialog.getByRole("button", {
        name: "Finalizar guía",
        exact: true,
      });
      if (await finish.isVisible()) {
        await finish.click();
        break;
      }
      await dialog
        .getByRole("button", { name: "Siguiente", exact: true })
        .click();
    }
    await expect(dialog).not.toBeVisible();
    expect(page.url()).toBe(before);
  }
});

test("every registered operational view exposes a usable walkthrough", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await signInAs(page, /Alexandra Reyes/);
  const paths = [...new Set(SCREEN_GUIDES.map(([path]) => path))].filter(
    (path) => path !== "/company/venues",
  );
  for (const path of paths) {
    await page.goto(path);
    const launcher = page.getByRole("button", {
      name: /^(Interactive guide|Guía interactiva)$/,
    });
    await expect(launcher).toBeVisible();
    await launcher.click();
    const dialog = page.getByRole("dialog", {
      name: /^(Interactive guide|Guía interactiva)$/,
    });
    await expect(dialog).toBeVisible();
    for (let step = 0; step < 26; step++) {
      const finish = dialog.getByRole("button", {
        name: /^(Finish guide|Finalizar guía)$/,
      });
      if (await finish.isVisible()) {
        await finish.click();
        break;
      }
      await dialog.getByRole("button", { name: /^(Next|Siguiente)$/ }).click();
    }
    await expect(dialog).not.toBeVisible();
    await expect(launcher).toBeFocused();
  }
});
