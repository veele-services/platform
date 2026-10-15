import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {workOrderTestDatabase} from './work-order-test-target.mjs';

test('Management cockpit preserves source authority, deadlines and tenant/HR boundaries',async t=>{
 const db=await workOrderTestDatabase();await db.query('begin');
 const tenant=randomUUID(),foreign=randomUUID(),owner=randomUUID(),staff=randomUUID(),planner=randomUUID(),outsider=randomUUID();
 const sessions=new Map([owner,staff,planner,outsider].map(u=>[u,randomUUID()]));const customer=randomUUID(),object=randomUUID(),record=randomUUID();
 const call=async(sql,args=[],actor=owner,role='authenticated')=>{
  await db.query('savepoint cockpit_call');try{await db.query(`set local role ${role}`);await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role,sub:actor,session_id:sessions.get(actor)})]);const result=await db.query(sql,args);await db.query('reset role');await db.query("select set_config('request.jwt.claims','{}',true)");await db.query('release savepoint cockpit_call');return result.rows[0]?.data??result.rows}
  catch(e){await db.query('rollback to savepoint cockpit_call');await db.query('release savepoint cockpit_call');throw e}
 };
 const query=(actor=owner,scope=tenant)=>call('select public.cockpit_followup($1) data',[scope],actor);
 const command=(op,input,key=randomUUID(),actor=owner)=>call('select public.cockpit_followup_command($1,$2,$3,$4) data',[tenant,op,input,key],actor);
 const history=(kind,id,actor=owner)=>call('select public.cockpit_action_history($1,$2,$3) data',[tenant,kind,id],actor);
 const denied=p=>assert.rejects(p,e=>e.code==='42501');let action;
 try{
  if(!(await db.query("select to_regclass('private.cockpit_actions') present")).rows[0].present)await db.query(readFileSync(new URL('../supabase/migrations/20261014234244_management_cockpit_followup.sql',import.meta.url),'utf8'));
  for(const user of[owner,staff,planner,outsider]){await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[user,`${user}@cockpit-fixture.invalid`]);await db.query('insert into auth.sessions(id,user_id,created_at,updated_at) values($1,$2,now(),now())',[sessions.get(user),user])}
  for(const id of[tenant,foreign]){await db.query("insert into public.tenants(id,slug,name) values($1,$2,'FICTITIOUS cockpit tenant')",[id,`cockpit-${id}`]);await db.query("insert into public.tenant_settings(tenant_id,enabled_services) values($1,array['planning','personeel','rapportage','finance'])",[id]);await db.query('select private.management_seed($1)',[id])}
  await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['tenant_admin']::public.app_role[],'active'),($1,$3,array['staff']::public.app_role[],'active'),($1,$4,array['planner']::public.app_role[],'active')",[tenant,owner,staff,planner]);
  const membership=(await db.query('select id from public.tenant_memberships where tenant_id=$1 and user_id=$2',[tenant,planner])).rows[0].id;
  await db.query("insert into private.management_members(tenant_id,membership_id,role_id,full_name,accepted_at) select $1,$2,id,'FICTITIOUS planner',now() from private.management_roles where tenant_id=$1 and code='planning'",[tenant,membership]);
  await db.query("insert into public.customers(id,tenant_id,customer_number,name) values($1,$2,'C-COCKPIT','FICTITIOUS customer')",[customer,tenant]);
  await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values($1,$2,$3,'O-COCKPIT','FICTITIOUS site','{}')",[object,tenant,customer]);
  await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:owner,session_id:sessions.get(owner),role:'authenticated'})]);
  await db.query("insert into public.object_records(id,tenant_id,object_id,kind,title,body,state,due_on,created_by) values($1,$2,$3,'task','FICTITIOUS source task','FICTITIOUS source body','active',current_date-1,$4)",[record,tenant,object,owner]);
  await db.query("select set_config('request.jwt.claims','{}',true)");
  await t.test('fresh management only, no portal/cross-tenant access or direct private-table grants',async()=>{
   for(const user of[staff,outsider])await denied(query(user));await denied(query(owner,foreign));
   for(const table of['cockpit_actions','cockpit_action_overlays','cockpit_events','cockpit_receipts'])for(const role of['anon','authenticated','service_role'])await denied(call(`select * from private.${table}`,[],owner,role));
   const q=await query();assert.ok(q.sources.some(a=>a.id===record));assert.ok(q.owners.some(o=>o.id===owner));assert.ok(!q.owners.some(o=>o.id===staff));
   assert.equal((await query(planner)).canWrite,false);await denied(command('create',{sourceKind:'object',sourceId:object,title:'FICTITIOUS forbidden',due:'2026-10-20'},randomUUID(),planner));
  });
  await t.test('new action is committed once and points to an authorized real source',async()=>{
   const payload={sourceKind:'object',sourceId:object,title:'FICTITIOUS follow-up',due:'2026-10-20',owner,scope:'general'};const key=randomUUID();action=await command('create',payload,key);
   assert.deepEqual(await command('create',payload,key),action);await assert.rejects(command('create',{...payload,title:'Different'},key),e=>e.code==='23514');
   await denied(command('create',{...payload,sourceId:randomUUID()}));await assert.rejects(command('create',{...payload,owner:outsider}),e=>e.code==='22023');
   assert.equal((await query()).actions.filter(a=>a.id===action.id).length,1);
  });
  await t.test('assign, snooze, complete and reopen preserve the original deadline and immutable events',async()=>{
   await command('assign',{kind:'manual',id:action.id,revision:1,owner:planner,note:'FICTITIOUS responsibility'});
   await command('snooze',{kind:'manual',id:action.id,revision:2,due:'2030-01-01',note:'FICTITIOUS waiting for a real source update'});
   const a=(await query()).actions.find(a=>a.id===action.id);assert.equal(a.original_due_on,'2026-10-20');assert.equal(a.due_on,'2026-10-20');assert.equal(a.snoozed_until,'2030-01-01');assert.equal(a.owner_id,planner);
   await assert.rejects(command('complete',{kind:'manual',id:action.id,revision:2,note:'FICTITIOUS stale action'}),e=>e.code==='40001');
   await command('complete',{kind:'manual',id:action.id,revision:3,note:'FICTITIOUS administrative follow-up done'});assert.equal((await query()).actions.find(a=>a.id===action.id).state,'done');
   await command('reopen',{kind:'manual',id:action.id,revision:4,note:'FICTITIOUS reopened'});assert.equal((await query()).actions.find(a=>a.id===action.id).state,'open');
   assert.equal((await db.query('select count(*)::int n from private.cockpit_events where record_id=$1',[action.id])).rows[0].n,5);
   const events=await history('manual',action.id);assert.equal(events.length,5);assert.ok(events.some(e=>e.details.note==='FICTITIOUS responsibility'));await denied(history('manual',action.id,staff));
  });
  await t.test('source assignments update the actual dossier owner without faking execution or changing its deadline',async()=>{
   const source=(await query()).sources.find(a=>a.id===record);await command('assign',{kind:'object',id:record,revision:0,sourceVersion:source.version,owner:planner,note:'FICTITIOUS actual source owner'});
   const updated=(await query()).sources.find(a=>a.id===record);assert.equal(updated.owner_id,planner);assert.equal(updated.due_on,source.due_on);assert.equal(updated.status,source.status);
   await assert.rejects(command('snooze',{kind:'object',id:record,revision:1,sourceVersion:source.version,due:'2030-01-01',note:'FICTITIOUS stale source'}),e=>e.code==='40001');
   await assert.rejects(command('complete',{kind:'object',id:record,revision:1,sourceVersion:updated.version,note:'FICTITIOUS do not execute'}),e=>e.code==='22023');
   assert.equal((await query()).sources.find(a=>a.id===record).status,source.status);
  });
  await t.test('HR action metadata stays protected independently of general follow-up access',async()=>{
   const person=randomUUID();
   await db.query("insert into public.personnel(id,tenant_id,user_id,full_name) values($1,$2,$3,'FICTITIOUS private employee')",[person,tenant,staff]);
   const hr=await command('create',{sourceKind:'personnel',sourceId:person,title:'PRIVATE-HR-COCKPIT-CANARY',due:'2026-10-20',scope:'personnel',owner});
   assert.ok((await query()).actions.some(a=>a.id===hr.id));assert.ok(!JSON.stringify(await query(planner)).includes('PRIVATE-HR-COCKPIT-CANARY'));
   await denied(history('manual',hr.id,planner));assert.equal((await history('manual',hr.id)).length,1);
   await assert.rejects(command('create',{sourceKind:'personnel',sourceId:person,title:'PRIVATE invalid classification',due:'2026-10-20',scope:'general'}),e=>e.code==='22023');
   const role=(await db.query("select id from private.management_roles where tenant_id=$1 and code='owner'",[tenant])).rows[0].id;
   await db.query("delete from private.management_role_permissions where role_id=$1 and capability='backoffice.personnel.sensitive'",[role]);
   assert.ok(!(await query()).actions.some(a=>a.id===hr.id));
   await db.query("insert into private.management_role_permissions(tenant_id,role_id,capability) values($1,$2,'backoffice.personnel.sensitive')",[tenant,role]);
  });
  await t.test('source, function and session revocation remove the same existing action',async()=>{
   const role=(await db.query("select id from private.management_roles where tenant_id=$1 and code='owner'",[tenant])).rows[0].id;
   await db.query("delete from private.management_role_permissions where role_id=$1 and capability='backoffice.objects.read'",[role]);assert.ok(!(await query()).actions.some(a=>a.id===action.id));await denied(history('manual',action.id));
   await db.query("insert into private.management_role_permissions(tenant_id,role_id,capability) values($1,$2,'backoffice.objects.read')",[tenant,role]);
   await db.query("delete from private.management_role_permissions where role_id=$1 and capability='backoffice.functions.cockpit_followup'",[role]);await denied(query());
   await db.query("insert into private.management_role_permissions(tenant_id,role_id,capability) values($1,$2,'backoffice.functions.cockpit_followup')",[tenant,role]);
   await db.query("update auth.sessions set not_after=now()-interval '1 minute' where id=$1",[sessions.get(owner)]);await denied(query());
  });
 }finally{await db.query('rollback');await db.end()}
});
