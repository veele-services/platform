import {test,expect,type Page} from "@playwright/test";
import {randomUUID} from "node:crypto";
import pg from "pg";
import {createClient} from "@supabase/supabase-js";
import type {Database} from "../../lib/database.types";

test("commerciële lijst, aanvraag, bevroren PDF-mail, expliciet akkoord en één operationele opdracht",async({page,browser,request})=>{
 test.setTimeout(240000);
 page.setDefaultTimeout(20000);
 const dbUrl=new URL(process.env.DATABASE_URL!);expect(dbUrl.hostname).toBe("127.0.0.1");expect(dbUrl.port).toBe("59322");
 const db=new pg.Client({connectionString:dbUrl.href});await db.connect();
 const admin=createClient<Database>(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
 const tenant=randomUUID(),customer=randomUUID(),object=randomUUID();const email=`commercial-${tenant}@fieldgrid.test`;
 const owner=(await db.query("select id from auth.users where email='platform-admin@fieldgrid.test'")).rows[0].id;
 const signIn=async(p:Page)=>{await p.context().addCookies([{name:"fieldgrid_tenant_id",value:tenant,url:"http://127.0.0.1:3000"}]);await p.goto("/login?next=/app/aanvragen");await p.getByLabel("E-mailadres").fill("platform-admin@fieldgrid.test");await p.getByLabel("Wachtwoord").fill("Fieldgrid-E2E-2026");await p.getByRole("button",{name:"Inloggen"}).click();await expect(p).toHaveURL(url=>url.pathname==="/app/aanvragen",{timeout:30000});};
 try{
  await db.query("insert into public.tenants(id,slug,name) values($1,$2,'Fictieve commerciële testorganisatie')",[tenant,`commercial-${tenant}`]);
  await db.query("insert into public.tenant_settings(tenant_id,enabled_services) values($1,array['planning','finance','rapportage'])",[tenant]);await db.query("insert into public.tenant_branding(tenant_id) values($1)",[tenant]);
  await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['tenant_admin','management','planner','finance']::public.app_role[],'active')",[tenant,owner]);
  await db.query("select private.insert_default_message_templates($1,$2)",[tenant,owner]);
  await db.query("insert into public.customers(id,tenant_id,customer_number,name,billing_email,billing_address) values($1,$2,'TEST-KL-1','Fictieve commerciële klant',$3,'{\"street\":\"Teststraat 12\",\"postal_code\":\"1234 AB\",\"city\":\"Teststad\"}')",[customer,tenant,email]);
  await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address,access_instructions) values($1,$2,$3,'TEST-OBJ-1','Fictieve werklocatie','{\"street\":\"Teststraat 40\",\"city\":\"Teststad\"}','PRIVATE TEST ACCESS NEVER IN OFFER')",[object,tenant,customer]);
  await signIn(page);await page.setViewportSize({width:1440,height:1000});
  await expect(page.getByRole("table")).toBeVisible();await expect(page.getByRole("heading",{name:"Nieuwe aanvraag",exact:true})).toHaveCount(0);
  await page.getByRole("button",{name:"Nieuwe aanvraag",exact:true}).click();let dialog=page.getByRole("dialog");
  await dialog.getByRole("combobox",{name:"Klant",exact:true}).selectOption(customer);await expect(dialog.getByRole("combobox",{name:"Object",exact:true}).locator("option",{hasText:"Fictieve werklocatie"})).toHaveCount(1);await dialog.getByRole("combobox",{name:"Object",exact:true}).selectOption(object);
  await dialog.getByRole("button",{name:"Volgende"}).click();await dialog.getByLabel("Onderwerp",{exact:true}).fill("Fictieve controle aanvraag");await dialog.getByLabel("Oorspronkelijke klantvraag").fill("Controleer de afgesproken onderdelen. Dit is herkenbare testinformatie.");await dialog.getByLabel("Dienst / discipline").fill("Onderhoud");await dialog.getByRole("button",{name:"Volgende"}).click();await dialog.getByRole("button",{name:"Aanvraag opslaan",exact:true}).click();
  await expect(dialog.getByRole("heading",{name:"Fictieve controle aanvraag",exact:true})).toBeVisible();await expect(dialog.getByText("Oorspronkelijke klantvraag",{exact:true})).toBeVisible();
  const savedRequest=(await db.query('select id from public.requests where tenant_id=$1',[tenant])).rows[0];expect(savedRequest).toBeTruthy();
  await dialog.getByRole("button",{name:"Offerte opstellen",exact:true}).click();dialog=page.getByRole("dialog");await expect(dialog.getByRole("heading",{name:"Nieuwe offerte"})).toBeVisible();await dialog.getByRole("button",{name:"Volgende"}).click();
  await dialog.getByRole("button",{name:"Handmatige regel"}).click();await dialog.getByLabel("Omschrijving",{exact:true}).fill("Fictieve werkzaamheden met korting");await dialog.getByLabel("Aantal",{exact:true}).fill("3.125");await dialog.getByLabel("Tarief excl. btw").fill("12.99");await dialog.getByLabel("Btw %").fill("9");await dialog.getByLabel("Korting %").fill("7.5");await dialog.getByLabel("Duur per eenheid (minuten)").fill("30");await dialog.getByRole("button",{name:"Volgende"}).click();await dialog.getByLabel("Voorwaarden",{exact:true}).fill("Fictieve voorwaarden; uitvoering na planning.");await dialog.getByRole("button",{name:"Volgende"}).click();
  await expect(dialog.getByRole("article",{name:"Offertevoorbeeld"})).toContainText("Teststraat 12");await expect(dialog.getByRole("article",{name:"Offertevoorbeeld"})).not.toContainText("PRIVATE TEST ACCESS");
  await request.post("http://127.0.0.1:59329/reject-next");
  await dialog.getByRole("button",{name:"Verzenden",exact:true}).click();await expect(dialog.getByRole("button",{name:"PDF downloaden"})).toHaveCount(0); // PDF is a link, not a fake button.
  await expect(dialog.getByRole("link",{name:"PDF downloaden"})).toBeVisible({timeout:20000});
  expect((await db.query("select status from public.mail_deliveries where tenant_id=$1 and template='quote'",[tenant])).rows[0].status).toBe("failed");
  await dialog.getByRole("button",{name:"Verzenden / opnieuw proberen",exact:true}).click();
  await expect(dialog.getByRole("button",{name:"Herinnering sturen",exact:true})).toBeVisible();
  const quote=(await db.query('select * from public.quotes where tenant_id=$1',[tenant])).rows[0];expect(quote.sent_at).toBeTruthy();expect(quote.snapshot.subtotal_cents).toBe(3755);
  const mails=await(await request.get(`http://127.0.0.1:59329/messages?recipient=${email}`)).json();const mail=mails.find((m:{attachments?:unknown[]})=>m.attachments?.length);expect(mail).toBeTruthy();expect(Buffer.from(mail.attachments[0].content,"base64").subarray(0,4).toString()).toBe("%PDF");
  expect(mails.filter((m:{attachments?:unknown[]})=>m.attachments?.length)).toHaveLength(1);
  const storedPdf=await page.request.get(`/api/files/commercial/${quote.id}?asset=pdf`);expect(storedPdf.status()).toBe(200);expect(await storedPdf.body()).toEqual(Buffer.from(mail.attachments[0].content,"base64"));
  expect((await request.get(`/api/files/commercial/${quote.id}?asset=pdf`)).status()).toBe(404);
  const body=mail.content.find((c:{type:string})=>c.type==="text/plain").value as string;const url=body.match(/http:\/\/127\.0\.0\.1:3000\/quote\/[A-Za-z0-9_-]+/)?.[0];expect(Boolean(url)).toBe(true);
  const customerContext=await browser.newContext();const customerPage=await customerContext.newPage();await customerPage.goto(url!);await expect(customerPage.getByRole("article",{name:"Offertevoorbeeld"})).toBeVisible();expect((await db.query('select status from public.quotes where id=$1',[quote.id])).rows[0].status).toBe("awaiting_acceptance");
  await customerPage.getByLabel("Naam beslisser",{exact:true}).fill("Fictieve akkoordgever");await customerPage.getByRole("checkbox").check();await customerPage.getByRole("button",{name:"Akkoord bevestigen"}).click();await expect(customerPage.getByText(/Je besluit over deze offerteversie is vastgelegd/).first()).toBeVisible();await customerContext.close();
  await page.reload();dialog=page.getByRole("dialog");await expect(dialog.getByRole("button",{name:"Omzetten naar opdracht"})).toBeVisible();await dialog.getByRole("button",{name:"Omzetten naar opdracht"}).click();await dialog.getByRole("button",{name:"Bevestigen en opslaan"}).click();await expect(dialog.getByRole("link",{name:"Naar planning / Inplannen"})).toBeVisible();
  const orders=(await db.query('select * from public.work_orders where tenant_id=$1 and quote_id=$2',[tenant,quote.id])).rows;expect(orders).toHaveLength(1);expect(orders[0].projected_start_at).toBeNull();
  await dialog.getByRole("button",{name:"Sluiten",exact:true}).click();await expect(page.getByRole("dialog")).toHaveCount(0);await page.getByRole("tab",{name:"Offertes",exact:true}).click();await page.getByLabel("Aanvragen en offertes zoeken").fill("Fictieve controle");await expect(page.getByRole("table").getByRole("row")).toHaveCount(2);await page.getByRole("button",{name:"Bekijk",exact:true}).click();await page.getByRole("dialog").getByRole("button",{name:"Sluiten",exact:true}).click();await expect(page.getByRole("dialog")).toHaveCount(0);await expect(page.getByLabel("Aanvragen en offertes zoeken")).toHaveValue("Fictieve controle");
  for(const width of [1440,768,390]){await page.setViewportSize({width,height:900});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);await expect(page.getByRole("table")).toBeVisible();await page.locator(".table-scroll").first().evaluate(e=>{e.scrollLeft=e.scrollWidth;});await expect(page.getByRole("button",{name:"Bekijk",exact:true})).toBeVisible();}
  await page.screenshot({path:"test-results/commercial-mobile.png",fullPage:true});await page.setViewportSize({width:1440,height:1000});await page.locator(".table-scroll").first().evaluate(e=>{e.scrollLeft=0;});await page.screenshot({path:"test-results/commercial-desktop.png",fullPage:true});
  await page.goto(`/app/objecten/${object}?tab=commercieel`);await expect(page.getByRole("heading",{name:"Aanvragen & Offertes",exact:true})).toBeVisible();await expect(page.getByText("Fictieve controle aanvraag").first()).toBeVisible();
 }finally{
  const docs=(await db.query("select pdf_path,logo_path from public.quotes where tenant_id=$1",[tenant])).rows;const paths=docs.flatMap(q=>[q.pdf_path,q.logo_path].filter(Boolean));if(paths.length)await admin.storage.from("commercial-documents").remove(paths);
  await db.query('begin');await db.query("set local session_replication_role='replica'");const tables=(await db.query("select table_schema,table_name from information_schema.columns where column_name='tenant_id' and table_schema in ('public','private')")).rows;for(const {table_schema:s,table_name:n} of tables)await db.query(`delete from "${s}"."${n}" where tenant_id=$1`,[tenant]);await db.query('delete from public.tenants where id=$1',[tenant]);await db.query('commit');await db.end();
 }
});
