import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { workOrderTestDatabase } from "./work-order-test-target.mjs";

test("customer activity is an account-scoped central inbox with live ticket revocation",async t=>{
 const db=await workOrderTestDatabase();await db.query("begin");
 const tenant=randomUUID(),alice=randomUUID(),bob=randomUUID(),manager=randomUUID();
 const sessions=new Map([alice,bob,manager].map(id=>[id,randomUUID()]));
 const account=randomUUID(),secondAccount=randomUUID(),otherAccount=randomUUID();
 const call=async(sql,args=[],actor=alice,role="authenticated")=>{
  await db.query("savepoint activity_case");
  try{
   await db.query(`set local role ${role}`);await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:actor,session_id:sessions.get(actor),role})]);
   const result=await db.query(sql,args);await db.query("reset role");await db.query("select set_config('request.jwt.claims','{}',true)");await db.query("release savepoint activity_case");return result.rows;
  }catch(error){await db.query("rollback to savepoint activity_case");await db.query("release savepoint activity_case");throw error;}
 };
 const query=(a=account,actor=alice)=>call("select public.customer_portal_activity($1,$2) data",[tenant,a],actor).then(rows=>rows[0].data);
 const mark=(a,operation,id=null,version=null,key=randomUUID())=>call("select public.customer_portal_activity_mark($1,$2,$3,$4,$5,$6) data",[tenant,a,operation,key,id,version]).then(rows=>rows[0].data);
 const emit=async(ticket,audience="reporter",actor=manager)=>{
  const id=randomUUID();await db.query("insert into public.ticket_events(id,tenant_id,ticket_id,audience,type,label,actor_user_id) values($1,$2,$3,$4,'reply','PRIVATE EVENT LABEL',$5)",[id,tenant,ticket,audience,actor]);return id;
 };
 const deliver=async()=>{
  const requests=(await db.query("select id from private.notification_requests where tenant_id=$1 and type_code='customer.ticket_changed' and prepared_at is null",[tenant])).rows;
  for(const r of requests)await call("select public.notification_delivery_prepare($1)",[r.id],alice,"service_role");
  await db.query("update private.notification_deliveries set available_at=now()-interval '1 second' where tenant_id=$1",[tenant]);
  const inApp=new Set((await db.query("select id from private.notification_deliveries where tenant_id=$1 and channel='in_app'",[tenant])).rows.map(row=>row.id));
  const claims=(await call("select public.notification_delivery_claim(100,$1) data",[tenant],alice,"service_role"))[0].data;
  for(const c of claims)if(inApp.has(c.id))await call("select public.notification_delivery_begin($1,$2)",[c.id,c.lease],alice,"service_role");
 };
 try{
  for(const [id,session]of sessions){await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",[id,`${id}@activity-fixture.invalid`]);await db.query("insert into auth.sessions(id,user_id,created_at,updated_at) values($1,$2,now(),now())",[session,id]);}
  await db.query("insert into public.tenants(id,slug,name) values($1,$2,'Fictieve activiteit leverancier')",[tenant,`activity-${tenant}`]);
  await db.query("insert into public.tenant_settings(tenant_id,enabled_services) values($1,array['tickets','planning'])",[tenant]);
  const category=(await db.query("select id from public.ticket_categories where tenant_id=$1 and code='customer_service'",[tenant])).rows[0].id;
  const tickets=[];
  for(const [a,user]of[[account,alice],[secondAccount,alice],[otherAccount,bob]]){
   const customer=randomUUID(),contact=randomUUID(),ticket=randomUUID();
   await db.query("insert into public.customers(id,tenant_id,customer_number,name) values($1,$2,$1::uuid::text,'Fictieve klant')",[customer,tenant]);
   await db.query("insert into public.customer_contacts(id,tenant_id,customer_id,full_name,email) values($1,$2,$3,'Fictief contact',$4)",[contact,tenant,customer,`${user}@activity-fixture.invalid`]);
   await db.query("insert into public.customer_portal_accounts(id,tenant_id,customer_id,user_id,contact_id,created_by) values($1,$2,$3,$4,$5,$6)",[a,tenant,customer,user,contact,manager]);
   await db.query("insert into public.tickets(id,tenant_id,number,route,category_id,reporter_user_id,reporter_name,title,customer_id) values($1,$2,$1::uuid::text,'internal',$3,$4,'Fictief contact','PRIVATE TICKET TITLE',$5)",[ticket,tenant,category,user,customer]);
   await db.query("insert into private.customer_ticket_bindings(ticket_id,tenant_id,account_id) values($1,$2,$3)",[ticket,tenant,a]);tickets.push(ticket);
  }
  const event=await emit(tickets[0]);await emit(tickets[0],"tenant");await emit(tickets[0],"reporter",alice);await emit(tickets[1]);await emit(tickets[2]);
  await t.test("only public events by someone else enqueue and snapshots omit private ticket contents",async()=>{
   const requests=(await db.query("select * from private.notification_requests where tenant_id=$1 and type_code='customer.ticket_changed'",[tenant])).rows;
   assert.equal(requests.length,3);assert.ok(requests.every(r=>r.source_kind==="customer_ticket"));assert.equal(JSON.stringify(requests).includes("PRIVATE"),false);
   await deliver();const first=await query();assert.equal(first.items.length,1);assert.equal(first.unread,1);assert.equal(first.items[0].targetPath,`/klant?account=${account}&view=tickets&ticket=${tickets[0]}`);
   assert.equal(JSON.stringify(first).includes("PRIVATE"),false);assert.equal(JSON.stringify(first).includes(manager),false);
   assert.equal((await query(secondAccount)).items.length,1);await assert.rejects(query(otherAccount),e=>e.code==="42501");
   await assert.rejects(call("select private.customer_activity_path($1,$2,$3)",[tenant,account,first.items[0].id]),e=>e.code==="42501");
   await assert.rejects(call("select public.customer_portal_activity($1,$2)",[tenant,account],alice,"anon"),e=>e.code==="42501");
  });
  await t.test("read-all updates only the selected account and replay is idempotent",async()=>{
   const key=randomUUID();assert.deepEqual(await mark(account,"read_all",null,null,key),{updated:1});assert.deepEqual(await mark(account,"read_all",null,null,key),{updated:1});
   assert.equal((await query()).unread,0);assert.equal((await query(secondAccount)).unread,1);
   const foreign=(await query(secondAccount)).items[0];await assert.rejects(mark(account,"read",foreign.id,foreign.version),e=>e.code==="42501");
   await assert.rejects(mark(secondAccount,"read_all",null,null,key),e=>e.code==="23505");
  });
  await t.test("single reads reject stale versions and preserve the central revision",async()=>{
   const item=(await query(secondAccount)).items[0];await assert.rejects(mark(secondAccount,"read",item.id,item.version+1),e=>e.code==="40001");
   assert.deepEqual(await mark(secondAccount,"read",item.id,item.version),{updated:1});const updated=(await query(secondAccount)).items[0];assert.ok(updated.readAt);assert.equal(updated.version,item.version+1);
  });
  await t.test("concrete visit notices target the appointments route and vanish when publication is revoked",async()=>{
   await db.query("savepoint visit_route_fixture");
   try{
    const object=randomUUID(),order=randomUUID(),source=randomUUID(),notice=randomUUID();
    const customer=(await db.query("select customer_id from public.customer_portal_accounts where id=$1",[account])).rows[0].customer_id;
    await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values($1,$2,$3,$1::uuid::text,'Fictieve bezoeklocatie','{}')",[object,tenant,customer]);
    await db.query("insert into public.object_customer_bindings(tenant_id,object_id,user_id,created_by) values($1,$2,$3,$4)",[tenant,object,alice,manager]);
    await db.query("insert into public.work_orders(id,tenant_id,customer_id,object_id,work_order_number,discipline,status,planned_start_at,planned_end_at,projected_start_at,projected_end_at,published_at,planning_state,created_by) values($1,$2,$3,$4,$1::uuid::text,'Onderhoud','in_progress',now(),now()+interval '1 hour',now(),now()+interval '1 hour',now(),'final',$5)",[order,tenant,customer,object,manager]);
    await db.query("insert into private.notification_domain_events(id,tenant_id,type_code,entity_kind,entity_id,work_order_id,source_revision,dedupe_key,recipients) values($1,$2,'work_order.started','work_order',$3,$3,'1',$1::uuid::text,$4)",[source,tenant,order,JSON.stringify([{user_id:alice,context:'customer'}])]);
    await db.query("insert into public.notifications(id,tenant_id,user_id,context,channel,type_code,source_kind,source_id,source_revision,title,body) values($1,$2,$3,'customer','in_app','work_order.started','domain',$4,'1','Bezoek gestart','Je afspraak is begonnen.')",[notice,tenant,alice,source]);
    const item=(await query()).items.find(row=>row.id===notice);
    assert.equal(item?.targetPath,`/klant?account=${account}&view=appointments&object=${object}&order=${order}`);
    assert.equal((await query(secondAccount)).items.some(row=>row.id===notice),false);
    await db.query("update public.work_orders set published_at=null where id=$1",[order]);
    assert.equal((await query()).items.some(row=>row.id===notice),false);
   }finally{await db.query("rollback to savepoint visit_route_fixture");await db.query("release savepoint visit_route_fixture");}
  });
  await t.test("central policy-off blocks new deliveries without reviving them later",async()=>{
   await db.query("insert into private.notification_policies(tenant_id,scope,type_code,mode) values($1,'tenant','customer.ticket_changed','off')",[tenant]);
   const off=await emit(tickets[0]);await deliver();
   const states=(await db.query("select d.state from private.notification_deliveries d join private.notification_requests r on r.id=d.request_id where r.source_id=$1",[off])).rows;
   assert.equal(states.length,2);assert.ok(states.every(x=>x.state==="suppressed"));
   await db.query("delete from private.notification_policies where tenant_id=$1",[tenant]);assert.equal((await query()).items.length,1);
  });
  await t.test("current account revocation closes both inbox and pending external delivery",async()=>{
   const item=(await query()).items[0];await db.query("update public.customer_portal_accounts set active=false where id=$1",[account]);
   await assert.rejects(query(),e=>e.code==="42501");await assert.rejects(mark(account,"read",item.id,item.version),e=>e.code==="42501");
   assert.equal((await db.query("select private.notification_source_allowed($1,'customer.ticket_changed','customer_ticket',$2,$2::uuid::text,$3,'customer') allowed",[tenant,event,alice])).rows[0].allowed,false);
   const live=(await db.query("select private.notification_delivery_live(d) live from private.notification_deliveries d join private.notification_requests r on r.id=d.request_id where r.source_id=$1 and d.channel='email'",[event])).rows;
   assert.equal(live.length,1);assert.equal(live[0].live,false);
  });
 }finally{await db.query("rollback");await db.end();}
});
