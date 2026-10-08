import {expect,test,type Locator,type Page,type TestInfo} from "@playwright/test";
import {randomUUID} from "node:crypto";
import {Client} from "pg";
import {createClient} from "@supabase/supabase-js";
import {requireLocalDatabaseUrl} from "./local-target";
import {authenticateWorkspace} from "./login-auth";

test.use({reducedMotion:"reduce"});

async function fixture() {
  const db=new Client({connectionString:requireLocalDatabaseUrl().href});
  await db.connect();
  const tenant=randomUUID(),customer=randomUUID(),contact=randomUUID(),object=randomUUID();
  const owner=(await db.query("select id from auth.users where email='platform-admin@fieldgrid.test'")).rows[0].id;
  await db.query("insert into public.tenants(id,slug,name)values($1,$2,'Fictieve modalcontrole')",[tenant,`modal-${tenant}`]);
  await db.query("insert into public.tenant_settings(tenant_id,enabled_services)values($1,array['planning','finance','rapportage','tickets'])",[tenant]);
  await db.query("insert into public.tenant_branding(tenant_id,primary_color,accent_color)values($1,'#223d53','#368341')",[tenant]);
  await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status)values($1,$2,array['tenant_admin','management','planner','finance']::public.app_role[],'active')",[tenant,owner]);
  await db.query("insert into public.customers(id,tenant_id,customer_number,name,billing_email)values($1,$2,'MODAL-KLANT','Fictieve modalorganisatie','modal@fieldgrid.test')",[customer,tenant]);
  await db.query("insert into public.customer_contacts(id,tenant_id,customer_id,full_name,email,phone)values($1,$2,$3,'Robin Klant','modal@fieldgrid.test','0301234567')",[contact,tenant,customer]);
  await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address)values($1,$2,$3,'MODAL-OBJECT','Fictieve modallocatie','{\"street\":\"Teststraat 2\",\"postal_code\":\"1234 AB\",\"city\":\"Teststad\"}')",[object,tenant,customer]);
  return {db,tenant,customer,contact,object,owner,async dispose(){
    await db.query("begin");
    await db.query("set local session_replication_role='replica'");
    const tables=(await db.query("select distinct table_schema,table_name from information_schema.columns where column_name='tenant_id' and table_schema in('public','private')")).rows;
    for(const {table_schema:s,table_name:n} of tables)await db.query(`delete from "${s}"."${n}" where tenant_id=$1`,[tenant]);
    await db.query("delete from public.tenants where id=$1",[tenant]);
    await db.query("commit");
    await db.end();
  }};
}

async function inspect(page:Page,dialog:Locator,info:TestInfo,name:string) {
  await expect(dialog).toBeVisible();
  await page.evaluate(()=>document.fonts.ready);
  const viewport=page.viewportSize()!;
  await expect.poll(()=>dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await expect.poll(async()=>{
    const box=await dialog.boundingBox();
    return !!box&&box.x>=-1&&box.y>=-1&&box.x+box.width<=viewport.width+1&&box.y+box.height<=viewport.height+1;
  }).toBe(true);
  const fields=dialog.locator('input:not([type="hidden"]):not([type="checkbox"]):visible,select:visible,textarea:visible');
  if(await fields.count()) {
    const positions=await fields.evaluateAll(elements=>elements.map(el=>{
      const {left,right,top}=el.getBoundingClientRect();
      return {left,right,top};
    }));
    const frame=(await dialog.boundingBox())!;
    for(const box of positions) {
      expect(box.left-frame.x).toBeGreaterThanOrEqual(19);
      expect(frame.x+frame.width-box.right).toBeGreaterThanOrEqual(19);
    }
    const rows=[...new Set(positions.map(box=>Math.round(box.top)))].sort((a,b)=>a-b);
    // Rows stay close together even in a tall frame; nested business fields
    // must never distribute themselves across the entire available height.
    if(await dialog.locator(".dossier-form").count()) {
      for(let i=1;i<rows.length;i++)expect(rows[i]-rows[i-1]).toBeLessThan(140);
    }
  }
  const footer=dialog.locator('footer,.wizard-footer').last();
  if(await footer.count()) {
    const frame=(await dialog.boundingBox())!;
    await expect.poll(async()=>{
      const box=await footer.boundingBox();
      return !!box&&box.y>=frame.y&&box.y+box.height<=frame.y+frame.height+1;
    }).toBe(true);
  }
  const scroll=dialog.locator('.dossier-form>.dossier-form-fields:not([hidden]),.commercial-wizard>.wo-wizard-step:not([hidden]),.commercial-wizard>.commercial-form-body,.modal-body').first();
  if(await scroll.count()) {
    const legend=scroll.locator(':scope>legend').first();
    if(await legend.count()) {
      const body=(await scroll.boundingBox())!,heading=(await legend.boundingBox())!;
      expect(heading.y-body.y).toBeGreaterThanOrEqual(20);
    }
    await scroll.evaluate(el=>{el.scrollTop=el.scrollHeight;});
    const last=fields.last();
    if(await last.count()) {
      const body=(await scroll.boundingBox())!,control=(await last.boundingBox())!;
      expect(control.y+control.height).toBeLessThanOrEqual(body.y+body.height+1);
    }
    await scroll.evaluate(el=>{el.scrollTop=0;});
  }
  await page.screenshot({path:info.outputPath(`${name}-${viewport.width}.png`),animations:"disabled",style:"nextjs-portal,[data-sonner-toaster]{visibility:hidden}"});
}

test("tenantmodals houden wizardvelden compact en dossieracties en tabs bereikbaar",async({page},info)=>{
  test.setTimeout(120000);
  const f=await fixture();
  try {
    await f.db.query("insert into public.requests(tenant_id,customer_id,object_id,request_number,subject,discipline,description,next_action,created_by)values($1,$2,$3,'MODAL-AANVRAAG','Fictieve modalaanvraag','Onderhoud','Controle van de locatie','Aanvraag beoordelen',$4)",[f.tenant,f.customer,f.object,f.owner]);
    await page.context().addCookies([{name:"fieldgrid_tenant_id",value:f.tenant,url:"http://127.0.0.1:3000"}]);
    await authenticateWorkspace(page,"platform-admin@fieldgrid.test","/app/klanten");
    for(const width of [1440,390,320]) {
      await page.setViewportSize({width,height:900});
      for(const [route,title] of [["/app/klanten","Nieuwe klant"],["/app/objecten","Nieuw object"],["/app/werkbonnen","Nieuwe werkbon"],["/app/aanvragen","Nieuwe aanvraag"]]) {
        await page.goto(route);
        await page.getByRole("button",{name:title,exact:true}).click();
        const dialog=page.getByRole("dialog",{name:title,exact:true});
        await inspect(page,dialog,info,title);
        if(title==="Nieuwe werkbon") {
          await dialog.getByRole("button",{name:"Nieuwe klant",exact:true}).click();
          const nested=page.getByRole("dialog",{name:"Nieuwe klant",exact:true});
          await inspect(page,nested,info,"geneste-klantwizard");
          await nested.getByRole("button",{name:"Annuleren",exact:true}).click();
          await expect(dialog).toBeVisible();
        }
        await dialog.getByRole("button",{name:"Annuleren",exact:true}).click();
        await expect(dialog).toHaveCount(0);
      }
      await page.goto("/app/aanvragen");
      await page.getByRole("button",{name:"Bekijk",exact:true}).click();
      const detail=page.getByRole("dialog",{name:"Fictieve modalaanvraag",exact:true});
      await inspect(page,detail,info,"dossier");
      const tabs=detail.getByRole("tablist");
      // The rail is transparent; the selected card joins the white content.
      await expect(tabs).toHaveCSS("overflow-x","auto");
      const selected=detail.getByRole("tab",{name:"Overzicht",exact:true});
      await expect(selected).toHaveCSS("background-color","rgb(255, 255, 255)");
      await expect(selected).toHaveCSS("border-top-left-radius","11px");
      await expect(selected).toHaveCSS("border-bottom-color","rgb(255, 255, 255)");
      await detail.getByRole("tab",{name:"Overzicht",exact:true}).focus();
      await page.keyboard.press("ArrowRight");
      await expect(detail.getByRole("tab",{name:"Documenten",exact:true})).toHaveAttribute("data-state","active");
      await expect(detail.getByRole("tabpanel")).toBeVisible();
      await detail.getByRole("button",{name:"Sluiten",exact:true}).click();
    }
  } finally {await f.dispose();}
});

test("klantmodals behouden compacte velden, tabnavigatie en mobiele acties",async({page},info)=>{
  test.setTimeout(90000);
  const f=await fixture();
  const admin=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
  let userId="";
  try {
    const email=`modal-${randomUUID()}@fieldgrid.test`;
    const created=await admin.auth.admin.createUser({email,password:"Fieldgrid-E2E-2026",email_confirm:true});
    if(created.error||!created.data.user)throw new Error("Customer fixture creation failed");
    userId=created.data.user.id;
    await f.db.query("insert into public.object_customer_bindings(tenant_id,object_id,user_id,created_by)values($1,$2,$3,$4)",[f.tenant,f.object,userId,f.owner]);
    const account=(await f.db.query("update public.customer_portal_accounts set contact_id=$3,can_create_objects=true,can_edit_objects=true,can_edit_profile=true where tenant_id=$1 and user_id=$2 returning id",[f.tenant,userId,f.contact])).rows[0].id;
    await page.context().addCookies([{name:"fieldgrid_tenant_id",value:f.tenant,url:"http://127.0.0.1:3000"}]);
    await authenticateWorkspace(page,email,`/klant?account=${account}`);
    for(const width of [1440,390,320]) {
      await page.setViewportSize({width,height:900});
      await page.getByRole("button",{name:"Object toevoegen",exact:true}).first().click();
      const form=page.getByRole("dialog",{name:"Object toevoegen",exact:true});
      await inspect(page,form,info,"klantformulier");
      await form.getByRole("button",{name:"Annuleren",exact:true}).click();
      await page.locator(".object-card").first().click();
      const detail=page.getByRole("dialog",{name:"Fictieve modallocatie",exact:true});
      await inspect(page,detail,info,"klantdossier");
      await detail.getByRole("tab",{name:"Overzicht",exact:true}).focus();
      await page.keyboard.press("ArrowRight");
      await expect(detail.getByRole("tab",{name:"Vaste instructies",exact:true})).toHaveAttribute("aria-selected","true");
      await expect(detail.getByRole("tabpanel")).toBeVisible();
      await detail.getByRole("button",{name:"Sluiten",exact:true}).click();
    }
  } finally {await f.dispose();if(userId)await admin.auth.admin.deleteUser(userId);}
});
