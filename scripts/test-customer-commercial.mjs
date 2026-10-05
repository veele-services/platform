import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { localWorkOrderTestUrl } from "./work-order-test-target.mjs";

test("customer commercial commands keep selected-account scope and immutable offer guards",async t=>{
 const db=new pg.Client({connectionString:localWorkOrderTestUrl()});await db.connect();await db.query("begin");
 const tenant=randomUUID(),otherTenant=randomUUID(),manager=randomUUID(),alice=randomUUID(),bob=randomUUID(),customer=randomUUID(),otherCustomer=randomUUID(),contact=randomUUID(),otherContact=randomUUID(),object=randomUUID(),otherObject=randomUUID(),request=randomUUID();
 const sessions=new Map([manager,alice,bob].map(id=>[id,randomUUID()]));let account,otherAccount;
 const call=async(sql,args=[],user=alice,role="authenticated")=>{
  await db.query("savepoint customer_commercial_call");
  try{await db.query(`set local role ${role}`);await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role,sub:user,session_id:sessions.get(user)})]);const result=await db.query(sql,args);await db.query("reset role");await db.query("select set_config('request.jwt.claims','{}',true)");await db.query("release savepoint customer_commercial_call");return result.rows;}
  catch(error){await db.query("rollback to savepoint customer_commercial_call");await db.query("release savepoint customer_commercial_call");throw error;}
 };
 const management=async(command,input)=>(await call("select public.commercial_command($1,$2,$3,$4) data",[tenant,randomUUID(),command,input],manager))[0].data;
 const detail=async(r=request,a=account,target=tenant,user=alice)=>(await call("select public.customer_portal_request_detail($1,$2,$3) data",[target,a,r],user))[0].data;
 const act=async(command,input,id=randomUUID(),a=account,target=tenant,user=alice)=>(await call("select public.customer_portal_commercial_command($1,$2,$3,$4,$5) data",[target,a,id,command,input],user))[0].data;
 const deny=promise=>assert.rejects(promise,error=>error.code==="42501");
 const quote=async(r=request,expiresAt=new Date(Date.now()+86400000).toISOString())=>{
  const id=randomUUID();await management("quote_save",{id,version:0,request_id:r,customer_id:customer,object_id:object,contact_id:contact,owner_id:manager,subject:"FICTITIOUS public offer",work_kind:"once",price_basis:"once",lines:[{id:randomUUID(),description:"FICTITIOUS service",quantity:"2",unit:"uur",price_cents:1000,discount_basis_points:0,vat_basis_points:2100,duration_minutes:60}],terms:{scope:"FICTITIOUS public work",conditions:"FICTITIOUS public terms",secret_code:"PRIVATE SNAPSHOT CANARY"},expires_at:expiresAt});await management("publish",{id,version:1});return (await detail(r)).quotes.find(q=>q.id===id);
 };
 try{
  for(const [user,session] of sessions){await db.query("insert into auth.users(id,email,email_confirmed_at)values($1,$2,now())",[user,`${user}@customer-commercial-fixture.invalid`]);await db.query("insert into auth.sessions(id,user_id,created_at,updated_at)values($1,$2,now(),now())",[session,user]);}
  for(const id of [tenant,otherTenant]){await db.query("insert into public.tenants(id,slug,name)values($1,$2,'FICTITIOUS commercial supplier')",[id,`commercial-portal-${id}`]);await db.query("insert into public.tenant_settings(tenant_id,enabled_services)values($1,array['planning','finance'])",[id]);await db.query("insert into public.tenant_branding(tenant_id)values($1)",[id]);}
  await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status)values($1,$2,array['management']::public.app_role[],'active')",[tenant,manager]);
  for(const id of [customer,otherCustomer])await db.query("insert into public.customers(id,tenant_id,customer_number,name,billing_email)values($1,$2,$1::uuid::text,'FICTITIOUS customer','billing@customer-commercial-fixture.invalid')",[id,tenant]);
  for(const [id,c] of [[contact,customer],[otherContact,otherCustomer]])await db.query("insert into public.customer_contacts(id,tenant_id,customer_id,full_name,email)values($1,$2,$3,'FICTITIOUS own contact',$4)",[id,tenant,c,`${alice}@customer-commercial-fixture.invalid`]);
  for(const [id,c] of [[object,customer],[otherObject,otherCustomer]])await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address,access_instructions)values($1,$2,$3,$1::uuid::text,'FICTITIOUS site','{\"street\":\"Teststraat 1\",\"postal_code\":\"1234 AB\",\"city\":\"Teststad\"}','PRIVATE VAULT CANARY')",[id,tenant,c]);
  for(const [c,ct] of [[customer,contact],[otherCustomer,otherContact]]){const row=(await call("select public.customer_portal_bind($1,$2,$3,$4,0,true,true,true,true) id",[tenant,c,alice,ct],manager))[0];if(c===customer)account=row.id;else otherAccount=row.id;}
  for(const id of [object,otherObject])await db.query("insert into public.object_customer_bindings(tenant_id,object_id,user_id,created_by)values($1,$2,$3,$4)",[tenant,id,alice,manager]);
  await management("request_save",{id:request,version:0,customer_id:customer,object_id:object,contact_id:contact,owner_id:manager,subject:"FICTITIOUS customer request",description:"FICTITIOUS original wording",discipline:"Onderhoud",source:"phone",priority:"normal",work_kind:"once",next_action:"INTERNAL NEXT ACTION CANARY"});
  await t.test("the detail retains exact account/object scope and no employee, private snapshot or storage fields",async()=>{
   const q=await quote(),data=await detail();assert.equal(data.request.id,request);assert.equal(data.quotes.length,1);assert.equal(data.quotes[0].id,q.id);assert.equal(data.quotes[0].canDecide,true);assert.equal(data.quotes[0].snapshot.total,2420);
   const serialized=JSON.stringify(data);for(const hidden of [manager,"PRIVATE","INTERNAL","owner_id","created_by","recorded_by","task_revision_id","logo_source","sender_email","contact_id","storage_path"])assert.equal(serialized.includes(hidden),false,hidden);
   await deny(detail(request,otherAccount));await deny(detail(request,account,otherTenant));await deny(detail(request,account,tenant,bob));await deny(call("select public.customer_portal_request_detail($1,$2,$3)",[tenant,account,request],alice,"anon"));
  });
  await t.test("a reply persists in the canonical event once, and legacy receipts cannot be adopted",async()=>{
   const version=(await detail()).request.version,input={id:request,version,body:"FICTITIOUS extra information"},id=randomUUID();const result=await act("reply",input,id);assert.deepEqual(await act("reply",input,id),result);
   assert.equal((await db.query("select count(*) from public.commercial_events where tenant_id=$1 and request_id=$2 and body=$3",[tenant,request,input.body])).rows[0].count,"1");
   await assert.rejects(act("reply",{...input,body:"FICTITIOUS changed body"},id),error=>error.code==="23505");await assert.rejects(act("reply",{...input,version:version+50}),error=>error.code==="40001");await deny(act("reply",input,randomUUID(),otherAccount));
   const legacy=randomUUID();await call("select public.commercial_customer_action($1,$2,'reply',$3)",[tenant,legacy,{id:request,body:"FICTITIOUS legacy reply"}]);await assert.rejects(act("reply",{id:request,version:(await detail()).request.version,body:"FICTITIOUS legacy reply"},legacy),error=>error.code==="23505");
   await db.query("update public.customer_portal_accounts set active=false where id=$1",[account]);try{await deny(act("reply",input,id));await deny(detail());}finally{await db.query("update public.customer_portal_accounts set active=true where id=$1",[account]);}
   await db.query("update public.object_customer_bindings set active=false where tenant_id=$1 and object_id=$2 and user_id=$3",[tenant,object,alice]);try{await deny(act("reply",input,id));await deny(detail());}finally{await db.query("update public.object_customer_bindings set active=true where tenant_id=$1 and object_id=$2 and user_id=$3",[tenant,object,alice]);}
  });
  await t.test("a confirmed immutable offer decision has one canonical receipt and never schedules work",async()=>{
   const q=(await detail()).quotes[0],input={id:q.id,version:q.version,revision:q.revision,decision:"accepted",name:"FICTITIOUS approver",evidence:"",confirmed:true},id=randomUUID();
   await deny(act("decide",input,id,otherAccount));await assert.rejects(act("decide",{...input,confirmed:false}),error=>error.code==="23514");await assert.rejects(act("decide",{...input,revision:q.revision+1}),error=>error.code==="23514");
   const result=await act("decide",input,id);assert.equal(result.status,"accepted");assert.deepEqual(await act("decide",input,id),result);assert.equal((await db.query("select count(*) from public.work_orders where quote_id=$1",[q.id])).rows[0].count,"0");
   await assert.rejects(act("decide",input),error=>error.code==="40001"||error.code==="23514");await db.query("update public.customer_contacts set active=false where id=$1",[contact]);try{await deny(act("decide",input,id));}finally{await db.query("update public.customer_contacts set active=true where id=$1",[contact]);}
  });
  await t.test("publishing a replacement closes old decisions without rewriting historic frozen data",async()=>{
   const previous=(await detail()).quotes[0],frozen=JSON.stringify(previous.snapshot);const next=(await management("revise",{id:previous.id,version:previous.version})).id;await management("publish",{id:next,version:1});
   const current=await detail();assert.equal(JSON.stringify(current.quotes.find(q=>q.id===previous.id).snapshot),frozen);assert.equal(current.quotes.find(q=>q.id===previous.id).canDecide,false);
   await assert.rejects(act("decide",{id:previous.id,version:previous.version,revision:previous.revision,decision:"accepted",name:"FICTITIOUS approver",evidence:"",confirmed:true}),error=>error.code==="23514");
  });
 }finally{await db.query("rollback");await db.end();}
});
