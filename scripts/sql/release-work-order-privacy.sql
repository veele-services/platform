-- Shared order access is not authority over a colleague's individual work.
create or replace function private.task_execution_allowed(task public.work_order_tasks)
returns boolean language sql stable security definer set search_path='' as $$
 select private.object_manage(task.tenant_id) or (
   private.is_work_order_assignee(task.tenant_id,task.work_order_id)
   and (task.assigned_personnel_id is null or task.assigned_personnel_id=private.current_personnel_id(task.tenant_id)))
$$;
revoke all on function private.task_execution_allowed(public.work_order_tasks) from public,anon,authenticated,service_role;

create or replace function private.staff_task_dto(task public.work_order_tasks)
returns jsonb language sql stable security definer set search_path='' as $$
 select (select jsonb_object_agg(key,value) from jsonb_each(to_jsonb(task)) where key=any(array[
  'id','tenant_id','work_order_id','task_revision_id','task_code','task_name','quantity','unit','duration_minutes','is_extra_work','extra_work_status',
  'completed_at','created_at','updated_at','executed_quantity','execution_state','execution_version','instructions','scope_root_task_id','transferred_quantity','withdrawn_quantity']))
  ||jsonb_build_object('assigned_personnel_id',case when task.assigned_personnel_id=private.current_personnel_id(task.tenant_id) then task.assigned_personnel_id end,
    'completion_note',case when exists(select 1 from public.work_order_task_contributions c where c.tenant_id=task.tenant_id and c.task_id=task.id and c.execution_version=task.execution_version and c.actor_id=auth.uid()) then task.completion_note end,
    'can_execute',private.task_execution_allowed(task))
$$;
revoke all on function private.staff_task_dto(public.work_order_tasks) from public,anon,authenticated,service_role;

-- Composite RPC compatibility is retained, but new columns never implicitly
-- cross the staff boundary. All non-operational fields remain SQL NULL.
create or replace function private.staff_work_order_result(w public.work_orders)
returns public.work_orders language sql stable security definer set search_path='' as $$
 select case when private.has_role(w.tenant_id,array['tenant_admin','management','finance']::public.app_role[]) then w
 else jsonb_populate_record(null::public.work_orders,(select jsonb_object_agg(key,value) from jsonb_each(to_jsonb(w)) where key=any(array[
 'id','tenant_id','work_order_number','customer_id','object_id','discipline','title','description','day_instructions','priority',
 'status','version','report_version','report_state','signature_required','signature_mode','employee_signature_required',
 'planned_start_at','planned_end_at','projected_start_at','projected_end_at','actual_start_at','actual_end_at',
 'created_at','updated_at','required_personnel','planning_state','requested_date','duration_minutes','location_label']))) end
$$;
revoke all on function private.staff_work_order_result(public.work_orders) from public,anon,authenticated,service_role;

do $$ declare definition text;begin
 definition:=pg_get_functiondef('public.complete_work_order_task(uuid,boolean,text)'::regprocedure);
 if position('private.task_execution_allowed(task)' in definition)=0 then
  definition:=replace(definition,'if work.status not in', 'if not private.task_execution_allowed(task) then raise exception ''Deze taak is aan een andere medewerker toegewezen'' using errcode=''42501'';end if;'||chr(10)||' if work.status not in');
  definition:=replace(definition,'result.unit_price_cents:=0;', 'result:=jsonb_populate_record(null::public.work_order_tasks,private.staff_task_dto(result));result.unit_price_cents:=0;');
  if position('private.task_execution_allowed(task)' in definition)=0 or position('private.staff_task_dto(result)' in definition)=0 then raise exception 'Task completion contract changed';end if;
  execute definition;
 end if;
 definition:=pg_get_functiondef('public.record_task_execution(uuid,uuid,bigint,text,numeric,text)'::regprocedure);
 if position('private.task_execution_allowed(task)' in definition)=0 then
  definition:=replace(definition,'if task.execution_version<>expected_version then', 'if not private.task_execution_allowed(task) then raise exception ''Deze taak is aan een andere medewerker toegewezen'' using errcode=''42501'';end if;'||chr(10)||' if task.execution_version<>expected_version then');
  if position('private.task_execution_allowed(task)' in definition)=0 then raise exception 'Task execution contract changed';end if;
  execute definition;
 end if;
 definition:=pg_get_functiondef('public.staff_workspace(uuid)'::regprocedure);
 if position('private.staff_task_dto(t)' in definition)=0 then
  definition:=replace(definition,'to_jsonb(t)-array[''unit_price_cents'',''vat_basis_points'',''commercial_snapshot'',''agreement_line_id'']','private.staff_task_dto(t)');
  if position('private.staff_task_dto(t)' in definition)=0 then raise exception 'Staff task projection contract changed';end if;
  execute definition;
 end if;
end $$;
-- Checklist values belong to their author. Shared conditional progress is a
-- separate boolean-only projection; knowing an answer version never grants edit.
do $$ declare definition text;needle text;begin
 definition:=pg_get_functiondef('public.answer_work_order_checklist(uuid,jsonb)'::regprocedure);
 if position('Checklistantwoord is niet van jou' in definition)=0 then
  needle:='if coalesce(a.version,0)<>coalesce((input->>''version'')::bigint,0)';
  if position(needle in definition)=0 then raise exception 'Checklist answer version contract changed';end if;
  definition:=replace(definition,needle,
   'if a.id is not null and a.updated_by<>auth.uid() and not private.planning_access(target_tenant) then raise exception ''Checklistantwoord is niet van jou; vraag de backoffice om een correctie'' using errcode=''42501'';end if;
   if attachment is not null and not private.planning_access(target_tenant) and not exists(select 1 from public.attachments proof where proof.tenant_id=target_tenant and proof.work_order_id=w.id and proof.id=attachment and proof.uploaded_by=auth.uid()) then raise exception ''Kies een eigen bewijsfoto'' using errcode=''42501'';end if;
   '||needle);
  execute definition;
 end if;
end $$;
