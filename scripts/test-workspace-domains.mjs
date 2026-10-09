import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {workOrderTestDatabase} from './work-order-test-target.mjs';
test('workspace hosts require platform authority, DNS state, exact environment and an active tenant',async t=>{
 const db=await workOrderTestDatabase(), actor=randomUUID(),other=randomUUID(),tenant=randomUUID(),second=randomUUID(),host=`app-${randomUUID()}.example.test`;let domain;
 const call=async(operation,input={},target=tenant,user=actor,role='service_role')=>{
  await db.query('savepoint domain_actor');
  try {await db.query(`set local role ${role}`);const rows=(await db.query('select public.platform_workspace_domain_command($1,$2,$3,$4) data',[target,user,operation,{environment:'production',...input}])).rows;await db.query('reset role');await db.query('release savepoint domain_actor');return rows[0].data;}
  catch(e){await db.query('rollback to savepoint domain_actor');await db.query('release savepoint domain_actor');throw e;}
 };
 const resolve=async(env='production')=>(await db.query('select public.resolve_workspace_hostname($1,$2) slug',[host,env])).rows[0].slug;
 try {await db.query('begin');await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now()),($3,$4,now())',[actor,`${actor}@fixture.test`,other,`${other}@fixture.test`]);await db.query('insert into public.platform_admins(user_id) values($1)',[actor]);await db.query('insert into public.tenants(id,name,slug) values($1,$2,$3),($4,$5,$6)',[tenant,'FICTITIOUS domain tenant',`domain-${tenant}`,second,'FICTITIOUS second tenant',`domain-${second}`]);
  await t.test('authenticated callers, non-admin service actors and reserved hosts cannot register',async()=>{
   await assert.rejects(call('register',{host},tenant,actor,'authenticated'),e=>e.code==='42501');await assert.rejects(call('register',{host},tenant,other),e=>e.code==='42501');
   for(const invalid of ['fieldgrid.nl','x.staging.fieldgrid.nl','127.0.0.1','https://app.example.nl','app..example.nl'])await assert.rejects(call('register',{host:invalid}),e=>['23514','23502'].includes(e.code));
  });
  await t.test('pending hosts remain closed and cannot bind twice or activate before verification',async()=>{
   domain=await call('register',{host});assert.equal(await resolve(),null);await assert.rejects(call('activate',{id:domain.id,verificationToken:domain.verification_token}),e=>e.code==='22023');await assert.rejects(call('register',{host},second),e=>e.code==='23505');
   await assert.rejects(call('verify',{id:domain.id,verificationToken:randomUUID()}),e=>e.code==='40001');await assert.rejects(call('verify',{id:domain.id,verificationToken:domain.verification_token},second),e=>e.code==='42501');
  });
  await t.test('verified DNS alone is not routing, active mapping uses exact environment and loses inactive tenant',async()=>{
   await call('verify',{id:domain.id,verificationToken:domain.verification_token});assert.equal(await resolve(),null);await call('activate',{id:domain.id,verificationToken:domain.verification_token});assert.equal(await resolve(),`domain-${tenant}`);assert.equal(await resolve('staging'),null);
   await db.query("update public.tenants set status='suspended' where id=$1",[tenant]);assert.equal(await resolve(),null);await db.query("update public.tenants set status='active' where id=$1",[tenant]);
  });
  await t.test('activating replacement keeps one primary, removal immediately closes resolution and creates audit',async()=>{
   const replacement=await call('register',{host:`second-${randomUUID()}.example.test`});await call('verify',{id:replacement.id,verificationToken:replacement.verification_token});await call('activate',{id:replacement.id,verificationToken:replacement.verification_token});assert.equal(await resolve(),null);
   await call('activate',{id:domain.id,verificationToken:domain.verification_token});assert.equal(await resolve(),`domain-${tenant}`);await call('remove',{id:domain.id});assert.equal(await resolve(),null);
   assert.ok((await db.query("select count(*)::int n from public.audit_events where tenant_id=$1 and action like 'tenant.workspace_domain.%'",[tenant])).rows[0].n>=6);
  });
  await t.test('bootstrap platform revocation prevents later service command',async()=>{
   await db.query('delete from public.platform_admins where user_id=$1',[actor]);await assert.rejects(call('register',{host:`after-${randomUUID()}.example.test`}),e=>e.code==='42501');
  });
 }finally{await db.query('rollback');await db.end();}
});

test('portal migration backfill preserves entitlement guards and caller context on populated data',async t=>{
 const migration=readFileSync(new URL('../supabase/migrations/20261008174000_workspace_domains_customer_portal.sql',import.meta.url),'utf8');
 const blocks=[...migration.matchAll(/do \$\$ declare previous_role text:=current_setting\('request\.jwt\.claim\.role',true\);[\s\S]*?\nend \$\$;/g)];
 assert.equal(blocks.length,1,'test must execute the actual migration context block');
 const block=blocks[0][0],backfill=block.match(/\n\s*(with changed as \([\s\S]*?from changed;)\s*\n\s*perform set_config\('request\.jwt\.claim\.role',previous_role,true\);/)?.[1];
 assert(backfill,'test must reproduce the old unwrapped backfill from migration source');
 const slug=backfill.match(/t\.slug='([^']+)'/)?.[1],portalModule=backfill.match(/array_append\(s\.enabled_services,'([^']+)'\)/)?.[1],action=backfill.match(/select tenant_id,'([^']+)'/)?.[1];
 assert(slug&&portalModule&&action,'target, module and audit action must come from migration source');
 const db=await workOrderTestDatabase(),tenant=randomUUID(),second=randomUUID(),actor=randomUUID(),session=randomUUID();
 const baseServices=['planning','personeel'];
 const context=async()=>(await db.query("select current_setting('request.jwt.claim.role',true) role,current_setting('request.jwt.claims',true) claims")).rows[0];
 const settings=async id=>(await db.query('select * from public.tenant_settings where tenant_id=$1',[id])).rows[0];
 const audits=async()=>(await db.query('select * from public.audit_events where tenant_id=$1 and action=$2 order by id',[tenant,action])).rows;
 const isolated=async fn=>{
  await db.query('savepoint portal_case');
  try{await fn();}finally{await db.query('rollback to savepoint portal_case');await db.query('release savepoint portal_case');}
 };
 const rejectStatement=async(sql,values,predicate)=>{
  await db.query('savepoint portal_attempt');
  try{await assert.rejects(db.query(sql,values),predicate);}finally{await db.query('rollback to savepoint portal_attempt');await db.query('release savepoint portal_attempt');}
 };
 const unchangedContext=async before=>{
  const after=await context();
  // PostgreSQL may retain an empty custom GUC after restoring an unset value;
  // the entitlement trigger treats those two representations identically.
  assert.equal(after.role||null,before.role||null);
  assert.equal(after.claims,before.claims,'migration must leave the JSON JWT claims untouched');
 };
 const appliesOnce=async()=>{
  const before=await context(),otherBefore=await settings(second),auditBefore=(await audits()).length;
  assert.deepEqual((await settings(tenant)).enabled_services,baseServices);
  await db.query(block);
  assert.deepEqual((await settings(tenant)).enabled_services,[...baseServices,portalModule]);
  assert.deepEqual(await settings(second),otherBefore,'unrelated tenant settings must remain unchanged');
  let entries=await audits();assert.equal(entries.length,auditBefore+1);
  assert.equal(entries.at(-1).entity_type,'tenant_settings');assert.equal(entries.at(-1).entity_id,tenant);assert.equal(entries.at(-1).after_data.module,portalModule);
  await unchangedContext(before);
  await db.query(block);
  assert.deepEqual((await settings(tenant)).enabled_services,[...baseServices,portalModule]);
  assert.equal((await audits()).length,auditBefore+1,'repeat must not add a duplicate audit');
  assert.deepEqual(await settings(second),otherBefore);
  await unchangedContext(before);
 };
 try{
  await db.query('begin');
  const initial=await context();assert(!initial.role&&!initial.claims,'fixture requires a direct migration connection without API JWT claims');
  assert.equal((await db.query('select count(*)::int n from public.tenants where slug=$1',[slug])).rows[0].n,0,'canonical slug must be free in this isolated rollback-only fixture');
  await db.query('insert into public.tenants(id,name,slug) values($1,$2,$3),($4,$5,$6)',[tenant,'FICTITIOUS portal migration target',slug,second,'FICTITIOUS unrelated portal tenant',`portal-other-${second}`]);
  await db.query('insert into public.tenant_settings(tenant_id,enabled_services) values($1,$2),($3,$4)',[tenant,baseServices,second,['planning']]);
  await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[actor,`${actor}@portal-migration.fixture.test`]);
  await db.query('insert into auth.sessions(id,user_id,created_at,updated_at) values($1,$2,now(),now())',[session,actor]);
  await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['tenant_admin']::public.app_role[],'active')",[tenant,actor]);
  await t.test('old direct-postgres CTE fails 42501; exact repaired block enables only its target once',async()=>isolated(async()=>{
   await rejectStatement(backfill,[],error=>error.code==='42501'&&/Tenantkoppeling, modules en whitelabel/.test(error.message));
   assert.deepEqual((await settings(tenant)).enabled_services,baseServices);assert.equal((await audits()).length,0);
   await appliesOnce();
  }));
  await t.test('empty prior role and JSON claims are restored after success and retry',async()=>isolated(async()=>{
   await db.query("select set_config('request.jwt.claim.role','',true),set_config('request.jwt.claims','',true)");await appliesOnce();
  }));
  const claims=JSON.stringify({role:'authenticated',sub:actor,session_id:session,fixtureMarker:'preserve-this-json'});
  await t.test('nonempty prior role and JSON claims survive temporary service context',async()=>isolated(async()=>{
   await db.query("select set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claims',$1,true)",[claims]);await appliesOnce();
  }));
  await t.test('failed audit rolls back the entitlement, audit and temporary role override',async()=>isolated(async()=>{
   await db.query("select set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claims',$1,true)",[claims]);
   const before=await context(),otherBefore=await settings(second);
   await db.query("create function pg_temp.reject_workspace_portal_fixture_audit() returns trigger language plpgsql as $$ begin raise exception 'FICTITIOUS portal audit failure' using errcode='23514';end $$");
   await db.query('create trigger workspace_portal_fixture_audit before insert on public.audit_events for each row execute function pg_temp.reject_workspace_portal_fixture_audit()');
   await rejectStatement(block,[],error=>error.code==='23514'&&error.message==='FICTITIOUS portal audit failure');
   await unchangedContext(before);assert.deepEqual((await settings(tenant)).enabled_services,baseServices);assert.equal((await audits()).length,0);assert.deepEqual(await settings(second),otherBefore);
  }));
  await t.test('ordinary authenticated owner still cannot alter platform entitlements',async()=>isolated(async()=>{
   await db.query('set local role authenticated');await db.query("select set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claims',$1,true)",[claims]);
   assert.equal((await db.query('select tenant_id from public.tenant_settings where tenant_id=$1',[tenant])).rows.length,1);
   await rejectStatement('update public.tenant_settings set enabled_services=array_append(enabled_services,$2) where tenant_id=$1',[tenant,portalModule],error=>error.code==='42501'&&/Tenantkoppeling, modules en whitelabel/.test(error.message));
   assert.deepEqual((await settings(tenant)).enabled_services,baseServices);
  }));
 }finally{await db.query('rollback');await db.end();}
});
