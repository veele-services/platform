SET local check_function_bodies = off;

DROP POLICY "work_orders_staff_projection" ON "public"."work_orders";

CREATE OR REPLACE FUNCTION private.staff_work_order_result (
  w public.work_orders
)
  RETURNS public.work_orders
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select case when private.has_role(w.tenant_id,array['tenant_admin','management','finance']::public.app_role[]) then w
 else jsonb_populate_record(null::public.work_orders,(select jsonb_object_agg(key,value) from jsonb_each(to_jsonb(w)) where key=any(array[
 'id','tenant_id','work_order_number','request_id','quote_id','customer_id','object_id','appointment_slot_id','discipline','status','planned_start_at','planned_end_at','projected_start_at','projected_end_at','actual_start_at','actual_end_at','signature_required','report_version','attention_reason','version','created_by','created_at','updated_at','requested_date','required_personnel','day_instructions','customer_window_kind','title','description','labels','source_kind','lead_personnel_id','signature_mode','employee_signature_required','signature_policy_snapshot','published_at','planning_state','archive_at','report_state','deadline','planner_user_id','priority','visit_kind']))) end;
$function$;

CREATE OR REPLACE FUNCTION private.work_order_report_snapshot (
  w       public.work_orders,
  summary text
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select jsonb_build_object('schema',1,'number',w.work_order_number,'title',coalesce(nullif(w.title,''),w.discipline),'summary',summary,
 'tenant',jsonb_build_object('name',te.name,'primaryColor',coalesce(b.primary_color,'#222C35'),'accentColor',coalesce(b.accent_color,'#41AC42')),
 'customer',jsonb_build_object('name',c.name),'object',jsonb_build_object('name',o.name,'address',jsonb_build_object('street',o.address->>'street','postal_code',o.address->>'postal_code','city',o.address->>'city','country',o.address->>'country')),
 'executionDate',coalesce(w.actual_start_at,w.projected_start_at),'endedAt',w.actual_end_at,'timezone',te.timezone,
 'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'code',t.task_code,'name',t.task_name,'quantity',t.quantity,'unit',t.unit,
 'executedQuantity',coalesce(t.executed_quantity,case when t.completed_at is not null then t.quantity else 0 end),'result',t.execution_state,
 'transferredQuantity',coalesce((to_jsonb(t)->>'transferred_quantity')::numeric,0),'withdrawnQuantity',coalesce((to_jsonb(t)->>'withdrawn_quantity')::numeric,0),'extraWork',t.is_extra_work) order by t.created_at,t.id)
 from public.work_order_tasks t where t.tenant_id=w.tenant_id and t.work_order_id=w.id and(not t.is_extra_work or t.extra_work_status<>'rejected')),'[]'),
 'checklists',coalesce((select jsonb_agg(jsonb_build_object('name',cl.name,'version',tv.version,'question',q->>'label','unit',q->>'unit','type',q->>'type','value',a.value,'notApplicable',a.not_applicable,'reason',case when a.not_applicable then a.reason else null end,'answerVersion',a.version,'attachmentId',a.attachment_id) order by cl.created_at,q->>'id')
 from public.work_order_checklists cl join public.work_order_template_versions tv on tv.id=cl.template_revision_id cross join lateral jsonb_array_elements(cl.definition->'questions')q join public.work_order_checklist_answers a on a.checklist_id=cl.id and a.question_id=q->>'id'
 where cl.tenant_id=w.tenant_id and cl.work_order_id=w.id and coalesce((q->>'customerVisible')::boolean,false) and (q->'condition' is null or q->'condition'='null'::jsonb or exists(select 1 from public.work_order_checklist_answers condition_answer where condition_answer.checklist_id=cl.id and condition_answer.question_id=q->'condition'->>'questionId' and condition_answer.value=q->'condition'->'equals'))),'[]'),
 'materials',coalesce((select jsonb_agg(jsonb_build_object('description',m.description,'quantity',m.quantity,'unit',m.unit,'taskId',m.task_id) order by m.created_at,m.id) from public.work_order_material_usage m where m.tenant_id=w.tenant_id and m.work_order_id=w.id and coalesce((to_jsonb(m)->>'customer_visible')::boolean,false)),'[]'),
 'notes',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'body',e.body) order by e.created_at,e.id) from public.report_entries e where e.tenant_id=w.tenant_id and e.work_order_id=w.id and e.customer_visible and e.deleted_at is null),'[]'),
 'attachments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',a.file_name,'mime',a.mime_type,'sha256',a.sha256) order by a.created_at,a.id) from public.attachments a where a.tenant_id=w.tenant_id and a.work_order_id=w.id and a.deleted_at is null and(a.customer_visible or exists(select 1 from public.work_order_checklists cl cross join lateral jsonb_array_elements(cl.definition->'questions')q join public.work_order_checklist_answers ca on ca.checklist_id=cl.id and ca.question_id=q->>'id' where cl.work_order_id=w.id and ca.attachment_id=a.id and coalesce((q->>'customerVisible')::boolean,false)))),'[]'))
 from public.tenants te left join public.tenant_branding b on b.tenant_id=te.id join public.customers c on c.tenant_id=te.id and c.id=w.customer_id join public.objects o on o.tenant_id=te.id and o.id=w.object_id where te.id=w.tenant_id;
$function$;

CREATE OR REPLACE FUNCTION public.dispatch_work_order (
  target_work_order_id uuid,
  target_personnel_id  uuid,
  expected_version     bigint,
  idempotency_key      text
)
  RETURNS public.work_orders
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  target public.work_orders;
  assignment public.work_order_assignments;
  result public.work_orders;
begin
  perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||w.tenant_id::text,0)) from public.work_orders w where w.id=target_work_order_id; select * into target from public.work_orders w where w.id = target_work_order_id for update;
  if not found then raise exception 'Work order not found' using errcode = 'P0002'; end if;
  if not private.has_role(target.tenant_id, array['tenant_admin','management','planner']::public.app_role[]) then
    raise exception 'Planner role required' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.dispatches d
    where d.tenant_id = target.tenant_id
      and d.idempotency_key = dispatch_work_order.idempotency_key
  ) then
    return private.staff_work_order_result(target);
  end if;
  if target.version <> expected_version then
    raise exception 'Work order was changed by another user' using errcode = '40001';
  end if;
  if target.status not in ('planned','released') then
    raise exception 'Only planned work can be dispatched' using errcode = '23514';
  end if;

  select * into assignment
  from public.work_order_assignments a
  where a.tenant_id = target.tenant_id
    and a.work_order_id = target.id
    and a.personnel_id = target_personnel_id
  for update;
  if not found then raise exception 'Personnel is not assigned to this work order' using errcode = '23503'; end if;

  if assignment.status in ('cancelled','returned','completed') then raise exception 'Deze toewijzing is niet meer actief' using errcode='23514';end if; insert into public.dispatches (tenant_id, work_order_id, assignment_id, dispatched_by, idempotency_key)
  values (target.tenant_id, target.id, assignment.id, auth.uid(), dispatch_work_order.idempotency_key)
  on conflict on constraint dispatches_tenant_id_idempotency_key_key do nothing;

  update public.work_order_assignments
  set status = 'released'
  where id = assignment.id and status = 'planned';

  update public.work_orders
  set status = 'released', attention_reason = null
  where id = target.id
  returning * into result;

  insert into public.status_events (
    tenant_id, work_order_id, assignment_id, actor_user_id,
    previous_status, new_status, idempotency_key
  ) values (
    target.tenant_id, target.id, assignment.id, auth.uid(),
    target.status, 'released', dispatch_work_order.idempotency_key
  ) on conflict on constraint status_events_tenant_id_idempotency_key_key do nothing;

  perform private.enqueue_event(
    target.tenant_id,
    'work_order.dispatched',
    'work_order',
    target.id,
    jsonb_build_object('work_order_id', target.id, 'personnel_id', target_personnel_id),
    'dispatch:' || dispatch_work_order.idempotency_key
  );
  return private.staff_work_order_result(result);
end;
$function$;

CREATE OR REPLACE FUNCTION public.reschedule_work_order (
  target_work_order_id uuid,
  target_personnel_id  uuid,
  target_start_at      timestamp with time zone,
  expected_version     bigint
)
  RETURNS public.work_orders
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare w public.work_orders; result jsonb;
begin
 select * into w from public.work_orders where id=target_work_order_id;
 if not found or not private.planning_access(w.tenant_id) then raise exception 'Geen toegang tot planning' using errcode='42501';end if;
 if (select count(*) from public.work_order_assignments where tenant_id=w.tenant_id and work_order_id=w.id and status not in ('cancelled','returned'))>1 then
   raise exception 'Gebruik het planbord om de volledige ploeg te verplaatsen' using errcode='23514';end if;
 result:=public.change_work_order_planning(w.tenant_id,w.id,expected_version,gen_random_uuid(),target_start_at,target_start_at+(w.projected_end_at-w.projected_start_at),jsonb_build_array(jsonb_build_object('personnelId',target_personnel_id,'start',target_start_at,'end',target_start_at+(w.projected_end_at-w.projected_start_at))));
 if not(result->>'ok')::boolean then raise exception 'Controleer en bevestig de afwijkingen in het planbord' using errcode='23514';end if;
 select * into w from public.work_orders where id=w.id;
 return private.staff_work_order_result(w);
end $function$;

CREATE OR REPLACE FUNCTION public.save_work_order (
  target_tenant uuid,
  input         jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare w public.work_orders;old_w public.work_orders;prior private.work_order_commands;mid uuid:=(input->>'mutationId')::uuid;oid uuid:=(input->>'id')::uuid;hash text;
 item jsonb;r jsonb;planning jsonb;revision public.task_revisions;task public.task_catalog;contact public.customer_contacts;template public.work_order_template_versions;template_name text;
 task_json jsonb;old_tasks jsonb;new_tasks jsonb;new_checklists uuid[];old_checklists uuid[];cid uuid;slot uuid;warn text;
begin
 if not private.object_session_active() or not private.planning_access(target_tenant) then raise exception 'Geen toegang tot werkbonbeheer' using errcode='42501';end if;
 if mid is null or oid is null or input->>'version' is null or (input->>'version')::bigint<0 then raise exception 'Een wijzigingssleutel en versie zijn verplicht' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 hash:=encode(extensions.digest(input::text,'sha256'),'hex');select * into prior from private.work_order_commands where id=mid;
 if found then if (prior.tenant_id,prior.actor_id,prior.command,prior.payload_hash) is distinct from (target_tenant,auth.uid(),'save',hash) then raise exception 'Ongeldige herhaalsleutel' using errcode='23514';end if;return prior.result;end if;
 if not exists(select 1 from public.objects o join public.customers c on c.tenant_id=o.tenant_id and c.id=o.customer_id where o.tenant_id=target_tenant and o.id=(input->>'objectId')::uuid and c.id=(input->>'customerId')::uuid and o.active and c.status not in ('archived','inactive')) then raise exception 'Selecteer een object van de gekozen klant' using errcode='23514';end if;
 if length(btrim(coalesce(input->>'title','')))<2 or length(input->>'title')>180 or length(btrim(coalesce(input->>'discipline','')))=0 or length(input->>'description')>10000 or length(input->>'instructions')>4000 then raise exception 'Vul titel, dienst en geldige instructies in' using errcode='23514';end if;
 if coalesce(input->>'state','') not in ('draft','unassigned','tentative','final') or coalesce(input->>'signatureMode','') not in ('inherit','none','optional','required') or coalesce((input->>'requiredPersonnel')::int,0) not between 1 and 100 then raise exception 'Controleer planning en ondertekeninstellingen' using errcode='23514';end if;
 if nullif(input->>'plannerId','') is not null and not exists(select 1 from public.tenant_memberships m where m.tenant_id=target_tenant and m.user_id=(input->>'plannerId')::uuid and m.status='active' and m.roles&&array['tenant_admin','management','planner']::public.app_role[]) then raise exception 'Kies een actieve planner van deze organisatie' using errcode='23514';end if;
 if nullif(input->>'leadPersonnelId','') is not null and not exists(select 1 from jsonb_array_elements(input->'assignments')x where x->>'personnelId'=input->>'leadPersonnelId') then raise exception 'De uitvoeringsverantwoordelijke moet aan deze bon zijn toegewezen' using errcode='23514';end if;
 for item in select * from jsonb_array_elements(coalesce(input->'assignments','[]')) loop
 if not exists(select 1 from public.personnel p join public.tenant_memberships m on m.tenant_id=p.tenant_id and m.user_id=p.user_id where p.tenant_id=target_tenant and p.id=(item->>'personnelId')::uuid and p.status='active' and m.status='active' and 'staff'=any(m.roles)) then raise exception 'Een medewerker heeft geen actieve uitvoeringstoegang' using errcode='23514';end if;end loop;
 select * into old_w from public.work_orders where tenant_id=target_tenant and id=oid for update;
 if old_w.id is null and (input->>'version')::bigint<>0 or old_w.id is not null and old_w.version<>(input->>'version')::bigint then raise exception 'De werkbon is intussen gewijzigd. Laad de actuele versie.' using errcode='40001';end if;
 if old_w.id is not null and (old_w.actual_start_at is not null or old_w.status not in ('planned','released','seen','travelling') or old_w.archive_at is not null) then raise exception 'De uitvoering is gestart of afgesloten; de afgesproken scope blijft bewaard' using errcode='23514';end if;
 if old_w.id is not null and (old_w.customer_id<>(input->>'customerId')::uuid or old_w.object_id<>(input->>'objectId')::uuid) then raise exception 'Klant en object van een bestaande bon blijven vastgelegd. Maak zo nodig een nieuwe bon.' using errcode='23514';end if;
 if old_w.published_at is not null and (old_w.signature_mode,old_w.employee_signature_required) is distinct from (input->>'signatureMode',(input->>'employeeSignatureRequired')::boolean) then raise exception 'Wijzig een gepubliceerde ondertekenafspraak via het gemotiveerde beleid in het rapportdossier' using errcode='23514';end if;
 if (old_w.id is null and input->>'signatureMode'<>'inherit' or old_w.id is not null and old_w.signature_mode<>input->>'signatureMode') and not private.has_role(target_tenant,array['tenant_admin','management']::public.app_role[]) then raise exception 'Alleen beheer kan afwijken van het ondertekenbeleid' using errcode='42501';end if;
 if coalesce(old_w.employee_signature_required,false) is distinct from coalesce((input->>'employeeSignatureRequired')::boolean,false) and not private.has_role(target_tenant,array['tenant_admin','management']::public.app_role[]) then raise exception 'Alleen beheer wijzigt de medewerkershandtekening' using errcode='42501';end if;
 task_json:=coalesce(input->'tasks','[]');
 if old_w.id is not null and coalesce((input->>'preserveTasks')::boolean,false) then select coalesce(jsonb_agg(jsonb_build_object('revisionId',task_revision_id,'quantity',quantity,'instructions',instructions)),'[]') into task_json from public.work_order_tasks where work_order_id=oid;end if;
 if jsonb_array_length(task_json)>100 or (input->>'state'<>'draft' and jsonb_array_length(task_json)=0) then raise exception 'Kies minimaal één taak voor deze werkbon' using errcode='23514';end if;
 if nullif(input->>'templateRevisionId','') is not null then
 select v.* into template from public.work_order_template_versions v join public.work_order_templates t on t.id=v.template_id where v.tenant_id=target_tenant and v.id=(input->>'templateRevisionId')::uuid and t.kind='work_order' and (v.state='published' or (v.state='archived' and old_w.template_snapshot->>'id'=v.id::text));
 if template.id is null then raise exception 'Kies een gepubliceerde werkbontemplate' using errcode='23514';end if;
 select name into template_name from public.work_order_templates where id=template.template_id;
 end if;
 select coalesce(array_agg(x::uuid order by x),'{}') into new_checklists from jsonb_array_elements_text(coalesce(input->'checklistRevisionIds','[]'))x;
 select coalesce(array_agg(template_revision_id order by template_revision_id),'{}') into old_checklists from public.work_order_checklists where work_order_id=oid;
 select coalesce(jsonb_agg(jsonb_build_object('revisionId',task_revision_id,'quantity',quantity,'instructions',instructions) order by task_revision_id,quantity,instructions),'[]') into old_tasks from public.work_order_tasks where work_order_id=oid;
 select coalesce(jsonb_agg(jsonb_build_object('revisionId',x->>'revisionId','quantity',(x->>'quantity')::numeric,'instructions',coalesce(x->>'instructions','')) order by x->>'revisionId',(x->>'quantity')::numeric,x->>'instructions'),'[]') into new_tasks from jsonb_array_elements(task_json)x;
 if old_w.id is not null and (old_tasks<>new_tasks or old_checklists<>new_checklists) and (old_w.published_at is not null or old_w.quote_id is not null or exists(select 1 from public.work_order_tasks t where t.work_order_id=oid and (t.execution_state<>'planned' or t.agreement_line_id is not null)) or exists(select 1 from public.work_order_checklist_answers a join public.work_order_checklists c on c.id=a.checklist_id where c.work_order_id=oid)) then raise exception 'De gepubliceerde of commerciële taken en antwoorden blijven behouden. Maak een gecontroleerde opvolgbon voor nieuwe scope.' using errcode='23514';end if;
 begin
 if nullif(input->>'windowStart','') is not null or nullif(input->>'windowEnd','') is not null then
  if (input->>'windowStart')::timestamptz is null or (input->>'windowEnd')::timestamptz<=(input->>'windowStart')::timestamptz then raise exception 'Controleer het klanttijdvenster' using errcode='23514';end if;
  if old_w.appointment_slot_id is not null then update public.appointment_slots set starts_at=(input->>'windowStart')::timestamptz,ends_at=(input->>'windowEnd')::timestamptz where id=old_w.appointment_slot_id;slot:=old_w.appointment_slot_id;
  else insert into public.appointment_slots(tenant_id,starts_at,ends_at,capacity,booked_count,status) values(target_tenant,(input->>'windowStart')::timestamptz,(input->>'windowEnd')::timestamptz,1,1,'full') returning id into slot;end if;
 else slot:=old_w.appointment_slot_id;end if;
 if old_w.id is null then
 insert into public.work_orders(id,tenant_id,work_order_number,customer_id,object_id,discipline,created_by,planning_state)
 values(oid,target_tenant,'WB-'||to_char(clock_timestamp(),'YYYY')||'-'||upper(substr(replace(oid::text,'-',''),1,12)),(input->>'customerId')::uuid,(input->>'objectId')::uuid,input->>'discipline',auth.uid(),input->>'state');
 end if;
 update public.work_orders set title=btrim(input->>'title'),description=coalesce(input->>'description',''),discipline=input->>'discipline',priority=coalesce(input->>'priority','normal'),labels=array(select jsonb_array_elements_text(coalesce(input->'labels','[]'))),
 planner_user_id=nullif(input->>'plannerId','')::uuid,lead_personnel_id=nullif(input->>'leadPersonnelId','')::uuid,signature_mode=input->>'signatureMode',employee_signature_required=coalesce((input->>'employeeSignatureRequired')::boolean,false),
 planning_state=input->>'state',deadline=nullif(input->>'deadline','')::date,budget_labor_minutes=nullif(input->>'durationMinutes','')::int,
 requested_date=nullif(input->>'requestedDate','')::date,customer_window_kind=input->>'windowKind',required_personnel=(input->>'requiredPersonnel')::int,day_instructions=coalesce(input->>'instructions',''),appointment_slot_id=slot,
 details=details||jsonb_build_object('customerReference',coalesce(input->>'customerReference',''),'purchaseOrder',coalesce(input->>'purchaseOrder',''),'costCenter',coalesce(input->>'costCenter',''),'locationLabel',coalesce(input->>'locationLabel','')),
 template_snapshot=case when template.id is not null then jsonb_build_object('id',template.id,'name',template_name,'version',template.version,'definition',template.definition) else template_snapshot end
 where id=oid returning * into w;
 if old_w.id is null or old_tasks<>new_tasks then
 delete from public.work_order_tasks where work_order_id=oid;
 for item in select * from jsonb_array_elements(task_json) loop
 select * into revision from public.task_revisions where tenant_id=target_tenant and id=(item->>'revisionId')::uuid;
 select * into task from public.task_catalog where tenant_id=target_tenant and id=revision.task_id and active;
 if task.id is null or not((item->>'quantity')::numeric>0) or (item->>'quantity')::numeric>100000 then raise exception 'Controleer taak en hoeveelheid' using errcode='23514';end if;
 insert into public.work_order_tasks(tenant_id,work_order_id,task_revision_id,task_code,task_name,duration_minutes,quantity,unit,unit_price_cents,vat_basis_points,instructions,added_by)
 values(target_tenant,oid,revision.id,task.code,task.name,revision.duration_minutes,(item->>'quantity')::numeric,revision.unit,revision.price_cents,revision.vat_basis_points,coalesce(item->>'instructions',''),auth.uid());
 end loop;end if;
 delete from public.work_order_contacts where work_order_id=oid;
 for item in select * from jsonb_array_elements(coalesce(input->'contacts','[]')) loop
 select * into contact from public.customer_contacts where tenant_id=target_tenant and customer_id=w.customer_id and id=(item->>'id')::uuid and active and (cardinality(object_ids)=0 or w.object_id=any(object_ids));
 if not found then raise exception 'Contactpersoon hoort niet bij deze klant of dit object' using errcode='23514';end if;
 insert into public.work_order_contacts(tenant_id,work_order_id,contact_id,roles,snapshot) values(target_tenant,oid,contact.id,array(select jsonb_array_elements_text(item->'roles')),jsonb_build_object('name',contact.full_name,'email',contact.email,'phone',contact.phone));
 end loop;
 if old_checklists<>new_checklists then
 delete from public.work_order_checklists where work_order_id=oid;
 foreach cid in array new_checklists loop
 insert into public.work_order_checklists(tenant_id,work_order_id,template_revision_id,name,definition)
 select target_tenant,oid,v.id,t.name,v.definition from public.work_order_template_versions v join public.work_order_templates t on t.id=v.template_id where v.tenant_id=target_tenant and v.id=cid and v.state='published' and t.kind='checklist';
 if not found then raise exception 'Kies een gepubliceerde checklistversie' using errcode='23514';end if;
 end loop;end if;
 if nullif(input->>'start','') is not null or old_w.projected_start_at is not null or jsonb_array_length(coalesce(input->'assignments','[]'))>0 then
 select * into w from public.work_orders where id=oid;
 planning:=public.change_work_order_planning(target_tenant,oid,w.version,gen_random_uuid(),nullif(input->>'start','')::timestamptz,nullif(input->>'end','')::timestamptz,coalesce(input->'assignments','[]'),array(select jsonb_array_elements_text(coalesce(input->'confirmedWarnings','[]'))));
 if not (planning->>'ok')::boolean then raise exception 'Planning vraagt bevestiging' using errcode='P0001',detail=planning::text;end if;
 end if;
 select * into w from public.work_orders where id=oid;
 r:=jsonb_build_object('ok',true,'id',w.id,'version',w.version);
 insert into private.work_order_commands values(mid,target_tenant,auth.uid(),'save',hash,r,clock_timestamp());
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(target_tenant,auth.uid(),case when old_w.id is null then 'work_order.created' else 'work_order.updated' end,'work_order',w.id,jsonb_build_object('version',w.version,'planningState',w.planning_state));
 return r;
 exception when sqlstate 'P0001' then get stacked diagnostics warn=pg_exception_detail;if warn is null or warn='' then raise;end if;return warn::jsonb||jsonb_build_object('error','Controleer en bevestig de planningswaarschuwingen.');
 end;
end $function$;

CREATE OR REPLACE FUNCTION public.work_order_operational_rows (
  target_tenant   uuid,
  target_customer uuid    DEFAULT NULL::uuid,
  target_object   uuid    DEFAULT NULL::uuid,
  page_offset     integer DEFAULT 0,
  page_size       integer DEFAULT 500,
  open_only       boolean DEFAULT false
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 if private.object_session_active() and private.has_role(target_tenant,array['hr']::public.app_role[]) and not private.has_role(target_tenant,array['tenant_admin','management','planner','finance']::public.app_role[]) then return '[]'::jsonb;end if;
 if not private.work_order_access(target_tenant,false) then raise exception 'Geen operationele werkbontoegang' using errcode='42501';end if;
 if page_offset is null or page_offset<0 or page_size is null or page_size not between 1 and 500 then raise exception 'Ongeldige pagina' using errcode='23514';end if;
 return coalesce((select jsonb_agg(w.row order by w.projected_start_at desc nulls last,w.id) from
 (select to_jsonb(private.staff_work_order_result(wo)) as row,wo.projected_start_at,wo.id from public.work_orders wo where wo.tenant_id=target_tenant and(target_customer is null or wo.customer_id=target_customer) and(target_object is null or wo.object_id=target_object)
 and(not open_only or wo.status not in ('cancelled','completed','returned','under_review','approved','invoice_ready','invoiced')) order by wo.projected_start_at desc nulls last,wo.id limit page_size offset page_offset) w),'[]');
end $function$;

REVOKE ALL ON FUNCTION "public"."work_order_operational_rows"(uuid, uuid, uuid, integer, integer, boolean) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.work_order_operational_task_data (
  target_tenant uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare financial boolean;
begin
 if private.object_session_active() and private.has_role(target_tenant,array['hr']::public.app_role[]) and not private.has_role(target_tenant,array['tenant_admin','management','planner','finance']::public.app_role[]) then return jsonb_build_object('taskRevisions','[]'::jsonb,'workOrderTasks','[]'::jsonb);end if;
 if not private.work_order_access(target_tenant,false) then raise exception 'Geen operationele taakinzage' using errcode='42501';end if;
 financial:=private.work_order_access(target_tenant,true);
 return jsonb_build_object('taskRevisions',coalesce((select jsonb_agg(case when financial then to_jsonb(r) else to_jsonb(r)-array['price_cents','vat_basis_points'] end order by r.revision desc,r.id) from public.task_revisions r where r.tenant_id=target_tenant),'[]'),
 'workOrderTasks',coalesce((select jsonb_agg(case when financial then to_jsonb(t) else (select jsonb_object_agg(key,value) from jsonb_each(to_jsonb(t)) where key=any(array['id','tenant_id','work_order_id','task_revision_id','task_code','task_name','duration_minutes','quantity','unit','is_extra_work','extra_work_status','allowed_for_staff','completed_at','completion_note','added_by','created_at','executed_quantity','execution_state','execution_version','instructions','assigned_personnel_id','scope_root_task_id','transferred_quantity','withdrawn_quantity'])) end order by t.created_at,t.id) from public.work_order_tasks t where t.tenant_id=target_tenant),'[]'));
end $function$;

REVOKE ALL ON FUNCTION "public"."work_order_operational_task_data"(uuid) FROM PUBLIC, "anon", "service_role";

CREATE POLICY "work_orders_staff_projection" ON "public"."work_orders"
  AS RESTRICTIVE
  FOR SELECT
  TO "authenticated"
  USING (private.has_role(tenant_id, ARRAY['tenant_admin'::public.app_role, 'management'::public.app_role, 'finance'::public.app_role]));

GRANT EXECUTE ON FUNCTION "public"."work_order_operational_rows"(uuid, uuid, uuid, integer, integer, boolean) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."work_order_operational_task_data"(uuid) TO "authenticated", "postgres";
