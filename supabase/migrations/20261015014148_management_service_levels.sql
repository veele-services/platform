-- Service definitions are versioned. Tickets retain one canonical clock:
-- public.tickets + the existing ticket_business_due / ticket_wait_deadlines.
insert into public.permission_catalog(key,domain,name,description,module,action,scopes,dependencies)
select 'backoffice.sla.'||a.code,'tenant','Serviceafspraken '||a.label,'Serviceafspraken, bronmetingen en de bestaande ticketklok.','sla',a.code,array['tenant'],array['backoffice.access','backoffice.followup.read','backoffice.functions.cockpit_followup']||case when a.code='write' then array['backoffice.sla.read','backoffice.reports.read'] else '{}'::text[] end
from(values('read','bekijken'),('write','beheren'))a(code,label) on conflict(key) do nothing;
insert into public.permission_catalog(key,domain,name,description,module,action,scopes,dependencies)
select 'backoffice.functions.'||x.code,'tenant',x.label,x.description,'sla',x.action,array['tenant'],array['backoffice.access','backoffice.sla.read']||case when x.code='cockpit_sla_save' then array['backoffice.sla.write','backoffice.functions.cockpit_sla_query'] when x.code='cockpit_sla_ticket_event' then array['backoffice.functions.cockpit_sla_query'] else '{}'::text[] end
from(values('cockpit_sla_query','SLA-metingen lezen','Geautoriseerde bronmetingen en vastgelegde normen.','read'),('cockpit_sla_save','Serviceafspraken vastleggen','Nieuwe normversies bij een toegankelijk contract en object.','write'),('cockpit_sla_ticket_event','Ticketgebeurtenissen vanuit SLA','De bestaande ticketrechten bepalen wie mag reageren, pauzeren, hervatten of oplossen.','write'))x(code,label,description,action) on conflict(key) do nothing;

insert into private.management_role_permissions(tenant_id,role_id,capability)
select r.tenant_id,r.id,c.key from private.management_roles r join public.permission_catalog c on c.module='sla'
where r.code='owner' or(r.code in('management','planning') and(c.action='read' or c.key='backoffice.functions.cockpit_sla_ticket_event')) or(r.code='management' and c.action='write' and exists(select 1 from private.management_role_permissions p where p.role_id=r.id and p.capability='backoffice.reports.write')) on conflict do nothing;

alter table public.ticket_categories add constraint cockpit_ticket_category_tenant_identity unique(tenant_id,id);
create table private.cockpit_services(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),
 object_id uuid not null,customer_id uuid not null,kind text not null check(kind in('response','resolution','visits','inspection','report')),category_id uuid,
 check((kind in('response','resolution') and category_id is not null) or(kind not in('response','resolution') and category_id is null)),
 foreign key(tenant_id,object_id) references public.objects(tenant_id,id),foreign key(tenant_id,customer_id) references public.customers(tenant_id,id),foreign key(tenant_id,category_id) references public.ticket_categories(tenant_id,id),
 revision bigint not null default 1 check(revision>0),version integer not null default 1 check(version>0),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),unique(tenant_id,id)
);
create unique index cockpit_service_identity on private.cockpit_services(tenant_id,object_id,customer_id,kind,coalesce(category_id,'00000000-0000-0000-0000-000000000000'::uuid));
create table private.cockpit_service_versions(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,service_id uuid not null,version integer not null check(version>0),
 agreement_id uuid not null,object_id uuid not null,customer_id uuid not null,category_id uuid,
 kind text not null check(kind in('response','resolution','visits','inspection','report')),
 norm text not null check(length(btrim(norm)) between 1 and 150),target integer not null check(target between 1 and 100000),
 period_from date,period_until date,clock_config jsonb not null,measurement_timezone text not null,created_by uuid not null references auth.users(id),created_at timestamptz not null default clock_timestamp(),
 foreign key(tenant_id,service_id) references private.cockpit_services(tenant_id,id),
 foreign key(tenant_id,category_id) references public.ticket_categories(tenant_id,id),
 foreign key(tenant_id,agreement_id) references public.customer_agreements(tenant_id,id),
 foreign key(tenant_id,object_id) references public.objects(tenant_id,id),
 foreign key(tenant_id,customer_id) references public.customers(tenant_id,id),
 unique(service_id,version),check((kind in('response','resolution') and category_id is not null) or(kind not in('response','resolution') and category_id is null)),check((kind in('response','resolution') and period_from is null and period_until is null) or(kind not in('response','resolution') and period_from is not null and period_until>=period_from and period_until-period_from<=366))
);
-- The command API only appends versions; the database also rejects accidental
-- rewrites by future privileged adapters.
create function private.cockpit_service_version_guard() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Een vastgelegde serviceafspraakversie is onveranderlijk.' using errcode='23514';end$$;
revoke all on function private.cockpit_service_version_guard() from public,anon,authenticated,service_role;
create trigger cockpit_service_version_guard before update or delete on private.cockpit_service_versions for each row execute function private.cockpit_service_version_guard();
create index cockpit_service_series on private.cockpit_service_versions(tenant_id,service_id,version desc);
create index cockpit_service_source on private.cockpit_service_versions(tenant_id,object_id,kind,created_at desc);
create table private.cockpit_ticket_service_bindings(
 ticket_id uuid primary key references public.tickets(id) deferrable initially deferred,tenant_id uuid not null references public.tenants(id),
 response_version uuid references private.cockpit_service_versions(id),resolution_version uuid references private.cockpit_service_versions(id),
 response_minutes integer not null,resolution_minutes integer not null,config_snapshot jsonb not null,started_at timestamptz not null,
 last_response_deadline timestamptz,last_resolution_deadline timestamptz,response_completed_deadline timestamptz,resolution_completed_deadline timestamptz,response_completed_config jsonb,resolution_completed_config jsonb,
 response_overdue_pause boolean not null default false,resolution_overdue_pause boolean not null default false,
 first_breached_at timestamptz,resolution_breached_at timestamptz,created_at timestamptz not null default clock_timestamp()
);
create index cockpit_ticket_service_response on private.cockpit_ticket_service_bindings(tenant_id,response_version) where response_version is not null;
create index cockpit_ticket_service_resolution on private.cockpit_ticket_service_bindings(tenant_id,resolution_version) where resolution_version is not null;
do $$declare tab text;begin foreach tab in array array['cockpit_services','cockpit_service_versions','cockpit_ticket_service_bindings'] loop
 execute format('alter table private.%I enable row level security',tab);execute format('alter table private.%I force row level security',tab);execute format('revoke all on private.%I from public,anon,authenticated,service_role',tab);
end loop;end$$;

create function private.cockpit_sla_assert(t uuid,writing boolean default false) returns void language plpgsql stable security definer set search_path='' as $$
begin
 perform private.cockpit_assert(t,'backoffice.sla.read');perform private.cockpit_assert(t,'backoffice.functions.cockpit_sla_query');if not private.service_enabled(t,'rapportage') then raise exception 'Rapportage en kwaliteitsbeheer zijn niet ingeschakeld.' using errcode='42501';end if;perform private.cockpit_assert(t,'backoffice.followup.read');perform private.cockpit_assert(t,'backoffice.functions.cockpit_followup');
 if writing then perform private.cockpit_assert(t,'backoffice.sla.write');perform private.cockpit_assert(t,'backoffice.functions.cockpit_sla_save');if not private.cockpit_scope(t,'quality') then raise exception 'Geen kwaliteitsbeheer.' using errcode='42501';end if;end if;
end$$;
-- Deliberately price-free contract summary. Full financial contract data keeps
-- its existing, stricter dossier authorization.
create function private.cockpit_service_source(v private.cockpit_service_versions,writing boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select private.cockpit_source(v.tenant_id,'object',v.object_id) and private.cockpit_source(v.tenant_id,'customer',v.customer_id)
 and exists(select 1 from public.customer_agreements a join public.customer_agreement_lines l on l.tenant_id=a.tenant_id and l.agreement_id=a.id join public.objects o on o.tenant_id=a.tenant_id and o.id=l.object_id where a.tenant_id=v.tenant_id and a.id=v.agreement_id and a.customer_id=v.customer_id and l.object_id=v.object_id and(not writing or o.customer_id=a.customer_id))
$$;

create function private.cockpit_ticket_contract_clock() returns trigger language plpgsql security definer set search_path='' as $$
declare first private.cockpit_service_versions;resolution private.cockpit_service_versions;cfg jsonb;c public.ticket_categories;day date;started timestamptz;b private.cockpit_ticket_service_bindings;begin
 if new.route<>'internal' then return new;end if;
 if tg_op='INSERT' then
  select settings into cfg from private.ticket_config where scope_key=new.tenant_id::text;select * into c from public.ticket_categories where id=new.category_id;
  started:=coalesce(nullif(new.audience_activity->>'reporter','')::timestamptz,new.created_at);
  day:=(started at time zone(select timezone from public.tenants where id=new.tenant_id))::date;
  -- Customer contract norms never override an internal/confidential HR or
  -- personnel policy. Category visibility is the existing customer boundary.
  if not c.confidential and c.customer_visible then
  select v.* into first from(select distinct on(v.service_id) v.* from private.cockpit_service_versions v join public.customer_agreements a on a.tenant_id=v.tenant_id and a.id=v.agreement_id where v.tenant_id=new.tenant_id and v.category_id=new.category_id and v.customer_id=new.customer_id and a.state='active' and a.starts_on<=day and(a.ends_on is null or a.ends_on>=day) order by v.service_id,v.version desc)v where v.object_id=new.object_id and v.kind='response' order by v.created_at desc,v.id limit 1;
  select v.* into resolution from(select distinct on(v.service_id) v.* from private.cockpit_service_versions v join public.customer_agreements a on a.tenant_id=v.tenant_id and a.id=v.agreement_id where v.tenant_id=new.tenant_id and v.category_id=new.category_id and v.customer_id=new.customer_id and a.state='active' and a.starts_on<=day and(a.ends_on is null or a.ends_on>=day) order by v.service_id,v.version desc)v where v.object_id=new.object_id and v.kind='resolution' order by v.created_at desc,v.id limit 1;
  end if;
  if cfg is null then raise exception 'Ticketklokconfiguratie ontbreekt.' using errcode='23514';end if;
  if first.id is not null then new.first_response_due_at:=private.ticket_business_due(started,first.target,cfg);end if;
  if resolution.id is not null then new.resolution_due_at:=private.ticket_business_due(started,resolution.target,cfg);end if;
  -- The BEFORE hook records exactly the versions used to calculate these
  -- deadlines. A deferred FK validates the ticket at commit, avoiding a second
  -- AFTER lookup that could observe a concurrently revised norm.

  insert into private.cockpit_ticket_service_bindings(ticket_id,tenant_id,response_version,resolution_version,response_minutes,resolution_minutes,config_snapshot,started_at,last_response_deadline,last_resolution_deadline)
   values(new.id,new.tenant_id,first.id,resolution.id,coalesce(first.target,c.first_response_minutes),coalesce(resolution.target,c.resolution_minutes),cfg,started,new.first_response_due_at,new.resolution_due_at);

 else
  select settings into cfg from private.ticket_config where scope_key=new.tenant_id::text;select * into b from private.cockpit_ticket_service_bindings where ticket_id=new.id for update;
  -- Preserve an already missed deadline when the native pause operation clears
  -- it. This is evidence about the existing clock, not a second running timer.
  update private.cockpit_ticket_service_bindings set
   last_response_deadline=coalesce(new.first_response_due_at,last_response_deadline),last_resolution_deadline=coalesce(new.resolution_due_at,last_resolution_deadline),
   response_completed_deadline=case when old.first_response_at is null and new.first_response_at is not null then coalesce(old.first_response_due_at,b.last_response_deadline) else response_completed_deadline end,
   resolution_completed_deadline=case when old.resolved_at is null and new.resolved_at is not null then coalesce(old.resolution_due_at,b.last_resolution_deadline) else resolution_completed_deadline end,
   response_completed_config=case when old.first_response_at is null and new.first_response_at is not null then cfg else response_completed_config end,
   resolution_completed_config=case when old.resolved_at is null and new.resolved_at is not null then cfg else resolution_completed_config end,
   response_overdue_pause=response_overdue_pause or coalesce((old.first_response_at is null and old.first_response_due_at<clock_timestamp() and new.first_response_due_at is null),false),
   resolution_overdue_pause=resolution_overdue_pause or coalesce((old.resolved_at is null and old.resolution_due_at<clock_timestamp() and new.resolution_due_at is null),false),
   first_breached_at=coalesce(first_breached_at,case when old.first_response_at is null and old.first_response_due_at is not null and coalesce(new.first_response_at,clock_timestamp())>old.first_response_due_at then old.first_response_due_at end),
   resolution_breached_at=coalesce(resolution_breached_at,case when old.resolved_at is null and old.resolution_due_at is not null and coalesce(new.resolved_at,clock_timestamp())>old.resolution_due_at then old.resolution_due_at end)
   where ticket_id=new.id;
 end if;return new;
end$$;
create trigger cockpit_ticket_contract_clock_norm before insert on public.tickets for each row execute function private.cockpit_ticket_contract_clock();
create trigger cockpit_ticket_contract_clock_changed before update of first_response_due_at,resolution_due_at,first_response_at,resolved_at,paused_minutes on public.tickets for each row execute function private.cockpit_ticket_contract_clock();

create function private.cockpit_service_measure(v private.cockpit_service_versions) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare done integer;total integer;late integer;breached integer;risk integer;truncated boolean;tz text;today date;status text;facts jsonb;cfg jsonb;begin
 tz:=v.measurement_timezone;today:=(now() at time zone tz)::date;
 cfg:=v.clock_config;
 -- A split retains its original visit identity. Employees are never joined.
 with recursive roots as(
  select w.id,w.id root,array[w.id] path,0 depth from public.work_orders w where w.tenant_id=v.tenant_id and w.object_id=v.object_id and w.customer_id=v.customer_id
  union all select q.id,r.source_order_id,q.path||r.source_order_id,q.depth+1 from roots q join public.work_order_relations r on r.tenant_id=v.tenant_id and r.target_order_id=q.root and r.kind='split' where not r.source_order_id=any(q.path) and q.depth<50
 ), identities as(select distinct on(id) id,root from roots order by id,depth desc),
 visits as(
  select i.root,bool_and(w.actual_end_at is not null) completed,
   max(w.actual_end_at) ended,max(rep.submitted_at) submitted,bool_and(rep.submitted_at is not null) reports_complete,
   bool_or(w.visit_kind='inspection' or exists(select 1 from public.work_order_relations r where r.tenant_id=w.tenant_id and r.target_order_id=w.id and r.reason='inspection')) inspected,
   array_agg(w.id order by w.id) order_ids,count(*) order_total
  from identities i join public.work_orders w on w.tenant_id=v.tenant_id and w.id=i.id
  left join lateral(select min(created_at) submitted_at from public.work_order_report_versions rv where rv.tenant_id=w.tenant_id and rv.work_order_id=w.id)rep on true
  where w.archive_at is null and w.status<>'cancelled' group by i.root
 ), windowed as(select * from visits where(ended at time zone tz)::date between v.period_from and v.period_until and(v.kind<>'inspection' or inspected))
 select count(*) filter(where completed)::int,count(*)::int,
  count(*) filter(where completed and(not reports_complete or submitted>private.ticket_business_due(ended,v.target,cfg)))::int,
  count(*) filter(where completed and((reports_complete and submitted>private.ticket_business_due(ended,v.target,cfg)) or(not reports_complete and private.ticket_business_due(ended,v.target,cfg)<now())))::int,
  count(*) filter(where completed and not reports_complete and private.ticket_business_remaining(now(),private.ticket_business_due(ended,v.target,cfg),cfg)<=greatest(1,ceil(v.target*.2)::integer))::int,
  coalesce((select jsonb_agg(jsonb_build_object('visitId',root,'completed',completed,'completedAt',ended,'reportSubmittedAt',submitted,'orderTotal',order_total,'orders',(select jsonb_agg(item order by item->>'id') from(select jsonb_build_object('id',w.id,'number',w.work_order_number,'completedAt',w.actual_end_at,'reportSubmittedAt',(select min(created_at) from public.work_order_report_versions rv where rv.tenant_id=w.tenant_id and rv.work_order_id=w.id)) item from public.work_orders w where w.tenant_id=v.tenant_id and w.id=any(f.order_ids) order by w.id limit 50)list)) order by ended desc,root) from(select * from windowed where completed order by ended desc,root limit 50)f),'[]') ,exists(select 1 from roots r join public.work_order_relations rel on rel.tenant_id=v.tenant_id and rel.target_order_id=r.root and rel.kind='split' where r.depth=50 and not rel.source_order_id=any(r.path)) into done,total,late,breached,risk,facts,truncated from windowed;
 if truncated then return jsonb_build_object('status','Risico','result','Bronketen is niet volledig meetbaar; controleer de gekoppelde bezoeken.','facts','[]'::jsonb,'factTotal',0,'count',null);end if;
 if v.kind='report' then
  status:=case when breached>0 then 'Overschreden' when risk>0 then 'Risico' else 'Op koers' end;
  return jsonb_build_object('status',status,'result',case when done=0 then 'Nog geen afgerond bronbezoek' else(done-late)||' van '||done||' bezoeken tijdig gerapporteerd' end,'facts',facts,'factTotal',done,'count',done,'late',late);
 end if;
 status:=case when done>=v.target then 'Op koers' when today>v.period_until then 'Overschreden' when today>=v.period_until-greatest(1,(v.period_until-v.period_from)/5) then 'Risico' else 'Op koers' end;
 return jsonb_build_object('status',status,'result',case when done=0 then 'Nog geen meting · 0 van '||v.target else done||' van '||v.target||case when v.kind='inspection' then case when v.target=1 then ' inspectie' else ' inspecties' end else case when v.target=1 then ' uniek bezoek' else ' unieke bezoeken' end end end,'facts',facts,'factTotal',done,'count',done);
end$$;

create function private.cockpit_sla_norm(kind text,norm text) returns integer language plpgsql immutable set search_path='' as $$
declare parts text[];n numeric;begin
 norm:=lower(regexp_replace(btrim(norm),'\s+',' ','g'));
 if kind in('response','resolution','report') then
  parts:=regexp_match(norm,'^(?:binnen )?([0-9]+(?:[,.][0-9]{1,2})?) (?:werk)?(minuten|minuut|min|uren|uur)$');
  if parts is not null then n:=replace(parts[1],',','.')::numeric*case when parts[2] in('uren','uur') then 60 else 1 end;end if;
 elsif kind='visits' then
  parts:=regexp_match(norm,'^([1-9][0-9]{0,3})(?: uniek| unieke)? (?:bezoek|bezoeken)(?: in de meetperiode)?$');if parts is not null then n:=parts[1]::numeric;end if;
 elsif kind='inspection' then
  parts:=regexp_match(norm,'^([1-9][0-9]{0,3}) (?:inspectie|inspecties)(?: in de meetperiode)?$');if parts is not null then n:=parts[1]::numeric;end if;
 end if;
 if n is null or n<1 or n>100000 or n<>trunc(n) then raise exception 'Gebruik bijvoorbeeld: binnen 4 werkuren, binnen 30 werkminuten of 4 bezoeken in de meetperiode.' using errcode='22023';end if;
 return n::integer;
end$$;

create function private.cockpit_service_command(target_tenant uuid,input jsonb,request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.cockpit_services;v private.cockpit_service_versions;old private.cockpit_service_versions;receipt private.cockpit_receipts;fingerprint text;result jsonb;record uuid:=nullif(input->>'id','')::uuid;actor uuid:=auth.uid();begin
 perform private.cockpit_sla_assert(target_tenant,true);
 if record is null or request_id is null or jsonb_typeof(input) is distinct from 'object' or octet_length(input::text)>8000 or exists(select 1 from jsonb_object_keys(input) k where k not in('id','revision','agreementId','objectId','kind','norm','categoryId','periodFrom','periodUntil')) then raise exception 'Ongeldige serviceafspraak.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('cockpit-command:'||target_tenant::text||actor::text||request_id::text,0));perform private.cockpit_sla_assert(target_tenant,true);
 select * into s from private.cockpit_services where tenant_id=target_tenant and id=record for update;
 if s.id is not null then select * into old from private.cockpit_service_versions where service_id=s.id and version=s.version;if not private.cockpit_service_source(old) then raise exception 'De bestaande bron is niet toegankelijk.' using errcode='42501';end if;end if;
 perform private.cockpit_sla_assert(target_tenant,true);
 v.target:=private.cockpit_sla_norm(input->>'kind',input->>'norm');
 v.tenant_id:=target_tenant;v.agreement_id:=(input->>'agreementId')::uuid;v.object_id:=(input->>'objectId')::uuid;v.category_id:=nullif(input->>'categoryId','')::uuid;
 select customer_id into v.customer_id from public.customer_agreements where tenant_id=target_tenant and id=v.agreement_id and state='active';
 if not coalesce(private.cockpit_service_source(v,true),false) then raise exception 'Kies een toegankelijke contractversie met een regel voor dit object.' using errcode='42501';end if;
 if input->>'kind' in('response','resolution') then
  if not exists(select 1 from public.ticket_categories c where c.id=v.category_id and c.tenant_id=target_tenant and c.route='internal' and not c.confidential and c.customer_visible and c.archived_at is null) then raise exception 'Kies een actieve klantgerichte meldingscategorie.' using errcode='42501';end if;
 elsif v.category_id is not null then raise exception 'Deze meting gebruikt geen ticketcategorie.' using errcode='22023';end if;
 if s.id is not null and(s.object_id,s.customer_id,s.kind,s.category_id) is distinct from(v.object_id,v.customer_id,input->>'kind',v.category_id) then raise exception 'De identiteit van een vastgelegde serviceafspraak blijft bewaard. Maak voor een ander object of soort een nieuwe afspraak.' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('sla-policy:'||target_tenant::text||v.object_id::text||v.customer_id::text||coalesce(v.category_id::text,'')||(input->>'kind'),0));
 perform private.cockpit_sla_assert(target_tenant,true);
 -- Policy serialization may have waited behind another actor. Reauthorize
 -- both the original and proposed source against the current database state.
 if not coalesce(private.cockpit_service_source(v,true),false) or(s.id is not null and not private.cockpit_service_source(old)) then raise exception 'De bronrechten zijn gewijzigd.' using errcode='42501';end if;
 if input->>'kind' in('response','resolution') and not exists(select 1 from public.ticket_categories c where c.id=v.category_id and c.tenant_id=target_tenant and c.route='internal' and not c.confidential and c.customer_visible and c.archived_at is null) then raise exception 'De klantgerichte meldingscategorie is gewijzigd.' using errcode='42501';end if;
 if exists(select 1 from private.cockpit_services other where other.tenant_id=target_tenant and other.object_id=v.object_id and other.customer_id=v.customer_id and other.kind=input->>'kind' and other.category_id is not distinct from v.category_id and other.id<>record) then raise exception 'Er bestaat al een serviceafspraak voor dit object, deze categorie en dit soort. Werk de bestaande normversie bij.' using errcode='23514';end if;
 fingerprint:=encode(extensions.digest('sla:save:'||input::text,'sha256'),'hex');
 select * into receipt from private.cockpit_receipts r where r.tenant_id=target_tenant and r.actor_id=actor and r.request_id=cockpit_service_command.request_id;
 if found then if receipt.fingerprint<>fingerprint then raise exception 'Andere invoer bij dezelfde herhaalsleutel.' using errcode='23514';end if;return receipt.result;end if;
 if s.id is not null and s.revision is distinct from(input->>'revision')::bigint then raise exception 'De serviceafspraak is gewijzigd.' using errcode='40001';end if;
 if s.id is null then insert into private.cockpit_services(id,tenant_id,object_id,customer_id,kind,category_id,created_by) values(record,target_tenant,v.object_id,v.customer_id,input->>'kind',v.category_id,actor) returning * into s;
 else update private.cockpit_services set revision=revision+1,version=version+1,updated_at=clock_timestamp() where id=record returning * into s;end if;
 insert into private.cockpit_service_versions(tenant_id,service_id,version,agreement_id,object_id,customer_id,category_id,kind,norm,target,period_from,period_until,clock_config,measurement_timezone,created_by)
 values(target_tenant,s.id,s.version,v.agreement_id,v.object_id,v.customer_id,v.category_id,input->>'kind',btrim(input->>'norm'),v.target,nullif(input->>'periodFrom','')::date,nullif(input->>'periodUntil','')::date,(select settings from private.ticket_config where scope_key=target_tenant::text),(select timezone from public.tenants where id=target_tenant),actor) returning * into v;
 insert into private.cockpit_events(tenant_id,record_kind,record_id,actor_id,event,revision,details) values(target_tenant,'service',record,actor,'saved',s.revision,jsonb_build_object('version',s.version,'norm',v.norm,'contract',v.agreement_id,'object',v.object_id));
 result:=jsonb_build_object('ok',true,'id',record,'revision',s.revision);
 insert into private.cockpit_receipts(tenant_id,actor_id,request_id,fingerprint,result) values(target_tenant,actor,request_id,fingerprint,result);return result;
end$$;
revoke all on function private.cockpit_sla_assert(uuid,boolean),private.cockpit_service_source(private.cockpit_service_versions,boolean),private.cockpit_ticket_contract_clock(),private.cockpit_service_measure(private.cockpit_service_versions),private.cockpit_service_command(uuid,jsonb,uuid) from public,anon,authenticated,service_role;
revoke all on function private.cockpit_sla_norm(text,text) from public,anon,authenticated,service_role;

create function private.cockpit_service_visible(v private.cockpit_service_versions) returns boolean language sql stable security definer set search_path='' as $$
 select private.cockpit_service_source(v) and(v.kind in('response','resolution') or(private.planning_access(v.tenant_id) and private.management_allowed(v.tenant_id,'backoffice.work_orders.read') and private.management_allowed(v.tenant_id,'backoffice.functions.work_order_dossier') and private.cockpit_scope(v.tenant_id,'quality')))
$$;
create function private.cockpit_service_dto(v private.cockpit_service_versions,detail boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare measured jsonb;history jsonb;begin
 if not private.cockpit_service_visible(v) then return null;end if;
 measured:=case when v.kind in('response','resolution') then jsonb_build_object('status','Op koers','result','Nog geen gekoppeld ticket','facts','[]'::jsonb,'factTotal',0) else private.cockpit_service_measure(v) end;
 if detail then select coalesce(jsonb_agg(jsonb_build_object('version',z.version,'norm',z.norm,'createdAt',z.created_at,'agreementId',z.agreement_id,'periodFrom',z.period_from,'periodUntil',z.period_until) order by z.version desc),'[]') into history from(select old.* from private.cockpit_service_versions old where old.service_id=v.service_id and private.cockpit_service_visible(old) order by old.version desc limit 50)z;end if;
 return jsonb_build_object('id','service:'||v.service_id,'serviceId',v.service_id,'version',v.version,'revision',(select revision from private.cockpit_services where id=v.service_id),'kind',v.kind,'categoryId',v.category_id,'norm',v.norm,'target',v.target,'periodFrom',v.period_from,'periodUntil',v.period_until,
  'timezone',v.measurement_timezone,'canOpenContract',private.cockpit_source(v.tenant_id,'agreement',v.agreement_id),'customerId',v.customer_id,'customer',(select name from public.customers where id=v.customer_id),'objectId',v.object_id,'object',(select name from public.objects where id=v.object_id),
  'agreementId',v.agreement_id,'contract',(select title||' · v'||version from public.customer_agreements where id=v.agreement_id),'ticket',null,
  'status',measured->>'status','result',measured->>'result','facts',case when detail then measured->'facts' else '[]'::jsonb end,'factTotal',coalesce((measured->>'factTotal')::integer,0),'historyTotal',(select count(*) from private.cockpit_service_versions old where old.service_id=v.service_id and private.cockpit_service_visible(old)),'history',coalesce(history,'[]'::jsonb));
end$$;

create function private.cockpit_sla_ticket_dto(t public.tickets,kind text,detail boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare b private.cockpit_ticket_service_bindings;v private.cockpit_service_versions;due timestamptz;finished timestamptz;breached timestamptz;norm integer;remaining integer;elapsed integer;cfg jsonb;status text;result text;dto jsonb;history jsonb;history_total bigint:=0;contract_visible boolean;begin
 if t.route<>'internal' or not private.ticket_allowed(t.id,'tenant','read') or t.status='cancelled' or kind not in('response','resolution') then return null;end if;
 select * into b from private.cockpit_ticket_service_bindings where ticket_id=t.id;
 select * into v from private.cockpit_service_versions where id=case cockpit_sla_ticket_dto.kind when 'response' then b.response_version else b.resolution_version end;
 due:=case kind when 'response' then t.first_response_due_at else t.resolution_due_at end;finished:=case kind when 'response' then t.first_response_at else t.resolved_at end;
 if finished is not null then due:=coalesce(case kind when 'response' then b.response_completed_deadline else b.resolution_completed_deadline end,due);end if;
 norm:=case kind when 'response' then b.response_minutes else b.resolution_minutes end;breached:=case kind when 'response' then b.first_breached_at else b.resolution_breached_at end;
 if due is null and b.ticket_id is null and t.paused_minutes is null then return null;end if;
 select settings into cfg from private.ticket_config where scope_key=t.tenant_id::text;
 if finished is not null then cfg:=coalesce(case kind when 'response' then b.response_completed_config else b.resolution_completed_config end,cfg);end if;
 remaining:=case when t.paused_minutes is not null and finished is null then(t.paused_minutes->>case kind when 'response' then 'first' else 'resolution' end)::integer else private.ticket_business_remaining(coalesce(finished,now()),due,cfg) end;
 status:=case when breached is not null or(due is not null and coalesce(finished,now())>due) then 'Overschreden'
  when finished is not null and due is null and b.ticket_id is null then 'Risico'
  when finished is not null then 'Op koers' when remaining is not null and remaining<=greatest(1,coalesce(ceil(norm*.2)::integer,60)) then 'Risico' else 'Op koers' end;
 result:=case when finished is not null then case kind when 'response' then 'Eerste reactie vastgelegd' else 'Oplossing vastgelegd' end
  when t.paused_minutes is not null then 'Ticketklok gepauzeerd' when due is null then 'Brondeadline niet beschikbaar' else 'Deadline '||to_char(due at time zone(cfg->>'timezone'),'DD-MM-YYYY HH24:MI') end;
 contract_visible:=v.id is not null and private.cockpit_service_source(v);
 if detail then
  dto:=private.ticket_dto(t.id,'tenant',auth.uid(),false);
  select count(*) into history_total from public.ticket_events e where e.ticket_id=t.id and private.ticket_event_allowed(e.id,'tenant',auth.uid());
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'type',e.type,'label',e.label,'audience',e.audience,'actor_name',case when e.actor_user_id=auth.uid() then 'U' when e.actor_user_id is null then 'Systeem' else 'Behandelaar' end,'created_at',e.created_at) order by e.created_at,e.id),'[]') into history from(select * from public.ticket_events e where e.ticket_id=t.id and private.ticket_event_allowed(e.id,'tenant',auth.uid()) order by e.created_at desc,e.id desc limit 100)e;
  if norm is not null and remaining is not null and not(case kind when 'response' then b.response_overdue_pause else b.resolution_overdue_pause end) then elapsed:=greatest(0,norm-remaining)+case when due is not null and coalesce(finished,now())>due then private.ticket_business_remaining(due,coalesce(finished,now()),cfg) else 0 end;end if;
 end if;
 return jsonb_build_object('id','ticket:'||t.id||':'||kind,'serviceId',case when contract_visible then v.service_id end,'version',case when contract_visible then v.version end,'revision',null,'kind',kind,'categoryId',t.category_id,
  'norm',case when contract_visible then v.norm when norm is not null then 'Binnen '||norm||' werkminuten' when due is not null then 'Brondeadline '||to_char(due at time zone(cfg->>'timezone'),'DD-MM-YYYY HH24:MI') else 'Bestaande ticketklok' end,'target',norm,'periodFrom',null,'periodUntil',null,
  'timezone',cfg->>'timezone','canOpenContract',coalesce(contract_visible and private.cockpit_source(t.tenant_id,'agreement',v.agreement_id),false),'customerId',case when private.cockpit_source(t.tenant_id,'customer',t.customer_id) then t.customer_id end,'customer',case when private.cockpit_source(t.tenant_id,'customer',t.customer_id) then(select name from public.customers where id=t.customer_id) else 'Geen zichtbare klant' end,
  'objectId',case when private.cockpit_source(t.tenant_id,'object',t.object_id) then t.object_id end,'object',case when private.cockpit_source(t.tenant_id,'object',t.object_id) then(select name from public.objects where id=t.object_id) else 'Geen zichtbaar object' end,
  'agreementId',case when contract_visible then v.agreement_id end,'contract',case when contract_visible then(select title||' · v'||version from public.customer_agreements where id=v.agreement_id) else 'Bestaand ticketbeleid' end,
  'status',status,'result',result,'facts','[]'::jsonb,'factTotal',0,'historyTotal',history_total,'history',coalesce(history,'[]'::jsonb),
  'ticket',jsonb_build_object('id',t.id,'number',t.number,'revision',private.ticket_view_revision(t.id,'tenant',auth.uid()),'firstResponseAt',t.first_response_at,'resolvedAt',t.resolved_at,'status',t.status,'paused',t.paused_minutes is not null,'responseDeadline',t.first_response_due_at,'resolutionDeadline',t.resolution_due_at,
   'elapsed',elapsed,'clockRecorded',b.ticket_id is not null,'canPause',(select pause_while_waiting from public.ticket_categories where id=t.category_id),'permissions',case when detail and private.cockpit_access(t.tenant_id,'backoffice.functions.cockpit_sla_ticket_event') then dto->'permissions' else '{}'::jsonb end));
end$$;

create function public.cockpit_sla_query(target_tenant uuid,payload jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare q text:=lower(btrim(coalesce(payload->>'search','')));category_q text:=lower(btrim(coalesce(payload->>'categorySearch','')));option_q text:=lower(btrim(coalesce(payload->>'optionsSearch','')));selection text:=coalesce(payload->>'status','all');pg integer:=coalesce((payload->>'page')::integer,1);sz integer:=coalesce((payload->>'pageSize')::integer,20);record text:=payload->>'record';rows jsonb;selected jsonb;counts jsonb;total bigint;options jsonb;options_total bigint;categories jsonb;category_total bigint;begin
 perform private.cockpit_sla_assert(target_tenant);
 if jsonb_typeof(payload) is distinct from 'object' or length(q)>160 or length(option_q)>160 or length(category_q)>160 or selection not in('all','Op koers','Risico','Overschreden') or pg not between 1 and 100000 or sz not between 5 and 100 or length(coalesce(record,''))>100 or exists(select 1 from jsonb_object_keys(payload) k where k not in('search','status','page','pageSize','record','optionsSearch','categorySearch')) then raise exception 'Ongeldige SLA-selectie.' using errcode='22023';end if;
 with service_rows as materialized(
  select private.cockpit_service_dto(v) row from private.cockpit_services s join private.cockpit_service_versions v on v.service_id=s.id and v.version=s.version where s.tenant_id=target_tenant
   and(v.kind not in('response','resolution') or not exists(select 1 from private.cockpit_ticket_service_bindings b join public.tickets t on t.id=b.ticket_id where b.tenant_id=target_tenant and(v.id=b.response_version or v.id=b.resolution_version) and t.status<>'cancelled' and private.ticket_allowed(t.id,'tenant','read')))
 ), ticket_rows as materialized(select private.cockpit_sla_ticket_dto(t,k.kind) row from public.tickets t cross join(values('response'),('resolution'))k(kind) where t.tenant_id=target_tenant and t.route='internal' and private.ticket_allowed(t.id,'tenant','read')),
 all_rows as materialized(select row from service_rows where row is not null union all select row from ticket_rows where row is not null),
 filtered as materialized(select row from all_rows where(selection='all' or row->>'status'=selection) and(q='' or position(q in lower((row->>'customer')||' '||(row->>'object')||' '||(row->>'contract')||' '||(row->>'norm')||' '||(row->>'id')||' '||case row->>'kind' when 'response' then 'Reactietijd' when 'resolution' then 'Oplostijd' when 'inspection' then 'Inspecties' when 'report' then 'Rapportage' else 'Bezoeken' end))>0))
 select jsonb_build_object('onTrack',(select count(*) from all_rows where row->>'status'='Op koers'),'risk',(select count(*) from all_rows where row->>'status'='Risico'),'breached',(select count(*) from all_rows where row->>'status'='Overschreden')),
 (select count(*) from filtered),coalesce((select jsonb_agg(row order by row->>'id') from(select row from filtered order by row->>'id' limit sz offset(least(pg,greatest(1,ceil((select count(*) from filtered)::numeric/sz)::integer))-1)*sz)p),'[]') into counts,total,rows;
 pg:=least(pg,greatest(1,ceil(total::numeric/sz)::integer));
 if record like 'service:%' then select private.cockpit_service_dto(v,true) into selected from private.cockpit_services s join private.cockpit_service_versions v on v.service_id=s.id and v.version=s.version where s.tenant_id=target_tenant and s.id=nullif(split_part(record,':',2),'')::uuid;
 elsif record like 'ticket:%' then select private.cockpit_sla_ticket_dto(t,split_part(record,':',3),true) into selected from public.tickets t where t.tenant_id=target_tenant and t.id=nullif(split_part(record,':',2),'')::uuid;end if;
 -- Native selectors are bounded; the frontend offers server-side refinement if
 -- there are more choices, rather than silently dropping later contracts.
 with choices as materialized(select a.id,a.customer_id,a.title,a.version,o.id object_id,o.name object_name,c.name customer_name,a.starts_on,a.ends_on
  from public.customer_agreements a join public.customer_agreement_lines l on l.tenant_id=a.tenant_id and l.agreement_id=a.id join public.objects o on o.tenant_id=a.tenant_id and o.id=l.object_id and o.customer_id=a.customer_id join public.customers c on c.tenant_id=a.tenant_id and c.id=a.customer_id
  where a.tenant_id=target_tenant and a.state='active' and private.cockpit_source(target_tenant,'object',o.id) and private.cockpit_source(target_tenant,'customer',c.id) group by a.id,o.id,c.id),
 searched as materialized(select * from choices where option_q='' or position(option_q in lower(title||' '||object_name||' '||customer_name))>0)
 select(select count(*) from searched),coalesce((select jsonb_agg(to_jsonb(c) order by customer_name,title,version,object_id) from(select * from searched order by customer_name,title,version,object_id limit 200)c),'[]') into options_total,options;
 select count(*) into category_total from public.ticket_categories c where c.tenant_id=target_tenant and c.route='internal' and not c.confidential and c.customer_visible and c.archived_at is null and(category_q='' or position(category_q in lower(c.name))>0);
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name) order by c.name,c.id),'[]') into categories from(select * from public.ticket_categories c where c.tenant_id=target_tenant and c.route='internal' and not c.confidential and c.customer_visible and c.archived_at is null and(category_q='' or position(category_q in lower(c.name))>0) order by c.name,c.id limit 200)c;
 return jsonb_build_object('rows',rows,'selected',selected,'counts',counts,'total',total,'page',pg,'pageSize',sz,'options',options,'optionsTotal',options_total,'categories',categories,'categoriesTotal',category_total,'canWrite',private.cockpit_access(target_tenant,'backoffice.sla.write') and private.cockpit_access(target_tenant,'backoffice.functions.cockpit_sla_save') and private.cockpit_scope(target_tenant,'quality'),'today',(now() at time zone(select timezone from public.tenants where id=target_tenant))::date);
end$$;

create function public.cockpit_sla_command(target_tenant uuid,command text,input jsonb,request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare tid uuid:=(input->>'id')::uuid;result jsonb;body jsonb;native text;ticket public.tickets;receipt_exists boolean;begin
 perform private.cockpit_sla_assert(target_tenant);
 if command='save' then return private.cockpit_service_command(target_tenant,input,request_id);end if;
 perform private.cockpit_assert(target_tenant,'backoffice.functions.cockpit_sla_ticket_event');
 if command is null or command not in('response','pause','resume','resolution') or jsonb_typeof(input) is distinct from 'object' or octet_length(input::text)>12000 or request_id is null or length(btrim(coalesce(input->>'note',''))) not between 3 and 2000 or exists(select 1 from jsonb_object_keys(input)k where k not in('id','revision','note')) then raise exception 'Ongeldige ticketgebeurtenis.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('ticket-command:'||auth.uid()::text,0));
 select * into ticket from public.tickets t where t.id=tid and t.tenant_id=target_tenant and t.route='internal' for update;
 perform private.cockpit_sla_assert(target_tenant);
 perform private.cockpit_assert(target_tenant,'backoffice.functions.cockpit_sla_ticket_event');
 if ticket.id is null or not private.ticket_allowed(tid,'tenant','read') then raise exception 'Geen toegankelijk bronticket.' using errcode='42501';end if;
 if not private.ticket_allowed(tid,'tenant',case command when 'response' then 'reply' when 'resolution' then 'close' else 'manage' end) then raise exception 'Geen actuele bevoegdheid voor deze ticketgebeurtenis.' using errcode='42501';end if;
 select exists(select 1 from private.ticket_receipts r where r.request_id=cockpit_sla_command.request_id) into receipt_exists;
 if not receipt_exists then
  if command='response' and ticket.first_response_at is not null then raise exception 'De eerste reactie is al vastgelegd.' using errcode='23514';end if;
  if command='resolution' and ticket.first_response_at is null then raise exception 'Leg eerst de inhoudelijke reactie vast.' using errcode='23514';end if;
  if command='pause' and not exists(select 1 from public.ticket_categories c where c.id=ticket.category_id and c.pause_while_waiting) then raise exception 'Het bestaande ticketbeleid pauzeert deze categorie niet.' using errcode='23514';end if;
  if command='resume' and ticket.paused_minutes is null then raise exception 'De bronklok is niet gepauzeerd.' using errcode='23514';end if;
 end if;
 body:=jsonb_build_object('ticket_id',tid,'expected_revision',(input->>'revision')::bigint);
 if command='response' then native:='reply';body:=body||jsonb_build_object('body',btrim(input->>'note'),'audience','reporter','attachment_ids','[]'::jsonb);
 else native:='status';body:=body||case command when 'pause' then jsonb_build_object('status','waiting_reporter','next_step',btrim(input->>'note')) when 'resume' then jsonb_build_object('status','in_progress','reason',btrim(input->>'note')) else jsonb_build_object('status','resolved','resolution',btrim(input->>'note')) end;end if;
 result:=public.ticket_command(target_tenant,'tenant',native,body,request_id);
 perform private.cockpit_sla_assert(target_tenant);perform private.cockpit_assert(target_tenant,'backoffice.functions.cockpit_sla_ticket_event');
 return jsonb_build_object('ok',true,'id',tid,'ticket',result);
end$$;
revoke all on function private.cockpit_service_visible(private.cockpit_service_versions),private.cockpit_service_dto(private.cockpit_service_versions,boolean),private.cockpit_sla_ticket_dto(public.tickets,text,boolean) from public,anon,authenticated,service_role;
revoke all on function public.cockpit_sla_query(uuid,jsonb),public.cockpit_sla_command(uuid,text,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.cockpit_sla_query(uuid,jsonb),public.cockpit_sla_command(uuid,text,jsonb,uuid) to authenticated;
notify pgrst,'reload schema';

-- Automatic SLA signals remain source-owned. A paused source is deferred rather
-- than falsely marked complete; assignment and resolution happen in the ticket.
alter table private.cockpit_actions add column source_paused boolean not null default false;
create table private.cockpit_sla_ticket_checks(
 ticket_id uuid primary key references public.tickets(id) deferrable initially deferred,tenant_id uuid not null references public.tenants(id),checked_at timestamptz not null default '-infinity'
);
alter table private.cockpit_sla_ticket_checks enable row level security;
alter table private.cockpit_sla_ticket_checks force row level security;
revoke all on private.cockpit_sla_ticket_checks from public,anon,authenticated,service_role;
create index cockpit_sla_ticket_checks_due on private.cockpit_sla_ticket_checks(checked_at,ticket_id);

create function private.cockpit_ticket_sla_sync(tid uuid,actor uuid default null) returns integer language plpgsql security definer set search_path='' as $$
declare t public.tickets;b private.cockpit_ticket_service_bindings;a private.cockpit_actions;metric text;due timestamptz;finished boolean;paused boolean;needed boolean;remaining integer;norm integer;cfg jsonb;label text;message text;current_owner uuid;changed integer:=0;result private.cockpit_actions;begin
 foreach metric in array array['response','resolution'] loop
  perform pg_advisory_xact_lock(hashtextextended('sla-ticket-signal:'||tid::text||metric,0));
  select * into a from private.cockpit_actions where trigger_key='sla-ticket:'||tid::text||':'||metric for update;
  -- Re-read after waiting. The worker never locks the public ticket in reverse
  -- order; native ticket writes own their source row before reaching this hook.
  select * into t from public.tickets where id=tid;
  if t.id is null or t.route<>'internal' or not exists(select 1 from public.tenants where id=t.tenant_id and status='active') or not private.service_enabled(t.tenant_id,'rapportage') then continue;end if;
  select * into b from private.cockpit_ticket_service_bindings where ticket_id=tid;select settings into cfg from private.ticket_config where scope_key=t.tenant_id::text;if cfg is null then continue;end if;
  finished:=t.status in('resolved','closed','cancelled') or case metric when 'response' then t.first_response_at is not null else t.resolved_at is not null end;
  paused:=not finished and t.paused_minutes is not null;
  due:=case metric when 'response' then coalesce(t.first_response_due_at,b.last_response_deadline) else coalesce(t.resolution_due_at,b.last_resolution_deadline) end;
  norm:=case metric when 'response' then b.response_minutes else b.resolution_minutes end;
  remaining:=case when paused then(t.paused_minutes->>case metric when 'response' then 'first' else 'resolution' end)::integer else private.ticket_business_remaining(now(),due,cfg) end;
  needed:=not finished and((case metric when 'response' then b.first_breached_at else b.resolution_breached_at end) is not null or coalesce(remaining<=greatest(1,coalesce(ceil(norm*.2)::integer,60)),false));
  label:=case metric when 'response' then 'Eerste reactie nodig · ' else 'Oplossing opvolgen · ' end||t.number;
  message:=case when finished then 'Het bronticket is afgehandeld of de vereiste gebeurtenis is vastgelegd.' when paused then 'De bestaande ticketklok is gepauzeerd. Hervatten en verantwoordelijkheid volgen het bronticket.' when not needed then 'De bronklok vraagt momenteel geen actie. De oorspronkelijke deadline blijft bewaard.' else 'De bestaande ticketklok nadert of overschrijdt zijn deadline. Volg de melding op in het bronticket.' end;
  current_owner:=case when private.cockpit_owner(t.tenant_id,t.assigned_user_id) then t.assigned_user_id end;
  if a.id is null then
   if not needed or due is null then continue;end if;
   insert into private.cockpit_actions(tenant_id,source_kind,source_id,title,scope,due_on,original_due_on,owner_id,automatic,trigger_key,created_by,note,source_paused)
    values(t.tenant_id,'tenant',t.tenant_id,label,'general',(due at time zone(cfg->>'timezone'))::date,(due at time zone(cfg->>'timezone'))::date,current_owner,true,'sla-ticket:'||tid::text||':'||metric,null,message,paused) returning * into result;
   insert into private.cockpit_events(tenant_id,record_kind,record_id,actor_id,event,revision,details) values(t.tenant_id,'action:manual',result.id,actor,'create',result.revision,jsonb_build_object('ticketId',tid,'metric',metric,'note',message));changed:=changed+1;
  else
   if(a.title,a.owner_id,a.state,a.source_paused,a.due_on,a.note) is not distinct from(label,current_owner,case when finished then 'done' else 'open' end,not finished and(paused or not needed),coalesce((due at time zone(cfg->>'timezone'))::date,a.due_on),message) then continue;end if;
   update private.cockpit_actions set title=label,owner_id=current_owner,state=case when finished then 'done' else 'open' end,source_paused=not finished and(paused or not needed),due_on=coalesce((due at time zone(cfg->>'timezone'))::date,due_on),note=message,revision=revision+1,updated_at=clock_timestamp() where id=a.id returning * into result;
   insert into private.cockpit_events(tenant_id,record_kind,record_id,actor_id,event,revision,details) values(t.tenant_id,'action:manual',result.id,actor,case when finished and a.state<>'done' then 'complete' else 'updated' end,result.revision,jsonb_build_object('ticketId',tid,'metric',metric,'note',message,'originalDue',result.original_due_on));changed:=changed+1;
  end if;
 end loop;return changed;
end$$;
create function private.cockpit_ticket_sla_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin perform private.cockpit_ticket_sla_sync(new.id,case when private.actor_session_active() then auth.uid() end);return new;end$$;
create trigger cockpit_ticket_sla_changed after update of first_response_at,resolved_at,status,assigned_user_id,first_response_due_at,resolution_due_at,paused_minutes on public.tickets for each row execute function private.cockpit_ticket_sla_changed();

create or replace function private.cockpit_action_visible(a private.cockpit_actions) returns boolean language sql stable security definer set search_path='' as $$
 select private.cockpit_access(a.tenant_id,'backoffice.followup.read') and private.cockpit_scope(a.tenant_id,a.scope) and private.cockpit_source(a.tenant_id,a.source_kind,a.source_id)
 and(case when a.trigger_key like 'decision:%' then exists(select 1 from private.cockpit_decisions d where d.tenant_id=a.tenant_id and d.id=split_part(a.trigger_key,':',2)::uuid and private.cockpit_decision_visible(d))
 when a.trigger_key like 'requirement:%' then exists(select 1 from private.cockpit_requirements r where r.tenant_id=a.tenant_id and r.id=split_part(a.trigger_key,':',2)::uuid and private.cockpit_requirement_visible(r))
 when a.trigger_key like 'sla-ticket:%' then private.cockpit_access(a.tenant_id,'backoffice.sla.read') and private.cockpit_access(a.tenant_id,'backoffice.functions.cockpit_sla_query') and private.service_enabled(a.tenant_id,'rapportage') and exists(select 1 from public.tickets t where t.tenant_id=a.tenant_id and t.id=split_part(a.trigger_key,':',2)::uuid and private.ticket_allowed(t.id,'tenant','read')) else true end)
$$;
create or replace function private.cockpit_action_can_write(a private.cockpit_actions) returns boolean language sql stable security definer set search_path='' as $$
 select private.cockpit_action_visible(a) and private.cockpit_access(a.tenant_id,'backoffice.followup.write') and private.cockpit_access(a.tenant_id,'backoffice.functions.cockpit_followup_command')
 and coalesce(a.trigger_key not like 'sla-ticket:%',true)
 and(a.trigger_key not like 'requirement:%' or a.trigger_key is null or private.cockpit_access(a.tenant_id,'backoffice.compliance.write'))
$$;

create function public.cockpit_sla_maintenance(batch_size integer default 50) returns integer language plpgsql security definer set search_path='' as $$
declare item record;processed integer:=0;begin
 if auth.jwt()->>'role' is distinct from 'service_role' or batch_size is null or batch_size not between 1 and 100 then raise exception 'Alleen de bestaande worker verwerkt SLA-signalen.' using errcode='42501';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('cockpit-sla-maintenance',0)) then return 0;end if;
 for item in select t.id,t.tenant_id from public.tickets t join public.tenants tenant on tenant.id=t.tenant_id and tenant.status='active' left join private.cockpit_sla_ticket_checks c on c.ticket_id=t.id
  where t.route='internal' and private.service_enabled(t.tenant_id,'rapportage') and(t.status not in('resolved','closed','cancelled') or exists(select 1 from private.cockpit_actions a where a.tenant_id=t.tenant_id and a.trigger_key like 'sla-ticket:'||t.id::text||':%' and a.state<>'done'))
  order by coalesce(c.checked_at,'-infinity'::timestamptz),t.id limit batch_size loop
  perform private.cockpit_ticket_sla_sync(item.id);
  insert into private.cockpit_sla_ticket_checks(ticket_id,tenant_id,checked_at) values(item.id,item.tenant_id,clock_timestamp()) on conflict(ticket_id) do update set checked_at=excluded.checked_at;
  processed:=processed+1;
 end loop;return processed;
end$$;
revoke all on function private.cockpit_ticket_sla_sync(uuid,uuid),private.cockpit_ticket_sla_changed() from public,anon,authenticated,service_role;
revoke all on function public.cockpit_sla_maintenance(integer) from public,anon,authenticated,service_role;
grant execute on function public.cockpit_sla_maintenance(integer) to service_role;
