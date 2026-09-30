SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.agreement_scope_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare l public.customer_agreement_lines; a public.customer_agreements; o uuid; w public.work_orders; business_day date; candidates uuid[];
begin
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||new.tenant_id::text,0));
 if tg_table_name='work_order_tasks' then
  if tg_op='UPDATE' then
   if old.agreement_line_id is distinct from new.agreement_line_id or old.commercial_snapshot is distinct from new.commercial_snapshot then raise exception 'De vastgelegde commerciële bron is onveranderlijk' using errcode='23514';end if;
  else new.commercial_snapshot:='{}'::jsonb;end if;
 end if;
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
  if new.unit_price_cents<>l.price_cents or new.quantity+coalesce((select sum(t.quantity) from public.work_order_tasks t where t.tenant_id=new.tenant_id and t.work_order_id=new.work_order_id and t.agreement_line_id=l.id and t.id<>new.id),0)>l.quantity or round((new.quantity+coalesce((select sum(t.quantity) from public.work_order_tasks t where t.tenant_id=new.tenant_id and t.work_order_id=new.work_order_id and t.agreement_line_id=l.id and t.id<>new.id),0))*new.unit_price_cents)>l.limit_cents then raise exception 'De gezamenlijke uitvoering overschrijdt de afgesproken hoeveelheid of prijs per bezoek' using errcode='23514';end if;
  if tg_op='INSERT' then
   business_day:=(coalesce(w.projected_start_at,clock_timestamp()) at time zone (select timezone from public.tenants where id=new.tenant_id))::date;
   if a.state<>'active' or a.starts_on>business_day or a.ends_on<((coalesce(w.projected_end_at,w.projected_start_at,clock_timestamp())-interval '1 microsecond') at time zone (select timezone from public.tenants where id=new.tenant_id))::date or exists(select 1 from public.customer_agreements n where n.previous_id=a.id and n.starts_on<=business_day) then raise exception 'Kies de geldige contractversie voor deze uitvoering' using errcode='23514';end if;
   if new.quantity>l.quantity or new.unit_price_cents<>l.price_cents or round(new.quantity*new.unit_price_cents)>l.limit_cents then raise exception 'Deze uitvoering overschrijdt de contractafspraak' using errcode='23514';end if;
   new.commercial_snapshot:=jsonb_build_object('agreementId',a.id,'version',a.version,'lineId',l.id,'scope',l.scope,'quantity',l.quantity,'limitCents',l.limit_cents,'priceCents',l.price_cents,'acceptedBy',a.accepted_by_name,'acceptedOn',a.accepted_on,'evidenceDocumentId',a.evidence_document_id);
  end if;
 end if;
 return new;
end $function$;
