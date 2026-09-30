SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.commercial_prices (
  t     uuid,
  input jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare l jsonb;out_lines jsonb:='[]'::jsonb;qty numeric;rate bigint;discount integer;vat integer;net bigint;gross bigint;sub bigint;tax bigint;taxes jsonb;tr public.task_revisions;tc public.task_catalog;dur integer;
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
 'status',case when q.status in ('awaiting_acceptance','sent') and q.expires_at<=now() then 'expired' when q.status='sent' then 'awaiting_acceptance' else q.status::text end,'priority',coalesce(r.priority,'normal'),'owner_id',q.owner_id,'owner',coalesce(p.full_name,u.email),'next_action',case when q.status in ('awaiting_acceptance','sent') and q.expires_at<=now() then 'Geldigheid bespreken' else q.next_action end,'followup_on',q.followup_on,'created_at',q.created_at,'updated_at',greatest(q.updated_at,(select max(created_at) from public.commercial_events where tenant_id=t and quote_id=q.id)),'archived_at',q.archived_at,'version',q.version,
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
 return p||jsonb_build_object('schema',1,'timezone',t.timezone,'quote_number',q.quote_number,'revision',q.revision,'subject',q.subject,'work_kind',q.work_kind,'price_basis',q.price_basis,'terms',q.terms,'expires_at',q.expires_at,
 'customer',jsonb_build_object('id',c.id,'name',c.name,'number',c.customer_number,'billing_address',c.billing_address),
 'contact',jsonb_build_object('name',coalesce(ct.full_name,c.name),'email',coalesce(ct.email,c.billing_email)),
 'object',jsonb_build_object('id',o.id,'name',o.name,'number',o.object_number,'address',o.address),
 'brand',jsonb_build_object('name',t.name,'slug',t.slug,'primary',b.primary_color,'accent',b.accent_color,'logo_source',b.logo_path,'sender_name',b.sender_name,'sender_email',b.sender_email,'footer',b.pdf_footer,'white_label',s.white_label_enabled,'business',(select coalesce(jsonb_object_agg(key,value),'{}') from jsonb_each(coalesce(s.settings->'business','{}')) where key in ('legal_name','address','postal_code','city','country','kvk','vat_number','iban','website','phone') and jsonb_typeof(value)='string')),
 'attachments',docs,'offered_at',clock_timestamp());
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
   if r.status<>'new' or exists(select 1 from public.quotes where request_id=r.id) or exists(select 1 from public.work_orders where request_id=r.id) or exists(select 1 from public.external_action_tokens where subject_id=r.id) or exists(select 1 from public.commercial_attachments where request_id=r.id) or exists(select 1 from public.commercial_events ev where ev.request_id=r.id and ev.kind not in ('request.received','request.updated')) then raise exception 'Deze aanvraag heeft afhankelijke registraties. Archiveer haar.' using errcode='23514';end if;
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

CREATE OR REPLACE FUNCTION public.commercial_detail (
  target_tenant uuid,
  target_id     uuid,
  source_kind   text
)
  RETURNS jsonb
  LANGUAGE plpgsql
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
 select(now() at time zone timezone)::date into today from public.tenants where id=target_tenant;
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
  (x->>'tab'='quotes' and x->>'status'='awaiting_acceptance' and (x->>'expires_at')::timestamptz>now() and ((x->>'expires_at')::timestamptz at time zone(select timezone from public.tenants where id=target_tenant))::date<=today+3) expiring,
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

CREATE OR REPLACE FUNCTION public.commercial_save_quote (
  target_tenant uuid,
  input         jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare q public.quotes;r public.requests;prices jsonb;v_id uuid:=(input->>'id')::uuid;ev bigint:=coalesce((input->>'version')::bigint,0);c uuid:=(input->>'customer_id')::uuid;o uuid:=nullif(input->>'object_id','')::uuid;contact uuid:=nullif(input->>'contact_id','')::uuid;own uuid:=coalesce(nullif(input->>'owner_id','')::uuid,auth.uid());req uuid:=nullif(input->>'request_id','')::uuid;v_terms jsonb:=coalesce(input->'terms','{}');
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
declare r public.requests;c uuid;contact uuid;o uuid;own uuid;rid uuid:=(input->>'id')::uuid;ev bigint:=coalesce((input->>'version')::bigint,0);
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
declare q public.quotes;inv public.invoices;p public.commercial_billing_periods;l jsonb;t public.work_order_tasks;v_end date;anchor date;months integer;tz text;
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
