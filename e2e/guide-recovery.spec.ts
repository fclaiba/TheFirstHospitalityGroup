import {test,expect} from "@playwright/test";
import {signInAs,expectAccessible} from "./helpers";
test("a failed guide download explains recovery and retries without losing the screen",async({page})=>{
  await signInAs(page,/Ana Pérez/);await page.goto("/guide");
  await expect(page.locator("main h1")).toBeVisible();await page.evaluate(()=>document.fonts.ready);
  let blocked=true;
  await page.route("**/*",route=>blocked&&route.request().resourceType()==="script"?route.abort():route.continue());
  await page.getByRole("button",{name:"Guía interactiva",exact:true}).click();
  await expect(page.getByText("No pudimos cargar la guía. Revisa tu conexión e inténtalo otra vez.",{exact:true})).toBeVisible();
  await expect(page.locator("main h1")).toHaveText("Guía");
  blocked=false;await page.getByRole("button",{name:"Reintentar guía",exact:true}).click();
  await expect(page.getByRole("dialog",{name:"Guía interactiva",exact:true})).toBeVisible();
  await expectAccessible(page);await page.keyboard.press("Escape");
});
