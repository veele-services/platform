SET local check_function_bodies = off;

REVOKE ALL ("emergency_contact") ON TABLE "public"."personnel" FROM "authenticated";

DROP POLICY "certificates_read" ON "public"."certificates";

DROP POLICY "dossier_document_read" ON "public"."dossier_documents";

DROP POLICY "personnel_contracts_read" ON "public"."personnel_contracts";

DROP POLICY "personnel_documents_read" ON "public"."personnel_documents";

DROP POLICY "personnel_notes_read" ON "public"."personnel_notes";

CREATE OR REPLACE FUNCTION private.can_access_storage_object (
  bucket       text,
  object_name  text,
  write_access boolean DEFAULT false
)
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare t uuid:=private.storage_tenant_id(object_name); w uuid:=private.storage_subject_id(object_name);
begin
 if t is null then return false;end if;
 if bucket='branding' then
   if write_access then return private.has_role(t,array['tenant_admin','management']::public.app_role[]);end if;
   return private.is_member(t);
 end if;
 if w is null then return false;end if;
 if bucket in ('reports','signatures') then
   if private.has_role(t,array['tenant_admin','management','planner']::public.app_role[]) then return true;end if;
   if bucket<>'reports' or not private.is_work_order_assignee(t,w) or not private.owns_report_path(t,w,object_name) then return false;end if;
   if not write_access then return true;end if;
   return exists(select 1 from public.work_orders wo where wo.tenant_id=t and wo.id=w and wo.status in ('seen','travelling','in_progress','correction_required'));
 elsif bucket='invoices' then
   return private.has_role(t,array['tenant_admin','management','finance']::public.app_role[]);
 elsif bucket='personnel-documents' then
   if private.has_role(t,array['tenant_admin','management','hr']::public.app_role[]) then return true;end if;
   return not write_access and w=private.current_personnel_id(t)
     and exists(select 1 from public.personnel_documents d where d.tenant_id=t
       and d.personnel_id=w and d.storage_path=object_name and d.visible_to_employee and not d.dossier_managed);
 end if;
 return false;
end;
$function$;

CREATE OR REPLACE FUNCTION private.can_read_personnel_document (
  target_tenant   uuid,
  target_document uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select private.object_session_active() and private.service_enabled(target_tenant,'personeel')
 and exists(select 1 from public.personnel_documents d where d.tenant_id=target_tenant and d.id=target_document
   and (private.dossier_access(target_tenant) or
     (private.has_role(target_tenant,array['staff']::public.app_role[])
       and d.personnel_id=private.current_personnel_id(target_tenant)
       and d.visible_to_employee and not d.dossier_managed)));
$function$;

CREATE OR REPLACE FUNCTION public.personnel_document_file (
  target_tenant   uuid,
  target_document uuid
)
  RETURNS TABLE (
    id           uuid,
    tenant_id    uuid,
    personnel_id uuid,
    storage_path text,
    file_name    text,
    mime_type    text,
    sha256       text
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select d.id,d.tenant_id,d.personnel_id,d.storage_path,d.file_name,d.mime_type,d.sha256
 from public.personnel_documents d where d.tenant_id=target_tenant and d.id=target_document
 and private.can_read_personnel_document(target_tenant,target_document);
$function$;

REVOKE ALL ON FUNCTION "public"."personnel_document_file"(uuid, uuid) FROM PUBLIC, "anon", "service_role";

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
 if not private.object_session_active() or not private.has_role(target_tenant,array['staff']::public.app_role[]) or not private.service_enabled(target_tenant,'personeel') then raise exception 'Personeelstoegang vereist' using errcode='42501';end if;
 select p.id into pid from public.personnel p where p.tenant_id=target_tenant and p.user_id=auth.uid() and p.status='active';
 select coalesce(array_agg(w.id),'{}') into ids from public.work_orders w where w.tenant_id=target_tenant and private.is_work_order_assignee(target_tenant,w.id);
 select jsonb_build_object(
 'customers',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'tenant_id',c.tenant_id,'name',c.name)) from public.customers c where c.tenant_id=target_tenant and exists(select 1 from public.work_orders w where w.id=any(ids) and w.customer_id=c.id)),'[]'),
 'objects',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'tenant_id',o.tenant_id,'name',o.name,'address',o.address)) from public.objects o where o.tenant_id=target_tenant and exists(select 1 from public.work_orders w where w.id=any(ids) and w.object_id=o.id)),'[]'),
 'personnel',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'tenant_id',p.tenant_id,'user_id',p.user_id,'employee_number',p.employee_number,'full_name',p.full_name,'status',p.status)) from public.personnel p where p.tenant_id=target_tenant and p.id=pid),'[]'),
 'workOrders',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'tenant_id',w.tenant_id,'customer_id',w.customer_id,'object_id',w.object_id,'work_order_number',w.work_order_number,'discipline',w.discipline,'title',w.title,'status',w.status,'version',w.version,'report_version',w.report_version,'report_state',w.report_state,'signature_required',w.signature_required,'day_instructions',w.day_instructions,'projected_start_at',w.projected_start_at,'projected_end_at',w.projected_end_at,'actual_start_at',w.actual_start_at,'actual_end_at',w.actual_end_at)) from public.work_orders w where w.id=any(ids)),'[]'),
 'assignments',coalesce((select jsonb_agg(to_jsonb(a)-'qualification_snapshot') from public.work_order_assignments a where a.tenant_id=target_tenant and a.work_order_id=any(ids) and a.personnel_id=pid),'[]'),
 'workOrderTasks',coalesce((select jsonb_agg(private.staff_task_dto(t)) from public.work_order_tasks t where t.tenant_id=target_tenant and t.work_order_id=any(ids)),'[]'),
 'tasks',coalesce((select jsonb_agg(to_jsonb(c)) from public.task_catalog c where c.tenant_id=target_tenant),'[]'),
 'taskRevisions',coalesce((select jsonb_agg(to_jsonb(r)-array['price_cents','vat_basis_points']) from public.task_revisions r where r.tenant_id=target_tenant),'[]'),
 'reports',coalesce((select jsonb_agg(to_jsonb(e)) from public.report_entries e where e.tenant_id=target_tenant and e.work_order_id=any(ids) and e.author_user_id=auth.uid() and e.deleted_at is null),'[]'),
 'attachments',coalesce((select jsonb_agg(to_jsonb(a)-array['storage_path','storage_bucket']) from public.attachments a where a.tenant_id=target_tenant and a.work_order_id=any(ids) and a.uploaded_by=auth.uid() and private.owns_report_path(a.tenant_id,a.work_order_id,a.storage_path) and a.deleted_at is null),'[]'),
 'signatures',coalesce((select jsonb_agg(to_jsonb(s)-array['storage_path']) from public.signatures s where s.tenant_id=target_tenant and s.work_order_id=any(ids) and s.captured_by=auth.uid()),'[]'),
 'timeEntries',coalesce((select jsonb_agg(to_jsonb(e)) from public.time_entries e where e.tenant_id=target_tenant and e.personnel_id=pid),'[]'),
 'announcements',coalesce((select jsonb_agg(to_jsonb(a)) from public.announcements a where a.tenant_id=target_tenant and a.published_at<=clock_timestamp() and a.withdrawn_at is null and 'staff'=any(a.audience_roles)),'[]'),
 'announcementReads',coalesce((select jsonb_agg(to_jsonb(a)) from public.announcement_reads a where a.tenant_id=target_tenant and a.user_id=auth.uid()),'[]'),
 'openShifts',coalesce((select jsonb_agg(to_jsonb(a)) from public.open_shifts a where a.tenant_id=target_tenant and a.status='open'),'[]'),
 'shiftInterests',coalesce((select jsonb_agg(to_jsonb(a)) from public.shift_interests a where a.tenant_id=target_tenant and a.personnel_id=pid),'[]'),
 'personnelDocuments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'tenant_id',a.tenant_id,'personnel_id',a.personnel_id,'title',a.title,'file_name',a.file_name,'version',a.version,'visible_to_employee',a.visible_to_employee)) from public.personnel_documents a where a.tenant_id=target_tenant and a.personnel_id=pid and a.visible_to_employee and not a.dossier_managed),'[]'),
 'extraWorkRules',coalesce((select jsonb_agg(to_jsonb(a)) from public.extra_work_rules a where a.tenant_id=target_tenant and a.active),'[]'),
 'allowedExtraWork',coalesce((select jsonb_agg(to_jsonb(a)) from public.work_order_allowed_extra_work a where a.tenant_id=target_tenant and a.work_order_id=any(ids)),'[]'),
 'travelLegs',coalesce((select jsonb_agg(to_jsonb(l)-array['origin_address','destination_address']) from public.travel_legs l join public.work_order_assignments a on a.id=l.assignment_id and a.tenant_id=l.tenant_id where a.tenant_id=target_tenant and a.personnel_id=pid and a.work_order_id=any(ids)),'[]')) into result;
 return result;
end $function$;

CREATE POLICY "certificates_read" ON "public"."certificates"
  FOR SELECT
  TO "authenticated"
  USING (private.dossier_access(tenant_id));

CREATE POLICY "dossier_document_read" ON "public"."dossier_documents"
  FOR SELECT
  TO "authenticated"
  USING ((private.object_session_active() AND
CASE source_kind
    WHEN 'customer'::text THEN (EXISTS ( SELECT 1
       FROM public.customer_documents d
      WHERE ((d.tenant_id = dossier_documents.tenant_id) AND (d.id = dossier_documents.source_id))))
    WHEN 'object'::text THEN (EXISTS ( SELECT 1
       FROM public.object_documents d
      WHERE ((d.tenant_id = dossier_documents.tenant_id) AND (d.id = dossier_documents.source_id))))
    WHEN 'personnel'::text THEN private.can_read_personnel_document(tenant_id, source_id)
    ELSE false
END));

CREATE POLICY "personnel_contracts_read" ON "public"."personnel_contracts"
  FOR SELECT
  TO "authenticated"
  USING (private.dossier_access(tenant_id));

CREATE POLICY "personnel_documents_read" ON "public"."personnel_documents"
  FOR SELECT
  TO "authenticated"
  USING (private.dossier_access(tenant_id));

CREATE POLICY "personnel_notes_read" ON "public"."personnel_notes"
  FOR SELECT
  TO "authenticated"
  USING (private.dossier_access(tenant_id));

REVOKE ALL ON FUNCTION "private"."can_read_personnel_document"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."can_read_personnel_document"(uuid, uuid) TO "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."personnel_document_file"(uuid, uuid) TO "authenticated", "postgres";
