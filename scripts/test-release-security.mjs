import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { workOrderTestDatabase } from './work-order-test-target.mjs';

test('release privacy boundaries use real authenticated principals', async t => {
  const db=await workOrderTestDatabase();
  const tenant=randomUUID(),foreignTenant=randomUUID(),manager=randomUUID(),staff=randomUUID(),colleague=randomUUID(),platform=randomUUID();
  const users=[manager,staff,colleague,platform],sessions=new Map(users.map(u=>[u,randomUUID()]));
  const customer=randomUUID(),foreignCustomer=randomUUID(),object=randomUUID(),order=randomUUID(),contact=randomUUID();
  const people=[randomUUID(),randomUUID()],assignments=[randomUUID(),randomUUID()],entries=[randomUUID(),randomUUID()],files=[randomUUID(),randomUUID()];
  const paths=entries.map((id,i)=>`${tenant}/${order}/${id}/${files[i]}.png`);
  const call=async(sql,args=[],actor=staff,session=sessions.get(actor))=>{
    await db.query('savepoint actor_call');
    try {
      await db.query('set local role authenticated');
      await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:actor,session_id:session,role:'authenticated'})]);
      const result=await db.query(sql,args);
      await db.query('reset role');await db.query("select set_config('request.jwt.claims','{}',true)");
      await db.query('release savepoint actor_call');return result.rows;
    } catch(error) {await db.query('rollback to savepoint actor_call');await db.query('release savepoint actor_call');throw error;}
  };
  const workspace=()=>call('select public.staff_workspace($1) data',[tenant]).then(rows=>rows[0].data);
  try {
    await db.query('begin');
    for(const u of users){await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[u,`${u}@release-security.test`]);await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sessions.get(u),u]);}
    for(const id of [tenant,foreignTenant]){await db.query("insert into public.tenants(id,slug,name) values($1,$2,'FICTITIOUS release audit tenant')",[id,`audit-${id}`]);await db.query("insert into public.tenant_settings(tenant_id,enabled_services) values($1,array['planning','personeel','rapportage','finance'])",[id]);}
    await db.query('insert into public.platform_admins(user_id) values($1)',[platform]);
    await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['tenant_admin','management','planner','finance']::public.app_role[],'active'),($1,$3,array['staff']::public.app_role[],'active'),($1,$4,array['staff']::public.app_role[],'active')",[tenant,manager,staff,colleague]);
    for(const [id,tid] of [[customer,tenant],[foreignCustomer,foreignTenant]])await db.query("insert into public.customers(id,tenant_id,customer_number,name,billing_email) values($1,$2,$3,'FICTITIOUS customer','billing@release-security.test')",[id,tid,`C-${id}`]);
    await db.query("insert into public.customer_contacts(id,tenant_id,customer_id,full_name,email) values($1,$2,$3,'FICTITIOUS unassigned contact','contact@release-security.test')",[contact,tenant,customer]);
    await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values($1,$2,$3,$4,'FICTITIOUS object','{}')",[object,tenant,customer,`O-${object}`]);
    for(let i=0;i<2;i++)await db.query("insert into public.personnel(id,tenant_id,user_id,full_name) values($1,$2,$3,$4)",[people[i],tenant,[staff,colleague][i],`FICTITIOUS staff ${i}`]);
    await db.query("insert into public.work_orders(id,tenant_id,customer_id,object_id,work_order_number,discipline,status,lead_personnel_id,planned_start_at,planned_end_at,projected_start_at,projected_end_at,created_by) values($1,$2,$3,$4,$5,'Onderhoud','released',$6,now()-interval '1 hour',now()+interval '2 hours',now()-interval '1 hour',now()+interval '2 hours',$7)",[order,tenant,customer,object,`W-${order}`,people[0],manager]);
    for(let i=0;i<2;i++){
      await db.query("insert into public.work_order_assignments(id,tenant_id,work_order_id,personnel_id,status,planned_start_at,planned_end_at,projected_start_at,projected_end_at) values($1,$2,$3,$4,'in_progress',now()-interval '1 hour',now()+interval '2 hours',now()-interval '1 hour',now()+interval '2 hours')",[assignments[i],tenant,order,people[i]]);
      await db.query('insert into public.dispatches(tenant_id,work_order_id,assignment_id,dispatched_by,idempotency_key) values($1,$2,$3,$4,$5)',[tenant,order,assignments[i],manager,randomUUID()]);
    }
    await db.query("update public.work_orders set status='in_progress' where id=$1",[order]);
    for(let i=0;i<2;i++){
      await db.query("insert into public.report_entries(id,tenant_id,work_order_id,author_user_id,body) values($1,$2,$3,$4,'FICTITIOUS PRIVATE REPORT')",[entries[i],tenant,order,[staff,colleague][i]]);
      await db.query("insert into public.attachments(id,tenant_id,work_order_id,report_entry_id,uploaded_by,storage_bucket,storage_path,file_name,mime_type,size_bytes,sha256) values($1,$2,$3,$4,$5,'reports',$6,'FICTITIOUS.png','image/png',100,$7)",[files[i],tenant,order,entries[i],[staff,colleague][i],paths[i],'a'.repeat(64)]);
      const stored=await db.query("insert into storage.objects(bucket_id,name,owner_id,version,metadata) values('reports',$1,$2,'FICTITIOUS','{}') returning id",[paths[i],[staff,colleague][i]]);
      // Metadata-only policy fixture, not proof of a real antivirus result.
      await db.query("insert into private.file_scan_receipts(object_id,object_version,sha256,size_bytes,mime_type,engine,database_version,database_at) values($1,'FICTITIOUS',$2,100,'image/png','FICTITIOUS POLICY FIXTURE','FICTITIOUS',now())",[stored.rows[0].id,'a'.repeat(64)]);
    }

    await t.test('assignment exposes minimal customer projection, not CRM or all contacts',async()=>{
      assert.equal((await call('select billing_email from public.customers where id=$1',[customer])).length,0);
      assert.equal((await call('select email from public.customer_contacts where id=$1',[contact])).length,0);
      const data=await workspace();assert.equal(data.customers.length,1);assert.deepEqual(Object.keys(data.customers[0]).sort(),['id','name','tenant_id']);
      assert.equal((await call('select id from public.customers where id=$1',[customer],manager)).length,1);
      assert.equal((await call('select id from public.customers where id=$1',[foreignCustomer],manager)).length,0);
    });
    await t.test('own raw report remains available and changes only through the versioned command',async()=>{
      assert.deepEqual((await call('select id from public.report_entries where work_order_id=$1',[order])).map(r=>r.id),[entries[0]]);
      const data=await workspace();assert.deepEqual(data.reports.map(r=>r.id),[entries[0]]);assert.deepEqual(data.attachments.map(r=>r.id),[files[0]]);
      assert.equal((await call('select id from public.report_entries where work_order_id=$1',[order],manager)).length,2);
      assert.equal((await call("update public.report_entries set body='FICTITIOUS DIRECT EDIT' where id=$1 returning id",[entries[0]])).length,0);
      assert.equal((await call("update public.report_entries set body='FICTITIOUS FORGED EDIT' where id=$1 returning id",[entries[1]])).length,0);
      const version=(await call('select version from public.report_entries where id=$1',[entries[0]]))[0].version;
      const [updated]=await call("select public.staff_report_entry_command($1::uuid,'update',jsonb_build_object('reportEntryId',$2::uuid,'version',$3::integer,'body','FICTITIOUS EDIT'),$4::uuid) data",[tenant,entries[0],version,randomUUID()]);
      assert.equal(updated.data.row.body,'FICTITIOUS EDIT');
      assert.equal((await call('select body from public.report_entries where id=$1',[entries[0]]))[0].body,'FICTITIOUS EDIT');
    });
    await t.test('Storage blocks colleague read/update but permits own file',async()=>{
      assert.equal((await call("select id from storage.objects where bucket_id='reports' and name=$1",[paths[1]])).length,0);
      assert.equal((await call("update storage.objects set metadata=jsonb_build_object('syntheticAudit',true) where bucket_id='reports' and name=$1 returning id",[paths[1]])).length,0);
      assert.equal((await call("select id from storage.objects where bucket_id='reports' and name=$1",[paths[0]])).length,1);
      assert.equal((await call("update storage.objects set metadata=jsonb_build_object('syntheticAudit',true) where bucket_id='reports' and name=$1 returning id",[paths[0]])).length,0);
    });
    await t.test('shared work-order exceptions expose only the employee contribution and no colleague file or owner identity',async()=>{
      await db.query('savepoint own_exceptions');
      try{
        const own=randomUUID(),other=randomUUID();
        for(const [id,actor,file,body] of [[own,staff,files[1],'FICTITIOUS own exception'],[other,colleague,files[1],'FICTITIOUS COLLEAGUE EXCEPTION CANARY']])await db.query("insert into public.work_order_exceptions(id,tenant_id,work_order_id,kind,description,owner_user_id,attachment_id,created_by) values($1,$2,$3,'other',$4,$5,$6,$7)",[id,tenant,order,body,manager,file,actor]);
        const panel=(await call('select public.work_order_exceptions($1,$2) data',[tenant,order]))[0].data;
        assert.deepEqual(panel.items.map(x=>x.id),[own]);assert.equal(panel.items[0].ownerId,null);assert.equal(panel.items[0].attachmentId,null);
        assert.equal(JSON.stringify(panel).includes('CANARY'),false);assert.equal(panel.canManage,false);
        const managed=(await call('select public.work_order_exceptions($1,$2) data',[tenant,order],manager))[0].data;
        assert.equal(managed.items.length,2);assert(managed.items.every(x=>x.ownerId===manager));assert.equal(managed.canManage,true);
        await assert.rejects(call('select id from public.work_order_exceptions where work_order_id=$1',[order]),e=>e.code==='42501');
      }finally{await db.query('rollback to savepoint own_exceptions');await db.query('release savepoint own_exceptions');}
    });
    await t.test('exception creation cannot attach colleague proof or choose the planner on behalf of staff',async()=>{
      await db.query('savepoint exception_write');
      try{
        const input={mutationId:randomUUID(),orderId:order,action:'create',kind:'other',description:'FICTITIOUS own issue',attachmentId:files[0]};
        const save=(payload,actor=staff)=>call('select public.work_order_exception_command($1,$2) data',[tenant,payload],actor).then(r=>r[0].data);
        const created=await save(input);assert.deepEqual(await save(input),created);
        for(const attachmentId of [files[1],randomUUID()])await assert.rejects(save({...input,mutationId:randomUUID(),attachmentId}),e=>e.code==='42501');
        await assert.rejects(save({...input,mutationId:randomUUID(),ownerId:manager}),e=>e.code==='42501');
        const resolution={mutationId:randomUUID(),orderId:order,action:'resolve',id:created.id,version:created.version,resolution:'FICTITIOUS planner reply'};
        await assert.rejects(save(resolution),e=>e.code==='42501');
        await assert.rejects(save({...resolution,version:null},manager),e=>e.code==='40001');
        await save(resolution,manager);
        const own=(await call('select public.work_order_exceptions($1,$2) data',[tenant,order]))[0].data.items.find(x=>x.id===created.id);
        assert.equal(own.resolution,'FICTITIOUS planner reply');assert.equal(own.attachmentId,files[0]);
      }finally{await db.query('rollback to savepoint exception_write');await db.query('release savepoint exception_write');}
    });
    await t.test('exception reads fail after module, assignment or session revocation',async()=>{
      await db.query('savepoint exception_access');
      try{
        const read=()=>call('select public.work_order_exceptions($1,$2)',[tenant,order]);
        await read();await db.query('savepoint returned_exception_assignment');
        await db.query("update public.work_order_assignments set status='returned' where id=$1",[assignments[0]]);await assert.rejects(read(),e=>e.code==='42501');
        await db.query('rollback to savepoint returned_exception_assignment');await db.query('release savepoint returned_exception_assignment');
        await assert.rejects(call('select public.work_order_exceptions($1,$2)',[tenant,order],staff,randomUUID()),e=>e.code==='42501');
        await db.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',true)");
        await db.query("update public.tenant_settings set enabled_services=array['personeel','rapportage'] where tenant_id=$1",[tenant]);
        await db.query("select set_config('request.jwt.claims','{}',true)");
        await assert.rejects(read(),e=>e.code==='42501');
        await assert.rejects(call('select public.work_order_exceptions($1,$2)',[tenant,order],manager),e=>e.code==='42501');
      }finally{await db.query('rollback to savepoint exception_access');await db.query('release savepoint exception_access');}
    });
    await t.test('upload before metadata and failure cleanup retain authorization',async()=>{
      const path=`${tenant}/${order}/${entries[0]}/${randomUUID()}.png`;
      assert.equal((await call("select private.can_access_storage_object('reports',$1,true) allowed",[path]))[0].allowed,true);
      await assert.rejects(call("insert into storage.objects(bucket_id,name,owner_id) values('reports',$1,$2)",[path,staff]),e=>e.code==='42501');
      assert.equal((await call("select public.file_upload_allowed('reports',$1) allowed",[path]))[0].allowed,true);
      assert.equal((await call("select private.can_access_storage_object('reports',$1,true) allowed",[path]))[0].allowed,true);
      assert.equal((await call("select private.can_access_storage_object('reports',$1,true) allowed",[`${tenant}/${order}/not-a-uuid/file.png`]))[0].allowed,false);
    });
    await t.test('all document buckets require service publication and scan proof cannot be forged',async()=>{
      for(const bucket of ['branding','reports','signatures','invoices','personnel-documents','customer-documents','object-documents','commercial-documents']){
        const path=`${tenant}/${customer}/${randomUUID()}.png`;
        await assert.rejects(call('insert into storage.objects(bucket_id,name) values($1,$2)',[bucket,path],manager),e=>e.code==='42501');
      }
      await assert.rejects(call('select public.file_scan_state($1,$2)',['reports',paths[0]],manager),e=>e.code==='42501');
      await assert.rejects(call("select public.file_scan_attest('reports',$1,$2,'FORGED','{}')",[paths[0],randomUUID()],manager),e=>e.code==='42501');
      assert.equal((await call("select public.file_upload_allowed('branding',$1) allowed",[`${tenant}/logo.png`],manager))[0].allowed,true);
      assert.equal((await call("select public.file_upload_allowed('branding',$1) allowed",[`${foreignTenant}/logo.png`],manager))[0].allowed,false);
      assert.equal((await call("select public.file_upload_allowed('branding',$1) allowed",[`${tenant}/logo.png`],platform))[0].allowed,true);
      assert.equal((await call("select public.file_upload_allowed('personnel-documents',$1) allowed",[`${tenant}/${people[0]}/file.pdf`],platform))[0].allowed,false);
      assert.equal((await call("select public.file_upload_allowed('customer-documents',$1) allowed",[`${tenant}/${customer}/${'a'.repeat(32)}.pdf`],manager))[0].allowed,true);
      assert.equal((await call("select public.file_upload_allowed('customer-documents',$1) allowed",[`${tenant}/${foreignCustomer}/${'a'.repeat(32)}.pdf`],manager))[0].allowed,false);
      assert.equal((await call("select public.file_upload_allowed('object-documents',$1) allowed",[`${tenant}/${object}/file.pdf`],manager))[0].allowed,true);
      assert.equal((await call("select public.file_upload_allowed('object-documents',$1) allowed",[`${tenant}/${object}/file.pdf`]))[0].allowed,false);
    });
    await t.test('forged owned attachment cannot refer to colleague bytes',async()=>{
      await assert.rejects(call("insert into public.attachments(tenant_id,work_order_id,report_entry_id,uploaded_by,storage_bucket,storage_path,file_name,mime_type,size_bytes,sha256) values($1,$2,$3,$4,'reports',$5,'FORGED.png','image/png',100,$6)",[tenant,order,entries[0],staff,paths[1],'b'.repeat(64)]),e=>e.code==='42501');
      assert.equal((await call('select id from public.attachments where id=$1',[files[1]])).length,0);
    });
    await t.test('platform authority does not imply tenant authority',async()=>{
      assert.equal((await call('select private.is_platform_admin() allowed',[],platform))[0].allowed,true);
      assert.equal((await call('select id from public.customers where id=$1',[customer],platform)).length,0);
      assert.equal((await call('select private.has_role($1,array[\'tenant_admin\']::public.app_role[]) allowed',[tenant],platform))[0].allowed,false);
    });
    await t.test('personnel metadata cannot authorize a foreign tenant or different employee file',async()=>{
      const insert=(path,managed=false)=>call("insert into public.personnel_documents(tenant_id,personnel_id,title,document_type,storage_path,created_by,dossier_managed,dossier_status) values($1,$2,'FICTITIOUS contract','contract',$3,$4,$5,'stored') returning id",[tenant,people[0],path,manager,managed],manager);
      for(const managed of [false,true]){
        for(const path of [`${foreignTenant}/${people[0]}/contract.pdf`,`${tenant}/${people[1]}/contract.pdf`,`${tenant}/${people[0]}/../contract.pdf`,`${tenant}/${people[0]}/%2e%2e%2fcontract.pdf`,`${tenant}/${people[0]}//contract.pdf`,`${tenant}/${people[0]}/a\\b.pdf`,`${tenant}/${people[0]}/contract\n.pdf`])await assert.rejects(insert(path,managed),e=>e.code==='23514');
        for(const name of ['contract.pdf',`${randomUUID()}.pdf`,`${randomUUID().replaceAll('-','')}.pdf`])assert.equal((await insert(`${tenant}/${people[0]}/${name}`,managed)).length,1);
      }
      const [doc]=await insert(`${tenant}/${people[0]}/FICTITIOUS update.pdf`);
      await assert.rejects(call('update public.personnel_documents set storage_path=$1 where id=$2',[`${tenant}/${people[1]}/contract.pdf`,doc.id],manager),e=>e.code==='23514');
    });
    await t.test('invoice PDF attachment enforces exact tenant and invoice identity',async()=>{
      const invoice=randomUUID();
      await db.query("insert into public.invoices(id,tenant_id,customer_id,created_by,status,invoice_number,issued_on,due_on,customer_snapshot,branding_snapshot,lines_snapshot,finalized_at) values($1,$2,$3,$4,'final',$5,current_date,current_date,'{}','{}','[]',now())",[invoice,tenant,customer,manager,`FICTITIOUS-${invoice}`]);
      for(const path of [`${foreignTenant}/${invoice}/FICTITIOUS.pdf`,`${tenant}/${randomUUID()}/FICTITIOUS.pdf`,`${tenant}/${invoice}/../FICTITIOUS.pdf`,`${tenant}/${invoice}/%252fFICTITIOUS.pdf`])await assert.rejects(call('select public.attach_invoice_pdf($1,$2,$3)',[invoice,path,'a'.repeat(64)],manager),e=>e.code==='23514');
      const path=`${tenant}/${invoice}/FICTITIOUS-2026-001.pdf`;
      assert.equal((await call('select (public.attach_invoice_pdf($1,$2,$3)).pdf_storage_path path',[invoice,path,'a'.repeat(64)],manager))[0].path,path);
      await db.query('savepoint direct_invoice_writer');
      try{await assert.rejects(db.query('update public.invoices set pdf_storage_path=$1 where id=$2',[`${foreignTenant}/${invoice}/FICTITIOUS.pdf`,invoice]),e=>e.code==='23514');}
      finally{await db.query('rollback to savepoint direct_invoice_writer');await db.query('release savepoint direct_invoice_writer');}
    });
    await t.test('own completed draft report still supports versioned atomic soft-delete',async()=>{
      await db.query('savepoint completed_report');
      try {
        await db.query("update public.work_orders set status='completed',report_state='draft' where id=$1",[order]);
        assert.equal((await call('update public.attachments set deleted_at=now() where id=$1 returning id',[files[0]])).length,0);
        assert.equal((await call('update public.report_entries set deleted_at=now() where id=$1 returning id',[entries[0]])).length,0);
        const version=(await call('select version from public.report_entries where id=$1',[entries[0]]))[0].version;
        const [deleted]=await call("select public.staff_report_entry_command($1::uuid,'delete',jsonb_build_object('reportEntryId',$2::uuid,'version',$3::integer),$4::uuid) data",[tenant,entries[0],version,randomUUID()]);
        assert.equal(deleted.data.deleted,true);
        const deletedWorkspace=await workspace();
        assert.equal(deletedWorkspace.reports.some(entry=>entry.id===entries[0]),false);
        assert.equal(deletedWorkspace.attachments.some(attachment=>attachment.id===files[0]),false);
        assert.equal((await call('select id from public.report_entries where id=$1 and deleted_at is not null',[entries[0]],manager)).length,1);
        assert.equal((await call('select id from public.attachments where id=$1 and deleted_at is not null',[files[0]],manager)).length,1);
      }finally{await db.query('rollback to savepoint completed_report');await db.query('release savepoint completed_report');}
    });
    await t.test('shared tasks expose aggregate results, not colleague identities or notes',async()=>{
      await db.query('savepoint shared_tasks');
      try{
        const tasks=[randomUUID(),randomUUID()];
        for(let i=0;i<2;i++)await db.query("insert into public.work_order_tasks(id,tenant_id,work_order_id,task_code,task_name,duration_minutes,unit,unit_price_cents,vat_basis_points,assigned_personnel_id,added_by) values($1,$2,$3,$4,'FICTITIOUS task',30,'visit',100,2100,$5,$6)",[tasks[i],tenant,order,`FICTITIOUS-${i}`,i===0?people[1]:null,colleague]);
        for(const id of tasks){
          const version=(await db.query('select execution_version from public.work_order_tasks where id=$1',[id])).rows[0].execution_version;
          await call("select public.record_task_execution($1,$2,$3,'completed',1,'PRIVATE COLLEAGUE NOTE')",[tenant,id,version],colleague);
        }
        const projection=(await workspace()).workOrderTasks;
        assert.equal(projection.length,2);assert.equal(JSON.stringify(projection).includes(people[1]),false);assert.equal(JSON.stringify(projection).includes(colleague),false);assert.equal(JSON.stringify(projection).includes('PRIVATE COLLEAGUE NOTE'),false);
        await assert.rejects(call('select public.complete_work_order_task($1,true,null)',[tasks[1]],colleague),e=>e.code==='42501');
      }finally{await db.query('rollback to savepoint shared_tasks');await db.query('release savepoint shared_tasks');}
    });
    await t.test('both execution RPCs reject a task explicitly assigned to another employee',async()=>{
      await db.query('savepoint task_owner');
      try{
        const task=randomUUID();
        await db.query("insert into public.work_order_tasks(id,tenant_id,work_order_id,task_code,task_name,duration_minutes,unit,unit_price_cents,vat_basis_points,assigned_personnel_id) values($1,$2,$3,'FICTITIOUS','FICTITIOUS own task',30,'visit',100,2100,$4)",[task,tenant,order,people[1]]);
        await assert.rejects(call('select public.complete_work_order_task($1,true,null)',[task]),e=>e.code==='42501');
        const version=(await db.query('select execution_version from public.work_order_tasks where id=$1',[task])).rows[0].execution_version;
        await assert.rejects(call("select public.record_task_execution($1,$2,$3,'completed',1,'FICTITIOUS')",[tenant,task,version]),e=>e.code==='42501');
        await call("select public.record_task_execution($1,$2,$3,'completed',1,'FICTITIOUS own result')",[tenant,task,version],colleague);
        assert.equal((await db.query('select execution_state from public.work_order_tasks where id=$1',[task])).rows[0].execution_state,'completed');
      }finally{await db.query('rollback to savepoint task_owner');await db.query('release savepoint task_owner');}
    });
    await t.test('shared checklist conditions remain usable without exposing or overwriting another answer',async()=>{
      await db.query('savepoint shared_checklist');
      try{
        const template=randomUUID(),revision=randomUUID(),checklist=randomUUID();
        const definition={questions:[{id:'gate',label:'FICTITIOUS condition',type:'boolean',required:true},{id:'followup',label:'FICTITIOUS follow-up',type:'text',required:true,condition:{questionId:'gate',equals:true}},{id:'photo',label:'FICTITIOUS evidence',type:'photo'}]};
        await db.query("insert into public.work_order_templates(id,tenant_id,name,kind,created_by) values($1,$2,'FICTITIOUS shared checklist','checklist',$3)",[template,tenant,manager]);
        await db.query("insert into public.work_order_template_versions(id,tenant_id,template_id,version,state,definition,created_by) values($1,$2,$3,1,'published',$4,$5)",[revision,tenant,template,definition,manager]);
        await db.query("insert into public.work_order_checklists(id,tenant_id,work_order_id,template_revision_id,name,definition) values($1,$2,$3,$4,'FICTITIOUS checklist',$5)",[checklist,tenant,order,revision,definition]);
        const answer=(questionId,value,actor=staff,extra={})=>call('select public.answer_work_order_checklist($1,$2)',[tenant,{mutationId:randomUUID(),checklistId:checklist,questionId,value,version:0,notApplicable:false,reason:'',...extra}],actor);
        await answer('gate',true,colleague);
        const panel=(await call('select public.work_order_report($1) data',[order]))[0].data.checklists[0];
        assert.deepEqual(panel.answers,[]);
        assert.deepEqual(panel.questionStates.find(q=>q.questionId==='gate'),{questionId:'gate',visible:true,answered:true,editable:false});
        assert.deepEqual(panel.questionStates.find(q=>q.questionId==='followup'),{questionId:'followup',visible:true,answered:false,editable:true});
        assert.equal(JSON.stringify(panel).includes(colleague),false);
        await assert.rejects(answer('gate',false,staff,{version:1}),e=>e.code==='42501');
        await assert.rejects(answer('photo',files[1],staff,{attachmentId:files[1]}),e=>e.code==='42501');
        await answer('followup','FICTITIOUS own follow-up');
        assert.equal((await db.query('select private.work_order_checklist_ready($1) ready',[order])).rows[0].ready,true);
        await answer('gate',false,colleague,{version:1});
        const changed=(await call('select public.work_order_report($1) data',[order]))[0].data.checklists[0];
        assert.equal(changed.questionStates.find(q=>q.questionId==='followup').visible,false);
        assert.equal(changed.answers[0].value,'FICTITIOUS own follow-up');
        await answer('gate',true,manager,{version:2});
      }finally{await db.query('rollback to savepoint shared_checklist');await db.query('release savepoint shared_checklist');}
    });
    await t.test('report audiences cannot bypass private contributions or employee signatures',async()=>{
      await db.query('savepoint report_audience');
      try{
        const report=randomUUID(),template=randomUUID(),revision=randomUUID(),checklist=randomUUID(),portal=randomUUID(),employeeSignature=randomUUID(),customerSignature=randomUUID();
        const definition={questions:[{id:'own',label:'Own answer',type:'text',customerVisible:true},{id:'colleague',label:'Other answer',type:'text',customerVisible:true}]};
        await db.query("insert into public.work_order_templates(id,tenant_id,name,kind,created_by) values($1,$2,'FICTITIOUS audience checklist','checklist',$3)",[template,tenant,manager]);
        await db.query("insert into public.work_order_template_versions(id,tenant_id,template_id,version,state,definition,created_by) values($1,$2,$3,1,'published',$4,$5)",[revision,tenant,template,definition,manager]);
        await db.query("insert into public.work_order_checklists(id,tenant_id,work_order_id,template_revision_id,name,definition) values($1,$2,$3,$4,'FICTITIOUS checklist',$5)",[checklist,tenant,order,revision,definition]);
        for(let i=0;i<2;i++){
          await db.query('update public.report_entries set customer_visible=true,body=$1 where id=$2',[i===0?'OWN NOTE':'OTHER NOTE CANARY',entries[i]]);
          await db.query('update public.attachments set customer_visible=true where id=$1',[files[i]]);
          await db.query('insert into public.work_order_checklist_answers(tenant_id,checklist_id,question_id,value,updated_by) values($1,$2,$3,$4,$5)',[tenant,checklist,i===0?'own':'colleague',JSON.stringify(i===0?'OWN ANSWER':'OTHER ANSWER CANARY'),[staff,colleague][i]]);
        }
        const snapshot=(await db.query("select private.work_order_report_snapshot(w,'OTHER SUMMARY CANARY') data from public.work_orders w where id=$1",[order])).rows[0].data;
        await db.query("insert into public.work_order_report_versions(id,tenant_id,work_order_id,version,snapshot,content_hash,signature_policy,state,created_by,submission_key) values($1,$2,$3,1,$4,$5,'{\"mode\":\"required\",\"employeeRequired\":true}','approved',$6,$7)",[report,tenant,order,snapshot,'e'.repeat(64),colleague,randomUUID()]);
        for(const [id,kind,name] of [[employeeSignature,'employee','EMPLOYEE NAME CANARY'],[customerSignature,'customer','FICTITIOUS customer signer']])await db.query("insert into public.signatures(id,tenant_id,work_order_id,report_id,captured_by,captured_by_name,signer_name,signer_capacity,storage_path,sha256,report_version,content_hash,signature_kind,channel) values($1,$2,$3,$4,$5,'CAPTURED BY CANARY',$6,'FICTITIOUS capacity',$7,$8,1,$9,$10,'personnel_app_on_site')",[id,tenant,order,report,colleague,name,`${tenant}/${order}/${id}.png`,'f'.repeat(64),'e'.repeat(64),kind]);
        const panel=(await call('select public.work_order_report($1) data',[order]))[0].data;
        const own=panel.versions[0];
        assert.equal(JSON.stringify(panel).includes('CANARY'),false);assert.equal(JSON.stringify(panel).includes(colleague),false);
        assert.deepEqual(own.snapshot.notes.map(x=>x.id),[entries[0]]);assert.deepEqual(own.snapshot.attachments.map(x=>x.id),[files[0]]);
        assert.deepEqual(own.snapshot.checklists.map(x=>x.value),['OWN ANSWER']);assert.equal(own.projection,'own_contribution');
        assert.deepEqual(panel.checklists[0].answers.map(a=>a.questionId),['own']);
        assert.equal((await call('select id from public.work_order_report_versions where id=$1',[report])).length,0);
        assert.equal((await call('select id from public.signatures where report_id=$1',[report])).length,0);
        await assert.rejects(call('select public.work_order_report_file($1,$2)',[report,employeeSignature]),e=>e.code==='42501');
        await assert.rejects(call('select public.work_order_report_file($1,$2)',[report,files[1]]),e=>e.code==='42501');
        assert.equal((await call('select public.work_order_report_file($1,$2) data',[report,files[0]]))[0].data.sha256,'a'.repeat(64));
        assert.equal((await call('select public.work_order_report_file($1,$2) data',[report,employeeSignature],colleague))[0].data.bucket,'signatures');
        const original=(await call('select public.work_order_report_file($1,null) data',[report],manager))[0].data;
        assert.deepEqual(original.snapshot,snapshot);assert.equal(original.projection,'original');assert.equal(original.contentHash,'e'.repeat(64));
        await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[portal,`${portal}@release-security.test`]);
        await db.query('insert into auth.sessions(id,user_id) values($1,$1)',[portal]);sessions.set(portal,portal);
        await db.query('insert into public.object_customer_bindings(tenant_id,object_id,user_id,active,created_by) values($1,$2,$3,true,$4)',[tenant,object,portal,manager]);
        const client=(await call('select public.work_order_report_file($1,null) data',[report],portal))[0].data;
        assert.equal(client.projection,'customer_copy');assert.equal(client.employeeVerified,true);
        assert.deepEqual(client.snapshot,snapshot);assert.equal(client.signatures.length,1);assert.equal(client.signatures[0].kind,'customer');assert.equal(client.signatures[0].capturedBy,null);
        assert.equal(JSON.stringify(client).includes('EMPLOYEE NAME CANARY'),false);assert.equal(JSON.stringify(client).includes('CAPTURED BY CANARY'),false);
        await assert.rejects(call('select public.work_order_report_file($1,$2)',[report,employeeSignature],portal),e=>e.code==='42501');
        assert.equal((await call('select public.work_order_report_file($1,$2) data',[report,customerSignature],portal))[0].data.bucket,'signatures');
        // No speculative ownership reconstruction of historical versions.
        await db.query('delete from private.work_order_report_ownership where report_id=$1',[report]);
        const legacy=(await call('select public.work_order_report_file($1,null) data',[report]))[0].data;
        assert.deepEqual(legacy.snapshot.checklists,[]);assert.deepEqual(legacy.snapshot.notes,[]);
        assert.deepEqual((await db.query('select snapshot,content_hash from public.work_order_report_versions where id=$1',[report])).rows[0],{snapshot,content_hash:'e'.repeat(64)});
      }finally{await db.query('rollback to savepoint report_audience');await db.query('release savepoint report_audience');}
    });
    await t.test('missing, wrong and expired sessions fail closed',async()=>{
      for(const session of [null,randomUUID(),sessions.get(colleague)])assert.equal((await call('select id from public.customers where id=$1',[customer],manager,session)).length,0);
      await db.query("update auth.sessions set not_after=now()-interval '1 minute' where id=$1",[sessions.get(manager)]);
      assert.equal((await call('select id from public.customers where id=$1',[customer],manager)).length,0);
      await db.query('update auth.sessions set not_after=null where id=$1',[sessions.get(manager)]);
    });
    await t.test('returned assignment loses report access',async()=>{
      await db.query('savepoint returned_assignment');
      await db.query("update public.work_order_assignments set status='returned' where id=$1",[assignments[0]]);
      assert.equal((await call('select id from public.report_entries where id=$1',[entries[0]])).length,0);
      await db.query('rollback to savepoint returned_assignment');
      await db.query('release savepoint returned_assignment');
    });
    await t.test('revocation is effective without changing the existing JWT',async()=>{
      await db.query("update public.tenant_memberships set status='revoked' where tenant_id=$1 and user_id=$2",[tenant,staff]);
      assert.equal((await call('select id from public.report_entries where id=$1',[entries[0]])).length,0);
      assert.equal((await call("select id from storage.objects where bucket_id='reports' and name=$1",[paths[0]])).length,0);
      await assert.rejects(workspace(),e=>e.code==='42501');
      await db.query("update public.tenant_memberships set status='active' where tenant_id=$1 and user_id=$2",[tenant,staff]);
      await db.query('delete from auth.sessions where id=$1',[sessions.get(manager)]);
      assert.equal((await call('select id from public.customers where id=$1',[customer],manager)).length,0);
    });
    await t.test('inactive tenant closes staff data access',async()=>{
      await db.query("update public.tenants set status='suspended' where id=$1",[tenant]);
      assert.equal((await call('select id from public.report_entries where id=$1',[entries[0]])).length,0);
      await assert.rejects(workspace(),e=>e.code==='42501');
    });
  }finally {await db.query('rollback');await db.end();}
});
