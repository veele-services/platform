import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { workOrderTestDatabase } from './work-order-test-target.mjs';

test('live personnel planning: actual times, free extensions, reflow and urgent windows',async t=>{
 const db=await workOrderTestDatabase();await db.query('begin');
 const tenant=randomUUID(),manager=randomUUID(),staff=randomUUID(),other=randomUUID(),customer=randomUUID(),object=randomUUID(),person=randomUUID(),colleague=randomUUID(),order=randomUUID(),assignment=randomUUID(),otherAssignment=randomUUID(),task=randomUUID();
 const sessions=Object.fromEntries([manager,staff,other].map(u=>[u,randomUUID()]));
 const call=async(sql,args=[],actor=staff,role='authenticated')=>{await db.query('savepoint operation');try{await db.query(`set local role ${role}`);await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:actor,session_id:sessions[actor],role})]);const r=await db.query(sql,args);await db.query('reset role');await db.query("select set_config('request.jwt.claims','{}',true)");await db.query('release savepoint operation');return r.rows;}catch(e){await db.query('rollback to savepoint operation');await db.query('release savepoint operation');throw e;}};
 const version=async()=>Number((await db.query('select version from public.work_orders where id=$1',[order])).rows[0].version);
 const row=async()=> (await db.query('select private.planboard_row($1) data',[order])).rows[0].data;
 try {
  for(const u of [manager,staff,other]){await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[u,`${u}@live.test`]);await db.query('insert into auth.sessions(id,user_id,created_at,updated_at) values($1,$2,now(),now())',[sessions[u],u]);}
  await db.query("insert into public.tenants(id,slug,name) values($1,$2,'Fictitious live planning')",[tenant,`live-${tenant}`]);
  await db.query("insert into public.tenant_settings(tenant_id,enabled_services) values($1,array['planning','personeel','rapportage'])",[tenant]);
  for(const [u,role] of [[manager,'planner'],[staff,'staff'],[other,'staff']])await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array[$3]::public.app_role[],'active')",[tenant,u,role]);
  await db.query("insert into public.customers(id,tenant_id,customer_number,name) values($1,$2,$3,'Fictitious customer')",[customer,tenant,`C-${customer}`]);
  await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values($1,$2,$3,$4,'Fictitious location',jsonb_build_object('street','Teststraat'))",[object,tenant,customer,`O-${object}`]);
  for(const [p,u] of [[person,staff],[colleague,other]])await db.query("insert into public.personnel(id,tenant_id,user_id,full_name) values($1,$2,$3,'Fictitious employee')",[p,tenant,u]);
  await db.query("insert into public.work_orders(id,tenant_id,customer_id,object_id,work_order_number,discipline,status,planned_start_at,planned_end_at,projected_start_at,projected_end_at,created_by) values($1,$2,$3,$4,$5,'Onderhoud','released',now()-interval '61 minutes',now()-interval '1 minute',now()-interval '61 minutes',now()-interval '1 minute',$6)",[order,tenant,customer,object,`W-${order}`,manager]);
  for(const [a,p] of [[assignment,person],[otherAssignment,colleague]]){
   await db.query("insert into public.work_order_assignments(id,tenant_id,work_order_id,personnel_id,status,planned_start_at,planned_end_at,projected_start_at,projected_end_at,actual_start_at) values($1,$2,$3,$4,'in_progress',now()-interval '61 minutes',now()-interval '1 minute',now()-interval '61 minutes',now()-interval '1 minute',now()-interval '61 minutes')",[a,tenant,order,p]);
   await db.query('insert into public.dispatches(tenant_id,work_order_id,assignment_id,dispatched_by,idempotency_key) values($1,$2,$3,$4,$5)',[tenant,order,a,manager,randomUUID()]);
   await db.query("insert into public.time_entries(tenant_id,personnel_id,assignment_id,kind,starts_at) values($1,$2,$3,'work',now()-interval '61 minutes')",[tenant,p,a]);
  }
  await db.query("update public.work_orders set status='in_progress',actual_start_at=now()-interval '61 minutes' where id=$1",[order]);
  await db.query("insert into public.work_order_tasks(id,tenant_id,work_order_id,task_code,task_name,duration_minutes,unit,unit_price_cents,vat_basis_points) values($1,$2,$3,'LIVE','Fictitious task',60,'task',10000,2100)",[task,tenant,order]);
  await t.test('running intervals grow and overrun is individual',async()=>{await db.query('select private.refresh_live_planning($1)',[tenant]);const w=await row();assert.equal(w.assignments.length,2);assert.ok(w.assignments.every(a=>a.overrun));assert.ok(Date.parse(w.end)>Date.now());});
  await t.test('refresh preserves deliberate order bounds when individual assignments have not started or shifted',async()=>{
   await db.query('savepoint untouched_case');try{
    const untouched=randomUUID(),unstarted=randomUUID();
    await db.query("insert into public.personnel(id,tenant_id,full_name) values($1,$2,'Fictitious future employee')",[unstarted,tenant]);
    await db.query("insert into public.work_orders(id,tenant_id,customer_id,object_id,work_order_number,discipline,status,planned_start_at,planned_end_at,projected_start_at,projected_end_at,created_by) values($1,$2,$3,$4,$5,'Onderhoud','planned',now()+interval '2 days',now()+interval '2 days 3 hours',now()+interval '2 days',now()+interval '2 days 3 hours',$6)",[untouched,tenant,customer,object,`W-${untouched}`,manager]);
    await db.query("insert into public.work_order_assignments(tenant_id,work_order_id,personnel_id,planned_start_at,planned_end_at,projected_start_at,projected_end_at) values($1,$2,$3,now()+interval '2 days 24 minutes',now()+interval '2 days 150 minutes',now()+interval '2 days 24 minutes',now()+interval '2 days 150 minutes')",[tenant,untouched,unstarted]);
    const bounds=async()=> (await db.query('select planned_start_at,planned_end_at,projected_start_at,projected_end_at from public.work_orders where id=$1',[untouched])).rows[0];
    const before=await bounds();await db.query('select private.refresh_live_planning($1)',[tenant]);assert.deepEqual(await bounds(),before);
   }finally{await db.query('rollback to savepoint untouched_case');await db.query('release savepoint untouched_case');}
  });
  await t.test('future work moves forward with known travel and repeated refresh does not pull it back',async()=>{
   await db.query('savepoint travel_case');try{
    const next=randomUUID(),nextAssignment=randomUUID(),destination=randomUUID();
    await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values($1,$2,$3,$4,'Second fictitious location','{}')",[destination,tenant,customer,`O-${destination}`]);
    await db.query("insert into public.work_orders(id,tenant_id,customer_id,object_id,work_order_number,discipline,status,planned_start_at,planned_end_at,projected_start_at,projected_end_at,created_by) values($1,$2,$3,$4,$5,'Onderhoud','released',now()+interval '5 minutes',now()+interval '15 minutes',now()+interval '5 minutes',now()+interval '15 minutes',$6)",[next,tenant,customer,destination,`W-${next}`,manager]);
    await db.query("insert into public.work_order_assignments(id,tenant_id,work_order_id,personnel_id,status,planned_start_at,planned_end_at,projected_start_at,projected_end_at) values($1,$2,$3,$4,'released',now()+interval '5 minutes',now()+interval '15 minutes',now()+interval '5 minutes',now()+interval '15 minutes')",[nextAssignment,tenant,next,colleague]);
    await db.query("insert into public.travel_legs(tenant_id,assignment_id,direction,origin_address,destination_address,travel_mode,estimated_minutes,calculated_at) values($1,$2,'before','{}','{}','driving',20,now())",[tenant,nextAssignment]);
    await db.query('select private.refresh_live_planning($1)',[tenant]);
    const times=(await db.query("select a.projected_start_at start,a.planned_start_at planned,extract(epoch from(a.projected_start_at-b.projected_end_at))/60 margin from public.work_order_assignments a join public.work_order_assignments b on b.id=$2 where a.id=$1",[nextAssignment,otherAssignment])).rows[0];
    assert.equal(Number(times.margin),25);assert.ok(times.start>times.planned);
    assert.equal((await db.query('select projected_start_at from public.work_orders where id=$1',[next])).rows[0].projected_start_at.toISOString(),times.start.toISOString());
    await db.query('select private.refresh_live_planning($1)',[tenant]);assert.equal((await db.query('select projected_start_at from public.work_order_assignments where id=$1',[nextAssignment])).rows[0].projected_start_at.toISOString(),times.start.toISOString());
   }finally{await db.query('rollback to savepoint travel_case');await db.query('release savepoint travel_case');}
  });
  await t.test('unseen work warns within thirty minutes and expired windows return to planning',async()=>{
   await db.query('savepoint warning_case');try{
    const next=randomUUID(),nextAssignment=randomUUID(),unstarted=randomUUID(),slot=randomUUID();
    await db.query("insert into public.personnel(id,tenant_id,full_name) values($1,$2,'Fictitious unstarted employee')",[unstarted,tenant]);
    await db.query("insert into public.appointment_slots(id,tenant_id,starts_at,ends_at) values($1,$2,now()-interval '10 minutes',now()+interval '20 minutes')",[slot,tenant]);
    await db.query("insert into public.work_orders(id,tenant_id,customer_id,object_id,work_order_number,discipline,status,appointment_slot_id,customer_window_kind,planned_start_at,planned_end_at,projected_start_at,projected_end_at,created_by) values($1,$2,$3,$4,$5,'Onderhoud','released',$6,'arrival',now(),now()+interval '10 minutes',now(),now()+interval '10 minutes',$7)",[next,tenant,customer,object,`W-${next}`,slot,manager]);
    await db.query("insert into public.work_order_assignments(id,tenant_id,work_order_id,personnel_id,status,planned_start_at,planned_end_at,projected_start_at,projected_end_at) values($1,$2,$3,$4,'released',now(),now()+interval '10 minutes',now(),now()+interval '10 minutes')",[nextAssignment,tenant,next,unstarted]);
    await db.query('select private.refresh_live_planning($1)',[tenant]);await db.query('select private.refresh_live_planning($1)',[tenant]);
    assert.equal((await db.query("select count(*) from private.notification_domain_events where tenant_id=$1 and entity_id=$2 and type_code='work_order.window_risk'",[tenant,nextAssignment])).rows[0].count,'1');
    await db.query("update public.appointment_slots set ends_at=now()-interval '1 minute' where id=$1",[slot]);await db.query('select private.refresh_live_planning($1)',[tenant]);
    assert.equal((await db.query('select status from public.work_order_assignments where id=$1',[nextAssignment])).rows[0].status,'returned');
    assert.equal((await db.query('select status from public.work_orders where id=$1',[next])).rows[0].status,'planned');
   }finally{await db.query('rollback to savepoint warning_case');await db.query('release savepoint warning_case');}
  });
  await t.test('free quarter is replay-safe, own only and does not change any billable task',async()=>{
   await assert.rejects(call('select public.extend_staff_work_order($1,null,$2)',[order,randomUUID()]),e=>e.code==='40001');
   const key=randomUUID();await call('select public.extend_staff_work_order($1,$2,$3)',[order,await version(),key]);const retry=await call('select public.extend_staff_work_order($1,1,$2) data',[order,key]);assert.equal(retry[0].data.replayed,true);
   const w=await row();assert.equal(w.assignments.find(a=>a.id===assignment).timeBudgetMinutes,75);assert.equal(w.assignments.find(a=>a.id===assignment).overrun,false);assert.equal(w.assignments.find(a=>a.id===otherAssignment).overrun,true);
   assert.equal((await db.query('select unit_price_cents from public.work_order_tasks where id=$1',[task])).rows[0].unit_price_cents,'10000');
   assert.equal((await db.query('select count(*) from private.work_order_time_extensions where assignment_id=$1',[assignment])).rows[0].count,'1');
   await assert.rejects(call('select public.extend_staff_work_order($1,$2,$3)',[order,await version(),key],other),e=>e.code==='23514');
   await assert.rejects(call('select public.extend_staff_work_order($1,$2,$3)',[order,await version(),randomUUID()],manager),e=>e.code==='42501');
  });
  await t.test('actual stop fixes the completed card and cannot extend completed work',async()=>{
   await call("select public.transition_work_order($1,'stop',$2,$3)",[order,await version(),randomUUID()]);const w=await row(),a=w.assignments.find(a=>a.id===assignment);assert.equal(a.end,a.actualEnd);assert.equal(a.status,'completed');assert.equal(a.overrun,false);
   await assert.rejects(call('select public.extend_staff_work_order($1,$2,$3)',[order,await version(),randomUUID()]),e=>e.code==='23514');
  });
  await t.test('an impossible future customer window returns only the affected assignment and deduplicates notice',async()=>{
   const next=randomUUID(),slot=randomUUID(),nextAssignment=randomUUID();
   await db.query("insert into public.appointment_slots(id,tenant_id,starts_at,ends_at) values($1,$2,now()+interval '1 minute',now()+interval '4 minutes')",[slot,tenant]);
   await db.query("insert into public.work_orders(id,tenant_id,customer_id,object_id,work_order_number,discipline,status,appointment_slot_id,customer_window_kind,planned_start_at,planned_end_at,projected_start_at,projected_end_at,created_by) values($1,$2,$3,$4,$5,'Onderhoud','released',$6,'execution',now()+interval '2 minutes',now()+interval '4 minutes',now()+interval '2 minutes',now()+interval '4 minutes',$7)",[next,tenant,customer,object,`W-${next}`,slot,manager]);
   await db.query("insert into public.work_order_assignments(id,tenant_id,work_order_id,personnel_id,status,planned_start_at,planned_end_at,projected_start_at,projected_end_at) values($1,$2,$3,$4,'released',now()+interval '2 minutes',now()+interval '4 minutes',now()+interval '2 minutes',now()+interval '4 minutes')",[nextAssignment,tenant,next,colleague]);
   await call('select public.extend_staff_work_order($1,$2,$3)',[order,await version(),randomUUID()],other);
   assert.equal((await db.query('select status from public.work_order_assignments where id=$1',[nextAssignment])).rows[0].status,'returned');
   assert.equal((await db.query('select private.planboard_row($1) data',[next])).rows[0].data.category,'unassigned');
   await db.query('select private.refresh_live_planning($1)',[tenant]);
   assert.equal((await db.query("select count(*) from private.notification_domain_events where tenant_id=$1 and type_code='work_order.window_risk' and entity_id=$2",[tenant,nextAssignment])).rows[0].count,'1');
   assert.equal((await row()).assignments.find(a=>a.id===otherAssignment).status,'in_progress');
  });
  await t.test('worker and private extension ledger are denied to browser roles',async()=>{
   await assert.rejects(call('select public.process_live_planning()'),e=>e.code==='42501');
   await assert.rejects(call('select * from private.work_order_time_extensions'),e=>e.code==='42501');
  });
 }finally{await db.query('rollback');await db.end();}
});
