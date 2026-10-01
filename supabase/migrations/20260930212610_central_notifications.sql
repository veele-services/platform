-- Central notification policy, source adapters, delivery, devices and delegation.
-- Additive upgrade: preserve existing business records and notification history.
begin;

-- Section: notifications-core
-- Query-first work file. Capture through the repository migration workflow only
-- after core + delivery + commercial adapters have been verified together.

create table if not exists private.notification_state (
 singleton boolean primary key default true check(singleton), revision bigint not null default 1,
 updated_at timestamptz not null default clock_timestamp()
);
insert into private.notification_state(singleton) values(true) on conflict do nothing;
create table if not exists public.notification_catalog (
 code text primary key, name text not null, description text not null, category text not null,
 module text, status text not null check(status in ('active','available','planned')),
 contexts text[] not null, channels text[] not null, default_channels text[] not null,
 recipient_description text not null, variables text[] not null default array['bedrijfsnaam'],
 allowed_fields text[] not null default array['title','body','cta_label'], tenant_override boolean not null default true,
 ttl_minutes integer not null default 10080 check(ttl_minutes between 1 and 525600),
 bundle_seconds integer not null default 0 check(bundle_seconds between 0 and 300),
 check(contexts <@ array['platform','backoffice','staff','customer']::text[]),
 check(channels <@ array['in_app','push','email']::text[]),check(default_channels <@ channels)
);
create table if not exists private.notification_policies (
 id uuid primary key default gen_random_uuid(), tenant_id uuid references public.tenants(id),
 scope text not null check(scope in ('platform','tenant')), context text, type_code text references public.notification_catalog(code),channel text,
 mode text not null default 'inherit' check(mode in ('inherit','on','off')),revision bigint not null default 1,
 settings jsonb not null default '{}', updated_by uuid references auth.users(id),updated_at timestamptz not null default clock_timestamp(),
 check(context is null or context in ('platform','backoffice','staff','customer')),
 check(channel is null or channel in ('in_app','push','email')),check(scope<>'tenant' or tenant_id is not null)
);
create unique index if not exists notification_policy_scope_key on private.notification_policies(scope,coalesce(tenant_id,'00000000-0000-0000-0000-000000000000'::uuid),coalesce(context,''),coalesce(type_code,''),coalesce(channel,''));
create table if not exists private.notification_preferences (
 id uuid primary key default gen_random_uuid(),tenant_id uuid references public.tenants(id),user_id uuid not null references auth.users(id),
 context text not null check(context in ('platform','backoffice','staff','customer')),type_code text references public.notification_catalog(code),
 in_app boolean not null default true,push boolean not null default true,email boolean not null default true,
 timezone text not null default 'Europe/Amsterdam',quiet_start time,quiet_end time,revision bigint not null default 1,
 updated_at timestamptz not null default clock_timestamp(),check((context='platform')=(tenant_id is null)),
 check((quiet_start is null)=(quiet_end is null))
);
create unique index if not exists notification_preferences_scope_key on private.notification_preferences(coalesce(tenant_id,'00000000-0000-0000-0000-000000000000'::uuid),user_id,context,coalesce(type_code,''));
create table if not exists private.notification_templates (
 id uuid primary key default gen_random_uuid(),tenant_id uuid references public.tenants(id),type_code text not null references public.notification_catalog(code),
 context text not null,channel text not null,revision bigint not null default 1,active_version_id uuid,
 draft jsonb not null default '{}',overridden_fields text[] not null default '{}',updated_by uuid references auth.users(id),updated_at timestamptz not null default clock_timestamp(),
 check(context in ('platform','backoffice','staff','customer')),check(channel in ('in_app','push','email'))
);
create unique index if not exists notification_templates_scope_key on private.notification_templates(coalesce(tenant_id,'00000000-0000-0000-0000-000000000000'::uuid),type_code,context,channel);
create table if not exists private.notification_template_versions (
 id uuid primary key default gen_random_uuid(),template_id uuid not null references private.notification_templates(id),
 revision bigint not null,definition jsonb not null,base_version_id uuid references private.notification_template_versions(id),
 actor_id uuid references auth.users(id),created_at timestamptz not null default clock_timestamp(),unique(template_id,revision)
);
create table if not exists private.notification_campaigns (
 id uuid primary key default gen_random_uuid(),tenant_id uuid references public.tenants(id),
 context text not null check(context in ('platform','backoffice')),sender_id uuid not null references auth.users(id),
 title text not null check(length(btrim(title)) between 1 and 180),body text not null check(length(body)<=20000),
 priority text not null default 'normal' check(priority in ('normal','urgent')),criteria jsonb not null default '{}',
 channels text[] not null default array['in_app'],scheduled_at timestamptz,expires_at timestamptz,
 timezone text not null default 'Europe/Amsterdam',ack_required boolean not null default false,action_label text,source_kind text,source_id uuid,
 state text not null default 'draft' check(state in ('draft','scheduled','processing','completed','partial','paused','cancelled','expired')),
 revision bigint not null default 1,selection_token text,confirmed_at timestamptz,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 check((context='platform')=(tenant_id is null)),check(channels <@ array['in_app','push','email']::text[])
);
create table if not exists private.notification_campaign_recipients (
 id uuid primary key default gen_random_uuid(),campaign_id uuid not null references private.notification_campaigns(id),tenant_id uuid not null references public.tenants(id),
 user_id uuid references auth.users(id),contact_id uuid,recipient_key text not null,context text not null,
 label text not null,channels text[] not null,source_context jsonb not null default '{}',confirmed_at timestamptz not null default clock_timestamp(),
 unique(campaign_id,tenant_id,recipient_key,context),check(user_id is not null or contact_id is not null),
 foreign key(tenant_id,contact_id) references public.customer_contacts(tenant_id,id)
);
alter table private.notification_campaigns add column if not exists confirmed_revision bigint;
create table if not exists private.notification_requests (
 id uuid primary key default gen_random_uuid(),tenant_id uuid references public.tenants(id),type_code text not null references public.notification_catalog(code),
 source_kind text not null,source_id uuid not null,source_revision text not null,dedupe_key text not null,payload jsonb not null default '{}',
 created_at timestamptz not null default clock_timestamp(),available_at timestamptz not null default clock_timestamp(),expires_at timestamptz,
 prepared_at timestamptz,outbox_event_id uuid references public.outbox_events(id)
);
create unique index if not exists notification_requests_dedupe on private.notification_requests(coalesce(tenant_id,'00000000-0000-0000-0000-000000000000'::uuid),dedupe_key);
create index if not exists notification_requests_due on private.notification_requests(available_at,id) where prepared_at is null;
create table if not exists private.notification_provider_permits (
 id uuid primary key default gen_random_uuid(),tenant_id uuid references public.tenants(id),delivery_key text not null,
 type_code text not null,context text not null,channel text not null,recipient_user_id uuid,recipient_hash text not null,
 source_kind text not null,source_id uuid not null,revision bigint not null,
 state text not null default 'admitted' check(state in ('admitted','accepted','failed','uncertain','cancelled')),
 generation integer not null,started_at timestamptz not null default clock_timestamp(),finished_at timestamptz,error_code text,
 unique(delivery_key,generation)
);
create unique index if not exists notification_provider_active_key on private.notification_provider_permits(delivery_key) where state='admitted';
create table if not exists private.notification_receipts (
 request_id uuid primary key,actor_id uuid not null,tenant_id uuid,context text not null,command text not null,input_hash text not null,
 result jsonb not null,created_at timestamptz not null default clock_timestamp()
);
create table if not exists private.notification_audit (
 id uuid primary key default gen_random_uuid(),tenant_id uuid,actor_id uuid,action text not null,resource_id uuid,revision bigint,
 detail jsonb not null default '{}',created_at timestamptz not null default clock_timestamp()
);
create table if not exists private.notification_permission_bootstrap (
 membership_id uuid primary key references public.tenant_memberships(id) on delete cascade,tenant_id uuid not null references public.tenants(id) on delete cascade,
 created_at timestamptz not null default clock_timestamp()
);
alter table public.notifications alter column tenant_id drop not null;
alter table public.notifications add column if not exists context text not null default 'staff';
alter table public.notifications add column if not exists type_code text;
alter table public.notifications add column if not exists source_kind text;
alter table public.notifications add column if not exists source_id uuid;
alter table public.notifications add column if not exists source_revision text;
alter table public.notifications add column if not exists delivery_id uuid;
alter table public.notifications add column if not exists campaign_id uuid;
alter table public.notifications add column if not exists sender_name text not null default 'Fieldgrid';
alter table public.notifications add column if not exists priority text not null default 'normal';
alter table public.notifications add column if not exists action_label text;
alter table public.notifications add column if not exists archived_at timestamptz;
alter table public.notifications add column if not exists clicked_at timestamptz;
alter table public.notifications add column if not exists ack_required boolean not null default false;
alter table public.notifications add column if not exists acknowledged_at timestamptz;
alter table public.notifications add column if not exists withdrawn_at timestamptz;
alter table public.notifications add column if not exists revision bigint not null default 1;
create index if not exists notifications_context_unread_idx on public.notifications(user_id,tenant_id,context,created_at desc,id) where read_at is null and archived_at is null;

-- A catalog row is not a promise that an adapter exists: unknown/new adapters
-- remain unavailable until their source-aware implementation enables them.
insert into public.notification_catalog(code,name,description,category,module,status,contexts,channels,default_channels,recipient_description)
select code,name,name,category,module,'available',contexts,array['in_app','push','email'],defaults,'Alleen actuele, bevoegde betrokkenen' from (values
 ('manual.tenant','Tenantmededeling','Communicatie',null,array['backoffice','staff','customer'],array['in_app','push','email']),
 ('manual.platform','Platformbericht','Platform',null,array['backoffice'],array['in_app','push','email']),
 ('work_order.dispatched','Werkbon vrijgegeven','Werkbonnen','planning',array['staff'],array['in_app','push']),
 ('work_order.rescheduled','Planning gewijzigd','Planning','planning',array['staff','customer','backoffice'],array['in_app','push']),
 ('work_order.cancelled','Werkbon vervallen','Werkbonnen','planning',array['staff','customer','backoffice'],array['in_app','push']),
 ('work_order.travelling','Medewerker onderweg','Werkbonnen','planning',array['customer','backoffice'],array[]::text[]),
 ('work_order.started','Uitvoering gestart','Werkbonnen','planning',array['customer','backoffice'],array[]::text[]),
 ('work_order.submitted','Werkbon ingediend','Werkbonnen','rapportage',array['backoffice'],array['in_app']),
 ('work_order.reviewed','Rapport beoordeeld','Werkbonnen','rapportage',array['staff'],array['in_app','push']),
 ('work_order.signature_required','Handtekening ontbreekt','Werkbonnen','rapportage',array['staff','backoffice'],array['in_app']),
 ('work_order.extra_requested','Meerwerk ter beoordeling','Werkbonnen','planning',array['backoffice'],array['in_app']),
 ('work_order.extra_decided','Meerwerk beoordeeld','Werkbonnen','planning',array['staff','backoffice'],array['in_app']),
 ('object.instruction','Daginstructie gewijzigd','Objecten','planning',array['staff','backoffice'],array['in_app','push']),
 ('object.request','Klantverzoek ontvangen','Objecten','planning',array['staff','backoffice'],array['in_app']),
 ('object.request_decided','Klantverzoek beoordeeld','Objecten','planning',array['customer','staff'],array['in_app']),
 ('object.followup','Objectopvolging','Objecten','planning',array['backoffice'],array['in_app']),
 ('object.access_expiring','Objecttoegang vernieuwen','Objecten','planning',array['backoffice'],array['in_app']),
 ('personnel.qualification','Kwalificatie vraagt aandacht','Personeel','personeel',array['backoffice','staff'],array['in_app','email']),
 ('personnel.deadline','Personeelsdossierdeadline','Personeel','personeel',array['backoffice'],array['in_app','email']),
 ('personnel.invitation','Personeelsuitnodiging','Personeel','personeel',array['staff'],array['email']),
 ('time.correction','Urencorrectie','Personeel','personeel',array['staff','backoffice'],array['in_app']),
 ('announcement.published','Nieuw teambericht','Communicatie',null,array['staff'],array['in_app','push']),
 ('customer.followup','Klantopvolging','Commercieel','planning',array['backoffice'],array['in_app']),
 ('request.received','Nieuwe aanvraag','Commercieel','planning',array['customer','backoffice'],array['email']),
 ('request.information_requested','Aanvullende informatie gevraagd','Commercieel','planning',array['customer'],array['email']),
 ('request.customer_reply','Klantreactie ontvangen','Commercieel','planning',array['backoffice'],array['email']),
 ('request.rejected','Aanvraag afgewezen','Commercieel','planning',array['customer','backoffice'],array['email']),
 ('quote.available','Offerte beschikbaar','Commercieel','planning',array['customer'],array['email']),
 ('quote.reminder','Offerteherinnering','Commercieel','planning',array['customer'],array['email']),
 ('quote.accepted','Offerte geaccepteerd','Commercieel','planning',array['customer','backoffice'],array['email']),
 ('quote.rejected','Offerte afgewezen','Commercieel','planning',array['customer','backoffice'],array['email']),
 ('quote.change_requested','Offertewijziging gevraagd','Commercieel','planning',array['backoffice'],array['email']),
 ('booking.confirmed','Afspraak bevestigd','Commercieel','planning',array['customer','backoffice'],array['email']),
 ('invoice.available','Factuur beschikbaar','Finance','finance',array['customer'],array['email']),
 ('invoice.reminder','Betalingsherinnering','Finance','finance',array['customer'],array['email']),
 ('payment.received','Betaling ontvangen','Finance','finance',array['customer','backoffice'],array['in_app']),
 ('payment.failed','Betaling mislukt','Finance','finance',array['customer','backoffice'],array['in_app']),
 ('ticket.changed','Ticket bijgewerkt','Tickets','tickets',array['staff','backoffice','platform'],array['in_app','push','email'])
)v(code,name,category,module,contexts,defaults) on conflict(code) do nothing;
update public.notification_catalog set status='active' where code in ('manual.tenant','manual.platform','object.instruction','object.request','object.request_decided','object.followup','object.access_expiring','customer.followup');
update public.notification_catalog set contexts=array['customer','backoffice'] where code='quote.change_requested';
update public.notification_catalog set contexts=array['customer','staff','backoffice'] where code='object.request_decided';
update public.notification_catalog set bundle_seconds=30 where code='work_order.rescheduled' and bundle_seconds=0;

insert into public.permission_catalog(key,domain,name,description,module,action,scopes,sensitive)
select key,case when key like 'platform.%' then 'platform' else 'tenant' end,name,name,'notifications',split_part(key,'.',array_length(string_to_array(key,'.'),1)),array['tenant','personnel','object','customer'],sensitive from (values
 ('notifications.read_own','Eigen notificaties lezen',false),('notifications.send_staff','Personeel berichten',false),('notifications.send_customers','Klantcontacten berichten',false),('notifications.send_bulk','Selecties berichten',true),
 ('notifications.schedule','Notificaties plannen',false),('notifications.cancel','Campagnes intrekken',false),('notifications.sent.read','Verzendhistorie lezen',false),('notifications.settings.manage','Notificatieregels beheren',true),
 ('notifications.templates.override','Toegestane templates aanpassen',false),('notifications.delivery.read','Aflevering bekijken',false),('notifications.delivery.retry','Bevestigde afleverfouten herstellen',true),('notifications.platform.receive','Managementberichten van Fieldgrid ontvangen',false),
 ('platform.notifications.read','Platformcampagnes bekijken',false),('platform.notifications.send','Managementcontacten berichten',true),('platform.notifications.send_all_tenants','Alle tenants berichten',true),('platform.notifications.schedule','Platformcampagnes plannen',true),
 ('platform.notifications.cancel','Platformcampagnes intrekken',true),('platform.notifications.manage_global','Globale notificatiepolicy beheren',true),('platform.notifications.manage_tenant','Tenantuitzonderingen beheren',true),('platform.notifications.templates.manage','Platformtemplates beheren',true),('platform.notifications.delivery.read','Technische afleverstatus bekijken',false),('platform.notifications.delivery.retry','Afleverfouten herstellen',true)
)v(key,name,sensitive) on conflict(key) do nothing;
insert into public.permission_role_defaults(role,capability)
select r::public.app_role,c from unnest(array['tenant_admin','management'])r cross join unnest(array['notifications.read_own','notifications.send_staff','notifications.send_customers','notifications.send_bulk','notifications.schedule','notifications.cancel','notifications.sent.read','notifications.settings.manage','notifications.templates.override','notifications.delivery.read','notifications.delivery.retry','notifications.platform.receive'])c on conflict do nothing;
insert into public.permission_role_defaults(role,capability) select r::public.app_role,'notifications.read_own' from unnest(array['staff','planner','finance','hr'])r on conflict do nothing;
-- No new content/right grant to Planning, HR or Finance beyond own inbox. Scoped
-- sending is explicitly delegated through the existing central grant registry.
create or replace function private.notification_seed_membership(m uuid) returns void language plpgsql security definer set search_path='' as $$
declare x public.tenant_memberships;
begin
 select * into x from public.tenant_memberships where id=m;if not found then return;end if;
 insert into private.notification_permission_bootstrap(membership_id,tenant_id) values(x.id,x.tenant_id) on conflict do nothing;if not found then return;end if;
 insert into public.permission_grants(tenant_id,user_id,membership_id,capability,scope,source)
 select x.tenant_id,x.user_id,x.id,d.capability,'{"all":true}','bootstrap' from public.permission_role_defaults d where d.role=any(x.roles) and d.capability like 'notifications.%' on conflict do nothing;
end$$;
select private.notification_seed_membership(id) from public.tenant_memberships;
insert into public.permission_grants(user_id,capability,scope,source)
select a.user_id,c,'{"all":true}','bootstrap' from public.platform_admins a cross join unnest(array['platform.notifications.manage_global','platform.notifications.manage_tenant','platform.notifications.templates.manage','platform.notifications.delivery.read'])c on conflict do nothing;

create or replace function private.notification_actor_active(t uuid,ctx text,actor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(ctx in ('platform','backoffice','staff','customer') and exists(select 1 from auth.users u where u.id=actor and u.deleted_at is null and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<now()))
 and ((ctx='platform' and t is null and (exists(select 1 from public.platform_admins a where a.user_id=actor) or exists(select 1 from public.permission_grants g where g.user_id=actor and g.tenant_id is null and g.enabled and g.capability like 'platform.%'))) or(ctx<>'platform' and exists(select 1 from public.tenants where id=t and status='active') and
 case when ctx='customer' then exists(select 1 from public.object_customer_bindings b join public.objects o on o.id=b.object_id and o.tenant_id=b.tenant_id where b.tenant_id=t and b.user_id=actor and b.active and o.dossier_status<>'archived')
 else exists(select 1 from public.tenant_memberships m where m.tenant_id=t and m.user_id=actor and m.status='active') and(ctx<>'staff' or exists(select 1 from public.personnel p where p.tenant_id=t and p.user_id=actor and p.status='active')) end)),false)
$$;
create or replace function private.notification_cap(t uuid,actor uuid,cap text,person uuid default null,obj uuid default null,customer uuid default null) returns boolean language sql stable security definer set search_path='' as $$
 select private.ticket_has_cap(t,actor,cap,null,person,obj,customer,null)
$$;
create or replace function private.notification_access(t uuid,ctx text,actor uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb:='{}'::jsonb;k text;cap text;ok boolean;
begin
 foreach k in array array['read_own','send_staff','send_customers','send_platform','send_bulk','send_all_tenants','schedule','cancel','sent_read','settings_manage','manage_global','manage_tenant','templates_manage','templates_override','delivery_read','delivery_retry','permissions_manage'] loop
  cap:=case when ctx='platform' then case k when 'read_own' then 'platform.notifications.read' when 'send_platform' then 'platform.notifications.send' when 'sent_read' then 'platform.notifications.read' when 'templates_manage' then 'platform.notifications.templates.manage' when 'delivery_read' then 'platform.notifications.delivery.read' when 'delivery_retry' then 'platform.notifications.delivery.retry' when 'permissions_manage' then 'platform.notifications.permissions' else 'platform.notifications.'||k end
   else case k when 'sent_read' then 'notifications.sent.read' when 'settings_manage' then 'notifications.settings.manage' when 'templates_override' then 'notifications.templates.override' when 'delivery_read' then 'notifications.delivery.read' when 'delivery_retry' then 'notifications.delivery.retry' when 'permissions_manage' then 'notifications.permissions' else 'notifications.'||k end end;
  ok:=private.notification_actor_active(t,ctx,actor) and(case when k='read_own' then ctx in ('customer','platform') or private.notification_cap(t,actor,'notifications.read_own',(select id from public.personnel where tenant_id=t and user_id=actor)) when ctx in ('staff','customer') then false else exists(select 1 from public.permission_grants g where g.user_id=actor and g.enabled and g.capability=cap and g.tenant_id is not distinct from t and (ctx='platform' or exists(select 1 from public.tenant_memberships m where m.id=g.membership_id and m.user_id=actor and m.tenant_id=t and m.status='active'))) end);
  result:=result||jsonb_build_object(k,ok);
 end loop;
 return jsonb_build_object('allowed',private.notification_actor_active(t,ctx,actor),'permissions',result);
end$$;

create or replace function private.notification_bundle_seconds(t uuid,code text,ctx text) returns integer language plpgsql stable security definer set search_path='' as $$
declare seconds integer;v record;
begin
 select bundle_seconds into seconds from public.notification_catalog where notification_catalog.code=notification_bundle_seconds.code;
 if code<>'work_order.rescheduled' then return coalesce(seconds,0);end if;
 for v in select settings from private.notification_policies where(tenant_id is null or tenant_id=t) and(context is null or context=ctx) and type_code=code and channel is null and settings?'bundle_seconds' order by case scope when 'platform' then 0 else 1 end,tenant_id nulls first,context nulls first loop
  seconds:=least(300,greatest(0,(v.settings->>'bundle_seconds')::integer));
 end loop;return coalesce(seconds,30);
end$$;
create or replace function private.notification_policy(t uuid,code text,ctx text,ch text,recipient uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.notification_catalog;p private.notification_policies;pref private.notification_preferences;rev bigint;enabled boolean;quiet_until timestamptz;local_now timestamp;quiet_end timestamp;
begin
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
end$$;

-- Independently owned provider/source adapters must exist before activation.
do $install$begin
 if to_regprocedure('private.notification_mail_source_allowed(uuid,text,text)') is null then execute $f$create function private.notification_mail_source_allowed(mail_id uuid,recipient text,type_code text) returns boolean language sql stable security definer set search_path='' as $b$select false$b$$f$;end if;
 if to_regprocedure('private.notification_delivery_source_allowed(text,uuid,uuid,text,text,uuid,text)') is null then execute $f$create function private.notification_delivery_source_allowed(source_kind text,source_id uuid,target_tenant uuid,type_code text,context text,recipient_user_id uuid,recipient text) returns boolean language sql stable security definer set search_path='' as $b$select false$b$$f$;end if;
 if to_regprocedure('private.notification_delivery_query(uuid,text,uuid,text,jsonb)') is null then execute $f$create function private.notification_delivery_query(t uuid,ctx text,actor uuid,op text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $b$begin return jsonb_build_object('items','[]'::jsonb,'total',0,'available',false);end$b$$f$;end if;
 if to_regprocedure('private.notification_delivery_command(uuid,text,uuid,text,jsonb)') is null then execute $f$create function private.notification_delivery_command(t uuid,ctx text,actor uuid,cmd text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $b$begin raise exception 'Aflevering nog niet beschikbaar' using errcode='55000';end$b$$f$;end if;
end$install$;

create or replace function public.notification_policy_check(target_tenant uuid,type_code text,target_context text,channel text,recipient_user_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 return private.notification_policy(target_tenant,type_code,target_context,channel,recipient_user_id);
end$$;
create or replace function public.notification_provider_gate(operation text,target_tenant uuid,type_code text,target_context text,channel text,recipient_user_id uuid,source_id uuid,delivery_key text,input jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
<<notification_provider_gate>>
declare p private.notification_provider_permits;decision jsonb;kind text:=coalesce(input->>'source_kind','mail');recipient text:=coalesce(input->>'recipient','');hash text;allowed_source boolean;rev bigint;key_id uuid;effective_recipient uuid:=recipient_user_id;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 if operation is null or operation not in ('begin','finish') or channel not in ('email','push') or delivery_key is null or length(delivery_key) not between 1 and 500 or source_id is null or jsonb_typeof(input) is distinct from 'object' then raise exception 'Ongeldige afleveropdracht' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-notification-policy',0));
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-notification-provider:'||delivery_key,0));
 hash:=encode(extensions.digest(recipient,'sha256'),'hex');
 select * into p from private.notification_provider_permits where notification_provider_permits.delivery_key=notification_provider_gate.delivery_key order by generation desc limit 1 for update;
 if found and (p.tenant_id is distinct from target_tenant or p.type_code is distinct from type_code or p.context is distinct from target_context or p.channel is distinct from channel or p.recipient_user_id is distinct from recipient_user_id or p.recipient_hash is distinct from hash or p.source_id is distinct from source_id or p.source_kind is distinct from kind) then raise exception 'Afleversleutel is aan een andere opdracht gebonden' using errcode='23505';end if;
 if operation='finish' then
  if p.id is null or p.id is distinct from (input->>'permit_id')::uuid or p.state<>'admitted' then return jsonb_build_object('ok',false);end if;
  if input->>'outcome' is null or input->>'outcome' not in ('accepted','failed','uncertain','cancelled') then raise exception 'Ongeldige provideruitkomst' using errcode='23514';end if;
  update private.notification_provider_permits set state=input->>'outcome',finished_at=clock_timestamp(),error_code=case when input->>'outcome'='accepted' then null else 'provider_'||(input->>'outcome') end where id=p.id;
  return jsonb_build_object('ok',true);
 end if;
 if p.id is not null and p.state<>'failed' then return jsonb_build_object('allowed',false,'id',p.id,'reason','already_started','revision',p.revision);end if;
 if kind='mail' and effective_recipient is null then select u.id into effective_recipient from auth.users u where lower(u.email)=lower(recipient) and u.email_confirmed_at is not null and private.notification_actor_active(target_tenant,target_context,u.id) order by u.id limit 1;end if;
 decision:=private.notification_policy(target_tenant,type_code,target_context,channel,effective_recipient);rev:=(decision->>'policy_revision')::bigint;
 if not coalesce((decision->>'allowed')::boolean,false) or decision->>'quiet_until' is not null then return decision||jsonb_build_object('allowed',false,'revision',rev);end if;
 if kind='mail' then
  allowed_source:=exists(select 1 from public.mail_deliveries m where m.id=source_id and m.tenant_id=target_tenant and m.recipient=notification_provider_gate.recipient) and private.notification_mail_source_allowed(source_id,recipient,type_code);
 else allowed_source:=private.notification_delivery_source_allowed(kind,source_id,target_tenant,type_code,target_context,recipient_user_id,recipient);end if;
 if not coalesce(allowed_source,false) then return jsonb_build_object('allowed',false,'reason','source_unavailable','revision',rev);end if;
 insert into private.notification_provider_permits(tenant_id,delivery_key,type_code,context,channel,recipient_user_id,recipient_hash,source_kind,source_id,revision,generation)
 values(target_tenant,delivery_key,type_code,target_context,channel,recipient_user_id,hash,kind,source_id,rev,coalesce(p.generation,0)+1) returning id into key_id;
 return jsonb_build_object('allowed',true,'id',key_id,'reason','allowed','revision',rev);
end$$;

create or replace function private.notification_enqueue(t uuid,code text,kind text,source uuid,source_revision text,dedupe_key text,payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
<<notification_enqueue>>
declare id uuid;event_id uuid;ttl integer;blocked jsonb;
begin
 if t is null or source is null or dedupe_key is null or jsonb_typeof(payload) is distinct from 'object' then raise exception 'Notificatiebron vereist' using errcode='23514';end if;
 select ttl_minutes into ttl from public.notification_catalog where notification_catalog.code=notification_enqueue.code;if not found then raise exception 'Onbekend notificatietype' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-notification-policy',0));
 select coalesce(jsonb_agg(ctx||':'||ch),'[]'::jsonb) into blocked from public.notification_catalog cat cross join lateral unnest(cat.contexts)ctx cross join lateral unnest(cat.channels)ch where cat.code=notification_enqueue.code and not coalesce((private.notification_policy(t,notification_enqueue.code,ctx,ch,case when payload->>'context'=ctx then nullif(payload->>'recipient_user_id','')::uuid end)->>'allowed')::boolean,false);
 payload:=jsonb_set(payload,'{suppressed_routes}',coalesce(payload->'suppressed_routes','[]'::jsonb)||blocked);
 insert into private.notification_requests(tenant_id,type_code,source_kind,source_id,source_revision,dedupe_key,payload,available_at,expires_at)
 values(t,code,kind,source,source_revision,dedupe_key,payload,coalesce((payload->>'scheduled_at')::timestamptz,clock_timestamp()),coalesce((payload->>'expires_at')::timestamptz,greatest(clock_timestamp(),(payload->>'scheduled_at')::timestamptz)+make_interval(mins=>ttl)))
 on conflict do nothing returning notification_requests.id into id;
 if id is null then select r.id into id from private.notification_requests r where r.tenant_id=t and r.dedupe_key=notification_enqueue.dedupe_key;return id;end if;
 event_id:=private.enqueue_event(t,'notification.requested','notification',id,jsonb_build_object('request_id',id),'notification-request:'||id);
 update private.notification_requests set outbox_event_id=event_id where notification_requests.id=notification_enqueue.id;
 return id;
end$$;

-- Published definitions are immutable; tenant customizations override fields,
-- not a copied platform template. A new default therefore flows into inherited
-- fields without rewriting any published version or queued delivery snapshot.
update public.notification_catalog set variables=case
 when code like 'invoice.%' then array['bedrijfsnaam','klantnaam','factuurnummer','betaallink']
 when code in ('quote.available','quote.reminder') then array['bedrijfsnaam','klantnaam','offertelink']
 when code like 'request.%' or code in ('quote.accepted','quote.rejected','quote.change_requested','booking.confirmed') then array['bedrijfsnaam','onderwerp','bericht','nummer']
 when code like 'work_order.%' then array['bedrijfsnaam','bonnummer','datum','locatie'] else array['bedrijfsnaam'] end;
update public.notification_catalog set variables=array['bedrijfsnaam','medewerkernaam','personeelsnummer'] where code='personnel.invitation';
insert into private.notification_templates(type_code,context,channel,draft)
select c.code,ctx,ch,jsonb_build_object('title',case
 when ch='push' or(ch<>'email' and(c.code like 'request.%' or c.code like 'quote.%' or c.code in ('invoice.available','booking.confirmed'))) then c.name
 when c.code='invoice.available' then 'Factuur {factuurnummer} van {bedrijfsnaam}'
 when c.code in ('quote.available','quote.reminder') then 'Uw prijsopgave van {bedrijfsnaam}'
 when c.code like 'request.%' or c.code in ('quote.accepted','quote.rejected','quote.change_requested','booking.confirmed') then '{onderwerp}'
 when c.code='work_order.dispatched' then 'Nieuwe werkbon' when c.code='work_order.rescheduled' then 'Je planning is gewijzigd' else c.name end,
 'body',case when ch='push' or(ch<>'email' and(c.code like 'request.%' or c.code like 'quote.%' or c.code in ('invoice.available','booking.confirmed'))) then 'Er staat een update klaar in uw beveiligde omgeving bij {bedrijfsnaam}.'
 when c.code='invoice.available' then E'Beste {klantnaam},\n\nBijgevoegd vindt u factuur {factuurnummer}. U kunt deze veilig betalen met de knop hieronder.\n\nMet vriendelijke groet,\n{bedrijfsnaam}'
 when c.code in ('quote.available','quote.reminder') then E'Beste {klantnaam},\n\nUw prijsopgave staat klaar. Bekijk de werkzaamheden en geef uw akkoord via de knop hieronder.\n\nMet vriendelijke groet,\n{bedrijfsnaam}'
 when c.code like 'request.%' or c.code in ('quote.accepted','quote.rejected','quote.change_requested','booking.confirmed') then '{bericht}'
 when c.code='work_order.dispatched' then 'Er staat een nieuwe werkbon voor {datum} bij {locatie} voor je klaar.'
 when c.code='work_order.rescheduled' then 'De planning van werkbon {bonnummer} is aangepast. Bekijk de bijgewerkte tijden in de app.'
 else 'Er staat een nieuw bericht voor u klaar bij {bedrijfsnaam}.' end,'cta_label','Openen')
from public.notification_catalog c cross join lateral unnest(c.contexts)ctx cross join lateral unnest(c.channels)ch on conflict do nothing;
insert into private.notification_template_versions(template_id,revision,definition)
select t.id,1,t.draft from private.notification_templates t where t.active_version_id is null and t.tenant_id is null on conflict do nothing;
update private.notification_templates t set active_version_id=v.id from private.notification_template_versions v where v.template_id=t.id and v.revision=1 and t.active_version_id is null;
insert into private.notification_templates(tenant_id,type_code,context,channel,draft,overridden_fields,revision)
select l.tenant_id,case l.template_key when 'quote' then 'quote.available' when 'invoice' then 'invoice.available' when 'workorder' then 'work_order.dispatched' else 'work_order.rescheduled' end,
 case when l.template_key in ('quote','invoice') then 'customer' else 'staff' end,l.channel,jsonb_build_object('title',l.subject,'body',l.body),array['title','body'],greatest(l.revision,1)
from public.tenant_message_templates l where l.customized on conflict do nothing;
insert into private.notification_template_versions(template_id,revision,definition,base_version_id)
select t.id,t.revision,t.draft,g.active_version_id from private.notification_templates t join private.notification_templates g on g.tenant_id is null and g.type_code=t.type_code and g.context=t.context and g.channel=t.channel
where t.tenant_id is not null and t.active_version_id is null on conflict do nothing;
update private.notification_templates t set active_version_id=v.id from private.notification_template_versions v where v.template_id=t.id and v.revision=t.revision and t.active_version_id is null;
-- Upgrade only the original generic invitation default, preserving all versions
-- and any intentionally customized platform default.
do $$declare r private.notification_templates;d jsonb;v uuid;begin
 for r in select * from private.notification_templates where tenant_id is null and type_code='personnel.invitation' and channel='email' and draft->>'title'='Personeelsuitnodiging' loop
  d:=jsonb_build_object('title','Uitnodiging voor het personeelsportaal van {bedrijfsnaam}','body',E'Hallo {medewerkernaam},\n\nJe bent als personeelslid uitgenodigd voor het personeelsportaal van {bedrijfsnaam}. Hier bekijk je jouw planning en werkbonnen en leg je uitgevoerde werkzaamheden vast.\n\nJe personeelsnummer is {personeelsnummer}.\n\nJe hebt al een account. Open het personeelsportaal met de knop hieronder en log in met je bestaande inloggegevens. Je wachtwoord blijft ongewijzigd.\n\nVerwachtte je deze uitnodiging niet? Neem dan contact op met {bedrijfsnaam}. Deel deze e-mail niet met anderen.\n\nMet vriendelijke groet,\n{bedrijfsnaam}','cta_label','Personeelsportaal openen');
  insert into private.notification_template_versions(template_id,revision,definition) values(r.id,r.revision+1,d) returning id into v;
  update private.notification_templates set draft=d,revision=r.revision+1,active_version_id=v where id=r.id;
 end loop;
end$$;

-- Upgrade only untouched factory app/push defaults. Keep old immutable versions
-- and every operator-published customization; no recipient receives a replay.
do $$declare r record;d jsonb;v uuid;begin
 for r in select x.*,c.name from private.notification_templates x join public.notification_catalog c on c.code=x.type_code join private.notification_template_versions av on av.id=x.active_version_id
 where x.tenant_id is null and av.actor_id is null and(x.revision=1 or(x.type_code='personnel.invitation' and x.channel<>'email' and x.draft->>'title'='Uitnodiging voor het personeelsportaal van {bedrijfsnaam}'))
 and(x.channel='push' or(x.channel<>'email' and(x.type_code like 'request.%' or x.type_code like 'quote.%' or x.type_code in ('invoice.available','booking.confirmed','personnel.invitation')))) loop
  d:=jsonb_build_object('title',r.name,'body','Er staat een update klaar in uw beveiligde omgeving bij {bedrijfsnaam}.','cta_label','Openen');
  if r.draft is distinct from d then insert into private.notification_template_versions(template_id,revision,definition) values(r.id,r.revision+1,d) returning id into v;update private.notification_templates set draft=d,revision=r.revision+1,active_version_id=v where id=r.id;end if;
 end loop;
end$$;

-- TTL is fixed at enqueue; source checks can expire an event earlier.
update public.notification_catalog set ttl_minutes=case code when 'work_order.travelling' then 15 when 'work_order.started' then 30 when 'work_order.rescheduled' then 60 else 1440 end where code in ('work_order.travelling','work_order.started','work_order.rescheduled','work_order.dispatched','work_order.cancelled');

create or replace function private.notification_push_template_safe(d jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare token text;
begin
 if jsonb_typeof(d) is distinct from 'object' or length(coalesce(d->>'title','')) not between 1 and 80 or length(coalesce(d->>'body','')) not between 1 and 160 or length(coalesce(d->>'cta_label','Bekijken'))>60 or(d->>'title')~E'[\r\n]' or d::text~*'(https?://|www\.|javascript:|<[^>]+>)' then return false;end if;
 for token in select (regexp_matches(coalesce(d->>'title','')||E'\n'||coalesce(d->>'body','')||E'\n'||coalesce(d->>'cta_label',''),'\{([^{}]+)\}','g'))[1] loop if token<>'bedrijfsnaam' then return false;end if;end loop;
 return true;
end$$;

create or replace function private.notification_template(t uuid,code text,ctx text,ch text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare g private.notification_templates;l private.notification_templates;c public.notification_catalog;def jsonb;local_def jsonb;k text;brand jsonb;
begin
 select * into c from public.notification_catalog where notification_catalog.code=notification_template.code;
 select * into g from private.notification_templates where tenant_id is null and type_code=code and context=ctx and channel=ch;
 if g.id is null then return null;end if;
 select definition into def from private.notification_template_versions where id=g.active_version_id;
 select * into l from private.notification_templates where tenant_id=t and type_code=code and context=ctx and channel=ch;
 if l.id is not null and l.active_version_id is not null then
  select definition into local_def from private.notification_template_versions where id=l.active_version_id;
  foreach k in array l.overridden_fields loop if local_def?k then def:=jsonb_set(def,array[k],local_def->k);end if;end loop;
 end if;
 if ch='push' then
  if private.notification_push_template_safe(def) then def:=def||jsonb_build_object('push_safe',true);
  else def:=jsonb_build_object('title','Nieuwe melding','body','Er staat een update klaar in uw beveiligde omgeving.','cta_label','Bekijken','push_safe',false,'warning','Deze bestaande pushtemplate bevat ongeschikte velden of te lange tekst. Er wordt een veilige algemene melding gebruikt tot een aangepaste versie is gepubliceerd.');end if;
 end if;
 select jsonb_build_object('company',te.name,'slug',te.slug,'primary',coalesce(b.primary_color,'#222C35'),'accent',coalesce(b.accent_color,'#41AC42'),'logo_path',b.logo_path,'sender_name',b.sender_name) into brand from public.tenants te left join public.tenant_branding b on b.tenant_id=te.id where te.id=t;
 return def||jsonb_build_object('revision',(select revision from private.notification_template_versions where id=coalesce(l.active_version_id,g.active_version_id)),'version_id',coalesce(l.active_version_id,g.active_version_id),'base_version_id',g.active_version_id,'variables',case when ch='push' then '["bedrijfsnaam"]'::jsonb else to_jsonb(c.variables) end,'allowed_fields',to_jsonb(c.allowed_fields),'branding',coalesce(brand,jsonb_build_object('company','Fieldgrid','primary','#222C35','accent','#41AC42')),'source',case when cardinality(l.overridden_fields)>0 then 'tenant' else 'platform' end);
end$$;
create or replace function public.notification_template_resolve(target_tenant uuid,type_code text,target_context text,channel text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 return private.notification_template(target_tenant,type_code,target_context,channel);
end$$;

create or replace function private.notification_template_valid(code text,d jsonb) returns boolean language plpgsql stable security definer set search_path='' as $$
declare allowed text[];token text;
begin
 select variables into allowed from public.notification_catalog where notification_catalog.code=notification_template_valid.code;
 if allowed is null or jsonb_typeof(d) is distinct from 'object' or length(coalesce(d->>'title','')) not between 1 and 200 or length(coalesce(d->>'body','')) not between 1 and 6000 or length(coalesce(d->>'cta_label','Openen'))>60 or (d->>'title')~E'[\r\n]' or d::text~*'(https?://|javascript:|<[^>]+>)' then return false;end if;
 for token in select (regexp_matches(coalesce(d->>'title','')||E'\n'||coalesce(d->>'body','')||E'\n'||coalesce(d->>'cta_label',''),'\{([^{}]+)\}','g'))[1] loop if not token=any(allowed) then return false;end if;end loop;
 return true;
end$$;

-- Authenticated legacy template edits must not bypass the new capability.
-- Synchronize the four existing customization forms into published overrides.
create or replace function private.notification_legacy_template_bridge() returns trigger language plpgsql security definer set search_path='' as $$
declare code text;ctx text;rec private.notification_templates;def jsonb;vid uuid;base uuid;
begin
 if tg_op='UPDATE' and new.subject is not distinct from old.subject and new.body is not distinct from old.body and new.customized is not distinct from old.customized then return new;end if;
 if auth.jwt()->>'role'='authenticated' and (not private.ticket_session_active(auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid) or not private.notification_cap(new.tenant_id,auth.uid(),'notifications.templates.override')) then raise exception 'Geen templaterecht' using errcode='42501';end if;
 code:=case new.template_key when 'quote' then 'quote.available' when 'invoice' then 'invoice.available' when 'workorder' then 'work_order.dispatched' else 'work_order.rescheduled' end;ctx:=case when new.template_key in ('quote','invoice') then 'customer' else 'staff' end;
 if not new.customized and not exists(select 1 from private.notification_templates where tenant_id=new.tenant_id and type_code=code and context=ctx and channel=new.channel) then return new;end if;
 def:=jsonb_build_object('title',new.subject,'body',new.body,'cta_label','Openen');if not private.notification_template_valid(code,def) or(new.channel='push' and not private.notification_push_template_safe(def)) then raise exception 'Ongeldig notificatietemplate' using errcode='23514';end if;
 insert into private.notification_templates(tenant_id,type_code,context,channel) values(new.tenant_id,code,ctx,new.channel) on conflict do nothing;
 select * into rec from private.notification_templates where tenant_id=new.tenant_id and type_code=code and context=ctx and channel=new.channel for update;
 select active_version_id into base from private.notification_templates where tenant_id is null and type_code=code and context=ctx and channel=new.channel;
 insert into private.notification_template_versions(template_id,revision,definition,base_version_id,actor_id) values(rec.id,rec.revision+1,def,base,auth.uid()) returning id into vid;
 update private.notification_templates set active_version_id=vid,revision=rec.revision+1,draft=def,overridden_fields=case when new.customized then array['title','body'] else array[]::text[] end,updated_by=auth.uid(),updated_at=clock_timestamp() where id=rec.id;
 return new;
end$$;
drop trigger if exists notification_legacy_template_bridge on public.tenant_message_templates;
create trigger notification_legacy_template_bridge after insert or update on public.tenant_message_templates for each row execute function private.notification_legacy_template_bridge();

create or replace function private.notification_candidates(t uuid,ctx text,actor uuid,criteria jsonb)
returns table(recipient_key text,tenant_id uuid,user_id uuid,contact_id uuid,context text,label text,channels text[],source_context jsonb)
language plpgsql stable security definer set search_path='' as $$
declare kind text:=coalesce(criteria->>'kind','staff');all_selected boolean:=coalesce((criteria->>'all')::boolean,false);business_day date;
begin
 if jsonb_typeof(criteria) is distinct from 'object' or kind not in ('staff','customer','management','mixed') or ctx not in ('platform','backoffice') or not private.notification_actor_active(t,ctx,actor) then return;end if;
 select (now() at time zone timezone)::date into business_day from public.tenants where id=t;
 if all_selected and not private.notification_cap(t,actor,case when ctx='platform' then 'platform.notifications.send_all_tenants' else 'notifications.send_bulk' end) then return;end if;
 if ctx='platform' then
  if kind<>'management' then return;end if;
  return query select 'user:'||m.user_id,m.tenant_id,m.user_id,null::uuid,'backoffice'::text,coalesce(p.full_name,'Managementcontact'),array['in_app','push','email'],jsonb_build_object('membership_id',m.id)
  from public.tenant_memberships m join public.tenants te on te.id=m.tenant_id left join public.personnel p on p.tenant_id=m.tenant_id and p.user_id=m.user_id
  where m.status='active' and te.status='active' and private.notification_actor_active(m.tenant_id,'backoffice',m.user_id)
  and private.notification_cap(m.tenant_id,actor,'platform.notifications.send') and private.notification_cap(m.tenant_id,m.user_id,'notifications.platform.receive')
  and (all_selected or criteria->'tenant_ids'?m.tenant_id::text or criteria->'user_ids'?m.user_id::text)
  and (not(criteria?'tenant_ids') or jsonb_array_length(criteria->'tenant_ids')=0 or criteria->'tenant_ids'?m.tenant_id::text)
  and (not(criteria?'user_ids') or jsonb_array_length(criteria->'user_ids')=0 or criteria->'user_ids'?m.user_id::text);
  return;
 end if;
 if kind in ('staff','mixed') then
  return query select distinct on(p.id) 'user:'||p.user_id,p.tenant_id,p.user_id,null::uuid,'staff'::text,p.full_name,array['in_app','push','email'],
  jsonb_strip_nulls(jsonb_build_object('personnel_id',p.id,'object_id',o.id,'customer_id',o.customer_id,'work_order_id',w.id))
  from public.personnel p left join public.work_order_assignments a on a.tenant_id=p.tenant_id and a.personnel_id=p.id and a.status not in ('cancelled','returned')
  left join public.work_orders w on w.tenant_id=a.tenant_id and w.id=a.work_order_id and w.archive_at is null left join public.objects o on o.tenant_id=w.tenant_id and o.id=w.object_id and o.dossier_status<>'archived'
  where p.tenant_id=t and p.status='active' and p.user_id is not null and private.notification_actor_active(t,'staff',p.user_id)
  and private.notification_cap(t,actor,'notifications.send_staff',p.id,o.id,o.customer_id)
  and(all_selected or criteria->'personnel_ids'?p.id::text or criteria->'user_ids'?p.user_id::text or criteria->'object_ids'?o.id::text or criteria->'work_order_ids'?w.id::text)
  and(not(criteria?'personnel_ids') or jsonb_array_length(criteria->'personnel_ids')=0 or criteria->'personnel_ids'?p.id::text)
  and(not(criteria?'user_ids') or jsonb_array_length(criteria->'user_ids')=0 or criteria->'user_ids'?p.user_id::text)
  and(not(criteria?'object_ids') or jsonb_array_length(criteria->'object_ids')=0 or criteria->'object_ids'?o.id::text)
  and(not(criteria?'work_order_ids') or jsonb_array_length(criteria->'work_order_ids')=0 or criteria->'work_order_ids'?w.id::text)
  order by p.id,w.id nulls first;
 end if;
 if kind in ('customer','mixed') then
  return query select distinct on(cc.id) case when u.id is null then 'email:'||encode(extensions.digest(lower(btrim(cc.email)),'sha256'),'hex') else 'user:'||u.id end,cc.tenant_id,u.id,cc.id,'customer'::text,cc.full_name,
  case when u.id is null then array['email'] else array['in_app','push','email'] end,
  jsonb_strip_nulls(jsonb_build_object('customer_id',cc.customer_id,'object_id',o.id,'work_order_id',w.id,'email_hash',encode(extensions.digest(lower(btrim(cc.email)),'sha256'),'hex')))
  from public.customer_contacts cc join public.customers cu on cu.id=cc.customer_id and cu.tenant_id=cc.tenant_id
  left join public.objects o on o.tenant_id=cc.tenant_id and o.customer_id=cc.customer_id and o.dossier_status<>'archived' and(cardinality(cc.object_ids)=0 or o.id=any(cc.object_ids))
  left join public.work_orders w on w.tenant_id=o.tenant_id and w.object_id=o.id and w.archive_at is null
  left join lateral(select au.id from auth.users au where lower(au.email)=lower(cc.email) and au.email_confirmed_at is not null and private.notification_actor_active(t,'customer',au.id) and exists(select 1 from public.object_customer_bindings b join public.objects bo on bo.tenant_id=b.tenant_id and bo.id=b.object_id where b.tenant_id=t and b.user_id=au.id and b.active and bo.customer_id=cc.customer_id and bo.id=o.id and bo.dossier_status<>'archived') order by au.id limit 1)u on true
  where cc.tenant_id=t and cc.active and(cc.active_from is null or cc.active_from<=business_day) and(cc.active_until is null or cc.active_until>=business_day) and cu.status='active' and cc.email~*'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  and private.notification_cap(t,actor,'notifications.send_customers',null,o.id,cc.customer_id)
  and(all_selected or criteria->'contact_ids'?cc.id::text or criteria->'customer_ids'?cc.customer_id::text or criteria->'object_ids'?o.id::text or criteria->'work_order_ids'?w.id::text)
  and(not(criteria?'contact_ids') or jsonb_array_length(criteria->'contact_ids')=0 or criteria->'contact_ids'?cc.id::text)
  and(not(criteria?'customer_ids') or jsonb_array_length(criteria->'customer_ids')=0 or criteria->'customer_ids'?cc.customer_id::text)
  and(not(criteria?'object_ids') or jsonb_array_length(criteria->'object_ids')=0 or criteria->'object_ids'?o.id::text)
  and(not(criteria?'work_order_ids') or jsonb_array_length(criteria->'work_order_ids')=0 or criteria->'work_order_ids'?w.id::text)
  order by cc.id,(u.id is null),o.id,w.id;
 end if;
end$$;

create or replace function private.notification_recipients(t uuid,ctx text,actor uuid,p jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare criteria jsonb:=coalesce(p->'criteria','{}');items jsonb;options jsonb;token text;total integer;rev bigint;term text:=left(coalesce(p->>'search',''),100);code text:=case when ctx='platform' then 'manual.platform' else 'manual.tenant' end;selected text[];
begin
 if p?'channels' and jsonb_typeof(p->'channels') is distinct from 'array' then raise exception 'Kies geldige kanalen' using errcode='23514';end if;
 selected:=array(select distinct jsonb_array_elements_text(coalesce(p->'channels','["in_app","push","email"]'::jsonb)));
 if not selected<@array['in_app','push','email']::text[] then raise exception 'Kies geldige kanalen' using errcode='23514';end if;
 with candidates as (select distinct on(tenant_id,recipient_key,context) * from private.notification_candidates(t,ctx,actor,criteria) order by tenant_id,recipient_key,context,contact_id nulls first), permitted as (
 select c.*,array(select ch from unnest(c.channels)ch where coalesce((private.notification_policy(c.tenant_id,code,c.context,ch,c.user_id)->>'allowed')::boolean,false) order by ch) policy_channels from candidates c), reachable as (
 select c.*,array(select ch from unnest(c.policy_channels)ch where
  (ch<>'push' or exists(select 1 from private.notification_devices d where d.user_id=c.user_id and private.notification_device_live(d.id,d.generation,c.tenant_id,c.context,c.user_id)))
  and(ch<>'email' or exists(select 1 from auth.users u where u.id=c.user_id and u.email_confirmed_at is not null and u.email~*'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') or(c.user_id is null and c.contact_id is not null)) order by ch) reachable_channels from permitted c), projected as (
 select c.*,array(select ch from unnest(c.reachable_channels)ch where ch=any(selected) order by ch) selected_channels,
  c.channels&&selected and not c.policy_channels&&selected as suppressed from reachable c)
 select coalesce(jsonb_agg(jsonb_build_object('key',recipient_key,'id',coalesce(user_id,contact_id),'kind',case when context='customer' then 'customer' when ctx='platform' then 'management' else 'staff' end,'context',context,'label',label,'tenant_id',tenant_id,'channels',selected_channels,'suppressed',suppressed,'excluded_reason',case when cardinality(selected_channels)>0 then null when suppressed then 'policy_suppressed' else 'no_selected_channel' end) order by tenant_id,recipient_key),'[]'::jsonb),count(*),encode(extensions.digest(coalesce(string_agg(tenant_id::text||recipient_key||context||coalesce(source_context->>'email_hash','')||array_to_string(reachable_channels,','),'|' order by tenant_id,recipient_key),''),'sha256'),'hex') into items,total,token from projected;
 if total>10000 then raise exception 'Selectie te groot; beperk de doelgroep' using errcode='23514';end if;
 select revision into rev from private.notification_state where singleton;token:=encode(extensions.digest(token||':'||rev||':'||criteria::text,'sha256'),'hex');
 options:=jsonb_build_object('personnel','[]'::jsonb,'customers','[]'::jsonb,'contacts','[]'::jsonb,'objects','[]'::jsonb,'work_orders','[]'::jsonb,'tenants','[]'::jsonb);
 if ctx='platform' then
  options:=jsonb_set(options,'{tenants}',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'label',name)),'[]'::jsonb) from(select id,name from public.tenants where status='active' and private.notification_cap(id,actor,'platform.notifications.send') and name ilike '%'||term||'%' order by name,id limit 100)x));
 else
  options:=options||jsonb_build_object('personnel',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'label',full_name)),'[]'::jsonb) from(select p.id,p.full_name from public.personnel p where p.tenant_id=t and p.status='active' and p.user_id is not null and p.full_name ilike '%'||term||'%' and(private.notification_cap(t,actor,'notifications.send_staff',p.id) or exists(select 1 from public.work_order_assignments a join public.work_orders w on w.id=a.work_order_id and w.tenant_id=a.tenant_id join public.objects o on o.tenant_id=w.tenant_id and o.id=w.object_id where a.tenant_id=t and a.personnel_id=p.id and a.status not in ('cancelled','returned') and private.notification_cap(t,actor,'notifications.send_staff',p.id,o.id,o.customer_id))) order by p.full_name,p.id limit 100)x),
   'customers',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'label',name)),'[]'::jsonb) from(select c.id,c.name from public.customers c where c.tenant_id=t and c.status='active' and c.name ilike '%'||term||'%' and(private.notification_cap(t,actor,'notifications.send_customers',null,null,c.id) or exists(select 1 from public.objects o where o.tenant_id=t and o.customer_id=c.id and private.notification_cap(t,actor,'notifications.send_customers',null,o.id,c.id))) order by c.name,c.id limit 100)x),
   'contacts',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'label',full_name)),'[]'::jsonb) from(select c.id,c.full_name from public.customer_contacts c where c.tenant_id=t and c.active and c.full_name ilike '%'||term||'%' and private.notification_cap(t,actor,'notifications.send_customers',null,null,c.customer_id) order by c.full_name,c.id limit 100)x),
   'objects',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'label',name)),'[]'::jsonb) from(select o.id,o.name from public.objects o where o.tenant_id=t and o.dossier_status<>'archived' and o.name ilike '%'||term||'%' and(private.notification_cap(t,actor,'notifications.send_customers',null,o.id,o.customer_id) or private.notification_cap(t,actor,'notifications.send_staff',null,o.id,o.customer_id)) order by o.name,o.id limit 100)x),
   'work_orders',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'label',title)),'[]'::jsonb) from(select w.id,coalesce(nullif(w.title,''),w.work_order_number) title from public.work_orders w join public.objects o on o.id=w.object_id and o.tenant_id=w.tenant_id where w.tenant_id=t and w.archive_at is null and(coalesce(w.title,'')||w.work_order_number) ilike '%'||term||'%' and(private.notification_cap(t,actor,'notifications.send_customers',null,o.id,o.customer_id) or private.notification_cap(t,actor,'notifications.send_staff',null,o.id,o.customer_id)) order by w.id limit 100)x));
 end if;
 return jsonb_build_object('recipients',items,'counts',jsonb_build_object('total',total,'in_app',(select count(*) from jsonb_array_elements(items)i where i->'channels'?'in_app'),'push',(select count(*) from jsonb_array_elements(items)i where i->'channels'?'push'),'email',(select count(*) from jsonb_array_elements(items)i where i->'channels'?'email'),'reachable',(select count(*) from jsonb_array_elements(items)i where jsonb_array_length(i->'channels')>0),'unreachable',(select count(*) from jsonb_array_elements(items)i where jsonb_array_length(i->'channels')=0),'suppressed',(select count(*) from jsonb_array_elements(items)i where (i->>'suppressed')::boolean)),'selection_token',token,'options',options);
end$$;

do $install$begin
 if to_regprocedure('private.notification_operational_source_allowed(uuid,text,text,uuid,text,uuid,text)') is null then execute $f$create function private.notification_operational_source_allowed(t uuid,code text,kind text,source uuid,revision text,recipient uuid,ctx text) returns boolean language sql stable security definer set search_path='' as $b$select false$b$$f$;end if;
 if to_regprocedure('private.notification_suppress_pending()') is null then execute $f$create function private.notification_suppress_pending() returns integer language sql security definer set search_path='' as $b$select 0$b$$f$;end if;
 if to_regprocedure('private.notification_suppress_deferred_mail()') is null then execute $f$create function private.notification_suppress_deferred_mail() returns integer language sql security definer set search_path='' as $b$select 0$b$$f$;end if;
 if to_regprocedure('private.notification_permissions_query(uuid,text,uuid,jsonb)') is null then execute $f$create function private.notification_permissions_query(t uuid,ctx text,actor uuid,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $b$begin raise exception 'Rechtenbeheer nog niet beschikbaar' using errcode='55000';end$b$$f$;end if;
 if to_regprocedure('private.notification_permissions_command(uuid,text,uuid,text,jsonb)') is null then execute $f$create function private.notification_permissions_command(t uuid,ctx text,actor uuid,cmd text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $b$begin raise exception 'Rechtenbeheer nog niet beschikbaar' using errcode='55000';end$b$$f$;end if;
 if to_regprocedure('private.notification_campaign_delivery_summary(uuid,uuid,text,uuid)') is null then execute $f$create function private.notification_campaign_delivery_summary(campaign uuid,t uuid,ctx text,actor uuid) returns jsonb language sql stable security definer set search_path='' as $b$select jsonb_build_object('counts','{}'::jsonb,'deliveries','[]'::jsonb)$b$$f$;end if;
 if to_regprocedure('private.notification_campaign_started(uuid)') is null then execute $f$create function private.notification_campaign_started(campaign uuid) returns boolean language sql stable security definer set search_path='' as $b$select exists(select 1 from private.notification_requests where payload->>'campaign_id'=campaign::text and prepared_at is not null)$b$$f$;end if;
 if to_regprocedure('private.notification_domain_source_allowed(uuid,text,uuid,text,uuid,text)') is null then execute $f$create function private.notification_domain_source_allowed(t uuid,code text,source uuid,revision text,recipient uuid,ctx text) returns boolean language sql stable security definer set search_path='' as $b$select false$b$$f$;end if;
end$install$;
create or replace function private.notification_object_due(t uuid,obj uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.objects o join public.tenants te on te.id=o.tenant_id where o.tenant_id=t and o.id=obj and o.dossier_status<>'archived' and (
 exists(select 1 from private.object_secret_items si where si.tenant_id=t and si.object_id=obj and si.active and si.valid_until<now()+interval '7 days')
 or exists(select 1 from public.work_orders wo join public.work_order_assignments a on a.tenant_id=wo.tenant_id and a.work_order_id=wo.id cross join lateral private.assignment_requirements(a.tenant_id,a.personnel_id,wo.id,a.projected_start_at,a.projected_end_at) req where wo.tenant_id=t and wo.object_id=obj and wo.archive_at is null and a.status in ('planned','released','seen','travelling','in_progress') and a.projected_end_at>now() and not private.qualified_for_period(a.tenant_id,a.personnel_id,req.code,a.projected_start_at,a.projected_end_at))
 or exists(select 1 from public.object_visit_requests vr where vr.tenant_id=t and vr.object_id=obj and vr.needs_review)
 or exists(select 1 from public.object_records rec where rec.tenant_id=t and rec.object_id=obj and rec.state in ('open','progress') and(rec.due_on<=(now() at time zone te.timezone)::date or rec.kind='material' and rec.details->>'category' in ('tekort','defect','aanvulling')))))
$$;
create or replace function private.notification_customer_due(t uuid,cid uuid,actor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.customers c join public.tenants te on te.id=c.tenant_id join public.tenant_memberships m on m.tenant_id=c.tenant_id and m.user_id=c.owner_user_id where c.tenant_id=t and c.id=cid and c.owner_user_id=actor and c.reminders_enabled and c.status not in ('archived','inactive','draft') and m.status='active' and m.roles&&array['tenant_admin','management','planner','finance']::public.app_role[] and (
 exists(select 1 from public.customer_notes v where v.tenant_id=t and v.customer_id=cid and v.kind='action' and v.state='open' and v.due_on<=(now() at time zone te.timezone)::date)
 or exists(select 1 from public.requests r where r.tenant_id=t and r.customer_id=cid and r.status in ('new','review','waiting_info') and r.archived_at is null and r.followup_on<=(now() at time zone te.timezone)::date)
 or exists(select 1 from public.quotes q where q.tenant_id=t and q.customer_id=cid and q.status='awaiting_acceptance' and q.archived_at is null and q.followup_on<=(now() at time zone te.timezone)::date)
 or exists(select 1 from public.customer_documents d where d.tenant_id=t and d.customer_id=cid and not d.archived and d.valid_until<=(now() at time zone te.timezone)::date and not exists(select 1 from public.customer_documents nd where nd.previous_id=d.id))
 or exists(select 1 from public.object_records r join public.objects o on o.id=r.object_id and o.tenant_id=r.tenant_id where r.tenant_id=t and o.customer_id=cid and r.kind='quality' and r.state in ('open','progress') and r.due_on<=(now() at time zone te.timezone)::date)
 or(m.roles&&array['tenant_admin','management','finance']::public.app_role[] and (
 exists(select 1 from public.customer_agreements ag where ag.tenant_id=t and ag.customer_id=cid and ag.state='active' and not exists(select 1 from public.customer_agreements na where na.previous_id=ag.id and na.state='active') and least(ag.review_on,ag.notice_on,ag.renewal_on,ag.ends_on)<=(now() at time zone te.timezone)::date)
 or(private.service_enabled(t,'finance') and exists(select 1 from public.invoices i where i.tenant_id=t and i.customer_id=cid and i.status in ('sent','partially_paid','overdue') and i.total_cents>i.paid_cents and i.due_on<(now() at time zone te.timezone)::date))))))
$$;
create or replace function private.notification_source_allowed(t uuid,code text,kind text,source uuid,revision text,recipient uuid,ctx text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare cr private.notification_campaign_recipients;c private.notification_campaigns;visit public.work_orders;event_kind text;
begin
 if kind='domain' then return private.notification_domain_source_allowed(t,code,source,revision,recipient,ctx);
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
end$$;

create or replace function private.object_notify(t uuid,o uuid,w uuid,event_key text) returns void language plpgsql security definer set search_path='' as $$
declare u record;code text:=case when event_key like 'instruction:%' then 'object.instruction' when event_key like 'review:%' or event_key like 'accepted:%' or event_key like 'executed:%' then 'object.request_decided' else 'object.request' end;
begin
 for u in select distinct m.user_id,case when m.roles&&array['tenant_admin','management','planner']::public.app_role[] then 'backoffice' else 'staff' end ctx
 from public.tenant_memberships m where m.tenant_id=t and m.status='active' and(m.roles&&array['tenant_admin','management','planner']::public.app_role[] or exists(select 1 from public.personnel p join public.work_order_assignments a on a.tenant_id=p.tenant_id and a.personnel_id=p.id where p.tenant_id=t and p.user_id=m.user_id and p.status='active' and a.work_order_id=w and a.status not in ('cancelled','returned','completed') and exists(select 1 from public.dispatches d where d.tenant_id=t and d.assignment_id=a.id and d.revoked_at is null)))
 union select b.user_id,'customer' from public.object_customer_bindings b where b.tenant_id=t and b.object_id=o and b.active and code='object.request_decided' loop
  insert into private.object_notification_keys values(t,u.user_id,event_key,clock_timestamp()) on conflict do nothing;
  if found then perform private.notification_enqueue(t,code,'object',o,event_key,'object:'||event_key||':'||u.user_id,jsonb_build_object('recipient_user_id',u.user_id,'context',u.ctx,'channels',array['in_app','push'],'path',case u.ctx when 'backoffice' then '/app/objecten/'||o when 'customer' then '/klant?object='||o||case when w is null then '' else '&order='||w end else '/staff/objecten/'||o||'?order='||w end));end if;
 end loop;
end$$;
create or replace function public.process_object_reminders() returns integer language plpgsql security definer set search_path='' as $$
declare r record;u record;k text;n integer:=0;code text;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' and session_user<>'postgres' then raise exception 'Service required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-object-reminders',0));
 for r in select o.tenant_id,o.id as object_id,t.timezone from public.objects o join public.tenants t on t.id=o.tenant_id join public.tenant_settings s on s.tenant_id=t.id where t.status='active' and 'planning'=any(s.enabled_services) and private.notification_object_due(o.tenant_id,o.id) loop
  for u in select m.user_id from public.object_reminder_recipients rr join public.tenant_memberships m on m.tenant_id=rr.tenant_id and m.user_id=rr.user_id where rr.tenant_id=r.tenant_id and rr.object_id=r.object_id and rr.active and m.status='active' and m.roles&&array['tenant_admin','management','planner']::public.app_role[] loop
   k:='object-reminder:'||r.object_id||':'||(clock_timestamp() at time zone r.timezone)::date;
   code:=case when exists(select 1 from private.object_secret_items si where si.tenant_id=r.tenant_id and si.object_id=r.object_id and si.active and si.valid_until<now()+interval '7 days') then 'object.access_expiring' else 'object.followup' end;
   insert into private.object_notification_keys values(r.tenant_id,u.user_id,k,clock_timestamp()) on conflict do nothing;
   if found then perform private.notification_enqueue(r.tenant_id,code,'object',r.object_id,k,k||':'||u.user_id,jsonb_build_object('recipient_user_id',u.user_id,'context','backoffice','channels',array['in_app','push','email'],'path','/app/objecten/'||r.object_id));n:=n+1;end if;
  end loop;
 end loop;return n;
end$$;
create or replace function public.process_customer_reminders() returns integer language plpgsql security definer set search_path='' as $$
declare c record;k text;n integer:=0;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' and session_user<>'postgres' then raise exception 'Service required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-customer-reminders',0));
 for c in select x.id,x.tenant_id,x.owner_user_id,(now() at time zone te.timezone)::date today from public.customers x join public.tenants te on te.id=x.tenant_id where te.status='active' and private.service_enabled(te.id,'planning') and private.notification_customer_due(x.tenant_id,x.id,x.owner_user_id) loop
  k:='customer:followup:'||c.id||':'||c.today;
  if not exists(select 1 from public.outbox_events e where e.tenant_id=c.tenant_id and e.idempotency_key=k) and not exists(select 1 from private.notification_requests r where r.tenant_id=c.tenant_id and r.dedupe_key=k) then
   perform private.notification_enqueue(c.tenant_id,'customer.followup','customer',c.id,c.today::text,k,jsonb_build_object('recipient_user_id',c.owner_user_id,'context','backoffice','channels',array['in_app','push','email'],'path','/app/klanten/'||c.id));n:=n+1;
  end if;
 end loop;return n;
end$$;
revoke all on function public.process_object_reminders(),public.process_customer_reminders() from public,anon,authenticated;
grant execute on function public.process_object_reminders(),public.process_customer_reminders() to service_role;

-- Historical rows keep their IDs/read state. Their workspace is an existing
-- server path, never a client-supplied workspace or a fake tenant membership.
update public.notifications set context=case when target_path like '/platform%' then 'platform' when target_path like '/app%' then 'backoffice' when target_path like '/klant%' then 'customer' else 'staff' end where type_code is null;
update public.notifications set tenant_id=null where context='platform';
update public.notifications set source_kind='outbox',source_id=outbox_event_id,source_revision='legacy' where type_code is null and outbox_event_id is not null and source_kind is null;
update public.notifications n set type_code=case when e.event_type='work_order.report_submitted' and e.payload->>'state'='waiting_signature' then 'work_order.signature_required' else e.event_type end from public.outbox_events e where e.id=n.outbox_event_id and n.type_code is null and(e.event_type in ('work_order.dispatched','work_order.rescheduled','work_order.reviewed','announcement.published') or e.event_type='work_order.report_submitted' and e.payload->>'state'='waiting_signature');
update public.notifications n set type_code='ticket.changed',source_kind='ticket',source_id=d.event_id,source_revision=d.event_id::text,context=case when d.context in ('tenant','support') then 'backoffice' else d.context end from private.ticket_deliveries d where d.id=n.id and n.type_code is null;
update public.notifications set tenant_id=null where context='platform' and tenant_id is not null;

create or replace function private.notification_inbox_dto(n public.notifications,actor uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare allowed boolean;cat text;
begin
 allowed:=n.withdrawn_at is null and n.source_id is not null and private.notification_source_allowed(n.tenant_id,coalesce(n.type_code,''),n.source_kind,n.source_id,n.source_revision,actor,n.context);
 select category into cat from public.notification_catalog where code=n.type_code;
 return jsonb_build_object('id',n.id,'type_code',coalesce(n.type_code,'legacy'),'category',coalesce(cat,'Algemeen'),'title',case when allowed then n.title else 'Bron niet meer beschikbaar' end,'body',case when allowed then n.body else 'Dit bericht blijft in uw historie. De bron is verwijderd, ingetrokken of niet meer toegankelijk.' end,'summary',case when allowed then left(n.body,180) else 'De bron is niet meer beschikbaar.' end,'sender_name',n.sender_name,'priority',n.priority,'created_at',n.created_at,'read_at',n.read_at,'archived_at',n.archived_at,'ack_required',n.ack_required,'acknowledged_at',n.acknowledged_at,'source_available',allowed,'target_path',case when allowed and n.target_path~'^/(app|staff|klant|platform)(/|\?|$)' and n.target_path !~ E'[\\\r\n]' then n.target_path end,'action_label',coalesce(n.action_label,'Openen'),'revision',n.revision,
 'permissions',jsonb_build_object('read',n.read_at is null,'unread',n.read_at is not null,'archive',n.archived_at is null,'unarchive',n.archived_at is not null,'ack',allowed and n.ack_required and n.acknowledged_at is null));
end$$;
create or replace function private.notification_inbox_visible(nid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.ticket_session_active(auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid) and exists(select 1 from public.notifications n where n.id=nid and n.user_id=auth.uid() and private.notification_actor_active(n.tenant_id,n.context,auth.uid()) and n.withdrawn_at is null and n.source_id is not null and private.notification_source_allowed(n.tenant_id,coalesce(n.type_code,''),n.source_kind,n.source_id,n.source_revision,auth.uid(),n.context))
$$;
drop policy if exists notification_central_live_read on public.notifications;
create policy notification_central_live_read on public.notifications as restrictive for select to authenticated using(private.notification_inbox_visible(id));
revoke insert,update,delete on public.notifications from authenticated;

create or replace function private.notification_campaign_allowed(c private.notification_campaigns,actor uuid,action text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare cap text;
begin
 if not private.notification_actor_active(c.tenant_id,c.context,actor) then return false;end if;
 cap:=case when c.context='platform' then 'platform.notifications.'||case action when 'read' then 'read' else 'cancel' end else 'notifications.'||case action when 'read' then 'sent.read' else 'cancel' end end;
 if private.notification_cap(c.tenant_id,actor,cap) then return true;end if;
 return exists(select 1 from private.notification_campaign_recipients where campaign_id=c.id) and not exists(select 1 from private.notification_campaign_recipients r where r.campaign_id=c.id and not private.notification_cap(r.tenant_id,actor,cap,nullif(r.source_context->>'personnel_id','')::uuid,nullif(r.source_context->>'object_id','')::uuid,nullif(r.source_context->>'customer_id','')::uuid));
end$$;
create or replace function private.notification_campaign_path(c private.notification_campaigns,recipient uuid,ctx text,t uuid) returns text language plpgsql stable security definer set search_path='' as $$
declare obj uuid;wo uuid;
begin
 if c.source_kind='work_order' then select object_id,id into obj,wo from public.work_orders where tenant_id=t and id=c.source_id and archive_at is null;
 elsif c.source_kind='object' then select id into obj from public.objects where tenant_id=t and id=c.source_id and dossier_status<>'archived';end if;
 if obj is null or not private.notification_actor_active(t,ctx,recipient) then return null;end if;
 if ctx='staff' and wo is not null and exists(select 1 from public.work_order_assignments a join public.personnel p on p.tenant_id=a.tenant_id and p.id=a.personnel_id where a.tenant_id=t and a.work_order_id=wo and a.status not in ('cancelled','returned') and p.user_id=recipient and p.status='active' and exists(select 1 from public.dispatches d where d.assignment_id=a.id and d.tenant_id=t and d.revoked_at is null)) then return '/staff?workOrder='||wo;end if;
 if ctx='backoffice' and exists(select 1 from public.tenant_memberships where tenant_id=t and user_id=recipient and status='active' and roles&&array['tenant_admin','management','planner']::public.app_role[]) then return case when wo is null then '/app/objecten/'||obj else '/app/werkbonnen/'||wo end;end if;
 if ctx='customer' and wo is not null and exists(select 1 from public.object_customer_bindings where tenant_id=t and object_id=obj and user_id=recipient and active) then return '/klant?object='||obj||'&order='||wo;end if;
 return null;
end$$;
create or replace function private.notification_campaign_dto(c private.notification_campaigns,t uuid,ctx text,actor uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a jsonb:=private.notification_access(t,ctx,actor);mutable boolean:=c.state in ('draft','scheduled','paused');
begin
 return jsonb_build_object('id',c.id,'title',c.title,'body',c.body,'state',c.state,'criteria',c.criteria,'channels',c.channels,'priority',c.priority,'audience_summary',case c.criteria->>'kind' when 'staff' then 'Personeel' when 'customer' then 'Klantcontacten' when 'management' then 'Managementcontacten' else 'Geselecteerde ontvangers' end,'recipient_count',(select count(*) from private.notification_campaign_recipients where campaign_id=c.id),'sender_name',coalesce((select full_name from public.personnel where tenant_id=c.tenant_id and user_id=c.sender_id),'Fieldgrid'),'scheduled_at',c.scheduled_at,'expires_at',c.expires_at,'timezone',c.timezone,'ack_required',c.ack_required,'action_label',c.action_label,'source_kind',c.source_kind,'source_id',c.source_id,'created_at',c.created_at,'revision',c.revision,
 'permissions',jsonb_build_object('edit',c.sender_id=actor and mutable,'publish',c.sender_id=actor and c.state='draft','duplicate',true,'pause',mutable and c.state='scheduled' and coalesce((a->'permissions'->>'cancel')::boolean,false),'resume',c.sender_id=actor and c.state='paused','cancel',c.state not in ('cancelled','expired') and coalesce((a->'permissions'->>'cancel')::boolean,false)))||private.notification_campaign_delivery_summary(c.id,t,ctx,actor);
end$$;

create or replace function private.notification_template_dto(t uuid,ctx text,actor uuid,id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r private.notification_templates;g private.notification_templates;c public.notification_catalog;d jsonb;def jsonb;editable boolean;draft_pending boolean;display_definition jsonb;
begin
 select * into r from private.notification_templates where notification_templates.id=notification_template_dto.id;
 select * into c from public.notification_catalog where code=r.type_code;
 if r.id is null or (ctx='platform' and r.tenant_id is not null) or(ctx<>'platform' and r.tenant_id is not null and r.tenant_id<>t) then return null;end if;
 select * into g from private.notification_templates where tenant_id is null and type_code=r.type_code and context=r.context and channel=r.channel;
 select definition into def from private.notification_template_versions where notification_template_versions.id=g.active_version_id;
 d:=private.notification_template(case when ctx='platform' then null else t end,r.type_code,r.context,r.channel);
 draft_pending:=r.revision>coalesce((select revision from private.notification_template_versions where notification_template_versions.id=r.active_version_id),0);display_definition:=case when draft_pending then d||r.draft else d end;
 if r.channel='push' then
  def:=private.notification_template(null,r.type_code,r.context,r.channel);
  if not private.notification_push_template_safe(display_definition) then display_definition:=d;end if;
  c.variables:=array['bedrijfsnaam'];
 end if;
 editable:=case when ctx='platform' then private.notification_cap(null,actor,'platform.notifications.templates.manage') else c.tenant_override and private.notification_cap(t,actor,'notifications.templates.override') end;
 return d||jsonb_build_object('id',r.id,'type_code',r.type_code,'context',r.context,'channel',r.channel,'name',c.name,'revision',r.revision,'state',case when draft_pending then 'draft' else 'published' end,'title',display_definition->>'title','body',display_definition->>'body','cta_label',display_definition->>'cta_label','default_title',def->>'title','default_body',def->>'body','new_default_available',exists(select 1 from private.notification_template_versions v where v.id=r.active_version_id and v.base_version_id is not null and v.base_version_id<>g.active_version_id),'variables',(select jsonb_agg(jsonb_build_object('name',v,'required',false)) from unnest(c.variables)v),'permissions',jsonb_build_object('edit',editable,'publish',editable,'reset',editable and ctx<>'platform'),'history',(select coalesce(jsonb_agg(jsonb_build_object('revision',v.revision,'title',v.definition->>'title','body',v.definition->>'body','created_at',v.created_at) order by v.revision desc),'[]'::jsonb) from private.notification_template_versions v where v.template_id=r.id));
end$$;

create or replace function private.notification_preview_text(value text) returns text language sql immutable set search_path='' as $$
 select regexp_replace(replace(replace(replace(replace(replace(coalesce(value,''),'{bedrijfsnaam}','Voorbeeldorganisatie'),'{klantnaam}','Fictieve klant'),'{medewerkernaam}','Fictieve medewerker'),'{bericht}','Dit is een fictief berichtvoorbeeld.'),'{onderwerp}','Fictief onderwerp'),'\{[^{}]+\}','Voorbeeld','g')
$$;
create or replace function private.notification_policy_dto(p private.notification_policies,t uuid,ctx text,actor uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare allowed boolean;all_allowed boolean;reason text;editable boolean;
begin
 select coalesce(bool_or((d->>'allowed')::boolean),false),coalesce(bool_and((d->>'allowed')::boolean),false),min(d->>'reason') filter(where not(d->>'allowed')::boolean)
 into allowed,all_allowed,reason from public.notification_catalog cat cross join lateral unnest(cat.contexts)context_name cross join lateral unnest(cat.channels)channel_name cross join lateral(select private.notification_policy(t,cat.code,context_name,channel_name,null)d)decision where cat.status='active' and(p.type_code is null or cat.code=p.type_code) and(p.context is null or p.context=context_name) and(p.channel is null or p.channel=channel_name);
 editable:=case when p.scope='platform' then ctx='platform' and private.notification_cap(p.tenant_id,actor,case when p.tenant_id is null then 'platform.notifications.manage_global' else 'platform.notifications.manage_tenant' end) else ctx='backoffice' and p.tenant_id=t and private.notification_cap(t,actor,'notifications.settings.manage') end;
 return to_jsonb(p)||jsonb_build_object('bundle_seconds',p.settings->'bundle_seconds','effective_bundle_seconds',case when p.type_code='work_order.rescheduled' then private.notification_bundle_seconds(t,p.type_code,coalesce(p.context,'staff')) end,'effective',allowed,'reason',case when allowed and not all_allowed then 'Deels toegestaan; specifieke type-, module- en kanaalregels blijven gelden' when allowed then 'Toegestaan door alle beleidslagen' when reason='platform_blocked' then 'Geblokkeerd door platformbeleid' when reason='tenant_blocked' then 'Geblokkeerd door organisatiebeleid' when reason='module_unavailable' then 'Benodigde module niet beschikbaar' else 'Niet toegestaan door de actuele regels' end,'source',case p.scope when 'platform' then 'Platformbeleid' else 'Organisatiebeleid' end,'permissions',jsonb_build_object('edit',editable));
end$$;

create or replace function public.notification_query(target_tenant uuid,actor_context text,operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
<<notification_query>>
declare actor uuid:=auth.uid();ctx text:=actor_context;p jsonb:=payload;a jsonb;items jsonb;pg integer;sz integer;result jsonb;rec public.notifications;c private.notification_campaigns;pref private.notification_preferences;code text;query_tenant uuid;
begin
 if not private.ticket_session_active(actor,nullif(auth.jwt()->>'session_id','')::uuid) or not private.notification_actor_active(target_tenant,ctx,actor) or jsonb_typeof(p) is distinct from 'object' or length(p::text)>60000 then raise exception 'Geen toegang' using errcode='42501';end if;
 a:=private.notification_access(target_tenant,ctx,actor);
 if operation='access' then return a||jsonb_build_object('timezone',coalesce((select timezone from public.tenants where id=target_tenant),'Europe/Amsterdam'));end if;
 pg:=greatest(1,coalesce((p->>'page')::integer,1));sz:=least(100,greatest(1,coalesce((p->>'page_size')::integer,25)));
 if operation in ('inbox','detail') then
  if not coalesce((a->'permissions'->>'read_own')::boolean,false) then raise exception 'Geen inboxrecht' using errcode='42501';end if;
  if operation='detail' then select * into rec from public.notifications where id=(p->>'notification_id')::uuid and tenant_id is not distinct from target_tenant and context=ctx and user_id=actor and channel='in_app';if not found then raise exception 'Bericht niet beschikbaar' using errcode='42501';end if;return private.notification_inbox_dto(rec,actor);end if;
  with own as(select n.*,coalesce(cat.category,'Algemeen') category,private.notification_inbox_dto(n,actor) dto from public.notifications n left join public.notification_catalog cat on cat.code=n.type_code where n.tenant_id is not distinct from target_tenant and n.context=ctx and n.user_id=actor and n.channel='in_app'),filtered as(select * from own where(case coalesce(p->>'view','all') when 'archived' then archived_at is not null when 'unread' then read_at is null and archived_at is null when 'action' then ack_required and acknowledged_at is null and archived_at is null else archived_at is null end) and(coalesce(p->>'category','')='' or category=p->>'category') and(coalesce(p->>'search','')='' or dto->>'title' ilike '%'||(p->>'search')||'%' or dto->>'body' ilike '%'||(p->>'search')||'%')),paged as(select id from filtered order by created_at desc,id desc limit sz offset(pg-1)*sz)
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
end$$;

create or replace function private.notification_suppress_requests() returns integer language plpgsql security definer set search_path='' as $$
declare r private.notification_requests;routes jsonb;total integer:=0;
begin
 for r in select * from private.notification_requests where prepared_at is null for update loop
  select coalesce(jsonb_agg(route order by route),'[]'::jsonb) into routes from(select distinct value route from jsonb_array_elements_text(coalesce(r.payload->'suppressed_routes','[]'::jsonb)) union select ctx||':'||ch from public.notification_catalog c cross join lateral unnest(c.contexts)ctx cross join lateral unnest(c.channels)ch where c.code=r.type_code and not coalesce((private.notification_policy(r.tenant_id,r.type_code,ctx,ch,null)->>'allowed')::boolean,false))x;
  if jsonb_array_length(routes)>0 then update private.notification_requests set payload=jsonb_set(payload,'{suppressed_routes}',routes) where id=r.id;total:=total+1;end if;
 end loop;return total;
end$$;

create or replace function public.notification_command(target_tenant uuid,actor_context text,command text,payload jsonb,request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
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
  update public.notifications set read_at=clock_timestamp(),revision=revision+1 where tenant_id is not distinct from target_tenant and context=ctx and user_id=actor and channel='in_app' and read_at is null and archived_at is null;
  get diagnostics row_count=row_count;result:=jsonb_build_object('ok',true,'count',row_count);
 elsif cmd in ('inbox_read','inbox_unread','inbox_archive','inbox_unarchive','inbox_ack') then
  if not coalesce((a->'permissions'->>'read_own')::boolean,false) then raise exception 'Geen inboxrecht' using errcode='42501';end if;
  select * into rec from public.notifications where notifications.id=notification_command.id and tenant_id is not distinct from target_tenant and context=ctx and user_id=actor and channel='in_app' for update;
  if not found then raise exception 'Bericht niet beschikbaar' using errcode='42501';end if;
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
  if tmpl.revision<>expected then raise exception 'Template is gewijzigd' using errcode='40001';end if;
  select * into global_tmpl from private.notification_templates where tenant_id is null and type_code=tmpl.type_code and context=tmpl.context and channel=tmpl.channel;
  if ctx<>'platform' and tmpl.tenant_id is null then
   insert into private.notification_templates(tenant_id,type_code,context,channel,revision,draft) values(target_tenant,tmpl.type_code,tmpl.context,tmpl.channel,tmpl.revision,tmpl.draft) on conflict do nothing;
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
end$$;

revoke all on function public.notification_query(uuid,text,text,jsonb),public.notification_command(uuid,text,text,jsonb,uuid) from public,anon;
grant execute on function public.notification_query(uuid,text,text,jsonb),public.notification_command(uuid,text,text,jsonb,uuid) to authenticated;
do $$declare tbl text;begin
 foreach tbl in array array['notification_catalog'] loop execute format('alter table public.%I enable row level security',tbl);execute format('alter table public.%I force row level security',tbl);execute format('revoke all on public.%I from public,anon,authenticated,service_role',tbl);end loop;
 foreach tbl in array array['notification_state','notification_policies','notification_preferences','notification_templates','notification_template_versions','notification_campaigns','notification_campaign_recipients','notification_requests','notification_provider_permits','notification_receipts','notification_audit','notification_permission_bootstrap'] loop execute format('alter table private.%I enable row level security',tbl);execute format('alter table private.%I force row level security',tbl);execute format('revoke all on private.%I from public,anon,authenticated,service_role',tbl);end loop;
end$$;
revoke all on function public.notification_policy_check(uuid,text,text,text,uuid),public.notification_provider_gate(text,uuid,text,text,text,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.notification_policy_check(uuid,text,text,text,uuid),public.notification_provider_gate(text,uuid,text,text,text,uuid,uuid,text,jsonb) to service_role;
revoke all on function public.notification_template_resolve(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.notification_template_resolve(uuid,text,text,text) to service_role;
do $$declare f record;begin for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like 'notification_%' loop execute format('revoke all on function %s from public,anon,authenticated',f.signature);end loop;end$$;
grant execute on function private.notification_inbox_visible(uuid) to authenticated;

-- Section: notifications-commercial
-- Query-first integration draft. Captured into a CLI-created migration after tests.
-- Tenant branding remains editable; frozen mail assets are service-owned.
-- Restrictive policies also prevent moving a frozen object out of its namespace.
drop policy if exists notification_assets_insert_guard on storage.objects;
create policy notification_assets_insert_guard on storage.objects as restrictive for insert to authenticated
 with check (bucket_id<>'branding' or split_part(name,'/',2)<>'notification-assets');
drop policy if exists notification_assets_update_guard on storage.objects;
create policy notification_assets_update_guard on storage.objects as restrictive for update to authenticated
 using (bucket_id<>'branding' or split_part(name,'/',2)<>'notification-assets')
 with check (bucket_id<>'branding' or split_part(name,'/',2)<>'notification-assets');
drop policy if exists notification_assets_delete_guard on storage.objects;
create policy notification_assets_delete_guard on storage.objects as restrictive for delete to authenticated
 using (bucket_id<>'branding' or split_part(name,'/',2)<>'notification-assets');
create or replace function private.notification_mail_source_allowed(mail_id uuid, recipient text, type_code text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare m public.mail_deliveries; q public.quotes; r public.requests; e public.commercial_events;
 c public.customers; ct public.customer_contacts; i public.invoices; p public.personnel; item jsonb; owner_id uuid; business_day date;
begin
 select * into m from public.mail_deliveries where id=mail_id;
 if m.id is null or m.recipient is distinct from recipient or m.status<>'processing'
 or not exists(select 1 from public.tenants where id=m.tenant_id and status='active') then return false;end if;
 select (now() at time zone timezone)::date into business_day from public.tenants where id=m.tenant_id;
 if type_code='personnel.invitation' and m.template='personnel_invitation' then
  select * into p from public.personnel where tenant_id=m.tenant_id and id=(m.render_snapshot->>'personnel_id')::uuid;
  return p.id is not null and p.status='active' and lower(p.email)=lower(recipient)
   and exists(select 1 from public.tenant_memberships where tenant_id=m.tenant_id and user_id=p.user_id and status='active' and 'staff'=any(roles))
   and exists(select 1 from auth.users where id=p.user_id and deleted_at is null and (banned_until is null or banned_until<=now()));
 elsif type_code='invoice.available' and m.template='invoice' then
  select * into i from public.invoices where tenant_id=m.tenant_id and id=(m.render_snapshot->>'invoice_id')::uuid;
  select * into c from public.customers where tenant_id=m.tenant_id and id=i.customer_id;
  return i.id is not null and i.status<>'draft' and i.pdf_storage_path is not null and c.status<>'archived'
    and lower(c.billing_email)=lower(recipient) and private.service_enabled(m.tenant_id,'finance');
 elsif type_code in ('quote.available','quote.reminder') and m.template in ('quote','quote_reminder') then
  select * into q from public.quotes where tenant_id=m.tenant_id and id=(m.render_snapshot->>'quote_id')::uuid;
  if q.id is null or q.status<>'awaiting_acceptance' or q.expires_at<=now() or q.superseded_at is not null or q.archived_at is not null or q.pdf_path is null
    or q.snapshot#>>'{contact,email}' is distinct from recipient then return false;end if;
 elsif m.template='commercial_event' then
  select * into e from public.commercial_events where tenant_id=m.tenant_id and id=(m.render_snapshot->>'event_id')::uuid;
  if e.id is null or e.kind<>type_code then return false;end if;
  select value into item from jsonb_array_elements(e.mail_snapshot->'recipients') where value->>'email'=recipient limit 1;
  if item is null then return false;end if;
  select * into q from public.quotes where tenant_id=m.tenant_id and id=e.quote_id;
  select * into r from public.requests where tenant_id=m.tenant_id and id=coalesce(e.request_id,q.request_id);
  if q.archived_at is not null or r.archived_at is not null or (q.id is null and r.id is null) then return false;end if;
  if item->>'audience'='owner' then
   owner_id:=coalesce(q.owner_id,r.owner_id);
   return exists(select 1 from auth.users u join public.tenant_memberships tm on tm.user_id=u.id
    where u.id=owner_id and lower(u.email)=lower(recipient) and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
     and tm.tenant_id=m.tenant_id and tm.status='active' and tm.roles&&array['tenant_admin','management','finance']::public.app_role[]);
  end if;
 else return false;
 end if;
 select * into c from public.customers where tenant_id=m.tenant_id and id=coalesce(q.customer_id,r.customer_id);
 if c.id is null or c.status='archived' then return false;end if;
 if coalesce(q.contact_id,r.contact_id) is not null then
  select * into ct from public.customer_contacts where tenant_id=m.tenant_id and customer_id=c.id and id=coalesce(q.contact_id,r.contact_id);
  return ct.id is not null and ct.active and(ct.active_from is null or ct.active_from<=business_day) and(ct.active_until is null or ct.active_until>=business_day) and lower(ct.email)=lower(recipient);
 end if;
 return lower(c.billing_email)=lower(recipient);
end $$;
revoke all on function private.notification_mail_source_allowed(uuid,text,text) from public,anon,authenticated;

create or replace function public.notification_mail_snapshot(target_tenant uuid,delivery_id uuid,draft jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.mail_deliveries; key text;
begin
 if coalesce(current_setting('request.jwt.claim.role',true),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')<>'service_role' then raise exception 'Service required' using errcode='42501';end if;
 select * into m from public.mail_deliveries where tenant_id=target_tenant and id=delivery_id for update;
 if m.id is null or m.status<>'processing' then raise exception 'Geen actieve mailclaim' using errcode='23514';end if;
 if m.render_snapshot->'delivery' is not null then return m.render_snapshot->'delivery';end if;
 if jsonb_typeof(draft)<>'object' or octet_length(draft::text)>250000 or draft->>'to' is distinct from m.recipient
  or length(coalesce(draft->>'subject','')) not between 1 and 300 or draft->>'subject' ~ E'[\r\n]'
  or length(coalesce(draft->>'text','')) not between 1 and 50000 or length(coalesce(draft->>'html','')) not between 1 and 150000
  or coalesce((draft->>'templateRevision')::integer,0)<1 then raise exception 'Ongeldige berichtversie' using errcode='23514';end if;
 for key in select jsonb_object_keys(draft) loop
  if key<>all(array['fromEmail','fromName','to','subject','text','html','targetUrl','templateRevision','templateVersionId','templateBaseVersionId','attachmentPath','attachmentFilename']) then raise exception 'Onbekend berichtveld' using errcode='23514';end if;
 end loop;
 update public.mail_deliveries set render_snapshot=coalesce(render_snapshot,'{}')||jsonb_build_object('delivery',draft,'subject',draft->>'subject'),template_revision=(draft->>'templateRevision')::integer where id=m.id;
 return draft;
end $$;
revoke all on function public.notification_mail_snapshot(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.notification_mail_snapshot(uuid,uuid,jsonb) to service_role;

create or replace function private.notification_mail_snapshot_immutable() returns trigger language plpgsql set search_path='' as $$
begin
 if old.render_snapshot->'delivery' is not null and new.render_snapshot->'delivery' is distinct from old.render_snapshot->'delivery' then
  raise exception 'Een vastgelegde berichtversie kan niet worden herschreven' using errcode='23514';end if;
 return new;
end $$;
drop trigger if exists notification_mail_snapshot_immutable on public.mail_deliveries;
create trigger notification_mail_snapshot_immutable before update on public.mail_deliveries for each row execute function private.notification_mail_snapshot_immutable();
revoke all on function private.notification_mail_snapshot_immutable() from public,anon,authenticated;

create or replace function private.notification_mail_policy(m public.mail_deliveries) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare code text;ctx text:='customer';e public.commercial_events;recipient_id uuid;
begin
 code:=case m.template when 'invoice' then 'invoice.available' when 'quote' then 'quote.available' when 'quote_reminder' then 'quote.reminder' end;
 if m.template='commercial_event' then
  select * into e from public.commercial_events where tenant_id=m.tenant_id and id::text=m.render_snapshot->>'event_id';
  code:=e.kind;select case when value->>'audience'='customer' then 'customer' else 'backoffice' end into ctx from jsonb_array_elements(e.mail_snapshot->'recipients') where value->>'email'=m.recipient limit 1;
 elsif m.template='personnel_invitation' and(m.render_snapshot->>'notification_kind'='notification' or m.render_snapshot->'delivery' is not null) then code:='personnel.invitation';ctx:='staff';end if;
 if code is null or ctx is null then return null;end if;
 select id into recipient_id from auth.users where lower(email)=lower(m.recipient) and email_confirmed_at is not null and private.notification_actor_active(m.tenant_id,ctx,id) order by id limit 1;
 return private.notification_policy(m.tenant_id,code,ctx,'email',recipient_id);
end$$;
revoke all on function private.notification_mail_policy(public.mail_deliveries) from public,anon,authenticated,service_role;
create or replace function private.notification_mail_claim_policy() returns trigger language plpgsql security definer set search_path='' as $$
declare p jsonb;
begin
 if new.status<>'processing' then return new;end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-notification-policy',0));
 p:=private.notification_mail_policy(new);
 if p is not null and not coalesce((p->>'allowed')::boolean,false) then new.status:='suppressed';new.locked_until:=null;new.last_error:='Geblokkeerd door het notificatiebeleid bij de verzendclaim.';end if;
 return new;
end$$;
drop trigger if exists notification_mail_claim_policy on public.mail_deliveries;
create trigger notification_mail_claim_policy before insert or update of status on public.mail_deliveries for each row execute function private.notification_mail_claim_policy();
revoke all on function private.notification_mail_claim_policy() from public,anon,authenticated,service_role;

-- A SendGrid delivery key is correlation, not provider-side deduplication.
-- Never reclaim an expired processing attempt: its external result is unknown.
create or replace function public.claim_mail_delivery(target_tenant_id uuid,target_recipient text,target_template text,target_idempotency_key text)
returns table(delivery_id uuid,should_send boolean,current_status public.delivery_status)
language plpgsql security definer set search_path='' as $$
declare target public.mail_deliveries;
begin
 if coalesce(current_setting('request.jwt.claim.role',true),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')<>'service_role' then raise exception 'Service required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-notification-policy',0));
 insert into public.mail_deliveries(tenant_id,recipient,template,status,attempts,idempotency_key,locked_until)
 values(target_tenant_id,target_recipient,target_template,'processing',1,target_idempotency_key,clock_timestamp()+interval '2 minutes')
 on conflict(tenant_id,idempotency_key) do nothing returning * into target;
 if found then return query select target.id,target.status='processing',target.status;return;end if;
 select * into target from public.mail_deliveries d where d.tenant_id=target_tenant_id and d.idempotency_key=target_idempotency_key for update;
 if target.recipient<>target_recipient or target.template<>target_template then raise exception 'Berichtcontext gewijzigd' using errcode='23514';end if;
 if target.status not in ('failed','queued') then return query select target.id,false,target.status;return;end if;
 update public.mail_deliveries set status='processing',attempts=attempts+1,locked_until=clock_timestamp()+interval '2 minutes',last_error=null where id=target.id returning * into target;
 return query select target.id,target.status='processing',target.status;
end $$;
revoke all on function public.claim_mail_delivery(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.claim_mail_delivery(uuid,text,text,text) to service_role;

-- Preserve the existing commercial transaction/claim logic and only tighten
-- terminal retry eligibility in those two already deployed functions.
do $$ declare fn text; definition text; begin
 foreach fn in array array['public.commercial_mail_claim(uuid,uuid,text)','public.commercial_quote_mail_claim(uuid,uuid,uuid,boolean)'] loop
  definition:=pg_get_functiondef(fn::regprocedure);
  if position('m.status in (''sent'',''processing'')' in definition)>0 then
   execute replace(definition,'m.status in (''sent'',''processing'')','m.status not in (''queued'',''failed'')');
  elsif position('m.status not in (''queued'',''failed'')' in definition)=0 then raise exception 'Commerciële claimdefinitie wijkt af; controleer de migratieketen';end if;
  definition:=pg_get_functiondef(fn::regprocedure);
  if position('fieldgrid-notification-policy' in definition)=0 then
   definition:=replace(definition,'perform pg_advisory_xact_lock(hashtextextended(''commercial:''||target_tenant::text,0));',
    'perform pg_advisory_xact_lock(hashtextextended(''commercial:''||target_tenant::text,0));perform pg_advisory_xact_lock(hashtextextended(''fieldgrid-notification-policy'',0));');
   definition:=replace(definition,'''send'',true','''send'',(select status=''processing'' from public.mail_deliveries where id=m.id)');
   execute definition;
  end if;
 end loop;
end $$;

update public.notification_catalog set status='active' where code in ('request.received','request.information_requested','request.customer_reply','request.rejected','quote.available','quote.reminder','quote.accepted','quote.rejected','quote.change_requested','booking.confirmed','invoice.available','personnel.invitation');
update public.notification_catalog set contexts=array['customer','backoffice'] where code='quote.change_requested';

-- The commercial event remains the single source. Opt-in app/push envelopes
-- do not duplicate the existing e-mail sender or expose a whole customer file.
create or replace function private.notification_commercial_source_allowed(t uuid,code text,source uuid,revision text,recipient uuid,ctx text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare e public.commercial_events;q public.quotes;r public.requests;c public.customers;ct public.customer_contacts;address text;owner_id uuid;v_object_id uuid;business_day date;
begin
 if not private.notification_actor_active(t,ctx,recipient) then return false;end if;
 select * into e from public.commercial_events where tenant_id=t and id=source and kind=code;
 if e.id is null or revision<>e.id::text then return false;end if;
 select * into q from public.quotes where tenant_id=t and id=e.quote_id;
 select * into r from public.requests where tenant_id=t and id=coalesce(e.request_id,q.request_id);
 if q.archived_at is not null or r.archived_at is not null or(q.id is null and r.id is null) then return false;end if;
 if ctx='backoffice' then
  owner_id:=coalesce(q.owner_id,r.owner_id);
  return owner_id=recipient and exists(select 1 from public.tenant_memberships where tenant_id=t and user_id=recipient and status='active' and roles&&array['tenant_admin','management','finance']::public.app_role[]);
 end if;
 if ctx<>'customer' then return false;end if;
 select (now() at time zone timezone)::date into business_day from public.tenants where id=t;
 select * into c from public.customers where tenant_id=t and id=coalesce(q.customer_id,r.customer_id);
 select * into ct from public.customer_contacts where tenant_id=t and customer_id=c.id and id=coalesce(q.contact_id,r.contact_id) and active and(active_from is null or active_from<=business_day) and(active_until is null or active_until>=business_day);
 if c.id is null or c.status='archived' or(coalesce(q.contact_id,r.contact_id) is not null and ct.id is null) then return false;end if;
 address:=coalesce(ct.email,c.billing_email);v_object_id:=coalesce(q.object_id,r.object_id);
 return exists(select 1 from auth.users where id=recipient and lower(email)=lower(address) and deleted_at is null)
  and exists(select 1 from public.object_customer_bindings b join public.objects o on o.tenant_id=b.tenant_id and o.id=b.object_id
   where b.tenant_id=t and b.user_id=recipient and b.active and o.customer_id=c.id and(o.id=v_object_id or v_object_id is null) and o.dossier_status<>'archived');
end $$;
revoke all on function private.notification_commercial_source_allowed(uuid,text,uuid,text,uuid,text) from public,anon,authenticated;

create or replace function private.notification_commercial_event() returns trigger language plpgsql security definer set search_path='' as $$
declare item jsonb;u record;ctx text;recipient_id uuid;policy jsonb;
begin
 if new.mail_snapshot is null or not exists(select 1 from public.notification_catalog where code=new.kind and status='active') then return new;end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-notification-policy',0));
 for item in select value from jsonb_array_elements(new.mail_snapshot->'recipients') loop
  ctx:=case when item->>'audience'='customer' then 'customer' else 'backoffice' end;
  select id into recipient_id from auth.users where lower(email)=lower(item->>'email') and email_confirmed_at is not null and private.notification_actor_active(new.tenant_id,ctx,id) order by id limit 1;
  policy:=private.notification_policy(new.tenant_id,new.kind,ctx,'email',recipient_id);
  insert into public.mail_deliveries(tenant_id,recipient,template,idempotency_key,status,attempts,render_snapshot,branding_snapshot,last_error)
   values(new.tenant_id,item->>'email','commercial_event','commercial-event:'||new.id||':'||encode(extensions.digest(item->>'email','sha256'),'hex'),
    case when coalesce((policy->>'allowed')::boolean,false) then 'queued'::public.delivery_status else 'suppressed'::public.delivery_status end,0,
    jsonb_build_object('event_id',new.id,'quote_id',new.quote_id,'request_id',new.request_id,'subject',new.mail_snapshot->>'subject','body',new.mail_snapshot->>'body'),new.mail_snapshot->'brand',
    case when not coalesce((policy->>'allowed')::boolean,false) then 'Geblokkeerd door het notificatiebeleid bij de brongebeurtenis.' end)
   on conflict(tenant_id,idempotency_key) do nothing;
  for u in select id from auth.users where lower(email)=lower(item->>'email') and deleted_at is null loop
   if private.notification_commercial_source_allowed(new.tenant_id,new.kind,new.id,new.id::text,u.id,ctx) then
    perform private.notification_enqueue(new.tenant_id,new.kind,'commercial',new.id,new.id::text,'commercial-app:'||new.id||':'||u.id||':'||ctx,
     jsonb_build_object('recipient_user_id',u.id,'context',ctx,'channels',array['in_app','push'],'path',item->>'path','variables',jsonb_build_object('bedrijfsnaam',(select name from public.tenants where id=new.tenant_id))));
   end if;
  end loop;
 end loop;
 return new;
end $$;
drop trigger if exists notification_commercial_event on public.commercial_events;
create trigger notification_commercial_event after insert on public.commercial_events for each row execute function private.notification_commercial_event();
revoke all on function private.notification_commercial_event() from public,anon,authenticated;

create or replace function private.notification_suppress_commercial_mail() returns integer
language plpgsql security definer set search_path='' as $$
declare m public.mail_deliveries;p jsonb;n integer:=0;
begin
 for m in select d.* from public.mail_deliveries d where d.template in ('commercial_event','quote','quote_reminder','invoice','personnel_invitation') and d.status in ('queued','failed','processing')
  and not exists(select 1 from private.notification_provider_permits pp where pp.delivery_key=d.idempotency_key and pp.state in ('admitted','accepted','uncertain')) for update of d loop
  p:=private.notification_mail_policy(m);
  if p is not null and not coalesce((p->>'allowed')::boolean,false) then
   update public.mail_deliveries set status='suppressed',locked_until=null,last_error='Geblokkeerd door gewijzigde notificatie-instellingen.' where id=m.id;
   n:=n+1;
  end if;
 end loop;
 return n;
end$$;
revoke all on function private.notification_suppress_commercial_mail() from public,anon,authenticated,service_role;

-- An envelope queued atomically with intake is not evidence of a sent message.
-- Keep the existing deletion guard for every attempted or accepted mail; a
-- never-attempted draft envelope is cancelled while its source is removed.
do $$declare definition text;old_guard text:='m.tenant_id=target_tenant and m.render_snapshot->>''request_id''=r.id::text)';begin
 definition:=pg_get_functiondef('public.commercial_command(uuid,uuid,text,jsonb)'::regprocedure);
 if position(old_guard in definition)>0 then
  definition:=replace(definition,old_guard,'m.tenant_id=target_tenant and m.render_snapshot->>''request_id''=r.id::text and (m.attempts>0 or m.status not in (''queued'',''suppressed'')))');
  definition:=replace(definition,'delete from public.commercial_events where request_id=r.id;',
   'update public.mail_deliveries set status=''cancelled'',last_error=''Ongebruikte aanvraag verwijderd vóór verzending.'' where tenant_id=target_tenant and render_snapshot->>''request_id''=r.id::text and attempts=0 and status in (''queued'',''suppressed'');delete from public.commercial_events where request_id=r.id;');
  execute definition;
 elsif position('Ongebruikte aanvraag verwijderd vóór verzending.' in definition)=0 then raise exception 'Controleer de commerciële verwijderbeveiliging vóór migratie';end if;
end$$;

create or replace function private.notification_payment_source_allowed(t uuid,code text,source uuid,revision text,recipient uuid,ctx text)
returns boolean language sql stable security definer set search_path='' as $$
 select ctx='backoffice' and private.notification_actor_active(t,ctx,recipient)
 and exists(select 1 from public.payment_attempts p where p.tenant_id=t and p.id=source and p.provider='mollie' and p.provider_payment_id is not null and p.last_checked_at is not null
  and p.status::text=revision and(code='payment.received' and p.status='paid' or code='payment.failed' and p.status='failed'))
 and exists(select 1 from public.tenant_memberships where tenant_id=t and user_id=recipient and status='active' and roles&&array['tenant_admin','management','finance']::public.app_role[])
$$;
revoke all on function private.notification_payment_source_allowed(uuid,text,uuid,text,uuid,text) from public,anon,authenticated;
create or replace function private.notification_payment_event() returns trigger language plpgsql security definer set search_path='' as $$
declare u record;code text;
begin
 if new.status=old.status or new.provider<>'mollie' or new.status not in ('paid','failed') or new.last_checked_at is null or new.provider_payment_id is null then return new;end if;
 code:=case when new.status='paid' then 'payment.received' else 'payment.failed' end;
 for u in select user_id from public.tenant_memberships where tenant_id=new.tenant_id and status='active' and roles&&array['tenant_admin','management','finance']::public.app_role[] loop
  perform private.notification_enqueue(new.tenant_id,code,'payment',new.id,new.status::text,'payment:'||new.id||':'||new.status||':'||u.user_id,
   jsonb_build_object('recipient_user_id',u.user_id,'context','backoffice','channels',array['in_app','push'],'path','/app/facturen','variables',jsonb_build_object('bedrijfsnaam',(select name from public.tenants where id=new.tenant_id))));
 end loop;
 return new;
end $$;
drop trigger if exists notification_payment_event on public.payment_attempts;
create trigger notification_payment_event after update of status on public.payment_attempts for each row execute function private.notification_payment_event();
revoke all on function private.notification_payment_event() from public,anon,authenticated;
-- Newly available payment notifications are deliberately opt-in at rollout.
update public.notification_catalog set status='active',contexts=array['backoffice'],channels=array['in_app','push'],default_channels='{}' where code in ('payment.received','payment.failed');

-- Section: notifications-deferred-mail
-- Sole owner of a legacy document mail while personal quiet hours defer it.
create table if not exists private.notification_deferred_mail(
 mail_id uuid primary key references public.mail_deliveries(id),tenant_id uuid not null references public.tenants(id),
 type_code text not null references public.notification_catalog(code),context text not null check(context in ('staff','customer','backoffice')),
 state text not null default 'queued' check(state in ('queued','processing','sent','failed','uncertain','suppressed','expired')),
 available_at timestamptz not null,expires_at timestamptz not null,lease_id uuid,lease_until timestamptz,
 attempts integer not null default 0,actor_id uuid references auth.users(id) on delete set null,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index if not exists notification_deferred_mail_due on private.notification_deferred_mail(available_at,mail_id) where state in ('queued','failed');
alter table private.notification_deferred_mail enable row level security;
alter table private.notification_deferred_mail force row level security;
revoke all on private.notification_deferred_mail from public,anon,authenticated,service_role;
create or replace function public.notification_deferred_mail(operation text,target_tenant uuid default null,target_mail_id uuid default null,input jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.mail_deliveries;d private.notification_deferred_mail;result jsonb:='[]'::jsonb;until_at timestamptz;ttl integer;outcome text;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 if target_tenant is not null then perform pg_advisory_xact_lock(hashtextextended('commercial:'||target_tenant::text,0));end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-notification-policy',0));
 if operation='defer' then
  select * into m from public.mail_deliveries where id=target_mail_id and tenant_id=target_tenant for update;
  if m.id is null or m.status<>'processing' or m.render_snapshot->'delivery' is null then raise exception 'Vaste berichtversie vereist' using errcode='23514';end if;
  if not private.notification_mail_source_allowed(m.id,m.recipient,input->>'type') then raise exception 'Bron niet beschikbaar' using errcode='42501';end if;
  until_at:=(input->>'available_at')::timestamptz;
  if until_at is null or until_at<=now() or until_at>now()+interval '2 days' then raise exception 'Ongeldig uitstelmoment' using errcode='23514';end if;
  select ttl_minutes into ttl from public.notification_catalog where code=input->>'type';
  insert into private.notification_deferred_mail(mail_id,tenant_id,type_code,context,available_at,expires_at,actor_id)
   values(m.id,m.tenant_id,input->>'type',input->>'context',until_at,now()+make_interval(mins=>ttl),nullif(input->>'actor_id','')::uuid)
   on conflict(mail_id) do update set available_at=excluded.available_at,state='queued',lease_id=null,lease_until=null,updated_at=now()
    where notification_deferred_mail.state in ('processing','queued','failed');
  update public.mail_deliveries set status='queued',locked_until=null,last_error='Uitgesteld volgens de persoonlijke rusttijden.' where id=m.id;
  return jsonb_build_object('ok',true);
 elsif operation='retry' then
  -- Only a deliberate, source-authorized document action may replenish the
  -- automatic retry budget. Never revive an uncertain, disabled or expired job.
  select * into d from private.notification_deferred_mail dm where dm.mail_id=target_mail_id and dm.tenant_id=target_tenant for update;
  if d.mail_id is null or d.state<>'failed' or d.expires_at<=now() then return jsonb_build_object('ok',false);end if;
  select * into m from public.mail_deliveries where id=d.mail_id and tenant_id=target_tenant for update;
  if m.status<>'failed' or m.template not in ('invoice','quote','quote_reminder') or m.render_snapshot->'delivery' is null
   or exists(select 1 from private.notification_provider_permits p where p.delivery_key=m.idempotency_key and p.state in ('admitted','accepted','uncertain'))
   or not coalesce((private.notification_mail_policy(m)->>'allowed')::boolean,false) then return jsonb_build_object('ok',false);end if;
  update private.notification_deferred_mail set state='queued',attempts=0,available_at=now(),lease_id=null,lease_until=null,updated_at=now() where mail_id=d.mail_id;
  update public.mail_deliveries set status='queued',locked_until=null,last_error='Opnieuw ingepland na een bewuste herkansing vanuit het document.' where id=d.mail_id;
  return jsonb_build_object('ok',true);
 elsif operation='claim' then
  with expired as(update private.notification_deferred_mail set state='uncertain',updated_at=now() where state='processing' and lease_until<now() and(target_tenant is null or tenant_id=target_tenant) returning notification_deferred_mail.mail_id)
   update public.mail_deliveries set status='uncertain',last_error='Verwerking onderbroken; provideruitkomst onzeker.' where id in(select expired.mail_id from expired);
  for d in select * from private.notification_deferred_mail dm where dm.state in ('queued','failed') and dm.available_at<=now() and dm.attempts<5 and(target_tenant is null or dm.tenant_id=target_tenant) order by dm.available_at,dm.mail_id for update skip locked limit 5 loop
   select * into m from public.mail_deliveries where id=d.mail_id for update;
   if m.status='sent' then update private.notification_deferred_mail set state='sent',updated_at=now() where notification_deferred_mail.mail_id=d.mail_id;continue;end if;
   if d.expires_at<=now() then update private.notification_deferred_mail set state='expired',updated_at=now() where notification_deferred_mail.mail_id=d.mail_id;update public.mail_deliveries set status='cancelled',last_error='Het bericht is verlopen vóór verzending.' where id=m.id;continue;end if;
   update private.notification_deferred_mail set state='processing',lease_id=gen_random_uuid(),lease_until=now()+interval '90 seconds',attempts=attempts+1,updated_at=now() where notification_deferred_mail.mail_id=d.mail_id returning * into d;
   update public.mail_deliveries set status='processing',locked_until=d.lease_until,attempts=attempts+1 where id=m.id;
   result:=result||jsonb_build_array(jsonb_build_object('id',m.id,'tenant_id',m.tenant_id,'type',d.type_code,'context',d.context,'lease_id',d.lease_id,'key',m.idempotency_key,'template',m.template,'snapshot',m.render_snapshot->'delivery'));
  end loop;
  return result;
 elsif operation='finish' then
  select * into d from private.notification_deferred_mail dm where dm.mail_id=target_mail_id and dm.tenant_id=target_tenant for update;
  if d.mail_id is null or d.state<>'processing' or d.lease_id is distinct from (input->>'lease_id')::uuid then return jsonb_build_object('ok',false);end if;
  outcome:=input->>'outcome';if outcome not in ('sent','failed','uncertain','suppressed') then raise exception 'Ongeldige uitkomst' using errcode='23514';end if;
  select * into m from public.mail_deliveries where id=d.mail_id for update;
  if outcome='sent' and m.template in ('quote','quote_reminder') then
   perform public.commercial_quote_mail_finish(d.tenant_id,d.mail_id,input->>'provider_id',d.actor_id);
  elsif outcome='sent' and m.template='invoice' then
   update public.invoices set sent_at=coalesce(sent_at,now()),status=case when status='final' then 'sent'::public.invoice_status else status end
    where tenant_id=d.tenant_id and id=(m.render_snapshot->>'invoice_id')::uuid;
  end if;
  update private.notification_deferred_mail set state=outcome,lease_until=null,lease_id=null,available_at=now()+make_interval(secs=>least(3600,60*power(2,attempts)::integer)),updated_at=now() where notification_deferred_mail.mail_id=d.mail_id;
  update public.mail_deliveries set status=outcome::public.delivery_status,provider_message_id=input->>'provider_id',sent_at=case when outcome='sent' then now() else null end,locked_until=null,last_error=case outcome when 'sent' then null when 'suppressed' then 'Geblokkeerd door actuele notificatie-instellingen of bronrechten.' when 'uncertain' then 'Provideruitkomst onzeker; geen automatische dubbele verzending.' else 'Verzending geweigerd; begrensde herkansing gepland.' end where id=d.mail_id;
  return jsonb_build_object('ok',true);
 end if;
 raise exception 'Onbekende mailactie' using errcode='23514';
end$$;
revoke all on function public.notification_deferred_mail(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.notification_deferred_mail(text,uuid,uuid,jsonb) to service_role;

-- Called atomically by policy/preferences changes. Turning a channel back on
-- must not revive messages which were pending while it was disabled.
create or replace function private.notification_suppress_deferred_mail() returns integer
language plpgsql security definer set search_path='' as $$
declare d record;recipient_id uuid;p jsonb;n integer:=0;
begin
 for d in select dm.*,m.recipient from private.notification_deferred_mail dm join public.mail_deliveries m on m.id=dm.mail_id where dm.state in ('queued','failed','processing')
  and not exists(select 1 from private.notification_provider_permits p where p.delivery_key=m.idempotency_key and p.state in ('admitted','accepted','uncertain')) for update of dm loop
  select u.id into recipient_id from auth.users u where lower(u.email)=lower(d.recipient) and u.email_confirmed_at is not null and private.notification_actor_active(d.tenant_id,d.context,u.id) order by u.id limit 1;
  p:=private.notification_policy(d.tenant_id,d.type_code,d.context,'email',recipient_id);
  if not coalesce((p->>'allowed')::boolean,false) then
   update private.notification_deferred_mail set state='suppressed',updated_at=now() where mail_id=d.mail_id;
   update public.mail_deliveries set status='suppressed',locked_until=null,last_error='Geblokkeerd door gewijzigde notificatie-instellingen.' where id=d.mail_id;
   n:=n+1;
  end if;
 end loop;
 return n+private.notification_suppress_commercial_mail();
end$$;
revoke all on function private.notification_suppress_deferred_mail() from public,anon,authenticated,service_role;

-- Manual retries cannot race the worker owning an already deferred message.
do $$declare definition text;fn text;begin
 foreach fn in array array['public.commercial_mail_claim(uuid,uuid,text)','public.commercial_quote_mail_claim(uuid,uuid,uuid,boolean)'] loop
  definition:=pg_get_functiondef(fn::regprocedure);
  if position('private.notification_deferred_mail' in definition)=0 then execute replace(definition,'m.status not in (''queued'',''failed'')','(m.status not in (''queued'',''failed'') or exists(select 1 from private.notification_deferred_mail dm where dm.mail_id=m.id))');end if;
 end loop;
 definition:=pg_get_functiondef('public.claim_mail_delivery(uuid,text,text,text)'::regprocedure);
 if position('private.notification_deferred_mail' in definition)=0 then execute replace(definition,'target.status not in (''failed'',''queued'')','(target.status not in (''failed'',''queued'') or exists(select 1 from private.notification_deferred_mail dm where dm.mail_id=target.id))');end if;
end$$;

-- Section: notifications-delivery
-- Query-first central delivery/device adapter. Capture with the core migration.

-- This source resolver is read-only; use one statement timestamp consistently
-- instead of a volatile wall-clock expression during authorization checks.
do $$declare body text;begin
 select pg_get_functiondef('public.current_event_recipients(uuid)'::regprocedure) into body;
 execute replace(body,'clock_timestamp()','now()');
 alter function public.current_event_recipients(uuid) stable;
end$$;
create table if not exists private.notification_devices (
 id uuid primary key references public.push_subscriptions(id),user_id uuid not null references auth.users(id),origin text not null,
 endpoint_hash text not null,generation bigint not null,label text not null default 'Browser',last_seen_at timestamptz not null default now(),revoked_at timestamptz,
 unique(origin,endpoint_hash,generation)
);
create unique index if not exists notification_device_active_endpoint on private.notification_devices(origin,endpoint_hash) where revoked_at is null;
create table if not exists private.notification_device_bindings (
 id uuid primary key default gen_random_uuid(),device_id uuid not null references private.notification_devices(id),tenant_id uuid references public.tenants(id),
 user_id uuid not null references auth.users(id),context text not null check(context in ('platform','backoffice','staff','customer')),session_id uuid not null,
 created_at timestamptz not null default now(),revoked_at timestamptz,check((context='platform')=(tenant_id is null))
);
create unique index if not exists notification_device_binding_live on private.notification_device_bindings(device_id,coalesce(tenant_id,'00000000-0000-0000-0000-000000000000'::uuid),context) where revoked_at is null;
create table if not exists private.notification_deliveries (
 id uuid primary key default gen_random_uuid(),request_id uuid not null references private.notification_requests(id),tenant_id uuid references public.tenants(id),
 recipient_user_id uuid references auth.users(id),contact_id uuid,recipient_key text not null,context text not null,channel text not null check(channel in ('in_app','push','email')),
 device_id uuid references private.notification_devices(id),device_generation bigint,snapshot jsonb not null,
 state text not null default 'queued' check(state in ('queued','deferred','claimed','sending','sent','failed','uncertain','suppressed','cancelled','expired')),
 reason text,policy_revision bigint not null,revision bigint not null default 1,lease uuid,locked_until timestamptz,attempts integer not null default 0,
 available_at timestamptz not null default now(),expires_at timestamptz,created_at timestamptz not null default now(),last_attempt_at timestamptz,sent_at timestamptz,provider_id text,
 foreign key(tenant_id,contact_id) references public.customer_contacts(tenant_id,id)
);
create unique index if not exists notification_delivery_once on private.notification_deliveries(request_id,recipient_key,channel,coalesce(device_id,'00000000-0000-0000-0000-000000000000'::uuid),coalesce(device_generation,0));
create index if not exists notification_delivery_due on private.notification_deliveries(available_at,created_at) where state in ('queued','deferred','failed','claimed');
alter table private.notification_deliveries add column if not exists transport_snapshot jsonb;
create table if not exists private.notification_planning_events (
 event_id uuid primary key references public.outbox_events(id) on delete cascade,tenant_id uuid not null references public.tenants(id),
 work_order_id uuid not null,planning_day date not null,sequence bigint generated always as identity unique,created_at timestamptz not null default clock_timestamp()
);
create index if not exists notification_planning_bundle on private.notification_planning_events(tenant_id,work_order_id,planning_day,sequence desc);
create or replace function private.notification_capture_planning_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.event_type='work_order.rescheduled' and new.aggregate_type='work_order' then
  insert into private.notification_planning_events(event_id,tenant_id,work_order_id,planning_day) select new.id,new.tenant_id,w.id,coalesce((w.projected_start_at at time zone t.timezone)::date,current_date) from public.work_orders w join public.tenants t on t.id=w.tenant_id where w.id=new.aggregate_id and w.tenant_id=new.tenant_id on conflict do nothing;
 end if;return new;
end$$;
drop trigger if exists notification_capture_planning_event on public.outbox_events;
create trigger notification_capture_planning_event after insert on public.outbox_events for each row execute function private.notification_capture_planning_event();
insert into private.notification_planning_events(event_id,tenant_id,work_order_id,planning_day,created_at)
 select e.id,e.tenant_id,w.id,coalesce((w.projected_start_at at time zone t.timezone)::date,current_date),e.created_at from public.outbox_events e join public.work_orders w on w.id=e.aggregate_id and w.tenant_id=e.tenant_id join public.tenants t on t.id=w.tenant_id where e.event_type='work_order.rescheduled' and not exists(select 1 from private.notification_planning_events pe where pe.event_id=e.id) order by e.created_at,e.id on conflict do nothing;
create or replace function private.notification_planning_current(request uuid,recipient uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare r private.notification_requests;pe private.notification_planning_events;begin
 select * into r from private.notification_requests where id=request;
 if r.type_code<>'work_order.rescheduled' or r.source_kind<>'outbox' or private.notification_bundle_seconds(r.tenant_id,r.type_code,r.payload->>'context')=0 then return true;end if;
 select * into pe from private.notification_planning_events where event_id=r.source_id;if pe.event_id is null then return false;end if;
 return not exists(select 1 from private.notification_planning_events newer where newer.tenant_id=pe.tenant_id and newer.work_order_id=pe.work_order_id and newer.planning_day=pe.planning_day and newer.sequence>pe.sequence and exists(select 1 from public.current_event_recipients(newer.event_id)c where c.user_id=recipient));
end$$;

create or replace function private.notification_device_live(device uuid,generation bigint,t uuid,ctx text,actor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.notification_devices d join public.push_subscriptions s on s.id=d.id join private.notification_device_bindings b on b.device_id=d.id
 where d.id=device and d.generation=notification_device_live.generation and d.user_id=actor and d.revoked_at is null and s.revoked_at is null
 and b.user_id=actor and b.context=ctx and b.tenant_id is not distinct from case when ctx='platform' then null else t end and b.revoked_at is null
 and private.ticket_session_active(actor,b.session_id) and private.notification_actor_active(b.tenant_id,ctx,actor))
$$;
create or replace function public.notification_push_device(target_tenant uuid,actor_context text,actor_id uuid,session_id uuid,operation text,input jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
<<notification_push_device>>
declare d private.notification_devices;current_id uuid;ep text:=input->>'endpoint';origin text:=input->>'origin';eh text;gen bigint;contexts jsonb;items jsonb;unsubscribe_browser boolean:=false;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' or not private.ticket_session_active(actor_id,session_id) or not private.notification_actor_active(target_tenant,actor_context,actor_id) then raise exception 'Geen toegang' using errcode='42501';end if;
 if operation is null or operation not in ('status','subscribe','unsubscribe','revoke') or origin is null or origin !~ '^https?://[A-Za-z0-9.-]+(:[0-9]+)?$' or jsonb_typeof(input) is distinct from 'object' then raise exception 'Ongeldige apparaatopdracht' using errcode='23514';end if;
 -- HTTP resolves the tenant and origin. A platform binding is only available to
 -- explicit platform notification or support readers, never implicit membership.
 if operation='subscribe' and actor_context='platform' and not exists(select 1 from public.permission_grants g where g.user_id=actor_id and g.tenant_id is null and g.enabled and g.capability in ('platform.notifications.read','platform.notifications.send','platform.notifications.manage_global','platform.notifications.delivery.read','platform.support.read')) then raise exception 'Geen platformtoegang' using errcode='42501';end if;
 if ep is not null then
  if length(ep)>2048 or ep !~ '^https://(fcm.googleapis.com|updates.push.services.mozilla.com|web.push.apple.com|[a-z0-9-]+\.notify.windows.com)/[^[:space:]]+$' then raise exception 'Pushprovider niet toegestaan' using errcode='23514';end if;
  eh:=encode(extensions.digest(ep,'sha256'),'hex');perform pg_advisory_xact_lock(hashtextextended(origin||eh,0));
  select * into d from private.notification_devices where notification_devices.origin=notification_push_device.origin and endpoint_hash=eh and revoked_at is null for update;
  if d.user_id=actor_id then current_id:=d.id;end if;
 end if;
 if operation='subscribe' then
  if ep is null or coalesce(input#>>'{keys,p256dh}','') !~ '^[A-Za-z0-9_-]{87}=?$' or coalesce(input#>>'{keys,auth}','') !~ '^[A-Za-z0-9_-]{22}(==)?$' then raise exception 'Pushsleutels ontbreken' using errcode='23514';end if;
  if d.id is not null and (d.user_id<>actor_id or exists(select 1 from public.push_subscriptions s where s.id=d.id and (s.p256dh<>input#>>'{keys,p256dh}' or s.auth_secret<>input#>>'{keys,auth}')) or not exists(select 1 from private.notification_device_bindings b where b.device_id=d.id and b.revoked_at is null and private.ticket_session_active(actor_id,b.session_id)) or exists(select 1 from private.notification_device_bindings b where b.device_id=d.id and b.context=actor_context and b.revoked_at is null and b.session_id<>notification_push_device.session_id)) then
   update private.notification_devices set revoked_at=now() where id=d.id;update private.notification_device_bindings set revoked_at=now() where device_id=d.id and revoked_at is null;update public.push_subscriptions set revoked_at=now() where id=d.id;current_id:=null;
  end if;
  if current_id is null then
   if (select count(*) from private.notification_devices where user_id=actor_id and revoked_at is null)>=20 then raise exception 'Apparaatlimiet bereikt' using errcode='23514';end if;
   select coalesce(max(generation),0)+1 into gen from private.notification_devices where notification_devices.origin=notification_push_device.origin and endpoint_hash=eh;
   -- Legacy unique keys require reusing the subscription row; generations remain
   -- immutable in the central device ID so old queued sends cannot revive.
   update public.push_subscriptions set endpoint=endpoint||'#retired-'||id where user_id=actor_id and tenant_id is not distinct from target_tenant and endpoint=ep;
   current_id:=gen_random_uuid();insert into public.push_subscriptions(id,tenant_id,user_id,endpoint,p256dh,auth_secret) values(current_id,target_tenant,actor_id,ep,input#>>'{keys,p256dh}',input#>>'{keys,auth}');
   insert into private.notification_devices(id,user_id,origin,endpoint_hash,generation,label) values(current_id,actor_id,origin,eh,gen,left(coalesce(nullif(input->>'label',''),'Browser'),80));
  end if;
  update private.notification_device_bindings set revoked_at=now() where device_id=current_id and context=actor_context and tenant_id is not distinct from target_tenant and revoked_at is null;
  insert into private.notification_device_bindings(device_id,tenant_id,user_id,context,session_id) values(current_id,target_tenant,actor_id,actor_context,session_id);
  update private.notification_devices set last_seen_at=now() where id=current_id;
 elsif operation='unsubscribe' then
  update private.notification_device_bindings set revoked_at=now() where device_id=current_id and user_id=actor_id and context=actor_context and tenant_id is not distinct from target_tenant and revoked_at is null;
 elsif operation='revoke' then
  if not exists(select 1 from private.notification_devices where id=(input->>'device_id')::uuid and user_id=actor_id and notification_devices.origin=notification_push_device.origin) then raise exception 'Onbekend apparaat' using errcode='42501';end if;
  update private.notification_devices set revoked_at=now() where id=(input->>'device_id')::uuid;
  update private.notification_device_bindings set revoked_at=now() where device_id=(input->>'device_id')::uuid;
  update public.push_subscriptions set revoked_at=now() where id=(input->>'device_id')::uuid;
 end if;
 select coalesce(jsonb_agg(distinct b.context),'[]') into contexts from private.notification_device_bindings b join private.notification_devices x on x.id=b.device_id where b.device_id=current_id and b.user_id=actor_id and b.revoked_at is null and x.revoked_at is null and private.ticket_session_active(actor_id,b.session_id) and private.notification_actor_active(b.tenant_id,b.context,actor_id);
 unsubscribe_browser:=current_id is not null and jsonb_array_length(contexts)=0;
 if unsubscribe_browser and operation in ('unsubscribe','revoke') then update private.notification_devices set revoked_at=now() where id=current_id;update public.push_subscriptions set revoked_at=now() where id=current_id;end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'label',x.label,'isCurrent',x.id=current_id,'contexts',coalesce(y.ctxs,'[]'::jsonb),'active',x.revoked_at is null and coalesce(jsonb_array_length(y.ctxs),0)>0,'lastSeenAt',x.last_seen_at,'canRevoke',x.revoked_at is null) order by x.last_seen_at desc),'[]') into items from private.notification_devices x left join lateral(select jsonb_agg(distinct b.context) ctxs from private.notification_device_bindings b where b.device_id=x.id and b.revoked_at is null and private.ticket_session_active(actor_id,b.session_id) and private.notification_actor_active(b.tenant_id,b.context,actor_id))y on true where x.user_id=actor_id and x.origin=notification_push_device.origin;
 return jsonb_build_object('active',contexts ? actor_context,'currentDeviceId',current_id,'contexts',contexts,'devices',items,'unsubscribeBrowser',unsubscribe_browser);
end$$;
create or replace function public.notification_device_logout(actor_id uuid,session_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.jwt()->>'role' is distinct from 'service_role' or not private.ticket_session_active(actor_id,session_id) then raise exception 'Geen toegang' using errcode='42501';end if;
 update private.notification_device_bindings set revoked_at=now() where user_id=actor_id and notification_device_bindings.session_id=notification_device_logout.session_id and revoked_at is null;
end$$;

do $install$begin
 if to_regprocedure('private.notification_commercial_source_allowed(uuid,text,uuid,text,uuid,text)') is null then execute $f$create function private.notification_commercial_source_allowed(t uuid,code text,source uuid,revision text,recipient uuid,ctx text) returns boolean language sql stable security definer set search_path='' as $b$select false$b$$f$;end if;
end$install$;
create or replace function private.notification_operational_source_allowed(t uuid,code text,kind text,source uuid,revision text,recipient uuid,ctx text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare e public.outbox_events;d public.personnel_dossier_deliveries;valid boolean;
begin
 if kind='commercial' then return private.notification_commercial_source_allowed(t,code,source,revision,recipient,ctx);end if;
 if kind='payment' then return private.notification_payment_source_allowed(t,code,source,revision,recipient,ctx);end if;
 if kind='ticket' then return code='ticket.changed' and exists(select 1 from public.ticket_events te where te.id=source and (te.tenant_id=t or(t is null and ctx='platform')) and te.actor_user_id is distinct from recipient and private.ticket_event_allowed(te.id,case when ctx='backoffice' then case when exists(select 1 from public.tickets ti where ti.id=te.ticket_id and ti.route='platform_support') then 'support' else 'tenant' end else ctx end,recipient));end if;
 if kind='outbox' then
  select * into e from public.outbox_events where id=source and tenant_id=t;
  if e.id is null or not exists(select 1 from public.current_event_recipients(source) c where c.user_id=recipient) then return false;end if;
  if e.event_type='announcement.published' then return code='announcement.published' and ctx='staff' and exists(select 1 from public.announcements a join public.tenant_memberships m on m.tenant_id=a.tenant_id and m.user_id=recipient and m.status='active' where a.id=e.aggregate_id and a.tenant_id=t and a.published_at is not null and a.published_at<=now() and a.withdrawn_at is null and m.roles&&a.audience_roles);end if;
  return (e.event_type=code and code in ('work_order.dispatched','work_order.rescheduled','work_order.reviewed') and ctx='staff') or(e.event_type='work_order.report_submitted' and e.payload->>'state'='waiting_signature' and code='work_order.signature_required' and ctx='staff') or(e.event_type='work_order.exception' and code='work_order.exception' and ctx='backoffice');
 end if;
 if kind='dossier' then
  select * into d from public.personnel_dossier_deliveries where id=source and tenant_id=t;
  if d.id is null or code<>(case when d.source_table='certificates' then 'personnel.qualification' else 'personnel.deadline' end) or ctx<>'backoffice' or d.source_revision::text<>revision or d.status='cancelled' or d.source_table not in ('personnel_contracts','certificates','personnel_notes','personnel_dossier_items') then return false;end if;
  if recipient is null or not exists(select 1 from public.tenant_memberships m join auth.users u on u.id=m.user_id where m.user_id=recipient and m.tenant_id=t and m.status='active' and m.roles&&array['tenant_admin','management','hr']::public.app_role[] and (d.recipient_user_id=recipient or lower(u.email)=lower(d.recipient))) then return false;end if;
  execute format('select exists(select 1 from public.%I where id=$1 and tenant_id=$2 and personnel_id=$3 and dossier_revision=$4 and dossier_status not in (''completed'',''ended'',''returned'',''recovered'',''draft'',''archived'',''revoked'',''rejected''))',d.source_table) into valid using d.source_id,t,d.personnel_id,d.source_revision;return valid;
 end if;
 return false;
end$$;

create or replace function private.notification_delivery_live(d private.notification_deliveries) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.notification_requests r where r.id=d.request_id and private.notification_source_allowed(r.tenant_id,r.type_code,r.source_kind,r.source_id,r.source_revision,d.recipient_user_id,d.context))
 and private.notification_planning_current(d.request_id,d.recipient_user_id)
 and (d.expires_at is null or d.expires_at>now())
 and (d.recipient_user_id is null or private.notification_actor_active(case when d.context='platform' then null else d.tenant_id end,d.context,d.recipient_user_id))
 and (d.channel<>'email' or case when d.recipient_user_id is not null then exists(select 1 from auth.users u where u.id=d.recipient_user_id and lower(u.email)=lower(d.snapshot->>'recipient') and u.deleted_at is null) else exists(select 1 from public.customer_contacts c join public.tenants t on t.id=c.tenant_id where c.id=d.contact_id and c.tenant_id=d.tenant_id and c.active and (c.active_from is null or c.active_from<=(now() at time zone t.timezone)::date) and (c.active_until is null or c.active_until>=(now() at time zone t.timezone)::date) and lower(c.email)=lower(d.snapshot->>'recipient')) end)
 and (d.channel<>'push' or private.notification_device_live(d.device_id,d.device_generation,d.tenant_id,d.context,d.recipient_user_id))
$$;
create or replace function private.notification_text(template text,vars jsonb) returns text language plpgsql immutable set search_path='' as $$
declare pair record;result text:=coalesce(template,'');begin for pair in select key,value from jsonb_each_text(coalesce(vars,'{}')) loop result:=replace(result,'{{'||pair.key||'}}',pair.value);result:=replace(result,'{'||pair.key||'}',pair.value);end loop;return result;end$$;
create or replace function public.notification_delivery_prepare(request_id uuid) returns integer language plpgsql security definer set search_path='' as $$
declare r private.notification_requests;u uuid;c uuid;ctx text;ch text;recipient text;label text;tmpl jsonb;snapshot jsonb;decision jsonb;dev record;n integer:=0;inserted integer;vars jsonb;path text;campaign private.notification_campaigns;bundle integer;pe private.notification_planning_events;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 select * into r from private.notification_requests where id=request_id for update;if not found or r.prepared_at is not null then return 0;end if;
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
  snapshot:=jsonb_build_object('title',coalesce(campaign.title,private.notification_text(tmpl->>'title',vars)),'body',coalesce(campaign.body,private.notification_text(tmpl->>'body',vars)),'actionLabel',coalesce(campaign.action_label,tmpl->>'cta_label','Bekijken'),'path',path,'recipient',recipient,'recipientLabel',label,'templateVersion',coalesce((tmpl->>'revision')::bigint,1),'templateVersionId',tmpl->>'version_id','brand',tmpl->'branding','priority',coalesce(campaign.priority,'normal'),'ackRequired',coalesce(campaign.ack_required,false),'campaignId',campaign.id,'slug',(select slug from public.tenants where id=r.tenant_id),'ttlSeconds',least(2419200,(select ttl_minutes*60 from public.notification_catalog where code=r.type_code)));
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
end$$;

create or replace function private.notification_suppress_pending() returns integer language plpgsql security definer set search_path='' as $$
declare n integer;begin
 update private.notification_deliveries d set state='suppressed',reason='policy_disabled',lease=null,locked_until=null,revision=d.revision+1 from private.notification_requests r
 where r.id=d.request_id and(d.state in ('queued','deferred','claimed','failed') or(d.state='sending' and not exists(select 1 from private.notification_provider_permits p where p.source_kind='delivery' and p.source_id=d.id and p.state in ('admitted','accepted','uncertain')))) and not coalesce((private.notification_policy(d.tenant_id,r.type_code,d.context,d.channel,d.recipient_user_id)->>'allowed')::boolean,false);
 get diagnostics n=row_count;
 update private.ticket_deliveries d set status='cancelled',error_code='policy_suppressed',lease=null,locked_until=null where(status in ('queued','claimed','failed') or(status='sending' and not exists(select 1 from private.notification_provider_permits p where p.source_kind='ticket' and p.source_id=d.id and p.state in ('admitted','accepted','uncertain')))) and not coalesce((private.notification_policy(d.tenant_id,'ticket.changed',case when d.context in ('tenant','support') then 'backoffice' else d.context end,d.channel,d.recipient_id)->>'allowed')::boolean,false);
 return n;
end$$;
create or replace function public.notification_delivery_claim(batch_size integer default 25,target_tenant uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 update private.notification_deliveries set state='uncertain',reason='interrupted_send',lease=null,locked_until=null,revision=revision+1 where (target_tenant is null or tenant_id=target_tenant) and state='sending' and locked_until<now();
 update private.notification_deliveries set state='expired',reason='expired',lease=null,locked_until=null,revision=revision+1 where (target_tenant is null or tenant_id=target_tenant) and state in ('queued','deferred','claimed','failed') and expires_at<=now();
 with selected as(select id from private.notification_deliveries where (target_tenant is null or tenant_id=target_tenant) and available_at<=now() and attempts<8 and(state in ('queued','deferred','failed') or(state='claimed' and locked_until<now())) order by available_at,created_at for update skip locked limit least(greatest(batch_size,1),100)),updated as(update private.notification_deliveries d set state='claimed',lease=gen_random_uuid(),locked_until=now()+interval '10 minutes',attempts=attempts+1,last_attempt_at=now(),revision=revision+1 from selected s where d.id=s.id returning d.id,d.lease) select coalesce(jsonb_agg(to_jsonb(updated)),'[]') into result from updated;return result;
end$$;
create or replace function public.notification_delivery_begin(delivery_id uuid,lease_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d private.notification_deliveries;r private.notification_requests;p jsonb;s public.push_subscriptions;begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-notification-policy',0));
 select * into d from private.notification_deliveries where id=delivery_id and lease=lease_id and state='claimed' and locked_until>now() for update;if not found then return null;end if;
 select * into r from private.notification_requests where id=d.request_id;p:=private.notification_policy(d.tenant_id,r.type_code,d.context,d.channel,d.recipient_user_id);
 if r.source_kind='campaign' and exists(select 1 from private.notification_campaigns c join private.notification_campaign_recipients cr on cr.campaign_id=c.id where cr.id=r.source_id and c.state='paused') then update private.notification_deliveries set state='deferred',reason='campaign_paused',available_at=now()+interval '1 minute',lease=null,locked_until=null,attempts=greatest(0,attempts-1),revision=revision+1 where id=d.id;return null;end if;
 if not coalesce((p->>'allowed')::boolean,false) or not private.notification_delivery_live(d) then update private.notification_deliveries set state=case when coalesce((p->>'allowed')::boolean,false) then 'cancelled' else 'suppressed' end,reason=case when coalesce((p->>'allowed')::boolean,false) then 'source_unavailable' else p->>'reason' end,lease=null,locked_until=null,revision=revision+1 where id=d.id;return null;end if;
 if p->>'quiet_until' is not null then update private.notification_deliveries set state='deferred',reason='quiet_hours',available_at=(p->>'quiet_until')::timestamptz,lease=null,locked_until=null,revision=revision+1 where id=d.id;return null;end if;
 if d.channel='in_app' then
  insert into public.notifications(id,tenant_id,user_id,channel,title,body,target_path,status,sent_at,context,type_code,source_kind,source_id,source_revision,delivery_id,campaign_id,sender_name,priority,action_label,ack_required)
  values(d.id,case when d.context='platform' then null else d.tenant_id end,d.recipient_user_id,'in_app',d.snapshot->>'title',d.snapshot->>'body',d.snapshot->>'path','sent',now(),d.context,r.type_code,r.source_kind,r.source_id,r.source_revision,d.id,nullif(d.snapshot->>'campaignId','')::uuid,coalesce(d.snapshot#>>'{brand,company}','Fieldgrid'),d.snapshot->>'priority',d.snapshot->>'actionLabel',coalesce((d.snapshot->>'ackRequired')::boolean,false)) on conflict do nothing;
  update private.notification_deliveries set state='sent',sent_at=now(),lease=null,locked_until=null,revision=revision+1 where id=d.id;return null;
 end if;
 if d.channel='push' then select * into s from public.push_subscriptions where id=d.device_id;end if;
 update private.notification_deliveries set state='sending',locked_until=now()+interval '2 minutes',policy_revision=(p->>'policy_revision')::bigint,revision=revision+1 where id=d.id;
 return jsonb_build_object('id',d.id,'tenantId',d.tenant_id,'type',r.type_code,'context',d.context,'recipientUserId',d.recipient_user_id,'channel',d.channel,'snapshot',d.snapshot,'transport',d.transport_snapshot,'ttl_seconds',greatest(0,floor(least(2419200,coalesce((d.snapshot->>'ttlSeconds')::integer,(select ttl_minutes*60 from public.notification_catalog where code=r.type_code)),coalesce(extract(epoch from d.expires_at-clock_timestamp()),2419200)))),'subscription',case when s.id is null then null else jsonb_build_object('endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth_secret)) end);
end$$;
create or replace function public.notification_delivery_freeze(delivery_id uuid,lease_id uuid,input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare frozen jsonb;begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 if jsonb_typeof(input) is distinct from 'object' or octet_length(input::text)>100000 then raise exception 'Ongeldige transportversie' using errcode='23514';end if;
 update private.notification_deliveries set transport_snapshot=coalesce(transport_snapshot,input) where id=delivery_id and lease=lease_id and state='sending' and locked_until>now() returning transport_snapshot into frozen;
 if frozen is null then raise exception 'Afleverclaim verlopen' using errcode='40001';end if;return frozen;
end$$;
create or replace function public.notification_delivery_defer(delivery_id uuid,lease_id uuid,retry_at timestamptz) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 update private.notification_deliveries set state='deferred',reason='quiet_hours',available_at=greatest(retry_at,now()+interval '1 minute'),lease=null,locked_until=null,attempts=greatest(0,attempts-1),revision=revision+1 where id=delivery_id and lease=lease_id and state='sending';return found;
end$$;
-- Preserve historical queue IDs. New fanout bypasses this adapter entirely.
alter table private.ticket_deliveries add column if not exists notification_snapshot jsonb;
do $$begin
 if to_regprocedure('private.notification_ticket_begin_legacy(uuid,uuid)') is null then alter function public.ticket_delivery_begin(uuid,uuid) rename to notification_ticket_begin_legacy;alter function public.notification_ticket_begin_legacy(uuid,uuid) set schema private;end if;
end$$;
revoke all on function private.notification_ticket_begin_legacy(uuid,uuid) from public,anon,authenticated,service_role;
create or replace function public.ticket_delivery_begin(delivery_id uuid,lease_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d private.ticket_deliveries;p jsonb;result jsonb;ctx text;begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 select * into d from private.ticket_deliveries where id=delivery_id and lease=lease_id and status='claimed' and locked_until>now() for update;if not found then return null;end if;
 ctx:=case when d.context in ('tenant','support') then 'backoffice' else d.context end;p:=private.notification_policy(d.tenant_id,'ticket.changed',ctx,d.channel,d.recipient_id);
 if not coalesce((p->>'allowed')::boolean,false) then update private.ticket_deliveries set status='cancelled',error_code='policy_suppressed',lease=null,locked_until=null where id=d.id;return null;end if;
 if p->>'quiet_until' is not null then update private.ticket_deliveries set status='queued',available_at=(p->>'quiet_until')::timestamptz,lease=null,locked_until=null,attempts=greatest(0,attempts-1) where id=d.id;return null;end if;
 result:=private.notification_ticket_begin_legacy(delivery_id,lease_id);if result is null then
  if d.channel='in_app' then update public.notifications set tenant_id=case when ctx='platform' then null else d.tenant_id end,context=ctx,type_code='ticket.changed',source_kind='ticket',source_id=d.event_id,source_revision=d.event_id::text where id=d.id;end if;return null;
 end if;
 result:=result||jsonb_build_object('recipientUserId',d.recipient_id);
 if d.notification_snapshot is not null then result:=result||d.notification_snapshot;else update private.ticket_deliveries set notification_snapshot=jsonb_build_object('brand',result->'brand','route',result->'route','path',result->'path','slug',result->'slug','recipient',result->'recipient') where id=d.id;end if;
 return result;
end$$;
create or replace function public.ticket_delivery_defer(delivery_id uuid,lease_id uuid,retry_at timestamptz) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 update private.ticket_deliveries set status='queued',available_at=greatest(retry_at,now()+interval '1 minute'),lease=null,locked_until=null,attempts=greatest(0,attempts-1) where id=delivery_id and lease=lease_id and status='sending';return found;
end$$;
create or replace function public.notification_delivery_finish(delivery_id uuid,lease_id uuid,outcome text,provider_id text default null) returns boolean language plpgsql security definer set search_path='' as $$
declare d private.notification_deliveries;begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 if outcome is null or outcome not in ('sent','failed','uncertain','cancelled','suppressed') then raise exception 'Ongeldige uitkomst' using errcode='23514';end if;
 select * into d from private.notification_deliveries where id=delivery_id and lease=lease_id and state in ('claimed','sending') for update;if not found then return false;end if;
 update private.notification_deliveries set state=outcome,provider_id=notification_delivery_finish.provider_id,sent_at=case when outcome='sent' then now() else null end,reason=case when outcome='sent' then null else 'delivery_'||outcome end,available_at=now()+make_interval(secs=>least(3600,30*power(2,least(attempts,6))::integer)),lease=null,locked_until=null,revision=revision+1 where id=d.id;
 if d.channel='push' and outcome='cancelled' then update private.notification_devices set revoked_at=now() where id=d.device_id and generation=d.device_generation;update public.push_subscriptions set revoked_at=now() where id=d.device_id;end if;
 return true;
end$$;

create or replace function private.notification_delivery_source_allowed(source_kind text,source_id uuid,target_tenant uuid,type_code text,context text,recipient_user_id uuid,recipient text) returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if source_kind='delivery' then return exists(select 1 from private.notification_deliveries d join private.notification_requests r on r.id=d.request_id where d.id=notification_delivery_source_allowed.source_id and d.tenant_id is not distinct from target_tenant and r.type_code=notification_delivery_source_allowed.type_code and d.context=notification_delivery_source_allowed.context and d.recipient_user_id is not distinct from notification_delivery_source_allowed.recipient_user_id and d.state='sending' and d.lease is not null and d.locked_until>now() and (d.channel<>'email' or d.snapshot->>'recipient'=notification_delivery_source_allowed.recipient) and private.notification_delivery_live(d));end if;
 -- Historical queues are allowed only through their existing live source guard.
 if source_kind='ticket' then return type_code='ticket.changed' and exists(select 1 from private.ticket_deliveries d join auth.users u on u.id=d.recipient_id where d.id=notification_delivery_source_allowed.source_id and d.tenant_id=target_tenant and d.recipient_id=notification_delivery_source_allowed.recipient_user_id and case when d.context in ('tenant','support') then 'backoffice' else d.context end=notification_delivery_source_allowed.context and d.status='sending' and d.lease is not null and d.locked_until>now() and(d.channel<>'email' or u.email=notification_delivery_source_allowed.recipient) and private.ticket_delivery_allowed(d) and(d.channel<>'push' or exists(select 1 from private.notification_devices dev where dev.id=d.subscription_id and private.notification_device_live(dev.id,dev.generation,d.tenant_id,notification_delivery_source_allowed.context,d.recipient_id))));end if;
 return false;
end$$;

-- Existing choices become type-specific central preferences. Tenant/support
-- share the backoffice context; conservatively preserve either old opt-out.
-- DO NOTHING makes migration retries unable to overwrite a later central ON.
create or replace function private.notification_import_ticket_preferences(target_user uuid default null) returns integer language plpgsql security definer set search_path='' as $$
declare n integer;begin
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-notification-policy',0));
 insert into private.notification_preferences(tenant_id,user_id,context,type_code,in_app,push,email)
 select tenant_id,user_id,case when context in ('tenant','support') then 'backoffice' else context end,'ticket.changed',bool_and(in_app),bool_and(push),bool_and(email)
 from public.ticket_notification_preferences where target_user is null or user_id=target_user
 group by tenant_id,user_id,case when context in ('tenant','support') then 'backoffice' else context end
 on conflict do nothing;
 get diagnostics n=row_count;return n;
end$$;
select private.notification_import_ticket_preferences();
revoke all on function private.notification_import_ticket_preferences(uuid) from public,anon,authenticated,service_role;
-- Retain old records as migration evidence, not a second writable preference store.
revoke insert,update,delete on public.ticket_notification_preferences from service_role;

create or replace function private.ticket_preferences_save(t uuid,ctx text,actor uuid,input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=case when ctx='platform' then null else t end;central_context text:=case when ctx in ('tenant','support') then 'backoffice' else ctx end;p private.notification_preferences;master_revision bigint;
begin
 if not private.ticket_actor_active(tenant,ctx,actor) then raise exception 'Geen toegang' using errcode='42501';end if;
 if jsonb_typeof(input) is distinct from 'object' or exists(select 1 from jsonb_object_keys(input) k where k not in ('email','push')) or(input?'email' and jsonb_typeof(input->'email') is distinct from 'boolean') or(input?'push' and jsonb_typeof(input->'push') is distinct from 'boolean') then raise exception 'Ongeldige voorkeuren' using errcode='23514';end if;
 if input?'email' or input?'push' then
  perform pg_advisory_xact_lock(hashtextextended('fieldgrid-notification-policy',0));
  perform pg_advisory_xact_lock(hashtextextended('notification-preference:'||actor||':'||coalesce(tenant::text,'')||':'||central_context,0));
  insert into private.notification_preferences(tenant_id,user_id,context,type_code,revision) values(tenant,actor,central_context,null,0) on conflict do nothing;
  update private.notification_preferences set revision=revision+1,updated_at=clock_timestamp() where tenant_id is not distinct from tenant and user_id=actor and context=central_context and type_code is null returning revision into master_revision;
  insert into private.notification_preferences(tenant_id,user_id,context,type_code,push,email) values(tenant,actor,central_context,'ticket.changed',coalesce((input->>'push')::boolean,true),coalesce((input->>'email')::boolean,true)) on conflict do nothing;
  update private.notification_preferences set push=coalesce((input->>'push')::boolean,push),email=coalesce((input->>'email')::boolean,email),revision=revision+1,updated_at=clock_timestamp() where tenant_id is not distinct from tenant and user_id=actor and context=central_context and type_code='ticket.changed';
  update private.notification_requests nr set payload=jsonb_set(nr.payload,'{suppressed_routes}',coalesce(nr.payload->'suppressed_routes','[]'::jsonb)||(select coalesce(jsonb_agg(central_context||':'||ch),'[]'::jsonb) from unnest(array['push','email'])ch where not coalesce((private.notification_policy(nr.tenant_id,nr.type_code,central_context,ch,actor)->>'allowed')::boolean,false))) where nr.prepared_at is null and nr.tenant_id is not distinct from tenant and nr.payload->>'context'=central_context and nr.payload->>'recipient_user_id'=actor::text;
  perform private.notification_suppress_pending();perform private.notification_suppress_deferred_mail();
  insert into private.notification_audit(tenant_id,actor_id,action,revision,detail) values(tenant,actor,'ticket_preferences',master_revision,jsonb_build_object('context',central_context));
 end if;
 select * into p from private.notification_preferences where tenant_id is not distinct from tenant and user_id=actor and context=central_context and type_code='ticket.changed';
 return jsonb_build_object('inApp',coalesce(p.in_app,true),'push',coalesce(p.push,true),'email',coalesce(p.email,true));
end$$;
revoke all on function private.ticket_preferences_save(uuid,text,uuid,jsonb) from public,anon,authenticated,service_role;
create or replace function private.ticket_delivery_allowed(d private.ticket_deliveries) returns boolean language sql stable security definer set search_path='' as $$
 select private.ticket_actor_active(d.tenant_id,d.context,d.recipient_id) and private.ticket_event_allowed(d.event_id,d.context,d.recipient_id)
 and coalesce((private.notification_policy(d.tenant_id,'ticket.changed',case when d.context in ('tenant','support') then 'backoffice' else d.context end,d.channel,d.recipient_id)->>'allowed')::boolean,false)
 and(d.channel<>'push' or exists(select 1 from public.push_subscriptions s where s.id=d.subscription_id and s.tenant_id is not distinct from case when d.context='platform' then null else d.tenant_id end and s.user_id=d.recipient_id and s.revoked_at is null))
$$;
-- Historical worker compatibility: enqueue channels, then let the central
-- begin/provider policy record their actual disposition. Never consult old rows.
do $bridge$declare definition text;old_read text:='select * into p from public.ticket_notification_preferences where tenant_id is not distinct from case when c.context=''platform'' then null else e.tenant_id end and user_id=c.user_id and context=c.context;';begin
 definition:=pg_get_functiondef('public.ticket_outbox_prepare(uuid)'::regprocedure);
 if position(old_read in definition)>0 then execute replace(definition,old_read,'p.in_app:=true;p.email:=true;p.push:=true;');
 elsif position('p.in_app:=true;p.email:=true;p.push:=true;' in definition)=0 then raise exception 'Historische ticketfan-out wijkt af; controleer de migratieketen';end if;
end$bridge$;

create table if not exists private.notification_captured_outbox(event_id uuid primary key references public.outbox_events(id) on delete cascade,tenant_id uuid not null references public.tenants(id),created_at timestamptz not null default clock_timestamp());
alter table private.notification_captured_outbox enable row level security;
alter table private.notification_captured_outbox force row level security;
revoke all on private.notification_captured_outbox from public,anon,authenticated,service_role;
create or replace function private.notification_capture_outbox(target_event uuid,prepare boolean default false) returns integer language plpgsql security definer set search_path='' as $$
declare e public.outbox_events;te public.ticket_events;ti public.tickets;c record;request_id uuid;code text;ctx text;path text;channels jsonb;vars jsonb;w public.work_orders;o public.objects;org public.tenants;n integer:=0;
begin
 select * into e from public.outbox_events where id=target_event for update;if not found then raise exception 'Event ontbreekt' using errcode='23514';end if;
 if exists(select 1 from private.notification_captured_outbox where event_id=e.id) then
  -- A capture with zero authorized recipients is still complete. Grant/module
  -- changes must not add new recipients to an old event on a later worker run.
  if prepare then
   for request_id in select r.id from private.notification_requests r where r.tenant_id=e.tenant_id and((r.source_kind='outbox' and r.source_id=e.id) or(r.source_kind='ticket' and e.event_type='ticket.changed' and r.source_id=(e.payload->>'event_id')::uuid)) loop n:=n+public.notification_delivery_prepare(request_id);end loop;
   update public.outbox_events set status='sent',processed_at=now(),locked_until=null,last_error=null where id=e.id;
  end if;
  return n;
 end if;
 if e.event_type='notification.requested' then if prepare then n:=public.notification_delivery_prepare((e.payload->>'request_id')::uuid);end if;
 elsif e.event_type='ticket.changed' then
  select * into te from public.ticket_events where id=(e.payload->>'event_id')::uuid and tenant_id=e.tenant_id;
  select * into ti from public.tickets where id=te.ticket_id and tenant_id=e.tenant_id;
  for c in select distinct on(x.user_id) x.user_id,x.context from private.ticket_notification_candidates(te.ticket_id,te.audience)x where x.user_id is distinct from te.actor_user_id and private.ticket_event_allowed(te.id,x.context,x.user_id) order by x.user_id,case x.context when 'staff' then 0 when 'support' then 1 when 'tenant' then 2 else 3 end loop
   ctx:=case when c.context in ('tenant','support') then 'backoffice' else c.context end;
   path:=case c.context when 'staff' then '/staff/meldingen/' when 'tenant' then '/app/meldingen/' when 'support' then '/app/support/' else '/platform/support/' end||ti.id;
   channels:='["in_app","push","email"]'::jsonb;
   request_id:=private.notification_enqueue(e.tenant_id,'ticket.changed','ticket',te.id,te.id::text,'ticket-central:'||te.id||':'||c.user_id,jsonb_build_object('recipient_user_id',c.user_id,'context',ctx,'channels',channels,'path',path,'platform_brand',ti.route='platform_support'));
   if prepare then n:=n+public.notification_delivery_prepare(request_id);else n:=n+1;end if;
  end loop;
 else
  code:=case when e.event_type='work_order.report_submitted' and e.payload->>'state'='waiting_signature' then 'work_order.signature_required' when e.event_type='work_order.reviewed' and e.payload->>'decision'='returned' then 'work_order.reviewed' when e.event_type in ('work_order.dispatched','work_order.rescheduled','work_order.exception','announcement.published') then e.event_type else null end;
  if code is not null then
   ctx:=case when code='work_order.exception' then 'backoffice' else 'staff' end;
   path:=case when code='work_order.exception' then '/app/werkbonnen/'||e.aggregate_id when code='announcement.published' then '/staff?tab=nieuws' else '/staff?workOrder='||e.aggregate_id end;
   select * into org from public.tenants where id=e.tenant_id;
   if e.aggregate_type='work_order' then select * into w from public.work_orders where id=e.aggregate_id and tenant_id=e.tenant_id;select * into o from public.objects where id=w.object_id and tenant_id=e.tenant_id;end if;
   vars:=jsonb_build_object('bedrijfsnaam',org.name,'bonnummer',coalesce(w.work_order_number,''),'datum',coalesce(to_char(w.projected_start_at at time zone org.timezone,'DD-MM-YYYY HH24:MI'),'Nog niet ingepland'),'locatie',coalesce(o.name,''));
   channels:=case when code='announcement.published' and not coalesce((e.payload->>'send_push')::boolean,false) then '["in_app"]'::jsonb else '["in_app","push","email"]'::jsonb end;
   for c in select user_id from public.current_event_recipients(e.id) loop
    request_id:=private.notification_enqueue(e.tenant_id,code,'outbox',e.id,e.id::text,'outbox-central:'||e.id||':'||c.user_id,jsonb_build_object('recipient_user_id',c.user_id,'context',ctx,'channels',channels,'path',path,'variables',vars));if prepare then n:=n+public.notification_delivery_prepare(request_id);else n:=n+1;end if;
   end loop;
  end if;
 end if;
 if e.event_type in ('ticket.changed','work_order.dispatched','work_order.rescheduled','work_order.reviewed','work_order.report_submitted','work_order.exception','announcement.published') then insert into private.notification_captured_outbox(event_id,tenant_id) values(e.id,e.tenant_id) on conflict do nothing;end if;
 if prepare then update public.outbox_events set status='sent',processed_at=now(),locked_until=null,last_error=null where id=e.id;end if;return n;
end$$;
create or replace function public.notification_outbox_prepare(target_event uuid) returns integer language plpgsql security definer set search_path='' as $$
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 return private.notification_capture_outbox(target_event,true);
end$$;
create or replace function private.notification_outbox_created() returns trigger language plpgsql security definer set search_path='' as $$
begin
 -- No recursive capture of notification.requested, commercial or domain events.
 if new.event_type in ('ticket.changed','work_order.dispatched','work_order.rescheduled','work_order.reviewed','work_order.report_submitted','work_order.exception','announcement.published') then perform private.notification_capture_outbox(new.id,false);end if;
 return new;
end$$;
drop trigger if exists zz_notification_outbox_created on public.outbox_events;
create trigger zz_notification_outbox_created after insert on public.outbox_events for each row execute function private.notification_outbox_created();

create table if not exists private.notification_captured_dossier(job_id uuid primary key references public.personnel_dossier_deliveries(id) on delete cascade,tenant_id uuid not null references public.tenants(id),request_id uuid references private.notification_requests(id) on delete set null,reason text not null check(reason in ('captured','no_recipient','legacy_processing')),created_at timestamptz not null default clock_timestamp());
alter table private.notification_captured_dossier enable row level security;
alter table private.notification_captured_dossier force row level security;
revoke all on private.notification_captured_dossier from public,anon,authenticated,service_role;
create or replace function private.notification_capture_dossier(target_job uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare d public.personnel_dossier_deliveries;u uuid;r uuid;
begin
 select * into d from public.personnel_dossier_deliveries where id=target_job for update;if not found then return null;end if;
 select request_id into r from private.notification_captured_dossier where job_id=d.id;if found then return r;end if;
 select id into r from private.notification_requests where source_kind='dossier' and source_id=d.id;
 if r is not null then insert into private.notification_captured_dossier(job_id,tenant_id,request_id,reason) values(d.id,d.tenant_id,r,'captured');return r;end if;
 if d.status not in ('scheduled','failed','processing') then return null;end if;
 if d.status='processing' then insert into private.notification_captured_dossier(job_id,tenant_id,reason) values(d.id,d.tenant_id,'legacy_processing');return null;end if;
 u:=d.recipient_user_id;if u is null then select id into u from auth.users where lower(email)=lower(d.recipient) and deleted_at is null;end if;
 if u is null then insert into private.notification_captured_dossier(job_id,tenant_id,reason) values(d.id,d.tenant_id,'no_recipient');return null;end if;
 r:=private.notification_enqueue(d.tenant_id,case when d.source_table='certificates' then 'personnel.qualification' else 'personnel.deadline' end,'dossier',d.id,d.source_revision::text,'dossier-central:'||d.id,jsonb_build_object('recipient_user_id',u,'context','backoffice','channels',case when d.recipient_user_id is not null then '["in_app"]'::jsonb else '["email"]'::jsonb end,'path','/app/personeel/'||d.personnel_id||'?tab=tijdlijn','scheduled_at',d.available_at));
 insert into private.notification_captured_dossier(job_id,tenant_id,request_id,reason) values(d.id,d.tenant_id,r,'captured');return r;
end$$;
create or replace function private.notification_dossier_created() returns trigger language plpgsql security definer set search_path='' as $$
begin perform private.notification_capture_dossier(new.id);return new;end$$;
drop trigger if exists notification_dossier_created on public.personnel_dossier_deliveries;
create trigger notification_dossier_created after insert on public.personnel_dossier_deliveries for each row execute function private.notification_dossier_created();
-- Bring pending pre-upgrade sources under the same permanent OFF suppression.
-- This records envelopes only: no provider calls, prepared_at or processed_at.
do $capture$declare row record;begin
 for row in select id from public.outbox_events where status in ('queued','failed') and event_type in ('ticket.changed','work_order.dispatched','work_order.rescheduled','work_order.reviewed','work_order.report_submitted','work_order.exception','announcement.published') loop perform private.notification_capture_outbox(row.id,false);end loop;
 for row in select id from public.personnel_dossier_deliveries where status in ('scheduled','failed','processing') loop perform private.notification_capture_dossier(row.id);end loop;
end$capture$;
create or replace function public.notification_prepare_dossier(batch_size integer default 25,target_tenant uuid default null) returns integer language plpgsql security definer set search_path='' as $$
declare d public.personnel_dossier_deliveries;r uuid;n integer:=0;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 for d in select * from public.personnel_dossier_deliveries x where (target_tenant is null or x.tenant_id=target_tenant) and x.status in ('scheduled','failed','processing') and not exists(select 1 from private.notification_requests r where r.source_kind='dossier' and r.source_id=x.id and r.prepared_at is not null) order by x.created_at for update skip locked limit least(greatest(batch_size,1),100) loop
  r:=private.notification_capture_dossier(d.id);
  if r is not null then n:=n+public.notification_delivery_prepare(r);
  elsif d.status='processing' then update public.personnel_dossier_deliveries set status='uncertain',last_error='Historische verzenduitkomst onzeker' where id=d.id;
  else update public.personnel_dossier_deliveries set status='cancelled',last_error='Geen actuele bevoegde ontvanger bij het ontstaan van de melding' where id=d.id;end if;
 end loop;return n;
end$$;

create or replace function private.notification_delivery_items(t uuid,ctx text,actor uuid) returns setof jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',d.id,'tenant_id',d.tenant_id,'context',d.context,'campaign_id',d.snapshot->>'campaignId','type_code',r.type_code,'recipient_label',case when ctx='platform' then 'Afgeschermde ontvanger' else d.snapshot->>'recipientLabel' end,'channel',d.channel,'state',d.state,'reason',d.reason,'created_at',d.created_at,'last_attempt_at',d.last_attempt_at,'next_attempt_at',case when d.state in ('queued','failed','deferred') then d.available_at else null end,'expires_at',d.expires_at,'template_version',d.snapshot->'templateVersion','policy_revision',d.policy_revision,'revision',d.revision,'permissions',case when d.state='failed' and private.notification_cap(t,actor,case when ctx='platform' then 'platform.notifications.delivery.retry' else 'notifications.delivery.retry' end) then '["delivery_retry"]'::jsonb else '[]'::jsonb end)
 from private.notification_deliveries d join private.notification_requests r on r.id=d.request_id where ctx='platform' or d.tenant_id=t
 union all
 select jsonb_build_object('id',m.id,'tenant_id',m.tenant_id,'context',coalesce(permit.context,dm.context,case when m.template='personnel_invitation' then 'staff' else 'customer' end),'campaign_id',null,'type_code',coalesce(permit.type_code,dm.type_code,e.kind,case m.template when 'invoice' then 'invoice.available' when 'quote' then 'quote.available' when 'quote_reminder' then 'quote.reminder' else 'personnel.invitation' end),'recipient_label','Afgeschermde e-mailontvanger','channel','email','state',case when dm.state='queued' then 'deferred' when m.status='processing' then 'sending' else m.status::text end,'reason',case when m.status='failed' then 'Herstel via de oorspronkelijke documentactie' when m.status='uncertain' then 'Provideruitkomst onzeker; geen automatische herhaling' when m.status='suppressed' then 'Geblokkeerd door actuele notificatie-instellingen' else null end,'created_at',m.created_at,'last_attempt_at',permit.started_at,'next_attempt_at',case when dm.state in ('queued','failed') then dm.available_at else null end,'expires_at',dm.expires_at,'template_version',coalesce(m.template_revision,1),'policy_revision',coalesce(permit.revision,0),'revision',greatest(m.attempts,1),'permissions','[]'::jsonb)
 from public.mail_deliveries m left join lateral(select * from private.notification_provider_permits p where p.source_kind='mail' and p.source_id=m.id order by p.generation desc limit 1)permit on true
 left join private.notification_deferred_mail dm on dm.mail_id=m.id
 left join public.commercial_events e on e.tenant_id=m.tenant_id and e.id::text=m.render_snapshot->>'event_id'
 where (ctx='platform' or m.tenant_id=t) and m.template in ('invoice','quote','quote_reminder','commercial_event','personnel_invitation') and(m.template<>'personnel_invitation' or jsonb_typeof(m.render_snapshot->'delivery')='object')
$$;
create or replace function private.notification_delivery_query(t uuid,ctx text,actor uuid,op text,p jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare page integer:=greatest(1,coalesce((p->>'page')::integer,1));size integer:=least(100,greatest(5,coalesce(coalesce(p->>'page_size',p->>'pageSize')::integer,25)));term text:=lower(left(btrim(coalesce(p->>'search','')),160));items jsonb;total integer;
begin
 p:=jsonb_build_object('campaign_id',coalesce(p->'campaign_id',p->'campaignId'),'type_code',coalesce(p->'type_code',p->'typeCode'))||p;
 if ctx not in ('platform','backoffice') or not private.notification_cap(t,actor,case when ctx='platform' then 'platform.notifications.delivery.read' else 'notifications.delivery.read' end) then raise exception 'Geen toegang' using errcode='42501';end if;
 -- Search only the authorized DTO, never hidden recipient names, addresses or content.
 with filtered as(select item from private.notification_delivery_items(t,ctx,actor)item where(nullif(p->>'campaign_id','') is null or item->>'campaign_id'=p->>'campaign_id') and(nullif(p->>'type_code','') is null or item->>'type_code'=p->>'type_code') and(nullif(p->>'status','') is null or item->>'state'=p->>'status') and(nullif(p->>'channel','') is null or item->>'channel'=p->>'channel') and(nullif(p->>'tenant_id','') is null or item->>'tenant_id'=p->>'tenant_id') and(nullif(p->>'context','') is null or item->>'context'=p->>'context') and(term='' or strpos(lower(concat_ws(' ',item->>'recipient_label',item->>'type_code',item->>'context',item->>'channel',item->>'state')),term)>0)),paged as(select item from filtered order by item->>'created_at' desc,item->>'id' limit size offset(page-1)*size)
 select(select count(*) from filtered),coalesce((select jsonb_agg(item) from paged),'[]') into total,items;
 return jsonb_build_object('items',items,'total',total,'page',page,'page_size',size);
end$$;
create or replace function private.notification_campaign_delivery_summary(campaign uuid,t uuid,ctx text,actor uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare counts jsonb;deliveries jsonb:='[]'::jsonb;begin
 if not exists(select 1 from private.notification_campaigns c where c.id=campaign and c.tenant_id is not distinct from t and c.context=ctx and(c.sender_id=actor or private.notification_cap(t,actor,case when ctx='platform' then 'platform.notifications.read' else 'notifications.sent.read' end))) then return jsonb_build_object('counts','{}'::jsonb,'deliveries','[]'::jsonb);end if;
 select coalesce(jsonb_object_agg(state,n),'{}') into counts from(select d.state,count(*) n from private.notification_deliveries d where d.snapshot->>'campaignId'=campaign::text group by d.state)x;
 if private.notification_cap(t,actor,case when ctx='platform' then 'platform.notifications.delivery.read' else 'notifications.delivery.read' end) then deliveries:=private.notification_delivery_query(t,ctx,actor,'delivery',jsonb_build_object('campaignId',campaign,'pageSize',100))->'items';end if;
 return jsonb_build_object('counts',counts,'deliveries',deliveries);
end$$;
create or replace function private.notification_campaign_delivery_sync(cid uuid) returns void language plpgsql security definer set search_path='' as $$
declare pending boolean;bad boolean;begin
 select exists(select 1 from private.notification_deliveries d where d.snapshot->>'campaignId'=cid::text and d.state in ('queued','claimed','sending','deferred','failed')) or exists(select 1 from private.notification_requests q where q.payload->>'campaign_id'=cid::text and q.prepared_at is null),exists(select 1 from private.notification_deliveries d where d.snapshot->>'campaignId'=cid::text and d.state<>'sent') into pending,bad;
 update private.notification_campaigns set state=case when pending then 'processing' when bad then 'partial' else 'completed' end where id=cid and state not in ('paused','cancelled','expired','draft');
end$$;
create or replace function private.notification_campaign_started(campaign uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.notification_deliveries d where d.snapshot->>'campaignId'=campaign::text and(d.last_attempt_at is not null or d.sent_at is not null))
$$;
create or replace function private.notification_delivery_projection_sync() returns trigger language plpgsql security definer set search_path='' as $$
declare r private.notification_requests;begin
 select * into r from private.notification_requests where id=new.request_id;
 if r.source_kind='dossier' then update public.personnel_dossier_deliveries set status=case when new.state='sent' then 'sent' when new.state='uncertain' then 'uncertain' when new.state='failed' then 'failed' when new.state in ('cancelled','suppressed','expired') then 'cancelled' else 'processing' end,attempts=new.attempts,sent_at=new.sent_at,last_error=case when new.state='sent' then null else new.reason end where id=r.source_id;end if;
 if r.source_kind='campaign' then perform private.notification_campaign_delivery_sync(nullif(new.snapshot->>'campaignId','')::uuid);end if;return new;
end$$;
drop trigger if exists notification_delivery_projection_sync on private.notification_deliveries;
create trigger notification_delivery_projection_sync after insert or update of state on private.notification_deliveries for each row execute function private.notification_delivery_projection_sync();
create or replace function private.notification_delivery_command(t uuid,ctx text,actor uuid,cmd text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare d private.notification_deliveries;r private.notification_requests;policy jsonb;
begin
 if cmd<>'delivery_retry' or ctx not in ('platform','backoffice') or not private.notification_cap(t,actor,case when ctx='platform' then 'platform.notifications.delivery.retry' else 'notifications.delivery.retry' end) then raise exception 'Geen toegang' using errcode='42501';end if;
 select * into d from private.notification_deliveries where id=(p->>'id')::uuid and (ctx='platform' or tenant_id=t) for update;
 if d.id is null or nullif(p->>'version','') is null or d.revision<>(p->>'version')::bigint then raise exception 'Aflevering gewijzigd; vernieuw de pagina' using errcode='40001';end if;
 if d.state<>'failed' or not private.notification_delivery_live(d) or exists(select 1 from private.notification_provider_permits where source_kind='delivery' and source_id=d.id and state in ('admitted','accepted','uncertain','cancelled')) then raise exception 'Aflevering niet veilig opnieuw te verzenden' using errcode='23514';end if;
 select * into r from private.notification_requests where id=d.request_id;policy:=private.notification_policy(d.tenant_id,r.type_code,d.context,d.channel,d.recipient_user_id);
 if not coalesce((policy->>'allowed')::boolean,false) then raise exception 'Notificatiebeleid blokkeert verzending' using errcode='23514';end if;
 update private.notification_deliveries set state='queued',attempts=0,available_at=greatest(now(),coalesce((policy->>'quiet_until')::timestamptz,now())),revision=revision+1 where id=d.id;
 insert into private.notification_audit(tenant_id,actor_id,action,resource_id,revision) values(t,actor,'delivery_retry',d.id,d.revision+1);
 return jsonb_build_object('id',d.id,'version',d.revision+1);
end$$;

insert into public.notification_catalog(code,name,description,category,module,status,contexts,channels,default_channels,recipient_description) values('work_order.exception','Uitvoeringsmelding','Uitvoeringsmelding vraagt opvolging','Werkbonnen','planning','active',array['backoffice'],array['in_app','push','email'],array['in_app'],'Actueel bevoegde eigenaar') on conflict do nothing;
update public.notification_catalog set status='active' where code in ('work_order.dispatched','work_order.rescheduled','work_order.reviewed','work_order.signature_required','announcement.published','personnel.deadline','personnel.qualification','ticket.changed');

revoke insert,update,delete,select on public.push_subscriptions from authenticated,anon;
-- A rolled-back worker must not consume unknown central requests, or execute
-- the old direct provider path for events whose delivery now belongs here.
drop function if exists public.claim_outbox(integer,integer,boolean,uuid);
create or replace function public.claim_outbox(batch_size integer default 25,lock_seconds integer default 60,include_tickets boolean default false,target_tenant uuid default null,include_notifications boolean default false)
returns setof public.outbox_events language plpgsql security definer set search_path='' as $$
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 return query with selected as(select e.id from public.outbox_events e where(target_tenant is null or e.tenant_id=target_tenant)
 and(e.event_type<>'ticket.changed' or include_tickets is true)
 and(include_notifications is true or e.event_type not in ('notification.requested','ticket.changed','work_order.dispatched','work_order.rescheduled','work_order.reviewed','work_order.report_submitted','work_order.exception','announcement.published'))
 and(e.status in ('queued','failed') or(include_notifications is true and e.status='processing' and e.locked_until<clock_timestamp()))
 and e.available_at<=clock_timestamp() and(e.locked_until is null or e.locked_until<clock_timestamp()) order by e.created_at for update skip locked limit greatest(1,least(batch_size,100)))
 update public.outbox_events e set status='processing',locked_until=clock_timestamp()+make_interval(secs=>greatest(10,least(lock_seconds,600))),attempts=e.attempts+1 from selected s where e.id=s.id returning e.*;
end$$;
revoke all on function public.claim_outbox(integer,integer,boolean,uuid,boolean) from public,anon,authenticated;
grant execute on function public.claim_outbox(integer,integer,boolean,uuid,boolean) to service_role;
create or replace function public.claim_personnel_dossier_deliveries(batch_size integer default 25) returns setof public.personnel_dossier_deliveries language sql security definer set search_path='' as $$
 select * from public.personnel_dossier_deliveries where false
$$;
revoke execute on function public.ticket_push_subscription(text,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.ticket_delivery_begin(uuid,uuid),public.ticket_delivery_defer(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.ticket_delivery_begin(uuid,uuid),public.ticket_delivery_defer(uuid,uuid,timestamptz) to service_role;
do $$declare tbl text;f record;begin
 foreach tbl in array array['notification_devices','notification_device_bindings','notification_deliveries','notification_planning_events'] loop execute format('alter table private.%I enable row level security',tbl);execute format('alter table private.%I force row level security',tbl);execute format('revoke all on private.%I from public,anon,authenticated,service_role',tbl);end loop;
 for f in select p.oid::regprocedure sig,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname like 'notification_%' and (n.nspname='private' or(n.nspname='public' and p.proname in ('notification_push_device','notification_device_logout','notification_delivery_prepare','notification_delivery_claim','notification_delivery_begin','notification_delivery_finish','notification_delivery_freeze','notification_delivery_defer','notification_outbox_prepare','notification_prepare_dossier'))) loop execute format('revoke all on function %s from public,anon,authenticated',f.sig);if f.nspname='public' then execute format('grant execute on function %s to service_role',f.sig);end if;end loop;
end$$;
grant execute on function private.notification_inbox_visible(uuid) to authenticated;

-- Section: notifications-operational
-- Existing operational sources only. These triggers never expose report text,
-- task prices, access secrets, personnel dossiers or arbitrary audit payloads.

create table if not exists private.notification_domain_events (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,type_code text not null,
 entity_kind text not null,entity_id uuid not null,work_order_id uuid,source_revision text not null,
 dedupe_key text not null,recipients jsonb not null,details jsonb not null default '{}',
 created_at timestamptz not null default clock_timestamp(),unique(tenant_id,dedupe_key),
 check(jsonb_typeof(recipients)='array'),check(jsonb_typeof(details)='object')
);
create index if not exists notification_domain_source_idx on private.notification_domain_events(tenant_id,entity_kind,entity_id,created_at desc);
alter table private.notification_domain_events enable row level security;
alter table private.notification_domain_events force row level security;
revoke all on private.notification_domain_events from public,anon,authenticated,service_role;

insert into public.notification_catalog(code,name,description,category,module,status,contexts,channels,default_channels,recipient_description)
values('work_order.approved','Rapport goedgekeurd','Een rapport is definitief goedgekeurd','Werkbonnen','rapportage','active',array['staff','backoffice'],array['in_app','push','email'],array['in_app'],'Betrokken medewerker en actuele bevoegde planning') on conflict do nothing;
update public.notification_catalog set status='active' where code in ('work_order.cancelled','work_order.travelling','work_order.started','work_order.submitted','work_order.signature_required','work_order.extra_requested','work_order.extra_decided','time.correction');
-- Preserve quiet defaults for high-frequency tracking; users deliberately enable
-- an operational/customer channel rather than migration replaying old events.
update public.notification_catalog set default_channels=array[]::text[] where code in ('work_order.travelling','work_order.started');
insert into private.notification_templates(type_code,context,channel,draft)
select code,ctx,ch,jsonb_build_object('title',name,'body',case when code='work_order.cancelled' then 'Een eerder toegewezen opdracht is vervallen. Neem bij vragen contact op met de planning.' when code='work_order.approved' then 'Een werkbonrapport is goedgekeurd. Bekijk de actuele status in uw eigen omgeving.' else 'Er staat een operationele update klaar in uw beveiligde omgeving.' end,'cta_label','Bekijken') from public.notification_catalog c cross join lateral unnest(c.contexts)ctx cross join lateral unnest(c.channels)ch where code='work_order.approved' on conflict do nothing;
insert into private.notification_template_versions(template_id,revision,definition) select id,revision,draft from private.notification_templates where active_version_id is null on conflict do nothing;
update private.notification_templates t set active_version_id=v.id from private.notification_template_versions v where v.template_id=t.id and v.revision=t.revision and t.active_version_id is null;

create or replace function private.notification_domain_emit(t uuid,code text,entity_kind text,entity_id uuid,wo uuid,revision text,key text,recipients jsonb,details jsonb default '{}') returns uuid language plpgsql security definer set search_path='' as $$
declare event_id uuid;r jsonb;actor uuid;ctx text;path text;vars jsonb;
begin
 if jsonb_array_length(recipients)=0 then return null;end if;
 insert into private.notification_domain_events(tenant_id,type_code,entity_kind,entity_id,work_order_id,source_revision,dedupe_key,recipients,details) values(t,code,entity_kind,entity_id,wo,revision,key,recipients,details) on conflict do nothing returning id into event_id;
 if event_id is null then return null;end if;
 select jsonb_build_object('bonnummer',w.work_order_number,'datum',to_char(w.planned_start_at at time zone te.timezone,'DD-MM-YYYY'),'locatie',o.name) into vars from public.work_orders w join public.tenants te on te.id=w.tenant_id join public.objects o on o.tenant_id=w.tenant_id and o.id=w.object_id where w.tenant_id=t and w.id=wo;
 for r in select distinct value from jsonb_array_elements(recipients) loop
  actor:=(r->>'user_id')::uuid;ctx:=r->>'context';if not private.notification_actor_active(t,ctx,actor) then continue;end if;
  path:=case when code='work_order.cancelled' then case ctx when 'staff' then '/staff/notificaties' when 'customer' then '/klant/notificaties' else '/app/notificaties' end when entity_kind='time_entry' then case when ctx='staff' then '/staff?tab=uren' else '/app/personeel' end when ctx='staff' then '/staff?workOrder='||wo when ctx='backoffice' then '/app/werkbonnen/'||wo else '/klant?object='||(details->>'object_id')||'&order='||wo end;
  perform private.notification_enqueue(t,code,'domain',event_id,revision,case when code='work_order.cancelled' then 'cancellation:'||wo||':'||actor||':'||ctx||':'||pg_current_xact_id()::text else 'domain:'||event_id||':'||actor||':'||ctx end,jsonb_build_object('recipient_user_id',actor,'context',ctx,'channels',array['in_app','push','email'],'path',path,'variables',coalesce(vars,'{}'::jsonb)));
 end loop;return event_id;
end$$;

-- Actor-parametric equivalents of the existing customer portal scope. An
-- invoice requires access to EVERY underlying object, not merely its customer.
create or replace function private.notification_domain_document_allowed(t uuid,code text,entity uuid,recipient uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare q public.quotes;i public.invoices;c public.customers;ct public.customer_contacts;address text;business_day date;
begin
 if not private.notification_actor_active(t,'customer',recipient) or not private.service_enabled(t,'planning') then return false;end if;
 select (now() at time zone timezone)::date into business_day from public.tenants where id=t;
 if code in ('quote.available','quote.reminder') then
  select * into q from public.quotes where tenant_id=t and id=entity;
  if q.id is null or q.published_at is null or q.status<>'awaiting_acceptance' or q.expires_at<=now() or q.superseded_at is not null or q.archived_at is not null or q.pdf_path is null then return false;end if;
  select * into c from public.customers where tenant_id=t and id=q.customer_id;
  if q.contact_id is not null then
   select * into ct from public.customer_contacts where tenant_id=t and customer_id=c.id and id=q.contact_id and active and(active_from is null or active_from<=business_day) and(active_until is null or active_until>=business_day);
   if ct.id is null or(q.object_id is not null and cardinality(ct.object_ids)>0 and not q.object_id=any(ct.object_ids)) then return false;end if;
  end if;
  address:=coalesce(ct.email,c.billing_email);
  if lower(address) is distinct from lower(q.snapshot#>>'{contact,email}') or not exists(select 1 from public.object_customer_bindings b join public.objects o on o.tenant_id=b.tenant_id and o.id=b.object_id where b.tenant_id=t and b.user_id=recipient and b.active and o.customer_id=c.id and(q.object_id is null or o.id=q.object_id) and o.dossier_status<>'archived') then return false;end if;
 elsif code='invoice.available' then
  select * into i from public.invoices where tenant_id=t and id=entity;
  if i.id is null or not private.service_enabled(t,'finance') or i.status not in ('sent','partially_paid','paid','overdue','credited') or i.pdf_storage_path is null or not exists(select 1 from public.invoice_lines where tenant_id=t and invoice_id=i.id)
   or exists(select 1 from public.invoice_lines l left join public.work_orders w on w.tenant_id=l.tenant_id and w.id=l.work_order_id where l.tenant_id=t and l.invoice_id=i.id and(w.id is null or not exists(select 1 from public.object_customer_bindings b where b.tenant_id=t and b.object_id=w.object_id and b.user_id=recipient and b.active))) then return false;end if;
  select * into c from public.customers where tenant_id=t and id=i.customer_id;address:=c.billing_email;
 else return false;end if;
 return c.id is not null and c.status<>'archived' and exists(select 1 from auth.users where id=recipient and lower(email)=lower(address) and email_confirmed_at is not null and deleted_at is null);
end$$;

create or replace function private.notification_domain_source_allowed(t uuid,code text,source uuid,revision text,recipient uuid,ctx text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare e private.notification_domain_events;w public.work_orders;te public.time_entries;task public.work_order_tasks;
begin
 select * into e from private.notification_domain_events where id=source and tenant_id=t and type_code=code and source_revision=revision;
 if e.entity_kind='customer_planning' then return ctx='customer' and private.notification_domain_customer_planning_allowed(t,e.id,recipient);end if;
 if e.id is null or not private.notification_actor_active(t,ctx,recipient) or not exists(select 1 from jsonb_array_elements(e.recipients)r where r->>'user_id'=recipient::text and r->>'context'=ctx) then return false;end if;
 if e.entity_kind in ('quote','invoice') then return ctx='customer' and private.notification_domain_document_allowed(t,code,e.entity_id,recipient);end if;
 -- Cancellation acknowledges the former assignment; it deliberately does not
 -- confer source access or a work-order link, even if the source was deleted.
 if code='work_order.cancelled' then return true;end if;
 if e.entity_kind='time_entry' then
  select * into te from public.time_entries where tenant_id=t and id=e.entity_id;if te.id is null or te.status is distinct from e.details->>'state' or exists(select 1 from private.notification_domain_events later where later.tenant_id=t and later.entity_kind='time_entry' and later.entity_id=e.entity_id and later.created_at>e.created_at) then return false;end if;
  return(case when ctx='staff' then exists(select 1 from public.personnel p where p.tenant_id=t and p.id=te.personnel_id and p.user_id=recipient and p.status='active') else exists(select 1 from public.tenant_memberships m where m.tenant_id=t and m.user_id=recipient and m.status='active' and m.roles&&array['tenant_admin','management','hr']::public.app_role[]) end);
 end if;
 select * into w from public.work_orders where tenant_id=t and id=e.work_order_id;
 if w.id is null or w.archive_at is not null or w.status='cancelled' then return false;end if;
 if code='work_order.submitted' and(w.report_state<>'review' or w.report_version::text<>e.source_revision) then return false;end if;
 if code='work_order.signature_required' and(w.report_state<>'waiting_signature' or w.report_version::text<>e.source_revision) then return false;end if;
 if code='work_order.approved' and(w.report_state<>'approved' or w.report_version::text<>e.source_revision) then return false;end if;
 if code='work_order.travelling' and w.status<>'travelling' then return false;end if;
 if code='work_order.started' and w.status<>'in_progress' then return false;end if;
 if e.entity_kind='task' then
  select * into task from public.work_order_tasks where tenant_id=t and id=e.entity_id and work_order_id=w.id;
  if task.id is null or task.extra_work_status is distinct from e.details->>'state' or exists(select 1 from private.notification_domain_events later where later.tenant_id=t and later.entity_kind='task' and later.entity_id=e.entity_id and later.created_at>e.created_at) then return false;end if;
 end if;
 if ctx='backoffice' then return exists(select 1 from public.tenant_memberships m where m.tenant_id=t and m.user_id=recipient and m.status='active' and m.roles&&case when code='work_order.extra_requested' then array['tenant_admin','management','finance']::public.app_role[] else array['tenant_admin','management','planner','finance']::public.app_role[] end);end if;
 if ctx='customer' then return code in ('work_order.travelling','work_order.started') and exists(select 1 from public.object_customer_bindings b where b.tenant_id=t and b.object_id=w.object_id and b.user_id=recipient and b.active);end if;
 return ctx='staff' and exists(select 1 from public.work_order_assignments a join public.personnel p on p.tenant_id=a.tenant_id and p.id=a.personnel_id where a.tenant_id=t and a.work_order_id=w.id and p.user_id=recipient and p.status='active' and a.status not in ('cancelled','returned') and exists(select 1 from public.dispatches d where d.tenant_id=t and d.assignment_id=a.id and d.revoked_at is null));
end$$;

create or replace function private.notification_domain_work_order() returns trigger language plpgsql security definer set search_path='' as $$
declare code text;recipients jsonb:='[]'::jsonb;rev text;key text;
begin
 if new.status is distinct from old.status and new.status='cancelled' then
  code:='work_order.cancelled';rev:=new.version::text;key:='order-cancel:'||new.id||':'||new.version;
  select coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'context',ctx)),'[]'::jsonb) into recipients from(
   select distinct p.user_id,'staff' ctx from public.work_order_assignments a join public.personnel p on p.tenant_id=a.tenant_id and p.id=a.personnel_id where a.tenant_id=new.tenant_id and a.work_order_id=new.id and p.user_id is not null and exists(select 1 from public.dispatches d where d.tenant_id=a.tenant_id and d.assignment_id=a.id)
   union select b.user_id,'customer' from public.object_customer_bindings b where b.tenant_id=new.tenant_id and b.object_id=new.object_id and b.active
   union select m.user_id,'backoffice' from public.tenant_memberships m where m.tenant_id=new.tenant_id and m.user_id=new.created_by and m.status='active' and m.roles&&array['tenant_admin','management','planner']::public.app_role[])x;
 elsif new.report_state is distinct from old.report_state and new.report_state in ('review','waiting_signature','approved') then
  code:=case new.report_state when 'review' then 'work_order.submitted' when 'waiting_signature' then 'work_order.signature_required' else 'work_order.approved' end;rev:=new.report_version::text;key:=code||':'||new.id||':'||rev;
  select coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'context',ctx)),'[]'::jsonb) into recipients from(
   select m.user_id,'backoffice' ctx from public.tenant_memberships m where m.tenant_id=new.tenant_id and m.status='active' and m.roles&&array['tenant_admin','management','planner','finance']::public.app_role[]
   union select p.user_id,'staff' from public.work_order_assignments a join public.personnel p on p.tenant_id=a.tenant_id and p.id=a.personnel_id where new.report_state='approved' and a.tenant_id=new.tenant_id and a.work_order_id=new.id and a.status not in ('cancelled','returned') and p.user_id is not null and p.status='active')x;
 elsif new.status is distinct from old.status and new.status in ('travelling','in_progress') then
  code:=case new.status when 'travelling' then 'work_order.travelling' else 'work_order.started' end;rev:=new.version::text;key:=code||':'||new.id||':'||rev;
  select coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'context',ctx)),'[]'::jsonb) into recipients from(
   select m.user_id,'backoffice' ctx from public.tenant_memberships m where m.tenant_id=new.tenant_id and m.user_id=new.created_by and m.status='active' and m.roles&&array['tenant_admin','management','planner']::public.app_role[]
   union select b.user_id,'customer' from public.object_customer_bindings b where b.tenant_id=new.tenant_id and b.object_id=new.object_id and b.active)x;
 else return new;end if;
 perform private.notification_domain_emit(new.tenant_id,code,'work_order',new.id,new.id,rev,key,recipients,jsonb_build_object('object_id',new.object_id));return new;
end$$;
drop trigger if exists notification_domain_work_order on public.work_orders;
create trigger notification_domain_work_order after update on public.work_orders for each row execute function private.notification_domain_work_order();

create or replace function private.notification_domain_assignment() returns trigger language plpgsql security definer set search_path='' as $$
declare row_data public.work_order_assignments;w public.work_orders;actor uuid;recipients jsonb;rev text;
begin
 if tg_op='DELETE' then if pg_trigger_depth()>1 then return old;end if;row_data:=old;
 elsif new.status='cancelled' and old.status<>'cancelled' then row_data:=old;else return new;end if;
 select * into w from public.work_orders where id=row_data.work_order_id and tenant_id=row_data.tenant_id;
 if w.id is null or w.status='cancelled' or not exists(select 1 from public.dispatches d where d.assignment_id=row_data.id and d.tenant_id=row_data.tenant_id) then if tg_op='DELETE' then return old;else return new;end if;end if;
 select user_id into actor from public.personnel where id=row_data.personnel_id and tenant_id=row_data.tenant_id;
 if actor is not null then
  recipients:=jsonb_build_array(jsonb_build_object('user_id',actor,'context','staff'));
  if exists(select 1 from public.tenant_memberships m where m.tenant_id=w.tenant_id and m.user_id=w.created_by and m.status='active' and m.roles&&array['tenant_admin','management','planner']::public.app_role[]) then recipients:=recipients||jsonb_build_array(jsonb_build_object('user_id',w.created_by,'context','backoffice'));end if;
  rev:=row_data.version::text;perform private.notification_domain_emit(w.tenant_id,'work_order.cancelled','assignment',row_data.id,w.id,rev,'assignment-cancel:'||row_data.id||':'||rev,recipients);
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end$$;
drop trigger if exists notification_domain_assignment_update on public.work_order_assignments;
drop trigger if exists notification_domain_assignment_delete on public.work_order_assignments;
create trigger notification_domain_assignment_update after update on public.work_order_assignments for each row execute function private.notification_domain_assignment();
create trigger notification_domain_assignment_delete before delete on public.work_order_assignments for each row execute function private.notification_domain_assignment();

create or replace function private.notification_domain_task() returns trigger language plpgsql security definer set search_path='' as $$
declare code text;recipients jsonb;w public.work_orders;revision text;
begin
 if not new.is_extra_work or new.extra_work_status is null or(tg_op='UPDATE' and new.extra_work_status is not distinct from old.extra_work_status) then return new;end if;
 code:=case when new.extra_work_status='awaiting_review' then 'work_order.extra_requested' else 'work_order.extra_decided' end;
 select * into w from public.work_orders where id=new.work_order_id and tenant_id=new.tenant_id;
 select coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'context',ctx)),'[]'::jsonb) into recipients from(
  select m.user_id,'backoffice' ctx from public.tenant_memberships m where m.tenant_id=new.tenant_id and m.status='active' and(case when new.extra_work_status='awaiting_review' then m.roles&&array['tenant_admin','management','finance']::public.app_role[] else m.user_id=w.created_by and m.roles&&array['tenant_admin','management','planner','finance']::public.app_role[] end)
  union select p.user_id,'staff' from public.personnel p where new.extra_work_status<>'awaiting_review' and p.tenant_id=new.tenant_id and p.user_id=new.added_by and p.status='active')x;
 revision:=new.extra_work_status||':'||gen_random_uuid();perform private.notification_domain_emit(new.tenant_id,code,'task',new.id,new.work_order_id,revision,code||':'||new.id||':'||revision,recipients,jsonb_build_object('state',new.extra_work_status));return new;
end$$;
drop trigger if exists notification_domain_task on public.work_order_tasks;
create trigger notification_domain_task after insert or update on public.work_order_tasks for each row execute function private.notification_domain_task();

create or replace function private.notification_domain_time() returns trigger language plpgsql security definer set search_path='' as $$
declare recipients jsonb;revision text;
begin
 if new.status not in ('correction_requested','approved','rejected') or(tg_op='UPDATE' and new.status is not distinct from old.status) or(tg_op='INSERT' and new.status<>'correction_requested') then return new;end if;
 select coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'context',ctx)),'[]'::jsonb) into recipients from(
  select m.user_id,'backoffice' ctx from public.tenant_memberships m where new.status='correction_requested' and m.tenant_id=new.tenant_id and m.status='active' and m.roles&&array['tenant_admin','management','hr']::public.app_role[]
  union select p.user_id,'staff' from public.personnel p where new.status<>'correction_requested' and p.tenant_id=new.tenant_id and p.id=new.personnel_id and p.user_id is not null and p.status='active')x;
 revision:=new.status||':'||gen_random_uuid();perform private.notification_domain_emit(new.tenant_id,'time.correction','time_entry',new.id,null,revision,'time:'||new.id||':'||revision,recipients,jsonb_build_object('state',new.status));return new;
end$$;
drop trigger if exists notification_domain_time on public.time_entries;
create trigger notification_domain_time after insert or update on public.time_entries for each row execute function private.notification_domain_time();

create or replace function private.notification_domain_object_execution() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.state is distinct from old.state and new.state in ('completed','partial','not_done') then perform private.object_notify(new.tenant_id,new.object_id,new.work_order_id,'executed:'||new.id||':'||new.version||':'||new.state);end if;return new;
end$$;
drop trigger if exists notification_domain_object_execution on public.object_visit_requests;
create trigger notification_domain_object_execution after update on public.object_visit_requests for each row execute function private.notification_domain_object_execution();

create or replace function private.notification_domain_document_emit(t uuid,code text,entity uuid,event_key text) returns void language plpgsql security definer set search_path='' as $$
declare recipients jsonb;event_id uuid;r jsonb;
begin
 select coalesce(jsonb_agg(jsonb_build_object('user_id',u.id,'context','customer')),'[]'::jsonb) into recipients from auth.users u where exists(select 1 from public.object_customer_bindings b where b.tenant_id=t and b.user_id=u.id and b.active) and private.notification_domain_document_allowed(t,code,entity,u.id);
 if jsonb_array_length(recipients)=0 then return;end if;
 insert into private.notification_domain_events(tenant_id,type_code,entity_kind,entity_id,source_revision,dedupe_key,recipients) values(t,code,case when code='invoice.available' then 'invoice' else 'quote' end,entity,event_key,event_key,recipients) on conflict do nothing returning id into event_id;
 if event_id is null then return;end if;
 for r in select value from jsonb_array_elements(recipients) loop
  perform private.notification_enqueue(t,code,'domain',event_id,event_key,'document-app:'||event_id||':'||(r->>'user_id'),jsonb_build_object('recipient_user_id',r->>'user_id','context','customer','channels',array['in_app','push'],'path',case when code='invoice.available' then '/klant/documenten' else '/klant/aanvragen' end,'variables',jsonb_build_object('bedrijfsnaam',(select name from public.tenants where id=t))));
 end loop;
end$$;

create or replace function private.notification_domain_document() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='quotes' then
  if new.published_at is not null and new.status='awaiting_acceptance' and new.pdf_path is not null then perform private.notification_domain_document_emit(new.tenant_id,'quote.available',new.id,'quote-available:'||new.id||':'||new.revision);end if;
 elsif tg_table_name='invoices' then
  if new.status in ('sent','partially_paid','paid','overdue','credited') and new.pdf_storage_path is not null then perform private.notification_domain_document_emit(new.tenant_id,'invoice.available',new.id,'invoice-available:'||new.id);end if;
 elsif new.template='quote_reminder' and new.render_snapshot->>'quote_id' is not null then
  -- A committed reminder request is the source, independently of whether its
  -- e-mail channel is suppressed. This adapter never queues an e-mail itself.
  perform private.notification_domain_document_emit(new.tenant_id,'quote.reminder',(new.render_snapshot->>'quote_id')::uuid,'quote-reminder:'||new.id);
 end if;return new;
end$$;
drop trigger if exists notification_domain_quote on public.quotes;
drop trigger if exists notification_domain_invoice on public.invoices;
drop trigger if exists notification_domain_quote_reminder on public.mail_deliveries;
create trigger notification_domain_quote after insert or update of published_at,status,pdf_path on public.quotes for each row execute function private.notification_domain_document();
create trigger notification_domain_invoice after insert or update of status,pdf_storage_path on public.invoices for each row execute function private.notification_domain_document();
create trigger notification_domain_quote_reminder after insert or update of render_snapshot on public.mail_deliveries for each row execute function private.notification_domain_document();

-- Customer appointment updates reuse the committed planning change, including
-- explicitly confirmed visits without crew. The domain row freezes recipients.
-- No assignment/personnel data is copied into the customer presentation.
create or replace function private.notification_domain_planning_contact(t uuid,wo uuid,contact uuid,actor uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare w public.work_orders;c public.customer_contacts;day date;bound boolean;
begin
 select * into w from public.work_orders where tenant_id=t and id=wo and archive_at is null and status in ('released','seen','travelling','in_progress');
 select * into c from public.customer_contacts where tenant_id=t and id=contact and customer_id=w.customer_id and active;
 select(now() at time zone timezone)::date into day from public.tenants where id=t and status='active';
 if w.id is null or c.id is null or day is null or not private.service_enabled(t,'planning') or c.email!~*'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or(c.active_from is not null and c.active_from>day) or(c.active_until is not null and c.active_until<day) or(cardinality(c.object_ids)>0 and not w.object_id=any(c.object_ids)) then return false;end if;
 if not exists(select 1 from public.customers where tenant_id=t and id=w.customer_id and status='active') or not exists(select 1 from public.objects where tenant_id=t and id=w.object_id and dossier_status<>'archived') then return false;end if;
 bound:=actor is not null and private.notification_actor_active(t,'customer',actor) and exists(select 1 from auth.users u join public.object_customer_bindings b on b.user_id=u.id where u.id=actor and u.email_confirmed_at is not null and lower(btrim(u.email))=lower(btrim(c.email)) and b.tenant_id=t and b.object_id=w.object_id and b.active);
 if actor is not null and not bound then return false;end if;
 return bound or w.object_id=any(c.object_ids) or exists(select 1 from public.work_order_contacts wc where wc.tenant_id=t and wc.work_order_id=w.id and wc.contact_id=c.id and wc.roles&&array['site','requester','handover']);
end$$;

create or replace function private.notification_domain_customer_planning_allowed(t uuid,event uuid,actor uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare e private.notification_domain_events;p public.planning_changes;w public.work_orders;c public.customer_contacts;
begin
 select * into e from private.notification_domain_events where tenant_id=t and id=event and entity_kind='customer_planning' and type_code='work_order.rescheduled';
 if e.id is null or nullif(e.recipients#>>'{0,user_id}','')::uuid is distinct from actor then return false;end if;
 select * into p from public.planning_changes where tenant_id=t and id=e.entity_id and work_order_id=e.work_order_id;
 select * into w from public.work_orders where tenant_id=t and id=e.work_order_id;
 select * into c from public.customer_contacts where tenant_id=t and id=(e.details->>'contact_id')::uuid;
 if p.id is null or(p.after_data->>'start')::timestamptz is distinct from w.projected_start_at or(p.after_data->>'end')::timestamptz is distinct from w.projected_end_at
  or exists(select 1 from public.planning_changes later where later.tenant_id=t and later.work_order_id=w.id and later.created_at>p.created_at and(later.before_data->>'start',later.before_data->>'end') is distinct from(later.after_data->>'start',later.after_data->>'end')) then return false;end if;
 return encode(extensions.digest(lower(btrim(c.email)),'sha256'),'hex')=e.details->>'email_hash' and private.notification_domain_planning_contact(t,w.id,c.id,actor);
end$$;

create or replace function private.notification_domain_customer_planning() returns trigger language plpgsql security definer set search_path='' as $$
declare p public.planning_changes;w public.work_orders;c record;actor uuid;event_id uuid;key text;hash text;ctx_channels text[];tz text;
begin
 p:=new;
 if p.id is null or(p.before_data->>'start',p.before_data->>'end') is not distinct from(p.after_data->>'start',p.after_data->>'end') then return new;end if;
 select * into w from public.work_orders where tenant_id=new.tenant_id and id=p.work_order_id;
 select timezone into tz from public.tenants where id=new.tenant_id;
 for c in select cc.* from public.customer_contacts cc where cc.tenant_id=new.tenant_id and cc.customer_id=w.customer_id and cc.active order by cc.id loop
  actor:=null;
  select u.id into actor from auth.users u where lower(btrim(u.email))=lower(btrim(c.email)) and private.notification_domain_planning_contact(new.tenant_id,w.id,c.id,u.id) order by u.id limit 1;
  if not private.notification_domain_planning_contact(new.tenant_id,w.id,c.id,actor) then continue;end if;
  hash:=encode(extensions.digest(lower(btrim(c.email)),'sha256'),'hex');key:='customer-planning:'||p.id||':'||hash;
  insert into private.notification_domain_events(tenant_id,type_code,entity_kind,entity_id,work_order_id,source_revision,dedupe_key,recipients,details)
   values(new.tenant_id,'work_order.rescheduled','customer_planning',p.id,w.id,p.id::text,key,jsonb_build_array(jsonb_build_object('user_id',actor,'context','customer')),jsonb_build_object('contact_id',c.id,'email_hash',hash,'planning_change_id',p.id)) on conflict do nothing returning id into event_id;
  if event_id is null then continue;end if;
  ctx_channels:=case when actor is null then array['email'] else array['in_app','push','email'] end;
  perform private.notification_enqueue(new.tenant_id,'work_order.rescheduled','domain',event_id,p.id::text,key,jsonb_build_object('recipient_user_id',actor,'contact_id',c.id,'context','customer','channels',ctx_channels,'path',case when actor is null then '/klant/notificaties' else '/klant?object='||w.object_id||'&order='||w.id end,'scheduled_at',clock_timestamp()+make_interval(secs=>private.notification_bundle_seconds(new.tenant_id,'work_order.rescheduled','customer')),'variables',jsonb_build_object('bedrijfsnaam',(select name from public.tenants where id=new.tenant_id),'datum',coalesce(to_char(w.projected_start_at at time zone tz,'DD-MM-YYYY HH24:MI'),'Nog niet ingepland'))));
 end loop;return new;
end$$;
drop trigger if exists notification_domain_customer_planning on public.outbox_events;
drop trigger if exists notification_domain_customer_planning on public.planning_changes;
create trigger notification_domain_customer_planning after insert on public.planning_changes for each row execute function private.notification_domain_customer_planning();

-- A dedicated customer presentation never inherits employee names, work-order
-- instructions or internal location data from the staff template.
do $$declare r private.notification_templates;d jsonb;v uuid;begin
 for r in select * from private.notification_templates where tenant_id is null and type_code='work_order.rescheduled' and context='customer' and channel in ('in_app','email') and revision=1 loop
  d:=jsonb_build_object('title','Uw afspraak is gewijzigd','body','De planning van uw afspraak is gewijzigd. Actuele planning: {datum}. Neem bij vragen contact op met {bedrijfsnaam}.','cta_label','Afspraak bekijken');
  insert into private.notification_template_versions(template_id,revision,definition) values(r.id,r.revision+1,d) returning id into v;
  update private.notification_templates set draft=d,revision=r.revision+1,active_version_id=v where id=r.id;
 end loop;
end$$;

do $$declare fn record;begin for fn in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like 'notification_domain_%' loop execute format('revoke all on function %s from public,anon,authenticated,service_role',fn.signature);end loop;end$$;

-- Section: notifications-permissions
-- Central notification delegation. Apply after notifications-core.sql.
-- Normal-JWT query/command hooks; only challenge delivery uses service_role.

insert into public.permission_catalog(key,domain,name,description,module,action,scopes,sensitive) values
 ('notifications.permissions','tenant','Notificatierechten delegeren','Afzonderlijke notificatierechten binnen eigen delegatiebereik; recente verificatie vereist.','notifications','permissions',array['tenant','personnel','object','customer'],true),
 ('platform.notifications.permissions','platform','Platformnotificatierechten delegeren','Afzonderlijke platformnotificatierechten binnen expliciet delegatiebereik.','notifications','permissions',array['tenant'],true)
on conflict(key) do nothing;
insert into public.permission_role_defaults(role,capability) values('tenant_admin','notifications.permissions') on conflict do nothing;
create table if not exists private.notification_delegation_bootstrap(subject_id uuid primary key,created_at timestamptz not null default now());
with newly as (insert into private.notification_delegation_bootstrap(subject_id) select id from public.tenant_memberships where status='active' and 'tenant_admin'=any(roles) on conflict do nothing returning subject_id)
insert into public.permission_grants(tenant_id,user_id,membership_id,capability,scope,source)
select m.tenant_id,m.user_id,m.id,'notifications.permissions','{"all":true}','bootstrap' from public.tenant_memberships m join newly n on n.subject_id=m.id on conflict do nothing;
with newly as (insert into private.notification_delegation_bootstrap(subject_id) select user_id from public.platform_admins on conflict do nothing returning subject_id)
insert into public.permission_grants(user_id,capability,scope,source) select subject_id,'platform.notifications.permissions','{"all":true}','bootstrap' from newly on conflict do nothing;

create table if not exists private.notification_verifications (
 id uuid primary key default gen_random_uuid(),tenant_id uuid references public.tenants(id),actor_id uuid not null references auth.users(id),session_id uuid not null,context text not null check(context in ('backoffice','platform')),
 action text not null check(action in ('grant_save','grant_revoke')),payload_hash text not null,code_hash text not null,attempts integer not null default 0,
 delivered boolean not null default false,verified_at timestamptz,consumed_at timestamptz,expires_at timestamptz not null default now()+interval '5 minutes',created_at timestamptz not null default now()
);
create index if not exists notification_verifications_actor_idx on private.notification_verifications(actor_id,created_at);
alter table private.notification_verifications enable row level security;
alter table private.notification_verifications force row level security;
alter table private.notification_delegation_bootstrap enable row level security;
alter table private.notification_delegation_bootstrap force row level security;
revoke all on private.notification_verifications,private.notification_delegation_bootstrap from public,anon,authenticated,service_role;

create or replace function private.notification_delegation_scope(t uuid,ctx text,actor uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select g.scope from public.permission_grants g where g.user_id=actor and g.enabled and g.capability=case ctx when 'platform' then 'platform.notifications.permissions' when 'backoffice' then 'notifications.permissions' end
 and g.tenant_id is not distinct from t and private.notification_actor_active(t,ctx,actor)
 and (ctx='platform' or exists(select 1 from public.tenant_memberships m where m.id=g.membership_id and m.tenant_id=t and m.user_id=actor and m.status='active'))
$$;
create or replace function private.notification_permission_validate(t uuid,ctx text,actor uuid,cmd text,p jsonb) returns void language plpgsql security definer set search_path='' as $$
declare parent_scope jsonb;requested_scope jsonb;cap text;uid uuid;c public.permission_catalog;g public.permission_grants;dep text;expected bigint;
begin
 parent_scope:=private.notification_delegation_scope(t,ctx,actor);
 if parent_scope is null or ctx not in ('platform','backoffice') or cmd not in ('grant_save','grant_revoke') or jsonb_typeof(p)<>'object' or length(btrim(coalesce(p->>'reason','')))<3 or length(coalesce(p->>'reason',''))>2000 then raise exception 'Geen notificatiedelegatierecht of ongeldige wijziging' using errcode='42501';end if;
 expected:=(p->>'expected_revision')::bigint;if expected is null or expected<0 then raise exception 'Revisie vereist' using errcode='23514';end if;
 if cmd='grant_save' then
  uid:=(p->>'user_id')::uuid;cap:=p->>'capability';requested_scope:=p->'scope';
  if uid is null or uid=actor then raise exception 'Geen eigen uitbreiding van notificatierechten' using errcode='42501';end if;
  select * into c from public.permission_catalog where key=cap and module='notifications' and domain=case ctx when 'platform' then 'platform' else 'tenant' end and key like case ctx when 'platform' then 'platform.notifications.%' else 'notifications.%' end;
  if not found then raise exception 'Onbekend notificatierecht voor deze omgeving' using errcode='23514';end if;
  if exists(select 1 from jsonb_object_keys(requested_scope)k where k not in ('all','personnel_ids','object_ids','customer_ids','tenant_ids')) then raise exception 'Onbekend notificatiebereik' using errcode='23514';end if;
  perform private.ticket_scope_validate(t,requested_scope,c.domain);
  if not private.ticket_scope_contains(parent_scope,requested_scope) then raise exception 'Bereik valt buiten uw delegatiebevoegdheid' using errcode='42501';end if;
  if ctx='backoffice' and not exists(select 1 from public.tenant_memberships m join auth.users u on u.id=m.user_id where m.tenant_id=t and m.user_id=uid and m.status='active' and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())) then raise exception 'Actief lidmaatschap nodig' using errcode='23514';end if;
  if ctx='platform' and not exists(select 1 from auth.users u where u.id=uid and u.deleted_at is null and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now()) and (exists(select 1 from public.platform_admins a where a.user_id=u.id) or exists(select 1 from public.permission_grants pg where pg.user_id=u.id and pg.tenant_id is null and pg.enabled))) then raise exception 'Actief platformaccount nodig' using errcode='23514';end if;
  foreach dep in array c.dependencies loop
   if not exists(select 1 from public.permission_grants d where d.user_id=uid and d.tenant_id is not distinct from t and d.capability=dep and d.enabled and private.ticket_scope_contains(d.scope,requested_scope)) then raise exception 'Benodigd afhankelijk recht ontbreekt' using errcode='23514';end if;
  end loop;
 else
  select * into g from public.permission_grants where id=(p->>'grant_id')::uuid and tenant_id is not distinct from t;
  if not found or g.user_id=actor or not private.ticket_scope_contains(parent_scope,g.scope) or not exists(select 1 from public.permission_catalog where key=g.capability and module='notifications' and domain=case ctx when 'platform' then 'platform' else 'tenant' end) then raise exception 'Geen toegang tot dit notificatierecht' using errcode='42501';end if;
 end if;
end$$;

create or replace function private.notification_permissions_query(t uuid,ctx text,actor uuid,p jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare parent_scope jsonb;members jsonb;grants jsonb;catalog jsonb;options jsonb;
begin
 parent_scope:=private.notification_delegation_scope(t,ctx,actor);if parent_scope is null then raise exception 'Geen notificatiedelegatierecht' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'label',coalesce((select pe.full_name from public.personnel pe where pe.tenant_id=t and pe.user_id=u.id limit 1),nullif(u.raw_user_meta_data->>'full_name',''),'Gebruiker '||left(u.id::text,8)))),'[]'::jsonb) into members from auth.users u where u.id<>actor and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()) and
 case ctx when 'platform' then u.email_confirmed_at is not null and (exists(select 1 from public.platform_admins a where a.user_id=u.id) or exists(select 1 from public.permission_grants g where g.user_id=u.id and g.tenant_id is null and g.enabled)) else exists(select 1 from public.tenant_memberships m where m.user_id=u.id and m.tenant_id=t and m.status='active') end;
 select coalesce(jsonb_agg(jsonb_build_object('key',c.key,'label',c.name,'description',c.description,'sensitive',c.sensitive,'dependencies',c.dependencies,'scopes',c.scopes)),'[]'::jsonb) into catalog from public.permission_catalog c where c.module='notifications' and c.domain=case ctx when 'platform' then 'platform' else 'tenant' end;
 select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'user_id',g.user_id,'user_label',coalesce((select x->>'label' from jsonb_array_elements(members)x where x->>'id'=g.user_id::text),'Eigen account'),'capability',g.capability,'scope',g.scope,'active',g.enabled,'revision',g.revision,'can_revoke',g.user_id<>actor)),'[]'::jsonb) into grants from public.permission_grants g join public.permission_catalog c on c.key=g.capability where g.tenant_id is not distinct from t and c.module='notifications' and private.ticket_scope_contains(parent_scope,g.scope);
 select jsonb_build_object('personnel',case when ctx='backoffice' then (select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'label',x.full_name)),'[]'::jsonb) from public.personnel x where x.tenant_id=t and x.status='active' and(not(parent_scope?'personnel_ids') or parent_scope->'personnel_ids'?x.id::text)) else '[]'::jsonb end,'objects',case when ctx='backoffice' then (select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'label',x.name)),'[]'::jsonb) from public.objects x where x.tenant_id=t and x.dossier_status<>'archived' and(not(parent_scope?'object_ids') or parent_scope->'object_ids'?x.id::text) and(not(parent_scope?'customer_ids') or parent_scope->'customer_ids'?x.customer_id::text)) else '[]'::jsonb end,'customers',case when ctx='backoffice' then (select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'label',x.name)),'[]'::jsonb) from public.customers x where x.tenant_id=t and(not(parent_scope?'customer_ids') or parent_scope->'customer_ids'?x.id::text)) else '[]'::jsonb end,'tenants',case when ctx='platform' then (select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'label',x.name)),'[]'::jsonb) from public.tenants x where x.status='active' and(not(parent_scope?'tenant_ids') or parent_scope->'tenant_ids'?x.id::text)) else '[]'::jsonb end) into options;
 return jsonb_build_object('members',members,'catalog',catalog,'grants',grants,'scope_options',options,'delegation_scope',parent_scope,'audit',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'label',case a.action when 'grant_save' then 'Notificatierecht toegekend of aangepast' else 'Notificatierecht ingetrokken' end,'created_at',a.created_at,'actor_name',case when a.actor_id=actor then 'U' else 'Bevoegd beheerder' end)),'[]'::jsonb) from (select * from private.notification_audit where tenant_id is not distinct from t and action in ('grant_save','grant_revoke') order by created_at desc limit 100)a));
end$$;

create or replace function public.notification_verification(target_tenant uuid,actor_context text,actor uuid,session_id uuid,operation text,input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare challenge private.notification_verifications;cid uuid;secret_key bytea;recipient text;code text;
begin
 if not private.ticket_session_active(actor,session_id) or private.notification_delegation_scope(target_tenant,actor_context,actor) is null or jsonb_typeof(input)<>'object' then raise exception 'Geen notificatiedelegatierecht' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('notification-verification:'||actor::text,0));
 select secret into secret_key from private.ticket_verification_key where singleton;
 if operation='request' then
  perform private.notification_permission_validate(target_tenant,actor_context,actor,input->>'action',input->'payload');
  if input->>'code' is null or input->>'code' !~ '^[0-9]{6}$' then raise exception 'Ongeldige verificatie' using errcode='23514';end if;
  if (select count(*) from private.notification_verifications where actor_id=actor and created_at>now()-interval '10 minutes')>=3 then raise exception 'Wacht voordat u opnieuw bevestigt' using errcode='54000';end if;
  select email into recipient from auth.users where id=actor and email_confirmed_at is not null;if recipient is null then raise exception 'Bevestigd e-mailadres nodig' using errcode='42501';end if;
  cid:=gen_random_uuid();
  insert into private.notification_verifications(id,tenant_id,actor_id,session_id,context,action,payload_hash,code_hash) values(cid,target_tenant,actor,session_id,actor_context,input->>'action',encode(extensions.digest(((input->'payload')-'verification_id')::text,'sha256'),'hex'),encode(extensions.hmac(cid::text||':'||(input->>'code'),encode(secret_key,'hex'),'sha256'),'hex'));
  return jsonb_build_object('challenge_id',cid,'expires_at',now()+interval '5 minutes','email',recipient);
 end if;
 select * into challenge from private.notification_verifications v where v.id=(input->>'challenge_id')::uuid and v.actor_id=actor and v.session_id=notification_verification.session_id and v.context=actor_context and v.tenant_id is not distinct from target_tenant for update;
 if not found or challenge.consumed_at is not null or challenge.expires_at<=now() or challenge.attempts>=5 then raise exception 'Verificatie verlopen' using errcode='42501';end if;
 if operation='delivered' then update private.notification_verifications set delivered=coalesce((input->>'delivered')::boolean,false),expires_at=case when input->>'delivered'='true' then expires_at else now() end where id=challenge.id;return jsonb_build_object('ok',true);end if;
 if operation<>'confirm' or not challenge.delivered then raise exception 'Verificatie niet beschikbaar' using errcode='42501';end if;
 code:=input->>'code';
 if code is null or code !~ '^[0-9]{6}$' or challenge.code_hash<>encode(extensions.hmac(challenge.id::text||':'||code,encode(secret_key,'hex'),'sha256'),'hex') then update private.notification_verifications set attempts=attempts+1 where id=challenge.id;return jsonb_build_object('error','Ongeldige bevestigingscode');end if;
 update private.notification_verifications set verified_at=now(),expires_at=least(created_at+interval '10 minutes',now()+interval '5 minutes') where id=challenge.id;
 return jsonb_build_object('verification_id',challenge.id,'expires_at',least(challenge.created_at+interval '10 minutes',now()+interval '5 minutes'));
end$$;

create or replace function private.notification_permissions_command(t uuid,ctx text,actor uuid,cmd text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
<<notification_permissions_command>>
declare g public.permission_grants;uid uuid;cap text;mid uuid;expected bigint:=(p->>'expected_revision')::bigint;result_id uuid;revision_number integer;
begin
 if not private.ticket_session_active(actor,nullif(auth.jwt()->>'session_id','')::uuid) then raise exception 'Actuele sessie vereist' using errcode='42501';end if;
 perform private.notification_permission_validate(t,ctx,actor,cmd,p);
 update private.notification_verifications v set consumed_at=now() where v.id=(p->>'verification_id')::uuid and v.actor_id=actor and v.tenant_id is not distinct from t and v.context=ctx and v.session_id=nullif(auth.jwt()->>'session_id','')::uuid and v.action=cmd and v.verified_at is not null and v.expires_at>now() and v.consumed_at is null and v.payload_hash=encode(extensions.digest((p-'verification_id')::text,'sha256'),'hex');
 if not found then raise exception 'Bevestig deze exacte notificatierechtenwijziging opnieuw' using errcode='42501';end if;
 if cmd='grant_save' then
  uid:=(p->>'user_id')::uuid;cap:=p->>'capability';
  perform pg_advisory_xact_lock(hashtextextended('notification-grant:'||coalesce(t::text,'platform')||':'||uid::text||':'||cap,0));
  select * into g from public.permission_grants pg where pg.user_id=uid and pg.capability=cap and pg.tenant_id is not distinct from t for update;
  if expected is distinct from (case when found then g.revision else 0 end) then raise exception 'Notificatierecht gewijzigd; vernieuw en verifieer opnieuw' using errcode='40001';end if;
  if g.id is null then
   if ctx='backoffice' then select m.id into mid from public.tenant_memberships m where m.tenant_id=t and m.user_id=uid and m.status='active';end if;
   insert into public.permission_grants(tenant_id,user_id,membership_id,capability,scope,created_by,source) values(t,uid,mid,cap,p->'scope',actor,'explicit') returning id,revision into result_id,revision_number;
  else update public.permission_grants set scope=p->'scope',enabled=true,revision=revision+1,updated_at=now(),created_by=actor,source='explicit' where id=g.id returning id,revision into result_id,revision_number;end if;
 else
  select * into g from public.permission_grants pg where pg.id=(p->>'grant_id')::uuid and pg.tenant_id is not distinct from t for update;
  if expected is distinct from g.revision then raise exception 'Notificatierecht gewijzigd; vernieuw en verifieer opnieuw' using errcode='40001';end if;
  update public.permission_grants set enabled=false,revision=revision+1,updated_at=now() where id=g.id returning id,revision into result_id,revision_number;
 end if;
 insert into private.notification_audit(tenant_id,actor_id,action,resource_id,revision,detail) values(t,actor,cmd,result_id,revision_number,jsonb_build_object('reason',left(p->>'reason',2000)));
 return jsonb_build_object('id',result_id,'revision',revision_number);
end$$;

-- Existing ticket delegation is module-specific. Merely adding new catalog
-- rows must never give tickets.permissions authority over notification grants.
do $$declare body text;needle text;replacement text;
begin
 select pg_get_functiondef('private.ticket_config_command(uuid,text,text,jsonb,uuid)'::regprocedure) into body;
 needle:='permission_catalog.key=ticket_config_command.key and domain=';replacement:='permission_catalog.key=ticket_config_command.key and module=''tickets'' and domain=';
 if position(needle in body)>0 then body:=replace(body,needle,replacement);elsif position(replacement in body)=0 then raise exception 'Ticket grant-save guard no longer matches';end if;
 body:=replace(body,'from public.permission_catalog where key=g.capability and module=''tickets''','from public.permission_catalog where permission_catalog.key=g.capability and module=''tickets''');
 needle:='if not found or not private.ticket_scope_contains(parent_scope,g.scope) then';replacement:='if not found or not exists(select 1 from public.permission_catalog where permission_catalog.key=g.capability and module=''tickets'') or not private.ticket_scope_contains(parent_scope,g.scope) then';
 if position(needle in body)>0 then body:=replace(body,needle,replacement);elsif position(replacement in body)=0 then raise exception 'Ticket grant-revoke guard no longer matches';end if;
 execute body;
 select pg_get_functiondef('public.ticket_query(uuid,text,text,jsonb)'::regprocedure) into body;
 needle:='from public.permission_catalog c where c.domain=';replacement:='from public.permission_catalog c where c.module=''tickets'' and c.domain=';
 if position(needle in body)>0 then body:=replace(body,needle,replacement);elsif position(replacement in body)=0 then raise exception 'Ticket catalog guard no longer matches';end if;
 needle:='from public.permission_grants g where g.tenant_id=target_tenant or (ctx=''platform'' and g.tenant_id is null)';replacement:='from public.permission_grants g where exists(select 1 from public.permission_catalog pc where pc.key=g.capability and pc.module=''tickets'') and (g.tenant_id=target_tenant or (ctx=''platform'' and g.tenant_id is null))';
 if position(needle in body)>0 then body:=replace(body,needle,replacement);elsif position(replacement in body)=0 then raise exception 'Ticket grant-list guard no longer matches';end if;
 execute body;
end$$;
revoke all on function private.notification_delegation_scope(uuid,text,uuid),private.notification_permission_validate(uuid,text,uuid,text,jsonb),private.notification_permissions_query(uuid,text,uuid,jsonb),private.notification_permissions_command(uuid,text,uuid,text,jsonb),public.notification_verification(uuid,text,uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.notification_verification(uuid,text,uuid,uuid,text,jsonb) to service_role;

commit;
