SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.cockpit_overview_operational (
  t       uuid,
  payload jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare today date;tz text;from_day date;until_day date;period text:=coalesce(payload->>'period','week');detail text:=payload->>'detail';sz integer:=coalesce((payload->>'pageSize')::integer,20);pg integer:=coalesce((payload->>'page')::integer,1);can_ops boolean;can_fin boolean;can_followup boolean;can_sla boolean;can_quality boolean;can_commercial boolean;visits jsonb;attention jsonb;graph jsonb;counts jsonb;total bigint;request_count bigint;aging jsonb;truncated boolean;begin
 perform private.cockpit_assert(t,'backoffice.overview.read');perform private.cockpit_assert(t,'backoffice.functions.cockpit_overview_query');
 if jsonb_typeof(payload) is distinct from 'object' or period not in('week','month') or exists(select 1 from jsonb_object_keys(payload)k where k not in('period','detail','page','pageSize')) or pg not between 1 and 100000 or sz not between 5 and 50 then raise exception 'Ongeldige overzichtselectie.' using errcode='22023';end if;
 select timezone into tz from public.tenants where id=t;today:=(now() at time zone tz)::date;
 from_day:=case period when 'week' then date_trunc('week',today::timestamp)::date else date_trunc('month',today::timestamp)::date end;until_day:=case period when 'week' then from_day+6 else(from_day+interval '1 month'-interval '1 day')::date end;
 if detail is not null and detail<>'all' and(detail!~'^\d{4}-\d{2}-\d{2}$' or nullif(detail,'all')::date<from_day or nullif(detail,'all')::date>until_day or(period='month' and extract(day from nullif(detail,'all')::date)::integer not in(1,8,15,22,29))) then raise exception 'Kies een meetgroep uit deze periode.' using errcode='22023';end if;
 can_ops:=private.work_order_access(t,false) and private.management_allowed(t,'backoffice.work_orders.read') and private.management_allowed(t,'backoffice.functions.work_order_operational_rows');
 can_fin:=private.commercial_access(t) and private.service_enabled(t,'finance') and private.management_allowed(t,'backoffice.finance.read') and private.management_allowed(t,'backoffice.functions.execution_invoice_concepts') and private.management_allowed(t,'backoffice.functions.cockpit_finance_query');
 can_followup:=private.cockpit_access(t,'backoffice.followup.read') and private.cockpit_access(t,'backoffice.functions.cockpit_followup');
 can_sla:=can_followup and private.service_enabled(t,'rapportage') and private.cockpit_access(t,'backoffice.sla.read') and private.management_allowed(t,'backoffice.functions.cockpit_sla_query');
 can_quality:=can_followup and private.service_enabled(t,'rapportage') and private.cockpit_scope(t,'quality') and private.cockpit_access(t,'backoffice.compliance.read');
 can_commercial:=private.service_enabled(t,'planning') and private.commercial_access(t) and private.management_allowed(t,'backoffice.commercial.read') and private.management_allowed(t,'backoffice.functions.commercial_list') and private.management_table_allowed(t,'requests',false);
 with recursive roots as(
  select w.id,w.id root,array[w.id] path,0 depth from public.work_orders w where w.tenant_id=t and can_ops and w.archive_at is null
  union all select q.id,r.source_order_id,q.path||r.source_order_id,q.depth+1 from roots q join public.work_order_relations r on r.tenant_id=t and r.target_order_id=q.root and r.kind='split' where not r.source_order_id=any(q.path) and q.depth<50
 ), identities as materialized(select distinct on(id) id,root from roots order by id,depth desc),
 grouped as materialized(
  select i.root id,min(w.id::text)::uuid source_id,min(w.work_order_number) fallback_number,min(case when private.object_manage(t) or private.management_allowed(t,'backoffice.functions.work_order_dossier') then coalesce((select o.name from public.objects o where o.tenant_id=t and o.id=w.object_id),'Locatie uit werkbon') else 'Afgeschermde locatie' end) fallback_title,
   min(coalesce(w.projected_start_at,w.planned_start_at,w.actual_start_at) at time zone tz)::date fallback_date,
   bool_and(w.actual_end_at is not null) executed,bool_and(w.status::text='invoiced') invoiced,
   bool_or(w.status::text in('returned','correction_required') or w.report_state::text in('returned','correction_required')) correction,
   bool_or(w.status::text='under_review' or w.report_state::text='review') needs_review,
   bool_and(w.status::text in('approved','invoice_ready','invoiced') or w.report_state::text='approved') approved,
   bool_or(w.actual_start_at is not null) started,bool_or(w.status::text='released') released,count(*) order_count
  from identities i join public.work_orders w on w.tenant_id=t and w.id=i.id where w.archive_at is null and w.status<>'cancelled' group by i.root
 ), visits as materialized(
  select g.*,coalesce(root.work_order_number,g.fallback_number) number,coalesce(case when private.object_manage(t) or private.management_allowed(t,'backoffice.functions.work_order_dossier') then(select o.name from public.objects o where o.tenant_id=t and o.id=root.object_id) end,g.fallback_title) title,
   coalesce((coalesce(root.projected_start_at,root.planned_start_at,root.actual_start_at) at time zone tz)::date,g.fallback_date) as day,
   case when g.invoiced then 'Gefactureerd' when g.correction then 'Correctie nodig' when g.needs_review then 'Te controleren' when g.approved then 'Goedgekeurd' when g.executed then 'Afgerond' when g.started then 'In uitvoering' when g.released then 'Vrijgegeven' else 'Gepland' end status
  from grouped g left join public.work_orders root on root.tenant_id=t and root.id=g.id
 ), period_rows as materialized(select * from visits where day between from_day and until_day),
 measured as materialized(select * from period_rows where detail='all' or(detail is not null and day>=nullif(detail,'all')::date and day<case period when 'week' then nullif(detail,'all')::date+1 else least(until_day+1,nullif(detail,'all')::date+7) end)),
 days as(select d::date as day,(row_number() over(order by d))::integer ordinal from generate_series(from_day::timestamp,until_day::timestamp,case period when 'week' then interval '1 day' else interval '7 days' end)d)
 select jsonb_build_object('active',(select count(*) from visits where not invoiced),'attention',(select count(*) from visits where correction or needs_review),'completed',(select count(*) from period_rows where status in('Afgerond','Goedgekeurd')),'review',(select count(*) from period_rows where needs_review),'planning',(select count(*) from period_rows where status in('Gepland','Vrijgegeven'))),
  coalesce((select jsonb_agg(jsonb_build_object('day',d.day,'name',case period when 'week' then(array['Ma','Di','Wo','Do','Vr','Za','Zo'])[d.ordinal] else 'Week '||d.ordinal end,'planned',(select count(*) from period_rows v where v.day>=d.day and v.day<case period when 'week' then d.day+1 else least(until_day+1,d.day+7) end),'executed',(select count(*) from period_rows v where v.executed and v.day>=d.day and v.day<case period when 'week' then d.day+1 else least(until_day+1,d.day+7) end)) order by d.day) from days d),'[]'),
  (select count(*) from measured),coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'sourceId',v.source_id,'number',v.number,'title',v.title,'date',v.day,'status',v.status,'orders',v.order_count) order by v.day,v.id) from(select * from measured order by day,id limit sz offset(least(pg,greatest(1,ceil((select count(*) from measured)::numeric/sz)::integer))-1)*sz)v),'[]'),
  coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'sourceId',v.source_id,'number',v.number,'title',v.title,'date',v.day,'status',v.status,'orders',v.order_count) order by v.day,v.id) from(select * from visits where correction or needs_review order by day nulls last,id limit 7)v),'[]'),
  exists(select 1 from roots r join public.work_order_relations rel on rel.tenant_id=t and rel.target_order_id=r.root and rel.kind='split' where(r.depth=50 and not rel.source_order_id=any(r.path)) or rel.source_order_id=any(r.path))
 into counts,graph,total,visits,attention,truncated;
 if truncated then raise exception 'De bezoekketen is niet volledig meetbaar. Controleer de oorspronkelijke werkbonnen.' using errcode='23514';end if;
 if can_commercial then select count(*) into request_count from public.requests r where r.tenant_id=t and r.archived_at is null and r.status not in('closed','rejected','processed','withdrawn');end if;
 if can_fin then select jsonb_build_object('current',coalesce(sum(i.total_cents-i.paid_cents) filter(where i.due_on>=today or i.due_on is null),0),'overdue',coalesce(sum(i.total_cents-i.paid_cents) filter(where i.due_on<today),0)) into aging from public.invoices i where i.tenant_id=t and i.status in('final','sent','partially_paid','overdue') and i.finalized_at is not null and i.total_cents>i.paid_cents;end if;
 return jsonb_build_object('today',today,'asOf',now(),'timezone',tz,'from',from_day,'until',until_day,'period',period,'graph',graph,'operational',counts,'attention',attention,'visits',visits,'measurementTotal',total,'page',least(pg,greatest(1,ceil(total::numeric/sz)::integer)),'pageSize',sz,'requests',request_count,'aging',aging,'access',jsonb_build_object('operation',can_ops,'review',private.service_enabled(t,'rapportage') and private.management_allowed(t,'backoffice.reports.read'),'commercial',can_commercial,'followup',can_followup,'finance',can_fin,'sla',can_sla,'quality',can_quality,'report',can_followup and private.service_enabled(t,'rapportage') and private.cockpit_access(t,'backoffice.reports.read') and private.management_allowed(t,'backoffice.functions.cockpit_reports_query')));
end$function$;

CREATE OR REPLACE FUNCTION private.cockpit_work_order_source_access (
  t uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$begin
 perform private.cockpit_assert(t,'backoffice.work_orders.read');perform private.cockpit_assert(t,'backoffice.functions.work_order_dossier');
 return jsonb_build_object('followup',private.cockpit_access(t,'backoffice.followup.read') and private.cockpit_access(t,'backoffice.functions.cockpit_followup'),
 'financial',private.cockpit_access(t,'backoffice.finance.read') and private.cockpit_access(t,'backoffice.functions.cockpit_finance_query') and private.cockpit_access(t,'backoffice.functions.execution_invoice_concepts') and private.cockpit_access(t,'backoffice.functions.cockpit_work_order_financial_sources') and private.commercial_access(t) and private.service_enabled(t,'finance'));
end$function$;

CREATE OR REPLACE FUNCTION public.cockpit_overview_query (
  target_tenant uuid,
  payload       jsonb DEFAULT '{}'::jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare result jsonb;a jsonb;begin
 result:=private.cockpit_overview_operational(target_tenant,payload);a:=result->'access';
 if(a->>'followup')::boolean then result:=result||jsonb_build_object('followup',public.cockpit_followup(target_tenant));end if;
 if(a->>'finance')::boolean then result:=result||jsonb_build_object('finance',public.cockpit_finance_query(target_tenant,'{"pageSize":5}'));end if;
 if(a->>'sla')::boolean then result:=result||jsonb_build_object('slaRisk',public.cockpit_sla_query(target_tenant,'{"pageSize":5,"status":"Risico"}'),'slaBreached',public.cockpit_sla_query(target_tenant,'{"pageSize":5,"status":"Overschreden"}'));end if;
 if(a->>'quality')::boolean then result:=result||jsonb_build_object('compliance',public.cockpit_governance_query(target_tenant,'compliance','{"pageSize":5,"filter":"attention"}'));end if;
 return result;
end$function$;

CREATE OR REPLACE FUNCTION public.cockpit_work_order_financial_sources (
  target_tenant uuid,
  target_order  uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare rows jsonb;total bigint;begin
 perform private.cockpit_finance_assert(target_tenant);perform private.management_assert(target_tenant,'backoffice.functions.cockpit_work_order_financial_sources');
 perform private.management_assert(target_tenant,'backoffice.work_orders.read');perform private.management_assert(target_tenant,'backoffice.functions.work_order_dossier');
 if not private.work_order_access(target_tenant,false) or not exists(select 1 from public.work_orders w where w.tenant_id=target_tenant and w.id=target_order) then raise exception 'Geen toegankelijk werkbondossier.' using errcode='42501';end if;
 with allowed as materialized(select row from private.cockpit_finance_task_rows(target_tenant,target_order)row union all select row||jsonb_build_object('description',(row->>'description')||' · openstaand factuurbedrag') from private.cockpit_finance_invoice_rows(target_tenant)row where exists(select 1 from public.invoice_lines l where l.tenant_id=target_tenant and l.work_order_id=target_order and l.invoice_id=(row->>'sourceId')::uuid))
 select count(*),coalesce((select jsonb_agg(jsonb_build_object('id',r.row->>'id','description',r.row->>'description','amountCents',(r.row->>'amountCents')::bigint,'category',r.row->>'category') order by r.row->>'id') from(select row from allowed order by row->>'id' limit 50)r),'[]') into total,rows from allowed;
 return jsonb_build_object('rows',rows,'total',total);
end$function$;

CREATE OR REPLACE FUNCTION public.cockpit_work_order_source (
  target_tenant uuid,
  target_order  uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare a jsonb;result jsonb;begin
 a:=private.cockpit_work_order_source_access(target_tenant);
 result:=jsonb_build_object('dossier',public.work_order_dossier(target_tenant,target_order),'followup',null,'financial',jsonb_build_object('rows','[]'::jsonb,'total',0));
 if(a->>'followup')::boolean then result:=result||jsonb_build_object('followup',public.cockpit_followup(target_tenant));end if;
 if(a->>'financial')::boolean then result:=result||jsonb_build_object('financial',public.cockpit_work_order_financial_sources(target_tenant,target_order));end if;
 return result;
end$function$;

CREATE OR REPLACE FUNCTION public.notification_command (
  target_tenant uuid,
  actor_context text,
  command       text,
  payload       jsonb,
  request_id    uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
<<notification_command>>
declare actor uuid:=auth.uid();ctx text:=actor_context;cmd text:=command;p jsonb:=payload;a jsonb;result jsonb;receipt private.notification_receipts;input_hash text;id uuid;expected bigint;rec public.notifications;c private.notification_campaigns;preview jsonb;candidate record;rid uuid;chan text[];code text;pol private.notification_policies;scope_name text;scope_tenant uuid;active_count integer;pref private.notification_preferences;entry jsonb;tmpl private.notification_templates;global_tmpl private.notification_templates;def jsonb;vid uuid;fields text[];row_count integer;
begin
 if request_id is null or cmd is null or not private.ticket_session_active(actor,nullif(auth.jwt()->>'session_id','')::uuid) or not private.notification_actor_active(target_tenant,ctx,actor) or jsonb_typeof(p) is distinct from 'object' or length(p::text)>60000 then raise exception 'Geen toegang of ongeldige opdracht' using errcode='42501';end if;
 a:=private.notification_access(target_tenant,ctx,actor);input_hash:=encode(extensions.digest(p::text,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('notification-command:'||request_id,0));
 select * into receipt from private.notification_receipts where notification_receipts.request_id=notification_command.request_id;
 if found then if receipt.actor_id<>actor or receipt.tenant_id is distinct from target_tenant or receipt.context<>ctx or receipt.command<>cmd or receipt.input_hash<>input_hash then raise exception 'Opdrachtsleutel hoort bij andere invoer' using errcode='23505';end if;return receipt.result;end if;
 if (select count(*) from private.notification_receipts where actor_id=actor and created_at>now()-interval '1 minute')>=120 then raise exception 'Te veel acties; probeer later opnieuw' using errcode='54000';end if;
 expected:=nullif(p->>'expected_revision','')::bigint;id:=nullif(coalesce(p->>'id',p->>'notification_id'),'')::uuid;
 if cmd='inbox_read_all' then
  if not coalesce((a->'permissions'->>'read_own')::boolean,false) then raise exception 'Geen inboxrecht' using errcode='42501';end if;
  update public.notifications set read_at=clock_timestamp(),revision=revision+1 where tenant_id is not distinct from target_tenant and context=ctx and user_id=actor and channel='in_app' and read_at is null and archived_at is null and(source_kind is null or source_kind not in('crm','management_report') or private.notification_source_allowed(tenant_id,coalesce(type_code,''),source_kind,source_id,source_revision,actor,ctx));
  get diagnostics row_count=row_count;result:=jsonb_build_object('ok',true,'count',row_count);
 elsif cmd in ('inbox_read','inbox_unread','inbox_archive','inbox_unarchive','inbox_ack') then
  if not coalesce((a->'permissions'->>'read_own')::boolean,false) then raise exception 'Geen inboxrecht' using errcode='42501';end if;
  select * into rec from public.notifications where notifications.id=notification_command.id and tenant_id is not distinct from target_tenant and context=ctx and user_id=actor and channel='in_app' for update;
  if not found or(rec.source_kind in('crm','management_report') and not private.notification_source_allowed(rec.tenant_id,coalesce(rec.type_code,''),rec.source_kind,rec.source_id,rec.source_revision,actor,ctx)) then raise exception 'Bericht niet beschikbaar' using errcode='42501';end if;
  if expected is not null and expected<>rec.revision then raise exception 'Bericht is gewijzigd' using errcode='40001';end if;
  if cmd='inbox_ack' and (not rec.ack_required or rec.withdrawn_at is not null or not private.notification_source_allowed(rec.tenant_id,coalesce(rec.type_code,''),rec.source_kind,rec.source_id,rec.source_revision,actor,ctx)) then raise exception 'Bevestiging niet mogelijk' using errcode='23514';end if;
  update public.notifications set read_at=case when cmd='inbox_read' then coalesce(read_at,clock_timestamp()) when cmd='inbox_unread' then null else read_at end,archived_at=case when cmd='inbox_archive' then coalesce(archived_at,clock_timestamp()) when cmd='inbox_unarchive' then null else archived_at end,acknowledged_at=case when cmd='inbox_ack' then coalesce(acknowledged_at,clock_timestamp()) else acknowledged_at end,revision=revision+1 where notifications.id=rec.id returning revision into expected;
  result:=jsonb_build_object('id',rec.id,'revision',expected);
 elsif cmd='policy_save' then
  scope_name:=p->>'scope';scope_tenant:=nullif(p->>'tenant_id','')::uuid;
  if scope_name is null or scope_name not in ('platform','tenant') or p->>'mode' is null or p->>'mode' not in ('inherit','on','off') or length(btrim(coalesce(p->>'reason','')))<3 or expected is null then raise exception 'Ongeldige beleidswijziging' using errcode='23514';end if;
  if ctx='platform' then
   if scope_name<>'platform' or not private.notification_cap(scope_tenant,actor,case when scope_tenant is null then 'platform.notifications.manage_global' else 'platform.notifications.manage_tenant' end) then raise exception 'Geen beleidsrecht' using errcode='42501';end if;
  elsif ctx<>'backoffice' or scope_name<>'tenant' or scope_tenant is distinct from target_tenant or not private.notification_cap(target_tenant,actor,'notifications.settings.manage') then raise exception 'Geen beleidsrecht' using errcode='42501';end if;
  if p->>'context'='platform' and ctx<>'platform' then raise exception 'Geen platforminstellingenrecht' using errcode='42501';end if;
  if p?'bundle_seconds' and p->'bundle_seconds'<>'null'::jsonb and(p->>'type_code' is distinct from 'work_order.rescheduled' or p->>'channel' is not null or jsonb_typeof(p->'bundle_seconds') is distinct from 'number' or(p->>'bundle_seconds')!~'^[0-9]{1,3}$' or(p->>'bundle_seconds')::integer not between 0 and 300) then raise exception 'Bundeling is 0–300 seconden en geldt alleen voor planningswijzigingen zonder kanaalfilter' using errcode='23514';end if;
  if scope_tenant is not null and not exists(select 1 from public.tenants where tenants.id=scope_tenant and status='active') then raise exception 'Organisatie niet beschikbaar' using errcode='23514';end if;
  perform pg_advisory_xact_lock(hashtextextended('fieldgrid-notification-policy',0));
  select * into pol from private.notification_policies where scope=scope_name and tenant_id is not distinct from scope_tenant and context is not distinct from (p->>'context') and type_code is not distinct from(p->>'type_code') and channel is not distinct from(p->>'channel') for update;
  if id is not null and pol.id is distinct from id then raise exception 'Beleidsdimensie is onveranderlijk' using errcode='23514';end if;
  if expected<>coalesce(pol.revision,0) then raise exception 'Beleid is gewijzigd' using errcode='40001';end if;
  if pol.id is null then insert into private.notification_policies(scope,tenant_id,context,type_code,channel,mode,updated_by) values(scope_name,scope_tenant,p->>'context',p->>'type_code',p->>'channel',p->>'mode',actor) returning * into pol;
  else update private.notification_policies set mode=p->>'mode',revision=revision+1,updated_by=actor,updated_at=clock_timestamp() where notification_policies.id=pol.id returning * into pol;end if;
  if p?'bundle_seconds' then update private.notification_policies set settings=case when p->'bundle_seconds'='null'::jsonb then settings-'bundle_seconds' else jsonb_set(settings,'{bundle_seconds}',p->'bundle_seconds') end where notification_policies.id=pol.id returning * into pol;end if;
  update private.notification_state set revision=revision+1,updated_at=clock_timestamp() where singleton;
  perform private.notification_suppress_requests();perform private.notification_suppress_pending();perform private.notification_suppress_deferred_mail();
  select count(*) into active_count from private.notification_provider_permits where state='admitted' and(scope_tenant is null or tenant_id=scope_tenant) and(pol.context is null or context=pol.context) and(pol.type_code is null or type_code=pol.type_code) and(pol.channel is null or channel=pol.channel);
  result:=jsonb_build_object('id',pol.id,'revision',pol.revision,'active_permits',active_count,'stopped',pol.mode='off' and active_count=0);
  insert into private.notification_audit(tenant_id,actor_id,action,resource_id,revision,detail) values(scope_tenant,actor,cmd,pol.id,pol.revision,jsonb_build_object('scope',pol.scope,'context',pol.context,'type_code',pol.type_code,'channel',pol.channel,'mode',pol.mode,'bundle_seconds',pol.settings->'bundle_seconds','reason',left(p->>'reason',2000)));
 elsif cmd='preferences_save' then
  if expected is null or jsonb_typeof(p->'email') is distinct from 'boolean' or jsonb_typeof(p->'push') is distinct from 'boolean' or not exists(select 1 from pg_timezone_names where name=p->>'timezone') or jsonb_typeof(p->'types') is distinct from 'array' or jsonb_array_length(p->'types')>200 then raise exception 'Ongeldige voorkeuren' using errcode='23514';end if;
  perform pg_advisory_xact_lock(hashtextextended('fieldgrid-notification-policy',0));
  perform pg_advisory_xact_lock(hashtextextended('notification-preference:'||actor||':'||coalesce(target_tenant::text,'')||':'||ctx,0));
  select * into pref from private.notification_preferences where tenant_id is not distinct from target_tenant and user_id=actor and context=ctx and type_code is null for update;
  if expected<>coalesce(pref.revision,0) then raise exception 'Voorkeuren zijn gewijzigd' using errcode='40001';end if;
  if pref.id is null then insert into private.notification_preferences(tenant_id,user_id,context,revision) values(target_tenant,actor,ctx,0) returning * into pref;end if;
  update private.notification_preferences set email=(p->>'email')::boolean,push=(p->>'push')::boolean,timezone=p->>'timezone',quiet_start=case when coalesce((p->>'quiet_enabled')::boolean,false) then(p->>'quiet_start')::time end,quiet_end=case when coalesce((p->>'quiet_enabled')::boolean,false) then(p->>'quiet_end')::time end,revision=revision+1,updated_at=clock_timestamp() where notification_preferences.id=pref.id returning revision into expected;
  for entry in select value from jsonb_array_elements(p->'types') loop
   if not exists(select 1 from public.notification_catalog where notification_catalog.code=entry->>'code' and ctx=any(contexts)) or jsonb_typeof(entry->'email') is distinct from 'boolean' or jsonb_typeof(entry->'push') is distinct from 'boolean' then raise exception 'Ongeldige typevoorkeur' using errcode='23514';end if;
   insert into private.notification_preferences(tenant_id,user_id,context,type_code,email,push) values(target_tenant,actor,ctx,entry->>'code',(entry->>'email')::boolean,(entry->>'push')::boolean) on conflict do nothing;
   update private.notification_preferences set email=(entry->>'email')::boolean,push=(entry->>'push')::boolean,revision=revision+1 where tenant_id is not distinct from target_tenant and user_id=actor and context=ctx and type_code=entry->>'code';
  end loop;
  update private.notification_requests nr set payload=jsonb_set(nr.payload,'{suppressed_routes}',coalesce(nr.payload->'suppressed_routes','[]'::jsonb)||(select coalesce(jsonb_agg(ctx||':'||v),'[]'::jsonb) from unnest(array['push','email'])v where not coalesce((private.notification_policy(nr.tenant_id,nr.type_code,ctx,v,actor)->>'allowed')::boolean,false))) where nr.prepared_at is null and nr.tenant_id is not distinct from target_tenant and nr.payload->>'context'=ctx and nr.payload->>'recipient_user_id'=actor::text;
  perform private.notification_suppress_pending();perform private.notification_suppress_deferred_mail();result:=jsonb_build_object('id',pref.id,'revision',expected);
 elsif cmd in ('template_save','template_publish','template_reset') then
  select * into tmpl from private.notification_templates where notification_templates.id=notification_command.id for update;
  if tmpl.id is null or expected is null or (ctx='platform' and (tmpl.tenant_id is not null or not private.notification_cap(null,actor,'platform.notifications.templates.manage'))) or(ctx<>'platform' and (ctx<>'backoffice' or tmpl.tenant_id is not null and tmpl.tenant_id<>target_tenant or not private.notification_cap(target_tenant,actor,'notifications.templates.override') or not exists(select 1 from public.notification_catalog where notification_catalog.code=tmpl.type_code and tenant_override))) then raise exception 'Geen templaterecht' using errcode='42501';end if;
  if (case when ctx<>'platform' and tmpl.tenant_id is null then (select revision from private.notification_template_versions where notification_template_versions.id=tmpl.active_version_id) else tmpl.revision end) is distinct from expected then raise exception 'Template is gewijzigd' using errcode='40001';end if;
  select * into global_tmpl from private.notification_templates where tenant_id is null and type_code=tmpl.type_code and context=tmpl.context and channel=tmpl.channel;
  if ctx<>'platform' and tmpl.tenant_id is null then
   insert into private.notification_templates(tenant_id,type_code,context,channel,revision,draft) values(target_tenant,tmpl.type_code,tmpl.context,tmpl.channel,expected,(select definition from private.notification_template_versions where notification_template_versions.id=tmpl.active_version_id)) on conflict do nothing;
   if not found then raise exception 'Er is inmiddels een eigen template; vernieuw' using errcode='40001';end if;
   select * into tmpl from private.notification_templates where tenant_id=target_tenant and type_code=tmpl.type_code and context=tmpl.context and channel=tmpl.channel for update;
  end if;
  def:=tmpl.draft;
  if cmd='template_reset' then
   if ctx='platform' then raise exception 'Platformdefault kan niet worden gereset' using errcode='23514';end if;
   select definition into def from private.notification_template_versions where notification_template_versions.id=global_tmpl.active_version_id;fields:=array[]::text[];
  else
   if p?'title' then def:=jsonb_set(def,'{title}',p->'title');end if;if p?'body' then def:=jsonb_set(def,'{body}',p->'body');end if;if p?'cta_label' then def:=jsonb_set(def,'{cta_label}',p->'cta_label');end if;
   if not private.notification_template_valid(tmpl.type_code,def) or(tmpl.channel='push' and not private.notification_push_template_safe(def)) then raise exception 'Gebruik geldige tekst en uitsluitend toegestane variabelen; push bevat maximaal 80/160 tekens en uitsluitend bedrijfsnaam' using errcode='23514';end if;
   select array_agg(k) into fields from unnest(array['title','body','cta_label'])k where def->k is distinct from(select definition->k from private.notification_template_versions where notification_template_versions.id=global_tmpl.active_version_id);
   fields:=coalesce(fields,array[]::text[]);
  end if;
  update private.notification_templates set draft=def,revision=revision+1,updated_by=actor,updated_at=clock_timestamp() where notification_templates.id=tmpl.id returning revision into expected;
  if cmd<>'template_save' then
   insert into private.notification_template_versions(template_id,revision,definition,base_version_id,actor_id) values(tmpl.id,expected,def,case when ctx<>'platform' then global_tmpl.active_version_id end,actor) returning notification_template_versions.id into vid;
   update private.notification_templates set active_version_id=vid,overridden_fields=case when ctx='platform' then array[]::text[] else fields end where notification_templates.id=tmpl.id;
  end if;
  insert into private.notification_audit(tenant_id,actor_id,action,resource_id,revision) values(case when ctx='platform' then null else target_tenant end,actor,cmd,tmpl.id,expected);
  result:=jsonb_build_object('id',tmpl.id,'revision',expected);
 elsif cmd like 'campaign_%' then
  if ctx not in ('platform','backoffice') or not(a->'permissions' @> '{"send_staff":true}' or a->'permissions' @> '{"send_customers":true}' or a->'permissions' @> '{"send_platform":true}') then raise exception 'Geen verzendrecht' using errcode='42501';end if;
  if id is not null then select * into c from private.notification_campaigns where notification_campaigns.id=notification_command.id and tenant_id is not distinct from target_tenant and context=ctx for update;if not found then raise exception 'Campagne niet beschikbaar' using errcode='42501';end if;end if;
  if expected is null or expected<>coalesce(c.revision,0) then raise exception 'Campagne is gewijzigd' using errcode='40001';end if;
  if c.id is not null and c.sender_id<>actor and cmd not in ('campaign_cancel','campaign_pause') then raise exception 'Alleen de afzender kan deze campagne wijzigen' using errcode='42501';end if;
  if cmd='campaign_save' then
   if c.id is not null and(c.state not in ('draft','scheduled','paused') or private.notification_campaign_started(c.id)) then raise exception 'Gestarte campagne is onveranderlijk; maak een nieuwe campagne' using errcode='23514';end if;
   if jsonb_typeof(p->'criteria') is distinct from 'object' or jsonb_typeof(p->'channels') is distinct from 'array' or length(btrim(coalesce(p->>'title',''))) not between 3 and 180 or length(btrim(coalesce(p->>'body',''))) not between 3 and 10000 or p->>'priority' is null or p->>'priority' not in ('normal','urgent') or not exists(select 1 from pg_timezone_names where name=p->>'timezone') or length(coalesce(p->>'action_label',''))>80 then raise exception 'Ongeldige campagne-invoer' using errcode='23514';end if;
   chan:=array(select distinct jsonb_array_elements_text(p->'channels'));if cardinality(chan)=0 or not chan<@array['in_app','push','email']::text[] then raise exception 'Kies geldige kanalen' using errcode='23514';end if;
   if p->>'scheduled_at' is not null and (not coalesce((a->'permissions'->>'schedule')::boolean,false) or(p->>'scheduled_at')::timestamptz<now()) then raise exception 'Kies een toekomstig verzendmoment met planningsrecht' using errcode='23514';end if;
   if p->>'expires_at' is not null and(p->>'expires_at')::timestamptz<=coalesce((p->>'scheduled_at')::timestamptz,now()) then raise exception 'Vervaldatum moet na verzending liggen' using errcode='23514';end if;
   if (p->>'source_kind' is null) is distinct from(p->>'source_id' is null) then raise exception 'Volledige bronrelatie vereist' using errcode='23514';end if;
   if p->>'source_kind' is not null and not((p->>'source_kind'='work_order' and exists(select 1 from public.work_orders w join public.objects o on o.tenant_id=w.tenant_id and o.id=w.object_id where w.id=(p->>'source_id')::uuid and w.tenant_id=target_tenant and w.archive_at is null and(private.notification_cap(target_tenant,actor,'notifications.send_staff',null,o.id,o.customer_id) or private.notification_cap(target_tenant,actor,'notifications.send_customers',null,o.id,o.customer_id)))) or(p->>'source_kind'='object' and exists(select 1 from public.objects o where o.tenant_id=target_tenant and o.id=(p->>'source_id')::uuid and o.dossier_status<>'archived' and(private.notification_cap(target_tenant,actor,'notifications.send_staff',null,o.id,o.customer_id) or private.notification_cap(target_tenant,actor,'notifications.send_customers',null,o.id,o.customer_id))))) then raise exception 'Bron niet beschikbaar voor deze verzendopdracht' using errcode='42501';end if;
   if c.id is null then insert into private.notification_campaigns(tenant_id,context,sender_id,title,body) values(target_tenant,ctx,actor,btrim(p->>'title'),btrim(p->>'body')) returning * into c;end if;
   update private.notification_campaigns set title=btrim(p->>'title'),body=btrim(p->>'body'),priority=p->>'priority',criteria=p->'criteria',channels=chan,scheduled_at=(p->>'scheduled_at')::timestamptz,expires_at=(p->>'expires_at')::timestamptz,timezone=p->>'timezone',ack_required=coalesce((p->>'ack_required')::boolean,false),action_label=nullif(btrim(p->>'action_label'),''),source_kind=p->>'source_kind',source_id=(p->>'source_id')::uuid,state='draft',confirmed_at=null,confirmed_revision=null,selection_token=null,revision=case when expected=0 then 1 else revision+1 end,updated_at=clock_timestamp() where notification_campaigns.id=c.id returning * into c;
  elsif cmd='campaign_publish' then
   if c.id is null or c.state<>'draft' then raise exception 'Alleen een concept kan worden bevestigd' using errcode='23514';end if;
   preview:=private.notification_recipients(target_tenant,ctx,actor,jsonb_build_object('criteria',c.criteria,'channels',c.channels));
   if p->>'selection_token' is null or p->>'selection_token' is distinct from preview->>'selection_token' then raise exception 'Ontvangers of beleid zijn gewijzigd; controleer de selectie opnieuw' using errcode='40001';end if;
   if coalesce((preview->'counts'->>'total')::integer,0)=0 then raise exception 'Geen bevoegde ontvangers geselecteerd' using errcode='23514';end if;
   if coalesce((preview->'counts'->>'reachable')::integer,0)=0 then raise exception 'Geen ontvanger bereikbaar via de gekozen kanalen; niets verzonden' using errcode='23514';end if;
   if (preview->'counts'->>'total')::integer>1 and ctx<>'platform' and not private.notification_cap(target_tenant,actor,'notifications.send_bulk') then raise exception 'Expliciet bulkverzendrecht vereist' using errcode='42501';end if;
   update private.notification_campaigns set state=case when scheduled_at>now() then 'scheduled' else 'processing' end,confirmed_at=clock_timestamp(),revision=revision+1,confirmed_revision=revision+1,selection_token=p->>'selection_token',updated_at=clock_timestamp() where notification_campaigns.id=c.id returning * into c;
   code:=case when ctx='platform' then 'manual.platform' else 'manual.tenant' end;
   for candidate in select distinct on(tenant_id,recipient_key,context) * from private.notification_candidates(target_tenant,ctx,actor,c.criteria) order by tenant_id,recipient_key,context,contact_id nulls first loop
    insert into private.notification_campaign_recipients(campaign_id,tenant_id,user_id,contact_id,recipient_key,context,label,channels,source_context) values(c.id,candidate.tenant_id,candidate.user_id,candidate.contact_id,candidate.recipient_key,candidate.context,candidate.label,array(select unnest(c.channels) intersect select unnest(candidate.channels)),candidate.source_context) on conflict(campaign_id,tenant_id,recipient_key,context) do update set user_id=excluded.user_id,contact_id=excluded.contact_id,label=excluded.label,channels=excluded.channels,source_context=excluded.source_context,confirmed_at=clock_timestamp() returning notification_campaign_recipients.id into rid;
    perform private.notification_enqueue(candidate.tenant_id,code,'campaign',rid,c.confirmed_revision::text,'campaign:'||c.id||':'||c.confirmed_revision||':'||rid,jsonb_build_object('campaign_id',c.id,'campaign_recipient_id',rid,'recipient_user_id',candidate.user_id,'contact_id',candidate.contact_id,'context',candidate.context,'channels',to_jsonb(array(select unnest(c.channels) intersect select unnest(candidate.channels))),'scheduled_at',c.scheduled_at,'expires_at',c.expires_at,'source_context',candidate.source_context,'path',private.notification_campaign_path(c,candidate.user_id,candidate.context,candidate.tenant_id)));
   end loop;
  elsif cmd='campaign_duplicate' then
   if c.id is null then raise exception 'Campagne ontbreekt' using errcode='23514';end if;
   insert into private.notification_campaigns(tenant_id,context,sender_id,title,body,priority,criteria,channels,timezone,ack_required,action_label,source_kind,source_id) values(c.tenant_id,c.context,actor,c.title,c.body,c.priority,c.criteria,c.channels,c.timezone,c.ack_required,c.action_label,c.source_kind,c.source_id) returning * into c;
  elsif cmd in ('campaign_pause','campaign_cancel','campaign_resume') then
   if c.id is null or not private.notification_campaign_allowed(c,actor,'cancel') then raise exception 'Geen intrekkingsrecht' using errcode='42501';end if;
   if(cmd='campaign_pause' and c.state not in ('scheduled','processing')) or(cmd='campaign_resume' and c.state<>'paused') or(cmd='campaign_cancel' and c.state in ('cancelled','expired')) then raise exception 'Ongeldige campagnestatus' using errcode='23514';end if;
   update private.notification_campaigns set state=case cmd when 'campaign_pause' then 'paused' when 'campaign_cancel' then 'cancelled' else case when scheduled_at>now() then 'scheduled' else 'processing' end end,revision=revision+1,updated_at=clock_timestamp() where notification_campaigns.id=c.id returning * into c;
   if cmd='campaign_cancel' then update public.notifications set withdrawn_at=clock_timestamp(),revision=revision+1 where campaign_id=c.id and withdrawn_at is null;end if;
  else raise exception 'Onbekende campagneactie' using errcode='23514';end if;
  insert into private.notification_audit(tenant_id,actor_id,action,resource_id,revision) values(target_tenant,actor,cmd,c.id,c.revision);result:=jsonb_build_object('id',c.id,'revision',c.revision);
 elsif cmd in ('grant_save','grant_revoke') then result:=private.notification_permissions_command(target_tenant,ctx,actor,cmd,p);
 elsif cmd='delivery_retry' then
  if not coalesce((a->'permissions'->>'delivery_retry')::boolean,false) then raise exception 'Geen herstelrecht' using errcode='42501';end if;result:=private.notification_delivery_command(target_tenant,ctx,actor,cmd,p);
 else raise exception 'Onbekende notificatieactie' using errcode='23514';end if;
 insert into private.notification_receipts(request_id,actor_id,tenant_id,context,command,input_hash,result) values(request_id,actor,target_tenant,ctx,cmd,input_hash,result);
 return result;
end$function$;

REVOKE ALL ON FUNCTION "private"."cockpit_overview_operational"(uuid, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."cockpit_overview_operational"(uuid, jsonb) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."cockpit_work_order_source_access"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."cockpit_work_order_source_access"(uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."cockpit_overview_query"(uuid, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."cockpit_overview_query"(uuid, jsonb) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."cockpit_work_order_financial_sources"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."cockpit_work_order_financial_sources"(uuid, uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."cockpit_work_order_source"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."cockpit_work_order_source"(uuid, uuid) TO "authenticated", "postgres";

