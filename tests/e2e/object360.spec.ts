import {test,expect,type Page} from "@playwright/test";
import {randomUUID} from "node:crypto";
import pg from "pg";
import {createClient} from "@supabase/supabase-js";
import type {Database} from "../../lib/database.types";

// Even fictitious OTPs/secret values must not end up in browser traces or videos.
test.use({trace:"off",screenshot:"off",video:"off"});
const object=randomUUID(),order=randomUUID(),secondOrder=randomUUID(),assignment=randomUUID();
let db:pg.Client,tenant:string,manager:string,customerUser:string;
const customerEmail=`object-customer-${randomUUID()}@fieldgrid.test`;
const fixtureCustomer="e2000000-0000-4000-8000-000000000001",fixturePerson="e1000000-0000-4000-8000-000000000001";
test.beforeAll(async()=>{
 const url=new URL(process.env.DATABASE_URL!);expect(url.hostname).toBe("127.0.0.1");expect(url.port).toBe("59322");
 db=new pg.Client({connectionString:url.href});await db.connect();
 tenant=(await db.query("select id from public.tenants where slug='fieldgrid-e2e'")).rows[0].id;
 manager=(await db.query("select id from auth.users where email='platform-admin@fieldgrid.test'")).rows[0].id;
 await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values($1,$2,$3,'OBJ-360-E2E','Object 360 testlocatie','{\"street\":\"Teststraat 20\",\"city\":\"Utrecht\",\"postal_code\":\"1234 AB\"}')",[object,tenant,fixtureCustomer]);
 for(const [i,id]of [order,secondOrder].entries())await db.query("insert into public.work_orders(id,tenant_id,customer_id,object_id,work_order_number,discipline,status,planned_start_at,planned_end_at,projected_start_at,projected_end_at,created_by) values($1,$2,$3,$4,$5,'Onderhoud','released',now()-interval '10 minutes',now()+interval '2 hours',now()-interval '10 minutes',now()+interval '2 hours',$6)",[id,tenant,fixtureCustomer,object,`OBJ360-${i+1}`,manager]);
 await db.query("insert into public.work_order_assignments(id,tenant_id,work_order_id,personnel_id,status,planned_start_at,planned_end_at,projected_start_at,projected_end_at) values($1,$2,$3,$4,'released',now()-interval '10 minutes',now()+interval '2 hours',now()-interval '10 minutes',now()+interval '2 hours')",[assignment,tenant,order,fixturePerson]);
 await db.query("insert into public.dispatches(tenant_id,work_order_id,assignment_id,dispatched_by,idempotency_key) values($1,$2,$3,$4,$5)",[tenant,order,assignment,manager,randomUUID()]);
 const api=createClient<Database>(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
 const u=await api.auth.admin.createUser({email:customerEmail,password:"Fieldgrid-Object-E2E-2026",email_confirm:true});if(u.error||!u.data.user)throw new Error("Could not create local customer fixture");customerUser=u.data.user.id;
 await db.query("insert into public.object_customer_bindings(tenant_id,object_id,user_id,created_by) values($1,$2,$3,$4)",[tenant,object,customerUser,manager]);
});
test.afterAll(async()=>{
 if(!db)return;
 const paths=(await db.query("select storage_path from public.object_documents where object_id=$1",[object])).rows.map(r=>r.storage_path);
 if(paths.length){const api=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});await api.storage.from("object-documents").remove(paths);}
 const vaultIds=(await db.query("select v.vault_id from private.object_secret_versions v join private.object_secret_items i on i.id=v.item_id where i.object_id=$1",[object])).rows.map(r=>r.vault_id);
 for(const table of ["object_access_grants","object_otp_challenges","object_access_audit"])await db.query(`delete from private.${table} where object_id=$1`,[object]);
 await db.query("delete from private.object_secret_scopes where assignment_id=$1",[assignment]);await db.query("delete from private.object_access_extensions where assignment_id=$1",[assignment]);
 await db.query("delete from private.object_secret_versions where item_id in(select id from private.object_secret_items where object_id=$1)",[object]);await db.query("delete from private.object_secret_items where object_id=$1",[object]);await db.query("delete from private.object_vault_state where object_id=$1",[object]);await db.query("delete from vault.secrets where id=any($1)",[vaultIds]);
 for(const table of ["object_documents","object_request_proposals","object_visit_requests","object_instruction_receipts","object_records","object_nodes","object_reminder_recipients","object_customer_bindings","object_history"])await db.query(`delete from public.${table} where object_id=$1`,[object]);
 await db.query("delete from public.audit_events where entity_id=any($1)",[[object,order,secondOrder]]);await db.query("delete from public.work_orders where id=any($1)",[[order,secondOrder]]);await db.query("delete from public.objects where id=$1",[object]);
 if(customerUser)await db.query("delete from auth.users where id=$1",[customerUser]);await db.end();
});
async function login(page:Page,next:string,email="platform-admin@fieldgrid.test",password="Fieldgrid-E2E-2026"){
 await page.goto(`/login?next=${encodeURIComponent(next)}`);await page.getByLabel("E-mailadres").fill(email);await page.getByLabel("Wachtwoord",{exact:true}).fill(password);await page.getByRole("button",{name:/Inloggen/}).click();await page.waitForURL(url=>url.pathname!=="/login");
}
test("Object 360: full page tabs, structure, versioned instructions and responsive layout",async({page})=>{
 test.setTimeout(120000);await login(page,`/app/objecten/${object}`);
 await expect(page.getByRole("heading",{name:"Object 360 testlocatie",exact:true})).toBeVisible();
 const tabs=page.getByRole("navigation",{name:"Objectdossier tabbladen"});await expect(tabs.getByRole("link")).toHaveCount(12);
 for(const width of [1440,768,390,320]){
  await page.setViewportSize({width,height:950});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await expect(page).toHaveScreenshot(`object360-overview-${width}.png`,{fullPage:true,stylePath:"tests/e2e/dossier-screenshot.css",mask:[page.locator(".object-metrics strong").first()]});
 }
 await page.setViewportSize({width:1440,height:1000});await tabs.getByRole("link",{name:"Locatie & structuur"}).click();await expect(tabs.getByRole("link",{name:"Locatie & structuur"})).toHaveAttribute("aria-current","page");
 await page.getByRole("button",{name:"Onderdeel toevoegen"}).click();const node=page.getByRole("dialog",{name:"Locatieonderdeel toevoegen"});await node.getByLabel("Naam",{exact:true}).fill("Entree");await node.getByRole("button",{name:"Opslaan",exact:true}).click();await expect(node).toBeHidden();await expect(page.getByText("Entree",{exact:true})).toBeVisible();
 await tabs.getByRole("link",{name:"Instructies & taken"}).click();await expect(tabs.getByRole("link",{name:"Instructies & taken"})).toHaveAttribute("aria-current","page");await page.getByRole("button",{name:"Instructie toevoegen",exact:true}).last().click();const instruction=page.getByRole("dialog",{name:"Nieuw · Instructie"});
 await instruction.getByLabel("Titel",{exact:true}).fill("Controleer de entree");await instruction.getByLabel("Omschrijving",{exact:true}).fill("Deze fictieve instructie hoort alleen bij dit bezoek.");await instruction.getByLabel("Geldigheid",{exact:true}).selectOption("appointment");await instruction.getByLabel("Concrete afspraak").selectOption(order);await instruction.getByRole("button",{name:"Opslaan",exact:true}).click();await expect(instruction).toBeHidden();await expect(page.getByRole("heading",{name:"Controleer de entree"})).toBeVisible();
 await page.getByRole("button",{name:"Versies",exact:true}).click();await expect(page.getByRole("dialog",{name:"Versiehistorie"})).toContainText("Versie 1");await page.keyboard.press("Escape");
 await tabs.getByRole("link",{name:"Documenten & plattegronden"}).click();await expect(tabs.getByRole("link",{name:"Documenten & plattegronden"})).toHaveAttribute("aria-current","page");await expect(page.getByText("Nog geen documenten.",{exact:false})).toBeVisible();
 await page.getByRole("button",{name:"Document toevoegen",exact:true}).last().click();const docDialog=page.getByRole("dialog",{name:"Document toevoegen"});
 await docDialog.getByLabel("Titel",{exact:true}).fill("Testplattegrond");await docDialog.getByLabel("Bestand",{exact:true}).setInputFiles({name:"test.pdf",mimeType:"application/pdf",buffer:Buffer.from("%PDF-1.4\n% Fictitious local document\n%%EOF")});await docDialog.getByRole("button",{name:"Opslaan",exact:true}).click();await expect(docDialog).toBeHidden();
 const opened=page.getByRole("link",{name:"Openen",exact:true});const fileResponse=await page.request.get((await opened.getAttribute("href"))!);expect(fileResponse.status()).toBe(200);expect(fileResponse.headers()["cache-control"]).toContain("no-store");
});
test("Object 360: customer request applies to exactly one visit and reaches backoffice",async({page,browser})=>{
 await login(page,`/klant?object=${object}&order=${order}`,customerEmail,"Fieldgrid-Object-E2E-2026");
 await page.getByRole("button",{name:"Instructie of verzoek toevoegen"}).click();await page.getByLabel("Titel",{exact:true}).fill("Toiletten vandaag extra aandacht");await page.getByLabel("Wat wil je doorgeven?").fill("Alleen bij dit bezoek, niet bij het volgende.");await page.getByRole("button",{name:"Verzoek versturen"}).click();await expect(page.getByRole("heading",{name:"Toiletten vandaag extra aandacht"})).toBeVisible();
 await page.getByRole("button",{name:"Verzoek gelezen",exact:true}).click();await expect(page.getByText("Deze versie gelezen",{exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Verzoek wijzigen",exact:true}).click();await page.getByLabel("Wat wil je doorgeven?").fill("Aangepast: alleen de toiletten beneden, bij dit bezoek.");await page.getByRole("button",{name:"Wijziging versturen"}).click();await expect(page.getByText("Deze versie gelezen",{exact:true})).toHaveCount(0);
 await page.getByText("Bijlage toevoegen aan dit verzoek",{exact:true}).click();await page.getByLabel("Titel",{exact:true}).fill("Bezoekbijlage");await page.getByLabel("Bestand (PDF, JPG of PNG)").setInputFiles({name:"visit.pdf",mimeType:"application/pdf",buffer:Buffer.from("%PDF-1.4\n% Fictitious visit attachment\n%%EOF")});await page.getByRole("button",{name:"Bijlage uploaden",exact:true}).click();const fileLink=page.getByRole("link",{name:"Bezoekbijlage · versie 1"});await expect(fileLink).toBeVisible();
 const ownFile=(await fileLink.getAttribute("href"))!;expect((await page.request.get(ownFile)).status()).toBe(200);expect((await page.request.get(ownFile.replace(order,secondOrder))).status()).toBe(404);
 await page.goto(`/klant?object=${object}&order=${secondOrder}`);await expect(page.getByText("Toiletten vandaag extra aandacht")).toHaveCount(0);
 const context=await browser.newContext();const backoffice=await context.newPage();
 try{await login(backoffice,`/app/objecten/${object}?tab=instructies`);await expect(backoffice.getByRole("heading",{name:"Toiletten vandaag extra aandacht"})).toBeVisible();await expect(backoffice.getByText("Beoordeling nodig: Het verzoek is gewijzigd;",{exact:false})).toBeVisible();}finally{await context.close();}
});
test("Object 360: branded OTP mail, no-store secure value, blur and revocation",async({page,request})=>{
 test.setTimeout(90000);await login(page,`/app/objecten/${object}?tab=toegang`);
 const card=page.getByRole("region",{name:"Beveiligde objectgegevens"});await expect(card.getByRole("button",{name:"Verificatiecode aanvragen"})).toBeVisible();
 await card.getByRole("button",{name:"Verificatiecode aanvragen"}).click();await expect(card.getByLabel("Code uit je e-mail")).toBeVisible();
 let code="";await expect.poll(async()=>{const r=await request.get("http://127.0.0.1:59329/messages?recipient=platform-admin%40fieldgrid.test");const mails=await r.json() as Array<{subject:string;content:Array<{type:string;value:string}>}>;const mail=mails.filter(m=>m.subject.includes("verificatiecode")).at(-1);const text=mail?.content.find(c=>c.type==="text/plain")?.value??"";code=text.match(/\b\d{6}\b/)?.[0]??"";return code.length;}).toBe(6);
 await card.getByLabel("Code uit je e-mail").fill(code);await card.getByRole("button",{name:"Bevestigen",exact:true}).click();await expect(card.getByLabel("Nieuwe geheime waarde")).toBeVisible();
 await card.getByLabel("Naam",{exact:true}).fill("Fictieve alarmcode");await card.getByLabel("Nieuwe geheime waarde").fill("FICTIONAL-BROWSER-VALUE");await card.getByRole("button",{name:"Versleuteld opslaan"}).click();await expect(card.getByRole("status")).toContainText("Beveiligd opgeslagen");await expect(card.getByText("FICTIONAL-BROWSER-VALUE")).toHaveCount(0);
 await db.query("delete from private.object_access_audit where object_id=$1 and actor_id=$2 and event='requested'",[object,manager]);
 await card.getByLabel("Gegeven",{exact:true}).selectOption({label:"Fictieve alarmcode · versie 1"});await card.getByRole("button",{name:"Verificatiecode aanvragen"}).click();await expect(card.getByLabel("Code uit je e-mail")).toBeVisible();
 const mails=await (await request.get("http://127.0.0.1:59329/messages?recipient=platform-admin%40fieldgrid.test")).json() as Array<{subject:string;content:Array<{type:string;value:string}>}>;
 const mail=mails.filter(m=>m.subject.includes("verificatiecode")).at(-1)!;expect(mail.content.some(c=>c.value.includes("FICTIONAL-BROWSER-VALUE"))).toBe(false);expect(mail.content.find(c=>c.type==="text/html")?.value.includes("TIJDELIJKE VERIFICATIECODE")).toBe(true);
 code=mail.content.find(c=>c.type==="text/plain")!.value.match(/\b\d{6}\b/)![0];await card.getByLabel("Code uit je e-mail").fill(code);
 const response=page.waitForResponse(r=>r.url().endsWith("/api/objects/vault")&&r.request().postDataJSON().operation==="read");await card.getByRole("button",{name:"Bevestigen",exact:true}).click();const valueResponse=await response;expect(valueResponse.headers()["cache-control"]).toContain("no-store");await expect(card.locator(".object-secret-value")).toBeVisible();
 await page.evaluate(()=>window.dispatchEvent(new Event("blur")));await expect(card.locator(".object-secret-value")).toHaveCount(0);await expect(card.getByRole("button",{name:"Verificatiecode aanvragen"})).toBeVisible();
 expect(await page.evaluate(()=>JSON.stringify({...localStorage}).includes("FICTIONAL-BROWSER-VALUE"))).toBe(false);
});
