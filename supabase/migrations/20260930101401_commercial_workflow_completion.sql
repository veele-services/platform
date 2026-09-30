SET local check_function_bodies = off;

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
 insert into public.commercial_events(tenant_id,request_id,quote_id,actor_id,kind,body,visibility,details) values(t,q.request_id,q.id,actor,'quote.'||decision,evidence,case when channel in ('secure_link','portal') then 'customer' else 'internal' end,jsonb_build_object('name',who,'channel',channel,'received_at',received,'revision',q.revision));
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
 if new.kind<>'request.information_requested' and owner_email is not null and owner_email is distinct from recipient then recipients:=recipients||jsonb_build_array(jsonb_build_object('email',owner_email,'audience','owner','path','/app/aanvragen?record='||coalesce(q.id,r.id)::text||'&recordKind='||case when q.id is null then 'request' else 'quote' end));end if;
 new.mail_snapshot:=jsonb_build_object('subject',subject||' · '||t.name,'body',body,'recipients',recipients,'brand',jsonb_build_object('company',t.name,'slug',t.slug,'primary',b.primary_color,'accent',b.accent_color,'logo_path',b.logo_path));
 return new;
end $function$;

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
 if sub+tax>9007199254740991 then raise exception 'Het totaalbedrag is te groot' using errcode='23514';end if;
 return jsonb_build_object('lines',out_lines,'subtotal_cents',sub,'vat_cents',tax,'total_cents',sub+tax,'taxes',taxes);
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
 'status',case r.status when 'closed' then 'processed' when 'quote_draft' then 'review' when 'awaiting_acceptance' then 'processed' when 'accepted' then 'processed' when 'planned' then 'processed' else r.status end,'priority',r.priority,'owner_id',r.owner_id,'owner',coalesce(p.full_name,u.email),'next_action',r.next_action,'followup_on',r.followup_on,'created_at',r.created_at,'updated_at',greatest(r.updated_at,(select max(created_at) from public.commercial_events where tenant_id=t and request_id=r.id)),'archived_at',r.archived_at,'version',r.version,
 'operation_id',(select w.id from public.work_orders w where w.tenant_id=t and w.request_id=r.id and w.status<>'cancelled' order by w.created_at desc limit 1))
 from public.requests r left join public.customers c on c.id=r.customer_id and c.tenant_id=t left join public.objects o on o.id=r.object_id and o.tenant_id=t left join auth.users u on u.id=r.owner_id left join public.personnel p on p.tenant_id=t and p.user_id=r.owner_id where r.tenant_id=t
 union all
 select jsonb_build_object('id',q.id,'source_kind','quote','tab','quotes','number',q.quote_number,'subject',coalesce(nullif(q.subject,''),q.snapshot->>'description','Prijsopgave'),'customer_id',q.customer_id,'customer',c.name,'prospect',c.status='lead','object_id',q.object_id,'object',o.name,'address',o.address,'work_kind',q.work_kind,'source',coalesce(r.source,'backoffice'),
 'status',case when q.status in ('awaiting_acceptance','sent') and q.expires_at<=clock_timestamp() then 'expired' when q.status='sent' then 'awaiting_acceptance' else q.status::text end,'priority',coalesce(r.priority,'normal'),'owner_id',q.owner_id,'owner',coalesce(p.full_name,u.email),'next_action',case when q.status in ('awaiting_acceptance','sent') and q.expires_at<=clock_timestamp() then 'Geldigheid bespreken' else q.next_action end,'followup_on',q.followup_on,'created_at',q.created_at,'updated_at',greatest(q.updated_at,(select max(created_at) from public.commercial_events where tenant_id=t and quote_id=q.id)),'archived_at',q.archived_at,'version',q.version,
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
 if coalesce((input->>'capacity')::integer,1) not between 1 and 20 then raise exception 'Kies een capaciteit tussen 1 en 20' using errcode='23514';end if;
 if v_start is null or v_end is null or v_start<=clock_timestamp() or v_end<=v_start or v_end-v_start>interval '12 hours' or v_hash!~'^[a-f0-9]{64}$' then raise exception 'Controleer het toekomstige tijdvak' using errcode='23514';end if;
 insert into public.appointment_slots(tenant_id,starts_at,ends_at,capacity) values(target_tenant,v_start,v_end,coalesce((input->>'capacity')::integer,1)) returning * into sl;
 insert into public.external_action_tokens(tenant_id,purpose,subject_id,work_order_id,booking_kind,token_hash,expires_at,recipient) values(target_tenant,'booking',coalesce(w.request_id,w.id),w.id,w.visit_kind,v_hash,least(v_start,clock_timestamp()+interval '14 days'),(select billing_email from public.customers where id=w.customer_id and tenant_id=target_tenant)) returning * into tk;
 insert into public.booking_options(tenant_id,token_id,slot_id) values(target_tenant,tk.id,sl.id);
 result:=jsonb_build_object('id',tk.id,'work_order_id',w.id);
 insert into private.commercial_commands(tenant_id,id,actor_id,command,payload,result) values(target_tenant,command_id,auth.uid(),'booking',input,result);
 insert into public.commercial_events(tenant_id,request_id,quote_id,actor_id,kind,details) values(target_tenant,w.request_id,w.quote_id,auth.uid(),'booking.link_created',jsonb_build_object('work_order_id',w.id,'kind',w.visit_kind,'slot_id',sl.id));
 return result;
end $function$;

CREATE OR REPLACE FUNCTION public.commercial_cancel_booking (
  target_tenant uuid,
  target_order  uuid,
  command_id    uuid,
  reason        text
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare w public.work_orders; receipt private.commercial_commands;
begin
 if not private.commercial_member(target_tenant) then raise exception 'Geen commerciële toegang' using errcode='42501';end if;
 if length(trim(coalesce(reason,''))) not between 3 and 2000 or command_id is null then raise exception 'Vul de reden van annuleren in' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 select * into receipt from private.commercial_commands where tenant_id=target_tenant and id=command_id;
 if found then
  if receipt.actor_id<>auth.uid() or receipt.command<>'booking_cancel' or receipt.payload<>jsonb_build_object('order',target_order,'reason',reason) then raise exception 'Deze actiereferentie is al gebruikt' using errcode='23514';end if;return true;
 end if;
 select * into w from public.work_orders where tenant_id=target_tenant and id=target_order for update;
 if w.id is null then raise exception 'Afspraak niet beschikbaar' using errcode='42501';end if;
 if w.status<>'planned' or w.projected_start_at is not null or exists(select 1 from public.work_order_assignments where tenant_id=target_tenant and work_order_id=w.id and status<>'cancelled') then raise exception 'Deze afspraak heeft al personeelsplanning. Pas die eerst aan via het planbord.' using errcode='23514';end if;
 -- Revoke every link for this unplanned visit before releasing its reservation.
 update public.external_action_tokens set revoked_at=clock_timestamp() where tenant_id=target_tenant and purpose='booking' and work_order_id=w.id and revoked_at is null;
 if w.appointment_slot_id is not null then
  update public.appointment_slots set booked_count=greatest(0,booked_count-1),status=case when status='full' then 'available' else status end where tenant_id=target_tenant and id=w.appointment_slot_id;
  update public.requests set preferred_slot_id=null,version=version+1 where tenant_id=target_tenant and id=w.request_id and preferred_slot_id=w.appointment_slot_id;
  update public.work_orders set appointment_slot_id=null,customer_window_kind='arrival',requested_date=null,version=version+1 where id=w.id;
 end if;
 insert into public.commercial_events(tenant_id,request_id,quote_id,actor_id,kind,body,details) values(target_tenant,w.request_id,w.quote_id,auth.uid(),'booking.cancelled',reason,jsonb_build_object('work_order_id',w.id));
 insert into private.commercial_commands(tenant_id,id,actor_id,command,payload,result) values(target_tenant,command_id,auth.uid(),'booking_cancel',jsonb_build_object('order',target_order,'reason',reason),'{"ok":true}');
 return true;
end $function$;

REVOKE ALL ON FUNCTION "public"."commercial_cancel_booking"(uuid, uuid, uuid, text) FROM PUBLIC, "anon", "service_role";

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
    if q.snapshot->>'schema' is distinct from '1' or jsonb_array_length(q.lines)=0 then raise exception 'Deze historische prijsopgave bevat geen vastgelegde uitvoeringsregels. Maak een gecontroleerde revisie of een directe opdracht op basis van het bewaarde akkoord.' using errcode='23514';end if;
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
 'operations',(select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'number',w.work_order_number,'kind',w.visit_kind,'start',w.projected_start_at,'status',w.status,'bookable',w.appointment_slot_id is null,'booking_active',exists(select 1 from public.external_action_tokens where tenant_id=target_tenant and work_order_id=w.id and purpose='booking' and revoked_at is null),'terms',w.commercial_terms)),'[]') from public.work_orders w where w.tenant_id=target_tenant and(w.request_id=v_request or w.quote_id=q.id)));
end $function$;

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
  if r.id is not null and r.customer_id=c and r.object_id is null and o is not null and not exists(select 1 from public.quotes where request_id=r.id and status<>'draft') and not exists(select 1 from public.work_orders where request_id=r.id) then
   update public.requests set object_id=o,version=version+1 where id=r.id returning * into r;
   update public.quotes set object_id=o,version=version+1 where tenant_id=target_tenant and request_id=r.id and status='draft' and id<>v_id;
  end if;
  if r.id is null or r.customer_id<>c or r.object_id is distinct from o or r.archived_at is not null then raise exception 'Controleer de aanvraag, klant en objectkoppeling' using errcode='23514';end if;
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
  if exists(select 1 from public.quotes where request_id=r.id and (customer_id<>c or object_id is distinct from o) and not(status='draft' and customer_id=c and object_id is null and o is not null)) or exists(select 1 from public.work_orders where request_id=r.id and(customer_id<>c or object_id is distinct from o)) then raise exception 'Klant en object zijn al vastgelegd in een offerte of opdracht' using errcode='23514';end if;
  update public.requests set customer_id=c,object_id=o,contact_id=contact,subject=input->>'subject',discipline=input->>'discipline',priority=input->>'priority',work_kind=input->>'work_kind',owner_id=own,next_action=input->>'next_action',followup_on=nullif(input->>'followup_on','')::date,preferences=coalesce(input->'preferences','{}'),version=version+1 where id=rid returning * into r;
  update public.quotes set object_id=o,version=version+1 where tenant_id=target_tenant and request_id=r.id and status='draft' and object_id is null and o is not null;
 end if;
 insert into public.commercial_events(tenant_id,request_id,actor_id,kind) values(target_tenant,rid,auth.uid(),case when ev=0 then 'request.received' else 'request.updated' end);
 return jsonb_build_object('id',r.id,'customer_id',r.customer_id,'contact_id',r.contact_id,'version',r.version);
end $function$;

GRANT EXECUTE ON FUNCTION "public"."commercial_cancel_booking"(uuid, uuid, uuid, text) TO "authenticated", "postgres";
