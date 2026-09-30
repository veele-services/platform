SET local check_function_bodies = off;

ALTER TABLE "public"."customer_agreements"
  DROP CONSTRAINT "customer_agreements_state_check";

ALTER TABLE "public"."customers"
  DROP CONSTRAINT "customers_status_check";

CREATE TABLE "private"."customer_command_receipts" (
  "tenant_id"  uuid                     NOT NULL,
  "request_id" uuid                     NOT NULL,
  "actor_id"   uuid                     NOT NULL,
  "command"    text                     NOT NULL,
  "input_hash" text                     NOT NULL,
  "result"     jsonb                    NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "customer_command_receipts_pkey" PRIMARY KEY (tenant_id, request_id)
);

ALTER TABLE "private"."customer_command_receipts"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."customer_agreement_lines"
  ADD COLUMN "unit" text NOT NULL DEFAULT 'uitvoering'::text;

ALTER TABLE "public"."customer_agreement_lines"
  ADD COLUMN "vat_basis_points" integer;

ALTER TABLE "public"."customer_agreement_lines"
  ADD COLUMN "price_basis" text NOT NULL DEFAULT 'visit'::text;

ALTER TABLE "public"."customer_agreement_lines"
  ADD COLUMN "frequency" text NOT NULL DEFAULT ''::text;

ALTER TABLE "public"."customer_agreement_lines"
  ADD COLUMN "time_window" text NOT NULL DEFAULT ''::text;

ALTER TABLE "public"."customer_agreement_lines"
  ADD COLUMN "duration_minutes" integer;

ALTER TABLE "public"."customer_agreement_lines"
  ADD COLUMN "extra_work" boolean NOT NULL DEFAULT false;

ALTER TABLE "public"."customer_agreements"
  ADD COLUMN "edit_version" bigint NOT NULL DEFAULT 1;

ALTER TABLE "public"."customer_agreements"
  ADD COLUMN "owner_user_id" uuid;

ALTER TABLE "public"."customer_agreements"
  ADD COLUMN "agreement_type" text NOT NULL DEFAULT 'service'::text;

ALTER TABLE "public"."customer_agreements"
  ADD COLUMN "details" jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "public"."customer_agreements"
  ADD COLUMN "review_on" date;

ALTER TABLE "public"."customer_agreements"
  ADD COLUMN "notice_on" date;

ALTER TABLE "public"."customer_agreements"
  ADD COLUMN "renewal_on" date;

ALTER TABLE "public"."customer_contacts"
  ADD COLUMN "organization" text NOT NULL DEFAULT ''::text;

ALTER TABLE "public"."customer_contacts"
  ADD COLUMN "labels" text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE "public"."customer_contacts"
  ADD COLUMN "availability" text NOT NULL DEFAULT ''::text;

ALTER TABLE "public"."customer_contacts"
  ADD COLUMN "object_ids" uuid[] NOT NULL DEFAULT '{}'::uuid[];

ALTER TABLE "public"."customer_contacts"
  ADD COLUMN "active_from" date;

ALTER TABLE "public"."customer_contacts"
  ADD COLUMN "active_until" date;

ALTER TABLE "public"."customer_contacts"
  ADD COLUMN "active" boolean NOT NULL DEFAULT true;

ALTER TABLE "public"."customer_contacts"
  ADD COLUMN "version" bigint NOT NULL DEFAULT 1;

ALTER TABLE "public"."customer_contacts"
  ADD COLUMN "updated_at" timestamp WITH time zone NOT NULL DEFAULT clock_timestamp();

ALTER TABLE "public"."customer_documents"
  ADD COLUMN "category" text NOT NULL DEFAULT 'other'::text;

ALTER TABLE "public"."customer_documents"
  ADD COLUMN "visibility" text NOT NULL DEFAULT 'internal'::text;

ALTER TABLE "public"."customer_documents"
  ADD COLUMN "archived" boolean NOT NULL DEFAULT false;

ALTER TABLE "public"."customer_documents"
  ADD COLUMN "metadata_version" bigint NOT NULL DEFAULT 1;

ALTER TABLE "public"."customer_notes"
  ADD COLUMN "kind" text NOT NULL DEFAULT 'note'::text;

ALTER TABLE "public"."customer_notes"
  ADD COLUMN "title" text NOT NULL DEFAULT ''::text;

ALTER TABLE "public"."customer_notes"
  ADD COLUMN "owner_user_id" uuid;

ALTER TABLE "public"."customer_notes"
  ADD COLUMN "due_on" date;

ALTER TABLE "public"."customer_notes"
  ADD COLUMN "state" text NOT NULL DEFAULT 'open'::text;

ALTER TABLE "public"."customer_notes"
  ADD COLUMN "object_id" uuid;

ALTER TABLE "public"."customer_notes"
  ADD COLUMN "work_order_id" uuid;

ALTER TABLE "public"."customer_notes"
  ADD COLUMN "version" bigint NOT NULL DEFAULT 1;

ALTER TABLE "public"."customer_notes"
  ADD COLUMN "updated_at" timestamp WITH time zone NOT NULL DEFAULT clock_timestamp();

ALTER TABLE "public"."customers"
  ADD COLUMN "customer_type" text NOT NULL DEFAULT 'business'::text;

ALTER TABLE "public"."customers"
  ADD COLUMN "legal_name" text NOT NULL DEFAULT ''::text;

ALTER TABLE "public"."customers"
  ADD COLUMN "trade_name" text NOT NULL DEFAULT ''::text;

ALTER TABLE "public"."customers"
  ADD COLUMN "email" text NOT NULL DEFAULT ''::text;

ALTER TABLE "public"."customers"
  ADD COLUMN "website" text NOT NULL DEFAULT ''::text;

ALTER TABLE "public"."customers"
  ADD COLUMN "company_number" text NOT NULL DEFAULT ''::text;

ALTER TABLE "public"."customers"
  ADD COLUMN "vat_number" text NOT NULL DEFAULT ''::text;

ALTER TABLE "public"."customers"
  ADD COLUMN "visit_address" jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "public"."customers"
  ADD COLUMN "billing_preferences" jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "public"."customers"
  ADD COLUMN "owner_user_id" uuid;

ALTER TABLE "public"."customers"
  ADD COLUMN "relationship_since" date;

ALTER TABLE "public"."customers"
  ADD COLUMN "services" text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE "public"."customers"
  ADD COLUMN "preferences" text NOT NULL DEFAULT ''::text;

ALTER TABLE "public"."customers"
  ADD COLUMN "created_by" uuid;

ALTER TABLE "public"."customers"
  ADD COLUMN "updated_by" uuid;

ALTER TABLE "public"."customers"
  ADD COLUMN "reminders_enabled" boolean NOT NULL DEFAULT false;

ALTER TABLE "public"."customer_agreements"
  ALTER COLUMN "accepted_by_name" DROP NOT NULL;

ALTER TABLE "public"."customer_agreements"
  ALTER COLUMN "accepted_on" DROP NOT NULL;

ALTER TABLE "public"."customer_agreements"
  ALTER COLUMN "starts_on" DROP NOT NULL;

CREATE OR REPLACE FUNCTION private.agreement_scope_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare l public.customer_agreement_lines; a public.customer_agreements; o uuid; w public.work_orders; business_day date; candidates uuid[];
begin
 if tg_table_name='work_order_tasks' then
  if new.commercial_snapshot ? 'quote_id' then return new;end if;
 end if;
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
  where a1.state='active' and l1.price_basis='visit' and not l1.extra_work and r.tenant_id=new.tenant_id and r.object_id=w.object_id and r.kind='programme' and r.state='active' and r.task_revision_id=new.task_revision_id
  and a1.starts_on<=(w.projected_start_at at time zone (select timezone from public.tenants where id=new.tenant_id))::date and (a1.ends_on is null or a1.ends_on>=((w.projected_end_at - interval '1 microsecond') at time zone (select timezone from public.tenants where id=new.tenant_id))::date)
  and not exists(select 1 from public.customer_agreements next_a where next_a.previous_id=a1.id and next_a.state='active' and next_a.starts_on<=(w.projected_start_at at time zone (select timezone from public.tenants where id=new.tenant_id))::date)
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
 if a.state<>'active' or l.price_basis<>'visit' or (tg_table_name='object_records' and l.extra_work) or l.id is null or l.object_id<>o or l.task_revision_id is distinct from new.task_revision_id or not exists(select 1 from public.objects where tenant_id=new.tenant_id and id=o and customer_id=a.customer_id) then raise exception 'De afspraak hoort niet bij dit object of deze catalogustaak' using errcode='23514';end if;
 if tg_table_name='work_order_tasks' then
  if l.extra_work is distinct from new.is_extra_work then raise exception 'De contractregel is niet bestemd voor dit type werk' using errcode='23514';end if;
  if tg_op='UPDATE' and (old.agreement_line_id is distinct from new.agreement_line_id or old.commercial_snapshot is distinct from new.commercial_snapshot) then raise exception 'De vastgelegde commerciële bron is onveranderlijk' using errcode='23514';end if;
  if new.unit_price_cents<>l.price_cents or new.quantity+coalesce((select sum(t.quantity) from public.work_order_tasks t where t.tenant_id=new.tenant_id and t.work_order_id=new.work_order_id and t.agreement_line_id=l.id and t.id<>new.id),0)>l.quantity or round((new.quantity+coalesce((select sum(t.quantity) from public.work_order_tasks t where t.tenant_id=new.tenant_id and t.work_order_id=new.work_order_id and t.agreement_line_id=l.id and t.id<>new.id),0))*new.unit_price_cents)>l.limit_cents then raise exception 'De gezamenlijke uitvoering overschrijdt de afgesproken hoeveelheid of prijs per bezoek' using errcode='23514';end if;
  if tg_op='INSERT' then
   if l.vat_basis_points is not null then new.vat_basis_points:=l.vat_basis_points;end if;
   business_day:=(coalesce(w.projected_start_at,clock_timestamp()) at time zone (select timezone from public.tenants where id=new.tenant_id))::date;
   if a.state<>'active' or a.starts_on>business_day or a.ends_on<((coalesce(w.projected_end_at,w.projected_start_at,clock_timestamp())-interval '1 microsecond') at time zone (select timezone from public.tenants where id=new.tenant_id))::date or exists(select 1 from public.customer_agreements n where n.previous_id=a.id and n.state='active' and n.starts_on<=business_day) then raise exception 'Kies de geldige contractversie voor deze uitvoering' using errcode='23514';end if;
   if new.quantity>l.quantity or new.unit_price_cents<>l.price_cents or round(new.quantity*new.unit_price_cents)>l.limit_cents then raise exception 'Deze uitvoering overschrijdt de contractafspraak' using errcode='23514';end if;
   new.commercial_snapshot:=jsonb_build_object('agreementId',a.id,'version',a.version,'lineId',l.id,'scope',l.scope,'quantity',l.quantity,'limitCents',l.limit_cents,'priceCents',l.price_cents,'acceptedBy',a.accepted_by_name,'acceptedOn',a.accepted_on,'evidenceDocumentId',a.evidence_document_id);
  end if;
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.customer_audit()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 if auth.uid() is not null then insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,before_data,after_data)
 values(new.tenant_id,auth.uid(),case when tg_op='INSERT' then 'created' else 'updated' end,tg_table_name,new.id,
 case when tg_op='UPDATE' then to_jsonb(old) end,to_jsonb(new));end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.customer_command (
  target_tenant uuid,
  request_id    uuid,
  command       text,
  input         jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
#variable_conflict use_variable
declare c public.customers; ct public.customer_contacts; n public.customer_notes; a public.customer_agreements; prev public.customer_agreements;
 id uuid:=(input->>'id')::uuid; cid uuid; expected bigint:=coalesce((input->>'version')::bigint,0); result jsonb;
 receipt private.customer_command_receipts; ln jsonb; bp jsonb; d jsonb; ver bigint:=1;
begin
 if not private.customer_manage(target_tenant) or auth.uid() is null or request_id is null then raise exception 'Geen toegang tot het klantdossier' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-customer:'||target_tenant::text,0));
 select * into receipt from private.customer_command_receipts r where r.tenant_id=target_tenant and r.request_id=customer_command.request_id;
 if found then
  if receipt.actor_id<>auth.uid() or receipt.command<>customer_command.command or receipt.input_hash<>md5(input::text) then raise exception 'Deze opslagpoging is al gebruikt. Herlaad de gegevens.' using errcode='40001';end if;
  return receipt.result;
 end if;
 if command='customer_save' then
  select * into c from public.customers where tenant_id=target_tenant and customers.id=id for update;
  if expected=0 and c.id is not null or expected>0 and (c.id is null or c.version<>expected) then raise exception 'De klant is intussen gewijzigd. Herlaad de gegevens.' using errcode='40001';end if;
  if length(btrim(coalesce(input->>'name','')))<2 then raise exception 'Vul een klantnaam in' using errcode='23514';end if;
  bp:=jsonb_build_object('channel',coalesce(input->>'invoiceChannel','email'),'contact',coalesce(input->>'invoiceContact',''),'reference',coalesce(input->>'reference',''),'referenceRequired',coalesce((input->>'referenceRequired')::boolean,false),'costCenter',coalesce(input->>'costCenter',''));
  if expected=0 then
   insert into public.customers(id,tenant_id,customer_number,name,status,version) values(id,target_tenant,'KL-'||to_char(clock_timestamp(),'YYYY')||'-'||upper(substr(replace(id::text,'-',''),1,10)),btrim(input->>'name'),coalesce(input->>'status','lead'),0);
  end if;
  update public.customers set name=btrim(input->>'name'),customer_type=input->>'type',legal_name=coalesce(input->>'legalName',''),trade_name=coalesce(input->>'tradeName',''),email=coalesce(input->>'email',''),phone=nullif(input->>'phone',''),website=coalesce(input->>'website',''),company_number=coalesce(input->>'companyNumber',''),vat_number=coalesce(input->>'vatNumber',''),
   visit_address=coalesce(input->'visitAddress','{}'),billing_address=coalesce(input->'billingAddress','{}'),billing_email=nullif(input->>'billingEmail',''),payment_terms_days=coalesce((input->>'paymentTerms')::int,(select payment_terms_days from public.tenant_settings where tenant_id=target_tenant)),billing_preferences=bp,
   status=input->>'status',reminders_enabled=coalesce((input->>'remindersEnabled')::boolean,false),owner_user_id=nullif(input->>'ownerId','')::uuid,relationship_since=nullif(input->>'since','')::date,services=array(select jsonb_array_elements_text(coalesce(input->'services','[]'))),preferences=coalesce(input->>'preferences',''),version=case when expected=0 then 1 else expected+1 end
  where tenant_id=target_tenant and customers.id=id;
  if expected=0 and length(btrim(coalesce(input->>'contactName','')))>0 then
   insert into public.customer_contacts(tenant_id,customer_id,full_name,email,phone,role,is_primary,labels)
   values(target_tenant,id,btrim(input->>'contactName'),nullif(input->>'contactEmail',''),nullif(input->>'contactPhone',''),nullif(input->>'contactRole',''),true,array(select jsonb_array_elements_text(coalesce(input->'contactLabels','["operational"]'))));
  end if;
  cid:=id;
 elsif command in ('customer_archive','customer_delete') then
  if not private.has_role(target_tenant,array['tenant_admin','management']::public.app_role[]) then raise exception 'Alleen beheer kan relaties verwijderen of archiveren' using errcode='42501';end if;
  select * into c from public.customers where tenant_id=target_tenant and customers.id=id for update;
  if c.id is null or c.version<>expected then raise exception 'De klant is intussen gewijzigd' using errcode='40001';end if;
  if command='customer_delete' then
   if exists(select 1 from public.customer_contacts where tenant_id=target_tenant and customer_id=id) then raise exception 'Deze klant is in gebruik. Archiveer de relatie om de historie te behouden.' using errcode='23514';end if;
   delete from public.customers where tenant_id=target_tenant and customers.id=id;
  else update public.customers set status='archived',version=version+1 where tenant_id=target_tenant and customers.id=id;end if;
  cid:=id;
 elsif command='contact_save' then
  cid:=(input->>'customerId')::uuid;
  if not exists(select 1 from public.customers where tenant_id=target_tenant and customers.id=cid) then raise exception 'Klant niet beschikbaar' using errcode='42501';end if;
  select * into ct from public.customer_contacts where tenant_id=target_tenant and customer_id=cid and customer_contacts.id=id for update;
  if expected=0 and ct.id is not null or expected>0 and (ct.id is null or ct.version<>expected) then raise exception 'Het contact is intussen gewijzigd' using errcode='40001';end if;
  if coalesce((input->>'primary')::boolean,false) then update public.customer_contacts set is_primary=false,version=version+1,updated_at=clock_timestamp() where tenant_id=target_tenant and customer_id=cid and is_primary and customer_contacts.id<>id;end if;
  if expected=0 then insert into public.customer_contacts(id,tenant_id,customer_id,full_name) values(id,target_tenant,cid,input->>'fullName');end if;
  update public.customer_contacts set full_name=input->>'fullName',email=nullif(input->>'email',''),phone=nullif(input->>'phone',''),role=nullif(input->>'role',''),organization=coalesce(input->>'organization',''),is_primary=coalesce((input->>'primary')::boolean,false),
   labels=array(select jsonb_array_elements_text(coalesce(input->'labels','[]'))),availability=coalesce(input->>'availability',''),object_ids=array(select value::uuid from jsonb_array_elements_text(coalesce(input->'objectIds','[]'))),active_from=nullif(input->>'activeFrom','')::date,active_until=nullif(input->>'activeUntil','')::date,active=coalesce((input->>'active')::boolean,true),version=case when expected=0 then 1 else expected+1 end,updated_at=clock_timestamp()
  where tenant_id=target_tenant and customer_contacts.id=id;
 elsif command='note_save' then
  cid:=(input->>'customerId')::uuid;
  if not exists(select 1 from public.customers where tenant_id=target_tenant and customers.id=cid) then raise exception 'Klant niet beschikbaar' using errcode='42501';end if;
  if nullif(input->>'ownerId','') is not null and not exists(select 1 from public.tenant_memberships where tenant_id=target_tenant and user_id=(input->>'ownerId')::uuid and status='active' and roles&&array['tenant_admin','management','planner','finance']::public.app_role[]) then raise exception 'Kies een actieve behandelaar' using errcode='23514';end if;
  insert into public.customer_notes(id,tenant_id,customer_id,body,created_by,kind,title,owner_user_id,due_on,object_id,work_order_id)
  values(id,target_tenant,cid,input->>'body',auth.uid(),coalesce(input->>'kind','note'),coalesce(input->>'title',''),nullif(input->>'ownerId','')::uuid,nullif(input->>'dueOn','')::date,nullif(input->>'objectId','')::uuid,nullif(input->>'orderId','')::uuid);
 elsif command='note_complete' then
  select * into n from public.customer_notes where tenant_id=target_tenant and customer_notes.id=id for update;
  if n.id is null or n.version<>expected then raise exception 'De actie is intussen gewijzigd' using errcode='40001';end if;
  update public.customer_notes set state='completed',version=version+1,updated_at=clock_timestamp() where tenant_id=target_tenant and customer_notes.id=id;cid:=n.customer_id;
  insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(target_tenant,auth.uid(),'completed','customer_notes',id,jsonb_build_object('customer_id',cid,'version',expected+1));
 elsif command='document_metadata' then
  if not exists(select 1 from public.customer_documents where tenant_id=target_tenant and customer_documents.id=id and metadata_version=expected) then raise exception 'Document intussen gewijzigd of niet beschikbaar' using errcode='40001';end if;
  update public.customer_documents set category=input->>'category',visibility=input->>'visibility',archived=coalesce((input->>'archived')::boolean,false),metadata_version=metadata_version+1 where tenant_id=target_tenant and customer_documents.id=id returning customer_id into cid;
 elsif command='agreement_save' then
  if not private.commercial_access(target_tenant) then raise exception 'Geen toegang tot contractafspraken' using errcode='42501';end if;
  cid:=(input->>'customerId')::uuid;
  if not exists(select 1 from public.customers where tenant_id=target_tenant and customers.id=cid and status not in ('archived','inactive')) then raise exception 'Kies een beschikbare klant' using errcode='23514';end if;
  select * into a from public.customer_agreements where tenant_id=target_tenant and customer_id=cid and customer_agreements.id=id for update;
  if expected=0 and a.id is not null or expected>0 and (a.id is null or a.edit_version<>expected or a.state<>'draft') then raise exception 'Gebruik een nieuwe contractversie; een vastgelegde afspraak blijft behouden.' using errcode='40001';end if;
  if input->>'state' not in ('draft','active') then raise exception 'Ongeldige contractstatus' using errcode='23514';end if;
  if nullif(input->>'previousId','') is not null then
   select * into prev from public.customer_agreements where tenant_id=target_tenant and customer_id=cid and customer_agreements.id=(input->>'previousId')::uuid for update;
   if prev.id is null or prev.state='draft' or exists(select 1 from public.customer_agreements x where x.previous_id=prev.id and x.id<>id) then raise exception 'Kies de actuele vastgelegde contractversie' using errcode='40001';end if;
   ver:=prev.version+1;
  end if;
  if nullif(input->>'ownerId','') is not null and not exists(select 1 from public.tenant_memberships where tenant_id=target_tenant and user_id=(input->>'ownerId')::uuid and status='active' and roles&&array['tenant_admin','management','finance']::public.app_role[]) then raise exception 'Kies een bevoegde contractverantwoordelijke' using errcode='23514';end if;
  if jsonb_typeof(input->'lines') is distinct from 'array' or jsonb_array_length(input->'lines')>100 then raise exception 'Controleer de contractregels' using errcode='23514';end if;
  if nullif(input->>'documentId','') is not null and not exists(select 1 from public.customer_documents where tenant_id=target_tenant and customer_id=cid and customer_documents.id=(input->>'documentId')::uuid) then raise exception 'Akkoordbewijs hoort niet bij deze klant' using errcode='23514';end if;
  if input->>'state'='active' then
   if jsonb_array_length(input->'lines')=0 or nullif(input->>'startsOn','') is null or length(btrim(coalesce(input->>'acceptedBy','')))<2 or nullif(input->>'acceptedOn','') is null or (input->>'acceptedOn')::date>(clock_timestamp() at time zone (select timezone from public.tenants where tenants.id=target_tenant))::date
   or not exists(select 1 from public.customer_documents where tenant_id=target_tenant and customer_id=cid and customer_documents.id=nullif(input->>'documentId','')::uuid and not archived) then raise exception 'Leg ingangsdatum, regels, akkoordgever, akkoorddatum en een document als bewijs vast.' using errcode='23514';end if;
  end if;
  d:=jsonb_build_object('scope',coalesce(input->>'scope',''),'exclusions',coalesce(input->>'exclusions',''),'quality',coalesce(input->>'quality',''),'frequency',coalesce(input->>'frequency',''),'window',coalesce(input->>'window',''),'billingFrequency',coalesce(input->>'billingFrequency',''),'paymentTerms',coalesce(input->>'paymentTerms',''),'reference',coalesce(input->>'reference',''),'costCenter',coalesce(input->>'costCenter',''),'materials',coalesce(input->>'materials',''),'surcharges',coalesce(input->>'surcharges',''),'indexation',coalesce(input->>'indexation',''),'noticePeriod',coalesce(input->>'noticePeriod',''),'changeReason',coalesce(input->>'changeReason',''));
  if expected=0 then insert into public.customer_agreements(id,tenant_id,customer_id,previous_id,version,title,state,starts_on,accepted_by_name,accepted_on) values(id,target_tenant,cid,prev.id,ver,input->>'title','draft',null,null,null);end if;
  update public.customer_agreements set title=input->>'title',state=input->>'state',starts_on=nullif(input->>'startsOn','')::date,ends_on=nullif(input->>'endsOn','')::date,accepted_by_name=case when input->>'state'='active' then input->>'acceptedBy' end,accepted_on=case when input->>'state'='active' then (input->>'acceptedOn')::date end,evidence_document_id=nullif(input->>'documentId','')::uuid,
   owner_user_id=nullif(input->>'ownerId','')::uuid,agreement_type=input->>'type',details=d,review_on=nullif(input->>'reviewOn','')::date,notice_on=nullif(input->>'noticeOn','')::date,renewal_on=nullif(input->>'renewalOn','')::date,edit_version=case when expected=0 then 1 else expected+1 end
  where tenant_id=target_tenant and customer_agreements.id=id;
  delete from public.customer_agreement_lines where tenant_id=target_tenant and agreement_id=id;
  for ln in select value from jsonb_array_elements(input->'lines') loop
   if not exists(select 1 from public.objects where tenant_id=target_tenant and customer_id=cid and objects.id=(ln->>'objectId')::uuid) or not exists(select 1 from public.task_revisions where tenant_id=target_tenant and task_revisions.id=(ln->>'taskRevisionId')::uuid) then raise exception 'Kies een klantobject en een bestaande taakversie' using errcode='23514';end if;
   if coalesce(ln->>'priceBasis','visit')<>'visit' and coalesce((ln->>'extraWork')::boolean,false) then raise exception 'Vooraf toegestaan meerwerk vereist een limiet per bezoek' using errcode='23514';end if;
   insert into public.customer_agreement_lines(tenant_id,agreement_id,object_id,task_revision_id,scope,quantity,price_cents,limit_cents,unit,vat_basis_points,price_basis,frequency,time_window,duration_minutes,extra_work)
   values(target_tenant,id,(ln->>'objectId')::uuid,(ln->>'taskRevisionId')::uuid,ln->>'scope',(ln->>'quantity')::numeric,(ln->>'priceCents')::bigint,(ln->>'limitCents')::bigint,coalesce(ln->>'unit','uitvoering'),(ln->>'vatBasisPoints')::int,coalesce(ln->>'priceBasis','visit'),coalesce(ln->>'frequency',''),coalesce(ln->>'window',''),nullif(ln->>'durationMinutes','')::int,coalesce((ln->>'extraWork')::boolean,false));
  end loop;
  if input->>'state'='active' then perform private.enqueue_event(target_tenant,'agreement.recorded','customer',cid,jsonb_build_object('agreement_id',id,'version',ver),'agreement:'||id::text);end if;
 else raise exception 'Onbekende klantactie' using errcode='23514';end if;
 result:=jsonb_build_object('id',id,'customerId',cid);
 insert into private.customer_command_receipts(tenant_id,request_id,actor_id,command,input_hash,result) values(target_tenant,request_id,auth.uid(),command,md5(input::text),result);
 return result;
end $function$;

CREATE OR REPLACE FUNCTION private.customer_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare cid uuid; oid uuid;
begin
 if tg_op='DELETE' then
  if tg_table_name='customers' and (exists(select 1 from public.customer_notes where customer_id=old.id) or exists(select 1 from public.customer_documents where customer_id=old.id)) then raise exception 'Deze klant heeft dossierhistorie. Archiveer de relatie.' using errcode='23514';end if;
  return old;
 end if;
 if tg_table_name='customers' then
  new.visit_address:=private.normalize_changed_address(new.visit_address,case when tg_op='UPDATE' then old.visit_address else '{}'::jsonb end);
  if new.owner_user_id is not null and not exists(select 1 from public.tenant_memberships m where m.tenant_id=new.tenant_id and m.user_id=new.owner_user_id and m.status='active' and m.roles&&array['tenant_admin','management','planner','finance']::public.app_role[]) then raise exception 'Kies een actieve verantwoordelijke binnen deze organisatie' using errcode='23514';end if;
  if tg_op='INSERT' then new.created_by:=auth.uid();else new.updated_by:=auth.uid();end if;
 elsif tg_table_name='customer_contacts' then
  if tg_op='UPDATE' and (new.tenant_id<>old.tenant_id or new.customer_id<>old.customer_id) then raise exception 'Verplaats een contact niet naar een andere klant' using errcode='23514';end if;
  foreach oid in array new.object_ids loop
   if not exists(select 1 from public.objects where tenant_id=new.tenant_id and customer_id=new.customer_id and id=oid) then raise exception 'Het contactobject hoort niet bij deze klant' using errcode='23514';end if;
  end loop;
 elsif tg_table_name='customer_notes' then
  cid:=new.customer_id;
  if new.object_id is not null and not exists(select 1 from public.objects where tenant_id=new.tenant_id and customer_id=cid and id=new.object_id) then raise exception 'Object hoort niet bij de klant' using errcode='23514';end if;
  if new.work_order_id is not null and not exists(select 1 from public.work_orders where tenant_id=new.tenant_id and customer_id=cid and id=new.work_order_id and (new.object_id is null or object_id=new.object_id)) then raise exception 'Afspraak hoort niet bij de klant en het object' using errcode='23514';end if;
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.customer_invoice_access (
  t uuid,
  i uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select private.object_session_active() and private.service_enabled(t,'finance') and exists(
 select 1 from public.invoices inv where inv.tenant_id=t and inv.id=i and inv.status in ('sent','partially_paid','paid','overdue','credited') and private.customer_portal_bound(t,inv.customer_id)
 and exists(select 1 from public.invoice_lines l where l.tenant_id=t and l.invoice_id=i)
 and not exists(select 1 from public.invoice_lines l left join public.work_orders w on w.tenant_id=l.tenant_id and w.id=l.work_order_id where l.tenant_id=t and l.invoice_id=i and (w.id is null or not exists(select 1 from public.object_customer_bindings b where b.tenant_id=t and b.object_id=w.object_id and b.user_id=auth.uid() and b.active))))
$function$;

CREATE OR REPLACE FUNCTION private.customer_manage (
  t uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select private.object_session_active() and private.service_enabled(t,'planning') and private.has_role(t,array['tenant_admin','management','planner','finance']::public.app_role[])
$function$;

CREATE OR REPLACE FUNCTION private.customer_portal_bound (
  t uuid,
  c uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select private.object_session_active() and private.service_enabled(t,'planning') and exists(select 1 from public.object_customer_bindings b join public.objects o on o.id=b.object_id and o.tenant_id=b.tenant_id where b.tenant_id=t and b.user_id=auth.uid() and b.active and o.customer_id=c)
$function$;

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

  -- Revalidate and settle all rate groups in stable order before final snapshot.
  for lines in select to_jsonb(l) from public.invoice_lines l where l.tenant_id=target.tenant_id and l.invoice_id=target.id order by l.created_at,l.id loop
    update public.invoice_lines set description=(lines->>'description') where id=(lines->>'id')::uuid;
  end loop;
  select
    coalesce(sum(l.subtotal_cents),0)::bigint,
    coalesce(sum(l.vat_cents),0)::bigint,
    coalesce(sum(l.total_cents),0)::bigint,
    jsonb_agg(to_jsonb(l) - 'id' - 'tenant_id' - 'invoice_id' order by l.created_at, l.id)
  into calculated_subtotal, calculated_vat, calculated_total, lines
  from public.invoice_lines l
  where l.tenant_id = target.tenant_id and l.invoice_id = target.id;

  select jsonb_build_object('name',c.name,'customer_number',c.customer_number,'legal_name',c.legal_name,
    'trade_name',c.trade_name,'company_number',c.company_number,'vat_number',c.vat_number,
    'billing_address',c.billing_address,'billing_email',c.billing_email,
    'payment_terms_days',c.payment_terms_days,'billing_preferences',c.billing_preferences)
  into customer_data from public.customers c where c.tenant_id = target.tenant_id and c.id = target.customer_id;
  if coalesce((customer_data->'billing_preferences'->>'referenceRequired')::boolean,false)
    and nullif(btrim(customer_data->'billing_preferences'->>'reference'),'') is null then
    raise exception 'Vul eerst de verplichte factuurreferentie in bij Klantgegevens' using errcode='23514';
  end if;
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
      due_on = business_day + coalesce((customer_data->>'payment_terms_days')::integer,(select payment_terms_days from public.tenant_settings where tenant_id = target.tenant_id), 14),
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

CREATE OR REPLACE FUNCTION public.customer_command (
  target_tenant uuid,
  request_id    uuid,
  command       text,
  input         jsonb
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$select private.customer_command(target_tenant,request_id,command,input)$function$;

REVOKE ALL ON FUNCTION "public"."customer_command"(uuid, uuid, text, jsonb) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.customer_commercial_followup (
  target_tenant   uuid,
  target_customer uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 if not private.customer_manage(target_tenant) or not exists(select 1 from public.customers where tenant_id=target_tenant and id=target_customer) then raise exception 'Geen toegang tot de klant' using errcode='42501';end if;
 return coalesce((select jsonb_agg(x order by x->>'followup_on',x->>'updated_at',x->>'id') from private.commercial_rows(target_tenant) x
 where x->>'customer_id'=target_customer::text and x->>'archived_at' is null
 and ((x->>'source_kind'='request' and x->>'status' in ('new','review','waiting_info'))
 or (x->>'source_kind'='quote' and x->>'status' in ('draft','awaiting_acceptance','change_requested'))
 or (x->>'source_kind'='quote' and x->>'status'='accepted' and x->>'operation_id' is null))), '[]');
end $function$;

REVOKE ALL ON FUNCTION "public"."customer_commercial_followup"(uuid, uuid) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.customer_extra_agreements (
  target_tenant uuid,
  target_object uuid
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'title',a.title,'version',a.version,'scope',l.scope,'priceCents',l.price_cents,'limitCents',l.limit_cents,'quantity',l.quantity)), '[]')
 from public.customer_agreements a join public.customer_agreement_lines l on l.tenant_id=a.tenant_id and l.agreement_id=a.id
 where a.tenant_id=target_tenant and l.object_id=target_object and a.state='active' and l.extra_work and l.price_basis='visit' and private.commercial_access(target_tenant)
$function$;

REVOKE ALL ON FUNCTION "public"."customer_extra_agreements"(uuid, uuid) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.customer_file_access (
  target_tenant uuid,
  target_id     uuid,
  kind          text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare result jsonb;
begin
 if not private.object_session_active() then raise exception 'Geen toegang' using errcode='42501';end if;
 if kind='document' then
  select jsonb_build_object('bucket','customer-documents','path',d.storage_path,'name',d.file_name,'mime',d.mime_type) into result from public.customer_documents d where d.tenant_id=target_tenant and d.id=target_id and (private.customer_manage(target_tenant) or (d.visibility='customer' and not d.archived and private.customer_portal_bound(target_tenant,d.customer_id)));
 elsif kind='invoice' then
  select jsonb_build_object('bucket','invoices','path',i.pdf_storage_path,'name',i.invoice_number||'.pdf','mime','application/pdf') into result from public.invoices i where i.tenant_id=target_tenant and i.id=target_id and i.pdf_storage_path is not null and ((private.commercial_access(target_tenant) and private.service_enabled(target_tenant,'finance')) or private.customer_invoice_access(target_tenant,i.id));
 end if;
 if result is null then raise exception 'Document niet beschikbaar' using errcode='42501';end if;return result;
end $function$;

REVOKE ALL ON FUNCTION "public"."customer_file_access"(uuid, uuid, text) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.customer_history (
  target_tenant   uuid,
  target_customer uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 if not private.customer_manage(target_tenant) or not exists(select 1 from public.customers where tenant_id=target_tenant and id=target_customer) then raise exception 'Geen toegang tot de klanttijdlijn' using errcode='42501';end if;
 return coalesce((select jsonb_agg(x order by x.at desc) from (
  select a.id,a.created_at as at,coalesce(p.full_name,u.email,'Gebruiker') as actor,a.entity_type as source,a.action
  from public.audit_events a left join auth.users u on u.id=a.actor_user_id left join public.personnel p on p.tenant_id=a.tenant_id and p.user_id=a.actor_user_id
  where a.tenant_id=target_tenant and ((a.entity_type='customers' and a.entity_id=target_customer) or (a.entity_type in ('customer_contacts','customer_documents','customer_notes') and a.after_data->>'customer_id'=target_customer::text) or (a.entity_type='customer_agreements' and private.commercial_access(target_tenant) and a.after_data->>'customer_id'=target_customer::text))
  order by a.created_at desc limit 200
 ) x),'[]');
end $function$;

REVOKE ALL ON FUNCTION "public"."customer_history"(uuid, uuid) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.customer_list (
  target_tenant uuid,
  filters       jsonb DEFAULT '{}'::jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare result jsonb; page_no integer:=greatest(1,least(100000,coalesce((filters->>'page')::int,1))); sort_key text:=coalesce(filters->>'sort','name'); finance boolean:=private.commercial_access(target_tenant) and private.service_enabled(target_tenant,'finance');
begin
 if not private.customer_manage(target_tenant) then raise exception 'Geen toegang tot klanten' using errcode='42501';end if;
 with source as (
  select c.id,c.customer_number,c.name,c.customer_type,c.status,c.version,c.owner_user_id,
  coalesce(nullif(c.visit_address->>'city',''),c.billing_address->>'city','') city,
  (select full_name from public.customer_contacts cc where cc.tenant_id=c.tenant_id and cc.customer_id=c.id and cc.active and (cc.active_from is null or cc.active_from<=(now() at time zone (select timezone from public.tenants where id=target_tenant))::date) and (cc.active_until is null or cc.active_until>=(now() at time zone (select timezone from public.tenants where id=target_tenant))::date) order by cc.is_primary desc,cc.created_at,cc.id limit 1) contact,
  (select count(*) from public.objects o where o.tenant_id=c.tenant_id and o.customer_id=c.id and o.dossier_status='active') objects,
  (select min(w.projected_start_at) from public.work_orders w where w.tenant_id=c.tenant_id and w.customer_id=c.id and w.status not in ('cancelled','completed','approved','invoiced') and w.projected_start_at>=now()) next_visit,
  (select count(*) from public.requests r where r.tenant_id=c.tenant_id and r.customer_id=c.id and r.status in ('new','review','waiting_info')) requests,
  (select count(*) from public.customer_notes n where n.tenant_id=c.tenant_id and n.customer_id=c.id and n.state='open' and n.kind='action') actions,
  case when finance then (select count(*) from public.invoices i where i.tenant_id=c.tenant_id and i.customer_id=c.id and i.status not in ('draft','paid','void','credited') and i.total_cents>i.paid_cents) else null end financial_attention,
  c.services,c.email,c.billing_email,c.phone
  from public.customers c where c.tenant_id=target_tenant
 ), filtered as (
  select * from source s where
  (coalesce(filters->>'q','')='' or concat_ws(' ',s.name,s.customer_number,s.city,s.email,s.billing_email,s.phone,s.contact) ilike '%'||replace(replace(filters->>'q','%','\%'),'_','\_')||'%')
  and (coalesce(filters->>'status','')='' or s.status=filters->>'status')
  and (coalesce(filters->>'type','')='' or s.customer_type=filters->>'type')
  and (coalesce(filters->>'city','')='' or s.city ilike '%'||(filters->>'city')||'%')
  and (coalesce(filters->>'owner','')='' or s.owner_user_id::text=filters->>'owner')
  and (coalesce(filters->>'service','')='' or filters->>'service'=any(s.services))
  and (coalesce(filters->>'attention','')='' or (filters->>'attention'='objects' and s.objects>0) or (filters->>'attention'='requests' and s.requests>0) or (filters->>'attention'='actions' and s.actions>0) or (filters->>'attention'='finance' and s.financial_attention>0)
   or (filters->>'attention'='commercial' and exists(select 1 from public.quotes q where q.tenant_id=target_tenant and q.customer_id=s.id and q.status='awaiting_acceptance' and q.followup_on<=(now() at time zone (select timezone from public.tenants where id=target_tenant))::date)))
 ), paged as (
 select * from filtered order by
 case when sort_key='name' then lower(name) end asc,case when sort_key='name_desc' then lower(name) end desc,
 case when sort_key='number' then customer_number end,case when sort_key='city' then city end,
 case when sort_key='status' then status end,case when sort_key='next_visit' then next_visit end,
 case when sort_key='attention' then actions+requests end desc,id limit 25 offset (page_no-1)*25
 ) select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p)-'services'-'email'-'billing_email'-'phone') from paged p),'[]'), 'total',(select count(*) from filtered),'page',page_no,'finance',finance) into result;
 return result;
end $function$;

REVOKE ALL ON FUNCTION "public"."customer_list"(uuid, jsonb) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.customer_owners (
  target_tenant uuid
)
  RETURNS TABLE (
    id         uuid,
    label      text,
    commercial boolean
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select m.user_id,coalesce(p.full_name,u.email,'Beheerder'),m.roles&&array['tenant_admin','management','finance']::public.app_role[] from public.tenant_memberships m join auth.users u on u.id=m.user_id left join public.personnel p on p.tenant_id=m.tenant_id and p.user_id=m.user_id
 where private.customer_manage(target_tenant) and m.tenant_id=target_tenant and m.status='active' and m.roles&&array['tenant_admin','management','planner','finance']::public.app_role[]
$function$;

REVOKE ALL ON FUNCTION "public"."customer_owners"(uuid) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.customer_portal_documents (
  target_tenant uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 if not private.object_session_active() then raise exception 'Geen toegang' using errcode='42501';end if;
 return jsonb_build_object(
 'documents',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'title',d.title,'version',d.version,'category',d.category,'date',d.document_on,'validUntil',d.valid_until)) from public.customer_documents d where d.tenant_id=target_tenant and d.visibility='customer' and not d.archived and private.customer_portal_bound(target_tenant,d.customer_id)),'[]'),
 'reports',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'body',r.body,'at',r.created_at,'orderId',w.id,'number',w.work_order_number,'object',o.name)) from public.report_entries r join public.work_orders w on w.tenant_id=r.tenant_id and w.id=r.work_order_id join public.objects o on o.tenant_id=w.tenant_id and o.id=w.object_id where r.tenant_id=target_tenant and private.service_enabled(target_tenant,'rapportage') and r.customer_visible and r.deleted_at is null and w.status in ('approved','invoice_ready','invoiced') and exists(select 1 from public.object_customer_bindings b where b.tenant_id=target_tenant and b.object_id=o.id and b.user_id=auth.uid() and b.active)),'[]'),
 'invoices',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'number',i.invoice_number,'date',i.issued_on,'due',i.due_on,'total',i.total_cents,'paid',i.paid_cents,'status',i.status,'pdf',i.pdf_storage_path is not null)) from public.invoices i where i.tenant_id=target_tenant and private.customer_invoice_access(target_tenant,i.id)),'[]'));
end $function$;

REVOKE ALL ON FUNCTION "public"."customer_portal_documents"(uuid) FROM PUBLIC, "anon", "service_role";

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
 where l.tenant_id=target_tenant and l.object_id=target_object and private.object_manage(target_tenant) and a.state='active' and l.price_basis='visit' and not l.extra_work
 and not exists(select 1 from public.customer_agreements n where n.previous_id=a.id and n.state='active');
$function$;

CREATE OR REPLACE FUNCTION public.process_customer_reminders()
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare c record; e uuid; n integer:=0;
begin
 for c in select x.id,x.tenant_id,x.owner_user_id,(clock_timestamp() at time zone t.timezone)::date as today,m.roles
 from public.customers x join public.tenants t on t.id=x.tenant_id join public.tenant_memberships m on m.tenant_id=x.tenant_id and m.user_id=x.owner_user_id
 where t.status='active' and private.service_enabled(t.id,'planning') and x.reminders_enabled and x.status not in ('archived','inactive','draft') and m.status='active' and m.roles&&array['tenant_admin','management','planner','finance']::public.app_role[]
 and (
 exists(select 1 from public.customer_notes v where v.tenant_id=x.tenant_id and v.customer_id=x.id and v.kind='action' and v.state='open' and v.due_on<=(clock_timestamp() at time zone t.timezone)::date)
 or exists(select 1 from public.requests r where r.tenant_id=x.tenant_id and r.customer_id=x.id and r.status in ('new','review','waiting_info') and r.archived_at is null and r.followup_on<=(clock_timestamp() at time zone t.timezone)::date)
 or exists(select 1 from public.quotes q where q.tenant_id=x.tenant_id and q.customer_id=x.id and q.status='awaiting_acceptance' and q.archived_at is null and q.followup_on<=(clock_timestamp() at time zone t.timezone)::date)
 or exists(select 1 from public.customer_documents d where d.tenant_id=x.tenant_id and d.customer_id=x.id and not d.archived and d.valid_until<=(clock_timestamp() at time zone t.timezone)::date and not exists(select 1 from public.customer_documents next_d where next_d.previous_id=d.id))
 or exists(select 1 from public.object_records r join public.objects o on o.id=r.object_id and o.tenant_id=r.tenant_id where r.tenant_id=x.tenant_id and o.customer_id=x.id and r.kind='quality' and r.state in ('open','progress') and r.due_on<=(clock_timestamp() at time zone t.timezone)::date)
 or (m.roles&&array['tenant_admin','management','finance']::public.app_role[] and (
 exists(select 1 from public.customer_agreements a where a.tenant_id=x.tenant_id and a.customer_id=x.id and a.state='active' and not exists(select 1 from public.customer_agreements next_a where next_a.previous_id=a.id and next_a.state='active') and least(a.review_on,a.notice_on,a.renewal_on,a.ends_on)<=(clock_timestamp() at time zone t.timezone)::date)
 or (private.service_enabled(t.id,'finance') and exists(select 1 from public.invoices i where i.tenant_id=x.tenant_id and i.customer_id=x.id and i.status in ('sent','partially_paid','overdue') and i.total_cents>i.paid_cents and i.due_on<(clock_timestamp() at time zone t.timezone)::date))))) loop
 e:=private.enqueue_event(c.tenant_id,'customer.followup','customer',c.id,'{}', 'customer:followup:'||c.id::text||':'||c.today::text);
 insert into public.notifications(tenant_id,user_id,outbox_event_id,channel,title,body,target_path,status,sent_at)
 values(c.tenant_id,c.owner_user_id,e,'in_app','Een klantdossier vraagt aandacht','Bekijk de open acties en deadlines in het afgeschermde dossier.','/app/klanten/'||c.id::text,'sent',clock_timestamp()) on conflict(tenant_id,user_id,outbox_event_id,channel) do nothing;
 if found then n:=n+1;end if;
 end loop;return n;
end $function$;

REVOKE ALL ON FUNCTION "public"."process_customer_reminders"() FROM PUBLIC, "anon", "authenticated";

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
declare r public.object_visit_requests;t public.work_order_tasks;l public.customer_agreement_lines;a public.customer_agreements;rev public.task_revisions;cat public.task_catalog;w public.work_orders;task uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 if not private.object_manage(target_tenant) then raise exception 'Geen toegang' using errcode='42501';end if;
 select * into r from public.object_visit_requests where tenant_id=target_tenant and id=target_request for update;
 if r.state='withdrawn' then raise exception 'Dit verzoek is ingetrokken. Maak zo nodig een nieuw verzoek.' using errcode='23514';end if;
 if decision='contract_extra' then
  if not private.commercial_access(target_tenant) then raise exception 'Commerciële beoordeling vereist' using errcode='42501';end if;
  select * into l from public.customer_agreement_lines where tenant_id=target_tenant and id=(input->>'agreementLineId')::uuid and object_id=r.object_id and extra_work and price_basis='visit';
  select * into a from public.customer_agreements where tenant_id=target_tenant and id=l.agreement_id and state='active' and evidence_document_id is not null;
  select * into w from public.work_orders where tenant_id=target_tenant and id=r.work_order_id;
  if l.id is null or a.id is null or a.customer_id<>w.customer_id or w.status not in ('planned','released','seen','travelling','in_progress') then raise exception 'Kies een geldige, onderbouwde meerwerkafspraak voor dit bezoek' using errcode='23514';end if;
  if r.work_order_task_id is not null then
   select * into t from public.work_order_tasks where tenant_id=target_tenant and id=r.work_order_task_id;
   if t.agreement_line_id=l.id and t.quantity=(input->>'quantity')::numeric and r.review_note=input->>'reason' then return;end if;
   raise exception 'Dit verzoek heeft al een uitvoeringstaak' using errcode='40001';
  end if;
  if r.id is null or r.version<>expected_version then raise exception 'Het verzoek is gewijzigd. Vernieuw het dossier.' using errcode='40001';end if;
  if length(coalesce(input->>'reason',''))<2 or (input->>'quantity')::numeric is null or (input->>'quantity')::numeric<=0 then raise exception 'Vul beoordeling en hoeveelheid in' using errcode='23514';end if;
  select * into rev from public.task_revisions where tenant_id=target_tenant and id=l.task_revision_id;
  select * into cat from public.task_catalog where tenant_id=target_tenant and id=rev.task_id and active;
  if cat.id is null then raise exception 'Deze contracttaak is niet meer beschikbaar' using errcode='23514';end if;
  -- The existing agreement trigger verifies period, successor, aggregate quantity and amount
  -- and freezes the exact consent snapshot. No fabricated quote or fresh customer consent.
  insert into public.work_order_tasks(tenant_id,work_order_id,task_revision_id,task_code,task_name,duration_minutes,quantity,unit,unit_price_cents,vat_basis_points,is_extra_work,extra_work_status,added_by,agreement_line_id)
  values(target_tenant,w.id,rev.id,cat.code,l.scope,rev.duration_minutes,(input->>'quantity')::numeric,rev.unit,l.price_cents,coalesce(l.vat_basis_points,rev.vat_basis_points),true,'awaiting_review',auth.uid(),l.id) returning id into task;
  update public.object_visit_requests set state='accepted',needs_review=false,review_note=input->>'reason',response=coalesce(input->>'response',response),work_order_task_id=task where id=r.id;
  perform private.object_notify(target_tenant,r.object_id,r.work_order_id,'review:'||r.id::text||':'||(r.version+1)::text);
  return;
 end if;
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
   and not exists(select 1 from public.customer_agreement_lines l join public.customer_agreements a on a.tenant_id=l.tenant_id and a.id=l.agreement_id where l.tenant_id=t.tenant_id and l.id=t.agreement_line_id and l.extra_work and a.evidence_document_id is not null and t.commercial_snapshot->>'lineId'=l.id::text and t.commercial_snapshot->>'evidenceDocumentId'=a.evidence_document_id::text)
   and not exists(select 1 from public.work_order_allowed_extra_work a join public.extra_work_rules r on r.id=a.extra_work_rule_id and r.tenant_id=a.tenant_id where a.tenant_id=t.tenant_id and a.work_order_id=t.work_order_id and r.task_revision_id=t.task_revision_id and r.active) then raise exception 'Meerwerk heeft nog geen aantoonbaar akkoord. Leg een passend voorstel vast of stuur het rapport terug.' using errcode='23514';end if;
   update public.work_order_tasks set extra_work_status='approved' where id=t.id;
  end loop;
 end if;
 result:=private.review_work_order_base(target_work_order_id,decision,reason);
 return result;
end $function$;

CREATE OR REPLACE FUNCTION public.save_object_dossier (
  target_tenant uuid,
  input         jsonb
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare o public.objects;v bigint;line text;
begin
 if not private.object_manage(target_tenant) then raise exception 'Geen toegang' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 if not exists(select 1 from public.customers where tenant_id=target_tenant and id=(input->>'customerId')::uuid and (status not in ('inactive','archived','draft') or exists(select 1 from public.objects existing where existing.tenant_id=target_tenant and existing.id=(input->>'id')::uuid and existing.customer_id=customers.id))) then raise exception 'Kies een actieve klant binnen je organisatie' using errcode='23514';end if;
 select * into o from public.objects where tenant_id=target_tenant and id=(input->>'id')::uuid for update;
 v:=(input->>'version')::bigint;
 if v=0 then
  if o.id is not null then return o.id;end if;
  insert into public.objects(id,tenant_id,customer_id,object_number,name,object_type,address,latitude,longitude,location_description,access_instructions,dossier_status)
  values((input->>'id')::uuid,target_tenant,(input->>'customerId')::uuid,'OBJ-'||upper(substr(replace(input->>'id','-',''),1,10)),input->>'name',input->>'type',coalesce(input->'address',jsonb_build_object('street',input->>'street','postal_code',input->>'postalCode','city',input->>'city')),nullif(input->>'latitude','')::numeric,nullif(input->>'longitude','')::numeric,input->>'locationDescription',input->>'instructions',input->>'status') returning * into o;
  for line in select btrim(x) from unnest(string_to_array(coalesce(input->>'structure',''),E'\n'))x where btrim(x)<>'' loop
   insert into public.object_nodes(tenant_id,object_id,name,kind) values(target_tenant,o.id,line,'room');
  end loop;
  if length(coalesce(input->>'contact',''))>0 then insert into public.object_records(tenant_id,object_id,kind,title,body,state) values(target_tenant,o.id,'contact','Contact en bereikbaarheid',input->>'contact','active');end if;
  if length(coalesce(input->>'programme',''))>0 then insert into public.object_records(tenant_id,object_id,kind,title,body,state) values(target_tenant,o.id,'programme','Werkprogramma',input->>'programme','draft');end if;
  if length(coalesce(input->>'safety',''))>0 then insert into public.object_records(tenant_id,object_id,kind,title,body,state,instruction_type,starts_at,details) values(target_tenant,o.id,'instruction','Veilig werken',input->>'safety','active','fixed',clock_timestamp(),'{"acknowledgement":true}');end if;
 else
  if o.id is null or o.version<>v then raise exception 'Het object is intussen gewijzigd. Vernieuw de pagina.' using errcode='40001';end if;
  update public.objects set customer_id=(input->>'customerId')::uuid,name=input->>'name',object_type=input->>'type',address=coalesce(input->'address',jsonb_build_object('street',input->>'street','postal_code',input->>'postalCode','city',input->>'city')),latitude=nullif(input->>'latitude','')::numeric,longitude=nullif(input->>'longitude','')::numeric,location_description=input->>'locationDescription',access_instructions=input->>'instructions',dossier_status=input->>'status' where id=o.id;
 end if;
 return o.id;
end $function$;

ALTER TABLE "private"."customer_command_receipts"
  ADD CONSTRAINT "customer_command_receipts_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id);

ALTER TABLE "private"."customer_command_receipts"
  ADD CONSTRAINT "customer_command_receipts_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE "public"."customer_agreement_lines"
  ADD CONSTRAINT "customer_agreement_lines_duration_minutes_check" CHECK (((duration_minutes >= 0) AND (duration_minutes <= 100000)));

ALTER TABLE "public"."customer_agreement_lines"
  ADD CONSTRAINT "customer_agreement_lines_price_basis_check" CHECK ((price_basis = ANY (ARRAY['visit'::text, 'hour'::text, 'week'::text, 'month'::text, 'once'::text])));

ALTER TABLE "public"."customer_agreement_lines"
  ADD CONSTRAINT "customer_agreement_lines_vat_basis_points_check" CHECK (((vat_basis_points >= 0) AND (vat_basis_points <= 10000)));

ALTER TABLE "public"."customer_agreements"
  ADD CONSTRAINT "customer_agreement_accepted" CHECK (((state = 'draft'::text) OR ((starts_on IS NOT NULL) AND (accepted_by_name IS NOT NULL) AND (accepted_on IS NOT NULL))));

ALTER TABLE "public"."customer_agreements"
  ADD CONSTRAINT "customer_agreement_details" CHECK (((jsonb_typeof(details) = 'object'::text) AND (length((details)::text) <= 30000)));

ALTER TABLE "public"."customer_agreements"
  ADD CONSTRAINT "customer_agreement_owner_fk" FOREIGN KEY (tenant_id, owner_user_id) REFERENCES public.tenant_memberships(tenant_id, user_id);

ALTER TABLE "public"."customer_agreements"
  ADD CONSTRAINT "customer_agreements_agreement_type_check" CHECK ((agreement_type = ANY (ARRAY['service'::text, 'framework'::text, 'addendum'::text])));

ALTER TABLE "public"."customer_agreements"
  ADD CONSTRAINT "customer_agreements_state_check" CHECK ((state = ANY (ARRAY['draft'::text, 'active'::text, 'ended'::text])));

ALTER TABLE "public"."customer_contacts"
  ADD CONSTRAINT "customer_contact_fields"
    CHECK
    ((((length(full_name) >= 2) AND (length(full_name) <= 180)) AND (cardinality(object_ids) <= 100) AND (cardinality(labels) <= 4) AND (labels <@ ARRAY['operational'::text,
    'billing'::text,
    'decision'::text, 'emergency'::text]) AND (length(availability) <= 1000) AND ((active_until IS NULL) OR (active_from IS NULL) OR (active_until >= active_from)))) NOT VALID;

ALTER TABLE "public"."customer_documents"
  ADD CONSTRAINT "customer_documents_category_check" CHECK ((category = ANY (ARRAY['agreement'::text, 'correspondence'::text, 'report'::text, 'photo'::text, 'other'::text])));

ALTER TABLE "public"."customer_documents"
  ADD CONSTRAINT "customer_documents_visibility_check" CHECK ((visibility = ANY (ARRAY['internal'::text, 'customer'::text])));

ALTER TABLE "public"."customer_notes"
  ADD CONSTRAINT "customer_note_object_fk" FOREIGN KEY (tenant_id, object_id) REFERENCES public.objects(tenant_id, id);

ALTER TABLE "public"."customer_notes"
  ADD CONSTRAINT "customer_note_order_fk" FOREIGN KEY (tenant_id, work_order_id) REFERENCES public.work_orders(tenant_id, id);

ALTER TABLE "public"."customer_notes"
  ADD CONSTRAINT "customer_note_owner_fk" FOREIGN KEY (tenant_id, owner_user_id) REFERENCES public.tenant_memberships(tenant_id, user_id);

ALTER TABLE "public"."customer_notes"
  ADD CONSTRAINT "customer_notes_kind_check" CHECK ((kind = ANY (ARRAY['note'::text, 'call'::text, 'message'::text, 'meeting'::text, 'action'::text])));

ALTER TABLE "public"."customer_notes"
  ADD CONSTRAINT "customer_notes_state_check" CHECK ((state = ANY (ARRAY['open'::text, 'completed'::text, 'dismissed'::text])));

ALTER TABLE "public"."customers"
  ADD CONSTRAINT "customer_fields_bounded"
    CHECK
    (((length(name) <= 160) AND (length(legal_name) <= 180) AND (length(trade_name) <= 180) AND (length(email) <= 254) AND (length(website) <= 500) AND (length(company_number) <=
    40) AND (length(vat_number) <= 40) AND (length(preferences) <= 4000) AND (cardinality(services) <= 50) AND (jsonb_typeof(billing_preferences) = 'object'::text) AND
    (length((billing_preferences)::text) <= 4000))) NOT VALID;

ALTER TABLE "public"."customers"
  ADD CONSTRAINT "customer_owner_fk" FOREIGN KEY (tenant_id, owner_user_id) REFERENCES public.tenant_memberships(tenant_id, user_id);

ALTER TABLE "public"."customers"
  ADD CONSTRAINT "customers_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE "public"."customers"
  ADD CONSTRAINT "customers_customer_type_check" CHECK ((customer_type = ANY (ARRAY['business'::text, 'private'::text, 'association'::text, 'government'::text, 'other'::text])));

ALTER TABLE "public"."customers"
  ADD CONSTRAINT "customers_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'lead'::text, 'active'::text, 'paused'::text, 'inactive'::text, 'archived'::text])));

ALTER TABLE "public"."customers"
  ADD CONSTRAINT "customers_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id);

CREATE INDEX customer_command_actor ON private.customer_command_receipts USING btree (actor_id);

CREATE INDEX customer_agreement_owner ON public.customer_agreements USING btree (tenant_id, owner_user_id);

CREATE INDEX customer_created_by ON public.customers USING btree (created_by);

CREATE INDEX customer_list_name ON public.customers USING btree (tenant_id, lower(name), id);

CREATE INDEX customer_list_owner ON public.customers USING btree (tenant_id, owner_user_id);

CREATE INDEX customer_list_status ON public.customers USING btree (tenant_id, status, customer_type);

CREATE INDEX customer_note_object ON public.customer_notes USING btree (tenant_id, object_id);

CREATE INDEX customer_note_order ON public.customer_notes USING btree (tenant_id, work_order_id);

CREATE INDEX customer_note_owner ON public.customer_notes USING btree (tenant_id, owner_user_id);

CREATE INDEX customer_updated_by ON public.customers USING btree (updated_by);

CREATE TRIGGER customer_agreement_audit
  AFTER INSERT OR UPDATE ON public.customer_agreements
  FOR EACH ROW
  EXECUTE FUNCTION private.customer_audit();

CREATE TRIGGER customer_contact_audit
  AFTER INSERT OR UPDATE ON public.customer_contacts
  FOR EACH ROW
  EXECUTE FUNCTION private.customer_audit();

CREATE TRIGGER customer_contact_guard
  BEFORE INSERT OR UPDATE ON public.customer_contacts
  FOR EACH ROW
  EXECUTE FUNCTION private.customer_guard();

CREATE TRIGGER customer_document_audit
  AFTER INSERT OR UPDATE ON public.customer_documents
  FOR EACH ROW
  EXECUTE FUNCTION private.customer_audit();

CREATE TRIGGER customer_note_guard
  BEFORE INSERT OR UPDATE ON public.customer_notes
  FOR EACH ROW
  EXECUTE FUNCTION private.customer_guard();

CREATE TRIGGER customer_dossier_audit
  AFTER INSERT OR UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION private.customer_audit();

CREATE TRIGGER customer_dossier_guard
  BEFORE INSERT OR DELETE OR UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION private.customer_guard();

REVOKE ALL ON FUNCTION "private"."customer_audit"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."customer_audit"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."customer_command"(uuid, uuid, text, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."customer_command"(uuid, uuid, text, jsonb) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."customer_guard"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."customer_guard"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."customer_invoice_access"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."customer_invoice_access"(uuid, uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."customer_manage"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."customer_manage"(uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."customer_portal_bound"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."customer_portal_bound"(uuid, uuid) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."customer_command"(uuid, uuid, text, jsonb) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."customer_commercial_followup"(uuid, uuid) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."customer_extra_agreements"(uuid, uuid) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."customer_file_access"(uuid, uuid, text) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."customer_history"(uuid, uuid) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."customer_list"(uuid, jsonb) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."customer_owners"(uuid) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."customer_portal_documents"(uuid) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."process_customer_reminders"() TO "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."customer_command_receipts" TO "postgres";
