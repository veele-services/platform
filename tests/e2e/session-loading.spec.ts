import {expect,test} from "@playwright/test";
import {authenticateWorkspace} from "./login-auth";

test.use({trace:"off",screenshot:"off",video:"off"});

test("overlapping focus events share one check, and navigation remains protected",async({page})=>{
 await authenticateWorkspace(page,"platform-admin@fieldgrid.test","/app/klanten");
 await expect(page.locator("html")).not.toHaveAttribute("data-account-blocked");
 let requests=0,release=()=>{};
 let held=new Promise<void>(resolve=>{release=resolve;});
 await page.route("**/api/auth/session",async route=>{requests++;await held;await route.continue();});
 try{
  await page.evaluate(()=>{
   window.dispatchEvent(new Event("focus"));
   document.dispatchEvent(new Event("visibilitychange"));
   window.dispatchEvent(new Event("focus"));
  });
  await expect.poll(()=>requests).toBe(1);
  await expect(page.getByRole("progressbar",{name:"Omgeving laden"})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Klanten",exact:true})).not.toBeVisible();
  await expect(page.locator("[data-account-fence]")).not.toContainText("Sessie controleren");
  for(const width of [320,390,1440]){
   await page.setViewportSize({width,height:900});
   const box=await page.locator(".session-loading").boundingBox();
   expect(box).not.toBeNull();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(width);
  }
  expect(requests).toBe(1);
  release();await expect(page.locator("html")).not.toHaveAttribute("data-account-blocked");
  held=new Promise<void>(resolve=>{release=resolve;});
  await page.getByRole("link",{name:"Planbord",exact:true}).click();
  await expect.poll(()=>requests).toBe(2);
  await expect(page.getByRole("progressbar",{name:"Omgeving laden"})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Planbord",exact:true})).not.toBeVisible();
  release();await expect(page.getByRole("heading",{name:"Planbord",exact:true})).toBeVisible();
 }finally{release();}
});

test("a failed check keeps content covered and offers a working retry",async({page})=>{
 await authenticateWorkspace(page,"platform-admin@fieldgrid.test","/app/klanten");
 await expect(page.locator("html")).not.toHaveAttribute("data-account-blocked");
 await page.route("**/api/auth/session",route=>route.fulfill({status:503,json:{error:"FICTITIOUS unavailable"}}));
 await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
 await expect(page.getByRole("alert")).toContainText("Verbinding tijdelijk niet beschikbaar.");
 await expect(page.getByRole("heading",{name:"Klanten",exact:true})).not.toBeVisible();
 const retry=page.getByRole("button",{name:"Opnieuw proberen",exact:true});
 expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(44);
 await expect(page.getByRole("link",{name:"Naar inloggen",exact:true})).toHaveAttribute("href","/login");
 await page.unroute("**/api/auth/session");
 await retry.click();
 await expect(page.locator("html")).not.toHaveAttribute("data-account-blocked");
 await expect(page.getByRole("heading",{name:"Klanten",exact:true})).toBeVisible();
});

