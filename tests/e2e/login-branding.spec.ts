import { test, expect, chromium, type Locator } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
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
  const logo=await sharp({create:{width:240,height:80,channels:4,background:"#223d53"}}).webp().toBuffer();
  const uploaded=await admin.storage.from("branding").upload(path,logo,{contentType:"image/webp"});if(uploaded.error)throw new Error("Synthetic logo upload failed");
  await db.query("insert into public.tenant_branding(tenant_id,primary_color,accent_color,logo_path)values($1,'#223D53','#C65D21',$2)",[id,path]);
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
    const card=page.locator(".auth-card");await expect(card.locator(".product-brand")).toHaveText("Fieldgrid");
    await expectSubtleAuthFocus(card.getByLabel("E-mailadres",{exact:true}));
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   }finally{await context.close();}
  }
  const response=await fetch(`http://127.0.0.1:3000/api/branding/${id}/email-logo`);expect(response.status).toBe(200);expect(response.headers.get("content-type")).toBe("image/png");
  expect((await sharp(Buffer.from(await response.arrayBuffer())).metadata()).format).toBe("png");
  await db.query("update public.tenant_branding set logo_path=null where tenant_id=$1",[id]);
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
 }finally{
  await browser.close();server.kill("SIGTERM");await admin.storage.from("branding").remove([path]);
  await db.query("begin");await db.query("set local session_replication_role='replica'");for(const table of ["tenant_branding","tenant_settings"])await db.query(`delete from public.${table} where tenant_id=$1`,[id]);await db.query("delete from public.tenants where id=$1",[id]);await db.query("commit");await db.end();
 }
});
