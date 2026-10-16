SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.crm_command (
  command    text,
  payload    jsonb,
  request_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
<<crm_command>>
declare actor uuid:=auth.uid();h text;receipt private.crm_receipts;result jsonb:='{"ok":true}';l private.crm_leads;t private.crm_tasks;a private.crm_appointments;s private.crm_settings;id uuid;ts timestamptz;owner_id uuid;delivery private.notification_deliveries;begin
 if not private.crm_admin() then raise exception 'Alleen platformbeheer heeft toegang.' using errcode='42501';end if;
 if request_id is null or command is null or jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>24000 then raise exception 'Ongeldige opdracht.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('crm-command:'||actor::text||request_id::text,0));
 perform private.crm_lock_actor();
 h:=encode(extensions.digest(command||payload::text,'sha256'),'hex');
 select * into receipt from private.crm_receipts where scope=actor::text and crm_receipts.request_id=crm_command.request_id;
 if found then if receipt.input_hash<>h then raise exception 'Opdracht gewijzigd.' using errcode='23514';end if;return receipt.result;end if;
 if payload ? 'owner' then
  owner_id:=nullif(payload->>'owner','')::uuid;
  if not private.crm_owner_valid(owner_id) then raise exception 'Kies een actieve platformbeheerder.' using errcode='22023';end if;
 end if;
 if command in('appointment.create','appointment.update','settings.update') then select * into s from private.crm_settings where singleton for update;end if;
 perform private.crm_lock_actor();
 if command='lead.create' then
  if exists(select 1 from jsonb_object_keys(payload)k where k not in('name','company','email','phone','sector','team','owner','stage')) then raise exception 'Ongeldige velden.' using errcode='22023';end if;
  insert into private.crm_leads(name,company,email,phone,sector,team,owner_id,source,stage)
  values(btrim(payload->>'name'),btrim(payload->>'company'),lower(btrim(payload->>'email')),coalesce(payload->>'phone',''),coalesce(payload->>'sector',''),coalesce(payload->>'team',''),case when payload?'owner' then owner_id else actor end,'Handmatig',coalesce(payload->>'stage','new'))
  on conflict(normalized_company,normalized_email) do nothing returning * into l;
  if not found then select * into l from private.crm_leads where normalized_company=lower(btrim(payload->>'company')) and normalized_email=lower(btrim(payload->>'email'));result:=result||jsonb_build_object('existing',true);else insert into private.crm_activities(lead_id,type,body,actor_id) values(l.id,'created','Lead handmatig toegevoegd',actor);end if;
  id:=l.id;result:=result||jsonb_build_object('leadId',id);
 elsif command in('lead.update','lead.activity') then
  id:=(payload->>'id')::uuid;select * into l from private.crm_leads where crm_leads.id=crm_command.id for update;
  if not found then raise exception 'Lead niet beschikbaar.' using errcode='P0002';end if;
  perform private.crm_lock_actor();
  if command='lead.activity' then
   if exists(select 1 from jsonb_object_keys(payload)k where k not in('id','body')) or length(btrim(coalesce(payload->>'body',''))) not between 1 and 10000 then raise exception 'Vul een notitie in.' using errcode='22023';end if;
   insert into private.crm_activities(lead_id,type,body,actor_id) values(id,'note',btrim(payload->>'body'),actor);
  else
   if exists(select 1 from jsonb_object_keys(payload)k where k not in('id','revision','stage','owner','nextActionAt','value')) then raise exception 'Ongeldige velden.' using errcode='22023';end if;
   if (payload->>'revision')::integer is distinct from l.revision then raise exception 'Dit dossier is intussen gewijzigd. Vernieuw eerst.' using errcode='40001';end if;
   update private.crm_leads set stage=coalesce(payload->>'stage',stage),owner_id=case when payload?'owner' then crm_command.owner_id else crm_leads.owner_id end,next_action_at=case when payload?'nextActionAt' then nullif(payload->>'nextActionAt','')::timestamptz else next_action_at end,value=coalesce((payload->>'value')::numeric,value),revision=revision+1,updated_at=clock_timestamp() where crm_leads.id=crm_command.id;
   insert into private.crm_activities(lead_id,type,body,actor_id) values(id,'updated',case when payload?'stage' and payload->>'stage'<>l.stage then 'Fase: '||l.stage||' → '||(payload->>'stage') else 'Dossier bijgewerkt' end,actor);
  end if;
 elsif command in('task.create','task.update') then
  if exists(select 1 from jsonb_object_keys(payload)k where k not in('id','revision','leadId','title','dueAt','owner','completed')) then raise exception 'Ongeldige velden.' using errcode='22023';end if;
  if command='task.create' then
   insert into private.crm_tasks(lead_id,title,due_at,owner_id) values(nullif(payload->>'leadId','')::uuid,btrim(payload->>'title'),nullif(payload->>'dueAt','')::timestamptz,case when payload?'owner' then owner_id else actor end) returning * into t;
  else
   select * into t from private.crm_tasks where crm_tasks.id=(payload->>'id')::uuid for update;
   if not found then raise exception 'Taak niet beschikbaar.' using errcode='P0002';end if;
  perform private.crm_lock_actor();
   if (payload->>'revision')::integer is distinct from t.revision then raise exception 'Deze taak is intussen gewijzigd.' using errcode='40001';end if;
   update private.crm_tasks set title=coalesce(payload->>'title',title),due_at=case when payload?'dueAt' then nullif(payload->>'dueAt','')::timestamptz else due_at end,owner_id=case when payload?'owner' then crm_command.owner_id else crm_tasks.owner_id end,completed=coalesce((payload->>'completed')::boolean,completed),revision=revision+1,updated_at=clock_timestamp() where crm_tasks.id=t.id returning * into t;
  end if;
  id:=t.id;result:=result||jsonb_build_object('taskId',id);
  if t.lead_id is not null then insert into private.crm_activities(lead_id,type,body,actor_id) values(t.lead_id,'task',case when t.completed then 'Taak afgerond: ' else 'Opvolgtaak: ' end||t.title,actor);end if;
 elsif command in('appointment.create','appointment.update') then
  if exists(select 1 from jsonb_object_keys(payload)k where k not in('id','revision','leadId','date','time','action')) then raise exception 'Ongeldige velden.' using errcode='22023';end if;
  if command='appointment.create' then
   if not exists(select 1 from private.crm_leads where crm_leads.id=(payload->>'leadId')::uuid) then raise exception 'Kies een lead.' using errcode='22023';end if;
   ts:=private.crm_slot((payload->>'date')::date,(payload->>'time')::time);
   insert into private.crm_appointments(lead_id,starts_at,ends_at,reserved_until,status) values((payload->>'leadId')::uuid,ts,ts+interval '30 minutes',ts+make_interval(mins=>30+s.buffer_minutes),'confirmed') returning * into a;
  else
   select * into a from private.crm_appointments where crm_appointments.id=(payload->>'id')::uuid for update;
   if not found then raise exception 'Afspraak niet beschikbaar.' using errcode='P0002';end if;
  perform private.crm_lock_actor();
   if (payload->>'revision')::integer is distinct from a.revision then raise exception 'Deze afspraak is intussen gewijzigd.' using errcode='40001';end if;
   if payload->>'action'='reschedule' and a.status<>'cancelled' then
    ts:=private.crm_slot((payload->>'date')::date,(payload->>'time')::time,a.id);
    update private.crm_appointments set starts_at=ts,ends_at=ts+interval '30 minutes',reserved_until=ts+make_interval(mins=>30+s.buffer_minutes),revision=revision+1,updated_at=clock_timestamp() where crm_appointments.id=a.id returning * into a;
   elsif payload->>'action' in('confirm','cancel') then
    if a.status='cancelled' and payload->>'action'='confirm' then raise exception 'Plan een nieuwe afspraak.' using errcode='22023';end if;
    update private.crm_appointments set status=case payload->>'action' when 'confirm' then 'confirmed' else 'cancelled' end,revision=revision+1,updated_at=clock_timestamp() where crm_appointments.id=a.id returning * into a;
   else raise exception 'Ongeldige afspraakactie.' using errcode='22023';end if;
  end if;
  id:=a.id;result:=result||jsonb_build_object('appointmentId',id);
  insert into private.crm_activities(lead_id,type,body,actor_id) values(a.lead_id,'appointment',case a.status when 'cancelled' then 'Telefonische afspraak geannuleerd' else 'Telefonische afspraak: '||to_char(a.starts_at at time zone 'Europe/Amsterdam','DD-MM-YYYY HH24:MI') end,actor);
 elsif command='settings.update' then
  if exists(select 1 from jsonb_object_keys(payload)k where k not in('weekdays','startTime','endTime','durationMinutes','bufferMinutes','leadTimeHours','horizonDays','blockedDates','emailEnabled','timezone','revision')) or coalesce((payload->>'durationMinutes')::integer,30)<>30 or coalesce(payload->>'timezone','Europe/Amsterdam')<>'Europe/Amsterdam' then raise exception 'Ongeldige agenda-instellingen.' using errcode='22023';end if;
  if (payload->>'revision')::integer is distinct from s.revision then raise exception 'Instellingen zijn intussen gewijzigd.' using errcode='40001';end if;
  update private.crm_settings set weekdays=case when payload?'weekdays' then array(select jsonb_array_elements_text(payload->'weekdays')::integer) else weekdays end,start_time=coalesce((payload->>'startTime')::time,start_time),end_time=coalesce((payload->>'endTime')::time,end_time),buffer_minutes=coalesce((payload->>'bufferMinutes')::integer,buffer_minutes),lead_time_hours=coalesce((payload->>'leadTimeHours')::integer,lead_time_hours),horizon_days=coalesce((payload->>'horizonDays')::integer,horizon_days),blocked_dates=case when payload?'blockedDates' then array(select jsonb_array_elements_text(payload->'blockedDates')::date) else blocked_dates end,email_enabled=coalesce((payload->>'emailEnabled')::boolean,email_enabled),revision=revision+1,updated_at=clock_timestamp() where singleton;
 elsif command='notification.retry' then
  select d.* into delivery from private.notification_deliveries d join private.notification_requests n on n.id=d.request_id where n.source_kind='crm' and n.source_id=(crm_command.payload->>'id')::uuid and d.channel='email' for update of d;
  if not found then raise exception 'Verwerking wacht op de beheeridentiteit of centrale worker.' using errcode='23514';end if;
  perform private.crm_lock_actor();
  result:=result||private.notification_delivery_command(null,'platform',actor,'delivery_retry',jsonb_build_object('id',delivery.id,'version',payload->'revision'));
  id:=delivery.id;
 else raise exception 'Onbekende CRM-opdracht.' using errcode='22023';end if;
 insert into private.crm_audit(actor_id,command,record_id,details) values(actor,command,id,jsonb_build_object('requestId',request_id));
 insert into private.crm_receipts(scope,request_id,input_hash,result) values(actor::text,request_id,h,result);
 return result;
end$function$;

CREATE OR REPLACE FUNCTION public.crm_query (
  operation text,
  payload   jsonb DEFAULT '{}'::jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
 return jsonb_build_object('observedAt',now(),'leads',leads,'pageLeadIds',lead_ids,'pageAppointmentIds',coalesce(appointment_ids,'{}'),'selection',selection,'requests',reqs,'tasks',tasks,'appointments',appts,'activities','[]'::jsonb,'notifications',mail->'items','settings',private.crm_settings_dto(),'notificationContext',jsonb_build_object('provider','SendGrid','configuration','global','recipientEmail',(select email from auth.users where id=private.crm_primary_admin()),'recipientName',(select coalesce(nullif(raw_user_meta_data->>'full_name',''),email) from auth.users where id=private.crm_primary_admin()),'recipientSource',case when private.crm_primary_admin() is null then 'unresolved' else 'platform_admin' end,'providerConfigured', false, 'canRetry', private.notification_cap(null,auth.uid(),'platform.notifications.delivery.retry')),'mailConfigured',false,'owners',owners,'counts',counts,'detail',detail,'pagination',jsonb_build_object('page',pg,'pageSize',sz,'total',total));
end$function$;

