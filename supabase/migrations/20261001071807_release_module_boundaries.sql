BEGIN;

SET local check_function_bodies = off;

DROP POLICY "tenant_settings_manage_delete" ON "public"."tenant_settings";

DROP POLICY "tenant_settings_manage_insert" ON "public"."tenant_settings";

DROP TRIGGER "tenant_settings_protect_platform_entitlements" ON "public"."tenant_settings";

CREATE OR REPLACE FUNCTION private.protect_platform_entitlements()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare caller_role text:=coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
 nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','');
begin
 if caller_role<>'service_role' then
  if tg_op in ('INSERT','DELETE') and caller_role in ('authenticated','anon') then
   raise exception 'De platformbeheerder beheert de tenantinstellingenregistratie' using errcode='42501';
  elsif tg_op='UPDATE' and (new.tenant_id,new.enabled_services,new.white_label_enabled)
    is distinct from (old.tenant_id,old.enabled_services,old.white_label_enabled) then
   raise exception 'Tenantkoppeling, modules en whitelabel worden door het platform beheerd' using errcode='42501';
  end if;
 end if;
 return case when tg_op='DELETE' then old else new end;
end $function$;

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
  -- module-scoped dispatch retry
  if not private.service_enabled(target.tenant_id,'planning') then
    raise exception 'De module Planning is niet ingeschakeld' using errcode='42501';
  end if;
  if expected_version is null or expected_version<1 or nullif(btrim(idempotency_key),'') is null then
    raise exception 'Versie en herhaalcode zijn verplicht' using errcode='23514';
  end if;
  if exists(select 1 from public.dispatches d left join public.work_order_assignments a
    on a.id=d.assignment_id and a.tenant_id=d.tenant_id
    where d.tenant_id=target.tenant_id and d.idempotency_key=dispatch_work_order.idempotency_key
    and (d.work_order_id is distinct from target.id or a.work_order_id is distinct from target.id
      or a.personnel_id is distinct from target_personnel_id)) then
    raise exception 'Deze herhaalcode hoort bij een andere werkbon of medewerker' using errcode='23505';
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

CREATE OR REPLACE FUNCTION public.staff_workspace (
  target_tenant uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare ids uuid[];pid uuid;result jsonb;
begin
 -- module-scoped staff workspace
 if not private.object_session_active() or not private.has_role(target_tenant,array['staff']::public.app_role[]) or not private.service_enabled(target_tenant,'personeel') then raise exception 'Personeelstoegang vereist' using errcode='42501';end if;
 select p.id into pid from public.personnel p where p.tenant_id=target_tenant and p.user_id=auth.uid() and p.status='active';
 select coalesce(array_agg(w.id),'{}') into ids from public.work_orders w where w.tenant_id=target_tenant and private.service_enabled(target_tenant,'planning') and private.is_work_order_assignee(target_tenant,w.id);
 select jsonb_build_object(
 'customers',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'tenant_id',c.tenant_id,'name',c.name)) from public.customers c where c.tenant_id=target_tenant and exists(select 1 from public.work_orders w where w.id=any(ids) and w.customer_id=c.id)),'[]'),
 'objects',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'tenant_id',o.tenant_id,'name',o.name,'address',o.address)) from public.objects o where o.tenant_id=target_tenant and exists(select 1 from public.work_orders w where w.id=any(ids) and w.object_id=o.id)),'[]'),
 'personnel',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'tenant_id',p.tenant_id,'user_id',p.user_id,'employee_number',p.employee_number,'full_name',p.full_name,'status',p.status)) from public.personnel p where p.tenant_id=target_tenant and p.id=pid),'[]'),
 'workOrders',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'tenant_id',w.tenant_id,'customer_id',w.customer_id,'object_id',w.object_id,'work_order_number',w.work_order_number,'discipline',w.discipline,'title',w.title,'status',w.status,'version',w.version,'report_version',w.report_version,'report_state',w.report_state,'signature_required',w.signature_required,'day_instructions',w.day_instructions,'projected_start_at',w.projected_start_at,'projected_end_at',w.projected_end_at,'actual_start_at',w.actual_start_at,'actual_end_at',w.actual_end_at)) from public.work_orders w where w.id=any(ids)),'[]'),
 'assignments',coalesce((select jsonb_agg(to_jsonb(a)-'qualification_snapshot') from public.work_order_assignments a where a.tenant_id=target_tenant and a.work_order_id=any(ids) and a.personnel_id=pid),'[]'),
 'workOrderTasks',coalesce((select jsonb_agg(private.staff_task_dto(t)) from public.work_order_tasks t where t.tenant_id=target_tenant and t.work_order_id=any(ids)),'[]'),
 'tasks',coalesce((select jsonb_agg(to_jsonb(c)) from public.task_catalog c where private.service_enabled(target_tenant,'planning') and c.tenant_id=target_tenant),'[]'),
 'taskRevisions',coalesce((select jsonb_agg(to_jsonb(r)-array['price_cents','vat_basis_points']) from public.task_revisions r where private.service_enabled(target_tenant,'planning') and r.tenant_id=target_tenant),'[]'),
 'reports',coalesce((select jsonb_agg(to_jsonb(e)) from public.report_entries e where private.service_enabled(target_tenant,'rapportage') and e.tenant_id=target_tenant and e.work_order_id=any(ids) and e.author_user_id=auth.uid() and e.deleted_at is null),'[]'),
 'attachments',coalesce((select jsonb_agg(to_jsonb(a)-array['storage_path','storage_bucket']) from public.attachments a where private.service_enabled(target_tenant,'rapportage') and a.tenant_id=target_tenant and a.work_order_id=any(ids) and a.uploaded_by=auth.uid() and private.owns_report_path(a.tenant_id,a.work_order_id,a.storage_path) and a.deleted_at is null),'[]'),
 'signatures',coalesce((select jsonb_agg(to_jsonb(s)-array['storage_path']) from public.signatures s where private.service_enabled(target_tenant,'rapportage') and s.tenant_id=target_tenant and s.work_order_id=any(ids) and s.captured_by=auth.uid()),'[]'),
 'timeEntries',coalesce((select jsonb_agg(to_jsonb(e)) from public.time_entries e where e.tenant_id=target_tenant and e.personnel_id=pid),'[]'),
 'announcements',coalesce((select jsonb_agg(to_jsonb(a)) from public.announcements a where a.tenant_id=target_tenant and a.published_at<=clock_timestamp() and a.withdrawn_at is null and 'staff'=any(a.audience_roles)),'[]'),
 'announcementReads',coalesce((select jsonb_agg(to_jsonb(a)) from public.announcement_reads a where a.tenant_id=target_tenant and a.user_id=auth.uid()),'[]'),
 'openShifts',coalesce((select jsonb_agg(to_jsonb(a)) from public.open_shifts a where private.service_enabled(target_tenant,'planning') and a.tenant_id=target_tenant and a.status='open'),'[]'),
 'shiftInterests',coalesce((select jsonb_agg(to_jsonb(a)) from public.shift_interests a where private.service_enabled(target_tenant,'planning') and a.tenant_id=target_tenant and a.personnel_id=pid),'[]'),
 'personnelDocuments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'tenant_id',a.tenant_id,'personnel_id',a.personnel_id,'title',a.title,'file_name',a.file_name,'version',a.version,'visible_to_employee',a.visible_to_employee)) from public.personnel_documents a where a.tenant_id=target_tenant and a.personnel_id=pid and a.visible_to_employee and not a.dossier_managed),'[]'),
 'extraWorkRules',coalesce((select jsonb_agg(to_jsonb(a)) from public.extra_work_rules a where private.service_enabled(target_tenant,'planning') and private.service_enabled(target_tenant,'rapportage') and a.tenant_id=target_tenant and a.active),'[]'),
 'allowedExtraWork',coalesce((select jsonb_agg(to_jsonb(a)) from public.work_order_allowed_extra_work a where private.service_enabled(target_tenant,'rapportage') and a.tenant_id=target_tenant and a.work_order_id=any(ids)),'[]'),
 'travelLegs',coalesce((select jsonb_agg(to_jsonb(l)-array['origin_address','destination_address']) from public.travel_legs l join public.work_order_assignments a on a.id=l.assignment_id and a.tenant_id=l.tenant_id where a.tenant_id=target_tenant and a.personnel_id=pid and a.work_order_id=any(ids)),'[]')) into result;
 return result;
end $function$;

CREATE OR REPLACE FUNCTION public.work_order_dossier (
  target_tenant uuid,
  target_order  uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare w public.work_orders;fin boolean;manage boolean;r jsonb;
begin
 -- module-scoped work-order dossier
 if not private.work_order_access(target_tenant) then raise exception 'Geen toegang tot werkbonnen' using errcode='42501';end if;
 select * into w from public.work_orders where tenant_id=target_tenant and id=target_order;
 if not found then return null;end if;
 fin:=private.work_order_access(target_tenant,true);manage:=private.has_role(target_tenant,array['tenant_admin','management','planner']::public.app_role[]);
 select jsonb_build_object('order',private.work_order_row(w.id,fin)||jsonb_build_object('description',w.description,'labels',w.labels,'instructions',w.day_instructions,
 'customerReference',coalesce(w.details->>'customerReference',''),'purchaseOrder',coalesce(w.details->>'purchaseOrder',''),'costCenter',coalesce(w.details->>'costCenter',''),'locationLabel',coalesce(w.details->>'locationLabel',''),
 'leadPersonnelId',w.lead_personnel_id,'plannerId',w.planner_user_id,'requestedDate',w.requested_date,'windowStart',s.starts_at,'windowEnd',s.ends_at,'windowKind',w.customer_window_kind,'durationMinutes',w.budget_labor_minutes,
 'signatureMode',w.signature_mode,'employeeSignatureRequired',w.employee_signature_required,'publishedAt',w.published_at,'templateSnapshot',w.template_snapshot,'templateRevisionId',w.template_snapshot->>'id','requestId',w.request_id,'quoteId',w.quote_id),
 'finance',fin,'canManage',manage,'canReview',private.service_enabled(target_tenant,'rapportage') and private.has_role(target_tenant,array['tenant_admin','management','finance']::public.app_role[]),
 'contacts',coalesce((select jsonb_agg(jsonb_build_object('id',c.contact_id,'name',c.snapshot->>'name','roles',c.roles,'email',c.snapshot->>'email','phone',c.snapshot->>'phone') order by c.snapshot->>'name') from public.work_order_contacts c where c.work_order_id=w.id),'[]'),
 'tasks',coalesce((select jsonb_agg(case when fin then to_jsonb(t) else to_jsonb(t)-'unit_price_cents'-'vat_basis_points'-'commercial_snapshot' end order by t.created_at,t.id) from public.work_order_tasks t where t.work_order_id=w.id),'[]'),
 'assignments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'personnelId',p.id,'name',p.full_name,'start',a.projected_start_at,'end',a.projected_end_at,'status',a.status,'seenAt',(select min(created_at) from public.status_events e where e.assignment_id=a.id and e.new_status='seen'),'actualStart',a.actual_start_at,'actualEnd',a.actual_end_at) order by a.projected_start_at,a.id) from public.work_order_assignments a join public.personnel p on p.tenant_id=a.tenant_id and p.id=a.personnel_id where a.work_order_id=w.id),'[]'),
 'times',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'personnelId',p.id,'name',p.full_name,'start',t.starts_at,'end',t.ends_at,'kind',t.kind,'status',t.status) order by t.starts_at,t.id) from public.time_entries t join public.work_order_assignments a on a.id=t.assignment_id join public.personnel p on p.id=t.personnel_id where private.service_enabled(target_tenant,'personeel') and a.work_order_id=w.id and t.tenant_id=w.tenant_id),'[]'),
 'checklists',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'revisionId',v.id,'name',c.name,'version',v.version,'questions',c.definition->'questions','answers',coalesce((select jsonb_agg(jsonb_build_object('questionId',a.question_id,'value',a.value,'notApplicable',a.not_applicable,'reason',a.reason,'attachmentId',a.attachment_id,'version',a.version,'actor',a.updated_by,'updatedAt',a.updated_at) order by a.question_id) from public.work_order_checklist_answers a where a.checklist_id=c.id),'[]')) order by c.created_at,c.id) from public.work_order_checklists c join public.work_order_template_versions v on v.id=c.template_revision_id where c.work_order_id=w.id),'[]'),
 'reports',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'body',r.body,'created_at',r.created_at,'customer_visible',r.customer_visible) order by r.created_at,r.id) from public.report_entries r where private.service_enabled(target_tenant,'rapportage') and r.work_order_id=w.id and r.deleted_at is null),'[]'),
 'attachments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'file_name',a.file_name,'mime_type',a.mime_type,'created_at',a.created_at) order by a.created_at,a.id) from public.attachments a where private.service_enabled(target_tenant,'rapportage') and a.work_order_id=w.id and a.deleted_at is null),'[]'),
 'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.at desc,h.id) from (
 select e.id,e.created_at at,e.actor_user_id::text actor,'status.'||e.new_status::text event,e.note from public.status_events e where e.work_order_id=w.id
 union all select e.id,e.created_at,e.actor_user_id::text,e.action,null from public.audit_events e where e.tenant_id=w.tenant_id and e.entity_type='work_order' and e.entity_id=w.id
 )h),'[]')) into r from (select 1) dummy left join public.appointment_slots s on s.id=w.appointment_slot_id;
 return r;
end $function$;

CREATE TRIGGER tenant_settings_protect_platform_entitlements
  BEFORE INSERT OR DELETE OR UPDATE ON public.tenant_settings
  FOR EACH ROW
  EXECUTE FUNCTION private.protect_platform_entitlements();

REVOKE ALL ON TABLE "public"."tenant_settings" FROM "authenticated";

GRANT SELECT, UPDATE ON TABLE "public"."tenant_settings" TO "authenticated";

NOTIFY pgrst, 'reload schema';
COMMIT;
