-- Complete bounded projections. No change to existing tenant business records.
-- Local wall-clock slots use the standard-time occurrence during autumn
-- overlap, consistently with crm_local_instant and the returned UTC instants.
create or replace function private.crm_slot(day date,slot time,exclude_id uuid default null) returns timestamptz language plpgsql security definer set search_path='' as $$
declare s private.crm_settings;instant timestamptz;local_now timestamp:=clock_timestamp() at time zone 'Europe/Amsterdam';begin
 select * into s from private.crm_settings where singleton for update;
 instant:=private.crm_local_instant(day,slot);
 if day is null or slot is null or day<local_now::date or day>local_now::date+s.horizon_days or not extract(dow from day)::integer=any(s.weekdays) or day=any(s.blocked_dates)
 or slot<s.start_time or (day+slot)+interval '30 minutes'>(day+s.end_time) or instant<clock_timestamp()+make_interval(hours=>s.lead_time_hours)
 or to_char(instant at time zone 'Europe/Amsterdam','YYYY-MM-DD HH24:MI')<>to_char(day+slot,'YYYY-MM-DD HH24:MI')
 or mod(extract(epoch from (slot-s.start_time))::integer,(30+s.buffer_minutes)*60)<>0
 then raise exception 'Kies een beschikbaar tijdslot.' using errcode='23P01';end if;
 if exists(select 1 from private.crm_appointments a where a.status<>'cancelled' and a.id is distinct from exclude_id and tstzrange(a.starts_at,a.reserved_until,'[)')&&tstzrange(instant,instant+make_interval(mins=>30+s.buffer_minutes),'[)')) then raise exception 'Dit tijdslot is intussen bezet. Kies een ander moment.' using errcode='23P01';end if;
 return instant;
end$$;
create or replace function public.crm_availability(day date) returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.crm_settings;slots jsonb;local_now timestamp:=clock_timestamp() at time zone 'Europe/Amsterdam';begin
 if auth.jwt()->>'role' is distinct from 'service_role' and not private.crm_admin() then raise exception 'Geen toegang.' using errcode='42501';end if;
 select * into s from private.crm_settings where singleton;
 if day is null or day<local_now::date or day>local_now::date+s.horizon_days or not extract(dow from day)::integer=any(s.weekdays) or day=any(s.blocked_dates) then slots:='[]';
 else
 select coalesce(jsonb_agg(to_char(v at time zone 'Europe/Amsterdam','HH24:MI') order by v),'[]') into slots
 from generate_series(day+s.start_time,day+s.end_time-interval '30 minutes',make_interval(mins=>30+s.buffer_minutes))wall cross join lateral(select wall at time zone 'Europe/Amsterdam' v)instant
 where v at time zone 'Europe/Amsterdam'=wall and v>=clock_timestamp()+make_interval(hours=>s.lead_time_hours) and not exists(select 1 from private.crm_appointments a where a.status<>'cancelled' and tstzrange(a.starts_at,a.reserved_until,'[)')&&tstzrange(v,v+make_interval(mins=>30+s.buffer_minutes),'[)'));
 end if;
 return jsonb_build_object('date',day,'slots',slots,'timezone','Europe/Amsterdam','durationMinutes',30);
end$$;
alter table public.tenants add constraint tenants_reserved_marketing_slug check(slug<>'www');
alter table private.crm_leads add column search_text text generated always as(lower(name||' '||company||' '||email||' '||phone||' '||sector)) stored;
alter table private.crm_requests add column search_text text generated always as(lower(coalesce(snapshot->>'name','')||' '||coalesce(snapshot->>'company','')||' '||coalesce(snapshot->>'email','')||' '||coalesce(snapshot->>'phone','')||' '||coalesce(snapshot->>'sector','')||' '||coalesce(snapshot->>'goal','')||' '||coalesce(snapshot->>'message',''))) stored;
create index crm_lead_search on private.crm_leads using gin(search_text extensions.gin_trgm_ops);
create index crm_request_search on private.crm_requests using gin(search_text extensions.gin_trgm_ops);
create or replace function private.crm_owner_valid(owner_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select owner_id is null or exists(select 1 from public.platform_admins a join auth.users u on u.id=a.user_id where a.user_id=owner_id and u.email_confirmed_at is not null and u.deleted_at is null and(u.banned_until is null or u.banned_until<now()))
$$;
create or replace function private.crm_lead_dto(l private.crm_leads) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',l.id,'name',l.name,'company',l.company,'email',l.email,'phone',l.phone,'sector',l.sector,'team',l.team,'stage',l.stage,'owner',coalesce(l.owner_id::text,''),'nextActionAt',l.next_action_at,'value',l.value,'source',l.source,'revision',l.revision,'isDemo',false,'createdAt',l.created_at,'updatedAt',l.updated_at,'latestKind',(select kind from private.crm_requests r where r.lead_id=l.id order by r.created_at desc,r.id limit 1))
$$;
create function private.crm_notification_projection(p jsonb,request_ids uuid[] default null,lead_uuid uuid default null) returns jsonb language sql stable security definer set search_path='' as $$
 with source as materialized(
  select r.id,r.lead_id,r.created_at,d.revision,d.snapshot,d.transport_snapshot,d.attempts,d.reason,d.sent_at,
   case d.state when 'sent' then 'accepted' when 'sending' then 'sending' when 'claimed' then 'queued' when 'uncertain' then 'uncertain' when 'deferred' then 'deferred' when 'suppressed' then 'suppressed' when 'cancelled' then 'cancelled' when 'expired' then 'expired' when 'failed' then 'failed' else case when private.crm_primary_admin() is null then 'pending_config' else 'queued' end end status
  from private.crm_requests r left join private.notification_requests n on n.source_kind='crm' and n.source_id=r.id
  left join private.notification_deliveries d on d.request_id=n.id and d.channel='email'
  where(request_ids is null or r.id=any(request_ids)) and(lead_uuid is null or r.lead_id=lead_uuid)
 ),filtered as(select * from source where coalesce(p->>'mailStatus','all')='all' or case when p->>'mailStatus'='action' then status in('pending_config','failed','uncertain','suppressed','expired') else status=p->>'mailStatus' end),
 paged as(select * from filtered order by created_at desc,id limit coalesce((p->>'pageSize')::integer,50) offset(coalesce((p->>'page')::integer,1)-1)*coalesce((p->>'pageSize')::integer,50))
 select jsonb_build_object('total',(select count(*) from filtered),'items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'leadId',lead_id,'requestId',id,'status',status,'recipient',coalesce(snapshot->>'recipient',(select email from auth.users where id=private.crm_primary_admin()),''),'revision',revision,'attempts',coalesce(attempts,0),'lastError',coalesce(reason,''),'acceptedAt',sent_at,'createdAt',created_at,'isDemo',false,'subject',snapshot->>'title','body',snapshot->>'body','transport',case when transport_snapshot is not null then jsonb_build_object('subject',transport_snapshot->>'subject','text',transport_snapshot->>'text') end) order by created_at desc,id) from paged),'[]'::jsonb))
$$;

create or replace function public.crm_query(operation text,payload jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$
<<crm_query>>
declare
 q text:=lower(btrim(coalesce(payload->>'search','')));pg integer:=coalesce((payload->>'page')::integer,1);sz integer:=coalesce((payload->>'pageSize')::integer,50);
 selected uuid:=nullif(payload->>'lead','')::uuid;tab text:=coalesce(payload->>'tab','pipeline');task_filter text:=coalesce(payload->>'taskFilter','open');
 detail_pg integer:=coalesce((payload->>'detailPage')::integer,1);detail_size integer:=coalesce((payload->>'detailPageSize')::integer,50);kind text:=coalesce(payload->>'kind','');owner_uuid uuid:=nullif(payload->>'owner','')::uuid;
 from_at timestamptz:=nullif(payload->>'from','')::date::timestamp at time zone 'Europe/Amsterdam';until_at timestamptz:=(nullif(payload->>'until','')::date+1)::timestamp at time zone 'Europe/Amsterdam';
 cancelled boolean:=coalesce((payload->>'showCancelled')::boolean,false);leads jsonb;reqs jsonb:='[]';tasks jsonb:='[]';appts jsonb:='[]';owners jsonb;counts jsonb;selection jsonb;detail jsonb;mail jsonb;
 lead_ids uuid[];request_ids uuid[];appointment_ids uuid[];lead private.crm_leads;total bigint:=0;stage_counts jsonb;
begin
 if not private.crm_admin() then raise exception 'Alleen platformbeheer heeft toegang.' using errcode='42501';end if;
 if jsonb_typeof(payload) is distinct from 'object' or length(q)>160 or pg not between 1 and 100000 or detail_pg not between 1 and 100000 or detail_size not between 5 and 100 or sz not between 5 and 100 or tab not in('pipeline','requests','agenda','tasks','settings') or task_filter not in('open','overdue','done','all') or kind not in('','trial','appointment','demo') then raise exception 'Ongeldige zoekopdracht.' using errcode='22023';end if;
 if operation='appointment' then return(select private.crm_appointment_dto(a)||jsonb_build_object('lead',private.crm_lead_dto(l)) from private.crm_appointments a join private.crm_leads l on l.id=a.lead_id where a.id=(payload->>'id')::uuid);end if;
 if operation not in('state','overview') then raise exception 'Onbekende zoekopdracht.' using errcode='22023';end if;
 select coalesce(jsonb_object_agg(stage,n),'{}') into stage_counts from(select stage,count(*)n from private.crm_leads group by stage)c;
 select jsonb_build_object('active',(select count(*) from private.crm_leads where stage not in('won','lost')),'value',(select coalesce(sum(value),0) from private.crm_leads where stage not in('won','lost')),'stages',stage_counts,
 'requests',(select count(*) from private.crm_requests),'recentRequests',(select count(*) from private.crm_requests where created_at>=(((now() at time zone 'Europe/Amsterdam')::date-6)::timestamp at time zone 'Europe/Amsterdam')),
 'appointments',(select count(*) from private.crm_appointments where status<>'cancelled' and ends_at>=now()),'requestedAppointments',(select count(*) from private.crm_appointments where status='requested' and ends_at>=now()),
 'overdueTasks',(select count(*) from private.crm_tasks where not completed and(due_at at time zone 'Europe/Amsterdam')::date<(now() at time zone 'Europe/Amsterdam')::date),'tasks',(select count(*) from private.crm_tasks where not completed),'followups',(select count(*) from private.crm_leads where stage not in('won','lost') and next_action_at is not null),
 'overdue',(select count(*) from private.crm_tasks where not completed and(due_at at time zone 'Europe/Amsterdam')::date<(now() at time zone 'Europe/Amsterdam')::date)+(select count(*) from private.crm_leads where stage not in('won','lost') and(next_action_at at time zone 'Europe/Amsterdam')::date<(now() at time zone 'Europe/Amsterdam')::date)) into counts;

 with matches as materialized(select l.* from private.crm_leads l where(tab<>'pipeline' or((q='' or l.search_text like '%'||q||'%') and(owner_uuid is null or l.owner_id=owner_uuid) and(crm_query.kind='' or exists(select 1 from private.crm_requests r where r.lead_id=l.id and r.kind=crm_query.kind)))))
 select coalesce((select array_agg(id) from(select id from matches order by created_at desc,id limit sz offset(pg-1)*sz)p),'{}'),(select count(*) from matches),coalesce((select jsonb_object_agg(stage,jsonb_build_object('count',n,'value',v)) from(select stage,count(*)n,coalesce(sum(value),0)v from matches group by stage)s),'{}') into lead_ids,total,selection;

 if operation='overview' or tab='requests' then
  select coalesce(jsonb_agg(private.crm_request_dto(r) order by r.created_at desc,r.id),'[]'),coalesce(array_agg(r.id),'{}') into reqs,request_ids
  from(select * from private.crm_requests r where(operation='overview' or(q='' or r.search_text like '%'||q||'%') and(crm_query.kind='' or r.kind=crm_query.kind)) order by r.created_at desc,r.id limit case when operation='overview' then 3 else sz end offset case when operation='overview' then 0 else(pg-1)*sz end)r;
  if operation<>'overview' then select count(*) into total from private.crm_requests r where(q='' or r.search_text like '%'||q||'%') and(crm_query.kind='' or r.kind=crm_query.kind);end if;
 end if;
 if operation='overview' or tab='tasks' then
  with matches as materialized(select t.* from private.crm_tasks t where(operation<>'overview' or not t.completed) and(operation='overview' or(q='' or lower(t.title) like '%'||q||'%') and case task_filter when 'all' then true when 'done' then t.completed when 'overdue' then not t.completed and(t.due_at at time zone 'Europe/Amsterdam')::date<(now() at time zone 'Europe/Amsterdam')::date else not t.completed end)),paged as(select * from matches order by due_at nulls last,id limit case when operation='overview' then 3 else sz end offset case when operation='overview' then 0 else(pg-1)*sz end)
  select coalesce((select jsonb_agg(private.crm_task_dto(t) order by t.due_at nulls last,t.id) from paged t),'[]'),case when operation='overview' then total else(select count(*) from matches) end into tasks,total;
 end if;
 if operation='overview' or tab='agenda' or tab='requests' then
  with matches as materialized(select a.* from private.crm_appointments a where case when operation='overview' then a.status<>'cancelled' and a.ends_at>=now() when tab='requests' then a.request_id=any(request_ids) else(cancelled or a.status<>'cancelled') and(from_at is null or a.starts_at>=from_at) and(until_at is null or a.starts_at<until_at) end),paged as(select * from matches order by starts_at,id limit case when operation='overview' then 3 else sz end offset case when operation='overview' or tab='requests' then 0 else(pg-1)*sz end)
  select coalesce((select jsonb_agg(private.crm_appointment_dto(a) order by a.starts_at,a.id) from paged a),'[]'),coalesce((select array_agg(id) from paged),'{}'),case when tab='agenda' and operation<>'overview' then(select count(*) from matches) else total end into appts,appointment_ids,total;
 end if;
 mail:=private.crm_notification_projection(case when tab='requests' then jsonb_build_object('page',1,'pageSize',sz) else payload end,case when tab='requests' then request_ids end);
 if tab='settings' then
  total:=(mail->>'total')::bigint;
  select coalesce(jsonb_agg(private.crm_request_dto(r) order by r.created_at desc,r.id),'[]') into reqs from private.crm_requests r where r.id in(select(x->>'requestId')::uuid from jsonb_array_elements(mail->'items')x);
 end if;
 with included as(select unnest(lead_ids)id union select(x->>'leadId')::uuid from jsonb_array_elements(reqs||tasks||appts)x where x->>'leadId' is not null union select id from(select id from private.crm_leads where operation='overview' and stage not in('won','lost') and next_action_at is not null order by next_action_at,id limit 3)f)
 select coalesce(jsonb_agg(private.crm_lead_dto(l) order by l.created_at desc,l.id),'[]') into leads from private.crm_leads l join included i on i.id=l.id;
 if selected is not null then
  select * into lead from private.crm_leads where id=selected;if not found then raise exception 'Lead niet beschikbaar.' using errcode='P0002';end if;
  select jsonb_build_object('lead',private.crm_lead_dto(lead),
   'requests',coalesce((select jsonb_agg(private.crm_request_dto(r) order by r.created_at desc,r.id) from(select * from private.crm_requests where lead_id=selected order by created_at desc,id limit detail_size offset(detail_pg-1)*detail_size)r),'[]'),
   'tasks',coalesce((select jsonb_agg(private.crm_task_dto(t) order by t.due_at nulls last,t.id) from(select * from private.crm_tasks where lead_id=selected order by due_at nulls last,id limit detail_size offset(detail_pg-1)*detail_size)t),'[]'),
   'appointments',coalesce((select jsonb_agg(private.crm_appointment_dto(a) order by a.starts_at desc,a.id) from(select * from private.crm_appointments where lead_id=selected order by starts_at desc,id limit detail_size offset(detail_pg-1)*detail_size)a),'[]'),
   'activities',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'leadId',a.lead_id,'type',a.type,'body',a.body,'createdAt',a.created_at,'isDemo',false,'actorId',a.actor_id) order by a.created_at desc,a.id) from(select * from private.crm_activities where lead_id=selected order by created_at desc,id limit detail_size offset(detail_pg-1)*detail_size)a),'[]'),
   'notifications',private.crm_notification_projection(jsonb_build_object('page',detail_pg,'pageSize',detail_size),null,selected)->'items',
   'totals',jsonb_build_object('requests',(select count(*) from private.crm_requests where lead_id=selected),'tasks',(select count(*) from private.crm_tasks where lead_id=selected),'openTasks',(select count(*) from private.crm_tasks where lead_id=selected and not completed),'activities',(select count(*) from private.crm_activities where lead_id=selected),'appointments',(select count(*) from private.crm_appointments where lead_id=selected)),'page',detail_pg,'pageSize',detail_size) into detail;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.user_id,'name',coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.email),'email',u.email) order by a.created_at,a.user_id),'[]') into owners from public.platform_admins a join auth.users u on u.id=a.user_id where private.crm_owner_valid(a.user_id);
 return jsonb_build_object('observedAt',now(),'leads',leads,'pageLeadIds',lead_ids,'pageAppointmentIds',coalesce(appointment_ids,'{}'),'selection',selection,'requests',reqs,'tasks',tasks,'appointments',appts,'activities','[]'::jsonb,'notifications',mail->'items','settings',private.crm_settings_dto(),'notificationContext',jsonb_build_object('provider','SendGrid','configuration','global','recipientEmail',(select email from auth.users where id=private.crm_primary_admin()),'recipientName',(select coalesce(nullif(raw_user_meta_data->>'full_name',''),email) from auth.users where id=private.crm_primary_admin()),'recipientSource',case when private.crm_primary_admin() is null then 'unresolved' else 'platform_admin' end,'providerConfigured',false),'mailConfigured',false,'owners',owners,'counts',counts,'detail',detail,'pagination',jsonb_build_object('page',pg,'pageSize',sz,'total',total));
end$$;
revoke all on function private.crm_notification_projection(jsonb,uuid[],uuid) from public,anon,authenticated,service_role;
notify pgrst,'reload schema';

-- A former administrator may retain general notification/support rights. CRM
-- bodies must disappear from both the definer inbox RPC and direct/Realtime RLS.
create policy crm_notification_current_scope on public.notifications for select to authenticated using(source_kind='crm' and private.notification_inbox_visible(id));
CREATE OR REPLACE FUNCTION public.notification_query(target_tenant uuid, actor_context text, operation text, payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
<<notification_query>>
declare actor uuid:=auth.uid();ctx text:=actor_context;p jsonb:=payload;a jsonb;items jsonb;pg integer;sz integer;result jsonb;rec public.notifications;c private.notification_campaigns;pref private.notification_preferences;code text;query_tenant uuid;
begin
 if not private.ticket_session_active(actor,nullif(auth.jwt()->>'session_id','')::uuid) or not private.notification_actor_active(target_tenant,ctx,actor) or jsonb_typeof(p) is distinct from 'object' or length(p::text)>60000 then raise exception 'Geen toegang' using errcode='42501';end if;
 a:=private.notification_access(target_tenant,ctx,actor);
 if operation='access' then return a||jsonb_build_object('timezone',coalesce((select timezone from public.tenants where id=target_tenant),'Europe/Amsterdam'));end if;
 pg:=greatest(1,coalesce((p->>'page')::integer,1));sz:=least(100,greatest(1,coalesce((p->>'page_size')::integer,25)));
 if operation in ('inbox','detail') then
  if not coalesce((a->'permissions'->>'read_own')::boolean,false) then raise exception 'Geen inboxrecht' using errcode='42501';end if;
  if operation='detail' then select * into rec from public.notifications where id=(p->>'notification_id')::uuid and tenant_id is not distinct from target_tenant and context=ctx and user_id=actor and channel='in_app';if not found or rec.source_kind in('product','crm') and not private.notification_source_allowed(rec.tenant_id,rec.type_code,rec.source_kind,rec.source_id,rec.source_revision,actor,ctx) then raise exception 'Bericht niet beschikbaar' using errcode='42501';end if;return private.notification_inbox_dto(rec,actor);end if;
  with own as(select n.*,coalesce(cat.category,'Algemeen') category,private.notification_inbox_dto(n,actor) dto from public.notifications n left join public.notification_catalog cat on cat.code=n.type_code where n.tenant_id is not distinct from target_tenant and n.context=ctx and n.user_id=actor and n.channel='in_app' and(n.source_kind is null or n.source_kind not in('product','crm') or private.notification_source_allowed(n.tenant_id,n.type_code,n.source_kind,n.source_id,n.source_revision,actor,ctx))),filtered as(select * from own where(case coalesce(p->>'view','all') when 'archived' then archived_at is not null when 'unread' then read_at is null and archived_at is null when 'action' then ack_required and acknowledged_at is null and archived_at is null else archived_at is null end) and(coalesce(p->>'category','')='' or category=p->>'category') and(coalesce(p->>'search','')='' or dto->>'title' ilike '%'||(p->>'search')||'%' or dto->>'body' ilike '%'||(p->>'search')||'%')),paged as(select id from filtered order by created_at desc,id desc limit sz offset(pg-1)*sz)
  select jsonb_build_object('items',(select coalesce(jsonb_agg(private.notification_inbox_dto(n,actor) order by n.created_at desc,n.id desc),'[]'::jsonb) from public.notifications n join paged using(id)),'total',(select count(*) from filtered),'unread_count',(select count(*) from own where read_at is null and archived_at is null),'page',pg,'page_size',sz,'categories',(select coalesce(jsonb_agg(jsonb_build_object('id',category,'label',category)),'[]'::jsonb) from(select distinct category from own)cat)) into result;return result;
 elsif operation in ('recipients','explain') then
  if not(a->'permissions' @> '{"send_staff":true}' or a->'permissions' @> '{"send_customers":true}' or a->'permissions' @> '{"send_platform":true}' or operation='explain' and(a->'permissions' @> '{"settings_manage":true}' or a->'permissions' @> '{"manage_global":true}' or a->'permissions' @> '{"manage_tenant":true}')) then raise exception 'Geen verzendrecht' using errcode='42501';end if;
  if operation='explain' and p->>'campaign_id' is not null then
   select * into c from private.notification_campaigns where id=(p->>'campaign_id')::uuid and tenant_id is not distinct from target_tenant and context=ctx;
   if not found or not private.notification_campaign_allowed(c,actor,'read') then raise exception 'Campagne niet beschikbaar' using errcode='42501';end if;
   p:=p||jsonb_build_object('criteria',c.criteria,'channels',c.channels,'type_code',case when ctx='platform' then 'manual.platform' else 'manual.tenant' end);
  end if;
  result:=private.notification_recipients(target_tenant,ctx,actor,p);
  if operation='recipients' then return result;end if;
  code:=coalesce(p->>'type_code',case when ctx='platform' then 'manual.platform' else 'manual.tenant' end);
  if not exists(select 1 from public.notification_catalog where notification_catalog.code=notification_query.code) then raise exception 'Onbekend notificatietype' using errcode='23514';end if;
  return jsonb_build_object('summary','Actuele ontvangers en kanaalregels. Voorbeelden bevatten fictieve gegevens; bevestig de selectie vóór verzending.','recipients',result,'channels',(select jsonb_agg(jsonb_build_object('channel',v)||private.notification_policy(target_tenant,notification_query.code,coalesce(p->>'target_context',cat.contexts[1]),v,null)) from public.notification_catalog cat cross join lateral unnest(cat.channels)v where cat.code=notification_query.code),
  'previews',(select jsonb_agg(jsonb_build_object('channel',v,'context',audience.context,'tenant_name',case when ctx='platform' then 'Fieldgrid' else coalesce((select name from public.tenants where id=audience.tenant_id),'Fieldgrid') end,'title',case when v='push' then replace(tmpl->>'title','{bedrijfsnaam}',coalesce(tmpl#>>'{branding,company}','Fieldgrid')) else coalesce(c.title,private.notification_preview_text(tmpl->>'title')) end,'body',case when v='push' then replace(tmpl->>'body','{bedrijfsnaam}',coalesce(tmpl#>>'{branding,company}','Fieldgrid')) else coalesce(c.body,private.notification_preview_text(tmpl->>'body')) end,'template_version',tmpl->'revision')) from public.notification_catalog cat cross join lateral unnest(cat.channels)v cross join lateral(select distinct (x->>'tenant_id')::uuid tenant_id,x->>'context' context from jsonb_array_elements(result->'recipients')x where c.id is not null union all select target_tenant,coalesce(p->>'target_context',cat.contexts[1]) where c.id is null)audience cross join lateral(select private.notification_template(case when ctx='platform' then null else audience.tenant_id end,notification_query.code,audience.context,v)tmpl)effective where cat.code=notification_query.code and(c.id is null or v=any(c.channels))),
  'warnings',case when exists(select 1 from public.notification_catalog where notification_catalog.code=notification_query.code and status<>'active') then jsonb_build_array('Dit type is nog niet actief; er vindt geen aflevering plaats.') else '[]'::jsonb end,'affected_tenants',(select count(distinct x->>'tenant_id') from jsonb_array_elements(result->'recipients')x));
 elsif operation in ('campaigns','campaign') then
  if not coalesce((a->'permissions'->>'sent_read')::boolean,false) then raise exception 'Geen toegang tot verzendhistorie' using errcode='42501';end if;
  if operation='campaign' then select * into c from private.notification_campaigns where id=coalesce(p->>'campaign_id',p->>'id')::uuid and tenant_id is not distinct from target_tenant and context=ctx;if not found or not private.notification_campaign_allowed(c,actor,'read') then raise exception 'Campagne niet beschikbaar' using errcode='42501';end if;return private.notification_campaign_dto(c,target_tenant,ctx,actor);end if;
  with filtered as(select * from private.notification_campaigns camp where camp.tenant_id is not distinct from target_tenant and camp.context=ctx and private.notification_campaign_allowed(camp,actor,'read') and(case when p->>'view'='scheduled' then camp.state in ('draft','scheduled','paused') else camp.state not in ('draft','scheduled','paused') end) and(coalesce(p->>'search','')='' or camp.title ilike '%'||(p->>'search')||'%')),paged as(select * from filtered order by created_at desc,id limit sz offset(pg-1)*sz)
  select jsonb_build_object('items',(select coalesce(jsonb_agg(private.notification_campaign_dto(paged,target_tenant,ctx,actor) order by created_at desc),'[]'::jsonb) from paged),'total',(select count(*) from filtered),'page',pg,'page_size',sz) into result;return result;
 elsif operation in ('catalog','rules') then
  if not(a->'permissions' @> '{"settings_manage":true}' or a->'permissions' @> '{"manage_global":true}' or a->'permissions' @> '{"manage_tenant":true}') then raise exception 'Geen instellingenrecht' using errcode='42501';end if;
  query_tenant:=case when ctx='platform' then nullif(p->>'tenant_id','')::uuid else target_tenant end;
  if ctx='platform' and query_tenant is not null and not private.notification_cap(query_tenant,actor,'platform.notifications.manage_tenant') then raise exception 'Geen tenantinstellingenrecht' using errcode='42501';end if;
  select coalesce(jsonb_agg(to_jsonb(cat)||jsonb_build_object('permissions',jsonb_build_object('edit',true,'explain',true)) order by cat.category,cat.name),'[]'::jsonb) into items from public.notification_catalog cat;
  select jsonb_build_object('rules',items,'impact',jsonb_build_object('active_tenant_count',case when query_tenant is not null then(select count(*) from public.tenants where id=query_tenant and status='active') when ctx='platform' and private.notification_cap(null,actor,'platform.notifications.manage_global') then(select count(*) from public.tenants where status='active') else null end,'global_active_tenant_count',case when ctx='platform' and private.notification_cap(null,actor,'platform.notifications.manage_global') then(select count(*) from public.tenants where status='active') else null end),'revision',(select revision from private.notification_state where singleton),'policies',(select coalesce(jsonb_agg(private.notification_policy_dto(x,query_tenant,ctx,actor)),'[]'::jsonb) from private.notification_policies x where(x.tenant_id is null or x.tenant_id=query_tenant)),'tenants',case when ctx='platform' then(select coalesce(jsonb_agg(jsonb_build_object('id',id,'label',name)),'[]'::jsonb) from public.tenants where status='active' and private.notification_cap(id,actor,'platform.notifications.manage_tenant')) else '[]'::jsonb end,'audit',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'label',x.action,'created_at',x.created_at)),'[]'::jsonb) from(select id,action,created_at from private.notification_audit where tenant_id is not distinct from query_tenant and action in ('policy_save','template_save','template_publish','template_reset') order by created_at desc limit 100)x)) into result;
  if not exists(select 1 from private.notification_policies where tenant_id is not distinct from query_tenant and scope=case when ctx='platform' then 'platform' else 'tenant' end and context is null and type_code is null and channel is null) then result:=jsonb_set(result,'{policies}',(result->'policies')||jsonb_build_array(private.notification_policy_dto(jsonb_populate_record(null::private.notification_policies,jsonb_build_object('id',null,'scope',case when ctx='platform' then 'platform' else 'tenant' end,'tenant_id',query_tenant,'mode','inherit','revision',0,'settings','{}'::jsonb)),query_tenant,ctx,actor)));end if;return result;
 elsif operation in ('templates','template') then
  if not(a->'permissions' @> '{"templates_manage":true}' or a->'permissions' @> '{"templates_override":true}') then raise exception 'Geen templaterecht' using errcode='42501';end if;
  if operation='template' then result:=private.notification_template_dto(target_tenant,ctx,actor,(p->>'id')::uuid);if result is null then raise exception 'Template niet beschikbaar' using errcode='42501';end if;return result;end if;
  select coalesce(jsonb_agg(private.notification_template_dto(target_tenant,ctx,actor,id) order by type_code,context,channel),'[]'::jsonb) into items from(select distinct on(type_code,context,channel) * from private.notification_templates where (ctx='platform' and tenant_id is null) or(ctx<>'platform' and(tenant_id is null or tenant_id=target_tenant)) order by type_code,context,channel,tenant_id nulls last)x;
  return jsonb_build_object('items',items);
 elsif operation='preferences' then
  select * into pref from private.notification_preferences where tenant_id is not distinct from target_tenant and user_id=actor and context=ctx and type_code is null;
  return jsonb_build_object('revision',coalesce(pref.revision,0),'email',coalesce(pref.email,true),'push',coalesce(pref.push,true),'quiet_enabled',pref.quiet_start is not null,'quiet_start',pref.quiet_start,'quiet_end',pref.quiet_end,'timezone',coalesce(pref.timezone,(select timezone from public.tenants where id=target_tenant),'Europe/Amsterdam'),'types',(select coalesce(jsonb_agg(jsonb_build_object('code',cat.code,'name',cat.name,'channels',cat.channels,'email',coalesce(pf.email,true),'push',coalesce(pf.push,true),'reason',private.notification_policy(target_tenant,cat.code,ctx,'email',actor)->>'reason')),'[]'::jsonb) from public.notification_catalog cat left join private.notification_preferences pf on pf.tenant_id is not distinct from target_tenant and pf.context=ctx and pf.user_id=actor and pf.type_code=cat.code where ctx=any(cat.contexts)));
 elsif operation='permissions' then return private.notification_permissions_query(target_tenant,ctx,actor,p);
 elsif operation in ('deliveries','devices') then
  if operation='deliveries' and not coalesce((a->'permissions'->>'delivery_read')::boolean,false) then raise exception 'Geen afleverrecht' using errcode='42501';end if;
  return private.notification_delivery_query(target_tenant,ctx,actor,operation,p);
 end if;
 raise exception 'Onbekende notificatievraag' using errcode='23514';
end$function$;

notify pgrst,'reload schema';

-- Inbox mutations use the same current CRM source authorization.
CREATE OR REPLACE FUNCTION public.notification_command(target_tenant uuid, actor_context text, command text, payload jsonb, request_id uuid)
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
  update public.notifications set read_at=clock_timestamp(),revision=revision+1 where tenant_id is not distinct from target_tenant and context=ctx and user_id=actor and channel='in_app' and read_at is null and archived_at is null and(source_kind is distinct from 'crm' or private.notification_source_allowed(tenant_id,coalesce(type_code,''),source_kind,source_id,source_revision,actor,ctx));
  get diagnostics row_count=row_count;result:=jsonb_build_object('ok',true,'count',row_count);
 elsif cmd in ('inbox_read','inbox_unread','inbox_archive','inbox_unarchive','inbox_ack') then
  if not coalesce((a->'permissions'->>'read_own')::boolean,false) then raise exception 'Geen inboxrecht' using errcode='42501';end if;
  select * into rec from public.notifications where notifications.id=notification_command.id and tenant_id is not distinct from target_tenant and context=ctx and user_id=actor and channel='in_app' for update;
  if not found or(rec.source_kind='crm' and not private.notification_source_allowed(rec.tenant_id,coalesce(rec.type_code,''),rec.source_kind,rec.source_id,rec.source_revision,actor,ctx)) then raise exception 'Bericht niet beschikbaar' using errcode='42501';end if;
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


notify pgrst,'reload schema';
