import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {workOrderTestDatabase} from './work-order-test-target.mjs';

test('Platform CRM: real transactions, snapshots, calendar, rights, policy and central delivery',async t=>{
 const db=await workOrderTestDatabase();await db.query('begin');
 const users=Object.fromEntries(['admin','tenant','staff','support','outsider'].map(k=>[k,randomUUID()]));
 const sessions=Object.fromEntries(Object.keys(users).map(k=>[k,randomUUID()]));
 const call=async(sql,args=[],who='admin',role='authenticated')=>{
  await db.query('savepoint crm_call');
  try{await db.query(`set local role ${role}`);await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role,sub:users[who],session_id:sessions[who]})]);const r=await db.query(sql,args);await db.query('reset role');await db.query("select set_config('request.jwt.claims','{}',true)");await db.query('release savepoint crm_call');return r.rows[0]?.data??r.rows;}
  catch(e){await db.query('rollback to savepoint crm_call');await db.query('release savepoint crm_call');throw e;}
 };
 const query=(operation='state',payload={},who='admin')=>call('select public.crm_query($1,$2) data',[operation,payload],who);
 const command=(op,payload,who='admin',id=randomUUID())=>call('select public.crm_command($1,$2,$3) data',[op,payload,id],who);
 const intake=(payload,key=randomUUID())=>call('select public.crm_intake($1,$2,$3) data',[payload,key,'a'.repeat(64)],'admin','service_role');
 const denied=p=>assert.rejects(p,e=>e.code==='42501');
 try{
  // A query-first local probe can verify the forward migration before freezing
  // its manifest. Installed/replayed suites exercise the installed definitions.
  if(!(await db.query("select to_regclass('private.crm_leads') present")).rows[0].present)await db.query(readFileSync(new URL('../supabase/migrations/20261014223057_platform_crm.sql',import.meta.url),'utf8'));
  if(!(await db.query("select to_regprocedure('private.crm_notification_projection(jsonb,uuid[],uuid)') present")).rows[0].present)await db.query(readFileSync(new URL('../supabase/migrations/20261014230819_platform_crm_projections.sql',import.meta.url),'utf8'));
  if(!(await db.query("select to_regprocedure('private.crm_lock_actor()') present")).rows[0].present)await db.query(readFileSync(new URL('../supabase/migrations/20261014232508_platform_crm_concurrency_guards.sql',import.meta.url),'utf8'));
  // Query-first forward identity probe; the suite rolls back every change.
  await db.query(readFileSync(new URL('../supabase/migrations/20261014233637_platform_crm_notification_identity.sql',import.meta.url),'utf8'));
  for(const [k,id]of Object.entries(users)){await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,`${id}@crm-fixture.invalid`]);await db.query('insert into auth.sessions(id,user_id,created_at,updated_at) values($1,$2,now(),now())',[sessions[k],id]);}
  await db.query('insert into public.platform_admins(user_id) values($1)',[users.admin]);
  await db.query('update private.crm_settings set primary_admin=$1,lead_time_hours=0,weekdays=array[0,1,2,3,4,5,6],blocked_dates=\'{}\'',[users.admin]);
  if((await db.query("select to_regclass('private.platform_administrator_registration') present")).rows[0].present)await db.query('update private.platform_administrator_registration set user_id=$1',[users.admin]);
  await db.query("insert into public.permission_grants(user_id,capability,scope,source) values($1,'platform.support.read','{\"all\":true}','manual')",[users.support]);
  const input={kind:'trial',name:'FICTITIOUS contact',company:`FICTITIOUS CRM ${randomUUID()}`,email:`${randomUUID()}@crm-fixture.invalid`,phone:'0612345678',sector:'Schoonmaak',team:'1–10',goal:'Test intake',message:'FICTITIOUS original snapshot'};
  let receipt,day,first,second;
  await t.test('only live registered platform administrators can read or command, never support-only',async()=>{
   for(const who of['tenant','staff','support','outsider']){await denied(query('state',{},who));await denied(command('lead.create',input,who));}
   await denied(call('select public.crm_intake($1,$2,$3) data',[input,randomUUID(),'a'.repeat(64)],'outsider','anon'));
   await denied(call('select public.crm_availability(current_date) data',[],'support'));
   for(const table of['crm_settings','crm_leads','crm_requests','crm_activities','crm_tasks','crm_appointments','crm_receipts','crm_rate_windows','crm_audit']){
    const flags=(await db.query('select relrowsecurity,relforcerowsecurity from pg_class where oid=$1::regclass',[`private.${table}`])).rows[0];assert.ok(flags.relrowsecurity&&flags.relforcerowsecurity);
    for(const role of['anon','authenticated','service_role'])await denied(call(`select * from private.${table}`,[],'admin',role));
   }
  });
  await t.test('trial records one lead, immutable request, task, history and tenantless outbox atomically; retries are idempotent',async()=>{
   const key=randomUUID();receipt=await intake(input,key);assert.equal(receipt.ok,true);assert.equal(receipt.appointmentId,undefined);
   assert.deepEqual(await intake(input,key),receipt);
   await assert.rejects(intake({...input,message:'Changed'},key),e=>e.code==='23514');
   for(const [table,where,value]of[['crm_requests','id',receipt.requestId],['crm_tasks','request_id',receipt.requestId]])assert.equal((await db.query(`select count(*)::integer n from private.${table} where ${where}=$1`,[value])).rows[0].n,1);
   const event=(await db.query("select e.tenant_id,e.event_type from public.outbox_events e join private.notification_requests n on n.outbox_event_id=e.id where n.source_kind='crm' and n.source_id=$1",[receipt.requestId])).rows[0];assert.equal(event.tenant_id,null);assert.equal(event.event_type,'notification.requested');
   assert.equal((await db.query('select count(*)::integer n from private.crm_activities where lead_id=$1',[receipt.leadId])).rows[0].n,1);
   const again=await intake({...input,name:'FICTITIOUS new contact',message:'FICTITIOUS later snapshot'});assert.equal(again.leadId,receipt.leadId);assert.notEqual(again.requestId,receipt.requestId);
   const state=await query('state',{lead:receipt.leadId});assert.equal(state.detail.requests.length,2);assert.equal(state.detail.requests.find(r=>r.id===receipt.requestId).message,input.message);
   const normalized=await intake({...input,company:input.company.replaceAll(' ','   '),name:'FICTITIOUS latest contact',phone:'0611122233',message:'FICTITIOUS normalized company'});assert.equal(normalized.leadId,receipt.leadId);
   const current=(await query('state',{lead:receipt.leadId})).detail;assert.equal(current.lead.name,'FICTITIOUS latest contact');assert.equal(current.lead.phone,'0611122233');assert.equal(current.requests.find(r=>r.id===receipt.requestId).name,input.name);
  });
  await t.test('forged owner/provider fields, missing phone and invalid slots fail without partial records',async()=>{
   await assert.rejects(intake({...input,adminEmail:'forged@crm-fixture.invalid'}),e=>e.code==='22023');
   await assert.rejects(intake({...input,date:'2030-01-01',time:'09:00'}),e=>e.code==='22023');
   await assert.rejects(intake({...input,kind:'demo',date:'2026-10-25',time:'02:30',phone:''}),e=>e.code==='22023');
   await assert.rejects(command('lead.update',{id:receipt.leadId,revision:1,owner:users.outsider}),e=>e.code==='22023');
   const key=randomUUID();await assert.rejects(intake({...input,kind:'demo',date:'2030-01-01',time:'09:00'},key),e=>e.code==='23P01');assert.equal((await db.query("select count(*)::int n from private.crm_receipts where scope='public' and request_id=$1",[key])).rows[0].n,0);
  });
  await t.test('calendar slots, overlap and failed rescheduling preserve the original booking; cancellation reopens the slot',async()=>{
   day=(await db.query("select to_char((now() at time zone 'Europe/Amsterdam')::date+2,'YYYY-MM-DD') as booking_day")).rows[0].booking_day;
   const availability=await call('select public.crm_availability($1) data',[day]);assert.ok(availability.slots.length>=2);const [time,next]=availability.slots;
   first=await intake({...input,kind:'appointment',date:day,time});second=await intake({...input,kind:'demo',date:day,time:next});assert.ok(first.appointmentId&&second.appointmentId);
   await assert.rejects(intake({...input,kind:'demo',date:day,time}),e=>e.code==='23P01');
   await assert.rejects(command('appointment.update',{id:first.appointmentId,revision:1,action:'reschedule',date:day,time:next}),e=>e.code==='23P01');
   const unchanged=await query('appointment',{id:first.appointmentId});assert.equal(unchanged.time,time);assert.equal(unchanged.revision,1);
   const id=randomUUID(),cancel={id:first.appointmentId,revision:1,action:'cancel'};await command('appointment.update',cancel,'admin',id);await command('appointment.update',cancel,'admin',id);
   const reopened=await call('select public.crm_availability($1) data',[day]);assert.ok(reopened.slots.includes(time));assert.ok(!reopened.slots.includes(next));
  });
  await t.test('Amsterdam spring gap and autumn overlap round-trip to unambiguous UTC instants',async()=>{
   await db.query('savepoint dst_gap');await assert.rejects(db.query("select private.crm_local_instant('2026-03-29','02:30')"),e=>e.code==='23P01');await db.query('rollback to savepoint dst_gap');await db.query('release savepoint dst_gap');
   const times=(await db.query("select private.crm_local_instant('2026-03-29','03:00') spring,private.crm_local_instant('2026-10-25','02:30') autumn")).rows[0];
   assert.equal(times.spring.toISOString(),'2026-03-29T01:00:00.000Z');assert.equal(times.autumn.toISOString(),'2026-10-25T01:30:00.000Z');
  });
  await t.test('revision conflicts and duplicate commands are tested at the database boundary',async()=>{
   const state=await query('state',{lead:receipt.leadId});const lead=state.leads.find(l=>l.id===receipt.leadId);const id=randomUUID();
   await command('lead.update',{id:lead.id,revision:lead.revision,stage:'proposal'},'admin',id);
   await command('lead.update',{id:lead.id,revision:lead.revision,stage:'proposal'},'admin',id);
   await assert.rejects(command('lead.update',{id:lead.id,revision:lead.revision,stage:'won'}),e=>e.code==='40001');
   await db.query('delete from public.platform_admins where user_id=$1',[users.admin]);await denied(query());await db.query('insert into public.platform_admins(user_id) values($1)',[users.admin]);
   if((await db.query("select to_regclass('private.platform_administrator_registration') present")).rows[0].present){assert.equal((await db.query('select private.crm_primary_admin() id')).rows[0].id,null);await call('select public.platform_register_primary_admin($1) data',[users.admin],'admin','service_role');}
  });
  await t.test('server pages keep full-selection counts, snapshot search and independently paged dossiers',async()=>{
   const marker='FICTITIOUS-PAGES-'+randomUUID();
   await db.query("insert into private.crm_leads(name,company,email,owner_id) select 'FICTITIOUS page contact',$1||'-'||n,n||'-'||$1||'@crm-fixture.invalid',$2 from generate_series(1,55)n",[marker,users.admin]);
   const one=await query('state',{tab:'pipeline',search:marker,page:1,pageSize:5});const two=await query('state',{tab:'pipeline',search:marker,page:2,pageSize:5});
   assert.equal(one.pagination.total,55);assert.equal(one.pageLeadIds.length,5);assert.equal(one.selection.new.count,55);assert.equal(new Set([...one.pageLeadIds,...two.pageLeadIds]).size,10);
   const before=(await db.query('select count(*)::int n from private.crm_requests where lead_id=$1',[receipt.leadId])).rows[0].n;
   await db.query("insert into private.crm_requests(lead_id,kind,snapshot) select $1,'trial',jsonb_build_object('company',$2::text,'name','FICTITIOUS history','email','snapshot@crm-fixture.invalid','message','FICTITIOUS paged history '||n) from generate_series(1,65)n",[receipt.leadId,marker]);
   const detailed=await query('state',{tab:'pipeline',search:marker,lead:receipt.leadId,page:2,pageSize:5,detailPage:2,detailPageSize:10});
   assert.equal(detailed.pageLeadIds.length,5);assert.ok(!detailed.pageLeadIds.includes(receipt.leadId));assert.equal(detailed.detail.lead.id,receipt.leadId);assert.equal(detailed.detail.totals.requests,before+65);assert.equal(detailed.detail.requests.length,10);assert.equal(detailed.detail.pageSize,10);assert.equal(detailed.requests.length,0);
   const snapshot=await query('state',{tab:'requests',search:'FICTITIOUS later snapshot',pageSize:5});assert.equal(snapshot.pagination.total,1);assert.equal(snapshot.requests[0].message,'FICTITIOUS later snapshot');
   const empty=await query('state',{tab:'pipeline',search:marker+'-absent'});assert.equal(empty.pagination.total,0);assert.deepEqual(empty.selection,{});
   const overview=await query('overview');assert.equal(overview.requests.length,3);assert.equal(overview.counts.requests,(await db.query('select count(*)::int n from private.crm_requests')).rows[0].n);assert.ok(overview.counts.stages&&typeof overview.counts.stages==='object');
  });
  await t.test('calendar wall-clock stepping and closing boundary agree with booking validation',async()=>{
   await db.query('savepoint closing_boundary');
   await db.query("update private.crm_settings set start_time='23:30',end_time='23:59',buffer_minutes=0");
   const slots=await call('select public.crm_availability($1) data',[day]);assert.deepEqual(slots.slots,[]);
   await assert.rejects(intake({...input,kind:'demo',date:day,time:'23:30'}),e=>e.code==='23P01');
   await db.query('rollback to savepoint closing_boundary');await db.query('release savepoint closing_boundary');
  });
  await t.test('central queue prepares a platform delivery, respects opt-out and freezes the primary registered recipient',async()=>{
   const event=(await db.query("select outbox_event_id from private.notification_requests where source_kind='crm' and source_id=$1",[receipt.requestId])).rows[0].outbox_event_id;
   await call('select public.notification_outbox_prepare($1) data',[event],'admin','service_role');
   assert.equal((await db.query('select status from public.outbox_events where id=$1',[event])).rows[0].status,'sent');
   const notificationId=(await db.query("select id from private.notification_requests where source_kind='crm' and source_id=$1",[receipt.requestId])).rows[0].id;
   await call('select public.notification_delivery_prepare($1) data',[notificationId],'admin','service_role');
   const n=(await db.query("select d.*,r.source_id from private.notification_deliveries d join private.notification_requests r on r.id=d.request_id where r.source_kind='crm' and r.source_id=$1 and d.channel='email'",[receipt.requestId])).rows[0];
   assert.ok(n);assert.equal(n.tenant_id,null);assert.equal(n.snapshot.recipient,`${users.admin}@crm-fixture.invalid`);assert.equal(n.snapshot.slug,'');assert.equal(n.state,'queued');
   assert.ok(n.snapshot.body.includes(input.company));assert.equal(n.snapshot.path,`/platform/crm?tab=requests&lead=${receipt.leadId}`);
   await db.query('update private.crm_settings set email_enabled=false');
   const p=(await db.query("select private.notification_policy(null,'crm.intake','platform','email',$1) p",[users.admin])).rows[0].p;assert.equal(p.allowed,false);assert.equal(p.reason,'crm_email_off');
   const inbox=(await db.query("select private.notification_policy(null,'crm.intake','platform','in_app',$1) p",[users.admin])).rows[0].p;assert.equal(inbox.allowed,true);
   const historic=n.snapshot.recipient;await db.query('update auth.users set email=$1 where id=$2',[`new-${users.admin}@crm-fixture.invalid`,users.admin]);assert.equal((await db.query('select snapshot from private.notification_deliveries where id=$1',[n.id])).rows[0].snapshot.recipient,historic);
  });
  await t.test('CRM retry resolves its payload parameter, requires explicit retry rights and preserves frozen delivery identity',async()=>{
   const d=(await db.query("select d.* from private.notification_deliveries d join private.notification_requests r on r.id=d.request_id where r.source_kind='crm' and r.source_id=$1 and d.channel='email'",[receipt.requestId])).rows[0];
   const frozen=d.snapshot;
   await db.query('update auth.users set email=$1 where id=$2',[`${users.admin}@crm-fixture.invalid`,users.admin]);
   await db.query("update private.crm_settings set email_enabled=true");
   await db.query("update private.notification_deliveries set available_at=now()-interval '1 second' where id=$1",[d.id]);
   const claims=await call('select public.notification_delivery_claim(100) data',[],'admin','service_role'),claim=claims.find(c=>c.id===d.id);assert.ok(claim);
   await call('select public.notification_delivery_begin($1,$2) data',[d.id,claim.lease],'admin','service_role');
   await call("select public.notification_delivery_finish($1,$2,'failed',null) data",[d.id,claim.lease],'admin','service_role');
   let revision=(await db.query('select revision from private.notification_deliveries where id=$1',[d.id])).rows[0].revision;
   assert.equal((await query('state',{tab:'settings'})).notificationContext.canRetry,false);
   await denied(command('notification.retry',{id:receipt.requestId,revision}));
   await db.query("insert into public.permission_grants(user_id,capability,scope,source) values($1,'platform.notifications.delivery.retry','{\"all\":true}','manual')",[users.admin]);
   assert.equal((await query('state',{tab:'settings'})).notificationContext.canRetry,true);
   await db.query('update auth.users set email=$1 where id=$2',[`changed-${users.admin}@crm-fixture.invalid`,users.admin]);
   await assert.rejects(command('notification.retry',{id:receipt.requestId,revision}),e=>e.code==='23514');
   await db.query('update auth.users set email=$1 where id=$2',[`${users.admin}@crm-fixture.invalid`,users.admin]);
   const key=randomUUID(),result=await command('notification.retry',{id:receipt.requestId,revision},'admin',key);assert.equal(result.ok,true);
   assert.deepEqual(await command('notification.retry',{id:receipt.requestId,revision},'admin',key),result);
   const current=(await db.query('select * from private.notification_deliveries where id=$1',[d.id])).rows[0];assert.equal(current.state,'queued');assert.equal(Number(current.revision),Number(revision)+1);assert.deepEqual(current.snapshot,frozen);
   await assert.rejects(command('notification.retry',{id:receipt.requestId,revision:current.revision}),e=>e.code==='23514');
   await db.query("update private.notification_deliveries set available_at=now()-interval '1 second' where id=$1",[d.id]);
   const next=(await call('select public.notification_delivery_claim(100) data',[],'admin','service_role')).find(c=>c.id===d.id);assert.ok(next);
   await call('select public.notification_delivery_begin($1,$2) data',[d.id,next.lease],'admin','service_role');await call("select public.notification_delivery_finish($1,$2,'uncertain',null) data",[d.id,next.lease],'admin','service_role');
   revision=(await db.query('select revision from private.notification_deliveries where id=$1',[d.id])).rows[0].revision;
   await assert.rejects(command('notification.retry',{id:receipt.requestId,revision}),e=>e.code==='23514');
  });
  await t.test('CRM notification body and mutations disappear after registry revocation even when general inbox rights remain',async()=>{
   const notice=(await db.query("select d.id from private.notification_deliveries d join private.notification_requests r on r.id=d.request_id where r.source_kind='crm' and r.source_id=$1 and d.channel='in_app'",[receipt.requestId])).rows[0];
   await db.query("update private.notification_deliveries set available_at=now()-interval '1 second' where id=$1",[notice.id]);
   const claimed=await call('select public.notification_delivery_claim(100) data',[],'admin','service_role');const claim=claimed.find(c=>c.id===notice.id);assert.ok(claim);
   await call('select public.notification_delivery_begin($1,$2) data',[notice.id,claim.lease],'admin','service_role');
   await db.query("insert into public.permission_grants(user_id,capability,scope,source) values($1,'platform.notifications.read','{\"all\":true}','manual')",[users.admin]);
   assert.ok((await call('select id from public.notifications where id=$1',[notice.id])).some(row=>row.id===notice.id),JSON.stringify((await db.query("select n.id,n.status,n.user_id,private.notification_source_allowed(n.tenant_id,n.type_code,n.source_kind,n.source_id,n.source_revision,$2,'platform') allowed from public.notifications n where n.id=$1",[notice.id,users.admin])).rows));
   const inbox=(payload)=>call("select public.notification_query(null,'platform',$1,$2) data",[payload.notification_id?'detail':'inbox',payload]);
   assert.ok(JSON.stringify(await inbox({notification_id:notice.id})).includes(input.company));
   await db.query('update auth.users set email_confirmed_at=null where id=$1',[users.admin]);
   assert.deepEqual(await call('select id from public.notifications where id=$1',[notice.id]),[]);await denied(inbox({notification_id:notice.id}));
   await db.query('update auth.users set email_confirmed_at=now() where id=$1',[users.admin]);
   await db.query('delete from public.platform_admins where user_id=$1',[users.admin]);
   assert.deepEqual(await call('select id from public.notifications where id=$1',[notice.id]),[]);
   assert.ok(!JSON.stringify(await inbox({})).includes(input.company));await denied(inbox({notification_id:notice.id}));
   await denied(call("select public.notification_command(null,'platform','inbox_read',$1,$2) data",[{id:notice.id},randomUUID()]));
   await db.query('insert into public.platform_admins(user_id) values($1)',[users.admin]);
  });
 }finally{await db.query('rollback');await db.end();}
});
