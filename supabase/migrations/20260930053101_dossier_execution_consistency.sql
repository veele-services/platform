SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.agreement_scope_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare l public.customer_agreement_lines; a public.customer_agreements; o uuid; w public.work_orders; business_day date; candidates uuid[];
begin
 if tg_table_name='work_order_tasks' then
 if tg_op='INSERT' and new.agreement_line_id is null and not new.is_extra_work and new.unit_price_cents>0 then
  select * into w from public.work_orders where tenant_id=new.tenant_id and id=new.work_order_id;
  select array_agg(distinct l1.id) into candidates from public.object_records r join public.customer_agreement_lines l1 on l1.id=r.agreement_line_id join public.customer_agreements a1 on a1.id=l1.agreement_id
  where a1.state='active' and r.tenant_id=new.tenant_id and r.object_id=w.object_id and r.kind='programme' and r.state='active' and r.task_revision_id=new.task_revision_id
  and a1.starts_on<=(w.projected_start_at at time zone (select timezone from public.tenants where id=new.tenant_id))::date and (a1.ends_on is null or a1.ends_on>=((w.projected_end_at - interval '1 microsecond') at time zone (select timezone from public.tenants where id=new.tenant_id))::date)
  and not exists(select 1 from public.customer_agreements next_a where next_a.previous_id=a1.id and next_a.starts_on<=(w.projected_start_at at time zone (select timezone from public.tenants where id=new.tenant_id))::date)
  ;
  if cardinality(candidates)>1 then raise exception 'Meerdere contractregels zijn van toepassing. Kies de concrete contractregel voor deze uitvoering' using errcode='23514';end if;
  select * into l from public.customer_agreement_lines where id=candidates[1];
  if l.id is null and exists(select 1 from public.object_records r where r.tenant_id=new.tenant_id and r.object_id=w.object_id and r.kind='programme' and r.state='active' and r.task_revision_id=new.task_revision_id and r.agreement_line_id is not null) then raise exception 'Het werkprogramma heeft geen geldige contractversie voor dit bezoek. Werk eerst de klantafspraak bij' using errcode='23514';end if;
  if l.id is not null then new.agreement_line_id:=l.id;new.unit_price_cents:=l.price_cents;end if;
 end if;
 end if;
 if new.agreement_line_id is null then return new;end if;
 select * into l from public.customer_agreement_lines where tenant_id=new.tenant_id and id=new.agreement_line_id;
 select * into a from public.customer_agreements where tenant_id=new.tenant_id and id=l.agreement_id;
 if tg_table_name='object_records' then o:=new.object_id;else select * into w from public.work_orders where tenant_id=new.tenant_id and id=new.work_order_id;o:=w.object_id;end if;
 if l.id is null or l.object_id<>o or l.task_revision_id is distinct from new.task_revision_id or not exists(select 1 from public.objects where tenant_id=new.tenant_id and id=o and customer_id=a.customer_id) then raise exception 'De afspraak hoort niet bij dit object of deze catalogustaak' using errcode='23514';end if;
 if tg_table_name='work_order_tasks' then
  if tg_op='UPDATE' and (old.agreement_line_id is distinct from new.agreement_line_id or old.commercial_snapshot is distinct from new.commercial_snapshot) then raise exception 'De vastgelegde commerciële bron is onveranderlijk' using errcode='23514';end if;
  if tg_op='INSERT' then
   business_day:=(coalesce(w.projected_start_at,clock_timestamp()) at time zone (select timezone from public.tenants where id=new.tenant_id))::date;
   if a.state<>'active' or a.starts_on>business_day or a.ends_on<((coalesce(w.projected_end_at,w.projected_start_at,clock_timestamp())-interval '1 microsecond') at time zone (select timezone from public.tenants where id=new.tenant_id))::date or exists(select 1 from public.customer_agreements n where n.previous_id=a.id and n.starts_on<=business_day) then raise exception 'Kies de geldige contractversie voor deze uitvoering' using errcode='23514';end if;
   if new.quantity>l.quantity or new.unit_price_cents<>l.price_cents or round(new.quantity*new.unit_price_cents)>l.limit_cents then raise exception 'Deze uitvoering overschrijdt de contractafspraak' using errcode='23514';end if;
   new.commercial_snapshot:=jsonb_build_object('agreementId',a.id,'version',a.version,'lineId',l.id,'scope',l.scope,'quantity',l.quantity,'limitCents',l.limit_cents,'priceCents',l.price_cents,'acceptedBy',a.accepted_by_name,'acceptedOn',a.accepted_on,'evidenceDocumentId',a.evidence_document_id);
  end if;
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.finalize_invoice_snapshot (
  target_invoice_id uuid
)
  RETURNS public.invoices
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  target public.invoices;
  seq public.invoice_sequences;
  prefix text;
  next_number bigint;
  result public.invoices;
  lines jsonb;
  customer_data jsonb;
  branding_data jsonb;
  calculated_subtotal bigint;
  calculated_vat bigint;
  calculated_total bigint;
  business_day date;
begin
  select * into target from public.invoices i where i.id = target_invoice_id for update;
  if not found then raise exception 'Invoice not found' using errcode = 'P0002'; end if;
  if not private.has_role(target.tenant_id, array['tenant_admin','management','finance']::public.app_role[]) then
    raise exception 'Finance role required' using errcode = '42501';
  end if;
  business_day:=(clock_timestamp() at time zone (select timezone from public.tenants where id=target.tenant_id))::date;
  if target.status <> 'draft' then return target; end if;
  if not exists (select 1 from public.invoice_lines l where l.tenant_id = target.tenant_id and l.invoice_id = target.id) then
    raise exception 'Invoice must contain at least one line' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.invoice_lines l
    join public.work_orders w on w.tenant_id = l.tenant_id and w.id = l.work_order_id
    where l.tenant_id = target.tenant_id and l.invoice_id = target.id
      and (w.customer_id <> target.customer_id or w.status <> 'invoice_ready')
  ) then
    raise exception 'All source work orders must be approved and belong to the invoice customer' using errcode = '23514';
  end if;

  select
    coalesce(sum(l.subtotal_cents),0)::bigint,
    coalesce(sum(l.vat_cents),0)::bigint,
    coalesce(sum(l.total_cents),0)::bigint,
    jsonb_agg(to_jsonb(l) - 'id' - 'tenant_id' - 'invoice_id' order by l.created_at, l.id)
  into calculated_subtotal, calculated_vat, calculated_total, lines
  from public.invoice_lines l
  where l.tenant_id = target.tenant_id and l.invoice_id = target.id;

  select to_jsonb(c) - 'id' - 'tenant_id' - 'created_at' - 'updated_at' - 'version'
  into customer_data from public.customers c where c.tenant_id = target.tenant_id and c.id = target.customer_id;
  select jsonb_build_object(
    'tenant_name', t.name,
    'primary_color', b.primary_color,
    'accent_color', b.accent_color,
    'surface_color', b.surface_color,
    'logo_path', b.logo_path,
    'sender_name', b.sender_name,
    'sender_email', b.sender_email,
    'pdf_footer', b.pdf_footer
  ) into branding_data
  from public.tenants t join public.tenant_branding b on b.tenant_id = t.id
  where t.id = target.tenant_id;

  insert into public.invoice_sequences (tenant_id, year, last_number)
  values (target.tenant_id, extract(year from business_day)::integer, 0)
  on conflict (tenant_id) do nothing;
  select * into seq from public.invoice_sequences s where s.tenant_id = target.tenant_id for update;
  if seq.year <> extract(year from business_day)::integer then
    update public.invoice_sequences set year = extract(year from business_day)::integer, last_number = 0
    where tenant_id = target.tenant_id returning * into seq;
  end if;
  next_number := seq.last_number + 1;
  update public.invoice_sequences set last_number = next_number where tenant_id = target.tenant_id;
  select invoice_prefix into prefix from public.tenant_settings where tenant_id = target.tenant_id;

  update public.invoices
  set invoice_number = prefix || '-' || extract(year from business_day)::integer::text || '-' || lpad(next_number::text, 6, '0'),
      status = 'final', issued_on = business_day,
      due_on = business_day + coalesce((select payment_terms_days from public.tenant_settings where tenant_id = target.tenant_id), 14),
      subtotal_cents = calculated_subtotal, vat_cents = calculated_vat, total_cents = calculated_total,
      customer_snapshot = customer_data, branding_snapshot = branding_data, lines_snapshot = lines,
      finalized_at = clock_timestamp()
  where id = target.id returning * into result;

  update public.work_orders w set status = 'invoiced'
  where w.tenant_id = target.tenant_id
    and w.id in (
      select l.work_order_id from public.invoice_lines l
      where l.tenant_id = target.tenant_id and l.invoice_id = target.id and l.work_order_id is not null
    );
  insert into public.audit_events (tenant_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (target.tenant_id, auth.uid(), 'invoice.finalized', 'invoice', target.id, jsonb_build_object('invoice_number', result.invoice_number, 'total_cents', result.total_cents));
  perform private.enqueue_event(
    target.tenant_id, 'invoice.finalized', 'invoice', target.id,
    jsonb_build_object('invoice_id', target.id, 'invoice_number', result.invoice_number),
    'invoice-final:' || target.id::text
  );
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION private.sync_execution_request()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 if new.execution_version<>old.execution_version then
  update public.object_visit_requests set state=case when new.completed_at is null then case when new.is_extra_work then 'accepted' else 'regular' end else new.execution_state end,response=coalesce(nullif(new.completion_note,''),response)
  where tenant_id=new.tenant_id and work_order_task_id=new.id;
  perform private.enqueue_event(new.tenant_id,'task.executed','work_order',new.work_order_id,jsonb_build_object('task_id',new.id,'version',new.execution_version,'result',new.execution_state),'task-execution:'||new.id::text||':'||new.execution_version::text);
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.record_task_execution (
  target_tenant    uuid,
  target_task      uuid,
  expected_version bigint,
  result           text,
  actual_quantity  numeric,
  reason           text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare t public.work_order_tasks;w public.work_orders;
begin
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 select * into t from public.work_order_tasks where tenant_id=target_tenant and id=target_task for update;
 select * into w from public.work_orders where tenant_id=target_tenant and id=t.work_order_id for update;
 if t.id is null or not private.object_visit_access(target_tenant,w.object_id,w.id) or not (private.object_manage(target_tenant) or private.is_work_order_assignee(target_tenant,w.id)) then raise exception 'Geen actuele uitvoeringstoegang' using errcode='42501';end if;
 if t.execution_version<>expected_version then raise exception 'De uitvoering is gewijzigd. Vernieuw de werkbon.' using errcode='40001';end if;
 if w.status not in ('in_progress','correction_required') or result not in ('completed','partial','not_done') or actual_quantity is null or actual_quantity<0 or actual_quantity>t.quantity or (result='completed' and actual_quantity<>t.quantity) or (result='not_done' and actual_quantity<>0) or (result='partial' and (actual_quantity<=0 or actual_quantity>=t.quantity)) or (result<>'completed' and length(btrim(coalesce(reason,'')))<5) then raise exception 'Controleer hoeveelheid, uitvoeringsstatus en toelichting' using errcode='23514';end if;
 update public.work_order_tasks set executed_quantity=actual_quantity,execution_state=result,completed_at=clock_timestamp(),completion_note=reason where id=t.id;
end $function$;

CREATE TRIGGER sync_execution_request
  AFTER UPDATE ON public.work_order_tasks
  FOR EACH ROW
  EXECUTE FUNCTION private.sync_execution_request();

REVOKE ALL ON FUNCTION "private"."sync_execution_request"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."sync_execution_request"() TO "postgres";
