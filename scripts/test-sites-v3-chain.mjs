import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {localSmtpBrowserLogin} from './local-smtp-browser.mjs';
import pg from 'pg';
import {localWorkOrderTestConfig} from './work-order-test-target.mjs';

const local=localWorkOrderTestConfig(),platform='http://127.0.0.1:3000',marketing='http://www.localhost:3000';
assert.equal(local.API_URL,'http://127.0.0.1:60321','Use the explicitly owned local replay stack');
// Each local test represents a distinct fictitious client at the trusted proxy boundary.
// Production rate limits are unchanged; do not reset the shared rate window.
const fixtureIp='2001:db8:'+randomUUID().replaceAll('-','').match(/.{4}/g).slice(0,6).join(':');
const browser=await chromium.launch(),context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',extraHTTPHeaders:{'x-forwarded-for':fixtureIp}}),page=await context.newPage();
const errors=[],consoleErrors=[],evidence=process.env.FIELDGRID_SITES_EVIDENCE_DIR||'/tmp/fieldgrid-sites-evidence/real-chain';
await mkdir(evidence,{recursive:true});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push({text:m.text(),url:m.location().url})});
const marker=randomUUID(),company='FICTITIOUS Browser '+marker.slice(0,8),email=marker+'@crm-browser.invalid';
const service=createClient(local.API_URL,local.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}}),db=new pg.Client({connectionString:local.DB_URL});await db.connect();
let adminId,leadId;const receipts=[];
const recordResponse=async()=>{const response=await page.waitForResponse(r=>r.url()===marketing+'/api/crm/intake'&&r.request().method()==='POST');assert.equal(response.status(),200);const result=await response.json();receipts.push(result);leadId=result.leadId;return result};
try{
 await page.goto(marketing+'/proberen',{waitUntil:'networkidle',timeout:90000});
 await page.getByLabel('Bedrijfsnaam',{exact:true}).fill(company);await page.getByLabel('Jouw branche').selectOption({label:'Schoonmaak'});await page.getByLabel('Grootte van je team').selectOption({label:'1–10 medewerkers'});await page.getByRole('button',{name:'Volgende stap',exact:true}).click();
 await page.getByLabel('Je naam',{exact:true}).fill('FICTITIOUS browsercontact');await page.getByLabel('Zakelijk e-mailadres').fill(email);await page.getByRole('button',{name:'Volgende stap',exact:true}).click();
 const trial=recordResponse();await page.getByRole('button',{name:'Vraag mijn proefperiode aan'}).click();await trial;await expect(page.getByText('Aanvraag geregistreerd',{exact:true})).toBeVisible();
 await page.screenshot({path:evidence+'/trial-receipt-1440.png'});console.log('PASS: browser trial wizard -> committed request receipt');
 let day;
 for(let n=3;n<60;n++){const date=new Date();date.setUTCDate(date.getUTCDate()+n);const candidate=date.toISOString().slice(0,10);const r=await context.request.get(marketing+'/api/crm/availability?date='+candidate);assert.equal(r.status(),200);const data=await r.json();assert.deepEqual(Object.keys(data).sort(),['date','durationMinutes','slots','timezone']);if(data.slots.length>=3){day=candidate;break}}
 assert.ok(day,'Owned local calendar needs free slots');
 for(const kind of['appointment','demo']){
  await page.goto(marketing+'/afspraak'+(kind==='demo'?'?type=demo':''),{waitUntil:'networkidle'});
  await expect(page.locator(`input[name="kind"][value="${kind}"]`)).toBeChecked();assert.equal(await page.getByText('Videogesprek',{exact:true}).count(),0);
  await page.getByLabel('Kies een datum').fill(day);const time=page.locator('input[name="time"]').first();await expect(time).toBeVisible();await time.check();
  await page.getByRole('button',{name:'Verder met dit moment'}).click();await page.getByLabel('Je naam',{exact:true}).fill('FICTITIOUS browsercontact');await page.getByLabel('Bedrijfsnaam',{exact:true}).fill(company);await page.getByLabel('Zakelijk e-mailadres').fill(email);await page.getByLabel('Telefoonnummer').fill('0612345678');
  const booking=recordResponse();await page.getByRole('button',{name:'Bevestig mijn afspraak'}).click();await booking;await expect(page.getByRole('heading',{name:/Je staat in de agenda/})).toBeVisible();
  await page.screenshot({path:evidence+'/'+kind+'-receipt-1440.png'});console.log('PASS: '+kind+' phone booking -> committed reservation');
 }
 assert.equal(new Set(receipts.map(r=>r.leadId)).size,1);assert.equal(new Set(receipts.map(r=>r.requestId)).size,3);
 assert.equal((await db.query('select count(*)::int n from private.crm_tasks where lead_id=$1',[leadId])).rows[0].n,3);
 assert.equal((await db.query('select count(*)::int n from private.crm_requests where lead_id=$1',[leadId])).rows[0].n,3);
 const created=await service.auth.admin.createUser({email:`sites-browser-admin-${marker}@public-crm.invalid`,password:'Fieldgrid-E2E-2026',email_confirm:true,user_metadata:{full_name:'FICTITIOUS browser administrator'}});if(created.error)throw new Error('Isolated local administrator fixture could not be created');adminId=created.data.user.id;
 await db.query('insert into public.platform_admins(user_id) values($1)',[adminId]);
 await localSmtpBrowserLogin(page,context,platform,`sites-browser-admin-${marker}@public-crm.invalid`,'platform');
 await page.goto(platform+'/platform/crm?tab=requests&lead='+leadId,{waitUntil:'networkidle',timeout:90000});const dialog=page.getByRole('dialog');await expect(dialog.getByText(email,{exact:true}).first()).toBeVisible();await dialog.getByRole('tab',{name:'Aanvragen · 3'}).click();await expect(dialog.getByText('Demoaanvraag',{exact:true})).toBeVisible();await expect(dialog.getByText('30 dagen proberen',{exact:true})).toBeVisible();await page.screenshot({path:evidence+'/same-dossier-requests-1440.png'});
 await dialog.getByRole('tab',{name:'Notities & tijdlijn'}).click();await dialog.getByLabel('Interne notitie').fill('FICTITIOUS browser follow-up note');await dialog.getByRole('button',{name:'Notitie toevoegen'}).click();await expect(dialog.getByText('FICTITIOUS browser follow-up note',{exact:true})).toBeVisible();
 await dialog.getByRole('tab',{name:'Overzicht',exact:true}).click();await dialog.getByLabel('Fase',{exact:true}).selectOption('proposal');await dialog.getByLabel('Potentiële maandwaarde (€)').fill('123');await dialog.getByRole('button',{name:'Dossier opslaan'}).click();await expect(dialog.getByText('Leaddossier opgeslagen.',{exact:true})).toBeVisible();await dialog.getByRole('button',{name:'Sluiten',exact:true}).last().click();
 await page.reload({waitUntil:'networkidle'});assert.equal((await db.query('select stage from private.crm_leads where id=$1',[leadId])).rows[0].stage,'proposal');console.log('PASS: authenticated dossier snapshots, note and stage survive refresh');
 const appointment=receipts.find(r=>r.appointmentId).appointmentId;
 const calendar=await context.request.get(platform+'/api/crm/appointments/'+appointment+'/ics');assert.equal(calendar.status(),200);const ics=await calendar.text();assert.ok(ics.includes('LOCATION:Telefonisch'));assert.ok(ics.includes('UID:'+appointment+'@fieldgrid.nl'));
 const anonymous=await browser.newContext();assert.equal((await anonymous.request.get(platform+'/api/crm')).status(),403);assert.equal((await anonymous.request.get(platform+'/api/crm/appointments/'+appointment+'/ics')).status(),403);await anonymous.close();
 assert.equal((await context.request.post(platform+'/api/crm/leads',{headers:{origin:marketing,'idempotency-key':randomUUID()},data:{name:'forged'}})).status(),403);
 await db.query('delete from public.platform_admins where user_id=$1',[adminId]);assert.equal((await context.request.get(platform+'/api/crm?lead='+leadId)).status(),403);console.log('PASS: ICS and private API enforce host, current session and registry');
 assert.deepEqual(errors,[]);
 const expectedUnavailableBranding=[];
 for(const issue of consoleErrors){
  const url=new URL(issue.url),match=url.pathname.match(/^\/api\/branding\/([a-f0-9-]{36})\/email-logo$/);
  assert.ok(issue.text==='Failed to load resource: the server responded with a status of 404 (Not Found)'&&url.origin===platform&&match,'Unexpected browser console error: '+issue.text+' '+issue.url);
  const tenant=(await db.query('select status from public.tenants where id=$1',[match[1]])).rows[0];assert.ok(tenant&&tenant.status!=='active','Active branding must load');
  expectedUnavailableBranding.push({tenantId:match[1],status:404,reason:'Existing inactive local fixture; public branding correctly fails closed and the UI retains its name fallback.'});
 }

 await writeFile(evidence+'/result.json',JSON.stringify({marker,leadId,requests:receipts.map(r=>r.requestId),checks:['trial','appointment','demo','same-lead-snapshots','automatic-tasks','dossier-note','dossier-stage','ics','anonymous-denied','wrong-origin-denied','revocation-denied'],browserErrors:errors,consoleErrors,expectedUnavailableBranding,viewed:false},null,2));
}catch(error){await page.screenshot({path:evidence+'/failure.png'}).catch(()=>{});console.error('Dialog labels',await page.getByRole('dialog').locator('label').allTextContents().catch(()=>[]));throw error
}finally{
 if(leadId){await db.query("update private.crm_appointments set status='cancelled',revision=revision+1 where lead_id=$1 and status<>'cancelled'",[leadId]);await db.query("update private.crm_tasks set completed=true,revision=revision+1 where lead_id=$1 and not completed",[leadId]);await db.query("update private.crm_leads set stage='lost',revision=revision+1 where id=$1",[leadId])}
 if(adminId){await db.query('delete from public.platform_admins where user_id=$1',[adminId]);await service.auth.admin.updateUserById(adminId,{ban_duration:'876000h'})}
 await db.end();await browser.close();
}
