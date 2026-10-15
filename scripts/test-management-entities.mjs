import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {workOrderTestDatabase} from './work-order-test-target.mjs';
import {slaFixture,seedSlaFixture} from './fixtures/management-sla.mjs';

test('Entity source: native invoker resource authority, bounded metadata and no HR/financial payload',async t=>{
 const db=await workOrderTestDatabase(),f=slaFixture();await db.query('begin');
 const asActor=async(sql,args,actor=f.owner,role='authenticated')=>{
  await db.query('savepoint entity_call');
  try{
   await db.query(`set local role ${role}`);
   await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify(role==='service_role'?{role}:{role,sub:actor,session_id:f.sessions.get(actor)})]);
   const r=await db.query(sql,args);
   await db.query('reset role');await db.query("select set_config('request.jwt.claims','{}',true)");await db.query('release savepoint entity_call');return r.rows[0].data;
  }catch(e){await db.query('rollback to savepoint entity_call');await db.query('release savepoint entity_call');throw e}
 };
 const call=(kind,id,actor,role)=>asActor('select public.cockpit_entity_query($1,$2,$3) data',[f.tenant,kind,id],actor,role);
 try{
  await seedSlaFixture(db,f);
  const foreignCustomer=randomUUID();
  await db.query("insert into public.customers(id,tenant_id,customer_number,name) values($1,$2,'FOREIGN-ENTITY','FICTITIOUS forbidden foreign customer')",[foreignCustomer,f.foreign]);
  await t.test('customer and object refer to their actual source and native operational rows',async()=>{for(const[kind,id,name]of[['customer',f.customer,'FICTITIOUS service customer'],['object',f.object,'FICTITIOUS service site']]){const d=await call(kind,id);assert.equal(d.profile.id,id);assert.equal(d.profile.name,name);assert.equal(d.orders.length,1);assert.equal(d.orders[0].id,f.workOrder);assert.equal(d.orders[0].number,'WB-SLA');assert.equal(d.profile.kind,kind);assert.equal(d.access.work,true);assert.equal(d.access.documents,true);assert.ok(d.followup.sourceOptions.some(s=>s.id===id));assert.ok(!JSON.stringify(d.orders).includes('price_cents'))}assert.equal((await db.query("select prosecdef from pg_proc where oid='public.cockpit_entity_query(uuid,text,uuid)'::regprocedure")).rows[0].prosecdef,false)});
  await t.test('customer cards preserve every native filter, sort, count and revision with RLS metadata',async()=>{
   for(const filters of[{}, {q:'FICTITIOUS',sort:'name_desc',pageSize:10}, {status:'inactive'}]){
    const native=await asActor('select public.customer_list($1,$2) data',[f.tenant,filters]);
    const cards=await asActor('select public.cockpit_customer_cards($1,$2) data',[f.tenant,filters]);
    assert.deepEqual({...cards,rows:cards.rows.map(row=>{const native={...row};delete native.email;delete native.address;delete native.phone;return native})},native);
   }
   const outOfBounds=await asActor('select public.cockpit_customer_cards($1,$2) data',[f.tenant,{page:999}]);assert.equal(outOfBounds.page,1);assert.equal(outOfBounds.rows.length,1);
  });
  await t.test('personnel preview includes actual assigned work and omits private HR fields',async()=>{await db.query("update public.personnel set birth_date='1990-01-01',emergency_contact=$2::jsonb,home_address=$3::jsonb where id=$1",[f.person,JSON.stringify({name:'FICTITIOUS private contact'}),JSON.stringify({city:'Delft',street:'FICTITIOUS private street'})]);const d=await call('personnel',f.person);assert.equal(d.profile.name,'FICTITIOUS service employee');assert.equal(d.orders[0].id,f.workOrder);assert.deepEqual(d.profile.address,{});assert.equal(d.profile.editing,null);assert.equal(d.profile.note,'');assert.ok(!JSON.stringify(d.profile).includes('FICTITIOUS private'));assert.ok(!JSON.stringify(d.profile).includes('birth_date'))});
  await t.test('document previews expose bounded native metadata, never storage paths or fabricated content',async()=>{for(let n=0;n<23;n++)await db.query("insert into public.customer_documents(id,tenant_id,customer_id,title,file_name,mime_type,size_bytes,storage_path,sha256,created_by) values($1,$2,$3,$4,'fixture.pdf','application/pdf',1,$5,$6,$7)",[randomUUID(),f.tenant,f.customer,'FICTITIOUS metadata '+n,f.tenant+'/'+f.customer+'/'+randomUUID().replaceAll('-','')+'.pdf','a'.repeat(64),f.owner]);const d=await call('customer',f.customer);assert.equal(d.documents.length,21);assert.ok(d.documents.every(r=>r.file==='fixture.pdf'));assert.ok(!JSON.stringify(d.documents).includes('storage_path'));assert.ok(!JSON.stringify(d.documents).includes('private-storage'))});
  await t.test('revoked document and module capabilities remain independent of the base profile',async()=>{await db.query('savepoint entity_rights');await db.query("delete from private.management_role_permissions where role_id=$1 and capability='backoffice.personnel.sensitive'",[f.ownerRole]);let d=await call('personnel',f.person);assert.equal(d.access.documents,false);assert.deepEqual(d.documents,[]);await db.query("delete from private.management_role_permissions where role_id=$1 and capability='backoffice.work_orders.read'",[f.ownerRole]);d=await call('customer',f.customer);assert.equal(d.access.work,false);assert.deepEqual(d.orders,[]);await db.query("delete from private.management_role_permissions where role_id=$1 and capability='backoffice.customers.read'",[f.ownerRole]);await assert.rejects(call('customer',f.customer),e=>e.code==='42501');await db.query('rollback to savepoint entity_rights');await db.query('release savepoint entity_rights')});
  await t.test('invalid, anonymous, service, staff, foreign and expired callers fail closed; planner receives only the native safe profile',async()=>{await assert.rejects(call('unknown',f.customer),e=>e.code==='22023');for(const[actor,role]of[[f.owner,'anon'],[f.owner,'service_role'],[f.staff,'authenticated']])await assert.rejects(call('customer',f.customer,actor,role),e=>e.code==='42501');const planner=await call('personnel',f.person,f.planner);assert.equal(planner.profile.name,'FICTITIOUS service employee');assert.equal(planner.access.documents,false);assert.equal(planner.access.edit,false);assert.deepEqual(planner.documents,[]);assert.equal(planner.profile.note,'');await assert.rejects(call('customer',foreignCustomer),e=>e.code==='42501');await db.query("update auth.sessions set not_after=now()-interval '1 minute' where id=$1",[f.sessions.get(f.owner)]);await assert.rejects(call('customer',f.customer),e=>e.code==='42501')});
 }finally{await db.query('rollback');await db.end()}
});
