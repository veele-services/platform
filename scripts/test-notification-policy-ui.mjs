import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { workOrderTestDatabase } from './work-order-test-target.mjs';

test('Tenant policy UI contract: configuration-only platform scope, reload and exact CAS', async t => {
 const db=await workOrderTestDatabase();await db.query('begin');
 const tenant=randomUUID(),other=randomUUID(),actor=randomUUID(),session=randomUUID();
 const invoke=async(name,args)=>{
  await db.query('savepoint policy_ui_call');
  try{
   await db.query('set local role authenticated');
   await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role:'authenticated',sub:actor,session_id:session})]);
   const result=await db.query(name,args);await db.query('reset role');await db.query("select set_config('request.jwt.claims','{}',true)");await db.query('release savepoint policy_ui_call');return result.rows[0]?.data;
  }catch(error){await db.query('rollback to savepoint policy_ui_call');await db.query('release savepoint policy_ui_call');throw error;}
 };
 const query=(operation,payload={})=>invoke("select public.notification_query(null,'platform',$1,$2) data",[operation,payload]);
 const impactAtStableSnapshot=async(payload={})=>{
  // READ COMMITTED is required for the later shared policy-revision writes.
  // Keep the actual authenticated RPC boundary, but compare global counts only
  // across an unchanged MVCC snapshot. Parallel fixture commits may otherwise
  // change the correct answer between two separate client queries.
  const count=async()=>(await db.query("select pg_current_snapshot()::text snapshot,count(*)::int active_count from public.tenants where status='active'")).rows[0];
  for(let attempt=0;attempt<20;attempt++){
   const before=await count(),data=await query('rules',payload),after=await count();
   if(before.snapshot!==after.snapshot)continue;
   assert.equal(after.active_count,before.active_count);
   assert.equal(data.impact.global_active_tenant_count,after.active_count);
   return {data,expected:after.active_count};
  }
  throw new Error('No stable fixture snapshot for exact tenant-impact comparison');
 };
 const save=payload=>invoke("select public.notification_command(null,'platform','policy_save',$1,$2) data",[payload,randomUUID()]);
 let saved;
 try{
  await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[actor,`${actor}@policy-fixture.invalid`]);
  await db.query('insert into auth.sessions(id,user_id,created_at,updated_at) values($1,$2,now(),now())',[session,actor]);
  for(const [id,label] of [[tenant,'Allowed configuration fixture'],[other,'OTHER-TENANT-CANARY']]){
   await db.query('insert into public.tenants(id,slug,name) values($1,$2,$3)',[id,`policy-${id}`,label]);
   await db.query("insert into public.tenant_settings(tenant_id,enabled_services) values($1,array['planning'])",[id]);
  }
  await db.query("insert into public.permission_grants(user_id,capability,scope) values($1,'platform.notifications.manage_tenant',$2)",[actor,{tenant_ids:[tenant]}]);
  await db.query("insert into private.notification_policies(scope,context,type_code,channel,mode) values('platform','staff','announcement.published','push','inherit') on conflict do nothing");

  await t.test('selector exposes only authorized tenant; no admin, membership or content grants',async()=>{
   const access=await query('access');assert.equal(access.allowed,true);assert.equal(access.permissions.manage_tenant,true);assert.equal(access.permissions.manage_global,false);assert.equal(access.permissions.send_platform,false);assert.equal(access.permissions.sent_read,false);
   assert.equal((await db.query('select count(*)::int n from public.platform_admins where user_id=$1',[actor])).rows[0].n,0);
   assert.equal((await db.query('select count(*)::int n from public.tenant_memberships where user_id=$1',[actor])).rows[0].n,0);
   const initial=await query('rules');assert.deepEqual(initial.tenants.map(x=>x.id),[tenant]);assert.ok(initial.policies.every(p=>p.tenant_id===null&&p.permissions.edit===false));
   assert.equal(initial.impact.global_active_tenant_count,null);
   assert.ok(!JSON.stringify(initial).includes('OTHER-TENANT-CANARY'));
   const selected=await query('rules',{tenant_id:tenant});const virtual=selected.policies.find(p=>p.tenant_id===tenant&&p.id===null);
   assert.deepEqual(selected.impact,{active_tenant_count:1,global_active_tenant_count:null});
   assert.ok(virtual);assert.equal(virtual.revision,0);assert.equal(virtual.mode,'inherit');assert.equal(virtual.permissions.edit,true);assert.ok(selected.policies.filter(p=>p.tenant_id===null).every(p=>p.permissions.edit===false));
   for(const operation of ['campaigns','recipients','templates','deliveries'])await assert.rejects(query(operation,{criteria:{kind:'management',tenant_ids:[tenant]}}),error=>error.code==='42501');
   await assert.rejects(query('rules',{tenant_id:other}),error=>error.code==='42501');
  });
  await t.test('global impact counts every active tenant without expanding tenant names or content scope',async()=>{
   await db.query('savepoint policy_impact');
   try{
    await db.query("insert into public.permission_grants(user_id,capability,scope) values($1,'platform.notifications.manage_global','{\"all\":true}')",[actor]);
    const {data:global,expected}=await impactAtStableSnapshot();assert.ok(expected>=2);assert.deepEqual(global.impact,{active_tenant_count:expected,global_active_tenant_count:expected});
    assert.deepEqual(global.tenants.map(x=>x.id),[tenant]);assert.ok(!JSON.stringify(global).includes('OTHER-TENANT-CANARY'));
    const {data:selected,expected:selectedExpected}=await impactAtStableSnapshot({tenant_id:tenant});assert.deepEqual(selected.impact,{active_tenant_count:1,global_active_tenant_count:selectedExpected});
    await assert.rejects(query('rules',{tenant_id:other}),error=>error.code==='42501');
    await assert.rejects(query('campaigns'),error=>error.code==='42501');
    await db.query("update public.tenants set status='suspended' where id=$1",[other]);
    const {data:suspended,expected:suspendedExpected}=await impactAtStableSnapshot();assert.equal(suspended.impact.active_tenant_count,suspendedExpected);
    assert.equal((await db.query("select count(*)::int n from public.tenants where id=$1 and status='active'",[other])).rows[0].n,0);
    // Backoffice is separately authorized; its projection counts only its own
    // organization. The savepoint removes this temporary membership and grant.
    const membership=(await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['planner']::public.app_role[],'active') returning id",[tenant,actor])).rows[0].id;
    await db.query("insert into public.permission_grants(tenant_id,user_id,membership_id,capability,scope) values($1,$2,$3,'notifications.settings.manage','{\"all\":true}')",[tenant,actor,membership]);
    const own=await invoke("select public.notification_query($1,'backoffice','rules','{}') data",[tenant]);assert.equal(own.impact.active_tenant_count,1);assert.ok(!JSON.stringify(own).includes('OTHER-TENANT-CANARY'));
   }finally{await db.query('rollback to savepoint policy_impact');await db.query('release savepoint policy_impact');}
   assert.equal((await query('rules')).impact.global_active_tenant_count,null);
  });
  await t.test('save survives reload, exact row is editable and stale CAS cannot overwrite',async()=>{
   const payload={scope:'platform',tenant_id:tenant,context:'staff',type_code:'announcement.published',channel:'push',mode:'off',expected_revision:0,reason:'Fictitious policy UI save'};
   saved=await save(payload);assert.ok(saved.id);assert.equal(saved.revision,1);
   const reloaded=await query('rules',{tenant_id:tenant});const row=reloaded.policies.find(p=>p.id===saved.id);
   assert.ok(row);assert.equal(row.tenant_id,tenant);assert.equal(row.scope,'platform');assert.equal(row.context,'staff');assert.equal(row.type_code,'announcement.published');assert.equal(row.channel,'push');assert.equal(row.mode,'off');assert.equal(row.revision,1);assert.equal(row.permissions.edit,true);assert.equal(row.effective,false);
   saved=await save({...payload,id:row.id,expected_revision:row.revision,mode:'on',reason:'Fictitious exact re-edit'});assert.equal(saved.revision,2);
   await assert.rejects(save({...payload,id:row.id,expected_revision:row.revision,reason:'Fictitious stale editor'}),error=>error.code==='40001');
   const again=(await query('rules',{tenant_id:tenant})).policies.find(p=>p.id===row.id);assert.equal(again.mode,'on');assert.equal(again.revision,2);
   await assert.rejects(save({...payload,id:row.id,expected_revision:2,context:'customer'}),error=>error.code==='23514');
  });
  await t.test('other tenant, global scope and tenant-owned policies remain denied',async()=>{
   const base={scope:'platform',expected_revision:0,mode:'off',reason:'Fictitious forbidden change'};
   await assert.rejects(save({...base,tenant_id:other}),error=>error.code==='42501');
   await assert.rejects(save({...base,tenant_id:null}),error=>error.code==='42501');
   await assert.rejects(save({...base,scope:'tenant',tenant_id:tenant}),error=>error.code==='42501');
   const tenantOwned=(await db.query("insert into private.notification_policies(tenant_id,scope,mode) values($1,'tenant','inherit') returning id",[tenant])).rows[0].id;
   assert.equal((await query('rules',{tenant_id:tenant})).policies.find(p=>p.id===tenantOwned).permissions.edit,false);
   await db.query("update public.permission_grants set enabled=false where user_id=$1 and capability='platform.notifications.manage_tenant'",[actor]);
   await assert.rejects(query('rules',{tenant_id:tenant}),error=>error.code==='42501');
  });
 }finally{await db.query('rollback');await db.end();}
});
