import {test,expect} from "@playwright/test";
import {randomUUID} from "node:crypto";
import pg from "pg";
import {createClient} from "@supabase/supabase-js";
import {requireLocalDatabaseUrl} from "./local-target";
import {authenticateWorkspace} from "./login-auth";

test.use({trace:"off",screenshot:"off",video:"off"});
test("customer without objects submits a complete request visible in backoffice",async({page,browser})=>{
 test.setTimeout(90000);
 const db=new pg.Client({connectionString:requireLocalDatabaseUrl().href});await db.connect();
 const api=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
 const customer=randomUUID(),contact=randomUUID(),account=randomUUID(),email=`objectless-${randomUUID()}@fieldgrid.test`;
 let user="",managerContext;
 try{
  const tenant=(await db.query("select id from public.tenants where slug='fieldgrid-e2e'")).rows[0].id;
  const manager=(await db.query("select id from auth.users where email='platform-admin@fieldgrid.test'")).rows[0].id;
  const created=await api.auth.admin.createUser({email,password:"Fieldgrid-E2E-2026",email_confirm:true});if(created.error||!created.data.user)throw new Error("Local fixture failed");user=created.data.user.id;
  await db.query("insert into public.customers(id,tenant_id,customer_number,name,billing_email) values($1,$2,$1::uuid::text,'FICTITIOUS unknown location customer',$3)",[customer,tenant,email]);
  await db.query("insert into public.customer_contacts(id,tenant_id,customer_id,full_name,email) values($1,$2,$3,'FICTITIOUS Intake',$4)",[contact,tenant,customer,email]);
  await db.query("insert into public.customer_portal_accounts(id,tenant_id,customer_id,user_id,contact_id,created_by,onboarding_completed_at) values($1,$2,$3,$4,$5,$6,now())",[account,tenant,customer,user,contact,manager]);
  await page.context().addCookies([{name:"fieldgrid_tenant_id",value:tenant,url:"http://127.0.0.1:3000"}]);
  await page.setViewportSize({width:390,height:844});await authenticateWorkspace(page,email,`/klant?account=${account}&view=requests`);
  await page.getByRole("button",{name:"Nieuwe aanvraag",exact:true}).first().click();const form=page.getByRole("dialog",{name:"Dienst aanvragen"});await expect(form).toBeVisible();
  await expect(form.getByText("Objecten (optioneel)",{exact:true})).toBeVisible();await expect(form.locator('input[name=objects]')).toHaveCount(0);
  await form.getByLabel("Gewenste dienst *").selectOption("Andere dienstverlening");await form.getByLabel("Frequentie").selectOption("Maandelijks");await form.getByLabel("Wat zijn je wensen? *").fill("FICTITIOUS volledige aanvraag: schoonmaak, locatie bespreken.");
  await form.getByRole("button",{name:"Aanvraag versturen",exact:true}).click();await expect(form).toBeHidden();
  await expect(page.getByText("Locatie later vaststellen",{exact:false}).first()).toBeVisible();await page.reload();await expect(page.getByText("Locatie later vaststellen",{exact:false}).first()).toBeVisible();
  const rows=(await db.query("select * from public.requests where customer_id=$1",[customer])).rows;expect(rows).toHaveLength(1);expect(rows[0].object_id).toBeNull();expect(rows[0].description).toBe("FICTITIOUS volledige aanvraag: schoonmaak, locatie bespreken.");expect(rows[0].preferences.frequency).toBe("Maandelijks");
  expect((await db.query("select count(*)::int n from public.objects where customer_id=$1",[customer])).rows[0].n).toBe(0);
  managerContext=await browser.newContext();await managerContext.addCookies([{name:"fieldgrid_tenant_id",value:tenant,url:"http://127.0.0.1:3000"}]);const management=await managerContext.newPage();await authenticateWorkspace(management,"platform-admin@fieldgrid.test",`/app/aanvragen?request=${rows[0].id}`);
  await expect(management.getByText(rows[0].subject,{exact:true}).first()).toBeVisible();
 }finally{
  await managerContext?.close();await db.query("begin");
  // Remove only this local fixture, including its immutable request history.
  await db.query("set local session_replication_role=replica");
  await db.query("delete from public.commercial_events where request_id in(select id from public.requests where customer_id=$1)",[customer]);
  await db.query("delete from private.customer_portal_commands where account_id=$1",[account]);await db.query("delete from public.requests where customer_id=$1",[customer]);await db.query("delete from public.customer_portal_accounts where id=$1",[account]);await db.query("delete from public.customer_contacts where customer_id=$1",[customer]);await db.query("delete from public.customers where id=$1",[customer]);await db.query("set local session_replication_role=origin");if(user)await db.query("delete from auth.users where id=$1",[user]);await db.query("commit");await db.end();
 }
});
