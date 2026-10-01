import assert from "node:assert/strict";
import { localWorkOrderTestUrl } from "./work-order-test-target.mjs";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";

test("Work-order direct RPC guards reject null versions, malformed templates and expired evidence", async t => {
  const local={ DB_URL: localWorkOrderTestUrl() };
  const db=new pg.Client({connectionString:local.DB_URL});await db.connect();await db.query('begin');
  const tenant=randomUUID(),manager=randomUUID(),planner=randomUUID(),customer=randomUUID(),object=randomUUID(),catalog=randomUUID(),revision=randomUUID();
  const sessions=new Map([[manager,randomUUID()],[planner,randomUUID()]]);
  const call=async(sql,args=[],actor=manager)=>{await db.query('savepoint rpc_guard');try{await db.query('set local role authenticated');await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:actor,session_id:sessions.get(actor),role:'authenticated'})]);const result=await db.query(sql,args);await db.query('reset role');await db.query("select set_config('request.jwt.claims','{}',true)");await db.query('release savepoint rpc_guard');return result.rows;}catch(error){await db.query('rollback to savepoint rpc_guard');await db.query('release savepoint rpc_guard');throw error;}};
  const payload=overrides=>({id:randomUUID(),mutationId:randomUUID(),version:0,customerId:customer,objectId:object,title:'FICTITIOUS RPC order',discipline:'Onderhoud',state:'unassigned',signatureMode:'inherit',employeeSignatureRequired:false,requiredPersonnel:1,windowKind:'unknown',assignments:[],tasks:[{revisionId:revision,quantity:1,instructions:''}],...overrides});
  const save=(input,actor=manager)=>call('select public.save_work_order($1,$2) result',[tenant,input],actor).then(rows=>rows[0].result);
  const template=(definition,actor=manager,extra={})=>call("select public.work_order_template_command($1,$2,'save',$3) result",[tenant,randomUUID(),{name:'FICTITIOUS validation',kind:'checklist',revisionId:null,definition,...extra}],actor).then(rows=>rows[0].result);
  try{
    for(const [actor,session]of sessions){await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[actor,`${actor}@rpc-guard.test`]);await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,actor]);}
    await db.query("insert into public.tenants(id,slug,name) values($1,$2,'FICTITIOUS RPC guard tenant')",[tenant,`rpc-guard-${tenant}`]);
    await db.query("insert into public.tenant_settings(tenant_id,enabled_services) values($1,array['planning','rapportage','personeel','finance'])",[tenant]);
    await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['tenant_admin','management','finance']::public.app_role[],'active'),($1,$3,array['planner']::public.app_role[],'active')",[tenant,manager,planner]);
    await db.query("insert into public.customers(id,tenant_id,customer_number,name) values($1,$2,'RPC-C','FICTITIOUS customer')",[customer,tenant]);
    await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values($1,$2,$3,'RPC-O','FICTITIOUS object','{}')",[object,tenant,customer]);
    await db.query("insert into public.task_catalog(id,tenant_id,code,name,discipline) values($1,$2,'RPC','FICTITIOUS task','Onderhoud')",[catalog,tenant]);
    await db.query("insert into public.task_revisions(id,tenant_id,task_id,revision,duration_minutes,price_cents) values($1,$2,$3,1,15,1500)",[revision,tenant,catalog]);

    await t.test('missing and null optimistic versions fail without mutating an existing order',async()=>{
      const input=payload();await save(input);
      for(const version of [undefined,null]){
        await assert.rejects(save({...input,mutationId:randomUUID(),version,title:'Unversioned overwrite'}),error=>error.code==='23514');
        await assert.rejects(call('select public.mutate_work_order($1,$2)',[tenant,{orderId:input.id,mutationId:randomUUID(),version,action:'archive'}]),error=>error.code==='40001');
      }
      const row=(await db.query('select title,archive_at from public.work_orders where id=$1',[input.id])).rows[0];assert.equal(row.title,input.title);assert.equal(row.archive_at,null);
    });

    await t.test('question type and conditional comparison are validated at the direct API boundary',async()=>{
      const parent={id:'parent',label:'FICTITIOUS boolean',type:'boolean',required:true};
      await assert.rejects(template({questions:[{id:'unknown',label:'Missing type'}]}),error=>error.code==='23514');
      for(const condition of [{questionId:'parent'},{equals:true},{questionId:'parent',equals:'true'}])await assert.rejects(template({questions:[parent,{id:'child',label:'FICTITIOUS child',type:'text',condition}]}),error=>error.code==='23514');
      await assert.rejects(template({questions:[{id:'choice',label:'FICTITIOUS choice',type:'choice',options:['']}]}),error=>error.code==='23514');
      await template({questions:[parent,{id:'child',label:'FICTITIOUS child',type:'text',condition:{questionId:'parent',equals:true}}]});
    });

    await t.test('planners preserve inherited policy but cannot override template or employee signature rules',async()=>{
      await template({questions:[]},planner);
      await assert.rejects(template({questions:[],signatureMode:'none'},planner),error=>error.code==='42501');
      await assert.rejects(template({questions:[],employeeSignatureRequired:false},planner),error=>error.code==='42501');
      const input=payload({employeeSignatureRequired:true});await save(input);
      const version=Number((await db.query('select version from public.work_orders where id=$1',[input.id])).rows[0].version);
      await assert.rejects(save({...input,mutationId:randomUUID(),version,employeeSignatureRequired:false},planner),error=>error.code==='42501');
    });

    await t.test('an archived template remains usable only by its existing work-order snapshot',async()=>{
      const definition={tasks:[{revisionId:revision,quantity:1}]};
      const version=await template(definition,manager,{kind:'work_order'});
      await call("select public.work_order_template_command($1,$2,'publish',$3)",[tenant,randomUUID(),{revisionId:version.id,editVersion:1}]);
      const input=payload({templateRevisionId:version.id}),created=await save(input);
      await call("select public.work_order_template_command($1,$2,'archive',$3)",[tenant,randomUUID(),{revisionId:version.id,editVersion:2}]);
      const updated=await save({...input,version:created.version,mutationId:randomUUID(),title:'FICTITIOUS edit after template archive'});
      assert.equal(updated.ok,true);
      assert.equal((await db.query("select template_snapshot->>'id' id from public.work_orders where id=$1",[created.id])).rows[0].id,version.id);
      await assert.rejects(save(payload({templateRevisionId:version.id})),error=>error.code==='23514');
    });

    await t.test('photo evidence must remain current and customer-visible communication requires a report correction',async()=>{
      const input=payload(),created=await save(input),file=randomUUID(),checklist=randomUUID();
      const definition={questions:[{id:'photo',label:'FICTITIOUS photo',type:'photo',required:true,proof:true}]};
      const version=await template(definition);
      await call("select public.work_order_template_command($1,$2,'publish',$3)",[tenant,randomUUID(),{revisionId:version.id,editVersion:1}]);
      await db.query("insert into public.work_order_checklists(id,tenant_id,work_order_id,template_revision_id,name,definition) values($1,$2,$3,$4,'FICTITIOUS photo proof',$5)",[checklist,tenant,created.id,version.id,definition]);
      await db.query("update public.work_orders set planned_start_at=now(),planned_end_at=now()+interval '1 hour',projected_start_at=now(),projected_end_at=now()+interval '1 hour',status='in_progress' where id=$1",[created.id]);
      await db.query("insert into public.attachments(id,tenant_id,work_order_id,uploaded_by,storage_bucket,storage_path,file_name,mime_type,size_bytes,sha256,deleted_at) values($1,$2,$3,$4,'reports',$5,'FICTITIOUS.png','image/png',10,$6,now())",[file,tenant,created.id,manager,`${tenant}/${created.id}/${file}.png`,'a'.repeat(64)]);
      const answer={mutationId:randomUUID(),checklistId:checklist,questionId:'photo',version:0,value:file,notApplicable:false,reason:'',attachmentId:file};
      await assert.rejects(call('select public.answer_work_order_checklist($1,$2)',[tenant,answer]),error=>error.code==='23514');
      await db.query('update public.attachments set deleted_at=null where id=$1',[file]);
      await call('select public.answer_work_order_checklist($1,$2)',[tenant,answer]);
      assert.equal((await db.query('select private.work_order_checklist_ready($1) ready',[created.id])).rows[0].ready,true);
      await db.query('update public.attachments set deleted_at=now() where id=$1',[file]);
      assert.equal((await db.query('select private.work_order_checklist_ready($1) ready',[created.id])).rows[0].ready,false);
      await db.query("update public.work_orders set report_state='review' where id=$1",[created.id]);
      await assert.rejects(call('select public.work_order_communication($1,$2)',[tenant,{orderId:created.id,mutationId:randomUUID(),body:'FICTITIOUS later customer content',customerVisible:true}]),error=>error.code==='23514');
    });
  }finally{await db.query('rollback');await db.end();}
});
