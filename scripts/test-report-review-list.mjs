import assert from 'node:assert/strict';
import test from 'node:test';
import {workOrderTestDatabase} from './work-order-test-target.mjs';
import {slaFixture,seedSlaFixture} from './fixtures/management-sla.mjs';
import {submitFixtureReport} from './work-order-report-fixture.mjs';

test('Source report list retains native authority, paging and real report versions',async t=>{
 const db=await workOrderTestDatabase(),f=slaFixture();await db.query('begin');
 const call=async(sql,args=[],actor=f.owner,role='authenticated')=>{await db.query('savepoint caller');try{await db.query(`set local role ${role}`);await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:actor,session_id:f.sessions.get(actor),role})]);const r=await db.query(sql,args);await db.query('reset role');await db.query("select set_config('request.jwt.claims','{}',true)");await db.query('release savepoint caller');return r.rows}catch(e){await db.query('rollback to savepoint caller');await db.query('release savepoint caller');throw e}};
 const list=async(filters={},actor=f.owner,tenant=f.tenant,role='authenticated')=>(await call('select public.cockpit_report_review_list($1,$2) data',[tenant,JSON.stringify(filters)],actor,role))[0].data;
 const isolate=async operation=>{await db.query('savepoint isolated');try{await operation()}finally{await db.query('rollback to savepoint isolated');await db.query('release savepoint isolated')}};
 try{
  await seedSlaFixture(db,f);
  await db.query("update public.work_orders set status='under_review',report_state='review',title='FICTITIOUS Source%literal_under',commercial_terms='{\"secret-price\":912345678}' where id=$1",[f.workOrder]);
  await db.query("insert into public.work_orders(tenant_id,customer_id,object_id,work_order_number,title,discipline,status,report_state,created_by,planned_start_at,planned_end_at,projected_start_at,projected_end_at) select $1,$2,$3,'REVIEW-'||lpad(n::text,3,'0'),'FICTITIOUS review '||n,'Test','under_review','review',$4,'2033-10-05T08:00Z','2033-10-05T10:00Z','2033-10-05T08:00Z','2033-10-05T10:00Z' from generate_series(1,107) n",[f.tenant,f.customer,f.object,f.owner]);
  await t.test('wrapper is invoker, helpers have closed search paths, anonymous/service and raw row helper are denied',async()=>{
   const r=await db.query("select n.nspname,p.prosecdef,p.proconfig,has_function_privilege('authenticated',p.oid,'execute') authenticated,has_function_privilege('anon',p.oid,'execute') anon,has_function_privilege('service_role',p.oid,'execute') service from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname='cockpit_report_review_list' order by n.nspname");assert.equal(r.rows.length,2);for(const row of r.rows){assert.equal(row.authenticated,true);assert.equal(row.anon,false);assert.equal(row.service,false);assert.ok(row.proconfig.some(x=>x.startsWith('search_path=')&&!x.includes('public')));assert.equal(row.prosecdef,row.nspname==='private')}
   assert.equal((await db.query("select has_function_privilege('authenticated','private.work_order_row(uuid,boolean)','execute') allowed")).rows[0].allowed,false);
   for(const role of ['anon','service_role'])await assert.rejects(list({},f.owner,f.tenant,role),e=>e.code==='42501');
  });
  await t.test('stable pagination has no duplicates and stale valid pages clamp from the same count',async()=>{
   const first=await list({page:1,pageSize:100,sort:'number'}),last=await list({page:999,pageSize:100,sort:'number'});assert.equal(first.total,108);assert.equal(first.rows.length,100);assert.equal(last.page,2);assert.equal(last.rows.length,8);assert.equal(new Set([...first.rows,...last.rows].map(r=>r.id)).size,108);assert.deepEqual(first,await list({page:1,pageSize:100,sort:'number'}));
   for(const sort of ['date','date_desc','customer','status'])assert.deepEqual(await list({sort}),await list({sort}));
  });
  await t.test('search escapes wildcard characters and does not expose financial or HR contents',async()=>{
   const found=await list({q:'Source%literal_'});assert.equal(found.total,1);assert.equal(found.rows[0].id,f.workOrder);assert.equal(found.rows[0].billingState,null);assert.equal(found.rows[0].legacy,true);assert.equal(found.rows[0].reportVersion,1);
   for(const marker of ['912345678','secret-price','bank_account','birth_date','unit_price_cents','commercial_terms'])assert.equal(JSON.stringify(found).includes(marker),false);
   assert.equal((await list({q:'_does_not_exist_%'})).total,0);
  });
  await t.test('malformed or extra selectors fail closed',async()=>{for(const value of [[],{tenant:f.foreign},{q:12},{q:'x'.repeat(201)},{status:'invented'},{stage:'anything'},{sort:'drop table'},{page:0},{page:100001},{page:'1'},{pageSize:9},{pageSize:101},{pageSize:25.5}])await assert.rejects(list(value),e=>e.code==='22023')});
  await t.test('current tenant, membership, live session and roles scope every request',async()=>{
   await assert.rejects(list({},f.owner,f.foreign),e=>e.code==='42501');await assert.rejects(list({},f.staff),e=>e.code==='42501');assert.equal((await list({},f.planner)).total,108);
   await isolate(async()=>{await db.query("update public.tenant_memberships set status='revoked' where tenant_id=$1 and user_id=$2",[f.tenant,f.planner]);await assert.rejects(list({},f.planner),e=>e.code==='42501')});
   await isolate(async()=>{await db.query("update auth.sessions set not_after=now()-interval '1 minute' where id=$1",[f.sessions.get(f.owner)]);await assert.rejects(list(),e=>e.code==='42501')});
  });
  await t.test('each canonical/function right and the report module is checked at query time',async()=>{
   for(const cap of ['backoffice.access','backoffice.reports.read','backoffice.work_orders.read','backoffice.functions.cockpit_report_review_list'])await isolate(async()=>{await db.query('delete from private.management_role_permissions where role_id=$1 and capability=$2',[f.ownerRole,cap]);await assert.rejects(list(),e=>e.code==='42501')});
   await isolate(async()=>{await db.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',true)");await db.query("update public.tenant_settings set enabled_services=array['planning','personeel'] where tenant_id=$1",[f.tenant]);await assert.rejects(list(),e=>e.code==='42501')});
  });
  await t.test('real staff submission and manager correction/approval feed the same list without fabricated legacy approval',async()=>{
   await db.query("update public.work_orders set report_state='draft' where id=$1",[f.workOrder]);
   await db.query("insert into public.work_order_tasks(tenant_id,work_order_id,task_revision_id,task_code,task_name,duration_minutes,unit,unit_price_cents,vat_basis_points,executed_quantity,execution_state,completed_at) values($1,$2,$3,'SLA','FICTITIOUS completed task',30,'task',1200,900,1,'completed',now())",[f.tenant,f.workOrder,f.revision]);
   await submitFixtureReport(db,call,{tenant:f.tenant,order:f.workOrder,staff:f.staff,manager:f.owner});
   let result=await list({q:'Source%literal_'}),row=result.rows[0];assert.equal(row.legacy,false);assert.equal(row.reportVersion,1);assert.equal(row.reportState,'review');
   let report=(await db.query('select id,content_hash from public.work_order_report_versions where work_order_id=$1 and version=1',[f.workOrder])).rows[0];
   await assert.rejects(call("select public.review_work_order_report($1,$2,'approved','FICTITIOUS')",[f.workOrder,report.id],f.planner),e=>e.code==='42501');
   await call("select public.review_work_order_report($1,$2,'returned','FICTITIOUS correction reason')",[f.workOrder,report.id]);assert.equal((await list({status:'correction'})).total,1);
   await submitFixtureReport(db,call,{tenant:f.tenant,order:f.workOrder,staff:f.staff,manager:f.owner});
   const next=(await db.query('select id from public.work_order_report_versions where work_order_id=$1 and version=2',[f.workOrder])).rows[0];
   await assert.rejects(call("select public.review_work_order_report($1,$2,'approved','Stale')",[f.workOrder,report.id]),e=>e.code==='40001');
   await call("select public.review_work_order_report($1,$2,'approved','FICTITIOUS checked current evidence')",[f.workOrder,next.id]);
   result=await list({stage:'processed'});assert.equal(result.total,1);row=result.rows[0];assert.equal(row.id,f.workOrder);assert.equal(row.reportVersion,2);assert.equal(row.reportState,'approved');assert.equal((await list({stage:'open'})).total,107);assert.equal((await db.query('select content_hash from public.work_order_report_versions where id=$1',[report.id])).rows[0].content_hash,report.content_hash);
  });
 }finally{await db.query('rollback');await db.end()}
});
