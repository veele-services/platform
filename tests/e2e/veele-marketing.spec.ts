import {test,expect} from "@playwright/test";
import pg from "pg";
import {randomUUID} from "node:crypto";
import {requireLocalDatabaseUrl} from "./local-target";
import pages from "../../websites/veele-services/pages.generated.json";

const origin="http://veele-services.localhost:3000";
let tenant:string;
test.beforeAll(async()=>{
 const db=new pg.Client({connectionString:requireLocalDatabaseUrl().href});await db.connect();
 try{
  expect((await db.query("select id from public.tenants where slug='veele-services'")).rowCount).toBe(0);
  tenant=randomUUID();const owner=(await db.query("select id from auth.users where email='platform-admin@fieldgrid.test'")).rows[0].id;
  await db.query("insert into public.tenants(id,slug,name) values($1,'veele-services','FICTITIOUS marketing E2E')",[tenant]);
  await db.query("insert into public.tenant_settings(tenant_id,enabled_services) values($1,array['planning'])",[tenant]);
  await db.query("insert into public.tenant_branding(tenant_id) values($1)",[tenant]);
  await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['tenant_admin','management']::public.app_role[],'active')",[tenant,owner]);
 }finally{await db.end();}
});
test.afterAll(async()=>{
 if(!tenant)return;const db=new pg.Client({connectionString:requireLocalDatabaseUrl().href});await db.connect();
 try{
  // This suite requires loopback Supabase. Remove only its newly created tenant.
  await db.query("begin");await db.query("set local session_replication_role=replica");
  const tables=(await db.query("select table_schema,table_name from information_schema.columns where column_name='tenant_id' and table_schema in ('public','private')")).rows;
  for(const table of tables){const id=(name:string)=>'"'+name.replaceAll('"','""')+'"';await db.query(`delete from ${id(table.table_schema)}.${id(table.table_name)} where tenant_id=$1`,[tenant]);}
  await db.query("delete from public.tenants where id=$1",[tenant]);await db.query("commit");
 }finally{await db.end();}
});

test("all supplied routes, current-origin SEO, 404 and portal links",async({page})=>{
 test.setTimeout(120000);
 const missingAssets:string[]=[];page.on("response",r=>{if(r.url().includes("/assets/")&&r.status()>=400)missingAssets.push(new URL(r.url()).pathname);});
 for(const path of Object.keys(pages).filter(p=>p!=="404")){
  const response=await page.goto(origin+path);expect(response!.status()).toBe(200);
  await expect(page.locator('h1')).toHaveCount(1);await expect(page.locator('meta[name=robots]')).toHaveAttribute("content","noindex,follow");
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute("href",origin+path);
  expect(await page.locator("img").evaluateAll(images=>images.every(img=>!(img as HTMLImageElement).complete||(img as HTMLImageElement).naturalWidth>0))).toBe(true);
  expect(await page.locator('footer a[href="/login?next=%2Fklant"]').count()).toBe(1);
 }
 expect(missingAssets).toEqual([]);
 expect((await page.goto(origin+"/not-present/"))!.status()).toBe(404);
 for(const next of["app","staff","klant"]){expect((await page.goto(`${origin}/login?next=%2F${next}`))!.status()).toBe(200);await expect(page.locator("form")).toBeVisible();await expect(page.locator("#request-form")).toHaveCount(0);}
});
test("layouts fit mobile, tablet, desktop and 200% text; menu and reduced motion remain usable",async({page})=>{
 test.setTimeout(90000);
 for(const width of[320,390,768,1024,1440]){
  await page.setViewportSize({width,height:900});await page.goto(origin+"/aanvragen/");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await expect(page.locator('[data-step="0"] h2')).toBeVisible();
 }
 await page.setViewportSize({width:390,height:850});await page.goto(origin);
 await page.getByRole("button",{name:"Menu openen"}).click();await expect(page.locator("#navigation")).toBeVisible();await page.getByRole("button",{name:"Menu sluiten"}).click();
 await page.emulateMedia({reducedMotion:"reduce"});await expect(page.locator("html")).toHaveClass(/motion-paused/);
 await page.locator("html").evaluate(el=>el.style.fontSize="200%");
 const overflow=await page.evaluate(()=>[...document.querySelectorAll("body *")].filter(el=>el.getBoundingClientRect().right>innerWidth+1).map(el=>({tag:el.tagName,cls:el.className,width:el.getBoundingClientRect().width})).slice(0,12));
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),JSON.stringify(overflow)).toBe(true);
 await page.screenshot({path:"/tmp/fieldgrid-marketing-mobile-200.png",fullPage:true});
});
test("real mixed-service submission, retained failures, retry identity and durable read-back",async({page})=>{
 test.setTimeout(90000);const initial=await page.goto(origin+"/aanvragen/?dienst=schoonmaak,beveiliging,facilitair&plaats=Den+Haag");expect(initial!.status()).toBe(200);
 const next=()=>page.locator("#wizard-next").click();await next();
 await page.locator("#location_type").selectOption({label:"Evenement"});await page.locator("#address").fill("Fictieve straat");await page.locator("#house_number").fill("12A");await page.locator("#postal_code").fill("2583HW");await next();
 await page.locator('[name="tasks-schoonmaak"]').first().check();await page.locator('[name="tasks-beveiliging"]').first().check();await page.locator('[name="tasks-facilitair"]').first().check();await page.locator("#details").fill("Testnotitie\nTweede regel ✓");await page.locator("#area_m2").fill("120.5");await page.locator("#visitors").fill("200");await next();
 await page.locator("#frequency").selectOption({label:"In overleg"});await page.locator("#flexible").uncheck();await page.locator("#start_date").fill("2027-02-06");await page.locator("#end_date").fill("2027-02-07");await page.locator("#start_time").fill("23:00");await page.locator("#end_time").fill("02:00");await next();
 await page.locator("#contact_name").fill("FICTITIOUS Aanvrager");await page.locator("#organization").fill("FICTITIOUS Organisatie");await page.locator("#email").fill("browser@example.test");await page.locator("#notes").fill("Een algemene vraag\nMet een tweede regel.");await next();
 await expect(page.locator("#request-summary")).toContainText("Planning bespreekbaar: Nee");
 let sent:string|undefined,fail=true;await page.route("**/api/veele-website/requests",async route=>{
  const payload=route.request().postData()!;if(sent)expect(payload).toBe(sent);sent=payload;
  if(fail){fail=false;const stored=await route.fetch();expect(stored.status()).toBe(200);await route.fulfill({status:503,contentType:"text/plain",body:"FICTITIOUS upstream unavailable"});return;}
  const response=await route.fetch();await route.fulfill({response});
 });
 await page.locator("#submit-request").click();await expect(page.locator("#submit-status")).toContainText("Uw invoer blijft behouden");
 await expect(page.locator("#contact_name")).toHaveValue("FICTITIOUS Aanvrager");
 await page.locator("#submit-request").click();await expect(page.locator("#submit-status")).toContainText("Uw aanvraag is ontvangen");await expect(page.locator("#submit-request")).toBeDisabled();
 const db=new pg.Client({connectionString:requireLocalDatabaseUrl().href});await db.connect();
 try{const rows=(await db.query("select r.*,c.name,ct.full_name from public.requests r join public.customers c on c.id=r.customer_id join public.customer_contacts ct on ct.id=r.contact_id where r.tenant_id=$1 and ct.email='browser@example.test'",[tenant])).rows;
  expect(rows).toHaveLength(1);expect(rows[0].discipline).toBe("Schoonmaak + Beveiliging + Facilitaire diensten");expect(rows[0].description).toContain("Nee (niet aangevinkt)");expect(rows[0].description).toContain("23:00");expect(rows[0].description).toContain("Testnotitie\nTweede regel ✓");expect(rows[0].name).toBe("FICTITIOUS Organisatie");expect(rows[0].full_name).toBe("FICTITIOUS Aanvrager");expect(rows[0].object_id).toBeNull();
 }finally{await db.end();}
});
