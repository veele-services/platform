import { expect,test,type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { requireLocalApiUrl, requireLocalDatabaseUrl } from "./local-target";
import { authenticateWorkspace } from "./login-auth";

test.use({trace:"off",screenshot:"off",video:"off"});
async function login(page:Page,email="platform-admin@fieldgrid.test",password="Fieldgrid-E2E-2026"){
  await test.step("Sign in with the synthetic account",async()=>{
    await authenticateWorkspace(page,email,"/app",password);await page.waitForURL("**/app");
    await expect(page.locator("html")).not.toHaveAttribute("data-account-blocked");
  },{timeout:10000});
}
test("logout removes legacy searches, fences another tab before logout completes, and blocks old account history",async({page,context})=>{
  const url=requireLocalApiUrl();
  const admin=createClient(url.href,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
  const email=`privacy-${randomUUID()}@fieldgrid.test`,password="Fictitious-Privacy-2026";
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true});if(!created.data.user||created.error)throw new Error("Fixture unavailable");
  const other=await context.newPage();let release=()=>{};
  try{
    await login(page);await page.goto("/app/klanten");
    await page.evaluate(()=>{
      localStorage.setItem("fieldgrid:planboard:fictional:actor",JSON.stringify({search:"FICTITIOUS PRIVATE SEARCH",zoom:"wide",from:"08:00"}));
      sessionStorage.setItem("customer-scroll:/app/klanten?q=FICTITIOUS-PRIVATE", "120");localStorage.setItem("unrelated-fixture","preserved");
    });
    await page.reload();await expect(page.locator("html")).not.toHaveAttribute("data-account-blocked");
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem("fieldgrid:planboard:fictional:actor")!))).toEqual({zoom:"wide",from:"08:00"});
    expect(await page.evaluate(()=>Object.keys(sessionStorage).some(key=>key.startsWith("customer-scroll:")))).toBe(false);
    await other.goto("/app/klanten");await expect(other.getByRole("heading",{name:"Klanten",exact:true})).toBeVisible();
    await other.getByRole("link",{name:"Planbord",exact:true}).click();
    await expect(other.getByRole("heading",{name:"Planbord",exact:true})).toBeVisible();
    const held=new Promise<void>(resolve=>{release=resolve;});
    await page.route("**/auth/signout",async route=>{await held;await route.continue();});
    const logout=page.getByRole("button",{name:"Uitloggen",exact:true}).click();
    await expect(other.locator("html")).toHaveAttribute("data-account-blocked","true");
    await expect(other.getByRole("heading",{name:"Klanten",exact:true})).not.toBeVisible();
    await test.step("Restore the prior document while logout is pending",async()=>{
      // The privacy fence may replace this navigation with the safe login
      // document. Only its commit is required before testing the live fence.
      await other.goBack({waitUntil:"commit"});
    },{timeout:10000});
    // A still-live response during a pending logout must not uncover old data.
    const liveSignal=await (await other.request.get("/api/auth/session")).json();
    expect(Boolean(liveSignal.sessionKey)).toBe(true);
    let checked=false;
    const observeCheck=(response:{url:()=>string})=>{if(new URL(response.url()).pathname==="/api/auth/session")checked=true;};
    other.on("response",observeCheck);
    try{
      // The fence may already have left the restored protected document.
      // A safe login document has no retry listener and must not be awaited
      // forever for a fetch that only the protected document can issue.
      await other.evaluate(()=>window.dispatchEvent(new Event("fieldgrid-session-retry")));
      await expect.poll(()=>checked||new URL(other.url()).pathname==="/login").toBe(true);
      if(new URL(other.url()).pathname!=="/login")await expect(other.locator("html")).toHaveAttribute("data-account-blocked","true");
      await expect(other.getByRole("heading",{name:"Klanten",exact:true})).not.toBeVisible();
    }finally{other.off("response",observeCheck);}
    await test.step("Both tabs finish logout",async()=>{
      release();await logout;
      await expect.poll(()=>new URL(page.url()).pathname).toBe("/login");
      // Background tabs may delay navigation; returning to one must validate
      // before showing any protected content, including after a missed pulse.
      await other.bringToFront();
      const sessionResponse=await other.request.get("/api/auth/session");
      const sessionSignal=await sessionResponse.json();
      expect({status:sessionResponse.status(),active:Boolean(sessionSignal.sessionKey),error:sessionSignal.error??null}).toEqual({status:200,active:false,error:null});
      // The cross-tab pulse may already have completed the safe navigation.
      // If a protected document is still present, focus must finish fencing it.
      // Do not wait for a particular fetch: the earlier pulse can win the race
      // between this URL check and the focus event and navigate immediately.
      if(new URL(other.url()).pathname!=="/login"){
        await other.evaluate(()=>window.dispatchEvent(new Event("focus")));
      }
      await expect.poll(()=>new URL(other.url()).pathname).toBe("/login");
    },{timeout:10000});
    await login(page,email,password);await expect(page.getByRole("heading",{name:"Je account is nog niet gekoppeld"})).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("heading",{name:"Klanten",exact:true})).not.toBeVisible();
    await page.goto("/app/klanten");await expect(page.getByRole("heading",{name:"Klanten",exact:true})).not.toBeVisible();
    expect(await page.evaluate(()=>localStorage.getItem("unrelated-fixture"))).toBe("preserved");
  }finally{release();await other.close();await admin.auth.admin.deleteUser(created.data.user.id);}
});

test("delayed hydration cannot attach a new account to an old rendered document",async({page,context})=>{
  const url=requireLocalApiUrl();
  const admin=createClient(url.href,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
  const email=`privacy-hydration-${randomUUID()}@fieldgrid.test`,password="Fictitious-Privacy-2026";
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true});if(!created.data.user||created.error)throw new Error("Fixture unavailable");
  const delayed=await context.newPage();let release=()=>{};
  try{
    await login(page);
    const held=new Promise<void>(resolve=>{release=resolve;});
    await delayed.route("**/_next/static/**/*.js",async route=>{await held;await route.continue();});
    await delayed.goto("/app/klanten",{waitUntil:"commit"});
    await expect(delayed.locator("html")).toHaveAttribute("data-account-blocked","true");
    await expect(delayed.getByRole("heading",{name:"Klanten",exact:true})).not.toBeVisible();
    await page.getByRole("button",{name:"Uitloggen",exact:true}).click();
    await page.waitForURL(url=>url.pathname==="/login");
    await login(page,email,password);
    release();
    await expect(delayed.getByRole("heading",{name:"Deze pagina bestaat niet."})).toBeVisible();
    await expect(delayed.getByRole("heading",{name:"Klanten",exact:true})).not.toBeVisible();
  }finally{release();await delayed.close();await admin.auth.admin.deleteUser(created.data.user.id);}
});

for(const audience of ["staff","customer"] as const)test(`${audience}: two real accounts on one device never share the prior profile, object or document`,async({page,context})=>{
  test.setTimeout(audience==="staff"?120000:60000);
  const api=requireLocalApiUrl(),database=requireLocalDatabaseUrl();
  const admin=createClient(api.href,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
  const db=new pg.Client({connectionString:database.href});await db.connect();
  const tenant=randomUUID(),people=[randomUUID(),randomUUID()],documents=[randomUUID(),randomUUID()];
  const users:string[]=[],paths:string[]=[],password="Fictitious-Device-2026";
  let primaryFailure:unknown;
  const emails=[0,1].map(()=>`device-${randomUUID()}@fieldgrid.test`);
  const names=["FICTITIOUS Device Alpha","FICTITIOUS Device Beta"];
  const target=audience==="staff"?"/staff":"/klant",other=await context.newPage();
  if(audience==="staff")await Promise.all([page.setViewportSize({width:390,height:844}),other.setViewportSize({width:390,height:844})]);
  const checked=async(result:{error:unknown})=>{if(result.error)throw new Error("Synthetic fixture operation failed");};
  const enter=async(index:number)=>{
    await authenticateWorkspace(page,emails[index],target,password);
    await expect(page.locator("html")).not.toHaveAttribute("data-account-blocked");
    if(audience==="staff")await page.getByRole("button",{name:"Meer",exact:true}).click();
    await expect(page.getByRole("heading",{name:names[index],exact:true})).toBeVisible();
    await expect(page.getByText(names[1-index],{exact:true})).toHaveCount(0);
  };
  try{
    await db.query("insert into public.tenants(id,slug,name) values($1,$2,'FICTITIOUS device isolation')",[tenant,`device-${tenant}`]);
    await db.query("insert into public.tenant_settings(tenant_id) values($1)",[tenant]);
    await db.query("insert into public.tenant_branding(tenant_id) values($1)",[tenant]);
    for(let i=0;i<2;i++){
      const result=await admin.auth.admin.createUser({email:emails[i],password,email_confirm:true});await checked(result);
      if(!result.data.user)throw new Error("Synthetic user missing");users.push(result.data.user.id);
      if(audience==="staff"){
        await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['staff']::public.app_role[],'active')",[tenant,users[i]]);
        await db.query("insert into public.personnel(id,tenant_id,user_id,employee_number,full_name,status,onboarding_step,onboarding_completed_at) values($1,$2,$3,$4,$5,'active',5,now())",[people[i],tenant,users[i],`FIX-${i}`,names[i]]);
        const bytes=Buffer.from(`%PDF-1.4\n% FICTITIOUS own document ${i}\n%%EOF`),path=`${tenant}/${people[i]}/${documents[i]}.pdf`;paths.push(path);
        // Historical unpublished bytes are scanned by the real download gateway.
        await checked(await admin.storage.from("personnel-documents").upload(path,bytes,{contentType:"application/pdf"}));
        await db.query("insert into public.personnel_documents(id,tenant_id,personnel_id,title,document_type,storage_path,file_name,mime_type,size_bytes,sha256,visible_to_employee,created_by,dossier_data) values($1,$2,$3,$4,'other',$5,'FICTITIOUS.pdf','application/pdf',$6,encode(extensions.digest($7::bytea,'sha256'),'hex'),true,$8,'{\"private\":\"FICTITIOUS INTERNAL HR\"}')",[documents[i],tenant,people[i],`Eigen document ${i}`,path,bytes.length,bytes,users[i]]);
      }else{
        const customer=randomUUID(),object=randomUUID();
        await db.query("insert into public.customers(id,tenant_id,customer_number,name) values($1,$2,$3,$4)",[customer,tenant,`FIX-${i}`,`FICTITIOUS customer ${i}`]);
        await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values($1,$2,$3,$4,$5,'{}')",[object,tenant,customer,`FIX-${i}`,names[i]]);
        await db.query("insert into public.object_customer_bindings(tenant_id,object_id,user_id,created_by) values($1,$2,$3,$3)",[tenant,object,users[i]]);
      }
    }
    await context.addCookies([{name:"fieldgrid_tenant_id",value:tenant,url:"http://127.0.0.1:3000"}]);
    await test.step("open the first account safely in both tabs",async()=>{
      await enter(0);await other.goto(target);await expect(other.locator("html")).not.toHaveAttribute("data-account-blocked");
      if(audience==="staff"){
        await other.getByRole("button",{name:"Meer",exact:true}).click();
        const own=await page.request.get(`/api/files/personnel-document/${documents[0]}`);expect(own.status()).toBe(200);expect(await own.text()).toContain("FICTITIOUS own document 0");
        expect((await page.request.get(`/api/files/personnel-document/${documents[1]}`)).status()).toBe(404);
        expect(await page.content()).not.toContain("FICTITIOUS INTERNAL HR");
      }
      await expect(other.getByRole("heading",{name:names[0],exact:true})).toBeVisible();
    },{timeout:30000});
    await test.step("logout fences the first account in every tab",async()=>{
      if(audience==="customer"){
        await page.getByRole("button",{name:"Profielmenu openen",exact:true}).click();
        await page.getByRole("menuitem",{name:"Uitloggen",exact:true}).click();
      }else await page.getByRole("button",{name:"Uitloggen",exact:true}).click();
      await page.waitForURL(url=>url.pathname==="/login");
      await expect(other.getByRole("heading",{name:names[0],exact:true})).not.toBeVisible();
    },{timeout:30000});
    await test.step("the second account cannot revive the first account",async()=>{
      await enter(1);
      await page.goBack();await expect(page.getByRole("heading",{name:names[0],exact:true})).not.toBeVisible();
      await other.bringToFront();await other.evaluate(()=>window.dispatchEvent(new Event("focus")));
      await expect(other.getByRole("heading",{name:names[0],exact:true})).not.toBeVisible();
      await page.goto(target);await expect(page.locator("html")).not.toHaveAttribute("data-account-blocked");
    },{timeout:30000});
    await test.step("the second account sees only its own resources",async()=>{
      if(audience==="staff"){
        await page.getByRole("button",{name:"Meer",exact:true}).click();
        expect((await page.request.get(`/api/files/personnel-document/${documents[0]}`)).status()).toBe(404);
        const own=await page.request.get(`/api/files/personnel-document/${documents[1]}`);expect(own.status()).toBe(200);expect(await own.text()).toContain("FICTITIOUS own document 1");
      }
      await expect(page.getByRole("heading",{name:names[1],exact:true})).toBeVisible();
    },{timeout:30000});
  }catch(error){primaryFailure=error;}finally{
    await other.close();
    try{
      if(paths.length)await checked(await admin.storage.from("personnel-documents").remove(paths));
      await db.query("delete from public.dossier_documents where tenant_id=$1",[tenant]);
      await db.query("delete from public.personnel_documents where tenant_id=$1",[tenant]);
      await db.query("delete from public.personnel_dossier_access where tenant_id=$1",[tenant]);
      await db.query("delete from public.object_customer_bindings where tenant_id=$1",[tenant]);
      await db.query("delete from private.customer_portal_commands where tenant_id=$1",[tenant]);
      await db.query("delete from public.customer_portal_accounts where tenant_id=$1",[tenant]);
      for(const table of ["notification_deliveries","notification_requests","notification_planning_events"])await db.query(`delete from private.${table} where tenant_id=$1`,[tenant]);
      await db.query("delete from private.notification_template_versions where template_id in(select id from private.notification_templates where tenant_id=$1)",[tenant]);
      await db.query("delete from private.notification_templates where tenant_id=$1",[tenant]);
      await db.query("delete from public.objects where tenant_id=$1",[tenant]);
      await db.query("delete from public.customers where tenant_id=$1",[tenant]);
      await db.query("delete from public.tenants where id=$1",[tenant]);
      for(const id of users)await checked(await admin.auth.admin.deleteUser(id));
    }catch(error){if(!primaryFailure)primaryFailure=error;else test.info().annotations.push({type:"fixture-cleanup",description:"Fixture cleanup also failed; primary privacy assertion retained."});}finally{await db.end();}
  }
  if(primaryFailure)throw primaryFailure;
});
