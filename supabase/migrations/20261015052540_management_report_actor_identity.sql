SET local check_function_bodies = off;

ALTER TABLE "private"."cockpit_reports"
  DROP CONSTRAINT "cockpit_reports_created_by_fkey";

ALTER TABLE "private"."cockpit_reports"
  ADD COLUMN "profile_user_id" uuid NOT NULL;

ALTER TABLE "private"."cockpit_reports"
  ALTER COLUMN "created_by" DROP NOT NULL;

CREATE OR REPLACE FUNCTION private.notification_source_allowed (
  t         uuid,
  code      text,
  kind      text,
  source    uuid,
  revision  text,
  recipient uuid,
  ctx       text
)
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare cr private.notification_campaign_recipients;c private.notification_campaigns;visit public.work_orders;event_kind text;
begin
 if kind='management_report' then return ctx='backoffice' and code='management.report.ready' and revision=source::text and exists(select 1 from private.cockpit_reports r where r.tenant_id=t and r.id=source and r.profile_user_id=recipient and private.report_readable(r,recipient));
 elsif kind='crm' then return t is null and ctx='platform' and code='crm.intake' and revision=source::text and exists(select 1 from private.crm_requests crm_source_row where crm_source_row.id=source) and private.crm_owner_valid(recipient);
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

CREATE OR REPLACE FUNCTION private.report_capture (
  t       uuid,
  actor   uuid,
  period  text,
  comment text
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare facts jsonb;policy jsonb;profile_key text;next_version integer;period_key text:=btrim(period);id uuid;brand public.tenant_branding;tenant public.tenants;begin
 if length(btrim(period)) not between 1 and 160 or length(comment)>10000 then raise exception 'Controleer rapportperiode en toelichting.' using errcode='22023';end if;
 select private.report_facts(t,actor),private.report_authority(t,actor),private.report_profile(t,actor) into facts,policy,profile_key;
 select * into tenant from public.tenants where tenants.id=t;select * into brand from public.tenant_branding where tenant_id=t;
 select coalesce(max(r.version),0)+1 into next_version from private.cockpit_reports r where r.tenant_id=t and r.period=period_key and r.profile=profile_key;
 insert into private.cockpit_reports(tenant_id,profile_user_id,period,version,profile,role_name,snapshot,authority,source_refs)
 values(t,actor,period_key,next_version,profile_key,private.report_role_name(t,actor),(facts-'sourceRefs')||jsonb_build_object('comment',btrim(comment),'tenant',tenant.name,'brand',coalesce(brand.primary_color,'#222c35'),'accent',coalesce(brand.accent_color,'#54b5b7'),'date',facts->>'today'),policy,facts->'sourceRefs') returning cockpit_reports.id into id;
 return id;
end$function$;

CREATE OR REPLACE FUNCTION private.report_readable (
  r              private.cockpit_reports,
  actor          uuid,
  current_policy jsonb
)
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 if not private.report_cockpit_access(r.tenant_id,'backoffice.reports.read',actor) or not private.report_cap(r.tenant_id,'backoffice.functions.cockpit_reports_query',actor) or not private.service_enabled(r.tenant_id,'rapportage') or not(r.profile_user_id=actor or private.report_owner(r.tenant_id,actor) or r.profile=private.report_profile(r.tenant_id,actor)) then return false;end if;
 if exists(select 1 from jsonb_array_elements_text(r.authority->'caps')c where not(current_policy->'caps'?c)) or exists(select 1 from jsonb_each(r.authority->'roles')x where x.value='true'::jsonb and current_policy->'roles'->x.key is distinct from 'true'::jsonb) or exists(select 1 from jsonb_array_elements_text(r.authority->'services')s where not(current_policy->'services'?s)) then return false;end if;
 return not exists(select 1 from jsonb_array_elements(r.source_refs)s where case when s->>'kind'='ticket' then not private.ticket_allowed((s->>'id')::uuid,'tenant','read',actor) when s->>'kind'='native_execution' then not(private.report_work_order_access(r.tenant_id,false,actor) and private.report_cap(r.tenant_id,'backoffice.work_orders.read',actor) and private.report_cap(r.tenant_id,'backoffice.functions.work_order_operational_rows',actor) and private.report_cap(r.tenant_id,'backoffice.functions.work_order_operational_task_data',actor)) else not private.report_cockpit_source(r.tenant_id,s->>'kind',(s->>'id')::uuid,false,actor) end);
end$function$;

CREATE OR REPLACE FUNCTION public.cockpit_reports_maintenance (
  batch_size integer DEFAULT 10
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare s private.cockpit_report_schedules;r private.cockpit_report_runs;j private.cockpit_report_jobs;actor uuid;report uuid;notification uuid;week date;processed integer:=0;policy jsonb;begin
 if auth.jwt()->>'role' is distinct from 'service_role' or batch_size is null or batch_size not between 1 and 25 then raise exception 'Alleen de bestaande rapportworker.' using errcode='42501';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('cockpit-reports-worker',0)) then return 0;end if;
 for s in select x.* from private.cockpit_report_schedules x join public.tenants t on t.id=x.tenant_id where x.enabled and x.next_run_at<=clock_timestamp() and t.status='active' and private.service_enabled(t.id,'rapportage') order by x.next_run_at,x.tenant_id limit batch_size loop
  perform pg_advisory_xact_lock(hashtextextended('cockpit-reports:'||s.tenant_id::text,0));select * into s from private.cockpit_report_schedules where tenant_id=s.tenant_id for update;
  if not s.enabled or s.next_run_at>clock_timestamp() then continue;end if;
  if not private.report_owner(s.tenant_id,s.owner_id) then update private.cockpit_report_schedules set enabled=false,revision=revision+1,updated_at=clock_timestamp() where tenant_id=s.tenant_id;continue;end if;
  week:=date_trunc('week',s.next_run_at at time zone(select timezone from public.tenants where id=s.tenant_id))::date;
  insert into private.cockpit_report_runs(tenant_id,week,schedule_revision,owner_id) values(s.tenant_id,week,s.revision,s.owner_id) on conflict do nothing returning * into r;
  if r.id is not null then
   insert into private.cockpit_report_jobs(run_id,recipient_id) select r.id,m.user_id from public.tenant_memberships m where m.tenant_id=s.tenant_id and m.status='active' and private.report_audience(s.tenant_id,m.user_id,s.audience) on conflict do nothing;
  end if;
  update private.cockpit_report_schedules set next_run_at=private.report_next_run(s.tenant_id,s.day,s.time_of_day,clock_timestamp()) where tenant_id=s.tenant_id;
 end loop;
 for j in select * from private.cockpit_report_jobs where state='pending' order by created_at,id limit batch_size loop
  select * into r from private.cockpit_report_runs where id=j.run_id;perform pg_advisory_xact_lock(hashtextextended('cockpit-reports:'||r.tenant_id::text,0));select * into j from private.cockpit_report_jobs where id=j.id and state='pending' for update;if not found then continue;end if;select * into s from private.cockpit_report_schedules where tenant_id=r.tenant_id;
  if not s.enabled or s.revision<>r.schedule_revision or not private.report_owner(r.tenant_id,s.owner_id) or not private.report_audience(r.tenant_id,j.recipient_id,s.audience) or not private.service_enabled(r.tenant_id,'rapportage') then update private.cockpit_report_jobs set state='cancelled',finished_at=clock_timestamp() where id=j.id;processed:=processed+1;continue;end if;
  report:=private.report_capture(r.tenant_id,j.recipient_id,'Week '||to_char(r.week,'IW')||' · '||to_char(r.week,'DD-MM-YYYY')||' – '||to_char(r.week+6,'DD-MM-YYYY'),'Wekelijkse momentopname volgens de ingestelde rapportplanning.');
  -- Link-only delivery uses the central policy, outbox, existing templates and
  -- provider lease. No confidential totals or PDF are placed in an email.
  notification:=private.notification_enqueue(r.tenant_id,'management.report.ready','management_report',report,report::text,'management-report:'||report::text,jsonb_build_object('recipient_user_id',j.recipient_id,'context','backoffice','channels',jsonb_build_array('in_app','email'),'path','/app/weekrapport?tab=archive&record='||report::text,'variables',jsonb_build_object('rapportperiode',(select period from private.cockpit_reports where id=report))));
  insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(r.tenant_id,null,'management.report.prepared','management_report',report,jsonb_build_object('run_id',r.id,'profile_user_id',j.recipient_id));
  update private.cockpit_report_jobs set state='ready',report_id=report,notification_id=notification,finished_at=clock_timestamp() where id=j.id;processed:=processed+1;
 end loop;return processed;
end$function$;

ALTER TABLE "private"."cockpit_reports"
  ADD CONSTRAINT "cockpit_reports_created_by_fkey1" FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE "private"."cockpit_reports"
  ADD CONSTRAINT "cockpit_reports_created_by_fkey" FOREIGN KEY (profile_user_id) REFERENCES auth.users(id);

COMMENT ON COLUMN "private"."cockpit_reports"."created_by" IS 'Actual initiating auth.uid(); NULL for service worker generation.';

COMMENT ON COLUMN "private"."cockpit_reports"."profile_user_id" IS 'Actual user whose current rights define this immutable snapshot; never an impersonated worker identity.';

ALTER TABLE "private"."cockpit_reports"
  ALTER COLUMN "created_by" SET DEFAULT auth.uid();

