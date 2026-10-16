SET local check_function_bodies = off;

REVOKE ALL ON FUNCTION "private"."report_backoffice"(uuid) FROM "authenticated";

REVOKE ALL ON FUNCTION "private"."report_storage_frozen"(text, text) FROM "authenticated";

CREATE TABLE "private"."cockpit_report_jobs" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "run_id"          uuid                     NOT NULL,
  "recipient_id"    uuid                     NOT NULL,
  "state"           text                     NOT NULL DEFAULT 'pending'::text,
  "report_id"       uuid,
  "notification_id" uuid,
  "created_at"      timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  "finished_at"     timestamp with time zone,
  CONSTRAINT "cockpit_report_jobs_pkey" PRIMARY KEY (id),
  CONSTRAINT "cockpit_report_jobs_run_id_recipient_id_key" UNIQUE (run_id, recipient_id),
  CONSTRAINT "cockpit_report_jobs_state_check" CHECK ((state = ANY (ARRAY['pending'::text, 'ready'::text, 'cancelled'::text])))
);

ALTER TABLE "private"."cockpit_report_jobs"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "private"."cockpit_report_jobs"
  FORCE ROW LEVEL SECURITY;

CREATE TABLE "private"."cockpit_report_runs" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"         uuid                     NOT NULL,
  "week"              date                     NOT NULL,
  "schedule_revision" bigint                   NOT NULL,
  "owner_id"          uuid                     NOT NULL,
  "created_at"        timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "cockpit_report_runs_pkey" PRIMARY KEY (id),
  CONSTRAINT "cockpit_report_runs_tenant_id_week_key" UNIQUE (tenant_id, week)
);

ALTER TABLE "private"."cockpit_report_runs"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "private"."cockpit_report_runs"
  FORCE ROW LEVEL SECURITY;

CREATE TABLE "private"."cockpit_report_schedules" (
  "tenant_id"   uuid                     NOT NULL,
  "enabled"     boolean                  NOT NULL DEFAULT false,
  "day"         smallint                 NOT NULL DEFAULT 1,
  "time_of_day" time without time zone   NOT NULL DEFAULT '08:30:00'::time WITHOUT time zone,
  "audience"    text                     NOT NULL DEFAULT 'Management'::text,
  "revision"    bigint                   NOT NULL DEFAULT 1,
  "owner_id"    uuid                     NOT NULL,
  "next_run_at" timestamp with time zone NOT NULL,
  "updated_at"  timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "cockpit_report_schedules_audience_check" CHECK ((audience = ANY (ARRAY['Management'::text, 'Eigenaar'::text, 'Kwaliteitsbeheer'::text, 'Financieel beheer'::text]))),
  CONSTRAINT "cockpit_report_schedules_day_check" CHECK (((day >= 1) AND (day <= 7))),
  CONSTRAINT "cockpit_report_schedules_pkey" PRIMARY KEY (tenant_id)
);

ALTER TABLE "private"."cockpit_report_schedules"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "private"."cockpit_report_schedules"
  FORCE ROW LEVEL SECURITY;

CREATE TABLE "private"."cockpit_reports" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"   uuid                     NOT NULL,
  "created_by"  uuid                     NOT NULL,
  "period"      text                     NOT NULL,
  "version"     integer                  NOT NULL,
  "profile"     text                     NOT NULL,
  "role_name"   text                     NOT NULL,
  "snapshot"    jsonb                    NOT NULL,
  "authority"   jsonb                    NOT NULL,
  "source_refs" jsonb                    NOT NULL,
  "created_at"  timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "cockpit_reports_period_check" CHECK (((length(btrim(period)) >= 1) AND (length(btrim(period)) <= 160))),
  CONSTRAINT "cockpit_reports_pkey" PRIMARY KEY (id),
  CONSTRAINT "cockpit_reports_tenant_id_period_profile_version_key" UNIQUE (tenant_id, period, profile, VERSION),
  CONSTRAINT "cockpit_reports_version_check" CHECK ((version > 0))
);

ALTER TABLE "private"."cockpit_reports"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "private"."cockpit_reports"
  FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.cockpit_report_immutable()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$begin raise exception 'Een rapportversie is een onveranderlijke momentopname.' using errcode='23514';end$function$;

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
 if kind='management_report' then return ctx='backoffice' and code='management.report.ready' and revision=source::text and exists(select 1 from private.cockpit_reports r where r.tenant_id=t and r.id=source and r.created_by=recipient and private.report_readable(r,recipient));
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

CREATE OR REPLACE FUNCTION private.report_assert (
  t       uuid,
  writing boolean DEFAULT false
)
  RETURNS void
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$begin
 perform private.cockpit_assert(t,'backoffice.reports.read');perform private.cockpit_assert(t,'backoffice.functions.cockpit_reports_query');perform private.cockpit_assert(t,'backoffice.followup.read');perform private.cockpit_assert(t,'backoffice.functions.cockpit_followup');
 if not private.service_enabled(t,'rapportage') then raise exception 'Managementrapportage is niet ingeschakeld.' using errcode='42501';end if;
 if writing then perform private.cockpit_assert(t,'backoffice.functions.cockpit_reports_command');end if;
end$function$;

CREATE OR REPLACE FUNCTION private.report_audience (
  t        uuid,
  actor    uuid,
  audience text
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select private.report_cap(t,'backoffice.reports.read',actor) and private.report_cap(t,'backoffice.functions.cockpit_reports_query',actor) and private.report_cap(t,'backoffice.followup.read',actor) and private.report_cap(t,'backoffice.functions.cockpit_followup',actor) and case audience when 'Eigenaar' then private.report_owner(t,actor) when 'Management' then private.report_owner(t,actor) or exists(select 1 from private.management_members mm join public.tenant_memberships m on m.id=mm.membership_id and m.tenant_id=mm.tenant_id join private.management_roles r on r.id=mm.role_id and r.tenant_id=mm.tenant_id where mm.tenant_id=t and m.user_id=actor and mm.revoked_at is null and m.status='active' and r.code='management') when 'Kwaliteitsbeheer' then private.report_cap(t,'backoffice.compliance.read',actor) when 'Financieel beheer' then private.report_cockpit_scope(t,'finance',actor) and private.report_cap(t,'backoffice.functions.cockpit_finance_query',actor) else false end
$function$;

CREATE OR REPLACE FUNCTION private.report_authority (
  t     uuid,
  actor uuid
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select jsonb_build_object('caps',coalesce((select jsonb_agg(c.key order by c.key) from public.permission_catalog c where c.domain='tenant' and c.action='read' and private.report_cap(t,c.key,actor)),'[]'),
 'roles',jsonb_build_object('ops',private.report_role(t,array['tenant_admin','management','planner','finance']::public.app_role[],actor),'planning',private.report_planning_access(t,actor),'commercial',private.report_commercial_access(t,actor),'hr',private.report_dossier_access(t,actor)),
 'services',coalesce((select to_jsonb(s.enabled_services) from public.tenant_settings s where s.tenant_id=t),'[]'))
$function$;

CREATE OR REPLACE FUNCTION private.report_can_access_personnel (
  target_tenant_id    uuid,
  target_personnel_id uuid,
  sensitive           boolean DEFAULT false,
  report_actor        uuid    DEFAULT NULL::uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select coalesce(private.report_current_personnel_id(target_tenant_id,report_actor)=target_personnel_id,false) or
 case when sensitive then
 private.report_role(target_tenant_id,array['tenant_admin','management','hr']::public.app_role[],report_actor) and private.report_cap(target_tenant_id,'backoffice.personnel.sensitive',report_actor)
 else private.report_role(target_tenant_id,array['tenant_admin','management','planner','hr']::public.app_role[],report_actor) and (private.report_cap(target_tenant_id,'backoffice.personnel.read',report_actor) or private.report_cap(target_tenant_id,'backoffice.planning.read',report_actor)) end;
$function$;

CREATE OR REPLACE FUNCTION private.report_cap (
  t            uuid,
  cap          text,
  report_actor uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select private.report_role(t,array['tenant_admin','management','planner','finance','hr']::public.app_role[],report_actor) and(not private.management_is_managed(t,report_actor) or(private.management_has(t,report_actor,'backoffice.access') and private.management_has(t,report_actor,cap)))
$function$;

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
 insert into private.cockpit_reports(tenant_id,created_by,period,version,profile,role_name,snapshot,authority,source_refs)
 values(t,actor,period_key,next_version,profile_key,private.report_role_name(t,actor),(facts-'sourceRefs')||jsonb_build_object('comment',btrim(comment),'tenant',tenant.name,'brand',coalesce(brand.primary_color,'#222c35'),'accent',coalesce(brand.accent_color,'#54b5b7'),'date',facts->>'today'),policy,facts->'sourceRefs') returning cockpit_reports.id into id;
 return id;
end$function$;

CREATE OR REPLACE FUNCTION private.report_cockpit_access (
  t            uuid,
  cap          text,
  report_actor uuid DEFAULT NULL::uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select coalesce(true and exists(select 1 from auth.users u where u.id=report_actor and u.email_confirmed_at is not null)
 and private.report_role(t,array['tenant_admin','management','planner','finance','hr']::public.app_role[],report_actor)
 and private.report_cap(t,'backoffice.access',report_actor) and private.report_cap(t,cap,report_actor),false)
$function$;

CREATE OR REPLACE FUNCTION private.report_cockpit_action_visible (
  a            private.cockpit_actions,
  report_actor uuid                    DEFAULT NULL::uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select private.report_cockpit_access(a.tenant_id,'backoffice.followup.read',report_actor) and private.report_cockpit_scope(a.tenant_id,a.scope,report_actor) and private.report_cockpit_source(a.tenant_id,a.source_kind,a.source_id,false,report_actor)
 and(case when a.trigger_key like 'decision:%' then exists(select 1 from private.cockpit_decisions d where d.tenant_id=a.tenant_id and d.id=split_part(a.trigger_key,':',2)::uuid and private.report_cockpit_decision_visible(d,report_actor))
 when a.trigger_key like 'requirement:%' then exists(select 1 from private.cockpit_requirements r where r.tenant_id=a.tenant_id and r.id=split_part(a.trigger_key,':',2)::uuid and private.report_cockpit_requirement_visible(r,report_actor))
 when a.trigger_key like 'sla-ticket:%' then private.report_cockpit_access(a.tenant_id,'backoffice.sla.read',report_actor) and private.report_cockpit_access(a.tenant_id,'backoffice.functions.cockpit_sla_query',report_actor) and private.service_enabled(a.tenant_id,'rapportage') and exists(select 1 from public.tickets t where t.tenant_id=a.tenant_id and t.id=split_part(a.trigger_key,':',2)::uuid and private.ticket_allowed(t.id,'tenant','read',report_actor)) else true end)
$function$;

CREATE OR REPLACE FUNCTION private.report_cockpit_decision_visible (
  d            private.cockpit_decisions,
  report_actor uuid                      DEFAULT NULL::uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select private.report_cockpit_access(d.tenant_id,'backoffice.decisions.read',report_actor) and private.report_cockpit_scope(d.tenant_id,d.scope,report_actor) and private.report_cockpit_source(d.tenant_id,d.source_kind,d.source_id,false,report_actor)
$function$;

CREATE OR REPLACE FUNCTION private.report_cockpit_evidence (
  t            uuid,
  kind         text,
  parent       uuid,
  evidence     uuid,
  report_actor uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare d public.dossier_documents;allowed boolean:=false;begin
 if evidence is null or not private.report_cockpit_source(t,kind,parent,false,report_actor) then return null;end if;
 select * into d from public.dossier_documents where tenant_id=t and id=evidence;
 if not found then return null;end if;
 if d.source_kind='customer' then
  allowed:=private.report_commercial_access(t,report_actor) and private.report_management_table_allowed(t,'customer_documents',false,report_actor)
   and((kind='customer' and d.customer_id=parent) or(kind='agreement' and exists(select 1 from public.customer_agreements where tenant_id=t and id=parent and customer_id=d.customer_id)) or kind='tenant');
 elsif d.source_kind='object' then
  allowed:=private.report_object_manage(t,report_actor) and private.report_management_table_allowed(t,'object_documents',false,report_actor) and private.report_cap(t,'backoffice.functions.get_object_document',report_actor)
   and((kind='object' and d.object_id=parent) or(kind='customer' and d.customer_id=parent) or kind='tenant')
   and exists(select 1 from public.object_documents where tenant_id=t and id=d.source_id and(category<>'security' or private.report_cap(t,'backoffice.objects.secrets.read',report_actor)));
 elsif d.source_kind='personnel' then
  allowed:=kind='personnel' and d.personnel_id=parent and private.report_cockpit_scope(t,'personnel',report_actor) and private.report_can_access_personnel(t,parent,true,report_actor)
   and private.report_management_table_allowed(t,'personnel_documents',false,report_actor) and private.report_cap(t,'backoffice.functions.personnel_document_file',report_actor);
 end if;
 if not coalesce(allowed,false) then return null;end if;
 return private.cockpit_evidence_identity(t,kind,parent,evidence);
end$function$;

CREATE OR REPLACE FUNCTION private.report_cockpit_requirement_status (
  r            private.cockpit_requirements,
  report_actor uuid                         DEFAULT NULL::uuid
)
  RETURNS text
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare e jsonb;today date:=(now() at time zone(select timezone from public.tenants where id=r.tenant_id))::date;begin
 e:=private.report_cockpit_evidence(r.tenant_id,r.source_kind,r.source_id,r.evidence_id,report_actor);
 return case when e is null then 'Ontbreekt' when r.approved_fingerprint is distinct from e->>'fingerprint' or r.expires_on<today or r.owner_id is null or not private.cockpit_owner(r.tenant_id,r.owner_id) then 'Herbeoordeling' when r.expires_on<=today+30 then 'Verloopt binnenkort' else 'Geldig' end;
end$function$;

CREATE OR REPLACE FUNCTION private.report_cockpit_requirement_visible (
  r            private.cockpit_requirements,
  report_actor uuid                         DEFAULT NULL::uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select private.report_cockpit_access(r.tenant_id,'backoffice.compliance.read',report_actor) and private.report_cockpit_scope(r.tenant_id,'quality',report_actor) and private.report_cockpit_source(r.tenant_id,r.source_kind,r.source_id,false,report_actor)
 and(r.source_kind<>'personnel' or private.report_cockpit_scope(r.tenant_id,'personnel',report_actor))
$function$;

CREATE OR REPLACE FUNCTION private.report_cockpit_scope (
  t            uuid,
  scope        text,
  report_actor uuid DEFAULT NULL::uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select case scope when 'general' then true when 'finance' then private.report_commercial_access(t,report_actor) and private.report_cap(t,'backoffice.finance.read',report_actor) and private.service_enabled(t,'finance')
 when 'personnel' then private.report_dossier_access(t,report_actor) and private.report_cap(t,'backoffice.personnel.sensitive',report_actor)
 when 'quality' then private.report_cap(t,'backoffice.reports.read',report_actor) and private.service_enabled(t,'rapportage') else false end
$function$;

CREATE OR REPLACE FUNCTION private.report_cockpit_service_dto (
  v            private.cockpit_service_versions,
  detail       boolean                          DEFAULT false,
  report_actor uuid                             DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare measured jsonb;history jsonb;begin
 if not private.report_cockpit_service_visible(v,report_actor) then return null;end if;
 measured:=case when v.kind in('response','resolution') then jsonb_build_object('status','Op koers','result','Nog geen gekoppeld ticket','facts','[]'::jsonb,'factTotal',0) else private.cockpit_service_measure(v) end;
 if detail then select coalesce(jsonb_agg(jsonb_build_object('version',z.version,'norm',z.norm,'createdAt',z.created_at,'agreementId',z.agreement_id,'periodFrom',z.period_from,'periodUntil',z.period_until) order by z.version desc),'[]') into history from(select old.* from private.cockpit_service_versions old where old.service_id=v.service_id and private.report_cockpit_service_visible(old,report_actor) order by old.version desc limit 50)z;end if;
 return jsonb_build_object('id','service:'||v.service_id,'serviceId',v.service_id,'version',v.version,'revision',(select revision from private.cockpit_services where id=v.service_id),'kind',v.kind,'categoryId',v.category_id,'norm',v.norm,'target',v.target,'periodFrom',v.period_from,'periodUntil',v.period_until,
  'timezone',v.measurement_timezone,'canOpenContract',private.report_cockpit_source(v.tenant_id,'agreement',v.agreement_id,false,report_actor),'customerId',v.customer_id,'customer',(select name from public.customers where id=v.customer_id),'objectId',v.object_id,'object',(select name from public.objects where id=v.object_id),
  'agreementId',v.agreement_id,'contract',(select title||' · v'||version from public.customer_agreements where id=v.agreement_id),'ticket',null,
  'status',measured->>'status','result',measured->>'result','facts',case when detail then measured->'facts' else '[]'::jsonb end,'factTotal',coalesce((measured->>'factTotal')::integer,0),'historyTotal',(select count(*) from private.cockpit_service_versions old where old.service_id=v.service_id and private.report_cockpit_service_visible(old,report_actor)),'history',coalesce(history,'[]'::jsonb));
end$function$;

CREATE OR REPLACE FUNCTION private.report_cockpit_service_source (
  v            private.cockpit_service_versions,
  writing      boolean                          DEFAULT false,
  report_actor uuid                             DEFAULT NULL::uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select private.report_cockpit_source(v.tenant_id,'object',v.object_id,false,report_actor) and private.report_cockpit_source(v.tenant_id,'customer',v.customer_id,false,report_actor)
 and exists(select 1 from public.customer_agreements a join public.customer_agreement_lines l on l.tenant_id=a.tenant_id and l.agreement_id=a.id join public.objects o on o.tenant_id=a.tenant_id and o.id=l.object_id where a.tenant_id=v.tenant_id and a.id=v.agreement_id and a.customer_id=v.customer_id and l.object_id=v.object_id and(not writing or(a.state='active' and o.customer_id=a.customer_id)))
$function$;

CREATE OR REPLACE FUNCTION private.report_cockpit_service_visible (
  v            private.cockpit_service_versions,
  report_actor uuid                             DEFAULT NULL::uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select private.report_cockpit_service_source(v,false,report_actor) and(v.kind in('response','resolution') or(private.report_planning_access(v.tenant_id,report_actor) and private.report_cap(v.tenant_id,'backoffice.work_orders.read',report_actor) and private.report_cap(v.tenant_id,'backoffice.functions.work_order_dossier',report_actor) and private.report_cockpit_scope(v.tenant_id,'quality',report_actor)))
$function$;

CREATE OR REPLACE FUNCTION private.report_cockpit_sla_ticket_dto (
  t            public.tickets,
  kind         text,
  detail       boolean        DEFAULT false,
  report_actor uuid           DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare b private.cockpit_ticket_service_bindings;v private.cockpit_service_versions;due timestamptz;finished timestamptz;breached timestamptz;norm integer;remaining integer;elapsed integer;cfg jsonb;status text;result text;dto jsonb;history jsonb;history_total bigint:=0;contract_visible boolean;begin
 if t.route<>'internal' or not private.ticket_allowed(t.id,'tenant','read',report_actor) or t.status='cancelled' or kind not in('response','resolution') then return null;end if;
 select * into b from private.cockpit_ticket_service_bindings where ticket_id=t.id;
 select * into v from private.cockpit_service_versions where id=case report_cockpit_sla_ticket_dto.kind when 'response' then b.response_version else b.resolution_version end;
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
 contract_visible:=v.id is not null and private.report_cockpit_service_source(v,false,report_actor);
 if detail then
  dto:=private.ticket_dto(t.id,'tenant',report_actor,false);
  select count(*) into history_total from public.ticket_events e where e.ticket_id=t.id and private.ticket_event_allowed(e.id,'tenant',report_actor);
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'type',e.type,'label',e.label,'audience',e.audience,'actor_name',case when e.actor_user_id=report_actor then 'U' when e.actor_user_id is null then 'Systeem' else 'Behandelaar' end,'created_at',e.created_at) order by e.created_at,e.id),'[]') into history from(select * from public.ticket_events e where e.ticket_id=t.id and private.ticket_event_allowed(e.id,'tenant',report_actor) order by e.created_at desc,e.id desc limit 100)e;
  if norm is not null and remaining is not null and not(case kind when 'response' then b.response_overdue_pause else b.resolution_overdue_pause end) then elapsed:=greatest(0,norm-remaining)+case when due is not null and coalesce(finished,now())>due then private.ticket_business_remaining(due,coalesce(finished,now()),cfg) else 0 end;end if;
 end if;
 return jsonb_build_object('id','ticket:'||t.id||':'||kind,'serviceId',case when contract_visible then v.service_id end,'version',case when contract_visible then v.version end,'revision',null,'kind',kind,'categoryId',t.category_id,
  'norm',case when contract_visible then v.norm when norm is not null then 'Binnen '||norm||' werkminuten' when due is not null then 'Brondeadline '||to_char(due at time zone(cfg->>'timezone'),'DD-MM-YYYY HH24:MI') else 'Bestaande ticketklok' end,'target',norm,'periodFrom',null,'periodUntil',null,
  'timezone',cfg->>'timezone','canOpenContract',coalesce(contract_visible and private.report_cockpit_source(t.tenant_id,'agreement',v.agreement_id,false,report_actor),false),'customerId',case when private.report_cockpit_source(t.tenant_id,'customer',t.customer_id,false,report_actor) then t.customer_id end,'customer',case when private.report_cockpit_source(t.tenant_id,'customer',t.customer_id,false,report_actor) then(select name from public.customers where id=t.customer_id) else 'Geen zichtbare klant' end,
  'objectId',case when private.report_cockpit_source(t.tenant_id,'object',t.object_id,false,report_actor) then t.object_id end,'object',case when private.report_cockpit_source(t.tenant_id,'object',t.object_id,false,report_actor) then(select name from public.objects where id=t.object_id) else 'Geen zichtbaar object' end,
  'agreementId',case when contract_visible then v.agreement_id end,'contract',case when contract_visible then(select title||' · v'||version from public.customer_agreements where id=v.agreement_id) else 'Bestaand ticketbeleid' end,
  'status',status,'result',result,'facts','[]'::jsonb,'factTotal',0,'historyTotal',history_total,'history',coalesce(history,'[]'::jsonb),
  'ticket',jsonb_build_object('id',t.id,'number',t.number,'revision',private.ticket_view_revision(t.id,'tenant',report_actor),'firstResponseAt',t.first_response_at,'resolvedAt',t.resolved_at,'status',t.status,'paused',t.paused_minutes is not null,'responseDeadline',t.first_response_due_at,'resolutionDeadline',t.resolution_due_at,
   'elapsed',elapsed,'clockRecorded',b.ticket_id is not null,'canPause',(select pause_while_waiting from public.ticket_categories where id=t.category_id),'permissions',case when detail and private.report_cockpit_access(t.tenant_id,'backoffice.functions.cockpit_sla_ticket_event',report_actor) then dto->'permissions' else '{}'::jsonb end));
end$function$;

CREATE OR REPLACE FUNCTION private.report_cockpit_source (
  t            uuid,
  kind         text,
  rid          uuid,
  writing      boolean DEFAULT false,
  report_actor uuid    DEFAULT NULL::uuid
)
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare action text:=case when writing then 'write' else 'read' end;begin
 if rid is null or not private.report_cockpit_access(t,'backoffice.followup.read',report_actor) then return false;end if;
 case kind
 when 'tenant' then return rid=t and not writing;
 when 'customer' then return private.report_commercial_access(t,report_actor) and private.report_cap(t,'backoffice.customers.'||action,report_actor) and exists(select 1 from public.customers where tenant_id=t and id=rid);
 when 'object' then return private.report_object_manage(t,report_actor) and private.report_management_table_allowed(t,'objects',writing,report_actor) and exists(select 1 from public.objects where tenant_id=t and id=rid);
 when 'personnel' then return private.report_can_access_personnel(t,rid,true,report_actor) and private.report_management_table_allowed(t,'personnel_dossier_items',writing,report_actor) and exists(select 1 from public.personnel where tenant_id=t and id=rid);
 when 'work_order' then return private.report_planning_access(t,report_actor) and private.report_cap(t,'backoffice.work_orders.'||action,report_actor) and private.report_cap(t,'backoffice.functions.work_order_dossier',report_actor) and exists(select 1 from public.work_orders where tenant_id=t and id=rid);
 when 'commercial_request' then return private.report_commercial_access(t,report_actor) and private.report_cap(t,'backoffice.commercial.'||action,report_actor) and private.report_cap(t,'backoffice.functions.commercial_detail',report_actor) and exists(select 1 from public.requests where tenant_id=t and id=rid);
 when 'quote' then return private.report_commercial_access(t,report_actor) and private.report_cap(t,'backoffice.commercial.'||action,report_actor) and private.report_cap(t,'backoffice.functions.commercial_detail',report_actor) and exists(select 1 from public.quotes where tenant_id=t and id=rid);
 when 'agreement' then return private.report_commercial_access(t,report_actor) and private.report_cap(t,'backoffice.customers.'||action,report_actor) and(private.report_cap(t,'backoffice.finance.read',report_actor) or private.report_cap(t,'backoffice.commercial.read',report_actor)) and exists(select 1 from public.customer_agreements where tenant_id=t and id=rid);
 when 'object_action' then return private.report_object_manage(t,report_actor) and private.report_management_table_allowed(t,'object_records',writing,report_actor) and exists(select 1 from public.object_records where tenant_id=t and id=rid and object_records.kind in('task','quality','material'));
 when 'personnel_action' then return exists(select 1 from public.personnel_dossier_items p where p.tenant_id=t and p.id=rid and p.kind in('task','checklist') and private.report_can_access_personnel(t,p.personnel_id,true,report_actor)) and private.report_management_table_allowed(t,'personnel_dossier_items',writing,report_actor);
 when 'execution' then return private.report_planning_access(t,report_actor) and private.report_cap(t,'backoffice.work_orders.'||action,report_actor) and private.report_cap(t,'backoffice.functions.work_order_operational_task_data',report_actor) and exists(select 1 from public.work_order_tasks where tenant_id=t and id=rid);
 when 'request' then return private.report_object_manage(t,report_actor) and private.report_management_table_allowed(t,'object_visit_requests',writing,report_actor) and exists(select 1 from public.object_visit_requests where tenant_id=t and id=rid);
 else return false;
 end case;
end$function$;

CREATE OR REPLACE FUNCTION private.report_commercial_access (
  t            uuid,
  report_actor uuid DEFAULT NULL::uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select private.report_cap(t,'backoffice.commercial.read',report_actor) and true and private.report_role(t,array['tenant_admin','management','finance']::public.app_role[],report_actor)
 and exists(select 1 from public.tenants where id=t and status='active');
$function$;

CREATE OR REPLACE FUNCTION private.report_current_personnel_id (
  target_tenant_id uuid,
  report_actor     uuid DEFAULT NULL::uuid
)
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select p.id from public.personnel p
 where p.tenant_id=target_tenant_id and p.user_id=(select report_actor) and p.status='active'
   and (select private.report_role(target_tenant_id,array['staff']::public.app_role[],report_actor)) limit 1;
$function$;

CREATE OR REPLACE FUNCTION private.report_dossier_access (
  t            uuid,
  report_actor uuid DEFAULT NULL::uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select private.report_cap(t,'backoffice.personnel.sensitive',report_actor) and report_actor is not null and private.report_role(t,array['tenant_admin','management','hr']::public.app_role[],report_actor)
 and private.service_enabled(t,'personeel');
$function$;

CREATE OR REPLACE FUNCTION private.report_dto (
  r private.cockpit_reports
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$select r.snapshot||jsonb_build_object('id',r.id,'period',r.period,'version',r.version,'role',r.role_name,'createdAt',r.created_at)$function$;

CREATE OR REPLACE FUNCTION private.report_facts (
  t     uuid,
  actor uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare today date;ops boolean;hr boolean;fin boolean;quality boolean;sla_allowed boolean;open_count bigint;overdue_count bigint;sla_total bigint;sla_on_track bigint;compliance bigint:=0;decisions bigint:=0;confirmed bigint:=0;review bigint:=0;unpaid bigint:=0;refs jsonb;ticket_refs jsonb;begin
 if not private.report_cockpit_access(t,'backoffice.reports.read',actor) or not private.report_cap(t,'backoffice.functions.cockpit_reports_query',actor) or not private.report_cap(t,'backoffice.followup.read',actor) or not private.report_cap(t,'backoffice.functions.cockpit_followup',actor) or not private.service_enabled(t,'rapportage') then raise exception 'Geen toegang tot managementrapportage.' using errcode='42501';end if;
 today:=(now() at time zone(select timezone from public.tenants where id=t))::date;
 ops:=private.report_role(t,array['tenant_admin','management','planner','finance']::public.app_role[],actor) and private.service_enabled(t,'planning');hr:=private.report_dossier_access(t,actor);
 fin:=private.report_cockpit_scope(t,'finance',actor) and private.report_cap(t,'backoffice.functions.cockpit_finance_query',actor) and private.report_cap(t,'backoffice.functions.execution_invoice_concepts',actor);
 quality:=private.report_cockpit_scope(t,'quality',actor) and private.report_cap(t,'backoffice.compliance.read',actor);
 sla_allowed:=private.report_cap(t,'backoffice.sla.read',actor) and private.report_cap(t,'backoffice.functions.cockpit_sla_query',actor);
 -- Exact native operational branches, including the safe operational task
 -- projection: no financial table bypass and no INVOKER RPC under definer.
 with orders as materialized(select w.id,w.projected_end_at from public.work_orders w where w.tenant_id=t and ops and private.report_work_order_access(t,false,actor) and private.report_cap(t,'backoffice.work_orders.read',actor) and private.report_cap(t,'backoffice.functions.work_order_operational_rows',actor)),
 native as materialized(
  select 'request'::text kind,r.id,r.state::text status,null::date due_on from public.object_visit_requests r join orders w on w.id=r.work_order_id where r.tenant_id=t and ops and private.report_object_manage(t,actor) and private.report_management_table_allowed(t,'object_visit_requests',false,actor)
  union all select 'execution',r.id,case when r.completed_at is not null and r.execution_state='planned' then 'completed' else r.execution_state::text end,(w.projected_end_at at time zone(select timezone from public.tenants where id=t))::date from public.work_order_tasks r join orders w on w.id=r.work_order_id where r.tenant_id=t and ops and private.report_work_order_access(t,false,actor) and private.report_cap(t,'backoffice.work_orders.read',actor) and private.report_cap(t,'backoffice.functions.work_order_operational_task_data',actor)
  union all select 'object',r.id,r.state::text,r.due_on from public.object_records r where r.tenant_id=t and ops and r.kind in('task','quality','material') and private.report_object_manage(t,actor) and private.report_management_table_allowed(t,'object_records',false,actor)
  union all select 'personnel',r.id,r.dossier_status::text,r.due_on from public.personnel_dossier_items r where r.tenant_id=t and hr and r.kind in('task','checklist') and private.report_management_table_allowed(t,'personnel_dossier_items',false,actor)
 ), states as materialized(
  select n.kind,n.id,n.due_on,case when n.status in('completed','not_done','archived','rejected','withdrawn','cancelled') then 'done' when o.snoozed_until>today then 'snoozed' else 'open' end state from native n left join private.cockpit_action_overlays o on o.tenant_id=t and o.source_kind=n.kind and o.source_id=n.id and private.report_cockpit_source(t,case n.kind when 'object' then 'object_action' when 'personnel' then 'personnel_action' else n.kind end,n.id,false,actor)
  union all select a.source_kind,a.source_id,a.due_on,case when a.state='done' then 'done' when a.source_paused or a.snoozed_until>today then 'snoozed' else 'open' end from private.cockpit_actions a where a.tenant_id=t and private.report_cockpit_action_visible(a,actor)
 )select count(*) filter(where state='open'),count(*) filter(where state='open' and due_on<today),coalesce(jsonb_agg(distinct jsonb_build_object('kind',case kind when 'object' then 'object_action' when 'personnel' then 'personnel_action' when 'execution' then 'native_execution' else kind end,'id',id)),'[]') into open_count,overdue_count,refs from states;
 if sla_allowed then
  with service_rows as materialized(select private.report_cockpit_service_dto(v,false,actor) row from private.cockpit_services s join private.cockpit_service_versions v on v.service_id=s.id and v.version=s.version where s.tenant_id=t and(v.kind not in('response','resolution') or not exists(select 1 from private.cockpit_ticket_service_bindings b join public.tickets tk on tk.id=b.ticket_id where b.tenant_id=t and(v.id=b.response_version or v.id=b.resolution_version) and tk.status<>'cancelled' and private.ticket_allowed(tk.id,'tenant','read',actor)))),
  ticket_rows as materialized(select private.report_cockpit_sla_ticket_dto(tk,k.kind,false,actor) row from public.tickets tk cross join(values('response'),('resolution'))k(kind) where tk.tenant_id=t and tk.route='internal' and private.ticket_allowed(tk.id,'tenant','read',actor)),
  all_rows as(select row from service_rows where row is not null union all select row from ticket_rows where row is not null)
  select count(*),count(*) filter(where row->>'status'='Op koers') into sla_total,sla_on_track from all_rows;
 else sla_total:=0;sla_on_track:=0;end if;
 if fin then
  select coalesce(sum((x.row->>'amountCents')::bigint) filter(where x.row->>'category'='confirmed'),0),coalesce(sum((x.row->>'amountCents')::bigint) filter(where x.row->>'category'='review'),0) into confirmed,review from private.cockpit_finance_task_rows(t)x(row);
  select coalesce(sum((x.row->>'amountCents')::bigint),0) into unpaid from private.cockpit_finance_invoice_rows(t)x(row);
 end if;
 if quality then select count(*) into compliance from private.cockpit_requirements r where r.tenant_id=t and private.report_cockpit_requirement_visible(r,actor) and private.report_cockpit_requirement_status(r,actor)<>'Geldig';end if;
 if private.report_cap(t,'backoffice.decisions.read',actor) then select count(*) into decisions from private.cockpit_decisions d where d.tenant_id=t and d.state='final' and private.report_cockpit_decision_visible(d,actor);end if;
 -- Preserve source classification and concrete ticket scopes for archive reads.
 select coalesce(jsonb_agg(jsonb_build_object('kind','ticket','id',tk.id)),'[]') into ticket_refs from public.tickets tk where tk.tenant_id=t and tk.route='internal' and sla_allowed and private.ticket_allowed(tk.id,'tenant','read',actor);
 refs:=refs||ticket_refs||coalesce((select jsonb_agg(distinct jsonb_build_object('kind',d.source_kind,'id',d.source_id)) from private.cockpit_decisions d where d.tenant_id=t and d.state='final' and private.report_cockpit_decision_visible(d,actor)),'[]')||coalesce((select jsonb_agg(distinct jsonb_build_object('kind',r.source_kind,'id',r.source_id)) from private.cockpit_requirements r where r.tenant_id=t and quality and private.report_cockpit_requirement_visible(r,actor)),'[]');
 return jsonb_build_object('today',today,'open',open_count,'overdue',overdue_count,'sla',case when sla_total>0 then round(100.0*sla_on_track/sla_total) else null end,'slaTotal',sla_total,'confirmed',confirmed,'review',review,'unpaid',unpaid,'compliance',compliance,'decisions',decisions,'finance',fin,'quality',quality,'sourceRefs',refs);
end$function$;

CREATE OR REPLACE FUNCTION private.report_management_table_allowed (
  t            uuid,
  resource     text,
  writing      boolean,
  report_actor uuid    DEFAULT NULL::uuid
)
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare module text;
begin
 if not private.management_is_managed(t,report_actor) then return true;end if;
 if not writing and resource in ('task_revisions','work_order_tasks','work_orders','work_order_expenses','work_order_report_versions') and not private.report_cap(t,'backoffice.finance.read',report_actor) then return false;end if;
 if not writing and resource in ('object_request_proposals','object_history','customer_agreements','customer_agreement_lines') and not(private.report_cap(t,'backoffice.finance.read',report_actor) or private.report_cap(t,'backoffice.commercial.read',report_actor)) then return false;end if;
 if resource='dossier_documents' then return not writing;end if;
 if resource='staff_workspace_revisions' then return true and private.management_has(t,report_actor,'backoffice.access') and not writing;end if;
 if resource='staff_day_reviews' then return private.report_cap(t,'backoffice.personnel.'||case when writing then 'write' else 'read' end,report_actor);end if;
 if resource in ('tenant_branding','tenant_settings') and not writing then return true and private.management_has(t,report_actor,'backoffice.access');end if;
 if resource in ('tenant_memberships','tenant_admin_invitations','permission_grants','audit_events') then return true and private.management_has(t,report_actor,'management.users.read') and (not writing or private.management_has(t,report_actor,'management.users.manage'));end if;
 if resource in ('personnel_contracts','personnel_documents','personnel_notes','dossier_documents','personnel_dossier_items','personnel_dossier_history','personnel_dossier_access','personnel_dossier_deliveries','certificates') and not private.report_cap(t,'backoffice.personnel.sensitive',report_actor) then return false;end if;
 if resource like 'ticket%' or resource in ('notifications','push_subscriptions') then return true;end if;
 select v.module into module from (values ('customers','customers'),('customer_contacts','customers'),('customer_documents','customers'),('customer_notes','customers'),('customer_agreements','customers'),('customer_agreement_lines','customers'),('customer_portal_accounts','customers'),('customer_portal_revisions','customers'),('objects','objects'),('object_documents','objects'),('object_history','objects'),('object_records','objects'),('object_nodes','objects'),('object_customer_bindings','objects'),('object_reminder_recipients','objects'),('object_visit_requests','objects'),('object_request_proposals','objects'),('object_request_receipts','objects'),('object_instruction_receipts','objects'),('requests','commercial'),('quotes','commercial'),('commercial_attachments','commercial'),('commercial_events','commercial'),('booking_options','commercial'),('appointment_slots','commercial'),('commercial_billing_periods','finance'),('task_catalog','tasks'),('task_categories','tasks'),('task_revisions','tasks'),('extra_work_rules','tasks'),('personnel','personnel'),('function_catalog','personnel'),('personnel_functions','personnel'),('qualifications','personnel'),('qualification_types','personnel'),('qualification_requirements','personnel'),('certificates','personnel'),('availability','personnel'),('personnel_contracts','personnel'),('personnel_documents','personnel'),('personnel_notes','personnel'),('dossier_documents','personnel'),('personnel_dossier_items','personnel'),('personnel_dossier_history','personnel'),('personnel_dossier_access','personnel'),('personnel_dossier_deliveries','personnel'),('staff_leave_entitlements','personnel'),('staff_leave_requests','personnel'),('staff_time_correction_requests','personnel'),('invoices','finance'),('invoice_lines','finance'),('invoice_sequences','finance'),('invoice_groups','finance'),('invoice_group_items','finance'),('payment_attempts','finance'),('payment_allocations','finance'),('announcements','news'),('announcement_reads','news'),('reminders','followup'),('planning_changes','planning'),('travel_depots','settings'),('personnel_travel_days','planning'),('tenant_settings','settings'),('tenant_branding','settings'),('tenant_message_templates','settings'),('tenant_message_template_revisions','settings'),('tenant_domains','settings'),('tenant_provider_connections','settings'),('work_orders','work_orders'),('work_order_assignments','planning'),('dispatches','planning'),('open_shifts','planning'),('shift_interests','planning'),('time_entries','personnel'),('travel_legs','planning'),('status_events','work_orders'),('report_entries','reports'),('attachments','reports'),('signatures','reports'),('review_decisions','reports'))v(resource,module) where v.resource=report_management_table_allowed.resource;
 if module is null and resource like 'work_order%' then module:='work_orders';end if;
 if module is null then return false;end if;
 return private.report_cap(t,'backoffice.'||module||case when writing then '.write' else '.read' end,report_actor);
end$function$;

CREATE OR REPLACE FUNCTION private.report_next_run (
  t          uuid,
  day        integer,
  at_time    time without time zone,
  after_time timestamp with time zone
)
  RETURNS timestamp WITH time zone
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select min((d::date+at_time) at time zone tenant.timezone) from public.tenants tenant cross join lateral generate_series((after_time at time zone tenant.timezone)::date::timestamp,(after_time at time zone tenant.timezone)::date::timestamp+interval '14 days',interval '1 day') d where tenant.id=t and extract(isodow from d)=day and((d::date+at_time) at time zone tenant.timezone)>after_time
$function$;

CREATE OR REPLACE FUNCTION private.report_object_manage (
  t            uuid,
  report_actor uuid DEFAULT NULL::uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select true and private.report_role(t,array['tenant_admin','management','planner']::public.app_role[],report_actor)
 and private.report_cap(t,'backoffice.objects.read',report_actor)
 and exists(select 1 from public.tenants x join public.tenant_settings s on s.tenant_id=x.id where x.id=t and x.status='active' and 'planning'=any(s.enabled_services));
$function$;

CREATE OR REPLACE FUNCTION private.report_owner (
  t     uuid,
  actor uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select private.report_cap(t,'backoffice.access',actor) and exists(select 1 from private.management_members mm join public.tenant_memberships m on m.id=mm.membership_id and m.tenant_id=mm.tenant_id join private.management_roles r on r.id=mm.role_id and r.tenant_id=mm.tenant_id where mm.tenant_id=t and m.user_id=actor and mm.revoked_at is null and m.status='active' and r.code='owner')
$function$;

CREATE OR REPLACE FUNCTION private.report_planning_access (
  t            uuid,
  report_actor uuid DEFAULT NULL::uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select report_actor is not null and private.report_role(t,array['tenant_admin','management','planner']::public.app_role[],report_actor) and private.service_enabled(t,'planning');
$function$;

CREATE OR REPLACE FUNCTION private.report_profile (
  t     uuid,
  actor uuid
)
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select coalesce((select mm.role_id::text from private.management_members mm join public.tenant_memberships m on m.id=mm.membership_id and m.tenant_id=mm.tenant_id where mm.tenant_id=t and m.user_id=actor and mm.revoked_at is null and m.status='active'),(select 'legacy:'||array_to_string(m.roles,',') from public.tenant_memberships m where m.tenant_id=t and m.user_id=actor and m.status='active'))
$function$;

CREATE OR REPLACE FUNCTION private.report_readable (
  r     private.cockpit_reports,
  actor uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$select private.report_readable(r,actor,private.report_authority(r.tenant_id,actor))$function$;

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
 if not private.report_cockpit_access(r.tenant_id,'backoffice.reports.read',actor) or not private.report_cap(r.tenant_id,'backoffice.functions.cockpit_reports_query',actor) or not private.service_enabled(r.tenant_id,'rapportage') or not(r.created_by=actor or private.report_owner(r.tenant_id,actor) or r.profile=private.report_profile(r.tenant_id,actor)) then return false;end if;
 if exists(select 1 from jsonb_array_elements_text(r.authority->'caps')c where not(current_policy->'caps'?c)) or exists(select 1 from jsonb_each(r.authority->'roles')x where x.value='true'::jsonb and current_policy->'roles'->x.key is distinct from 'true'::jsonb) or exists(select 1 from jsonb_array_elements_text(r.authority->'services')s where not(current_policy->'services'?s)) then return false;end if;
 return not exists(select 1 from jsonb_array_elements(r.source_refs)s where case when s->>'kind'='ticket' then not private.ticket_allowed((s->>'id')::uuid,'tenant','read',actor) when s->>'kind'='native_execution' then not(private.report_work_order_access(r.tenant_id,false,actor) and private.report_cap(r.tenant_id,'backoffice.work_orders.read',actor) and private.report_cap(r.tenant_id,'backoffice.functions.work_order_operational_rows',actor) and private.report_cap(r.tenant_id,'backoffice.functions.work_order_operational_task_data',actor)) else not private.report_cockpit_source(r.tenant_id,s->>'kind',(s->>'id')::uuid,false,actor) end);
end$function$;

CREATE OR REPLACE FUNCTION private.report_role (
  t            uuid,
  roles        public.app_role[],
  report_actor uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select exists(select 1 from public.tenant_memberships m join public.tenants x on x.id=m.tenant_id join auth.users u on u.id=m.user_id where m.tenant_id=t and m.user_id=report_actor and m.status='active' and x.status='active' and m.roles&&$2 and u.email_confirmed_at is not null and u.deleted_at is null and not coalesce(u.is_anonymous,false) and(u.banned_until is null or u.banned_until<=now()))
$function$;

CREATE OR REPLACE FUNCTION private.report_role_name (
  t     uuid,
  actor uuid
)
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select coalesce((select r.name from private.management_members mm join public.tenant_memberships m on m.id=mm.membership_id and m.tenant_id=mm.tenant_id join private.management_roles r on r.id=mm.role_id and r.tenant_id=mm.tenant_id where mm.tenant_id=t and m.user_id=actor and mm.revoked_at is null and m.status='active'),'Management')
$function$;

CREATE OR REPLACE FUNCTION private.report_work_order_access (
  t            uuid,
  financial    boolean DEFAULT false,
  report_actor uuid    DEFAULT NULL::uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select (case when financial then private.report_cap(t,'backoffice.finance.read',report_actor) else private.report_cap(t,'backoffice.work_orders.read',report_actor) or private.report_cap(t,'backoffice.planning.read',report_actor) end) and true and private.service_enabled(t,'planning') and private.report_role(t,case when financial then array['tenant_admin','management','finance']::public.app_role[] else array['tenant_admin','management','planner','finance']::public.app_role[] end,report_actor)
$function$;

CREATE OR REPLACE FUNCTION public.cockpit_reports_command (
  target_tenant uuid,
  command       text,
  input         jsonb,
  request_id    uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare receipt private.cockpit_receipts;fingerprint text;result jsonb;report_record uuid;s private.cockpit_report_schedules;expected bigint;begin
 perform private.report_assert(target_tenant,true);
 if request_id is null or jsonb_typeof(input) is distinct from 'object' or command not in('create','schedule') or octet_length(input::text)>24000 then raise exception 'Controleer de rapportopdracht.' using errcode='22023';end if;
 fingerprint:=encode(extensions.digest(command||':'||input::text,'sha256'),'hex');perform pg_advisory_xact_lock(hashtextextended('cockpit-reports:'||target_tenant::text,0));perform private.report_assert(target_tenant,true);
 select * into receipt from private.cockpit_receipts r where r.tenant_id=target_tenant and r.actor_id=auth.uid() and r.request_id=cockpit_reports_command.request_id;
 if found then if receipt.fingerprint<>fingerprint then raise exception 'Dit verzoek is gewijzigd.' using errcode='23514';end if;if receipt.result->>'id' is not null and not exists(select 1 from private.cockpit_reports r where r.id=(receipt.result->>'id')::uuid and private.report_readable(r,auth.uid())) then raise exception 'Deze versie is niet meer toegankelijk.' using errcode='42501';end if;return receipt.result;end if;
 if command='create' then
  if exists(select 1 from jsonb_object_keys(input)k where k not in('period','comment')) or input->>'period' is null or input->>'comment' is null then raise exception 'Controleer de rapportvelden.' using errcode='22023';end if;
  report_record:=private.report_capture(target_tenant,auth.uid(),input->>'period',input->>'comment');if not exists(select 1 from private.cockpit_reports r where r.id=report_record and private.report_readable(r,auth.uid())) then raise exception 'Je bronrechten zijn intussen gewijzigd.' using errcode='42501';end if;result:=jsonb_build_object('ok',true,'id',report_record);
 else
  if not private.report_owner(target_tenant,auth.uid()) then raise exception 'Alleen de huidige eigenaar beheert de rapportplanning.' using errcode='42501';end if;
  if exists(select 1 from jsonb_object_keys(input)k where k not in('enabled','day','time','audience','revision')) or jsonb_typeof(input->'enabled') is distinct from 'boolean' or (input->>'day')::integer not between 1 and 7 or input->>'time' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(input->>'audience','') not in('Management','Eigenaar','Kwaliteitsbeheer','Financieel beheer') or input->>'revision' is null then raise exception 'Controleer de wekelijkse planning.' using errcode='22023';end if;
  select * into s from private.cockpit_report_schedules where tenant_id=target_tenant for update;expected:=coalesce(s.revision,0);
  if expected<>(input->>'revision')::bigint then raise exception 'De planning is intussen gewijzigd.' using errcode='40001';end if;
  insert into private.cockpit_report_schedules(tenant_id,enabled,day,time_of_day,audience,revision,owner_id,next_run_at) values(target_tenant,(input->>'enabled')::boolean,(input->>'day')::integer,(input->>'time')::time,input->>'audience',expected+1,auth.uid(),private.report_next_run(target_tenant,(input->>'day')::integer,(input->>'time')::time,clock_timestamp())) on conflict(tenant_id) do update set enabled=excluded.enabled,day=excluded.day,time_of_day=excluded.time_of_day,audience=excluded.audience,revision=excluded.revision,owner_id=excluded.owner_id,next_run_at=excluded.next_run_at,updated_at=clock_timestamp();
  update private.cockpit_report_jobs j set state='cancelled',finished_at=clock_timestamp() from private.cockpit_report_runs r where r.id=j.run_id and r.tenant_id=target_tenant and j.state='pending';
  result:=jsonb_build_object('ok',true,'revision',expected+1);
 end if;
 perform private.report_assert(target_tenant,true);
 insert into private.cockpit_receipts(tenant_id,actor_id,request_id,fingerprint,result) values(target_tenant,auth.uid(),request_id,fingerprint,result);
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data,request_id) values(target_tenant,auth.uid(),'management.report.'||command,'management_report',coalesce(report_record,target_tenant),jsonb_build_object('request_id',request_id),request_id);return result;
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
  update private.cockpit_report_jobs set state='ready',report_id=report,notification_id=notification,finished_at=clock_timestamp() where id=j.id;processed:=processed+1;
 end loop;return processed;
end$function$;

CREATE OR REPLACE FUNCTION public.cockpit_reports_query (
  target_tenant uuid,
  payload       jsonb DEFAULT '{}'::jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare selected private.cockpit_reports;rows jsonb;total bigint;sz integer:=coalesce((payload->>'pageSize')::integer,20);pg integer:=coalesce((payload->>'page')::integer,1);s private.cockpit_report_schedules;facts jsonb;current_policy jsonb;begin
 perform private.report_assert(target_tenant);
 if jsonb_typeof(payload) is distinct from 'object' or exists(select 1 from jsonb_object_keys(payload)k where k not in('tab','record','page','pageSize')) or coalesce(payload->>'tab','overview') not in('overview','archive') or pg not between 1 and 100000 or sz not between 5 and 100 then raise exception 'Ongeldige rapportselectie.' using errcode='22023';end if;
 if payload->>'record' is not null then select * into selected from private.cockpit_reports r where r.tenant_id=target_tenant and r.id=(payload->>'record')::uuid and private.report_readable(r,auth.uid());if not found then raise exception 'Deze rapportversie is niet beschikbaar binnen je actuele rechten.' using errcode='42501';end if;end if;
 current_policy:=private.report_authority(target_tenant,auth.uid());
 with allowed as materialized(select r.* from private.cockpit_reports r where r.tenant_id=target_tenant and private.report_readable(r,auth.uid(),current_policy)) select count(*),coalesce((select jsonb_agg(private.report_dto(a) order by a.created_at desc,a.id) from(select * from allowed order by created_at desc,id limit sz offset(least(pg,greatest(1,ceil((select count(*) from allowed)::numeric/sz)::integer))-1)*sz)a),'[]') into total,rows from allowed;
 select * into s from private.cockpit_report_schedules where tenant_id=target_tenant;facts:=private.report_facts(target_tenant,auth.uid())-'sourceRefs';
 return jsonb_build_object('rows',rows,'total',total,'page',least(pg,greatest(1,ceil(total::numeric/sz)::integer)),'pageSize',sz,'selected',case when selected.id is not null then private.report_dto(selected) end,'stats',facts,'role',private.report_role_name(target_tenant,auth.uid()),'isOwner',private.report_owner(target_tenant,auth.uid()),'canCreate',private.cockpit_access(target_tenant,'backoffice.functions.cockpit_reports_command'),'schedule',jsonb_build_object('enabled',coalesce(s.enabled,false),'day',coalesce(s.day,1),'time',to_char(coalesce(s.time_of_day,'08:30'::time),'HH24:MI'),'audience',coalesce(s.audience,'Management'),'revision',coalesce(s.revision,0),'nextRunAt',s.next_run_at));
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
  update public.notifications set read_at=clock_timestamp(),revision=revision+1 where tenant_id is not distinct from target_tenant and context=ctx and user_id=actor and channel='in_app' and read_at is null and archived_at is null and(source_kind not in('crm','management_report') or private.notification_source_allowed(tenant_id,coalesce(type_code,''),source_kind,source_id,source_revision,actor,ctx));
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

CREATE OR REPLACE FUNCTION public.notification_query (
  target_tenant uuid,
  actor_context text,
  operation     text,
  payload       jsonb DEFAULT '{}'::jsonb
)
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
  if operation='detail' then select * into rec from public.notifications where id=(p->>'notification_id')::uuid and tenant_id is not distinct from target_tenant and context=ctx and user_id=actor and channel='in_app';if not found or rec.source_kind in('product','crm','management_report') and not private.notification_source_allowed(rec.tenant_id,rec.type_code,rec.source_kind,rec.source_id,rec.source_revision,actor,ctx) then raise exception 'Bericht niet beschikbaar' using errcode='42501';end if;return private.notification_inbox_dto(rec,actor);end if;
  with own as(select n.*,coalesce(cat.category,'Algemeen') category,private.notification_inbox_dto(n,actor) dto from public.notifications n left join public.notification_catalog cat on cat.code=n.type_code where n.tenant_id is not distinct from target_tenant and n.context=ctx and n.user_id=actor and n.channel='in_app' and(n.source_kind is null or n.source_kind not in('product','crm','management_report') or private.notification_source_allowed(n.tenant_id,n.type_code,n.source_kind,n.source_id,n.source_revision,actor,ctx))),filtered as(select * from own where(case coalesce(p->>'view','all') when 'archived' then archived_at is not null when 'unread' then read_at is null and archived_at is null when 'action' then ack_required and acknowledged_at is null and archived_at is null else archived_at is null end) and(coalesce(p->>'category','')='' or category=p->>'category') and(coalesce(p->>'search','')='' or dto->>'title' ilike '%'||(p->>'search')||'%' or dto->>'body' ilike '%'||(p->>'search')||'%')),paged as(select id from filtered order by created_at desc,id desc limit sz offset(pg-1)*sz)
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

ALTER TABLE "private"."cockpit_report_jobs"
  ADD CONSTRAINT "cockpit_report_jobs_recipient_id_fkey" FOREIGN KEY (recipient_id) REFERENCES auth.users(id);

ALTER TABLE "private"."cockpit_report_runs"
  ADD CONSTRAINT "cockpit_report_runs_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id);

ALTER TABLE "private"."cockpit_report_jobs"
  ADD CONSTRAINT "cockpit_report_jobs_run_id_fkey" FOREIGN KEY (run_id) REFERENCES private.cockpit_report_runs(id);

ALTER TABLE "private"."cockpit_report_runs"
  ADD CONSTRAINT "cockpit_report_runs_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);

ALTER TABLE "private"."cockpit_report_schedules"
  ADD CONSTRAINT "cockpit_report_schedules_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id);

ALTER TABLE "private"."cockpit_report_schedules"
  ADD CONSTRAINT "cockpit_report_schedules_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);

ALTER TABLE "private"."cockpit_reports"
  ADD CONSTRAINT "cockpit_reports_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE "private"."cockpit_report_jobs"
  ADD CONSTRAINT "cockpit_report_jobs_report_id_fkey" FOREIGN KEY (report_id) REFERENCES private.cockpit_reports(id);

ALTER TABLE "private"."cockpit_reports"
  ADD CONSTRAINT "cockpit_reports_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);

CREATE INDEX cockpit_report_pending ON private.cockpit_report_jobs USING btree (created_at, id)
  WHERE (state = 'pending'::text);

CREATE INDEX cockpit_reports_archive ON private.cockpit_reports USING btree (tenant_id, created_at DESC, id);

CREATE TRIGGER cockpit_report_immutable
  BEFORE DELETE OR UPDATE ON private.cockpit_reports
  FOR EACH ROW
  EXECUTE FUNCTION private.cockpit_report_immutable();

CREATE POLICY "management_report_current_scope" ON "public"."notifications"
  AS RESTRICTIVE
  FOR SELECT
  TO "authenticated"
  USING (((source_kind IS DISTINCT FROM 'management_report'::text) OR private.notification_inbox_visible(id)));

REVOKE ALL ON FUNCTION "private"."cockpit_report_immutable"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."cockpit_report_immutable"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."notification_source_allowed"(uuid, text, text, uuid, text, uuid, text) FROM "authenticated";

GRANT EXECUTE ON FUNCTION "private"."notification_source_allowed"(uuid, text, text, uuid, text, uuid, text) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."report_assert"(uuid, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."report_assert"(uuid, boolean) TO "postgres";

REVOKE ALL ON FUNCTION "private"."report_audience"(uuid, uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."report_audience"(uuid, uuid, text) TO "postgres";

REVOKE ALL ON FUNCTION "private"."report_authority"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."report_authority"(uuid, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."report_can_access_personnel"(uuid, uuid, boolean, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."report_can_access_personnel"(uuid, uuid, boolean, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."report_cap"(uuid, text, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."report_cap"(uuid, text, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."report_capture"(uuid, uuid, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."report_capture"(uuid, uuid, text, text) TO "postgres";

REVOKE ALL ON FUNCTION "private"."report_cockpit_access"(uuid, text, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."report_cockpit_access"(uuid, text, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."report_cockpit_action_visible"(private.cockpit_actions, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."report_cockpit_action_visible"(private.cockpit_actions, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."report_cockpit_decision_visible"(private.cockpit_decisions, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."report_cockpit_decision_visible"(private.cockpit_decisions, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."report_cockpit_evidence"(uuid, text, uuid, uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."report_cockpit_evidence"(uuid, text, uuid, uuid, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."report_cockpit_requirement_status"(private.cockpit_requirements, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."report_cockpit_requirement_status"(private.cockpit_requirements, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."report_cockpit_requirement_visible"(private.cockpit_requirements, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."report_cockpit_requirement_visible"(private.cockpit_requirements, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."report_cockpit_scope"(uuid, text, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."report_cockpit_scope"(uuid, text, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."report_cockpit_service_dto"(private.cockpit_service_versions, boolean, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."report_cockpit_service_dto"(private.cockpit_service_versions, boolean, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."report_cockpit_service_source"(private.cockpit_service_versions, boolean, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."report_cockpit_service_source"(private.cockpit_service_versions, boolean, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."report_cockpit_service_visible"(private.cockpit_service_versions, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."report_cockpit_service_visible"(private.cockpit_service_versions, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."report_cockpit_sla_ticket_dto"(public.tickets, text, boolean, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."report_cockpit_sla_ticket_dto"(public.tickets, text, boolean, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."report_cockpit_source"(uuid, text, uuid, boolean, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."report_cockpit_source"(uuid, text, uuid, boolean, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."report_commercial_access"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."report_commercial_access"(uuid, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."report_current_personnel_id"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."report_current_personnel_id"(uuid, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."report_dossier_access"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."report_dossier_access"(uuid, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."report_dto"(private.cockpit_reports) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."report_dto"(private.cockpit_reports) TO "postgres";

REVOKE ALL ON FUNCTION "private"."report_facts"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."report_facts"(uuid, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."report_management_table_allowed"(uuid, text, boolean, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."report_management_table_allowed"(uuid, text, boolean, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."report_next_run"(uuid, integer, time WITHOUT time zone, timestamp WITH time zone) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."report_next_run"(uuid, integer, time WITHOUT time zone, timestamp WITH time zone) TO "postgres";

REVOKE ALL ON FUNCTION "private"."report_object_manage"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."report_object_manage"(uuid, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."report_owner"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."report_owner"(uuid, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."report_planning_access"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."report_planning_access"(uuid, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."report_profile"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."report_profile"(uuid, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."report_readable"(private.cockpit_reports, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."report_readable"(private.cockpit_reports, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."report_readable"(private.cockpit_reports, uuid, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."report_readable"(private.cockpit_reports, uuid, jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "private"."report_role"(uuid, public.app_role[], uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."report_role"(uuid, public.app_role[], uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."report_role_name"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."report_role_name"(uuid, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."report_work_order_access"(uuid, boolean, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."report_work_order_access"(uuid, boolean, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."cockpit_reports_command"(uuid, text, jsonb, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."cockpit_reports_command"(uuid, text, jsonb, uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."cockpit_reports_maintenance"(integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."cockpit_reports_maintenance"(integer) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."cockpit_reports_query"(uuid, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."cockpit_reports_query"(uuid, jsonb) TO "authenticated", "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."cockpit_report_jobs" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."cockpit_report_runs" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."cockpit_report_schedules" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."cockpit_reports" TO "postgres";

