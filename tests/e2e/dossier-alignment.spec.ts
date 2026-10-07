import { test, expect } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
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
 await db.query("update public.customers set legal_name='Fictieve Ketenproef B.V.',company_number='87654321',vat_number='NL987654321B01',phone='0300000000',billing_address='{\"street\":\"Teststraat 30\",\"postal_code\":\"1234 AB\",\"city\":\"Utrecht\"}' where id=$1",[customer]);
 await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values($1,$2,$3,'OB-CHAIN','Ketenproef locatie','{\"street\":\"Teststraat 30\",\"city\":\"Utrecht\"}')",[object,tenant,customer]);
 await db.query("insert into public.work_orders(id,tenant_id,customer_id,object_id,work_order_number,discipline,status,signature_mode,lead_personnel_id,planned_start_at,planned_end_at,projected_start_at,projected_end_at,actual_start_at,created_by) values($1,$2,$3,$4,'WB-CHAIN','Onderhoud','in_progress','none',$6,now()-interval '30 minutes',now()+interval '30 minutes',now()-interval '30 minutes',now()+interval '30 minutes',now()-interval '30 minutes',$5)",[order,tenant,customer,object,manager,person]);
 await db.query("insert into public.work_order_assignments(id,tenant_id,work_order_id,personnel_id,status,planned_start_at,planned_end_at,projected_start_at,projected_end_at,actual_start_at) select $1,tenant_id,id,$2,'in_progress',planned_start_at,planned_end_at,projected_start_at,projected_end_at,actual_start_at from public.work_orders where id=$3",[assignment,person,order]);
 await db.query("insert into public.dispatches(tenant_id,work_order_id,assignment_id,dispatched_by,idempotency_key) values($1,$2,$3,$4,$5)",[tenant,order,assignment,manager,randomUUID()]);
  await db.query("insert into public.time_entries(tenant_id,personnel_id,assignment_id,kind,starts_at) values($1,$2,$3,'work',now()-interval '30 minutes')",[tenant,person,assignment]);
  await db.query("insert into public.report_entries(tenant_id,work_order_id,author_user_id,body,customer_visible) values($1,$2,$3,'FICTITIOUS interne managementcontrole',false),($1,$2,$3,'FICTITIOUS gedeelde uitvoeringsnotitie',true)",[tenant,order,manager]);
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

test("Dossier 360: customer agreement, object programme, partial execution and linked invoice",async({page,request})=>{
 test.setTimeout(180000);
 await authenticateWorkspace(page,"platform-admin@fieldgrid.test",`/app/klanten?record=${customer}`);
 await page.waitForURL(url=>url.pathname===`/app/klanten/${customer}`,{timeout:30000});
 const dossier=page.locator(".customer-dossier:visible");await expect(dossier).toBeVisible();
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
 const execution=page.locator("details.wo-task-detail").filter({hasText:"Ketenproef uitvoering"});await execution.locator("summary").click();
 await execution.getByRole("button",{name:"Resultaat / deeluitvoering",exact:true}).click();await execution.getByLabel("Uitvoeringsresultaat").selectOption("partial");await execution.getByLabel("Werkelijk uitgevoerde hoeveelheid").fill("2");await execution.getByLabel("Resultaat en resterend werk").fill("Twee klaar; derde volgt bij volgende overeengekomen afspraak.");await execution.getByRole("button",{name:"Opslaan",exact:true}).click();await expect(execution.getByText("Uitgevoerd: 2 van 3 task eigen werk.",{exact:true})).toBeVisible();
 await stopAndSubmitStaffReport();
 await page.getByRole("navigation",{name:"Onderdelen werkbondossier"}).getByRole("link",{name:"Rapport & handtekening",exact:true}).click();
 const review=page.getByRole("region",{name:"Rapport en handtekening",exact:true});await expect(review.getByRole("heading",{name:"Oplevering",exact:true})).toBeVisible();await expect(review.getByRole("tab",{name:"Notities & acties",exact:true})).toBeVisible();
 await page.goto("/app/rapporten");await page.getByRole("row").filter({hasText:"WB-CHAIN"}).getByRole("button",{name:"Bekijk",exact:true}).click();
 await expect(page.getByRole("dialog",{name:"Rapport WB-CHAIN",exact:true})).toBeVisible();
 await expect(review.getByRole("tabpanel",{name:"Overzicht",exact:true}).getByText("Twee eenheden uitgevoerd. De derde volgt bij de volgende overeengekomen afspraak.",{exact:true})).toBeVisible();await expect(review.locator("canvas")).toHaveCount(0);
 for(const title of ["Taken & checklists","Notities & acties","Foto’s & documenten","Handtekeningen","Kosten","Klantrapport"]){
  await review.getByRole("tab",{name:title,exact:true}).click();
  const panel=review.getByRole("tabpanel",{name:title,exact:true});await expect(panel).toBeVisible();
  if(title==="Notities & acties")await expect(panel.locator(".review-note-list").getByText("FICTITIOUS interne managementcontrole",{exact:true})).toBeVisible();
  if(title==="Klantrapport"){await expect(panel.getByText("FICTITIOUS interne managementcontrole",{exact:true})).toHaveCount(0);await expect(panel.getByText("FICTITIOUS gedeelde uitvoeringsnotitie",{exact:true})).toBeVisible();}
 }
 await review.getByRole("tab",{name:"Overzicht",exact:true}).click();
 for(const width of [1440,390]){await page.setViewportSize({width,height:950});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect.poll(async()=>{const bounds=(await page.getByRole("dialog",{name:"Rapport WB-CHAIN",exact:true}).boundingBox())!;return bounds.x>=0&&bounds.x+bounds.width<=width&&bounds.y>=0&&bounds.y+bounds.height<=950;}).toBe(true);await page.screenshot({path:`test-results/management-report-review-${width}.png`,fullPage:true});}
 await page.setViewportSize({width:1440,height:950});
 await review.getByRole("button",{name:"Keur goed",exact:true}).click();
 await expect.poll(async()=>(await db.query("select status from public.work_orders where id=$1",[order])).rows[0].status).toBe("invoice_ready");
 expect((await db.query("select state,approved_by from public.work_order_report_versions where work_order_id=$1",[order])).rows).toEqual([{state:"approved",approved_by:manager}]);
 await page.goto("/app/facturen");const conceptRow=page.getByRole("row").filter({hasText:"WB-CHAIN"});await expect(conceptRow).toContainText("Concept");await conceptRow.getByRole("button",{name:"Bekijk",exact:true}).click();const preview=page.getByRole("dialog",{name:"Concept WB-CHAIN"});await expect(preview.locator("iframe")).toHaveAttribute("src",`/api/files/invoice-concept/${order}`);await page.screenshot({path:"test-results/invoice-concept-preview.png",fullPage:true});const draftPdf=await page.request.get(`/api/files/invoice-concept/${order}`);expect(draftPdf.status()).toBe(200);expect(draftPdf.headers()["content-type"]).toContain("application/pdf");await preview.getByRole("button",{name:"Sluiten",exact:true}).click();await conceptRow.getByRole("checkbox").check();await expect(page.getByRole("region",{name:"Geselecteerde facturen"})).toContainText("1 geselecteerd");await page.getByRole("button",{name:"Concepten definitief maken",exact:true}).click();const invoice=page.getByRole("dialog",{name:"Conceptfactuur definitief maken"});await invoice.getByRole("button",{name:"Definitief maken",exact:true}).click();await expect(invoice).toBeHidden();
 const finalInvoice=(await db.query("select i.id,i.pdf_sha256 from public.invoices i join public.invoice_lines l on l.invoice_id=i.id where l.work_order_task_id=$1",[task])).rows[0];
 const savedPdf=await page.request.get(`/api/files/invoice/${finalInvoice.id}?preview=1`);expect(savedPdf.status()).toBe(200);expect(savedPdf.headers()["content-disposition"]).toContain("inline");expect(savedPdf.headers()["cache-control"]).toBe("private, no-store");
 expect(savedPdf.headers()["x-frame-options"]).toBe("SAMEORIGIN");
 expect(savedPdf.headers()["content-security-policy"]).toContain("frame-ancestors 'self'");
 expect(savedPdf.headers()["content-security-policy"]).not.toContain("sandbox");
 expect(createHash("sha256").update(await savedPdf.body()).digest("hex")).toBe(finalInvoice.pdf_sha256);
 const frozen=(await db.query("select customer_snapshot from public.invoices where id=$1",[finalInvoice.id])).rows[0].customer_snapshot;
 expect(frozen).toMatchObject({legal_name:"Fictieve Ketenproef B.V.",company_number:"87654321",vat_number:"NL987654321B01"});
 await db.query("update public.customers set legal_name='Later changed customer',company_number='11223344' where id=$1",[customer]);
 const presentation=await page.request.get(`/api/files/invoice/${finalInvoice.id}?presentation=1&preview=1`);
 expect(presentation.status()).toBe(200);expect(presentation.headers()["x-frame-options"]).toBe("SAMEORIGIN");
 expect(presentation.headers()["content-disposition"]).toContain("inline");
 expect(presentation.headers()["cache-control"]).toBe("private, no-store");
 expect((await PDFDocument.load(await presentation.body())).getPageCount()).toBeGreaterThan(0);
 const afterPresentation=(await db.query("select pdf_sha256,customer_snapshot from public.invoices where id=$1",[finalInvoice.id])).rows[0];
 expect(afterPresentation.pdf_sha256).toBe(finalInvoice.pdf_sha256);expect(afterPresentation.customer_snapshot).toEqual(frozen);
 const download=await page.request.get(`/api/files/invoice/${finalInvoice.id}?presentation=1`);expect(download.status()).toBe(200);expect(download.headers()["content-disposition"]).toContain("attachment");
 const ordinaryPage=await page.request.get("/app/facturen");expect(ordinaryPage.headers()["x-frame-options"]).toBe("DENY");
 expect((await request.get(`/api/files/invoice/${finalInvoice.id}?presentation=1&preview=1`)).status()).toBe(404);
 expect((await request.get(`/api/files/invoice/${finalInvoice.id}`)).status()).toBe(404);expect((await request.get(`/api/files/invoice-concept/${order}`)).status()).toBe(404);
 const lines=(await db.query("select quantity,unit_price_cents,source_snapshot from public.invoice_lines where work_order_task_id=$1",[task])).rows;expect(lines).toHaveLength(1);expect(lines[0].quantity).toBe("2.000");expect(lines[0].unit_price_cents).toBe("1200");expect(lines[0].source_snapshot.agreement.version).toBe(1);
 await page.goto(`/app/klanten?record=${customer}&tab=finance`);await expect(page.locator(".customer-dossier:visible").getByRole("link",{name:"Bekijk",exact:true})).toBeVisible();
 for(const width of [1440,768,390]){await page.setViewportSize({width,height:950});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await page.goto("/app/opvolging");await expect(page.getByRole("heading",{name:"Gezamenlijke opvolging"})).toBeVisible();
});
