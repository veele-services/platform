-- Platform sales CRM. Additive migration; never imports prototype records.
-- The private tables are accessible only through the narrow RPCs below.
create table private.crm_settings (
 singleton boolean primary key default true check(singleton),
 weekdays integer[] not null default array[1,2,3,4,5] check(weekdays <@ array[0,1,2,3,4,5,6] and cardinality(weekdays)>0),
 start_time time not null default '09:00', end_time time not null default '17:00',
 buffer_minutes integer not null default 15 check(buffer_minutes between 0 and 120),
 lead_time_hours integer not null default 4 check(lead_time_hours between 0 and 720),
 horizon_days integer not null default 60 check(horizon_days between 1 and 365),
 blocked_dates date[] not null default '{}', email_enabled boolean not null default true,
 primary_admin uuid references auth.users(id) on delete set null,
 revision integer not null default 1, updated_at timestamptz not null default clock_timestamp(), check(end_time>start_time)
);
-- Deterministic registered administrator, never the first arbitrary Auth user.
insert into private.crm_settings(singleton,primary_admin)
select true,(select a.user_id from public.platform_admins a join auth.users u on u.id=a.user_id where u.deleted_at is null order by a.created_at,a.user_id limit 1);
create table private.crm_leads (
 id uuid primary key default gen_random_uuid(), name text not null check(length(btrim(name)) between 1 and 160),
 company text not null check(length(btrim(company)) between 1 and 180), email text not null check(length(email)<=254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 phone text not null default '' check(length(phone)<=40), sector text not null default '' check(length(sector)<=120), team text not null default '' check(length(team)<=100),
 stage text not null default 'new' check(stage in('new','contacted','scheduled','proposal','trial','won','lost')),
 owner_id uuid references auth.users(id) on delete set null, next_action_at timestamptz,
 value numeric(14,2) not null default 0 check(value between 0 and 999999999.99), source text not null default 'Website',
 revision integer not null default 1, created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 normalized_company text generated always as(lower(btrim(company))) stored,
 normalized_email text generated always as(lower(btrim(email))) stored, unique(normalized_company,normalized_email)
);
create index crm_leads_pipeline on private.crm_leads(stage,created_at desc,id);
create index crm_leads_followup on private.crm_leads(next_action_at,id) where stage not in('won','lost') and next_action_at is not null;
create index crm_leads_owner on private.crm_leads(owner_id,created_at desc,id);
create table private.crm_requests (
 id uuid primary key default gen_random_uuid(),lead_id uuid not null references private.crm_leads(id),
 kind text not null check(kind in('trial','appointment','demo')),snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
 created_at timestamptz not null default clock_timestamp()
);
create index crm_requests_recent on private.crm_requests(created_at desc,id);
create index crm_requests_lead on private.crm_requests(lead_id,created_at desc,id);
create table private.crm_activities (
 id uuid primary key default gen_random_uuid(),lead_id uuid not null references private.crm_leads(id),
 type text not null,body text not null check(length(body) between 1 and 10000),actor_id uuid references auth.users(id),created_at timestamptz not null default clock_timestamp()
);
create index crm_activities_lead on private.crm_activities(lead_id,created_at desc,id);
create table private.crm_tasks (
 id uuid primary key default gen_random_uuid(),lead_id uuid references private.crm_leads(id),request_id uuid unique references private.crm_requests(id),
 title text not null check(length(btrim(title)) between 1 and 250),due_at timestamptz,owner_id uuid references auth.users(id),completed boolean not null default false,
 revision integer not null default 1,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp()
);
create index crm_tasks_due on private.crm_tasks(completed,due_at,id);
create index crm_tasks_lead on private.crm_tasks(lead_id,created_at desc,id);
create table private.crm_appointments (
 id uuid primary key default gen_random_uuid(),lead_id uuid not null references private.crm_leads(id),request_id uuid unique references private.crm_requests(id),
 starts_at timestamptz not null, ends_at timestamptz not null, reserved_until timestamptz not null,
 status text not null default 'requested' check(status in('requested','confirmed','cancelled')),
 revision integer not null default 1,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 check(ends_at=starts_at+interval '30 minutes' and reserved_until>=ends_at),
 exclude using gist (tstzrange(starts_at,reserved_until,'[)') with &&) where(status<>'cancelled')
);
create index crm_appointments_upcoming on private.crm_appointments(starts_at,id) where status<>'cancelled';
create index crm_appointments_lead on private.crm_appointments(lead_id,starts_at,id);
create table private.crm_receipts (
 scope text not null,request_id uuid not null,input_hash text not null,result jsonb not null,created_at timestamptz not null default clock_timestamp(),primary key(scope,request_id)
);
create table private.crm_rate_windows (
 key text not null,bucket timestamptz not null,hits integer not null default 1,primary key(key,bucket)
);
create table private.crm_audit (
 id uuid primary key default gen_random_uuid(),actor_id uuid references auth.users(id),command text not null,record_id uuid,details jsonb not null default '{}',created_at timestamptz not null default clock_timestamp()
);
do $$declare n text;begin
 foreach n in array array['crm_settings','crm_leads','crm_requests','crm_activities','crm_tasks','crm_appointments','crm_receipts','crm_rate_windows','crm_audit'] loop
 execute format('alter table private.%I enable row level security',n);execute format('alter table private.%I force row level security',n);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',n);
 end loop;
end$$;

create function private.crm_admin() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(private.actor_session_active() and private.product_platform(auth.uid()),false)
$$;
create function private.crm_primary_admin() returns uuid language sql stable security definer set search_path='' as $$
 select s.primary_admin from private.crm_settings s join public.platform_admins a on a.user_id=s.primary_admin join auth.users u on u.id=a.user_id
 where s.singleton and u.deleted_at is null and u.email_confirmed_at is not null and(u.banned_until is null or u.banned_until<now()) and u.email is not null
$$;
create function private.crm_owner_valid(owner_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select owner_id is null or exists(select 1 from public.platform_admins a join auth.users u on u.id=a.user_id where a.user_id=owner_id and u.deleted_at is null and(u.banned_until is null or u.banned_until<now()))
$$;
create function private.crm_settings_dto() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('weekdays',weekdays,'startTime',to_char(start_time,'HH24:MI'),'endTime',to_char(end_time,'HH24:MI'),'durationMinutes',30,'bufferMinutes',buffer_minutes,'leadTimeHours',lead_time_hours,'horizonDays',horizon_days,'blockedDates',blocked_dates,'emailEnabled',email_enabled,'timezone','Europe/Amsterdam','revision',revision) from private.crm_settings where singleton
$$;
create function private.crm_lead_dto(l private.crm_leads) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',l.id,'name',l.name,'company',l.company,'email',l.email,'phone',l.phone,'sector',l.sector,'team',l.team,'stage',l.stage,'owner',coalesce(l.owner_id::text,''),'nextActionAt',l.next_action_at,'value',l.value,'source',l.source,'revision',l.revision,'isDemo',false,'createdAt',l.created_at,'updatedAt',l.updated_at)
$$;
create function private.crm_request_dto(r private.crm_requests) returns jsonb language sql immutable set search_path='' as $$
 select r.snapshot||jsonb_build_object('id',r.id,'leadId',r.lead_id,'kind',r.kind,'source','Website','isDemo',false,'createdAt',r.created_at)
$$;
create function private.crm_task_dto(t private.crm_tasks) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('id',t.id,'leadId',t.lead_id,'title',t.title,'dueAt',t.due_at,'owner',coalesce(t.owner_id::text,''),'completed',t.completed,'revision',t.revision,'isDemo',false,'createdAt',t.created_at)
$$;
create function private.crm_appointment_dto(a private.crm_appointments) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('id',a.id,'leadId',a.lead_id,'requestId',a.request_id,'date',to_char(a.starts_at at time zone 'Europe/Amsterdam','YYYY-MM-DD'),'time',to_char(a.starts_at at time zone 'Europe/Amsterdam','HH24:MI'),'endTime',to_char(a.ends_at at time zone 'Europe/Amsterdam','HH24:MI'),'startsAt',a.starts_at,'endsAt',a.ends_at,'status',a.status,'location','telephone','isDemo',false,'revision',a.revision,'createdAt',a.created_at)
$$;

create function private.crm_local_instant(day date,slot time) returns timestamptz language plpgsql immutable set search_path='' as $$
declare instant timestamptz;begin
 instant:=(day+slot) at time zone 'Europe/Amsterdam';
 if day is null or slot is null or instant at time zone 'Europe/Amsterdam'<>day+slot then raise exception 'Dit lokale tijdstip bestaat niet.' using errcode='23P01';end if;
 return instant;
end$$;

-- Serializes settings edits and booking against the same calendar. The GiST
-- constraint also rejects overlapping instants, independent of this lock.
create function private.crm_slot(day date,slot time,exclude_id uuid default null) returns timestamptz language plpgsql security definer set search_path='' as $$
declare s private.crm_settings;instant timestamptz;local_now timestamp:=clock_timestamp() at time zone 'Europe/Amsterdam';begin
 select * into s from private.crm_settings where singleton for update;
 instant:=private.crm_local_instant(day,slot);
 if day is null or slot is null or day<local_now::date or day>local_now::date+s.horizon_days or not extract(dow from day)::integer=any(s.weekdays) or day=any(s.blocked_dates)
 or slot<s.start_time or slot+interval '30 minutes'>s.end_time or instant<clock_timestamp()+make_interval(hours=>s.lead_time_hours)
 or to_char(instant at time zone 'Europe/Amsterdam','YYYY-MM-DD HH24:MI')<>to_char(day+slot,'YYYY-MM-DD HH24:MI')
 or mod(extract(epoch from (slot-s.start_time))::integer,(30+s.buffer_minutes)*60)<>0
 then raise exception 'Kies een beschikbaar tijdslot.' using errcode='23P01';end if;
 if exists(select 1 from private.crm_appointments a where a.status<>'cancelled' and a.id is distinct from exclude_id and tstzrange(a.starts_at,a.reserved_until,'[)')&&tstzrange(instant,instant+make_interval(mins=>30+s.buffer_minutes),'[)')) then raise exception 'Dit tijdslot is intussen bezet. Kies een ander moment.' using errcode='23P01';end if;
 return instant;
end$$;
create function public.crm_availability(day date) returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.crm_settings;slots jsonb;local_now timestamp:=clock_timestamp() at time zone 'Europe/Amsterdam';begin
 if auth.jwt()->>'role' is distinct from 'service_role' and not private.crm_admin() then raise exception 'Geen toegang.' using errcode='42501';end if;
 select * into s from private.crm_settings where singleton;
 if day is null or day<local_now::date or day>local_now::date+s.horizon_days or not extract(dow from day)::integer=any(s.weekdays) or day=any(s.blocked_dates) then slots:='[]';
 else
 select coalesce(jsonb_agg(to_char(v at time zone 'Europe/Amsterdam','HH24:MI') order by v),'[]') into slots
 from generate_series((day+s.start_time) at time zone 'Europe/Amsterdam',(day+s.end_time) at time zone 'Europe/Amsterdam'-interval '30 minutes',make_interval(mins=>30+s.buffer_minutes))v
 where ((v at time zone 'Europe/Amsterdam') at time zone 'Europe/Amsterdam')=v and v>=clock_timestamp()+make_interval(hours=>s.lead_time_hours) and not exists(select 1 from private.crm_appointments a where a.status<>'cancelled' and tstzrange(a.starts_at,a.reserved_until,'[)')&&tstzrange(v,v+make_interval(mins=>30+s.buffer_minutes),'[)'));
 end if;
 return jsonb_build_object('date',day,'slots',slots,'timezone','Europe/Amsterdam','durationMinutes',30);
end$$;

create function public.crm_intake(payload jsonb,request_id uuid,rate_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare p jsonb:=payload;h text;receipt private.crm_receipts;lead private.crm_leads;r uuid;a uuid;ts timestamptz;s private.crm_settings;result jsonb;hits integer;recipient uuid;notification_id uuid;begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Geen toegang.' using errcode='42501';end if;
 if request_id is null or jsonb_typeof(p) is distinct from 'object' or octet_length(p::text)>20000 or rate_key !~ '^[a-f0-9]{64}$' then raise exception 'Controleer je aanvraag.' using errcode='22023';end if;
 if exists(select 1 from jsonb_object_keys(p)k where k not in('kind','name','company','email','phone','sector','team','goal','message','date','time')) then raise exception 'Ongeldige aanvraagvelden.' using errcode='22023';end if;
 p:=jsonb_build_object('kind',p->>'kind','name',btrim(coalesce(p->>'name','')),'company',btrim(coalesce(p->>'company','')),'email',lower(btrim(coalesce(p->>'email',''))),'phone',btrim(coalesce(p->>'phone','')),'sector',btrim(coalesce(p->>'sector','')),'team',btrim(coalesce(p->>'team','')),'goal',btrim(coalesce(p->>'goal','')),'message',btrim(coalesce(p->>'message','')),'date',nullif(p->>'date',''),'time',nullif(p->>'time',''));
 if coalesce(p->>'kind','') not in('trial','appointment','demo') or length(p->>'name') not between 1 and 160 or length(p->>'company') not between 1 and 180 or length(p->>'email')>254 or p->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 or length(p->>'phone')>40 or length(p->>'sector')>120 or length(p->>'team')>100 or length(p->>'goal')>500 or length(p->>'message')>5000
 or(p->>'kind'<>'trial' and(length(p->>'phone')<6 or coalesce(p->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(p->>'time','') !~ '^\d{2}:\d{2}$'))
 then raise exception 'Controleer naam, bedrijf, e-mailadres en het gekozen moment.' using errcode='22023';end if;
 h:=encode(extensions.digest(p::text,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('crm-intake:'||request_id::text,0));
 select * into receipt from private.crm_receipts where scope='public' and crm_receipts.request_id=crm_intake.request_id;
 if found then if receipt.input_hash<>h then raise exception 'Deze aanvraag is gewijzigd. Verstuur als nieuwe aanvraag.' using errcode='23514';end if;return receipt.result;end if;
 insert into private.crm_rate_windows(key,bucket) values(rate_key,date_trunc('hour',clock_timestamp())) on conflict(key,bucket) do update set hits=crm_rate_windows.hits+1 returning crm_rate_windows.hits into hits;
 if hits>20 then raise exception 'Te veel aanvragen. Probeer het later opnieuw.' using errcode='P0429';end if;
 -- Lock ordering is calendar, lead, then source records in every booking flow.
 select * into s from private.crm_settings where singleton for update;
 if p->>'kind'<>'trial' then ts:=private.crm_slot((p->>'date')::date,(p->>'time')::time);end if;
 perform pg_advisory_xact_lock(hashtextextended('crm-lead:'||lower(p->>'company')||':'||(p->>'email'),0));
 insert into private.crm_leads(name,company,email,phone,sector,team,owner_id,stage,next_action_at)
 values(p->>'name',p->>'company',p->>'email',p->>'phone',p->>'sector',p->>'team',private.crm_primary_admin(),case when p->>'kind'='trial' then 'new' else 'scheduled' end,null)
 on conflict(normalized_company,normalized_email) do update set updated_at=clock_timestamp() returning * into lead;
 insert into private.crm_requests(lead_id,kind,snapshot) values(lead.id,p->>'kind',p-'kind') returning id into r;
 if ts is not null then insert into private.crm_appointments(lead_id,request_id,starts_at,ends_at,reserved_until) values(lead.id,r,ts,ts+interval '30 minutes',ts+make_interval(mins=>30+s.buffer_minutes)) returning id into a;end if;
 insert into private.crm_tasks(lead_id,request_id,title,due_at,owner_id) values(lead.id,r,case p->>'kind' when 'trial' then 'Proefaanvraag opvolgen' when 'demo' then 'Productdemo voorbereiden' else 'Kennismaking bevestigen' end,coalesce(ts,clock_timestamp()+interval '1 day'),private.crm_primary_admin());
 insert into private.crm_activities(lead_id,type,body) values(lead.id,'intake',case p->>'kind' when 'trial' then 'Proefperiode aangevraagd' when 'demo' then 'Telefonische productdemo aangevraagd' else 'Telefonische kennismaking aangevraagd' end);
 -- Notification adapter is defined later in this migration; the source, queue
 -- request and outbox event share this transaction with the reservation.
 notification_id:=private.crm_notify(r);
 result:=jsonb_build_object('ok',true,'leadId',lead.id,'requestId',r,'notificationStatus',case when notification_id is null then 'pending_config' else 'queued' end);
 if a is not null then result:=result||jsonb_build_object('appointmentId',a);end if;
 insert into private.crm_receipts(scope,request_id,input_hash,result) values('public',request_id,h,result);
 return result;
end$$;

create function public.crm_command(command text,payload jsonb,request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
<<crm_command>>
declare actor uuid:=auth.uid();h text;receipt private.crm_receipts;result jsonb:='{"ok":true}';l private.crm_leads;t private.crm_tasks;a private.crm_appointments;s private.crm_settings;id uuid;ts timestamptz;owner_id uuid;delivery private.notification_deliveries;begin
 if not private.crm_admin() then raise exception 'Alleen platformbeheer heeft toegang.' using errcode='42501';end if;
 if request_id is null or command is null or jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>24000 then raise exception 'Ongeldige opdracht.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('crm-command:'||actor::text||request_id::text,0));
 h:=encode(extensions.digest(command||payload::text,'sha256'),'hex');
 select * into receipt from private.crm_receipts where scope=actor::text and crm_receipts.request_id=crm_command.request_id;
 if found then if receipt.input_hash<>h then raise exception 'Opdracht gewijzigd.' using errcode='23514';end if;return receipt.result;end if;
 if payload ? 'owner' then
  owner_id:=nullif(payload->>'owner','')::uuid;
  if not private.crm_owner_valid(owner_id) then raise exception 'Kies een actieve platformbeheerder.' using errcode='22023';end if;
 end if;
 if command in('appointment.create','appointment.update','settings.update') then select * into s from private.crm_settings where singleton for update;end if;
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
  select d.* into delivery from private.notification_deliveries d join private.notification_requests n on n.id=d.request_id where n.source_kind='crm' and n.source_id=(payload->>'id')::uuid and d.channel='email' for update of d;
  if not found then raise exception 'Verwerking wacht op de beheeridentiteit of centrale worker.' using errcode='23514';end if;
  result:=result||private.notification_delivery_command(null,'platform',actor,'delivery_retry',jsonb_build_object('id',delivery.id,'version',payload->'revision'));
  id:=delivery.id;
 else raise exception 'Onbekende CRM-opdracht.' using errcode='22023';end if;
 insert into private.crm_audit(actor_id,command,record_id,details) values(actor,command,id,jsonb_build_object('requestId',request_id));
 insert into private.crm_receipts(scope,request_id,input_hash,result) values(actor::text,request_id,h,result);
 return result;
end$$;

create function public.crm_query(operation text,payload jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare q text:=btrim(coalesce(payload->>'search',''));pg integer:=coalesce((payload->>'page')::integer,1);sz integer:=coalesce((payload->>'pageSize')::integer,50);selected uuid:=nullif(payload->>'lead','')::uuid;tab text:=coalesce(payload->>'tab','pipeline');leads jsonb;reqs jsonb;tasks jsonb;appts jsonb;activity jsonb;notifs jsonb;owners jsonb;counts jsonb;total integer;begin
 if not private.crm_admin() then raise exception 'Alleen platformbeheer heeft toegang.' using errcode='42501';end if;
 if jsonb_typeof(payload) is distinct from 'object' or length(q)>160 or pg not between 1 and 100000 or sz not between 5 and 100 or tab not in('pipeline','requests','agenda','tasks','settings') then raise exception 'Ongeldige zoekopdracht.' using errcode='22023';end if;
 if operation='appointment' then return (select private.crm_appointment_dto(a)||jsonb_build_object('lead',private.crm_lead_dto(l)) from private.crm_appointments a join private.crm_leads l on l.id=a.lead_id where a.id=(payload->>'id')::uuid);end if;
 if operation not in('state','overview') then raise exception 'Onbekende zoekopdracht.' using errcode='22023';end if;
 select jsonb_build_object('active',(select count(*) from private.crm_leads where stage not in('won','lost')),'value',(select coalesce(sum(value),0) from private.crm_leads where stage not in('won','lost')),'stages',(select jsonb_object_agg(stage,n) from(select stage,count(*)n from private.crm_leads group by stage)c),'recentRequests',(select count(*) from private.crm_requests where created_at>=(((now() at time zone 'Europe/Amsterdam')::date-6)::timestamp at time zone 'Europe/Amsterdam')),'requests',(select count(*) from private.crm_requests),'appointments',(select count(*) from private.crm_appointments where status<>'cancelled' and ends_at>=now()),'requestedAppointments',(select count(*) from private.crm_appointments where status='requested' and ends_at>=now()),'tasks',(select count(*) from private.crm_tasks where not completed),'followups',(select count(*) from private.crm_leads where stage not in('won','lost') and next_action_at is not null),'overdue',(select count(*) from private.crm_tasks where not completed and(due_at at time zone 'Europe/Amsterdam')::date<(now() at time zone 'Europe/Amsterdam')::date)+(select count(*) from private.crm_leads where stage not in('won','lost') and(next_action_at at time zone 'Europe/Amsterdam')::date<(now() at time zone 'Europe/Amsterdam')::date)) into counts;
 -- Each collection is bounded. Global metrics are separate full-selection facts.
 select coalesce(jsonb_agg(private.crm_request_dto(r) order by r.created_at desc,r.id),'[]') into reqs from(select * from private.crm_requests r where(selected is null or r.lead_id=selected) and(q='' or r.snapshot::text ilike '%'||q||'%') and(coalesce(payload->>'kind','')='' or r.kind=payload->>'kind') order by r.created_at desc,r.id limit case when operation='overview' then 3 else sz end offset case when operation='state' and tab='requests' and selected is null then(pg-1)*sz else 0 end)r;
 select coalesce(jsonb_agg(private.crm_task_dto(t) order by t.due_at nulls last,t.id),'[]') into tasks from(select * from private.crm_tasks t where(selected is null or t.lead_id=selected) and(operation<>'overview' or not t.completed) and(q='' or t.title ilike '%'||q||'%') order by t.due_at nulls last,t.id limit case when operation='overview' then 3 else sz end offset case when operation='state' and tab='tasks' and selected is null then(pg-1)*sz else 0 end)t;
 select coalesce(jsonb_agg(private.crm_appointment_dto(a) order by a.starts_at,a.id),'[]') into appts from(select * from private.crm_appointments a where(selected is null or a.lead_id=selected) and(operation<>'overview' or a.status<>'cancelled' and a.ends_at>=now()) and(coalesce(payload->>'from','')='' or a.starts_at>=((payload->>'from')::date::timestamp at time zone 'Europe/Amsterdam')) and(coalesce(payload->>'until','')='' or a.starts_at<(((payload->>'until')::date+1)::timestamp at time zone 'Europe/Amsterdam')) order by a.starts_at,a.id limit case when operation='overview' then 3 else sz end offset case when operation='state' and tab='agenda' and selected is null then(pg-1)*sz else 0 end)a;
 with matches as(select l.* from private.crm_leads l where(q='' or concat_ws(' ',l.company,l.name,l.email,l.phone,l.sector) ilike '%'||q||'%') and(coalesce(payload->>'owner','')='' or l.owner_id::text=payload->>'owner') and(coalesce(payload->>'kind','')='' or exists(select 1 from private.crm_requests r where r.lead_id=l.id and r.kind=payload->>'kind'))),page_leads as(select id from matches order by created_at desc,id limit sz offset(pg-1)*sz),include as(select id from page_leads union select selected where selected is not null union select(x->>'leadId')::uuid from jsonb_array_elements(reqs||tasks||appts)x where x->>'leadId' is not null union select id from(select id from private.crm_leads where operation='overview' and stage not in('won','lost') and next_action_at is not null order by next_action_at,id limit 3)followup)
 select coalesce(jsonb_agg(private.crm_lead_dto(l) order by l.created_at desc,l.id),'[]') into leads from private.crm_leads l join include i on i.id=l.id;
 select count(*) into total from private.crm_leads l where(q='' or concat_ws(' ',l.company,l.name,l.email,l.phone,l.sector) ilike '%'||q||'%') and(coalesce(payload->>'owner','')='' or l.owner_id::text=payload->>'owner') and(coalesce(payload->>'kind','')='' or exists(select 1 from private.crm_requests r where r.lead_id=l.id and r.kind=payload->>'kind'));
 if selected is not null then select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'leadId',a.lead_id,'type',a.type,'body',a.body,'createdAt',a.created_at,'isDemo',false,'actorId',a.actor_id) order by a.created_at desc,a.id),'[]') into activity from(select * from private.crm_activities where lead_id=selected order by created_at desc,id limit 100)a;end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.user_id,'name',coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.email),'email',u.email) order by a.created_at,a.user_id),'[]') into owners from public.platform_admins a join auth.users u on u.id=a.user_id where private.crm_owner_valid(a.user_id);
 notifs:=private.crm_notifications(selected,sz,(pg-1)*sz);
 return jsonb_build_object('observedAt',now(),'leads',leads,'requests',reqs,'tasks',tasks,'appointments',appts,'activities',coalesce(activity,'[]'),'notifications',notifs,'settings',private.crm_settings_dto(),'notificationContext',jsonb_build_object('provider','SendGrid','configuration','global','recipientEmail',(select email from auth.users where id=private.crm_primary_admin()),'recipientName',(select coalesce(nullif(raw_user_meta_data->>'full_name',''),email) from auth.users where id=private.crm_primary_admin()),'recipientSource',case when private.crm_primary_admin() is null then 'unresolved' else 'platform_admin' end,'providerConfigured',false),'mailConfigured',false,'owners',owners,'counts',counts,'pagination',jsonb_build_object('page',pg,'pageSize',sz,'total',case tab when 'requests' then (select count(*) from private.crm_requests where(q='' or snapshot::text ilike '%'||q||'%') and(coalesce(payload->>'kind','')='' or kind=payload->>'kind')) when 'tasks' then(select count(*) from private.crm_tasks where q='' or title ilike '%'||q||'%') when 'agenda' then(select count(*) from private.crm_appointments) when 'settings' then(select count(*) from private.crm_requests) else total end));
end$$;

-- Platform notifications use the existing central queue, policy and transport.
alter table public.outbox_events alter column tenant_id drop not null;
alter table public.outbox_events add constraint outbox_platform_notification_only check(tenant_id is not null or(event_type='notification.requested' and aggregate_type='notification' and payload->>'request_id'=aggregate_id::text and idempotency_key='notification-request:'||aggregate_id::text));
create unique index outbox_platform_key on public.outbox_events(idempotency_key) where tenant_id is null;
insert into public.notification_catalog(code,name,description,category,status,contexts,channels,default_channels,recipient_description,variables,tenant_override)
values('crm.intake','Nieuwe websiteaanvraag','Telefonische kennismaking, productdemo of proefaanvraag in het platform CRM.','Relaties & aanvragen','active',array['platform'],array['in_app','email'],array['in_app','email'],'Geregistreerde primaire platformbeheerder',array['bedrijfsnaam','organisatie','contactpersoon','email','telefoon','aanvraagtype','voorkeur','bericht'],false);
insert into private.notification_templates(tenant_id,type_code,context,channel,draft)
select null,'crm.intake','platform',ch,jsonb_build_object('title','Fieldgrid: nieuwe {aanvraagtype} van {organisatie}','body','{contactpersoon} ({organisatie}) heeft een aanvraag gedaan. E-mail: {email}. Telefoon: {telefoon}. Voorkeur: {voorkeur}. {bericht}','cta_label','Bekijk de aanvraag') from unnest(array['in_app','email'])ch;
insert into private.notification_template_versions(template_id,revision,definition) select id,1,draft from private.notification_templates where type_code='crm.intake' and tenant_id is null;
update private.notification_templates t set active_version_id=v.id from private.notification_template_versions v where v.template_id=t.id and t.type_code='crm.intake' and v.revision=1;
create function private.crm_register_primary() returns trigger language plpgsql security definer set search_path='' as $$
begin update private.crm_settings set primary_admin=new.user_id where singleton and primary_admin is null;return new;end$$;
create trigger crm_register_primary after insert on public.platform_admins for each row execute function private.crm_register_primary();
CREATE OR REPLACE FUNCTION private.notification_enqueue(t uuid, code text, kind text, source uuid, source_revision text, dedupe_key text, payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
<<notification_enqueue>>
declare id uuid;event_id uuid;ttl integer;blocked jsonb;
begin
 if (t is null and not(kind='crm' and code='crm.intake' and payload->>'context'='platform' and exists(select 1 from private.crm_requests crm_source_row where crm_source_row.id=source))) or source is null or dedupe_key is null or jsonb_typeof(payload) is distinct from 'object' then raise exception 'Notificatiebron vereist' using errcode='23514';end if;
 select ttl_minutes into ttl from public.notification_catalog where notification_catalog.code=notification_enqueue.code;if not found then raise exception 'Onbekend notificatietype' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-notification-policy',0));
 select coalesce(jsonb_agg(ctx||':'||ch),'[]'::jsonb) into blocked from public.notification_catalog cat cross join lateral unnest(cat.contexts)ctx cross join lateral unnest(cat.channels)ch where cat.code=notification_enqueue.code and not coalesce((private.notification_policy(t,notification_enqueue.code,ctx,ch,case when payload->>'context'=ctx then nullif(payload->>'recipient_user_id','')::uuid end)->>'allowed')::boolean,false);
 payload:=jsonb_set(payload,'{suppressed_routes}',coalesce(payload->'suppressed_routes','[]'::jsonb)||blocked);
 insert into private.notification_requests(tenant_id,type_code,source_kind,source_id,source_revision,dedupe_key,payload,available_at,expires_at)
 values(t,code,kind,source,source_revision,dedupe_key,payload,coalesce((payload->>'scheduled_at')::timestamptz,clock_timestamp()),coalesce((payload->>'expires_at')::timestamptz,greatest(clock_timestamp(),(payload->>'scheduled_at')::timestamptz)+make_interval(mins=>ttl)))
 on conflict do nothing returning notification_requests.id into id;
 if id is null then select r.id into id from private.notification_requests r where r.tenant_id is not distinct from t and r.dedupe_key=notification_enqueue.dedupe_key;return id;end if;
 if t is null then
  insert into public.outbox_events(tenant_id,event_type,aggregate_type,aggregate_id,payload,idempotency_key) values(null,'notification.requested','notification',id,jsonb_build_object('request_id',id),'notification-request:'||id) on conflict do nothing returning outbox_events.id into event_id;
 else event_id:=private.enqueue_event(t,'notification.requested','notification',id,jsonb_build_object('request_id',id),'notification-request:'||id);end if;
 update private.notification_requests set outbox_event_id=event_id where notification_requests.id=notification_enqueue.id;
 return id;
end$function$;
CREATE OR REPLACE FUNCTION private.notification_source_allowed(t uuid, code text, kind text, source uuid, revision text, recipient uuid, ctx text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare cr private.notification_campaign_recipients;c private.notification_campaigns;visit public.work_orders;event_kind text;
begin
 if kind='crm' then return t is null and ctx='platform' and code='crm.intake' and revision=source::text and exists(select 1 from private.crm_requests crm_source_row where crm_source_row.id=source) and exists(select 1 from public.platform_admins where user_id=recipient);
 elsif kind='product' then return exists(select 1 from private.product_events e where e.id=source and e.type_code=code and revision=e.id::text) and private.product_event_allowed(source,t,ctx,recipient);
 elsif kind='domain' then return private.notification_domain_source_allowed(t,code,source,revision,recipient,ctx);
 elsif kind='campaign' then
  select * into cr from private.notification_campaign_recipients where id=source and tenant_id=t and user_id is not distinct from recipient and context=ctx;if not found then return false;end if;
  select * into c from private.notification_campaigns where id=cr.campaign_id;
  if c.state not in ('scheduled','processing','partial','completed') or c.expires_at<=now() or c.confirmed_revision::text is distinct from revision then return false;end if;
  return exists(select 1 from private.notification_candidates(c.tenant_id,c.context,c.sender_id,c.criteria) r where r.tenant_id=t and r.recipient_key=cr.recipient_key and r.context=ctx and r.user_id is not distinct from cr.user_id and r.contact_id is not distinct from cr.contact_id and r.source_context->>'email_hash' is not distinct from cr.source_context->>'email_hash');
 elsif kind='object' then
  if code in ('object.followup','object.access_expiring') and(not private.notification_object_due(t,source) or not exists(select 1 from public.object_reminder_recipients r where r.tenant_id=t and r.object_id=source and r.user_id=recipient and r.active)) then return false;end if;
  if code='object.access_expiring' and not exists(select 1 from private.object_secret_items si where si.tenant_id=t and si.object_id=source and si.active and si.valid_until<now()+interval '7 days') then return false;end if;
  event_kind:=split_part(revision,':',1);
  if code='object.instruction' then
   select w.* into visit from public.work_orders w join public.object_records r on r.tenant_id=w.tenant_id and r.object_id=w.object_id where w.tenant_id=t and w.object_id=source and w.id=nullif(split_part(revision,':',4),'')::uuid and r.id=nullif(split_part(revision,':',2),'')::uuid and r.kind='instruction' and r.state='active' and r.version::text=split_part(revision,':',3) and(r.work_order_id is null or r.work_order_id=w.id) and(r.service='' or r.service=w.discipline) and r.starts_at<=w.projected_end_at and(r.ends_at is null or r.ends_at>=w.projected_start_at);
  elsif code in ('object.request','object.request_decided') then
   if event_kind='accepted' then select w.* into visit from public.object_request_proposals p join public.object_visit_requests r on r.tenant_id=p.tenant_id and r.id=p.request_id join public.work_orders w on w.tenant_id=r.tenant_id and w.id=r.work_order_id where p.tenant_id=t and p.id=nullif(split_part(revision,':',2),'')::uuid and p.accepted_at is not null and r.object_id=source;
   elsif event_kind in ('request','request-version','review','withdrawn','executed') then select w.* into visit from public.object_visit_requests r join public.work_orders w on w.tenant_id=r.tenant_id and w.id=r.work_order_id where r.tenant_id=t and r.object_id=source and r.id=nullif(split_part(revision,':',2),'')::uuid and r.version::text=coalesce(nullif(split_part(revision,':',3),''),'1');end if;
  end if;
  if code in ('object.instruction','object.request','object.request_decided') and(visit.id is null or visit.archive_at is not null or visit.status='cancelled') then return false;end if;
  return private.notification_actor_active(t,ctx,recipient) and exists(select 1 from public.objects o where o.tenant_id=t and o.id=source and o.dossier_status<>'archived' and
   ((ctx='backoffice' and exists(select 1 from public.tenant_memberships m where m.tenant_id=t and m.user_id=recipient and m.status='active' and m.roles&&array['tenant_admin','management','planner']::public.app_role[]))
   or(ctx='staff' and exists(select 1 from public.work_order_assignments a join public.personnel p on p.id=a.personnel_id and p.tenant_id=a.tenant_id where a.tenant_id=t and a.work_order_id=visit.id and a.status in ('released','seen','travelling','in_progress') and p.user_id=recipient and p.status='active' and exists(select 1 from public.dispatches d where d.tenant_id=t and d.assignment_id=a.id and d.revoked_at is null)))
   or(ctx='customer' and exists(select 1 from public.object_customer_bindings b where b.tenant_id=t and b.object_id=source and b.user_id=recipient and b.active))));
 elsif kind='customer' then
  return ctx='backoffice' and private.notification_actor_active(t,ctx,recipient) and private.notification_customer_due(t,source,recipient);
 end if;
 return private.notification_operational_source_allowed(t,code,kind,source,revision,recipient,ctx);
end$function$;
CREATE OR REPLACE FUNCTION private.notification_policy(t uuid, code text, ctx text, ch text, recipient uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.notification_catalog;p private.notification_policies;pref private.notification_preferences;rev bigint;enabled boolean;quiet_until timestamptz;local_now timestamp;quiet_end timestamp;
begin
 if code='crm.intake' and ch='email' and not exists(select 1 from private.crm_settings where singleton and email_enabled) then return jsonb_build_object('allowed',false,'reason','crm_email_off','policy_revision',(select revision from private.notification_state where singleton));end if;
 select revision into rev from private.notification_state where singleton;select * into c from public.notification_catalog where notification_catalog.code=notification_policy.code;
 if not found or c.status<>'active' then return jsonb_build_object('allowed',false,'reason','type_unavailable','policy_revision',rev);end if;
 if ctx is null or not ctx=any(c.contexts) or ch is null or not ch=any(c.channels) then return jsonb_build_object('allowed',false,'reason','channel_unavailable','policy_revision',rev);end if;
 if t is not null and not exists(select 1 from public.tenants where id=t and status='active') then return jsonb_build_object('allowed',false,'reason','tenant_inactive','policy_revision',rev);end if;
 if c.module is not null and (t is null or not exists(select 1 from public.tenant_settings where tenant_id=t and c.module=any(enabled_services))) then return jsonb_build_object('allowed',false,'reason','module_unavailable','policy_revision',rev);end if;
 enabled:=ch=any(c.default_channels) and not(code='work_order.rescheduled' and ctx='customer');
 for p in select * from private.notification_policies where (tenant_id is null or tenant_id=t) and (context is null or context=ctx) and(type_code is null or type_code=code) and(channel is null or channel=ch) order by scope,tenant_id nulls first,context nulls first,type_code nulls first,channel nulls first loop
  if p.mode='off' then return jsonb_build_object('allowed',false,'reason',case when p.scope='platform' then 'platform_blocked' else 'tenant_blocked' end,'source',p.id,'policy_revision',rev);end if;
  if p.mode='on' then enabled:=true;end if;
 end loop;
 if not enabled then return jsonb_build_object('allowed',false,'reason','default_off','policy_revision',rev);end if;
 if recipient is not null then
  if not private.notification_actor_active(case when ctx='platform' then null else t end,ctx,recipient) then return jsonb_build_object('allowed',false,'reason','recipient_inactive','policy_revision',rev);end if;
  for pref in select * from private.notification_preferences where tenant_id is not distinct from case when ctx='platform' then null else t end and user_id=recipient and context=ctx and(type_code is null or type_code=code) order by type_code nulls first loop
   if not (case ch when 'in_app' then pref.in_app when 'push' then pref.push else pref.email end) then return jsonb_build_object('allowed',false,'reason','personal_off','policy_revision',rev);end if;
   if ch<>'in_app' and pref.quiet_start is not null and pref.quiet_start<>pref.quiet_end then
    local_now:=now() at time zone pref.timezone;
    if(pref.quiet_start<pref.quiet_end and local_now::time>=pref.quiet_start and local_now::time<pref.quiet_end) or(pref.quiet_start>pref.quiet_end and(local_now::time>=pref.quiet_start or local_now::time<pref.quiet_end)) then
     quiet_end:=local_now::date+pref.quiet_end+case when local_now::time>=pref.quiet_start and pref.quiet_start>pref.quiet_end then interval '1 day' else interval '0' end;
     quiet_until:=greatest(quiet_until,quiet_end at time zone pref.timezone);
    end if;
   end if;
  end loop;
 end if;
 return jsonb_build_object('allowed',true,'reason',case when quiet_until is null then 'allowed' else 'quiet_hours' end,'policy_revision',rev,'quiet_until',quiet_until,'bundle_seconds',private.notification_bundle_seconds(t,code,ctx));
end$function$;
CREATE OR REPLACE FUNCTION public.notification_delivery_prepare(request_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r private.notification_requests;u uuid;c uuid;ctx text;ch text;recipient text;label text;tmpl jsonb;snapshot jsonb;decision jsonb;dev record;n integer:=0;inserted integer;vars jsonb;path text;campaign private.notification_campaigns;bundle integer;pe private.notification_planning_events;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 select * into r from private.notification_requests where id=request_id for update;if not found or r.prepared_at is not null then return 0;end if;
 if r.source_kind='crm' then
  if r.tenant_id is not null or r.type_code<>'crm.intake' then raise exception 'Ongeldige CRM-bron' using errcode='23514';end if;
  u:=private.crm_primary_admin();if u is null then return 0;end if;
  r.payload:=jsonb_set(r.payload,'{recipient_user_id}',to_jsonb(u::text));
  update private.notification_requests set payload=r.payload where id=r.id;
 end if;
 u:=nullif(r.payload->>'recipient_user_id','')::uuid;c:=nullif(r.payload->>'contact_id','')::uuid;ctx:=r.payload->>'context';
 if ctx is null or ctx not in ('platform','backoffice','staff','customer') or (u is null and c is null) then raise exception 'Ontvanger ontbreekt' using errcode='23514';end if;
 if u is not null then select email,coalesce(raw_user_meta_data->>'full_name','Gebruiker') into recipient,label from auth.users where id=u;else select email,full_name into recipient,label from public.customer_contacts where id=c and tenant_id=r.tenant_id;end if;
 bundle:=private.notification_bundle_seconds(r.tenant_id,r.type_code,ctx);
 if r.source_kind='outbox' and r.type_code='work_order.rescheduled' and bundle>0 then
  select * into pe from private.notification_planning_events where event_id=r.source_id;
  r.available_at:=greatest(r.available_at,pe.created_at+make_interval(secs=>bundle));
  update private.notification_requests set available_at=r.available_at where id=r.id;
  -- Only pending, unadmitted work is folded into the latest employee/order/day.
  -- Sent history and provider-admitted requests are never rewritten or replayed.
  update private.notification_deliveries d set state='cancelled',reason='planning_bundled',lease=null,locked_until=null,revision=d.revision+1 from private.notification_requests older,private.notification_planning_events prior
  where d.request_id=older.id and older.source_kind='outbox' and older.type_code=r.type_code and prior.event_id=older.source_id and prior.tenant_id=pe.tenant_id and prior.work_order_id=pe.work_order_id and prior.planning_day=pe.planning_day and prior.sequence<pe.sequence and d.recipient_user_id=u
  and(d.state in ('queued','deferred','claimed','failed') or(d.state='sending' and not exists(select 1 from private.notification_provider_permits p where p.source_kind='delivery' and p.source_id=d.id and p.state in ('admitted','accepted','uncertain'))));
 end if;
 vars:=coalesce(r.payload->'variables','{}');
 for ch in select jsonb_array_elements_text(coalesce(r.payload->'channels','["in_app"]')) loop
  if ch not in ('in_app','email','push') or (u is null and ch<>'email') then continue;end if;
  decision:=private.notification_policy(r.tenant_id,r.type_code,ctx,ch,u);tmpl:=private.notification_template(r.tenant_id,r.type_code,ctx,ch);
  if r.payload->'suppressed_routes' ? (ctx||':'||ch) then decision:=decision||jsonb_build_object('allowed',false,'reason','disabled_at_enqueue');end if;
  if tmpl is null then tmpl:=jsonb_build_object('title','Nieuwe melding','body','Er staat een update klaar in de beveiligde omgeving.','cta_label','Bekijken','revision',1,'branding',jsonb_build_object('company',(select name from public.tenants where id=r.tenant_id),'primary','#222C35','accent','#41AC42'));end if;
  if ctx='platform' or coalesce((r.payload->>'platform_brand')::boolean,false) or r.type_code='manual.platform' then tmpl:=coalesce(private.notification_template(null,r.type_code,ctx,ch),tmpl);tmpl:=jsonb_set(tmpl,'{branding}',jsonb_build_object('company','Fieldgrid','primary','#222C35','accent','#41AC42'));end if;
  vars:=jsonb_build_object('bedrijfsnaam',tmpl#>>'{branding,company}')||vars;
  path:=coalesce(r.payload->>'path',case ctx when 'platform' then '/platform/notificaties' when 'backoffice' then '/app/notificaties' when 'customer' then '/klant/notificaties' else '/staff/notificaties' end);
  if path !~ ('^'||case ctx when 'platform' then '/platform' when 'backoffice' then '/app' when 'customer' then '/klant' else '/staff' end||'([/?]|$)') or path ~ '[\\[:cntrl:]]' then raise exception 'Ongeldige notificatieroute' using errcode='23514';end if;
  if r.source_kind='campaign' then select x.* into campaign from private.notification_campaigns x join private.notification_campaign_recipients cr on cr.campaign_id=x.id where cr.id=r.source_id;end if;
  snapshot:=jsonb_build_object('title',coalesce(campaign.title,private.notification_text(tmpl->>'title',vars)),'body',coalesce(campaign.body,private.notification_text(tmpl->>'body',vars)),'actionLabel',coalesce(campaign.action_label,tmpl->>'cta_label','Bekijken'),'path',path,'recipient',recipient,'recipientLabel',label,'templateVersion',coalesce((tmpl->>'revision')::bigint,1),'templateVersionId',tmpl->>'version_id','brand',tmpl->'branding','priority',case when r.type_code='work_order.window_risk' then 'urgent' else coalesce(campaign.priority,'normal') end,'ackRequired',coalesce(campaign.ack_required,false),'campaignId',campaign.id,'slug',coalesce((select slug from public.tenants where id=r.tenant_id),''),'ttlSeconds',least(2419200,(select ttl_minutes*60 from public.notification_catalog where code=r.type_code)));
  if ch='push' then
   -- Lockscreens use only the published channel template and public branding;
   -- never campaign prose or source-record variables from the full inbox item.
   snapshot:=snapshot||jsonb_build_object('pushTitle',private.notification_text(tmpl->>'title',jsonb_build_object('bedrijfsnaam',tmpl#>>'{branding,company}')),'pushBody',private.notification_text(tmpl->>'body',jsonb_build_object('bedrijfsnaam',tmpl#>>'{branding,company}')),'pushTemplateWarning',tmpl->>'warning');
  end if;
  -- An immutable snapshot is created even for suppressed work; OFF cannot later
  -- resurrect an envelope that was scheduled while disabled.
  for dev in select id,generation from private.notification_devices d where ch='push' and private.notification_device_live(d.id,d.generation,r.tenant_id,ctx,u)
   union all select null::uuid,null::bigint where ch<>'push' or not exists(select 1 from private.notification_devices d where private.notification_device_live(d.id,d.generation,r.tenant_id,ctx,u)) loop
   insert into private.notification_deliveries(request_id,tenant_id,recipient_user_id,contact_id,recipient_key,context,channel,device_id,device_generation,snapshot,state,reason,policy_revision,available_at,expires_at)
   values(r.id,r.tenant_id,u,c,coalesce(u,c)::text,ctx,ch,dev.id,dev.generation,snapshot,
   case when r.expires_at<=now() then 'expired' when not coalesce((decision->>'allowed')::boolean,false) then 'suppressed' when ch='push' and dev.id is null then 'cancelled' when campaign.state='paused' then 'deferred' when not private.notification_source_allowed(r.tenant_id,r.type_code,r.source_kind,r.source_id,r.source_revision,u,ctx) or not private.notification_planning_current(r.id,u) then 'cancelled' when decision->>'quiet_until' is not null then 'deferred' else 'queued' end,
   case when ch='push' and dev.id is null then 'no_active_device' else decision->>'reason' end,coalesce((decision->>'policy_revision')::bigint,1),greatest(r.available_at,coalesce((decision->>'quiet_until')::timestamptz,r.available_at)),r.expires_at) on conflict do nothing;
   get diagnostics inserted=row_count;n:=n+inserted;
  end loop;
 end loop;
 update private.notification_requests set prepared_at=now() where id=r.id;
 if r.source_kind='campaign' then perform private.notification_campaign_delivery_sync(campaign.id);end if;
 return n;
end$function$;

create function private.crm_notify(request_uuid uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare r private.crm_requests;l private.crm_leads;recipient uuid;begin
 select * into r from private.crm_requests where id=request_uuid;if not found then raise exception 'CRM-aanvraag ontbreekt' using errcode='23514';end if;
 select * into l from private.crm_leads where id=r.lead_id;recipient:=private.crm_primary_admin();
 return private.notification_enqueue(null,'crm.intake','crm',r.id,r.id::text,'crm-intake:'||r.id,jsonb_build_object('recipient_user_id',recipient,'context','platform','channels',jsonb_build_array('in_app','email'),'path','/platform/crm?tab=requests&lead='||l.id,'variables',jsonb_build_object('organisatie',r.snapshot->>'company','contactpersoon',r.snapshot->>'name','email',r.snapshot->>'email','telefoon',r.snapshot->>'phone','aanvraagtype',case r.kind when 'trial' then 'proefaanvraag' when 'demo' then 'demoaanvraag' else 'afspraakaanvraag' end,'voorkeur',coalesce(r.snapshot->>'date','Nog af te stemmen')||' '||coalesce(r.snapshot->>'time',''),'bericht',coalesce(r.snapshot->>'goal','')||' '||coalesce(r.snapshot->>'message',''))));
end$$;
create function public.crm_prepare_notifications(batch_size integer default 10) returns integer language plpgsql security definer set search_path='' as $$
declare r record;amount integer:=0;begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 for r in select id from private.notification_requests where source_kind='crm' and prepared_at is null order by created_at,id for update skip locked limit least(greatest(batch_size,1),25) loop amount:=amount+public.notification_delivery_prepare(r.id);end loop;
 return amount;
end$$;
create function private.crm_notifications(lead_uuid uuid,size integer,skip integer) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'leadId',r.lead_id,'requestId',r.id,'status',case d.state when 'sent' then 'accepted' when 'sending' then 'sending' when 'claimed' then 'queued' when 'uncertain' then 'uncertain' when 'deferred' then 'deferred' when 'suppressed' then 'suppressed' when 'cancelled' then 'cancelled' when 'expired' then 'expired' when 'failed' then 'failed' else case when private.crm_primary_admin() is null then 'pending_config' else 'queued' end end,'recipient',coalesce(d.snapshot->>'recipient',u.email,''),'revision',d.revision,'attempts',coalesce(d.attempts,0),'lastError',coalesce(d.reason,''),'acceptedAt',d.sent_at,'createdAt',r.created_at,'isDemo',false,'subject',d.snapshot->>'title','body',d.snapshot->>'body','transport',case when d.transport_snapshot is not null then jsonb_build_object('subject',d.transport_snapshot->>'subject','text',d.transport_snapshot->>'text') end) order by r.created_at desc,r.id),'[]')
 from(select * from private.crm_requests where lead_uuid is null or lead_id=lead_uuid order by created_at desc,id limit size offset skip)r
 left join private.notification_requests n on n.source_kind='crm' and n.source_id=r.id
 left join private.notification_deliveries d on d.request_id=n.id and d.channel='email'
 left join auth.users u on u.id=private.crm_primary_admin()
$$;

revoke all on function private.crm_admin(),private.crm_primary_admin(),private.crm_owner_valid(uuid),private.crm_settings_dto(),private.crm_lead_dto(private.crm_leads),private.crm_request_dto(private.crm_requests),private.crm_task_dto(private.crm_tasks),private.crm_appointment_dto(private.crm_appointments),private.crm_slot(date,time,uuid),private.crm_local_instant(date,time),private.crm_notify(uuid),private.crm_notifications(uuid,integer,integer),private.crm_register_primary() from public,anon,authenticated,service_role;
revoke all on function public.crm_intake(jsonb,uuid,text),public.crm_availability(date),public.crm_command(text,jsonb,uuid),public.crm_query(text,jsonb),public.crm_prepare_notifications(integer) from public,anon,authenticated,service_role;
grant execute on function public.crm_intake(jsonb,uuid,text),public.crm_availability(date),public.crm_prepare_notifications(integer) to service_role;
grant execute on function public.crm_availability(date),public.crm_command(text,jsonb,uuid),public.crm_query(text,jsonb) to authenticated;
-- Existing central grants are unchanged by CREATE OR REPLACE above.
notify pgrst,'reload schema';
