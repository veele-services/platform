import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import {localWorkOrderTestUrl} from './work-order-test-target.mjs';
import {seedFinanceFixture} from './fixtures/management-finance.mjs';
import {retireSlaFixture} from './fixtures/management-sla.mjs';
test('Overview/source: actual report, invoice and payment stay authorized through the existing work-order dossier',async()=>{
 const db=new pg.Client({connectionString:localWorkOrderTestUrl(),statement_timeout:15000});await db.connect();let f;
 const call=async(sql,args=[],actor=f.owner)=>{await db.query('begin');try{await db.query('set local role authenticated');await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role:'authenticated',sub:actor,session_id:f.sessions.get(actor)})]);const result=await db.query(sql,args);await db.query('commit');return result.rows[0].data}catch(e){await db.query('rollback');throw e}};
 const source=()=>call('select public.cockpit_work_order_source($1,$2) data',[f.tenant,f.workOrder]);
 try{
  f=await seedFinanceFixture(db);let preview=await source();assert.equal(preview.dossier.order.id,f.workOrder);assert.equal(preview.dossier.finance,true);assert.equal(preview.financial.total,1);assert.equal(preview.financial.rows[0].amountCents,1200);assert.equal(preview.financial.rows[0].category,'review');
  const wrappers=(await db.query("select proname,prosecdef from pg_proc where oid in('public.cockpit_work_order_source(uuid,uuid)'::regprocedure,'public.cockpit_overview_query(uuid,jsonb)'::regprocedure)")).rows;assert.ok(wrappers.every(r=>!r.prosecdef));
  await call('select public.cockpit_finance_command($1,$2,$3) data',[f.tenant,f.financeInput,randomUUID()]);preview=await source();assert.equal(preview.financial.rows[0].category,'confirmed');
  const invoice=await call('select to_jsonb(public.create_execution_invoice($1,$2,$3)) data',[f.tenant,randomUUID(),JSON.stringify([{taskId:f.financialTask,quantity:1}])]);preview=await source();assert.equal(preview.financial.total,1);assert.equal(preview.financial.rows[0].category,'unpaid');assert.equal(preview.financial.rows[0].amountCents,1308);
  await call('select public.register_manual_payment($1,$2,$3,$4,$5) data',[f.tenant,new Date().toISOString(),'FICTITIOUS source payment',JSON.stringify([{invoice_id:invoice.id,amount_cents:500}]),randomUUID()]);preview=await source();assert.equal(preview.financial.rows[0].amountCents,808);const overview=await call('select public.cockpit_overview_query($1) data',[f.tenant]);assert.equal(overview.finance.counts.unpaid,808);assert.equal(overview.aging.current+overview.aging.overdue,808);
  await db.query("delete from private.management_role_permissions where role_id=$1 and capability='backoffice.functions.cockpit_work_order_financial_sources'",[f.ownerRole]);preview=await source();assert.deepEqual(preview.financial,{rows:[],total:0});assert.equal(preview.dossier.finance,true);await db.query("insert into private.management_role_permissions(tenant_id,role_id,capability) values($1,$2,'backoffice.functions.cockpit_work_order_financial_sources')",[f.tenant,f.ownerRole]);
  await db.query("delete from private.management_role_permissions where role_id=$1 and capability='backoffice.finance.read'",[f.ownerRole]);preview=await source();assert.deepEqual(preview.financial,{rows:[],total:0});assert.equal(preview.dossier.finance,false);assert.ok(!('unit_price_cents'in preview.dossier.tasks[0]));
  await assert.rejects(call('select public.cockpit_work_order_source($1,$2) data',[f.tenant,f.workOrder],f.staff),e=>e.code==='42501');await assert.rejects(call('select public.cockpit_work_order_source($1,$2) data',[f.foreign,f.workOrder]),e=>e.code==='42501');
  await db.query("delete from private.management_role_permissions where role_id=$1 and capability='backoffice.work_orders.read'",[f.ownerRole]);await assert.rejects(source(),e=>e.code==='42501');
 }finally{await db.query('rollback');if(f)await retireSlaFixture(db,f);await db.end()}
});
