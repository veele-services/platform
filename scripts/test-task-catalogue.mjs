import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {workOrderTestDatabase} from './work-order-test-target.mjs';

test('task catalogue numbering, immutable requirements and tenant/finance boundaries',async t=>{
 const db=await workOrderTestDatabase();await db.query('begin');
 const tenant=randomUUID(),other=randomUUID(),manager=randomUUID(),planner=randomUUID(),staff=randomUUID();
 const sessions=new Map([manager,planner,staff].map(x=>[x,randomUUID()]));
 const call=async(sql,args=[],actor=manager)=>{await db.query('savepoint catalogue_test');try{await db.query('set local role authenticated');await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:actor,session_id:sessions.get(actor),role:'authenticated'})]);const result=await db.query(sql,args);await db.query('reset role');await db.query('release savepoint catalogue_test');return result.rows[0]?.r;}catch(e){await db.query('rollback to savepoint catalogue_test');await db.query('release savepoint catalogue_test');throw e;}};
 const command=(input,actor=manager)=>call('select public.task_catalogue_command($1,$2) r',[tenant,{mutationId:randomUUID(),...input}],actor);
 const catalogue=(actor=manager)=>call('select public.task_catalogue($1) r',[tenant],actor);
 let category,task;
 try{
  for(const[id,session]of sessions){await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,`${id}@catalogue.test`]);await db.query("insert into auth.sessions(id,user_id,not_after) values($1,$2,now()+interval '1 day')",[session,id]);}
  for(const id of[tenant,other]){await db.query("insert into public.tenants(id,slug,name) values($1,$2,'FICTITIOUS catalogue')",[id,`cat-${id}`]);await db.query("insert into public.tenant_settings(tenant_id,enabled_services) values($1,array['planning','rapportage','finance'])",[id]);}
  for(const[id,roles]of[[manager,['tenant_admin','management','finance']],[planner,['planner']],[staff,['staff']]])await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,$3,'active')",[tenant,id,roles]);
  await t.test('automatic codes skip legacy collisions and strict retries never consume numbers',async()=>{
   category=await command({action:'category_save',name:'FICTITIOUS cleaning',prefix:'SCH'});
   await db.query("insert into public.task_catalog(tenant_id,code,name,discipline) values($1,'SCH-001','Legacy','Test')",[tenant]);
   const input={mutationId:randomUUID(),action:'task_save',categoryId:category.id,name:'FICTITIOUS task',discipline:'Schoonmaak',duration:60,priceCents:987654,vatBasisPoints:2100,extraWork:true,requiresPhoto:true,requiresSignature:true};
   task=await command(input);assert.equal(task.code,'SCH-002');assert.deepEqual(await command(input),task);
   const next=await command({...input,mutationId:randomUUID(),name:'Second task'});assert.equal(next.code,'SCH-003');
   await assert.rejects(command({...input,name:'Changed retry'}),e=>e.code==='23514');
   assert.equal((await catalogue()).categories[0].next_number,4);
  });
  await t.test('category prefix changes affect future codes, not existing task identity',async()=>{
   const c=(await catalogue()).categories[0];await command({action:'category_save',id:c.id,version:c.version,name:c.name,prefix:'NEW'});
   const next=await command({action:'task_save',categoryId:c.id,name:'Third task',discipline:'Test',duration:30,priceCents:1000,vatBasisPoints:2100});assert.equal(next.code,'NEW-004');
   assert.equal((await catalogue()).tasks.find(x=>x.id===task.id).code,'SCH-002');
   await assert.rejects(command({action:'category_save',id:c.id,version:c.version,name:c.name,prefix:'OLD'}),e=>e.code==='40001');
  });
  await t.test('edits create a new revision and preserve historical prices and evidence requirements',async()=>{
   const original=(await catalogue()).tasks.find(x=>x.id===task.id);
   const edited=await command({action:'task_save',id:task.id,version:task.version,name:'Changed task',discipline:'Test',duration:90,priceCents:12000,vatBasisPoints:900,extraWork:false,requiresPhoto:false,requiresSignature:false});
   assert.equal(edited.code,task.code);const old=(await db.query('select * from public.task_revisions where id=$1',[original.revisionId])).rows[0];assert(old.valid_until);assert.equal(old.price_cents,'987654');assert.equal(old.requires_photo,true);assert.equal(old.requires_customer_signature,true);
   await db.query('savepoint revision_guard');await assert.rejects(db.query('update public.task_revisions set requires_photo=false where id=$1',[old.id]),e=>e.code==='23514');await db.query('rollback to savepoint revision_guard');await db.query('release savepoint revision_guard');
   await assert.rejects(command({action:'task_save',id:task.id,version:task.version,name:'Stale task',discipline:'Test',duration:90,priceCents:0,vatBasisPoints:0}),e=>e.code==='40001');
  });
  await t.test('frozen task requirements enforce photo evidence and required customer signing',async()=>{
   const revision=(await db.query('select id from public.task_revisions where task_id=$1 and revision=1',[task.id])).rows[0].id;
   const customer=randomUUID(),object=randomUUID(),order=randomUUID();
   await db.query("insert into public.customers(id,tenant_id,customer_number,name) values($1,$2,$3,'FICTITIOUS proof customer')",[customer,tenant,customer]);
   await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values($1,$2,$3,$4,'FICTITIOUS proof object','{\"street\":\"Teststraat 1\"}')",[object,tenant,customer,object]);
   await db.query("insert into public.work_orders(id,tenant_id,customer_id,object_id,work_order_number,discipline,signature_mode,created_by) values($1,$2,$3,$4,$5,'Test','none',$6)",[order,tenant,customer,object,order,manager]);
   await db.query("insert into public.work_order_tasks(tenant_id,work_order_id,task_revision_id,task_code,task_name,duration_minutes,quantity,unit,unit_price_cents,vat_basis_points,completed_at,executed_quantity,execution_state) values($1,$2,$3,'SCH-002','FICTITIOUS task',60,1,'task',987654,2100,now(),1,'completed')",[tenant,order,revision]);
   const policy=(await db.query('select private.work_order_signature_policy(w) r from public.work_orders w where id=$1',[order])).rows[0].r;assert.equal(policy.mode,'required');assert.equal(policy.source,'task');
   await db.query('savepoint proof_required');await assert.rejects(db.query('select private.validate_work_order_report(w) from public.work_orders w where id=$1',[order]),e=>e.code==='23514'&&e.message.includes('foto'));await db.query('rollback to savepoint proof_required');await db.query('release savepoint proof_required');
   const proof=randomUUID();await db.query("insert into public.attachments(id,tenant_id,work_order_id,uploaded_by,storage_bucket,storage_path,file_name,mime_type,size_bytes,sha256,customer_visible) values($1,$2,$3,$4,'reports',$5,'Proof.png','image/png',512,$6,true)",[proof,tenant,order,manager,`${tenant}/${order}/${proof}.png`,'c'.repeat(64)]);
   await db.query('select private.validate_work_order_report(w) from public.work_orders w where id=$1',[order]);
  });
  await t.test('staff, other tenants and direct writes fail closed; planners cannot read or replace existing rates',async()=>{
   await assert.rejects(catalogue(staff),e=>e.code==='42501');await assert.rejects(call('select public.task_catalogue($1) r',[other]),e=>e.code==='42501');
   assert(!JSON.stringify(await catalogue(planner)).includes('priceCents'));assert(!JSON.stringify(await catalogue(planner)).includes('987654'));
   const current=(await catalogue()).tasks.find(x=>x.id===task.id);
   await assert.rejects(command({action:'task_save',id:current.id,version:current.version,name:current.name,discipline:current.discipline,duration:30,priceCents:0,vatBasisPoints:0},planner),e=>e.code==='42501');
   await command({action:'task_save',id:current.id,version:current.version,name:current.name,discipline:current.discipline,duration:30},planner);
   await assert.rejects(call("insert into public.task_categories(tenant_id,name,prefix) values($1,'Bypass','BAD') returning id r",[tenant]),e=>e.code==='42501');
   await assert.rejects(command({action:'category_save',name:'X',prefix:'BAD CODE'}),e=>e.code==='23514');
  });
 }finally{await db.query('rollback');await db.end();}
});
