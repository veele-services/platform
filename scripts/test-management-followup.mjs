import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {workOrderTestDatabase} from './work-order-test-target.mjs';

test('Planning followup uses price-free operational inputs without widening invoker dossier sources',async t=>{
 const db=await workOrderTestDatabase(),tenant=randomUUID(),foreign=randomUUID(),actor=randomUUID(),session=randomUUID();
 const customer=randomUUID(),object=randomUUID(),order=randomUUID(),task=randomUUID();
 const call=async(sql,params=[])=>{
  await db.query('savepoint followup_actor');
  try{
   await db.query('set local role authenticated');
   await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:actor,session_id:session,role:'authenticated'})]);
   const rows=(await db.query(sql,params)).rows;
   await db.query('reset role');await db.query("select set_config('request.jwt.claims','{}',true)");await db.query('release savepoint followup_actor');return rows;
  }catch(error){await db.query('rollback to savepoint followup_actor');await db.query('release savepoint followup_actor');throw error;}
 };
 await db.query('begin');
 try{
  await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[actor,`${actor}@followup.example.test`]);
  await db.query('insert into auth.sessions(id,user_id,created_at,updated_at) values($1,$2,now(),now())',[session,actor]);
  for(const id of [tenant,foreign]){
   await db.query("insert into public.tenants(id,slug,name) values($1,$2,'Fictieve operationele test')",[id,`followup-${id}`]);
   await db.query("insert into public.tenant_settings(tenant_id,enabled_services) values($1,array['planning','personeel'])",[id]);
   await db.query('select private.management_seed($1)',[id]);
  }
  const membership=(await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['management','planner','finance','hr']::public.app_role[],'active') returning id",[tenant,actor])).rows[0].id;
  const role=(await db.query("select id from private.management_roles where tenant_id=$1 and code='planning'",[tenant])).rows[0].id;
  await db.query("insert into private.management_members(tenant_id,membership_id,role_id,full_name,accepted_at) values($1,$2,$3,'Fictieve planner',now())",[tenant,membership,role]);
  await db.query("insert into public.customers(id,tenant_id,customer_number,name) values($1,$2,'C-FOLLOWUP','Fictieve klant')",[customer,tenant]);
  await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values($1,$2,$3,'O-FOLLOWUP','Fictief object','{}')",[object,tenant,customer]);
  await db.query("insert into public.work_orders(id,tenant_id,customer_id,object_id,work_order_number,title,discipline,status,commercial_terms,created_by) values($1,$2,$3,$4,'W-FOLLOWUP','Operationele bon','Onderhoud','planned',$5,$6)",[order,tenant,customer,object,{private_price_canary:987654321},actor]);
  await db.query("insert into public.work_order_tasks(id,tenant_id,work_order_id,task_code,task_name,duration_minutes,unit,unit_price_cents,vat_basis_points) values($1,$2,$3,'T-FOLLOWUP','Zichtbare uitvoering',30,'task',987654321,2100)",[task,tenant,order]);
  const chain=async(scope=tenant,targetOrder=null)=>(await call('select public.dossier_chain($1,null,null,null,$2) data',[scope,targetOrder]))[0].data;
  await t.test('raw financial rows stay closed while a real operational action remains visible',async()=>{
   assert.deepEqual(await call('select id from public.work_orders where tenant_id=$1',[tenant]),[]);
   assert.deepEqual(await call('select id from public.work_order_tasks where tenant_id=$1',[tenant]),[]);
   const data=await chain();assert.equal(data.actions.filter(row=>row.kind==='execution'&&row.id===task).length,1);
   assert(!JSON.stringify(data).includes('987654321'));assert(!JSON.stringify(data).includes('private_price_canary'));
   assert.equal((await chain(tenant,order)).actions[0].id,task);
  });
  await t.test('read-only commercial and customer functions cannot create visits or publish documents',async()=>{
   const denied=error=>error.code==='42501'&&error.message==='Je rol geeft geen toegang tot deze functie.';
   await assert.rejects(call('select public.commercial_next_visit($1,$2,current_date,$3)',[tenant,randomUUID(),randomUUID()]),denied);
   await assert.rejects(call("select public.customer_document_metadata($1,$2,1,'general','portal',null,false)",[tenant,randomUUID()]),denied);
  });
  await t.test('helpers expose only safe columns and keep other tenant rows unavailable',async()=>{
   const orders=await call('select * from private.management_dossier_orders($1)',[tenant]);
   assert.deepEqual(Object.keys(orders[0]).sort(),['customer_id','id','object_id','projected_end_at','tenant_id']);
   const tasks=await call('select * from private.management_dossier_tasks($1)',[tenant]);
   assert.deepEqual(Object.keys(tasks[0]).sort(),['completed_at','execution_state','execution_version','id','task_name','tenant_id','work_order_id']);
   assert.deepEqual(await call('select * from private.management_dossier_orders($1)',[foreign]),[]);
   await assert.rejects(chain(foreign),error=>error.code==='42501');
  });
  await t.test('function, module and session revocation stop the same authenticated caller',async()=>{
   for(const capability of ['backoffice.functions.work_order_operational_task_data','backoffice.work_orders.read']){
    await db.query('delete from private.management_role_permissions where role_id=$1 and capability=$2',[role,capability]);
    assert.equal((await chain()).actions.filter(row=>row.kind==='execution').length,0);
    await db.query('insert into private.management_role_permissions(tenant_id,role_id,capability) values($1,$2,$3)',[tenant,role,capability]);
   }
   await db.query("update auth.sessions set not_after=now()-interval '1 minute' where id=$1",[session]);
   await assert.rejects(chain(),error=>error.code==='42501');
  });
 }finally{await db.query('rollback');await db.end();}
});
