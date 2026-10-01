import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { workOrderTestDatabase } from "./work-order-test-target.mjs";

test("Tickets: private file binding, live audiences and delivery state", async t => {
 const db = await workOrderTestDatabase(); await db.query("begin");
 const tenant=randomUUID(),staff=randomUUID(),other=randomUUID(),manager=randomUUID(),platform=randomUUID(),person=randomUUID(),file=randomUUID();
 const users=[staff,other,manager,platform],sessions=Object.fromEntries(users.map(u=>[u,randomUUID()]));
 const call=async(sql,args=[],actor=staff,role="authenticated")=>{
  await db.query("savepoint operation");
  try { await db.query(`set local role ${role}`);await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:actor,session_id:sessions[actor],role})]);const result=await db.query(sql,args);await db.query("reset role");await db.query("select set_config('request.jwt.claims','{}',true)");await db.query("release savepoint operation");return result.rows; }
  catch(error){await db.query("rollback to savepoint operation");await db.query("release savepoint operation");throw error;}
 };
 const service=(sql,args=[])=>call(sql,args,staff,"service_role");
 const fileCommand=async(command,input,id=null,actor=staff,context="staff")=>(await call("select public.ticket_file_command($1,$2,$3,$4,$5) data",[tenant,context,command,input,id],actor))[0].data;
 const deny=promise=>assert.rejects(promise,e=>e.code==="42501");
 let category,ticket,message;
 const draftFiles=[];
 try {
  for(const user of users){await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",[user,`${user}@ticket-fixture.invalid`]);await db.query("insert into auth.sessions(id,user_id,created_at,updated_at) values($1,$2,now(),now())",[sessions[user],user]);}
  await db.query("insert into public.tenants(id,slug,name) values($1,$2,'Fictitious file tenant')",[tenant,`ticket-files-${tenant}`]);
  await db.query("insert into public.tenant_settings(tenant_id,enabled_services) values($1,array['tickets','personeel'])",[tenant]);
  for(const user of [staff,other,manager]){const membership=randomUUID();await db.query("insert into public.tenant_memberships(id,tenant_id,user_id,roles,status) values($1,$2,$3,$4,'active')",[membership,tenant,user,[user===manager?"management":"staff"]]);await db.query("select private.ticket_seed_membership($1)",[membership]);}
  for(const user of [staff,other])await db.query("insert into public.personnel(id,tenant_id,user_id,full_name) values($1,$2,$3,'Fictitious file author')",[user===staff?person:randomUUID(),tenant,user]);
  category=(await db.query("select id from public.ticket_categories where tenant_id=$1 and code='planning'",[tenant])).rows[0].id;
  const input={categoryId:category,audience:"reporter",draftId:randomUUID(),name:"PRIVATE-FILE-CANARY.png",mime:"image/png",size:4};
  const create=async(ids)=>(await call("select public.ticket_command($1,'staff','create',$2,$3) data",[tenant,{category_id:category,title:"Fictitious attachment test",body:"Fictitious message, no real recipient",attachment_ids:ids},randomUUID()]))[0].data;
  await t.test("short-lived intent is author-bound, quota-bound and immutable on retry",async()=>{
   assert.equal((await fileCommand("init",input,file)).status,"uploading");assert.equal((await fileCommand("init",input,file)).id,file);
   await assert.rejects(fileCommand("init",{...input,name:"changed.png"},file),e=>e.code==="40001");
   await deny(fileCommand("status",{id:file},null,other));
   for(let i=0;i<4;i++){const id=randomUUID();draftFiles.push(id);await fileCommand("init",input,id);}
   await assert.rejects(fileCommand("init",input,randomUUID()),e=>e.code==="23514");
   await deny(create([file]));
  });
  await t.test("discard is own unbound only, idempotent and immediately frees the draft quota",async()=>{
   const discarded=draftFiles[0];
   await deny(fileCommand("discard",{id:discarded},null,other));
   assert.equal((await fileCommand("discard",{id:discarded})).removed,true);
   assert.equal((await fileCommand("discard",{id:discarded})).removed,true);
   await deny(fileCommand("status",{id:discarded}));
   await fileCommand("init",input,randomUUID());
   const cleanup=(await service("select public.ticket_file_cleanup(25,$1) data",[tenant]))[0].data;
   assert.deepEqual(cleanup.map(f=>f.id),[discarded]);
   await service("select public.ticket_file_cleanup_done($1)",[discarded]);
  });
  await t.test("raw tables, private storage and scan service RPC cannot be bypassed",async()=>{
   await deny(call("select * from public.ticket_files"));
   await deny(call("select public.ticket_scan_finish($1,$2,'clean','{}')",[file,randomUUID()]));
   assert.equal((await call("select id from storage.objects where bucket_id='ticket-files'")).length,0);
   await deny(fileCommand("download",{id:file}));
  });
  await t.test("finalization rechecks session and pending/failed scans never permit binding",async()=>{
   await db.query("insert into storage.objects(bucket_id,name,metadata) values('ticket-files',$1,$2)",[`${tenant}/quarantine/${file}`,{mimetype:"image/png",size:4}]);
   await deny(service("select public.ticket_file_server_finalize($1,$2,$3,$4)",[file,other,sessions[other],"a".repeat(64)]));
   await service("select public.ticket_file_server_finalize($1,$2,$3,$4)",[file,staff,sessions[staff],"a".repeat(64)]);
   const claim=(await service("select public.ticket_scan_claim(1,$1) data",[file]))[0].data.find(x=>x.id===file);assert.ok(claim);
   await service("select public.ticket_scan_finish($1,$2,'error')",[file,claim.lease]);
   await deny(create([file]));await deny(fileCommand("download",{id:file}));
   await db.query("update public.ticket_files set scan_available_at=now() where id=$1",[file]);
   const retry=(await service("select public.ticket_scan_claim(1,$1) data",[file]))[0].data.find(x=>x.id===file);
   // Synthetic DB-boundary proof ONLY. Actual AV bytes and EICAR are tested by
   // scripts/check-ticket-scanner.ts, never by this authorization fixture.
   await db.query("insert into storage.objects(bucket_id,name,metadata) values('ticket-files',$1,$2)",[`${tenant}/released/${file}/${"a".repeat(64)}`,{mimetype:"image/png",size:4}]);
   assert.equal((await service("select public.ticket_scan_finish($1,$2,'clean',$3) ok",[file,claim.lease,{engine:"ClamAV fixture",sha256:"a".repeat(64),size:4,databaseVersion:"fixture"}]))[0].ok,false);
   await service("select public.ticket_scan_finish($1,$2,'clean',$3)",[file,retry.lease,{engine:"ClamAV fixture",sha256:"a".repeat(64),size:4,databaseVersion:"fixture"}]);
   await deny(fileCommand("download",{id:file}));
   const created=await create([file]);ticket=created.id??created.ticket_id;assert.ok(ticket);
   message=(await db.query("select message_id from public.ticket_files where id=$1",[file])).rows[0].message_id;assert.ok(message);
  });
  await t.test("bound file checks parent audience, live membership/session and redaction",async()=>{
   await deny(fileCommand("discard",{id:file}));
   assert.equal((await fileCommand("download",{id:file})).id,file);
   await deny(fileCommand("download",{id:file},null,other));
   assert.equal((await fileCommand("download",{id:file},null,manager,"tenant")).id,file);
   await db.query("update public.tenant_memberships set status='suspended' where tenant_id=$1 and user_id=$2",[tenant,staff]);await deny(fileCommand("download",{id:file}));
   await db.query("update public.tenant_memberships set status='active' where tenant_id=$1 and user_id=$2",[tenant,staff]);
   await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[sessions[staff]]);await deny(fileCommand("download",{id:file}));
   await db.query("update auth.sessions set not_after=null where id=$1",[sessions[staff]]);
   await db.query("insert into private.ticket_redactions(message_id,actor_id,reason) values($1,$2,'Synthetic privacy fixture')",[message,manager]);await deny(fileCommand("download",{id:file}));
   assert.deepEqual((await db.query("select private.ticket_message_files($1) data",[message])).rows[0].data,[]);
   await db.query("delete from private.ticket_redactions where message_id=$1",[message]);
  });
  await t.test("a rolled-back worker must opt in before claiming or recovering ticket events",async()=>{
   const outbox=(await db.query("select id from public.outbox_events where aggregate_id=$1 and event_type='ticket.changed' order by created_at limit 1",[ticket])).rows[0].id;
   const legacy=(await db.query("insert into public.outbox_events(tenant_id,event_type,aggregate_type,aggregate_id,payload,idempotency_key) values($1,'fixture.legacy','fixture',$2,'{}',$3) returning id",[tenant,ticket,`legacy-fixture-${randomUUID()}`])).rows[0].id;
   // Omit the new opt-in exactly as an old worker does. The extra tenant filter
   // keeps this rollback-only smoke from locking any pre-existing remote queue.
   const old=await service("select * from public.claim_outbox(batch_size=>100,lock_seconds=>60,target_tenant=>$1)",[tenant]);
   assert.ok(old.some(e=>e.id===legacy));assert.equal(old.some(e=>e.event_type==='ticket.changed'),false);
   assert.equal((await db.query("select status from public.outbox_events where id=$1",[outbox])).rows[0].status,'queued');
   const current=await service("select * from public.claim_outbox(100,60,true,$1,true)",[tenant]);
   assert.ok(current.some(e=>e.id===outbox));
   await db.query("update public.outbox_events set locked_until=now()-interval '1 minute' where id=$1",[outbox]);
   assert.equal((await service("select * from public.claim_outbox(batch_size=>100,lock_seconds=>60,target_tenant=>$1)",[tenant])).some(e=>e.id===outbox),false);
   assert.ok((await service("select * from public.claim_outbox(100,60,true,$1,true)",[tenant])).some(e=>e.id===outbox));
   await deny(call("select * from public.claim_outbox(1,60,true,$1)",[tenant]));
  });
  await t.test("fan-out is idempotent, excludes own actor and never snapshots confidential text",async()=>{
   const outbox=(await db.query("select id from public.outbox_events where aggregate_id=$1 and event_type='ticket.changed' order by created_at limit 1",[ticket])).rows[0].id;
   await service("select public.ticket_outbox_prepare($1)",[outbox]);await service("select public.ticket_outbox_prepare($1)",[outbox]);
   const rows=(await db.query("select * from private.ticket_deliveries where outbox_id=$1",[outbox])).rows;
   assert.equal(rows.filter(x=>x.recipient_id===manager).length,2);assert.equal(rows.some(x=>x.recipient_id===staff||x.recipient_id===other),false);
   assert.equal(JSON.stringify(rows).includes("PRIVATE-FILE-CANARY"),false);
  });
  await t.test("current preferences and grants are rechecked after queueing",async()=>{
   const claims=(await service("select public.ticket_delivery_claim(20,$1) data",[tenant]))[0].data;
   const deliveries=(await db.query("select id,channel from private.ticket_deliveries where tenant_id=$1",[tenant])).rows;
   const email=deliveries.find(d=>d.channel==="email"),mailClaim=claims.find(c=>c.id===email.id);
   await db.query("select private.ticket_preferences_save($1,'tenant',$2,'{\"email\":false}')",[tenant,manager]);
   assert.equal((await service("select public.ticket_delivery_begin($1,$2) data",[email.id,mailClaim.lease]))[0].data,null);
   assert.equal((await db.query("select status from private.ticket_deliveries where id=$1",[email.id])).rows[0].status,"cancelled");
   const notice=deliveries.find(d=>d.channel==="in_app"),noticeClaim=claims.find(c=>c.id===notice.id);
   await service("select public.ticket_delivery_begin($1,$2)",[notice.id,noticeClaim.lease]);
   assert.equal((await call("select id,body from public.notifications where id=$1",[notice.id],manager)).length,1);
   await deny(call("update public.notifications set body='Forged content' where id=$1",[notice.id],manager));
   await db.query("update public.permission_grants set enabled=false where tenant_id=$1 and user_id=$2 and capability='tickets.internal.read'",[tenant,manager]);
   assert.equal((await call("select id from public.notifications where id=$1",[notice.id],manager)).length,0);
   await db.query("update public.permission_grants set enabled=true where tenant_id=$1 and user_id=$2 and capability='tickets.internal.read'",[tenant,manager]);
  });
  await t.test("ambiguous provider submission never auto-retries while pre-send lease can recover",async()=>{
   await db.query("select private.ticket_preferences_save($1,'tenant',$2,'{\"email\":true}')",[tenant,manager]);
   const event=(await db.query("select private.ticket_emit($1,'reporter','reply','Fictitious notification',$2) id",[ticket,staff])).rows[0].id;
   const outbox=(await db.query("select id from public.outbox_events where payload->>'event_id'=$1",[event])).rows[0].id;
   await service("select public.ticket_outbox_prepare($1)",[outbox]);
   const claims=(await service("select public.ticket_delivery_claim(20,$1) data",[tenant]))[0].data;
   const email=(await db.query("select id from private.ticket_deliveries where event_id=$1 and channel='email'",[event])).rows[0].id,claim=claims.find(c=>c.id===email);
   const send=(await service("select public.ticket_delivery_begin($1,$2) data",[email,claim.lease]))[0].data;assert.equal(send.channel,"email");assert.equal("subject" in send,false);
   await db.query("update private.ticket_deliveries set locked_until=now()-interval '1 second' where id=$1",[email]);
   assert.equal((await service("select public.ticket_delivery_claim(20,$1) data",[tenant]))[0].data.some(c=>c.id===email),false);
   assert.equal((await db.query("select status from private.ticket_deliveries where id=$1",[email])).rows[0].status,"uncertain");
  });
  await t.test("internal-note notifications never target the reporter",async()=>{
   const event=(await db.query("select private.ticket_emit($1,'tenant','reply','Hidden internal activity',$2) id",[ticket,manager])).rows[0].id;
   const outbox=(await db.query("select id from public.outbox_events where payload->>'event_id'=$1",[event])).rows[0].id;
   await service("select public.ticket_outbox_prepare($1)",[outbox]);
   assert.equal((await db.query("select count(*) from private.ticket_deliveries where event_id=$1 and recipient_id=$2",[event,staff])).rows[0].count,"0");
  });
  await t.test("support copy publication rechecks grants, retains exact version and has independent access",async()=>{
   const membership=(await db.query("select id from public.tenant_memberships where tenant_id=$1 and user_id=$2",[tenant,manager])).rows[0].id;
   for(const cap of ["tickets.internal.share","tickets.support.create","tickets.support.read","tickets.support.reply"])
    await db.query("insert into public.permission_grants(tenant_id,user_id,membership_id,capability,scope) values($1,$2,$3,$4,'{\"all\":true}') on conflict do nothing",[tenant,manager,membership,cap]);
   for(const cap of ["platform.support.read","platform.support.reply"])
    await db.query("insert into public.permission_grants(user_id,capability,scope) values($1,$2,'{\"all\":true}') on conflict do nothing",[platform,cap]);
   const supportCategory=(await db.query("select id from public.ticket_categories where route='platform_support' and code='technical'")).rows[0].id;
   const share=async(ids=[file])=>{
    const version=(await db.query("select private.ticket_view_revision($1,'tenant',$2) version",[ticket,manager])).rows[0].version;
    return (await call("select public.ticket_command($1,'tenant','transfer',$2,$3) data",[tenant,{ticket_id:ticket,expected_revision:Number(version),title:"Explicit fictitious shared content",body:"Only selected content",category_id:supportCategory,module:"planning",attachment_ids:ids},randomUUID()],manager))[0].data;
   };
   const shared=await share(),destination=shared.id??shared.ticket_id;
   const copied=(await db.query("select * from public.ticket_files where ticket_id=$1",[destination])).rows[0];assert.ok(copied);assert.notEqual(copied.id,file);
   await deny(fileCommand("download",{id:copied.id},null,platform,"platform"));
   const claim=(await service("select public.ticket_scan_claim(1,$1) data",[copied.id]))[0].data[0];assert.equal(claim.source.sha256,"a".repeat(64));
   await db.query("update public.permission_grants set enabled=false where tenant_id=$1 and user_id=$2 and capability='tickets.internal.share'",[tenant,manager]);
   assert.equal((await service("select public.ticket_scan_finish($1,$2,'clean',$3) ok",[copied.id,claim.lease,{engine:"ClamAV fixture",sha256:"a".repeat(64),size:4,databaseVersion:"fixture"}]))[0].ok,false);
   assert.equal((await db.query("select scan_status from public.ticket_files where id=$1",[copied.id])).rows[0].scan_status,"rejected");
   await db.query("update public.tickets set status='cancelled' where id=$1",[destination]);
   await db.query("update public.permission_grants set enabled=true where tenant_id=$1 and user_id=$2 and capability='tickets.internal.share'",[tenant,manager]);
   const shared2=await share(),destination2=shared2.id??shared2.ticket_id;
   const copy2=(await db.query("select id from public.ticket_files where ticket_id=$1",[destination2])).rows[0].id;
   const claim2=(await service("select public.ticket_scan_claim(1,$1) data",[copy2]))[0].data[0];
   await assert.rejects(service("select public.ticket_scan_finish($1,$2,'clean',$3)",[copy2,claim2.lease,{engine:"ClamAV fixture",sha256:"b".repeat(64),size:4,databaseVersion:"fixture"}]),e=>e.code==="23514");
   await db.query("insert into storage.objects(bucket_id,name,metadata) values('ticket-files',$1,$2)",[`${tenant}/released/${copy2}/${"a".repeat(64)}`,{mimetype:"image/png",size:4}]);
   await service("select public.ticket_scan_finish($1,$2,'clean',$3)",[copy2,claim2.lease,{engine:"ClamAV fixture",sha256:"a".repeat(64),size:4,databaseVersion:"fixture"}]);
   await db.query("update public.permission_grants set enabled=false where tenant_id=$1 and user_id=$2 and capability='tickets.internal.share'",[tenant,manager]);
   const safe=await fileCommand("download",{id:copy2},null,platform,"platform");assert.equal(safe.id,copy2);assert.equal("source_file_id" in safe,false);assert.equal(safe.path.includes(file),false);
   await deny(fileCommand("download",{id:file},null,platform,"platform"));
   await db.query("update public.permission_grants set enabled=true where tenant_id=$1 and user_id=$2 and capability='tickets.internal.share'",[tenant,manager]);
   const note=randomUUID(),internal=randomUUID();
   await db.query("insert into public.ticket_messages(id,tenant_id,ticket_id,author_user_id,author_name,audience,body) values($1,$2,$3,$4,'Fixture manager','tenant','PRIVATE NOTE CANARY')",[note,tenant,ticket,manager]);
   await db.query("insert into public.ticket_files(id,tenant_id,ticket_id,message_id,category_id,uploader_id,uploader_session_id,workspace,audience,draft_id,original_name,mime_type,size_bytes,quarantine_path,storage_path,scan_status,sha256,scanner_engine,scanned_at) values($1,$2,$3,$4,$5,$6,$7,'tenant','tenant',$4,'PRIVATE-NOTE.png','image/png',4,$8,$9,'clean',$10,'ClamAV fixture',now())",[internal,tenant,ticket,note,category,manager,sessions[manager],`${tenant}/quarantine/${internal}`,`${tenant}/released/${internal}/${"a".repeat(64)}`,"a".repeat(64)]);
   await db.query("update public.tickets set status='closed' where id=$1",[destination2]);
   await deny(share([internal]));await deny(fileCommand("download",{id:internal}));
  });
  await t.test("platform push registration is grant-bound, private and valid for future authorized organizations",async()=>{
   const endpoint=`https://fcm.googleapis.com/fcm/send/fixture-${randomUUID()}`;
   const subscription={endpoint,keys:{p256dh:"a".repeat(87),auth:"b".repeat(22)}};
   const push=async(action,input=subscription,actor=platform,context="platform",target=null)=>{const value=(await service("select public.notification_push_device($1,$2,$3,$4,$5,$6) data",[target,context,actor,sessions[actor],action,{origin:"https://ticket-push-fixture.invalid",...input}]))[0].data;return {...value,id:value.currentDeviceId};};
   await db.query("update public.permission_grants set enabled=false where user_id=$1 and capability='platform.support.read'",[platform]);
   await deny(push("subscribe"));
   await db.query("update public.permission_grants set enabled=true where user_id=$1 and capability='platform.support.read'",[platform]);
   const registered=await push("subscribe");assert.equal(registered.active,true);
   assert.equal((await push("subscribe")).id,registered.id);
   await deny(call("select id from public.push_subscriptions where id=$1",[registered.id],platform));
   await deny(call("insert into public.push_subscriptions(user_id,endpoint,p256dh,auth_secret) values($1,$2,'unused','unused')",[platform,`${endpoint}-raw`],platform));
   await assert.rejects(push("subscribe",{...subscription,endpoint:"http://127.0.0.1:3301/api/worker"}),e=>e.code==="23514");
   await assert.rejects(push("subscribe",{...subscription,endpoint:"https://fcm.googleapis.com.attacker.invalid/a"}),e=>e.code==="23514");
   await assert.rejects(push("subscribe",{...subscription,endpoint:`${endpoint}\n`}),e=>e.code==="23514");
   await deny(push("subscribe",subscription,platform,"platform",tenant));
   const future=randomUUID(),futureTicket=randomUUID();
   await db.query("insert into public.tenants(id,slug,name) values($1,$2,'Future fictitious organization')",[future,`future-${future}`]);
   await db.query("insert into public.tenant_settings(tenant_id,enabled_services) values($1,array['tickets'])",[future]);
   const supportCategory=(await db.query("select id from public.ticket_categories where route='platform_support' and code='technical'")).rows[0].id;
   await db.query("insert into public.tickets(id,tenant_id,number,route,category_id,reporter_user_id,reporter_name,title) values($1,$2,'SUP-FIXTURE','platform_support',$3,$4,'Fixture reporter','Future authorized organization')",[futureTicket,future,supportCategory,manager]);
   const event=(await db.query("select private.ticket_emit($1,'reporter','created','Fictitious new support ticket',$2) id",[futureTicket,manager])).rows[0].id;
   const outbox=(await db.query("select id from public.outbox_events where payload->>'event_id'=$1",[event])).rows[0].id;
   await service("select public.ticket_outbox_prepare($1)",[outbox]);
   const delivery=(await db.query("select * from private.ticket_deliveries where event_id=$1 and recipient_id=$2 and channel='push'",[event,platform])).rows[0];
   assert.ok(delivery);assert.equal(delivery.subscription_id,registered.id);assert.equal(delivery.tenant_id,future);
   assert.equal((await db.query("select private.ticket_delivery_allowed(d) allowed from private.ticket_deliveries d where id=$1",[delivery.id])).rows[0].allowed,true);
   await db.query("update public.permission_grants set enabled=false where user_id=$1 and capability='platform.support.read'",[platform]);
   assert.equal((await db.query("select private.ticket_delivery_allowed(d) allowed from private.ticket_deliveries d where id=$1",[delivery.id])).rows[0].allowed,false);
   assert.equal((await push("unsubscribe",{endpoint})).active,false);
   assert.ok((await db.query("select revoked_at from public.push_subscriptions where id=$1",[registered.id])).rows[0].revoked_at);
   await db.query("update public.permission_grants set enabled=true where user_id=$1 and capability='platform.support.read'",[platform]);
   const own=await push("subscribe",subscription,staff,"staff",tenant);assert.equal(own.active,true);
   await push("unsubscribe",{endpoint},other,"staff",tenant);
   assert.equal((await db.query("select revoked_at from public.push_subscriptions where id=$1",[own.id])).rows[0].revoked_at,null);
   await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[sessions[staff]]);
   await deny(push("subscribe",subscription,staff,"staff",tenant));
   await db.query("update auth.sessions set not_after=null where id=$1",[sessions[staff]]);
   // These are deliberately separate fixture resources: tenant-filtered smoke
   // calls must not claim, expire or clean another organization's work.
   await db.query("update private.ticket_deliveries set status='sending',locked_until=now()-interval '1 minute' where tenant_id=$1 and channel='email'",[future]);
   const before=(await db.query("select id,status,lease,locked_until from private.ticket_deliveries where tenant_id=$1 order by id",[future])).rows;
   await service("select public.ticket_delivery_claim(20,$1)",[tenant]);
   assert.deepEqual((await db.query("select id,status,lease,locked_until from private.ticket_deliveries where tenant_id=$1 order by id",[future])).rows,before);
   const untouched=randomUUID();
   await db.query("insert into public.ticket_files(id,tenant_id,category_id,uploader_id,workspace,audience,draft_id,original_name,mime_type,size_bytes,quarantine_path,scan_status,created_at) values($1,$2,$3,$4,'support','reporter',$1,'Other-fixture.png','image/png',4,$5,'pending',now()-interval '25 hours')",[untouched,future,supportCategory,manager,`${future}/quarantine/${untouched}`]);
   await service("select public.ticket_file_cleanup(25,$1)",[tenant]);
   await service("select public.ticket_scan_claim(1,$1)",[file]);
   const untouchedState=(await db.query("select deleted_at,scan_status,scan_lease from public.ticket_files where id=$1",[untouched])).rows[0];
   assert.deepEqual(untouchedState,{deleted_at:null,scan_status:"pending",scan_lease:null});
  });
  await t.test("legacy ticket choices migrate once and both settings surfaces use the central preference",async()=>{
   await db.query("delete from private.notification_preferences where tenant_id=$1 and user_id=$2 and type_code='ticket.changed'",[tenant,manager]);
   await db.query("insert into public.ticket_notification_preferences(tenant_id,user_id,context,email,push) values($1,$2,'tenant',false,true),($1,$2,'support',true,false)",[tenant,manager]);
   assert.equal((await db.query('select private.notification_import_ticket_preferences($1) n',[manager])).rows[0].n,1);
   assert.deepEqual((await db.query("select email,push from private.notification_preferences where tenant_id=$1 and user_id=$2 and context='backoffice' and type_code='ticket.changed'",[tenant,manager])).rows[0],{email:false,push:false});
   assert.equal((await db.query("select private.ticket_preferences_save($1,'tenant',$2,'{}') p",[tenant,manager])).rows[0].p.email,false);
   const master=(await db.query("select revision from private.notification_preferences where tenant_id=$1 and user_id=$2 and context='backoffice' and type_code is null",[tenant,manager])).rows[0];
   await call("select public.notification_command($1,'backoffice','preferences_save',$2,$3)",[tenant,{expected_revision:master?.revision??0,email:true,push:true,timezone:'Europe/Amsterdam',quiet_enabled:false,types:[{code:'ticket.changed',email:true,push:true}]},randomUUID()],manager);
   for(const context of ['tenant','support'])assert.deepEqual((await db.query('select private.ticket_preferences_save($1,$2,$3,\'{}\') p',[tenant,context,manager])).rows[0].p,{email:true,push:true,inApp:true});
   assert.equal((await db.query('select private.notification_import_ticket_preferences($1) n',[manager])).rows[0].n,0);
   assert.equal((await db.query("select email from public.ticket_notification_preferences where tenant_id=$1 and user_id=$2 and context='tenant'",[tenant,manager])).rows[0].email,false);
   const saved=(await db.query("select revision from private.notification_preferences where tenant_id=$1 and user_id=$2 and context='backoffice' and type_code is null",[tenant,manager])).rows[0].revision;
   await call("select public.ticket_command($1,'tenant','preferences','{\"email\":false,\"push\":true}',$2)",[tenant,randomUUID()],manager);
   const updated=(await db.query("select revision from private.notification_preferences where tenant_id=$1 and user_id=$2 and context='backoffice' and type_code is null",[tenant,manager])).rows[0].revision;assert.equal(Number(updated),Number(saved)+1);
   await assert.rejects(call("select public.notification_command($1,'backoffice','preferences_save',$2,$3)",[tenant,{expected_revision:saved,email:true,push:true,timezone:'Europe/Amsterdam',quiet_enabled:false,types:[]},randomUUID()],manager),e=>e.code==='40001');
   await db.query("select private.ticket_preferences_save($1,'support',$2,'{\"email\":true}')",[tenant,manager]);
  });
  await t.test("ticket envelopes remember source-time OFF and pending preference OFF without hiding suppressed channels",async()=>{
   const emit=async()=>{const id=(await db.query("select private.ticket_emit($1,'reporter','reply','Fictitious source-time proof',$2) id",[ticket,staff])).rows[0].id;return(await db.query("select id from public.outbox_events where tenant_id=$1 and payload->>'event_id'=$2",[tenant,id])).rows[0].id;};
   const mail=async(outbox)=>(await db.query("select d.state,d.reason from private.notification_deliveries d join private.notification_requests r on r.id=d.request_id where d.tenant_id=$1 and d.recipient_user_id=$2 and d.channel='email' and r.source_id=(select (payload->>'event_id')::uuid from public.outbox_events where id=$3)",[tenant,manager,outbox])).rows[0];
   await db.query("select private.ticket_preferences_save($1,'tenant',$2,'{\"email\":false}')",[tenant,manager]);const disabledAtSource=await emit();
   assert.equal((await db.query('select status,processed_at from public.outbox_events where id=$1',[disabledAtSource])).rows[0].status,'queued');
   assert.equal((await db.query("select count(*)::int n from private.notification_requests where source_id=(select(payload->>'event_id')::uuid from public.outbox_events where id=$1) and prepared_at is not null",[disabledAtSource])).rows[0].n,0);
   await db.query("select private.ticket_preferences_save($1,'support',$2,'{\"email\":true}')",[tenant,manager]);await service('select public.notification_outbox_prepare($1)',[disabledAtSource]);assert.deepEqual(await mail(disabledAtSource),{state:'suppressed',reason:'disabled_at_enqueue'});
   const pending=await emit();await db.query("select private.ticket_preferences_save($1,'tenant',$2,'{\"email\":false}')",[tenant,manager]);await db.query("select private.ticket_preferences_save($1,'tenant',$2,'{\"email\":true}')",[tenant,manager]);await service('select public.notification_outbox_prepare($1)',[pending]);assert.deepEqual(await mail(pending),{state:'suppressed',reason:'disabled_at_enqueue'});
   const current=await emit();await service('select public.notification_outbox_prepare($1)',[current]);assert.equal((await mail(current)).state,'queued');
   // Still-false migration evidence must no longer block the historical worker.
   await service('select public.ticket_outbox_prepare($1)',[current]);const legacy=(await db.query("select id from private.ticket_deliveries where outbox_id=$1 and recipient_id=$2 and channel='email'",[current,manager])).rows[0];assert.equal((await db.query('select private.ticket_delivery_allowed(d) ok from private.ticket_deliveries d where id=$1',[legacy.id])).rows[0]?.ok,true);
   await db.query("update public.tenant_memberships set status='suspended' where tenant_id=$1 and user_id=$2",[tenant,manager]);const empty=await emit();
   assert.equal((await db.query('select count(*)::int n from private.notification_captured_outbox where event_id=$1',[empty])).rows[0].n,1);
   assert.equal((await db.query("select count(*)::int n from private.notification_requests where source_id=(select(payload->>'event_id')::uuid from public.outbox_events where id=$1)",[empty])).rows[0].n,0);
   await db.query("update public.tenant_memberships set status='active' where tenant_id=$1 and user_id=$2",[tenant,manager]);await service('select public.notification_outbox_prepare($1)',[empty]);assert.equal(await mail(empty),undefined);
  });
  await t.test("cleanup only selects unattached staging artifacts, then acknowledges deletion",async()=>{
   await db.query("update public.ticket_files set created_at=now()-interval '25 hours' where tenant_id=$1",[tenant]);
   const rows=(await service("select public.ticket_file_cleanup(25,$1) data",[tenant]))[0].data;
   assert.equal(rows.some(r=>r.id===file),false);assert.equal(rows.length,4);
   for(const row of rows)await service("select public.ticket_file_cleanup_done($1)",[row.id]);
   assert.equal((await service("select public.ticket_file_cleanup(25,$1) data",[tenant]))[0].data.length,0);
  });
 } finally { await db.query("rollback");await db.end(); }
});
