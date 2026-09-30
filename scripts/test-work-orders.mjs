import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { workOrderTestDatabase } from "./work-order-test-target.mjs";

test("work-order dossier, immutable templates, checklist validation and list isolation", async (t) => {
  const db = await workOrderTestDatabase(); await db.query("begin");
  const tenant = randomUUID(), other = randomUUID(), manager = randomUUID(), planner = randomUUID(), staff = randomUUID(), hr = randomUUID(), customer = randomUUID(), customer2 = randomUUID(), object = randomUUID(), object2 = randomUUID(), catalog = randomUUID(), revision = randomUUID(), contact = randomUUID(), person = randomUUID(), person2 = randomUUID();
  const sessions = new Map([manager, planner, staff, hr].map(id => [id, randomUUID()]));
  const call = async (sql, args = [], actor = manager) => {
    await db.query("savepoint workorder_test");
    try { await db.query("set local role authenticated"); await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: actor, session_id: sessions.get(actor), role: "authenticated" })]); const r = await db.query(sql, args); await db.query("reset role"); await db.query("release savepoint workorder_test"); return r.rows; }
    catch (e) { await db.query("rollback to savepoint workorder_test"); await db.query("release savepoint workorder_test"); throw e; }
  };
  const save = (input, actor = manager) => call("select public.save_work_order($1,$2) r", [tenant, input], actor).then(r => r[0].r);
  const list = (filters = {}, actor = manager) => call("select public.work_order_list($1,$2) r", [tenant, filters], actor).then(r => r[0].r);
  const dossier = id => call("select public.work_order_dossier($1,$2) r", [tenant, id]).then(r => r[0].r);
  const version = async id => Number((await db.query("select version from public.work_orders where id=$1", [id])).rows[0].version);
  const template = async (command, input, commandId = randomUUID()) => {
    const current = input.revisionId && input.editVersion === undefined ? (await db.query("select edit_version from public.work_order_template_versions where id=$1", [input.revisionId])).rows[0]?.edit_version : input.editVersion;
    return call("select public.work_order_template_command($1,$2,$3,$4) r", [tenant, commandId, command, { ...input, ...(current ? { editVersion: Number(current) } : {}) }]).then(r => r[0].r);
  };
  const payload = overrides => ({ id: randomUUID(), version: 0, mutationId: randomUUID(), customerId: customer, objectId: object, title: "FICTITIOUS work-order", description: "Test scope", discipline: "Test", priority: "normal", labels: [], signatureMode: "inherit", employeeSignatureRequired: false, state: "unassigned", requiredPersonnel: 2, windowKind: "unknown", tasks: [{ revisionId: revision, quantity: 2, instructions: "Test instruction" }], contacts: [{ id: contact, roles: ["site", "handover"] }], assignments: [], ...overrides });
  let checklist, workTemplate, first;
  try {
    for (const [id, session] of sessions) { await db.query("insert into auth.users(id,email) values($1,$2)", [id, `${id}@workorders.test`]); await db.query("insert into auth.sessions(id,user_id,not_after) values($1,$2,now()+interval '1 day')", [session, id]); }
    for (const id of [tenant, other]) { await db.query("insert into public.tenants(id,slug,name) values($1,$2,'FICTITIOUS work-order tenant')", [id, `wo-${id}`]); await db.query("insert into public.tenant_settings(tenant_id,enabled_services) values($1,array['planning','rapportage','finance'])", [id]); }
    for (const [id, roles] of [[manager, ['tenant_admin','management','finance','staff']], [planner,['planner']], [staff,['staff']], [hr,['hr']]]) await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,$3,'active')", [tenant,id,roles]);
    for (const id of [customer, customer2]) await db.query("insert into public.customers(id,tenant_id,customer_number,name,status) values($1::uuid,$2,$1::uuid::text,'FICTITIOUS customer','active')", [id, tenant]);
    for (const [id, c] of [[object,customer],[object2,customer2]]) await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values($1::uuid,$2,$3,$1::uuid::text,'FICTITIOUS object','{\"street\":\"Teststraat 1\"}')", [id,tenant,c]);
    await db.query("insert into public.customer_contacts(id,tenant_id,customer_id,full_name,email) values($1,$2,$3,'FICTITIOUS contact','contact@workorders.test')",[contact,tenant,customer]);
    for(const [id,user] of [[person,staff],[person2,manager]]) await db.query("insert into public.personnel(id,tenant_id,user_id,employee_number,full_name,status) values($1::uuid,$2,$3,$1::uuid::text,'FICTITIOUS employee','active')",[id,tenant,user]);
    await db.query("insert into public.task_catalog(id,tenant_id,code,name,discipline) values($1,$2,'TEST','FICTITIOUS task','Test')",[catalog,tenant]);
    await db.query("insert into public.task_revisions(id,tenant_id,task_id,revision,duration_minutes,price_cents,vat_basis_points,unit) values($1,$2,$3,1,60,987654,2100,'task')",[revision,tenant,catalog]);
    await t.test("templates validate conditions, publish immutable versions, copy definitions only", async () => {
      const definition = { questions: [{ id:'check',section:'Oplevering',label:'Controle gereed',help:'',type:'boolean',options:[],unit:'',required:true,proof:false,allowNA:false,customerVisible:true }, { id:'note',section:'Oplevering',label:'Toelichting',help:'',type:'text',options:[],unit:'',required:true,proof:false,allowNA:true,customerVisible:true,condition:{questionId:'check',equals:false} }] };
      const input={name:'FICTITIOUS checklist',kind:'checklist',revisionId:null,definition}; checklist=await template('save',input); await template('publish',{...input,revisionId:checklist.id});
      await assert.rejects(call("update public.work_order_template_versions set definition='{}' where id=$1",[checklist.id]),e=>e.code==='42501');
      await db.query('savepoint immutable_template');await assert.rejects(db.query("update public.work_order_template_versions set definition='{}' where id=$1",[checklist.id]),e=>e.code==='23514');await db.query('rollback to savepoint immutable_template');
      const next=await template('save',{...input,revisionId:checklist.id,name:'FICTITIOUS checklist',definition:{...definition,questions:[...definition.questions,{...definition.questions[0],id:'another',label:'Nieuwe controle'}]}});assert.equal(next.version,2);
      await assert.rejects(template('save',{...input,definition:{questions:[{...definition.questions[0],type:'signature'}]}}),e=>e.code==='23514');
      workTemplate=await template('save',{name:'FICTITIOUS work template',kind:'work_order',revisionId:null,definition:{discipline:'Test',requiredPersonnel:2,signatureMode:'optional',tasks:[{revisionId:revision,quantity:2}],checklistRevisionIds:[checklist.id]}});
      await template('publish',{revisionId:workTemplate.id});
    });
    await t.test("creation persists one work order, tasks, contact roles and frozen empty checklist with strict retry",async()=>{
      const input=payload({templateRevisionId:workTemplate.id,checklistRevisionIds:[checklist.id]});first=await save(input);assert.equal(first.ok,true);assert.deepEqual(await save(input),first);
      const d=await dossier(first.id);assert.equal(d.tasks.length,1);assert.equal(d.tasks[0].quantity,2);assert.equal(d.contacts.length,1);assert.deepEqual(d.contacts[0].roles,['site','handover']);assert.equal(d.checklists[0].answers.length,0);assert.equal(d.order.templateRevisionId,workTemplate.id);assert.equal(d.order.planningState,'unassigned');
      await assert.rejects(save({...input,title:'Changed retry'}),e=>e.code==='23514');
      await assert.rejects(save(payload({objectId:object2})),e=>e.code==='23514');
      await assert.rejects(save({...input,mutationId:randomUUID(),version:1}),e=>e.code==='40001');
    });
    await t.test("server list searches all source data with stable pagination and scoped financial projections",async()=>{
      assert.equal((await list({q:'Teststraat'})).total,1);assert.equal((await list({view:'unassigned'})).counts.unassigned,1);
      const plannerOptions=(await call('select public.work_order_options($1) r',[tenant],planner))[0].r;assert.equal(plannerOptions.finance,false);assert(!JSON.stringify(plannerOptions).includes('987654'));assert(!('priceCents' in plannerOptions.tasks[0]));
      const d=(await call('select public.work_order_dossier($1,$2) r',[tenant,first.id],planner))[0].r;assert(!('unit_price_cents' in d.tasks[0]));assert(!('commercial_snapshot' in d.tasks[0]));
      await assert.rejects(list({},staff),e=>e.code==='42501');await assert.rejects(list({},hr),e=>e.code==='42501');await assert.rejects(call('select public.work_order_list($1,$2)',[other,{}]),e=>e.code==='42501');
      await assert.rejects(list({sort:'drop table work_orders'}),e=>e.code==='23514');
      for(let i=0;i<28;i++) await save(payload({title:`FICTITIOUS page ${i}`,contacts:[],tasks:[],state:'draft'}));
      const a=await list({page:1}),b=await list({page:2});assert.equal(a.total,29);assert.equal(a.rows.length,25);assert.equal(b.rows.length,4);assert(!a.rows.some(x=>b.rows.some(y=>x.id===y.id)));assert.deepEqual((await list({page:1})).rows.map(x=>x.id),a.rows.map(x=>x.id));
    });
    await t.test("planning warnings roll back entire creation and can be explicitly confirmed",async()=>{
      const p=payload({start:'2032-02-10T08:00:00Z',end:'2032-02-10T09:00:00Z',state:'tentative',assignments:[{personnelId:person,start:'2032-02-10T08:00:00Z',end:'2032-02-10T09:00:00Z'}]});
      const rejected=await save(p);assert.equal(rejected.ok,false);assert.equal(rejected.code,'confirmation');assert.equal((await db.query('select count(*) from public.work_orders where id=$1',[p.id])).rows[0].count,'0');
      const accepted=await save({...p,confirmedWarnings:rejected.warnings.map(w=>w.key)});assert.equal(accepted.ok,true);
    });
    await t.test("template draft concurrency rejects stale saves and publication",async()=>{
      const base={name:'FICTITIOUS concurrency',kind:'checklist',revisionId:null,definition:{questions:[]}};
      const created=await template('save',base), current={...base,revisionId:created.id,editVersion:1};
      await template('save',{...current,name:'FICTITIOUS changed'});
      await assert.rejects(template('save',current),e=>e.code==='40001');
      await assert.rejects(template('publish',current),e=>e.code==='40001');
    });
    await t.test("signature settings are tenant/object scoped; exception handling and notes are persistent and retry safe",async()=>{
      const settings=(await call('select public.work_order_signature_settings($1,null,$2) r',[tenant,{mode:'optional',employeeRequired:false,allowWaivers:true,waiverUsers:[manager]}]))[0].r;
      assert.equal(settings.mode,'optional');assert.equal(settings.allowWaivers,true);assert(settings.affectedDrafts>0);
      await assert.rejects(call('select public.work_order_signature_settings($1,null,$2)',[tenant,{mode:'none'}],planner),e=>e.code==='42501');
      await assert.rejects(call('select public.work_order_signature_settings($1,null,$2)',[tenant,{mode:'none',waiverUsers:[hr]}]),e=>e.code==='23514');
      const obj=(await call('select public.work_order_signature_settings($1,$2,$3) r',[tenant,object,{mode:'required'}]))[0].r;assert.equal(obj.mode,'required');
      const input={orderId:first.id,mutationId:randomUUID(),action:'create',kind:'no_access',description:'FICTITIOUS closed access',blocking:true};
      const command=async payload=>(await call('select public.work_order_exception_command($1,$2) r',[tenant,payload]))[0].r;
      const e=await command(input);assert.deepEqual(await command(input),e);
      const shown=(await call('select public.work_order_exceptions($1,$2) r',[tenant,first.id]))[0].r;assert.equal(shown.items.length,1);assert.equal(shown.items[0].state,'open');
      await command({orderId:first.id,mutationId:randomUUID(),action:'resolve',id:e.id,version:e.version,resolution:'FICTITIOUS access restored'});
      const note={orderId:first.id,mutationId:randomUUID(),body:'FICTITIOUS internal note',customerVisible:false};
      const communicate=async payload=>(await call('select public.work_order_communication($1,$2) r',[tenant,payload]))[0].r;
      assert.deepEqual(await communicate(note),await communicate(note));
      await assert.rejects(communicate({...note,body:'Changed retry'}),e=>e.code==='23514');
      assert.equal((await dossier(first.id)).reports.filter(r=>r.body===note.body).length,1);
      await assert.rejects(communicate({orderId:first.id,mutationId:randomUUID(),attachment:{path:'another-tenant/file.pdf',mime:'application/pdf',name:'fixture.pdf',size:10,sha256:'a'.repeat(64)}}),e=>e.code==='23514');
      await call('select public.work_order_signature_settings($1,null,$2)',[tenant,{mode:'none',employeeRequired:false,allowWaivers:false,waiverUsers:[]}]);
      await call('select public.work_order_signature_settings($1,$2,$3)',[tenant,object,{mode:'inherit'}]);
    });
    await t.test("published work is dispatched per employee; checklist required/conditional answers and CAS are enforced",async()=>{
      const p=payload({checklistRevisionIds:[checklist.id],start:'2032-02-11T08:00:00Z',end:'2032-02-11T10:00:00Z',state:'tentative',assignments:[{personnelId:person,start:'2032-02-11T08:00:00Z',end:'2032-02-11T09:00:00Z'},{personnelId:person2,start:'2032-02-11T09:00:00Z',end:'2032-02-11T10:00:00Z'}]});
      const saved=await save(p);assert.equal(saved.ok,true);
      await call('select public.mutate_work_order($1,$2)',[tenant,{orderId:p.id,version:await version(p.id),mutationId:randomUUID(),action:'publish'}]);
      assert.equal((await db.query('select count(*) from public.dispatches where work_order_id=$1 and revoked_at is null',[p.id])).rows[0].count,'2');
      const rows=(await db.query('select projected_start_at from public.work_order_assignments where work_order_id=$1 order by projected_start_at',[p.id])).rows;assert.notEqual(rows[0].projected_start_at.toISOString(),rows[1].projected_start_at.toISOString());
      await db.query("update public.work_orders set status='in_progress',actual_start_at=clock_timestamp() where id=$1",[p.id]);
      const c=(await dossier(p.id)).checklists[0];assert.equal((await db.query('select private.work_order_checklist_ready($1) r',[p.id])).rows[0].r,false);
      const answer={checklistId:c.id,questionId:'check',value:false,notApplicable:false,reason:'',attachmentId:null,version:0,mutationId:randomUUID()};
      await call('select public.answer_work_order_checklist($1,$2)',[tenant,answer],staff);assert.equal((await db.query('select private.work_order_checklist_ready($1) r',[p.id])).rows[0].r,false);
      await assert.rejects(call('select public.answer_work_order_checklist($1,$2)',[tenant,{...answer,mutationId:randomUUID(),value:true}],staff),e=>e.code==='40001');
      await assert.rejects(call('select public.answer_work_order_checklist($1,$2)',[tenant,{...answer,questionId:'note',notApplicable:true,reason:'',mutationId:randomUUID()}],staff),e=>e.code==='23514');
      await call('select public.answer_work_order_checklist($1,$2)',[tenant,{...answer,questionId:'note',value:null,notApplicable:true,reason:'Geen bijzonderheid tijdens test',mutationId:randomUUID()}],staff);assert.equal((await db.query('select private.work_order_checklist_ready($1) r',[p.id])).rows[0].r,true);
    });
  } finally { await db.query('rollback'); await db.end(); }
});
