import {test,expect} from "@playwright/test";
import {createHash,randomUUID} from "node:crypto";
import {PDFDocument,StandardFonts} from "pdf-lib";
import pg from "pg";
import {createClient} from "@supabase/supabase-js";
import type {Database} from "../../lib/database.types";
import {requireLocalDatabaseUrl} from "./local-target";
import {authenticateWorkspace} from "./login-auth";

test.use({trace:"off",screenshot:"off",video:"off"});
test("customer portal: five responsive widths, real persistence, dialogs, downloads and revocation",async({page,browser})=>{
 test.setTimeout(240000);
 const db=new pg.Client({connectionString:requireLocalDatabaseUrl().href});await db.connect();
 const admin=createClient<Database>(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
 const tenant=randomUUID(),customer=randomUUID(),contact=randomUUID(),object=randomUUID(),documentId=randomUUID(),email=`portal-${randomUUID()}@fieldgrid.test`,path=`${tenant}/${customer}/${documentId.replaceAll('-','')}.pdf`;
 const owner=(await db.query("select id from auth.users where email='platform-admin@fieldgrid.test'")).rows[0].id;
 let userId="",account="";
 try{
  const created=await admin.auth.admin.createUser({email,password:"Fieldgrid-E2E-2026",email_confirm:true});if(created.error||!created.data.user)throw new Error("Customer fixture creation failed");userId=created.data.user.id;
  await db.query("insert into public.tenants(id,slug,name)values($1,$2,'Fictieve klantportaal leverancier')",[tenant,`portal-${tenant}`]);
  await db.query("insert into public.tenant_settings(tenant_id,enabled_services)values($1,array['planning','finance','rapportage','tickets'])",[tenant]);
  await db.query("insert into public.tenant_branding(tenant_id,primary_color,accent_color)values($1,'#223d53','#389447')",[tenant]);
  await db.query("insert into public.customers(id,tenant_id,customer_number,name,billing_email,billing_address)values($1,$2,'PORTAL-TEST','Fictieve portaalorganisatie',$3,'{\"street\":\"Teststraat 1\",\"postal_code\":\"1234 AB\",\"city\":\"Teststad\"}')",[customer,tenant,email]);
  await db.query("insert into public.customer_contacts(id,tenant_id,customer_id,full_name,email,phone)values($1,$2,$3,'Robin Klant',$4,'0301234567')",[contact,tenant,customer,email]);
  await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address)values($1,$2,$3,'PORTAL-OBJECT','Fictieve hoofdlocatie','{\"street\":\"Teststraat 2\",\"postal_code\":\"1234 AB\",\"city\":\"Teststad\"}')",[object,tenant,customer]);
  await db.query("insert into public.customer_portal_accounts(tenant_id,customer_id,user_id,created_by,contact_id)values($1,$2,$3,$4,$5)",[tenant,customer,userId,owner,contact]);
  account=(await db.query("update public.customer_portal_accounts set contact_id=$3,can_create_objects=true,can_edit_objects=true,can_edit_profile=true where tenant_id=$1 and user_id=$2 returning id",[tenant,userId,contact])).rows[0].id;
  await db.query("update public.customer_portal_accounts set onboarding_completed_at=null,onboarding_step=0 where id=$1",[account]);
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);for(let i=1;i<=3;i++)pdf.addPage().drawText(`Fictief gedeeld document - pagina ${i}`,{x:40,y:750,font,size:18});const bytes=await pdf.save();
  const stored=await admin.storage.from("customer-documents").upload(path,bytes,{contentType:"application/pdf"});if(stored.error)throw stored.error;
  await db.query("insert into public.customer_documents(id,tenant_id,customer_id,title,storage_path,file_name,mime_type,size_bytes,sha256,created_by,visibility,portal_object_id)values($1,$2,$3,'Fictief gedeeld document',$4,'gedeeld-document.pdf','application/pdf',$5,$6,$7,'customer',$8)",[documentId,tenant,customer,path,bytes.length,createHash('sha256').update(bytes).digest('hex'),owner,object]);
  await page.context().addCookies([{name:"fieldgrid_tenant_id",value:tenant,url:"http://127.0.0.1:3000"}]);
  await authenticateWorkspace(page,email,`/klant?account=${account}`);
  await page.setViewportSize({width:390,height:960});
  const onboarding=page.getByRole("dialog");await expect(onboarding).toBeVisible();
  await onboarding.getByLabel("Voornaam *",{exact:true}).fill("Robin");await onboarding.getByLabel("Achternaam *",{exact:true}).fill("Klant");
  await onboarding.getByLabel("Organisatie *",{exact:true}).fill("Fictieve portaalorganisatie");await onboarding.getByLabel("Telefoonnummer *",{exact:true}).fill("0301234567");
  await onboarding.getByRole("button",{name:"Opslaan en verder",exact:true}).click();
  await expect(onboarding.getByRole("heading",{name:"Waar kunnen we je helpen?"})).toBeVisible();
  await onboarding.getByLabel("Naam object",{exact:true}).fill("Fictief eerste object");
  await onboarding.getByLabel("Straatnaam",{exact:true}).fill("FICTIEF Testplein");
  const addressOption=onboarding.getByRole("option",{name:"FICTIEF Testplein 12A bis, 1234AB Testplaats"});
  await expect(addressOption).toBeVisible();await addressOption.click();
  await expect(onboarding.getByLabel("Huisnummer",{exact:true})).toHaveValue("12");await expect(onboarding.getByLabel("Huisletter",{exact:true})).toHaveValue("A");
  await expect(onboarding.getByLabel("Toevoeging",{exact:true})).toHaveValue("bis");await expect(onboarding.getByLabel("Woonplaats",{exact:true})).toHaveValue("Testplaats");
  await onboarding.getByRole("button",{name:"Opslaan en verder",exact:true}).click();
  await expect(onboarding.getByRole("heading",{name:"Op de hoogte, zoals jij dat wilt."})).toBeVisible();
  await onboarding.getByRole("button",{name:"Opslaan en verder",exact:true}).click();
  await onboarding.getByLabel("Mijn gegevens en objectgegevens zijn correct.").check();
  await onboarding.getByRole("button",{name:"Afronden en naar cockpit",exact:true}).click();await expect(onboarding).toBeHidden();
  const located=(await db.query("select address,latitude::float8,longitude::float8 from public.objects where tenant_id=$1 and name='Fictief eerste object'",[tenant])).rows[0];
  expect(located).toMatchObject({latitude:52.079,longitude:4.313,address:{street_name:"FICTIEF Testplein",house_number:"12",house_letter:"A",house_addition:"bis",status:"confirmed",city:"Testplaats"}});
  await db.query("insert into public.object_customer_bindings(tenant_id,object_id,user_id,created_by)values($1,$2,$3,$4)",[tenant,object,userId,owner]);
  await page.goto(`/klant?account=${account}`);
  await expect(page.getByRole("heading",{name:"Welkom terug, Robin."})).toBeVisible();
  const overviewGuide=page.locator('[data-guide-key="customer.dashboard"]');await expect(overviewGuide).toBeVisible();await overviewGuide.getByRole("button").click();await expect(overviewGuide).toHaveCount(0);await page.reload();await expect(overviewGuide).toHaveCount(0);
  expect((await db.query("select count(*)::int total from public.account_guide_dismissals where user_id=$1 and guide_key='customer.dashboard'",[userId])).rows[0].total).toBe(1);
  const otherDevice=await browser.newContext({viewport:{width:390,height:960}});try{await otherDevice.addCookies([{name:"fieldgrid_tenant_id",value:tenant,url:"http://127.0.0.1:3000"}]);const otherPage=await otherDevice.newPage();await authenticateWorkspace(otherPage,email,`/klant?account=${account}`);await expect(otherPage.getByRole("heading",{name:"Welkom terug, Robin."})).toBeVisible();await expect(otherPage.locator('[data-guide-key="customer.dashboard"]')).toHaveCount(0);}finally{await otherDevice.close();}
  for(const width of [1440,1024,768,390,320]){
   await page.setViewportSize({width,height:960});await expect(page.getByRole("heading",{name:"Welkom terug, Robin."})).toBeVisible();await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
   await expect(page.getByRole("heading",{name:"Fictieve hoofdlocatie",exact:true})).toBeVisible();
   await page.evaluate(()=>window.scrollTo(0,0));
   await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBe(0);
   await page.screenshot({path:`test-results/customer-portal-${width}.png`,fullPage:true});
   await page.getByRole("button",{name:"Object toevoegen",exact:true}).first().click();const dialog=page.getByRole("dialog");await expect(dialog).toBeVisible();
   const box=await dialog.boundingBox();expect(box!.width).toBeLessThanOrEqual(width<=600?width:860);expect(box!.height).toBeLessThanOrEqual(width<=600?960:865);
   await dialog.getByLabel("Naam object",{exact:true}).fill("Niet opgeslagen fictief object");
   await page.evaluate(()=>window.dispatchEvent(new Event("focus")));await expect(dialog.getByLabel("Naam object",{exact:true})).toHaveValue("Niet opgeslagen fictief object");
   page.once("dialog",confirmation=>confirmation.accept());await page.keyboard.press("Escape");await expect(dialog).toBeHidden();
  }
  await page.setViewportSize({width:1440,height:1000});
  const viewHeadings={objects:"Mijn objecten",appointments:"Mijn afspraken",reports:"Rapporten",invoices:"Facturen",requests:"Diensten & aanvragen",tickets:"Tickets",news:"Nieuws",profile:"Mijn gegevens",notifications:"Meldingen"};
  for(const [view,heading] of Object.entries(viewHeadings)){
   await page.goto(`/klant?account=${account}&view=${view}`);await expect(page.locator(".customer-portal")).toBeVisible();await expect(page.getByRole("heading",{name:heading,exact:true,level:1})).toBeVisible();
   await expect(page.getByRole("heading",{name:/^(Tickets|Meldingen) nog niet beschikbaar$/})).toBeHidden();
   await expect(page.getByText("Je vrijgegeven rapportsamenvattingen zijn beschikbaar. PDF downloaden is nog niet beschikbaar in dit portaal.",{exact:true})).toBeHidden();
   await expect(page.getByText("Online betalen is nog niet beschikbaar in dit portaal.",{exact:true})).toBeHidden();
  }
  await page.goto(`/klant?account=${account}&view=reports`);
  for(const width of [1440,390]){await page.setViewportSize({width,height:960});const downloadPromise=page.waitForEvent("download");await page.getByRole("link",{name:"Opslaan",exact:true}).click();const download=await downloadPromise;expect(download.suggestedFilename()).toBe("gedeeld-document.pdf");const stream=await download.createReadStream();const chunks=[];for await(const chunk of stream!)chunks.push(chunk);expect(Buffer.concat(chunks)).toEqual(Buffer.from(bytes));}
  await page.setViewportSize({width:1440,height:1000});await page.goto(`/klant?account=${account}&view=tickets`);
  await page.getByRole("button",{name:/Jouw accountmanager/}).click();const dialog=page.getByRole("dialog");await dialog.getByLabel("Onderwerp",{exact:false}).fill("Fictieve klantvraag");await dialog.getByLabel("Bericht",{exact:false}).fill("Dit is een fictieve testvraag voor de accountmanager.");await dialog.getByRole("button",{name:"Ticket versturen"}).click();await expect(dialog.getByRole("heading",{name:"Fictieve klantvraag"})).toBeVisible();
  await dialog.getByLabel("Jouw reactie",{exact:false}).fill("Fictieve aanvullende informatie.");await dialog.getByRole("button",{name:"Reactie versturen"}).click();await expect(dialog.getByText("Fictieve aanvullende informatie.",{exact:true})).toBeVisible();await dialog.getByRole("button",{name:"Sluiten",exact:true}).last().click();
  await page.reload();await expect(page.getByRole("button",{name:/Fictieve klantvraag/})).toBeVisible();
  const invoiceId=randomUUID(),orderId=randomUUID(),taskId=randomUUID();
  await db.query("insert into public.work_orders(id,tenant_id,customer_id,object_id,work_order_number,discipline,status,created_by,planned_start_at,planned_end_at,projected_start_at,projected_end_at)values($1,$2,$3,$4,'PORTAL-INVOICE-ORDER','Onderhoud','invoice_ready',$5,now(),now()+interval '1 hour',now(),now()+interval '1 hour')",[orderId,tenant,customer,object,owner]);
  await db.query("insert into public.work_order_tasks(id,tenant_id,work_order_id,task_code,task_name,duration_minutes,quantity,unit,unit_price_cents,vat_basis_points,completed_at,executed_quantity,execution_state)values($1,$2,$3,'PORTAL-INVOICE-TASK','Fictieve dienstverlening',15,1,'stuk',10000,0,now(),1,'completed')",[taskId,tenant,orderId]);
  await db.query("insert into public.invoices(id,tenant_id,customer_id,created_by,status,invoice_number,issued_on,due_on,subtotal_cents,total_cents)values($1,$2,$3,$4,'draft','PORTAL-INVOICE',current_date,current_date+30,10000,10000)",[invoiceId,tenant,customer,owner]);
  await db.query("insert into public.invoice_lines(tenant_id,invoice_id,work_order_id,work_order_task_id,description,quantity,unit,unit_price_cents,subtotal_cents,vat_basis_points,vat_cents,total_cents)values($1,$2,$3,$4,'Fictieve dienstverlening',1,'stuk',10000,10000,0,0,10000)",[tenant,invoiceId,orderId,taskId]);
  await db.query("update public.invoices set status='sent',finalized_at=now(),customer_snapshot='{}',branding_snapshot='{}',lines_snapshot='[]' where id=$1",[invoiceId]);
  await page.goto(`/klant?account=${account}&view=invoices&payment=return`);await expect(page.getByRole("heading",{name:"Je betaalstatus wordt gecontroleerd"})).toBeVisible();await page.getByRole("button",{name:"Actuele facturen bekijken"}).click();
  await expect(page.getByText("Je organisatie heeft online betalen nog niet aangesloten. Neem bij vragen contact op.")).toBeVisible();
  await expect(page.getByRole("button",{name:"Betalen",exact:true})).toBeDisabled();
  await page.goto(`/klant?account=${account}&view=invoices&invoice=${invoiceId}`);
  await expect(dialog.getByRole("heading",{name:"PORTAL-INVOICE",exact:true})).toBeVisible();
  await expect(dialog.getByText("Je organisatie heeft online betalen nog niet aangesloten. Neem bij vragen contact op.")).toBeVisible();
  await expect(dialog.getByRole("button",{name:"Betalen",exact:true})).toBeDisabled();
  await db.query("insert into public.tenant_provider_connections(tenant_id,provider,mode,secret_reference,public_config,active,verified_at)values($1,'mollie','test','MOLLIE_API_KEY','{\"profile_id\":\"pfl_Fictional\"}',true,now())",[tenant]);
  await page.reload();await dialog.getByRole("button",{name:"Betalen",exact:true}).click();
  await expect(dialog.getByRole("heading",{name:"Betaling controleren",exact:true})).toBeVisible();
  await expect(dialog.getByRole("button",{name:"Veilig verder naar Mollie",exact:true})).toBeEnabled();
  await db.query("update public.tenant_provider_connections set active=false where tenant_id=$1",[tenant]);await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
  await expect(dialog.getByRole("button",{name:"Veilig verder naar Mollie",exact:true})).toBeDisabled();
  await expect(dialog.getByText("Je organisatie heeft online betalen nog niet aangesloten. Neem bij vragen contact op.")).toBeVisible();
  await db.query("update public.customer_portal_accounts set active=false where id=$1",[account]);await page.evaluate(()=>window.dispatchEvent(new Event("focus")));await expect(page.getByRole("heading",{name:"Je klanttoegang is gewijzigd"})).toBeVisible();expect((await page.request.get(`/api/customer-portal/files/document/${documentId}?account=${account}`)).status()).toBe(404);
 }finally{
  await admin.storage.from("customer-documents").remove([path]);await db.query("begin");await db.query("set local session_replication_role='replica'");const tables=(await db.query("select distinct table_schema,table_name from information_schema.columns where column_name='tenant_id' and table_schema in('public','private')")).rows;for(const {table_schema:s,table_name:n}of tables)await db.query(`delete from "${s}"."${n}" where tenant_id=$1`,[tenant]);await db.query("delete from public.tenants where id=$1",[tenant]);await db.query("commit");if(userId)await admin.auth.admin.deleteUser(userId);await db.end();
 }
});
