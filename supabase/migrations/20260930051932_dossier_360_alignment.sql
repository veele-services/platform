SET local check_function_bodies = off;

ALTER TABLE "public"."object_visit_requests"
  DROP CONSTRAINT "object_visit_requests_state_check";

CREATE TABLE "public"."customer_agreement_lines" (
  "id"               uuid          NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"        uuid          NOT NULL,
  "agreement_id"     uuid          NOT NULL,
  "object_id"        uuid          NOT NULL,
  "task_revision_id" uuid          NOT NULL,
  "scope"            text          NOT NULL,
  "quantity"         numeric(12,3) NOT NULL,
  "price_cents"      bigint        NOT NULL,
  "limit_cents"      bigint        NOT NULL,
  CONSTRAINT "customer_agreement_lines_agreement_id_object_id_task_revisi_key" UNIQUE (agreement_id, object_id, task_revision_id),
  CONSTRAINT "customer_agreement_lines_check" CHECK ((round((quantity * (price_cents)::numeric)) <= (limit_cents)::numeric)),
  CONSTRAINT "customer_agreement_lines_limit_cents_check" CHECK ((limit_cents >= 0)),
  CONSTRAINT "customer_agreement_lines_pkey" PRIMARY KEY (id),
  CONSTRAINT "customer_agreement_lines_price_cents_check" CHECK ((price_cents >= 0)),
  CONSTRAINT "customer_agreement_lines_quantity_check" CHECK ((quantity > (0)::numeric)),
  CONSTRAINT "customer_agreement_lines_scope_check" CHECK (((length(scope) >= 2) AND (length(scope) <= 3000))),
  CONSTRAINT "customer_agreement_lines_tenant_id_id_key" UNIQUE (tenant_id, id)
);

ALTER TABLE "public"."customer_agreement_lines"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."customer_agreement_lines"
  FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."customer_agreement_lines" FROM "anon";

CREATE TABLE "public"."customer_agreements" (
  "id"                   uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"            uuid                     NOT NULL,
  "customer_id"          uuid                     NOT NULL,
  "previous_id"          uuid,
  "version"              bigint                   NOT NULL DEFAULT 1,
  "title"                text                     NOT NULL,
  "starts_on"            date                     NOT NULL,
  "ends_on"              date,
  "state"                text                     NOT NULL DEFAULT 'active'::text,
  "evidence_document_id" uuid,
  "accepted_by_name"     text                     NOT NULL,
  "accepted_on"          date                     NOT NULL,
  "created_at"           timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "customer_agreements_accepted_by_name_check" CHECK (((length(accepted_by_name) >= 2) AND (length(accepted_by_name) <= 180))),
  CONSTRAINT "customer_agreements_check" CHECK (((ends_on IS NULL) OR (ends_on >= starts_on))),
  CONSTRAINT "customer_agreements_pkey" PRIMARY KEY (id),
  CONSTRAINT "customer_agreements_previous_id_key" UNIQUE (previous_id),
  CONSTRAINT "customer_agreements_state_check" CHECK ((state = ANY (ARRAY['active'::text, 'ended'::text]))),
  CONSTRAINT "customer_agreements_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "customer_agreements_title_check" CHECK (((length(title) >= 2) AND (length(title) <= 180))),
  "created_by"           uuid                     NOT NULL DEFAULT auth.uid()
);

ALTER TABLE "public"."customer_agreements"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."customer_agreements"
  FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."customer_agreements" FROM "anon";

CREATE TABLE "public"."dossier_documents" (
  "id"             uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"      uuid NOT NULL,
  "source_kind"    text NOT NULL,
  "source_id"      uuid NOT NULL,
  "customer_id"    uuid,
  "object_id"      uuid,
  "personnel_id"   uuid,
  "classification" text NOT NULL,
  CONSTRAINT "dossier_documents_pkey" PRIMARY KEY (id),
  CONSTRAINT "dossier_documents_source_kind_check" CHECK ((source_kind = ANY (ARRAY['customer'::text, 'object'::text, 'personnel'::text]))),
  CONSTRAINT "dossier_documents_source_kind_source_id_key" UNIQUE (source_kind, source_id),
  CONSTRAINT "dossier_documents_tenant_id_id_key" UNIQUE (tenant_id, id)
);

ALTER TABLE "public"."dossier_documents"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."dossier_documents"
  FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."dossier_documents" FROM "anon";

ALTER TABLE "public"."customer_documents"
  ADD COLUMN "previous_id" uuid;

ALTER TABLE "public"."customer_documents"
  ADD COLUMN "version" bigint NOT NULL DEFAULT 1;

ALTER TABLE "public"."customer_documents"
  ADD COLUMN "document_on" date;

ALTER TABLE "public"."customer_documents"
  ADD COLUMN "valid_until" date;

ALTER TABLE "public"."invoice_lines"
  ADD COLUMN "work_order_task_id" uuid;

ALTER TABLE "public"."invoices"
  ADD COLUMN "source_request_id" uuid;

ALTER TABLE "public"."object_records"
  ADD COLUMN "agreement_line_id" uuid;

ALTER TABLE "public"."work_order_tasks"
  ADD COLUMN "executed_quantity" numeric(12,3);

ALTER TABLE "public"."work_order_tasks"
  ADD COLUMN "execution_state" text NOT NULL DEFAULT 'planned'::text;

ALTER TABLE "public"."work_order_tasks"
  ADD COLUMN "execution_version" bigint NOT NULL DEFAULT 1;

ALTER TABLE "public"."work_order_tasks"
  ADD COLUMN "agreement_line_id" uuid;

ALTER TABLE "public"."work_order_tasks"
  ADD COLUMN "commercial_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION private.agreement_scope_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare l public.customer_agreement_lines; a public.customer_agreements; o uuid; w public.work_orders; business_day date;
begin
 if tg_table_name='work_order_tasks' then
 if tg_op='INSERT' and new.agreement_line_id is null and not new.is_extra_work and new.unit_price_cents>0 then
  select * into w from public.work_orders where tenant_id=new.tenant_id and id=new.work_order_id;
  select l1.* into l from public.object_records r join public.customer_agreement_lines l1 on l1.id=r.agreement_line_id join public.customer_agreements a1 on a1.id=l1.agreement_id
  where r.tenant_id=new.tenant_id and r.object_id=w.object_id and r.kind='programme' and r.state='active' and r.task_revision_id=new.task_revision_id
  and a1.starts_on<=(w.projected_start_at at time zone (select timezone from public.tenants where id=new.tenant_id))::date and (a1.ends_on is null or a1.ends_on>=(w.projected_end_at at time zone (select timezone from public.tenants where id=new.tenant_id))::date)
  and not exists(select 1 from public.customer_agreements next_a where next_a.previous_id=a1.id and next_a.starts_on<=(w.projected_start_at at time zone (select timezone from public.tenants where id=new.tenant_id))::date)
  order by a1.version desc limit 1;
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
   if a.state<>'active' or a.starts_on>business_day or a.ends_on<business_day or exists(select 1 from public.customer_agreements n where n.previous_id=a.id and n.starts_on<=business_day) then raise exception 'Kies de geldige contractversie voor deze uitvoering' using errcode='23514';end if;
   if new.quantity>l.quantity or new.unit_price_cents<>l.price_cents or round(new.quantity*new.unit_price_cents)>l.limit_cents then raise exception 'Deze uitvoering overschrijdt de contractafspraak' using errcode='23514';end if;
   new.commercial_snapshot:=jsonb_build_object('agreementId',a.id,'version',a.version,'lineId',l.id,'scope',l.scope,'quantity',l.quantity,'limitCents',l.limit_cents,'priceCents',l.price_cents,'acceptedBy',a.accepted_by_name,'acceptedOn',a.accepted_on,'evidenceDocumentId',a.evidence_document_id);
  end if;
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.commercial_access (
  t uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select private.object_session_active() and private.has_role(t,array['tenant_admin','management','finance']::public.app_role[])
 and exists(select 1 from public.tenants where id=t and status='active');
$function$;

CREATE OR REPLACE FUNCTION private.customer_document_version()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare prev public.customer_documents;
begin
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-document:'||new.tenant_id::text,0));
 if new.previous_id is null then new.version:=1;else
  select * into prev from public.customer_documents where tenant_id=new.tenant_id and id=new.previous_id and customer_id=new.customer_id;
  if prev.id is null or exists(select 1 from public.customer_documents where previous_id=prev.id) then raise exception 'Kies de nieuwste documentversie van deze klant' using errcode='40001';end if;
  new.version:=prev.version+1;
 end if;return new;
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
begin
  select * into target from public.invoices i where i.id = target_invoice_id for update;
  if not found then raise exception 'Invoice not found' using errcode = 'P0002'; end if;
  if not private.has_role(target.tenant_id, array['tenant_admin','management','finance']::public.app_role[]) then
    raise exception 'Finance role required' using errcode = '42501';
  end if;
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
  values (target.tenant_id, extract(year from current_date)::integer, 0)
  on conflict (tenant_id) do nothing;
  select * into seq from public.invoice_sequences s where s.tenant_id = target.tenant_id for update;
  if seq.year <> extract(year from current_date)::integer then
    update public.invoice_sequences set year = extract(year from current_date)::integer, last_number = 0
    where tenant_id = target.tenant_id returning * into seq;
  end if;
  next_number := seq.last_number + 1;
  update public.invoice_sequences set last_number = next_number where tenant_id = target.tenant_id;
  select invoice_prefix into prefix from public.tenant_settings where tenant_id = target.tenant_id;

  update public.invoices
  set invoice_number = prefix || '-' || extract(year from current_date)::integer::text || '-' || lpad(next_number::text, 6, '0'),
      status = 'final', issued_on = current_date,
      due_on = current_date + coalesce((select payment_terms_days from public.tenant_settings where tenant_id = target.tenant_id), 14),
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

CREATE OR REPLACE FUNCTION private.invoice_source_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare t public.work_order_tasks;w public.work_orders;i public.invoices;p public.object_request_proposals;used numeric;available numeric;
begin
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||new.tenant_id::text,0));
 if new.work_order_task_id is null then raise exception 'Koppel een goedgekeurde uitvoeringstaak aan iedere factuurregel' using errcode='23514';end if;
 select * into t from public.work_order_tasks where tenant_id=new.tenant_id and id=new.work_order_task_id for update;
 select * into w from public.work_orders where tenant_id=new.tenant_id and id=t.work_order_id;
 select * into i from public.invoices where tenant_id=new.tenant_id and id=new.invoice_id;
 if t.id is null or i.id is null or w.customer_id<>i.customer_id or new.work_order_id is distinct from t.work_order_id or w.status<>'invoice_ready' or i.status<>'draft' or t.completed_at is null or (t.is_extra_work and t.extra_work_status is distinct from 'approved') then raise exception 'De bron is nog niet gecontroleerd of hoort niet bij deze klant' using errcode='23514';end if;
 if exists(select 1 from public.object_visit_requests r where r.tenant_id=new.tenant_id and r.work_order_task_id=t.id and r.needs_review) then raise exception 'Beoordeel het gewijzigde klantverzoek eerst' using errcode='23514';end if;
 select p1.* into p from public.object_request_proposals p1 join public.object_visit_requests r on r.id=p1.request_id where r.tenant_id=new.tenant_id and r.work_order_task_id=t.id and p1.accepted_at is not null order by p1.version desc limit 1;
 if p.id is not null and (t.quantity<>p.quantity or t.unit_price_cents<>p.price_cents or t.task_revision_id<>p.task_revision_id) then raise exception 'De uitvoering wijkt af van de geaccepteerde voorstelversie' using errcode='23514';end if;
 available:=coalesce(t.executed_quantity,t.quantity);
 select coalesce(sum(l.quantity),0) into used from public.invoice_lines l where l.tenant_id=new.tenant_id and l.work_order_task_id=t.id and l.id<>new.id;
 if new.quantity>available-used or new.unit_price_cents<>t.unit_price_cents or new.vat_basis_points<>t.vat_basis_points or new.unit<>t.unit then raise exception 'Hoeveelheid of prijs wijkt af van de nog factureerbare bron' using errcode='23514';end if;
 new.subtotal_cents:=round(new.quantity*t.unit_price_cents);new.vat_cents:=round(new.subtotal_cents*t.vat_basis_points/10000.0);new.total_cents:=new.subtotal_cents+new.vat_cents;
 new.source_snapshot:=jsonb_build_object('work_order_task_id',t.id,'execution_version',t.execution_version,'executed_quantity',available,'object',w.object_snapshot,'agreement',t.commercial_snapshot,'proposal_id',p.id,'proposal_version',p.version,'accepted_by',p.accepted_by,'accepted_at',p.accepted_at);
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.object_visit_projection (
  target_tenant uuid,
  target_object uuid,
  target_order  uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare o public.objects;w public.work_orders;result jsonb;manager boolean;customer boolean;
begin
 if not private.object_visit_access(target_tenant,target_object,target_order) then raise exception 'Geen toegang tot deze uitvoering' using errcode='42501';end if;
 manager:=private.object_manage(target_tenant);
 customer:=exists(select 1 from public.object_customer_bindings b where b.tenant_id=target_tenant and b.object_id=target_object and b.user_id=auth.uid() and b.active);
 select * into o from public.objects where tenant_id=target_tenant and id=target_object;
 select * into w from public.work_orders where tenant_id=target_tenant and id=target_order and object_id=o.id;
 result:=jsonb_build_object('object',jsonb_build_object('id',o.id,'name',o.name,'number',o.object_number,'address',o.address,'instructions',o.access_instructions,'status',o.dossier_status),
 'order',case when w.id is null then null else jsonb_build_object('id',w.id,'number',w.work_order_number,'start',w.projected_start_at,'end',w.projected_end_at,'status',w.status,'service',w.discipline) end,
 'customer',customer,'manager',manager,'userId',auth.uid());
 return result||jsonb_build_object(
 'nodes',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'name',n.name,'parentId',n.parent_id,'kind',n.kind) order by n.position,n.name) from public.object_nodes n where n.tenant_id=target_tenant and n.object_id=o.id and n.active),'[]'),
 'instructions',case when customer and not manager then '[]'::jsonb else coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('read',exists(select 1 from public.object_instruction_receipts rc where rc.record_id=r.id and rc.record_version=r.version and rc.work_order_id=w.id and rc.user_id=auth.uid()))) from public.object_records r where r.tenant_id=target_tenant and r.object_id=o.id and r.kind='instruction' and r.state='active' and (r.service='' or r.service=w.discipline) and (r.work_order_id is null or r.work_order_id=w.id) and r.starts_at<=coalesce(w.projected_end_at,clock_timestamp()) and (r.ends_at is null or r.ends_at>=coalesce(w.projected_start_at,clock_timestamp()))),'[]') end,
 'requests',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('read',exists(select 1 from public.object_request_receipts rc where rc.request_id=r.id and rc.version=r.version and rc.user_id=auth.uid()),'documents',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'title',d.title,'version',d.version,'mime',d.mime_type)) from public.object_documents d where d.request_id=r.id and d.tenant_id=target_tenant and d.category<>'security'),'[]'),'proposals',coalesce((select jsonb_agg(to_jsonb(p) order by p.version desc) from public.object_request_proposals p where p.request_id=r.id),'[]'))) from public.object_visit_requests r where r.tenant_id=target_tenant and r.object_id=o.id and (w.id is null or r.work_order_id=w.id)),'[]'));
end $function$;

CREATE OR REPLACE FUNCTION private.protect_allocated_execution()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 if exists(select 1 from public.invoice_lines where tenant_id=old.tenant_id and work_order_task_id=old.id)
 and (new.quantity,new.executed_quantity,new.execution_state,new.unit_price_cents,new.vat_basis_points,new.completed_at,new.task_revision_id,new.work_order_id,new.is_extra_work,new.extra_work_status) is distinct from (old.quantity,old.executed_quantity,old.execution_state,old.unit_price_cents,old.vat_basis_points,old.completed_at,old.task_revision_id,old.work_order_id,old.is_extra_work,old.extra_work_status)
 then raise exception 'Deze uitvoering is al financieel verwerkt. Gebruik een navolgbare correctie.' using errcode='23514';end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.register_dossier_document()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare c uuid;o uuid;p uuid;k text;cl text;
begin
 if tg_table_name='customer_documents' then k:='customer';c:=new.customer_id;cl:='commercial';
 elsif tg_table_name='object_documents' then k:='object';o:=new.object_id;select customer_id into c from public.objects where tenant_id=new.tenant_id and id=o;cl:=case when new.category='security' then 'restricted' else 'operational' end;
 else k:='personnel';p:=new.personnel_id;cl:='hr';end if;
 insert into public.dossier_documents(tenant_id,source_kind,source_id,customer_id,object_id,personnel_id,classification)
 values(new.tenant_id,k,new.id,c,o,p,cl) on conflict(source_kind,source_id) do update set classification=excluded.classification;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.review_object_request_base (
  target_tenant    uuid,
  target_request   uuid,
  expected_version bigint,
  decision         text,
  input            jsonb
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare r public.object_visit_requests;rev public.task_revisions;cat public.task_catalog;task uuid;pv bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 if not private.object_manage(target_tenant) then raise exception 'Geen toegang' using errcode='42501';end if;
 select * into r from public.object_visit_requests where tenant_id=target_tenant and id=target_request for update;
 if r.id is null or r.version<>expected_version then raise exception 'Het verzoek is gewijzigd. Vernieuw het dossier.' using errcode='40001';end if;
 if length(coalesce(input->>'reason',''))<2 then raise exception 'Leg je beoordeling vast' using errcode='23514';end if;
 if decision not in ('regular','proposal','rejected','review','completed','partial','not_done') then raise exception 'Onbekende beoordeling' using errcode='23514';end if;
 if decision in ('regular','proposal') then
  if r.work_order_task_id is not null then raise exception 'Dit verzoek heeft al een uitvoeringstaak' using errcode='23514';end if;
  select * into rev from public.task_revisions where tenant_id=target_tenant and id=(input->>'taskRevisionId')::uuid;
  select * into cat from public.task_catalog where tenant_id=target_tenant and id=rev.task_id and active;
  if cat.id is null then raise exception 'Kies een bestaande taak uit de catalogus' using errcode='23514';end if;
  if decision='regular' then
   -- Included scope reprioritises existing work; never adds another invoice charge.
   insert into public.work_order_tasks(tenant_id,work_order_id,task_revision_id,task_code,task_name,duration_minutes,quantity,unit,unit_price_cents,vat_basis_points,is_extra_work,added_by)
   values(target_tenant,r.work_order_id,rev.id,cat.code,r.title,rev.duration_minutes,1,rev.unit,0,rev.vat_basis_points,false,auth.uid()) returning id into task;
  else
   select coalesce(max(version),0)+1 into pv from public.object_request_proposals where request_id=r.id;
   insert into public.object_request_proposals(tenant_id,object_id,request_id,version,title,scope,task_revision_id,quantity,price_cents,vat_basis_points)
   values(target_tenant,r.object_id,r.id,pv,r.title,input->>'reason',rev.id,coalesce((input->>'quantity')::numeric,1),coalesce((input->>'priceCents')::bigint,rev.price_cents),rev.vat_basis_points);
  end if;
 end if;
 update public.object_visit_requests set state=decision,needs_review=false,review_note=input->>'reason',response=coalesce(input->>'response',response),work_order_task_id=coalesce(task,work_order_task_id) where id=r.id;
 perform private.object_notify(target_tenant,r.object_id,r.work_order_id,'review:'||r.id::text||':'||(r.version+1)::text);
end $function$;

CREATE OR REPLACE FUNCTION private.review_work_order_base (
  target_work_order_id uuid,
  decision             text,
  reason               text DEFAULT NULL::text
)
  RETURNS public.work_orders
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  target public.work_orders;
  result public.work_orders;
  next_status public.work_order_status;
begin
  select * into target from public.work_orders w where w.id = target_work_order_id for update;
  if not found then raise exception 'Work order not found' using errcode = 'P0002'; end if;
  if not private.has_role(target.tenant_id, array['tenant_admin','management','finance']::public.app_role[]) then
    raise exception 'Review role required' using errcode = '42501';
  end if;
  if target.status not in ('completed','under_review','correction_required') then
    raise exception 'Work order is not ready for review' using errcode = '23514';
  end if;
  if decision = 'returned' and btrim(coalesce(reason, '')) = '' then
    raise exception 'A return reason is required' using errcode = '23514';
  elsif decision not in ('approved','returned') then
    raise exception 'Unknown review decision' using errcode = '23514';
  end if;
  next_status := case
    when decision = 'approved' then 'invoice_ready'::public.work_order_status
    else 'correction_required'::public.work_order_status
  end;

  insert into public.review_decisions (tenant_id, work_order_id, report_version, decision, reason, decided_by)
  values (target.tenant_id, target.id, target.report_version, decision, reason, auth.uid())
  on conflict (tenant_id, work_order_id, report_version) do update
    set decision = excluded.decision, reason = excluded.reason, decided_by = excluded.decided_by, created_at = clock_timestamp();

  update public.work_orders
  set status = next_status,
      report_version = case when decision = 'returned' then report_version + 1 else report_version end,
      attention_reason = case when decision = 'returned' then reason else null end
  where id = target.id
  returning * into result;
  perform private.enqueue_event(
    target.tenant_id, 'work_order.reviewed', 'work_order', target.id,
    jsonb_build_object('work_order_id', target.id, 'decision', decision, 'reason', reason),
    'review:' || target.id::text || ':' || target.report_version::text || ':' || decision
  );
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION private.task_execution_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 if (new.executed_quantity,new.execution_state,new.completed_at,new.completion_note) is distinct from (old.executed_quantity,old.execution_state,old.completed_at,old.completion_note) then
  if new.executed_quantity is not distinct from old.executed_quantity and new.execution_state=old.execution_state and new.completed_at is distinct from old.completed_at then
   new.executed_quantity:=case when new.completed_at is not null then new.quantity else null end;
   new.execution_state:=case when new.completed_at is not null then 'completed' else 'planned' end;
  end if;
  new.execution_version:=old.execution_version+1;
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.unregister_dossier_document()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin delete from public.dossier_documents where tenant_id=old.tenant_id and source_id=old.id and source_kind=case tg_table_name when 'customer_documents' then 'customer' when 'object_documents' then 'object' else 'personnel' end;return old;end $function$;

CREATE OR REPLACE FUNCTION public.create_execution_invoice (
  target_tenant uuid,
  request_id    uuid,
  sources       jsonb
)
  RETURNS public.invoices
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare inv public.invoices;t public.work_order_tasks;w public.work_orders;src jsonb;customer uuid; qty numeric;
begin
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 if not private.commercial_access(target_tenant) or not private.service_enabled(target_tenant,'finance') then raise exception 'Financiële toegang vereist' using errcode='42501';end if;
 if request_id is null then raise exception 'Verzoekreferentie ontbreekt' using errcode='23514';end if;
 select * into inv from public.invoices where tenant_id=target_tenant and source_request_id=request_id;
 if found then return inv;end if;
 if jsonb_typeof(sources)<>'array' or jsonb_array_length(sources) not between 1 and 500 then raise exception 'Selecteer de te factureren uitvoering' using errcode='23514';end if;
 for src in select value from jsonb_array_elements(sources) loop
  select * into t from public.work_order_tasks where tenant_id=target_tenant and id=(src->>'taskId')::uuid for update;
  select * into w from public.work_orders where tenant_id=target_tenant and id=t.work_order_id for update;
  if w.id is null or w.status<>'invoice_ready' or (customer is not null and customer<>w.customer_id) then raise exception 'Selecteer gecontroleerde werkbonnen van één klant' using errcode='23514';end if;
  if inv.id is null then customer:=w.customer_id;insert into public.invoices(tenant_id,customer_id,created_by,source_request_id) values(target_tenant,customer,auth.uid(),request_id) returning * into inv;end if;
  qty:=(src->>'quantity')::numeric;
  insert into public.invoice_lines(tenant_id,invoice_id,work_order_id,work_order_task_id,description,quantity,unit,unit_price_cents,subtotal_cents,vat_basis_points,vat_cents,total_cents,source_snapshot)
  values(target_tenant,inv.id,w.id,t.id,t.task_code||' · '||t.task_name,qty,t.unit,t.unit_price_cents,0,t.vat_basis_points,0,0,'{}');
 end loop;
 inv:=public.finalize_invoice(inv.id);
 -- A partial allocation leaves the reviewed remainder available, without another visit.
 update public.work_orders w1 set status='invoice_ready' where w1.tenant_id=target_tenant and w1.id in (select work_order_id from public.invoice_lines where invoice_id=inv.id)
 and exists(select 1 from public.work_order_tasks t1 where t1.tenant_id=target_tenant and t1.work_order_id=w1.id and t1.completed_at is not null and t1.unit_price_cents>0 and (not t1.is_extra_work or t1.extra_work_status='approved') and coalesce(t1.executed_quantity,t1.quantity)>(select coalesce(sum(l.quantity),0) from public.invoice_lines l where l.tenant_id=target_tenant and l.work_order_task_id=t1.id));
 return inv;
end $function$;

REVOKE ALL ON FUNCTION "public"."create_execution_invoice"(uuid, uuid, jsonb) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.current_event_recipients (
  target_event uuid
)
  RETURNS TABLE (
    user_id uuid
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select distinct m.user_id from public.outbox_events e
 join public.tenant_memberships m on m.tenant_id=e.tenant_id and m.status='active'
 join auth.users u on u.id=m.user_id and u.deleted_at is null and (u.banned_until is null or u.banned_until<clock_timestamp())
 join public.tenants t on t.id=e.tenant_id and t.status='active'
 where e.id=target_event and (
 (e.event_type='announcement.published' and 'staff'=any(m.roles)) or
 (e.aggregate_type='work_order' and exists(
 select 1 from public.work_orders w join public.work_order_assignments a on a.tenant_id=w.tenant_id and a.work_order_id=w.id
 join public.personnel p on p.tenant_id=a.tenant_id and p.id=a.personnel_id and p.user_id=m.user_id and p.status='active'
 where w.id=e.aggregate_id and w.tenant_id=e.tenant_id and w.status<>'cancelled' and a.status not in ('cancelled','returned')
 and (nullif(e.payload->>'personnel_id','') is null or a.personnel_id=(e.payload->>'personnel_id')::uuid)
 and exists(select 1 from public.dispatches d where d.assignment_id=a.id and d.revoked_at is null)))
 );
$function$;

REVOKE ALL ON FUNCTION "public"."current_event_recipients"(uuid) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.dossier_chain (
  target_tenant    uuid,
  target_customer  uuid DEFAULT NULL::uuid,
  target_object    uuid DEFAULT NULL::uuid,
  target_personnel uuid DEFAULT NULL::uuid,
  target_order     uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare result jsonb;can_hr boolean;can_ops boolean;
begin
 if not private.object_session_active() or not private.has_role(target_tenant,array['tenant_admin','management','hr','planner','finance']::public.app_role[]) then raise exception 'Geen dossiertoegang' using errcode='42501';end if;
 can_hr:=private.dossier_access(target_tenant);can_ops:=private.has_role(target_tenant,array['tenant_admin','management','planner','finance']::public.app_role[]) and private.service_enabled(target_tenant,'planning');
 if target_customer is not null and not exists(select 1 from public.customers where tenant_id=target_tenant and id=target_customer) then raise exception 'Klant niet beschikbaar' using errcode='42501';end if;
 if target_object is not null and not exists(select 1 from public.objects where tenant_id=target_tenant and id=target_object and (target_customer is null or customer_id=target_customer)) then raise exception 'Object niet beschikbaar' using errcode='42501';end if;
 if target_personnel is not null and not can_hr then raise exception 'Geen toegang tot personeelsdossier' using errcode='42501';end if;
 if target_order is not null and not exists(select 1 from public.work_orders where tenant_id=target_tenant and id=target_order and (target_customer is null or customer_id=target_customer) and (target_object is null or object_id=target_object)) then raise exception 'Werkbon niet beschikbaar' using errcode='42501';end if;
 with orders as (
  select w.* from public.work_orders w where w.tenant_id=target_tenant and (target_customer is null or w.customer_id=target_customer) and (target_object is null or w.object_id=target_object) and (target_order is null or w.id=target_order)
  and (target_personnel is null or exists(select 1 from public.work_order_assignments a where a.tenant_id=w.tenant_id and a.work_order_id=w.id and a.personnel_id=target_personnel))
 ),actions as (
  select 'request'::text kind,r.id,r.title,r.state status,r.priority,null::date due_on,null::uuid owner_id,r.version,w.customer_id,r.object_id,null::uuid personnel_id,r.work_order_id,r.needs_review,
   '/app/objecten/'||r.object_id::text||'?tab=instructies#request-'||r.id::text href
  from public.object_visit_requests r join orders w on w.id=r.work_order_id where can_ops
  union all
  select 'execution',t.id,t.task_name,case when t.completed_at is not null and t.execution_state='planned' then 'completed' else t.execution_state end,'normal',(w.projected_end_at at time zone (select timezone from public.tenants where id=target_tenant))::date,null,t.execution_version,w.customer_id,w.object_id,null,w.id,false,'/app/werkbonnen/'||w.id::text||'#uitvoering'
  from public.work_order_tasks t join orders w on w.id=t.work_order_id where can_ops
  union all
  select 'object',r.id,r.title,r.state,'normal',r.due_on,r.owner_user_id,r.version,o.customer_id,r.object_id,null,r.work_order_id,false,'/app/objecten/'||r.object_id::text||'?tab='||case r.kind when 'quality' then 'kwaliteit' when 'material' then 'materialen' else 'instructies' end||'#record-'||r.id::text
  from public.object_records r join public.objects o on o.id=r.object_id and o.tenant_id=r.tenant_id where r.tenant_id=target_tenant and can_ops and r.kind in ('task','quality','material') and target_personnel is null and (target_customer is null or o.customer_id=target_customer) and (target_object is null or o.id=target_object) and (target_order is null or r.work_order_id=target_order)
  union all
  select 'personnel',p.id,p.title,p.dossier_status,'normal',p.due_on,p.owner_user_id,p.dossier_revision,null,null,p.personnel_id,null,false,'/app/personeel/'||p.personnel_id::text||'?tab='||case p.kind when 'task' then 'tijdlijn' else 'overzicht' end||'#record-'||p.id::text
  from public.personnel_dossier_items p where p.tenant_id=target_tenant and can_hr and p.kind in ('task','checklist') and target_customer is null and target_object is null and target_order is null and (target_personnel is null or p.personnel_id=target_personnel)
 ),docs as (
  select d.id,d.source_kind,d.source_id,d.classification,c.title,c.version,c.created_at,c.document_on,c.valid_until,'/api/files/dossier-document/'||d.id::text href
  from public.dossier_documents d join public.customer_documents c on c.id=d.source_id and d.source_kind='customer' where d.tenant_id=target_tenant and target_personnel is null and target_order is null and (target_customer is null or d.customer_id=target_customer) and (target_object is null or exists(select 1 from public.customer_agreements a join public.customer_agreement_lines l on l.agreement_id=a.id where a.evidence_document_id=c.id and l.object_id=target_object))
  union all
  select d.id,d.source_kind,d.source_id,d.classification,c.title,c.version,c.created_at,null::date,c.valid_until::date,'/api/files/dossier-document/'||d.id::text from public.dossier_documents d join public.object_documents c on c.id=d.source_id and d.source_kind='object' where d.tenant_id=target_tenant and target_personnel is null and (target_customer is null or d.customer_id=target_customer) and (target_object is null or d.object_id=target_object) and (target_order is null or c.work_order_id=target_order)
  union all
  select d.id,d.source_kind,d.source_id,d.classification,c.title,c.dossier_revision,c.created_at,null::date,null::date,'/api/files/dossier-document/'||d.id::text from public.dossier_documents d join public.personnel_documents c on c.id=d.source_id and d.source_kind='personnel' where d.tenant_id=target_tenant and can_hr and target_customer is null and target_object is null and target_order is null and (target_personnel is null or d.personnel_id=target_personnel)
 )
 select jsonb_build_object(
 'actions',coalesce((select jsonb_agg(to_jsonb(a) order by a.due_on nulls last,a.id) from actions a),'[]'),
 'documents',coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc) from docs d),'[]'),
 'requests',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('customer_id',w.customer_id,'proposals',coalesce((select jsonb_agg(to_jsonb(p) order by p.version desc) from public.object_request_proposals p where p.request_id=r.id),'[]'))) from public.object_visit_requests r join orders w on w.id=r.work_order_id where can_ops),'[]'),
 'agreements',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('lines',coalesce((select jsonb_agg(to_jsonb(l)) from public.customer_agreement_lines l where l.agreement_id=a.id),'[]'))) from public.customer_agreements a where a.tenant_id=target_tenant and target_personnel is null and target_order is null and (target_customer is null or a.customer_id=target_customer) and (target_object is null or exists(select 1 from public.customer_agreement_lines l where l.agreement_id=a.id and l.object_id=target_object))),'[]'),
 'invoices',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'number',i.invoice_number,'status',i.status,'total',i.total_cents,'paid',i.paid_cents,'due',i.due_on)) from public.invoices i where i.tenant_id=target_tenant and target_personnel is null and (target_customer is null or i.customer_id=target_customer) and ((target_object is null and target_order is null) or exists(select 1 from public.invoice_lines l join orders w on w.id=l.work_order_id where l.invoice_id=i.id))),'[]'),
 'timeline',coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'sourceId',h.source_id,'type',h.source_table,'version',h.version,'at',h.created_at,'event',h.event) order by h.created_at desc) from public.object_history h join public.objects o on o.id=h.object_id where h.tenant_id=target_tenant and can_ops and target_personnel is null and (target_customer is null or o.customer_id=target_customer) and (target_object is null or o.id=target_object) and (target_order is null or h.source_id in (select id from public.object_visit_requests where work_order_id=target_order))),'[]')
 ) into result;
 return result;
end $function$;

REVOKE ALL ON FUNCTION "public"."dossier_chain"(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.finalize_invoice (
  target_invoice_id uuid
)
  RETURNS public.invoices
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare t uuid;
begin
 select tenant_id into t from public.invoices where id=target_invoice_id;
 if not private.commercial_access(t) then raise exception 'Financiële toegang vereist' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||t::text,0));
 perform 1 from public.invoices where id=target_invoice_id for update;
 return private.finalize_invoice_snapshot(target_invoice_id);
end $function$;

CREATE OR REPLACE FUNCTION public.object_agreement_options (
  target_tenant uuid,
  target_object uuid
)
  RETURNS TABLE (
    id               uuid,
    title            text,
    version          bigint,
    task_revision_id uuid,
    scope            text
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select l.id,a.title,a.version,l.task_revision_id,l.scope from public.customer_agreement_lines l join public.customer_agreements a on a.tenant_id=l.tenant_id and a.id=l.agreement_id
 where l.tenant_id=target_tenant and l.object_id=target_object and private.object_manage(target_tenant) and a.state='active'
 and not exists(select 1 from public.customer_agreements n where n.previous_id=a.id);
$function$;

REVOKE ALL ON FUNCTION "public"."object_agreement_options"(uuid, uuid) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.object_visit_context (
  target_tenant uuid,
  target_object uuid,
  target_order  uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v jsonb;
begin
 v:=private.object_visit_projection(target_tenant,target_object,target_order);
 if not (v->>'manager')::boolean then
  v:=jsonb_set(v,'{requests}',coalesce((select jsonb_agg(r-'review_note') from jsonb_array_elements(v->'requests') r),'[]'));
 end if;
 return v;
end $function$;

CREATE OR REPLACE FUNCTION public.record_customer_agreement (
  target_tenant   uuid,
  target_customer uuid,
  input           jsonb
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare a uuid:=(input->>'id')::uuid; prev public.customer_agreements; ln jsonb; ver bigint:=1; doc uuid:=nullif(input->>'documentId','')::uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 if not private.commercial_access(target_tenant) or not exists(select 1 from public.customers where tenant_id=target_tenant and id=target_customer and status='active') then raise exception 'Geen toegang tot deze klantafspraak' using errcode='42501';end if;
 if exists(select 1 from public.customer_agreements where id=a) then
  if not exists(select 1 from public.customer_agreements where id=a and tenant_id=target_tenant and customer_id=target_customer and created_by=auth.uid()) then raise exception 'Ongeldige afspraak' using errcode='42501';end if;return a;
 end if;
 if doc is null or not exists(select 1 from public.customer_documents where tenant_id=target_tenant and customer_id=target_customer and id=doc) then raise exception 'Koppel het akkoordbewijs uit dit klantdossier' using errcode='23514';end if;
 if nullif(input->>'previousId','') is not null then
  select * into prev from public.customer_agreements where tenant_id=target_tenant and customer_id=target_customer and id=(input->>'previousId')::uuid for update;
  if prev.id is null or exists(select 1 from public.customer_agreements where previous_id=prev.id) then raise exception 'De overeenkomst is gewijzigd. Herlaad de nieuwste versie.' using errcode='40001';end if;
  ver:=prev.version+1;
 end if;
 if jsonb_typeof(input->'lines')<>'array' or jsonb_array_length(input->'lines') not between 1 and 100 or (input->>'acceptedOn')::date>(clock_timestamp() at time zone (select timezone from public.tenants where id=target_tenant))::date then raise exception 'Controleer de akkoorddatum en contractregels' using errcode='23514';end if;
 insert into public.customer_agreements(id,tenant_id,customer_id,previous_id,version,title,starts_on,ends_on,evidence_document_id,accepted_by_name,accepted_on)
 values(a,target_tenant,target_customer,prev.id,ver,input->>'title',(input->>'startsOn')::date,nullif(input->>'endsOn','')::date,doc,input->>'acceptedBy',(input->>'acceptedOn')::date);
 for ln in select value from jsonb_array_elements(input->'lines') loop
  if not exists(select 1 from public.objects where tenant_id=target_tenant and customer_id=target_customer and id=(ln->>'objectId')::uuid)
  or not exists(select 1 from public.task_revisions where tenant_id=target_tenant and id=(ln->>'taskRevisionId')::uuid) then raise exception 'Kies een object van deze klant en een bestaande catalogusversie' using errcode='23514';end if;
  insert into public.customer_agreement_lines(tenant_id,agreement_id,object_id,task_revision_id,scope,quantity,price_cents,limit_cents)
  values(target_tenant,a,(ln->>'objectId')::uuid,(ln->>'taskRevisionId')::uuid,ln->>'scope',(ln->>'quantity')::numeric,(ln->>'priceCents')::bigint,(ln->>'limitCents')::bigint);
 end loop;
 perform private.enqueue_event(target_tenant,'agreement.recorded','customer',target_customer,jsonb_build_object('agreement_id',a,'version',ver),'agreement:'||a::text);
 return a;
end $function$;

REVOKE ALL ON FUNCTION "public"."record_customer_agreement"(uuid, uuid, jsonb) FROM PUBLIC, "anon", "service_role";

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
 update public.object_visit_requests set state=result,response=coalesce(nullif(reason,''),response) where tenant_id=target_tenant and work_order_task_id=t.id;
 perform private.enqueue_event(target_tenant,'task.executed','work_order',w.id,jsonb_build_object('task_id',t.id,'version',t.execution_version+1,'result',result),'task-execution:'||t.id::text||':'||(t.execution_version+1)::text);
end $function$;

REVOKE ALL ON FUNCTION "public"."record_task_execution"(uuid, uuid, bigint, text, numeric, text) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.review_object_visit_request (
  target_tenant    uuid,
  target_request   uuid,
  expected_version bigint,
  decision         text,
  input            jsonb
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare r public.object_visit_requests;t public.work_order_tasks;
begin
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 if not private.object_manage(target_tenant) then raise exception 'Geen toegang' using errcode='42501';end if;
 select * into r from public.object_visit_requests where tenant_id=target_tenant and id=target_request for update;
 if r.state='withdrawn' then raise exception 'Dit verzoek is ingetrokken. Maak zo nodig een nieuw verzoek.' using errcode='23514';end if;
 if decision in ('completed','partial','not_done') then
  select * into t from public.work_order_tasks where tenant_id=target_tenant and id=r.work_order_task_id;
  if t.id is null or t.completed_at is null or (case when t.execution_state='planned' then 'completed' else t.execution_state end)<>decision then raise exception 'Leg eerst het werkelijke uitvoeringsresultaat en de hoeveelheid vast op de werkbon' using errcode='23514';end if;
 end if;
 perform private.review_object_request_base(target_tenant,target_request,expected_version,decision,input);
end $function$;

CREATE OR REPLACE FUNCTION public.review_work_order (
  target_work_order_id uuid,
  decision             text,
  reason               text DEFAULT NULL::text
)
  RETURNS public.work_orders
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare w public.work_orders;t public.work_order_tasks;result public.work_orders;
begin
 select * into w from public.work_orders where id=target_work_order_id;
 if not private.commercial_access(w.tenant_id) then raise exception 'Geen rapportcontroletoegang' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||w.tenant_id::text,0));
 select * into w from public.work_orders where id=target_work_order_id for update;
 if decision='approved' then
  if exists(select 1 from public.object_visit_requests where tenant_id=w.tenant_id and work_order_id=w.id and needs_review) then raise exception 'Beoordeel eerst de gewijzigde verzoeken bij deze uitvoering' using errcode='23514';end if;
  for t in select * from public.work_order_tasks where tenant_id=w.tenant_id and work_order_id=w.id and is_extra_work and extra_work_status='awaiting_review' for update loop
   if not exists(select 1 from public.object_visit_requests r join public.object_request_proposals p on p.request_id=r.id where r.work_order_task_id=t.id and p.accepted_at is not null and p.quantity=t.quantity and p.price_cents=t.unit_price_cents and p.task_revision_id=t.task_revision_id)
   and not exists(select 1 from public.work_order_allowed_extra_work a join public.extra_work_rules r on r.id=a.extra_work_rule_id and r.tenant_id=a.tenant_id where a.tenant_id=t.tenant_id and a.work_order_id=t.work_order_id and r.task_revision_id=t.task_revision_id and r.active) then raise exception 'Meerwerk heeft nog geen aantoonbaar akkoord. Leg een passend voorstel vast of stuur het rapport terug.' using errcode='23514';end if;
   update public.work_order_tasks set extra_work_status='approved' where id=t.id;
  end loop;
 end if;
 result:=private.review_work_order_base(target_work_order_id,decision,reason);
 return result;
end $function$;

CREATE OR REPLACE FUNCTION public.withdraw_object_request (
  target_tenant    uuid,
  target_request   uuid,
  expected_version bigint,
  reason           text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare r public.object_visit_requests;w public.work_orders;
begin
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 select * into r from public.object_visit_requests where tenant_id=target_tenant and id=target_request for update;
 if r.id is null or not private.object_visit_access(target_tenant,r.object_id,r.work_order_id) or r.created_by<>auth.uid() then raise exception 'Geen toegang tot dit verzoek' using errcode='42501';end if;
 if r.version<>expected_version then raise exception 'Verzoek gewijzigd. Vernieuw de pagina.' using errcode='40001';end if;
 select * into w from public.work_orders where tenant_id=target_tenant and id=r.work_order_id;
 if r.work_order_task_id is not null or w.status not in ('planned','released','seen','travelling','in_progress') or length(btrim(coalesce(reason,'')))<2 then raise exception 'Dit verzoek is al in uitvoering of afgesloten. Stem een correctie af.' using errcode='23514';end if;
 update public.object_visit_requests set state='withdrawn',needs_review=false,response=reason where id=r.id;
 perform private.object_notify(target_tenant,r.object_id,r.work_order_id,'withdrawn:'||r.id::text||':'||(r.version+1)::text);
end $function$;

REVOKE ALL ON FUNCTION "public"."withdraw_object_request"(uuid, uuid, bigint, text) FROM PUBLIC, "anon", "service_role";

ALTER TABLE "public"."customer_agreement_lines"
  ADD CONSTRAINT "customer_agreement_lines_tenant_id_object_id_fkey" FOREIGN KEY (tenant_id, object_id) REFERENCES public.objects(tenant_id, id);

ALTER TABLE "public"."customer_agreement_lines"
  ADD CONSTRAINT "customer_agreement_lines_tenant_id_task_revision_id_fkey" FOREIGN KEY (tenant_id, task_revision_id) REFERENCES public.task_revisions(tenant_id, id);

ALTER TABLE "public"."customer_agreements"
  ADD CONSTRAINT "customer_agreements_tenant_id_customer_id_fkey" FOREIGN KEY (tenant_id, customer_id) REFERENCES public.customers(tenant_id, id);

ALTER TABLE "public"."customer_agreements"
  ADD CONSTRAINT "customer_agreements_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);

ALTER TABLE "public"."customer_agreement_lines"
  ADD CONSTRAINT "customer_agreement_lines_tenant_id_agreement_id_fkey" FOREIGN KEY (tenant_id, agreement_id) REFERENCES public.customer_agreements(tenant_id, id);

ALTER TABLE "public"."customer_agreements"
  ADD CONSTRAINT "customer_agreements_tenant_id_previous_id_fkey" FOREIGN KEY (tenant_id, previous_id) REFERENCES public.customer_agreements(tenant_id, id);

ALTER TABLE "public"."customer_documents"
  ADD CONSTRAINT "customer_document_single_successor" UNIQUE (previous_id);

ALTER TABLE "public"."customer_documents"
  ADD CONSTRAINT "customer_document_tenant_id_unique" UNIQUE (tenant_id, id);

ALTER TABLE "public"."customer_agreements"
  ADD CONSTRAINT "customer_agreements_tenant_id_evidence_document_id_fkey" FOREIGN KEY (tenant_id, evidence_document_id) REFERENCES public.customer_documents(tenant_id, id);

ALTER TABLE "public"."customer_documents"
  ADD CONSTRAINT "customer_document_previous_fk" FOREIGN KEY (tenant_id, previous_id) REFERENCES public.customer_documents(tenant_id, id);

ALTER TABLE "public"."dossier_documents"
  ADD CONSTRAINT "dossier_documents_tenant_id_customer_id_fkey" FOREIGN KEY (tenant_id, customer_id) REFERENCES public.customers(tenant_id, id);

ALTER TABLE "public"."dossier_documents"
  ADD CONSTRAINT "dossier_documents_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);

ALTER TABLE "public"."dossier_documents"
  ADD CONSTRAINT "dossier_documents_tenant_id_object_id_fkey" FOREIGN KEY (tenant_id, object_id) REFERENCES public.objects(tenant_id, id);

ALTER TABLE "public"."dossier_documents"
  ADD CONSTRAINT "dossier_documents_tenant_id_personnel_id_fkey" FOREIGN KEY (tenant_id, personnel_id) REFERENCES public.personnel(tenant_id, id);

ALTER TABLE "public"."invoice_lines"
  ADD CONSTRAINT "invoice_task_fk" FOREIGN KEY (tenant_id, work_order_task_id) REFERENCES public.work_order_tasks(tenant_id, id);

ALTER TABLE "public"."object_records"
  ADD CONSTRAINT "object_record_agreement_fk" FOREIGN KEY (tenant_id, agreement_line_id) REFERENCES public.customer_agreement_lines(tenant_id, id);

ALTER TABLE "public"."object_visit_requests"
  ADD CONSTRAINT "object_visit_requests_state_check"
    CHECK
    ((state = ANY (ARRAY['new'::text, 'review'::text, 'regular'::text, 'proposal'::text, 'accepted'::text, 'rejected'::text, 'withdrawn'::text, 'completed'::text, 'partial'::text,
    'not_done'::text])));

ALTER TABLE "public"."work_order_tasks"
  ADD CONSTRAINT "task_agreement_line_fk" FOREIGN KEY (tenant_id, agreement_line_id) REFERENCES public.customer_agreement_lines(tenant_id, id);

ALTER TABLE "public"."work_order_tasks"
  ADD CONSTRAINT "task_executed_quantity" CHECK (((executed_quantity IS NULL) OR ((executed_quantity >= (0)::numeric) AND (executed_quantity <= quantity))));

ALTER TABLE "public"."work_order_tasks"
  ADD CONSTRAINT "work_order_tasks_execution_state_check" CHECK ((execution_state = ANY (ARRAY['planned'::text, 'completed'::text, 'partial'::text, 'not_done'::text])));

CREATE INDEX customer_agreement_customer ON public.customer_agreements USING btree (tenant_id, customer_id);

CREATE INDEX customer_agreement_object ON public.customer_agreement_lines USING btree (tenant_id, object_id);

CREATE INDEX dossier_document_context ON public.dossier_documents USING btree (tenant_id, customer_id, object_id, personnel_id);

CREATE UNIQUE INDEX invoice_request_once ON public.invoices USING btree (tenant_id, source_request_id)
  WHERE (source_request_id IS NOT NULL);

CREATE INDEX invoice_source_task ON public.invoice_lines USING btree (tenant_id, work_order_task_id);

CREATE INDEX object_record_agreement ON public.object_records USING btree (tenant_id, agreement_line_id);

CREATE INDEX task_agreement_line ON public.work_order_tasks USING btree (tenant_id, agreement_line_id);

CREATE TRIGGER customer_document_version
  BEFORE INSERT ON public.customer_documents
  FOR EACH ROW
  EXECUTE FUNCTION private.customer_document_version();

CREATE TRIGGER register_dossier_document
  AFTER INSERT OR UPDATE ON public.customer_documents
  FOR EACH ROW
  EXECUTE FUNCTION private.register_dossier_document();

CREATE TRIGGER unregister_dossier_document
  AFTER DELETE ON public.customer_documents
  FOR EACH ROW
  EXECUTE FUNCTION private.unregister_dossier_document();

CREATE TRIGGER invoice_source
  BEFORE INSERT OR UPDATE ON public.invoice_lines
  FOR EACH ROW
  EXECUTE FUNCTION private.invoice_source_guard();

CREATE TRIGGER register_dossier_document
  AFTER INSERT OR UPDATE ON public.object_documents
  FOR EACH ROW
  EXECUTE FUNCTION private.register_dossier_document();

CREATE TRIGGER unregister_dossier_document
  AFTER DELETE ON public.object_documents
  FOR EACH ROW
  EXECUTE FUNCTION private.unregister_dossier_document();

CREATE TRIGGER agreement_scope
  BEFORE INSERT OR UPDATE ON public.object_records
  FOR EACH ROW
  EXECUTE FUNCTION private.agreement_scope_guard();

CREATE TRIGGER register_dossier_document
  AFTER INSERT OR UPDATE ON public.personnel_documents
  FOR EACH ROW
  EXECUTE FUNCTION private.register_dossier_document();

CREATE TRIGGER unregister_dossier_document
  AFTER DELETE ON public.personnel_documents
  FOR EACH ROW
  EXECUTE FUNCTION private.unregister_dossier_document();

CREATE TRIGGER agreement_scope
  BEFORE INSERT OR UPDATE ON public.work_order_tasks
  FOR EACH ROW
  EXECUTE FUNCTION private.agreement_scope_guard();

CREATE TRIGGER task_execution
  BEFORE UPDATE ON public.work_order_tasks
  FOR EACH ROW
  EXECUTE FUNCTION private.task_execution_guard();

CREATE TRIGGER zz_allocated_execution
  BEFORE UPDATE ON public.work_order_tasks
  FOR EACH ROW
  EXECUTE FUNCTION private.protect_allocated_execution();

CREATE POLICY "agreement_line_read" ON "public"."customer_agreement_lines"
  FOR SELECT
  TO "authenticated"
  USING (private.commercial_access(tenant_id));

CREATE POLICY "agreement_read" ON "public"."customer_agreements"
  FOR SELECT
  TO "authenticated"
  USING (private.commercial_access(tenant_id));

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
    WHEN 'personnel'::text THEN (EXISTS ( SELECT 1
       FROM public.personnel_documents d
      WHERE ((d.tenant_id = dossier_documents.tenant_id) AND (d.id = dossier_documents.source_id))))
    ELSE NULL::boolean
END));

REVOKE ALL ON FUNCTION "private"."agreement_scope_guard"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."agreement_scope_guard"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."commercial_access"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."commercial_access"(uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."customer_document_version"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."customer_document_version"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."finalize_invoice_snapshot"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."finalize_invoice_snapshot"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."invoice_source_guard"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."invoice_source_guard"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."object_session_active"() FROM "authenticated";

GRANT EXECUTE ON FUNCTION "private"."object_session_active"() TO "authenticated";

REVOKE ALL ON FUNCTION "private"."object_visit_projection"(uuid, uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."object_visit_projection"(uuid, uuid, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."protect_allocated_execution"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."protect_allocated_execution"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."register_dossier_document"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."register_dossier_document"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."review_object_request_base"(uuid, uuid, bigint, text, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."review_object_request_base"(uuid, uuid, bigint, text, jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "private"."review_work_order_base"(uuid, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."review_work_order_base"(uuid, text, text) TO "postgres";

REVOKE ALL ON FUNCTION "private"."task_execution_guard"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."task_execution_guard"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."unregister_dossier_document"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."unregister_dossier_document"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."create_execution_invoice"(uuid, uuid, jsonb) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."current_event_recipients"(uuid) TO "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."dossier_chain"(uuid, uuid, uuid, uuid, uuid) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."object_agreement_options"(uuid, uuid) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."record_customer_agreement"(uuid, uuid, jsonb) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."record_task_execution"(uuid, uuid, bigint, text, numeric, text) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."withdraw_object_request"(uuid, uuid, bigint, text) TO "authenticated", "postgres";

REVOKE ALL ON TABLE "public"."customer_agreement_lines" FROM "authenticated";

GRANT SELECT ON TABLE "public"."customer_agreement_lines" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."customer_agreement_lines" TO "postgres";

REVOKE ALL ON TABLE "public"."customer_agreement_lines" FROM "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."customer_agreement_lines" TO "service_role";

REVOKE ALL ON TABLE "public"."customer_agreements" FROM "authenticated";

GRANT SELECT ON TABLE "public"."customer_agreements" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."customer_agreements" TO "postgres";

REVOKE ALL ON TABLE "public"."customer_agreements" FROM "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."customer_agreements" TO "service_role";

REVOKE ALL ON TABLE "public"."dossier_documents" FROM "authenticated";

GRANT SELECT ON TABLE "public"."dossier_documents" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."dossier_documents" TO "postgres";

REVOKE ALL ON TABLE "public"."dossier_documents" FROM "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."dossier_documents" TO "service_role";

ALTER TABLE "public"."customer_agreements"
  ADD CONSTRAINT "customer_agreements_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);

-- Explicit identity mapping of existing files; no copying, merging by name or access expansion.
insert into public.dossier_documents(tenant_id,source_kind,source_id,customer_id,classification)
select tenant_id,'customer',id,customer_id,'commercial' from public.customer_documents
on conflict(source_kind,source_id) do nothing;
insert into public.dossier_documents(tenant_id,source_kind,source_id,customer_id,object_id,classification)
select d.tenant_id,'object',d.id,o.customer_id,d.object_id,case when d.category='security' then 'restricted' else 'operational' end
from public.object_documents d join public.objects o on o.tenant_id=d.tenant_id and o.id=d.object_id
on conflict(source_kind,source_id) do nothing;
insert into public.dossier_documents(tenant_id,source_kind,source_id,personnel_id,classification)
select tenant_id,'personnel',id,personnel_id,'hr' from public.personnel_documents
on conflict(source_kind,source_id) do nothing;
