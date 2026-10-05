import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { localWorkOrderTestUrl } from './work-order-test-target.mjs';

test('customer checkout preserves exact account, merchant, remaining cents and bundle reservations', async t => {
 const db=new pg.Client({connectionString:localWorkOrderTestUrl()});await db.connect();await db.query('begin');
 const tenant=randomUUID(),otherTenant=randomUUID(),manager=randomUUID(),alice=randomUUID(),bob=randomUUID();
 const customer=randomUUID(),otherCustomer=randomUUID(),object=randomUUID(),otherObject=randomUUID(),invoice=randomUUID(),invoice2=randomUUID(),foreignInvoice=randomUUID();
 const sessions=new Map([manager,alice,bob].map(id=>[id,randomUUID()]));let account,otherAccount;
 const call=async(sql,args=[],actor=alice,role='authenticated')=>{
  await db.query('savepoint payment_fixture');try{
   await db.query(`set local role ${role}`);await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:actor,session_id:sessions.get(actor),role})]);
   const r=await db.query(sql,args);await db.query('reset role');await db.query("select set_config('request.jwt.claims','{}',true)");await db.query('release savepoint payment_fixture');return r.rows;
  }catch(e){await db.query('rollback to savepoint payment_fixture');await db.query('release savepoint payment_fixture');throw e;}
 };
 const prepare=async(ids=[invoice],id=randomUUID(),a=account,profile='pfl_Fictional',mode='test',actor=alice,target=tenant)=>(await call('select public.customer_portal_payment_prepare($1,$2,$3,$4,$5,$6) id',[target,a,ids,id,mode,profile],actor))[0].id;
 const deny=p=>assert.rejects(p,e=>e.code==='42501');
 try{
  for(const [id,session] of sessions){await db.query('insert into auth.users(id,email,email_confirmed_at)values($1,$2,now())',[id,`${id}@customer-payment.invalid`]);await db.query('insert into auth.sessions(id,user_id,created_at,updated_at)values($1,$2,now(),now())',[session,id]);}
  for(const id of [tenant,otherTenant]){await db.query("insert into public.tenants(id,slug,name)values($1,$2,'FICTITIOUS supplier')",[id,`pay-${id}`]);await db.query("insert into public.tenant_settings(tenant_id,enabled_services)values($1,array['finance','planning'])",[id]);}
  await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status)values($1,$2,array['management']::public.app_role[],'active')",[tenant,manager]);
  for(const id of [customer,otherCustomer])await db.query("insert into public.customers(id,tenant_id,customer_number,name)values($1,$2,$1::uuid::text,'FICTITIOUS customer')",[id,tenant]);
  for(const [id,c] of [[object,customer],[otherObject,otherCustomer]]){
   await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address)values($1,$2,$3,$1::uuid::text,'FICTITIOUS site','{}')",[id,tenant,c]);
   await db.query('insert into public.object_customer_bindings(tenant_id,object_id,user_id,created_by)values($1,$2,$3,$4)',[tenant,id,alice,manager]);
  }
  const accounts=(await db.query('select id,customer_id from public.customer_portal_accounts where tenant_id=$1 and user_id=$2',[tenant,alice])).rows;
  account=accounts.find(a=>a.customer_id===customer).id;otherAccount=accounts.find(a=>a.customer_id===otherCustomer).id;
  for(const [id,c,o] of [[invoice,customer,object],[invoice2,customer,object],[foreignInvoice,otherCustomer,otherObject]]){
   const order=randomUUID(),task=randomUUID();
   await db.query("insert into public.work_orders(id,tenant_id,customer_id,object_id,work_order_number,discipline,status,created_by,planned_start_at,planned_end_at,projected_start_at,projected_end_at)values($1,$2,$3,$4,$1::uuid::text,'Onderhoud','invoice_ready',$5,now(),now()+interval '1 hour',now(),now()+interval '1 hour')",[order,tenant,c,o,manager]);
   await db.query("insert into public.work_order_tasks(id,tenant_id,work_order_id,task_code,task_name,duration_minutes,quantity,unit,unit_price_cents,vat_basis_points,completed_at,executed_quantity,execution_state)values($1,$2,$3,'FICTITIOUS','FICTITIOUS service',15,1,'stuk',10000,0,now(),1,'completed')",[task,tenant,order]);
   await db.query("insert into public.invoices(id,tenant_id,customer_id,created_by,status,invoice_number,issued_on,due_on,subtotal_cents,total_cents)values($1,$2,$3,$4,'draft',$1::uuid::text,current_date,current_date+30,10000,10000)",[id,tenant,c,manager]);
   await db.query("insert into public.invoice_lines(tenant_id,invoice_id,work_order_id,work_order_task_id,description,quantity,unit,unit_price_cents,subtotal_cents,vat_basis_points,vat_cents,total_cents)values($1,$2,$3,$4,'FICTITIOUS service',1,'stuk',10000,10000,0,0,10000)",[tenant,id,order,task]);
   await db.query("update public.invoices set status='sent',finalized_at=now(),customer_snapshot='{}',branding_snapshot='{}',lines_snapshot='[]' where id=$1",[id]);
  }
  await t.test('no implicit global merchant; privileged verification required',async()=>{
   const configured=async()=>(await call('select public.customer_portal_workspace($1,$2) data',[tenant,account]))[0].data.tenant.paymentConfigured;
   assert.equal(await configured(),false,'Finance alone does not offer online checkout');
   await deny(prepare());
   await db.query("insert into public.tenant_provider_connections(tenant_id,provider,mode,secret_reference,public_config,active,verified_at)values($1,'mollie','test','MOLLIE_API_KEY','{\"profile_id\":\"pfl_Fictional\"}',true,now())",[tenant]);
   assert.equal(await configured(),true);
   await db.query("update public.tenant_provider_connections set verified_at=null where tenant_id=$1",[tenant]);
   assert.equal(await configured(),false,'Unverified merchants do not offer online checkout');
   await db.query("update public.tenant_provider_connections set verified_at=now(),active=false where tenant_id=$1",[tenant]);
   assert.equal(await configured(),false,'Disabled merchants do not offer online checkout');
   await db.query("update public.tenant_provider_connections set active=true where tenant_id=$1",[tenant]);
   await deny(prepare([invoice],randomUUID(),account,'pfl_Other'));await deny(prepare([invoice],randomUUID(),account,'pfl_Fictional','live'));
   await deny(call("update public.tenant_provider_connections set verified_at=now() where tenant_id=$1",[tenant],manager));
  });
  let attempt;
  await t.test('full scope and balance, replay, overlap and raw-data boundaries',async()=>{
   await deny(prepare([invoice],randomUUID(),otherAccount));await deny(prepare([foreignInvoice]));await deny(prepare([invoice],randomUUID(),account,'pfl_Fictional','test',bob));
   await deny(prepare([invoice],randomUUID(),account,'pfl_Fictional','test',alice,otherTenant));
   await assert.rejects(prepare([invoice,invoice]),e=>e.code==='23514');
   await db.query('update public.invoices set paid_cents=2500 where id=$1',[invoice]);
   const command=randomUUID();attempt=await prepare([invoice],command);assert.equal(await prepare([invoice],command),attempt);assert.equal(await prepare([invoice]),attempt);
   const row=(await db.query('select amount_cents,merchant_profile_id from public.payment_attempts where id=$1',[attempt])).rows[0];assert.equal(Number(row.amount_cents),7500);assert.equal(row.merchant_profile_id,'pfl_Fictional');
   assert.equal((await call('select * from public.payment_attempts where id=$1',[attempt])).length,0);
   await assert.rejects(prepare([invoice2],command),e=>e.code==='23505');await assert.rejects(prepare([invoice,invoice2]),e=>e.code==='23514');
   await db.query('update public.customer_portal_accounts set active=false where id=$1',[account]);try{await deny(prepare([invoice],command));}finally{await db.query('update public.customer_portal_accounts set active=true where id=$1',[account]);}
   await db.query('update public.object_customer_bindings set active=false where object_id=$1',[object]);try{await deny(prepare([invoice],command));}finally{await db.query('update public.object_customer_bindings set active=true where object_id=$1',[object]);}
  });
  await t.test('pending selection resumes safely and blocks manual allocation',async()=>{
   const projection=(await call('select public.customer_portal_invoices($1,$2) data',[tenant,account]))[0].data;
   assert.deepEqual(projection.find(row=>row.id===invoice).paymentInvoiceIds,[invoice]);
   await assert.rejects(call("select public.register_manual_payment($1,now(),'FICTITIOUS concurrent payment',$2,$3)",
    [tenant,JSON.stringify([{invoice_id:invoice,amount_cents:100}]),`manual-${randomUUID()}`],manager),e=>e.code==='23514');
  });
  await t.test('external bundles cannot double-reserve customer invoices',async()=>{
   const group=randomUUID(),hash='b'.repeat(64);
   await db.query("insert into public.invoice_groups(id,tenant_id,customer_id,purpose,expires_at)values($1,$2,$3,'payment_bundle',now()+interval '1 day')",[group,tenant,customer]);
   await db.query('insert into public.invoice_group_items(tenant_id,invoice_group_id,invoice_id)values($1,$2,$3)',[tenant,group,invoice]);
   await db.query("insert into public.external_action_tokens(tenant_id,purpose,subject_id,token_hash,expires_at)values($1,'payment',$2,$3,now()+interval '1 day')",[tenant,group,hash]);
   await assert.rejects(call('select public.prepare_provider_payment($1,$2)',[hash,'test'],alice,'service_role'),e=>e.code==='23514');
  });
  await t.test('verified settlement is idempotent and old terminal attempts remain immutable history',async()=>{
   const row=(await db.query('select * from public.payment_attempts where id=$1',[attempt])).rows[0];
   const payload={id:'tr_FictionalCustomer',mode:'test',profileId:'pfl_Fictional',status:'paid',amount:{value:'75.00',currency:'EUR'},metadata:{tenant_id:tenant,invoice_group_id:row.invoice_group_id,payment_attempt_id:attempt}};
   await db.query('update public.payment_attempts set provider_payment_id=$2,provider_payload=$3 where id=$1',[attempt,payload.id,payload]);
   const settle=p=>call('select (public.apply_confirmed_provider_payment($1,$2,$3,$4,$5,$6)).status',[attempt,payload.id,'paid',7500,'EUR',p],alice,'service_role');
   await assert.rejects(settle({...payload,profileId:'pfl_Other'}),e=>e.code==='23514');await settle(payload);await settle(payload);
   assert.equal(Number((await db.query('select paid_cents from public.invoices where id=$1',[invoice])).rows[0].paid_cents),10000);
   await assert.rejects(prepare([invoice]),e=>e.code==='23514');
   const pending=await prepare([invoice2]);await db.query("update public.payment_attempts set status='canceled' where id=$1",[pending]);const replacement=await prepare([invoice2]);assert.notEqual(replacement,pending);
  });
  await t.test('verified payment receipts reach only their frozen account through the central worker',async()=>{
   const events=(await db.query("select * from private.notification_domain_events where tenant_id=$1 and type_code='customer.payment_received'",[tenant])).rows;
   assert.equal(events.length,1,'Duplicate provider settlement must not emit another receipt');const event=events[0];assert.equal(event.entity_id,attempt);
   assert.deepEqual(event.recipients.map(r=>[r.user_id,r.account_id]),[[alice,account]]);assert.equal(JSON.stringify(event).includes('provider_payload'),false);
   const outbox=(await db.query("select id from public.outbox_events where tenant_id=$1 and event_type='customer.portal_notification' and aggregate_id=$2",[tenant,event.id])).rows[0].id;
   assert.equal((await db.query("select count(*) n from private.notification_requests where source_id=$1",[event.id])).rows[0].n,'0','Settlement must not enqueue under invoice locks');
   await call('select public.notification_outbox_prepare($1)',[outbox],alice,'service_role');await call('select public.notification_outbox_prepare($1)',[outbox],alice,'service_role');
   const requests=(await db.query('select id,payload from private.notification_requests where source_id=$1',[event.id])).rows;assert.equal(requests.length,1);assert.equal(requests[0].payload.path,`/klant?account=${account}&view=invoices`);
   const d=(await db.query("update private.notification_deliveries set state='claimed',lease=gen_random_uuid(),locked_until=now()+interval '1 minute' where request_id=$1 and channel='in_app' returning id,lease",[requests[0].id])).rows[0];
   await call('select public.notification_delivery_begin($1,$2)',[d.id,d.lease],alice,'service_role');
   const activity=(await call('select public.customer_portal_activity($1,$2) data',[tenant,account]))[0].data;assert.equal(activity.items.length,1);assert.equal(activity.items[0].title,'Betaling ontvangen');assert.equal(activity.items[0].targetPath,requests[0].payload.path);
   assert.equal((await call('select public.customer_portal_activity($1,$2) data',[tenant,otherAccount]))[0].data.items.length,0);
   await db.query('update public.customer_portal_accounts set active=false where id=$1',[account]);
   try{assert.equal((await db.query("select private.notification_delivery_live(d) live from private.notification_deliveries d where request_id=$1 and channel='email'",[requests[0].id])).rows[0].live,false);}
   finally{await db.query('update public.customer_portal_accounts set active=true where id=$1',[account]);}
  });
  await t.test('deferred payment notices cannot revive OFF-to-ON or ON-to-OFF-to-ON preferences',async()=>{
   const settle=async(id,suffix)=>{
    const row=(await db.query('select * from public.payment_attempts where id=$1',[id])).rows[0];
    const p={id:`tr_Fictional${suffix}`,mode:'test',profileId:'pfl_Fictional',status:'paid',amount:{value:(Number(row.amount_cents)/100).toFixed(2),currency:'EUR'},metadata:{tenant_id:tenant,invoice_group_id:row.invoice_group_id,payment_attempt_id:id}};
    await db.query('update public.payment_attempts set provider_payment_id=$2,provider_payload=$3 where id=$1',[id,p.id,p]);
    await call('select public.apply_confirmed_provider_payment($1,$2,$3,$4,$5,$6)',[id,p.id,'paid',row.amount_cents,'EUR',p],alice,'service_role');
    return (await db.query("select e.id,o.id outbox from private.notification_domain_events e join public.outbox_events o on o.tenant_id=e.tenant_id and o.aggregate_id=e.id and o.event_type='customer.portal_notification' where e.tenant_id=$1 and e.entity_id=$2 and e.type_code='customer.payment_received'",[tenant,id])).rows[0];
   };
   const suppressed=async event=>{
    await call('select public.notification_outbox_prepare($1)',[event.outbox],alice,'service_role');
    const deliveries=(await db.query('select d.channel,d.state from private.notification_deliveries d join private.notification_requests r on r.id=d.request_id where r.source_id=$1',[event.id])).rows;
    assert.equal(deliveries.length,2);assert.ok(deliveries.every(d=>d.state==='suppressed'),'Changed source-time preferences must suppress old deferred notices');
   };
   await db.query("insert into private.notification_preferences(tenant_id,user_id,context,type_code,email)values($1,$2,'customer','customer.payment_received',false)",[tenant,alice]);
   const replacement=(await db.query("select p.id from public.payment_attempts p join public.payment_allocations a on a.payment_attempt_id=p.id and a.invoice_id=$1 where p.status='open'",[invoice2])).rows[0].id;
   const offAtSource=await settle(replacement,'OffAtSource');
   await db.query("update private.notification_preferences set email=true,revision=revision+1 where tenant_id=$1 and user_id=$2 and type_code='customer.payment_received'",[tenant,alice]);
   await suppressed(offAtSource);
   const otherPayment=await prepare([foreignInvoice],randomUUID(),otherAccount),onAtSource=await settle(otherPayment,'ChangedBeforeWorker');
   await db.query("update private.notification_preferences set email=false,revision=revision+1 where tenant_id=$1 and user_id=$2 and type_code='customer.payment_received'",[tenant,alice]);
   await db.query("update private.notification_preferences set email=true,revision=revision+1 where tenant_id=$1 and user_id=$2 and type_code='customer.payment_received'",[tenant,alice]);
   await suppressed(onAtSource);
  });
 }finally{await db.query('rollback');await db.end();}
});
