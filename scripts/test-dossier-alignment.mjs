import assert from "node:assert/strict";
import { localWorkOrderTestUrl } from "./work-order-test-target.mjs";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { submitFixtureReport } from './work-order-report-fixture.mjs';

test("Dossier 360: shared sources, approval, partial allocation and current access", async t => {
 const local={ DB_URL: localWorkOrderTestUrl() };
 const db=new pg.Client({connectionString:local.DB_URL});await db.connect();
 const tenant=randomUUID(),other=randomUUID(),manager=randomUUID(),staff=randomUUID(),customerUser=randomUUID(),planner=randomUUID();
 const users=[manager,staff,customerUser,planner],sessions=Object.fromEntries(users.map(id=>[id,randomUUID()]));
 const customer=randomUUID(),secondCustomer=randomUUID(),object=randomUUID(),secondObject=randomUUID(),person=randomUUID(),order=randomUUID(),secondOrder=randomUUID(),assignment=randomUUID(),catalog=randomUUID(),revision=randomUUID(),task=randomUUID(),document=randomUUID();
 const call=async(sql,args=[],actor=manager,role="authenticated")=>{const c=new pg.Client({connectionString:local.DB_URL});await c.connect();try{await c.query("begin");await c.query("set local statement_timeout='15s'");await c.query(`set local role ${role}`);await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:actor,session_id:sessions[actor],role})]);const r=await c.query(sql,args);await c.query("commit");return r.rows;}catch(e){await c.query("rollback");throw e;}finally{await c.end();}};
 const chain=async(c=customer,o=null,p=null,w=null,actor=manager)=>(await call("select public.dossier_chain($1,$2,$3,$4,$5) result",[tenant,c,o,p,w],actor))[0].result;
 let agreement,agreementLine,request,proposal,extraTask,invoice;
 try {
  for(const u of users){await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",[u,`${u}@dossier.test`]);await db.query("insert into auth.sessions(id,user_id,created_at,updated_at) values($1,$2,now(),now())",[sessions[u],u]);}
  for(const id of [tenant,other]){await db.query("insert into public.tenants(id,slug,name) values($1,$2,'Fictitious Dossier 360')",[id,`alignment-${id}`]);await db.query("insert into public.tenant_settings(tenant_id,enabled_services,signature_required_default) values($1,array['planning','personeel','finance','rapportage'],false)",[id]);await db.query("insert into public.tenant_branding(tenant_id) values($1)",[id]);}
  await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['tenant_admin','management','hr','finance','planner']::public.app_role[],'active'),($1,$3,array['staff']::public.app_role[],'active'),($1,$4,array['planner']::public.app_role[],'active')",[tenant,manager,staff,planner]);
  for(const id of [customer,secondCustomer])await db.query("insert into public.customers(id,tenant_id,customer_number,name) values($1,$2,$3,'Fictitious customer')",[id,tenant,`C-${id}`]);
  for(const id of [object,secondObject])await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values($1,$2,$3,$4,'Original object','{\"street\":\"Teststraat 1\"}')",[id,tenant,id===object?customer:secondCustomer,`O-${id}`]);
  await db.query("insert into public.personnel(id,tenant_id,user_id,full_name) values($1,$2,$3,'Fictitious employee')",[person,tenant,staff]);
  await db.query("insert into public.task_catalog(id,tenant_id,code,name,discipline) values($1,$2,'ALIGN','Daily service','Onderhoud')",[catalog,tenant]);
  await db.query("insert into public.task_revisions(id,tenant_id,task_id,revision,duration_minutes,price_cents) values($1,$2,$3,1,30,1000)",[revision,tenant,catalog]);
  await db.query("insert into public.customer_documents(id,tenant_id,customer_id,title,storage_path,file_name,mime_type,size_bytes,sha256,created_by) values($1,$2,$3,'Fictitious agreement',$4,'agreement.pdf','application/pdf',20,$5,$6)",[document,tenant,customer,`${tenant}/${customer}/${randomUUID().replaceAll('-','')}.pdf`,'a'.repeat(64),manager]);
  for(const id of [order,secondOrder])await db.query("insert into public.work_orders(id,tenant_id,customer_id,object_id,work_order_number,discipline,status,planned_start_at,planned_end_at,projected_start_at,projected_end_at,published_at,planning_state,created_by) values($1,$2,$3,$4,$5,'Onderhoud','released',now()-interval '5 minutes',now()+interval '30 minutes',now()-interval '5 minutes',now()+interval '30 minutes',now(),'final',$6)",[id,tenant,customer,object,`W-${id}`,manager]);
  await db.query("insert into public.work_order_assignments(id,tenant_id,work_order_id,personnel_id,status,planned_start_at,planned_end_at,projected_start_at,projected_end_at) values($1,$2,$3,$4,'in_progress',now()-interval '5 minutes',now()+interval '30 minutes',now()-interval '5 minutes',now()+interval '30 minutes')",[assignment,tenant,order,person]);
  await db.query("insert into public.dispatches(tenant_id,work_order_id,assignment_id,dispatched_by,idempotency_key) values($1,$2,$3,$4,$5)",[tenant,order,assignment,manager,randomUUID()]);
  await db.query("update public.work_orders set status='in_progress' where id=$1",[order]);
  await call("insert into public.object_customer_bindings(tenant_id,object_id,user_id) values($1,$2,$3)",[tenant,object,customerUser]);
  const today=(await db.query("select (now() at time zone 'Europe/Amsterdam')::date::text d")).rows[0].d;
  await t.test("agreement source is versioned, customer scoped and retry safe",async()=>{
   agreement=randomUUID();const input={id:agreement,previousId:"",title:"Daily service agreement",startsOn:"2026-01-01",endsOn:"",acceptedBy:"Fictitious approver",acceptedOn:today,documentId:document,lines:[{objectId:object,taskRevisionId:revision,scope:"Three units per visit",quantity:3,priceCents:1200,limitCents:3600}]};
   await Promise.all([call("select public.record_customer_agreement($1,$2,$3)",[tenant,customer,input]),call("select public.record_customer_agreement($1,$2,$3)",[tenant,customer,input])]);
   assert.equal((await chain()).agreements.length,1);agreementLine=(await chain()).agreements[0].lines[0].id;
   await assert.rejects(call("select public.record_customer_agreement($1,$2,$3)",[tenant,secondCustomer,{...input,id:randomUUID()}]),e=>e.code==="23514");
   assert.equal((await chain(customer,null,null,null,planner)).agreements.length,0);
   await assert.rejects(call("update public.customer_agreements set title='Overwrite' where id=$1",[agreement]),e=>e.code==="42501");
   await db.query("insert into public.work_order_tasks(id,tenant_id,work_order_id,task_revision_id,task_code,task_name,duration_minutes,quantity,unit,unit_price_cents,vat_basis_points,agreement_line_id) values($1,$2,$3,$4,'ALIGN','Daily service',30,3,'task',1200,2100,$5)",[task,tenant,order,revision,agreementLine]);
   assert.equal((await db.query("select commercial_snapshot->>'version' v from public.work_order_tasks where id=$1",[task])).rows[0].v,'1');
   await assert.rejects(db.query("update public.work_order_tasks set unit_price_cents=1300 where id=$1",[task]),e=>e.code==="23514");
   await assert.rejects(db.query("update public.work_order_tasks set agreement_line_id=null,commercial_snapshot='{}' where id=$1",[task]),e=>e.code==="23514");
   await assert.rejects(db.query("insert into public.work_order_tasks(tenant_id,work_order_id,task_revision_id,task_code,task_name,duration_minutes,quantity,unit,unit_price_cents,vat_basis_points,agreement_line_id) values($1,$2,$3,'ALIGN','Duplicate line',30,1,'task',1200,2100,$4)",[tenant,order,revision,agreementLine]),e=>e.code==="23514");
  });
  await t.test("scenario A: regular request is one source in customer/object/order and no extra charge",async()=>{
   const id=randomUUID();await call("select public.submit_object_visit_request($1,$2,$3,$4,$5)",[tenant,object,order,id,{title:"Extra attention to toilets",body:"Only this visit",kind:"attention",priority:"normal"}],customerUser);
   await call("select public.review_object_visit_request($1,$2,1,'regular',$3)",[tenant,id,{taskRevisionId:revision,reason:"Included in agreed scope"}]);
   const c=await chain(),o=await chain(null,object),w=await chain(null,null,null,order);
   for(const view of [c,o,w])assert.equal(view.requests.filter(r=>r.id===id).length,1);
   const regular=c.requests.find(r=>r.id===id);assert.equal((await db.query("select unit_price_cents from public.work_order_tasks where id=$1",[regular.work_order_task_id])).rows[0].unit_price_cents,'0');
   assert.equal((await chain(null,null,null,secondOrder)).requests.length,0);
   await call("select public.record_task_execution($1,$2,1,'completed',1,'Done')",[tenant,regular.work_order_task_id],staff);
   assert.equal((await chain()).actions.find(a=>a.id===id).status,'completed');
   await call("select public.complete_work_order_task($1,false,null)",[regular.work_order_task_id],staff);
   assert.equal((await chain()).actions.find(a=>a.id===id).status,'regular');
   await call("select public.complete_work_order_task($1,true,null)",[regular.work_order_task_id],staff);
   assert.equal((await chain()).actions.find(a=>a.id===id).status,'completed');
  });
  await t.test("scenarios B/C: exact proposal consent, stale version rejected, internal assessment not exposed",async()=>{
   request=randomUUID();await call("select public.submit_object_visit_request($1,$2,$3,$4,$5)",[tenant,object,order,request,{title:"Extra agreed work",body:"Separate approval",kind:"extra",priority:"normal"}],customerUser);
   await call("select public.review_object_visit_request($1,$2,1,'proposal',$3)",[tenant,request,{taskRevisionId:revision,reason:"First scope",quantity:2,priceCents:1500}]);
   const first=(await chain()).requests.find(r=>r.id===request).proposals[0];
   await call("select public.review_object_visit_request($1,$2,2,'proposal',$3)",[tenant,request,{taskRevisionId:revision,reason:"Revised scope",quantity:2,priceCents:1700}]);
   await assert.rejects(call("select public.accept_object_proposal($1,$2)",[tenant,first.id],customerUser),e=>e.code==="40001");
   proposal=(await chain()).requests.find(r=>r.id===request).proposals[0];assert.equal(proposal.version,2);
   await call("select public.accept_object_proposal($1,$2)",[tenant,proposal.id],customerUser);
   extraTask=(await chain()).requests.find(r=>r.id===request).work_order_task_id;
   await db.query("update public.object_visit_requests set review_note='PRIVATE COMMERCIAL ASSESSMENT' where id=$1",[request]);
   const portal=(await call("select public.object_visit_context($1,$2,$3) data",[tenant,object,order],customerUser))[0].data;
   assert.equal(JSON.stringify(portal).includes('PRIVATE COMMERCIAL ASSESSMENT'),false);
   await call("select public.record_task_execution($1,$2,1,'completed',2,'Done')",[tenant,extraTask],staff);
  });
  await t.test("scenario J: partial actual execution, review and parallel retry allocate exactly once",async()=>{
   await call("select public.record_task_execution($1,$2,1,'partial',2,'Two completed; one follows at the next agreed visit')",[tenant,task],staff);
   const partialBefore=(await db.query("select executed_quantity,execution_state,execution_version,completion_note from public.work_order_tasks where id=$1",[task])).rows[0];
   await call("select public.complete_work_order_task($1,true,$2)",[task,partialBefore.completion_note],staff);
   assert.deepEqual((await db.query("select executed_quantity,execution_state,execution_version,completion_note from public.work_order_tasks where id=$1",[task])).rows[0],partialBefore);
   await assert.rejects(call("select public.record_task_execution($1,$2,1,'completed',3,'Stale update')",[tenant,task],staff),e=>e.code==="40001");
   await db.query("update public.work_orders set status='completed' where id=$1",[order]);
   await submitFixtureReport(db,call,{tenant,order,staff,manager});
   await call("select public.review_work_order($1,'approved',null)",[order]);
   assert.equal((await db.query("select extra_work_status from public.work_order_tasks where id=$1",[extraTask])).rows[0].extra_work_status,'approved');
   const key=randomUUID();const create=()=>call("select (public.create_execution_invoice($1,$2,$3)).*",[tenant,key,JSON.stringify([{taskId:task,quantity:1},{taskId:extraTask,quantity:2}])]);
   const results=await Promise.all([create(),create()]);assert.equal(results[0][0].id,results[1][0].id);invoice=results[0][0].id;
   assert.equal((await db.query("select count(*)::int n from public.invoice_lines where invoice_id=$1",[invoice])).rows[0].n,2);
   assert.equal((await db.query("select status from public.work_orders where id=$1",[order])).rows[0].status,'invoice_ready');
   // Simulate an existing pre-alignment allocation: its immutable snapshot already identifies the source.
   await db.query("begin");try{await db.query("set local session_replication_role='replica'");await db.query("update public.invoice_lines set work_order_task_id=null where invoice_id=$1 and work_order_task_id=$2",[invoice,task]);await db.query("commit");}catch(e){await db.query("rollback");throw e;}
   await assert.rejects(call("select public.create_execution_invoice($1,$2,$3)",[tenant,randomUUID(),JSON.stringify([{taskId:task,quantity:2}])]),e=>e.code==="23514");
   await call("select public.create_execution_invoice($1,$2,$3)",[tenant,randomUUID(),JSON.stringify([{taskId:task,quantity:1}])]);
   assert.equal((await db.query("select sum(quantity)::numeric q from public.invoice_lines where work_order_task_id=$1 or source_snapshot->>'work_order_task_id'=$1::text",[task])).rows[0].q,'2.000');
   await assert.rejects(db.query("update public.work_order_tasks set executed_quantity=3 where id=$1",[task]),e=>e.code==="23514");
  });
  await t.test("scenario H: historical object and exact agreement/consent snapshots stay immutable",async()=>{
   const before=(await db.query("select source_snapshot from public.invoice_lines where invoice_id=$1 order by id",[invoice])).rows;
   await call("update public.objects set name='New current name' where id=$1",[object]);
   await call("select public.record_customer_agreement($1,$2,$3)",[tenant,customer,{id:randomUUID(),previousId:agreement,title:"New contract price",startsOn:today,endsOn:"",acceptedBy:"Fictitious approver",acceptedOn:today,documentId:document,lines:[{objectId:object,taskRevisionId:revision,scope:"Revised future visits",quantity:3,priceCents:1500,limitCents:4500}]}]);
   assert.equal((await chain()).agreements.length,2);
   const after=(await db.query("select source_snapshot from public.invoice_lines where invoice_id=$1 order by id",[invoice])).rows;assert.deepEqual(after,before);
   assert.ok(after.some(r=>r.source_snapshot.agreement.version===1));assert.ok(after.some(r=>r.source_snapshot.proposal_version===2));
  });
  await t.test("scenario I: document registry respects original HR, tenant and customer boundaries",async()=>{
   const hrDoc=randomUUID();await db.query("insert into public.personnel_documents(id,tenant_id,personnel_id,title,document_type,storage_path,created_by,dossier_managed,visible_to_employee) values($1,$2,$3,'Private HR contract','contract',$4,$5,true,false)",[hrDoc,tenant,person,`${tenant}/${person}/${hrDoc}.pdf`,manager]);
   const hr=(await chain(null,null,person)).documents;assert.equal(hr.some(d=>d.source_id===hrDoc),true);
   assert.equal((await chain()).documents.some(d=>d.source_id===hrDoc),false);
   assert.equal((await chain(null,null,null,null,planner)).documents.some(d=>d.source_id===hrDoc),false);
   await assert.rejects(call("select public.dossier_chain($1,$2,null,null,null)",[other,customer]),e=>e.code==="42501");
   assert.equal((await call("select count(*)::int n from public.dossier_documents",[],customerUser))[0].n,0);
   await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[sessions[manager]]);
   assert.equal((await call("select count(*)::int n from public.dossier_documents"))[0].n,0);
   await db.query("update auth.sessions set not_after=null where id=$1",[sessions[manager]]);
  });
  await t.test("scenario G: queued events recheck publication and active assignment at delivery",async()=>{
   const ev=randomUUID();await db.query("insert into public.outbox_events(id,tenant_id,event_type,aggregate_type,aggregate_id,payload,idempotency_key) values($1,$2,'work_order.rescheduled','work_order',$3,$4,$5)",[ev,tenant,order,{personnel_id:person},randomUUID()]);
   assert.equal((await call("select * from public.current_event_recipients($1)",[ev],manager,"service_role")).some(r=>r.user_id===staff),true);
   await db.query("update public.dispatches set revoked_at=now() where assignment_id=$1",[assignment]);
   assert.equal((await call("select * from public.current_event_recipients($1)",[ev],manager,"service_role")).length,0);
  });
 } finally { try {
  // Remove only these random test tenants, including immutable report history.
  await db.query('begin');await db.query("set local session_replication_role='replica'");
  const tables=(await db.query("select table_schema,table_name from information_schema.columns where column_name='tenant_id' and table_schema in ('public','private')")).rows;
  for(const {table_schema:s,table_name:n} of tables)await db.query(`delete from "${s}"."${n}" where tenant_id=any($1::uuid[])`,[[tenant,other]]);
  await db.query("delete from public.tenants where id=any($1)",[[tenant,other]]);await db.query("delete from auth.sessions where user_id=any($1)",[users]);await db.query("delete from auth.users where id=any($1)",[users]);await db.query('commit');
 } finally { await db.end(); } }
});
