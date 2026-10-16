import {randomUUID} from 'node:crypto';
import {slaFixture,seedSlaFixture} from './management-sla.mjs';

// Native delivered/report-review source. No approved flags, receipts, financial
// evidence or customer acceptance are manufactured by this fixture.
export async function seedFinanceFixture(db,overrides={}){
 const f=slaFixture(overrides);await seedSlaFixture(db,f);
 await db.query('insert into public.tenant_branding(tenant_id) values($1)',[f.tenant]);
 const call=async(sql,args=[],actor=f.owner)=>{
  await db.query('begin');try{await db.query('set local role authenticated');await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role:'authenticated',sub:actor,session_id:f.sessions.get(actor)})]);const r=await db.query(sql,args);await db.query('commit');return r.rows[0]?.data}catch(e){await db.query('rollback');throw e}
 };
 const version=()=>db.query('select version from public.work_orders where id=$1',[f.workOrder]).then(r=>Number(r.rows[0].version));
 await call("select public.change_work_order_signature_policy($1,$2,'none',false,$3,$4) data",[f.workOrder,await version(),'FICTITIOUS explicit signing policy for source integration tests',randomUUID()]);
 await db.query('begin');try{
  await db.query("update public.work_orders set status='in_progress',lead_personnel_id=$2,actual_start_at=now()-interval '1 hour' where id=$1",[f.workOrder,f.person]);
  const assignment=(await db.query("update public.work_order_assignments set status='in_progress',actual_start_at=now()-interval '1 hour' where work_order_id=$1 returning id",[f.workOrder])).rows[0].id;
  await db.query("insert into public.time_entries(tenant_id,personnel_id,assignment_id,kind,starts_at) values($1,$2,$3,'work',now()-interval '1 hour')",[f.tenant,f.person,assignment]);
  f.financialTask=randomUUID();await db.query("insert into public.work_order_tasks(id,tenant_id,work_order_id,task_revision_id,task_code,task_name,duration_minutes,unit,quantity,unit_price_cents,vat_basis_points,completed_at,executed_quantity,execution_state) values($1,$2,$3,$4,'FIN-REVIEW','FICTITIOUS delivered financial source',15,'task',1,1200,900,now(),1,'completed')",[f.financialTask,f.tenant,f.workOrder,f.revision]);
  await db.query('commit');
 }catch(e){await db.query('rollback');throw e}
 await call("select public.transition_work_order($1,'stop',$2,$3) data",[f.workOrder,await version(),randomUUID()],f.staff);
 f.report=await call('select public.submit_work_order_report($1,$2,$3,$4) data',[f.workOrder,await version(),'FICTITIOUS actual delivered report for financial review',randomUUID()],f.staff);
 const snapshot=await call('select public.cockpit_finance_query($1,$2) data',[f.tenant,{tab:'review',record:'task:'+f.financialTask}]);
 f.financeInput={id:f.financialTask,fingerprint:snapshot.selected.fingerprint,outcome:'billable',reason:'FICTITIOUS actual execution, report and price agreement checked',approval:true,outside:true};
 return f;
}
