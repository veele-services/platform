import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from '@playwright/test';

const target='http://www.localhost:3000',reference='http://127.0.0.1:3310';
const output=resolve(process.env.FIELDGRID_SITES_EVIDENCE_DIR||'/tmp/fieldgrid-sites-evidence/marketing-crawl');
const routes=['/','/branches',...['schoonmaak','glasbewassing','facilitair','groenonderhoud','vastgoedservice','beveiliging','evenementen'].map(s=>'/branches/'+s),'/platform',...['planning','werkbonnen','objecten','personeelsapp','klantportaal','onboarding','offertes-facturatie'].map(s=>'/platform/'+s),'/werkwijze','/over','/demo','/proberen','/afspraak','/privacy'];
assert.equal(routes.length,23);
await mkdir(output,{recursive:true});
const browser=await chromium.launch(),results=[],errors=[],links=new Set();
const context=await browser.newContext({reducedMotion:'reduce'}),refContext=await browser.newContext({reducedMotion:'reduce'});
// Only the isolated source reference receives a public-availability adapter.
// The integrated site always uses its actual Route Handler and database.
await refContext.route('**/api/crm/availability?*',async route=>{
 const url=new URL(route.request().url());const response=await context.request.get(target+url.pathname+url.search);await route.fulfill({response});
});
const page=await context.newPage(),ref=await refContext.newPage();
page.on('pageerror',e=>errors.push(e.message));ref.on('pageerror',e=>errors.push('reference: '+e.message));
const settle=async p=>{
 await p.evaluate(async()=>{await document.fonts.ready;for(let y=0;y<document.body.scrollHeight;y+=650){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,25))}window.scrollTo(0,0)});
 await p.waitForTimeout(100);
 await p.addStyleTag({content:'nextjs-portal { visibility:hidden !important; }'});
};
const geometry=p=>p.evaluate(()=>{
 const h=document.querySelector('h1'),style=h&&getComputedStyle(h),box=h?.getBoundingClientRect();
 return {h1:h?.textContent?.replace(/\s+/g,' ').trim(),box:box&&{x:box.x,y:box.y,width:box.width,height:box.height},font:style&&[style.fontFamily,style.fontSize,style.fontWeight,style.lineHeight,style.letterSpacing],overflow:document.documentElement.scrollWidth>innerWidth+1};
});
try{
 for(const width of[1440,1024,768,390,320]){
  await Promise.all([page.setViewportSize({width,height:1000}),ref.setViewportSize({width,height:1000})]);
  for(const path of routes){
   const name=path==='/'?'home':path.slice(1).replaceAll('/','-');
   const responses=await Promise.all([page.goto(target+path,{waitUntil:'networkidle',timeout:90000}),ref.goto(reference+path,{waitUntil:'networkidle',timeout:90000})]);
   assert.equal(responses[0].status(),200,`${width} ${path} integrated status`);assert.equal(responses[1].status(),200,`${width} ${path} reference status`);
   await Promise.all([settle(page),settle(ref)]);
   const [actual,source]=await Promise.all([geometry(page),geometry(ref)]);
   const canonical=await page.locator('link[rel="canonical"]').getAttribute('href');assert.equal(new URL(canonical).href,new URL('https://www.fieldgrid.nl'+path).href);
   assert.ok((await page.title()).length>10);assert.ok(await page.locator('meta[name="description"]').getAttribute('content'));assert.ok(await page.locator('meta[name="robots"]').getAttribute('content').then(v=>v.includes('noindex')));
   for(const href of await page.locator('a[href]').evaluateAll(a=>a.map(x=>x.getAttribute('href'))))if(href?.startsWith('/')&&!href.startsWith('//'))links.add(href.split('#')[0].split('?')[0]||'/');
   const deltas=actual.box&&source.box?Object.fromEntries(Object.entries(actual.box).map(([k,v])=>[k,Math.abs(v-source.box[k])])):null;
   const row={path,width,actual,source,deltas,canonical,files:[`${name}-${width}-integrated.jpg`,`${name}-${width}-source.jpg`],viewed:false};results.push(row);
   await Promise.all([page.screenshot({path:resolve(output,row.files[0]),fullPage:true,type:'jpeg',quality:75}),ref.screenshot({path:resolve(output,row.files[1]),fullPage:true,type:'jpeg',quality:75})]);
   await writeFile(resolve(output,'comparison.json'),JSON.stringify({results,errors,links:[...links]},null,2));
   console.log(JSON.stringify({path,width,overflow:actual.overflow,h1Same:actual.h1===source.h1,fontSame:JSON.stringify(actual.font)===JSON.stringify(source.font),deltas}));
  }
 }
 for(const path of links)assert.ok(routes.includes(path),`Link has no defined route: ${path}`);
 for(const prefix of['signature','horizon','atlas','flow','people']){
  const response=await context.request.get(target+'/'+prefix+'/platform/planning',{maxRedirects:0});assert.equal(response.status(),308);assert.equal(response.headers().location,'/platform/planning');
 }
 const missing=await context.request.get(target+'/not-a-fieldgrid-page');assert.equal(missing.status(),404);
 for(const path of['/app','/staff','/klant','/login','/api/crm','/fieldgrid-site','/fieldgrid-site/platform'])assert.equal((await context.request.get(target+path,{maxRedirects:0})).status(),404,path);
 const sitemap=await context.request.get(target+'/sitemap.xml');assert.equal(sitemap.status(),200);assert.equal(((await sitemap.text()).match(/<loc>/g)||[]).length,23);
 assert.deepEqual(errors,[]);console.log('PASS: all 23 routes at five widths, links, canonical/noindex metadata, legacy redirects, 404 and host boundaries.');
}finally{await browser.close();await writeFile(resolve(output,'comparison.json'),JSON.stringify({results,errors,links:[...links]},null,2))}
