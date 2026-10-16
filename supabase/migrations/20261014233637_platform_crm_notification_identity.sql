-- CRM inbox and delivery reuse the same confirmed, usable registry identity
-- as the CRM itself. General platform support grants never confer CRM access.
CREATE OR REPLACE FUNCTION private.notification_source_allowed(t uuid, code text, kind text, source uuid, revision text, recipient uuid, ctx text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare cr private.notification_campaign_recipients;c private.notification_campaigns;visit public.work_orders;event_kind text;
begin
 if kind='crm' then return t is null and ctx='platform' and code='crm.intake' and revision=source::text and exists(select 1 from private.crm_requests crm_source_row where crm_source_row.id=source) and private.crm_owner_valid(recipient);
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
notify pgrst,'reload schema';

-- Company/email normalization matches the source identity contract. A forward
-- rebuild of the unique identity index fails closed on an existing collision.
alter table private.crm_leads alter column normalized_company set expression as(lower(btrim(regexp_replace(company,'[[:space:]]+',' ','g'))));

-- Current contact fields may evolve; every received request remains immutable.
create or replace function public.crm_intake(payload jsonb,request_id uuid,rate_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare p jsonb:=payload;h text;receipt private.crm_receipts;lead private.crm_leads;r uuid;a uuid;ts timestamptz;s private.crm_settings;result jsonb;hits integer;recipient uuid;notification_id uuid;begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Geen toegang.' using errcode='42501';end if;
 if request_id is null or jsonb_typeof(p) is distinct from 'object' or octet_length(p::text)>20000 or rate_key is null or rate_key !~ '^[a-f0-9]{64}$' then raise exception 'Controleer je aanvraag.' using errcode='22023';end if;
 if exists(select 1 from jsonb_object_keys(p)k where k not in('kind','name','company','email','phone','sector','team','goal','message','date','time')) then raise exception 'Ongeldige aanvraagvelden.' using errcode='22023';end if;
 p:=jsonb_build_object('kind',p->>'kind','name',btrim(coalesce(p->>'name','')),'company',btrim(coalesce(p->>'company','')),'email',lower(btrim(coalesce(p->>'email',''))),'phone',btrim(coalesce(p->>'phone','')),'sector',btrim(coalesce(p->>'sector','')),'team',btrim(coalesce(p->>'team','')),'goal',btrim(coalesce(p->>'goal','')),'message',btrim(coalesce(p->>'message','')),'date',nullif(p->>'date',''),'time',nullif(p->>'time',''));
 if (p->>'kind'='trial' and(p->>'date' is not null or p->>'time' is not null)) or coalesce(p->>'kind','') not in('trial','appointment','demo') or length(p->>'name') not between 1 and 160 or length(p->>'company') not between 1 and 180 or length(p->>'email')>254 or p->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 or length(p->>'phone')>40 or(p->>'phone'<>'' and p->>'phone' !~ '^[+()0-9 .-]{6,40}$') or length(p->>'sector')>120 or length(p->>'team')>100 or length(p->>'goal')>500 or length(p->>'message')>5000
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
 perform pg_advisory_xact_lock(hashtextextended('crm-lead:'||lower(btrim(regexp_replace(p->>'company','[[:space:]]+',' ','g')))||':'||(p->>'email'),0));
 insert into private.crm_leads(name,company,email,phone,sector,team,owner_id,stage,next_action_at)
 values(p->>'name',p->>'company',p->>'email',p->>'phone',p->>'sector',p->>'team',private.crm_primary_admin(),case when p->>'kind'='trial' then 'new' else 'scheduled' end,null)
 on conflict(normalized_company,normalized_email) do update set name=excluded.name,company=excluded.company,email=excluded.email,phone=coalesce(nullif(excluded.phone,''),crm_leads.phone),sector=coalesce(nullif(excluded.sector,''),crm_leads.sector),team=coalesce(nullif(excluded.team,''),crm_leads.team),revision=crm_leads.revision+1,updated_at=clock_timestamp() returning * into lead;
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
