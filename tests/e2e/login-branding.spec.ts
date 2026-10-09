import { test, expect, chromium, type Locator } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { request as httpRequest } from "node:http";
import sharp from "sharp";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { requireLocalDatabaseUrl } from "./local-target";
import { createBrandPalette } from "../../lib/branding/palette";

test.use({trace:"off",screenshot:"off",video:"off"});

async function expectSubtleAuthFocus(input: Locator) {
 await input.focus();
 const appearance=await input.evaluate(node=>{
  const wrapper=node.closest(".auth-input");
  if(!wrapper)throw new Error("Authentication field has no composite wrapper");
  const field=getComputedStyle(node),container=getComputedStyle(wrapper);
  return {outline:field.outlineStyle,innerShadow:field.boxShadow,border:parseFloat(container.borderTopWidth),shadow:container.boxShadow};
 });
 expect(appearance.outline).toBe("none");
 expect(appearance.innerShadow).toBe("none");
 expect(appearance.border).toBe(1);
 expect(appearance.shadow).not.toBe("none");
 const dimensions=[...appearance.shadow.matchAll(/(-?\d+(?:\.\d+)?)px/g)].map(match=>Math.abs(Number(match[1])));
 expect(dimensions.every(value=>value<=1),`Oversized composite focus ring: ${appearance.shadow}`).toBe(true);
}

test("hostname tenant identity and colors persist on all login and OTP layouts",async()=>{
 test.setTimeout(90000);
 const db=new pg.Client({connectionString:requireLocalDatabaseUrl().href});await db.connect();
 const id=randomUUID(),slug=`login-${id}`,name="Fictieve Loginorganisatie",path=`${id}/logo.webp`;
 const admin=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
 const browser=await chromium.launch();
 const server=spawn(process.execPath,[".next/standalone/server.js"],{env:{...process.env,HOSTNAME:"127.0.0.1",PORT:"3002",APP_URL:"http://localhost:3002",DEPLOY_TARGET:"local"},stdio:"ignore"});
 try{
  await expect.poll(async()=>{try{return(await fetch("http://127.0.0.1:3002/login")).status;}catch{return 0;}},{timeout:20000}).toBe(200);
  await db.query("insert into public.tenants(id,slug,name)values($1,$2,$3)",[id,slug,name]);
  await db.query("insert into public.tenant_settings(tenant_id)values($1)",[id]);
  const logo=await sharp({create:{width:240,height:80,channels:4,background:"#223d53"}}).webp({lossless:true}).toBuffer();
  const uploaded=await admin.storage.from("branding").upload(path,logo,{contentType:"image/webp"});if(uploaded.error)throw new Error("Synthetic logo upload failed");
  const storedLogo=await admin.rpc("file_scan_state",{target_bucket:"branding",target_path:path});expect(storedLogo.error).toBeNull();expect(storedLogo.data).toMatchObject({mime:"image/webp",size:logo.length});
  await db.query("insert into public.tenant_branding(tenant_id,primary_color,accent_color,logo_path)values($1,'#223D53','#C65D21',$2)",[id,path]);
  // Exercise compiled public PWA presentation through a real validated tenant
  // hostname. Host is the ordinary HTTP authority, never a trusted app header.
  // Node fetch discards Host overrides. Use HTTP directly so the browser's
  // tenant authority actually reaches the proxy; the socket stays loopback.
  const pwaFetch=(pathname:string,hostSlug=slug)=>new Promise<Response>((resolve,reject)=>{
   const request=httpRequest({hostname:"127.0.0.1",port:3002,path:pathname,headers:{host:`${hostSlug}.localhost:3002`}},response=>{
    const chunks:Buffer[]=[];response.on("data",chunk=>chunks.push(Buffer.from(chunk)));response.on("error",reject);
    response.on("end",()=>{
     const headers=new Headers();for(const [key,value] of Object.entries(response.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(", "):value);
     resolve(new Response(new Uint8Array(Buffer.concat(chunks)),{status:response.statusCode,headers}));
    });
   });
   request.on("error",reject);request.setTimeout(20000,()=>request.destroy(new Error("Local PWA presentation request timed out")));request.end();
  });
  const manifestBefore=await pwaFetch("/staff/manifest.webmanifest");expect(manifestBefore.status).toBe(200);expect(manifestBefore.headers.get("cache-control")).toContain("no-store");
  const fieldgridManifest=await manifestBefore.json();expect(fieldgridManifest.name).toBe("Fieldgrid");expect(fieldgridManifest.icons.every((icon:{src:string})=>icon.src.startsWith("/branding/fieldgrid-"))).toBe(true);
  await db.query("begin");
  try{await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role:"service_role"})]);const changed=await db.query("update public.tenant_settings set white_label_enabled=true where tenant_id=$1 returning white_label_enabled",[id]);expect(changed.rows).toEqual([{white_label_enabled:true}]);await db.query("commit");}
  catch(error){await db.query("rollback");throw error;}
  const manifestAfter=await pwaFetch("/staff/manifest.webmanifest");expect(manifestAfter.status).toBe(200);const tenantManifest=await manifestAfter.json();expect(tenantManifest.name).toBe(name);expect(tenantManifest.start_url).toBe("/staff");expect(tenantManifest.display).toBe("standalone");
  for(const size of [192,512])for(const purpose of ["any","maskable"]){
   const icon=tenantManifest.icons.find((item:{sizes:string;purpose:string})=>item.sizes===`${size}x${size}`&&item.purpose===purpose);expect(icon).toBeDefined();expect(icon.src).toMatch(/^\/staff\/pwa\/(icon|maskable)-(192|512)\.png$/);
   const response=await pwaFetch(icon.src);expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toContain("no-store");expect(response.headers.get("content-type")).toBe("image/png");
   const bytes=Buffer.from(await response.arrayBuffer());const metadata=await sharp(bytes).metadata();expect([metadata.width,metadata.height]).toEqual([size,size]);
   const center=await sharp(bytes).extract({left:size/2,top:size/2,width:1,height:1}).removeAlpha().raw().toBuffer();expect([...center]).toEqual([34,61,83]);
  }
  const scannedLogo=await admin.rpc("file_scan_state",{target_bucket:"branding",target_path:path});expect(scannedLogo.error).toBeNull();expect(scannedLogo.data).toMatchObject({sha256:createHash("sha256").update(logo).digest("hex"),mime:"image/webp",size:logo.length});
  for(const [asset,width,height] of [["apple-touch.png",180,180],["splash-750x1334.png",750,1334]] as const){
   const response=await pwaFetch(`/staff/pwa/${asset}`);expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toContain("no-store");const metadata=await sharp(Buffer.from(await response.arrayBuffer())).metadata();expect([metadata.width,metadata.height]).toEqual([width,height]);
  }
  const metadataContext=await browser.newContext();const metadataPage=await metadataContext.newPage();
  try{
   await metadataPage.goto(`http://${slug}.localhost:3002/login?next=%2Fstaff`);
   await expect(metadataPage.locator('link[rel="manifest"]')).toHaveAttribute("href","/staff/manifest.webmanifest");
   await expect(metadataPage.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute("content",name);
   await expect(metadataPage.locator('link[rel="apple-touch-icon"]').first()).toHaveAttribute("href","/staff/pwa/apple-touch.png");
   await expect(metadataPage.locator('link[rel="apple-touch-startup-image"][media*="device-width: 375px"][media*="device-height: 667px"][media*="orientation: portrait"]')).toHaveAttribute("href","/staff/pwa/splash-750x1334.png");
  }finally{await metadataContext.close();}
  for(const endpoint of ["/staff/manifest.webmanifest","/staff/pwa/icon-192.png","/staff/pwa/splash-750x1334.png"]){const response=await pwaFetch(endpoint,`unknown-${id}`);expect(response.status).toBe(404);expect(response.headers.get("cache-control")).toContain("no-store");}
  for(const width of [1440,390])for(const destination of ["/app","/staff","/klant"]){
   const context=await browser.newContext({viewport:{width,height:960}});const page=await context.newPage();
   try{
    // A second isolated local origin permits real tenant hostnames without
    // replacing trusted headers or changing the main suite's Auth origin.
    await page.goto(`http://${slug}.localhost:3002${destination}`);
    const loginUrl=new URL(page.url());expect(loginUrl.origin).toBe(`http://${slug}.localhost:3002`);expect(loginUrl.pathname).toBe("/login");expect(loginUrl.searchParams.get("next")).toBe(destination);
    const card=page.locator(".auth-card");await expect(card.locator(".brand-name-fallback, .brand-tenant-name")).toHaveCount(0);
    const image=card.getByRole("img",{name:`Logo van ${name}`});await expect(image).toBeVisible();
    await expect.poll(()=>image.evaluate(node=>(node as HTMLImageElement).naturalWidth>0)).toBe(true);
    expect(await card.evaluate(node=>getComputedStyle(node).getPropertyValue("--brand-action").trim())).not.toBe("");
    expect((await card.evaluate(node=>getComputedStyle(node).getPropertyValue("--brand-accent").trim())).toLowerCase()).toBe("#c65d21");
    const expectedColor=await card.evaluate((node,color)=>{const sample=document.createElement("span");sample.style.color=color;node.append(sample);const value=getComputedStyle(sample).color;sample.remove();return value;},createBrandPalette("#223D53","#C65D21").action);
    const button=card.getByRole("button",{name:"Inlogcode versturen"});expect(await button.evaluate(node=>getComputedStyle(node).backgroundColor)).toBe(expectedColor);
    const email=card.getByLabel("E-mailadres",{exact:true});await expectSubtleAuthFocus(email);
    await email.fill("fictitious-no-account@example.invalid");await button.click();
    await expect(card.getByLabel("Inlogcode",{exact:true})).toBeVisible();await expect(card.locator(".brand-name-fallback, .brand-tenant-name")).toHaveCount(0);await expect(image).toBeVisible();
    await expectSubtleAuthFocus(card.getByLabel("Inlogcode",{exact:true}));
    expect(await card.getByRole("button",{name:"Code controleren"}).evaluate(node=>getComputedStyle(node).backgroundColor)).toBe(expectedColor);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   }finally{await context.close();}
  }
  for(const width of [1440,390]){
   const context=await browser.newContext({viewport:{width,height:960}});const page=await context.newPage();
   try{
    await page.goto("http://localhost:3002/platform");
    const loginUrl=new URL(page.url());expect(loginUrl.origin).toBe("http://localhost:3002");expect(loginUrl.pathname).toBe("/login");expect(loginUrl.searchParams.get("next")).toBe("/platform");
    const card=page.locator(".auth-card"),productLogo=card.getByRole("img",{name:"Fieldgrid",exact:true});await expect(productLogo).toBeVisible();
    await expect.poll(()=>productLogo.evaluate(node=>(node as HTMLImageElement).naturalWidth>0)).toBe(true);
    await expectSubtleAuthFocus(card.getByLabel("E-mailadres",{exact:true}));
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   }finally{await context.close();}
  }
  const response=await fetch(`http://127.0.0.1:3000/api/branding/${id}/email-logo`);expect(response.status).toBe(200);expect(response.headers.get("content-type")).toBe("image/png");
  expect((await sharp(Buffer.from(await response.arrayBuffer())).metadata()).format).toBe("png");
  await db.query("update public.tenant_branding set logo_path=null where tenant_id=$1",[id]);
  const fallbackManifest=await pwaFetch("/staff/manifest.webmanifest");expect(fallbackManifest.status).toBe(200);expect((await fallbackManifest.json()).name).toBe(name);
  const fallbackIcon=await pwaFetch("/staff/pwa/icon-192.png");expect(fallbackIcon.status).toBe(200);const fallbackBytes=Buffer.from(await fallbackIcon.arrayBuffer());expect((await sharp(fallbackBytes).metadata()).width).toBe(192);
  for(const width of [1440,390])for(const destination of ["/app","/staff","/klant"]){
   const context=await browser.newContext({viewport:{width,height:960}});const page=await context.newPage();
   try{
    await page.goto(`http://${slug}.localhost:3002/login?next=${encodeURIComponent(destination)}`);
    const card=page.locator(".auth-card");
    await expect(card.locator(".brand-name-fallback")).toHaveText(name);
    await expect(card.locator(".brand-name-fallback")).toBeVisible();
    await expect(card.getByRole("img",{name:`Logo van ${name}`})).toHaveCount(0);
    await expectSubtleAuthFocus(card.getByLabel("E-mailadres",{exact:true}));
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   }finally{await context.close();}
  }
  await db.query("update public.tenants set status='suspended' where id=$1",[id]);
  for(const endpoint of ["/staff/manifest.webmanifest","/staff/pwa/icon-192.png","/staff/pwa/splash-750x1334.png"]){const response=await pwaFetch(endpoint);expect(response.status).toBe(404);expect(response.headers.get("cache-control")).toContain("no-store");}
 }finally{
  await browser.close();server.kill("SIGTERM");await admin.storage.from("branding").remove([path]);
  await db.query("begin");await db.query("set local session_replication_role='replica'");for(const table of ["tenant_branding","tenant_settings"])await db.query(`delete from public.${table} where tenant_id=$1`,[id]);await db.query("delete from public.tenants where id=$1",[id]);await db.query("commit");await db.end();
 }
});
