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

test('Auth mail uses current customer identity before the first object and after revocation', async t => {
 if(process.env.FIELDGRID_STAGING_SMOKE) throw Error('Draft mail tests are local only');
 const db=await workOrderTestDatabase();await db.query('begin');
 const tenant=randomUUID(),other=randomUUID(),user=randomUUID(),stranger=randomUUID();
 const customer=randomUUID(),contact=randomUUID(),account=randomUUID(),object=randomUUID();
 const slug=`auth-customer-${tenant}`,recipient=`${user}@example.test`;
 const context=async({target=slug,actor=user,email=recipient,action='magiclink',role='service_role'}={})=>{
  await db.query('savepoint customer_auth_call');
  try{
   await db.query(`set local role ${role}`);
   await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role,sub:actor})]);
   return (await db.query('select public.email_auth_context($1,$2,$3,$4) result',[target,actor,email,action])).rows[0].result;
  }finally{
   await db.query('rollback to savepoint customer_auth_call');
   await db.query('release savepoint customer_auth_call');
  }
 };
 const denied=input=>assert.rejects(()=>context(input),error=>error.code==='42501');
 const changed=async(sql,args,assertion)=>{
  await db.query('savepoint customer_auth_change');
  try{await db.query(sql,args);await assertion();}
  finally{await db.query('rollback to savepoint customer_auth_change');await db.query('release savepoint customer_auth_change');}
 };
 try{
  for(const id of [tenant,other]){
   await db.query("insert into public.tenants(id,slug,name) values($1,$2,'FICTITIOUS customer mail tenant')",[id,`auth-customer-${id}`]);
   await db.query("insert into public.tenant_branding(tenant_id,primary_color,accent_color) values($1,'#123456','#ABCDEF')",[id]);
  }
  for(const id of [user,stranger])await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,`${id}@example.test`]);
  await db.query("insert into public.customers(id,tenant_id,customer_number,name) values($1,$2,$1::uuid::text,'FICTITIOUS customer')",[customer,tenant]);
  await db.query("insert into public.customer_contacts(id,tenant_id,customer_id,full_name,email) values($1,$2,$3,'FICTITIOUS contact',$4)",[contact,tenant,customer,recipient]);
  await db.query('insert into public.customer_portal_accounts(id,tenant_id,customer_id,user_id,contact_id) values($1,$2,$3,$4,$5)',[account,tenant,customer,user,contact]);
  await t.test('an active explicit customer without membership, object or session receives its tenant brand',async()=>{
   for(const table of ['tenant_memberships','object_customer_bindings','auth.sessions']){
    const qualified=table.includes('.')?table:`public.${table}`;
    assert.equal((await db.query(`select count(*) from ${qualified} where user_id=$1`,[user])).rows[0].count,'0');
   }
   assert.deepEqual(await context(),{tenant_id:tenant,company:'FICTITIOUS customer mail tenant',primary:'#123456',accent:'#ABCDEF',logo:false});
  });
  await t.test('a matching contact email cannot substitute for the bound user or tenant',async()=>{
   await denied({actor:stranger});
   await denied({target:`auth-customer-${other}`});await denied({target:'missing-auth-customer'});
  });
  await t.test('signed account events keep branding while an Auth email change is not yet committed',async()=>{
   for(const action of ['email_change','email_changed_notification']){
    assert.equal((await context({action,email:'pending-new-address@example.test'})).tenant_id,tenant);
   }
   assert.equal((await db.query('select email from auth.users where id=$1',[user])).rows[0].email,recipient);
  });
  await t.test('signed activation events can precede email confirmation while login and recovery remain denied',async()=>{
   await changed('update auth.users set email_confirmed_at=null where id=$1',[user],async()=>{
    for(const action of ['signup','invite','email_change','email_changed_notification']){
     assert.equal((await context({action,email:'pending-new-address@example.test'})).tenant_id,tenant);
    }
    for(const action of ['magiclink','email','recovery','reauthentication'])await denied({action});
   });
  });
  await t.test('inactive customer, contact or tenant and out-of-date contacts cannot authorize a code',async()=>{
   for(const status of ['inactive','archived','draft'])await changed('update public.customers set status=$1 where id=$2',[status,customer],()=>denied());
   await changed('update public.customer_contacts set active=false where id=$1',[contact],()=>denied());
   await changed("update public.customer_contacts set active_from=(clock_timestamp() at time zone 'Europe/Amsterdam')::date+1 where id=$1",[contact],()=>denied());
   await changed("update public.customer_contacts set active_until=(clock_timestamp() at time zone 'Europe/Amsterdam')::date-1 where id=$1",[contact],()=>denied());
   await changed("update public.tenants set status='suspended' where id=$1",[tenant],()=>denied());
  });
  await t.test('deleted, banned, anonymous or unconfirmed Auth identities cannot authorize a code',async()=>{
   for(const assignment of ["deleted_at=clock_timestamp()","banned_until=clock_timestamp()+interval '1 hour'",'is_anonymous=true','email_confirmed_at=null']){
    await changed(`update auth.users set ${assignment} where id=$1`,[user],()=>denied());
   }
  });
  await t.test('an inactive account remains denied even while an old object binding remains active',async()=>{
   await changed('update public.customer_portal_accounts set active=false where id=$1',[account],()=>denied());
   await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values($1,$2,$3,$1::uuid::text,'FICTITIOUS legacy object','{}')",[object,tenant,customer]);
   await db.query('insert into public.object_customer_bindings(tenant_id,object_id,user_id,created_by) values($1,$2,$3,$3)',[tenant,object,user]);
   await changed('update public.customer_portal_accounts set active=false where id=$1',[account],async()=>{
    assert.equal((await db.query('select active from public.object_customer_bindings where object_id=$1 and user_id=$2',[object,user])).rows[0].active,true);
    await denied();
   });
   assert.equal((await context()).tenant_id,tenant);
  });
  await t.test('anonymous and authenticated callers cannot obtain customer Auth mail context',async()=>{
   await denied({role:'anon'});await denied({role:'authenticated'});
  });
 }finally{await db.query('rollback');await db.end();}
});
