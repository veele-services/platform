BEGIN;

SET local check_function_bodies = off;

DROP TRIGGER "travel_day_address_guard" ON "public"."personnel_travel_days";

CREATE OR REPLACE FUNCTION private.commercial_customer_scope (
  t       uuid,
  c       uuid,
  o       uuid,
  creator uuid DEFAULT NULL::uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select private.object_session_active() and private.service_enabled(t,'planning') and exists(select 1 from public.tenants where id=t and status='active') and exists(select 1 from public.object_customer_bindings b join public.objects obj on obj.tenant_id=b.tenant_id and obj.id=b.object_id where b.tenant_id=t and b.user_id=auth.uid() and b.active and obj.customer_id=c and (b.object_id=o or o is null and creator=auth.uid()));
$function$;

CREATE OR REPLACE FUNCTION private.customer_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare cid uuid; oid uuid;
begin
 if tg_op='DELETE' then
  if tg_table_name='customers' and auth.uid() is not null and not private.has_role(old.tenant_id,array['tenant_admin','management']::public.app_role[])
  then raise exception 'Alleen beheer kan relaties verwijderen' using errcode='42501';end if;
  if tg_table_name='customers' and (exists(select 1 from public.customer_notes where customer_id=old.id) or exists(select 1 from public.customer_documents where customer_id=old.id)) then raise exception 'Deze klant heeft dossierhistorie. Archiveer de relatie.' using errcode='23514';end if;
  return old;
 end if;
 if tg_table_name='customers' then
  -- archive role applies to every customer write
  if auth.uid() is not null and not private.has_role(new.tenant_id,array['tenant_admin','management']::public.app_role[])
    and ((tg_op='INSERT' and new.status='archived') or (tg_op='UPDATE' and new.status is distinct from old.status and (new.status='archived' or old.status='archived')))
  then raise exception 'Alleen beheer kan relaties archiveren of opnieuw activeren' using errcode='42501';end if;
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

CREATE OR REPLACE FUNCTION private.invoice_lifecycle_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare parent public.invoices;
 caller_role text:=coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','');
begin
 -- Owner-only local maintenance has no API caller; never use current_user in
 -- this definer to decide whether an authenticated request is privileged.
 if caller_role='' and auth.uid() is null then return case when tg_op='DELETE' then old else new end;end if;
 if tg_table_name='invoices' then
  if tg_op='DELETE' and (old.status<>'draft' or old.finalized_at is not null)
  then raise exception 'Een definitieve factuur blijft bewaard; gebruik een traceerbare correctie' using errcode='23514';end if;
  if tg_op='UPDATE' and (new.id,new.tenant_id,new.customer_id) is distinct from (old.id,old.tenant_id,old.customer_id)
    and exists(select 1 from public.invoice_lines where tenant_id=old.tenant_id and invoice_id=old.id)
  then raise exception 'Een factuur met bronregels kan niet worden verplaatst' using errcode='23514';end if;
 else
  perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||old.tenant_id::text,0));
  select * into parent from public.invoices where tenant_id=old.tenant_id and id=old.invoice_id for update;
  if parent.id is not null and (parent.status<>'draft' or parent.finalized_at is not null)
  then raise exception 'Bronregels van een definitieve factuur blijven bewaard' using errcode='23514';end if;
  if tg_op='UPDATE' and (new.id,new.tenant_id,new.invoice_id,new.work_order_id,new.work_order_task_id)
    is distinct from (old.id,old.tenant_id,old.invoice_id,old.work_order_id,old.work_order_task_id)
  then raise exception 'Verwijder een ongebruikte conceptregel en voeg de juiste bron opnieuw toe' using errcode='23514';end if;
 end if;
 return case when tg_op='DELETE' then old else new end;
end $function$;

CREATE OR REPLACE FUNCTION private.invoice_source_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare t public.work_order_tasks;w public.work_orders;i public.invoices;p public.object_request_proposals;period public.commercial_billing_periods;used numeric;available numeric;
begin
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||new.tenant_id::text,0));
 if new.work_order_task_id is null then raise exception 'Koppel een goedgekeurde uitvoeringstaak aan iedere factuurregel' using errcode='23514';end if;
 select * into t from public.work_order_tasks where tenant_id=new.tenant_id and id=new.work_order_task_id for update;
 select * into w from public.work_orders where tenant_id=new.tenant_id and id=t.work_order_id;
 select * into i from public.invoices where tenant_id=new.tenant_id and id=new.invoice_id for update;
 if t.id is null or i.id is null or w.customer_id<>i.customer_id or new.work_order_id is distinct from t.work_order_id or w.status<>'invoice_ready' or i.status<>'draft' or t.completed_at is null or (t.is_extra_work and t.extra_work_status is distinct from 'approved') then raise exception 'De bron is nog niet gecontroleerd of hoort niet bij deze klant' using errcode='23514';end if;
 if exists(select 1 from public.object_visit_requests r where r.tenant_id=new.tenant_id and r.work_order_task_id=t.id and r.needs_review) then raise exception 'Beoordeel het gewijzigde klantverzoek eerst' using errcode='23514';end if;
 select p1.* into p from public.object_request_proposals p1 join public.object_visit_requests r on r.id=p1.request_id where r.tenant_id=new.tenant_id and r.work_order_task_id=t.id and p1.accepted_at is not null order by p1.version desc limit 1;
 if p.id is not null and (t.quantity<>p.quantity or t.unit_price_cents<>p.price_cents or t.task_revision_id<>p.task_revision_id) then raise exception 'De uitvoering wijkt af van de geaccepteerde voorstelversie' using errcode='23514';end if;
 if exists(select 1 from public.invoice_lines old_line where old_line.tenant_id=new.tenant_id and old_line.work_order_id=t.work_order_id and old_line.work_order_task_id is null and not exists(select 1 from public.work_order_tasks old_task where old_task.tenant_id=old_line.tenant_id and old_task.work_order_id=old_line.work_order_id and old_task.id::text=old_line.source_snapshot->>'work_order_task_id')) then raise exception 'Deze werkbon heeft historische factuurregels zonder controleerbare bron. Laat de financiële koppeling eerst controleren' using errcode='23514';end if;
 available:=coalesce(t.executed_quantity,t.quantity);
 select coalesce(sum(l.quantity),0) into used from public.invoice_lines l where l.tenant_id=new.tenant_id and (l.work_order_task_id=t.id or (l.work_order_task_id is null and l.work_order_id=t.work_order_id and l.source_snapshot->>'work_order_task_id'=t.id::text)) and l.id<>new.id;
 if new.quantity>available-used or new.unit_price_cents<>t.unit_price_cents or new.vat_basis_points<>t.vat_basis_points or new.unit<>t.unit then raise exception 'Hoeveelheid of prijs wijkt af van de nog factureerbare bron' using errcode='23514';end if;

 if t.commercial_snapshot ? 'quote_id' then
  if t.commercial_snapshot->>'price_basis' in ('week','month') then
   select * into period from public.commercial_billing_periods where tenant_id=new.tenant_id and id=new.commercial_period_id;
   if period.id is null or period.invoice_id<>i.id or period.quote_id is distinct from w.quote_id or new.quantity<>(t.commercial_snapshot#>>'{line,quantity}')::numeric or (w.projected_start_at at time zone(select timezone from public.tenants where id=w.tenant_id))::date<period.starts_on or (w.projected_start_at at time zone(select timezone from public.tenants where id=w.tenant_id))::date>=period.ends_before then raise exception 'Dit is een periodieke prijsafspraak, geen bedrag per bezoek. Gebruik de expliciete periodefacturatie.' using errcode='23514';end if;
  end if;
  new.subtotal_cents:=round((used+new.quantity)*(t.commercial_snapshot#>>'{line,net_cents}')::numeric/(t.commercial_snapshot#>>'{line,quantity}')::numeric)-round(used*(t.commercial_snapshot#>>'{line,net_cents}')::numeric/(t.commercial_snapshot#>>'{line,quantity}')::numeric);
  new.description:=t.task_name||case when(t.commercial_snapshot#>>'{line,discount_basis_points}')::integer>0 then ' (incl. '||((t.commercial_snapshot#>>'{line,discount_basis_points}')::numeric/100)::text||'% korting)' else '' end;
 else new.subtotal_cents:=round(new.quantity*t.unit_price_cents);end if;
 if new.commercial_period_id is not null and period.id is null then raise exception 'Periodebron komt niet overeen' using errcode='23514';end if;
 if period.id is not null then new.description:=new.description||' · periode '||to_char(period.starts_on,'DD-MM-YYYY')||' t/m '||to_char(period.ends_before-1,'DD-MM-YYYY');end if;
 -- Cumulative rate rounding keeps the offered VAT rule across multiple lines.
 select coalesce(sum(l.subtotal_cents),0) into used from public.invoice_lines l where l.invoice_id=new.invoice_id and l.tenant_id=new.tenant_id and l.id<>new.id and l.vat_basis_points=new.vat_basis_points and (l.created_at,l.id)<(new.created_at,new.id);
 new.vat_cents:=round((used+new.subtotal_cents)*t.vat_basis_points/10000.0)-round(used*t.vat_basis_points/10000.0);new.total_cents:=new.subtotal_cents+new.vat_cents;
 new.source_snapshot:=jsonb_build_object('work_order_task_id',t.id,'execution_version',t.execution_version,'executed_quantity',available,'object',w.object_snapshot,'agreement',t.commercial_snapshot,'proposal_id',p.id,'proposal_version',p.version,'accepted_by',p.accepted_by,'accepted_at',p.accepted_at,'commercial_period_id',period.id,'period_start',period.starts_on,'period_end_exclusive',period.ends_before);
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.object_binding_version()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||new.tenant_id::text,0));
 if tg_op='UPDATE' then
  if new.tenant_id<>old.tenant_id or new.object_id<>old.object_id or new.user_id<>old.user_id then raise exception 'Maak een nieuwe binding voor een andere gebruiker of object' using errcode='23514';end if;
  new.version:=old.version+1;
 end if;
 update private.object_access_grants set revoked_at=clock_timestamp() where actor_id=new.user_id and object_id=new.object_id;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.object_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare obj public.objects;ord public.work_orders;p public.object_nodes;lvl integer;parentlvl integer;node uuid;seen uuid[]:='{}';
begin
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||new.tenant_id::text,0));
 if tg_op='UPDATE' then
  if new.id<>old.id or new.tenant_id<>old.tenant_id then raise exception 'De bronrelatie kan niet worden gewijzigd' using errcode='23514';end if;
  if tg_table_name<>'objects' then if new.object_id<>old.object_id then raise exception 'De objectrelatie kan niet worden gewijzigd' using errcode='23514';end if;end if;
  new.version:=old.version+1;
 end if;
 if tg_table_name='objects' then
  -- preserve customer authority on object reassignment
  if tg_op='UPDATE' and new.customer_id is distinct from old.customer_id and (
    exists(select 1 from public.work_orders where tenant_id=old.tenant_id and object_id=old.id)
    or exists(select 1 from public.object_customer_bindings where tenant_id=old.tenant_id and object_id=old.id)
    or exists(select 1 from public.requests where tenant_id=old.tenant_id and object_id=old.id)
    or exists(select 1 from public.quotes where tenant_id=old.tenant_id and object_id=old.id)
    or exists(select 1 from public.object_records where tenant_id=old.tenant_id and object_id=old.id)
    or exists(select 1 from public.object_documents where tenant_id=old.tenant_id and object_id=old.id)
    or exists(select 1 from public.object_nodes where tenant_id=old.tenant_id and object_id=old.id)
    or exists(select 1 from public.object_visit_requests where tenant_id=old.tenant_id and object_id=old.id)
    or exists(select 1 from public.customer_agreement_lines where tenant_id=old.tenant_id and object_id=old.id)
    or exists(select 1 from public.customer_notes where tenant_id=old.tenant_id and object_id=old.id)
    or exists(select 1 from public.dossier_documents where tenant_id=old.tenant_id and object_id=old.id)
    or exists(select 1 from public.tickets where tenant_id=old.tenant_id and object_id=old.id)
    or exists(select 1 from public.customer_contacts where tenant_id=old.tenant_id and old.id=any(object_ids))
    or exists(select 1 from private.object_secret_items where tenant_id=old.tenant_id and object_id=old.id)
  ) then raise exception 'Dit object heeft toegangskoppelingen of dossierhistorie. Maak voor een andere klant een afzonderlijk object.' using errcode='23514';end if;
  if tg_op='UPDATE' and new.active is distinct from old.active and new.dossier_status=old.dossier_status then new.dossier_status:=case when new.active then 'active' else 'archived' end;end if;
  new.active:=new.dossier_status='active';return new;
 end if;
 select * into obj from public.objects where tenant_id=new.tenant_id and id=new.object_id;
 if obj.id is null then raise exception 'Object niet gevonden' using errcode='23514';end if;
 if tg_table_name='object_nodes' then
  lvl:=array_position(array['building','floor','zone','room','component'],new.kind);
  node:=new.parent_id;
  while node is not null loop
   if node=new.id or node=any(seen) then raise exception 'Een locatieonderdeel kan niet onder zichzelf vallen' using errcode='23514';end if;
   seen:=array_append(seen,node);
   select * into p from public.object_nodes where tenant_id=new.tenant_id and object_id=new.object_id and id=node;
   if p.id is null or not p.active then raise exception 'Kies een actief onderdeel van dit object' using errcode='23514';end if;
   parentlvl:=array_position(array['building','floor','zone','room','component'],p.kind);
   if parentlvl>=lvl then raise exception 'De locatievolgorde klopt niet' using errcode='23514';end if;
   lvl:=parentlvl;node:=p.parent_id;
  end loop;
  if tg_op='UPDATE' and new.kind<>old.kind and exists(select 1 from public.object_nodes n where n.parent_id=new.id and array_position(array['building','floor','zone','room','component'],n.kind)<=array_position(array['building','floor','zone','room','component'],new.kind)) then raise exception 'Het type past niet boven de gekoppelde onderdelen' using errcode='23514';end if;
  return new;
 end if;
 if new.work_order_id is not null then
  select * into ord from public.work_orders where tenant_id=new.tenant_id and id=new.work_order_id and object_id=new.object_id;
  if ord.id is null then raise exception 'De afspraak hoort niet bij dit object' using errcode='23514';end if;
 end if;
 if tg_table_name='object_records' then
  if new.contact_id is not null and not exists(select 1 from public.customer_contacts c where c.tenant_id=new.tenant_id and c.customer_id=obj.customer_id and c.id=new.contact_id) then raise exception 'Contactpersoon hoort niet bij deze klant' using errcode='23514';end if;
  if new.owner_user_id is not null and not exists(select 1 from public.tenant_memberships m where m.tenant_id=new.tenant_id and m.user_id=new.owner_user_id and m.status='active') then raise exception 'Kies een actieve verantwoordelijke' using errcode='23514';end if;
  if new.personnel_asset_id is not null and not exists(select 1 from public.personnel_dossier_items a where a.tenant_id=new.tenant_id and a.id=new.personnel_asset_id and a.kind='asset') then raise exception 'Uitgifte niet gevonden' using errcode='23514';end if;
  if new.state in ('partial','not_done','completed') and new.kind='task' and length(coalesce(new.details->>'evidence',''))<2 then raise exception 'Leg het resultaat of de reden vast' using errcode='23514';end if;
 end if;
 if tg_table_name in ('object_records','object_visit_requests') then
  if tg_op='UPDATE' and old.work_order_id is not null and (new.work_order_id is distinct from old.work_order_id) then raise exception 'Een registratie blijft gekoppeld aan het oorspronkelijke bezoek' using errcode='23514';end if;
  if ord.status in ('completed','returned','under_review','approved','invoice_ready','invoiced','cancelled') and tg_op='UPDATE' then raise exception 'Deze uitvoering is afgesloten. Voeg een afzonderlijke opvolging toe.' using errcode='23514';end if;
  new.updated_at:=clock_timestamp();new.updated_by:=coalesce(auth.uid(),new.updated_by);
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.travel_day_address_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare t uuid:=case when tg_op='DELETE' then old.tenant_id else new.tenant_id end;
 p uuid:=case when tg_op='DELETE' then old.personnel_id else new.personnel_id end;
 caller_role text:=coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','');
 sensitive_change boolean;
begin
 if tg_op='UPDATE' and (new.tenant_id,new.personnel_id,new.day) is distinct from (old.tenant_id,old.personnel_id,old.day)
 then raise exception 'De medewerker en werkdag van een reisinstelling zijn onveranderlijk' using errcode='23514';end if;
 sensitive_change:=case tg_op when 'INSERT' then new.departure_address is not null
   when 'DELETE' then old.departure_address is not null else new.departure_address is distinct from old.departure_address end;
 if sensitive_change and caller_role<>'service_role' and (auth.uid() is not null or caller_role in ('authenticated','anon'))
   and private.can_access_personnel(t,p,true) is not true
 then raise exception 'Geen bevoegdheid om het privévertrekadres te wijzigen' using errcode='42501';end if;
 if tg_op='DELETE' then return old;end if;
 if new.departure_address is not null then new.departure_address:=private.normalize_changed_address(new.departure_address,case when tg_op='UPDATE' then coalesce(old.departure_address,'{}') else '{}'::jsonb end);end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.commercial_customer_action (
  target_tenant uuid,
  command_id    uuid,
  command       text,
  input         jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare o public.objects;q public.quotes;r public.requests;receipt private.commercial_commands;result jsonb;payload jsonb;
begin
 if not private.object_session_active() or not private.service_enabled(target_tenant,'planning') then raise exception 'Log opnieuw in' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('commercial:'||target_tenant::text,0));
 select * into receipt from private.commercial_commands where tenant_id=target_tenant and id=command_id;
 if found then if receipt.actor_id<>auth.uid() or receipt.command<>'customer:'||command or receipt.payload<>input then raise exception 'Deze actiereferentie is al gebruikt' using errcode='23514';end if;return receipt.result;end if;
 if command='intake' then
  select * into o from public.objects where tenant_id=target_tenant and id=(input->>'object_id')::uuid;
  if o.id is null or not private.commercial_customer_scope(target_tenant,o.customer_id,o.id) then raise exception 'Geen toegang tot dit object' using errcode='42501';end if;
  result:=jsonb_build_object('id',private.commercial_intake(target_tenant,command_id,input,'portal',o.customer_id,o.id,auth.uid()));
 elsif command='decide' then
  select * into q from public.quotes where tenant_id=target_tenant and id=(input->>'id')::uuid for update;
  if q.id is null or not private.commercial_customer_scope(target_tenant,q.customer_id,q.object_id) then raise exception 'Geen toegang tot deze offerte' using errcode='42501';end if;
  if q.revision is distinct from (input->>'revision')::integer then raise exception 'Controleer de juiste offerteversie' using errcode='23514';end if;
  if input->>'decision'<>'accepted' and length(trim(coalesce(input->>'evidence','')))<3 then raise exception 'Geef een toelichting op je besluit' using errcode='23514';end if;
  payload:=input||jsonb_build_object('received_at',clock_timestamp(),'evidence',coalesce(nullif(input->>'evidence',''),'Bevestigd in het eigen klantportaal'));
  result:=private.commercial_decide(q.id,target_tenant,payload,auth.uid(),'portal');
 elsif command='reply' then
  select * into r from public.requests where tenant_id=target_tenant and id=(input->>'id')::uuid for update;
  if r.id is null or not private.commercial_customer_scope(target_tenant,r.customer_id,r.object_id,r.created_by) then raise exception 'Geen toegang tot deze aanvraag' using errcode='42501';end if;
  if length(trim(coalesce(input->>'body',''))) not between 3 and 5000 or r.archived_at is not null or r.status in ('rejected','withdrawn') then raise exception 'Vul je toelichting in voor een actieve aanvraag' using errcode='23514';end if;
  insert into public.commercial_events(tenant_id,request_id,actor_id,kind,body,visibility) values(target_tenant,r.id,auth.uid(),'request.customer_reply',input->>'body','customer');
  if r.status='waiting_info' then update public.requests set status='review',next_action='Reactie klant beoordelen',version=version+1 where id=r.id;end if;result:=jsonb_build_object('id',r.id);
 else raise exception 'Onbekende klantactie' using errcode='23514';end if;
 insert into private.commercial_commands(tenant_id,id,actor_id,command,payload,result) values(target_tenant,command_id,auth.uid(),'customer:'||command,input,result);
 return result;
end $function$;

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
 if not private.commercial_access(t) or not private.service_enabled(t,'finance') then raise exception 'Financiële toegang vereist' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||t::text,0));
 perform 1 from public.invoices where id=target_invoice_id for update;
 return private.finalize_invoice_snapshot(target_invoice_id);
end $function$;

CREATE OR REPLACE FUNCTION public.register_manual_payment (
  target_tenant_id uuid,
  payment_date     timestamp with time zone,
  reference        text,
  allocations      jsonb,
  idempotency_key  text
)
  RETURNS public.payment_attempts
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  allocation jsonb;
  invoice_id uuid;
  allocation_amount bigint;
  total_amount bigint := 0;
  attempt public.payment_attempts;
begin
  if idempotency_key like 'mollie-%' then raise exception 'Provider retry keys are reserved' using errcode='23514'; end if;
  if not private.service_enabled(target_tenant_id,'finance') or not private.has_role(target_tenant_id, array['tenant_admin','management','finance']::public.app_role[]) then
    raise exception 'Finance role required' using errcode = '42501';
  end if;
  if jsonb_typeof(allocations) <> 'array' or jsonb_array_length(allocations) = 0 then
    raise exception 'At least one payment allocation is required' using errcode = '23514';
  end if;
  if exists (select 1 from public.payment_attempts p where p.tenant_id = target_tenant_id and p.idempotency_key = register_manual_payment.idempotency_key) then
    select * into attempt from public.payment_attempts p where p.tenant_id = target_tenant_id and p.idempotency_key = register_manual_payment.idempotency_key;
    if attempt.provider <> 'manual' then raise exception 'Invalid manual payment identity' using errcode='23514'; end if;
    return attempt;
  end if;

  -- Deterministic ordering prevents deadlocks when two multi-invoice payments race.
  perform 1
  from public.invoices i
  join (
    select (value->>'invoice_id')::uuid as id
    from jsonb_array_elements(allocations)
  ) requested on requested.id = i.id
  where i.tenant_id = target_tenant_id
  order by i.id
  for update of i;

  for allocation in select value from jsonb_array_elements(allocations)
  loop
    invoice_id := (allocation->>'invoice_id')::uuid;
    allocation_amount := (allocation->>'amount_cents')::bigint;
    if allocation_amount <= 0 then raise exception 'Allocation amount must be positive' using errcode = '23514'; end if;
    if not exists (
      select 1 from public.invoices i
      where i.tenant_id = target_tenant_id and i.id = invoice_id
        and i.status not in ('draft','credited','void')
        and i.total_cents - i.paid_cents >= allocation_amount
    ) then
      raise exception 'Invalid or excessive allocation for invoice %', invoice_id using errcode = '23514';
    end if;
    total_amount := total_amount + allocation_amount;
  end loop;

  insert into public.payment_attempts (
    tenant_id, provider, provider_mode, status, amount_cents, idempotency_key,
    provider_payload, paid_at, last_checked_at, created_by
  ) values (
    target_tenant_id, 'manual', 'manual', 'paid', total_amount, idempotency_key,
    jsonb_build_object('reference', reference, 'payment_date', payment_date),
    payment_date, clock_timestamp(), auth.uid()
  ) returning * into attempt;

  for allocation in select value from jsonb_array_elements(allocations)
  loop
    invoice_id := (allocation->>'invoice_id')::uuid;
    allocation_amount := (allocation->>'amount_cents')::bigint;
    insert into public.payment_allocations (tenant_id, payment_attempt_id, invoice_id, amount_cents)
    values (target_tenant_id, attempt.id, invoice_id, allocation_amount);
    update public.invoices
    set paid_cents = paid_cents + allocation_amount,
        status = case when paid_cents + allocation_amount = total_cents then 'paid'::public.invoice_status else 'partially_paid'::public.invoice_status end
    where tenant_id = target_tenant_id and id = invoice_id;
  end loop;

  insert into public.audit_events (tenant_id, actor_user_id, action, entity_type, entity_id, after_data, request_id)
  values (target_tenant_id, auth.uid(), 'payment.manual_registered', 'payment_attempt', attempt.id, jsonb_build_object('amount_cents', total_amount, 'reference', reference), idempotency_key);
  return attempt;
end;
$function$;

CREATE TRIGGER invoice_line_lifecycle_guard
  BEFORE DELETE OR UPDATE ON public.invoice_lines
  FOR EACH ROW
  EXECUTE FUNCTION private.invoice_lifecycle_guard();

CREATE TRIGGER invoice_lifecycle_guard
  BEFORE DELETE OR UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION private.invoice_lifecycle_guard();

CREATE TRIGGER travel_day_address_guard
  BEFORE INSERT OR DELETE OR UPDATE ON public.personnel_travel_days
  FOR EACH ROW
  EXECUTE FUNCTION private.travel_day_address_guard();

REVOKE ALL ON FUNCTION "private"."invoice_lifecycle_guard"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."invoice_lifecycle_guard"() TO "postgres";

NOTIFY pgrst, 'reload schema';
COMMIT;
