import {expect,test} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {createClient} from '@supabase/supabase-js';
import {requireLocalApiUrl,requireLocalDatabaseUrl} from './local-target';
import {authenticateWorkspace} from './login-auth';
test.use({trace:'off',screenshot:'off',video:'off'});
test.setTimeout(150000);
test('knowledge: platform editing, published reader snapshots, four portaal shells and ticket insertion',async({page,browser},testInfo)=>{
 page.setDefaultTimeout(15000);
 const db=new Client({connectionString:requireLocalDatabaseUrl().href});await db.connect();
 const api=createClient(requireLocalApiUrl().href,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
 const slug=`browser-knowledge-${randomUUID().slice(0,8)}`,title=`Handleiding ${slug}`,body='## Beginnen\n\nEen uitgebreide uitleg voor de fictieve browserproef, met de voorwaarden en controle van een concrete uitvoering.\n\n## Stappen\n\n1. Open de eigen werkruimte.\n2. Controleer de opdracht en bevestiging.\n\n## Vragen\n\n### Waar vind ik hulp?\n\nGebruik een eigen ticket.';
 const staff=await browser.newContext(),customer=await browser.newContext(),manager=await browser.newContext();
 const customerId=randomUUID(),contact=randomUUID(),object=randomUUID();let tenant='',customerUser='',ticket='';let originalServices:string[]|undefined;
 const customerEmail=`kb-${slug}@fieldgrid.test`;
 try{
  tenant=(await db.query("select id from public.tenants where slug='fieldgrid-e2e'")).rows[0].id;
  originalServices=(await db.query('select enabled_services from public.tenant_settings where tenant_id=$1',[tenant])).rows[0].enabled_services;
  await db.query('begin');await db.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',true)");
  await db.query("update public.tenant_settings set enabled_services=array(select distinct unnest(enabled_services||array['klantportaal','tickets'])) where tenant_id=$1",[tenant]);await db.query('commit');
  const owner=(await db.query("select id from auth.users where email='platform-admin@fieldgrid.test'")).rows[0].id;
  const worker=(await db.query("select id from auth.users where email='field-worker@fieldgrid.test'")).rows[0].id;
  const created=await api.auth.admin.createUser({email:customerEmail,email_confirm:true,password:'Fieldgrid-E2E-2026'});if(created.error)throw new Error('Local customer fixture failed');customerUser=created.data.user.id;
  await db.query("insert into public.customers(id,tenant_id,customer_number,name) values($1,$2,$1::uuid::text,'Fictieve kennisbankklant')",[customerId,tenant]);
  await db.query("insert into public.customer_contacts(id,tenant_id,customer_id,full_name,email) values($1,$2,$3,'Fictieve kennisbankklant',$4)",[contact,tenant,customerId,customerEmail]);
  await db.query('insert into public.customer_portal_accounts(tenant_id,customer_id,user_id,contact_id,active,onboarding_completed_at,created_by) values($1,$2,$3,$4,true,now(),$5)',[tenant,customerId,customerUser,contact,owner]);
  await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values($1,$2,$3,$1::uuid::text,'Fictief kennisbankobject','{\"street\":\"Teststraat 1\",\"postal_code\":\"1234 AB\",\"city\":\"Teststad\"}')",[object,tenant,customerId]);
  await db.query('insert into public.object_customer_bindings(tenant_id,object_id,user_id,active,created_by) values($1,$2,$3,true,$4)',[tenant,object,customerUser,owner]);
  for(const context of[page.context(),staff,customer,manager])await context.addCookies([{name:'fieldgrid_tenant_id',value:tenant,url:'http://127.0.0.1:3000'}]);
  await authenticateWorkspace(page,'platform-admin@fieldgrid.test','/platform/kennisbank');
  await expect(page.locator('.fg-sidebar')).toBeVisible();await expect(page.getByRole('heading',{name:'Kennisbank',exact:true,level:1})).toBeVisible();await page.screenshot({path:testInfo.outputPath('knowledge-platform.png'),fullPage:true});await page.getByRole('button',{name:'Nieuw artikel',exact:true}).click();
  await page.getByLabel('Titel',{exact:true}).fill(title);await page.getByLabel('Vaste artikelcode').fill(slug);await page.getByLabel('Samenvatting').fill('Een uitgebreide fictieve handleiding om redactie en de echte publicatiegrenzen te controleren.');
  await page.getByLabel('Uitgebreide uitleg',{exact:true}).fill(body);await page.getByRole('checkbox',{name:'Tenantbeheer',exact:true}).uncheck();await page.getByRole('checkbox',{name:'Personeel',exact:true}).check();
  await page.getByRole('button',{name:'Concept opslaan',exact:true}).click();await expect(page.getByRole('heading',{name:title,exact:true,level:1})).toBeVisible();
  const staffPage=await staff.newPage();await authenticateWorkspace(staffPage,'field-worker@fieldgrid.test','/staff/kennisbank');await expect(staffPage.getByRole('button',{name:'Nieuw artikel',exact:true})).toHaveCount(0);
  const draftResponse=await staffPage.request.get(`/api/knowledge?workspace=staff&slug=${slug}`);expect(draftResponse.status()).toBe(404);
  await page.getByRole('button',{name:'Publiceren',exact:true}).click();await page.getByRole('button',{name:'Bevestigen',exact:true}).click();await expect(page.getByText('Artikel gepubliceerd.',{exact:true})).toBeVisible();
  await staffPage.goto(`/staff/kennisbank/${slug}`);await expect(staffPage.getByRole('heading',{name:title,level:1,exact:true})).toBeVisible();await expect(staffPage.getByRole('navigation',{name:'Inhoudsopgave'})).toBeVisible();
  await staffPage.setViewportSize({width:390,height:844});expect(await staffPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const managerPage=await manager.newPage();managerPage.setDefaultTimeout(15000);await authenticateWorkspace(managerPage,'platform-admin@fieldgrid.test','/app/kennisbank');await expect(managerPage.getByRole('heading',{name:'Kennisbank',exact:true,level:1})).toBeVisible();await expect(managerPage.getByRole('button',{name:'Nieuw artikel',exact:true})).toHaveCount(0);
  const denied=await managerPage.request.get(`/api/knowledge?workspace=backoffice&slug=${slug}`);expect(denied.status()).toBe(404);
  const managerSearch=managerPage.waitForResponse(r=>r.url().includes('/api/knowledge?')&&new URL(r.url()).searchParams.get('search')==='bon vrijgeven'&&r.status()===200);await managerPage.getByRole('searchbox',{name:'Zoek in de kennisbank'}).fill('bon vrijgeven');await managerSearch;await expect(managerPage.getByRole('link').filter({has:managerPage.getByRole('heading',{name:'Een werkbon maken, plannen en vrijgeven aan personeel',exact:true})})).toBeVisible();
  const customerPage=await customer.newPage();await authenticateWorkspace(customerPage,customerEmail,'/klant/kennisbank');await expect(customerPage.getByRole('heading',{name:'Kennisbank',exact:true,level:1})).toBeVisible();await expect(customerPage.getByRole('button',{name:'Nieuw artikel',exact:true})).toHaveCount(0);
  const customerSearch=customerPage.waitForResponse(r=>r.url().includes('/api/knowledge?')&&new URL(r.url()).searchParams.get('search')==='betalen'&&r.status()===200);await customerPage.getByRole('searchbox',{name:'Zoek in de kennisbank'}).fill('betalen');await customerSearch;await expect(customerPage.getByRole('heading',{name:'Facturen bekijken en een online betaling controleren',exact:true})).toBeVisible();await customerPage.setViewportSize({width:390,height:844});expect(await customerPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await customerPage.screenshot({path:testInfo.outputPath('knowledge-customer-mobile.png'),fullPage:true});
  await page.getByRole('button',{name:'Artikel bewerken',exact:true}).click();await page.getByLabel('Titel',{exact:true}).fill(`Concept ${title}`);await page.getByRole('button',{name:'Concept opslaan',exact:true}).click();await expect(page.getByRole('heading',{name:`Concept ${title}`,exact:true,level:1})).toBeVisible();
  await staffPage.reload();await expect(staffPage.getByRole('heading',{name:title,level:1,exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Archiveren',exact:true}).click();await page.getByRole('button',{name:'Bevestigen',exact:true}).click();await expect(page.getByText('Artikel gearchiveerd.',{exact:true})).toBeVisible();await staffPage.bringToFront();await staffPage.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(staffPage.getByText('Kennisbank niet beschikbaar',{exact:true})).toBeVisible();
  // A real persisted ticket, with the authenticated reporter session and genuine default grants.
  const category=(await db.query("select id from public.ticket_categories where tenant_id=$1 and code='planning'",[tenant])).rows[0].id;
  const session=(await db.query('select id from auth.sessions where user_id=$1 order by created_at desc limit 1',[worker])).rows[0].id;
  await db.query('begin');await db.query('set local role authenticated');await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role:'authenticated',sub:worker,session_id:session})]);
  ticket=(await db.query("select public.ticket_command($1,'staff','create',$2,$3) data",[tenant,{title:'Fictieve kennisbankvraag',body:'Hoe installeer ik de personeelsapp?',category_id:category,urgency:'normal'},randomUUID()])).rows[0].data.id;await db.query('commit');
  await managerPage.bringToFront();await managerPage.goto(`/app/meldingen/${ticket}`);await managerPage.getByRole('button',{name:'Artikel uit kennisbank',exact:true}).click();await managerPage.getByLabel('Zoek een handleiding').fill('installeren');
  const result=managerPage.locator('.kb-ticket-result').filter({has:managerPage.getByRole('heading',{name:'De personeelsapp installeren op Android of iPhone',exact:true})});await result.getByText('Artikel lezen',{exact:true}).click();await expect(result.getByRole('heading',{name:'Android en Samsung',exact:true})).toBeVisible();await result.getByRole('button',{name:'Link in antwoord invoegen',exact:true}).click();
  await expect(managerPage.locator('.ticket-composer textarea')).toHaveValue(/\/staff\/kennisbank\/personeelsapp-installeren/);
  await managerPage.locator('.ticket-composer').getByRole('button',{name:'Antwoord versturen',exact:true}).click();await expect(managerPage.getByRole('link',{name:'Kennisbankartikel openen'})).toBeVisible();
 }finally{
  await Promise.allSettled([staff.close(),customer.close(),manager.close()]);
  await db.query('rollback');await db.query('reset role');
  // The synthetic immutable conversation remains in the isolated local fixture database.
  // Do not disable audit or foreign-key guards to remove it.
  await db.query('delete from private.knowledge_versions where article_id in(select id from private.knowledge_articles where slug=$1)',[slug]);await db.query('delete from private.knowledge_articles where slug=$1',[slug]);await db.query("delete from private.knowledge_receipts where result->>'slug'=$1",[slug]);
  if(customerUser){await db.query('delete from public.object_customer_bindings where user_id=$1',[customerUser]);await db.query('delete from public.customer_portal_accounts where user_id=$1',[customerUser]);await db.query('delete from public.objects where id=$1',[object]);await db.query('delete from public.customer_contacts where id=$1',[contact]);await db.query('delete from public.customers where id=$1',[customerId]);await api.auth.admin.deleteUser(customerUser);}
  if(originalServices){await db.query('begin');await db.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',true)");await db.query('update public.tenant_settings set enabled_services=$2 where tenant_id=$1',[tenant,originalServices]);await db.query('commit');}
  await db.end();
 }
});
