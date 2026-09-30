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

CREATE OR REPLACE FUNCTION private.commercial_attachment_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare q public.quotes;
begin
 if tg_op<>'INSERT' then raise exception 'Bijlagen blijven versiegebonden en onveranderlijk' using errcode='23514';end if;
 if new.quote_id is not null then
  select * into q from public.quotes where id=new.quote_id and tenant_id=new.tenant_id for update;
  if q.id is null or q.status<>'draft' or q.published_at is not null or q.archived_at is not null then raise exception 'Bijlagen kunnen alleen aan een offerteconcept worden toegevoegd' using errcode='23514';end if;
 end if;
 return new;
end $function$;

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
 select private.object_session_active() and exists(select 1 from public.tenants where id=t and status='active') and exists(select 1 from public.object_customer_bindings b join public.objects obj on obj.tenant_id=b.tenant_id and obj.id=b.object_id where b.tenant_id=t and b.user_id=auth.uid() and b.active and obj.customer_id=c and (b.object_id=o or o is null and creator=auth.uid()));
$function$;

CREATE OR REPLACE FUNCTION private.commercial_decide (
  q_id    uuid,
  t       uuid,
  input   jsonb,
  actor   uuid,
  channel text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare q public.quotes;decision text:=input->>'decision';who text:=trim(coalesce(input->>'name',''));evidence text:=trim(coalesce(input->>'evidence',''));received timestamptz;
begin
 select * into q from public.quotes where tenant_id=t and id=q_id for update;
 if q.id is null then raise exception 'Offerte niet beschikbaar' using errcode='42501';end if;
 if q.status='accepted' and decision='accepted' then return jsonb_build_object('id',q.id,'status',q.status);end if;
 if q.status not in ('awaiting_acceptance','sent') or q.expires_at is null or q.expires_at<=clock_timestamp() or q.superseded_at is not null or q.archived_at is not null or q.published_at is null then raise exception 'Dit voorstel is verlopen, vervangen of al behandeld. Vraag een actuele offerte aan.' using errcode='23514';end if;
 if decision not in ('accepted','rejected','change_requested') or length(who) not between 2 and 180 then raise exception 'Vul de naam van de beslisser in' using errcode='23514';end if;
 if decision='accepted' and coalesce((input->>'confirmed')::boolean,false)=false then raise exception 'Bevestig de werkzaamheden, bedragen en voorwaarden van deze versie' using errcode='23514';end if;
 if channel<>'secure_link' then
  if channel not in ('phone','email','in_person','portal') or length(evidence)<3 or nullif(input->>'received_at','') is null then raise exception 'Vul kanaal, akkoorddatum en bewijs of toelichting in' using errcode='23514';end if;
  received:=(input->>'received_at')::timestamptz;
  if received>clock_timestamp()+interval '5 minutes' or received<q.published_at then raise exception 'De akkoorddatum moet tussen aanbieding en nu liggen' using errcode='23514';end if;
 else received:=clock_timestamp();end if;
 if decision<>'accepted' and length(evidence)<3 then raise exception 'Geef een toelichting op je besluit' using errcode='23514';end if;
 update public.quotes set status=decision::public.quote_status,accepted_at=case when decision='accepted' then clock_timestamp() end,accepted_by_name=case when decision='accepted' then who end,acceptance_channel=case when decision='accepted' then channel end,acceptance_evidence=case when decision='accepted' then jsonb_build_object('name',who,'channel',channel,'received_at',received,'recorded_at',clock_timestamp(),'recorded_by',actor,'revision',revision,'evidence',evidence,'explicit_confirmation',true)::text end,
 next_action=case decision when 'accepted' then 'Omzetten naar opdracht' when 'change_requested' then 'Wijzigingsverzoek beoordelen' else '' end,followup_on=case when decision='change_requested' then (clock_timestamp() at time zone(select timezone from public.tenants where id=t))::date end,version=version+1 where id=q.id;
 update public.external_action_tokens set consumed_at=clock_timestamp(),decision=jsonb_build_object('decision',input->>'decision','quote_id',q.id,'revision',q.revision) where tenant_id=t and purpose='quote_acceptance' and subject_id=q.id and consumed_at is null;
 insert into public.commercial_events(tenant_id,request_id,quote_id,actor_id,kind,body,visibility,details) values(t,q.request_id,q.id,actor,'quote.'||decision,evidence,'customer',jsonb_build_object('name',who,'channel',channel,'received_at',received,'revision',q.revision));
 return jsonb_build_object('id',q.id,'status',decision);
end $function$;

CREATE OR REPLACE FUNCTION private.commercial_event_mail()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare q public.quotes;r public.requests;c public.customers;ct public.customer_contacts;t public.tenants;b public.tenant_branding;recipients jsonb:='[]';recipient text;owner_email text;subject text;body text;customer_name text;
begin
 if new.kind not in ('request.received','request.information_requested','request.customer_reply','request.rejected','quote.accepted','quote.rejected','quote.change_requested','booking.confirmed') then return new;end if;
 select * into q from public.quotes where tenant_id=new.tenant_id and id=new.quote_id;
 select * into r from public.requests where tenant_id=new.tenant_id and id=coalesce(new.request_id,q.request_id);
 select * into c from public.customers where tenant_id=new.tenant_id and id=coalesce(q.customer_id,r.customer_id);
 select * into ct from public.customer_contacts where tenant_id=new.tenant_id and id=coalesce(q.contact_id,r.contact_id);
 select * into t from public.tenants where id=new.tenant_id;
 select * into b from public.tenant_branding where tenant_id=new.tenant_id;
 recipient:=coalesce(q.snapshot#>>'{contact,email}',ct.email,c.billing_email);customer_name:=coalesce(q.snapshot#>>'{contact,name}',ct.full_name,c.name);
 select email into owner_email from auth.users where id=coalesce(q.owner_id,r.owner_id);
 subject:=case new.kind when 'request.received' then 'Aanvraag ontvangen' when 'request.information_requested' then 'Aanvullende informatie gevraagd' when 'request.customer_reply' then 'Klantreactie ontvangen' when 'request.rejected' then 'Aanvraag afgewezen' when 'quote.accepted' then 'Offerteakkoord geregistreerd' when 'quote.rejected' then 'Offerte afgewezen' when 'quote.change_requested' then 'Wijziging van offerte gevraagd' when 'booking.confirmed' then 'Afspraak bevestigd' end;
 body:=subject||': '||coalesce(q.quote_number,r.request_number,'')||case when q.id is not null then ' · versie '||q.revision else '' end||E'\n'||coalesce(q.subject,r.subject,'');
 if new.kind='request.received' then body:=body||E'\n\nDe aanvraag wordt beoordeeld. Dit is nog geen prijsafspraak of bevestiging van uitvoering.';
 elsif new.kind='request.information_requested' then body:=body||E'\n\n'||new.body||E'\n\nGeef je antwoord door aan je contactpersoon of via het klantportaal.';
 elsif new.kind='booking.confirmed' then body:=body||E'\n\n'||case when new.details->>'kind'='inspection' then 'Opname / inventarisatie' else 'Uitvoering goedgekeurd werk' end||': '||to_char((new.details->>'starts_at')::timestamptz at time zone t.timezone,'DD-MM-YYYY HH24:MI')||' – '||to_char((new.details->>'ends_at')::timestamptz at time zone t.timezone,'HH24:MI')||E'\nDe boeking verandert geen offerte of prijsafspraak.';
 else body:=body||E'\n\nBekijk de registratie voor de volledige toelichting. Akkoord is geen bewijs van planning, uitvoering of betaling.';end if;
 if new.kind<>'request.customer_reply' and recipient is not null then recipients:=recipients||jsonb_build_array(jsonb_build_object('email',recipient,'audience','customer','path','/klant/aanvragen'));end if;
 if new.kind<>'request.information_requested' and owner_email is not null and owner_email is distinct from recipient then recipients:=recipients||jsonb_build_array(jsonb_build_object('email',owner_email,'audience','owner','path','/app/aanvragen?record='||coalesce(q.id,r.id)::text||'&source='||case when q.id is null then 'request' else 'quote' end));end if;
 new.mail_snapshot:=jsonb_build_object('subject',subject||' · '||t.name,'body',body,'recipients',recipients,'brand',jsonb_build_object('company',t.name,'slug',t.slug,'primary',b.primary_color,'accent',b.accent_color,'logo_path',b.logo_path));
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.commercial_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 if tg_op='UPDATE' and (new.tenant_id<>old.tenant_id or new.id<>old.id) then raise exception 'De bronregistratie blijft bij dezelfde tenant' using errcode='23514';end if;
 if new.object_id is not null and not exists(select 1 from public.objects where tenant_id=new.tenant_id and id=new.object_id and customer_id=new.customer_id) then raise exception 'Object en klant komen niet overeen' using errcode='23514';end if;
 if new.contact_id is not null and not exists(select 1 from public.customer_contacts where tenant_id=new.tenant_id and id=new.contact_id and customer_id=new.customer_id) then raise exception 'Contactpersoon en klant komen niet overeen' using errcode='23514';end if;
 if tg_table_name='quotes' then
  if new.request_id is not null and not exists(select 1 from public.requests where tenant_id=new.tenant_id and id=new.request_id and customer_id=new.customer_id and object_id is not distinct from new.object_id) then raise exception 'De aanvraag en offerte moeten dezelfde klant en locatie hebben' using errcode='23514';end if;
  if tg_op='UPDATE' and (old.published_at is not null or old.status<>'draft') and (new.quote_number<>old.quote_number or new.revision<>old.revision or new.series_id<>old.series_id or new.request_id is distinct from old.request_id or new.contact_id is distinct from old.contact_id or new.work_kind<>old.work_kind or new.vat_cents<>old.vat_cents or new.published_at is distinct from old.published_at or new.snapshot is distinct from old.snapshot or new.lines is distinct from old.lines or new.terms is distinct from old.terms or new.subject is distinct from old.subject or new.customer_id is distinct from old.customer_id or new.object_id is distinct from old.object_id or new.subtotal_cents<>old.subtotal_cents or new.total_cents<>old.total_cents or new.price_basis<>old.price_basis or new.expires_at is distinct from old.expires_at) then raise exception 'Een aangeboden versie is onveranderlijk. Maak een nieuwe conceptversie.' using errcode='23514';end if;
  if tg_op='UPDATE' and ((old.pdf_path is not null and new.pdf_path is distinct from old.pdf_path) or (old.logo_path is not null and new.logo_path is distinct from old.logo_path)) then raise exception 'Het aangeboden document blijft onveranderlijk' using errcode='23514';end if;
  if tg_op='UPDATE' and old.accepted_at is not null and (new.accepted_at is distinct from old.accepted_at or new.accepted_by_name is distinct from old.accepted_by_name or new.acceptance_evidence is distinct from old.acceptance_evidence or new.status<>old.status) then raise exception 'Vastgelegd akkoord blijft behouden' using errcode='23514';end if;
 else
  if tg_op='UPDATE' and (new.description<>old.description or new.source<>old.source or new.created_at<>old.created_at) then raise exception 'De oorspronkelijke klantvraag, bron en ontvangstdatum blijven behouden' using errcode='23514';end if;
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.commercial_intake (
  t          uuid,
  request_id uuid,
  input      jsonb,
  source     text,
  customer   uuid,
  object     uuid,
  actor      uuid
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare c uuid:=customer;ct uuid;own uuid;existing public.requests;
begin
 perform pg_advisory_xact_lock(hashtextextended('commercial-intake:'||t::text||request_id::text,0));
 select * into existing from public.requests where id=request_id;
 if found then
  if existing.tenant_id<>t or existing.source<>source or existing.created_by is distinct from actor then raise exception 'Gebruik een nieuwe aanvraagreferentie' using errcode='23514';end if;
  return request_id;
 end if;
 if not exists(select 1 from public.tenants where id=t and status='active') then raise exception 'Omgeving niet beschikbaar' using errcode='42501';end if;
 if length(trim(coalesce(input->>'subject',''))) not between 2 and 180 or length(trim(coalesce(input->>'description',''))) not between 3 and 10000 or length(coalesce(input->>'discipline','')) not between 2 and 100 or coalesce(input->>'work_kind','once') not in ('once','recurring','extra') then raise exception 'Vul onderwerp, werkzaamheden en dienst in' using errcode='23514';end if;
 select user_id into own from public.tenant_memberships where tenant_id=t and status='active' and roles&&array['tenant_admin','management','planner']::public.app_role[] order by ('tenant_admin'=any(roles)) desc,user_id limit 1;
 if own is null then raise exception 'Online aanvragen zijn tijdelijk niet beschikbaar. Neem contact op met het bedrijf.' using errcode='23514';end if;
 if c is null then
  if length(trim(coalesce(input->>'name',''))) not between 2 and 180 or coalesce(input->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(input->>'email')>254 or length(coalesce(input->>'phone',''))>40 then raise exception 'Vul je naam en een geldig e-mailadres in' using errcode='23514';end if;
  c:=gen_random_uuid();
  -- Public intake never discloses, links to or merges a guessed existing identity.
  insert into public.customers(id,tenant_id,customer_number,name,billing_email,phone,status) values(c,t,'KL-'||upper(substr(c::text,1,8)),trim(input->>'name'),trim(input->>'email'),nullif(input->>'phone',''),'lead');
  insert into public.customer_contacts(tenant_id,customer_id,full_name,email,phone,is_primary) values(t,c,trim(input->>'name'),trim(input->>'email'),nullif(input->>'phone',''),true) returning id into ct;
 else ct:=nullif(input->>'contact_id','')::uuid;end if;
 perform private.commercial_relations(t,c,object,ct,own);
 insert into public.requests(id,tenant_id,request_number,customer_id,object_id,contact_id,subject,description,discipline,source,work_kind,owner_id,next_action,followup_on,preferences,created_by)
 values(request_id,t,'AAN-'||to_char(clock_timestamp(),'YYYY')||'-'||upper(substr(request_id::text,1,8)),c,object,ct,input->>'subject',input->>'description',input->>'discipline',source,coalesce(input->>'work_kind','once'),own,case when object is null then 'Aanvraag beoordelen en object vaststellen' else 'Aanvraag beoordelen' end,(clock_timestamp() at time zone(select timezone from public.tenants where id=t))::date,jsonb_build_object('location',left(input->>'location',1000),'date',nullif(input->>'date','')::date,'frequency',left(input->>'frequency',300)),actor);
 insert into public.commercial_events(tenant_id,request_id,actor_id,kind,visibility) values(t,request_id,actor,'request.received','customer');
 return request_id;
end $function$;

CREATE OR REPLACE FUNCTION private.commercial_member (
  t uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select private.object_session_active() and private.has_role(t,array['tenant_admin','management','planner','finance']::public.app_role[])
 and exists(select 1 from public.tenants where id=t and status='active')
 and exists(select 1 from public.tenant_settings where tenant_id=t and 'planning'=any(enabled_services));
$function$;

CREATE OR REPLACE FUNCTION private.commercial_prices (
  t     uuid,
  input jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare l jsonb;out_lines jsonb:='[]';qty numeric;rate bigint;discount integer;vat integer;net bigint;gross bigint;sub bigint;tax bigint;taxes jsonb;tr public.task_revisions;tc public.task_catalog;dur integer;
begin
 if jsonb_typeof(input)<>'array' or jsonb_array_length(input)>100 then raise exception 'Gebruik maximaal 100 offerteregels' using errcode='23514';end if;
 for l in select value from jsonb_array_elements(input) loop
  qty:=(l->>'quantity')::numeric;rate:=(l->>'price_cents')::bigint;discount:=coalesce((l->>'discount_basis_points')::integer,0);vat:=(l->>'vat_basis_points')::integer;dur:=nullif(l->>'duration_minutes','')::integer;
  if qty is null or qty<=0 or qty>1000000 or qty<>round(qty,3) or rate is null or rate<0 or rate>100000000 or discount not between 0 and 10000 or vat is null or vat not between 0 and 10000 or length(trim(coalesce(l->>'description','')))<2 or length(l->>'description')>3000 or length(coalesce(l->>'unit','')) not between 1 and 60 or (dur is not null and dur not between 1 and 43200) then raise exception 'Controleer omschrijving, aantal, tarief, korting en btw van elke regel' using errcode='23514';end if;
  tr:=null;tc:=null;
  if nullif(l->>'task_revision_id','') is not null then
   select * into tr from public.task_revisions where id=(l->>'task_revision_id')::uuid and tenant_id=t;
   if not found then raise exception 'Taakversie niet beschikbaar' using errcode='23514';end if;
   select * into tc from public.task_catalog where id=tr.task_id and tenant_id=t;
  end if;
  gross:=round(qty*rate);net:=round(gross*(10000-discount)::numeric/10000);
  out_lines:=out_lines||jsonb_build_array(jsonb_build_object('id',coalesce(nullif(l->>'id','')::uuid,gen_random_uuid()),'task_revision_id',tr.id,'task_code',coalesce(tc.code,'HANDMATIG'),'description',l->>'description','quantity',qty,'unit',l->>'unit','price_cents',rate,'discount_basis_points',discount,'discount_cents',gross-net,'net_cents',net,'vat_basis_points',vat,'duration_minutes',dur));
 end loop;
 if (select count(*)<>count(distinct x->>'id') from jsonb_array_elements(out_lines)x) then raise exception 'Iedere offerteregel moet een eigen referentie hebben' using errcode='23514';end if;
 select coalesce(sum((v->>'net_cents')::bigint),0) into sub from jsonb_array_elements(out_lines) v;
 select coalesce(jsonb_agg(jsonb_build_object('basis_points',v,'base_cents',n,'tax_cents',round(n*v/10000))), '[]'),coalesce(sum(round(n*v/10000)),0) into taxes,tax
 from(select (value->>'vat_basis_points')::numeric v,sum((value->>'net_cents')::numeric) n from jsonb_array_elements(out_lines) group by 1 order by 1) g;
 return jsonb_build_object('lines',out_lines,'subtotal_cents',sub,'vat_cents',tax,'total_cents',sub+tax,'taxes',taxes);
end $function$;

CREATE OR REPLACE FUNCTION private.commercial_relations (
  t       uuid,
  c       uuid,
  o       uuid,
  contact uuid,
  owner   uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 if c is null or not exists(select 1 from public.customers where tenant_id=t and id=c) then raise exception 'Kies een klant binnen deze omgeving' using errcode='23514';end if;
 if o is not null and not exists(select 1 from public.objects where tenant_id=t and id=o and customer_id=c) then raise exception 'Dit object hoort niet bij de gekozen klant' using errcode='23514';end if;
 if contact is not null and not exists(select 1 from public.customer_contacts where tenant_id=t and id=contact and customer_id=c) then raise exception 'Deze contactpersoon hoort niet bij de klant' using errcode='23514';end if;
 if owner is null or not exists(select 1 from public.tenant_memberships where tenant_id=t and user_id=owner and status='active' and roles&&array['tenant_admin','management','planner','finance']::public.app_role[]) then raise exception 'Kies een actieve behandelaar' using errcode='23514';end if;
end $function$;

CREATE OR REPLACE FUNCTION private.commercial_rows (
  t uuid
)
  RETURNS SETOF jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select jsonb_build_object('id',r.id,'source_kind','request','tab','requests','number',r.request_number,'subject',coalesce(nullif(r.subject,''),left(r.description,120)),'customer_id',r.customer_id,'customer',c.name,'prospect',c.status='lead','object_id',r.object_id,'object',o.name,'address',o.address,'work_kind',r.work_kind,'source',r.source,
 'status',case r.status when 'closed' then 'processed' when 'quote_draft' then 'review' when 'awaiting_acceptance' then 'processed' when 'accepted' then 'processed' when 'planned' then 'processed' else r.status end,'priority',r.priority,'owner_id',r.owner_id,'owner',coalesce(p.full_name,u.email),'next_action',r.next_action,'followup_on',r.followup_on,'created_at',r.created_at,'updated_at',r.updated_at,'archived_at',r.archived_at,'version',r.version,
 'operation_id',(select w.id from public.work_orders w where w.tenant_id=t and w.request_id=r.id and w.status<>'cancelled' order by w.created_at desc limit 1))
 from public.requests r left join public.customers c on c.id=r.customer_id and c.tenant_id=t left join public.objects o on o.id=r.object_id and o.tenant_id=t left join auth.users u on u.id=r.owner_id left join public.personnel p on p.tenant_id=t and p.user_id=r.owner_id where r.tenant_id=t
 union all
 select jsonb_build_object('id',q.id,'source_kind','quote','tab','quotes','number',q.quote_number,'subject',coalesce(nullif(q.subject,''),q.snapshot->>'description','Prijsopgave'),'customer_id',q.customer_id,'customer',c.name,'prospect',c.status='lead','object_id',q.object_id,'object',o.name,'address',o.address,'work_kind',q.work_kind,'source',coalesce(r.source,'backoffice'),
 'status',case when q.status in ('awaiting_acceptance','sent') and q.expires_at<=clock_timestamp() then 'expired' when q.status='sent' then 'awaiting_acceptance' else q.status::text end,'priority',coalesce(r.priority,'normal'),'owner_id',q.owner_id,'owner',coalesce(p.full_name,u.email),'next_action',case when q.status in ('awaiting_acceptance','sent') and q.expires_at<=clock_timestamp() then 'Geldigheid bespreken' else q.next_action end,'followup_on',q.followup_on,'created_at',q.created_at,'updated_at',q.updated_at,'archived_at',q.archived_at,'version',q.version,
 'revision',q.revision,'series_id',q.series_id,'expires_at',q.expires_at,'subtotal_cents',q.subtotal_cents,'price_basis',q.price_basis,'operation_id',q.operation_id,'planned',exists(select 1 from public.work_orders w where w.id=q.operation_id and w.projected_start_at is not null),'previous_accepted',exists(select 1 from public.quotes a where a.tenant_id=t and a.series_id=q.series_id and a.id<>q.id and a.accepted_at is not null))
 from public.quotes q join public.customers c on c.id=q.customer_id and c.tenant_id=t left join public.objects o on o.id=q.object_id and o.tenant_id=t left join public.requests r on r.id=q.request_id and r.tenant_id=t left join auth.users u on u.id=q.owner_id left join public.personnel p on p.tenant_id=t and p.user_id=q.owner_id
 where q.tenant_id=t and not exists(select 1 from public.quotes n where n.tenant_id=t and n.series_id=q.series_id and n.revision>q.revision)
 union all
 -- Existing visit requests/proposals stay in their source tables. This is a
 -- projection, not another request with an independently mutable status.
 select jsonb_build_object('id',r.id,'source_kind','visit','tab','requests','number','BEZ-'||upper(substr(r.id::text,1,8)),'subject',r.title,'customer_id',o.customer_id,'customer',c.name,'prospect',c.status='lead','object_id',o.id,'object',o.name,'address',o.address,'work_kind',case when r.kind='extra' then 'extra' else 'once' end,'source','portal',
 'status',case when r.state in ('rejected','withdrawn') then r.state when r.state='new' then 'new' when r.needs_review or r.state in ('review','proposal') then 'review' else 'processed' end,'priority',r.priority,'owner_id',r.owner_user_id,'owner',u.email,'next_action',case when r.needs_review then 'Bezoekverzoek beoordelen' when r.state='proposal' then 'Meerwerkakkoord opvolgen' else 'Uitvoering volgen' end,'followup_on',r.due_on,'created_at',r.created_at,'updated_at',r.updated_at,'archived_at',null,'version',r.version,'operation_id',r.work_order_id)
 from public.object_visit_requests r join public.objects o on o.id=r.object_id and o.tenant_id=t join public.customers c on c.id=o.customer_id and c.tenant_id=t left join auth.users u on u.id=r.owner_user_id where r.tenant_id=t
 union all
 select jsonb_build_object('id',p.id,'source_kind','proposal','tab','quotes','number','MW-'||upper(substr(p.id::text,1,8)),'subject',p.title,'customer_id',o.customer_id,'customer',c.name,'prospect',c.status='lead','object_id',o.id,'object',o.name,'address',o.address,'work_kind','extra','source','portal',
 'status',case when p.accepted_at is not null then 'accepted' when r.state in ('withdrawn','rejected') then 'rejected' else 'awaiting_acceptance' end,'priority',r.priority,'owner_id',r.owner_user_id,'owner',u.email,'next_action',case when p.accepted_at is not null then 'Uitvoering volgen' else 'Meerwerkakkoord opvolgen' end,'followup_on',r.due_on,'created_at',p.created_at,'updated_at',r.updated_at,'archived_at',null,'version',p.version,'revision',p.version,'expires_at',null,'subtotal_cents',round(p.quantity*p.price_cents),'price_basis','visit','operation_id',r.work_order_id,'request_id',r.id,'planned',true)
 from public.object_request_proposals p join public.object_visit_requests r on r.id=p.request_id and r.tenant_id=t join public.objects o on o.id=r.object_id and o.tenant_id=t join public.customers c on c.id=o.customer_id and c.tenant_id=t left join auth.users u on u.id=r.owner_user_id
 where p.tenant_id=t and not exists(select 1 from public.object_request_proposals n where n.request_id=p.request_id and n.version>p.version);
$function$;

CREATE OR REPLACE FUNCTION private.commercial_snapshot (
  q public.quotes
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare c public.customers;o public.objects;ct public.customer_contacts;b public.tenant_branding;t public.tenants;s public.tenant_settings;p jsonb;docs jsonb;
begin
 select * into c from public.customers where id=q.customer_id and tenant_id=q.tenant_id;
 select * into o from public.objects where id=q.object_id and tenant_id=q.tenant_id;
 select * into ct from public.customer_contacts where id=q.contact_id and tenant_id=q.tenant_id;
 select * into b from public.tenant_branding where tenant_id=q.tenant_id;
 select * into t from public.tenants where id=q.tenant_id;
 select * into s from public.tenant_settings where tenant_id=q.tenant_id;
 p:=private.commercial_prices(q.tenant_id,q.lines);
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'mime_type',mime_type,'sha256',sha256)),'[]') into docs from public.commercial_attachments where tenant_id=q.tenant_id and quote_id=q.id and public_in_offer;
 return p||jsonb_build_object('schema',1,'quote_number',q.quote_number,'revision',q.revision,'subject',q.subject,'work_kind',q.work_kind,'price_basis',q.price_basis,'terms',q.terms,'expires_at',q.expires_at,
 'customer',jsonb_build_object('id',c.id,'name',c.name,'number',c.customer_number,'billing_address',c.billing_address),
 'contact',jsonb_build_object('name',coalesce(ct.full_name,c.name),'email',coalesce(ct.email,c.billing_email)),
 'object',jsonb_build_object('id',o.id,'name',o.name,'number',o.object_number,'address',o.address),
 'brand',jsonb_build_object('name',t.name,'slug',t.slug,'primary',b.primary_color,'accent',b.accent_color,'logo_source',b.logo_path,'sender_name',b.sender_name,'sender_email',b.sender_email,'footer',b.pdf_footer,'white_label',s.white_label_enabled,'business',(select coalesce(jsonb_object_agg(key,value),'{}') from jsonb_each(coalesce(s.settings->'business','{}')) where key in ('legal_name','address','postal_code','city','country','kvk','vat_number','iban','website','phone') and jsonb_typeof(value)='string')),
 'attachments',docs,'offered_at',clock_timestamp());
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
 select * into i from public.invoices where tenant_id=new.tenant_id and id=new.invoice_id;
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

CREATE OR REPLACE FUNCTION private.quote_task_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare q public.quotes;w public.work_orders;l jsonb;
begin
 if tg_op='UPDATE' and old.commercial_snapshot ? 'quote_id' and new.commercial_snapshot is distinct from old.commercial_snapshot then raise exception 'De geaccepteerde offertebron blijft behouden' using errcode='23514';end if;
 if not(new.commercial_snapshot ? 'quote_id') then return new;end if;
 select * into q from public.quotes where tenant_id=new.tenant_id and id=(new.commercial_snapshot->>'quote_id')::uuid;
 select * into w from public.work_orders where tenant_id=new.tenant_id and id=new.work_order_id;
 select value into l from jsonb_array_elements(q.lines) where value->>'id'=new.commercial_snapshot#>>'{line,id}';
 if q.id is null or q.status<>'accepted' or w.quote_id is distinct from q.id or w.customer_id<>q.customer_id or w.object_id<>q.object_id or l is null or new.commercial_snapshot->'line' is distinct from l or (new.commercial_snapshot->>'revision')::integer<>q.revision or new.commercial_snapshot->>'price_basis'<>q.price_basis
 or new.unit_price_cents<>(l->>'price_cents')::bigint or new.vat_basis_points<>(l->>'vat_basis_points')::integer or new.quantity>(l->>'quantity')::numeric or new.task_revision_id is distinct from nullif(l->>'task_revision_id','')::uuid then raise exception 'De uitvoering wijkt af van het geaccepteerde voorstel. Leg een nieuwe commerciële afspraak vast.' using errcode='23514';end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.book_appointment_slot (
  target_tenant_id  uuid,
  target_request_id uuid,
  target_slot_id    uuid,
  target_token_id   uuid
)
  RETURNS public.appointment_slots
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare sl public.appointment_slots;tk public.external_action_tokens;w public.work_orders;r public.requests;
begin
 if coalesce(current_setting('request.jwt.claims',true)::jsonb->>'role','')<>'service_role' then raise exception 'Service role required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant_id::text,0));
 select * into tk from public.external_action_tokens where id=target_token_id and tenant_id=target_tenant_id and purpose='booking' and subject_id=target_request_id for update;
 if tk.id is null or tk.revoked_at is not null or tk.expires_at<=clock_timestamp() then raise exception 'Deze boekingslink is ongeldig of verlopen' using errcode='42501';end if;
 if tk.consumed_at is not null then
  if tk.decision->>'slot_id'=target_slot_id::text then select * into sl from public.appointment_slots where id=target_slot_id and tenant_id=target_tenant_id;return sl;end if;
  raise exception 'Deze boeking is al bevestigd' using errcode='23514';
 end if;
 if not exists(select 1 from public.booking_options where tenant_id=target_tenant_id and token_id=tk.id and slot_id=target_slot_id) then raise exception 'Dit tijdvak is niet aangeboden' using errcode='42501';end if;
 select * into sl from public.appointment_slots where id=target_slot_id and tenant_id=target_tenant_id for update;
 if sl.id is null or sl.status<>'available' or sl.booked_count>=sl.capacity or sl.starts_at<=clock_timestamp() then raise exception 'Dit tijdvak is niet meer beschikbaar' using errcode='23514';end if;
 if tk.work_order_id is not null then
  select * into w from public.work_orders where id=tk.work_order_id and tenant_id=target_tenant_id for update;
  if w.id is null or w.status<>'planned' or w.projected_start_at is not null or w.appointment_slot_id is not null then raise exception 'De afspraak is gewijzigd. Neem contact op met de planner.' using errcode='23514';end if;
  if tk.booking_kind='execution' and not exists(select 1 from public.quotes where id=w.quote_id and tenant_id=target_tenant_id and status='accepted') and length(coalesce(w.commercial_terms->>'direct_agreement',''))<10 then raise exception 'De opdracht is niet goedgekeurd voor uitvoering' using errcode='23514';end if;
  update public.work_orders set appointment_slot_id=sl.id,customer_window_kind='arrival',requested_date=(sl.starts_at at time zone(select timezone from public.tenants where id=target_tenant_id))::date,version=version+1 where id=w.id;
 else
  -- Existing links preserve their request/slot registration, but a booking is
  -- never consent to a quote or to paid work.
  select * into r from public.requests where id=target_request_id and tenant_id=target_tenant_id for update;
  if r.id is null or r.archived_at is not null or r.status in ('rejected','withdrawn') then raise exception 'De aanvraag is niet meer beschikbaar' using errcode='23514';end if;
 end if;
 update public.appointment_slots set booked_count=booked_count+1,status=case when booked_count+1>=capacity then 'full' else 'available' end where id=sl.id returning * into sl;
 update public.requests set preferred_slot_id=sl.id,next_action='Afspraak met planner bevestigen',version=version+1 where id=coalesce(w.request_id,r.id) and tenant_id=target_tenant_id;
 update public.external_action_tokens set consumed_at=clock_timestamp(),decision=jsonb_build_object('slot_id',sl.id,'work_order_id',w.id,'kind',tk.booking_kind) where id=tk.id;
 insert into public.commercial_events(tenant_id,request_id,quote_id,kind,visibility,details) values(target_tenant_id,coalesce(w.request_id,r.id),w.quote_id,'booking.confirmed','customer',jsonb_build_object('slot_id',sl.id,'work_order_id',w.id,'kind',tk.booking_kind,'starts_at',sl.starts_at,'ends_at',sl.ends_at));
 return sl;
end $function$;

CREATE OR REPLACE FUNCTION public.commercial_booking (
  target_tenant uuid,
  command_id    uuid,
  input         jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare w public.work_orders;sl public.appointment_slots;tk public.external_action_tokens;v_hash text:=input->>'token_hash';result jsonb;receipt private.commercial_commands;v_start timestamptz:=(input->>'starts_at')::timestamptz;v_end timestamptz:=(input->>'ends_at')::timestamptz;
begin
 if not private.commercial_member(target_tenant) then raise exception 'Geen toegang' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 select * into receipt from private.commercial_commands where tenant_id=target_tenant and id=command_id;
 if found then if receipt.actor_id<>auth.uid() or receipt.command<>'booking' or receipt.payload<>input then raise exception 'Deze actiereferentie is al gebruikt' using errcode='23514';end if;return receipt.result;end if;
 select * into w from public.work_orders where tenant_id=target_tenant and id=(input->>'work_order_id')::uuid for update;
 if w.id is null or w.status<>'planned' or w.projected_start_at is not null or w.appointment_slot_id is not null then raise exception 'Kies een nog niet ingeplande opname of goedgekeurde opdracht' using errcode='23514';end if;
 if w.visit_kind='execution' and not exists(select 1 from public.quotes where id=w.quote_id and tenant_id=target_tenant and status='accepted') and length(coalesce(w.commercial_terms->>'direct_agreement',''))<10 then raise exception 'Uitvoering vereist offerteakkoord of een vastgelegde bestaande afspraak' using errcode='23514';end if;
 if v_start is null or v_end is null or v_start<=clock_timestamp() or v_end<=v_start or v_end-v_start>interval '12 hours' or v_hash!~'^[a-f0-9]{64}$' then raise exception 'Controleer het toekomstige tijdvak' using errcode='23514';end if;
 insert into public.appointment_slots(tenant_id,starts_at,ends_at,capacity) values(target_tenant,v_start,v_end,coalesce((input->>'capacity')::integer,1)) returning * into sl;
 insert into public.external_action_tokens(tenant_id,purpose,subject_id,work_order_id,booking_kind,token_hash,expires_at,recipient) values(target_tenant,'booking',coalesce(w.request_id,w.id),w.id,w.visit_kind,v_hash,least(v_start,clock_timestamp()+interval '14 days'),(select billing_email from public.customers where id=w.customer_id and tenant_id=target_tenant)) returning * into tk;
 insert into public.booking_options(tenant_id,token_id,slot_id) values(target_tenant,tk.id,sl.id);
 result:=jsonb_build_object('id',tk.id,'work_order_id',w.id);
 insert into private.commercial_commands(tenant_id,id,actor_id,command,payload,result) values(target_tenant,command_id,auth.uid(),'booking',input,result);
 insert into public.commercial_events(tenant_id,request_id,quote_id,actor_id,kind,details) values(target_tenant,w.request_id,w.quote_id,auth.uid(),'booking.link_created',jsonb_build_object('work_order_id',w.id,'kind',w.visit_kind,'slot_id',sl.id));
 return result;
end $function$;

REVOKE ALL ON FUNCTION "public"."commercial_booking"(uuid, uuid, jsonb) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.commercial_command (
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
declare receipt private.commercial_commands;q public.quotes;n public.quotes;r public.requests;w public.work_orders;l jsonb;result jsonb:='{}';v_id uuid:=nullif(input->>'id','')::uuid;ev bigint:=nullif(input->>'version','')::bigint;state text;kind text;reason text:=trim(coalesce(input->>'reason',''));v_new uuid;v_line uuid;recipient text;v_snapshot jsonb;
begin
 if not private.commercial_member(target_tenant) or command_id is null then raise exception 'Geen commerciële toegang' using errcode='42501';end if;
 -- Same lock order as planning and visit requests, then a short tenant commercial lock.
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 perform pg_advisory_xact_lock(hashtextextended('commercial:'||target_tenant::text,0));
 select * into receipt from private.commercial_commands where tenant_id=target_tenant and private.commercial_commands.id=command_id;
 if found then
  if receipt.actor_id<>auth.uid() or receipt.command<>command or receipt.payload<>input then raise exception 'Gebruik een nieuwe actiereferentie voor gewijzigde invoer' using errcode='23514';end if;
  return receipt.result;
 end if;
 if command='request_save' then result:=public.commercial_save_request(target_tenant,input);
 elsif command='quote_save' then result:=public.commercial_save_quote(target_tenant,input);
 elsif command in ('publish','revise','decide','convert','quote_archive','quote_delete','quote_followup') then
  select * into q from public.quotes where tenant_id=target_tenant and quotes.id=v_id for update;
  if q.id is null then raise exception 'Offerte niet beschikbaar' using errcode='42501';end if;
  if command='convert' and q.operation_id is not null then result:=jsonb_build_object('id',q.id,'operation_id',q.operation_id);
  elsif command='publish' and q.published_at is not null and q.status='awaiting_acceptance' then result:=jsonb_build_object('id',q.id);
  else
   if ev is null or q.version<>ev then raise exception 'Deze offerte is intussen gewijzigd. Herlaad eerst.' using errcode='40001';end if;
   if command='publish' then
    if q.status<>'draft' or q.archived_at is not null then raise exception 'Alleen een concept kan worden aangeboden' using errcode='23514';end if;
    perform private.commercial_relations(target_tenant,q.customer_id,q.object_id,q.contact_id,q.owner_id);
    if q.object_id is null then raise exception 'Koppel eerst het definitieve werkobject' using errcode='23514';end if;
    if jsonb_array_length(q.lines)=0 or length(trim(coalesce(q.terms->>'scope','')))<3 or length(trim(coalesce(q.terms->>'discipline','')))<2 or q.expires_at is null or q.expires_at<=clock_timestamp() then raise exception 'Vul werkzaamheden, dienst, regels en een toekomstige geldigheidsdatum in' using errcode='23514';end if;
    if q.work_kind='recurring' and(length(trim(coalesce(q.terms->>'frequency','')))<2 or nullif(q.terms->>'starts_on','') is null or q.price_basis='once') then raise exception 'Terugkerend werk vereist een frequentie, startdatum en expliciete prijsbasis' using errcode='23514';end if;
    if q.terms->>'pricing_method' not in ('fixed','estimate','actual') then raise exception 'Kies een prijsafspraak' using errcode='23514';end if;
    v_snapshot:=private.commercial_snapshot(q);recipient:=v_snapshot#>>'{contact,email}';
    if recipient is null or recipient!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Vul een geldig e-mailadres van de ontvanger in' using errcode='23514';end if;
    update public.quotes set snapshot=v_snapshot,published_at=clock_timestamp(),status='awaiting_acceptance',next_action='Klantakkoord opvolgen',version=version+1 where quotes.id=q.id;
    update public.quotes set superseded_at=clock_timestamp(),next_action='',followup_on=null,version=version+1 where tenant_id=target_tenant and series_id=q.series_id and quotes.id<>q.id and status in ('awaiting_acceptance','sent','change_requested') and superseded_at is null;
    update public.external_action_tokens set revoked_at=clock_timestamp() where tenant_id=target_tenant and purpose='quote_acceptance' and subject_id in(select x.id from public.quotes x where x.series_id=q.series_id and x.id<>q.id and x.accepted_at is null) and revoked_at is null;
    if q.request_id is not null then update public.requests set status='processed',outcome='quote',next_action='Offerte volgen',version=version+1 where requests.id=q.request_id;end if;
    kind:='quote.published';result:=jsonb_build_object('id',q.id);
   elsif command='revise' then
    select * into n from public.quotes where tenant_id=target_tenant and series_id=q.series_id order by revision desc limit 1;
    if n.status='draft' then result:=jsonb_build_object('id',n.id);
    else
     v_new:=gen_random_uuid();
     insert into public.quotes(id,tenant_id,series_id,previous_id,request_id,customer_id,object_id,contact_id,quote_number,revision,subject,work_kind,price_basis,owner_id,subtotal_cents,vat_cents,total_cents,snapshot,lines,terms,expires_at,visit_request_id)
     values(v_new,target_tenant,q.series_id,n.id,q.request_id,q.customer_id,q.object_id,q.contact_id,q.quote_number,n.revision+1,q.subject,q.work_kind,q.price_basis,coalesce(q.owner_id,auth.uid()),q.subtotal_cents,q.vat_cents,q.total_cents,'{}',q.lines,q.terms,clock_timestamp()+interval '14 days',q.visit_request_id);
     result:=jsonb_build_object('id',v_new);kind:='quote.revised';
    end if;
   elsif command='decide' then result:=private.commercial_decide(q.id,target_tenant,input,auth.uid(),input->>'channel');
   elsif command='convert' then
    if q.status<>'accepted' or q.object_id is null or q.archived_at is not null then raise exception 'Een geaccepteerde offerte met werkobject is vereist' using errcode='23514';end if;
    if exists(select 1 from jsonb_array_elements(q.lines) line where coalesce(nullif(line->>'duration_minutes','')::integer,nullif(input#>>array['durations',line->>'id'],'')::integer,0) not between 1 and 43200) then raise exception 'Vul voor iedere regel zonder planningduur een duur in. Het geaccepteerde document blijft ongewijzigd.' using errcode='23514';end if;
    insert into public.work_orders(tenant_id,work_order_number,request_id,quote_id,customer_id,object_id,discipline,created_by,requested_date,day_instructions,commercial_terms)
    values(target_tenant,'WB-'||to_char(now(),'YYYY')||'-'||upper(substr(gen_random_uuid()::text,1,8)),q.request_id,q.id,q.customer_id,q.object_id,q.terms->>'discipline',auth.uid(),nullif(q.terms->>'starts_on','')::date,left(concat_ws(E'\n',q.terms->>'scope',q.terms->>'preparation'),2000),jsonb_build_object('quote_id',q.id,'revision',q.revision,'work_kind',q.work_kind,'price_basis',q.price_basis,'frequency',q.terms->>'frequency','starts_on',q.terms->>'starts_on','ends_on',q.terms->>'ends_on','pricing_method',q.terms->>'pricing_method')) returning * into w;
    for l in select value from jsonb_array_elements(q.lines) loop
     insert into public.work_order_tasks(tenant_id,work_order_id,task_revision_id,task_code,task_name,duration_minutes,quantity,unit,unit_price_cents,vat_basis_points,added_by,commercial_snapshot)
     values(target_tenant,w.id,nullif(l->>'task_revision_id','')::uuid,l->>'task_code',l->>'description',coalesce((l->>'duration_minutes')::integer,(input#>>array['durations',l->>'id'])::integer),(l->>'quantity')::numeric,l->>'unit',(l->>'price_cents')::bigint,(l->>'vat_basis_points')::integer,auth.uid(),jsonb_build_object('quote_id',q.id,'revision',q.revision,'line',l,'price_basis',q.price_basis,'accepted_at',q.accepted_at));
    end loop;
    if q.work_kind='recurring' then
     insert into public.object_records(tenant_id,object_id,kind,title,body,state,starts_at,ends_at,service,owner_user_id,details,created_by)
     values(target_tenant,q.object_id,'programme',q.subject,q.terms->>'scope','active',((q.terms->>'starts_on')::date::timestamp at time zone(select timezone from public.tenants where id=target_tenant)),case when nullif(q.terms->>'ends_on','') is not null then (((q.terms->>'ends_on')::date+1)::timestamp at time zone(select timezone from public.tenants where id=target_tenant)) end,q.terms->>'discipline',q.owner_id,jsonb_build_object('commercial_quote_id',q.id,'revision',q.revision,'frequency',q.terms->>'frequency','planning','Bezoeken worden afzonderlijk door de planner bevestigd'),auth.uid());
    end if;
    update public.quotes set operation_id=w.id,next_action='Inplannen',followup_on=null,version=version+1 where quotes.id=q.id;
    if q.request_id is not null then update public.requests set status='processed',outcome='order',next_action='Inplannen',version=version+1 where requests.id=q.request_id;end if;
    result:=jsonb_build_object('id',q.id,'operation_id',w.id);kind:='quote.converted';
   elsif command='quote_followup' then
    perform private.commercial_relations(target_tenant,q.customer_id,q.object_id,q.contact_id,(input->>'owner_id')::uuid);
    if q.status in ('rejected','expired') or q.archived_at is not null then raise exception 'Deze offerte vraagt geen actieve opvolging' using errcode='23514';end if;
    update public.quotes set owner_id=(input->>'owner_id')::uuid,next_action=input->>'next_action',followup_on=nullif(input->>'followup_on','')::date,version=version+1 where quotes.id=q.id;kind:='quote.followup';
   elsif command='quote_archive' then
    update public.quotes set archived_at=clock_timestamp(),next_action='',followup_on=null,version=version+1 where quotes.id=q.id;
    update public.external_action_tokens set revoked_at=clock_timestamp() where tenant_id=target_tenant and subject_id=q.id and revoked_at is null;kind:='quote.archived';
   elsif command='quote_delete' then
    if q.status<>'draft' or q.previous_id is not null or exists(select 1 from public.quotes where previous_id=q.id) or exists(select 1 from public.work_orders where quote_id=q.id) or exists(select 1 from public.commercial_attachments where quote_id=q.id) then raise exception 'Deze offerte heeft historie. Archiveer haar in plaats van verwijderen.' using errcode='23514';end if;
    delete from public.commercial_events where quote_id=q.id;delete from public.quotes where quotes.id=q.id;result:=jsonb_build_object('deleted',true);
   end if;
  end if;
 elsif command in ('information','request_status','request_archive','request_delete','note','request_direct','inspection') then
  select * into r from public.requests where tenant_id=target_tenant and requests.id=v_id for update;
  if r.id is null then raise exception 'Aanvraag niet beschikbaar' using errcode='42501';end if;
  if ev is null or r.version<>ev then raise exception 'Deze aanvraag is intussen gewijzigd. Herlaad eerst.' using errcode='40001';end if;
  if command='information' then
   if length(reason) not between 3 and 5000 or r.status not in ('new','review','waiting_info') or r.archived_at is not null then raise exception 'Vul de klantvraag in voor een actieve aanvraag' using errcode='23514';end if;
   update public.requests set status='waiting_info',next_action='Reactie klant opvolgen',followup_on=nullif(input->>'followup_on','')::date,version=version+1 where requests.id=r.id;
   insert into public.commercial_events(tenant_id,request_id,actor_id,kind,body,visibility) values(target_tenant,r.id,auth.uid(),'request.information_requested',reason,'customer');
  elsif command='request_status' then
   state:=input->>'status';
   if state not in ('review','waiting_info','rejected','withdrawn') or length(reason)<3 then raise exception 'Kies een status en leg een toelichting vast' using errcode='23514';end if;
   if r.status in ('rejected','withdrawn','processed') or r.archived_at is not null then raise exception 'Deze aanvraag is al afgehandeld' using errcode='23514';end if;
   update public.requests set status=state,next_action=case when state in ('rejected','withdrawn') then '' when state='waiting_info' then 'Reactie klant opvolgen' else 'Aanvraag beoordelen' end,followup_on=case when state in ('rejected','withdrawn') then null else nullif(input->>'followup_on','')::date end,version=version+1 where requests.id=r.id;kind:='request.'||state;
  elsif command='request_archive' then update public.requests set archived_at=clock_timestamp(),next_action='',followup_on=null,version=version+1 where requests.id=r.id;kind:='request.archived';
  elsif command='request_delete' then
   if r.status<>'new' or exists(select 1 from public.quotes where request_id=r.id) or exists(select 1 from public.work_orders where request_id=r.id) or exists(select 1 from public.external_action_tokens where subject_id=r.id) or exists(select 1 from public.commercial_attachments where request_id=r.id) or exists(select 1 from public.commercial_events where request_id=r.id and kind not in ('request.received','request.updated')) then raise exception 'Deze aanvraag heeft afhankelijke registraties. Archiveer haar.' using errcode='23514';end if;
   delete from public.commercial_events where request_id=r.id;delete from public.requests where requests.id=r.id;result:=jsonb_build_object('deleted',true);
  elsif command='note' then
   if length(reason) not between 2 and 10000 then raise exception 'Vul de notitie in' using errcode='23514';end if;
   update public.requests set version=version+1 where requests.id=r.id;kind:='request.note';
  elsif command in ('request_direct','inspection') then
   if r.object_id is null then raise exception 'Koppel eerst het definitieve object' using errcode='23514';end if;
   if r.archived_at is not null or r.status in ('rejected','withdrawn') then raise exception 'Deze aanvraag is niet meer actief' using errcode='23514';end if;
   select * into w from public.work_orders where tenant_id=target_tenant and request_id=r.id and visit_kind=case when command='inspection' then 'inspection' else 'execution' end and status<>'cancelled' limit 1;
   if w.id is not null then result:=jsonb_build_object('operation_id',w.id);
   else
    if command='request_direct' and length(reason)<10 then raise exception 'Leg de bestaande prijsafspraak of contractdekking vast' using errcode='23514';end if;
    insert into public.work_orders(tenant_id,work_order_number,request_id,customer_id,object_id,discipline,created_by,visit_kind,day_instructions,commercial_terms)
    values(target_tenant,'WB-'||to_char(now(),'YYYY')||'-'||upper(substr(gen_random_uuid()::text,1,8)),r.id,r.customer_id,r.object_id,r.discipline,auth.uid(),case when command='inspection' then 'inspection' else 'execution' end,left(r.description,2000),jsonb_build_object('direct_agreement',reason,'request_id',r.id)) returning * into w;
    if command='request_direct' then
     if jsonb_array_length(coalesce(input->'lines','[]'))=0 then raise exception 'Selecteer de overeengekomen werkzaamheden' using errcode='23514';end if;
     for l in select value from jsonb_array_elements(private.commercial_prices(target_tenant,input->'lines')->'lines') loop
      if nullif(l->>'duration_minutes','') is null then raise exception 'Vul de duur van de werkzaamheden in' using errcode='23514';end if;
      if (l->>'discount_basis_points')::integer<>0 then raise exception 'Gebruik bij een directe prijsafspraak het overeengekomen nettotarief zonder losse korting, of stel een offerte op.' using errcode='23514';end if;
      insert into public.work_order_tasks(tenant_id,work_order_id,task_revision_id,task_code,task_name,duration_minutes,quantity,unit,unit_price_cents,vat_basis_points,added_by) values(target_tenant,w.id,nullif(l->>'task_revision_id','')::uuid,l->>'task_code',l->>'description',(l->>'duration_minutes')::integer,(l->>'quantity')::numeric,l->>'unit',(l->>'price_cents')::bigint,(l->>'vat_basis_points')::integer,auth.uid());
     end loop;
     update public.requests set status='processed',outcome='direct_order',next_action='Inplannen',version=version+1 where requests.id=r.id;
    else update public.requests set status='review',next_action='Opname inplannen',version=version+1 where requests.id=r.id;end if;
    result:=jsonb_build_object('operation_id',w.id);kind:=case when command='inspection' then 'request.inspection' else 'request.direct_order' end;
   end if;
  end if;
 else raise exception 'Onbekende commerciële actie' using errcode='23514';end if;
 if kind is not null then insert into public.commercial_events(tenant_id,request_id,quote_id,actor_id,kind,body,details) values(target_tenant,coalesce(r.id,q.request_id),q.id,auth.uid(),kind,reason,result);end if;
 insert into private.commercial_commands(tenant_id,id,actor_id,command,payload,result) values(target_tenant,command_id,auth.uid(),command,input,result);
 return result;
end $function$;

REVOKE ALL ON FUNCTION "public"."commercial_command"(uuid, uuid, text, jsonb) FROM PUBLIC, "anon", "service_role";

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
 if not private.object_session_active() then raise exception 'Log opnieuw in' using errcode='42501';end if;
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

REVOKE ALL ON FUNCTION "public"."commercial_customer_action"(uuid, uuid, text, jsonb) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.commercial_customer_file (
  target_tenant uuid,
  target_id     uuid,
  asset         text DEFAULT ''::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare q public.quotes;d public.commercial_attachments;
begin
 if asset in ('pdf','logo') then select * into q from public.quotes where tenant_id=target_tenant and id=target_id;
 else select * into d from public.commercial_attachments where tenant_id=target_tenant and id=target_id and public_in_offer;select * into q from public.quotes where tenant_id=target_tenant and id=d.quote_id;end if;
 if q.id is null or q.published_at is null or not private.commercial_customer_scope(target_tenant,q.customer_id,q.object_id) then raise exception 'Geen toegang' using errcode='42501';end if;
 if asset='' and not exists(select 1 from jsonb_array_elements(q.snapshot->'attachments') a where a->>'id'=target_id::text) then raise exception 'Geen toegang tot deze bijlage' using errcode='42501';end if;
 return jsonb_build_object('path',case asset when 'pdf' then q.pdf_path when 'logo' then q.logo_path else d.storage_path end,'name',case when asset='pdf' then q.quote_number||'-v'||q.revision||'.pdf' else d.title end,'mime',case when asset='pdf' then 'application/pdf' when asset='logo' then case when q.logo_path like '%.png' then 'image/png' when q.logo_path like '%.webp' then 'image/webp' else 'image/jpeg' end else d.mime_type end);
end $function$;

REVOKE ALL ON FUNCTION "public"."commercial_customer_file"(uuid, uuid, text) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.commercial_customer_list (
  target_tenant uuid,
  page_number   integer DEFAULT 1
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare result jsonb;
begin
 if not private.object_session_active() then raise exception 'Log opnieuw in' using errcode='42501';end if;
 if page_number not between 1 and 100000 then raise exception 'Ongeldige pagina' using errcode='23514';end if;
 select jsonb_build_object(
 'objects',(select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'customer',c.name)),'[]') from public.objects o join public.customers c on c.tenant_id=o.tenant_id and c.id=o.customer_id where o.tenant_id=target_tenant and private.commercial_customer_scope(o.tenant_id,o.customer_id,o.id)),
 'requests',(select coalesce(jsonb_agg(x),'[]') from(select r.id,r.request_number,r.subject,r.description,r.status,r.created_at,o.name object,(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'kind',e.kind,'body',e.body,'at',e.created_at) order by e.created_at),'[]') from public.commercial_events e where e.tenant_id=target_tenant and e.request_id=r.id and e.visibility='customer') events from public.requests r left join public.objects o on o.id=r.object_id and o.tenant_id=r.tenant_id where r.tenant_id=target_tenant and private.commercial_customer_scope(r.tenant_id,r.customer_id,r.object_id,r.created_by) order by r.created_at desc,r.id limit 25 offset (page_number-1)*25)x),
 'quotes',(select coalesce(jsonb_agg(x),'[]') from(select q.id,q.quote_number,q.revision,q.status,q.expires_at,q.superseded_at,q.archived_at,q.snapshot from public.quotes q where q.tenant_id=target_tenant and q.published_at is not null and private.commercial_customer_scope(q.tenant_id,q.customer_id,q.object_id) order by q.created_at desc,q.id limit 25 offset (page_number-1)*25)x)) into result;
 return result;
end $function$;

REVOKE ALL ON FUNCTION "public"."commercial_customer_list"(uuid, integer) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.commercial_detail (
  target_tenant uuid,
  target_id     uuid,
  source_kind   text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare q public.quotes;r public.requests;result jsonb;v_request uuid;v_series uuid;
begin
 if not private.commercial_member(target_tenant) then raise exception 'Geen commerciële toegang' using errcode='42501';end if;
 if source_kind='quote' then
  select * into q from public.quotes where tenant_id=target_tenant and id=target_id;if q.id is null then raise exception 'Offerte niet beschikbaar' using errcode='42501';end if;
  result:=jsonb_build_object('record',to_jsonb(q),'preview',case when q.published_at is null and q.status='draft' then private.commercial_snapshot(q) else q.snapshot end);v_request:=q.request_id;v_series:=q.series_id;
 elsif source_kind='request' then
  select * into r from public.requests where tenant_id=target_tenant and id=target_id;if r.id is null then raise exception 'Aanvraag niet beschikbaar' using errcode='42501';end if;
  result:=jsonb_build_object('record',to_jsonb(r));v_request:=r.id;
 elsif source_kind in ('visit','proposal') then
  select jsonb_build_object('record',to_jsonb(v),'proposals',(select coalesce(jsonb_agg(to_jsonb(p) order by p.version desc),'[]') from public.object_request_proposals p where p.request_id=v.id and p.tenant_id=target_tenant)) into result
  from public.object_visit_requests v where v.tenant_id=target_tenant and(v.id=target_id and source_kind='visit' or source_kind='proposal' and v.id=(select request_id from public.object_request_proposals where tenant_id=target_tenant and id=target_id));
  if result is null then raise exception 'Bezoekverzoek niet beschikbaar' using errcode='42501';end if;
  return result;
 else raise exception 'Onbekend dossier' using errcode='23514';end if;
 return result||jsonb_build_object('quotes',(select coalesce(jsonb_agg(to_jsonb(x) order by x.revision desc,x.created_at desc),'[]') from public.quotes x where x.tenant_id=target_tenant and(case when v_series is not null then x.series_id=v_series else x.request_id=v_request end)),
 'events',(select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('actor',u.email) order by e.created_at desc),'[]') from public.commercial_events e left join auth.users u on u.id=e.actor_id where e.tenant_id=target_tenant and(e.request_id=v_request or e.quote_id in(select id from public.quotes where series_id=v_series and tenant_id=target_tenant))),
 'deliveries',(select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'status',m.status,'recipient',m.recipient,'attempts',m.attempts,'error',m.last_error,'sent_at',m.sent_at,'subject',m.render_snapshot->>'subject') order by m.created_at desc),'[]') from public.mail_deliveries m where m.tenant_id=target_tenant and (m.render_snapshot->>'request_id'=v_request::text or m.render_snapshot->>'quote_id' in(select id::text from public.quotes where tenant_id=target_tenant and (series_id=v_series or request_id=v_request)))),
 'attachments',(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from public.commercial_attachments d where d.tenant_id=target_tenant and(case when source_kind='quote' then d.quote_id=target_id else d.request_id=target_id end)),
 'operations',(select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'number',w.work_order_number,'kind',w.visit_kind,'start',w.projected_start_at,'status',w.status,'terms',w.commercial_terms)),'[]') from public.work_orders w where w.tenant_id=target_tenant and(w.request_id=v_request or w.quote_id=q.id)));
end $function$;

REVOKE ALL ON FUNCTION "public"."commercial_detail"(uuid, uuid, text) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.commercial_external_decision (
  token_hash_input text,
  target_tenant    uuid,
  input            jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare tk public.external_action_tokens;result jsonb;
begin
 if coalesce(current_setting('request.jwt.claims',true)::jsonb->>'role','')<>'service_role' then raise exception 'Service required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('commercial:'||target_tenant::text,0));
 select * into tk from public.external_action_tokens where token_hash=token_hash_input and tenant_id=target_tenant and purpose='quote_acceptance' for update;
 if tk.id is null or tk.revoked_at is not null or tk.expires_at<=clock_timestamp() then raise exception 'Dit voorstel is verlopen of vervangen. Neem contact op met de afzender.' using errcode='23514';end if;
 if tk.consumed_at is not null then
  if tk.decision->>'decision'=input->>'decision' then return tk.decision;end if;
  raise exception 'Er is al een besluit op dit voorstel vastgelegd' using errcode='23514';
 end if;
 result:=private.commercial_decide(tk.subject_id,target_tenant,input,null,'secure_link');
 return result;
end $function$;

REVOKE ALL ON FUNCTION "public"."commercial_external_decision"(text, uuid, jsonb) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.commercial_list (
  target_tenant uuid,
  filters       jsonb DEFAULT '{}'::jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare today date;result jsonb;v_page integer:=greatest(1,least(coalesce((filters->>'page')::integer,1),100000));v_size integer:=25;v_tab text:=coalesce(filters->>'tab','requests');v_sort text:=coalesce(filters->>'sort','attention');
begin
 if not private.commercial_member(target_tenant) then raise exception 'Geen commerciële toegang' using errcode='42501';end if;
 if v_tab not in ('requests','quotes') or v_sort not in ('attention','updated','number','customer','amount','expires') then raise exception 'Ongeldige lijstoptie' using errcode='23514';end if;
 select(clock_timestamp() at time zone timezone)::date into today from public.tenants where id=target_tenant;
 with base as materialized(select value as x from private.commercial_rows(target_tenant) value
  where (coalesce(filters->>'customer','')='' or value->>'customer_id'=filters->>'customer') and (coalesce(filters->>'object','')='' or value->>'object_id'=filters->>'object')
  and (coalesce(filters->>'work_kind','')='' or value->>'work_kind'=filters->>'work_kind') and(coalesce(filters->>'source','')='' or value->>'source'=filters->>'source')
  and(coalesce(filters->>'owner','')='' or value->>'owner_id'=filters->>'owner') and(coalesce(filters->>'priority','')='' or value->>'priority'=filters->>'priority')
  and (coalesce(filters->>'from','')='' or (value->>'created_at')::timestamptz>=(filters->>'from')::date::timestamp at time zone(select timezone from public.tenants where id=target_tenant))
  and (coalesce(filters->>'until','')='' or (value->>'created_at')::timestamptz<((filters->>'until')::date+1)::timestamp at time zone(select timezone from public.tenants where id=target_tenant))
  and (coalesce(filters->>'archived','')='yes' or value->>'archived_at' is null)
  and (coalesce(filters->>'q','')='' or strpos(lower(concat_ws(' ',value->>'number',value->>'subject',value->>'customer',value->>'object',value#>>'{address,street}',value#>>'{address,postal_code}',value#>>'{address,city}')),lower(left(filters->>'q',200)))>0)),
 marked as(select x,(x->>'tab'='requests' and x->>'status'='new') is_new,
  (x->>'tab'='quotes' and x->>'status'='awaiting_acceptance' and (x->>'followup_on')::date<=today) followup,
  (x->>'tab'='quotes' and x->>'status'='awaiting_acceptance' and (x->>'expires_at')::timestamptz>clock_timestamp() and ((x->>'expires_at')::timestamptz at time zone(select timezone from public.tenants where id=target_tenant))::date<=today+3) expiring,
  (x->>'tab'='quotes' and x->>'status'='accepted' and x->>'operation_id' is null) convert from base),
 filtered as (select * from marked where x->>'tab'=v_tab and(coalesce(filters->>'status','')='' or x->>'status'=filters->>'status')
  and(coalesce(filters->>'operation','')='' or filters->>'operation'='none' and x->>'operation_id' is null or filters->>'operation'='unplanned' and x->>'operation_id' is not null and coalesce((x->>'planned')::boolean,false)=false or filters->>'operation'='planned' and (x->>'planned')::boolean)
  and(case coalesce(filters->>'attention','') when '' then true when 'new' then is_new when 'followup' then followup when 'expiring' then expiring when 'convert' then convert when 'overdue' then (x->>'followup_on')::date<=today else false end)),
 ordered as(select x from filtered order by
  case when v_sort='attention' then coalesce((x->>'followup_on')::date,'infinity') end asc,
  case when v_sort='number' then x->>'number' when v_sort='customer' then x->>'customer' end asc,
  case when v_sort='amount' then (x->>'subtotal_cents')::bigint end desc,
  case when v_sort='expires' then(x->>'expires_at')::timestamptz end asc nulls last,
  (x->>'updated_at')::timestamptz desc,x->>'id' asc
  limit v_size offset(v_page-1)*v_size)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(x) from ordered),'[]'),'total',(select count(*) from filtered),'page',v_page,'page_size',v_size,'today',today,
 'counts',jsonb_build_object('new',(select count(*) from marked where is_new),'followup',(select count(*) from marked where followup),'expiring',(select count(*) from marked where expiring),'convert',(select count(*) from marked where convert))) into result;
 return result;
end $function$;

REVOKE ALL ON FUNCTION "public"."commercial_list"(uuid, jsonb) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.commercial_mail_claim (
  target_tenant   uuid,
  event_id        uuid,
  recipient_input text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare e public.commercial_events;m public.mail_deliveries;k text;
begin
 if coalesce(current_setting('request.jwt.claims',true)::jsonb->>'role','')<>'service_role' then raise exception 'Service required' using errcode='42501';end if;
 select * into e from public.commercial_events where tenant_id=target_tenant and id=event_id for update;
 if e.id is null or not exists(select 1 from jsonb_array_elements(e.mail_snapshot->'recipients') x where x->>'email'=recipient_input) then raise exception 'Ontvanger niet geregistreerd' using errcode='42501';end if;
 k:='commercial-event:'||e.id::text||':'||encode(extensions.digest(recipient_input,'sha256'),'hex');
 select * into m from public.mail_deliveries where tenant_id=target_tenant and idempotency_key=k for update;
 if m.id is not null and m.status in ('sent','processing') then return jsonb_build_object('id',m.id,'send',false,'status',m.status);end if;
 if m.id is null then insert into public.mail_deliveries(tenant_id,recipient,template,idempotency_key,status,attempts,render_snapshot,branding_snapshot) values(target_tenant,recipient_input,'commercial_event',k,'processing',1,jsonb_build_object('event_id',e.id,'quote_id',e.quote_id,'request_id',e.request_id,'subject',e.mail_snapshot->>'subject','body',e.mail_snapshot->>'body'),e.mail_snapshot->'brand') returning * into m;
 else update public.mail_deliveries set status='processing',attempts=attempts+1,last_error=null where id=m.id;end if;
 return jsonb_build_object('id',m.id,'send',true,'key',k);
end $function$;

REVOKE ALL ON FUNCTION "public"."commercial_mail_claim"(uuid, uuid, text) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.commercial_next_visit (
  target_tenant uuid,
  quote_id      uuid,
  visit_date    date,
  command_id    uuid
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare q public.quotes;w public.work_orders;original public.work_orders;l jsonb;duration integer;receipt private.commercial_commands;payload jsonb:=jsonb_build_object('quote_id',quote_id,'date',visit_date);
begin
 if not private.commercial_member(target_tenant) then raise exception 'Geen toegang' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 perform pg_advisory_xact_lock(hashtextextended('commercial:'||target_tenant::text,0));
 select * into receipt from private.commercial_commands where tenant_id=target_tenant and id=command_id;
 if found then if receipt.actor_id<>auth.uid() or receipt.command<>'next_visit' or receipt.payload<>payload then raise exception 'Gebruik een nieuwe actiereferentie' using errcode='23514';end if;return(receipt.result->>'id')::uuid;end if;
 select * into q from public.quotes where tenant_id=target_tenant and id=quote_id for update;
 if q.id is null or q.status<>'accepted' or q.archived_at is not null or q.work_kind<>'recurring' or q.operation_id is null or visit_date is null or visit_date<(q.terms->>'starts_on')::date or visit_date>nullif(q.terms->>'ends_on','')::date then raise exception 'Kies een bezoek binnen de geaccepteerde looptijd' using errcode='23514';end if;
 select * into w from public.work_orders where tenant_id=target_tenant and work_orders.quote_id=q.id and requested_date=visit_date and status<>'cancelled' order by created_at limit 1;
 if w.id is null then
  select * into original from public.work_orders where tenant_id=target_tenant and id=q.operation_id;
  insert into public.work_orders(tenant_id,work_order_number,request_id,quote_id,customer_id,object_id,discipline,created_by,requested_date,day_instructions,commercial_terms)
  values(target_tenant,'WB-'||to_char(clock_timestamp(),'YYYY')||'-'||upper(substr(gen_random_uuid()::text,1,8)),q.request_id,q.id,q.customer_id,q.object_id,q.terms->>'discipline',auth.uid(),visit_date,left(concat_ws(E'\n',q.terms->>'scope',q.terms->>'preparation'),2000),original.commercial_terms) returning * into w;
  for l in select value from jsonb_array_elements(q.lines) loop
   select duration_minutes into duration from public.work_order_tasks where tenant_id=target_tenant and work_order_id=original.id and commercial_snapshot#>>'{line,id}'=l->>'id';
   insert into public.work_order_tasks(tenant_id,work_order_id,task_revision_id,task_code,task_name,duration_minutes,quantity,unit,unit_price_cents,vat_basis_points,added_by,commercial_snapshot)
   values(target_tenant,w.id,nullif(l->>'task_revision_id','')::uuid,l->>'task_code',l->>'description',coalesce((l->>'duration_minutes')::integer,duration),(l->>'quantity')::numeric,l->>'unit',(l->>'price_cents')::bigint,(l->>'vat_basis_points')::integer,auth.uid(),jsonb_build_object('quote_id',q.id,'revision',q.revision,'line',l,'price_basis',q.price_basis,'accepted_at',q.accepted_at));
  end loop;
  insert into public.commercial_events(tenant_id,request_id,quote_id,actor_id,kind,details) values(target_tenant,q.request_id,q.id,auth.uid(),'order.visit_created',jsonb_build_object('work_order_id',w.id,'date',visit_date));
 end if;
 insert into private.commercial_commands(tenant_id,id,actor_id,command,payload,result) values(target_tenant,command_id,auth.uid(),'next_visit',payload,jsonb_build_object('id',w.id));return w.id;
end $function$;

REVOKE ALL ON FUNCTION "public"."commercial_next_visit"(uuid, uuid, date, uuid) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.commercial_options (
  target_tenant uuid,
  query         text DEFAULT ''::text,
  customer      uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 if not private.commercial_member(target_tenant) then raise exception 'Geen commerciële toegang' using errcode='42501';end if;
 return jsonb_build_object(
 'brand',(select jsonb_build_object('name',t.name,'slug',t.slug,'primary',b.primary_color,'accent',b.accent_color,'logo_source',b.logo_path,'sender_name',b.sender_name,'sender_email',b.sender_email,'footer',b.pdf_footer,'white_label',s.white_label_enabled,'business',(select coalesce(jsonb_object_agg(key,value),'{}') from jsonb_each(coalesce(s.settings->'business','{}')) where key in ('legal_name','address','postal_code','city','country','kvk','vat_number','iban','website','phone') and jsonb_typeof(value)='string')) from public.tenants t join public.tenant_branding b on b.tenant_id=t.id join public.tenant_settings s on s.tenant_id=t.id where t.id=target_tenant),
 'customers',(select coalesce(jsonb_agg(to_jsonb(c)),'[]') from(select id,name,status,billing_email,phone,billing_address,customer_number from public.customers where tenant_id=target_tenant and(strpos(lower(name||' '||coalesce(billing_email,'')||' '||customer_number),lower(left(query,200)))>0 or id=customer) order by(id=customer) desc nulls last,name,id limit 50)c),
 'objects',(select coalesce(jsonb_agg(to_jsonb(o)),'[]') from(select id,name,customer_id,address from public.objects where tenant_id=target_tenant and customer_id=customer and dossier_status<>'archived' order by name,id)o),
 'contacts',(select coalesce(jsonb_agg(to_jsonb(c)),'[]') from public.customer_contacts c where tenant_id=target_tenant and customer_id=customer),
 'owners',(select coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'name',coalesce(p.full_name,u.email))),'[]') from public.tenant_memberships m join auth.users u on u.id=m.user_id left join public.personnel p on p.user_id=m.user_id and p.tenant_id=m.tenant_id where m.tenant_id=target_tenant and m.status='active' and m.roles&&array['tenant_admin','management','planner','finance']::public.app_role[]),
 'tasks',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from(select r.id,r.price_cents,r.vat_basis_points,r.unit,r.duration_minutes,c.code,c.name,c.discipline from public.task_revisions r join public.task_catalog c on c.id=r.task_id and c.tenant_id=target_tenant where r.tenant_id=target_tenant and r.valid_until is null and c.active order by c.name,r.revision desc)x));
end $function$;

REVOKE ALL ON FUNCTION "public"."commercial_options"(uuid, text, uuid) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.commercial_order_context (
  target_tenant uuid,
  target_order  uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare w public.work_orders;q public.quotes;r public.requests;
begin
 if not private.commercial_member(target_tenant) then raise exception 'Geen commerciële toegang' using errcode='42501';end if;
 select * into w from public.work_orders where tenant_id=target_tenant and id=target_order;
 if w.id is null then raise exception 'Opdracht niet beschikbaar' using errcode='42501';end if;
 select * into q from public.quotes where tenant_id=target_tenant and id=w.quote_id;
 select * into r from public.requests where tenant_id=target_tenant and id=w.request_id;
 return jsonb_build_object('quote_id',q.id,'quote_number',q.quote_number,'revision',q.revision,'request_id',r.id,'request_number',r.request_number,'kind',w.visit_kind,'work_kind',q.work_kind,'frequency',q.terms->>'frequency','price_basis',q.price_basis,'starts_on',q.terms->>'starts_on','ends_on',q.terms->>'ends_on');
end $function$;

REVOKE ALL ON FUNCTION "public"."commercial_order_context"(uuid, uuid) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.commercial_public_intake (
  target_tenant uuid,
  request_id    uuid,
  input         jsonb,
  client_hash   text
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare n integer;h timestamptz:=date_trunc('hour',clock_timestamp());k text;
begin
 if coalesce(current_setting('request.jwt.claims',true)::jsonb->>'role','')<>'service_role' or client_hash!~'^[a-f0-9]{64}$' then raise exception 'Service required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('commercial-intake:'||target_tenant::text||request_id::text,0));
 if exists(select 1 from public.requests where id=request_id and tenant_id=target_tenant and source='website') then return true;end if;
 foreach k in array array[client_hash,'email:'||encode(extensions.digest(lower(coalesce(input->>'email','')),'sha256'),'hex'),'tenant'] loop
  insert into private.commercial_intake_limits(tenant_id,key_hash,hour_start) values(target_tenant,k,h) on conflict(tenant_id,key_hash,hour_start) do update set attempts=commercial_intake_limits.attempts+1 returning attempts into n;
  if n>(case when k='tenant' then 100 else 5 end) then raise exception 'Er zijn veel aanvragen ontvangen. Probeer later opnieuw of neem contact op.' using errcode='23514';end if;
 end loop;
 delete from private.commercial_intake_limits where hour_start<clock_timestamp()-interval '7 days';
 perform private.commercial_intake(target_tenant,request_id,input,'website',null,null,null);return true;
end $function$;

REVOKE ALL ON FUNCTION "public"."commercial_public_intake"(uuid, uuid, jsonb, text) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.commercial_quote_mail_claim (
  target_tenant uuid,
  target_quote  uuid,
  command_id    uuid,
  reminder      boolean
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare q public.quotes;m public.mail_deliveries;k text;recipient text;
begin
 if coalesce(current_setting('request.jwt.claims',true)::jsonb->>'role','')<>'service_role' then raise exception 'Service required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('commercial:'||target_tenant::text,0));
 select * into q from public.quotes where tenant_id=target_tenant and id=target_quote for update;
 if q.id is null or q.status<>'awaiting_acceptance' or q.expires_at<=clock_timestamp() or q.superseded_at is not null or q.archived_at is not null or q.pdf_path is null then raise exception 'Dit voorstel is niet meer beschikbaar voor verzending. Herlaad de actuele versie.' using errcode='23514';end if;
 k:=case when reminder then 'commercial-reminder-'||q.id::text||'-'||command_id::text else 'commercial-quote-'||q.id::text end;
 recipient:=q.snapshot#>>'{contact,email}';
 select * into m from public.mail_deliveries where tenant_id=target_tenant and idempotency_key=k for update;
 if m.id is not null and m.status in ('sent','processing') then return jsonb_build_object('id',m.id,'send',false,'status',m.status);end if;
 if m.id is null then insert into public.mail_deliveries(tenant_id,recipient,template,idempotency_key,status,attempts,render_snapshot) values(target_tenant,recipient,case when reminder then 'quote_reminder' else 'quote' end,k,'processing',1,jsonb_build_object('quote_id',q.id,'request_id',q.request_id,'revision',q.revision,'pdf_path',q.pdf_path)) returning * into m;
 else update public.mail_deliveries set status='processing',attempts=attempts+1,last_error=null where id=m.id;end if;
 return jsonb_build_object('id',m.id,'send',true);
end $function$;

REVOKE ALL ON FUNCTION "public"."commercial_quote_mail_claim"(uuid, uuid, uuid, boolean) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.commercial_quote_mail_finish (
  target_tenant uuid,
  delivery_id   uuid,
  message_id    text,
  actor         uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare m public.mail_deliveries;q public.quotes;
begin
 if coalesce(current_setting('request.jwt.claims',true)::jsonb->>'role','')<>'service_role' then raise exception 'Service required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('commercial:'||target_tenant::text,0));
 select * into m from public.mail_deliveries where tenant_id=target_tenant and id=delivery_id for update;
 if m.id is null or m.template not in ('quote','quote_reminder') then raise exception 'Verzendregistratie ontbreekt' using errcode='23514';end if;
 if m.status='sent' then return;end if;
 select * into q from public.quotes where tenant_id=target_tenant and id=(m.render_snapshot->>'quote_id')::uuid for update;
 if q.id is null then raise exception 'Offerteversie ontbreekt' using errcode='23514';end if;
 update public.mail_deliveries set status='sent',provider_message_id=message_id,sent_at=clock_timestamp(),locked_until=null,last_error=null where id=m.id;
 update public.quotes set sent_at=coalesce(sent_at,clock_timestamp()) where id=q.id;
 insert into public.commercial_events(tenant_id,request_id,quote_id,actor_id,kind,visibility,details) values(target_tenant,q.request_id,q.id,actor,case when m.template='quote_reminder' then 'quote.reminder_sent' else 'quote.email_sent' end,'customer',jsonb_build_object('delivery_id',m.id,'revision',q.revision,'recipient',m.recipient));
end $function$;

REVOKE ALL ON FUNCTION "public"."commercial_quote_mail_finish"(uuid, uuid, text, uuid) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.commercial_save_quote (
  target_tenant uuid,
  input         jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare q public.quotes;parent public.quotes;r public.requests;prices jsonb;v_id uuid:=(input->>'id')::uuid;ev bigint:=coalesce((input->>'version')::bigint,0);c uuid:=(input->>'customer_id')::uuid;o uuid:=nullif(input->>'object_id','')::uuid;contact uuid:=nullif(input->>'contact_id','')::uuid;own uuid:=coalesce(nullif(input->>'owner_id','')::uuid,auth.uid());req uuid:=nullif(input->>'request_id','')::uuid;v_terms jsonb:=coalesce(input->'terms','{}');
begin
 if octet_length(input::text)>250000 or v_id is null or ev<0 then raise exception 'Controleer de invoer' using errcode='23514';end if;
 if not private.commercial_member(target_tenant) then raise exception 'Geen commerciële toegang' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('commercial:'||target_tenant::text,0));
 select * into q from public.quotes where id=v_id and tenant_id=target_tenant for update;
 if found and ev=0 then return jsonb_build_object('id',q.id);end if;
 if (q.id is not null and q.version<>ev) or(q.id is null and ev<>0) then raise exception 'Deze offerte is intussen gewijzigd. Herlaad eerst.' using errcode='40001';end if;
 if q.id is not null and(q.status<>'draft' or q.archived_at is not null) then raise exception 'Maak een nieuwe conceptversie van deze offerte' using errcode='23514';end if;
 perform private.commercial_relations(target_tenant,c,o,contact,own);
 if req is not null then
  select * into r from public.requests where tenant_id=target_tenant and id=req;
  if not found or r.customer_id<>c or r.object_id is distinct from o or r.archived_at is not null then raise exception 'Controleer de aanvraag, klant en objectkoppeling' using errcode='23514';end if;
 end if;
 if length(trim(coalesce(input->>'subject',''))) not between 2 and 180 then raise exception 'Vul een onderwerp in' using errcode='23514';end if;
 prices:=private.commercial_prices(target_tenant,coalesce(input->'lines','[]'));
 -- Whitelist public terms; caller-controlled objects never enter the snapshot.
 v_terms:=jsonb_build_object('introduction',coalesce(v_terms->>'introduction',''),'scope',coalesce(v_terms->>'scope',''),'included',coalesce(v_terms->>'included',''),'excluded',coalesce(v_terms->>'excluded',''),'preparation',coalesce(v_terms->>'preparation',''),'conditions',coalesce(v_terms->>'conditions',''),'frequency',coalesce(v_terms->>'frequency',''),'starts_on',nullif(v_terms->>'starts_on',''),'ends_on',nullif(v_terms->>'ends_on',''),'pricing_method',coalesce(v_terms->>'pricing_method','fixed'),'discipline',coalesce(v_terms->>'discipline',r.discipline,''));
 if exists(select 1 from jsonb_each_text(v_terms) where length(value)>10000) or nullif(v_terms->>'ends_on','')::date<nullif(v_terms->>'starts_on','')::date then raise exception 'Controleer de looptijd en documentteksten' using errcode='23514';end if;
 if q.id is null then
  if req is not null and exists(select 1 from public.quotes where tenant_id=target_tenant and request_id=req and archived_at is null) then raise exception 'Deze aanvraag heeft al een offerte. Open die offerte of maak een nieuwe versie.' using errcode='23514';end if;
  insert into public.quotes(id,tenant_id,series_id,request_id,customer_id,object_id,contact_id,quote_number,subject,work_kind,price_basis,owner_id,followup_on,subtotal_cents,vat_cents,total_cents,snapshot,lines,terms,expires_at)
  values(v_id,target_tenant,v_id,req,c,o,contact,'OFF-'||to_char(now(),'YYYY')||'-'||upper(substr(v_id::text,1,8)),input->>'subject',coalesce(input->>'work_kind','once'),coalesce(input->>'price_basis','once'),own,nullif(input->>'followup_on','')::date,(prices->>'subtotal_cents')::bigint,(prices->>'vat_cents')::bigint,(prices->>'total_cents')::bigint,'{}',prices->'lines',v_terms,nullif(input->>'expires_at','')::timestamptz) returning * into q;
 else
  update public.quotes set customer_id=c,object_id=o,contact_id=contact,subject=input->>'subject',work_kind=input->>'work_kind',price_basis=input->>'price_basis',owner_id=own,followup_on=nullif(input->>'followup_on','')::date,subtotal_cents=(prices->>'subtotal_cents')::bigint,vat_cents=(prices->>'vat_cents')::bigint,total_cents=(prices->>'total_cents')::bigint,lines=prices->'lines',terms=v_terms,expires_at=nullif(input->>'expires_at','')::timestamptz,version=version+1 where id=v_id returning * into q;
 end if;
 insert into public.commercial_events(tenant_id,request_id,quote_id,actor_id,kind) values(target_tenant,q.request_id,q.id,auth.uid(),'quote.draft_saved');
 return jsonb_build_object('id',q.id);
end $function$;

REVOKE ALL ON FUNCTION "public"."commercial_save_quote"(uuid, jsonb) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.commercial_save_request (
  target_tenant uuid,
  input         jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare r public.requests;c uuid;contact uuid;o uuid;own uuid;rid uuid:=(input->>'id')::uuid;ev bigint:=coalesce((input->>'version')::bigint,0);result jsonb;
begin
 if octet_length(input::text)>250000 or rid is null or ev<0 then raise exception 'Controleer de invoer' using errcode='23514';end if;
 if not private.commercial_member(target_tenant) then raise exception 'Geen commerciële toegang' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(target_tenant::text||rid::text,0));
 select * into r from public.requests where id=rid and tenant_id=target_tenant for update;
 if found and ev=0 then return jsonb_build_object('id',r.id,'customer_id',r.customer_id,'contact_id',r.contact_id,'version',r.version);end if;
 if (r.id is not null and r.version<>ev) or (r.id is null and ev<>0) then raise exception 'Deze aanvraag is intussen gewijzigd. Herlaad eerst.' using errcode='40001';end if;
 if r.archived_at is not null then raise exception 'Deze aanvraag is gearchiveerd' using errcode='23514';end if;
 c:=nullif(input->>'customer_id','')::uuid;o:=nullif(input->>'object_id','')::uuid;contact:=nullif(input->>'contact_id','')::uuid;own:=coalesce(nullif(input->>'owner_id','')::uuid,auth.uid());
 if c is null and ev=0 and length(trim(input#>>'{prospect,name}'))>=2 then
  if length(input#>>'{prospect,name}')>180 or length(coalesce(input#>>'{prospect,phone}',''))>40 or (length(coalesce(input#>>'{prospect,email}',''))>0 and input#>>'{prospect,email}' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'Controleer de contactgegevens van de prospect' using errcode='23514';end if;
  c:=gen_random_uuid();
  if length(trim(coalesce(input#>>'{prospect,email}','')))=0 and length(trim(coalesce(input#>>'{prospect,phone}','')))=0 then raise exception 'Vul e-mail of telefoon in voor de nieuwe prospect' using errcode='23514';end if;
  insert into public.customers(id,tenant_id,customer_number,name,billing_email,phone,status) values(c,target_tenant,'KL-'||upper(substr(c::text,1,8)),trim(input#>>'{prospect,name}'),nullif(input#>>'{prospect,email}',''),nullif(input#>>'{prospect,phone}',''),'lead');
  if length(trim(coalesce(input#>>'{prospect,contact}','')))>=2 then
   insert into public.customer_contacts(tenant_id,customer_id,full_name,email,phone,is_primary) values(target_tenant,c,input#>>'{prospect,contact}',nullif(input#>>'{prospect,email}',''),nullif(input#>>'{prospect,phone}',''),true) returning id into contact;
  end if;
 end if;
 perform private.commercial_relations(target_tenant,c,o,contact,own);
 if length(trim(coalesce(input->>'subject',''))) not between 2 and 180 or length(trim(coalesce(input->>'description',r.description,''))) not between 3 and 10000 or length(trim(coalesce(input->>'discipline',''))) not between 2 and 100 or length(trim(coalesce(input->>'next_action',''))) not between 2 and 300 then raise exception 'Vul onderwerp, omschrijving, dienst en volgende actie in' using errcode='23514';end if;
 if r.id is null then
  insert into public.requests(id,tenant_id,request_number,customer_id,object_id,contact_id,subject,description,discipline,source,priority,work_kind,owner_id,next_action,followup_on,preferences,created_by)
  values(rid,target_tenant,'AAN-'||to_char(now(),'YYYY')||'-'||upper(substr(rid::text,1,8)),c,o,contact,input->>'subject',input->>'description',input->>'discipline',coalesce(input->>'source','backoffice'),coalesce(input->>'priority','normal'),coalesce(input->>'work_kind','once'),own,input->>'next_action',nullif(input->>'followup_on','')::date,coalesce(input->'preferences','{}'),auth.uid()) returning * into r;
 else
  if exists(select 1 from public.quotes where request_id=r.id and (customer_id<>c or object_id is distinct from o)) or exists(select 1 from public.work_orders where request_id=r.id and(customer_id<>c or object_id is distinct from o)) then raise exception 'Klant en object zijn al vastgelegd in een offerte of opdracht' using errcode='23514';end if;
  update public.requests set customer_id=c,object_id=o,contact_id=contact,subject=input->>'subject',discipline=input->>'discipline',priority=input->>'priority',work_kind=input->>'work_kind',owner_id=own,next_action=input->>'next_action',followup_on=nullif(input->>'followup_on','')::date,preferences=coalesce(input->'preferences','{}'),version=version+1 where id=rid returning * into r;
 end if;
 insert into public.commercial_events(tenant_id,request_id,actor_id,kind) values(target_tenant,rid,auth.uid(),case when ev=0 then 'request.received' else 'request.updated' end);
 return jsonb_build_object('id',r.id,'customer_id',r.customer_id,'contact_id',r.contact_id,'version',r.version);
end $function$;

REVOKE ALL ON FUNCTION "public"."commercial_save_request"(uuid, jsonb) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.create_commercial_period_invoice (
  target_tenant uuid,
  target_quote  uuid,
  period_start  date,
  request_id    uuid,
  confirmed     boolean
)
  RETURNS public.invoices
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare q public.quotes;inv public.invoices;p public.commercial_billing_periods;l jsonb;t public.work_order_tasks;w public.work_orders;v_end date;anchor date;months integer;tz text;
begin
 if not private.commercial_access(target_tenant) or not private.service_enabled(target_tenant,'finance') or not private.object_session_active() then raise exception 'Financiële toegang vereist' using errcode='42501';end if;
 if confirmed is distinct from true or request_id is null then raise exception 'Bevestig de volledige overeengekomen factuurperiode' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 select * into q from public.quotes where tenant_id=target_tenant and id=target_quote for update;
 if q.id is null or q.status<>'accepted' or q.price_basis not in ('week','month') or q.work_kind<>'recurring' then raise exception 'Selecteer een geaccepteerde periodieke prijsafspraak' using errcode='23514';end if;
 select * into p from public.commercial_billing_periods where tenant_id=target_tenant and quote_id=q.id and starts_on=period_start;
 if found then select * into inv from public.invoices where tenant_id=target_tenant and id=p.invoice_id;return inv;end if;
 anchor:=(q.terms->>'starts_on')::date;select timezone into tz from public.tenants where id=target_tenant;
 if period_start is null or period_start<anchor then raise exception 'Kies een periode vanaf de afgesproken startdatum' using errcode='23514';end if;
 if q.price_basis='week' then
  if (period_start-anchor)%7<>0 then raise exception 'De weekperioden beginnen op de afgesproken startdag' using errcode='23514';end if;v_end:=period_start+7;
 else
  months:=(extract(year from period_start)::integer-extract(year from anchor)::integer)*12+extract(month from period_start)::integer-extract(month from anchor)::integer;
  if period_start<>(anchor+make_interval(months=>months))::date then raise exception 'De maandperioden volgen de afgesproken startdatum' using errcode='23514';end if;v_end:=(anchor+make_interval(months=>months+1))::date;
 end if;
 if v_end>(clock_timestamp() at time zone tz)::date or v_end-1>nullif(q.terms->>'ends_on','')::date then raise exception 'Factureer alleen een volledig verstreken periode binnen de looptijd. Spreek voor een gedeeltelijke periode eerst een afzonderlijke prijs af.' using errcode='23514';end if;
 insert into public.invoices(tenant_id,customer_id,created_by,source_request_id) values(target_tenant,q.customer_id,auth.uid(),request_id) returning * into inv;
 insert into public.commercial_billing_periods(tenant_id,quote_id,invoice_id,starts_on,ends_before,confirmed_by) values(target_tenant,q.id,inv.id,period_start,v_end,auth.uid()) returning * into p;
 for l in select value from jsonb_array_elements(q.lines) loop
  select task.* into t from public.work_order_tasks task join public.work_orders wo on wo.tenant_id=task.tenant_id and wo.id=task.work_order_id
  where task.tenant_id=target_tenant and wo.quote_id=q.id and wo.status='invoice_ready' and task.completed_at is not null and coalesce(task.executed_quantity,task.quantity)>=(l->>'quantity')::numeric and task.commercial_snapshot#>>'{line,id}'=l->>'id' and (wo.projected_start_at at time zone tz)::date>=period_start and (wo.projected_start_at at time zone tz)::date<v_end
  order by wo.projected_start_at,task.id limit 1 for update of task;
  if t.id is null then raise exception 'Voor iedere perioderegel is gecontroleerde uitvoering in deze periode nodig. Rond eerst de rapportcontrole af.' using errcode='23514';end if;
  insert into public.invoice_lines(tenant_id,invoice_id,work_order_id,work_order_task_id,commercial_period_id,description,quantity,unit,unit_price_cents,subtotal_cents,vat_basis_points,vat_cents,total_cents)
  values(target_tenant,inv.id,t.work_order_id,t.id,p.id,l->>'description',(l->>'quantity')::numeric,t.unit,t.unit_price_cents,0,t.vat_basis_points,0,0);
 end loop;
 inv:=public.finalize_invoice(inv.id);
 insert into public.commercial_events(tenant_id,request_id,quote_id,actor_id,kind,details) values(target_tenant,q.request_id,q.id,auth.uid(),'invoice.period_created',jsonb_build_object('invoice_id',inv.id,'starts_on',period_start,'ends_before',v_end));
 return inv;
end $function$;

REVOKE ALL ON FUNCTION "public"."create_commercial_period_invoice"(uuid, uuid, date, uuid, boolean) FROM PUBLIC, "anon", "service_role";

ALTER TABLE "private"."commercial_commands"
  ADD CONSTRAINT "commercial_commands_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);

ALTER TABLE "private"."commercial_intake_limits"
  ADD CONSTRAINT "commercial_intake_limits_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);

ALTER TABLE "public"."commercial_attachments"
  ADD CONSTRAINT "commercial_attachments_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE "public"."commercial_attachments"
  ADD CONSTRAINT "commercial_attachments_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);

ALTER TABLE "public"."commercial_attachments"
  ADD CONSTRAINT "commercial_attachments_tenant_id_quote_id_fkey" FOREIGN KEY (tenant_id, quote_id) REFERENCES public.quotes(tenant_id, id);

ALTER TABLE "public"."commercial_attachments"
  ADD CONSTRAINT "commercial_attachments_tenant_id_request_id_fkey" FOREIGN KEY (tenant_id, request_id) REFERENCES public.requests(tenant_id, id);

ALTER TABLE "public"."commercial_billing_periods"
  ADD CONSTRAINT "commercial_billing_periods_confirmed_by_fkey" FOREIGN KEY (confirmed_by) REFERENCES auth.users(id);

ALTER TABLE "public"."commercial_billing_periods"
  ADD CONSTRAINT "commercial_billing_periods_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);

ALTER TABLE "public"."commercial_billing_periods"
  ADD CONSTRAINT "commercial_billing_periods_tenant_id_invoice_id_fkey" FOREIGN KEY (tenant_id, invoice_id) REFERENCES public.invoices(tenant_id, id);

ALTER TABLE "public"."commercial_billing_periods"
  ADD CONSTRAINT "commercial_billing_periods_tenant_id_quote_id_fkey" FOREIGN KEY (tenant_id, quote_id) REFERENCES public.quotes(tenant_id, id);

ALTER TABLE "public"."commercial_events"
  ADD CONSTRAINT "commercial_events_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id);

ALTER TABLE "public"."commercial_events"
  ADD CONSTRAINT "commercial_events_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);

ALTER TABLE "public"."commercial_events"
  ADD CONSTRAINT "commercial_events_tenant_id_quote_id_fkey" FOREIGN KEY (tenant_id, quote_id) REFERENCES public.quotes(tenant_id, id);

ALTER TABLE "public"."commercial_events"
  ADD CONSTRAINT "commercial_events_tenant_id_request_id_fkey" FOREIGN KEY (tenant_id, request_id) REFERENCES public.requests(tenant_id, id);

ALTER TABLE "public"."external_action_tokens"
  ADD CONSTRAINT "external_action_tokens_booking_kind_check" CHECK ((booking_kind = ANY (ARRAY['inspection'::text, 'execution'::text])));

ALTER TABLE "public"."external_action_tokens"
  ADD CONSTRAINT "external_action_tokens_work_order_id_fkey" FOREIGN KEY (work_order_id) REFERENCES public.work_orders(id);

ALTER TABLE "public"."invoice_lines"
  ADD CONSTRAINT "invoice_lines_commercial_period_fk" FOREIGN KEY (tenant_id, commercial_period_id) REFERENCES public.commercial_billing_periods(tenant_id, id);

ALTER TABLE "public"."object_visit_requests"
  ADD CONSTRAINT "object_visit_requests_owner_user_id_fkey" FOREIGN KEY (owner_user_id) REFERENCES auth.users(id);

ALTER TABLE "public"."quotes"
  ADD CONSTRAINT "quotes_contact_fk" FOREIGN KEY (tenant_id, contact_id) REFERENCES public.customer_contacts(tenant_id, id);

ALTER TABLE "public"."quotes"
  ADD CONSTRAINT "quotes_lines_check" CHECK ((jsonb_typeof(lines) = 'array'::text));

ALTER TABLE "public"."quotes"
  ADD CONSTRAINT "quotes_operation_fk" FOREIGN KEY (tenant_id, operation_id) REFERENCES public.work_orders(tenant_id, id);

ALTER TABLE "public"."quotes"
  ADD CONSTRAINT "quotes_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id);

ALTER TABLE "public"."quotes"
  ADD CONSTRAINT "quotes_previous_id_fkey" FOREIGN KEY (previous_id) REFERENCES public.quotes(id);

ALTER TABLE "public"."quotes"
  ADD CONSTRAINT "quotes_price_basis_check" CHECK ((price_basis = ANY (ARRAY['once'::text, 'visit'::text, 'week'::text, 'month'::text, 'hour'::text])));

ALTER TABLE "public"."quotes"
  ADD CONSTRAINT "quotes_visit_request_id_fkey" FOREIGN KEY (visit_request_id) REFERENCES public.object_visit_requests(id);

ALTER TABLE "public"."quotes"
  ADD CONSTRAINT "quotes_work_kind_check" CHECK ((work_kind = ANY (ARRAY['once'::text, 'recurring'::text, 'extra'::text])));

ALTER TABLE "public"."requests"
  ADD CONSTRAINT "requests_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id);

ALTER TABLE "public"."requests"
  ADD CONSTRAINT "requests_source_check" CHECK ((source = ANY (ARRAY['backoffice'::text, 'email_link'::text, 'phone'::text, 'email'::text, 'website'::text, 'portal'::text])));

ALTER TABLE "public"."requests"
  ADD CONSTRAINT "requests_status_check"
    CHECK
    ((status = ANY (ARRAY['new'::text, 'review'::text, 'waiting_info'::text, 'processed'::text, 'rejected'::text, 'withdrawn'::text, 'quote_draft'::text,
    'awaiting_acceptance'::text, 'accepted'::text, 'planned'::text, 'closed'::text])));

ALTER TABLE "public"."requests"
  ADD CONSTRAINT "requests_work_kind_check" CHECK ((work_kind = ANY (ARRAY['once'::text, 'recurring'::text, 'extra'::text])));

ALTER TABLE "public"."work_orders"
  ADD CONSTRAINT "work_orders_visit_kind_check" CHECK ((visit_kind = ANY (ARRAY['execution'::text, 'inspection'::text])));

CREATE INDEX commercial_command_actor_idx ON private.commercial_commands USING btree (actor_id);

CREATE INDEX commercial_attachment_creator_idx ON public.commercial_attachments USING btree (created_by)
  WHERE (created_by IS NOT NULL);

CREATE INDEX commercial_attachments_quote ON public.commercial_attachments USING btree (tenant_id, quote_id);

CREATE INDEX commercial_attachments_request ON public.commercial_attachments USING btree (tenant_id, request_id);

CREATE INDEX commercial_billing_actor_idx ON public.commercial_billing_periods USING btree (confirmed_by);

CREATE INDEX commercial_events_actor_idx ON public.commercial_events USING btree (actor_id)
  WHERE (actor_id IS NOT NULL);

CREATE INDEX commercial_events_quote ON public.commercial_events USING btree (tenant_id, quote_id, created_at DESC);

CREATE INDEX commercial_events_request ON public.commercial_events USING btree (tenant_id, request_id, created_at DESC);

CREATE INDEX invoice_commercial_period_idx ON public.invoice_lines USING btree (tenant_id, commercial_period_id)
  WHERE (commercial_period_id IS NOT NULL);

CREATE UNIQUE INDEX invoice_commercial_period_line_idx ON public.invoice_lines USING btree (tenant_id, commercial_period_id, ((source_snapshot #>> '{agreement,line,id}'::text[])))
  WHERE (commercial_period_id IS NOT NULL);

CREATE INDEX quote_owner_idx ON public.quotes USING btree (owner_id)
  WHERE (owner_id IS NOT NULL);

CREATE INDEX quote_visit_request_idx ON public.quotes USING btree (tenant_id, visit_request_id)
  WHERE (visit_request_id IS NOT NULL);

CREATE INDEX quotes_followup ON public.quotes USING btree (tenant_id, followup_on, expires_at);

CREATE INDEX quotes_operation_idx ON public.quotes USING btree (tenant_id, operation_id)
  WHERE (operation_id IS NOT NULL);

CREATE INDEX quotes_request_fk ON public.quotes USING btree (tenant_id, request_id);

CREATE INDEX quotes_series_latest ON public.quotes USING btree (tenant_id, series_id, revision DESC);

CREATE UNIQUE INDEX quotes_series_revision_unique ON public.quotes USING btree (tenant_id, series_id, revision);

CREATE INDEX request_owner_idx ON public.requests USING btree (owner_id)
  WHERE (owner_id IS NOT NULL);

CREATE INDEX requests_followup ON public.requests USING btree (tenant_id, followup_on, updated_at DESC);

CREATE INDEX visit_request_owner_idx ON public.object_visit_requests USING btree (owner_user_id)
  WHERE (owner_user_id IS NOT NULL);

CREATE UNIQUE INDEX work_order_quote_line_unique ON public.work_order_tasks USING btree (tenant_id, work_order_id, ((commercial_snapshot #>> '{line,id}'::text[])))
  WHERE (commercial_snapshot ? 'quote_id'::text);

CREATE TRIGGER commercial_attachment_guard
  BEFORE INSERT OR DELETE OR UPDATE ON public.commercial_attachments
  FOR EACH ROW
  EXECUTE FUNCTION private.commercial_attachment_guard();

CREATE TRIGGER commercial_event_mail
  BEFORE INSERT ON public.commercial_events
  FOR EACH ROW
  EXECUTE FUNCTION private.commercial_event_mail();

CREATE TRIGGER commercial_quote_guard
  BEFORE INSERT OR UPDATE ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION private.commercial_guard();

CREATE TRIGGER commercial_request_guard
  BEFORE INSERT OR UPDATE ON public.requests
  FOR EACH ROW
  EXECUTE FUNCTION private.commercial_guard();

CREATE TRIGGER a_quote_scope
  BEFORE INSERT OR UPDATE ON public.work_order_tasks
  FOR EACH ROW
  EXECUTE FUNCTION private.quote_task_guard();

CREATE POLICY "commercial_attachments_read" ON "public"."commercial_attachments"
  FOR SELECT
  TO "authenticated"
  USING (private.commercial_member(tenant_id));

CREATE POLICY "commercial_billing_read" ON "public"."commercial_billing_periods"
  FOR SELECT
  TO "authenticated"
  USING (private.commercial_access(tenant_id));

CREATE POLICY "commercial_events_read" ON "public"."commercial_events"
  FOR SELECT
  TO "authenticated"
  USING (private.commercial_member(tenant_id));

CREATE POLICY "quotes_read" ON "public"."quotes"
  FOR SELECT
  TO "authenticated"
  USING (private.commercial_member(tenant_id));

CREATE POLICY "requests_read" ON "public"."requests"
  FOR SELECT
  TO "authenticated"
  USING (private.commercial_member(tenant_id));

REVOKE ALL ON FUNCTION "private"."commercial_attachment_guard"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."commercial_attachment_guard"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."commercial_customer_scope"(uuid, uuid, uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."commercial_customer_scope"(uuid, uuid, uuid, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."commercial_decide"(uuid, uuid, jsonb, uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."commercial_decide"(uuid, uuid, jsonb, uuid, text) TO "postgres";

REVOKE ALL ON FUNCTION "private"."commercial_event_mail"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."commercial_event_mail"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."commercial_guard"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."commercial_guard"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."commercial_intake"(uuid, uuid, jsonb, text, uuid, uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."commercial_intake"(uuid, uuid, jsonb, text, uuid, uuid, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."commercial_member"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."commercial_member"(uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."commercial_prices"(uuid, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."commercial_prices"(uuid, jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "private"."commercial_relations"(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."commercial_relations"(uuid, uuid, uuid, uuid, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."commercial_rows"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."commercial_rows"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."commercial_snapshot"(public.quotes) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."commercial_snapshot"(public.quotes) TO "postgres";

REVOKE ALL ON FUNCTION "private"."quote_task_guard"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."quote_task_guard"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."commercial_booking"(uuid, uuid, jsonb) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."commercial_command"(uuid, uuid, text, jsonb) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."commercial_customer_action"(uuid, uuid, text, jsonb) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."commercial_customer_file"(uuid, uuid, text) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."commercial_customer_list"(uuid, integer) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."commercial_detail"(uuid, uuid, text) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."commercial_external_decision"(text, uuid, jsonb) TO "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."commercial_list"(uuid, jsonb) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."commercial_mail_claim"(uuid, uuid, text) TO "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."commercial_next_visit"(uuid, uuid, date, uuid) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."commercial_options"(uuid, text, uuid) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."commercial_order_context"(uuid, uuid) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."commercial_public_intake"(uuid, uuid, jsonb, text) TO "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."commercial_quote_mail_claim"(uuid, uuid, uuid, boolean) TO "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."commercial_quote_mail_finish"(uuid, uuid, text, uuid) TO "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."commercial_save_quote"(uuid, jsonb) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."commercial_save_request"(uuid, jsonb) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."create_commercial_period_invoice"(uuid, uuid, date, uuid, boolean) TO "authenticated", "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."commercial_commands" TO "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."commercial_intake_limits" TO "postgres";

REVOKE ALL ON TABLE "public"."commercial_attachments" FROM "authenticated";

GRANT SELECT ON TABLE "public"."commercial_attachments" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."commercial_attachments" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."commercial_billing_periods" FROM "authenticated";

GRANT SELECT ON TABLE "public"."commercial_billing_periods" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."commercial_billing_periods" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."commercial_events" FROM "authenticated";

GRANT SELECT ON TABLE "public"."commercial_events" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."commercial_events" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."quotes" FROM "authenticated";

GRANT SELECT ON TABLE "public"."quotes" TO "authenticated";

REVOKE ALL ON TABLE "public"."requests" FROM "authenticated";

GRANT SELECT ON TABLE "public"."requests" TO "authenticated";

-- Storage bucket configuration is data and is not emitted by schema diff.
-- Private, server-authorized streaming only; no public/anonymous object policy.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('commercial-documents','commercial-documents',false,10485760,ARRAY['application/pdf','image/png','image/jpeg','image/webp'])
ON CONFLICT(id) DO NOTHING;
