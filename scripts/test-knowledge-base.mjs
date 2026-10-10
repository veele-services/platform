import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {workOrderTestDatabase} from './work-order-test-target.mjs';
import {knowledgeArticles} from '../content/knowledge/index.mjs';

test('Knowledge editorial library has substantive articles and valid related sources',()=>{
 const slugs=new Set(knowledgeArticles.map(a=>a.slug));assert.equal(slugs.size,46);
 for(const article of knowledgeArticles){assert.ok(article.body.split(/\s+/).length>=300,article.slug);assert.ok((article.body.match(/^## /gm)||[]).length>=4,article.slug);for(const related of article.related)assert.ok(slugs.has(related),related);}
 for(const portal of ['platform','backoffice','staff','customer'])assert.ok(knowledgeArticles.filter(a=>a.audiences.includes(portal)).length>=10);
});
test('Knowledge: private editorial storage, live reader scopes, search, versions and ticket audiences',async t=>{
 const db=await workOrderTestDatabase();await db.query('begin');
 const tenant=randomUUID(),other=randomUUID(),users=Object.fromEntries(['admin','manager','staff','customer','support','outsider'].map(k=>[k,randomUUID()])),sessions=Object.fromEntries(Object.keys(users).map(k=>[k,randomUUID()]));
 const call=async(sql,args=[],who='manager',role='authenticated')=>{await db.query('savepoint kb_call');try{await db.query(`set local role ${role}`);await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role,sub:users[who],session_id:sessions[who]})]);const r=await db.query(sql,args);await db.query('reset role');await db.query("select set_config('request.jwt.claims','{}',true)");await db.query('release savepoint kb_call');return r.rows[0]?.data??r.rows;}catch(e){await db.query('rollback to savepoint kb_call');await db.query('release savepoint kb_call');throw e;}};
 const query=(operation,payload={},who='manager',ctx='backoffice',target=tenant)=>call('select public.knowledge_query($1,$2,$3,$4) data',[target,ctx,operation,payload],who);
 const command=(op,payload,who='admin',key=randomUUID())=>call('select public.knowledge_command($1,$2,$3) data',[op,payload,key],who);
 const denied=p=>assert.rejects(p,e=>e.code==='42501');
 const article={title:'FICTITIOUS PUBLIC SAFE TITLE',summary:'A useful safe public explanation with no private tenant information.',body:'PUBLIC SAFE INSTRUCTION '.repeat(30),category:'FICTITIOUS SAFE CATEGORY',tags:['vrijgeven','bon','planning'],audiences:['staff'],related:[]};
 const slug=`fixture-knowledge-${randomUUID()}`;
 try {
  for(const [k,id]of Object.entries(users)){await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,`${id}@knowledge-fixture.invalid`]);await db.query('insert into auth.sessions(id,user_id,created_at,updated_at) values($1,$2,now(),now())',[sessions[k],id]);}
  await db.query('insert into public.platform_admins(user_id) values($1)',[users.admin]);
  for(const id of[tenant,other]){await db.query("insert into public.tenants(id,slug,name) values($1,$2,'FICTITIOUS knowledge tenant')",[id,`knowledge-${id}`]);await db.query("insert into public.tenant_settings(tenant_id,enabled_services) values($1,array['personeel','klantportaal','planning','tickets'])",[id]);await db.query('insert into public.tenant_branding(tenant_id) values($1)',[id]);}
  for(const [k,role]of[['manager','tenant_admin'],['staff','staff']])await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array[$3]::public.app_role[],'active')",[tenant,users[k],role]);
  await db.query("insert into public.personnel(tenant_id,user_id,full_name,email,status) values($1,$2,'FICTITIOUS worker',$3,'active')",[tenant,users.staff,`${users.staff}@knowledge-fixture.invalid`]);
  const customer=randomUUID(),contact=randomUUID(),object=randomUUID();
  await db.query("insert into public.customers(id,tenant_id,customer_number,name) values($1,$2,$1::uuid::text,'FICTITIOUS customer')",[customer,tenant]);
  await db.query("insert into public.customer_contacts(id,tenant_id,customer_id,full_name,email) values($1,$2,$3,'FICTITIOUS customer',$4)",[contact,tenant,customer,`${users.customer}@knowledge-fixture.invalid`]);
  await db.query('insert into public.customer_portal_accounts(tenant_id,customer_id,user_id,contact_id,active,created_by) values($1,$2,$3,$4,true,$5)',[tenant,customer,users.customer,contact,users.manager]);
  await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values($1,$2,$3,'KB-OBJECT','FICTITIOUS object','{\"street\":\"Teststraat 1\",\"postal_code\":\"1234 AB\",\"city\":\"Teststad\"}')",[object,tenant,customer]);
  await db.query('insert into public.object_customer_bindings(tenant_id,object_id,user_id,active,created_by) values($1,$2,$3,true,$4)',[tenant,object,users.customer,users.manager]);
  await db.query("insert into public.permission_grants(user_id,capability,scope,source) values($1,'platform.support.read','{\"all\":true}','manual'),($1,'platform.support.reply','{\"all\":true}','manual')",[users.support]);
  await db.query('select private.ticket_seed_membership(id) from public.tenant_memberships where tenant_id=$1',[tenant]);
  const adminArticle=()=>query('article',{slug},'admin','platform',null);
  await t.test('only platform admins can write, including forged direct RPC calls',async()=>{
   for(const who of['manager','staff','customer','support','outsider'])await denied(command('save',{slug,revision:0,content:article},who));
   await command('save',{slug,revision:0,content:article});assert.equal((await adminArticle()).publication,'draft');
   await assert.rejects(query('article',{slug},'staff','staff'),e=>e.code==='P0002');
  });
  await t.test('all storage forces RLS and direct data/API/service grants are denied',async()=>{
   for(const table of['knowledge_articles','knowledge_versions','knowledge_receipts']){const flags=(await db.query("select relrowsecurity,relforcerowsecurity from pg_class where oid=$1::regclass",[`private.${table}`])).rows[0];assert.ok(flags.relrowsecurity&&flags.relforcerowsecurity);for(const role of['anon','authenticated','service_role'])await denied(call(`select * from private.${table}`,[],'admin',role));}
   await denied(call("select public.knowledge_query(null,'platform','list','{}') data",[],'admin','anon'));
  });
  await t.test('publishing is explicit and respects portal for details, totals, categories and related',async()=>{
   await command('publish',{slug,revision:1});const staff=await query('article',{slug},'staff','staff');assert.equal(staff.title,article.title);assert.equal(staff.history,undefined);assert.equal(staff.relatedSlugs,undefined);
   for(const [who,ctx]of[['manager','backoffice'],['customer','customer'],['support','platform']])await assert.rejects(query('article',{slug},who,ctx,ctx==='platform'?null:tenant),e=>e.code==='P0002');
   const hidden=await query('list',{search:'FICTITIOUS SAFE CATEGORY'});assert.equal(hidden.total,0);assert.ok(!JSON.stringify(hidden).includes(article.title));
  });
  await t.test('draft edits do not replace the published snapshot; readers never get history',async()=>{
   await command('save',{slug,revision:2,content:{...article,title:'DRAFT PRIVATE CANARY',category:'DRAFT CATEGORY CANARY',body:'DRAFT BODY CANARY '.repeat(30)}});
   assert.equal((await query('article',{slug},'staff','staff')).title,article.title);assert.equal((await adminArticle()).title,'DRAFT PRIVATE CANARY');
   assert.ok(!JSON.stringify(await query('list',{},'staff','staff')).includes('DRAFT PRIVATE'));
  });
  await t.test('restoration changes the draft, retains reader publication, and detects stale edits',async()=>{
   await assert.rejects(command('save',{slug,revision:2,content:article}),e=>e.code==='40001');await command('restore',{slug,revision:3,sourceRevision:1});assert.equal((await adminArticle()).title,article.title);assert.equal((await query('article',{slug},'staff','staff')).title,article.title);
  });
  await t.test('idempotent receipts are payload bound and cannot replay after account revocation',async()=>{
   const key=randomUUID(),payload={slug,revision:4};assert.deepEqual(await command('publish',payload,'admin',key),await command('publish',payload,'admin',key));await assert.rejects(command('archive',payload,'admin',key),e=>e.code==='23514');
   await db.query('delete from auth.sessions where id=$1',[sessions.admin]);await denied(command('publish',payload,'admin',key));await db.query('insert into auth.sessions(id,user_id,created_at,updated_at) values($1,$2,now(),now())',[sessions.admin,users.admin]);
  });
  await t.test('archived direct links disappear and re-publication restores the stable slug',async()=>{
   await command('archive',{slug,revision:5});await assert.rejects(query('article',{slug},'staff','staff'),e=>e.code==='P0002');await command('publish',{slug,revision:6});assert.equal((await query('article',{slug},'staff','staff')).slug,slug);
  });
  await t.test('Dutch task words, synonyms and typos find useful eligible articles',async()=>{
   for(const [search,who,ctx,expected]of[['bon vrijgeven','manager','backoffice','werkbon-maken-plannen-en-vrijgeven'],['Samsung','staff','staff','personeelsapp-installeren'],['instaleren','staff','staff','personeelsapp-installeren'],['betalen','customer','customer','klant-facturen-en-betalen']])assert.ok((await query('list',{search,pageSize:100},who,ctx)).items.some(a=>a.slug===expected),search);
  });
  await t.test('related articles are visibility filtered before projection',async()=>{
   await command('save',{slug,revision:7,content:{...article,related:['platform-release-controle','personeelsapp-installeren']}});await command('publish',{slug,revision:8});const r=await query('article',{slug},'staff','staff');assert.ok(r.related.some(a=>a.slug==='personeelsapp-installeren'));assert.ok(!JSON.stringify(r).includes('platform-release-controle'));
  });
  await t.test('unknown, null, foreign and inactive contexts fail closed',async()=>{
   await denied(query('list',{},'staff',null));await denied(query('list',{},'staff','backoffice'));await denied(query('list',{},'manager','backoffice',other));await denied(query('list',{},'outsider','platform',null));
   await db.query("update public.tenants set status='suspended' where id=$1",[tenant]);await denied(query('list'));await db.query("update public.tenants set status='active' where id=$1",[tenant]);
  });
  let staffTicket;
  await t.test('ticket picker follows the actual reporter audience and denies foreign tickets/notes',async()=>{
   const category=(await db.query("select id from public.ticket_categories where tenant_id=$1 and code='planning'",[tenant])).rows[0].id;
   staffTicket=await call("select public.ticket_command($1,'staff','create',$2,$3) data",[tenant,{title:'FICTITIOUS knowledge ticket',body:'FICTITIOUS public question',category_id:category,urgency:'normal'},randomUUID()],'staff');
   const pick=(audience='reporter',who='manager',target=tenant,ctx='tenant')=>call('select public.knowledge_ticket_search($1,$2,$3,$4,$5) data',[target,ctx,staffTicket.id,audience,'installeren'],who);
   const r=await pick();assert.equal(r.portal,'staff');assert.ok(r.items.some(a=>a.slug==='personeelsapp-installeren'));assert.ok(!JSON.stringify(r).includes('platform-release-controle'));
   await denied(pick('reporter','manager',other));await denied(pick('reporter','support',null,'platform'));await denied(pick('platform'));await denied(pick('reporter','staff',tenant,'staff'));
   const notes=await pick('tenant');assert.equal(notes.portal,'backoffice');
  });
  await t.test('customer binding, staff activation and retained sessions are rechecked',async()=>{
   await db.query('update public.object_customer_bindings set active=false where user_id=$1',[users.customer]);await db.query('update public.customer_portal_accounts set active=false where user_id=$1',[users.customer]);await denied(query('list',{},'customer','customer'));
   await db.query("update public.personnel set status='inactive' where user_id=$1",[users.staff]);await denied(query('list',{},'staff','staff'));
   await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['tenant_admin']::public.app_role[],'active')",[tenant,users.outsider]);
   await db.query("update public.tenant_memberships set status='revoked' where user_id=$1",[users.manager]);await denied(query('list'));
  });
 }finally{await db.query('rollback');await db.end();}
});
