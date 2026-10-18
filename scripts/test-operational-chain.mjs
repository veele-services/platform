import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {workOrderTestDatabase} from './work-order-test-target.mjs';
import {slaFixture,seedSlaFixture} from './fixtures/management-sla.mjs';

test('Operational chain: contract concepts and qualification re-evaluation share authoritative rules',async t=>{
 const db=await workOrderTestDatabase(),f=slaFixture();await db.query('begin');
 const call=async(sql,args=[],actor=f.owner,role='authenticated')=>{await db.query('savepoint operation');try{await db.query(`set local role ${role}`);await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role,sub:actor,session_id:f.sessions.get(actor)})]);const result=await db.query(sql,args);await db.query('reset role');await db.query("select set_config('request.jwt.claims','{}',true)");await db.query('release savepoint operation');return result.rows[0]?.data??result.rows}catch(error){await db.query('rollback to savepoint operation');await db.query('release savepoint operation');throw error}};
 const service=(sql,args=[])=>call(sql,args,f.owner,'service_role');
 try{
  await t.test('private material trigger is executable only by PostgreSQL',async()=>{
   const privileges=(await db.query(`select
     has_function_privilege('anon','private.material_price_proposal_sync()','EXECUTE') anon,
     has_function_privilege('authenticated','private.material_price_proposal_sync()','EXECUTE') authenticated,
     has_function_privilege('service_role','private.material_price_proposal_sync()','EXECUTE') service,
     has_function_privilege('postgres','private.material_price_proposal_sync()','EXECUTE') postgres`)).rows[0];
   assert.deepEqual(privileges,{anon:false,authenticated:false,service:false,postgres:true});
  });
  await seedSlaFixture(db,f);
  const today=(await db.query("select current_date::text as business_day,(current_date+1)::text as tomorrow,(current_date+2)::text as last_day")).rows[0];
  const oldLine=(await db.query('select id from public.customer_agreement_lines where tenant_id=$1 and agreement_id=$2',[f.tenant,f.agreement])).rows[0].id;
  await db.query("update public.customer_agreements set state='active',starts_on=current_date-30,ends_on=null where id=$1",[f.agreement]);
  await db.query("insert into public.work_order_tasks(tenant_id,work_order_id,task_revision_id,task_code,task_name,duration_minutes,quantity,unit,unit_price_cents,vat_basis_points,agreement_line_id,added_by) values($1,$2,$3,'CONTRACT','FICTITIOUS contract visit',30,1,'uitvoering',1200,900,$4,$5)",[f.tenant,f.workOrder,f.revision,oldLine,f.owner]);

  const nextAgreement=randomUUID(),nextLine=randomUUID(),indexation=randomUUID();
  await db.query("insert into public.customer_agreements(id,tenant_id,customer_id,previous_id,version,title,starts_on,state,accepted_by_name,accepted_on,created_by) values($1,$2,$3,$4,2,'FICTITIOUS indexed agreement',current_date+1,'active','FICTITIOUS customer',current_date,$5)",[nextAgreement,f.tenant,f.customer,f.agreement,f.owner]);
  await db.query("insert into public.customer_agreement_lines(id,tenant_id,agreement_id,object_id,task_revision_id,scope,quantity,price_cents,limit_cents,unit,vat_basis_points) values($1,$2,$3,$4,$5,'FICTITIOUS indexed scope',1,1500,1500,'uitvoering',900)",[nextLine,f.tenant,nextAgreement,f.object,f.revision]);
  await db.query("insert into private.cockpit_indexations(id,tenant_id,agreement_id,customer_id,state,percent_basis_points,effective_on,source_snapshot,source_fingerprint,approved_by,approved_at,processed_agreement_id,created_by) values($1,$2,$3,$4,'Verwerkt',2500,current_date+1,'{}',$5,$6,now(),$7,$6)",[indexation,f.tenant,f.agreement,f.customer,'0'.repeat(64),f.owner,nextAgreement]);
  await db.query("insert into private.cockpit_indexation_lines(tenant_id,indexation_id,old_line_id,new_line_id,effective_on) values($1,$2,$3,$4,current_date+1)",[f.tenant,indexation,oldLine,nextLine]);

  const definition={startsOn:today.business_day,endsOn:today.last_day,frequency:'daily',interval:1,weekdays:[1,2,3,4,5,6,7],monthlyMode:'date',monthDay:1,monthPosition:1,monthWeekday:1,startsAt:'08:00',endsAt:'10:00',requiredPersonnel:1};
  const sourceVersion=Number((await db.query('select version from public.work_orders where id=$1',[f.workOrder])).rows[0].version),commandId=randomUUID();
  const createPayload={orderId:f.workOrder,version:sourceVersion,title:'FICTITIOUS contract planning',definition,agreementLineId:oldLine,generationHorizonWeeks:6,preferredPersonnelIds:[f.person]};
  const created=await call('select public.work_order_series_command($1,$2,$3,$4) data',[f.tenant,commandId,'create',JSON.stringify(createPayload)]);
  assert.equal(created.state,'concept');assert.equal(created.version,2);assert.deepEqual(created,await call('select public.work_order_series_command($1,$2,$3,$4) data',[f.tenant,commandId,'create',JSON.stringify(createPayload)]));
  await assert.rejects(call('select public.work_order_series_command($1,$2,$3,$4) data',[f.tenant,commandId,'create',JSON.stringify({orderId:f.workOrder,version:sourceVersion,title:'changed',definition,agreementLineId:oldLine})]),error=>error.code==='23514');

  await t.test('automation is opt-in, bounded, retry-safe and date-effective across indexation',async()=>{
   assert.equal((await service('select public.process_contract_planning(20) data')).processed,0);
   await assert.rejects(call('select public.work_order_series_command($1,$2,$3,$4) data',[f.tenant,randomUUID(),'activate',JSON.stringify({seriesId:created.id,version:created.version})]),error=>error.code==='23514');
   const tenantAutomation=await call('select public.work_order_series_command($1,$2,$3,$4) data',[f.tenant,randomUUID(),'tenant_automation',JSON.stringify({enabled:true})]);assert.equal(tenantAutomation.enabled,true);
   const active=await call('select public.work_order_series_command($1,$2,$3,$4) data',[f.tenant,randomUUID(),'activate',JSON.stringify({seriesId:created.id,version:created.version})]);assert.equal(active.state,'active');
   const first=await service('select public.process_contract_planning(20) data');assert.equal(first.processed,1);assert.equal(first.created,3);assert.equal(first.failed,0);
   const second=await service('select public.process_contract_planning(20) data');assert.equal(second.created,0);assert.equal(second.failed,0);
   const occurrences=(await db.query("select o.occurrence_on::text as occurrence_day,o.work_order_id,w.planning_state,w.details->'personnel_suggestion' preferred,w.details->'preferred_personnel_match' preferred_match from public.work_order_occurrences o join public.work_orders w on w.id=o.work_order_id where o.series_id=$1 order by o.occurrence_on",[created.id])).rows;
   assert.deepEqual(occurrences.map(row=>row.occurrence_day),[today.business_day,today.tomorrow,today.last_day]);assert.ok(occurrences.every(row=>row.planning_state==='unassigned'));assert.deepEqual(occurrences[0].preferred,[f.person]);
   assert.equal(occurrences[0].preferred_match[0].personnelId,f.person);assert.equal(occurrences[0].preferred_match[0].fit.eligible,true);assert.equal(occurrences[0].preferred_match[0].fit.availabilityState,'unknown');
   assert.equal((await db.query('select count(*)::int n from public.work_order_assignments where work_order_id=any($1::uuid[])',[occurrences.map(row=>row.work_order_id)])).rows[0].n,0);
   assert.equal((await db.query('select count(*)::int n from public.invoice_lines where work_order_id=any($1::uuid[])',[occurrences.map(row=>row.work_order_id)])).rows[0].n,0);
   const generatedTasks=(await db.query("select (w.details#>>'{contract_generation,occurrenceOn}') as occurrence_day,t.agreement_line_id,t.unit_price_cents from public.work_orders w join public.work_order_tasks t on t.work_order_id=w.id where w.id=any($1::uuid[]) order by occurrence_day",[occurrences.map(row=>row.work_order_id)])).rows;
   assert.equal(generatedTasks.find(row=>row.occurrence_day===today.business_day).agreement_line_id,oldLine);assert.equal(Number(generatedTasks.find(row=>row.occurrence_day===today.business_day).unit_price_cents),1200);
   assert.ok(generatedTasks.filter(row=>row.occurrence_day!==today.business_day).every(row=>row.agreement_line_id===nextLine&&Number(row.unit_price_cents)===1500));
   const paused=await call('select public.work_order_series_command($1,$2,$3,$4) data',[f.tenant,randomUUID(),'pause',JSON.stringify({seriesId:created.id,version:active.version,reason:'FICTITIOUS contract review'})]);assert.equal(paused.state,'paused');assert.equal((await service('select public.process_contract_planning(20) data')).processed,0);
  });

  await t.test('qualification expiry opens and valid inclusive evidence closes a linked follow-up action',async()=>{
   const code='FICT-QUAL';
   const qualificationRequest=randomUUID(),qualificationInput={code,name:'FICTITIOUS qualification',evidenceKind:'certificate',reminderDays:[30],scope:'work_order',subjectId:f.workOrder,hard:true};
   const qualification=await call('select public.qualification_catalogue_command($1,$2,$3) data',[f.tenant,qualificationRequest,JSON.stringify(qualificationInput)]);
   assert.ok(qualification.id);assert.ok(qualification.requirementId);
   assert.deepEqual(qualification,await call('select public.qualification_catalogue_command($1,$2,$3) data',[f.tenant,qualificationRequest,JSON.stringify(qualificationInput)]));
   let run=await service('select public.process_qualification_followup(50) data');assert.ok(run.processed>=1);assert.ok(run.changed>=1);
   const qualificationActions=(await db.query("select id,state,source_id,trigger_key from private.cockpit_actions where tenant_id=$1 and trigger_key like 'qualification:%' order by created_at,id",[f.tenant])).rows;
   let action=qualificationActions.find(row=>row.trigger_key.endsWith(`:${code}`));
   assert.ok(action,`Expected ${code} follow-up; received ${JSON.stringify(qualificationActions)}`);assert.equal(action.state,'open');assert.equal(action.source_id,f.workOrder);
   const certificate=randomUUID();
   await db.query("insert into public.certificates(id,tenant_id,personnel_id,code,name,valid_from,expires_on,verified_at,dossier_managed,dossier_status,dossier_data) values($1,$2,$3,$4,'FICTITIOUS evidence','2033-10-05','2033-10-05',now(),true,'approved','{}')",[certificate,f.tenant,f.person,code]);
   run=await service('select public.process_qualification_followup(50) data');assert.ok(run.processed>=1);action=(await db.query('select id,state from private.cockpit_actions where id=$1',[action.id])).rows[0];assert.equal(action.state,'done');
   await db.query("update public.certificates set expires_on='2033-10-04' where id=$1",[certificate]);
   await service('select public.process_qualification_followup(50) data');action=(await db.query('select id,state from private.cockpit_actions where id=$1',[action.id])).rows[0];assert.equal(action.state,'open');
   const audit=(await db.query("select event from private.cockpit_events where record_id=$1 order by created_at,id",[action.id])).rows.map(row=>row.event);assert.deepEqual(audit,['create','complete','reopen']);
  });
 }finally{await db.query('rollback');await db.end()}
});
