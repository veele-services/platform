SET local check_function_bodies = off;

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
declare receipt private.commercial_commands;q public.quotes;n public.quotes;r public.requests;w public.work_orders;l jsonb;result jsonb:='{}'::jsonb;v_id uuid:=nullif(input->>'id','')::uuid;ev bigint:=nullif(input->>'version','')::bigint;state text;kind text;reason text:=trim(coalesce(input->>'reason',''));v_new uuid;recipient text;v_snapshot jsonb;
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
   if r.status<>'new' or exists(select 1 from public.quotes where request_id=r.id) or exists(select 1 from public.work_orders where request_id=r.id) or exists(select 1 from public.external_action_tokens where subject_id=r.id) or exists(select 1 from public.commercial_attachments where request_id=r.id) or exists(select 1 from public.mail_deliveries m where m.tenant_id=target_tenant and m.render_snapshot->>'request_id'=r.id::text) or exists(select 1 from public.commercial_events ev where ev.request_id=r.id and ev.kind not in ('request.received','request.updated')) then raise exception 'Deze aanvraag heeft afhankelijke registraties. Archiveer haar.' using errcode='23514';end if;
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
 perform pg_advisory_xact_lock(hashtextextended('commercial:'||target_tenant::text,0));
 select * into e from public.commercial_events where tenant_id=target_tenant and id=event_id for update;
 if e.id is null or not exists(select 1 from jsonb_array_elements(e.mail_snapshot->'recipients') x where x->>'email'=recipient_input) then raise exception 'Ontvanger niet geregistreerd' using errcode='42501';end if;
 k:='commercial-event:'||e.id::text||':'||encode(extensions.digest(recipient_input,'sha256'),'hex');
 select * into m from public.mail_deliveries where tenant_id=target_tenant and idempotency_key=k for update;
 if m.id is not null and m.status in ('sent','processing') then return jsonb_build_object('id',m.id,'send',false,'status',m.status);end if;
 if m.id is null then insert into public.mail_deliveries(tenant_id,recipient,template,idempotency_key,status,attempts,render_snapshot,branding_snapshot) values(target_tenant,recipient_input,'commercial_event',k,'processing',1,jsonb_build_object('event_id',e.id,'quote_id',e.quote_id,'request_id',e.request_id,'subject',e.mail_snapshot->>'subject','body',e.mail_snapshot->>'body'),e.mail_snapshot->'brand') returning * into m;
 else update public.mail_deliveries set status='processing',attempts=attempts+1,last_error=null where id=m.id;end if;
 return jsonb_build_object('id',m.id,'send',true,'key',k);
end $function$;
