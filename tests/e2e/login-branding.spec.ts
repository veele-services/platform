import { test, expect, chromium } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import sharp from "sharp";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { requireLocalDatabaseUrl } from "./local-target";
import { createBrandPalette } from "../../lib/branding/palette";

test.use({trace:"off",screenshot:"off",video:"off"});
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
    await page.goto(`http://${slug}.localhost:3002/login?next=${encodeURIComponent(destination)}`);
    const card=page.locator(".auth-card");await expect(card.getByText(name,{exact:true})).toBeVisible();
    const image=card.getByRole("img",{name:`Logo van ${name}`});await expect(image).toBeVisible();
    await expect.poll(()=>image.evaluate(node=>(node as HTMLImageElement).naturalWidth>0)).toBe(true);
    expect(await card.evaluate(node=>getComputedStyle(node).getPropertyValue("--brand-action").trim())).not.toBe("");
    expect((await card.evaluate(node=>getComputedStyle(node).getPropertyValue("--brand-accent").trim())).toLowerCase()).toBe("#c65d21");
    const expectedColor=await card.evaluate((node,color)=>{const sample=document.createElement("span");sample.style.color=color;node.append(sample);const value=getComputedStyle(sample).color;sample.remove();return value;},createBrandPalette("#223D53","#C65D21").action);
    const button=card.getByRole("button",{name:"Inlogcode versturen"});expect(await button.evaluate(node=>getComputedStyle(node).backgroundColor)).toBe(expectedColor);
    await card.getByLabel("E-mailadres",{exact:true}).fill("fictitious-no-account@example.invalid");await button.click();
    await expect(card.getByLabel("Inlogcode",{exact:true})).toBeVisible();await expect(card.getByText(name,{exact:true})).toBeVisible();await expect(image).toBeVisible();
    expect(await card.getByRole("button",{name:"Code controleren"}).evaluate(node=>getComputedStyle(node).backgroundColor)).toBe(expectedColor);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   }finally{await context.close();}
  }
  const response=await fetch(`http://127.0.0.1:3000/api/branding/${id}/email-logo`);expect(response.status).toBe(200);expect(response.headers.get("content-type")).toBe("image/png");
  expect((await sharp(Buffer.from(await response.arrayBuffer())).metadata()).format).toBe("png");
 }finally{
  await browser.close();server.kill("SIGTERM");await admin.storage.from("branding").remove([path]);
  await db.query("begin");await db.query("set local session_replication_role='replica'");for(const table of ["tenant_branding","tenant_settings"])await db.query(`delete from public.${table} where tenant_id=$1`,[id]);await db.query("delete from public.tenants where id=$1",[id]);await db.query("commit");await db.end();
 }
});
