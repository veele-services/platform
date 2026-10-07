/** Deliberate, staging-only acceptance against the real Mollie test checkout.
 * No real customer invoices, mail, secret values, browser traces or tokens.
 * Clearly labelled synthetic paid ledger evidence is retained and archived.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { rootCertificates } from "node:tls";
import { Client } from "pg";
import { chromium, expect, type Browser, type BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { stagingDatabaseUrl } from "../lib/env/staging-database";
import { confirmMollieTestCheckout, MollieTestCheckoutError } from "../lib/operations/mollie-test-checkout";
let phase="guards";

async function main() {
  const slug=process.env.TARGET_TENANT_SLUG;
  if(process.env.GITHUB_ACTIONS!=="true"||process.env.GITHUB_REF!=="refs/heads/staging"||process.env.INTEGRATION_OPERATION!=="acceptance"||!slug||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||process.env.APP_URL!=="https://staging.fieldgrid.nl"||!process.env.MOLLIE_API_KEY?.startsWith("test_"))throw new Error("Stagingacceptatie geweigerd");
  const platform="https://staging.fieldgrid.nl",origin=`https://${slug}.staging.fieldgrid.nl`;
  const health=await fetch(`${platform}/api/healthz`,{signal:AbortSignal.timeout(10000)}),identity=await health.json();
  if(!health.ok||identity.environment!=="staging"||identity.release!==process.env.RELEASE_SHA)throw new Error("Onjuiste stagingrelease");
  const url=stagingDatabaseUrl("MIGRATION_DATABASE_URL",process.env);url.searchParams.delete("sslmode");
  const db=new Client({connectionString:url.href,options:"-c statement_timeout=15000",connectionTimeoutMillis:10000,ssl:{rejectUnauthorized:true,ca:[...rootCertificates,readFileSync(new URL("./certs/supabase-root-2021.crt",import.meta.url),"utf8")]}});db.on("error",()=>undefined);await db.connect();
  const api=process.env.SUPABASE_URL!,admin=createClient(api,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
  const customer=randomUUID(),object=randomUUID(),contact=randomUUID(),email=`mollie-acceptance-${randomUUID()}@example.invalid`;
  let userId="",tenant="",account="";
  let browser:Browser|undefined,context:BrowserContext|undefined,failed=false;
  let lastVerifiedAttempt:{id:string;providerId:string;profile:string;amount:number;invoiceIds:string[]}|undefined;
  try {
    browser=await chromium.launch();
    phase="tenant_and_merchant";
    const target=(await db.query("select t.id,c.public_config->>'profile_id' profile from public.tenants t join public.tenant_provider_connections c on c.tenant_id=t.id and c.provider='mollie' and c.active and c.verified_at is not null and c.mode='test' and c.secret_reference='MOLLIE_API_KEY' where t.slug=$1 and t.status='active'",[slug])).rows[0];
    if(!target)throw new Error("Geverifieerde tenanttestverbinding ontbreekt");tenant=target.id;
    const owner=(await db.query("select user_id from public.tenant_memberships where tenant_id=$1 and status='active' and ('tenant_admin'=any(roles) or 'management'=any(roles)) order by created_at limit 1",[tenant])).rows[0];
    if(!owner)throw new Error("Beheerder voor testbewijs ontbreekt");
    const created=await admin.auth.admin.createUser({email,email_confirm:true});if(created.error||!created.data.user)throw new Error("Testaccount kon niet worden aangemaakt");userId=created.data.user.id;
    phase="synthetic_customer_and_invoices";
    const prefix=`TEST-MOLLIE-${customer.slice(0,8)}`;
    await db.query("insert into public.customers(id,tenant_id,customer_number,name,billing_email,billing_address)values($1,$2,$3,'FICTIEVE MOLLIE STAGINGACCEPTATIE',$4,'{\"street\":\"Fictieve testlocatie 1\",\"postal_code\":\"1234 AB\",\"city\":\"Teststad\"}')",[customer,tenant,prefix,email]);
    await db.query("insert into public.customer_contacts(id,tenant_id,customer_id,full_name,email,phone)values($1,$2,$3,'Fictieve Mollie Tester',$4,'0301234567')",[contact,tenant,customer,email]);
    await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address)values($1,$2,$3,$4,'FICTIEVE MOLLIE TESTLOCATIE','{\"street\":\"Fictieve testlocatie 1\",\"postal_code\":\"1234 AB\",\"city\":\"Teststad\"}')",[object,tenant,customer,prefix]);
    await db.query("insert into public.object_customer_bindings(tenant_id,object_id,user_id,created_by)values($1,$2,$3,$4)",[tenant,object,userId,owner.user_id]);
    account=(await db.query("update public.customer_portal_accounts set contact_id=$3 where tenant_id=$1 and user_id=$2 returning id",[tenant,userId,contact])).rows[0].id;
    // The paid transition also queues customer notifications. Suppress email
    // through the existing personal policy for this synthetic account only.
    phase="synthetic_mail_preference";
    await db.query("insert into private.notification_preferences(tenant_id,user_id,context,email)values($1,$2,'customer',false)",[tenant,userId]);
    const mailPolicy=(await db.query("select private.notification_policy($1,'customer.payment_received','customer','email',$2) policy",[tenant,userId])).rows[0]?.policy;
    if(mailPolicy?.allowed!==false)throw new Error("E-mail voor het fictieve account is niet geblokkeerd");
    phase="synthetic_customer_and_invoices";
    const invoices:Array<{id:string;number:string;amount:number}>=[];
    for(const [i,amount]of [100,200,300].entries()){
      const order=randomUUID(),task=randomUUID(),invoice=randomUUID(),number=`${prefix}-${i+1}`;
      await db.query("insert into public.work_orders(id,tenant_id,customer_id,object_id,work_order_number,discipline,status,created_by,planned_start_at,planned_end_at,projected_start_at,projected_end_at)values($1,$2,$3,$4,$5,'Fictieve stagingtest','invoice_ready',$6,now(),now()+interval '1 hour',now(),now()+interval '1 hour')",[order,tenant,customer,object,number,owner.user_id]);
      await db.query("insert into public.work_order_tasks(id,tenant_id,work_order_id,task_code,task_name,duration_minutes,quantity,unit,unit_price_cents,vat_basis_points,completed_at,executed_quantity,execution_state)values($1,$2,$3,'TEST','Fictieve Mollie-testbetaling',15,1,'stuk',$4,0,now(),1,'completed')",[task,tenant,order,amount]);
      await db.query("insert into public.invoices(id,tenant_id,customer_id,created_by,status,invoice_number,issued_on,due_on,subtotal_cents,total_cents)values($1,$2,$3,$4,'draft',$5,current_date,current_date+30,$6,$6)",[invoice,tenant,customer,owner.user_id,number,amount]);
      await db.query("insert into public.invoice_lines(tenant_id,invoice_id,work_order_id,work_order_task_id,description,quantity,unit,unit_price_cents,subtotal_cents,vat_basis_points,vat_cents,total_cents)values($1,$2,$3,$4,'Fictieve Mollie-testbetaling',1,'stuk',$5,$5,0,0,$5)",[tenant,invoice,order,task,amount]);
      await db.query("update public.invoices set status='sent',finalized_at=now(),customer_snapshot='{}',branding_snapshot='{}',lines_snapshot='[]' where id=$1",[invoice]);invoices.push({id:invoice,number,amount});
    }
    // Generate/verify an OTP fixture without delivering a message. Tokens stay
    // only in this ephemeral runner and never enter logs, screenshots or traces.
    phase="synthetic_otp_session";
    const link=await admin.auth.admin.generateLink({type:"magiclink",email});if(link.error)throw new Error("Testauthenticatie mislukt");
    const jar=new Map<string,string>();
    const auth=createServerClient(api,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>{for(const {name,value}of values){if(value)jar.set(name,value);else jar.delete(name);}}}});
    const session=await auth.auth.verifyOtp({token_hash:link.data.properties.hashed_token,type:"magiclink"});if(session.error||!session.data.session)throw new Error("Testsessie mislukt");
    context=await browser.newContext({viewport:{width:390,height:960}});await context.addCookies([...jar].map(([name,value])=>({name,value,url:origin,secure:true,httpOnly:false,sameSite:"Lax" as const})));
    const page=await context.newPage();
    for(const [index,selected]of [[invoices[0]],[invoices[1],invoices[2]]].entries()){
      lastVerifiedAttempt=undefined;
      phase=index===0?"single_invoice_selection":"bundle_selection";
      if(index===1)await page.setViewportSize({width:1440,height:1000});
      await page.goto(`${origin}/klant?account=${account}&view=invoices`);await expect(page.getByRole("heading",{name:"Facturen",exact:true,level:1})).toBeVisible();
      await expect(page.getByText("Je organisatie heeft online betalen nog niet aangesloten. Neem bij vragen contact op.")).toHaveCount(0);
      for(const invoice of selected)await page.getByRole("checkbox",{name:`Selecteer ${invoice.number}`,exact:true}).check();
      await page.getByRole("button",{name:"Betalen",exact:true}).click();const dialog=page.getByRole("dialog");await expect(dialog.getByRole("heading",{name:"Betaling controleren",exact:true})).toBeVisible();
      phase="create_real_test_checkout";
      await dialog.getByRole("button",{name:"Veilig verder naar Mollie",exact:true}).click();await page.waitForURL(url=>url.hostname.endsWith("mollie.com"),{timeout:20000});
      const attempt=(await db.query("select p.id,p.provider_payment_id,p.amount_cents::int amount_cents,p.provider_mode,p.merchant_profile_id from public.payment_attempts p join public.invoice_groups g on g.tenant_id=p.tenant_id and g.id=p.invoice_group_id where p.tenant_id=$1 and g.customer_id=$2 order by p.created_at desc limit 1",[tenant,customer])).rows[0];
      const amount=selected.reduce((sum,invoice)=>sum+invoice.amount,0);if(!attempt||attempt.amount_cents!==amount||attempt.provider_mode!=="test"||attempt.merchant_profile_id!==target.profile)throw new Error("Onjuiste betaalontvanger of totaal");
      const provider=await fetch(`https://api.mollie.com/v2/payments/${attempt.provider_payment_id}`,{headers:{authorization:`Bearer ${process.env.MOLLIE_API_KEY}`},signal:AbortSignal.timeout(10000)}),payment=await provider.json();
      if(!provider.ok||payment.id!==attempt.provider_payment_id||payment.mode!=="test"||payment.profileId!==target.profile||payment.amount.currency!=="EUR"||payment.amount.value!==(amount/100).toFixed(2)||payment.redirectUrl!==`${origin}/klant?account=${account}&view=invoices&payment=return`||payment.webhookUrl!==`${platform}/api/mollie/webhook`)throw new Error("Providercontract wijkt af");
      lastVerifiedAttempt={id:attempt.id,providerId:attempt.provider_payment_id,profile:target.profile,amount,invoiceIds:selected.map(invoice=>invoice.id)};
      phase="return_before_confirmation";
      const checkout=page.url();await page.goto(payment.redirectUrl);await expect(page.getByRole("heading",{name:"Je betaalstatus wordt gecontroleerd"})).toBeVisible();
      const unpaid=(await db.query("select sum(paid_cents)::int amount from public.invoices where tenant_id=$1 and id=any($2::uuid[])",[tenant,selected.map(i=>i.id)])).rows[0];if(unpaid.amount!==0)throw new Error("Terugkeer heeft onterecht een betaling bevestigd");
      phase="mollie_test_checkout_reopen";
      const reopened=await page.goto(checkout);
      console.log(JSON.stringify({check:"mollie_test_checkout_document",httpStatus:reopened?.status()??0}));
      phase="mollie_test_confirmation";
      await confirmMollieTestCheckout(page,origin,diagnostic=>console.log(JSON.stringify({check:"mollie_test_checkout_controls",...diagnostic})));
      phase="provider_webhook_settlement";
      await page.waitForURL(url=>url.origin===origin&&url.pathname==="/klant",{timeout:20000});
      await expect.poll(async()=>Number((await db.query("select sum(paid_cents)::int amount from public.invoices where tenant_id=$1 and id=any($2::uuid[])",[tenant,selected.map(i=>i.id)])).rows[0].amount),{timeout:60000}).toBe(amount);
      const ledger=async()=>({
        invoices:(await db.query("select id,status,paid_cents::int paid_cents,total_cents::int total_cents from public.invoices where tenant_id=$1 and id=any($2::uuid[]) order by id",[tenant,selected.map(i=>i.id)])).rows,
        allocations:(await db.query("select invoice_id,amount_cents::int amount_cents from public.payment_allocations where tenant_id=$1 and payment_attempt_id=$2 order by invoice_id",[tenant,attempt.id])).rows,
      });
      const settled=await ledger();
      if(settled.invoices.length!==selected.length||settled.allocations.length!==selected.length||selected.some(invoice=>{
        const row=settled.invoices.find(item=>item.id===invoice.id),allocation=settled.allocations.find(item=>item.invoice_id===invoice.id);
        return !row||row.status!=="paid"||row.paid_cents!==invoice.amount||row.total_cents!==invoice.amount||!allocation||allocation.amount_cents!==invoice.amount;
      }))throw new Error("Factuurverdeling wijkt af");
      phase="duplicate_webhook";
      for(let repeat=0;repeat<2;repeat++){
        const webhook=await fetch(`${platform}/api/mollie/webhook`,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({id:attempt.provider_payment_id}),signal:AbortSignal.timeout(10000)});
        if(webhook.status!==200)throw new Error("Webhook niet bevestigd");
        if(JSON.stringify(await ledger())!==JSON.stringify(settled))throw new Error("Dubbele betaling verwerkt");
      }
      console.log(JSON.stringify({check:"real_mollie_test_checkout",invoices:selected.length,amountCents:amount,viewport:index===0?"mobile":"desktop",providerConfirmed:true,returnDidNotSettle:true,webhookIdempotent:true}));
    }
  }catch(error){
    failed=true;
    // A UI timeout can occur after a real provider click. Observe only the last
    // fully verified synthetic attempt without changing or settling anything.
    // Preserve the original failure and emit no provider/account identifiers.
    if(lastVerifiedAttempt){
      try {
        const last=lastVerifiedAttempt;
        const observations=await Promise.allSettled([
          (async()=>{
            const response=await fetch(`https://api.mollie.com/v2/payments/${last.providerId}`,{headers:{authorization:`Bearer ${process.env.MOLLIE_API_KEY}`},signal:AbortSignal.timeout(10000)});
            const payment=await response.json();
            const statuses=new Set(["open","pending","authorized","paid","failed","canceled","expired"]);
            const contractMatches=response.ok&&payment.id===last.providerId&&payment.mode==="test"&&payment.profileId===last.profile&&payment.amount?.currency==="EUR"&&payment.amount?.value===(last.amount/100).toFixed(2);
            return {httpStatus:response.status,status:contractMatches&&statuses.has(payment.status)?payment.status:"unknown",contractMatches};
          })(),
          db.query("select coalesce(sum(paid_cents),0)::int paid_cents,count(*)::int invoice_count,count(*)filter(where status='paid')::int paid_count,(select count(*)::int from public.payment_allocations where tenant_id=$1 and payment_attempt_id=$4) allocation_count,(select coalesce(sum(amount_cents),0)::int from public.payment_allocations where tenant_id=$1 and payment_attempt_id=$4) allocated_cents,(select count(*)filter(where not(invoice_id=any($3::uuid[])))::int from public.payment_allocations where tenant_id=$1 and payment_attempt_id=$4) outside_scope_allocations from public.invoices where tenant_id=$1 and customer_id=$2 and id=any($3::uuid[])",[tenant,customer,last.invoiceIds,last.id]).then(result=>result.rows[0]),
        ]);
        const provider=observations[0].status==="fulfilled"?observations[0].value:undefined;
        const ledger=observations[1].status==="fulfilled"?observations[1].value:undefined;
        console.error(JSON.stringify({check:"last_verified_synthetic_payment_after_failure",invoices:last.invoiceIds.length,expectedCents:last.amount,providerLookupAvailable:Boolean(provider),providerHttpStatus:provider?.httpStatus??0,providerStatus:provider?.status??"unknown",providerContractMatches:provider?.contractMatches??false,ledgerLookupAvailable:Boolean(ledger),paidCents:ledger?.paid_cents??null,invoiceCount:ledger?.invoice_count??null,paidInvoices:ledger?.paid_count??null,allocationCount:ledger?.allocation_count??null,allocatedCents:ledger?.allocated_cents??null,outsideScopeAllocations:ledger?.outside_scope_allocations??null}));
      } catch { console.error(JSON.stringify({check:"last_verified_synthetic_payment_after_failure",diagnosticAvailable:false})); }
    }
    throw error;
  }
  finally{
    // Attempt every independent revocation even when another one fails. Keep
    // the original failing phase; cleanup details never expose provider data.
    const cleanup=await Promise.allSettled([
      (async()=>{if(account)await db.query("update public.customer_portal_accounts set active=false where tenant_id=$1 and id=$2",[tenant,account]);})(),
      (async()=>{if(userId&&tenant)await db.query("update public.object_customer_bindings set active=false where tenant_id=$1 and user_id=$2",[tenant,userId]);})(),
      (async()=>{if(tenant)await db.query("update public.customers set status='archived' where tenant_id=$1 and id=$2",[tenant,customer]);})(),
      (async()=>{if(userId){const result=await admin.auth.admin.updateUserById(userId,{ban_duration:"876000h"});if(result.error)throw new Error("Testaccount kon niet worden geblokkeerd");}})(),
      (async()=>{await context?.close();})(),
    ]);
    const closed=await Promise.allSettled([(async()=>{await browser?.close();})(),db.end()]);
    if([...cleanup,...closed].some(result=>result.status==="rejected")){
      console.error("Fictieve testopruiming onvolledig; alle afsluitacties zijn geprobeerd.");
      if(!failed){phase="synthetic_cleanup";throw new Error("Fictieve testopruiming mislukt");}
    }else console.log("Fictief testaccount afgesloten; gelabeld Mollie-testbewijs blijft controleerbaar.");
  }
}
main().catch(error=>{if(error instanceof MollieTestCheckoutError)console.error(JSON.stringify({check:"mollie_test_checkout_failure",kind:error.kind,reason:error.reason,...error.diagnostic}));console.error(`Mollie stagingacceptatie mislukt bij ${phase}; geen credentials, tokens of persoonsgegevens gelogd.`);process.exitCode=1;});
