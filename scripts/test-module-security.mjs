import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {workOrderTestDatabase} from './work-order-test-target.mjs';

test('platform entitlements remain authoritative through direct APIs and projected workspaces',async t=>{
 const db=await workOrderTestDatabase();
 const [tenant,emptyTenant,manager,staff,person,customer,object,order,assignment,report,file,time,dispatchOrder,dispatchAssignment,otherOrder]=Array.from({length:15},()=>randomUUID());
 const sessions=new Map([manager,staff].map(id=>[id,randomUUID()]));
 const all=['planning','personeel','rapportage','finance'];
 const call=async(sql,args=[],actor=manager)=>{
  await db.query('savepoint actor_call');
  try{
   await db.query('set local role authenticated');
   await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:actor,session_id:sessions.get(actor),role:'authenticated'})]);
   const result=await db.query(sql,args);
   await db.query('reset role');await db.query("select set_config('request.jwt.claims','{}',true)");
   await db.query('release savepoint actor_call');return result.rows;
  }catch(error){await db.query('rollback to savepoint actor_call');await db.query('release savepoint actor_call');throw error;}
 };
 const modules=async enabled=>{
  await db.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',true)");
  await db.query('update public.tenant_settings set enabled_services=$1 where tenant_id=$2',[enabled,tenant]);
  await db.query("select set_config('request.jwt.claims','{}',true)");
 };
 const check=async(name,fn)=>t.test(name,async()=>{
  await db.query('savepoint scenario');try{await fn();}finally{await db.query('rollback to savepoint scenario');await db.query('release savepoint scenario');}
 });
 const workspace=async()=>(await call('select public.staff_workspace($1) data',[tenant],staff))[0].data;
 const dossier=async()=>(await call('select public.work_order_dossier($1,$2) data',[tenant,order]))[0].data;
 try{
  await db.query('begin');
  for(const user of [manager,staff]){
   await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[user,`${user}@module-security.test`]);
   await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sessions.get(user),user]);
  }
  for(const id of [tenant,emptyTenant]){
   await db.query("insert into public.tenants(id,slug,name) values($1,$2,'FICTITIOUS module boundary')",[id,`module-${id}`]);
   await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['tenant_admin','management','planner','finance']::public.app_role[],'active')",[id,manager]);
  }
  await db.query('insert into public.tenant_settings(tenant_id,enabled_services) values($1,$2)',[tenant,all]);
  await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['staff']::public.app_role[],'active')",[tenant,staff]);
  await db.query("insert into public.personnel(id,tenant_id,user_id,full_name) values($1,$2,$3,'FICTITIOUS employee')",[person,tenant,staff]);
  await db.query("insert into public.customers(id,tenant_id,customer_number,name) values($1,$2,$3,'FICTITIOUS customer')",[customer,tenant,`C-${customer}`]);
  await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values($1,$2,$3,$4,'FICTITIOUS object','{}')",[object,tenant,customer,`O-${object}`]);
  for(const [index,id] of [order,dispatchOrder,otherOrder].entries())await db.query("insert into public.work_orders(id,tenant_id,customer_id,object_id,work_order_number,discipline,status,created_by,planned_start_at,planned_end_at,projected_start_at,projected_end_at) values($1,$2,$3,$4,$5,'Test','planned',$6,now()+($7-1)*interval '1 hour',now()+($7+1)*interval '1 hour',now()+($7-1)*interval '1 hour',now()+($7+1)*interval '1 hour')",[id,tenant,customer,object,`W-${id}`,manager,index*4]);
  for(const [id,w] of [[assignment,order],[dispatchAssignment,dispatchOrder]])await db.query("insert into public.work_order_assignments(id,tenant_id,work_order_id,personnel_id,status,planned_start_at,planned_end_at,projected_start_at,projected_end_at) select $1,$2,w.id,$4,'planned',w.planned_start_at,w.planned_end_at,w.projected_start_at,w.projected_end_at from public.work_orders w where w.id=$3",[id,tenant,w,person]);
  await db.query('insert into public.dispatches(tenant_id,work_order_id,assignment_id,dispatched_by,idempotency_key) values($1,$2,$3,$4,$5)',[tenant,order,assignment,manager,`fixture-${randomUUID()}`]);
  await db.query("update public.work_orders set status='in_progress' where id=$1",[order]);
  await db.query("update public.work_order_assignments set status='in_progress' where id=$1",[assignment]);
  await db.query("insert into public.report_entries(id,tenant_id,work_order_id,author_user_id,body) values($1,$2,$3,$4,'FICTITIOUS REPORT CANARY')",[report,tenant,order,staff]);
  await db.query("insert into public.attachments(id,tenant_id,work_order_id,report_entry_id,uploaded_by,storage_bucket,storage_path,file_name,mime_type,size_bytes,sha256) values($1,$2,$3,$4,$5,'reports',$6,'FICTITIOUS.png','image/png',100,$7)",[file,tenant,order,report,staff,`${tenant}/${order}/${report}/${file}.png`,'a'.repeat(64)]);
  await db.query("insert into public.time_entries(id,tenant_id,personnel_id,assignment_id,kind,starts_at,ends_at,status) values($1,$2,$3,$4,'work',now()-interval '30 minutes',now(),'draft')",[time,tenant,person,assignment]);

  await check('tenant cannot delete and replace its platform-controlled settings',async()=>{
   await assert.rejects(call('delete from public.tenant_settings where tenant_id=$1 returning tenant_id',[tenant]),e=>e.code==='42501');
   assert.equal((await db.query('select count(*)::int n from public.tenant_settings where tenant_id=$1',[tenant])).rows[0].n,1);
  });
  await check('tenant cannot insert privileged settings for an existing tenant without a settings row',async()=>{
   await assert.rejects(call('insert into public.tenant_settings(tenant_id,enabled_services,white_label_enabled) values($1,$2,true)',[emptyTenant,all]),e=>e.code==='42501');
   assert.equal((await db.query('select count(*)::int n from public.tenant_settings where tenant_id=$1',[emptyTenant])).rows[0].n,0);
  });
  await check('tenant cannot move an entitlement row to another tenant it also manages',async()=>{
   await assert.rejects(call('update public.tenant_settings set tenant_id=$1 where tenant_id=$2',[emptyTenant,tenant]),e=>e.code==='42501');
  });
  await check('ordinary tenant settings remain writable; entitlements require the platform path',async()=>{
   assert.equal((await call("update public.tenant_settings set personnel_number_prefix='FICTITIOUS-' where tenant_id=$1 returning personnel_number_prefix",[tenant]))[0].personnel_number_prefix,'FICTITIOUS-');
   await assert.rejects(call('update public.tenant_settings set white_label_enabled=true where tenant_id=$1',[tenant]),e=>e.code==='42501');
   await modules(['personeel']);assert.deepEqual((await db.query('select enabled_services from public.tenant_settings where tenant_id=$1',[tenant])).rows[0].enabled_services,['personeel']);
  });
  await check('disabled planning hides operational staff data but preserves own HR workspace',async()=>{
   assert.deepEqual((await workspace()).reports.map(x=>x.id),[report]);
   await modules(['personeel','rapportage']);
   const data=await workspace();assert.deepEqual(data.personnel.map(x=>x.id),[person]);assert.deepEqual(data.timeEntries.map(x=>x.id),[time]);
   for(const key of ['customers','objects','workOrders','assignments','workOrderTasks','tasks','taskRevisions','openShifts','shiftInterests','allowedExtraWork','travelLegs'])assert.deepEqual(data[key],[],key);
   await modules(all);assert((await workspace()).workOrders.some(x=>x.id===order));
  });
  await check('disabled reporting hides staff reports, files and rules without hiding its planning',async()=>{
   await modules(['personeel','planning']);const data=await workspace();assert(data.workOrders.some(x=>x.id===order));
   for(const key of ['reports','attachments','signatures','extraWorkRules','allowedExtraWork'])assert.deepEqual(data[key],[],key);
   assert.equal((await db.query('select body from public.report_entries where id=$1',[report])).rows[0].body,'FICTITIOUS REPORT CANARY');
   await modules(all);assert.deepEqual((await workspace()).reports.map(x=>x.id),[report]);
  });
  await check('work-order dossier keeps planning but no disabled reporting or personnel rows',async()=>{
   const before=await dossier();assert.deepEqual(before.reports.map(x=>x.id),[report]);assert.deepEqual(before.times.map(x=>x.id),[time]);
   await modules(['planning']);const data=await dossier();assert.equal(data.order.id,order);
   for(const key of ['reports','attachments','times'])assert.deepEqual(data[key],[],key);assert.equal(data.canReview,false);
   assert(data.assignments.some(x=>x.id===assignment));
   await modules(all);assert.deepEqual((await dossier()).times.map(x=>x.id),[time]);
  });
  await check('work-order lists and dossiers cannot summarize disabled invoice or signature sources',async()=>{
   const task=randomUUID(),invoice=randomUUID(),version=randomUUID(),signature=randomUUID();
   await db.query("insert into public.work_order_tasks(id,tenant_id,work_order_id,task_code,task_name,duration_minutes,quantity,unit,unit_price_cents,vat_basis_points,executed_quantity,completed_at,execution_state) values($1,$2,$3,'MODULE','FICTITIOUS completed task',15,1,'stuk',100,2100,1,now(),'completed')",[task,tenant,order]);
   await db.query("update public.work_orders set status='invoice_ready' where id=$1",[order]);
   await db.query('insert into public.invoices(id,tenant_id,customer_id,created_by) values($1,$2,$3,$4)',[invoice,tenant,customer,manager]);
   await db.query("insert into public.invoice_lines(tenant_id,invoice_id,work_order_id,work_order_task_id,description,quantity,unit,unit_price_cents,subtotal_cents,vat_basis_points,vat_cents,total_cents) values($1,$2,$3,$4,'FICTITIOUS invoice',1,'stuk',100,0,2100,0,0)",[tenant,invoice,order,task]);
   await db.query("insert into public.work_order_report_versions(id,tenant_id,work_order_id,version,snapshot,content_hash,signature_policy,state,created_by,submission_key) values($1,$2,$3,1,'{}',$4,'{\"mode\":\"required\"}','approved',$5,$6)",[version,tenant,order,'e'.repeat(64),staff,randomUUID()]);
   await db.query("insert into public.signatures(id,tenant_id,work_order_id,report_id,captured_by,captured_by_name,signer_name,signer_capacity,storage_path,sha256,report_version,content_hash,signature_kind,channel) values($1,$2,$3,$4,$5,'FICTITIOUS employee','FICTITIOUS customer','FICTITIOUS signer',$6,$7,1,$8,'customer','personnel_app_on_site')",[signature,tenant,order,version,staff,`${tenant}/${order}/${signature}.png`,'f'.repeat(64),'e'.repeat(64)]);
   const list=async filters=>(await call('select public.work_order_list($1,$2) data',[tenant,filters]))[0].data;
   const before=await dossier();assert.equal(before.order.billingState,'partial');assert.equal(before.order.signatureState,'signed');
   assert.equal((await list({billing:'partial'})).total,1);
   await modules(['planning','personeel']);
   assert.equal((await call('select id from public.invoice_lines where work_order_id=$1',[order])).length,0);
   assert.equal((await call('select id from public.signatures where work_order_id=$1',[order])).length,0);
   const hidden=await dossier();assert.equal(hidden.order.billingState,'unavailable');assert.equal(hidden.order.signatureState,'unavailable');
   const row=(await list({})).rows.find(x=>x.id===order);assert.equal(row.billingState,'unavailable');assert.equal(row.signatureState,'unavailable');
   assert.equal((await list({billing:'partial'})).total,0);
   await modules(['planning','personeel','rapportage']);assert.equal((await dossier()).order.signatureState,'signed');assert.equal((await dossier()).order.billingState,'unavailable');
   await modules(all);assert.equal((await dossier()).order.billingState,'partial');assert.equal((await list({billing:'partial'})).total,1);
   assert.equal((await db.query('select count(*)::int n from public.signatures where id=$1',[signature])).rows[0].n,1);
  });
  await check('dispatch retry cannot bypass disabled planning or substitute its target',async()=>{
   const version=(await db.query('select version from public.work_orders where id=$1',[dispatchOrder])).rows[0].version;
   const key=`dispatch-${randomUUID()}`;
   const dispatch=(w=dispatchOrder,p=person,v=version)=>call('select (public.dispatch_work_order($1,$2,$3,$4)).id id',[w,p,v,key]);
   assert.equal((await dispatch())[0].id,dispatchOrder);assert.equal((await dispatch())[0].id,dispatchOrder);
   await assert.rejects(dispatch(otherOrder),e=>e.code==='23505');
   await assert.rejects(dispatch(dispatchOrder,randomUUID()),e=>e.code==='23505');
   await modules(['personeel','rapportage']);await assert.rejects(dispatch(),e=>e.code==='42501');
   assert.equal((await db.query('select count(*)::int n from public.dispatches where tenant_id=$1 and idempotency_key=$2',[tenant,key])).rows[0].n,1);
  });
  await check('dispatch module and version checks apply even to a known historical key',async()=>{
   const oldKey=(await db.query('select idempotency_key from public.dispatches where work_order_id=$1',[order])).rows[0].idempotency_key;
   const retry=(v=1)=>call('select (public.dispatch_work_order($1,$2,$3,$4)).id id',[order,person,v,oldKey]);
   assert.equal((await retry())[0].id,order);
   await assert.rejects(retry(null),e=>e.code==='23514');
   await modules(['personeel','rapportage']);await assert.rejects(retry(),e=>e.code==='42501');
   assert.equal((await db.query('select count(*)::int n from public.dispatches where work_order_id=$1',[order])).rows[0].n,1);
   assert.equal((await db.query('select count(*)::int n from public.status_events where work_order_id=$1',[order])).rows[0].n,0);
  });
 }finally{await db.query('rollback');await db.end();}
});
