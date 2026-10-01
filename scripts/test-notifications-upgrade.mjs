import assert from 'node:assert/strict';
import {workOrderTestDatabase} from './work-order-test-target.mjs';

if(process.env.FIELDGRID_STAGING_SMOKE||process.env.DEPLOY_TARGET==='staging')throw new Error('Notification upgrade fixtures are local-only.');
const phase=process.argv[2];if(!['seed','verify'].includes(phase))throw new Error('Use seed or verify');
const db=await workOrderTestDatabase();
const id=n=>`facd0000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [tenant,user,notice,mail,device,event]=Array.from({length:6},(_,i)=>id(i+1));
const original={subject:'FICTITIOUS historical subject',body:'FICTITIOUS historical body'};
try{
 if(phase==='seed'){
  assert.equal((await db.query("select to_regclass('private.notification_state') is null as before")).rows[0].before,true,'Seed requires the deployed pre-notification baseline');
  await db.query('begin');
  await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'notification-upgrade@fixture.test',now())",[user]);
  await db.query("insert into public.tenants(id,slug,name) values($1,'fictitious-notification-upgrade','FICTITIOUS notification upgrade')",[tenant]);
  await db.query('insert into public.tenant_settings(tenant_id) values($1)',[tenant]);
  await db.query('insert into public.tenant_branding(tenant_id) values($1)',[tenant]);
  await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['tenant_admin']::public.app_role[],'active')",[tenant,user]);
  await db.query("insert into public.notifications(id,tenant_id,user_id,channel,title,body,target_path,status,sent_at,read_at) values($1,$2,$3,'in_app','FICTITIOUS original title','FICTITIOUS original body','/app/klanten','sent','2026-09-20T12:00:00Z','2026-09-21T12:00:00Z')",[notice,tenant,user]);
  await db.query("insert into public.mail_deliveries(id,tenant_id,recipient,template,status,idempotency_key,provider_message_id,render_snapshot,sent_at) values($1,$2,'recipient@fixture.test','invoice','sent','fictitious-upgrade-mail','fictitious-provider-history',$3,'2026-09-20T12:00:00Z')",[mail,tenant,original]);
  await db.query("update public.tenant_message_templates set customized=true,subject='FICTITIOUS custom {bedrijfsnaam}',body='FICTITIOUS custom invoice for {klantnaam}.',revision=revision+1 where tenant_id=$1 and template_key='invoice' and channel='email'",[tenant]);
  await db.query("insert into public.push_subscriptions(id,tenant_id,user_id,endpoint,p256dh,auth_secret) values($1,$2,$3,'https://fcm.googleapis.com/fcm/send/FICTITIOUS-upgrade-device',$4,$5)",[device,tenant,user,'a'.repeat(87),'b'.repeat(22)]);
  await db.query("insert into public.outbox_events(id,tenant_id,event_type,aggregate_type,aggregate_id,payload,idempotency_key) values($1,$2,'work_order.dispatched','work_order',$3,'{}','fictitious-upgrade-outbox')",[event,tenant,id(7)]);
  await db.query('commit');console.log('FICTITIOUS notification history seeded on local pre-upgrade schema.');
 }else{
  const n=(await db.query('select * from public.notifications where id=$1',[notice])).rows[0];
  assert.equal(n.title,'FICTITIOUS original title');assert.equal(n.body,'FICTITIOUS original body');assert.equal(n.user_id,user);assert.equal(n.context,'backoffice');assert.equal(n.read_at.toISOString(),'2026-09-21T12:00:00.000Z');assert.equal(n.sent_at.toISOString(),'2026-09-20T12:00:00.000Z');
  const m=(await db.query('select * from public.mail_deliveries where id=$1',[mail])).rows[0];assert.equal(m.status,'sent');assert.equal(m.provider_message_id,'fictitious-provider-history');assert.deepEqual(m.render_snapshot,original);
  const template=(await db.query("select private.notification_template($1,'invoice.available','customer','email') as value",[tenant])).rows[0].value;
  assert.equal(template.title,'FICTITIOUS custom {bedrijfsnaam}');assert.equal(template.body,'FICTITIOUS custom invoice for {klantnaam}.');assert.ok(template.version_id);
  assert.equal((await db.query('select count(*) from public.push_subscriptions where id=$1',[device])).rows[0].count,'1');
  // Legacy permission alone does not fabricate a verified session/context binding.
  assert.equal((await db.query('select count(*) from private.notification_device_bindings where device_id=$1 and revoked_at is null',[device])).rows[0].count,'0');
  assert.equal((await db.query('select status from public.outbox_events where id=$1',[event])).rows[0].status,'queued');
  assert.equal((await db.query('select count(*) from private.notification_provider_permits where tenant_id=$1',[tenant])).rows[0].count,'0');
  console.log('Notification upgrade verified: historical IDs/read states/mail snapshots/custom templates retained; no fabricated device binding or provider attempt.');
 }
}finally{await db.end();}
