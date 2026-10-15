import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {createBrowserClient} from '@supabase/ssr';
import pg from 'pg';
import {localWorkOrderTestConfig} from './work-order-test-target.mjs';

/** Real local Auth/DB/Next, separate immutable Sites reference runtime. Only
 * outside shell/prototype/dev chrome is hidden, never content or layout. */
export async function managementBrowser(){
 const local=localWorkOrderTestConfig();assert.equal(local.API_URL,'http://127.0.0.1:60321');const db=new pg.Client({connectionString:local.DB_URL});await db.connect();const admin=createClient(local.API_URL,local.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}}),browser=await chromium.launch(),context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const authenticate=async(owner,email,origin)=>{assert.ok(!(await admin.auth.admin.createUser({id:owner,email,password:'Fieldgrid-E2E-2026',email_confirm:true,user_metadata:{full_name:'FICTITIOUS manager'}})).error);const jar=new Map(),auth=createBrowserClient(local.API_URL,local.ANON_KEY,{isSingleton:false,auth:{autoRefreshToken:false,detectSessionInUrl:false,persistSession:true},cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>{for(const{name,value}of items){if(value)jar.set(name,value);else jar.delete(name)}}}});assert.ok(!(await auth.auth.signInWithPassword({email,password:'Fieldgrid-E2E-2026'})).error);await context.addCookies([...jar].map(([name,value])=>({name,value,url:origin})))};
 const reference=async(seed,path)=>{const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});await context.addInitScript(seed=>localStorage.setItem('fieldgrid-platform-demo-v1',JSON.stringify({actions:[],visits:[],role:'Eigenaar',tenant:'FICTITIOUS Sites management',brand:'#222C35',accent:'#41AC42',...seed})),seed);const page=await context.newPage();await page.goto('http://127.0.0.1:3311/#'+path,{waitUntil:'networkidle',timeout:90000});return{page,close:()=>context.close()}};
 return{db,admin,browser,context,page,errors,authenticate,reference,close:async()=>{await db.query('rollback');await db.end();await browser.close()}};
}
async function hideChrome(page){await page.evaluate(()=>{if(document.getElementById('sites-comparison-chrome'))return;const style=document.createElement('style');style.id='sites-comparison-chrome';style.nonce=document.querySelector('script[nonce]')?.nonce||'';style.textContent='.prototype-toolbar,.workspace-topbar,nextjs-portal{visibility:hidden!important}';document.head.append(style)})}
export async function captureManagementPair({page,reference,directory,key,selector='.fs-module'}){
 await mkdir(directory,{recursive:true});const comparisons=[];
 for(const p of[page,reference])await hideChrome(p);
 for(const width of[1440,768,390]){
  for(const p of[page,reference]){await p.setViewportSize({width,height:1000});await p.mouse.move(width-1,999);await p.evaluate(async selector=>{window.scrollTo(0,0);await Promise.all([...document.querySelectorAll(selector+' *')].filter(n=>n.textContent?.trim()).map(n=>{const s=getComputedStyle(n);return document.fonts.load(s.font||[s.fontStyle,s.fontWeight,s.fontSize,s.fontFamily].join(' '),n.textContent.slice(0,200))}));await document.fonts.ready;await new Promise(r=>setTimeout(r,500));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))},selector)}
  for(const[p,side]of[[page,'target'],[reference,'source']]){await renderedHeadingFonts(p,selector);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));if(await p.locator('.pb-board').count())await expect.poll(()=>p.locator('.pb-board').evaluate(el=>el.querySelector('.pb-grid').getBoundingClientRect().width>=el.clientWidth-1),{timeout:10000}).toBe(true);await captureManagementImage(p,directory+'/'+key+'-full-'+side+'-'+width+'.png');await captureManagementImage(p,directory+'/'+key+'-'+side+'-'+width+'.png',selector);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),side+' horizontal page overflow')}
  const metric=async p=>({...await p.locator(selector).evaluate(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,heading:getComputedStyle(el.querySelector('h1')||el.querySelector('h2')).font,children:[...el.children].map(n=>({cls:n.className,height:n.getBoundingClientRect().height}))})),renderedHeadingFonts:await renderedHeadingFonts(p,selector)});comparisons.push({key,width,target:await metric(page),source:await metric(reference),viewed:false});
 }
 for(const p of[page,reference]){await p.setViewportSize({width:1440,height:1000});await p.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>setTimeout(r,500))})}
 for(const[p,side]of[[page,'target'],[reference,'source']]){await captureManagementImage(p,directory+'/'+key+'-full-'+side+'-1440.png');await captureManagementImage(p,directory+'/'+key+'-'+side+'-1440.png',selector);}
 return comparisons;
}
/** CSS family names alone cannot prove which face Chromium rendered when the
 * source TTF range and native discrete WOFF weights share the same family. */
async function renderedHeadingFonts(page,selector){
 const session=await page.context().newCDPSession(page);
 try{await session.send('DOM.enable');await session.send('CSS.enable');const{root}=await session.send('DOM.getDocument');const{nodeId}=await session.send('DOM.querySelector',{nodeId:root.nodeId,selector:selector+' h1, '+selector+' h2'});if(!nodeId)return[];const{fonts}=await session.send('CSS.getPlatformFontsForNode',{nodeId});return fonts.map(({familyName,postScriptName,isCustomFont})=>({familyName,postScriptName,isCustomFont}))}finally{await session.detach()}
}
export async function captureManagementDialog(page,path){const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();await dialog.locator('.mc-dialog-body').evaluate(el=>{el.scrollTop=0});await page.evaluate(async()=>{await Promise.all([...document.querySelectorAll('dialog[open] *')].filter(n=>n.textContent?.trim()).map(n=>{const s=getComputedStyle(n);return document.fonts.load(s.font||[s.fontStyle,s.fontWeight,s.fontSize,s.fontFamily].join(' '),n.textContent.slice(0,200))}));await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))});await captureManagementImage(page,path,'dialog[open]')}

/** Direct CDP capture preserves the rendered page. Playwright's temporary
 * screenshot stylesheet could replace loaded Poppins with the fallback font
 * during capture; CDP injects no styles and changes no text or geometry. */
export async function captureManagementImage(page,path,selector){
 const clip=await page.evaluate(selector=>{if(selector){const r=document.querySelector(selector).getBoundingClientRect();return{x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height,scale:1}}return{x:0,y:0,width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,scale:1}},selector),session=await page.context().newCDPSession(page);
 try{const{data}=await session.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,fromSurface:true,clip});await writeFile(path,Buffer.from(data,'base64'))}finally{await session.detach()}
}
