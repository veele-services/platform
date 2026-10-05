import assert from "node:assert/strict";
import { localWorkOrderTestUrl } from "./work-order-test-target.mjs";
import {randomUUID} from "node:crypto";
import test from "node:test";
import pg from "pg";

test("Object 360: real database boundaries, visit requests and session-bound vault",async t=>{
 const local={ DB_URL: localWorkOrderTestUrl() };
 const db=new pg.Client({connectionString:local.DB_URL});await db.connect();
 const tenant=randomUUID(),other=randomUUID(),manager=randomUUID(),staff=randomUUID(),customerUser=randomUUID(),customerPeer=randomUUID(),unassigned=randomUUID();
 const users=[manager,staff,customerUser,customerPeer,unassigned],sessions=Object.fromEntries(users.map(u=>[u,randomUUID()]));
 const customer=randomUUID(),object=randomUUID(),otherObject=randomUUID(),person=randomUUID(),order=randomUUID(),secondOrder=randomUUID(),assignment=randomUUID(),task=randomUUID(),revision=randomUUID();
 const fictitiousCode="482731",fictitiousValue="FICTIONAL-TEST-OBJECT-VALUE";
 let item;
 const call=async(sql,args=[],actor=manager,role="authenticated")=>{
  const c=new pg.Client({connectionString:local.DB_URL});await c.connect();
  try{await c.query("begin");await c.query("set local statement_timeout='15s'");await c.query(`set local role ${role}`);await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:actor,session_id:sessions[actor],role})]);const r=await c.query(sql,args);await c.query("commit");return r.rows;}catch(e){await c.query("rollback");throw e;}finally{await c.end();}
 };
 const vault=async(operation,input={},actor=staff,changes={})=>(await call("select public.object_vault_operation($1,$2,$3,$4,$5,$6,$7,$8) result",[changes.tenant??tenant,actor,changes.session??sessions[actor],changes.object??object,changes.order===undefined?(actor===staff?order:null):changes.order,changes.item===undefined?item:changes.item,operation,input],actor,"service_role"))[0].result;
 const loosenRequestLimit=()=>db.query("delete from private.object_access_audit where tenant_id=$1 and event in ('requested','verify_failed')",[tenant]);
 const challenge=async(actor=staff,changes={})=>{const r=await vault("request",{code:fictitiousCode},actor,changes);assert.equal(r.ok,true,r.error);const delivery=await vault("delivered",{challengeId:r.challengeId},actor,changes);assert.equal(delivery.ok,true);return r.challengeId;};
 const grant=async(actor=staff,changes={})=>{const challengeId=await challenge(actor,changes);const r=await vault("verify",{challengeId,code:fictitiousCode},actor,changes);assert.equal(r.ok,true,r.error);return r.grantId;};
 const expectDenied=async(fn)=>assert.equal((await fn()).ok,false);
 try{
  for(const u of users){await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",[u,`${u}@object360.test`]);await db.query("insert into auth.sessions(id,user_id,created_at,updated_at) values($1,$2,now(),now())",[sessions[u],u]);}
  for(const id of [tenant,other]){await db.query("insert into public.tenants(id,slug,name) values($1,$2,'Object360 fictitious test')",[id,`object-${id}`]);await db.query("insert into public.tenant_settings(tenant_id,enabled_services) values($1,array['planning','personeel'])",[id]);}
  await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['tenant_admin','management','planner','hr']::public.app_role[],'active'),($1,$3,array['staff']::public.app_role[],'active')",[tenant,manager,staff]);
  await db.query("insert into public.customers(id,tenant_id,customer_number,name) values($1,$2,'OBJ-TEST-C','Fictitious customer')",[customer,tenant]);
  for(const id of [object,otherObject])await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values($1,$2,$3,$4,'Fictitious location','{\"street\":\"Teststraat 1\",\"city\":\"Teststad\"}')",[id,tenant,customer,`OBJ-${id}`]);
  await db.query("insert into public.personnel(id,tenant_id,user_id,full_name,status) values($1,$2,$3,'Fictitious employee','active')",[person,tenant,staff]);
  await db.query("insert into public.task_catalog(id,tenant_id,code,name,discipline) values($1,$2,'OB-TEST','Test task','Onderhoud')",[task,tenant]);
  await db.query("insert into public.task_revisions(id,tenant_id,task_id,revision,duration_minutes,price_cents) values($1,$2,$3,1,30,1000)",[revision,tenant,task]);
  for(const id of [order,secondOrder])await db.query("insert into public.work_orders(id,tenant_id,customer_id,object_id,work_order_number,discipline,status,planned_start_at,planned_end_at,projected_start_at,projected_end_at,published_at,planning_state,created_by) values($1,$2,$3,$4,$5,'Onderhoud','released',now()-interval '10 minutes',now()+interval '2 hours',now()-interval '10 minutes',now()+interval '2 hours',now(),'final',$6)",[id,tenant,customer,object,`WO-${id}`,manager]);
  await db.query("insert into public.work_order_assignments(id,tenant_id,work_order_id,personnel_id,status,planned_start_at,planned_end_at,projected_start_at,projected_end_at) values($1,$2,$3,$4,'released',now()-interval '10 minutes',now()+interval '2 hours',now()-interval '10 minutes',now()+interval '2 hours')",[assignment,tenant,order,person]);
  await db.query("insert into public.dispatches(tenant_id,work_order_id,assignment_id,dispatched_by,idempotency_key) values($1,$2,$3,$4,$5)",[tenant,order,assignment,manager,randomUUID()]);
  await call("insert into public.object_customer_bindings(tenant_id,object_id,user_id,manage_secrets) values($1,$2,$3,true)",[tenant,object,customerUser]);
  await call("insert into public.object_customer_bindings(tenant_id,object_id,user_id,manage_secrets) values($1,$2,$3,false)",[tenant,object,customerPeer]);

  await t.test("object identity, optional structure, cycles and immutable version history",async()=>{
   const building=randomUUID(),room=randomUUID();
   await call("insert into public.object_nodes(id,tenant_id,object_id,name,kind) values($1,$2,$3,'Test building','building')",[building,tenant,object]);
   await call("insert into public.object_nodes(id,tenant_id,object_id,parent_id,name,kind) values($1,$2,$3,$4,'Test room','room')",[room,tenant,object,building]);
   await assert.rejects(call("update public.object_nodes set parent_id=$2 where id=$1",[building,room]),e=>e.code==="23514");
   await assert.rejects(call("update public.object_nodes set object_id=$2 where id=$1",[room,otherObject]),e=>e.code==="23514");
   await call("update public.object_nodes set name='Renamed room' where id=$1",[room]);
   assert.equal((await call("select count(*)::int n from public.object_history where source_id=$1",[room]))[0].n,2);
   await call("update public.objects set name='Updated location' where id=$1",[object]);
   assert.equal((await call("select version from public.objects where id=$1",[object]))[0].version,"2");
   assert.equal((await call("select count(*)::int n from public.object_records",[],unassigned))[0].n,0);
  });
  await t.test("one customer request targets one visit; retries and commercial consent",async()=>{
   const id=randomUUID();const input={title:"Fictitious attention",body:"Only this test visit",kind:"extra",priority:"normal"};
   const submit=()=>call("select public.submit_object_visit_request($1,$2,$3,$4,$5) id",[tenant,object,order,id,input],customerUser);
   const result=await Promise.all([submit(),submit()]);assert.equal(result[0][0].id,result[1][0].id);
   await assert.rejects(call("select public.acknowledge_object_request($1,$2,1)",[tenant,id],customerPeer),e=>e.code==="42501");
   assert.equal((await call("select public.file_upload_allowed('object-documents',$1,$2) allowed",[`${tenant}/${object}/${randomUUID()}.pdf`,id],customerPeer))[0].allowed,false);
   await assert.rejects(call("select public.register_visit_attachment($1,$2,$3)",[tenant,id,{title:"FICTITIOUS cross-owner attachment",path:`${tenant}/${object}/${randomUUID()}.pdf`,mime:"application/pdf",fileName:"fixture.pdf",size:10}],customerPeer),e=>e.code==="42501");
   const otherVisit=(await call("select public.object_visit_context($1,$2,$3) result",[tenant,object,secondOrder],customerUser))[0].result;
   assert.equal(otherVisit.requests.length,0);
   await assert.rejects(call("select public.submit_object_visit_request($1,$2,$3,$4,$5)",[tenant,otherObject,order,randomUUID(),input],customerUser),e=>e.code==="42501");
   await call("select public.review_object_visit_request($1,$2,1,'proposal',$3)",[tenant,id,{reason:"Extra test scope",taskRevisionId:revision,quantity:2,priceCents:1500}]);
   assert.equal((await db.query("select count(*)::int n from public.work_order_tasks where work_order_id=$1",[order])).rows[0].n,0);
   const proposal=(await db.query("select id from public.object_request_proposals where request_id=$1",[id])).rows[0].id;
   await assert.rejects(call("select public.accept_object_proposal($1,$2)",[tenant,proposal],staff),e=>e.code==="42501");
   await Promise.all([call("select public.accept_object_proposal($1,$2)",[tenant,proposal],customerUser),call("select public.accept_object_proposal($1,$2)",[tenant,proposal],customerUser)]);
   const tasks=(await db.query("select is_extra_work,extra_work_status from public.work_order_tasks where work_order_id=$1",[order])).rows;
   assert.equal(tasks.length,1);assert.equal(tasks[0].is_extra_work,true);assert.equal(tasks[0].extra_work_status,"awaiting_review");
  });
  await t.test("instruction versions and read receipts do not prevent stopping individual effort",async()=>{
   const id=randomUUID();
   await call("insert into public.object_records(id,tenant_id,object_id,kind,title,body,state,instruction_type,work_order_id,starts_at,details) values($1,$2,$3,'instruction','Safety test','Test procedure','active','appointment',$4,now()-interval '1 hour','{\"acknowledgement\":true}')",[id,tenant,object,order]);
   // Mandatory instructions now gate report submission, not an employee's stop.
   // Roll back this isolated stop so the later vault scenarios remain active.
   await db.query('begin');try{await db.query("update public.work_order_assignments set status='completed' where id=$1",[assignment]);}finally{await db.query('rollback');}
   await call("select public.acknowledge_object_instruction($1,$2,$3,1)",[tenant,order,id],staff);
   assert.equal((await call("select public.object_visit_context($1,$2,$3) result",[tenant,object,order],staff))[0].result.instructions[0].read,true);
   await call("update public.object_records set body='Changed safety procedure' where id=$1",[id]);
   assert.equal((await call("select public.object_visit_context($1,$2,$3) result",[tenant,object,order],staff))[0].result.instructions[0].read,false);
   await assert.rejects(call("select public.acknowledge_object_instruction($1,$2,$3,1)",[tenant,order,id],staff),e=>e.code==="40001");
   await call("select public.acknowledge_object_instruction($1,$2,$3,2)",[tenant,order,id],staff);
   assert.equal((await db.query("select count(*)::int n from public.object_instruction_receipts where record_id=$1",[id])).rows[0].n,2);
  });
  await t.test("request edits reset read status; regular tasks, replanning and consent prices stay distinct",async()=>{
   const id=randomUUID(),input={title:"Regular follow-up",body:"Included in agreed work",kind:"attention",priority:"normal",nodeId:"",feedback:""};
   await call("select public.submit_object_visit_request($1,$2,$3,$4,$5)",[tenant,object,order,id,input],customerUser);
   await call("select public.acknowledge_object_request($1,$2,1)",[tenant,id],staff);
   await call("select public.update_object_visit_request($1,$2,1,$3)",[tenant,id,{...input,body:"Updated request"}],customerUser);
   const context=(await call("select public.object_visit_context($1,$2,$3) result",[tenant,object,order],staff))[0].result;
   assert.equal(context.requests.find(r=>r.id===id).read,false);
   await assert.rejects(call("select public.acknowledge_object_request($1,$2,1)",[tenant,id],staff),e=>e.code==="40001");
   await call("select public.review_object_visit_request($1,$2,2,'regular',$3)",[tenant,id,{reason:"Within existing scope",taskRevisionId:revision,quantity:1}]);
   const taskRow=(await db.query("select wt.* from public.work_order_tasks wt join public.object_visit_requests r on r.work_order_task_id=wt.id where r.id=$1",[id])).rows[0];
   assert.equal(taskRow.is_extra_work,false);assert.equal(Number(taskRow.unit_price_cents),0);
   await db.query("update public.work_orders set projected_end_at=projected_end_at+interval '1 minute' where id=$1",[order]);
   await assert.rejects(db.query("update public.work_order_tasks set completed_at=now() where id=$1",[taskRow.id]),e=>e.code==="23514");
   await assert.rejects(db.query("update public.work_order_tasks set unit_price_cents=1 where work_order_id=$1 and is_extra_work",[order]),e=>e.code==="23514");
   await assert.rejects(call("select public.update_object_visit_request($1,$2,4,$3)",[tenant,id,input],customerUser));
   await db.query("update public.work_orders set status='cancelled' where id=$1",[secondOrder]);
   await assert.rejects(call("select public.submit_object_visit_request($1,$2,$3,$4,$5)",[tenant,object,secondOrder,randomUUID(),input],customerUser));
   await db.query("update public.work_orders set status='released' where id=$1",[secondOrder]);
  });
  await t.test("private documents remain exact-visit and session scoped",async()=>{
   const request=(await db.query("select id from public.object_visit_requests where work_order_id=$1 limit 1",[order])).rows[0].id;
   const doc=randomUUID();await db.query("insert into public.object_documents(id,tenant_id,object_id,work_order_id,request_id,title,category,storage_path,mime_type,file_name,size_bytes,created_by) values($1,$2,$3,$4,$5,'Test attachment','photo',$6,'application/pdf','fixture.pdf',20,$7)",[doc,tenant,object,order,request,`${tenant}/${object}/${randomUUID()}.pdf`,manager]);
   const get=async(actor,whichOrder=order)=>(await call("select public.get_object_document($1,$2,$3) result",[tenant,doc,whichOrder],actor))[0].result;
   const own=await get(customerUser);assert.ok(own);assert.deepEqual(own.scope,[tenant,object]);
   assert.deepEqual((await get(manager)).scope,[tenant,object]);assert.ok(await get(staff));assert.equal(await get(customerUser,secondOrder),null);assert.equal(await get(unassigned),null);
   await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[sessions[customerUser]]);assert.equal(await get(customerUser),null);await db.query("update auth.sessions set not_after=null where id=$1",[sessions[customerUser]]);
   const context=(await call("select public.object_visit_context($1,$2,$3) result",[tenant,object,order],customerUser))[0].result;
   assert.equal(context.requests.find(r=>r.id===request).documents[0].id,doc);assert.equal(JSON.stringify(context).includes(`${tenant}/${object}/`),false);
   const successor=()=>db.query("insert into public.object_documents(tenant_id,object_id,work_order_id,request_id,previous_id,title,category,storage_path,mime_type,file_name,size_bytes,created_by) values($1,$2,$3,$4,$5,'Next version','photo',$6,'application/pdf','next.pdf',20,$7) returning version",[tenant,object,order,request,doc,`${tenant}/${object}/${randomUUID()}.pdf`,manager]);
   const versions=await Promise.allSettled([successor(),successor()]);assert.equal(versions.filter(v=>v.status==="fulfilled").length,1);assert.equal(Number(versions.find(v=>v.status==="fulfilled").value.rows[0].version),2);
  });
  await t.test("vault values encrypted and excluded from all generic payloads",async()=>{
   const g=await grant(manager,{item:null});const saved=await vault("save",{grantId:g,name:"Fictitious test code",kind:"access",nodeId:"",value:fictitiousValue,validUntil:""},manager,{item:null});assert.equal(saved.ok,true);
   const meta=await vault("metadata",{},manager,{item:null});item=meta.items[0].id;assert.ok(item);
   assert.equal(JSON.stringify(meta).includes(fictitiousValue),false);
   const encrypted=(await db.query("select v.secret from private.object_secret_versions s join vault.secrets v on v.id=s.vault_id where s.item_id=$1",[item])).rows[0].secret;assert.equal(encrypted.includes(fictitiousValue),false);
   const context=(await call("select public.object_visit_context($1,$2,$3) result",[tenant,object,order],staff))[0].result;assert.equal(JSON.stringify(context).includes(fictitiousValue),false);
   const histories=(await call("select snapshot from public.object_history where object_id=$1",[object]));assert.equal(JSON.stringify(histories).includes(fictitiousValue),false);
   await assert.rejects(call("select * from private.object_secret_versions",[],staff),e=>e.code==="42501");
   await assert.rejects(call("select public.object_vault_operation($1,$2,$3,$4,null,null,'metadata','{}')",[tenant,staff,sessions[staff],object],staff),e=>e.code==="42501");
  });
  await t.test("explicit exact-item scope, live publication and active identity required",async()=>{
   await expectDenied(()=>vault("request",{code:fictitiousCode}));
   await loosenRequestLimit();const g=await grant(manager);const allowed=await vault("scope",{grantId:g,assignmentId:assignment,active:true},manager);assert.equal(allowed.ok,true);
   await expectDenied(()=>vault("request",{code:fictitiousCode},unassigned));
   await expectDenied(()=>vault("request",{code:fictitiousCode},staff,{tenant:other}));
   await expectDenied(()=>vault("request",{code:fictitiousCode},staff,{object:otherObject}));
   await expectDenied(()=>vault("request",{code:fictitiousCode},staff,{order:secondOrder}));
   await db.query("update public.dispatches set revoked_at=now() where assignment_id=$1",[assignment]);await expectDenied(()=>vault("request",{code:fictitiousCode}));await db.query("update public.dispatches set revoked_at=null where assignment_id=$1",[assignment]);
   await db.query("update public.personnel set status='inactive' where id=$1",[person]);await expectDenied(()=>vault("request",{code:fictitiousCode}));await db.query("update public.personnel set status='active' where id=$1",[person]);
   await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[sessions[staff]]);await expectDenied(()=>vault("request",{code:fictitiousCode}));await db.query("update auth.sessions set not_after=null where id=$1",[sessions[staff]]);
  });
  await t.test("vault metadata cannot enumerate unscoped items by supplying a scoped item",async()=>{
   const hidden=randomUUID();
   await db.query("insert into private.object_secret_items(id,tenant_id,object_id,name,kind,owner_user_id) values($1,$2,$3,'FICTITIOUS unassigned item','access',$4)",[hidden,tenant,object,manager]);
   try {
    const ordinary=await vault('metadata',{},staff,{item:null});assert.deepEqual(ordinary.items.map(x=>x.id),[item]);
    const selected=await vault('metadata',{},staff,{item});assert.deepEqual(selected.items.map(x=>x.id),[item]);
    await expectDenied(()=>vault('metadata',{},staff,{item:hidden}));
    for(const actor of [manager,customerUser])assert.equal((await vault('metadata',{},actor,{item:null})).items.length,2);
   } finally {await db.query('delete from private.object_secret_items where id=$1',[hidden]);}
  });
  await t.test("removing the staff role revokes visit and existing OTP grants without changing the JWT",async()=>{
   await loosenRequestLimit();const g=await grant();await loosenRequestLimit();const pending=await challenge();
   await db.query("update public.tenant_memberships set roles=array['finance']::public.app_role[] where tenant_id=$1 and user_id=$2",[tenant,staff]);
   try {
    await expectDenied(()=>vault('check',{grantId:g}));await expectDenied(()=>vault('read',{grantId:g}));
    await expectDenied(()=>vault('verify',{challengeId:pending,code:fictitiousCode}));
    await expectDenied(()=>vault('metadata',{},staff,{item}));
    assert.deepEqual((await vault('metadata',{},staff,{item:null})).items,[]);
    await assert.rejects(call('select public.object_visit_context($1,$2,$3)',[tenant,object,order],staff),e=>e.code==='42501');
   } finally {await db.query("update public.tenant_memberships set roles=array['staff','finance']::public.app_role[] where tenant_id=$1 and user_id=$2",[tenant,staff]);}
   assert.equal((await vault('metadata',{},staff,{item})).ok,true);
   assert.ok((await call('select public.object_visit_context($1,$2,$3) result',[tenant,object,order],staff))[0].result);
   await db.query("update public.tenant_memberships set roles=array['staff']::public.app_role[] where tenant_id=$1 and user_id=$2",[tenant,staff]);
  });
  await t.test("vault window uses actual assignment bounds and bounded explicit extensions",async()=>{
   const old=(await db.query("select projected_start_at,projected_end_at from public.work_order_assignments where id=$1",[assignment])).rows[0];
   await db.query("update public.work_order_assignments set projected_start_at=now()+interval '2 hours',projected_end_at=now()+interval '3 hours' where id=$1",[assignment]);await expectDenied(()=>vault("request",{code:fictitiousCode}));
   await db.query("update public.work_order_assignments set projected_start_at=now()-interval '2 hours',projected_end_at=now()-interval '1 minute' where id=$1",[assignment]);await expectDenied(()=>vault("request",{code:fictitiousCode}));
   await assert.rejects(call("select public.extend_object_access($1,$2,now()+interval '6 hours','Test extension')",[tenant,assignment]));
   await assert.rejects(call("select public.extend_object_access($1,$2,now()+interval '10 minutes','Test extension')",[tenant,assignment],staff));
   await call("select public.extend_object_access($1,$2,now()+interval '10 minutes','Supervisor test extension')",[tenant,assignment]);
   await loosenRequestLimit();const g=await grant();assert.equal((await vault("check",{grantId:g})).ok,true);
   await db.query("delete from private.object_access_extensions where assignment_id=$1",[assignment]);await expectDenied(()=>vault("check",{grantId:g}));
   await db.query("update public.work_order_assignments set projected_start_at=$2,projected_end_at=$3 where id=$1",[assignment,old.projected_start_at,old.projected_end_at]);
  });
  await t.test("OTP wrong code, reissuing, expiry, atomic one-time consumption and session binding",async()=>{
   await loosenRequestLimit();const first=await challenge();await expectDenied(()=>vault("verify",{challengeId:first,code:"000000"}));
   await expectDenied(()=>vault("request",{code:fictitiousCode}));
   await db.query("update private.object_access_audit set created_at=now()-interval '61 seconds' where actor_id=$1 and event='requested'",[staff]);
   const second=await challenge();await expectDenied(()=>vault("verify",{challengeId:first,code:fictitiousCode}));
   const results=await Promise.all([vault("verify",{challengeId:second,code:fictitiousCode}),vault("verify",{challengeId:second,code:fictitiousCode})]);assert.equal(results.filter(r=>r.ok).length,1);
   const g=results.find(r=>r.ok).grantId;const read=await vault("read",{grantId:g});assert.equal(read.ok,true);assert.ok(read.value===fictitiousValue);
   await expectDenied(()=>vault("read",{grantId:g},staff,{session:randomUUID()}));
   await expectDenied(()=>vault("read",{grantId:g},staff,{order:secondOrder}));
   await db.query("update private.object_access_grants set expires_at=now()-interval '1 second' where id=$1",[g]);await expectDenied(()=>vault("read",{grantId:g}));
   await loosenRequestLimit();const expired=await challenge();await db.query("update private.object_otp_challenges set expires_at=now()-interval '1 second' where id=$1",[expired]);await expectDenied(()=>vault("verify",{challengeId:expired,code:fictitiousCode}));
  });
  await t.test("resending does not reset cumulative attempts",async()=>{
   await loosenRequestLimit();const ch=await challenge();for(let i=0;i<10;i++)await expectDenied(()=>vault("verify",{challengeId:ch,code:"000000"}));
   await expectDenied(()=>vault("verify",{challengeId:ch,code:fictitiousCode}));await expectDenied(()=>vault("request",{code:fictitiousCode}));
  });
  await t.test("replanning between request/verify/read and secret rotation revoke grants",async()=>{
   await loosenRequestLimit();const ch=await challenge();await db.query("update public.work_order_assignments set projected_end_at=projected_end_at+interval '1 minute' where id=$1",[assignment]);await expectDenied(()=>vault("verify",{challengeId:ch,code:fictitiousCode}));
   await loosenRequestLimit();const g=await grant();await db.query("update public.work_order_assignments set projected_end_at=projected_end_at+interval '1 minute' where id=$1",[assignment]);await expectDenied(()=>vault("read",{grantId:g}));
   await loosenRequestLimit();const staffGrant=await grant();const managementGrant=await grant(manager);
   const rotate=await vault("save",{grantId:managementGrant,name:"Updated fictitious code",kind:"access",nodeId:"",value:"FICTIONAL-ROTATED-VALUE",version:1,externalChanged:true,validUntil:""},manager);assert.equal(rotate.ok,true);await expectDenied(()=>vault("read",{grantId:staffGrant}));
   assert.equal((await db.query("select count(*)::int n from private.object_access_audit where tenant_id=$1 and event='rotated'",[tenant])).rows[0].n,2);
  });
  await t.test("revoking customer binding and completing assignment end access",async()=>{
   await loosenRequestLimit();const cg=await grant(customerUser);await call("update public.object_customer_bindings set active=false where tenant_id=$1 and user_id=$2",[tenant,customerUser]);await expectDenied(()=>vault("read",{grantId:cg},customerUser));
   const sg=await grant();await db.query("update public.work_order_assignments set status='completed' where id=$1",[assignment]);await expectDenied(()=>vault("read",{grantId:sg}));
  });
 }finally{
  try {
  // Only this test's generated IDs; never reset a database or touch remote projects.
  const vaultIds=(await db.query("select v.vault_id from private.object_secret_versions v join private.object_secret_items i on i.id=v.item_id where i.tenant_id=$1",[tenant])).rows.map(r=>r.vault_id);
  await db.query("delete from private.notification_deliveries where tenant_id=any($1)",[[tenant,other]]);
  await db.query("delete from private.notification_requests where tenant_id=any($1)",[[tenant,other]]);
  await db.query("delete from private.notification_planning_events where tenant_id=any($1)",[[tenant,other]]);
  await db.query("delete from private.notification_captured_outbox where tenant_id=any($1)",[[tenant,other]]);
  await db.query("delete from private.notification_domain_events where tenant_id=any($1)",[[tenant,other]]);
  await db.query("delete from private.notification_template_versions where template_id in(select id from private.notification_templates where tenant_id=any($1))",[[tenant,other]]);
  await db.query("delete from private.notification_templates where tenant_id=any($1)",[[tenant,other]]);
  for(const table of ["object_access_grants","object_otp_challenges","object_access_audit","object_notification_keys"])await db.query(`delete from private.${table} where tenant_id=$1`,[tenant]);
  await db.query("delete from private.object_secret_scopes where assignment_id=$1",[assignment]);await db.query("delete from private.object_access_extensions where assignment_id=$1",[assignment]);
  await db.query("delete from private.object_secret_versions where item_id in(select id from private.object_secret_items where tenant_id=$1)",[tenant]);await db.query("delete from private.object_secret_items where tenant_id=$1",[tenant]);await db.query("delete from private.object_vault_state where object_id=any($1)",[[object,otherObject]]);await db.query("delete from vault.secrets where id=any($1)",[vaultIds]);
  for(const table of ["object_documents","object_request_proposals","object_visit_requests","object_instruction_receipts","object_records","object_nodes","object_customer_bindings","object_history","audit_events"])await db.query(`delete from public.${table} where tenant_id=$1`,[tenant]);
  await db.query("delete from public.work_orders where tenant_id=$1",[tenant]);await db.query("delete from public.objects where tenant_id=$1",[tenant]);await db.query("delete from public.task_revisions where tenant_id=$1",[tenant]);await db.query("delete from public.customer_portal_accounts where tenant_id=$1",[tenant]);await db.query("delete from public.customers where tenant_id=$1",[tenant]);await db.query("delete from public.tenants where id=any($1)",[[tenant,other]]);await db.query("delete from auth.users where id=any($1)",[users]);
  } finally { await db.end(); }
 }
});
