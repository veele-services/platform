-- The command admission point follows the idempotency lock. A current
-- registry row remains locked until commit; revocation cannot race admission.
-- Session/account state is checked again after any domain row lock wait.
create function private.crm_lock_actor() returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.platform_admins where user_id=auth.uid() for key share;
 if not found or not private.crm_admin() then raise exception 'Alleen platformbeheer heeft toegang.' using errcode='42501';end if;
end$$;
revoke all on function private.crm_lock_actor() from public,anon,authenticated,service_role;

create or replace function public.crm_command(command text,payload jsonb,request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
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
  select d.* into delivery from private.notification_deliveries d join private.notification_requests n on n.id=d.request_id where n.source_kind='crm' and n.source_id=(payload->>'id')::uuid and d.channel='email' for update of d;
  if not found then raise exception 'Verwerking wacht op de beheeridentiteit of centrale worker.' using errcode='23514';end if;
  perform private.crm_lock_actor();
  result:=result||private.notification_delivery_command(null,'platform',actor,'delivery_retry',jsonb_build_object('id',delivery.id,'version',payload->'revision'));
  id:=delivery.id;
 else raise exception 'Onbekende CRM-opdracht.' using errcode='22023';end if;
 insert into private.crm_audit(actor_id,command,record_id,details) values(actor,command,id,jsonb_build_object('requestId',request_id));
 insert into private.crm_receipts(scope,request_id,input_hash,result) values(actor::text,request_id,h,result);
 return result;
end$$;

create or replace function public.crm_intake(payload jsonb,request_id uuid,rate_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare p jsonb:=payload;h text;receipt private.crm_receipts;lead private.crm_leads;r uuid;a uuid;ts timestamptz;s private.crm_settings;result jsonb;hits integer;recipient uuid;notification_id uuid;begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Geen toegang.' using errcode='42501';end if;
 if request_id is null or jsonb_typeof(p) is distinct from 'object' or octet_length(p::text)>20000 or rate_key is null or rate_key !~ '^[a-f0-9]{64}$' then raise exception 'Controleer je aanvraag.' using errcode='22023';end if;
 if exists(select 1 from jsonb_object_keys(p)k where k not in('kind','name','company','email','phone','sector','team','goal','message','date','time')) then raise exception 'Ongeldige aanvraagvelden.' using errcode='22023';end if;
 p:=jsonb_build_object('kind',p->>'kind','name',btrim(coalesce(p->>'name','')),'company',btrim(coalesce(p->>'company','')),'email',lower(btrim(coalesce(p->>'email',''))),'phone',btrim(coalesce(p->>'phone','')),'sector',btrim(coalesce(p->>'sector','')),'team',btrim(coalesce(p->>'team','')),'goal',btrim(coalesce(p->>'goal','')),'message',btrim(coalesce(p->>'message','')),'date',nullif(p->>'date',''),'time',nullif(p->>'time',''));
 if (p->>'kind'='trial' and(p->>'date' is not null or p->>'time' is not null)) or coalesce(p->>'kind','') not in('trial','appointment','demo') or length(p->>'name') not between 1 and 160 or length(p->>'company') not between 1 and 180 or length(p->>'email')>254 or p->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
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

notify pgrst,'reload schema';
