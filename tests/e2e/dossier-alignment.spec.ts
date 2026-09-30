import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

test.use({actionTimeout:15000});
const customer=randomUUID(),object=randomUUID(),order=randomUUID(),task=randomUUID();
const revision="e5000000-0000-4000-8000-000000000001";
let db:pg.Client,tenant:string,manager:string;
test.beforeAll(async()=>{
 const url=new URL(process.env.DATABASE_URL!);expect(url.hostname).toBe("127.0.0.1");expect(url.port).toBe("59322");db=new pg.Client({connectionString:url.href});await db.connect();
 tenant=(await db.query("select id from public.tenants where slug='fieldgrid-e2e'")).rows[0].id;manager=(await db.query("select id from auth.users where email='platform-admin@fieldgrid.test'")).rows[0].id;
 await db.query("insert into public.customers(id,tenant_id,customer_number,name,billing_email) values($1,$2,'KL-CHAIN','Dossier Ketenproef','chain@fieldgrid.test')",[customer,tenant]);
 await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values($1,$2,$3,'OB-CHAIN','Ketenproef locatie','{\"street\":\"Teststraat 30\",\"city\":\"Utrecht\"}')",[object,tenant,customer]);
 await db.query("insert into public.work_orders(id,tenant_id,customer_id,object_id,work_order_number,discipline,status,planned_start_at,planned_end_at,projected_start_at,projected_end_at,created_by) values($1,$2,$3,$4,'WB-CHAIN','Onderhoud','in_progress',now(),now()+interval '1 hour',now(),now()+interval '1 hour',$5)",[order,tenant,customer,object,manager]);
});
test.afterAll(async()=>{if(!db)return;try{
 const docs=(await db.query("select storage_path from public.customer_documents where customer_id=$1",[customer])).rows;
 const invoices=(await db.query("select id,pdf_storage_path from public.invoices where customer_id=$1",[customer])).rows;
 const api=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
 if(docs.length)await api.storage.from("customer-documents").remove(docs.map(d=>d.storage_path));
 if(invoices.some(i=>i.pdf_storage_path))await api.storage.from("invoices").remove(invoices.flatMap(i=>i.pdf_storage_path?[i.pdf_storage_path]:[]));
 await db.query("delete from public.invoice_lines where invoice_id=any($1)",[invoices.map(i=>i.id)]);await db.query("delete from public.invoices where customer_id=$1",[customer]);await db.query("delete from public.review_decisions where work_order_id=$1",[order]);
 await db.query("delete from public.work_orders where id=$1",[order]);await db.query("delete from public.object_records where object_id=$1",[object]);await db.query("delete from public.customer_agreement_lines where object_id=$1",[object]);await db.query("delete from public.customer_agreements where customer_id=$1",[customer]);await db.query("delete from public.customer_documents where customer_id=$1",[customer]);await db.query("delete from public.object_history where object_id=$1",[object]);await db.query("delete from public.objects where id=$1",[object]);await db.query("delete from public.customers where id=$1",[customer]);
}finally{await db.end();}});

test("Dossier 360: customer agreement, object programme, partial execution and linked invoice",async({page})=>{
 test.setTimeout(180000);
 await page.goto(`/login?next=${encodeURIComponent(`/app/klanten?record=${customer}`)}`);await page.getByLabel("E-mailadres").fill("platform-admin@fieldgrid.test");await page.getByLabel("Wachtwoord",{exact:true}).fill("Fieldgrid-E2E-2026");await page.getByRole("button",{name:/Inloggen/}).click();
 const dossier=page.getByRole("dialog",{name:"Dossier Ketenproef"});await expect(dossier).toBeVisible();
 await dossier.getByRole("tab",{name:"Documenten",exact:true}).click();await expect(page).toHaveURL(/tab=documents/);
 await dossier.getByLabel("Titel",{exact:true}).fill("Getekende klantafspraak");await dossier.getByLabel("Bestand",{exact:true}).setInputFiles({name:"agreement.pdf",mimeType:"application/pdf",buffer:Buffer.from("%PDF-1.4\n% Fictitious agreement\n%%EOF")});await dossier.getByRole("button",{name:"Document uploaden",exact:true}).click();await expect(dossier.getByRole("link",{name:"Getekende klantafspraak downloaden"})).toBeVisible();
 await dossier.getByRole("tab",{name:"Afspraken & contracten"}).click();await dossier.getByRole("button",{name:"Klantafspraak vastleggen",exact:true}).click();
 const form=dossier.locator(".chain-agreement-form");await form.getByLabel("Titel",{exact:true}).fill("Periodieke afspraak");await form.getByLabel("Geldig vanaf").fill("2026-01-01");await form.getByLabel("Akkoordgever").fill("Fictieve opdrachtgever");await form.getByLabel("Akkoorddatum").fill("2026-01-01");await form.getByLabel("Akkoordbewijs").selectOption({label:"Getekende klantafspraak · versie 1"});await form.getByLabel("Object",{exact:true}).selectOption(object);await form.getByLabel("Catalogustaak").selectOption(revision);await form.getByLabel("Afgesproken omvang").fill("Drie gecontroleerde eenheden per bezoek");await form.getByLabel("Maximale hoeveelheid per bezoek").fill("3");await form.getByLabel("Prijs per eenheid excl. btw").fill("12");await form.getByLabel("Maximumbedrag per bezoek excl. btw").fill("36");await form.getByRole("button",{name:"Opslaan",exact:true}).click();await expect(form).toBeHidden();await expect(dossier.getByRole("heading",{name:"Periodieke afspraak",exact:true})).toBeVisible();
 await page.goto(`/app/objecten/${object}?tab=diensten`);await page.getByRole("button",{name:"Werkprogramma toevoegen"}).click();const programme=page.getByRole("dialog",{name:"Nieuw · Werkprogramma"});await programme.getByLabel("Titel",{exact:true}).fill("Vast werkprogramma");await programme.getByLabel(/^Status/).selectOption("active");await programme.getByLabel("Taak uit bestaande catalogus").selectOption(revision);const option=programme.getByLabel("Vastgelegde klantafspraak").locator("option").last();await programme.getByLabel("Vastgelegde klantafspraak").selectOption((await option.getAttribute("value"))!);await programme.getByRole("button",{name:"Opslaan",exact:true}).click();await expect(programme).toBeHidden();
 await db.query("insert into public.work_order_tasks(id,tenant_id,work_order_id,task_revision_id,task_code,task_name,duration_minutes,quantity,unit,unit_price_cents,vat_basis_points) values($1,$2,$3,$4,'CHAIN','Ketenproef uitvoering',30,3,'task',4500,2100)",[task,tenant,order,revision]);
 expect((await db.query("select unit_price_cents,agreement_line_id from public.work_order_tasks where id=$1",[task])).rows[0]).toMatchObject({unit_price_cents:"1200"});
 await page.goto(`/app/werkbonnen/${order}`);await page.getByRole("button",{name:"Hoeveelheid / deeluitvoering"}).click();await page.getByLabel("Uitvoeringsresultaat").selectOption("partial");await page.getByLabel("Werkelijk uitgevoerde hoeveelheid").fill("2");await page.getByLabel("Resultaat en resterend werk").fill("Twee klaar; derde volgt bij volgende overeengekomen afspraak.");await page.getByRole("button",{name:"Opslaan",exact:true}).click();await expect(page.getByText("Uitgevoerd: 2 van 3 task")).toBeVisible();
 await db.query("update public.work_orders set status='completed' where id=$1",[order]);
 await page.goto("/app/rapporten");const report=page.locator("tr").filter({hasText:"WB-CHAIN"});await report.getByRole("button",{name:"Bekijk"}).click();const review=page.getByRole("dialog");await review.getByRole("button",{name:/Goedkeuren/}).click();
 await expect.poll(async()=>(await db.query("select status from public.work_orders where id=$1",[order])).rows[0].status).toBe("invoice_ready");
 await page.goto("/app/facturen");await page.getByRole("button",{name:"Nieuwe factuur",exact:true}).click();const invoice=page.getByRole("dialog",{name:"Nieuwe factuur"});await invoice.locator("form").filter({hasText:"Dossier Ketenproef"}).getByRole("button",{name:"Factuur maken"}).click();await expect(invoice).toBeHidden();
 const lines=(await db.query("select quantity,unit_price_cents,source_snapshot from public.invoice_lines where work_order_task_id=$1",[task])).rows;expect(lines).toHaveLength(1);expect(lines[0].quantity).toBe("2.000");expect(lines[0].unit_price_cents).toBe("1200");expect(lines[0].source_snapshot.agreement.version).toBe(1);
 await page.goto(`/app/klanten?record=${customer}&tab=finance`);await expect(page.getByRole("link",{name:"Open factuur"})).toBeVisible();
 for(const width of [1440,768,390]){await page.setViewportSize({width,height:950});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await page.goto("/app/opvolging");await expect(page.getByRole("heading",{name:"Gezamenlijke opvolging"})).toBeVisible();
});
