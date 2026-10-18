import { test, expect } from "@playwright/test";
import { signInAs, expectAccessible, expectNoScores } from "./helpers";
import { addDays, nyDateKey } from "../lib/time";

async function assign(page: import("@playwright/test").Page) {
  await signInAs(page,/María Morales/);
  await page.goto("/actions/new");
  await page.getByLabel("Persona responsable").selectOption({label:"Ana Pérez · Mesero"});
  await page.getByLabel("Instrucciones en inglés").fill("Inspect the replacement tray and secure its handle.");
  await page.getByLabel("Instrucciones en español").fill("Revisa la bandeja de reemplazo y comprueba el mango.");
  await page.getByLabel("Fecha límite en Nueva York").fill(addDays(nyDateKey(Date.now()),1));
  await page.getByLabel("Hora límite en Nueva York").fill("15:00");
  await page.getByRole("button",{name:"Asignar seguimiento",exact:true}).click();
  await expect(page).toHaveURL(/\/actions\/[^/]+$/);
  await expect(page.getByText("Asignado",{exact:true}).first()).toBeVisible();
  return page.url();
}
test("manager assigns, staff submits, manager returns and verifies with persistent evidence",async({page},info)=>{
  const url=await assign(page);
  await expectAccessible(page);
  await signInAs(page,/Ana Pérez/);
  await page.goto("/today");
  await page.getByRole("link",{name:/Revisa la bandeja de reemplazo/}).click();
  await page.getByRole("button",{name:"Comenzar trabajo",exact:true}).click();
  await expect(page.getByText("En curso",{exact:true}).first()).toBeVisible();
  await page.getByLabel("¿Qué hiciste?").fill("Reemplacé la bandeja y revisé la estación.");
  await page.getByRole("button",{name:"Presentar resultado para revisión",exact:true}).click();
  await expect(page.getByText("Espera revisión",{exact:true}).first()).toBeVisible();
  await signInAs(page,/María Morales/);
  await page.goto(url);
  await page.getByLabel("Observación o siguiente instrucción").fill("Falta comprobar el mango antes de usar la bandeja.");
  await page.getByRole("button",{name:"Devolver con instrucciones",exact:true}).click();
  await expect(page.getByText("Requiere más trabajo",{exact:true}).first()).toBeVisible();
  await signInAs(page,/Ana Pérez/);await page.goto(url);
  await expect(page.getByText("Falta comprobar el mango antes de usar la bandeja.")).toBeVisible();
  await page.getByLabel("¿Qué hiciste?").fill("Comprobé y aseguré el mango de la bandeja.");
  await page.getByRole("button",{name:"Presentar resultado para revisión",exact:true}).click();
  await expect(page.getByText("Espera revisión",{exact:true}).first()).toBeVisible();
  await signInAs(page,/María Morales/);await page.goto(url);
  await page.getByLabel("Observación o siguiente instrucción").fill("Inspeccioné la bandeja: el mango está seguro.");
  await page.getByRole("button",{name:"Verificar resultado",exact:true}).click();
  await expect(page.getByText("Este seguimiento está cerrado")).toBeVisible();
  await page.reload();await expect(page.getByText("Verificado",{exact:true}).first()).toBeVisible();
  await expectAccessible(page);await expectNoScores(page);
  await page.screenshot({path:`.tmp/action-verified-${info.project.name}.png`,fullPage:false});
});
test("own queue explains empty state and disables writing while offline",async({page,context})=>{
  const url=await assign(page);
  await signInAs(page,/Ana Pérez/);await page.goto(url);
  await context.setOffline(true);
  await expect(page.getByRole("button",{name:"Comenzar trabajo",exact:true})).toBeDisabled();
  await context.setOffline(false);
  await page.goto("/actions");await expectAccessible(page);await expectNoScores(page);
  await expect(page.getByRole("link",{name:/Revisa la bandeja de reemplazo/})).toBeVisible();
});
