import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {submitFixtureReport} from './work-order-report-fixture.mjs';
import {workOrderTestDatabase} from './work-order-test-target.mjs';

const fixture=JSON.parse(readFileSync(new URL('../tests/fixtures/task-controls/scenarios.json',import.meta.url),'utf8'));
test('task-scoped controls: stored scope, exact budgets, immutable identities, auth, retries and normative evidence',async t=>{
 const db=await workOrderTestDatabase();await db.query('begin');
 const tenant=randomUUID(),other=randomUUID(),manager=randomUUID(),staff=randomUUID(),peer=randomUUID(),customer=randomUUID(),object=randomUUID(),person=randomUUID(),colleague=randomUUID();
 const sessions=new Map([manager,staff,peer].map(id=>[id,randomUUID()]));
 const call=async(name,args,actor=manager)=>{await db.query('savepoint task_control_test');try{await db.query('set local role authenticated');await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:actor,session_id:sessions.get(actor),role:'authenticated'})]);const r=await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) r`,args);await db.query('reset role');await db.query('release savepoint task_control_test');return r.rows[0].r;}catch(e){await db.query('rollback to savepoint task_control_test');await db.query('release savepoint task_control_test');throw e;}};
 const cmd=(input,actor)=>call('task_control_command',[tenant,{mutationId:randomUUID(),...input}],actor);
 const catalogue=()=>call('task_catalogue',[tenant]);
 const taskSave=(input)=>call('task_catalogue_command',[tenant,{mutationId:randomUUID(),...input}]);
 const config=(mode,extra={})=>({mode,normBasis:1,checklistMode:'none',comparisonKey:randomUUID(),itemTypes:[],variants:[],identification:'optional',photoPerTarget:false,findingOnDeviation:true,allowExtraTargets:true,allowUnknownItems:false,qualifications:[],...extra});
 let category,checklist,service,serviceOrder,cleaningOrder;const items=[];const tasks=new Map();
 const task=async(name,minutes,unit,c)=>{const saved=await taskSave({action:'task_save',categoryId:category.id,name,discipline:'FICTITIOUS',duration:minutes,unit,executionConfig:c,priceCents:1000,vatBasisPoints:2100,extraWork:false,requiresPhoto:false,requiresSignature:false});const row=(await catalogue()).tasks.find(x=>x.id===saved.id);tasks.set(name,row);return row;};
 const order=async(lines,date='2026-10-19')=>call('save_work_order',[tenant,{id:randomUUID(),version:0,mutationId:randomUUID(),customerId:customer,objectId:object,title:'FICTITIOUS controls order',discipline:'FICTITIOUS',signatureMode:'inherit',employeeSignatureRequired:false,state:'unassigned',requiredPersonnel:1,windowKind:'unknown',requestedDate:date,tasks:lines.map(line=>({instructions:'',...line})),assignments:[],contacts:[],checklistRevisionIds:[]}]);
 const dossier=(id)=>call('work_order_dossier',[tenant,id]);
 try{
  for(const [id,session]of sessions){await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,`${id}@controls.test`]);await db.query("insert into auth.sessions(id,user_id,not_after) values($1,$2,now()+interval '1 day')",[session,id]);}
  for(const id of [tenant,other]){await db.query("insert into public.tenants(id,slug,name) values($1,$2,'FICTITIOUS controls')",[id,`tc-${id}`]);await db.query("insert into public.tenant_settings(tenant_id,enabled_services) values($1,array['planning','personeel','rapportage','finance'])",[id]);}
  for(const id of [tenant,other])await db.query('insert into public.tenant_branding(tenant_id) values($1)',[id]);
  for(const [id,roles]of [[manager,['tenant_admin','management','finance']],[staff,['staff']],[peer,['staff']]])await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,$3,'active')",[tenant,id,roles]);
  await db.query("insert into public.customers(id,tenant_id,customer_number,name) values($1,$2,$3,'FICTITIOUS customer')",[customer,tenant,customer]);
  await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values($1,$2,$3,$4,'FICTITIOUS location','{}')",[object,tenant,customer,object]);
  for(const [id,user]of [[person,staff],[colleague,peer]])await db.query("insert into public.personnel(id,tenant_id,user_id,full_name,status) values($1,$2,$3,'FICTITIOUS employee','active')",[id,tenant,user]);
  category=await taskSave({action:'category_save',name:'FICTITIOUS controls',prefix:'CTRL'});
  const definition={questions:[{id:'identified',section:'Controle',label:'Identiteit gecontroleerd',help:'',type:'check',options:[],unit:'',required:true,proof:false,allowNA:false,customerVisible:true}]};
  checklist=await call('work_order_template_command',[tenant,randomUUID(),'save',{name:'FICTITIOUS item inspection',kind:'checklist',revisionId:null,definition}]);
  await call('work_order_template_command',[tenant,randomUUID(),'publish',{revisionId:checklist.id,editVersion:1}]);
  await t.test('catalogue config survives a legacy description-only payload; the old revision stays immutable',async()=>{
   service=await task('FICTITIOUS inspection',30,'item',config('items',{checklistMode:'target',checklistRevisionId:checklist.id}));
   const before=service.executionConfig;
   await taskSave({action:'task_save',id:service.id,version:service.version,name:service.name,description:'Updated description',discipline:service.discipline,duration:30,priceCents:1000,vatBasisPoints:2100});
   service=(await catalogue()).tasks.find(x=>x.id===service.id);assert.deepEqual(service.executionConfig,before);assert.equal(service.unit,'item');
   const old=(await db.query('select execution_config from public.task_revisions where id=$1',[tasks.get('FICTITIOUS inspection').revisionId])).rows[0];assert.deepEqual(old.execution_config,before);
  });
  await t.test('register 30 stable items; list/selection is paginated and duplicate serials need an explicit review',async()=>{
   for(let n=0;n<30;n++){items.push(await cmd({action:'item_save',customerId:customer,objectId:object,name:`FICTITIOUS device ${n+1}`,itemType:'device',model:'Model A',brand:'',serialNumber:`FICT-${n}`,duplicatesReviewed:false}));}
   const page=await call('task_item_context',[tenant,object,'',0]);assert.equal(page.items.length,25);assert.equal(page.total,30);assert.equal((await call('task_item_context',[tenant,object,'',25])).items.length,5);
   await assert.rejects(cmd({action:'item_save',customerId:customer,objectId:object,name:'Duplicate serial',itemType:'device',model:'Model A',brand:'',serialNumber:'FICT-0',duplicatesReviewed:false}),e=>e.code==='23514');
  });
  await t.test('eight devices use eight independent checklists and a server-calculated 270 minute budget',async()=>{
   const prepare=await task('FICTITIOUS prepare',20,'task',config('once')),finish=await task('FICTITIOUS finish',10,'task',config('once'));
   serviceOrder=await order([{revisionId:prepare.revisionId,quantity:1},{revisionId:service.revisionId,quantity:999,targets:items.slice(0,8).map(i=>({itemId:i.id}))},{revisionId:finish.revisionId,quantity:1}]);
   const d=await dossier(serviceOrder.id);assert.equal(d.order.durationMinutes,270);const row=d.tasks.find(x=>x.task_revision_id===service.revisionId);assert.equal(row.quantity,8);assert.equal(Number(row.original_budget_minutes),240);
   const context=await call('task_control_context',[tenant,row.id,0,'']);assert.equal(context.targets.length,8);assert.equal(context.checklists.length,8);assert.equal(new Set(context.checklists.map(x=>x.id)).size,8);serviceOrder.taskId=row.id;
  });
  await t.test('extras update current scope and budget; original scope and retry identity remain intact',async()=>{
   let c=await call('task_control_context',[tenant,serviceOrder.taskId,0,'']);await cmd({action:'targets_add',taskId:c.taskId,version:c.version,targets:[{itemId:items[8].id}],reason:'FICTITIOUS one additional device'});assert.equal((await dossier(serviceOrder.id)).order.durationMinutes,300);c=await call('task_control_context',[tenant,serviceOrder.taskId,0,'']);const input={action:'targets_add',taskId:c.taskId,version:c.version,targets:items.slice(8,10).map(i=>({itemId:i.id})),reason:'FICTITIOUS approved operational scope',mutationId:randomUUID()};
   const result=await cmd(input);assert.deepEqual(await cmd(input),result);await assert.rejects(cmd({...input,reason:'Different payload'}),e=>e.code==='23514');
   const d=await dossier(serviceOrder.id);assert.equal(d.order.durationMinutes,330);const row=d.tasks.find(x=>x.id===c.taskId);assert.equal(row.original_quantity,8);assert.equal(row.quantity,10);assert.equal(Number(row.original_budget_minutes),240);assert.equal(Number(row.current_budget_minutes),300);assert.equal(row.unit_price_cents,1000);
  });
  await t.test('a quantity task has one final checklist; three rooms have independent checklists and exact 135 minute total',async()=>{
   const floor=await task('FICTITIOUS floor',20,'square_metre',config('quantity',{normBasis:100,checklistMode:'task',checklistRevisionId:checklist.id}));const rooms=await task('FICTITIOUS rooms',15,'room',config('rooms',{checklistMode:'target',checklistRevisionId:checklist.id}));
   const nodes=[];for(let n=0;n<3;n++)nodes.push((await db.query("insert into public.object_nodes(tenant_id,object_id,name,kind) values($1,$2,$3,'room') returning id",[tenant,object,`FICTITIOUS room ${n}`])).rows[0].id);
   cleaningOrder=await order([{revisionId:floor.revisionId,quantity:450},{revisionId:rooms.revisionId,quantity:3,targets:nodes.map(nodeId=>({nodeId}))}]);const d=await dossier(cleaningOrder.id);assert.equal(d.order.durationMinutes,135);assert.equal(d.tasks[0].duration_minutes,0.2);assert.equal(d.checklists.length,0);
   const counts=(await db.query('select task_id,count(*)::int from public.work_order_checklists where work_order_id=$1 group by task_id order by count(*)',[cleaningOrder.id])).rows;assert.deepEqual(counts.map(x=>x.count),[1,3]);
  });
  await t.test('more than 20 target checklists keep the separate bon-wide limit intact',async()=>{
   const saved=await order([{revisionId:service.revisionId,quantity:30,targets:items.map(i=>({itemId:i.id}))}]);const row=(await dossier(saved.id)).tasks[0];const first=await call('task_control_context',[tenant,row.id,0,'']);const last=await call('task_control_context',[tenant,row.id,25,'']);assert.equal(first.targets.length,25);assert.equal(first.checklists.length,25);assert.equal(last.targets.length,5);assert.equal(last.checklists.length,5);
  });
  await t.test('explicit model variants reject unknown bindings and freeze their own checklist and norm',async()=>{
   const configured=await task('FICTITIOUS model-bound check',30,'item',config('items',{checklistMode:'target',checklistRevisionId:checklist.id,variants:[{key:'model-a',name:'Model A',model:'Model A',itemType:'device',minutes:40,basis:1,comparisonKey:'variant-model-a',checklistRevisionId:checklist.id}]}));
   await assert.rejects(order([{revisionId:configured.revisionId,quantity:1,targets:[{itemId:items[0].id}]}]),e=>e.code==='23514');
   const good=await order([{revisionId:configured.revisionId,quantity:1,targets:[{itemId:items[0].id,variantKey:'model-a'}]}]);const detail=await dossier(good.id);assert.equal(detail.order.durationMinutes,40);const c=await call('task_control_context',[tenant,detail.tasks[0].id,0,'']);assert.equal(c.targets[0].snapshot.norm.variantKey,'model-a');assert.equal(c.checklists[0].revisionId,checklist.id);
  });
  await t.test('scan chooses between independent tasks on one item, reads no foreign tenant and creates no writes',async()=>{
   const repair=await task('FICTITIOUS separate repair',10,'item',config('items'));
   const created=await order([{revisionId:service.revisionId,quantity:1,targets:[{itemId:items[0].id}]},{revisionId:repair.revisionId,quantity:1,targets:[{itemId:items[0].id}]}]);
   const found=await call('task_scan_context',[tenant,created.id,items[0].id]);assert.equal(found.length,2);assert.equal(new Set(found.map(x=>x.taskId)).size,2);assert.deepEqual(await call('task_scan_context',[tenant,created.id,items[0].id]),found);
   assert.deepEqual(await call('task_scan_context',[tenant,created.id,randomUUID()]),[]);await assert.rejects(call('task_scan_context',[other,created.id,items[0].id]),e=>e.code==='42501');await assert.rejects(call('task_scan_context',[tenant,created.id,items[0].id],staff),e=>e.code==='42501');
   assert.equal((await db.query('select count(*)::int n from private.task_targets where work_order_id=$1',[created.id])).rows[0].n,2);
  });
  await t.test('a split transfers the selected stable goals exactly once and preserves original snapshots and empty new checklists',async()=>{
   const created=await order([{revisionId:service.revisionId,quantity:3,targets:items.slice(0,3).map(i=>({itemId:i.id}))}]);let detail=await dossier(created.id);const taskId=detail.tasks[0].id,c=await call('task_control_context',[tenant,taskId,0,'']);
   const input={orderId:created.id,version:detail.order.version,title:'FICTITIOUS concrete remainder',instructions:'',tasks:[{id:taskId,quantity:1,targetIds:[c.targets[0].id]}],reason:'remainder',copyTemplate:true,copyContacts:true,copyPersonnel:false};
   await assert.rejects(call('work_order_related_command',[tenant,randomUUID(),'split',{...input,tasks:[{id:taskId,quantity:1}]}]),e=>e.code==='23514');
   const key=randomUUID(),child=await call('work_order_related_command',[tenant,key,'split',input]);assert.deepEqual(await call('work_order_related_command',[tenant,key,'split',input]),child);
   detail=await dossier(created.id);assert.equal(detail.tasks[0].quantity,3);assert.equal(detail.tasks[0].transferred_quantity,1);assert.equal(Number(detail.tasks[0].original_budget_minutes),90);assert.equal(Number(detail.tasks[0].current_budget_minutes),60);
   const next=(await dossier(child.id)).tasks[0],goals=await call('task_control_context',[tenant,next.id,0,'']);assert.equal(goals.counts.total,1);assert.equal(goals.checklists.length,1);assert.deepEqual(goals.targets[0].snapshot,c.targets[0].snapshot);assert.equal(goals.checklists[0].answers.length,0);
   assert.equal((await db.query('select transferred_to_task_id from private.task_targets where id=$1',[c.targets[0].id])).rows[0].transferred_to_task_id,next.id);assert.equal((await call('task_control_context',[tenant,taskId,0,''])).counts.total,2);
   const remaining=await call('task_control_context',[tenant,taskId,0,'']);await cmd({action:'target_withdraw',taskId,targetId:remaining.targets[0].id,version:remaining.targets[0].version,reason:'FICTITIOUS scope explicitly withdrawn'});const withdrawn=(await dossier(created.id)).tasks[0];assert.equal(withdrawn.withdrawn_quantity,1);assert.equal(withdrawn.original_quantity,3);assert.equal(Number(withdrawn.current_budget_minutes),30);
  });
  await t.test('independent weekly and half-yearly cycles resolve the same stable item into only their selected task',async()=>{
   const clean=await task('FICTITIOUS weekly item clean',5,'item',config('items'));
   const created=await order([{revisionId:service.revisionId,quantity:1,targets:[{itemId:items[0].id}]},{revisionId:clean.revisionId,quantity:1,targets:[{itemId:items[0].id}]}]);const detail=await dossier(created.id),today=(await db.query("select (clock_timestamp() at time zone 'Europe/Amsterdam')::date::text business_day")).rows[0].business_day;
   const day=new Date(today+'T12:00:00Z'),weekday=(day.getUTCDay()+6)%7+1;
   const rule={startsOn:today,endsOn:'',frequency:'weekly',interval:1,weekdays:[weekday],monthlyMode:'date',monthDay:day.getUTCDate(),monthPosition:1,monthWeekday:weekday,startsAt:'08:00',endsAt:'09:00',requiredPersonnel:1};
   for(const [index,definition] of [rule,{...rule,frequency:'monthly',interval:6}].entries()){
    const selected=detail.tasks.find(t=>t.task_revision_id===(index===0?clean.revisionId:service.revisionId));
    const series=await call('work_order_series_command',[tenant,randomUUID(),'create',{orderId:created.id,version:detail.order.version,title:'FICTITIOUS independent cycle',definition:{...definition,taskIds:[selected.id]}}]);
    const generated=await call('work_order_series_command',[tenant,randomUUID(),'generate',{seriesId:series.id,version:1}]);assert(generated.created>=1);assert.equal((await call('work_order_series_command',[tenant,randomUUID(),'generate',{seriesId:series.id,version:1}])).created,0);
    const records=(await db.query('select task.task_revision_id,target.item_id from public.work_order_occurrences occurrence join public.work_order_tasks task on task.work_order_id=occurrence.work_order_id join private.task_targets target on target.task_id=task.id where occurrence.series_id=$1',[series.id])).rows;assert(records.length>=1);assert(records.every(r=>r.task_revision_id===selected.task_revision_id&&r.item_id===items[0].id));
   }
  });
  await t.test('quantity progress stores 300 of 450 square metres and keeps the final checklist separate',async()=>{
   const detail=await dossier(cleaningOrder.id),floor=detail.tasks.find(t=>t.unit==='square_metre');await db.query("update public.work_orders set status='in_progress',actual_start_at=now(),planned_start_at=now(),planned_end_at=now()+interval '4 hours',projected_start_at=now(),projected_end_at=now()+interval '4 hours' where id=$1",[cleaningOrder.id]);
   await call('record_task_execution',[tenant,floor.id,floor.execution_version,'partial',300,'FICTITIOUS 300 square metres completed']);const context=await call('task_control_context',[tenant,floor.id,0,'']);assert.equal(context.executedQuantity,300);assert.equal(context.remainingQuantity,450);assert.equal(context.counts.total,0);assert.equal(context.checklists.length,1);
   await assert.rejects(call('record_task_execution',[tenant,floor.id,context.version,'completed',450,'FICTITIOUS missing final checklist']),e=>e.code==='23514');
  });
  await t.test('completion validates exact instance, version, outcome and required answers; closed answers cannot be erased',async()=>{
   await db.query("update public.work_orders set status='in_progress',actual_start_at=now(),planned_start_at=now(),planned_end_at=now()+interval '6 hours',projected_start_at=now(),projected_end_at=now()+interval '6 hours' where id=$1",[serviceOrder.id]);
   const c=await call('task_control_context',[tenant,serviceOrder.taskId,0,'']);const target=c.targets[0];const checklist=c.checklists.find(x=>x.targetExecutionId===target.executionId);
   const payload={action:'target_result',taskId:c.taskId,targetId:target.id,version:target.version,state:'completed',outcome:'rejected',followup:'review',finding:'FICTITIOUS failed inspection',identified:true,customerVisible:false};
   await assert.rejects(cmd(payload),e=>e.code==='23514');
   const answer={checklistId:checklist.id,questionId:'identified',version:0,value:true,notApplicable:false,reason:'',attachmentId:null,mutationId:randomUUID()};await call('answer_work_order_checklist',[tenant,answer]);
   const r=await cmd(payload);const fresh=await call('task_control_context',[tenant,c.taskId,0,'']);assert.equal(fresh.counts.completed,1);assert.equal(fresh.counts.deviations,1);assert.equal((await dossier(serviceOrder.id)).tasks.find(x=>x.id===c.taskId).executed_quantity,1);
   await assert.rejects(cmd({...payload,mutationId:randomUUID()}),e=>e.code==='40001');
   await assert.rejects(call('answer_work_order_checklist',[tenant,{...answer,mutationId:randomUUID(),version:1,value:false}]),e=>e.code==='23514');assert.equal(r.ok,true);
   const next=fresh.targets[1];await cmd({...payload,targetId:next.id,version:next.version,state:'not_done',reason:'FICTITIOUS inaccessible device'});const after=await call('task_control_context',[tenant,c.taskId,0,'']);assert.equal(after.counts.completed,1);assert.equal(after.counts.exceptions,1);
  });
  await t.test('conditional checklist requirements, explicit technical limits and mandatory target proof are enforced by RPCs',async()=>{
   const base={section:'Controle',help:'',options:[],unit:'',required:true,proof:false,allowNA:false,customerVisible:true};
   const check=await call('work_order_template_command',[tenant,randomUUID(),'save',{revisionId:null,name:'FICTITIOUS conditional technical check',kind:'checklist',definition:{questions:[{...base,id:'access',label:'Veilige toegang?',type:'boolean',outcomeRule:{equals:true}},{...base,id:'measurement',label:'Meetwaarde',type:'number',condition:{questionId:'access',equals:true},outcomeRule:{minimum:5,maximum:10}}]}}]);await call('work_order_template_command',[tenant,randomUUID(),'publish',{revisionId:check.id,editVersion:1}]);
   const configured=await task('FICTITIOUS limits inspection',10,'item',config('items',{checklistMode:'target',checklistRevisionId:check.id})),created=await order([{revisionId:configured.revisionId,quantity:1,targets:[{itemId:items[0].id}]}]),row=(await dossier(created.id)).tasks[0];await db.query("update public.work_orders set status='in_progress',actual_start_at=now(),planned_start_at=now(),planned_end_at=now()+interval '1 hour',projected_start_at=now(),projected_end_at=now()+interval '1 hour' where id=$1",[created.id]);
   const context=await call('task_control_context',[tenant,row.id,0,'']),target=context.targets[0],checklistId=context.checklists[0].id;
   const result={action:'target_result',taskId:row.id,targetId:target.id,version:target.version,state:'completed',outcome:'pass',followup:'none',finding:'',reason:'',identified:true,customerVisible:false};
   await call('answer_work_order_checklist',[tenant,{mutationId:randomUUID(),checklistId,questionId:'access',version:0,value:true,notApplicable:false,reason:'',attachmentId:null}]);await assert.rejects(cmd(result),e=>e.code==='23514');
   await call('answer_work_order_checklist',[tenant,{mutationId:randomUUID(),checklistId,questionId:'measurement',version:0,value:4,notApplicable:false,reason:'',attachmentId:null}]);await assert.rejects(cmd(result),e=>e.code==='23514'&&e.message.includes('grens'));
   await cmd({...result,outcome:'deviation',finding:'FICTITIOUS measurement below the technical limit',followup:'review'});
   const proof=await task('FICTITIOUS target photo',10,'item',config('items',{photoPerTarget:true})),photoOrder=await order([{revisionId:proof.revisionId,quantity:1,targets:[{itemId:items[0].id}]}]),photoRow=(await dossier(photoOrder.id)).tasks[0];await db.query("update public.work_orders set status='in_progress',actual_start_at=now(),planned_start_at=now(),planned_end_at=now()+interval '1 hour',projected_start_at=now(),projected_end_at=now()+interval '1 hour' where id=$1",[photoOrder.id]);const photoContext=await call('task_control_context',[tenant,photoRow.id,0,'']);await assert.rejects(cmd({...result,taskId:photoRow.id,targetId:photoContext.targets[0].id,version:1}),e=>e.code==='23514'&&e.message.includes('bewijsfoto'));
  });
  await t.test('tenant and role boundaries reject direct RPCs and direct table access',async()=>{
   await assert.rejects(call('task_control_context',[other,serviceOrder.taskId,0,'']),e=>e.code==='42501');
   await assert.rejects(call('task_item_context',[tenant,object,'',0],staff),e=>e.code==='42501');
   await assert.rejects(cmd({action:'targets_add',taskId:serviceOrder.taskId,version:1,targets:[{itemId:items[11].id}],reason:'Invalid actor'},staff),e=>e.code==='42501');
   await db.query('savepoint projection_guard');await db.query('set local role authenticated');await assert.rejects(db.query('update public.work_order_tasks set commercially_approved_quantity=999 where id=$1',[serviceOrder.taskId]),e=>e.code==='42501');await db.query('rollback to savepoint projection_guard');await db.query('release savepoint projection_guard');
   await db.query('savepoint direct_guard');await db.query('set local role authenticated');await assert.rejects(db.query('select * from private.task_targets'),e=>e.code==='42501');await db.query('rollback to savepoint direct_guard');await db.query('release savepoint direct_guard');
  });
  await t.test('visit sessions close personal days without completing the assignment or stopping colleagues; allocations follow source hours',async()=>{
   const assignments=new Map();
   for(const p of [person,colleague]){
    const assignment=randomUUID();assignments.set(p,assignment);
    await db.query("insert into public.work_order_assignments(id,tenant_id,work_order_id,personnel_id,status,planned_start_at,planned_end_at,projected_start_at,projected_end_at,actual_start_at) values($1,$2,$3,$4,'in_progress',now(),now()+interval '6 hours',now(),now()+interval '6 hours',now())",[assignment,tenant,serviceOrder.id,p]);
    await db.query('insert into public.dispatches(tenant_id,work_order_id,assignment_id,dispatched_by,idempotency_key) values($1,$2,$3,$4,$5)',[tenant,serviceOrder.id,assignment,manager,randomUUID()]);
   }
   const window=(await db.query("select clock_timestamp()::text start,(clock_timestamp()+interval '2 hours')::text finish")).rows[0];
   const version=Number((await db.query('select version from public.work_orders where id=$1',[serviceOrder.id])).rows[0].version);
   const visit=await call('task_visit_command',[tenant,{action:'plan',acknowledgeWarnings:true,overrideReason:'FICTITIOUS availability reviewed',orderId:serviceOrder.id,version,start:window.start,end:window.finish,personnelIds:[person,colleague],mutationId:randomUUID()}]);
   const visitCmd=(action,actor,extra={})=>call('task_visit_command',[tenant,{action,orderId:serviceOrder.id,visitId:visit.id,mutationId:randomUUID(),...extra}],actor);
   await visitCmd('start',staff);await visitCmd('start',peer);
   const legacy=await call('staff_workspace',[tenant],staff);assert.equal('visits' in legacy,false);assert(legacy.workOrderTasks.every(task=>!('execution_snapshot' in task)&&Number.isInteger(task.duration_minutes)));
   await db.query("select set_config('request.headers','{\"x-fieldgrid-task-controls\":\"1\"}',true)");const extended=await call('staff_workspace',[tenant],staff);assert(extended.visits.some(v=>v.id===visit.id));assert(extended.workOrderTasks.some(task=>task.id===serviceOrder.taskId&&task.execution_snapshot.mode==='items'));await db.query("select set_config('request.headers','{}',true)");
   const target=(await call('task_control_context',[tenant,serviceOrder.taskId,0,''],staff)).targets[2];
   await visitCmd('allocate',staff,{taskId:serviceOrder.taskId,targetId:target.id,method:'direct',quantity:1});
   await visitCmd('pause',staff);let context=await call('task_visit_context',[tenant,serviceOrder.id],staff);assert.equal(context.activeKind,'break');assert.equal(context.activeAllocation,null);
   await visitCmd('resume',staff);await visitCmd('allocate',staff,{taskId:serviceOrder.taskId,targetId:target.id,method:'direct',quantity:1});
   await visitCmd('close',staff);context=await call('task_visit_context',[tenant,serviceOrder.id],peer);assert.equal(context.activeKind,'work');assert(context.visits[0].sessions.some(s=>s.own&&s.end===null));
   const a=(await db.query('select status from public.work_order_assignments where id=$1',[assignments.get(person)])).rows[0];assert.equal(a.status,'in_progress');assert.equal((await dossier(serviceOrder.id)).order.status,'in_progress');
   await assert.rejects(visitCmd('start',staff),e=>e.code==='23514');
   const allocations=(await db.query('select a.*,s.starts_at source_start,s.ends_at source_end from private.task_time_allocations a join public.time_entries s on s.id=a.source_id where a.work_order_id=$1',[serviceOrder.id])).rows;
   assert(allocations.length>=2);assert(allocations.every(a=>a.ends_at&&a.starts_at>=a.source_start&&a.ends_at<=a.source_end));
   await db.query('savepoint allocation_bounds');await assert.rejects(db.query("update private.task_time_allocations set ends_at=$2::timestamptz+interval '1 minute' where id=$1",[allocations[0].id,allocations[0].source_end]),e=>e.code==='23514');await db.query('rollback to savepoint allocation_bounds');await db.query('release savepoint allocation_bounds');
   await visitCmd('close',peer);
   // A closed historic day remains a separate immutable segment; day two uses
   // the same unique assignment and concrete task goals through real commands.
   const history=(await db.query("insert into private.task_visits(tenant_id,work_order_id,starts_at,ends_at,state,created_by) values($1,$2,now()-interval '1 day',now()-interval '1 day'+interval '1 hour','closed',$3) returning id",[tenant,serviceOrder.id,manager])).rows[0].id;
   await db.query('insert into private.task_visit_crew values($1,$2,$3,$4,$5)',[tenant,serviceOrder.id,history,assignments.get(person),person]);
   await db.query("insert into private.task_visit_sessions(tenant_id,work_order_id,visit_id,assignment_id,personnel_id,starts_at,ends_at) values($1,$2,$3,$4,$5,now()-interval '1 day',now()-interval '1 day'+interval '1 hour')",[tenant,serviceOrder.id,history,assignments.get(person),person]);
   const originalDay=(await db.query('select to_jsonb(s) snapshot from private.task_visit_sessions s where visit_id=$1',[history])).rows[0].snapshot;
   const currentVersion=Number((await db.query('select version from public.work_orders where id=$1',[serviceOrder.id])).rows[0].version);
   const window2=(await db.query("select (clock_timestamp()+interval '3 hours')::text start,(clock_timestamp()+interval '4 hours')::text finish")).rows[0];
   const second=await call('task_visit_command',[tenant,{action:'plan',acknowledgeWarnings:true,overrideReason:'FICTITIOUS availability reviewed',orderId:serviceOrder.id,version:currentVersion,start:window2.start,end:window2.finish,personnelIds:[person],mutationId:randomUUID()}]);
   await call('task_visit_command',[tenant,{action:'start',orderId:serviceOrder.id,visitId:second.id,mutationId:randomUUID()}],staff);
   await call('task_visit_command',[tenant,{action:'close',orderId:serviceOrder.id,visitId:second.id,mutationId:randomUUID()}],staff);
   assert.deepEqual((await db.query('select to_jsonb(s) snapshot from private.task_visit_sessions s where visit_id=$1',[history])).rows[0].snapshot,originalDay);assert.equal((await db.query('select count(*)::int n from public.work_order_assignments where work_order_id=$1 and personnel_id=$2',[serviceOrder.id,person])).rows[0].n,1);
   const futureWindow=(await db.query("select (clock_timestamp()+interval '2 days')::text start,(clock_timestamp()+interval '2 days 1 hour')::text finish")).rows[0];let current=Number((await db.query('select version from public.work_orders where id=$1',[serviceOrder.id])).rows[0].version);
   const planned=await call('task_visit_command',[tenant,{action:'plan',acknowledgeWarnings:true,overrideReason:'FICTITIOUS availability reviewed',orderId:serviceOrder.id,version:current,start:futureWindow.start,end:futureWindow.finish,personnelIds:[person],mutationId:randomUUID()}]);current=Number((await db.query('select version from public.work_orders where id=$1',[serviceOrder.id])).rows[0].version);
   await call('task_visit_command',[tenant,{action:'reschedule',acknowledgeWarnings:true,overrideReason:'FICTITIOUS availability reviewed',orderId:serviceOrder.id,version:current,visitId:planned.id,visitVersion:1,start:futureWindow.start,end:futureWindow.finish,personnelIds:[person],reason:'FICTITIOUS deliberate visit correction',mutationId:randomUUID()}]);current=Number((await db.query('select version from public.work_orders where id=$1',[serviceOrder.id])).rows[0].version);
   const fit=(await db.query('select private.personnel_fit($1,$2,$3,$4,null,null) r',[tenant,person,futureWindow.start,futureWindow.finish])).rows[0].r;assert.equal(fit.eligible,false);assert(fit.hardBlocks.includes('assignment-overlap'));
   await assert.rejects(call('change_work_order_planning',[tenant,serviceOrder.id,current,randomUUID(),futureWindow.start,futureWindow.finish,JSON.stringify([])]),e=>e.code==='23514'&&e.message.includes('bezoeken'));
   await call('task_visit_command',[tenant,{action:'cancel',orderId:serviceOrder.id,version:current,visitId:planned.id,visitVersion:2,reason:'FICTITIOUS appointment cancelled',mutationId:randomUUID()}]);assert.equal((await db.query('select state from private.task_visits where id=$1',[planned.id])).rows[0].state,'cancelled');

  });
  await t.test('the exact fixture supports 42 direct samples, 18 orders and a future 35-minute norm without rewriting current orders',async()=>{
   const measured=await task('FICTITIOUS measured inspection',30,'item',config('items',{comparisonKey:'coffee-standard-method-2'}));
   const orders=new Map();let cursor=Date.parse('2026-09-01T06:00:00Z');
   for(const sample of fixture.normMeasurements.filter(m=>m.tenantId==='fixture-tenant-a'&&m.taskId==='task-coffee-check'&&m.method==='direct')){
    let pair=orders.get(sample.workOrderId);if(!pair){const created=await order([{revisionId:measured.revisionId,quantity:1,targets:[{itemId:items[0].id}]}]);const wot=(await dossier(created.id)).tasks[0];const assignment=randomUUID();await db.query("insert into public.work_order_assignments(id,tenant_id,work_order_id,personnel_id,status,planned_start_at,planned_end_at,projected_start_at,projected_end_at) values($1,$2,$3,$4,'completed',$5::timestamptz,$5::timestamptz+interval '1 hour',$5::timestamptz,$5::timestamptz+interval '1 hour')",[assignment,tenant,created.id,person,new Date(cursor).toISOString()]);pair={id:created.id,task:wot.id,assignment,count:0};orders.set(sample.workOrderId,pair);}
    // Each independent fixture item is a distinct target. The native helper takes
    // the same frozen task snapshot as the real command; setup is rolled back.
    const item=await cmd({action:'item_save',customerId:customer,objectId:object,name:sample.itemId,itemType:'device',model:'Model A',brand:'',serialNumber:sample.id,duplicatesReviewed:false});
    const target=(await db.query("select private.task_target_add(t,jsonb_build_object('itemId',$2::text),'original','') id from public.work_order_tasks t where t.id=$1",[pair.task,item.id])).rows[0].id;
    await db.query("update private.task_target_executions set state='completed',outcome='pass',actor_id=$2,completed_at=now() where target_id=$1",[target,manager]);
    await db.query('select private.task_refresh_budget($1)',[pair.task]);
    const start=new Date(cursor).toISOString(),end=new Date(cursor+sample.minutes*60000).toISOString();cursor+=sample.minutes*60000+60000;
    const source=(await db.query("insert into public.time_entries(tenant_id,personnel_id,assignment_id,kind,starts_at,ends_at,status) values($1,$2,$3,'work',$4,$5,'approved') returning id",[tenant,person,pair.assignment,start,end])).rows[0].id;
    await db.query("insert into private.task_time_allocations(tenant_id,work_order_id,task_id,target_id,source_id,personnel_id,starts_at,ends_at,method,quantity,quality,reason) values($1,$2,$3,$4,$5,$6,$7,$8,'direct',1,$9,$10)",[tenant,pair.id,pair.task,target,source,person,start,end,sample.quality==='valid'?'valid':'excluded',sample.exclusionReason??sample.reason??'']);
   }
   const analysis=await call('task_norm_context',[tenant,measured.id,'']);assert.equal(analysis.direct.count,42);assert.equal(analysis.direct.orders,18);assert.equal(analysis.direct.sum,1522);assert.equal(analysis.direct.median,34.5);assert.equal(analysis.proposedMinutes,35);assert.equal(analysis.excluded,2);
   await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['tenant_admin','management','finance']::public.app_role[],'active')",[other,manager]);
   const foreign={customer:randomUUID(),object:randomUUID(),person:randomUUID(),catalog:randomUUID(),revision:randomUUID(),item:randomUUID()};
   await db.query("insert into public.customers(id,tenant_id,customer_number,name) values($1,$2,$1::uuid::text,'FICTITIOUS tenant B customer')",[foreign.customer,other]);await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values($1,$2,$3,$1::uuid::text,'FICTITIOUS tenant B object','{}')",[foreign.object,other,foreign.customer]);await db.query("insert into public.personnel(id,tenant_id,full_name,status) values($1,$2,'FICTITIOUS tenant B employee','active')",[foreign.person,other]);
   await db.query("insert into public.task_catalog(id,tenant_id,code,name,discipline) values($1,$2,'TB-001','FICTITIOUS tenant B coffee check','Test')",[foreign.catalog,other]);await db.query("insert into public.task_revisions(id,tenant_id,task_id,revision,duration_minutes,price_cents,vat_basis_points,unit,execution_config) values($1,$2,$3,1,30,0,2100,'item',$4)",[foreign.revision,other,foreign.catalog,config('items',{comparisonKey:'coffee-standard-method-2'})]);await db.query("insert into private.task_items(id,tenant_id,customer_id,object_id,name,item_type) values($1,$2,$3,$4,'FICTITIOUS tenant B device','device')",[foreign.item,other,foreign.customer,foreign.object]);
   let foreignClock=Date.parse('2026-09-02T06:00:00Z');for(const sample of fixture.normMeasurements.filter(m=>m.tenantId==='fixture-tenant-b')){
    const order=(await db.query("insert into public.work_orders(tenant_id,customer_id,object_id,work_order_number,discipline,created_by) values($1,$2,$3,$4,'Test',$5) returning id",[other,foreign.customer,foreign.object,randomUUID(),manager])).rows[0].id;
    const task=(await db.query("insert into public.work_order_tasks(tenant_id,work_order_id,task_revision_id,task_code,task_name,duration_minutes,quantity,unit,unit_price_cents,vat_basis_points,added_by) values($1,$2,$3,'TB-001','FICTITIOUS foreign measurement',30,1,'item',0,2100,$4) returning id",[other,order,foreign.revision,manager])).rows[0].id;
    const target=(await db.query("select private.task_target_add(t,jsonb_build_object('itemId',$2::text),'original','') id from public.work_order_tasks t where t.id=$1",[task,foreign.item])).rows[0].id;await db.query("update private.task_target_executions set state='completed',outcome='pass',completed_at=now() where target_id=$1",[target]);
    const from=new Date(foreignClock).toISOString(),to=new Date(foreignClock+sample.minutes*60000).toISOString();foreignClock+=sample.minutes*60000+60000;
    const assignment=(await db.query("insert into public.work_order_assignments(tenant_id,work_order_id,personnel_id,status,planned_start_at,planned_end_at,projected_start_at,projected_end_at) values($1,$2,$3,'completed',$4,$5,$4,$5) returning id",[other,order,foreign.person,from,to])).rows[0].id;
    const source=(await db.query("insert into public.time_entries(tenant_id,personnel_id,assignment_id,kind,starts_at,ends_at,status) values($1,$2,$3,'work',$4,$5,'approved') returning id",[other,foreign.person,assignment,from,to])).rows[0].id;
    await db.query("insert into private.task_time_allocations(tenant_id,work_order_id,task_id,target_id,source_id,personnel_id,starts_at,ends_at,method,quantity) values($1,$2,$3,$4,$5,$6,$7,$8,'direct',1)",[other,order,task,target,source,foreign.person,from,to]);
   }
   const otherAnalysis=await call('task_norm_context',[other,foreign.catalog,'']);assert.equal(otherAnalysis.direct.count,20);const isolated=await call('task_norm_context',[tenant,measured.id,'']);assert.equal(isolated.datasetHash,analysis.datasetHash);assert.equal(isolated.direct.sum,1522);
   await assert.rejects(call('task_norm_context',[other,measured.id,'']),e=>e.code==='23514');
   const before=await dossier(serviceOrder.id);const decision={mutationId:randomUUID(),taskId:measured.id,version:analysis.taskVersion,datasetHash:analysis.datasetHash,decision:'approved',reason:fixture.normProposalScenario.approvalReason,effectiveOn:'2026-11-21'};
   const approved=await call('task_norm_command',[tenant,decision]);assert.equal(approved.ok,true);assert.deepEqual(await call('task_norm_command',[tenant,decision]),approved);
   const prep=tasks.get('FICTITIOUS prepare'),finish=tasks.get('FICTITIOUS finish');const created=await order([{revisionId:prep.revisionId,quantity:1},{revisionId:measured.revisionId,quantity:8,targets:items.slice(0,8).map(i=>({itemId:i.id}))},{revisionId:finish.revisionId,quantity:1}],'2026-11-22');assert.equal((await dossier(created.id)).order.durationMinutes,310);assert.equal((await dossier(serviceOrder.id)).order.durationMinutes,before.order.durationMinutes);
  });
  await t.test('eight bed measurements remain insufficient; batches and estimates stay independent from direct item samples',async()=>{
   const bed=await task('FICTITIOUS bed inspection',20,'item',config('items',{comparisonKey:'bed-standard'}));let clock=Date.parse('2026-09-19T06:00:00Z');
   for(const sample of fixture.normMeasurements.filter(m=>m.taskId==='task-bed-check')){
    const created=await order([{revisionId:bed.revisionId,quantity:1,targets:[{itemId:items[0].id}]}]),row=(await dossier(created.id)).tasks[0],target=(await call('task_control_context',[tenant,row.id,0,''])).targets[0];
    await db.query("update private.task_target_executions set state='completed',outcome='pass',completed_at=now() where id=$1",[target.executionId]);
    const assignment=(await db.query("insert into public.work_order_assignments(tenant_id,work_order_id,personnel_id,status,planned_start_at,planned_end_at,projected_start_at,projected_end_at) values($1,$2,$3,'completed',$4,$5,$4,$5) returning id",[tenant,created.id,person,new Date(clock).toISOString(),new Date(clock+sample.minutes*60000).toISOString()])).rows[0].id;
    const source=(await db.query("insert into public.time_entries(tenant_id,personnel_id,assignment_id,kind,starts_at,ends_at,status) values($1,$2,$3,'work',$4,$5,'approved') returning id",[tenant,person,assignment,new Date(clock).toISOString(),new Date(clock+sample.minutes*60000).toISOString()])).rows[0].id;
    await db.query("insert into private.task_time_allocations(tenant_id,work_order_id,task_id,target_id,source_id,personnel_id,starts_at,ends_at,method,quantity) values($1,$2,$3,$4,$5,$6,$7,$8,'direct',1)",[tenant,created.id,row.id,target.id,source,person,new Date(clock).toISOString(),new Date(clock+sample.minutes*60000).toISOString()]);clock+=sample.minutes*60000+60000;
   }
   const insufficient=await call('task_norm_context',[tenant,bed.id,'']);assert.equal(insufficient.direct.count,8);assert.equal(insufficient.proposedMinutes,null);
   await assert.rejects(call('task_norm_context',[tenant,bed.id,''],staff),e=>e.code==='42501');await assert.rejects(call('task_norm_context',[other,bed.id,'']),e=>e.code==='23514');
   const batch=await task('FICTITIOUS batch output',30,'item',config('quantity')),created=await order([{revisionId:batch.revisionId,quantity:10}]),row=(await dossier(created.id)).tasks[0];
   await db.query("update public.work_orders set status='in_progress',actual_start_at=now(),planned_start_at=now(),planned_end_at=now()+interval '4 hours',projected_start_at=now(),projected_end_at=now()+interval '4 hours' where id=$1",[created.id]);await call('record_task_execution',[tenant,row.id,row.execution_version,'completed',10,'FICTITIOUS complete batch']);
   const assignment=(await db.query("insert into public.work_order_assignments(tenant_id,work_order_id,personnel_id,status,planned_start_at,planned_end_at,projected_start_at,projected_end_at) values($1,$2,$3,'completed','2026-09-29T08:00:00Z','2026-09-29T10:00:00Z','2026-09-29T08:00:00Z','2026-09-29T10:00:00Z') returning id",[tenant,created.id,person])).rows[0].id;
   const source=(await db.query("insert into public.time_entries(tenant_id,personnel_id,assignment_id,kind,starts_at,ends_at,status) values($1,$2,$3,'work','2026-09-29T08:00:00Z','2026-09-29T10:00:00Z','approved') returning id",[tenant,person,assignment])).rows[0].id;
   for(const [from,to,method] of [['08:00','08:30','batch'],['08:30','09:00','batch'],['09:00','10:00','estimated']])await db.query("insert into private.task_time_allocations(tenant_id,work_order_id,task_id,source_id,personnel_id,starts_at,ends_at,method,quantity) values($1,$2,$3,$4,$5,$6,$7,$8,10)",[tenant,created.id,row.id,source,person,`2026-09-29T${from}:00Z`,`2026-09-29T${to}:00Z`,method]);
   const analysis=await call('task_norm_context',[tenant,batch.id,'']);assert.equal(analysis.direct.count,0);assert.equal(analysis.batch.count,1);assert.equal(analysis.batch.median,6);assert.equal(analysis.excluded,1);assert.equal(analysis.proposedMinutes,null);
   const deferred=await call('task_norm_command',[tenant,{mutationId:randomUUID(),taskId:batch.id,version:analysis.taskVersion,datasetHash:analysis.datasetHash,decision:'deferred',reason:'FICTITIOUS collect more batches',reviewOn:'2035-01-01'}]);assert.equal(deferred.ok,true);
   const policy=await call('task_norm_policy_command',[tenant,{mutationId:randomUUID(),version:0,settings:{...analysis.settings,days:200}}]);assert.equal(policy.version,1);const changed=await call('task_norm_context',[tenant,batch.id,'']);assert.notEqual(changed.datasetHash,analysis.datasetHash);assert.equal(changed.lastDecision.decision,'deferred');
   await call('task_norm_command',[tenant,{mutationId:randomUUID(),taskId:batch.id,version:changed.taskVersion,datasetHash:changed.datasetHash,decision:'rejected',reason:'FICTITIOUS keep norm while evidence is insufficient'}]);assert.equal((await db.query('select count(*)::int n from private.task_norm_decisions where task_id=$1',[batch.id])).rows[0].n,2);
  });
  await t.test('extra goals need explicit finance acceptance before invoice allocation and retain the original tariff',async()=>{
   const priced=await task('FICTITIOUS additional scope price',30,'item',config('items',{allowExtraTargets:true}));
   for(const acceptPrice of [false,true]){
    const created=await order([{revisionId:priced.revisionId,quantity:1,targets:[{itemId:items[0].id}]}]),row=(await dossier(created.id)).tasks[0];let context=await call('task_control_context',[tenant,row.id,0,'']);await cmd({action:'targets_add',taskId:row.id,version:context.version,targets:[{itemId:items[1].id}],reason:'FICTITIOUS additional operational inspection'});
    await db.query("update public.work_orders set status='in_progress',actual_start_at=now(),planned_start_at=now(),planned_end_at=now()+interval '2 hours',projected_start_at=now(),projected_end_at=now()+interval '2 hours' where id=$1",[created.id]);context=await call('task_control_context',[tenant,row.id,0,'']);for(const target of context.targets)await cmd({action:'target_result',taskId:row.id,targetId:target.id,version:target.version,state:'completed',outcome:'pass',followup:'none',finding:'',reason:'',identified:true,customerVisible:false});
    if(acceptPrice){context=await call('task_control_context',[tenant,row.id,0,'']);await cmd({action:'scope_price_accept',taskId:row.id,version:context.version,reason:'FICTITIOUS customer accepted one extra inspection at the original tariff'});}
    await submitFixtureReport(db,(_sql,args,actor)=>call('submit_work_order_report',args,actor),{tenant,order:created.id,staff,manager});await call('review_work_order',[created.id,'approved',null]);
    const allocate=()=>call('create_execution_invoice',[tenant,randomUUID(),JSON.stringify([{taskId:row.id,quantity:2}])]);
    if(!acceptPrice)await assert.rejects(allocate(),e=>e.code==='23514'&&e.message.includes('Extra doelen vereisen'));
    else {await allocate();const lines=(await db.query('select quantity,unit_price_cents from public.invoice_lines where work_order_task_id=$1',[row.id])).rows;assert.equal(lines.length,1);assert.equal(Number(lines[0].quantity),2);assert.equal(Number(lines[0].unit_price_cents),1000);}
   }
  });
  await t.test('controlled rechecks preserve old answers, and immutable report content survives item relocation and catalogue changes',async()=>{
   let context=await call('task_control_context',[tenant,serviceOrder.taskId,0,'']);
   for(const target of context.targets){if(target.state==='completed')continue;if(['not_done','not_applicable'].includes(target.state))await cmd({action:'target_recheck',taskId:context.taskId,targetId:target.id,version:target.version,reason:'FICTITIOUS access restored and new inspection round'});context=await call('task_control_context',[tenant,serviceOrder.taskId,0,'']);const current=context.targets.find(x=>x.id===target.id),check=context.checklists.find(x=>x.targetExecutionId===current.executionId);await call('answer_work_order_checklist',[tenant,{mutationId:randomUUID(),checklistId:check.id,questionId:'identified',version:0,value:true,notApplicable:false,reason:'',attachmentId:null}]);await cmd({action:'target_result',taskId:context.taskId,targetId:current.id,version:current.version,state:'completed',outcome:'pass',followup:'none',finding:'',reason:'',identified:true,customerVisible:true});}
   let d=await dossier(serviceOrder.id);for(const row of d.tasks.filter(x=>x.id!==serviceOrder.taskId))await call('record_task_execution',[tenant,row.id,row.execution_version,'completed',row.quantity,'FICTITIOUS completed task']);
   for(const actor of [staff,peer]){d=await dossier(serviceOrder.id);await call('transition_work_order',[serviceOrder.id,'stop',d.order.version,randomUUID(),null,null],actor);}
   d=await dossier(serviceOrder.id);const owner=(await db.query('select private.is_delivery_owner($1,$2,$3) own',[tenant,serviceOrder.id,staff])).rows[0].own?staff:peer;
   const report=await call('submit_work_order_report',[serviceOrder.id,d.order.version,'FICTITIOUS report with item-scoped inspection results',randomUUID()],owner);
   const original=(await db.query('select snapshot,content_hash from public.work_order_report_versions where id=$1',[report.id])).rows[0];assert.equal(original.snapshot.notes.length,10);assert(original.snapshot.notes.some(n=>n.body.includes('Afgekeurd')));assert(!JSON.stringify(original.snapshot).includes('FICTITIOUS failed inspection'));
   const movedObject=randomUUID();await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values($1,$2,$3,$1::uuid::text,'FICTITIOUS replacement location','{}')",[movedObject,tenant,customer]);
   const priorDossier=await call('task_item_dossier',[tenant,items[0].id,serviceOrder.id],staff);assert.equal(priorDossier.item.id,items[0].id);
   const item=(await db.query('select * from private.task_items where id=$1',[items[0].id])).rows[0];await cmd({action:'item_save',id:item.id,version:Number(item.version),customerId:customer,objectId:movedObject,name:'FICTITIOUS renamed and relocated device',itemType:item.item_type,model:'Different model',brand:'',serialNumber:item.serial_number,duplicatesReviewed:false});
   await assert.rejects(call('task_item_dossier',[tenant,items[0].id,serviceOrder.id],staff),e=>e.code==='42501');
   await db.query('savepoint source_module');await db.query("select set_config('request.jwt.claim.role','service_role',true)");await db.query("update public.tenant_settings set enabled_services=array_remove(enabled_services,'rapportage') where tenant_id=$1",[tenant]);await db.query("select set_config('request.jwt.claim.role','authenticated',true)");await assert.rejects(call('task_item_dossier',[tenant,items[0].id,null]),e=>e.code==='42501');await db.query('rollback to savepoint source_module');await db.query('release savepoint source_module');await db.query("select set_config('request.jwt.claim.role','authenticated',true)");
   const current=(await catalogue()).tasks.find(x=>x.id===service.id);await taskSave({action:'task_save',id:service.id,version:current.version,name:'FICTITIOUS changed catalogue label',description:'Changed after reporting',discipline:'FICTITIOUS',duration:45,priceCents:1000,vatBasisPoints:2100});
   const after=(await db.query('select snapshot,content_hash from public.work_order_report_versions where id=$1',[report.id])).rows[0];assert.deepEqual(after,original);
   const oldRound=(await db.query('select count(*)::int n from private.task_target_executions where task_id=$1 and round=2',[serviceOrder.taskId])).rows[0].n;assert.equal(oldRound,1);assert.equal((await db.query('select count(*)::int n from public.work_order_checklists where task_id=$1',[serviceOrder.taskId])).rows[0].n,11);
  });
 }finally{await db.query('rollback');await db.end();}
});
