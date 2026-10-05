import {expect,test,type Page} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {randomUUID} from "node:crypto";
import pg from "pg";
import { requireLocalApiUrl, requireLocalDatabaseUrl } from "./local-target";
import { E2E_APP_ORIGIN } from "./staff-auth";
import { authenticateWorkspace } from "./login-auth";

test.use({trace:"off",screenshot:"off",video:"off"});
test("module switches preserve own personnel access and label unavailable report views",async({page,browser})=>{
 test.setTimeout(180000);
 const api=requireLocalApiUrl(),database=requireLocalDatabaseUrl();
 const db=new pg.Client({connectionString:database.href});await db.connect();
 const admin=createClient(api.href,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const tenant=randomUUID(),person=randomUUID(),customer=randomUUID(),object=randomUUID(),order=randomUUID(),report=randomUUID();
 const users:string[]=[],password="Fictitious-Modules-2026",emails=[0,1].map(()=>`modules-${randomUUID()}@fieldgrid.test`);
 const staffContext=await browser.newContext({baseURL:E2E_APP_ORIGIN}),staffPage=await staffContext.newPage();
 await staffPage.setViewportSize({width:390,height:844});
 let failure:unknown;
 const checked=async(result:{error:unknown})=>{if(result.error)throw new Error("Synthetic module fixture failed");};
 const enter=async(target:Page,index:number,next:string)=>{
  await target.context().addCookies([{name:"fieldgrid_tenant_id",value:tenant,url:"http://127.0.0.1:3000"}]);
  await authenticateWorkspace(target,emails[index],next,password);
  await expect(target.locator("html")).not.toHaveAttribute("data-account-blocked");
 };
 try{
  await db.query("insert into public.tenants(id,slug,name) values($1,$2,'FICTITIOUS module browser')",[tenant,`module-browser-${tenant}`]);
  await db.query("insert into public.tenant_settings(tenant_id,enabled_services) values($1,array['planning','personeel','rapportage','finance'])",[tenant]);
  await db.query("insert into public.tenant_branding(tenant_id) values($1)",[tenant]);
  for(let i=0;i<2;i++){
   const created=await admin.auth.admin.createUser({email:emails[i],password,email_confirm:true});await checked(created);
   if(!created.data.user)throw new Error("Synthetic user missing");users.push(created.data.user.id);
   await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,$3,'active')",[tenant,users[i],i===0?['tenant_admin','management','planner','finance']:['staff']]);
  }
  await db.query("insert into public.personnel(id,tenant_id,user_id,full_name,onboarding_step,onboarding_completed_at) values($1,$2,$3,'FICTITIOUS own employee',5,now())",[person,tenant,users[1]]);
  await db.query("insert into public.customers(id,tenant_id,customer_number,name) values($1,$2,$3,'FICTITIOUS module customer')",[customer,tenant,`C-${customer}`]);
  await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values($1,$2,$3,$4,'FICTITIOUS module object','{}')",[object,tenant,customer,`O-${object}`]);
  await db.query("insert into public.work_orders(id,tenant_id,customer_id,object_id,work_order_number,discipline,status,created_by) values($1,$2,$3,$4,$5,'FICTITIOUS module order','planned',$6)",[order,tenant,customer,object,`W-${order}`,users[0]]);
  await db.query("insert into public.report_entries(id,tenant_id,work_order_id,author_user_id,body) values($1,$2,$3,$4,'FICTITIOUS module report canary')",[report,tenant,order,users[0]]);
  await enter(page,0,`/app/werkbonnen/${order}?tab=communicatie`);
  await expect(page.getByText('FICTITIOUS module report canary',{exact:true})).toBeVisible();
  await checked(await admin.from('tenant_settings').update({enabled_services:['planning','personeel']}).eq('tenant_id',tenant));
  await page.reload();await expect(page.getByText('FICTITIOUS module report canary',{exact:true})).toHaveCount(0);
  expect(await page.content()).not.toContain('FICTITIOUS module report canary');
  await expect(page.getByRole('button',{name:'Bericht / bestand toevoegen',exact:true})).toHaveCount(0);
  await page.getByRole('link',{name:'Rapport & handtekening',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Rapportage niet ingeschakeld',exact:true})).toBeVisible();
  await checked(await admin.from('tenant_settings').update({enabled_services:['personeel']}).eq('tenant_id',tenant));
  await enter(staffPage,1,'/staff');
  await expect(staffPage.getByRole('heading',{name:'Planning niet ingeschakeld',exact:true})).toBeVisible();
  await staffPage.getByRole('button',{name:'Meer',exact:true}).click();
  await expect(staffPage.getByRole('heading',{name:'FICTITIOUS own employee',exact:true})).toBeVisible();
  expect((await db.query('select body from public.report_entries where id=$1',[report])).rows[0].body).toBe('FICTITIOUS module report canary');
  await checked(await admin.from('tenant_settings').update({enabled_services:['planning','personeel','rapportage','finance']}).eq('tenant_id',tenant));
  await page.goto(`/app/werkbonnen/${order}?tab=communicatie`);await expect(page.getByText('FICTITIOUS module report canary',{exact:true})).toBeVisible();
  // A planner can reset operational travel choices without reading or deleting
  // the employee's private address, and cannot use the wizard to restore archives.
  const day='2031-01-02';
  await db.query("update public.personnel set standard_vehicle='car' where id=$1",[person]);
  await db.query("insert into public.personnel_travel_days(tenant_id,personnel_id,day,standard_vehicle,departure_address,updated_by) values($1,$2,$3,'bicycle',$4,$5)",[tenant,person,day,{street:'FICTITIOUS PRIVATE DAY DEPARTURE',city:'FICTITIOUS',country:'NL',status:'manual'},users[0]]);
  const privateAddress=(await db.query('select departure_address from public.personnel_travel_days where tenant_id=$1 and personnel_id=$2 and day=$3',[tenant,person,day])).rows[0].departure_address;
  await checked(await admin.from('tenant_memberships').update({roles:['planner']}).eq('tenant_id',tenant).eq('user_id',users[0]));
  await page.goto(`/app/planning?day=${day}`);
  const row=page.locator('.pb-person-name').filter({hasText:'FICTITIOUS own employee'});
  await row.getByRole('button',{name:'Fiets · dagafwijking',exact:true}).click();
  await expect(page.getByRole('button',{name:'Reisinstellingen herstellen',exact:true})).toBeVisible();
  expect(await page.content()).not.toContain('FICTITIOUS PRIVATE DAY DEPARTURE');
  await page.getByRole('button',{name:'Reisinstellingen herstellen',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const restored=(await db.query('select departure_address,standard_vehicle from public.personnel_travel_days where tenant_id=$1 and personnel_id=$2 and day=$3',[tenant,person,day])).rows[0];
  expect(restored.departure_address).toEqual(privateAddress);expect(restored.standard_vehicle).toBeNull();
  await page.goto(`/app/klanten/${customer}`);
  await page.getByRole('button',{name:'Bewerken',exact:true}).click();
  await expect(page.getByRole('dialog').locator('select[name="status"] option[value="archived"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await db.query("update public.customers set status='archived' where id=$1",[customer]);
  await page.reload();await page.getByRole('button',{name:'Bewerken',exact:true}).click();
  const status=page.getByRole('dialog').locator('select[name="status"]');
  await expect(status).toHaveValue('archived');
  await expect(status.locator('option:not([disabled])')).toHaveCount(1);
 }catch(error){failure=error;}finally{
  await staffContext.close();
  try{
   for(const table of ['notification_deliveries','notification_requests','notification_planning_events'])await db.query(`delete from private.${table} where tenant_id=$1`,[tenant]);
   await db.query('delete from private.notification_template_versions where template_id in(select id from private.notification_templates where tenant_id=$1)',[tenant]);
   await db.query('delete from private.notification_templates where tenant_id=$1',[tenant]);
   await db.query('delete from public.audit_events where tenant_id=$1',[tenant]);
   await db.query('delete from public.work_orders where tenant_id=$1',[tenant]);
   await db.query('delete from public.objects where tenant_id=$1',[tenant]);
   await db.query('delete from public.customers where tenant_id=$1',[tenant]);
   await db.query('delete from public.tenants where id=$1',[tenant]);
   for(const user of users)await checked(await admin.auth.admin.deleteUser(user));
  }catch(error){if(!failure)failure=error;else test.info().annotations.push({type:'fixture-cleanup',description:'Synthetic module fixture cleanup also failed.'});}
  finally{await db.end();}
 }
 if(failure)throw failure;
});
