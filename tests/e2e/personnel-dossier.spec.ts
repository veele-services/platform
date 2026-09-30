import { expect, test, type Page, type Locator } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import type { Database } from "../../lib/database.types";

test.use({actionTimeout:15000});

async function fixture(){
 const url=new URL(process.env.SUPABASE_URL!);if(url.hostname!=="127.0.0.1"||url.port!=="59321")throw new Error("Dossier tests require isolated local Supabase");
 const admin=createClient<Database>(url.href,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:tenant,error}=await admin.from("tenants").select("id").eq("slug","fieldgrid-e2e").single();if(error)throw error;
 const id=randomUUID();const {error:insert}=await admin.from("personnel").insert({id,tenant_id:tenant.id,employee_number:`DOS-${id.slice(0,8)}`,full_name:"Lisa Dossierdemo",email:"lisa@fieldgrid.test",status:"active",start_date:"2026-01-01"});if(insert)throw insert;
 const cleanup=async()=>{
  const {data:documents}=await admin.from("personnel_documents").select("storage_path").eq("tenant_id",tenant.id).eq("personnel_id",id);
  await admin.from("availability").delete().eq("tenant_id",tenant.id).eq("personnel_id",id);
  for(const table of ["personnel_dossier_deliveries","personnel_dossier_access","personnel_dossier_history","personnel_dossier_items","personnel_contracts","personnel_documents","certificates","qualifications"] as const){const {error}=await admin.from(table).delete().eq("tenant_id",tenant.id).eq("personnel_id",id);if(error)throw new Error(`Fixture cleanup failed: ${table}`);}
  if(documents?.length)await admin.storage.from("personnel-documents").remove(documents.map(d=>d.storage_path));
  await admin.from("personnel").delete().eq("tenant_id",tenant.id).eq("id",id);
 };
 return {admin,tenant,id,cleanup};
}
async function login(page:Page){await page.goto("/login?next=%2Fapp%2Fpersoneel");await page.getByLabel("E-mailadres").fill("platform-admin@fieldgrid.test");await page.getByLabel("Wachtwoord",{exact:true}).fill("Fieldgrid-E2E-2026");await page.getByRole("button",{name:/Inloggen/}).click();await page.waitForURL("**/app/personeel");}
async function next(dialog:Locator){await dialog.getByRole("button",{name:"Volgende",exact:true}).click();}
async function save(dialog:Locator,name="Opslaan"){await dialog.getByRole("button",{name,exact:true}).click();await expect(dialog).toBeHidden();}

test("dossier 360: tabs, profile, contracts, private document versions, reviews, assets and checklists",async({page})=>{
 test.setTimeout(180000);const f=await fixture();
 try{
  await page.setViewportSize({width:1440,height:1000});await login(page);
  await page.getByRole("row").filter({hasText:"Lisa Dossierdemo"}).getByRole("button",{name:"Bekijk",exact:true}).click();
  await expect(page).toHaveURL(new RegExp(`/app/personeel/${f.id}$`));
  await expect(page.getByRole("heading",{name:"Lisa Dossierdemo",exact:true})).toBeVisible();
  await expect(page.locator(".personnel-dossier")).toHaveScreenshot("dossier-empty-1440.png",{stylePath:"./tests/e2e/dossier-screenshot.css",mask:[page.locator(".dossier-person .eyebrow")]});
  await page.getByRole("button",{name:"Bewerken",exact:true}).click();let dialog=page.getByRole("dialog");
  await dialog.getByLabel("Zakelijke telefoon").fill("0612345678");await save(dialog);
  await page.getByRole("link",{name:"Persoonsgegevens",exact:true}).click();await expect(page).toHaveURL(/tab=persoon/);await expect(page.getByText("0612345678",{exact:true})).toBeVisible();
  await page.goBack();await expect(page.getByRole("heading",{name:"Actie nodig",exact:true})).toBeVisible();
  await page.getByRole("link",{name:"Dienstverband & contracten",exact:true}).click();await page.getByRole("button",{name:"Nieuwe overeenkomst",exact:true}).click();dialog=page.getByRole("dialog");
  await dialog.getByLabel(/^Titel/).fill("Arbeidsovereenkomst");await dialog.getByLabel("Contractvorm",{exact:true}).selectOption("permanent");await dialog.getByLabel(/^Startdatum/).fill("2026-01-01");await next(dialog);
  await dialog.getByLabel("Contracturen per week").fill("32");await dialog.getByLabel("Afdeling / team").fill("Service");await next(dialog);await next(dialog);await next(dialog);
  await dialog.getByLabel("Status",{exact:true}).selectOption("active");await save(dialog);await expect(page.getByRole("heading",{name:"Arbeidsovereenkomst",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Addendum toevoegen",exact:true}).click();dialog=page.getByRole("dialog");await expect(dialog.getByLabel("Categorie")).toHaveValue("addendum");
  const pdf=await PDFDocument.create();pdf.addPage().drawText("Fictief HR-testdocument");const bytes=Buffer.from(await pdf.save());
  await dialog.getByLabel(/^Titel/).fill("Werkafspraken addendum");await dialog.getByLabel("Bestand",{exact:true}).setInputFiles({name:"test-afspraken.pdf",mimeType:"application/pdf",buffer:bytes});await dialog.getByRole("checkbox").check();await save(dialog,"Document opslaan");await expect(page.getByRole("link",{name:/Werkafspraken addendum · v1/})).toBeVisible();
  await page.goto(`/app/personeel/${f.id}?tab=documenten`);await page.getByRole("button",{name:"Metadata bewerken"}).click();dialog=page.getByRole("dialog");await dialog.getByLabel(/^Titel/).fill("Afspraken · bijgewerkt");await dialog.getByRole("checkbox").check();await save(dialog,"Document opslaan");
  await page.getByRole("button",{name:"Nieuwe versie",exact:true}).click();dialog=page.getByRole("dialog");await dialog.getByLabel("Bestand",{exact:true}).setInputFiles({name:"afspraken-v2.pdf",mimeType:"application/pdf",buffer:bytes});await dialog.getByRole("checkbox").check();await save(dialog,"Document opslaan");await expect(page.getByRole("cell",{name:"v2 Vervolgversie"})).toBeVisible();
  const files=await f.admin.from("personnel_documents").select("id").eq("tenant_id",f.tenant.id).eq("personnel_id",f.id).eq("version",2).single();const fileResponse=await page.request.get(`/api/files/personnel-document/${files.data!.id}`);expect(fileResponse.ok()).toBe(true);expect(fileResponse.headers()["content-type"]).toContain("application/pdf");
  const portal=await page.context().browser()!.newContext();try{const employee=await portal.newPage();await employee.goto("/login?next=%2Fstaff");await employee.getByLabel("E-mailadres").fill("field-worker@fieldgrid.test");await employee.getByLabel("Wachtwoord",{exact:true}).fill("Fieldgrid-E2E-2026");await employee.getByRole("button",{name:/Inloggen/}).click();await employee.waitForURL("**/staff");const denied=await employee.request.get(`/api/files/personnel-document/${files.data!.id}`);expect(denied.status()).toBe(404);}finally{await portal.close();}
  await page.goto(`/app/personeel/${f.id}?tab=contracten`);await page.getByRole("button",{name:"Verlengen",exact:true}).click();dialog=page.getByRole("dialog");await dialog.getByLabel(/^Titel/).fill("Vervolgovereenkomst");await dialog.getByLabel("Contractvorm",{exact:true}).selectOption("fixed");await dialog.getByLabel(/^Startdatum/).fill("2090-01-01");await dialog.getByLabel(/^Einddatum/).fill("2090-12-31");await save(dialog,"Concept bewaren");
  const renewal=page.getByRole("article").filter({has:page.getByRole("heading",{name:"Vervolgovereenkomst",exact:true})});await expect(renewal.getByText("Concept",{exact:true})).toBeVisible();await renewal.getByRole("button",{name:"Bewerk",exact:true}).click();dialog=page.getByRole("dialog");await next(dialog);await next(dialog);await next(dialog);await next(dialog);await dialog.getByLabel("Status",{exact:true}).selectOption("active");await save(dialog);await expect(page.getByRole("heading",{name:"Arbeidsovereenkomst",exact:true})).toBeVisible();
  const savedContracts=await f.admin.from("personnel_contracts").select("previous_id,dossier_revision,ends_on").eq("tenant_id",f.tenant.id).eq("personnel_id",f.id);expect(savedContracts.data).toHaveLength(2);expect(savedContracts.data?.some(c=>!!c.previous_id&&c.dossier_revision===2)).toBe(true);expect(savedContracts.data?.some(c=>!c.previous_id&&c.ends_on===null)).toBe(true);
  await page.goto(`/app/personeel/${f.id}?tab=ontwikkeling`);await page.getByRole("button",{name:"Gesprek plannen",exact:true}).click();dialog=page.getByRole("dialog");await dialog.getByLabel(/^Onderwerp/).fill("Ontwikkelgesprek");await dialog.getByLabel("Gespreksdatum",{exact:true}).fill("2090-06-01");await dialog.getByLabel("Opvolgtaak / ontwikkeldoel").fill("Praktijktraining plannen");await dialog.getByLabel("Deadline / volgende evaluatie").fill("2090-06-10");await save(dialog);
  await page.goto(`/app/personeel/${f.id}?tab=tijdlijn`);await expect(page.getByRole("heading",{name:"Praktijktraining plannen",exact:true})).toBeVisible();
  await page.goto(`/app/personeel/${f.id}?tab=middelen`);await page.getByRole("button",{name:"Middel uitgeven",exact:true}).click();dialog=page.getByRole("dialog");await dialog.getByLabel(/^Middel/).fill("Telefoon werk");await dialog.getByLabel("Verwachte retourdatum").fill("2090-07-01");await save(dialog);
  await page.getByRole("button",{name:"Bewerk",exact:true}).click();dialog=page.getByRole("dialog");await dialog.getByLabel("Status",{exact:true}).selectOption("returned");await dialog.getByLabel("Werkelijke retourdatum").fill("2090-07-01");await save(dialog);await expect(page.getByRole("article").getByText("Geretourneerd",{exact:true})).toBeVisible();
  await page.goto(`/app/personeel/${f.id}`);await page.getByRole("button",{name:"Indienstchecklist voor mij"}).click();await expect(page.getByRole("button",{name:/^Contactgegevens controleren/})).toBeVisible();await page.getByRole("button",{name:"Indienstchecklist voor mij"}).click();await expect(page.getByRole("button",{name:/^Contactgegevens controleren/})).toHaveCount(1);
  await page.setViewportSize({width:390,height:844});await expect(page.locator(".personnel-dossier")).toHaveScreenshot("dossier-overview-390.png",{stylePath:"./tests/e2e/dossier-screenshot.css",mask:[page.locator(".dossier-person .eyebrow"),page.locator(".dossier-event small")]});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByLabel("Dossieronderdeel",{exact:true}).selectOption("notities");await expect(page).toHaveURL(/tab=notities/);
  await page.getByRole("button",{name:"Notitie toevoegen",exact:true}).click();dialog=page.getByRole("dialog");await dialog.getByLabel(/^Onderwerp/).fill("Nog niet bewaard");page.once("dialog",d=>d.dismiss());await dialog.getByRole("button",{name:"Sluiten",exact:true}).click();await expect(dialog).toBeVisible();page.once("dialog",d=>d.accept());await dialog.getByRole("button",{name:"Sluiten",exact:true}).click();await expect(dialog).toBeHidden();
  await page.goto("/app/personeel/acties");await expect(page.getByRole("heading",{name:"Actie nodig",exact:true})).toBeVisible();const task=page.getByRole("row").filter({hasText:"Praktijktraining plannen"});await task.getByRole("button",{name:"Opvolgen"}).click();dialog=page.getByRole("dialog");await dialog.getByLabel("Status",{exact:true}).selectOption("completed");await dialog.getByLabel("Uitgevoerde opvolging / bewijs").fill("Training geboekt, bevestiging gecontroleerd.");await save(dialog);await expect(task).toHaveCount(0);
 }finally{await f.cleanup();}
});

test("certificate verification, renewal and HR privacy are separate from personnel portal access",async({page,browser})=>{
 test.setTimeout(100000);const f=await fixture();const code=`E2E-${f.id.slice(0,8).toUpperCase()}`;
 try{
  await login(page);await page.goto(`/app/personeel/${f.id}?tab=certificaten`);await page.getByRole("button",{name:"Catalogus & eisen"}).click();let dialog=page.getByRole("dialog");await dialog.getByLabel("Code",{exact:true}).fill(code);await dialog.getByLabel(/^Naam/).fill("Bedrijfstraining");await save(dialog);
  await page.getByRole("button",{name:"Catalogus & eisen"}).click();dialog=page.getByRole("dialog");await dialog.getByLabel("Bestaand type bewerken").selectOption(code);await dialog.getByLabel("Standaardherinneringen",{exact:true}).fill("60,14,0");await save(dialog);expect((await f.admin.from("qualification_types").select("reminder_days").eq("tenant_id",f.tenant.id).eq("code",code).single()).data?.reminder_days).toEqual([60,14,0]);
  await page.getByRole("button",{name:"Certificaat toevoegen",exact:true}).click();dialog=page.getByRole("dialog");await dialog.getByLabel("Kwalificatietype").selectOption(code);await dialog.getByLabel(/^Naam/).fill("Bedrijfstraining");await next(dialog);await dialog.getByLabel("Geldig vanaf",{exact:true}).fill("2026-01-01");await next(dialog);await next(dialog);await expect(dialog.getByLabel("Dagen vooraf")).toHaveValue("60,14,0");await next(dialog);await expect(dialog.getByLabel("Status",{exact:true})).toHaveValue("unverified");await save(dialog);
  await expect(page.locator(".dossier-records").getByText("Niet gecontroleerd",{exact:true})).toBeVisible();await page.getByRole("button",{name:"Controleer / bewerk",exact:true}).click();dialog=page.getByRole("dialog");await next(dialog);await next(dialog);await next(dialog);await dialog.getByLabel("Toelichting controle").fill("Origineel bewijs gecontroleerd bij uitgevende organisatie.");await next(dialog);await dialog.getByLabel("Status",{exact:true}).selectOption("approved");await save(dialog);await expect(page.locator(".dossier-records").getByText("Goedgekeurd",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Vernieuwen",exact:true}).click();dialog=page.getByRole("dialog");await next(dialog);await dialog.getByLabel("Geldig vanaf",{exact:true}).fill("2090-01-01");await next(dialog);await next(dialog);await next(dialog);await save(dialog);await expect(page.locator(".dossier-records").getByText("Nog niet geldig",{exact:true})).toBeVisible();
  const staff=await browser.newContext();try{const employee=await staff.newPage();await employee.goto("/login?next=%2Fstaff");await employee.getByLabel("E-mailadres").fill("field-worker@fieldgrid.test");await employee.getByLabel("Wachtwoord",{exact:true}).fill("Fieldgrid-E2E-2026");await employee.getByRole("button",{name:/Inloggen/}).click();await employee.waitForURL("**/staff");const response=await employee.goto(`/app/personeel/${f.id}?tab=certificaten`);/* Next streams loading UI with HTTP 200 before notFound; assert the denied page and serialized response, not only the transport status. */await expect(employee.getByRole("heading",{name:"Deze pagina bestaat niet."})).toBeVisible();expect(await response!.text()).not.toContain("Lisa Dossierdemo");await expect(employee.getByText("Bedrijfstraining",{exact:true})).toHaveCount(0);}finally{await staff.close();}
 }finally{await f.cleanup();await f.admin.from("qualification_types").delete().eq("tenant_id",f.tenant.id).eq("code",code);}
});

test("server worker sends branded generic reminders exactly once and retries confirmed failures",async({request})=>{
 test.setTimeout(60000);const f=await fixture();const recipient=`dossier-${f.id}@fieldgrid.test`;const taskId=randomUUID();
 try{
  const {error}=await f.admin.from("personnel_dossier_items").insert({id:taskId,tenant_id:f.tenant.id,personnel_id:f.id,kind:"task",title:"Confidential case not for email",due_on:"2090-06-01",dossier_managed:true,dossier_status:"open",dossier_data:{title:"Confidential case not for email",dueOn:"2090-06-01",reminderEmails:recipient,reminderDays:"0"}});if(error)throw error;
  const makeDue=async()=>{const {error}=await f.admin.from("personnel_dossier_deliveries").update({available_at:new Date(Date.now()-60000).toISOString()}).eq("tenant_id",f.tenant.id).eq("personnel_id",f.id);if(error)throw error;};await makeDue();
  const run=async()=>{const response=await request.post("/api/worker",{headers:{authorization:"Bearer fieldgrid-local-e2e-worker-placeholder-only"}});expect(response.ok()).toBeTruthy();};
  await fetch("http://127.0.0.1:59329/fail-next",{method:"POST"});await run();
  const failed=await f.admin.from("personnel_dossier_deliveries").select("status,attempts").eq("source_id",taskId).single();expect(failed.data).toMatchObject({status:"failed",attempts:1});
  await makeDue();await run();await run();
  const sent=await f.admin.from("personnel_dossier_deliveries").select("status,attempts").eq("source_id",taskId).single();expect(sent.data).toMatchObject({status:"sent",attempts:2});
  const mails=await(await fetch(`http://127.0.0.1:59329/messages?recipient=${recipient}`)).json();expect(mails).toHaveLength(1);const mail=JSON.stringify(mails[0]);expect(mail).not.toContain("Confidential case");expect(mail).not.toContain("Lisa Dossierdemo");expect(mail).toContain(`/app/personeel/${f.id}`);expect(mail).toContain("#214E72");
  const source=await f.admin.from("personnel_dossier_items").select("dossier_status").eq("id",taskId).single();expect(source.data?.dossier_status).toBe("open");
 }finally{await f.cleanup();}
});
