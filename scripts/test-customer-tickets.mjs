import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { localWorkOrderTestUrl } from "./work-order-test-target.mjs";

test("customer tickets use the canonical conversation with exact account and public audience boundaries",async t=>{
 const db=new pg.Client({connectionString:localWorkOrderTestUrl()});await db.connect();await db.query("begin");
 const tenant=randomUUID(),manager=randomUUID(),alice=randomUUID(),bob=randomUUID(),customer=randomUUID(),otherCustomer=randomUUID(),contact=randomUUID(),otherContact=randomUUID(),object=randomUUID(),otherObject=randomUUID();
 const sessions=new Map([manager,alice,bob].map(id=>[id,randomUUID()]));let account,otherAccount,ticket;
 const call=async(sql,args=[],user=alice,role="authenticated")=>{await db.query("savepoint customer_ticket_call");try{await db.query(`set local role ${role}`);await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role,sub:user,session_id:sessions.get(user)})]);const result=await db.query(sql,args);await db.query("reset role");await db.query("select set_config('request.jwt.claims','{}',true)");await db.query("release savepoint customer_ticket_call");return result.rows;}catch(error){await db.query("rollback to savepoint customer_ticket_call");await db.query("release savepoint customer_ticket_call");throw error;}};
 const query=async(op,p={},a=account,user=alice)=>(await call("select public.ticket_query($1,'customer',$2,$3) data",[tenant,op,{account:a,...p}],user))[0].data;
 const command=async(cmd,p,id=randomUUID(),a=account,user=alice)=>(await call("select public.ticket_command($1,'customer',$2,$3,$4) data",[tenant,cmd,{account:a,...p},id],user))[0].data;
 const deny=promise=>assert.rejects(promise,error=>error.code==="42501");
 try{
  for(const [user,session] of sessions){await db.query("insert into auth.users(id,email,email_confirmed_at)values($1,$2,now())",[user,`${user}@customer-ticket-fixture.invalid`]);await db.query("insert into auth.sessions(id,user_id,created_at,updated_at)values($1,$2,now(),now())",[session,user]);}
  await db.query("insert into public.tenants(id,slug,name)values($1,$2,'FICTITIOUS ticket supplier')",[tenant,`customer-ticket-${tenant}`]);await db.query("insert into public.tenant_settings(tenant_id,enabled_services)values($1,array['planning','tickets'])",[tenant]);await db.query("insert into public.tenant_branding(tenant_id)values($1)",[tenant]);
  await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status)values($1,$2,array['management']::public.app_role[],'active')",[tenant,manager]);
  for(const id of [customer,otherCustomer])await db.query("insert into public.customers(id,tenant_id,customer_number,name)values($1,$2,$1::uuid::text,'FICTITIOUS customer')",[id,tenant]);
  for(const [id,c] of [[contact,customer],[otherContact,otherCustomer]])await db.query("insert into public.customer_contacts(id,tenant_id,customer_id,full_name,email)values($1,$2,$3,'FICTITIOUS customer contact',$4)",[id,tenant,c,`${alice}@customer-ticket-fixture.invalid`]);
  for(const [id,c] of [[object,customer],[otherObject,otherCustomer]])await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address)values($1,$2,$3,$1::uuid::text,'FICTITIOUS site','{\"street\":\"Teststraat 1\",\"postal_code\":\"1234 AB\",\"city\":\"Teststad\"}')",[id,tenant,c]);
  for(const [c,ct] of [[customer,contact],[otherCustomer,otherContact]]){const row=(await call("select public.customer_portal_bind($1,$2,$3,$4,0,true,true,true,true) id",[tenant,c,alice,ct],manager))[0];if(c===customer)account=row.id;else otherAccount=row.id;}
  for(const id of [object,otherObject])await db.query("insert into public.object_customer_bindings(tenant_id,object_id,user_id,created_by)values($1,$2,$3,$4)",[tenant,id,alice,manager]);
  const categories=await query("options"),category=categories.find(c=>c.route==="tenant").id,platform=categories.find(c=>c.route==="platform").id;
  await t.test("create is idempotent, stores a canonical tenant ticket, and rejects other-account objects",async()=>{
   const p={category_id:category,title:"FICTITIOUS customer question",body:"FICTITIOUS public question",object_id:object,attachment_ids:[]},key=randomUUID();ticket=await command("create",p,key);assert.equal(ticket.route,"tenant");assert.equal(ticket.messages[0].author,"FICTITIOUS customer contact");assert.equal((await command("create",p,key)).id,ticket.id);
   assert.equal((await db.query("select count(*) from public.tickets where id=$1 and customer_id=$2",[ticket.id,customer])).rows[0].count,"1");
   await deny(command("create",{...p,object_id:otherObject}));await deny(command("create",p,randomUUID(),account,bob));
   await deny(query("detail",{ticket_id:ticket.id},otherAccount));assert.deepEqual(await query("list",{},otherAccount),[]);
   assert.equal((await command("create",{...p,category_id:platform,object_id:null})).route,"platform");
  });
  await t.test("only reporter messages and public authors cross the customer boundary",async()=>{
   for(const [audience,body] of [["tenant","PRIVATE INTERNAL NOTE CANARY"],["reporter","FICTITIOUS public reply"]])await db.query("insert into public.ticket_messages(tenant_id,ticket_id,author_user_id,author_name,author_context,audience,body)values($1,$2,$3,'PRIVATE EMPLOYEE CANARY','tenant',$4,$5)",[tenant,ticket.id,manager,audience,body]);
   const detail=await query("detail",{ticket_id:ticket.id}),serialized=JSON.stringify(detail);assert.equal(detail.messages.length,2);assert.equal(detail.messages[1].author,"FICTITIOUS ticket supplier");for(const hidden of ["PRIVATE",manager,"author_user_id","assigned_user","storage_path"])assert.equal(serialized.includes(hidden),false,hidden);
   const reply=await command("reply",{ticket_id:ticket.id,expected_revision:detail.version,body:"FICTITIOUS followup",attachment_ids:[]});assert.equal(reply.messages.length,3);
   await assert.rejects(command("reply",{ticket_id:ticket.id,expected_revision:detail.version,body:"Stale customer reply",attachment_ids:[]}),error=>error.code==="40001");
   await assert.rejects(command("reply",{ticket_id:ticket.id,expected_revision:reply.version,body:"FORGED INTERNAL",audience:"tenant",attachment_ids:[]}),error=>error.code==="23514");
  });
  await t.test("customer status transitions stay within reporter rights",async()=>{
   let current=await query("detail",{ticket_id:ticket.id});await assert.rejects(command("status",{ticket_id:ticket.id,expected_revision:current.version,status:"resolved",reason:"Forged resolution"}),error=>error.code==="23514");
   await db.query("update public.tickets set status='resolved' where id=$1",[ticket.id]);current=await query("detail",{ticket_id:ticket.id});assert.equal(current.canClose,true);
   current=await command("status",{ticket_id:ticket.id,expected_revision:current.version,status:"closed",reason:""});assert.equal(current.status,"closed");
   current=await command("status",{ticket_id:ticket.id,expected_revision:current.version,status:"in_progress",reason:"FICTITIOUS problem remains"});assert.equal(current.status,"in_progress");
  });
  await t.test("customer → tenant → Fieldgrid preserves an explicit response draft and private audiences",async()=>{
   await db.query("insert into public.permission_grants(tenant_id,user_id,membership_id,capability,scope,source) select m.tenant_id,m.user_id,m.id,cap,'{\"all\":true}'::jsonb,'explicit' from public.tenant_memberships m cross join unnest(array['tickets.support.create','tickets.support.read','tickets.support.reply','tickets.internal.share']) cap where m.user_id=$1 and m.tenant_id=$2 on conflict do nothing",[manager,tenant]);
   await db.query("insert into public.permission_grants(user_id,capability,scope) select $1,cap,jsonb_build_object('tenant_ids',jsonb_build_array($2::uuid)) from unnest(array['platform.support.read','platform.support.reply','platform.support.note','platform.support.manage']) cap",[bob,tenant]);
   const tq=async(ctx,op,p={},who=manager)=>(await call("select public.ticket_query($1,$2,$3,$4) data",[ctx==='platform'?null:tenant,ctx,op,p],who))[0].data;
   const tc=async(ctx,op,p,who=manager)=>(await call("select public.ticket_command($1,$2,$3,$4,$5) data",[ctx==='platform'?null:tenant,ctx,op,p,randomUUID()],who))[0].data;
   let source=await tq('tenant','detail',{ticket_id:ticket.id});
   assert.equal(source.permissions.share,true);
   const sc=(await tq('support','options')).categories[0].id;
   const forwarded=await tc('tenant','transfer',{ticket_id:source.id,expected_revision:source.revision,category_id:sc,title:'FICTITIOUS reviewed customer escalation',body:'REVIEWED CUSTOMER TECHNICAL QUESTION',attachment_ids:[]});
   let shared=await tq('platform','detail',{ticket_id:forwarded.id},bob);
   for(const hidden of ['PRIVATE INTERNAL NOTE CANARY',alice,contact,customer,ticket.id])assert.equal(JSON.stringify(shared).includes(hidden),false);
   shared=await tc('platform','reply',{ticket_id:shared.id,expected_revision:shared.revision,audience:'platform',body:'PLATFORM ONLY CUSTOMER CANARY'},bob);
   assert.equal(JSON.stringify(await tq('support','detail',{ticket_id:shared.id})).includes('PLATFORM ONLY CUSTOMER CANARY'),false);
   shared=await tc('platform','reply',{ticket_id:shared.id,expected_revision:shared.revision,audience:'reporter',body:'FICTITIOUS platform answer to tenant'},bob);
   assert.equal(JSON.stringify(await query('detail',{ticket_id:ticket.id})).includes('FICTITIOUS platform answer to tenant'),false);
   const message=shared.messages.find(m=>m.body==='FICTITIOUS platform answer to tenant');
   const draft=await tq('support','response_draft',{ticket_id:shared.id,message_id:message.id});
   source=await tq('tenant','detail',{ticket_id:ticket.id});
   await tc('tenant','reply',{ticket_id:source.id,expected_revision:source.revision,audience:'reporter',body:draft.body});
   assert.equal(JSON.stringify(await query('detail',{ticket_id:ticket.id})).includes('FICTITIOUS platform answer to tenant'),true);
  });
  await t.test("account, contact and object revocation close reads, commands and file upload contexts",async()=>{
   const current=await query("detail",{ticket_id:ticket.id}),upload=()=>call("select public.ticket_file_command($1,'customer','init',$2,$3)",[tenant,{ticketId:ticket.id,categoryId:category,audience:"reporter",draftId:randomUUID(),name:"fixture.pdf",mime:"application/pdf",size:20},randomUUID()]);
   await upload();
   for(const [sql,restore,args] of [["update public.customer_portal_accounts set active=false where id=$1","update public.customer_portal_accounts set active=true where id=$1",[account]],["update public.customer_contacts set active=false where id=$1","update public.customer_contacts set active=true where id=$1",[contact]],["update public.object_customer_bindings set active=false where object_id=$1","update public.object_customer_bindings set active=true where object_id=$1",[object]]]){
    await db.query(sql,args);try{await deny(query("detail",{ticket_id:ticket.id}));await deny(command("reply",{ticket_id:ticket.id,expected_revision:current.version,body:"REVOKED",attachment_ids:[]}));await deny(upload());}finally{await db.query(restore,args);}
   }
   await deny(call("select * from public.tickets"));await deny(call("select * from private.customer_ticket_bindings"));await deny(call("select public.ticket_query($1,'customer','list',$2)",[tenant,{account}],alice,"anon"));
  });
 }finally{await db.query("rollback");await db.end();}
});
