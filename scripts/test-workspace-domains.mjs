import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
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
