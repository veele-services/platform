import {test,expect} from "@playwright/test";
import pg from "pg";
import {authenticateWorkspace} from "./login-auth";
import {requireLocalDatabaseUrl} from "./local-target";

test.use({trace:"off",screenshot:"off",video:"off"});
test("function explanations save account receipts, survive independent devices and fit mobile screens",async({page,browser},info)=>{
 test.setTimeout(120000);
 const db=new pg.Client({connectionString:requireLocalDatabaseUrl().href});await db.connect();
 const cases=[{email:"platform-admin@fieldgrid.test",route:"/app/klanten",key:"backoffice.klanten"},{email:"field-worker@fieldgrid.test",route:"/staff",key:"staff.planning"}];
 const backups:Array<{id:string;key:string;at:Date|null}>=[];
 try{
  for(const item of cases){const id=(await db.query("select id from auth.users where email=$1",[item.email])).rows[0].id;const existing=(await db.query("select dismissed_at from public.account_guide_dismissals where user_id=$1 and guide_key=$2",[id,item.key])).rows[0];backups.push({id,key:item.key,at:existing?.dismissed_at??null});await db.query("delete from public.account_guide_dismissals where user_id=$1 and guide_key=$2",[id,item.key]);}
  for(const item of cases){
   await authenticateWorkspace(page,item.email,item.route);
   await expect(page.locator('[data-account-guides-ready="true"]').first()).toBeAttached();
   const guide=page.locator(`[data-guide-key="${item.key}"]:visible`);await expect(guide).toBeVisible();
   for(const width of[1440,390,320]){await page.setViewportSize({width,height:1000});const box=(await guide.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);expect(await guide.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe("rgb(255, 250, 230)");const close=guide.getByRole("button");expect((await close.boundingBox())!.width).toBe(44);await page.screenshot({path:info.outputPath(`guide-${item.key}-${width}.png`),animations:"disabled"});}
   await page.route("**/*",route=>{const request=route.request();if(request.method()==="POST"&&request.headers()["next-action"]&&request.postData()?.includes(item.key))return route.abort("failed");return route.continue();});
   await guide.getByRole("button").click();await expect(guide).toBeVisible();await expect(guide.getByRole("alert")).toContainText("niet opgeslagen");
   await page.unroute("**/*");await guide.getByRole("button").click();await expect(guide).toHaveCount(0);await page.reload();await expect(page.locator('[data-account-guides-ready="true"]').first()).toBeAttached();await expect(guide).toHaveCount(0);
   const device=await browser.newContext({viewport:{width:390,height:1000},locale:"nl-NL"});try{const secondPage=await device.newPage();await authenticateWorkspace(secondPage,item.email,item.route);await expect(secondPage.locator('[data-account-guides-ready="true"]').first()).toBeAttached();await expect(secondPage.locator(`[data-guide-key="${item.key}"]:visible`)).toHaveCount(0);}finally{await device.close();}
  }
 }finally{for(const item of backups){await db.query("delete from public.account_guide_dismissals where user_id=$1 and guide_key=$2",[item.id,item.key]);if(item.at)await db.query("insert into public.account_guide_dismissals(user_id,guide_key,dismissed_at) values($1,$2,$3)",[item.id,item.key,item.at]);}await db.end();}
});
