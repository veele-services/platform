import {test,expect} from "@playwright/test";
import {randomUUID} from "node:crypto";
import pg from "pg";
import {createClient} from "@supabase/supabase-js";
import type {Database} from "../../lib/database.types";
import {requireLocalApiUrl,requireLocalDatabaseUrl} from "./local-target";
import {authenticateWorkspace,signInWithEmailOtp} from "./login-auth";

test.use({trace:"off",screenshot:"off",video:"off"});
test("beheer koppelt een nieuw klantaccount zonder wachtwoord en kan de toegang intrekken",async({page,browser})=>{
 test.setTimeout(120000);
 page.setDefaultTimeout(15000);
 const db=new pg.Client({connectionString:requireLocalDatabaseUrl().href});await db.connect();
 const admin=createClient<Database>(requireLocalApiUrl().href,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
 const tenant=randomUUID(),customer=randomUUID(),contact=randomUUID(),email=`managed-${randomUUID()}@fieldgrid.test`;
 const owner=(await db.query("select id from auth.users where email='platform-admin@fieldgrid.test'")).rows[0].id;
 const customerContext=await browser.newContext();let userId="";
 try{
  await db.query("insert into public.tenants(id,slug,name)values($1,$2,'Fictieve toegangstest')",[tenant,`access-${tenant}`]);
  await db.query("insert into public.tenant_settings(tenant_id,enabled_services)values($1,array['planning','finance'])",[tenant]);
  await db.query("insert into public.tenant_branding(tenant_id)values($1)",[tenant]);
  await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status)values($1,$2,array['management']::public.app_role[],'active')",[tenant,owner]);
  await db.query("insert into public.customers(id,tenant_id,customer_number,name)values($1,$2,'ACCESS-TEST','Fictieve toegangsklant')",[customer,tenant]);
  await db.query("insert into public.customer_contacts(id,tenant_id,customer_id,full_name,email)values($1,$2,$3,'Kim Toegang',$4)",[contact,tenant,customer,email]);
  await page.context().addCookies([{name:"fieldgrid_tenant_id",value:tenant,url:"http://127.0.0.1:3000"}]);
  await authenticateWorkspace(page,"platform-admin@fieldgrid.test",`/app/klanten/${customer}?tab=contactpersonen`);
  await expect(page.getByRole("heading",{name:"Klantportaaltoegang",exact:true})).toBeVisible();
  const access=page.locator("section").filter({has:page.getByRole("heading",{name:"Klantportaaltoegang",exact:true})});
  await access.getByRole("combobox",{name:"Contactpersoon",exact:true}).selectOption(contact);
  await expect(access.getByLabel("E-mailadres voor inlogcodes")).toHaveValue(email);
  await access.getByLabel("Eigen objecten aanmaken").check();
  await access.getByLabel("Contact- en factuurgegevens bewerken").check();
  await access.getByRole("button",{name:"Klanttoegang opslaan",exact:true}).click();
  await expect(access.getByRole("status")).toContainText("Toegang opgeslagen");
  const identity=(await db.query("select id,last_sign_in_at from auth.users where email=$1",[email])).rows[0];userId=identity.id;
  // GoTrue generates an unknown random password internally when the admin
  // request omits it. Verify the observable contract: no session was issued,
  // no known password works, and the customer must complete a fresh email OTP.
  expect(identity.last_sign_in_at).toBeNull();
  expect((await db.query("select count(*)::int as count from auth.sessions where user_id=$1",[userId])).rows[0].count).toBe(0);
  const passwordAttempt=await createClient<Database>(requireLocalApiUrl().href,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false}}).auth.signInWithPassword({email,password:"Fictitious-not-issued-password-2026"});
  expect(passwordAttempt.error).not.toBeNull();expect(passwordAttempt.data.session).toBeNull();
  const account=(await db.query("select id,can_create_objects,can_edit_objects,can_edit_profile from public.customer_portal_accounts where tenant_id=$1 and user_id=$2",[tenant,userId])).rows[0];
  expect(account).toMatchObject({can_create_objects:true,can_edit_objects:false,can_edit_profile:true});
  await customerContext.addCookies([{name:"fieldgrid_tenant_id",value:tenant,url:"http://127.0.0.1:3000"}]);
  const customerPage=await customerContext.newPage();
  await signInWithEmailOtp(customerPage,email,`/klant?account=${account.id}`);
  await expect(customerPage.locator(".customer-portal")).toBeVisible();
  await access.getByRole("button",{name:email,exact:true}).click();
  await access.getByLabel("Toegang actief").uncheck();
  await access.getByRole("button",{name:"Klanttoegang opslaan",exact:true}).click();
  await expect(access.getByRole("status")).toContainText("ingetrokken");
  await customerPage.evaluate(()=>window.dispatchEvent(new Event("focus")));
  await expect(customerPage.getByRole("heading",{name:"Je klanttoegang is gewijzigd"})).toBeVisible();
 }finally{
  await db.query("begin");await db.query("set local session_replication_role='replica'");
  const tables=(await db.query("select distinct table_schema,table_name from information_schema.columns where column_name='tenant_id' and table_schema in('public','private')")).rows;
  for(const {table_schema:s,table_name:n}of tables)await db.query(`delete from "${s}"."${n}" where tenant_id=$1`,[tenant]);
  await db.query("delete from public.tenants where id=$1",[tenant]);await db.query("commit");
  if(!userId)userId=(await db.query("select id from auth.users where email=$1",[email])).rows[0]?.id??"";
  if(userId)await admin.auth.admin.deleteUser(userId);await db.end();
  await customerContext.close();
 }
});
