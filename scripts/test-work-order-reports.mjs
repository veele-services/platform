import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import test from "node:test";
import { workOrderTestDatabase } from "./work-order-test-target.mjs";

test("Work-order reports: individual time, immutable versions, signing and direct API isolation",async t=>{
 const db=await workOrderTestDatabase();await db.query("begin");
 const tenant=randomUUID(),manager=randomUUID(),staff=randomUUID(),coworker=randomUUID(),outsider=randomUUID(),planner=randomUUID(),customer=randomUUID(),object=randomUUID(),order=randomUUID(),task=randomUUID(),proof=randomUUID(),invoice=randomUUID();
 const people=[randomUUID(),randomUUID()],assignments=[randomUUID(),randomUUID()],users=[manager,staff,coworker,outsider,planner],sessions=Object.fromEntries(users.map(u=>[u,randomUUID()]));
 const call=async(sql,args=[],actor=staff,role="authenticated")=>{
  await db.query("savepoint operation");try{await db.query(`set local role ${role}`);await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:actor,session_id:sessions[actor],role})]);const result=await db.query(sql,args);await db.query("reset role");await db.query("select set_config('request.jwt.claims','{}',true)");await db.query("release savepoint operation");return result.rows;}catch(e){await db.query("rollback to savepoint operation");await db.query("release savepoint operation");throw e;}
 };
 const version=async()=>Number((await db.query("select version from public.work_orders where id=$1",[order])).rows[0].version);
 const stop=async actor=>call("select public.transition_work_order($1,'stop',$2,$3)",[order,await version(),randomUUID()],actor);
 const panel=async(actor=staff)=>(await call("select public.work_order_report($1) data",[order],actor))[0].data;
 const submit=async(summary,key=randomUUID())=>(await call("select public.submit_work_order_report($1,$2,$3,$4) data",[order,await version(),summary,key]))[0].data;
 let report,oldSignature;
 try{
  for(const user of users){await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",[user,`${user}@report.test`]);await db.query("insert into auth.sessions(id,user_id,created_at,updated_at) values($1,$2,now(),now())",[sessions[user],user]);}
  await db.query("insert into public.tenants(id,slug,name) values($1,$2,'Fictitious reporting tenant')",[tenant,`reports-${tenant}`]);
  await db.query("insert into public.tenant_settings(tenant_id,enabled_services) values($1,array['planning','personeel','rapportage','finance'])",[tenant]);
  await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['tenant_admin','management','finance','planner']::public.app_role[],'active'),($1,$3,array['staff']::public.app_role[],'active'),($1,$4,array['staff']::public.app_role[],'active'),($1,$5,array['staff']::public.app_role[],'active')",[tenant,manager,staff,coworker,outsider]);
  await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['planner']::public.app_role[],'active')",[tenant,planner]);
  await db.query("insert into public.customers(id,tenant_id,customer_number,name) values($1,$2,$3,'Fictitious report customer')",[customer,tenant,`C-${customer}`]);
  await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values($1,$2,$3,$4,'Fictitious report object','{\"street\":\"Fictitious Street\",\"private_access_code\":\"PRIVATE-ADDRESS-CANARY\"}')",[object,tenant,customer,`O-${object}`]);
  for(let i=0;i<2;i++)await db.query("insert into public.personnel(id,tenant_id,user_id,full_name) values($1,$2,$3,$4)",[people[i],tenant,[staff,coworker][i],`Fictitious employee ${i+1}`]);
  await db.query("insert into public.work_orders(id,tenant_id,customer_id,object_id,work_order_number,discipline,status,signature_mode,lead_personnel_id,planned_start_at,planned_end_at,projected_start_at,projected_end_at,created_by) values($1,$2,$3,$4,$5,'Onderhoud','released','required',$6,now()-interval '1 hour',now()+interval '2 hours',now()-interval '1 hour',now()+interval '2 hours',$7)",[order,tenant,customer,object,`W-${order}`,people[0],manager]);
  for(let i=0;i<2;i++){
   await db.query("insert into public.work_order_assignments(id,tenant_id,work_order_id,personnel_id,status,planned_start_at,planned_end_at,projected_start_at,projected_end_at,actual_start_at) values($1,$2,$3,$4,'in_progress',now()-interval '1 hour',now()+interval '2 hours',now()-interval '1 hour',now()+interval '2 hours',now()-interval '1 hour')",[assignments[i],tenant,order,people[i]]);
   await db.query("insert into public.dispatches(tenant_id,work_order_id,assignment_id,dispatched_by,idempotency_key) values($1,$2,$3,$4,$5)",[tenant,order,assignments[i],manager,randomUUID()]);
   await db.query("insert into public.time_entries(tenant_id,personnel_id,assignment_id,kind,starts_at) values($1,$2,$3,'work',now()-interval '1 hour')",[tenant,people[i],assignments[i]]);
  }
  await db.query("update public.work_orders set status='in_progress',actual_start_at=now()-interval '1 hour',commercial_terms='{\"price\":\"PRIVATE-PRICE-CANARY\"}',template_snapshot='{\"privatePrice\":\"PRIVATE-TEMPLATE-CANARY\"}' where id=$1",[order]);
  await db.query("insert into public.work_order_tasks(id,tenant_id,work_order_id,task_code,task_name,duration_minutes,unit,unit_price_cents,vat_basis_points) values($1,$2,$3,'REPORT','Fictitious task',60,'task',123456789,2100)",[task,tenant,order]);
  const template=randomUUID(),revision=randomUUID(),checklist=randomUUID();
  const definition={questions:[{id:"shared",label:"Shared result",type:"text",customerVisible:true,required:true},{id:"private",label:"INTERNAL CHECKLIST CANARY",type:"text",customerVisible:false},{id:"hidden",label:"INACTIVE CONDITIONAL CANARY",type:"text",customerVisible:true,condition:{questionId:"gate",equals:true}},{id:"proof",label:"Evidence photo",type:"photo",customerVisible:true}]};
  await db.query("insert into public.work_order_templates(id,tenant_id,name,kind,created_by) values($1,$2,'Fictitious reporting checklist','checklist',$3)",[template,tenant,manager]);
  await db.query("insert into public.work_order_template_versions(id,tenant_id,template_id,version,state,definition,created_by) values($1,$2,$3,1,'published',$4,$5)",[revision,tenant,template,definition,manager]);
  await db.query("insert into public.work_order_checklists(id,tenant_id,work_order_id,template_revision_id,name,definition) values($1,$2,$3,$4,'Fictitious reporting checklist',$5)",[checklist,tenant,order,revision,definition]);
  await db.query("insert into public.attachments(id,tenant_id,work_order_id,uploaded_by,storage_bucket,storage_path,file_name,mime_type,size_bytes,sha256) values($1,$2,$3,$4,'reports',$5,'Proof.png','image/png',512,$6)",[proof,tenant,order,staff,`${tenant}/${order}/${proof}.png`,"c".repeat(64)]);
  for(const [question,value] of [["shared","Public result"],["private","PRIVATE ANSWER CANARY"],["hidden","INACTIVE ANSWER CANARY"],["gate",false],["proof",proof]])await db.query("insert into public.work_order_checklist_answers(tenant_id,checklist_id,question_id,value,attachment_id,updated_by) values($1,$2,$3,$4,$5,$6)",[tenant,checklist,question,JSON.stringify(value),question==="proof"?proof:null,staff]);
  await db.query("insert into public.work_order_material_usage(tenant_id,work_order_id,description,quantity,unit,customer_visible,created_by) values($1,$2,'Public material',2,'piece',true,$3),($1,$2,'PRIVATE MATERIAL CANARY',1,'piece',false,$3)",[tenant,order,staff]);
  await db.query("insert into public.invoices(id,tenant_id,customer_id,created_by) values($1,$2,$3,$4)",[invoice,tenant,customer,manager]);
  await t.test("published signature policy changes require explicit authority, reason and current version",async()=>{
   const change=(mode,key,actor=manager,expected)=>call("select public.change_work_order_signature_policy($1,$2,$3,false,'Explicit fictitious policy correction',$4)",[order,expected,mode,key],actor);
   await assert.rejects(change("optional",randomUUID(),staff,await version()),e=>e.code==="42501");
   await assert.rejects(change("optional",randomUUID(),manager,null),e=>e.code==="40001");
   const before=await version(),key=randomUUID();await change("optional",key,manager,before);await change("optional",key,manager,before);assert.equal((await panel()).policy.mode,"optional");
   await change("required",randomUUID(),manager,await version());assert.equal((await panel()).policy.mode,"required");
   assert.equal((await db.query("select count(*) from public.audit_events where tenant_id=$1 and action='work_order.signature_policy_changed'",[tenant])).rows[0].count,"2");
  });
  await t.test("own stop closes only own timer despite missing task and signature",async()=>{
   await stop(staff);
   const timers=(await db.query("select personnel_id,ends_at from public.time_entries where assignment_id=any($1)",[assignments])).rows;
   assert.ok(timers.find(e=>e.personnel_id===people[0]).ends_at);assert.equal(timers.find(e=>e.personnel_id===people[1]).ends_at,null);
   assert.equal((await db.query("select status from public.work_orders where id=$1",[order])).rows[0].status,"in_progress");
  });
  await t.test("pause/resume are own idempotent time segments",async()=>{
   const key=randomUUID();const first=(await call("select to_jsonb(public.transition_work_order($1,'pause',$2,$3)) data",[order,await version(),key],coworker))[0].data;
   const retried=(await call("select to_jsonb(public.transition_work_order($1,'pause',1,$2)) data",[order,key],coworker))[0].data;
   for(const response of [first,retried]){
    assert.equal(response.id,order);assert.equal(response.status,'in_progress');
    for(const field of ['created_by','planner_user_id','lead_personnel_id','commercial_terms','details'])assert.equal(response[field],null,`Execution response must not disclose ${field}`);
   }
   assert.equal((await db.query("select count(*) from public.time_entries where assignment_id=$1 and kind='break'",[assignments[1]])).rows[0].count,"1");
   await call("select public.transition_work_order($1,'resume',$2,$3)",[order,await version(),randomUUID()],coworker);await stop(coworker);
  });
  await t.test("unassigned and management cannot enter execution/signing context",async()=>{
   await assert.rejects(panel(outsider),e=>e.code==="42501");
   await assert.rejects(call("select public.transition_work_order($1,'stop',$2,$3)",[order,await version(),randomUUID()],manager),e=>e.code==="42501");
   await assert.rejects(call("insert into public.signatures(tenant_id,work_order_id,captured_by,signer_name,storage_path,sha256,report_version) values($1,$2,$3,'Forged',$4,$5,1)",[tenant,order,manager,`${tenant}/${order}/forged.png`,"a".repeat(64)],manager),e=>e.code==="42501");
  });
  await t.test("staff projection omits financial values and direct table read is denied",async()=>{
   const view=(await call("select public.staff_workspace($1) data",[tenant]))[0].data;
   assert.equal(view.workOrderTasks.length,1);assert.equal(JSON.stringify(view).includes("123456789"),false);assert.equal("unit_price_cents" in view.workOrderTasks[0],false);
   assert.equal((await call("select unit_price_cents from public.work_order_tasks where id=$1",[task])).length,0);
   assert.equal((await call("select * from public.work_orders where id=$1",[order])).length,0);
   assert.equal((await call("select * from public.work_order_assignments where work_order_id=$1",[order])).length,1);
   assert.equal((await call("select * from public.status_events where assignment_id=$1",[assignments[1]])).length,0);
   assert.equal(view.timeEntries.every(e=>e.personnel_id===people[0]),true);
  });
  await t.test("planner uses operational fields without raw-order or task financial bypass",async()=>{
   assert.equal((await call("select * from public.work_orders where id=$1",[order],planner)).length,0);
   assert.equal((await call("select * from public.work_order_tasks where id=$1",[task],planner)).length,0);
   const orders=(await call("select public.work_order_operational_rows($1,null,$2) data",[tenant,object],planner))[0].data;
   assert.equal(orders.length,1);assert.equal(orders[0].id,order);assert.equal(orders[0].commercial_terms,null);assert.equal(orders[0].template_snapshot,null);assert.equal(JSON.stringify(orders).includes("CANARY"),false);
   const taskData=(await call("select public.work_order_operational_task_data($1) data",[tenant],planner))[0].data;assert.equal(taskData.workOrderTasks.length,1);assert.equal("unit_price_cents" in taskData.workOrderTasks[0],false);assert.equal("commercial_snapshot" in taskData.workOrderTasks[0],false);
   const finance=(await call("select public.work_order_operational_rows($1,null,$2) data",[tenant,object],manager))[0].data;assert.equal(finance[0].commercial_terms.price,"PRIVATE-PRICE-CANARY");
  });
  await t.test("unanswered task blocks report, then report waits independently of stopped time",async()=>{
   await assert.rejects(submit("Fictitious completed work"),e=>e.code==="23514");
   await db.query("update public.work_order_tasks set completed_at=now(),executed_quantity=1,execution_state='completed' where id=$1",[task]);
   const exception=randomUUID();await db.query("insert into public.work_order_exceptions(id,tenant_id,work_order_id,kind,description,blocking,created_by) values($1,$2,$3,'unsafe','Fictitious unresolved hazard',true,$4)",[exception,tenant,order,staff]);
   await assert.rejects(submit("Fictitious completed work"),e=>e.code==="23514"&&e.message.includes("blokkerende"));
   await db.query("update public.work_order_exceptions set state='resolved',resolution='Fictitious resolved hazard' where id=$1",[exception]);
   const key=randomUUID();report=await submit("Fictitious completed work",key);const retry=await submit("Fictitious completed work",key);assert.equal(report.id,retry.id);assert.equal(report.state,"waiting_signature");
   assert.equal((await db.query("select count(*) from public.time_entries where assignment_id=any($1) and ends_at is null",[assignments])).rows[0].count,"0");
   await assert.rejects(call("select public.review_work_order($1,'approved',null)",[order],manager),e=>e.code==="23514");
   await assert.rejects(call("update public.work_orders set status='invoice_ready' where id=$1",[order],manager),e=>["23514","42501"].includes(e.code));
   await assert.rejects(call("insert into public.invoice_lines(tenant_id,invoice_id,work_order_id,description,quantity,unit,unit_price_cents,subtotal_cents,vat_basis_points,vat_cents,total_cents,source_snapshot) values($1,$2,$3,'Premature invoice',1,'task',100,100,2100,21,121,'{}')",[tenant,invoice,order],manager),e=>["23514","42501"].includes(e.code));
  });
  await t.test("snapshot defaults branding and excludes private/inactive checklist/material data",async()=>{
   const snapshot=(await panel()).versions[0].snapshot;assert.equal(snapshot.tenant.name,"Fictitious reporting tenant");assert.equal(snapshot.tenant.primaryColor,"#222C35");
   assert.deepEqual(snapshot.checklists.map(q=>q.question).sort(),["Evidence photo","Shared result"]);assert.equal(snapshot.checklists.find(q=>q.question==="Shared result").value,"Public result");assert.deepEqual(snapshot.attachments.map(a=>a.id),[proof]);assert.equal(snapshot.materials.length,1);assert.equal(snapshot.materials[0].description,"Public material");assert.equal(JSON.stringify(snapshot).includes("CANARY"),false);
  });
  const sign=async(current)=>{
   const intent=randomUUID();const prepared=(await call("select public.prepare_work_order_signature($1,$2,$3,'Fictitious signer','Contact op locatie','customer',$4) data",[order,current.id,current.contentHash,intent]))[0].data;
   await db.query("insert into storage.objects(bucket_id,name,metadata) values('signatures',$1,'{\"mimetype\":\"image/png\",\"size\":512}')",[prepared.path]);
   await call("select public.finalize_work_order_signature($1,$2)",[intent,"b".repeat(64)],undefined,"service_role");
   await call("select public.finalize_work_order_signature($1,$2)",[intent,"b".repeat(64)],undefined,"service_role");return intent;
  };
  const assertAttachmentGuard=async(state)=>{
   const before=(await panel()).versions[0];assert.equal(before.state,state);
   const internal=randomUUID();
   const add=async(id,visible)=>call("insert into public.attachments(id,tenant_id,work_order_id,uploaded_by,storage_bucket,storage_path,file_name,mime_type,size_bytes,sha256,customer_visible) values($1,$2,$3,$4,'reports',$5,'Internal follow-up.pdf','application/pdf',512,$6,$7) returning id",[id,tenant,order,manager,`${tenant}/${order}/${id}.pdf`,"d".repeat(64),visible],manager);
   assert.deepEqual(await add(internal,false),[{id:internal}]);
   await assert.rejects(add(randomUUID(),true),e=>e.code==="23514");
   await assert.rejects(call("update public.attachments set customer_visible=true where id=$1",[internal],manager),e=>e.code==="23514");
   // This proof is marked private in the source table but is explicitly selected
   // by a customer-visible checklist answer in the immutable report snapshot.
   assert.equal((await db.query("select customer_visible from public.attachments where id=$1",[proof])).rows[0].customer_visible,false);
   await assert.rejects(call("update public.attachments set file_name='Changed evidence.png' where id=$1",[proof],manager),e=>e.code==="23514");
   await assert.rejects(call("update public.attachments set deleted_at=now() where id=$1",[proof],manager),e=>e.code==="23514");
   // A storage worker bypasses row policies, but must not bypass evidence guards.
   await assert.rejects(call("delete from public.attachments where id=$1",[proof],manager,"service_role"),e=>e.code==="23514");
   const after=(await panel()).versions[0];assert.equal(after.contentHash,before.contentHash);assert.deepEqual(after.snapshot.attachments,before.snapshot.attachments);assert.equal(after.snapshot.attachments.some(a=>a.id===internal),false);
  };
  await t.test("signature binds current hash and server-authorized actor, retries once",async()=>{
   const current=(await panel()).versions[0];
   await assert.rejects(call("select public.prepare_work_order_signature($1,$2,$3,'Fictitious signer','Contact','customer',$4)",[order,current.id,"0".repeat(64),randomUUID()]),e=>e.code==="40001");
   await assert.rejects(call("select public.prepare_work_order_signature($1,$2,$3,'Manager','Contact','customer',$4)",[order,current.id,current.contentHash,randomUUID()],manager),e=>e.code==="42501");
   const revokedIntent=randomUUID(),prepared=(await call("select public.prepare_work_order_signature($1,$2,$3,'Fictitious signer','Contact','customer',$4) data",[order,current.id,current.contentHash,revokedIntent]))[0].data;
   await db.query("insert into storage.objects(bucket_id,name,metadata) values('signatures',$1,'{\"mimetype\":\"image/png\",\"size\":512}')",[prepared.path]);
   await db.query("update public.dispatches set revoked_at=now() where assignment_id=$1",[assignments[0]]);
   await assert.rejects(call("select public.finalize_work_order_signature($1,$2)",[revokedIntent,"b".repeat(64)],undefined,"service_role"),e=>e.code==="42501");
   await db.query("update public.dispatches set revoked_at=null where assignment_id=$1",[assignments[0]]);
   await db.query("update private.work_order_signature_intents set created_at=now()-interval '25 hours' where id=$1",[revokedIntent]);
   const expired=await call("select * from public.expired_work_order_signature_uploads()",[],undefined,"service_role");assert.ok(expired.some(i=>i.id===revokedIntent));
   await assert.rejects(call("select * from public.expired_work_order_signature_uploads()"),e=>e.code==="42501");
   oldSignature=await sign(current);assert.equal((await panel()).versions[0].state,"review");
   assert.equal((await db.query("select count(*) from public.signatures where report_id=$1",[current.id])).rows[0].count,"1");
   await assert.rejects(call("update public.signatures set signer_name='Changed' where id=$1",[oldSignature],manager),e=>e.code==="42501");
   await db.query("update public.personnel set full_name='Changed after signing' where id=$1",[people[0]]);assert.equal((await panel()).versions[0].signatures[0].capturedBy,"Fictitious employee 1");
  });
  await t.test("review permits new private files but freezes customer-visible additions and referenced private proof",async()=>{
   await assertAttachmentGuard("review");
  });
  await t.test("correction retains immutable evidence and requires signature on new version",async()=>{
   const old=(await panel()).versions[0];await call("select public.review_work_order($1,'returned','Correct the customer summary')",[order],manager);
   await assert.rejects(call("select public.change_work_order_signature_policy($1,$2,'none',false,'Cannot lower historical duty',$3)",[order,await version(),randomUUID()],manager),e=>e.code==="23514");
   await assert.rejects(call("update public.attachments set file_name='Rewritten proof' where id=$1",[proof],manager),e=>e.code==="23514");
   report=await submit("Corrected customer-facing summary");const current=(await panel()).versions[0];assert.equal(current.version,old.version+1);assert.equal(current.state,"waiting_signature");
   assert.equal((await db.query("select snapshot->>'summary' summary from public.work_order_report_versions where id=$1",[old.id])).rows[0].summary,old.snapshot.summary);
   assert.equal((await db.query("select count(*) from public.signatures where id=$1",[oldSignature])).rows[0].count,"1");
   await assert.rejects(call("select public.prepare_work_order_signature($1,$2,$3,'Late signer','Contact','customer',$4)",[order,old.id,old.contentHash,randomUUID()]),e=>e.code==="40001");
   await assert.rejects(call("select public.waive_work_order_signature($1,'Customer absent today')",[current.id],manager),e=>e.code==="42501");
   await sign(current);await call("select public.review_work_order($1,'approved',null)",[order],manager);assert.equal((await panel()).versions[0].state,"approved");
  });
  await t.test("approval still permits private follow-up files without changing immutable report evidence",async()=>{
   await assertAttachmentGuard("approved");
  });
  await t.test("only scoped users can download the exact snapshot/assets",async()=>{
   const current=(await panel()).versions[0];assert.equal((await call("select public.work_order_report_file($1,null) data",[current.id],manager))[0].data.contentHash,current.contentHash);
   await assert.rejects(call("select public.work_order_report_file($1,null)",[current.id],outsider),e=>e.code==="42501");
   await assert.rejects(call("select public.work_order_report_file($1,$2)",[current.id,randomUUID()],manager),e=>e.code==="42501");
   await db.query("insert into public.object_customer_bindings(tenant_id,object_id,user_id,active,created_by) values($1,$2,$3,true,$4)",[tenant,object,outsider,manager]);
   assert.equal((await call("select public.work_order_report_file($1,null) data",[current.id],outsider))[0].data.id,current.id);
   const documents=(await call("select public.customer_portal_documents($1) data",[tenant],outsider))[0].data;assert.deepEqual(documents.workReports.map(r=>r.id),[current.id]);
   await assert.rejects(call("select public.work_order_report_file($1,null)",[(await panel()).versions[1].id],outsider),e=>e.code==="42501");
   await db.query("update public.object_customer_bindings set active=false where tenant_id=$1 and object_id=$2 and user_id=$3",[tenant,object,outsider]);
   await assert.rejects(call("select public.work_order_report_file($1,null)",[current.id],outsider),e=>e.code==="42501");
   assert.equal((await call("select public.customer_portal_documents($1) data",[tenant],outsider))[0].data.workReports.length,0);
  });
 }finally{await db.query("rollback");await db.end();}
});
