begin;
SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.work_order_row (
  target_order uuid,
  fin          boolean
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 -- module-scoped work-order summaries
 select jsonb_build_object('id',w.id,'number',w.work_order_number,'title',coalesce(nullif(w.title,''),w.discipline),'customerId',w.customer_id,'customer',c.name,'objectId',w.object_id,'object',o.name,
 'address',concat_ws(', ',o.address->>'street',o.address->>'postal_code',o.address->>'city'),'discipline',w.discipline,'priority',w.priority,'source',w.source_kind,
 'start',w.projected_start_at,'end',w.projected_end_at,'deadline',w.deadline,'version',w.version,'status',w.status,'planningState',w.planning_state,
 'reportState',coalesce(to_jsonb(w)->>'report_state',case when w.status='correction_required' then 'correction' when w.status in ('invoice_ready','invoiced','approved') then 'approved' when w.status in ('completed','under_review') then 'review' else 'draft' end),
 'billingState',case when not fin then null when not private.service_enabled(w.tenant_id,'finance') then 'unavailable' when w.status='invoiced' then 'invoiced' when exists(select 1 from public.invoice_lines i where i.work_order_id=w.id) then 'partial' when w.status='invoice_ready' then 'ready' else 'not_ready' end,
 'signatureRequired',w.signature_required,'signatureState',case when not private.service_enabled(w.tenant_id,'rapportage') then 'unavailable' when exists(select 1 from public.work_order_signature_waivers x join public.work_order_report_versions r on r.id=x.report_id where r.work_order_id=w.id and r.version=w.report_version and r.state not in ('superseded','correction')) then 'waived' when exists(select 1 from public.signatures s where s.work_order_id=w.id and s.report_version=w.report_version and s.revoked_at is null and s.signature_kind='customer') then 'signed' when w.signature_required then 'waiting' when w.signature_mode='optional' then 'optional' else 'not_required' end,
 'requiredPersonnel',w.required_personnel,'assignedPersonnel',(select count(*) from public.work_order_assignments a where a.work_order_id=w.id and a.status not in ('cancelled','returned')),
 'crew',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'status',a.status,'start',a.projected_start_at,'end',a.projected_end_at) order by p.full_name,p.id) from public.work_order_assignments a join public.personnel p on p.tenant_id=a.tenant_id and p.id=a.personnel_id where a.work_order_id=w.id and a.status not in ('cancelled','returned')),'[]'),
 'archived',w.archive_at is not null,'canEdit',w.actual_start_at is null and w.status in ('planned','released','seen','travelling') and w.archive_at is null,
 'canDelete',w.planning_state='draft' and w.published_at is null and w.request_id is null and w.quote_id is null and not exists(select 1 from public.work_order_assignments a where a.work_order_id=w.id) and not exists(select 1 from public.report_entries r where r.work_order_id=w.id),
 'category',case when w.status in ('invoice_ready','invoiced','approved','cancelled') then 'completed' when w.status in ('completed','returned','under_review','correction_required') then 'handling' when w.status in ('in_progress','travelling') then 'running' when w.projected_start_at is not null and (select count(*) from public.work_order_assignments a where a.work_order_id=w.id and a.status not in ('cancelled','returned'))>=w.required_personnel then 'planned' else 'unassigned' end)
 from public.work_orders w join public.customers c on c.tenant_id=w.tenant_id and c.id=w.customer_id join public.objects o on o.tenant_id=w.tenant_id and o.id=w.object_id where w.id=target_order
$function$;

notify pgrst,'reload schema';
commit;
