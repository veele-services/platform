import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { availableSlots, DEFAULT_CRM_SETTINGS, localToUtc, reservationSlots } from '../lib/crm-availability';
const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
class Statement {constructor(public sql:string,public values:any[]=[]){}bind(...values:any[]){return new Statement(this.sql,values);}async all(){return {results:sqlite.prepare(this.sql).all(...this.values)};}async first(){return sqlite.prepare(this.sql).get(...this.values)||null;}async run(){const r=sqlite.prepare(this.sql).run(...this.values);return {meta:{changes:Number(r.changes)}};}}
(globalThis as any).__crmTestEnv={DB:{prepare:(sql:string)=>new Statement(sql),batch:async(statements:Statement[])=>{sqlite.exec('BEGIN');try{const result=[];for(const s of statements)result.push(sqlite.prepare(s.sql).run(...s.values));sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}}};
const {handleCrm}=await import('../lib/crm-server');
async function api(path='',method='GET',body?:any,origin='https://test.fieldgrid.local',identityHeaders:Record<string,string>={}){const res=await handleCrm(new Request('https://test.fieldgrid.local/api/crm'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...identityHeaders},...(body?{body:JSON.stringify(body)}:{})}));const data=await res.json() as any;return {status:res.status,...data};}
// Amsterdam DST is never derived from the worker's system timezone.
assert.equal(localToUtc('2026-10-23','09:00')?.toISOString(),'2026-10-23T07:00:00.000Z');
assert.equal(localToUtc('2026-10-26','09:00')?.toISOString(),'2026-10-26T08:00:00.000Z');
assert.equal(localToUtc('2027-03-28','02:30'),null);
assert.equal(availableSlots('2026-10-17',DEFAULT_CRM_SETTINGS,[],new Date('2026-10-14T07:00:00Z')).length,0);
assert.equal(availableSlots('2027-01-14',DEFAULT_CRM_SETTINGS,[],new Date('2026-10-14T07:00:00Z')).length,0);
assert(!availableSlots('2026-10-14',DEFAULT_CRM_SETTINGS,[],new Date('2026-10-14T07:00:00Z')).includes('09:00'));
assert(!availableSlots('2026-10-15',DEFAULT_CRM_SETTINGS,reservationSlots('2026-10-15','09:00',DEFAULT_CRM_SETTINGS),new Date('2026-10-14T07:00:00Z')).includes('09:00'));
assert.equal((await api('/settings','PATCH',{adminEmail:'admin@example.com'},'https://attacker.example')).status,403);
assert.equal((await api('/intake','POST',{idempotencyKey:'bad',kind:'appointment',name:'Noor',company:'Test',email:'noor@example.com',phone:'070 111 1111'})).status,400);
let date='',slots:string[]=[];for(let i=2;i<15;i++){date=new Date(Date.now()+i*86400000).toISOString().slice(0,10);slots=(await api('/availability?date='+date)).slots;if(slots.length>3)break;}assert(slots.length>3);
const trial={idempotencyKey:'trial-1',kind:'trial',name:'Noor',company:'Test BV',email:'Noor@example.com'};
const a=await api('/intake','POST',trial);assert.equal(a.status,201);assert.equal(a.notificationStatus,'pending_config');
const b=await api('/intake','POST',trial);assert.equal(b.status,200);assert.equal(b.leadId,a.leadId);assert.equal(b.requestId,a.requestId);
const reused=await api('/intake','POST',{...trial,company:'Another BV'});assert.equal(reused.status,409);
await api('/leads/'+a.leadId,'PATCH',{stage:'proposal',owner:'Nick'});
const appointment={...trial,idempotencyKey:'booking-1',kind:'appointment',phone:'070 123 4567',date,time:slots[0],message:'Telefonische afspraak'};
const booked=await api('/intake','POST',appointment);assert.equal(booked.status,201);assert(booked.appointmentId);
const replayBooking=await api('/intake','POST',appointment);assert.equal(replayBooking.requestId,booked.requestId);
let current=await api();assert.equal(current.leads.length,1);assert.equal(current.requests.length,2);assert.equal(current.leads[0].phone,'070 123 4567');assert.equal(current.leads[0].stage,'proposal');assert.equal(current.requests.find((r:any)=>r.id===booked.requestId).phone,'070 123 4567');assert.equal(current.requests.find((r:any)=>r.id===a.requestId).phone,'');
// Simultaneous requests see one slot; the unique reservation constraint rolls back the loser and its lead/request.
const concurrent=await Promise.all(['a','b'].map(k=>api('/intake','POST',{...appointment,idempotencyKey:'race-'+k,email:k+'@example.com',company:k,date,time:slots[1]})));
assert.deepEqual(concurrent.map(x=>x.status).sort(),[201,409]);current=await api();assert.equal(current.requests.length,3);assert.equal(current.leads.length,2);
const keyRace=await Promise.all(['a','b'].map(k=>api('/intake','POST',{...trial,idempotencyKey:'same-key-race',email:'key-'+k+'@example.com',company:'Key '+k})));
assert.deepEqual(keyRace.map(x=>x.status).sort(),[201,409]);current=await api();assert.equal(current.requests.length,4);assert.equal(current.leads.length,3);
// Enlarging the buffer would overlap two existing bookings; settings + reservations must roll back together.
const bufferConflict=await api('/settings','PATCH',{bufferMinutes:60});assert.equal(bufferConflict.status,409);assert.equal((await api()).settings.bufferMinutes,15);
const raceAppt=current.appointments.find((x:any)=>x.id!==booked.appointmentId);await api('/appointments/'+raceAppt.id,'PATCH',{action:'cancel'});
assert.equal((await api('/settings','PATCH',{bufferMinutes:60})).status,200);
assert(!(await api('/availability?date='+date)).slots.includes(slots[0]));
await api('/appointments/'+booked.appointmentId,'PATCH',{action:'cancel'});assert((await api('/availability?date='+date)).slots.includes(slots[0]));
assert.equal((await api('/demo-data','POST',{})).status,200);current=await api();const realCount=current.leads.filter((x:any)=>!x.isDemo).length;assert.equal(current.leads.filter((x:any)=>x.isDemo).length,8);assert(current.notifications.filter((x:any)=>x.isDemo).every((x:any)=>x.status==='demo'));
await api('/demo-data','DELETE');current=await api();assert.equal(current.leads.length,realCount);assert(current.leads.every((x:any)=>!x.isDemo));
// A settings change between slot validation and the transaction aborts the entire booking.
const fakeDb=(globalThis as any).__crmTestEnv.DB,originalBatch=fakeDb.batch;let changeSettingsOnce=true;
fakeDb.batch=async(statements:Statement[])=>{if(changeSettingsOnce&&statements.some(s=>s.values.includes('settings-race'))){changeSettingsOnce=false;const settings=JSON.parse((sqlite.prepare('SELECT value FROM crm_settings WHERE id=?').get('main') as any).value);settings.leadTimeHours=5;sqlite.prepare('UPDATE crm_settings SET value=? WHERE id=?').run(JSON.stringify(settings),'main');}return originalBatch(statements);};
const requestsBeforeConfigRace=(await api()).requests.length;const configRace=await api('/intake','POST',{...trial,idempotencyKey:'settings-race'});assert.equal(configRace.status,409);assert.equal(configRace.code,'settings_changed');fakeDb.batch=originalBatch;assert.equal((await api()).requests.length,requestsBeforeConfigRace);
// Global mail state contains no CRM-specific configuration or guessed recipient.
current=await api();assert.equal(current.notificationContext.provider,'SendGrid');assert.equal(current.notificationContext.configuration,'global');assert.equal(current.notificationContext.recipientSource,'unresolved');assert.equal(current.notificationContext.recipientEmail,'');assert.equal(current.mailConfigured,false);assert.equal(current.settings.emailEnabled,true);assert(!('adminEmail' in current.settings));
// Legacy defaults are normalized without losing the transaction's raw-value guard.
const savedSettings=JSON.parse((sqlite.prepare('SELECT value FROM crm_settings WHERE id=?').get('main') as any).value);savedSettings.adminEmail='';savedSettings.emailEnabled=false;sqlite.prepare('UPDATE crm_settings SET value=? WHERE id=?').run(JSON.stringify(savedSettings),'main');
assert.equal((await api()).settings.emailEnabled,true);assert.equal((await api('/settings','PATCH',{leadTimeHours:4})).status,200);
assert(!('adminEmail' in JSON.parse((sqlite.prepare('SELECT value FROM crm_settings WHERE id=?').get('main') as any).value)));
// A historical address is never a delivery source, and an explicit opt-out stays off.
const legacyExplicit={...(await api()).settings,adminEmail:'legacy-not-admin@example.com',emailEnabled:false};sqlite.prepare('UPDATE crm_settings SET value=? WHERE id=?').run(JSON.stringify(legacyExplicit),'main');
current=await api();assert.equal(current.notificationContext.recipientEmail,'');assert.equal(current.settings.emailEnabled,false);assert(!('adminEmail' in current.settings));
assert.equal((await api('/settings','PATCH',{emailEnabled:true})).status,200);
// Owner identity is supplied by Sites ingress, never by the form body. The first
// owner-private account is retained for server-to-server intake without headers.
await api('/settings','PATCH',{adminEmail:'body-injection@example.com'});assert.equal((await api()).notificationContext.recipientEmail,'');
await api('','GET',undefined,'https://test.fieldgrid.local',{'oai-authenticated-user-id':'owner-1','oai-authenticated-user-email':'invalid'});assert.equal((await api()).notificationContext.recipientSource,'unresolved');
await api('','GET',undefined,'https://test.fieldgrid.local',{'oai-authenticated-user-id':'owner-1','oai-authenticated-user-email':'owner@example.com','oai-authenticated-user-full-name':'Test%20Beheerder','oai-authenticated-user-full-name-encoding':'percent-encoded-utf-8'});
current=await api();assert.equal(current.notificationContext.recipientEmail,'owner@example.com');assert.equal(current.notificationContext.recipientName,'Test Beheerder');assert.equal(current.notificationContext.recipientSource,'owner_account');
assert.equal(JSON.parse((sqlite.prepare('SELECT value FROM crm_settings WHERE id=?').get('platform-identity') as any).value).userId,'owner-1');
await api('','GET',undefined,'https://test.fieldgrid.local',{'oai-authenticated-user-id':'owner-2','oai-authenticated-user-email':'other@example.com'});assert.equal((await api()).notificationContext.recipientEmail,'owner@example.com');
// Pending legacy registrations display today's global context, without rewriting audit data.
const legacyPending=(await api()).notifications.find((n:any)=>n.status==='pending_config');assert(legacyPending);
sqlite.prepare('UPDATE crm_notifications SET recipient=?,last_error=? WHERE id=?').run('obsolete@example.com','Stel een ontvanger, geverifieerde afzender en SendGrid-sleutel in.',legacyPending.id);
const projectedPending=(await api()).notifications.find((n:any)=>n.id===legacyPending.id);assert.equal(projectedPending.recipient,'owner@example.com');assert.equal(projectedPending.lastError,'Globale e-mailverzending via SendGrid is nog niet beschikbaar in deze omgeving.');
const unchangedPending=sqlite.prepare('SELECT recipient,last_error FROM crm_notifications WHERE id=?').get(legacyPending.id) as any;assert.equal(unchangedPending.recipient,'obsolete@example.com');assert(unchangedPending.last_error.startsWith('Stel een ontvanger'));
// Provider mocks prove honest outbox status; no real email is sent by these tests.
let sends=0;let lastUrl='',lastPayload:any;const originalFetch=globalThis.fetch;globalThis.fetch=async(url,options)=>{sends++;lastUrl=String(url);lastPayload=JSON.parse(String(options?.body));return new Response(null,{status:202});};
const runtime=(globalThis as any).__crmTestEnv;runtime.SENDGRID_API_KEY='test-only';runtime.CRM_MAIL_FROM='old-ignored@example.com';assert.equal((await api()).notificationContext.providerConfigured,false);runtime.SENDGRID_FROM_EMAIL='sender@example.com';runtime.SENDGRID_FROM_NAME='Fieldgrid Team';runtime.SENDGRID_API_BASE='https://api.sendgrid.com/';
assert.equal((await api('/settings','PATCH',{adminEmail:'admin@example.com',emailEnabled:true})).status,200);
const notified=await api('/intake','POST',{...trial,idempotencyKey:'mail-accepted'});assert.equal(notified.notificationStatus,'accepted');assert.equal(sends,1);assert.equal(lastUrl,'https://api.sendgrid.com/v3/mail/send');assert.equal(lastPayload.from.email,'sender@example.com');assert.equal(lastPayload.from.name,'Fieldgrid Team');assert.equal(lastPayload.personalizations[0].to[0].email,'owner@example.com');assert.equal(lastPayload.reply_to.email,'noor@example.com');
await api('/intake','POST',{...trial,idempotencyKey:'mail-accepted'});assert.equal(sends,1);
current=await api();const notification=current.notifications.find((x:any)=>x.requestId===notified.requestId);await api('/notifications/'+notification.id+'/retry','POST',{});assert.equal(sends,1);
// Global platform admin has precedence over the prototype owner fallback.
runtime.FIELDGRID_ADMIN_EMAIL='platform@example.com';current=await api();assert.equal(current.notificationContext.recipientSource,'platform_admin');assert.equal(current.notificationContext.recipientEmail,'platform@example.com');assert.equal(current.mailConfigured,true);assert.equal(current.notifications.find((n:any)=>n.id===notification.id).recipient,'owner@example.com');assert.equal(current.notifications.find((n:any)=>n.id===notification.id).status,'accepted');assert.equal(current.notifications.find((n:any)=>n.id===legacyPending.id).recipient,'platform@example.com');assert.equal(current.notifications.find((n:any)=>n.id===legacyPending.id).lastError,'Wacht op verzending via de globale SendGrid-service.');
await api('/intake','POST',{...trial,idempotencyKey:'mail-platform-admin',adminEmail:'client@example.com'});assert.equal(lastPayload.personalizations[0].to[0].email,'platform@example.com');assert.equal(sends,2);
await api('/settings','PATCH',{emailEnabled:false});const disabled=await api('/intake','POST',{...trial,idempotencyKey:'mail-disabled'});assert.equal(disabled.notificationStatus,'pending_config');assert.equal(sends,2);assert.equal((await api()).mailConfigured,false);
await api('/settings','PATCH',{emailEnabled:true});
// HTTP 200 is not SendGrid acceptance; only 202 records acceptance.
globalThis.fetch=async()=>new Response(null,{status:200});const unexpected=await api('/intake','POST',{...trial,idempotencyKey:'mail-unexpected'});assert.equal(unexpected.notificationStatus,'failed');assert.equal((await api()).notifications.find((n:any)=>n.requestId===unexpected.requestId).acceptedAt,null);
globalThis.fetch=async()=>new Response(null,{status:503});const failed=await api('/intake','POST',{...trial,idempotencyKey:'mail-failed'});assert.equal(failed.status,201);assert.equal(failed.notificationStatus,'failed');assert((await api()).requests.some((r:any)=>r.id===failed.requestId));
globalThis.fetch=originalFetch;
const ics=await handleCrm(new Request('https://test.fieldgrid.local/api/crm/appointments/'+booked.appointmentId+'/ics'));const calendar=await ics.text();assert.equal(ics.headers.get('Content-Type'),'text/calendar; charset=utf-8');assert(calendar.includes('STATUS:CANCELLED'));assert(calendar.includes('DTSTART:'));
console.log('CRM backend: DST, calendar rules, CSRF, validation, deduplication/contact history, idempotency, simultaneous slot races, buffer transactions, cancellation, demo isolation, ICS, global SendGrid configuration, first-owner bootstrap, platform-admin precedence, opt-out, and provider acceptance/failure passed.');
