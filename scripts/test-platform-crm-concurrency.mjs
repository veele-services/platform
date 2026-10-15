import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import {localWorkOrderTestUrl} from './work-order-test-target.mjs';

// Hosted targets are refused. Committed synthetic intake history is retained:
// this suite never disables immutable-history guards to clean up its fixtures.
// The fixture administrator is revoked, jobs suppressed and bookings cancelled.
test('Platform CRM: concurrent intake, reservation, revision and revocation',async t=>{
 const connectionString=localWorkOrderTestUrl();
 const clients=Array.from({length:4},()=>new pg.Client({connectionString,statement_timeout:10000,idle_in_transaction_session_timeout:15000}));
 await Promise.all(clients.map(c=>c.connect()));
 const [db,a,b,blocker]=clients,admin=randomUUID(),session=randomUUID(),marker=`FICTITIOUS-CRM-RACE-${randomUUID()}`;
 const appointments=new Set(),leads=new Set();
 const input={kind:'trial',name:'FICTITIOUS race contact',company:marker,email:`${randomUUID()}@crm-concurrency.invalid`,phone:'0612345678'};
 const rate=createHash('sha256').update(marker).digest('hex');
 const run=async(client,role,sql,args)=>{
  await client.query('begin');
  try{await client.query(`set local role ${role}`);await client.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role,sub:admin,session_id:session})]);const result=await client.query(sql,args);await client.query('commit');return result.rows[0].data}
  catch(e){await client.query('rollback');throw e}
 };
 const intake=(client,payload,key=randomUUID())=>run(client,'service_role','select public.crm_intake($1,$2,$3) data',[payload,key,rate]);
 const command=(client,op,payload,key=randomUUID())=>run(client,'authenticated','select public.crm_command($1,$2,$3) data',[op,payload,key]);
 const remember=result=>{if(result.leadId)leads.add(result.leadId);if(result.appointmentId)appointments.add(result.appointmentId);return result};
 const waitOnLock=async(client,fragment)=>{
  const pid=Number((await client.query('select pg_backend_pid() id')).rows[0].id);return async()=>{
   const until=Date.now()+4000;
   while(Date.now()<until){const state=(await db.query('select wait_event_type,query from pg_stat_activity where pid=$1',[pid])).rows[0];if(state?.wait_event_type==='Lock'&&state.query.includes(fragment))return;await new Promise(r=>setTimeout(r,20))}
   assert.fail('Expected real database lock wait was not observed');
  };
 };
 try{
  await db.query('begin');
  await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[admin,`${admin}@crm-concurrency.invalid`]);
  await db.query('insert into auth.sessions(id,user_id,created_at,updated_at) values($1,$2,now(),now())',[session,admin]);
  await db.query('insert into public.platform_admins(user_id) values($1)',[admin]);await db.query('commit');
  await t.test('identical simultaneous retries commit one immutable request, task and outbox event',async()=>{
   const key=randomUUID(),[one,two]=await Promise.all([intake(a,input,key),intake(b,input,key)]);remember(one);assert.deepEqual(one,two);
   assert.equal((await db.query('select count(*)::int n from private.crm_requests where lead_id=$1',[one.leadId])).rows[0].n,1);
   assert.equal((await db.query('select count(*)::int n from private.crm_tasks where request_id=$1',[one.requestId])).rows[0].n,1);
   assert.equal((await db.query("select count(*)::int n from private.notification_requests where source_kind='crm' and source_id=$1",[one.requestId])).rows[0].n,1);
  });
  let day,slots;
  for(let n=3;n<=60;n++){
   const candidate=(await db.query("select to_char((now() at time zone 'Europe/Amsterdam')::date+$1::int,'YYYY-MM-DD') booking_day",[n])).rows[0].booking_day;
   const available=await run(a,'authenticated','select public.crm_availability($1) data',[candidate]);
   if(available.slots.length>=4){day=candidate;slots=available.slots;break}
  }
  assert.ok(day,'The explicitly local calendar fixture needs at least four free slots within its configured horizon');
  await t.test('two different visitors racing one slot produce one reservation and no partial losing intake',async()=>{
   const before=Number((await db.query('select count(*) n from private.crm_requests where lead_id=any($1::uuid[])',[[...leads]])).rows[0].n);
   const outcomes=await Promise.allSettled([intake(a,{...input,kind:'appointment',date:day,time:slots[0]}),intake(b,{...input,kind:'demo',date:day,time:slots[0]})]);
   assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);const failed=outcomes.find(x=>x.status==='rejected');assert.equal(failed.reason.code,'23P01');remember(outcomes.find(x=>x.status==='fulfilled').value);
   const after=Number((await db.query('select count(*) n from private.crm_requests where lead_id=any($1::uuid[])',[[...leads]])).rows[0].n);assert.equal(after,before+1);
  });
  await t.test('concurrent rescheduling to one slot keeps the losing appointment at its original time',async()=>{
   const one=remember(await intake(a,{...input,kind:'appointment',date:day,time:slots[1]}));
   const two=remember(await intake(b,{...input,kind:'demo',date:day,time:slots[2]}));
   const original=(await db.query('select id,starts_at from private.crm_appointments where id=any($1::uuid[])',[[one.appointmentId,two.appointmentId]])).rows;
   const outcomes=await Promise.allSettled([command(a,'appointment.update',{id:one.appointmentId,revision:1,action:'reschedule',date:day,time:slots[3]}),command(b,'appointment.update',{id:two.appointmentId,revision:1,action:'reschedule',date:day,time:slots[3]})]);
   assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);assert.equal(outcomes.find(x=>x.status==='rejected').reason.code,'23P01');
   const rows=(await db.query('select id,starts_at,revision from private.crm_appointments where id=any($1::uuid[])',[[one.appointmentId,two.appointmentId]])).rows;
   const unchanged=rows.find(x=>x.revision===1);assert.ok(unchanged);assert.equal(unchanged.starts_at.toISOString(),original.find(x=>x.id===unchanged.id).starts_at.toISOString());
  });
  const lead=[...leads][0];
  await t.test('simultaneous updates cannot overwrite the same lead revision',async()=>{
   const revision=(await db.query('select revision from private.crm_leads where id=$1',[lead])).rows[0].revision;
   const outcomes=await Promise.allSettled([command(a,'lead.update',{id:lead,revision,stage:'contacted'}),command(b,'lead.update',{id:lead,revision,stage:'proposal'})]);
   assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);assert.equal(outcomes.find(x=>x.status==='rejected').reason.code,'40001');
  });
  await t.test('a revoked registry is rechecked after a blocked idempotency lock, including receipt replay',async()=>{
   const key=randomUUID(),payload={id:lead,body:'FICTITIOUS admitted note'};await command(a,'lead.activity',payload,key);
   const waiting=await waitOnLock(b,'crm_command');
   await blocker.query('begin');await blocker.query("select pg_advisory_xact_lock(hashtextextended('crm-command:'||$1::text||$2::text,0))",[admin,key]);
   const pending=command(b,'lead.activity',payload,key).then(data=>({data}),error=>({error}));
   try{await waiting();await db.query('delete from public.platform_admins where user_id=$1',[admin]);await blocker.query('commit');assert.equal((await pending).error?.code,'42501')}
   finally{await blocker.query('rollback');await db.query('insert into public.platform_admins(user_id) values($1) on conflict do nothing',[admin])}
  });
  await t.test('a revoked session is rechecked after waiting on the lead row',async()=>{
   const waiting=await waitOnLock(b,'crm_command');await blocker.query('begin');await blocker.query('select id from private.crm_leads where id=$1 for update',[lead]);
   const pending=command(b,'lead.activity',{id:lead,body:'FICTITIOUS must not commit'}).then(data=>({data}),error=>({error}));
   try{await waiting();await db.query('delete from auth.sessions where id=$1',[session]);await blocker.query('commit');assert.equal((await pending).error?.code,'42501');assert.equal((await db.query("select count(*)::int n from private.crm_activities where lead_id=$1 and body='FICTITIOUS must not commit'",[lead])).rows[0].n,0)}
   finally{await blocker.query('rollback')}
  });
 }finally{
  await Promise.all(clients.map(c=>c.query('rollback')));
  // Only this run's synthetic records are retired. History remains auditable.
  await db.query("update private.crm_appointments set status='cancelled',revision=revision+1 where id=any($1::uuid[]) and status<>'cancelled'",[[...appointments]]);
  await db.query("update private.crm_tasks set completed=true,revision=revision+1 where lead_id=any($1::uuid[]) and not completed",[[...leads]]);
  await db.query("update private.crm_leads set stage='lost',revision=revision+1 where id=any($1::uuid[])",[[...leads]]);
  await db.query("update private.notification_deliveries d set state='suppressed',reason='synthetic_fixture_retired' from private.notification_requests n,private.crm_requests r where d.request_id=n.id and n.source_kind='crm' and n.source_id=r.id and r.lead_id=any($1::uuid[]) and d.state in('queued','failed','deferred')",[[...leads]]);
  await db.query('delete from public.platform_admins where user_id=$1',[admin]);
  await db.query('delete from auth.sessions where user_id=$1',[admin]);
  await db.query("update auth.users set banned_until='infinity' where id=$1",[admin]);
  await Promise.all(clients.map(c=>c.end()));
 }
});
