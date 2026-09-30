import assert from "node:assert/strict";
import { workOrderTestDatabase } from "./work-order-test-target.mjs";

if (process.env.FIELDGRID_STAGING_SMOKE || process.env.DEPLOY_TARGET === "staging") throw new Error("Upgradetest is uitsluitend lokaal toegestaan.");
const phase=process.argv[2];if(!['seed','verify'].includes(phase))throw new Error('Gebruik seed of verify');
const db=await workOrderTestDatabase();
const id=n=>`fabc0000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [tenant,user,customer,object,order,person,assignment,time,entry,signature,review,task]=Array.from({length:12},(_,i)=>id(i+1));
try{
 if(phase==='seed'){
  assert.equal((await db.query("select exists(select 1 from information_schema.columns where table_schema='public' and table_name='work_orders' and column_name='report_state') present")).rows[0].present,false,'Seed requires pre-work-order baseline');
  await db.query('begin');
  await db.query("insert into auth.users(id,email) values($1,'historical-upgrade@fixture.test')",[user]);
  await db.query("insert into public.tenants(id,slug,name) values($1,'fictitious-work-order-upgrade','FICTITIOUS upgrade only')",[tenant]);
  await db.query("insert into public.tenant_settings(tenant_id) values($1)",[tenant]);
  await db.query("insert into public.customers(id,tenant_id,customer_number,name) values($1,$2,'UP-C','FICTITIOUS old customer')",[customer,tenant]);
  await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values($1,$2,$3,'UP-O','FICTITIOUS old object','{}')",[object,tenant,customer]);
  await db.query("insert into public.personnel(id,tenant_id,user_id,full_name,employee_number) values($1,$2,$3,'FICTITIOUS old staff','UP-1')",[person,tenant,user]);
  await db.query("insert into public.work_orders(id,tenant_id,customer_id,object_id,work_order_number,discipline,status,signature_required,report_version,actual_start_at,actual_end_at,planned_start_at,planned_end_at,projected_start_at,projected_end_at,created_by) values($1,$2,$3,$4,'UP-W','Historical maintenance','invoice_ready',true,3,'2024-01-10T08:05Z','2024-01-10T09:05Z','2024-01-10T08:00Z','2024-01-10T09:00Z','2024-01-10T08:00Z','2024-01-10T09:00Z',$5)",[order,tenant,customer,object,user]);
  await db.query("insert into public.work_order_assignments(id,tenant_id,work_order_id,personnel_id,status,actual_start_at,actual_end_at,planned_start_at,planned_end_at,projected_start_at,projected_end_at) values($1,$2,$3,$4,'completed','2024-01-10T08:05Z','2024-01-10T09:05Z','2024-01-10T08:00Z','2024-01-10T09:00Z','2024-01-10T08:00Z','2024-01-10T09:00Z')",[assignment,tenant,order,person]);
  await db.query("insert into public.time_entries(id,tenant_id,personnel_id,assignment_id,kind,starts_at,ends_at,status,approved_by,approved_at) values($1,$2,$3,$4,'work','2024-01-10T08:05Z','2024-01-10T09:05Z','approved',$5,'2024-01-11T12:00Z')",[time,tenant,person,assignment,user]);
  await db.query("insert into public.work_order_tasks(id,tenant_id,work_order_id,task_code,task_name,duration_minutes,unit,unit_price_cents,vat_basis_points,quantity,executed_quantity,execution_state,completed_at) values($1,$2,$3,'UP','FICTITIOUS historical task',60,'task',12345,2100,1,1,'completed','2024-01-10T09:05Z')",[task,tenant,order]);
  await db.query("insert into public.report_entries(id,tenant_id,work_order_id,author_user_id,body,customer_visible,created_at) values($1,$2,$3,$4,'FICTITIOUS historical report',true,'2024-01-10T09:06Z')",[entry,tenant,order,user]);
  await db.query("insert into public.signatures(id,tenant_id,work_order_id,captured_by,signer_name,storage_path,sha256,report_version,signed_at) values($1,$2,$3,$4,'FICTITIOUS historical signer','fixture/historical.png',$5,3,'2024-01-10T09:07Z')",[signature,tenant,order,user,'a'.repeat(64)]);
  await db.query("insert into public.review_decisions(id,tenant_id,work_order_id,report_version,decision,decided_by,created_at) values($1,$2,$3,3,'approved',$4,'2024-01-11T12:00Z')",[review,tenant,order,user]);
  await db.query('commit');console.log('Fictitious pre-migration history seeded in local database only.');
 }else{
  const w=(await db.query('select * from public.work_orders where id=$1',[order])).rows[0];assert.equal(w.status,'invoice_ready');assert.equal(w.report_version,3);assert.equal(w.report_state,'approved');assert.equal(w.title,'Historical maintenance');assert.equal(w.signature_policy_snapshot.source,'historical');assert.equal(w.actual_start_at.toISOString(),'2024-01-10T08:05:00.000Z');assert.equal(w.actual_end_at.toISOString(),'2024-01-10T09:05:00.000Z');
  assert.equal((await db.query('select count(*) from public.work_order_assignments where work_order_id=$1',[order])).rows[0].count,'1');
  const s=(await db.query('select * from public.signatures where id=$1',[signature])).rows[0];assert.equal(s.sha256,'a'.repeat(64));assert.equal(s.channel,'historical');assert.equal(s.report_id,null);assert.equal(s.content_hash,null);assert.equal(s.signed_at.toISOString(),'2024-01-10T09:07:00.000Z');
  const taskRow=(await db.query('select * from public.work_order_tasks where id=$1',[task])).rows[0];assert.equal(taskRow.scope_root_task_id,task);assert.equal(Number(taskRow.unit_price_cents),12345);assert.equal(Number(taskRow.executed_quantity),1);
  const hours=(await db.query('select * from public.time_entries where id=$1',[time])).rows[0];assert.equal(hours.status,'approved');assert.equal(hours.starts_at.toISOString(),'2024-01-10T08:05:00.000Z');assert.equal(hours.ends_at.toISOString(),'2024-01-10T09:05:00.000Z');
  assert.equal((await db.query('select decision from public.review_decisions where id=$1',[review])).rows[0].decision,'approved');assert.equal((await db.query('select body from public.report_entries where id=$1',[entry])).rows[0].body,'FICTITIOUS historical report');
  assert.equal((await db.query('select count(*) from public.work_order_report_versions where work_order_id=$1',[order])).rows[0].count,'0');
  console.log('Upgrade verified: IDs, historical signature, approved time/review and task entitlement retained; no fabricated report snapshot.');
 }
}finally{await db.end();}
