import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { workOrderTestDatabase } from './work-order-test-target.mjs';

test('Central notifications: immutable delivery, current policy and device generations', async t => {
 const db=await workOrderTestDatabase();await db.query('begin');
 const tenant=randomUUID(),user=randomUUID(),other=randomUUID(),session=randomUUID(),otherSession=randomUUID(),announcement=randomUUID();
 const call=async(sql,args=[],role='service_role',actor=user)=>{await db.query('savepoint op');try{await db.query(`set local role ${role}`);await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role,sub:actor,session_id:session})]);const x=await db.query(sql,args);await db.query('reset role');await db.query("select set_config('request.jwt.claims','{}',true)");await db.query('release savepoint op');return x.rows;}catch(e){await db.query('rollback to savepoint op');await db.query('release savepoint op');throw e;}};
 const push=async(action,input={},actor=user,sid=session)=>(await call("select public.notification_push_device($1,'staff',$2,$3,$4,$5) data",[tenant,actor,sid,action,{origin:'https://notification-fixture.invalid',...input}]))[0].data;
 const subscription={endpoint:`https://fcm.googleapis.com/fcm/send/${randomUUID()}`,keys:{p256dh:'a'.repeat(87),auth:'b'.repeat(22)}};
 const seedRequest=async(key)=>{const outbox=(await db.query("insert into public.outbox_events(tenant_id,event_type,aggregate_type,aggregate_id,payload,idempotency_key) values($1,'announcement.published','announcement',$2,'{\"send_push\":true}',$3) returning id",[tenant,announcement,key])).rows[0].id;await call('select public.notification_outbox_prepare($1)',[outbox]);return(await db.query("select id from private.notification_requests where source_kind='outbox' and source_id=$1 and payload->>'recipient_user_id'=$2",[outbox,user])).rows[0].id;};
 let request,device,claims,email;
 try {
  for(const [u,s]of[[user,session],[other,otherSession]]){await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[u,`${u}@notification-fixture.invalid`]);await db.query('insert into auth.sessions(id,user_id,created_at,updated_at) values($1,$2,now(),now())',[s,u]);}
  await db.query("insert into public.tenants(id,slug,name) values($1,$2,'Frozen fixture company')",[tenant,`notify-${tenant}`]);await db.query("insert into public.tenant_settings(tenant_id,enabled_services) values($1,array['personeel','planning'])",[tenant]);
  for(const u of[user,other]){await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['staff']::public.app_role[],'active')",[tenant,u]);await db.query("insert into public.personnel(tenant_id,user_id,full_name) values($1,$2,'Fictitious notification recipient')",[tenant,u]);}
  await db.query("insert into public.announcements(id,tenant_id,title,body,audience_roles,published_at,send_push,created_by) values($1,$2,'Private source title','SOURCE-CANARY',array['staff']::public.app_role[],now(),true,$3)",[announcement,tenant,other]);
  await db.query("insert into private.notification_policies(tenant_id,scope,type_code,channel,mode) values($1,'tenant','announcement.published','email','on')",[tenant]);
  await t.test('subscribe binds live account/session and raw device writes are denied',async()=>{
   const registered=await push('subscribe',subscription);assert.equal(registered.active,true);device=registered.currentDeviceId;assert.deepEqual(registered.contexts,['staff']);
   assert.equal((await push('status',{endpoint:subscription.endpoint})).currentDeviceId,device);
   await assert.rejects(call('select * from public.push_subscriptions',[],'authenticated'),e=>e.code==='42501');
   await assert.rejects(call("select public.ticket_push_subscription('staff',$1,'subscribe',$2)",[tenant,subscription],'authenticated'),e=>e.code==='42501');
  });
  await t.test('fanout freezes content and generates one delivery per device/channel',async()=>{
   request=await seedRequest(`fixture-${randomUUID()}`);assert.equal((await call('select public.notification_delivery_prepare($1) n',[request]))[0].n,0);
   const rows=(await db.query('select * from private.notification_deliveries where request_id=$1',[request])).rows;assert.equal(rows.length,3);assert.equal(rows.filter(d=>d.device_id===device).length,1);assert.equal(JSON.stringify(rows).includes('SOURCE-CANARY'),false);
   const snapshot=rows[0].snapshot;await db.query("update public.tenants set name='Changed fixture company' where id=$1",[tenant]);assert.deepEqual((await db.query('select snapshot from private.notification_deliveries where id=$1',[rows[0].id])).rows[0].snapshot,snapshot);
   await db.query("update private.notification_deliveries set available_at=now()-interval '1 second' where tenant_id=$1",[tenant]);claims=(await call('select public.notification_delivery_claim(25,$1) data',[tenant]))[0].data;email=rows.find(d=>d.channel==='email');
  });
  await t.test('provider begin/finish exact binding, failed retry, accepted never repeats',async()=>{
   const claim=claims.find(c=>c.id===email.id);assert.ok((await call('select public.notification_delivery_begin($1,$2) data',[email.id,claim.lease]))[0].data);
   const args=[tenant,'announcement.published','staff','email',user,email.id,`notification-${email.id}`];
   const gate=async(operation,input)=>(await call('select public.notification_provider_gate($1,$2,$3,$4,$5,$6,$7,$8,$9) data',[operation,...args,input]))[0].data;
   const input={source_kind:'delivery',recipient:`${user}@notification-fixture.invalid`};const begin=await gate('begin',input);assert.equal(begin.allowed,true);
   assert.equal((await gate('finish',{...input,permit_id:begin.id,outcome:'failed'})).ok,true);
   const retry=await gate('begin',input);assert.equal(retry.allowed,true);assert.notEqual(retry.id,begin.id);
   assert.equal((await gate('finish',{...input,permit_id:retry.id,outcome:'accepted'})).ok,true);assert.equal((await gate('begin',input)).reason,'already_started');
   assert.equal((await call("select public.notification_delivery_finish($1,$2,'sent','fixture-provider-id') ok",[email.id,claim.lease]))[0].ok,true);
   assert.equal((await call("select public.notification_delivery_finish($1,$2,'failed') ok",[email.id,claim.lease]))[0].ok,false);
  });
  await t.test('account switching invalidates previous generation before provider delivery',async()=>{
   const result=await push('subscribe',subscription,other,otherSession);assert.notEqual(result.currentDeviceId,device);
   const row=(await db.query("select id from private.notification_deliveries where request_id=$1 and channel='push'",[request])).rows[0];const claim=claims.find(c=>c.id===row.id);
   assert.equal((await call('select public.notification_delivery_begin($1,$2) data',[row.id,claim.lease]))[0].data,null);
   assert.equal((await db.query('select state from private.notification_deliveries where id=$1',[row.id])).rows[0].state,'cancelled');
   await call('select public.notification_device_logout($1,$2)',[other,otherSession]);assert.equal((await push('status',{endpoint:subscription.endpoint},other,otherSession)).active,false);
  });
  await t.test('OFF permanently suppresses future work; re-enabling never replays it',async()=>{
   const id=await seedRequest(`fixture-off-${randomUUID()}`);await db.query("update private.notification_deliveries set available_at=now()+interval '1 day' where request_id=$1",[id]);
   await db.query("insert into private.notification_policies(tenant_id,scope,type_code,mode) values($1,'tenant','announcement.published','off')",[tenant]);await db.query('select private.notification_suppress_pending()');
   assert.ok((await db.query('select state from private.notification_deliveries where request_id=$1',[id])).rows.every(d=>['suppressed','cancelled'].includes(d.state)));
   await db.query("update private.notification_policies set mode='on' where tenant_id=$1 and channel is null",[tenant]);assert.ok((await db.query('select state from private.notification_deliveries where request_id=$1',[id])).rows.every(d=>['suppressed','cancelled'].includes(d.state)));
  });
  await t.test('quiet hours defer external channels but allow in-app; retry freezes the transport',async()=>{
   await db.query("insert into private.notification_preferences(tenant_id,user_id,context,quiet_start,quiet_end,timezone) values($1,$2,'staff',((now() at time zone 'Europe/Amsterdam')-interval '1 hour')::time,((now() at time zone 'Europe/Amsterdam')+interval '1 hour')::time,'Europe/Amsterdam')",[tenant,user]);
   const id=await seedRequest(`fixture-quiet-${randomUUID()}`);const rows=(await db.query('select * from private.notification_deliveries where request_id=$1',[id])).rows;
   const mail=rows.find(d=>d.channel==='email'),notice=rows.find(d=>d.channel==='in_app');assert.equal(mail.state,'deferred');assert.equal(notice.state,'queued');
   await db.query("update private.notification_deliveries set available_at=now()-interval '1 second' where request_id=$1 and channel='in_app'",[id]);
   const claimed=(await call('select public.notification_delivery_claim(100,$1) data',[tenant]))[0].data;const inApp=claimed.find(c=>c.id===notice.id);assert.ok(inApp);
   assert.equal((await call('select public.notification_delivery_begin($1,$2) data',[notice.id,inApp.lease]))[0].data,null);
   assert.equal((await db.query('select status,type_code,source_kind from public.notifications where id=$1',[notice.id])).rows[0].status,'sent');
   assert.equal((await call('select id from public.notifications where id=$1',[notice.id],'authenticated'))[0].id,notice.id);
   await db.query('delete from private.notification_preferences where tenant_id=$1',[tenant]);await db.query("update private.notification_deliveries set available_at=now()-interval '1 second' where id=$1",[mail.id]);
   const retry=(await call('select public.notification_delivery_claim(100,$1) data',[tenant]))[0].data.find(c=>c.id===mail.id);assert.ok(retry);assert.ok((await call('select public.notification_delivery_begin($1,$2) data',[mail.id,retry.lease]))[0].data);
   const frozen={subject:'FROZEN FIXTURE',html:'<p>Frozen</p>',text:'Frozen',fromEmail:'fixture@notification-fixture.invalid',fromName:'Fixture'};
   assert.deepEqual((await call('select public.notification_delivery_freeze($1,$2,$3) data',[mail.id,retry.lease,frozen]))[0].data,frozen);
   assert.deepEqual((await call('select public.notification_delivery_freeze($1,$2,$3) data',[mail.id,retry.lease,{...frozen,subject:'Changed'}]))[0].data,frozen);
   await db.query("update private.notification_deliveries set locked_until=now()-interval '1 minute' where id=$1",[mail.id]);await call('select public.notification_delivery_claim(100,$1)',[tenant]);
   assert.equal((await db.query('select state from private.notification_deliveries where id=$1',[mail.id])).rows[0].state,'uncertain');assert.equal((await call("select public.notification_delivery_finish($1,$2,'failed') ok",[mail.id,retry.lease]))[0].ok,false);
  });
  await t.test('two active devices get separate outcomes and an expired device does not repeat the accepted one',async()=>{
   const a=await push('subscribe',{...subscription,endpoint:subscription.endpoint+'-a'}),b=await push('subscribe',{...subscription,endpoint:subscription.endpoint+'-b'});
   const id=await seedRequest(`fixture-devices-${randomUUID()}`);const rows=(await db.query("select * from private.notification_deliveries where request_id=$1 and channel='push'",[id])).rows;assert.equal(rows.length,2);
   await db.query("update private.notification_deliveries set available_at=now()-interval '1 second' where request_id=$1",[id]);const batch=(await call('select public.notification_delivery_claim(100,$1) data',[tenant]))[0].data;
   const first=rows.find(d=>d.device_id===a.currentDeviceId),second=rows.find(d=>d.device_id===b.currentDeviceId),one=batch.find(c=>c.id===first.id),two=batch.find(c=>c.id===second.id);
   assert.ok((await call('select public.notification_delivery_begin($1,$2) data',[first.id,one.lease]))[0].data);await call("select public.notification_delivery_finish($1,$2,'sent')",[first.id,one.lease]);
   assert.ok((await call('select public.notification_delivery_begin($1,$2) data',[second.id,two.lease]))[0].data);await call("select public.notification_delivery_finish($1,$2,'cancelled')",[second.id,two.lease]);
   assert.equal((await push('status',{endpoint:subscription.endpoint+'-b'})).active,false);
   assert.equal((await call('select public.notification_delivery_begin($1,$2) data',[first.id,one.lease]))[0].data,null);
   assert.equal((await db.query('select state from private.notification_deliveries where id=$1',[first.id])).rows[0].state,'sent');
  });
  await t.test('delivery UI filters preserve snake-case fields and frozen template revision',async()=>{
   const member=(await db.query('select id from public.tenant_memberships where tenant_id=$1 and user_id=$2',[tenant,user])).rows[0].id;
   await db.query("insert into public.permission_grants(tenant_id,user_id,membership_id,capability,scope) values($1,$2,$3,'notifications.delivery.read','{\"all\":true}')",[tenant,user,member]);
   const result=(await db.query("select private.notification_delivery_query($1,'backoffice',$2,'delivery',$3) data",[tenant,user,{type_code:'announcement.published',channel:'email',page_size:5}])).rows[0].data;
   assert.ok(result.total>0);assert.ok(result.items.length<=5);assert.equal(result.page_size,5);assert.ok(result.items.every(d=>d.type_code==='announcement.published'&&d.channel==='email'&&d.template_version>0&&typeof d.recipient_label==='string'));
   assert.equal((await db.query("select private.notification_delivery_query($1,'backoffice',$2,'delivery',$3) data",[tenant,user,{type_code:'missing'}])).rows[0].data.total,0);
   const ordinary=randomUUID(),security=randomUUID();
   await db.query("insert into public.mail_deliveries(id,tenant_id,recipient,template,idempotency_key,status,template_revision,render_snapshot) values($1,$2,'PRIVATE-RECIPIENT-CANARY@notification-fixture.invalid','invoice',$3,'sent',3,$4)",[ordinary,tenant,`ordinary-${ordinary}`,{invoice_id:randomUUID(),delivery:{subject:'PRIVATE-MAIL-CANARY',text:'Never expose this',html:'<p>Private</p>',templateRevision:3}}]);
   await db.query("insert into public.mail_deliveries(id,tenant_id,recipient,template,idempotency_key,status) values($1,$2,'activation@notification-fixture.invalid','personnel_invitation',$3,'sent')",[security,tenant,`security-${security}`]);
   const metadata=(await db.query("select private.notification_delivery_query($1,'backoffice',$2,'delivery',$3) data",[tenant,user,{type_code:'invoice.available',channel:'email'}])).rows[0].data;
   assert.equal(metadata.total,1);assert.equal(metadata.items[0].id,ordinary);assert.equal(metadata.items[0].template_version,3);assert.deepEqual(metadata.items[0].permissions,[]);assert.ok(!JSON.stringify(metadata).includes('CANARY'));
   const search=async(term)=>(await db.query("select private.notification_delivery_query($1,'backoffice',$2,'delivery',$3) data",[tenant,user,{search:term,page_size:5}])).rows[0].data;
   const byType=await search('  INVOICE.AVAILABLE  ');assert.equal(byType.total,1);assert.deepEqual(byType.items.map(d=>d.id),[ordinary]);
   assert.equal((await search(`no-match-${randomUUID()}`)).total,0);assert.deepEqual((await search('PRIVATE-RECIPIENT-CANARY')).items,[]);assert.equal((await search('PRIVATE-MAIL-CANARY')).total,0);
   assert.equal((await db.query("select private.notification_delivery_query($1,'backoffice',$2,'delivery',$3) data",[tenant,user,{type_code:'personnel.invitation'}])).rows[0].data.total,0);
  });
  await t.test('delivery search uses the displayed label and cannot reveal platform-hidden recipient identity',async()=>{
   await db.query('savepoint delivery_search');
   try{
    const label=`Visible-fixture-${randomUUID()}`;
    await db.query("update auth.users set raw_user_meta_data=jsonb_build_object('full_name',$2::text) where id=$1",[user,label]);
    const id=await seedRequest(`fixture-search-${randomUUID()}`);
    const expected=(await db.query('select count(*)::int n from private.notification_deliveries where request_id=$1',[id])).rows[0].n;assert.ok(expected>0);
    const query=async(ctx,search)=>(await db.query('select private.notification_delivery_query($1,$2,$3,\'delivery\',$4) data',[ctx==='platform'?null:tenant,ctx,user,{tenant_id:tenant,search,page_size:5}])).rows[0].data;
    const visible=await query('backoffice',label.toUpperCase());assert.equal(visible.total,expected);assert.ok(visible.items.every(d=>d.recipient_label===label));
    await db.query("insert into public.permission_grants(user_id,capability,scope) values($1,'platform.notifications.delivery.read','{\"all\":true}')",[user]);
    assert.equal((await query('platform',label)).total,0);assert.equal((await query('platform',`${user}@notification-fixture.invalid`)).total,0);
    const generic=await query('platform','Afgeschermde ontvanger');assert.ok(generic.total>0);assert.ok(generic.items.every(d=>d.recipient_label==='Afgeschermde ontvanger'));
    assert.equal((await query('backoffice','%')).total,0);
   }finally{await db.query('rollback to savepoint delivery_search');await db.query('release savepoint delivery_search');}
  });
  await t.test('old workers cannot claim or discard central events and old dossier provider owner is disabled',async()=>{
   const queued=(await db.query("insert into public.outbox_events(tenant_id,event_type,aggregate_type,aggregate_id,payload,idempotency_key) values($1,'notification.requested','notification',$2,'{}',$3) returning id",[tenant,randomUUID(),`old-worker-${randomUUID()}`])).rows[0].id;
   const old=await call('select id from public.claim_outbox(100,60,true,$1)',[tenant]);assert.equal(old.some(x=>x.id===queued),false);
   assert.equal((await db.query('select status from public.outbox_events where id=$1',[queued])).rows[0].status,'queued');
   assert.ok((await call('select id from public.claim_outbox(100,60,true,$1,true)',[tenant])).some(x=>x.id===queued));
   assert.deepEqual(await call('select * from public.claim_personnel_dossier_deliveries(100)'),[]);
  });
  await t.test('scheduled dossier jobs use the central owner and recheck active HR authorization',async()=>{
   const person=(await db.query('select id from public.personnel where tenant_id=$1 and user_id=$2',[tenant,user])).rows[0].id,item=randomUUID(),job=randomUUID();
   await db.query("update public.tenant_memberships set roles=array['staff','hr']::public.app_role[] where tenant_id=$1 and user_id=$2",[tenant,user]);
   await db.query("insert into public.personnel_dossier_items(id,tenant_id,personnel_id,kind,title,dossier_status) values($1,$2,$3,'task','PRIVATE-DOSSIER-CANARY','open')",[item,tenant,person]);
   const revision=(await db.query('select dossier_revision from public.personnel_dossier_items where id=$1',[item])).rows[0].dossier_revision;
   await db.query("insert into public.personnel_dossier_deliveries(id,tenant_id,personnel_id,source_table,source_id,source_revision,recipient,due_on,available_at) values($1,$2,$3,'personnel_dossier_items',$4,$5,$6,current_date,now()-interval '1 minute')",[job,tenant,person,item,revision,`${user}@notification-fixture.invalid`]);
   assert.equal((await call('select public.notification_prepare_dossier(25,$1) n',[tenant]))[0].n,1);assert.equal((await call('select public.notification_prepare_dossier(25,$1) n',[tenant]))[0].n,0);
   const delivery=(await db.query("select d.* from private.notification_deliveries d join private.notification_requests r on r.id=d.request_id where r.source_kind='dossier' and r.source_id=$1",[job])).rows[0];assert.ok(delivery);assert.ok(!JSON.stringify(delivery.snapshot).includes('PRIVATE-DOSSIER-CANARY'));
   const claim=(await call('select public.notification_delivery_claim(100,$1) data',[tenant]))[0].data.find(c=>c.id===delivery.id);assert.ok(claim);assert.ok((await call('select public.notification_delivery_begin($1,$2) data',[delivery.id,claim.lease]))[0].data);
   await call("select public.notification_delivery_finish($1,$2,'sent')",[delivery.id,claim.lease]);assert.deepEqual((await db.query('select status,attempts from public.personnel_dossier_deliveries where id=$1',[job])).rows[0],{status:'sent',attempts:1});
   const certificate=randomUUID(),qualificationJob=randomUUID();
   await db.query("insert into public.certificates(id,tenant_id,personnel_id,code,name,valid_from,expires_on,dossier_managed,dossier_status) values($1,$2,$3,'FIXTURE','PRIVATE-QUALIFICATION-CANARY','2090-01-01','2090-06-30',true,'unverified')",[certificate,tenant,person]);
   const qualificationRevision=(await db.query('select dossier_revision from public.certificates where id=$1',[certificate])).rows[0].dossier_revision;
   await db.query("insert into public.personnel_dossier_deliveries(id,tenant_id,personnel_id,source_table,source_id,source_revision,recipient,due_on,available_at) values($1,$2,$3,'certificates',$4,$5,$6,current_date,now()-interval '1 minute')",[qualificationJob,tenant,person,certificate,qualificationRevision,`${user}@notification-fixture.invalid`]);
   assert.equal((await call('select public.notification_prepare_dossier(25,$1) n',[tenant]))[0].n,1);
   const qualification=(await db.query("select r.type_code,d.snapshot,d.context from private.notification_deliveries d join private.notification_requests r on r.id=d.request_id where r.source_kind='dossier' and r.source_id=$1",[qualificationJob])).rows[0];
   assert.equal(qualification.type_code,'personnel.qualification');assert.equal(qualification.context,'backoffice');assert.ok(!JSON.stringify(qualification.snapshot).includes('PRIVATE-QUALIFICATION-CANARY'));
   assert.equal((await db.query("select private.notification_operational_source_allowed($1,'personnel.qualification','dossier',$2,$3,$4,'backoffice') ok",[tenant,qualificationJob,String(qualificationRevision),user])).rows[0].ok,true);
   assert.equal((await db.query("select private.notification_operational_source_allowed($1,'personnel.deadline','dossier',$2,$3,$4,'backoffice') ok",[tenant,qualificationJob,String(qualificationRevision),user])).rows[0].ok,false);
   await db.query("update public.tenant_memberships set roles=array['staff']::public.app_role[] where tenant_id=$1 and user_id=$2",[tenant,user]);assert.equal((await db.query("select private.notification_operational_source_allowed($1,'personnel.deadline','dossier',$2,$3,$4,'backoffice') ok",[tenant,job,String(revision),user])).rows[0].ok,false);
   assert.equal((await db.query("select private.notification_operational_source_allowed($1,'personnel.qualification','dossier',$2,$3,$4,'backoffice') ok",[tenant,qualificationJob,String(qualificationRevision),user])).rows[0].ok,false);
  });
  await t.test('future dossier reminders expire after their planned send and cannot reach a provider early',async()=>{
   await db.query('savepoint future_dossier');
   try{
    const person=(await db.query('select id from public.personnel where tenant_id=$1 and user_id=$2',[tenant,user])).rows[0].id,item=randomUUID(),job=randomUUID();
    await db.query("update public.tenant_memberships set roles=array['staff','hr']::public.app_role[] where tenant_id=$1 and user_id=$2",[tenant,user]);
    await db.query("insert into public.personnel_dossier_items(id,tenant_id,personnel_id,kind,title,dossier_status) values($1,$2,$3,'task','Future synthetic reminder','open')",[item,tenant,person]);
    const revision=(await db.query('select dossier_revision from public.personnel_dossier_items where id=$1',[item])).rows[0].dossier_revision;
    await db.query("insert into public.personnel_dossier_deliveries(id,tenant_id,personnel_id,source_table,source_id,source_revision,recipient,due_on,available_at) values($1,$2,$3,'personnel_dossier_items',$4,$5,$6,current_date+60,now()+interval '60 days')",[job,tenant,person,item,revision,`${user}@notification-fixture.invalid`]);
    const captured=(await db.query("select r.*,extract(epoch from r.expires_at-r.available_at)::integer lifetime_seconds,c.ttl_minutes*60 expected_seconds from private.notification_requests r join public.notification_catalog c on c.code=r.type_code where r.source_kind='dossier' and r.source_id=$1",[job])).rows[0];
    assert.ok(captured);assert.equal(captured.lifetime_seconds,captured.expected_seconds);assert.ok(captured.expires_at>captured.available_at);assert.equal(captured.prepared_at,null);
    assert.equal((await db.query('select status from public.personnel_dossier_deliveries where id=$1',[job])).rows[0].status,'scheduled');
    assert.equal((await db.query('select count(*)::integer n from private.notification_deliveries where request_id=$1',[captured.id])).rows[0].n,0);
    assert.equal((await call('select public.notification_delivery_prepare($1) n',[captured.id]))[0].n,1);
    const delivery=(await db.query('select * from private.notification_deliveries where request_id=$1',[captured.id])).rows[0];assert.equal(delivery.state,'queued');assert.equal(delivery.available_at.getTime(),captured.available_at.getTime());assert.ok(delivery.expires_at>delivery.available_at);
    assert.equal((await call('select public.notification_delivery_claim(100,$1) data',[tenant]))[0].data.some(c=>c.id===delivery.id),false);
    const permit=(await call("select public.notification_provider_gate('begin',$1,'personnel.deadline','backoffice','email',$2,$3,$4,$5) data",[tenant,user,delivery.id,`notification-${delivery.id}`,{source_kind:'delivery',recipient:`${user}@notification-fixture.invalid`}]))[0].data;assert.equal(permit.allowed,false);assert.equal(permit.reason,'source_unavailable');
    assert.equal((await db.query("select count(*)::integer n from private.notification_provider_permits where source_kind='delivery' and source_id=$1",[delivery.id])).rows[0].n,0);
   }finally{await db.query('rollback to savepoint future_dossier');await db.query('release savepoint future_dossier');}
  });
  await t.test('OFF invalidates an unadmitted sending lease even if ON returns before the held worker continues',async()=>{
   const id=await seedRequest(`fixture-off-race-${randomUUID()}`);const mail=(await db.query("select * from private.notification_deliveries where request_id=$1 and channel='email'",[id])).rows[0];
   await db.query("update private.notification_deliveries set available_at=now()-interval '1 second' where id=$1",[mail.id]);const claim=(await call('select public.notification_delivery_claim(100,$1) data',[tenant]))[0].data.find(c=>c.id===mail.id);
   assert.ok((await call('select public.notification_delivery_begin($1,$2) data',[mail.id,claim.lease]))[0].data);
   await db.query("update private.notification_policies set mode='off' where tenant_id=$1 and channel is null",[tenant]);await db.query('select private.notification_suppress_pending()');await db.query("update private.notification_policies set mode='on' where tenant_id=$1 and channel is null",[tenant]);
   assert.equal((await db.query('select state from private.notification_deliveries where id=$1',[mail.id])).rows[0].state,'suppressed');
   const gate=(await call("select public.notification_provider_gate('begin',$1,'announcement.published','staff','email',$2,$3,$4,$5) data",[tenant,user,mail.id,`notification-${mail.id}`,{source_kind:'delivery',recipient:`${user}@notification-fixture.invalid`}]))[0].data;
   assert.equal(gate.allowed,false);assert.equal(gate.reason,'source_unavailable');
  });
  await t.test('published safe push templates freeze separately from source prose and TTL follows remaining expiry',async()=>{
   const publish=async(body)=>{
    const definition={title:'Update van {bedrijfsnaam}',body,cta_label:'Bekijken'};
    await db.query("insert into private.notification_templates(tenant_id,type_code,context,channel,draft) values($1,'announcement.published','staff','push',$2) on conflict do nothing",[tenant,definition]);
    const template=(await db.query("select id,revision from private.notification_templates where tenant_id=$1 and type_code='announcement.published' and context='staff' and channel='push'",[tenant])).rows[0];
    const base=(await db.query("select active_version_id from private.notification_templates where tenant_id is null and type_code='announcement.published' and context='staff' and channel='push'")).rows[0].active_version_id;
    const version=(await db.query('insert into private.notification_template_versions(template_id,revision,definition,base_version_id,actor_id) values($1,$2,$3,$4,$5) returning id',[template.id,Number(template.revision)+1,definition,base,user])).rows[0].id;
    await db.query("update private.notification_templates set active_version_id=$2,revision=revision+1,overridden_fields=array['title','body','cta_label'] where id=$1",[template.id,version]);
   };
   await publish('Open uw beveiligde omgeving voor een update.');const first=await seedRequest(`push-safe-${randomUUID()}`);
   const frozen=(await db.query("select * from private.notification_deliveries where request_id=$1 and channel='push' and state='queued' limit 1",[first])).rows[0];assert.ok(frozen);assert.equal(frozen.snapshot.pushBody,'Open uw beveiligde omgeving voor een update.');assert.ok(!JSON.stringify(frozen.snapshot).includes('SOURCE-CANARY'));assert.ok(frozen.snapshot.ttlSeconds>3600);
   await publish('Een gewijzigde veilige formulering.');const second=await seedRequest(`push-safe-${randomUUID()}`);const current=(await db.query("select snapshot from private.notification_deliveries where request_id=$1 and channel='push' limit 1",[second])).rows[0].snapshot;assert.equal(current.pushBody,'Een gewijzigde veilige formulering.');assert.deepEqual((await db.query('select snapshot from private.notification_deliveries where id=$1',[frozen.id])).rows[0].snapshot,frozen.snapshot);
   await db.query("update private.notification_deliveries set available_at=now()-interval '1 second',expires_at=clock_timestamp()+interval '35 seconds' where id=$1",[frozen.id]);const claim=(await call('select public.notification_delivery_claim(100,$1) data',[tenant]))[0].data.find(d=>d.id===frozen.id);assert.ok(claim);
   const dto=(await call('select public.notification_delivery_begin($1,$2) data',[frozen.id,claim.lease]))[0].data;assert.ok(dto.ttl_seconds>0&&dto.ttl_seconds<=35);assert.equal(dto.snapshot.pushBody,frozen.snapshot.pushBody);
  });
  await t.test('legacy news records OFF at source creation before any worker preparation',async()=>{
   await db.query("insert into private.notification_policies(tenant_id,scope,context,type_code,channel,mode) values($1,'tenant','staff','announcement.published','email','off')",[tenant]);
   const event=(await db.query("insert into public.outbox_events(tenant_id,event_type,aggregate_type,aggregate_id,payload,idempotency_key) values($1,'announcement.published','announcement',$2,'{\"send_push\":true}',$3) returning id,status,processed_at",[tenant,announcement,`source-off-${randomUUID()}`])).rows[0];assert.equal(event.status,'queued');assert.equal(event.processed_at,null);
   const captured=(await db.query("select * from private.notification_requests where source_id=$1 and payload->>'recipient_user_id'=$2",[event.id,user])).rows[0];assert.ok(captured.payload.suppressed_routes.includes('staff:email'));assert.equal(captured.prepared_at,null);
   assert.equal((await db.query('select count(*)::int n from private.notification_deliveries where request_id=$1',[captured.id])).rows[0].n,0);
   await db.query("update private.notification_policies set mode='on' where tenant_id=$1 and context='staff' and type_code='announcement.published' and channel='email'",[tenant]);await call('select public.notification_outbox_prepare($1)',[event.id]);
   const result=(await db.query('select channel,state,reason from private.notification_deliveries where request_id=$1',[captured.id])).rows;assert.deepEqual(result.find(x=>x.channel==='email'),{channel:'email',state:'suppressed',reason:'disabled_at_enqueue'});assert.equal(result.find(x=>x.channel==='in_app').state,'queued');
  });
  await t.test('scheduled dossier sources preserve OFF even after settings return ON before the worker runs',async()=>{
   const person=(await db.query('select id from public.personnel where tenant_id=$1 and user_id=$2',[tenant,user])).rows[0].id,item=randomUUID(),job=randomUUID();
   await db.query("update public.tenant_memberships set roles=array['management']::public.app_role[] where tenant_id=$1 and user_id=$2",[tenant,user]);
   await db.query("insert into private.notification_policies(tenant_id,scope,context,type_code,channel,mode) values($1,'tenant','backoffice','personnel.deadline','email','off')",[tenant]);
   await db.query("insert into public.personnel_dossier_items(id,tenant_id,personnel_id,kind,title,dossier_status) values($1,$2,$3,'task','Fictitious source-time dossier item','open')",[item,tenant,person]);
   const rev=(await db.query('select dossier_revision from public.personnel_dossier_items where id=$1',[item])).rows[0].dossier_revision;
   await db.query("insert into public.personnel_dossier_deliveries(id,tenant_id,personnel_id,source_table,source_id,source_revision,recipient,due_on,available_at) values($1,$2,$3,'personnel_dossier_items',$4,$5,$6,current_date,now()-interval '1 minute')",[job,tenant,person,item,rev,`${user}@notification-fixture.invalid`]);
   const captured=(await db.query("select * from private.notification_requests where source_kind='dossier' and source_id=$1",[job])).rows[0];assert.equal(captured.prepared_at,null);assert.ok(captured.payload.suppressed_routes.includes('backoffice:email'));
   const unbound=randomUUID(),laterUser=randomUUID();
   await db.query("insert into public.personnel_dossier_deliveries(id,tenant_id,personnel_id,source_table,source_id,source_revision,recipient,due_on,available_at) values($1,$2,$3,'personnel_dossier_items',$4,$5,$6,current_date,now()-interval '1 minute')",[unbound,tenant,person,item,rev,`${laterUser}@notification-fixture.invalid`]);
   assert.equal((await db.query('select status from public.personnel_dossier_deliveries where id=$1',[unbound])).rows[0].status,'scheduled');assert.equal((await db.query('select reason from private.notification_captured_dossier where job_id=$1',[unbound])).rows[0].reason,'no_recipient');
   await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[laterUser,`${laterUser}@notification-fixture.invalid`]);await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['management']::public.app_role[],'active')",[tenant,laterUser]);
   await db.query("update private.notification_policies set mode='on' where tenant_id=$1 and context='backoffice' and type_code='personnel.deadline' and channel='email'",[tenant]);await call('select public.notification_prepare_dossier(25,$1)',[tenant]);
   assert.deepEqual((await db.query("select state,reason from private.notification_deliveries where request_id=$1 and channel='email'",[captured.id])).rows[0],{state:'suppressed',reason:'disabled_at_enqueue'});
   assert.equal((await db.query('select status from public.personnel_dossier_deliveries where id=$1',[unbound])).rows[0].status,'cancelled');assert.equal((await db.query("select count(*)::int n from private.notification_requests where source_kind='dossier' and source_id=$1",[unbound])).rows[0].n,0);
   await db.query("update public.tenant_memberships set roles=array['staff']::public.app_role[] where tenant_id=$1 and user_id=$2",[tenant,user]);
  });
  await t.test('rapid reschedules debounce per employee/order/day and reject a superseded message before provider admission',async()=>{
   const customer=randomUUID(),object=randomUUID(),order=randomUUID(),assignment=randomUUID();const person=(await db.query('select id from public.personnel where tenant_id=$1 and user_id=$2',[tenant,user])).rows[0].id;
   await db.query("insert into public.customers(id,tenant_id,customer_number,name) values($1,$2,$3,'Fictitious planning customer')",[customer,tenant,`fixture-${customer}`]);
   await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values($1,$2,$3,$4,'Fictitious planning location','{}')",[object,tenant,customer,`fixture-${object}`]);
   await db.query("insert into public.work_orders(id,tenant_id,work_order_number,customer_id,object_id,discipline,status,planned_start_at,planned_end_at,projected_start_at,projected_end_at,created_by) values($1,$2,$3,$4,$5,'Service','released','2035-01-10T08:00Z','2035-01-10T09:00Z','2035-01-10T08:00Z','2035-01-10T09:00Z',$6)",[order,tenant,`fixture-${order}`,customer,object,user]);
   await db.query("insert into public.work_order_assignments(id,tenant_id,work_order_id,personnel_id,status,planned_start_at,planned_end_at,projected_start_at,projected_end_at) values($1,$2,$3,$4,'released','2035-01-10T08:00Z','2035-01-10T09:00Z','2035-01-10T08:00Z','2035-01-10T09:00Z')",[assignment,tenant,order,person]);
   await db.query('insert into public.dispatches(tenant_id,work_order_id,assignment_id,dispatched_by,idempotency_key) values($1,$2,$3,$4,$5)',[tenant,order,assignment,user,`fixture-${randomUUID()}`]);
   const reschedule=async()=>{const event=(await db.query("select private.enqueue_event($1,'work_order.rescheduled','work_order',$2,$3,$4) id",[tenant,order,{personnel_id:person},`fixture-plan-${randomUUID()}`])).rows[0].id;await call('select public.notification_outbox_prepare($1)',[event]);return(await db.query("select id from private.notification_requests where source_kind='outbox' and source_id=$1 and payload->>'recipient_user_id'=$2",[event,user])).rows[0].id;};
   const first=await reschedule();const firstRows=(await db.query('select * from private.notification_deliveries where request_id=$1',[first])).rows;assert.ok(firstRows.some(d=>d.channel==='in_app'));assert.ok(firstRows.filter(d=>d.state==='queued').every(d=>new Date(d.available_at).valueOf()>Date.now()+20000));
   const second=await reschedule();assert.ok((await db.query("select state from private.notification_deliveries where request_id=$1 and channel='in_app'",[first])).rows.every(d=>d.state==='cancelled'));
   assert.equal((await db.query("select count(*)::int n from private.notification_deliveries where request_id=any($1::uuid[]) and channel='in_app' and state='queued'",[[first,second]])).rows[0].n,1);
   const pending=(await db.query("select * from private.notification_deliveries where request_id=$1 and channel='push' and state='queued' limit 1",[second])).rows[0];assert.ok(pending);
   await db.query("update private.notification_deliveries set available_at=now()-interval '1 minute' where id=$1",[pending.id]);const claim=(await call('select public.notification_delivery_claim(100,$1) data',[tenant]))[0].data.find(c=>c.id===pending.id);assert.ok((await call('select public.notification_delivery_begin($1,$2) data',[pending.id,claim.lease]))[0].data);
   await reschedule();const gate=(await call("select public.notification_provider_gate('begin',$1,'work_order.rescheduled','staff','push',$2,$3,$4,$5) data",[tenant,user,pending.id,`notification-${pending.id}`,{source_kind:'delivery',recipient:null}]))[0].data;assert.equal(gate.allowed,false);assert.equal((await db.query('select state,reason from private.notification_deliveries where id=$1',[pending.id])).rows[0].reason,'planning_bundled');
   await db.query("insert into private.notification_policies(tenant_id,scope,context,type_code,channel,mode) values($1,'tenant','staff','work_order.rescheduled','push','off')",[tenant]);
   const blockedEvent=(await db.query("select private.enqueue_event($1,'work_order.rescheduled','work_order',$2,$3,$4) id",[tenant,order,{personnel_id:person},`fixture-off-plan-${randomUUID()}`])).rows[0].id;
   await db.query("update private.notification_policies set mode='on' where tenant_id=$1 and context='staff' and type_code='work_order.rescheduled' and channel='push'",[tenant]);await call('select public.notification_outbox_prepare($1)',[blockedEvent]);
   const blocked=(await db.query("select d.channel,d.state,d.reason,d.snapshot from private.notification_deliveries d join private.notification_requests r on r.id=d.request_id where r.source_id=$1 and d.recipient_user_id=$2",[blockedEvent,user])).rows;
   assert.ok(blocked.filter(d=>d.channel==='push').every(d=>d.state==='suppressed'&&d.reason==='disabled_at_enqueue'));assert.equal(blocked.find(d=>d.channel==='in_app').state,'queued');assert.equal(blocked[0].snapshot.ttlSeconds,3600);
  });
 } finally {await db.query('rollback');await db.end();}
});
