import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile,unlink} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {managementBrowser,captureManagementImage} from './sites-management-browser.mjs';
import {localSmtpBrowserLogin} from './local-smtp-browser.mjs';
import {slaFixture,seedSlaFixture,retireSlaFixture} from './fixtures/management-sla.mjs';

// An actual browser-embedded private PDF, in addition to byte/header assertions.
// The full Chromium channel supports the PDF viewer; headless shell does not.
const h=await managementBrowser(),{db}=h,f=slaFixture(),id=randomUUID(),origin='http://sla-'+f.tenant+'.localhost:3000';
const directory=process.env.FIELDGRID_SITES_EVIDENCE_DIR??'/tmp/fieldgrid-sites-evidence/staff-document-preview',before=process.argv.includes('--before');
const email=f.staff+'@source-staff.invalid',ownerEmail=f.owner+'@source-staff-owner.invalid',url=origin+'/api/files/personnel-document/'+id+'?preview=1';
let browser,context,page,seeded=false;const errors=[];
await mkdir(directory,{recursive:true});
try{
 await h.authenticate(f.owner,ownerEmail,origin);
 assert.equal((await h.admin.auth.admin.createUser({id:f.staff,email,email_confirm:true,user_metadata:{full_name:'FICTITIOUS document reader'}})).error,null);
 await seedSlaFixture(db,f);seeded=true;await db.query('insert into public.tenant_branding(tenant_id) values($1)',[f.tenant]);
 await db.query('update public.personnel set onboarding_completed_at=now() where id=$1',[f.person]);
 const pdf=await PDFDocument.create(),sheet=pdf.addPage([595,842]),font=await pdf.embedFont(StandardFonts.Helvetica);
 sheet.drawText('FICTITIOUS private personnel document',{x:40,y:780,size:18,font});sheet.drawText('Original scanned bytes; current employee only.',{x:40,y:740,size:12,font});
 const bytes=Buffer.from(await pdf.save()),file='/tmp/fieldgrid-source-staff-document-'+f.tenant+'.pdf',metadata='/tmp/fieldgrid-source-staff-document-'+id+'.json';
 await writeFile(file,bytes,{mode:0o600});await writeFile(metadata,JSON.stringify({id,person:f.person,title:'FICTITIOUS private preview',actor:f.owner,tenant:f.tenant,email:ownerEmail,file}),{mode:0o600});
 try{execFileSync(process.execPath,['scripts/local-shared-personnel-document.mjs',metadata],{stdio:['ignore','pipe','pipe']})}catch{throw Error('Owned local scan/upload fixture failed; credentials are not logged')}finally{await unlink(metadata);await unlink(file)}
 browser=await chromium.launch({channel:'chromium'});context=await browser.newContext({viewport:{width:1440,height:1000},locale:'nl-NL'});page=await context.newPage();
 page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});page.on('pageerror',error=>errors.push(error.message));
 await localSmtpBrowserLogin(page,context,origin,email,'staff');
 await expect(page.locator('.personnel-app')).toBeVisible({timeout:30000});await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.goto(origin+'/staff?tab=meer&section=documenten',{waitUntil:'networkidle'});await page.getByRole('button',{name:/FICTITIOUS private preview/}).click();
 const response=await context.request.get(url);assert.equal(response.status(),200);assert.deepEqual(await response.body(),bytes);
 if(!before){const attachment=await context.request.get(url.split('?')[0]);assert.equal(attachment.status(),200);assert.equal(attachment.headers()['x-frame-options'],'DENY');assert.match(attachment.headers()['content-disposition'],/^attachment/)}
 const headers=response.headers(),iframe=page.getByRole('dialog').locator('iframe');await expect(iframe).toHaveAttribute('src',new URL(url).pathname+'?preview=1');
 if(before){assert.match(headers['content-security-policy'],/frame-ancestors 'none'/);assert.equal(headers['x-frame-options'],'DENY');await page.waitForTimeout(1000)}
 else{
  assert.equal(headers['content-security-policy'],"default-src 'none'; frame-ancestors 'self'");assert.equal(headers['x-frame-options'],'SAMEORIGIN');
  await expect(iframe).not.toHaveAttribute('sandbox');
  await expect.poll(()=>page.frames().some(frame=>frame.url().startsWith('chrome-extension://')),{timeout:30000}).toBe(true);
  let viewerFrame;await expect.poll(async()=>{for(const frame of page.frames())if(await frame.locator('pdf-viewer').count()){viewerFrame=frame;return true}return false},{timeout:30000}).toBe(true);
  await expect(viewerFrame.locator('pdf-viewer')).toBeVisible();
  await expect(viewerFrame.locator('embed')).toBeVisible();
  const viewer=await viewerFrame.locator('embed').evaluate(el=>({tag:el.tagName,type:el.getAttribute('type'),width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}));assert.equal(viewer.type,'application/x-google-chrome-pdf');await writeFile(directory+'/viewer-structure.json',JSON.stringify(viewer,null,2));
  for(const width of[1440,768,390]){await page.setViewportSize({width,height:1000});await expect(iframe).toBeVisible();await expect(page.getByRole('dialog').getByRole('link',{name:'Document downloaden',exact:true})).toBeInViewport({ratio:1});await captureManagementImage(page,directory+'/document-viewer-'+width+'.png','dialog[open],[role="dialog"]')}
  await page.setViewportSize({width:1440,height:1000});
  assert.deepEqual(errors,[]);
  await db.query('update public.personnel_documents set visible_to_employee=false where id=$1',[id]);assert.equal((await context.request.get(url)).status(),404);
 }
 await captureManagementImage(page,directory+'/document-viewer.png','dialog[open],[role="dialog"]');
 await writeFile(directory+'/result.json',JSON.stringify({before,headerPolicy:headers['content-security-policy'].replace(/nonce-[^']+/g,'nonce-[omitted]'),framePolicy:headers['x-frame-options'],viewerFrames:page.frames().map(frame=>({type:frame.url().startsWith('chrome-extension://')?'built-in PDF viewer':frame.url().startsWith(origin)?'own tenant':'other'})),browserErrors:errors,originalBytes:true,currentVisibilityDenied:!before},null,2));
 console.log(before?'REPRODUCED: page CSP and DENY block the original staff PDF iframe':'PASS: real SMTP/OTP, scanned original private PDF renders in full Chromium; current visibility revoked => 404');
}catch(error){if(page)await captureManagementImage(page,directory+'/failure.png').catch(()=>{});throw error}
finally{if(context)await context.close();if(browser)await browser.close();if(seeded)await retireSlaFixture(db,f);await h.close()}
