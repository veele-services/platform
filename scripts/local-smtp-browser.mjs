import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {setTimeout as delay} from 'node:timers/promises';
const requestedAt=new Map();
/** Local SMTP delivery and actual OTP verification; never logs codes/cookies. */
export async function localSmtpBrowserLogin(page,context,origin,address,workspace){
 const url=new URL(origin);assert.ok((url.hostname==='127.0.0.1'||url.hostname==='localhost'||url.hostname.endsWith('.localhost'))&&url.port==='3000');assert.ok(address.endsWith('.invalid'));
 let stage='mailbox-inventory';try{
  // With the signed email hook disabled for Mailpit, the real service keeps
  // its in-flight brand context until its existing 60-second expiry. Respect
  // that window; do not mutate it or weaken production OTP throttling.
  const remaining=(requestedAt.get(address)??0)+61_000-Date.now();if(remaining>0)await delay(remaining);
  const mailbox='http://127.0.0.1:60324/api/v1/search?query='+encodeURIComponent('to:'+address),before=await(await fetch(mailbox)).json(),existing=new Set((before.messages??[]).map(item=>item.ID));
  stage='request-form';await context.clearCookies();await page.goto(origin+'/login',{waitUntil:'networkidle'});await page.getByRole('textbox',{name:'E-mailadres',exact:true}).fill(address);await page.getByRole('button',{name:'Inlogcode versturen',exact:true}).click();requestedAt.set(address,Date.now());await expect(page.getByLabel('Inlogcode',{exact:true})).toBeVisible();let code;stage='new-local-SMTP-delivery';
  await expect.poll(async()=>{const listing=await(await fetch(mailbox)).json();for(const item of listing.messages??[]){if(existing.has(item.ID))continue;const message=await(await fetch('http://127.0.0.1:60324/api/v1/message/'+item.ID)).json(),token=(message.HTML??'').match(/>\s*([0-9]{6,10})\s*</)?.[1];if(token){code=token;return true}}return false},{timeout:30000}).toBe(true);
  stage='verified-workspace-navigation';await page.getByLabel('Inlogcode',{exact:true}).fill(code);await page.getByRole('button',{name:'Code controleren',exact:true}).click();await expect.poll(()=>new URL(page.url()).pathname.startsWith('/'+workspace),{timeout:60000}).toBe(true);
 }catch{throw Error('Local SMTP/OTP browser login failed at '+stage+'; credentials are not logged')}
}
