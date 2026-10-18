import {test,expect} from "@playwright/test";
import {signInAs,expectAccessible} from "./helpers";
const cases=[
  {name:"dish",person:/Ana Pérez/,path:"/menu",selector:'a[href^="/menu/"]:not([href="/menu/quiz"])'},
  {name:"announcement",person:/Ana Pérez/,path:"/messages",selector:'a[href^="/messages/"]'},
  {name:"venue",person:/Alexandra Reyes/,path:"/company",selector:'a[href^="/company/venues/"]'},
  {name:"person",person:/María Morales/,path:"/manage/team",selector:'a[href^="/manage/team/"]',text:"Ana Pérez"},
];
for(const c of cases)test(`${c.name}: details open from their real link, reload and explain the screen`,async({page})=>{
  await signInAs(page,c.person);await page.goto(c.path);
  const links=page.locator(c.selector);const link=c.text?links.filter({hasText:c.text}).first():links.first();
  await expect(link).toBeVisible();const href=(await link.getAttribute("href"))!;
  await link.click();await page.waitForURL(url=>decodeURIComponent(url.pathname)===decodeURIComponent(new URL(href,"http://localhost").pathname));
  const heading=page.locator("main").getByRole("heading",{level:1});await expect(heading).toBeVisible();
  const title=await heading.textContent();await page.reload();await expect(heading).toHaveText(title!);
  await page.getByRole("button",{name:/^(Interactive guide|Guía interactiva)$/}).click();
  await expect(page.getByRole("dialog",{name:/^(Interactive guide|Guía interactiva)$/})).toBeVisible();
  await expectAccessible(page);await page.keyboard.press("Escape");
});
