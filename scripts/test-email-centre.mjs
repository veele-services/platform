import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { workOrderTestDatabase } from './work-order-test-target.mjs';

test('Mail centre: Auth context, durable transport, stop and signed event storage', async t => {
 if(process.env.FIELDGRID_STAGING_SMOKE) throw Error('Draft mail tests are local only');
 const db=await workOrderTestDatabase(); await db.query('begin');
 const tenant=randomUUID(),other=randomUUID(),user=randomUUID(),slug=`mail-${tenant}`,recipient='fixture@example.test';
 const sql=async(q,p=[]) => (await db.query(q,p)).rows;
 const service=async(q,p=[])=>{
  await db.query('savepoint call'); await db.query('set local role service_role');await db.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',true)");
  try {return (await sql(q,p))[0]?.result;} catch(e){await db.query('rollback to savepoint call');throw e;} finally{await db.query('reset role');}
 };
 const context=(s=slug,a='recovery',email=recipient)=>service('select public.email_auth_context($1,$2,$3,$4) result',[s,user,email,a]);
 const transport=(op,input)=>service('select public.email_transport($1,$2) result',[op,input]);
 const begin=(key,extra={})=>transport('begin',{tenant_id:tenant,delivery_key:key,recipient,type_code:'security.auth_hook',purpose:'security',source_kind:'security',subject_label:'NEVER PERSIST THIS TOKEN',...extra});
 const receipt=(op,id,hash='a'.repeat(64))=>service('select public.email_auth_hook_receipt($1,$2,$3) result',[op,id,hash]);
 const finish=(r,outcome='accepted',provider_id='fixture-provider')=>transport('finish',{id:r.id,attempt_id:r.attempt_id,outcome,provider_id});
 try {
  for(const id of [tenant,other]) {
   await db.query("insert into public.tenants(id,slug,name) values($1,$2,'FICTITIOUS mail tenant')",[id,`mail-${id}`]);
   await db.query('insert into public.tenant_branding(tenant_id) values($1)',[id]);
  }
  await t.test('pending server invitation works before the Auth user exists, but not for other tenants or addresses',async()=>{
   await db.query("insert into public.tenant_admin_invitations(tenant_id,full_name,email) values($1,'FICTITIOUS admin',$2)",[tenant,recipient]);
   assert.equal((await context(slug,'invite')).tenant_id,tenant);
   await assert.rejects(()=>context(slug,'recovery'),e=>e.code==='42501');
   await assert.rejects(()=>context(`mail-${other}`,'invite'),e=>e.code==='42501');
   await assert.rejects(()=>context(slug,'invite','different@example.test'),e=>e.code==='42501');
  });
  await db.query("insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at) values($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,now())",[user,recipient]);
  await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['staff']::public.app_role[],'active')",[tenant,user]);
  await t.test('context comes from live membership, never the first tenant',async()=>{
   assert.equal((await context()).tenant_id,tenant);assert.equal((await context(null)).tenant_id,null);
   await assert.rejects(()=>context(`mail-${other}`),e=>e.code==='42501');
  });
  await t.test('global mail stop also blocks authentication messages',async()=>{
   await db.query("update private.email_settings set stopped=true where scope_key='platform'");
   const r=await begin('fixture-stopped');assert.equal(r.allowed,false);assert.equal(r.reason,'email_emergency_stop');
   await db.query("update private.email_settings set stopped=false where scope_key='platform'");
  });
  await t.test('tenant mail stop blocks its OTPs without blocking other tenants',async()=>{
   await db.query("insert into private.email_settings(scope_key,owner,tenant_id,stopped) values($1,'tenant',$2,true)",[`tenant:${tenant}`,tenant]);
   assert.equal((await begin('fixture-tenant-stopped')).allowed,false);
   const allowed=await begin('fixture-other',{tenant_id:other});assert.equal(allowed.allowed,true);await finish(allowed);
   await db.query('update private.email_settings set stopped=false where tenant_id=$1',[tenant]);
  });
  let accepted;
  await t.test('acceptance is persistent, duplicate attempts cannot send and logs contain no auth content',async()=>{
   accepted=await begin('fixture-accepted');assert.equal(accepted.allowed,true);assert.equal((await finish(accepted)).ok,true);
   assert.equal((await begin('fixture-accepted')).allowed,false);
   const row=(await sql('select * from private.email_transports where id=$1',[accepted.id]))[0];
   assert.equal(row.state,'accepted');assert.equal(row.subject_label,'Accountbeveiliging');assert.ok(!JSON.stringify(row).includes(recipient));
   assert.ok(!JSON.stringify(row).includes('NEVER PERSIST'));
   await assert.rejects(()=>begin('fixture-accepted',{tenant_id:other}),e=>e.code==='23514');
  });
  await t.test('uncertain attempts and expired leases cannot be replayed',async()=>{
   const r=await begin('fixture-uncertain');await finish(r,'uncertain');assert.equal((await begin('fixture-uncertain')).allowed,false);
   const expired=await begin('fixture-expired');await db.query("update private.email_transports set lease_until=now()-interval '1 minute' where id=$1",[expired.id]);
   assert.equal((await begin('fixture-expired')).allowed,false);
   assert.equal((await sql('select state from private.email_transports where id=$1',[expired.id]))[0].state,'uncertain');
  });
  await t.test('provider events bind transport, recipient and provider ID and never regress delivered to deferred',async()=>{
   const event=(id,event,extra={})=>service('select public.email_provider_event($1) result',[{transport_id:accepted.id,event_id:id,provider_id:'fixture-provider.remote',recipient,event,timestamp:Math.floor(Date.now()/1000),...extra}]);
   assert.equal(await event('wrong-recipient','delivered',{recipient:'other@example.test'}),false);
   assert.equal(await event('wrong-provider','delivered',{provider_id:'someone-else'}),false);
   assert.equal(await event('delivered','delivered'),true);assert.equal(await event('delivered','delivered'),true);
   assert.equal(await event('deferred','deferred'),true);
   assert.equal((await sql('select state from private.email_transports where id=$1',[accepted.id]))[0].state,'delivered');
   assert.equal((await sql('select count(*) from private.email_provider_events where transport_id=$1',[accepted.id]))[0].count,'2');
  });
  await t.test('hook receipts claim once, pin payload hash and store only the hash',async()=>{
   assert.equal((await receipt('begin','fixture-hook')).claimed,true);
   assert.deepEqual(await receipt('begin','fixture-hook'),{claimed:false,state:'processing'});
   assert.equal((await receipt('done','fixture-hook')).ok,true);
   assert.deepEqual(await receipt('begin','fixture-hook'),{claimed:false,state:'done'});
   await assert.rejects(()=>receipt('begin','fixture-hook','b'.repeat(64)),e=>e.code==='23514');
   await assert.rejects(()=>receipt('begin',null),e=>e.code==='23514');
   await assert.rejects(()=>receipt('begin','fixture-invalid',null),e=>e.code==='23514');
  });
  await t.test('anon and authenticated cannot read transport storage or call service-only RPCs',async()=>{
   for(const role of ['anon','authenticated']) for(const [q,p] of [
    ['select * from private.email_transports',[]],
    ['select public.email_auth_context($1,$2,$3,$4)',[slug,user,recipient,'invite']],
    ["select public.email_transport('begin','{}')",[]],
    ["select public.email_auth_hook_receipt('begin','x',repeat('a',64))",[]],
   ]) {
    await db.query('savepoint forbidden');await db.query(`set local role ${role}`);
    try {await assert.rejects(()=>db.query(q,p),e=>e.code==='42501');} finally {await db.query('rollback to savepoint forbidden');}
   }
  });
 } finally {await db.query('rollback');await db.end();}
});
