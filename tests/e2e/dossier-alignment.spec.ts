import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";
import type { Database } from "../../lib/database.types";
import { requireLocalApiUrl, requireLocalDatabaseUrl } from "./local-target";
import { authenticateWorkspace } from "./login-auth";

test.use({actionTimeout:15000});
const customer=randomUUID(),object=randomUUID(),order=randomUUID(),task=randomUUID(),assignment=randomUUID();
const person="e1000000-0000-4000-8000-000000000001";
const revision="e5000000-0000-4000-8000-000000000001";
let db:pg.Client,tenant:string,manager:string;
test.beforeAll(async()=>{
 const url=requireLocalDatabaseUrl();db=new pg.Client({connectionString:url.href});await db.connect();
 tenant=(await db.query("select id from public.tenants where slug='fieldgrid-e2e'")).rows[0].id;manager=(await db.query("select id from auth.users where email='platform-admin@fieldgrid.test'")).rows[0].id;
 await db.query("insert into public.customers(id,tenant_id,customer_number,name,billing_email) values($1,$2,'KL-CHAIN','Dossier Ketenproef','chain@fieldgrid.test')",[customer,tenant]);
 await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values($1,$2,$3,'OB-CHAIN','Ketenproef locatie','{\"street\":\"Teststraat 30\",\"city\":\"Utrecht\"}')",[object,tenant,customer]);
 await db.query("insert into public.work_orders(id,tenant_id,customer_id,object_id,work_order_number,discipline,status,signature_mode,lead_personnel_id,planned_start_at,planned_end_at,projected_start_at,projected_end_at,actual_start_at,created_by) values($1,$2,$3,$4,'WB-CHAIN','Onderhoud','in_progress','none',$6,now()-interval '30 minutes',now()+interval '30 minutes',now()-interval '30 minutes',now()+interval '30 minutes',now()-interval '30 minutes',$5)",[order,tenant,customer,object,manager,person]);
 await db.query("insert into public.work_order_assignments(id,tenant_id,work_order_id,personnel_id,status,planned_start_at,planned_end_at,projected_start_at,projected_end_at,actual_start_at) select $1,tenant_id,id,$2,'in_progress',planned_start_at,planned_end_at,projected_start_at,projected_end_at,actual_start_at from public.work_orders where id=$3",[assignment,person,order]);
 await db.query("insert into public.dispatches(tenant_id,work_order_id,assignment_id,dispatched_by,idempotency_key) values($1,$2,$3,$4,$5)",[tenant,order,assignment,manager,randomUUID()]);
 await db.query("insert into public.time_entries(tenant_id,personnel_id,assignment_id,kind,starts_at) values($1,$2,$3,'work',now()-interval '30 minutes')",[tenant,person,assignment]);
});
test.afterAll(async()=>{if(!db)return;try{
 const docs=(await db.query("select storage_path from public.customer_documents where customer_id=$1",[customer])).rows;
 const invoices=(await db.query("select id,pdf_storage_path from public.invoices where customer_id=$1",[customer])).rows;
 const api=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
 if(docs.length)await api.storage.from("customer-documents").remove(docs.map(d=>d.storage_path));
 if(invoices.some(i=>i.pdf_storage_path))await api.storage.from("invoices").remove(invoices.flatMap(i=>i.pdf_storage_path?[i.pdf_storage_path]:[]));
 await db.query("delete from public.invoice_lines where invoice_id=any($1)",[invoices.map(i=>i.id)]);await db.query("delete from public.invoices where customer_id=$1",[customer]);await db.query("delete from public.review_decisions where work_order_id=$1",[order]);
 // Only this isolated fixture's immutable report and task contribution may be removed.
 requireLocalDatabaseUrl();
 expect((await db.query("select slug from public.tenants where id=$1",[tenant])).rows[0].slug).toBe("fieldgrid-e2e");
 await db.query("begin");try{await db.query("set local session_replication_role='replica'");
  await db.query("delete from public.work_order_report_versions where tenant_id=$1 and work_order_id=$2",[tenant,order]);
  await db.query("delete from public.work_order_task_contributions where tenant_id=$1 and task_id=$2",[tenant,task]);
  await db.query("commit");
 }catch(error){await db.query("rollback");throw error;}
 await db.query("delete from public.work_orders where id=$1",[order]);await db.query("delete from public.object_records where object_id=$1",[object]);await db.query("delete from public.customer_agreement_lines where object_id=$1",[object]);await db.query("delete from public.customer_agreements where customer_id=$1",[customer]);await db.query("delete from public.customer_documents where customer_id=$1",[customer]);await db.query("delete from public.object_history where object_id=$1",[object]);await db.query("delete from public.objects where id=$1",[object]);await db.query("delete from public.customers where id=$1",[customer]);
}finally{await db.end();}});

async function stopAndSubmitStaffReport(){
 const apiUrl=requireLocalApiUrl();
 const staff=createClient<Database>(apiUrl.href,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const signedIn=await staff.auth.signInWithPassword({email:"field-worker@fieldgrid.test",password:"Fieldgrid-E2E-2026"});expect(signedIn.error).toBeNull();
 try{
  const version=Number((await db.query("select version from public.work_orders where id=$1",[order])).rows[0].version);
  const stopped=await staff.rpc("transition_work_order",{target_work_order_id:order,action:"stop",expected_version:version,idempotency_key:randomUUID()});expect(stopped.error).toBeNull();
  expect((await db.query("select status from public.work_order_assignments where id=$1",[assignment])).rows[0].status).toBe("completed");
  expect((await db.query("select count(*)::int total from public.time_entries where assignment_id=$1 and ends_at is null",[assignment])).rows[0].total).toBe(0);
  const updatedVersion=Number((await db.query("select version from public.work_orders where id=$1",[order])).rows[0].version);
  const report=await staff.rpc("submit_work_order_report",{target_work_order_id:order,expected_version:updatedVersion,summary:"Twee eenheden uitgevoerd. De derde volgt bij de volgende overeengekomen afspraak.",idempotency_key:randomUUID()});expect(report.error).toBeNull();
  expect((await db.query("select state from public.work_order_report_versions where work_order_id=$1",[order])).rows).toEqual([{state:"review"}]);
 }finally{await staff.auth.signOut({scope:"local"});}
}

test("Dossier 360: customer agreement, object programme, partial execution and linked invoice",async({page})=>{
 test.setTimeout(180000);
 await authenticateWorkspace(page,"platform-admin@fieldgrid.test",`/app/klanten?record=${customer}`);
 await page.waitForURL(url=>url.pathname===`/app/klanten/${customer}`,{timeout:30000});
 const dossier=page.locator(".customer-dossier");await expect(dossier).toBeVisible();
 await dossier.getByRole("navigation",{name:"Klantdossier"}).getByRole("link",{name:"Documenten",exact:true}).click();await expect(page).toHaveURL(/tab=documenten/);
 await dossier.getByRole("button",{name:"Document uploaden",exact:true}).click();
 const upload=page.getByRole("dialog",{name:"Document uploaden",exact:true});
 const proof=await PDFDocument.create();proof.addPage([200,100]).drawText("Fictitious agreement evidence");
 await upload.getByLabel("Titel",{exact:true}).fill("Getekende klantafspraak");await upload.getByLabel("Bestand",{exact:true}).setInputFiles({name:"agreement.pdf",mimeType:"application/pdf",buffer:Buffer.from(await proof.save())});await upload.getByRole("button",{name:"Document uploaden",exact:true}).click();await expect(upload).toBeHidden();await expect(dossier.getByRole("row").filter({hasText:"Getekende klantafspraak"})).toBeVisible();
 await dossier.getByRole("navigation",{name:"Klantdossier"}).getByRole("link",{name:"Contracten & diensten",exact:true}).click();await dossier.getByRole("button",{name:"Nieuw contract",exact:true}).click();
 const form=page.getByRole("dialog",{name:"Nieuw contract",exact:true});
 await form.getByLabel("Titel",{exact:true}).fill("Periodieke afspraak");await form.getByLabel("Ingangsdatum").fill("2026-01-01");
 for(let i=0;i<3;i++)await form.getByRole("button",{name:"Volgende",exact:true}).click();
 await form.getByLabel("Object",{exact:true}).selectOption(object);await form.getByLabel("Catalogustaak").selectOption(revision);await form.getByLabel("Afgesproken omvang").fill("Drie gecontroleerde eenheden per bezoek");await form.getByLabel("Maximale hoeveelheid",{exact:true}).fill("3");await form.getByLabel("Prijs per eenheid excl. btw").fill("12");await form.getByLabel("Maximumbedrag excl. btw").fill("36");await form.getByRole("button",{name:"Volgende",exact:true}).click();
 await form.getByLabel("Akkoordgever").fill("Fictieve opdrachtgever");await form.getByLabel("Ontvangen akkoord op").fill("2026-01-01");await form.getByLabel("Akkoordbewijs").selectOption({label:"Getekende klantafspraak · v1"});await form.getByRole("button",{name:"Volgende",exact:true}).click();await form.getByRole("button",{name:"Akkoord vastleggen",exact:true}).click();await expect(form).toBeHidden();await expect(dossier.getByRole("heading",{name:"Periodieke afspraak",exact:true})).toBeVisible();
 await page.goto(`/app/objecten/${object}?tab=diensten`);await page.getByRole("button",{name:"Werkprogramma toevoegen"}).click();const programme=page.getByRole("dialog",{name:"Nieuw · Werkprogramma"});await programme.getByLabel("Titel",{exact:true}).fill("Vast werkprogramma");await programme.getByLabel(/^Status/).selectOption("active");await programme.getByLabel("Taak uit bestaande catalogus").selectOption(revision);const option=programme.getByLabel("Vastgelegde klantafspraak").locator("option").last();await programme.getByLabel("Vastgelegde klantafspraak").selectOption((await option.getAttribute("value"))!);await programme.getByRole("button",{name:"Opslaan",exact:true}).click();await expect(programme).toBeHidden();
 await db.query("insert into public.work_order_tasks(id,tenant_id,work_order_id,task_revision_id,task_code,task_name,duration_minutes,quantity,unit,unit_price_cents,vat_basis_points) values($1,$2,$3,$4,'CHAIN','Ketenproef uitvoering',30,3,'task',4500,2100)",[task,tenant,order,revision]);
 expect((await db.query("select unit_price_cents,agreement_line_id from public.work_order_tasks where id=$1",[task])).rows[0]).toMatchObject({unit_price_cents:"1200"});
 await page.goto(`/app/werkbonnen/${order}`);await page.getByRole("navigation",{name:"Onderdelen werkbondossier"}).getByRole("link",{name:"Taken & checklists",exact:true}).click();
 const execution=page.locator("article").filter({has:page.getByRole("heading",{name:"Ketenproef uitvoering",exact:true})});
 await execution.getByRole("button",{name:"Resultaat / deeluitvoering",exact:true}).click();await execution.getByLabel("Uitvoeringsresultaat").selectOption("partial");await execution.getByLabel("Werkelijk uitgevoerde hoeveelheid").fill("2");await execution.getByLabel("Resultaat en resterend werk").fill("Twee klaar; derde volgt bij volgende overeengekomen afspraak.");await execution.getByRole("button",{name:"Opslaan",exact:true}).click();await expect(execution.getByText("Uitgevoerd: 2 van 3 task eigen werk.",{exact:true})).toBeVisible();
 await stopAndSubmitStaffReport();
 await page.getByRole("navigation",{name:"Onderdelen werkbondossier"}).getByRole("link",{name:"Rapport & handtekening",exact:true}).click();
 const review=page.getByRole("region",{name:"Rapport en handtekening",exact:true});await expect(review.getByRole("heading",{name:"Rapportversie 1",exact:true})).toBeVisible();
 await expect(review.getByText("Twee eenheden uitgevoerd. De derde volgt bij de volgende overeengekomen afspraak.",{exact:true})).toBeVisible();await expect(review.locator("canvas")).toHaveCount(0);await review.getByRole("button",{name:"Keur goed",exact:true}).click();
 await expect.poll(async()=>(await db.query("select status from public.work_orders where id=$1",[order])).rows[0].status).toBe("invoice_ready");
 expect((await db.query("select state,approved_by from public.work_order_report_versions where work_order_id=$1",[order])).rows).toEqual([{state:"approved",approved_by:manager}]);
 await page.goto("/app/facturen");await page.getByRole("button",{name:"Nieuwe factuur",exact:true}).click();const invoice=page.getByRole("dialog",{name:"Nieuwe factuur"});await invoice.locator("form").filter({hasText:"Dossier Ketenproef"}).getByRole("button",{name:"Factuur maken"}).click();await expect(invoice).toBeHidden();
 const lines=(await db.query("select quantity,unit_price_cents,source_snapshot from public.invoice_lines where work_order_task_id=$1",[task])).rows;expect(lines).toHaveLength(1);expect(lines[0].quantity).toBe("2.000");expect(lines[0].unit_price_cents).toBe("1200");expect(lines[0].source_snapshot.agreement.version).toBe(1);
 await page.goto(`/app/klanten?record=${customer}&tab=finance`);await expect(page.locator(".customer-dossier").getByRole("link",{name:"Bekijk",exact:true})).toBeVisible();
 for(const width of [1440,768,390]){await page.setViewportSize({width,height:950});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await page.goto("/app/opvolging");await expect(page.getByRole("heading",{name:"Gezamenlijke opvolging"})).toBeVisible();
});
