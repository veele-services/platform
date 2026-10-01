-- Verified query-first ticket schema, permission catalog and idempotent seeds.
-- CLI-generated migration slot; schema and seed data remain one transaction.
begin;

create table if not exists public.permission_catalog (
 key text primary key, domain text not null check(domain in ('tenant','platform')),
 name text not null, description text not null, module text not null default 'tickets',
 action text not null, scopes text[] not null default array['tenant','category','record'],
 sensitive boolean not null default false, dependencies text[] not null default '{}'
);
create table if not exists public.permission_role_defaults (
 role public.app_role not null, capability text not null references public.permission_catalog(key),
 category_codes text[] not null default '{}', primary key(role,capability)
);
create table if not exists public.permission_grants (
 id uuid primary key default gen_random_uuid(), tenant_id uuid references public.tenants(id),
 user_id uuid not null references auth.users(id), membership_id uuid references public.tenant_memberships(id),
 capability text not null references public.permission_catalog(key), scope jsonb not null default '{"all":true}',
 enabled boolean not null default true, source text not null default 'explicit',
 created_by uuid references auth.users(id), created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), revision integer not null default 1,
 check(jsonb_typeof(scope)='object'), check((tenant_id is null)=(membership_id is null))
);
create unique index if not exists permission_grants_subject_key on public.permission_grants(coalesce(tenant_id,'00000000-0000-0000-0000-000000000000'::uuid),user_id,capability);
create index if not exists permission_grants_membership_idx on public.permission_grants(membership_id);
create index if not exists permission_grants_user_idx on public.permission_grants(user_id,capability) where enabled;
create table if not exists public.ticket_groups (
 id uuid primary key default gen_random_uuid(), tenant_id uuid references public.tenants(id),
 name text not null check(length(name) between 1 and 100), archived_at timestamptz,
 revision integer not null default 1, created_at timestamptz not null default now()
);
create table if not exists public.ticket_group_members (
 group_id uuid not null references public.ticket_groups(id), user_id uuid not null references auth.users(id),
 primary key(group_id,user_id)
);
alter table public.ticket_group_members add column if not exists tenant_id uuid references public.tenants(id) on delete cascade;
update public.ticket_group_members gm set tenant_id=g.tenant_id from public.ticket_groups g where g.id=gm.group_id and gm.tenant_id is null and g.tenant_id is not null;
create table if not exists public.ticket_categories (
 id uuid primary key default gen_random_uuid(), tenant_id uuid references public.tenants(id),
 route text not null check(route in ('internal','platform_support')), code text not null,
 name text not null check(length(name) between 1 and 100), description text not null default '',
 confidential boolean not null default false, archived_at timestamptz,
 default_group_id uuid references public.ticket_groups(id), fallback_group_id uuid references public.ticket_groups(id),
 first_response_minutes integer not null default 480 check(first_response_minutes between 15 and 43200),
 resolution_minutes integer not null default 2400 check(resolution_minutes between 15 and 86400),
 revision integer not null default 1, created_at timestamptz not null default now(),
 check((route='internal' and tenant_id is not null) or (route='platform_support' and tenant_id is null and not confidential))
);
create unique index if not exists ticket_categories_code_key on public.ticket_categories(coalesce(tenant_id,'00000000-0000-0000-0000-000000000000'::uuid),route,code);
create index if not exists ticket_categories_tenant_idx on public.ticket_categories(tenant_id,route);
create table if not exists private.ticket_config (
 scope_key text primary key, revision integer not null default 1,
 settings jsonb not null default '{"timezone":"Europe/Amsterdam","weekdays":[1,2,3,4,5],"opens":"09:00","closes":"17:00","pause_waiting_reporter":true,"pause_waiting_external":false,"auto_close_days":0}',
 updated_at timestamptz not null default now()
);
create table if not exists private.ticket_counters (
 tenant_id uuid not null references public.tenants(id), route text not null,
 value bigint not null default 0, primary key(tenant_id,route)
);
create table if not exists private.ticket_permission_bootstrap (
 membership_id uuid primary key references public.tenant_memberships(id), seeded_at timestamptz not null default now()
);
alter table private.ticket_permission_bootstrap add column if not exists tenant_id uuid references public.tenants(id) on delete cascade;
update private.ticket_permission_bootstrap b set tenant_id=m.tenant_id from public.tenant_memberships m where m.id=b.membership_id and b.tenant_id is null;
alter table private.ticket_permission_bootstrap alter column tenant_id set not null;
alter table private.ticket_config add column if not exists tenant_id uuid references public.tenants(id) on delete cascade;
update private.ticket_config c set tenant_id=t.id from public.tenants t where c.scope_key=t.id::text and c.tenant_id is null;
-- Only configuration/access metadata cascades. Ticket content and audit FKs
-- deliberately remain restrictive, including on real tenant deletion.
alter table public.permission_grants drop constraint if exists permission_grants_tenant_id_fkey;
alter table public.permission_grants add constraint permission_grants_tenant_id_fkey foreign key(tenant_id) references public.tenants(id) on delete cascade;
alter table public.permission_grants drop constraint if exists permission_grants_user_id_fkey;
alter table public.permission_grants add constraint permission_grants_user_id_fkey foreign key(user_id) references auth.users(id) on delete cascade;
alter table public.permission_grants drop constraint if exists permission_grants_membership_id_fkey;
alter table public.permission_grants add constraint permission_grants_membership_id_fkey foreign key(membership_id) references public.tenant_memberships(id) on delete cascade;
alter table private.ticket_permission_bootstrap drop constraint if exists ticket_permission_bootstrap_membership_id_fkey;
alter table private.ticket_permission_bootstrap add constraint ticket_permission_bootstrap_membership_id_fkey foreign key(membership_id) references public.tenant_memberships(id) on delete cascade;
alter table public.ticket_categories drop constraint if exists ticket_categories_tenant_id_fkey;
alter table public.ticket_categories add constraint ticket_categories_tenant_id_fkey foreign key(tenant_id) references public.tenants(id) on delete cascade;
alter table public.ticket_groups drop constraint if exists ticket_groups_tenant_id_fkey;
alter table public.ticket_groups add constraint ticket_groups_tenant_id_fkey foreign key(tenant_id) references public.tenants(id) on delete cascade;
alter table public.ticket_group_members drop constraint if exists ticket_group_members_group_id_fkey;
alter table public.ticket_group_members add constraint ticket_group_members_group_id_fkey foreign key(group_id) references public.ticket_groups(id) on delete cascade;
create table if not exists public.tickets (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 number text not null, route text not null check(route in ('internal','platform_support')),
 category_id uuid not null references public.ticket_categories(id),
 reporter_user_id uuid not null references auth.users(id), reporter_personnel_id uuid,
 reporter_name text not null, title text not null check(length(title) between 3 and 160),
 status text not null default 'new' check(status in ('new','in_progress','waiting_reporter','waiting_external','resolved','closed','cancelled')),
 priority text not null default 'normal' check(priority in ('low','normal','high','urgent')),
 needed_before date, assigned_user_id uuid references auth.users(id), assigned_group_id uuid references public.ticket_groups(id),
 work_order_id uuid, object_id uuid, customer_id uuid, personnel_id uuid,
 context_snapshot jsonb not null default '{}',
 revision bigint not null default 1, audience_revisions jsonb not null default '{"reporter":1,"tenant":1,"platform":1}',
 audience_activity jsonb not null default '{}',
 first_response_due_at timestamptz, resolution_due_at timestamptz, first_response_at timestamptz,
 wait_started_at timestamptz, resolved_at timestamptz, closed_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 archived_at timestamptz, unique(tenant_id,id), unique(tenant_id,number),
 foreign key(tenant_id,reporter_personnel_id) references public.personnel(tenant_id,id),
 foreign key(tenant_id,personnel_id) references public.personnel(tenant_id,id),
 foreign key(tenant_id,work_order_id) references public.work_orders(tenant_id,id),
 foreign key(tenant_id,object_id) references public.objects(tenant_id,id),
 foreign key(tenant_id,customer_id) references public.customers(tenant_id,id)
);
create index if not exists tickets_tenant_created_idx on public.tickets(tenant_id,route,created_at desc,id);
create index if not exists tickets_reporter_idx on public.tickets(tenant_id,reporter_user_id,created_at desc);
create index if not exists tickets_assignment_idx on public.tickets(assigned_user_id,tenant_id);
create index if not exists tickets_category_idx on public.tickets(category_id);
create index if not exists tickets_object_idx on public.tickets(tenant_id,object_id);
create index if not exists tickets_work_order_idx on public.tickets(tenant_id,work_order_id);
create index if not exists tickets_customer_idx on public.tickets(tenant_id,customer_id);
create index if not exists tickets_personnel_idx on public.tickets(tenant_id,personnel_id);
create table if not exists public.ticket_messages (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, ticket_id uuid not null,
 author_user_id uuid not null references auth.users(id), author_name text not null,
 audience text not null check(audience in ('reporter','tenant','platform')),
 body text not null check(length(body) between 1 and 20000), created_at timestamptz not null default now(),
 foreign key(tenant_id,ticket_id) references public.tickets(tenant_id,id), unique(tenant_id,id)
);
create index if not exists ticket_messages_parent_idx on public.ticket_messages(ticket_id,created_at,id);
alter table public.ticket_messages add column if not exists author_context text not null default 'staff';
alter table public.ticket_messages alter column created_at set default clock_timestamp();
alter table public.tickets add column if not exists resolution_message_id uuid references public.ticket_messages(id);
alter table public.tickets add column if not exists next_step_message_id uuid references public.ticket_messages(id);
create table if not exists public.ticket_events (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, ticket_id uuid not null,
 audience text not null check(audience in ('reporter','tenant','platform')), type text not null,
 label text not null, actor_user_id uuid references auth.users(id), created_at timestamptz not null default now(),
 foreign key(tenant_id,ticket_id) references public.tickets(tenant_id,id)
);
create index if not exists ticket_events_parent_idx on public.ticket_events(ticket_id,created_at,id);
create table if not exists private.ticket_reads (
 ticket_id uuid not null references public.tickets(id), user_id uuid not null references auth.users(id),
 context text not null, revision bigint not null, read_at timestamptz not null default now(),
 primary key(ticket_id,user_id,context)
);
create table if not exists private.ticket_links (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 source_ticket_id uuid not null references public.tickets(id), support_ticket_id uuid not null unique references public.tickets(id),
 shared_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create index if not exists ticket_links_source_idx on private.ticket_links(source_ticket_id);
create table if not exists private.ticket_receipts (
 request_id uuid primary key, actor_id uuid not null references auth.users(id), tenant_id uuid,
 context text not null, command text not null, payload jsonb not null, result jsonb not null,
 created_at timestamptz not null default now()
);
create index if not exists ticket_receipts_rate_idx on private.ticket_receipts(actor_id,created_at);
create table if not exists private.ticket_audit (
 id uuid primary key default gen_random_uuid(), tenant_id uuid references public.tenants(id),
 actor_id uuid not null references auth.users(id), action text not null, target_id uuid,
 detail jsonb not null default '{}', created_at timestamptz not null default now()
);
create index if not exists ticket_audit_scope_idx on private.ticket_audit(tenant_id,created_at desc);
create table if not exists private.ticket_verifications (
 id uuid primary key default gen_random_uuid(), tenant_id uuid references public.tenants(id),
 actor_id uuid not null references auth.users(id), session_id uuid not null, action text not null,
 payload_hash text not null, code_hash text not null, attempts integer not null default 0,
 delivered boolean not null default false, verified_at timestamptz, consumed_at timestamptz,
 expires_at timestamptz not null default now()+interval '5 minutes', created_at timestamptz not null default now()
);
create index if not exists ticket_verification_actor_idx on private.ticket_verifications(actor_id,created_at);
create table if not exists private.ticket_redactions (
 message_id uuid primary key references public.ticket_messages(id), actor_id uuid not null references auth.users(id),
 reason text not null, created_at timestamptz not null default now()
);
alter table public.tickets add column if not exists next_step text;
alter table public.tickets add column if not exists paused_minutes jsonb;
alter table public.tickets add column if not exists module text not null default 'overig';
alter table public.tickets add column if not exists technical_context jsonb not null default '{}';
alter table public.tickets drop constraint if exists tickets_priority_check;
update public.tickets set priority='critical' where priority='urgent';
alter table public.tickets add constraint tickets_priority_check check(priority in ('low','normal','high','critical'));
alter table public.tickets drop constraint if exists tickets_title_check;
alter table public.tickets add constraint tickets_title_check check(length(title) between 3 and 180);
do $$begin if exists(select 1 from information_schema.columns where table_schema='public' and table_name='tickets' and column_name='needed_before' and data_type='date') then alter table public.tickets alter column needed_before type timestamptz using needed_before::timestamp at time zone 'Europe/Amsterdam';end if;end$$;
alter table public.ticket_categories add column if not exists default_assignee_id uuid references auth.users(id);
alter table public.ticket_categories add column if not exists fallback_category_id uuid references public.ticket_categories(id);
alter table public.ticket_categories add column if not exists sort_order integer not null default 0;
alter table public.ticket_categories add column if not exists auto_close_days integer;
alter table public.ticket_categories add column if not exists pause_while_waiting boolean not null default true;
alter table public.ticket_categories add column if not exists can_escalate boolean not null default true;
alter table public.ticket_categories add column if not exists retention_profile text;
alter table public.ticket_categories drop constraint if exists ticket_categories_config_bounds;
alter table public.ticket_categories add constraint ticket_categories_config_bounds check((auto_close_days is null or auto_close_days between 1 and 365) and sort_order between 0 and 1000 and length(description)<=500 and (retention_profile is null or length(retention_profile)<=200));
alter table public.ticket_categories drop constraint if exists ticket_categories_first_response_minutes_check;
alter table public.ticket_categories add constraint ticket_categories_first_response_minutes_check check(first_response_minutes between 1 and 100000);
alter table public.ticket_categories drop constraint if exists ticket_categories_resolution_minutes_check;
alter table public.ticket_categories add constraint ticket_categories_resolution_minutes_check check(resolution_minutes between 1 and 100000);
create table if not exists private.ticket_verification_key (
 singleton boolean primary key default true check(singleton), secret bytea not null
);
insert into private.ticket_verification_key(secret) values(extensions.gen_random_bytes(32)) on conflict do nothing;

insert into public.permission_catalog(key,domain,name,description,action,sensitive,dependencies)
select 'tickets.internal.'||v.key,'tenant',v.name,v.description,v.key,v.key='hr',case when v.key='read' then '{}'::text[] else array['tickets.internal.read'] end
from (values
 ('read','Personeelsmeldingen lezen','Alleen binnen de toegewezen categorie- en recordscope.'),
 ('reply','Personeelsmeldingen beantwoorden','Openbare antwoorden aan de melder.'),
 ('note','Interne notities','Tenantnotities lezen en schrijven; nooit automatisch delen.'),
 ('manage','Personeelsmeldingen behandelen','Status, prioriteit en categorie aanpassen.'),
 ('assign','Behandelaars toewijzen','Toewijzing verleent geen lees- of behandelrecht.'),
 ('close','Personeelsmeldingen sluiten','Oplossen, sluiten en heropenen met reden.'),
 ('share','Delen met Fieldgrid','Geselecteerde niet-HR-inhoud doorsturen met afzonderlijk supportrecht.'),
 ('hr','Vertrouwelijke HR-meldingen','Extra vereiste bovenop het normale ticketrecht; eigen scope blijft bepalend.')
) v(key,name,description) on conflict do nothing;
insert into public.permission_catalog(key,domain,name,description,action,sensitive,dependencies)
select 'tickets.support.'||v.key,'tenant',v.name,v.description,v.key,true,case when v.key in ('create','read') then '{}'::text[] else array['tickets.support.read'] end
from (values ('create','Fieldgrid-support starten','Een nieuwe vraag aan Fieldgrid indienen.'),('read','Fieldgrid-support lezen','Alleen supporttickets binnen de expliciete scope.'),('reply','Fieldgrid-support beantwoorden','Reageren namens de tenant.'),('note','Tenantnotities bij support','Alleen voor bevoegde tenantcontacten; niet zichtbaar voor Fieldgrid.'),('manage','Fieldgrid-support beheren','Tenantzijde opvolgen, sluiten en heropenen.'))v(key,name,description) on conflict do nothing;
insert into public.permission_catalog(key,domain,name,description,action,sensitive,dependencies) values
 ('tickets.config','tenant','Meldingen configureren','Categorieën en routing beheren, zonder inhoudelijk leesrecht.','config',false,'{}'),
 ('tickets.permissions','tenant','Ticketrechten delegeren','Begrensde rechten toekennen na recente verificatie; geen zelfuitbreiding.','permissions',true,'{}')
on conflict do nothing;
insert into public.permission_catalog(key,domain,name,description,action,sensitive,dependencies) values
 ('tickets.redact','tenant','Berichten afschermen','Ongewenste persoonsgegevens afschermen met behoud van afgeschermde audit.','redact',true,'{}'),
 ('platform.support.redact','platform','Supportberichten afschermen','Alleen expliciet gedeelde supportberichten afschermen.','redact',true,array['platform.support.read']) on conflict do nothing;
insert into public.permission_catalog(key,domain,name,description,action,sensitive,dependencies) values
 ('tickets.internal.critical','tenant','Kritieke personeelsprioriteit','Alleen een bevoegde behandelaar mag kritieke bedrijfsimpact vaststellen.','critical',true,array['tickets.internal.read','tickets.internal.manage']),
 ('tickets.support.critical','tenant','Kritieke supportprioriteit','Kritieke impact namens de tenant vaststellen.','critical',true,array['tickets.support.read','tickets.support.manage']),
 ('platform.support.critical','platform','Kritieke platformprioriteit','Kritieke impact van gedeelde support vaststellen.','critical',true,array['platform.support.read','platform.support.manage']) on conflict do nothing;
insert into public.permission_catalog(key,domain,name,description,action,sensitive,dependencies)
select 'platform.support.'||v.key,'platform',v.name,v.description,v.key,true,case when v.key in ('read','config','permissions') then '{}'::text[] else array['platform.support.read'] end
from (values ('read','Gedeelde support lezen','Uitsluitend expliciet gedeelde platform-supporttickets.'),('reply','Platform-support beantwoorden','Antwoorden op gedeelde supporttickets.'),('note','Platformnotities','Alleen platforminterne notities op toegestane supporttickets.'),('manage','Platform-support behandelen','Toewijzen, prioriteren, oplossen en sluiten.'),('config','Support configureren','Technische configuratie zonder supportinhoud.'),('permissions','Platform-supportrechten delegeren','Expliciete delegatie na verificatie; geen eigen uitbreiding.'))v(key,name,description) on conflict do nothing;

insert into public.permission_role_defaults(role,capability,category_codes)
select r::public.app_role,c.key,'{}'::text[] from unnest(array['tenant_admin','management','planner'])r cross join public.permission_catalog c
where c.key in ('tickets.internal.read','tickets.internal.reply','tickets.internal.note','tickets.internal.manage','tickets.internal.assign','tickets.internal.close') on conflict do nothing;
insert into public.permission_role_defaults(role,capability,category_codes)
select r::public.app_role,c,'{}'::text[] from unnest(array['tenant_admin','management'])r cross join unnest(array['tickets.config','tickets.permissions'])c on conflict do nothing;
insert into public.permission_role_defaults(role,capability,category_codes)
select 'finance',c,array['hours'] from unnest(array['tickets.internal.read','tickets.internal.reply','tickets.internal.note','tickets.internal.manage'])c on conflict do nothing;
insert into public.permission_role_defaults(role,capability,category_codes)
select 'hr',c,array['hr','hours'] from unnest(array['tickets.internal.read','tickets.internal.reply','tickets.internal.note','tickets.internal.manage','tickets.internal.assign','tickets.internal.close','tickets.internal.hr'])c on conflict do nothing;

create or replace function private.ticket_seed(t uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 insert into public.ticket_categories(tenant_id,route,code,name,description,confidential)
 select t,'internal',v.code,v.name,v.description,v.code='hr' from (values
 ('planning','Planning en werkbonnen','Rooster, inzet en uitvoering.'),('object','Objecten en instructies','Instructies en werklocaties.'),
 ('materials','Materialen en schade','Materiaal, middelen en schade melden.'),('hours','Uren en declaraties','Urenregistratie en onkosten.'),
 ('hr','Vertrouwelijk HR','Alleen bevoegde HR-behandelaars binnen hun scope.'),('technical','App en techniek','Problemen met de toepassing.'),('other','Overig','Overige personeelsvragen.')
 )v(code,name,description) on conflict do nothing;
 insert into private.ticket_config(scope_key,tenant_id,settings) select t::text,t,jsonb_build_object('timezone',timezone,'weekdays',jsonb_build_array(1,2,3,4,5),'opens','09:00','closes','17:00','pause_waiting_reporter',true,'pause_waiting_external',false,'auto_close_days',0) from public.tenants where id=t on conflict do nothing;
end $$;
select private.ticket_seed(id) from public.tenants;
insert into public.ticket_categories(route,code,name,description) values
 ('platform_support','technical','Technische storing','Probleem of storing in Fieldgrid.'),('platform_support','usage','Gebruik en inrichting','Vragen over gebruik of inrichting.'),
 ('platform_support','billing','Abonnement en facturatie','Vragen over het Fieldgrid-abonnement.'),('platform_support','feature','Verbetering of wens','Een productwens voor Fieldgrid.') on conflict do nothing;
insert into private.ticket_config(scope_key) values('platform') on conflict do nothing;
create or replace function private.ticket_tenant_init() returns trigger language plpgsql security definer set search_path='' as $$begin perform private.ticket_seed(new.id);return new;end$$;
drop trigger if exists ticket_tenant_initialize on public.tenants;
create trigger ticket_tenant_initialize after insert on public.tenants for each row execute function private.ticket_tenant_init();

-- Presets are materialized, never dynamically OR-ed with mutable membership roles.
create or replace function private.ticket_seed_membership(m uuid) returns void language plpgsql security definer set search_path='' as $$
declare x public.tenant_memberships; v record; ids jsonb;
begin
 select * into x from public.tenant_memberships where id=m;
 if not found then return;end if;
 insert into private.ticket_permission_bootstrap(membership_id,tenant_id) values(m,x.tenant_id) on conflict do nothing;
 if not found then return;end if;
 for v in select capability,bool_or(cardinality(category_codes)=0) broad,array_agg(distinct code) filter(where code is not null) codes
  from public.permission_role_defaults d left join lateral unnest(d.category_codes) code on true where d.role=any(x.roles) group by capability loop
  select coalesce(jsonb_agg(id),'[]') into ids from public.ticket_categories where tenant_id=x.tenant_id and code=any(v.codes);
  insert into public.permission_grants(tenant_id,user_id,membership_id,capability,scope,source)
  values(x.tenant_id,x.user_id,x.id,v.capability,case when v.broad then '{"all":true}'::jsonb else jsonb_build_object('category_ids',ids) end,'bootstrap') on conflict do nothing;
 end loop;
end$$;
select private.ticket_seed_membership(id) from public.tenant_memberships;
insert into public.permission_grants(user_id,capability,scope,source)
select a.user_id,c,'{"all":true}','bootstrap' from public.platform_admins a cross join unnest(array['platform.support.config','platform.support.permissions'])c on conflict do nothing;
create or replace function private.ticket_membership_identity() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.tenant_id is distinct from old.tenant_id or new.user_id is distinct from old.user_id or new.id is distinct from old.id then raise exception 'Lidmaatschapsidentiteit is onveranderlijk' using errcode='23514';end if;
 return new;
end$$;
drop trigger if exists ticket_membership_identity on public.tenant_memberships;
create trigger ticket_membership_identity before update on public.tenant_memberships for each row execute function private.ticket_membership_identity();

alter table public.tenant_settings drop constraint if exists tenant_settings_enabled_services_valid;
alter table public.tenant_settings add constraint tenant_settings_enabled_services_valid check(enabled_services <@ array['planning','personeel','rapportage','finance','tickets']::text[] and cardinality(enabled_services)<=5);

create or replace function private.ticket_session_active(actor uuid,session uuid) returns boolean language sql stable security definer set search_path='' as $$
 select actor is not null and session is not null and exists(select 1 from auth.sessions s join auth.users u on u.id=s.user_id where s.id=session and s.user_id=actor and (s.not_after is null or s.not_after>now()) and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()) and not coalesce(u.is_anonymous,false))
$$;
create or replace function private.ticket_actor_active(t uuid,ctx text,actor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(actor is not null and ctx in ('staff','tenant','support','platform') and exists(select 1 from auth.users u where u.id=actor and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()) and not coalesce(u.is_anonymous,false))
 and ((ctx='platform' and (t is null or exists(select 1 from public.tenants x join public.tenant_settings s on s.tenant_id=x.id where x.id=t and x.status='active' and 'tickets'=any(s.enabled_services))))
 or (ctx<>'platform' and exists(select 1 from public.tenant_memberships m join public.tenants x on x.id=m.tenant_id join public.tenant_settings s on s.tenant_id=x.id where m.tenant_id=t and m.user_id=actor and m.status='active' and x.status='active' and 'tickets'=any(s.enabled_services))
 and (ctx<>'staff' or exists(select 1 from public.personnel p where p.tenant_id=t and p.user_id=actor and p.status='active')))),false)
$$;
create or replace function private.ticket_has_cap(t uuid,actor uuid,cap text,category uuid default null,person uuid default null,obj uuid default null,customer uuid default null,assigned uuid default null) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.permission_grants g join public.permission_catalog c on c.key=g.capability
 left join public.tenant_memberships m on m.id=g.membership_id and m.tenant_id=g.tenant_id and m.user_id=g.user_id
 where g.user_id=actor and g.capability=cap and g.enabled and ((c.domain='platform' and g.tenant_id is null) or (c.domain='tenant' and g.tenant_id=t and m.status='active'))
 and (not(g.scope?'tenant_ids') or g.scope->'tenant_ids' ? t::text)
 and (not(g.scope?'category_ids') or g.scope->'category_ids' ? category::text)
 and (not(g.scope?'personnel_ids') or g.scope->'personnel_ids' ? person::text)
 and (not(g.scope?'object_ids') or g.scope->'object_ids' ? obj::text)
 and (not(g.scope?'customer_ids') or g.scope->'customer_ids' ? customer::text)
 and (not coalesce((g.scope->>'assigned_only')::boolean,false) or assigned=actor)
 and (g.scope->>'all'='true' or g.scope ?| array['tenant_ids','category_ids','personnel_ids','object_ids','customer_ids','assigned_only']))
$$;
create or replace function private.ticket_allowed(tid uuid,ctx text,action text,actor uuid default auth.uid()) returns boolean language plpgsql stable security definer set search_path='' as $$
declare t public.tickets; c public.ticket_categories; cap text;
begin
 select * into t from public.tickets where id=tid;if not found or not private.ticket_actor_active(t.tenant_id,ctx,actor) then return false;end if;
 select * into c from public.ticket_categories where id=t.category_id;
 if ctx='staff' then return t.route='internal' and t.reporter_user_id=actor and exists(select 1 from public.personnel p where p.id=t.reporter_personnel_id and p.tenant_id=t.tenant_id and p.user_id=actor and p.status='active') and action in ('read','reply','close');end if;
 if ctx='tenant' and t.route='internal' then
  if c.confidential and not private.ticket_has_cap(t.tenant_id,actor,'tickets.internal.hr',t.category_id,t.personnel_id,t.object_id,t.customer_id,t.assigned_user_id) then return false;end if;
  cap:='tickets.internal.'||action;
 elsif ctx='support' and t.route='platform_support' then cap:='tickets.support.'||case when action in ('assign','close') then 'manage' else action end;
 elsif ctx='platform' and t.route='platform_support' then cap:='platform.support.'||case when action in ('assign','close') then 'manage' else action end;
 else return false;end if;
 return private.ticket_has_cap(t.tenant_id,actor,cap,t.category_id,t.personnel_id,t.object_id,t.customer_id,t.assigned_user_id)
 and (action='read' or private.ticket_has_cap(t.tenant_id,actor,case when ctx='tenant' then 'tickets.internal.read' when ctx='support' then 'tickets.support.read' else 'platform.support.read' end,t.category_id,t.personnel_id,t.object_id,t.customer_id,t.assigned_user_id));
end$$;
create or replace function private.ticket_create_allowed(t uuid,category uuid,ctx text,actor uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare c public.ticket_categories;
begin
 if not private.ticket_actor_active(t,ctx,actor) then return false;end if;
 select * into c from public.ticket_categories where id=category and archived_at is null;if not found then return false;end if;
 if ctx='staff' then return c.route='internal' and c.tenant_id=t;end if;
 if ctx='support' then return c.route='platform_support' and private.ticket_has_cap(t,actor,'tickets.support.create',category);end if;
 return false;
end$$;
create or replace function private.ticket_message_allowed(mid uuid,ctx text,actor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.ticket_messages m where m.id=mid and private.ticket_allowed(m.ticket_id,ctx,'read',actor) and (m.audience='reporter' or (m.audience='tenant' and ctx in ('tenant','support') and private.ticket_allowed(m.ticket_id,ctx,'note',actor)) or (m.audience='platform' and ctx='platform' and private.ticket_allowed(m.ticket_id,ctx,'note',actor))))
$$;
create or replace function private.ticket_event_allowed(eid uuid,ctx text,actor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.ticket_events e join public.tickets t on t.id=e.ticket_id where e.id=eid and (e.type<>'deadline_exceeded' or t.status not in ('resolved','closed','cancelled')) and private.ticket_allowed(e.ticket_id,ctx,'read',actor) and (e.audience='reporter' or (e.audience='tenant' and ctx in ('tenant','support') and private.ticket_allowed(e.ticket_id,ctx,'note',actor)) or (e.audience='platform' and ctx='platform' and private.ticket_allowed(e.ticket_id,ctx,'note',actor))))
$$;
create or replace function private.ticket_notification_candidates(tid uuid,aud text) returns table(user_id uuid,context text) language sql stable security definer set search_path='' as $$
 with candidates as (
 select m.user_id,x.ctx from public.tickets t join public.tenant_memberships m on m.tenant_id=t.tenant_id cross join (values('staff'),('tenant'),('support'))x(ctx) where t.id=tid and m.status='active'
 union select g.user_id,'platform' from public.permission_grants g where g.tenant_id is null and g.enabled and g.capability='platform.support.read')
 select c.user_id,c.ctx from candidates c where private.ticket_allowed(tid,c.ctx,'read',c.user_id) and (aud='reporter' or (aud='tenant' and c.ctx in ('tenant','support') and private.ticket_allowed(tid,c.ctx,'note',c.user_id)) or (aud='platform' and c.ctx='platform' and private.ticket_allowed(tid,c.ctx,'note',c.user_id)))
$$;

-- No ordinary role can read raw ticket data or mutate permission rows. All
-- application access goes through the projected, authorizing RPC boundary.
do $$declare n text;begin
 foreach n in array array['permission_catalog','permission_role_defaults','permission_grants','ticket_groups','ticket_group_members','ticket_categories','tickets','ticket_messages','ticket_events'] loop
  execute format('alter table public.%I enable row level security',n);
  execute format('alter table public.%I force row level security',n);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',n);
 end loop;
 foreach n in array array['ticket_config','ticket_counters','ticket_reads','ticket_links','ticket_receipts','ticket_audit','ticket_verifications','ticket_verification_key','ticket_redactions','ticket_permission_bootstrap'] loop
  execute format('alter table private.%I enable row level security',n);
  execute format('alter table private.%I force row level security',n);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',n);
 end loop;
end$$;

-- Delivery integration hooks fail closed until the delivery SQL is installed.
do $install$begin
 if to_regprocedure('private.ticket_attach_to_message(uuid,uuid,uuid[],uuid,text)') is null then
 execute $f$create function private.ticket_attach_to_message(tid uuid,mid uuid,ids uuid[],actor uuid,ctx text) returns void language plpgsql security definer set search_path='' as $b$begin if cardinality(ids)>0 then raise exception 'Bijlagenverwerking niet beschikbaar' using errcode='55000';end if;end$b$$f$;
 end if;
 if to_regprocedure('private.ticket_copy_files(uuid,uuid,uuid,uuid[],uuid,text)') is null then
 execute $f$create function private.ticket_copy_files(src uuid,dst uuid,mid uuid,ids uuid[],actor uuid,ctx text) returns void language plpgsql security definer set search_path='' as $b$begin if cardinality(ids)>0 then raise exception 'Bijlagenverwerking niet beschikbaar' using errcode='55000';end if;end$b$$f$;
 end if;
 if to_regprocedure('private.ticket_message_files(uuid)') is null then
 execute $f$create function private.ticket_message_files(mid uuid) returns jsonb language sql stable security definer set search_path='' as $b$select '[]'::jsonb$b$$f$;
 end if;
 if to_regprocedure('private.ticket_preferences_save(uuid,text,uuid,jsonb)') is null then
 execute $f$create function private.ticket_preferences_save(t uuid,ctx text,actor uuid,input jsonb) returns jsonb language plpgsql security definer set search_path='' as $b$begin if input<>'{}'::jsonb then raise exception 'Notificatievoorkeuren niet beschikbaar' using errcode='55000';end if;return '{"inApp":true,"push":true,"email":true}'::jsonb;end$b$$f$;
 end if;
end$install$;

create or replace function private.ticket_config_allowed(t uuid,ctx text,actor uuid,delegation boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select private.ticket_actor_active(t,ctx,actor) and ((ctx='platform' and private.ticket_has_cap(t,actor,'platform.support.'||case when delegation then 'permissions' else 'config' end)) or (ctx in ('tenant','support') and private.ticket_has_cap(t,actor,'tickets.'||case when delegation then 'permissions' else 'config' end)))
$$;
create or replace function private.ticket_view_audience(tid uuid,ctx text,actor uuid) returns text language sql stable security definer set search_path='' as $$
 select case when ctx='platform' and private.ticket_allowed(tid,ctx,'note',actor) then 'platform' when ctx in ('tenant','support') and private.ticket_allowed(tid,ctx,'note',actor) then 'tenant' else 'reporter' end
$$;
create or replace function private.ticket_view_revision(tid uuid,ctx text,actor uuid) returns bigint language sql stable security definer set search_path='' as $$
 select (audience_revisions->>private.ticket_view_audience(tid,ctx,actor))::bigint from public.tickets where id=tid
$$;
create or replace function private.ticket_business_due(start_at timestamptz,minutes integer,cfg jsonb) returns timestamptz language plpgsql stable set search_path='' as $$
declare tz text:=cfg->>'timezone'; d date; opens time:=(cfg->>'opens')::time; closes time:=(cfg->>'closes')::time; left_minutes numeric:=minutes; a timestamptz; b timestamptz; available numeric;
begin
 if start_at is null or minutes is null or minutes<0 or tz is null or opens>=closes or jsonb_array_length(cfg->'weekdays')=0 then raise exception 'Ongeldige openingstijden' using errcode='23514';end if;
 d:=(start_at at time zone tz)::date;
 for i in 0..800 loop
  if cfg->'weekdays' @> to_jsonb(array[extract(isodow from d)::integer]) then
   a:=greatest(start_at,(d+opens) at time zone tz);b:=(d+closes) at time zone tz;
   available:=greatest(0,extract(epoch from b-a)/60);
   if available>=left_minutes then return a+left_minutes*interval '1 minute';end if;
   left_minutes:=left_minutes-available;
  end if;
  d:=d+1;
 end loop;
 raise exception 'Termijn valt buiten ondersteunde horizon' using errcode='23514';
end$$;
create or replace function private.ticket_emit(tid uuid,aud text,kind text,label_text text,actor uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare t public.tickets; eid uuid:=gen_random_uuid(); stamp timestamptz:=clock_timestamp(); key text; rev jsonb; activity jsonb;
begin
 select * into strict t from public.tickets where id=tid for update;
 rev:=t.audience_revisions;activity:=t.audience_activity;
 foreach key in array case when aud='reporter' then array['reporter','tenant','platform'] else array[aud] end loop
  rev:=jsonb_set(rev,array[key],to_jsonb(coalesce((rev->>key)::bigint,1)+1));activity:=jsonb_set(activity,array[key],to_jsonb(stamp));
 end loop;
 update public.tickets set revision=revision+1,audience_revisions=rev,audience_activity=activity,updated_at=stamp where id=tid;
 insert into public.ticket_events(id,tenant_id,ticket_id,audience,type,label,actor_user_id,created_at) values(eid,t.tenant_id,tid,aud,kind,label_text,actor,stamp);
 insert into public.outbox_events(tenant_id,event_type,aggregate_type,aggregate_id,payload,idempotency_key)
 values(t.tenant_id,'ticket.changed','ticket',tid,jsonb_build_object('ticket_id',tid,'event_id',eid,'actor_id',actor,'audience',aud),'ticket-event:'||eid);
 return eid;
end$$;
create or replace function private.ticket_context_links(tid uuid,ctx text,actor uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t public.tickets; result jsonb:='[]'::jsonb; planning boolean; dossier boolean;
begin
 select * into t from public.tickets where id=tid;
 if ctx='platform' or not private.ticket_allowed(tid,ctx,'read',actor) then return result;end if;
 select exists(select 1 from public.tenant_memberships m join public.tenant_settings s on s.tenant_id=m.tenant_id where m.tenant_id=t.tenant_id and m.user_id=actor and m.status='active' and m.roles&&array['tenant_admin','management','planner']::public.app_role[] and 'planning'=any(s.enabled_services)),exists(select 1 from public.tenant_memberships m join public.tenant_settings s on s.tenant_id=m.tenant_id where m.tenant_id=t.tenant_id and m.user_id=actor and m.status='active' and m.roles&&array['tenant_admin','management','hr']::public.app_role[] and 'personeel'=any(s.enabled_services)) into planning,dossier;
 if t.work_order_id is not null then
  result:=result||jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('kind','work_order','id',t.work_order_id,'label',t.context_snapshot->>'work_order', 'href',case when ctx='staff' and exists(select 1 from public.work_order_assignments a join public.personnel p on p.id=a.personnel_id where a.work_order_id=t.work_order_id and p.user_id=actor and p.status='active' and a.status<>'cancelled') then '/staff?workOrder='||t.work_order_id when planning then '/app/werkbonnen/'||t.work_order_id end)));
 end if;
 if t.object_id is not null then result:=result||jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('kind','object','id',t.object_id,'label',t.context_snapshot->>'object','href',case when planning then '/app/objecten/'||t.object_id end)));end if;
 if t.customer_id is not null then result:=result||jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('kind','customer','id',t.customer_id,'label',t.context_snapshot->>'customer','href',case when planning then '/app/klanten/'||t.customer_id end)));end if;
 if t.personnel_id is not null and ctx<>'staff' then result:=result||jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('kind','personnel','id',t.personnel_id,'label',t.reporter_name,'href',case when dossier then '/app/personeel/'||t.personnel_id end)));end if;
 return result;
end$$;
create or replace function private.ticket_dto(tid uuid,ctx text,actor uuid,detail boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t public.tickets;c public.ticket_categories;rev bigint;aud text;result jsonb; perms jsonb; action_name text; messages jsonb; events jsonb; assignee text; shared jsonb;
begin
 if not private.ticket_allowed(tid,ctx,'read',actor) then raise exception 'Geen toegang tot melding' using errcode='42501';end if;
 select * into strict t from public.tickets where id=tid;select * into c from public.ticket_categories where id=t.category_id;
 aud:=private.ticket_view_audience(tid,ctx,actor);rev:=(t.audience_revisions->>aud)::bigint;
 perms:=jsonb_build_object('reply',private.ticket_allowed(tid,ctx,'reply',actor),'note',private.ticket_allowed(tid,ctx,'note',actor),'manage',private.ticket_allowed(tid,ctx,'manage',actor),'assign',private.ticket_allowed(tid,ctx,'assign',actor),'close',private.ticket_allowed(tid,ctx,'close',actor),'share',ctx='tenant' and not c.confidential and private.ticket_allowed(tid,ctx,'share',actor) and exists(select 1 from public.ticket_categories sc where sc.route='platform_support' and private.ticket_create_allowed(t.tenant_id,sc.id,'support',actor)),'priority',private.ticket_allowed(tid,ctx,'manage',actor),'transfer',private.ticket_allowed(tid,ctx,'manage',actor),'archive',private.ticket_allowed(tid,ctx,'manage',actor),'redact',ctx<>'staff' and private.ticket_has_cap(t.tenant_id,actor,case when ctx='platform' then 'platform.support.redact' else 'tickets.redact' end,t.category_id,t.personnel_id,t.object_id,t.customer_id,t.assigned_user_id),'reopen',private.ticket_allowed(tid,ctx,'close',actor));
 perms:=perms||jsonb_build_object('critical',ctx<>'staff' and t.archived_at is null and t.status not in ('resolved','closed','cancelled') and private.ticket_allowed(tid,ctx,'manage',actor) and private.ticket_has_cap(t.tenant_id,actor,case ctx when 'tenant' then 'tickets.internal.critical' when 'support' then 'tickets.support.critical' else 'platform.support.critical' end,t.category_id,t.personnel_id,t.object_id,t.customer_id,t.assigned_user_id),'resolve',ctx<>'staff' and t.archived_at is null and t.status not in ('resolved','closed','cancelled') and private.ticket_allowed(tid,ctx,'close',actor),'reopen',t.archived_at is null and t.status in ('resolved','closed') and private.ticket_allowed(tid,ctx,'close',actor),'close',t.archived_at is null and t.status='resolved' and private.ticket_allowed(tid,ctx,'close',actor),'archive',t.archived_at is null and t.status in ('closed','cancelled') and private.ticket_allowed(tid,ctx,'manage',actor));
 perms:=perms||jsonb_build_object('cancel',t.archived_at is null and t.status in ('new','in_progress','waiting_reporter','waiting_external') and private.ticket_allowed(tid,ctx,'close',actor));
 foreach action_name in array array['reply','note','manage','assign','priority','transfer','share'] loop
  perms:=jsonb_set(perms,array[action_name],to_jsonb(coalesce((perms->>action_name)::boolean,false) and t.archived_at is null and t.status not in ('closed','cancelled') and (action_name in ('reply','note') or t.status<>'resolved') and (action_name<>'share' or c.can_escalate) and (action_name<>'assign' or ctx<>'support')));
 end loop;
 select p.full_name into assignee from public.personnel p where p.tenant_id=t.tenant_id and p.user_id=t.assigned_user_id and p.status='active' limit 1;
 result:=jsonb_build_object('id',t.id,'tenant_id',t.tenant_id,'number',t.number,'route',t.route,'title',t.title,'module',t.module,'technical_context',t.technical_context,'status',t.status,'priority',t.priority,'needed_before',t.needed_before,
  'category',jsonb_build_object('id',c.id,'name',c.name,'confidential',c.confidential),'reporter',jsonb_build_object('id',case when ctx='platform' then null else t.reporter_user_id end,'name',case when ctx='platform' then 'Tenantcontact' else t.reporter_name end),
  'assigned_user',case when t.assigned_user_id is not null then jsonb_build_object('id',t.assigned_user_id,'name',coalesce(assignee,case when t.route='platform_support' then 'Fieldgrid-support' else 'Behandelaar' end)) end,
  'assigned_group_id',t.assigned_group_id,'assigned_group_name',(select g.name from public.ticket_groups g where g.id=t.assigned_group_id and g.tenant_id is not distinct from case when t.route='platform_support' then null else t.tenant_id end),
  'timezone',(select cfg.settings->>'timezone' from private.ticket_config cfg where cfg.scope_key=case when t.route='platform_support' then 'platform' else t.tenant_id::text end),
  'created_at',t.created_at,'updated_at',coalesce((t.audience_activity->>aud)::timestamptz,t.created_at),'revision',rev,
  'unread',coalesce((select r.revision<rev from private.ticket_reads r where r.ticket_id=tid and r.user_id=actor and r.context=ctx),true),
  'first_response_due_at',t.first_response_due_at,'resolution_due_at',t.resolution_due_at,'deadline_at',case when t.first_response_at is null then t.first_response_due_at else t.resolution_due_at end,
  'next_actor',case when t.status in ('waiting_reporter','resolved') then 'reporter' when t.status='waiting_external' then 'external' when t.status in ('closed','cancelled') then null else 'handler' end,
  'next_step',coalesce(case when not exists(select 1 from private.ticket_redactions rd where rd.message_id=t.next_step_message_id) then t.next_step end,case when t.status='waiting_reporter' then 'Reactie van melder nodig' when t.status='resolved' then 'Bevestig de oplossing' when t.status='waiting_external' then 'Wachten op externe partij' when t.status in ('closed','cancelled') then 'Afgehandeld' else 'Behandeling door bevoegde behandelaar' end),
  'context_links',private.ticket_context_links(tid,ctx,actor),'permissions',perms,'archived',t.archived_at is not null,'closed_at',t.closed_at,'resolution',(select case when exists(select 1 from private.ticket_redactions rd where rd.message_id=m.id) then 'Bericht afgeschermd' else m.body end from public.ticket_messages m where m.id=t.resolution_message_id and private.ticket_message_allowed(m.id,ctx,actor)),'auto_close_at',case when t.resolved_at is not null and c.auto_close_days>0 then t.resolved_at+c.auto_close_days*interval '1 day' end);
 if ctx='platform' then result:=result||jsonb_build_object('tenant_name',(select name from public.tenants where id=t.tenant_id));end if;
 if detail then
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'audience',m.audience,'body',case when exists(select 1 from private.ticket_redactions rd where rd.message_id=m.id) then 'Bericht afgeschermd' else m.body end,'redacted',exists(select 1 from private.ticket_redactions rd where rd.message_id=m.id),'author_name',case when ctx='platform' and m.author_user_id=t.reporter_user_id then 'Tenantcontact' else m.author_name end,'is_own',m.author_user_id=actor,'created_at',m.created_at,'attachments',private.ticket_message_files(m.id)) order by m.created_at,m.id),'[]') into messages from public.ticket_messages m where m.ticket_id=tid and private.ticket_message_allowed(m.id,ctx,actor);
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'type',e.type,'label',e.label,'audience',e.audience,'actor_name',case when e.actor_user_id=actor then 'U' when e.actor_user_id is null then 'Systeem' else 'Behandelaar' end,'created_at',e.created_at) order by e.created_at,e.id),'[]') into events from public.ticket_events e where e.ticket_id=tid and private.ticket_event_allowed(e.id,ctx,actor);
  result:=result||jsonb_build_object('messages',messages,'events',events,'handlers',case when (perms->>'assign')::boolean then coalesce((select jsonb_agg(jsonb_build_object('id',a.user_id,'name',case when a.context='platform' then 'Fieldgrid-support' else coalesce((select p.full_name from public.personnel p where p.tenant_id=t.tenant_id and p.user_id=a.user_id limit 1),'Behandelaar') end)) from private.ticket_notification_candidates(tid,'reporter') a where a.context=ctx and private.ticket_allowed(tid,ctx,'reply',a.user_id)),'[]') else '[]'::jsonb end);
  if ctx='tenant' then
   select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'number',s.number,'status',s.status) order by l.created_at desc),'[]') into shared from private.ticket_links l join public.tickets s on s.id=l.support_ticket_id where l.source_ticket_id=tid and private.ticket_allowed(s.id,'support','read',actor);
   result:=result||jsonb_build_object('linked_support',shared->0,'share_options',case when (perms->>'share')::boolean then coalesce((select jsonb_agg(f) from public.ticket_messages m cross join lateral jsonb_array_elements(private.ticket_message_files(m.id)) f where m.ticket_id=tid and m.audience='reporter'),'[]'::jsonb) else '[]'::jsonb end);
  end if;
  if ctx='support' then result:=result||jsonb_build_object('source_ticket',(select jsonb_build_object('id',s.id,'number',s.number) from private.ticket_links l join public.tickets s on s.id=l.source_ticket_id where l.support_ticket_id=tid and private.ticket_allowed(s.id,'tenant','read',actor)));end if;
 end if;
 return result;
end$$;

create or replace function private.ticket_list(t uuid,ctx text,p jsonb,actor uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare page_num integer:=greatest(1,least(10000,coalesce((p->>'page')::integer,1)));size_num integer:=greatest(1,least(100,coalesce((p->>'page_size')::integer,25)));sort_key text:=coalesce(p->>'sort','attention');direction text:=coalesce(p->>'direction','desc');view_name text:=coalesce(p->>'view','all');result jsonb;
begin
 if sort_key not in ('attention','activity','created','number','subject','priority','status','deadline') or direction not in ('asc','desc') or view_name not in ('all','mine','needs_reply','unassigned','overdue','critical','open','archived') then raise exception 'Ongeldige lijstselectie' using errcode='22023';end if;
 with base as materialized (
  select q.*,coalesce((q.audience_activity->>private.ticket_view_audience(q.id,ctx,actor))::timestamptz,q.created_at) visible_activity,
   case when q.first_response_at is null then q.first_response_due_at else q.resolution_due_at end deadline,
   case q.priority when 'critical' then 4 when 'high' then 3 when 'normal' then 2 else 1 end priority_rank,
   case when ctx in ('staff','support') then q.status in ('waiting_reporter','resolved') else q.status in ('new','in_progress') end needs_reply
  from public.tickets q where (q.tenant_id=t or(ctx='platform' and t is null)) and private.ticket_allowed(q.id,ctx,'read',actor)
  and ((view_name='archived' and q.archived_at is not null) or(view_name<>'archived' and q.archived_at is null))
 ), filtered as materialized (
  select b.* from base b where
  (view_name<>'mine' or b.assigned_user_id=actor or (ctx in ('staff','support') and b.reporter_user_id=actor))
  and(view_name<>'needs_reply' or b.needs_reply) and(view_name<>'unassigned' or(b.assigned_user_id is null and b.assigned_group_id is null))
  and(view_name<>'overdue' or(b.deadline<now() and b.status not in ('resolved','closed','cancelled')))
  and(view_name<>'critical' or b.priority='critical') and(view_name<>'open' or b.status not in ('closed','cancelled'))
  and(nullif(p->>'status','') is null or b.status=p->>'status') and(nullif(p->>'priority','') is null or b.priority=p->>'priority')
  and(nullif(p->>'category_id','') is null or b.category_id=(p->>'category_id')::uuid)
  and(nullif(p->>'assigned_user_id','') is null or b.assigned_user_id=(p->>'assigned_user_id')::uuid)
  and(nullif(p->>'tenant_id','') is null or b.tenant_id=(p->>'tenant_id')::uuid)
  and(nullif(p->>'from','') is null or b.created_at>=(p->>'from')::date) and(nullif(p->>'to','') is null or b.created_at<(p->>'to')::date+1)
  and(nullif(p->>'context_id','') is null or case p->>'context_kind' when 'work_order' then b.work_order_id when 'object' then b.object_id when 'customer' then b.customer_id when 'personnel' then b.personnel_id end=(p->>'context_id')::uuid)
  and(nullif(p->>'search','') is null or b.title ilike '%'||left(p->>'search',160)||'%' or b.number ilike '%'||left(p->>'search',160)||'%' or exists(select 1 from public.ticket_messages m where m.ticket_id=b.id and private.ticket_message_allowed(m.id,ctx,actor) and not exists(select 1 from private.ticket_redactions rd where rd.message_id=m.id) and m.body ilike '%'||left(p->>'search',160)||'%'))
 ), ordered as (
  select f.*,case sort_key when 'attention' then (case when f.status in ('closed','cancelled') then 0 when f.priority='critical' then 100 when f.deadline<now() then 80 when f.needs_reply then 50 else 10 end)::numeric when 'priority' then f.priority_rank::numeric when 'activity' then extract(epoch from f.visible_activity) when 'created' then extract(epoch from f.created_at) when 'deadline' then extract(epoch from f.deadline) end numeric_sort,
   case sort_key when 'number' then f.number when 'subject' then lower(f.title) when 'status' then f.status end text_sort from filtered f
 ), paged as (
  select * from ordered order by case when direction='asc' then numeric_sort end asc nulls last,case when direction='desc' then numeric_sort end desc nulls last,case when direction='asc' then text_sort end asc nulls last,case when direction='desc' then text_sort end desc nulls last,visible_activity desc,id desc limit size_num offset (page_num-1)*size_num
 )
 select jsonb_build_object('items',coalesce((select jsonb_agg(private.ticket_dto(id,ctx,actor,false)) from paged),'[]'),'total',(select count(*) from filtered),'page',page_num,'page_size',size_num,
 'counts',(select jsonb_build_object('open',count(*)filter(where status not in ('closed','cancelled')),'needs_reply',count(*)filter(where needs_reply),'unassigned',count(*)filter(where assigned_user_id is null and assigned_group_id is null),'overdue',count(*)filter(where deadline<now() and status not in ('resolved','closed','cancelled'))) from filtered),
 'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'route',c.route,'active',c.archived_at is null,'confidential',c.confidential)) from public.ticket_categories c where exists(select 1 from base b where b.category_id=c.id)),'[]'),
 'handlers',coalesce((select jsonb_agg(jsonb_build_object('id',x.assigned_user_id,'name',coalesce((select pe.full_name from public.personnel pe where pe.tenant_id=x.tenant_id and pe.user_id=x.assigned_user_id limit 1),'Behandelaar'))) from(select distinct assigned_user_id,tenant_id from base where assigned_user_id is not null)x),'[]'),
 'tenants',case when ctx='platform' then coalesce((select jsonb_agg(jsonb_build_object('id',te.id,'name',te.name)) from public.tenants te where exists(select 1 from base b where b.tenant_id=te.id)),'[]') else '[]'::jsonb end) into result;
 return result;
end$$;

create or replace function public.ticket_query(target_tenant uuid,actor_context text,operation text,payload jsonb default '{}') returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid();ctx text:=actor_context; p jsonb:=coalesce(payload,'{}');result jsonb;categories jsonb;groups jsonb;handlers jsonb;capabilities jsonb;tid uuid;config_ok boolean;grant_ok boolean;route_name text;
begin
 if not private.ticket_session_active(actor,nullif(auth.jwt()->>'session_id','')::uuid) or not private.ticket_actor_active(target_tenant,ctx,actor) or jsonb_typeof(p)<>'object' or length(p::text)>20000 then raise exception 'Geen toegang' using errcode='42501';end if;
 config_ok:=private.ticket_config_allowed(target_tenant,ctx,actor);grant_ok:=private.ticket_config_allowed(target_tenant,ctx,actor,true);
 select coalesce(jsonb_agg(g.capability),'[]') into capabilities from public.permission_grants g where g.user_id=actor and g.enabled and (g.tenant_id=target_tenant or (ctx='platform' and g.tenant_id is null));
 if operation='access' then
  return jsonb_build_object('allowed',ctx='staff' or capabilities ? case ctx when 'tenant' then 'tickets.internal.read' when 'support' then 'tickets.support.read' else 'platform.support.read' end,'can_create',exists(select 1 from public.ticket_categories c where private.ticket_create_allowed(target_tenant,c.id,ctx,actor)),'can_configure',config_ok,'can_delegate',grant_ok,'can_audit',grant_ok,'capabilities',capabilities,'workspaces',jsonb_build_array(ctx));
 end if;
 if operation='detail' then
  tid:=(p->>'ticket_id')::uuid;
  if not exists(select 1 from public.tickets where id=tid and (tenant_id=target_tenant or (target_tenant is null and ctx='platform'))) then raise exception 'Geen toegang tot melding' using errcode='42501';end if;
  return private.ticket_dto(tid,ctx,actor,true);
 end if;
 if operation='response_draft' then
  if ctx<>'support' then raise exception 'Concept alleen voor de tenantcontactpersoon' using errcode='42501';end if;
  select jsonb_build_object('body',m.body,'source_ticket_id',l.source_ticket_id) into result from public.ticket_messages m join private.ticket_links l on l.support_ticket_id=m.ticket_id join public.tickets tt on tt.id=m.ticket_id where tt.tenant_id=target_tenant and m.ticket_id=(p->>'ticket_id')::uuid and m.id=(p->>'message_id')::uuid and m.audience='reporter' and m.author_context='platform' and not exists(select 1 from private.ticket_redactions rd where rd.message_id=m.id) and private.ticket_message_allowed(m.id,ctx,actor) and private.ticket_allowed(l.source_ticket_id,'tenant','reply',actor);
  if result is null then raise exception 'Antwoord of bron is niet toegankelijk' using errcode='42501';end if;return result;
 end if;
 if operation='list' then return private.ticket_list(target_tenant,ctx,p,actor);end if;
 if operation='contexts' then
  if ctx='platform' then return '[]'::jsonb;end if;
  if not exists(select 1 from public.tenant_settings s where s.tenant_id=target_tenant and 'planning'=any(s.enabled_services)) then return '[]'::jsonb;end if;
  if ctx='staff' then
   select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'kind','work_order','label',x.work_order_number||' · '||x.title)),'[]') into result from(select distinct w.id,w.work_order_number,w.title from public.work_orders w join public.work_order_assignments a on a.work_order_id=w.id join public.personnel pe on pe.id=a.personnel_id where w.tenant_id=target_tenant and pe.user_id=actor and pe.status='active' and a.status<>'cancelled' and w.archive_at is null and exists(select 1 from public.dispatches d where d.assignment_id=a.id and d.revoked_at is null) order by w.work_order_number desc limit 100)x;
  elsif exists(select 1 from public.tenant_memberships m join public.tenant_settings s on s.tenant_id=m.tenant_id where m.tenant_id=target_tenant and m.user_id=actor and m.status='active' and m.roles&&array['tenant_admin','management','planner']::public.app_role[] and 'planning'=any(s.enabled_services)) then
   select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind','work_order','label',work_order_number||' · '||title)),'[]') into result from(select id,work_order_number,title from public.work_orders where tenant_id=target_tenant and archive_at is null order by created_at desc limit 100)x;
  else result:='[]'::jsonb;end if;
  return result;
 end if;
 if operation not in ('options','config') then raise exception 'Onbekende query' using errcode='22023';end if;
 if operation='config' and not(config_ok or grant_ok) then return jsonb_build_object('preferences',private.ticket_preferences_save(target_tenant,ctx,actor,'{}'),'categories','[]'::jsonb,'groups','[]'::jsonb,'catalog','[]'::jsonb,'grants','[]'::jsonb,'members','[]'::jsonb,'scope_options','{}'::jsonb,'permissions',jsonb_build_object('configure',false,'delegate',false));end if;
 route_name:=case when ctx in ('staff','tenant') then 'internal' else 'platform_support' end;
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'code',c.code,'name',c.name,'description',c.description,'route',c.route,'confidential',c.confidential,'active',c.archived_at is null,'can_escalate',c.can_escalate,'default_assignee_id',c.default_assignee_id,'fallback_category_id',c.fallback_category_id,'sort_order',c.sort_order,'auto_close_days',c.auto_close_days,'pause_while_waiting',c.pause_while_waiting,'retention_profile',c.retention_profile,'revision',c.revision,'default_group_id',c.default_group_id,'group_name',(select g.name from public.ticket_groups g where g.id=c.default_group_id and g.tenant_id is not distinct from c.tenant_id),'fallback_group_id',c.fallback_group_id,'response_minutes',c.first_response_minutes,'followup_minutes',c.resolution_minutes) order by c.confidential,c.name),'[]') into categories from public.ticket_categories c
 where c.route=route_name and (c.tenant_id=target_tenant or c.tenant_id is null) and ((operation='config' and config_ok) or (c.archived_at is null and (private.ticket_create_allowed(target_tenant,c.id,ctx,actor) or private.ticket_has_cap(target_tenant,actor,case when ctx='tenant' then 'tickets.internal.read' when ctx='support' then 'tickets.support.read' else 'platform.support.read' end,c.id) and (not c.confidential or private.ticket_has_cap(target_tenant,actor,'tickets.internal.hr',c.id)))));
 select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'revision',g.revision,'active',g.archived_at is null,'member_ids',coalesce((select jsonb_agg(user_id) from public.ticket_group_members where group_id=g.id),'[]'))),'[]') into groups from public.ticket_groups g where (ctx='platform' and g.tenant_id is null or ctx<>'platform' and g.tenant_id=target_tenant) and (operation='config' or g.archived_at is null) and (config_ok or grant_ok);
 handlers:='[]'::jsonb;
 if ctx in ('tenant','support') and (config_ok or grant_ok or capabilities ? 'tickets.internal.assign' or capabilities ? 'tickets.support.manage') then
  select coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'membership_id',m.id,'name',coalesce((select pe.full_name from public.personnel pe where pe.tenant_id=m.tenant_id and pe.user_id=m.user_id limit 1),'Tenantgebruiker'))),'[]') into handlers from public.tenant_memberships m where m.tenant_id=target_tenant and m.status='active';
 elsif ctx='platform' and (config_ok or grant_ok or capabilities ? 'platform.support.manage') then
  select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',split_part(u.email,'@',1))),'[]') into handlers from auth.users u where u.deleted_at is null and exists(select 1 from public.permission_grants g where g.user_id=u.id and g.tenant_id is null and g.enabled);
 end if;
 result:=jsonb_build_object('categories',categories,'groups',groups,'handlers',handlers,'priorities',jsonb_build_array('low','normal','high','critical'),'statuses',jsonb_build_array('new','in_progress','waiting_reporter','waiting_external','resolved','closed','cancelled'),'permissions',jsonb_build_object('configure',config_ok,'delegate',grant_ok),'support_categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name)) from public.ticket_categories c where c.route='platform_support' and private.ticket_create_allowed(target_tenant,c.id,'support',actor)),'[]'));
 if operation='config' then
  result:=result||jsonb_build_object('settings',(select settings||jsonb_build_object('revision',revision,'enabled',true,'opening_hours',jsonb_build_object('days',(select jsonb_agg(case when value::integer=7 then 0 else value::integer end) from jsonb_array_elements_text(settings->'weekdays')),'start',settings->>'opens','end',settings->>'closes')) from private.ticket_config where scope_key=case when ctx='platform' then 'platform' else target_tenant::text end),'catalog',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('label',c.name,'delegable',true)) from public.permission_catalog c where c.domain=case when ctx='platform' then 'platform' else 'tenant' end),'[]'),'grants',case when grant_ok then coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'user_id',g.user_id,'user_name',coalesce((select pe.full_name from public.personnel pe where pe.tenant_id=g.tenant_id and pe.user_id=g.user_id limit 1),case when ctx='platform' then 'Platformgebruiker' else 'Tenantgebruiker' end),'capability',g.capability,'scope',g.scope,'active',g.enabled,'revision',g.revision)) from public.permission_grants g where g.tenant_id=target_tenant or (ctx='platform' and g.tenant_id is null)),'[]') else '[]'::jsonb end,'members',handlers,'audit',case when grant_ok then coalesce((select jsonb_agg(to_jsonb(a)) from(select a.id,a.action,a.target_id,a.created_at,case when a.actor_id=actor then 'U' else coalesce((select pe.full_name from public.personnel pe where pe.tenant_id=a.tenant_id and pe.user_id=a.actor_id limit 1),'Beheerder') end actor_name,case a.action when 'grant_save' then 'Ticketrecht toegekend of aangepast' when 'grant_revoke' then 'Ticketrecht ingetrokken' when 'category_save' then 'Categorie aangepast' when 'group_save' then 'Behandelgroep aangepast' when 'settings_save' then 'Instellingen aangepast' else 'Configuratie aangepast' end label from private.ticket_audit a where a.action in ('grant_save','grant_revoke','category_save','group_save','settings_save') and (a.tenant_id=target_tenant or(ctx='platform' and a.tenant_id is null)) order by created_at desc limit 100)a),'[]') else '[]'::jsonb end,'scope_options',jsonb_build_object('personnel','[]'::jsonb,'objects','[]'::jsonb,'customers','[]'::jsonb,'tenants',case when ctx='platform' and grant_ok then coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name)) from public.tenants where status='active'),'[]') else '[]'::jsonb end));
 end if;
 if operation in ('options','config') then result:=result||jsonb_build_object('preferences',private.ticket_preferences_save(target_tenant,ctx,actor,'{}'),'contexts',case when operation='options' then public.ticket_query(target_tenant,ctx,'contexts','{}') else '[]'::jsonb end,'modules',to_jsonb(array['planning','werkbonnen','personeel','objecten','klanten','rapportage','finance','communicatie','account','overig']));end if;
 if operation='config' and grant_ok and ctx<>'platform' then
  result:=jsonb_set(result,'{scope_options}',(result->'scope_options')||jsonb_build_object('personnel',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',full_name)) from public.personnel where tenant_id=target_tenant and status='active'),'[]'),'objects',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name)) from public.objects where tenant_id=target_tenant),'[]'),'customers',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name)) from public.customers where tenant_id=target_tenant),'[]')));
 end if;
 return result;
end$$;

create or replace function private.ticket_scope_validate(t uuid,scope jsonb,domain_name text) returns void language plpgsql stable security definer set search_path='' as $$
declare k text;v jsonb;uid uuid;
begin
 if scope is null or jsonb_typeof(scope)<>'object' or not(scope ?| array['all','category_ids','personnel_ids','object_ids','customer_ids','tenant_ids','assigned_only']) then raise exception 'Een expliciete scope is verplicht' using errcode='23514';end if;
 for k,v in select * from jsonb_each(scope) loop
  if k in ('all','assigned_only') then if jsonb_typeof(v)<>'boolean' then raise exception 'Ongeldige scope' using errcode='23514';end if;
  elsif k in ('category_ids','personnel_ids','object_ids','customer_ids','tenant_ids') then
   if jsonb_typeof(v)<>'array' or jsonb_array_length(v)>200 or jsonb_array_length(v)=0 then raise exception 'Een begrensde scope mag niet leeg zijn' using errcode='23514';end if;
   for uid in select value::uuid from jsonb_array_elements_text(v) loop
    if not (case k when 'category_ids' then exists(select 1 from public.ticket_categories c where c.id=uid and(c.tenant_id=t or c.route='platform_support')) when 'personnel_ids' then domain_name='tenant' and exists(select 1 from public.personnel p where p.id=uid and p.tenant_id=t) when 'object_ids' then domain_name='tenant' and exists(select 1 from public.objects o where o.id=uid and o.tenant_id=t) when 'customer_ids' then domain_name='tenant' and exists(select 1 from public.customers c where c.id=uid and c.tenant_id=t) when 'tenant_ids' then domain_name='platform' and exists(select 1 from public.tenants x where x.id=uid and x.status='active') else false end) then raise exception 'Scope behoort niet tot deze omgeving' using errcode='23514';end if;
   end loop;
  else raise exception 'Onbekend scopeveld' using errcode='23514';end if;
 end loop;
 if not(coalesce((scope->>'all')::boolean,false) or coalesce((scope->>'assigned_only')::boolean,false) or scope ?| array['category_ids','personnel_ids','object_ids','customer_ids','tenant_ids']) then raise exception 'Lege scope' using errcode='23514';end if;
end$$;
create or replace function private.ticket_scope_contains(parent_scope jsonb,child_scope jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare k text;v jsonb;
begin
 for k,v in select * from jsonb_each(parent_scope) loop
  if k in ('category_ids','personnel_ids','object_ids','customer_ids','tenant_ids') and (not(child_scope?k) or not(v @> (child_scope->k))) then return false;end if;
  if k='assigned_only' and v='true'::jsonb and child_scope->'assigned_only' is distinct from 'true'::jsonb then return false;end if;
 end loop;
 return true;
end$$;
create or replace function public.ticket_verification(target_tenant uuid,actor uuid,session_id uuid,operation text,input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare ctx text:=case when target_tenant is null then 'platform' else 'tenant' end;challenge private.ticket_verifications;cid uuid;hash text;secret_key bytea;code text;recipient text;
begin
 if not private.ticket_session_active(actor,session_id) or not private.ticket_config_allowed(target_tenant,ctx,actor,true) or jsonb_typeof(input)<>'object' then raise exception 'Geen delegatierecht' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('ticket-verification:'||actor::text,0));
 select secret into secret_key from private.ticket_verification_key where singleton;
 if operation='request' then
  if input->>'action' not in ('grant_save','grant_revoke') or jsonb_typeof(input->'payload')<>'object' or input->>'code' !~ '^[0-9]{6}$' then raise exception 'Ongeldige verificatie' using errcode='23514';end if;
  if (select count(*) from private.ticket_verifications where actor_id=actor and created_at>now()-interval '10 minutes')>=3 then raise exception 'Wacht voordat u opnieuw bevestigt' using errcode='54000';end if;
  select email into recipient from auth.users where id=actor and email_confirmed_at is not null;if recipient is null then raise exception 'Bevestigd e-mailadres nodig' using errcode='42501';end if;
  cid:=gen_random_uuid();hash:=encode(extensions.digest(((input->'payload')-'verification_id')::text,'sha256'),'hex');
  insert into private.ticket_verifications(id,tenant_id,actor_id,session_id,action,payload_hash,code_hash) values(cid,target_tenant,actor,session_id,input->>'action',hash,encode(extensions.hmac(cid::text||':'||(input->>'code'),encode(secret_key,'hex'),'sha256'),'hex'));
  return jsonb_build_object('challenge_id',cid,'expires_at',now()+interval '5 minutes','email',recipient);
 end if;
 select * into challenge from private.ticket_verifications v where v.id=(input->>'challenge_id')::uuid and v.actor_id=actor and v.session_id=ticket_verification.session_id and v.tenant_id is not distinct from target_tenant for update;
 if not found or challenge.consumed_at is not null or challenge.expires_at<=now() or challenge.attempts>=5 then raise exception 'Verificatie verlopen' using errcode='42501';end if;
 if operation='delivered' then update private.ticket_verifications set delivered=coalesce((input->>'delivered')::boolean,false),expires_at=case when input->>'delivered'='true' then expires_at else now() end where id=challenge.id;return jsonb_build_object('ok',true);end if;
 if operation<>'confirm' or not challenge.delivered then raise exception 'Verificatie niet beschikbaar' using errcode='42501';end if;
 code:=input->>'code';
 if code is null or code !~ '^[0-9]{6}$' or challenge.code_hash<>encode(extensions.hmac(challenge.id::text||':'||code,encode(secret_key,'hex'),'sha256'),'hex') then
  update private.ticket_verifications set attempts=attempts+1 where id=challenge.id;return jsonb_build_object('error','Ongeldige bevestigingscode');
 end if;
 update private.ticket_verifications set verified_at=now(),expires_at=now()+interval '5 minutes' where id=challenge.id;
 return jsonb_build_object('verification_id',challenge.id,'expires_at',now()+interval '5 minutes');
end$$;
create or replace function private.ticket_consume_verification(t uuid,actor uuid,command_name text,p jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 update private.ticket_verifications v set consumed_at=now() where v.id=(p->>'verification_id')::uuid and v.actor_id=actor and v.tenant_id is not distinct from t and v.session_id=nullif(auth.jwt()->>'session_id','')::uuid and v.action=command_name and v.verified_at is not null and v.expires_at>now() and v.consumed_at is null and v.payload_hash=encode(extensions.digest((p-'verification_id')::text,'sha256'),'hex');
 if not found then raise exception 'Bevestig deze exacte rechtenwijziging opnieuw' using errcode='42501';end if;
end$$;

create or replace function private.ticket_config_command(t uuid,ctx text,cmd text,p jsonb,actor uuid) returns jsonb language plpgsql security definer set search_path='' as $$
<<ticket_config_command>>
declare cat public.ticket_categories;grp public.ticket_groups;g public.permission_grants;c public.permission_catalog;mid uuid;uid uuid;key text;scope jsonb;parent_scope jsonb;cfg private.ticket_config;settings jsonb;days jsonb;id uuid;reason text:=btrim(coalesce(p->>'reason',''));
begin
 if cmd in ('grant_save','grant_revoke') then
  if not private.ticket_config_allowed(t,ctx,actor,true) or length(reason)<3 then raise exception 'Geen delegatierecht of toelichting' using errcode='42501';end if;
  perform private.ticket_consume_verification(case when ctx='platform' then null else t end,actor,cmd,p);
  select pg.scope into parent_scope from public.permission_grants pg where pg.user_id=actor and pg.enabled and pg.capability=case when ctx='platform' then 'platform.support.permissions' else 'tickets.permissions' end and pg.tenant_id is not distinct from case when ctx='platform' then null else t end;
  if cmd='grant_save' then
   uid:=(p->>'user_id')::uuid;key:=p->>'capability';scope:=p->'scope';
   if uid=actor then raise exception 'U kunt uw eigen ticketrechten niet uitbreiden' using errcode='42501';end if;
   select * into c from public.permission_catalog where permission_catalog.key=ticket_config_command.key and domain=case when ctx='platform' then 'platform' else 'tenant' end;
   if not found then raise exception 'Onbekend recht voor deze omgeving' using errcode='23514';end if;
   perform private.ticket_scope_validate(t,scope,c.domain);
   if not private.ticket_scope_contains(parent_scope,scope) then raise exception 'Scope valt buiten uw delegatiebevoegdheid' using errcode='42501';end if;
   if ctx<>'platform' then select m.id into mid from public.tenant_memberships m where m.tenant_id=t and m.user_id=uid and m.status='active';if mid is null then raise exception 'Actief lidmaatschap nodig' using errcode='23514';end if;
   elsif not exists(select 1 from auth.users where auth.users.id=uid and deleted_at is null and email_confirmed_at is not null) then raise exception 'Actief bevestigd account nodig' using errcode='23514';end if;
   perform pg_advisory_xact_lock(hashtextextended('ticket-grant:'||coalesce(t::text,'platform')||':'||uid::text||':'||key,0));
   select * into g from public.permission_grants pg where pg.user_id=uid and pg.capability=key and pg.tenant_id is not distinct from case when ctx='platform' then null else t end for update;
   if (p->>'expected_revision')::integer is distinct from (case when found then g.revision else 0 end) then raise exception 'Ticketrecht is gewijzigd; vernieuw en bevestig opnieuw' using errcode='40001';end if;
   if found then update public.permission_grants set scope=ticket_config_command.scope,enabled=true,revision=revision+1,updated_at=now(),created_by=actor,source='explicit' where permission_grants.id=g.id returning permission_grants.id into id;
   else insert into public.permission_grants(tenant_id,user_id,membership_id,capability,scope,created_by) values(case when ctx='platform' then null else t end,uid,mid,key,scope,actor) returning permission_grants.id into id;end if;
  else
   select * into g from public.permission_grants pg where pg.id=(p->>'grant_id')::uuid and pg.tenant_id is not distinct from case when ctx='platform' then null else t end for update;
   if not found or not private.ticket_scope_contains(parent_scope,g.scope) then raise exception 'Geen toegang tot dit recht' using errcode='42501';end if;
   if (p->>'expected_revision')::integer is distinct from g.revision then raise exception 'Ticketrecht is gewijzigd; vernieuw en bevestig opnieuw' using errcode='40001';end if;
   update public.permission_grants set enabled=false,revision=revision+1,updated_at=now() where permission_grants.id=g.id;id:=g.id;
  end if;
 elsif cmd in ('category_save','group_save','settings_save') then
  if not private.ticket_config_allowed(t,ctx,actor) or ctx='support' then raise exception 'Geen configuratierecht' using errcode='42501';end if;
  if cmd='category_save' then
   if length(btrim(p->>'name')) not between 2 and 100 or length(coalesce(p->>'description',''))>500 then raise exception 'Naam en omschrijving controleren' using errcode='23514';end if;
   if nullif(p->>'category_id','') is not null then
    select * into cat from public.ticket_categories where ticket_categories.id=(p->>'category_id')::uuid and tenant_id is not distinct from case when ctx='platform' then null else t end for update;
    if not found then raise exception 'Categorie niet beschikbaar' using errcode='42501';end if;
    if (p->>'expected_revision')::integer is distinct from cat.revision then raise exception 'Configuratie is gewijzigd; vernieuw het scherm' using errcode='40001';end if;
    if cat.confidential and p->>'confidential'='false' then raise exception 'Vertrouwelijkheid kan niet worden verlaagd' using errcode='23514';end if;
    id:=cat.id;
   else
    id:=gen_random_uuid();insert into public.ticket_categories(id,tenant_id,route,code,name,confidential) values(id,case when ctx='platform' then null else t end,case when ctx='platform' then 'platform_support' else 'internal' end,'custom-'||id,btrim(p->>'name'),ctx<>'platform' and coalesce((p->>'confidential')::boolean,false));
   end if;
   if nullif(p->>'group_id','') is not null and not exists(select 1 from public.ticket_groups where ticket_groups.id=(p->>'group_id')::uuid and tenant_id is not distinct from case when ctx='platform' then null else t end and archived_at is null) then raise exception 'Groep hoort niet bij deze omgeving' using errcode='23514';end if;
   if nullif(p->>'fallback_category_id','') is not null and not exists(select 1 from public.ticket_categories fc where fc.id=(p->>'fallback_category_id')::uuid and fc.id<>ticket_config_command.id and fc.tenant_id is not distinct from case when ctx='platform' then null else t end and fc.archived_at is null and fc.confidential=coalesce(cat.confidential,(p->>'confidential')::boolean,false)) then raise exception 'Fallback moet dezelfde vertrouwelijkheid hebben' using errcode='23514';end if;
   if nullif(p->>'default_assignee_id','') is not null and not exists(select 1 from public.permission_grants pg where pg.user_id=(p->>'default_assignee_id')::uuid and pg.enabled and pg.tenant_id is not distinct from case when ctx='platform' then null else t end and pg.capability=case when ctx='platform' then 'platform.support.read' else 'tickets.internal.read' end) then raise exception 'Behandelaar heeft geen ticketrecht' using errcode='23514';end if;
   update public.ticket_categories set name=btrim(p->>'name'),description=coalesce(p->>'description',''),archived_at=case when p->>'active'='false' then coalesce(archived_at,now()) else null end,sort_order=coalesce((p->>'sort_order')::integer,0),default_assignee_id=nullif(p->>'default_assignee_id','')::uuid,default_group_id=nullif(p->>'group_id','')::uuid,fallback_category_id=nullif(p->>'fallback_category_id','')::uuid,first_response_minutes=coalesce((p->>'response_minutes')::integer,480),resolution_minutes=coalesce((p->>'followup_minutes')::integer,2400),auto_close_days=nullif(p->>'auto_close_days','')::integer,pause_while_waiting=coalesce((p->>'pause_while_waiting')::boolean,true),can_escalate=coalesce((p->>'can_escalate')::boolean,true),retention_profile=left(p->>'retention_profile',200),confidential=confidential or (ctx<>'platform' and coalesce((p->>'confidential')::boolean,false)),revision=revision+1 where ticket_categories.id=ticket_config_command.id;
  elsif cmd='group_save' then
   id:=coalesce(nullif(p->>'group_id','')::uuid,gen_random_uuid());
   select * into grp from public.ticket_groups where ticket_groups.id=ticket_config_command.id for update;
   if found and(grp.tenant_id is distinct from case when ctx='platform' then null else t end or (p->>'expected_revision')::integer is distinct from grp.revision) then raise exception 'Groep is gewijzigd of niet toegankelijk' using errcode='40001';end if;
   insert into public.ticket_groups(id,tenant_id,name) values(id,case when ctx='platform' then null else t end,btrim(p->>'name')) on conflict on constraint ticket_groups_pkey do update set name=excluded.name,revision=ticket_groups.revision+1,archived_at=case when p->>'active'='false' then now() end;
   delete from public.ticket_group_members where group_id=id;
   for uid in select value::uuid from jsonb_array_elements_text(coalesce(p->'member_ids','[]')) loop
    if ctx<>'platform' and not exists(select 1 from public.tenant_memberships where tenant_id=t and user_id=uid and status='active') then raise exception 'Groepslid hoort niet bij deze tenant' using errcode='23514';end if;
    if ctx='platform' and not exists(select 1 from public.permission_grants where user_id=uid and tenant_id is null and enabled) then raise exception 'Groepslid heeft geen platformrechten' using errcode='23514';end if;
    insert into public.ticket_group_members(group_id,user_id,tenant_id) values(id,uid,case when ctx='platform' then null else t end) on conflict do nothing;
   end loop;
  else
   select * into cfg from private.ticket_config where scope_key=case when ctx='platform' then 'platform' else t::text end for update;
   if (p->>'expected_revision')::integer is distinct from cfg.revision then raise exception 'Instellingen gewijzigd; vernieuw het scherm' using errcode='40001';end if;
   if not exists(select 1 from pg_timezone_names where name=p->>'timezone') or jsonb_typeof(p->'opening_hours'->'days')<>'array' or jsonb_array_length(p->'opening_hours'->'days') not between 1 and 7 or p->'opening_hours'->>'start' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or p->'opening_hours'->>'end' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or (p->'opening_hours'->>'start')::time>=(p->'opening_hours'->>'end')::time then raise exception 'Ongeldige openingstijden' using errcode='23514';end if;
   if exists(select 1 from jsonb_array_elements_text(p->'opening_hours'->'days')d where d.value::integer not between 0 and 6) then raise exception 'Ongeldige werkdagen' using errcode='23514';end if;
   select jsonb_agg(case when value::integer=0 then 7 else value::integer end) into days from jsonb_array_elements_text(p->'opening_hours'->'days');
   settings:=cfg.settings||jsonb_build_object('timezone',p->>'timezone','weekdays',days,'opens',p->'opening_hours'->>'start','closes',p->'opening_hours'->>'end');
   update private.ticket_config set settings=ticket_config_command.settings,revision=revision+1,updated_at=now() where scope_key=cfg.scope_key;
  end if;
 else raise exception 'Onbekende configuratieopdracht' using errcode='22023';end if;
 insert into private.ticket_audit(tenant_id,actor_id,action,target_id,detail) values(case when ctx='platform' then null else t end,actor,cmd,id,jsonb_build_object('reason',nullif(reason,'')));
 return jsonb_build_object('ok',true,'id',id);
end$$;

create or replace function private.ticket_route_assignment(tid uuid) returns void language plpgsql security definer set search_path='' as $$
<<ticket_route_assignment>>
declare t public.tickets;c public.ticket_categories;candidate uuid;group_id uuid;ctx text;fallback public.ticket_categories;
begin
 select * into t from public.tickets where id=tid;select * into c from public.ticket_categories where id=t.category_id;
 ctx:=case when t.route='internal' then 'tenant' else 'platform' end;
 candidate:=c.default_assignee_id;group_id:=c.default_group_id;
 if candidate is not null then
  update public.tickets set assigned_user_id=candidate where id=tid;
  if private.ticket_allowed(tid,ctx,'reply',candidate) then return;end if;
  update public.tickets set assigned_user_id=null where id=tid;
 end if;
 if group_id is not null and exists(select 1 from public.ticket_group_members gm join public.ticket_groups gr on gr.id=gm.group_id and gr.archived_at is null where gm.group_id=ticket_route_assignment.group_id and private.ticket_allowed(tid,ctx,'reply',gm.user_id)) then update public.tickets set assigned_group_id=group_id where id=tid;return;end if;
 if c.fallback_category_id is not null then
  select * into fallback from public.ticket_categories where id=c.fallback_category_id and confidential=c.confidential and archived_at is null;
  if found then
   candidate:=fallback.default_assignee_id;group_id:=fallback.default_group_id;
   if candidate is not null then update public.tickets set assigned_user_id=candidate where id=tid;if private.ticket_allowed(tid,ctx,'reply',candidate) then return;end if;update public.tickets set assigned_user_id=null where id=tid;end if;
   if group_id is not null and exists(select 1 from public.ticket_group_members gm join public.ticket_groups gr on gr.id=gm.group_id and gr.archived_at is null where gm.group_id=ticket_route_assignment.group_id and private.ticket_allowed(tid,ctx,'reply',gm.user_id)) then update public.tickets set assigned_group_id=group_id where id=tid;return;end if;
  end if;
 end if;
 -- A confidential intake must not disappear into an unrestricted queue.
 if c.confidential and not exists(select 1 from public.tenant_memberships m where m.tenant_id=t.tenant_id and m.status='active' and private.ticket_allowed(tid,'tenant','reply',m.user_id)) then raise exception 'Voor deze vertrouwelijke categorie is geen bevoegde intake beschikbaar' using errcode='23514';end if;
end$$;
create or replace function private.ticket_new(t uuid,ctx text,p jsonb,actor uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare cat public.ticket_categories;id uuid:=gen_random_uuid();person public.personnel;wo public.work_orders;object_name text;customer_name text;label_name text;seq bigint;cfg jsonb;snapshot jsonb:='{}'::jsonb;mid uuid;fileids uuid[];stamp timestamptz:=clock_timestamp();urgency text:=coalesce(p->>'urgency','normal');module_name text:=coalesce(p->>'module','overig');technical jsonb:=coalesce(p->'technical_context','{}');
begin
 if not private.ticket_create_allowed(t,(p->>'category_id')::uuid,ctx,actor) then raise exception 'Geen aanmaakrecht voor deze categorie' using errcode='42501';end if;
 select * into cat from public.ticket_categories where ticket_categories.id=(p->>'category_id')::uuid;
 if length(btrim(coalesce(p->>'title',''))) not between 3 and 180 or length(btrim(coalesce(p->>'body',''))) not between 1 and 20000 or urgency not in ('normal','urgent') or p?'priority' then raise exception 'Controleer onderwerp, tekst en urgentie' using errcode='23514';end if;
 if module_name not in ('planning','werkbonnen','personeel','objecten','klanten','rapportage','finance','communicatie','account','overig') or jsonb_typeof(technical)<>'object' or technical-'environment'-'release'<>'{}'::jsonb or length(technical::text)>200 or (technical?'release' and technical->>'release'<>'local' and technical->>'release' !~ '^[a-f0-9]{7,40}$') or(technical?'environment' and technical->>'environment' not in ('local','staging','development')) then raise exception 'Ongeldige technische context' using errcode='23514';end if;
 select * into person from public.personnel where tenant_id=t and user_id=actor and status='active' limit 1;
 label_name:=coalesce(person.full_name,'Tenantcontact');
 if ctx='staff' and nullif(p->>'work_order_id','') is not null then
  select w.* into wo from public.work_orders w where w.id=(p->>'work_order_id')::uuid and w.tenant_id=t and w.archive_at is null and exists(select 1 from public.work_order_assignments a join public.dispatches d on d.assignment_id=a.id and d.revoked_at is null where a.work_order_id=w.id and a.personnel_id=person.id and a.status<>'cancelled');
  if not found or not exists(select 1 from public.tenant_settings s where s.tenant_id=t and 'planning'=any(s.enabled_services)) then raise exception 'Werkbon is niet beschikbaar in uw eigen inzet' using errcode='42501';end if;
  if nullif(p->>'object_id','') is not null and (p->>'object_id')::uuid is distinct from wo.object_id then raise exception 'Object hoort niet bij deze werkbon' using errcode='23514';end if;
  select name into object_name from public.objects where public.objects.id=wo.object_id;select name into customer_name from public.customers where public.customers.id=wo.customer_id;
  snapshot:=jsonb_build_object('work_order',wo.work_order_number,'object',object_name,'customer',customer_name);
 elsif ctx='staff' and nullif(p->>'object_id','') is not null then raise exception 'Kies een eigen werkbon voor objectcontext' using errcode='42501';
 elsif ctx='support' and (nullif(p->>'object_id','') is not null or nullif(p->>'work_order_id','') is not null) then
  -- Support never imports object secrets or commercial JSON; explicit text is reviewed by the sender.
  if not exists(select 1 from public.tenant_memberships m join public.tenant_settings s on s.tenant_id=m.tenant_id where m.tenant_id=t and m.user_id=actor and m.status='active' and m.roles&&array['tenant_admin','management','planner']::public.app_role[] and 'planning'=any(s.enabled_services)) then raise exception 'Geen toegang tot operationele context' using errcode='42501';end if;
  if nullif(p->>'work_order_id','') is not null and not exists(select 1 from public.work_orders where work_orders.id=(p->>'work_order_id')::uuid and tenant_id=t) then raise exception 'Werkbon niet beschikbaar' using errcode='42501';end if;
  if nullif(p->>'object_id','') is not null and not exists(select 1 from public.objects where objects.id=(p->>'object_id')::uuid and tenant_id=t) then raise exception 'Object niet beschikbaar' using errcode='42501';end if;
 end if;
 insert into private.ticket_counters(tenant_id,route,value) values(t,cat.route,1) on conflict(tenant_id,route) do update set value=ticket_counters.value+1 returning value into seq;
 select settings into cfg from private.ticket_config where scope_key=case when cat.route='platform_support' then 'platform' else t::text end;
 insert into public.tickets(id,tenant_id,number,route,category_id,reporter_user_id,reporter_personnel_id,reporter_name,title,priority,needed_before,work_order_id,object_id,customer_id,personnel_id,context_snapshot,module,technical_context,first_response_due_at,resolution_due_at,audience_activity)
 values(id,t,case when cat.route='internal' then 'M-' else 'S-' end||lpad(seq::text,6,'0'),cat.route,cat.id,actor,case when ctx='staff' then person.id end,label_name,btrim(p->>'title'),case when urgency='urgent' then 'high' else 'normal' end,nullif(p->>'needed_before','')::timestamptz,wo.id,wo.object_id,wo.customer_id,case when ctx='staff' then person.id end,snapshot,module_name,technical,private.ticket_business_due(stamp,cat.first_response_minutes,cfg),private.ticket_business_due(stamp,cat.resolution_minutes,cfg),jsonb_build_object('reporter',stamp,'tenant',stamp,'platform',stamp));
 -- A support creator must also be permitted to see the resulting scope.
 if not private.ticket_allowed(id,ctx,'read',actor) then raise exception 'Geen leesrecht voor de aangemaakte scope' using errcode='42501';end if;
 insert into public.ticket_messages(tenant_id,ticket_id,author_user_id,author_name,author_context,audience,body) values(t,id,actor,label_name,ctx,'reporter',btrim(p->>'body')) returning ticket_messages.id into mid;
 select coalesce(array_agg(value::uuid),'{}') into fileids from jsonb_array_elements_text(coalesce(p->'attachment_ids','[]'));
 perform private.ticket_attach_to_message(id,mid,fileids,actor,ctx);
 perform private.ticket_route_assignment(id);
 perform private.ticket_emit(id,'reporter','created','Melding aangemaakt',actor);
 return id;
end$$;

create or replace function public.ticket_command(target_tenant uuid,actor_context text,command text,payload jsonb,request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
<<ticket_command>>
declare actor uuid:=auth.uid();ctx text:=actor_context;cmd text:=command;p jsonb:=payload;t public.tickets;c public.ticket_categories;nextcat public.ticket_categories;r private.ticket_receipts;id uuid;mid uuid;dest uuid;aud text;name text;nextstatus text;body text;reason text;fileids uuid[];result jsonb;newuser uuid;groupid uuid;cap text;
begin
 if request_id is null or p is null or jsonb_typeof(p)<>'object' or length(p::text)>60000 or cmd is null or not private.ticket_session_active(actor,nullif(auth.jwt()->>'session_id','')::uuid) or not private.ticket_actor_active(target_tenant,ctx,actor) then raise exception 'Geen toegang of ongeldige opdracht' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('ticket-command:'||actor::text,0));
 select * into r from private.ticket_receipts where ticket_receipts.request_id=ticket_command.request_id;
 if found then
  if r.actor_id<>actor or r.tenant_id is distinct from target_tenant or r.context<>ctx or r.command<>cmd or r.payload<>p then raise exception 'Aanvraagsleutel is al voor een andere opdracht gebruikt' using errcode='23505';end if;
  if r.result?'ticket_id' then return private.ticket_dto((r.result->>'ticket_id')::uuid,coalesce(r.result->>'context',ctx),actor,true);end if;
  if cmd in ('grant_save','grant_revoke') and not private.ticket_config_allowed(target_tenant,ctx,actor,true) then raise exception 'Geen delegatierecht' using errcode='42501';end if;
  return r.result;
 end if;
 if (select count(*) from private.ticket_receipts where actor_id=actor and created_at>now()-interval '1 minute')>=60 or (cmd in ('create','transfer') and (select count(*) from private.ticket_receipts where actor_id=actor and ticket_receipts.command in ('create','transfer') and created_at>now()-interval '1 hour')>=20) then raise exception 'Te veel aanvragen; probeer het later opnieuw' using errcode='54000';end if;
 if cmd in ('category_save','group_save','settings_save','grant_save','grant_revoke') then result:=private.ticket_config_command(target_tenant,ctx,cmd,p,actor);
 elsif cmd='preferences' then result:=private.ticket_preferences_save(target_tenant,ctx,actor,p);
 elsif cmd='create' then id:=private.ticket_new(target_tenant,ctx,p,actor);result:=jsonb_build_object('ticket_id',id,'context',ctx);
 else
  id:=nullif(p->>'ticket_id','')::uuid;
  select * into t from public.tickets where tickets.id=ticket_command.id and (tenant_id=target_tenant or(ctx='platform' and target_tenant is null)) for update;
  if not found or not private.ticket_allowed(id,ctx,'read',actor) then raise exception 'Geen toegang tot melding' using errcode='42501';end if;
  if (p->>'expected_revision')::bigint is distinct from private.ticket_view_revision(id,ctx,actor) then raise exception 'Melding is gewijzigd; vernieuw voordat u verdergaat' using errcode='40001';end if;
  select * into c from public.ticket_categories where ticket_categories.id=t.category_id;
  if cmd in ('assign','priority','category','transfer') and (t.archived_at is not null or t.status in ('resolved','closed','cancelled')) then raise exception 'Heropen de melding voordat u deze wijzigt' using errcode='23514';end if;
  reason:=btrim(coalesce(p->>'reason',''));body:=btrim(coalesce(p->>'body',''));aud:=coalesce(p->>'audience','reporter');
  select full_name into name from public.personnel where tenant_id=t.tenant_id and user_id=actor and status='active' limit 1;
  name:=case when ctx='platform' then 'Fieldgrid-support' else coalesce(name,case when ctx='staff' then t.reporter_name else 'Behandelaar' end) end;
  if cmd='read' then
   insert into private.ticket_reads(ticket_id,user_id,context,revision) values(id,actor,ctx,private.ticket_view_revision(id,ctx,actor)) on conflict(ticket_id,user_id,context) do update set revision=excluded.revision,read_at=now();
  elsif cmd='reply' then
   if t.archived_at is not null or t.status in ('closed','cancelled') or length(body) not between 1 and 20000 or aud not in ('reporter','tenant','platform') or not private.ticket_allowed(id,ctx,case when aud='reporter' then 'reply' else 'note' end,actor) or (aud='tenant' and ctx not in ('tenant','support')) or (aud='platform' and ctx<>'platform') then raise exception 'Reactie is niet toegestaan' using errcode='42501';end if;
   insert into public.ticket_messages(tenant_id,ticket_id,author_user_id,author_name,author_context,audience,body) values(t.tenant_id,id,actor,name,ctx,aud,body) returning ticket_messages.id into mid;
   select coalesce(array_agg(value::uuid),'{}') into fileids from jsonb_array_elements_text(coalesce(p->'attachment_ids','[]'));perform private.ticket_attach_to_message(id,mid,fileids,actor,ctx);
   if aud='reporter' then
    if (ctx='staff' or (ctx='support' and t.route='platform_support')) and t.status in ('waiting_reporter','resolved') then perform private.ticket_wait_deadlines(id,'in_progress');update public.tickets set status='in_progress',resolved_at=null,wait_started_at=null,next_step=null where tickets.id=ticket_command.id;
    elsif (ctx='tenant' and t.route='internal') or ctx='platform' then update public.tickets set first_response_at=coalesce(first_response_at,now()),status=case when status='new' then 'in_progress' else status end where tickets.id=ticket_command.id;end if;
   end if;
   perform private.ticket_emit(id,aud,'reply',case when aud='reporter' then 'Nieuwe reactie' else 'Interne notitie toegevoegd' end,actor);
  elsif cmd='status' then
   nextstatus:=p->>'status';
   if nextstatus is null or nextstatus not in ('in_progress','waiting_reporter','waiting_external','resolved','closed','cancelled') or t.archived_at is not null then raise exception 'Ongeldige statusovergang' using errcode='23514';end if;
   if nextstatus='cancelled' and t.status not in ('new','in_progress','waiting_reporter','waiting_external') then raise exception 'Alleen actieve meldingen kunnen worden ingetrokken' using errcode='23514';end if;
   if ctx='staff' then
    if not((nextstatus='cancelled' and t.status in ('new','in_progress','waiting_reporter','waiting_external') and length(reason)>=3) or (nextstatus='closed' and t.status='resolved') or(nextstatus='in_progress' and t.status in ('resolved','closed') and length(reason)>=3)) then raise exception 'Deze overgang is niet voor de melder beschikbaar' using errcode='42501';end if;
   elsif not private.ticket_allowed(id,ctx,case when nextstatus in ('resolved','closed','cancelled') or t.status in ('resolved','closed') then 'close' else 'manage' end,actor) then raise exception 'Geen recht op deze statuswijziging' using errcode='42501';end if;
   if t.status='cancelled' or nextstatus=t.status or (nextstatus='closed' and t.status<>'resolved') or (nextstatus in ('waiting_reporter','waiting_external','resolved') and t.status in ('resolved','closed','cancelled')) then raise exception 'Statusovergang niet toegestaan' using errcode='23514';end if;
   if nextstatus='resolved' and length(btrim(coalesce(p->>'resolution','')))<3 then raise exception 'Beschrijf de oplossing' using errcode='23514';end if;
   if nextstatus in ('waiting_reporter','waiting_external') and length(btrim(coalesce(p->>'next_step','')))<3 then raise exception 'Beschrijf de vervolgstap' using errcode='23514';end if;
   if (nextstatus='cancelled' or(t.status in ('resolved','closed') and nextstatus='in_progress')) and length(reason)<3 then raise exception 'Toelichting is verplicht' using errcode='23514';end if;
   body:=case when nextstatus='resolved' then btrim(p->>'resolution') when nextstatus in ('waiting_reporter','waiting_external') then btrim(p->>'next_step') else reason end;
   if length(body)>0 then insert into public.ticket_messages(tenant_id,ticket_id,author_user_id,author_name,author_context,audience,body) values(t.tenant_id,id,actor,name,ctx,'reporter',body) returning ticket_messages.id into mid;end if;
   perform private.ticket_wait_deadlines(id,nextstatus);
   update public.tickets set status=nextstatus,resolution_message_id=case when nextstatus='resolved' then mid when nextstatus='in_progress' then null else resolution_message_id end,next_step_message_id=case when nextstatus in ('waiting_reporter','waiting_external') then mid else null end,next_step=case when nextstatus in ('waiting_reporter','waiting_external') then p->>'next_step' end,resolved_at=case when nextstatus='resolved' then now() when nextstatus='in_progress' then null else resolved_at end,closed_at=case when nextstatus in ('closed','cancelled') then now() else null end,wait_started_at=case when nextstatus in ('waiting_reporter','waiting_external') then now() else null end,first_response_at=case when ctx in ('tenant','platform') and nextstatus in ('resolved','waiting_reporter','waiting_external') then coalesce(first_response_at,now()) else first_response_at end where tickets.id=ticket_command.id;
   perform private.ticket_emit(id,'reporter','status','Status gewijzigd: '||case nextstatus when 'in_progress' then 'In behandeling' when 'waiting_reporter' then 'Wacht op melder' when 'waiting_external' then 'Wacht op externe partij' when 'resolved' then 'Opgelost' when 'closed' then 'Gesloten' when 'cancelled' then 'Ingetrokken' end,actor);
  elsif cmd='assign' then
   if ctx='support' or not private.ticket_allowed(id,ctx,'assign',actor) then raise exception 'Geen toewijzingsrecht' using errcode='42501';end if;
   newuser:=nullif(coalesce(p->>'assigned_user_id',p->>'user_id'),'')::uuid;groupid:=nullif(p->>'group_id','')::uuid;
   if groupid is not null and not exists(select 1 from public.ticket_groups where ticket_groups.id=groupid and tenant_id is not distinct from case when ctx='platform' then null else t.tenant_id end and archived_at is null) then raise exception 'Groep niet beschikbaar' using errcode='23514';end if;
   update public.tickets set assigned_user_id=newuser,assigned_group_id=groupid where tickets.id=ticket_command.id;
   if newuser is not null and not private.ticket_allowed(id,ctx,'reply',newuser) then raise exception 'Behandelaar mist actuele rechten voor deze melding' using errcode='42501';end if;
   if groupid is not null and not exists(select 1 from public.ticket_group_members gm where gm.group_id=groupid and private.ticket_allowed(id,ctx,'reply',gm.user_id)) then raise exception 'Groep heeft geen bevoegde behandelaar' using errcode='42501';end if;
   perform private.ticket_emit(id,'reporter','assigned','Toewijzing bijgewerkt',actor);
  elsif cmd='priority' then
   if not private.ticket_allowed(id,ctx,'manage',actor) or length(reason)<3 then raise exception 'Prioriteitsrecht en toelichting vereist' using errcode='42501';end if;
   if p->>'priority' is null or p->>'priority' not in ('low','normal','high','critical') then raise exception 'Ongeldige prioriteit' using errcode='23514';end if;
   if p->>'priority'='critical' and not private.ticket_has_cap(t.tenant_id,actor,case ctx when 'tenant' then 'tickets.internal.critical' when 'support' then 'tickets.support.critical' else 'platform.support.critical' end,t.category_id,t.personnel_id,t.object_id,t.customer_id,t.assigned_user_id) then raise exception 'Expliciet recht op kritieke prioriteit is vereist' using errcode='42501';end if;
   update public.tickets set priority=p->>'priority' where tickets.id=ticket_command.id;perform private.ticket_emit(id,'reporter','priority','Prioriteit bijgewerkt',actor);
  elsif cmd='category' then
   if not private.ticket_allowed(id,ctx,'manage',actor) or length(reason)<3 then raise exception 'Herclassificatierecht en toelichting vereist' using errcode='42501';end if;
   select * into nextcat from public.ticket_categories where ticket_categories.id=(p->>'category_id')::uuid and route=t.route and tenant_id is not distinct from c.tenant_id and archived_at is null;
   if not found or(c.confidential and not nextcat.confidential) then raise exception 'Categorie of vertrouwelijkheid niet toegestaan' using errcode='23514';end if;
   update public.tickets set category_id=nextcat.id,assigned_user_id=null,assigned_group_id=null where tickets.id=ticket_command.id;
   if not private.ticket_allowed(id,ctx,'manage',actor) then raise exception 'Geen rechten op de bestemmingscategorie' using errcode='42501';end if;
   perform private.ticket_route_assignment(id);perform private.ticket_emit(id,'reporter','category','Categorie bijgewerkt',actor);
  elsif cmd='transfer' then
   if ctx<>'tenant' or c.confidential or not c.can_escalate or not private.ticket_allowed(id,ctx,'share',actor) or not private.ticket_create_allowed(t.tenant_id,(p->>'category_id')::uuid,'support',actor) then raise exception 'Deze melding mag niet met Fieldgrid worden gedeeld' using errcode='42501';end if;
   select s.id into dest from private.ticket_links l join public.tickets s on s.id=l.support_ticket_id where l.source_ticket_id=ticket_command.id and s.status not in ('closed','cancelled') order by l.created_at desc limit 1;
   if dest is not null then
    if not private.ticket_allowed(dest,'support','read',actor) then raise exception 'Er bestaat al een actieve escalatie waarvoor u geen toegang hebt' using errcode='42501';end if;
    -- Return the active escalation; never silently replace previously reviewed text or files.
    result:=jsonb_build_object('ticket_id',dest,'context','support');
   else
   dest:=private.ticket_new(t.tenant_id,'support',(p-'attachment_ids'-'ticket_id'-'expected_revision')||'{"attachment_ids":[]}',actor);
   insert into private.ticket_links(tenant_id,source_ticket_id,support_ticket_id,shared_by) values(t.tenant_id,id,dest,actor);
   select m.id into mid from public.ticket_messages m where m.ticket_id=dest order by created_at limit 1;
   select coalesce(array_agg(value::uuid),'{}') into fileids from jsonb_array_elements_text(coalesce(p->'attachment_ids','[]'));perform private.ticket_copy_files(id,dest,mid,fileids,actor,ctx);
   perform private.ticket_emit(id,'tenant','shared','Geselecteerde inhoud gedeeld met Fieldgrid',actor);
   result:=jsonb_build_object('ticket_id',dest,'context','support');
   end if;
  elsif cmd='archive' then
   if not private.ticket_allowed(id,ctx,'manage',actor) or t.status not in ('closed','cancelled') or length(reason)<3 then raise exception 'Alleen afgehandelde meldingen mogen met toelichting worden gearchiveerd' using errcode='42501';end if;
   update public.tickets set archived_at=now() where tickets.id=ticket_command.id;perform private.ticket_emit(id,'reporter','archived','Melding gearchiveerd',actor);
  elsif cmd='redact' then
   cap:=case when ctx='platform' then 'platform.support.redact' else 'tickets.redact' end;
   if ctx='staff' or not private.ticket_has_cap(t.tenant_id,actor,cap,t.category_id,t.personnel_id,t.object_id,t.customer_id,t.assigned_user_id) or length(reason)<3 then raise exception 'Geen afschermingsrecht' using errcode='42501';end if;
   mid:=(p->>'message_id')::uuid;
   if not exists(select 1 from public.ticket_messages where ticket_messages.id=mid and ticket_id=ticket_command.id) or not private.ticket_message_allowed(mid,ctx,actor) then raise exception 'Bericht niet beschikbaar' using errcode='42501';end if;
   insert into private.ticket_redactions(message_id,actor_id,reason) values(mid,actor,reason) on conflict do nothing;
   select audience into aud from public.ticket_messages where ticket_messages.id=mid;
   perform private.ticket_emit(id,aud,'redacted','Bericht afgeschermd',actor);
  else raise exception 'Onbekende ticketopdracht' using errcode='22023';end if;
  result:=coalesce(result,jsonb_build_object('ticket_id',id,'context',ctx));
 end if;
 if cmd not in ('read','preferences','category_save','group_save','settings_save','grant_save','grant_revoke') then
  insert into private.ticket_audit(tenant_id,actor_id,action,target_id,detail)
  select q.tenant_id,actor,'ticket.'||cmd,q.id,jsonb_build_object('context',ctx,'before',case when cmd='create' then '{}'::jsonb else jsonb_build_object('status',t.status,'category_id',t.category_id,'assigned_user_id',t.assigned_user_id,'assigned_group_id',t.assigned_group_id,'priority',t.priority,'revision',t.revision) end,'after',jsonb_build_object('status',q.status,'category_id',q.category_id,'assigned_user_id',q.assigned_user_id,'assigned_group_id',q.assigned_group_id,'priority',q.priority,'revision',q.revision)) from public.tickets q where q.id=ticket_command.id;
 end if;
 insert into private.ticket_receipts(request_id,actor_id,tenant_id,context,command,payload,result) values(ticket_command.request_id,actor,target_tenant,ctx,cmd,p,result);
 if result?'ticket_id' then return private.ticket_dto((result->>'ticket_id')::uuid,coalesce(result->>'context',ctx),actor,true);end if;
 return result;
end$$;

create or replace function private.ticket_business_remaining(starts timestamptz,ends timestamptz,cfg jsonb) returns integer language plpgsql stable set search_path='' as $$
declare d date;last_day date;total numeric:=0;tz text:=cfg->>'timezone';
begin
 if ends is null then return null;end if;if ends<=starts then return 0;end if;
 d:=(starts at time zone tz)::date;last_day:=(ends at time zone tz)::date;
 for i in 0..800 loop
  exit when d>last_day;
  if cfg->'weekdays' @> to_jsonb(array[extract(isodow from d)::integer]) then total:=total+greatest(0,extract(epoch from least(ends,(d+(cfg->>'closes')::time) at time zone tz)-greatest(starts,(d+(cfg->>'opens')::time) at time zone tz))/60);end if;
  d:=d+1;
 end loop;
 return ceil(total)::integer;
end$$;
create or replace function private.ticket_wait_deadlines(tid uuid,next_status text) returns void language plpgsql security definer set search_path='' as $$
declare t public.tickets;c public.ticket_categories;cfg jsonb;pause_next boolean;
begin
 select * into t from public.tickets where id=tid for update;select * into c from public.ticket_categories where id=t.category_id;
 select settings into cfg from private.ticket_config where scope_key=case when t.route='platform_support' then 'platform' else t.tenant_id::text end;
 pause_next:=(next_status='waiting_reporter' and c.pause_while_waiting) or(next_status='waiting_external' and coalesce((cfg->>'pause_waiting_external')::boolean,false));
 if pause_next and t.paused_minutes is null then
  update public.tickets set paused_minutes=jsonb_build_object('first',case when first_response_at is null then private.ticket_business_remaining(now(),first_response_due_at,cfg) end,'resolution',private.ticket_business_remaining(now(),resolution_due_at,cfg)),first_response_due_at=null,resolution_due_at=null where id=tid;
 elsif not pause_next and t.paused_minutes is not null then
  update public.tickets set first_response_due_at=case when first_response_at is null and t.paused_minutes->>'first' is not null then private.ticket_business_due(now(),(t.paused_minutes->>'first')::integer,cfg) end,resolution_due_at=case when t.paused_minutes->>'resolution' is not null then private.ticket_business_due(now(),(t.paused_minutes->>'resolution')::integer,cfg) end,paused_minutes=null where id=tid;
 end if;
end$$;
drop function if exists public.process_ticket_deadlines();
create or replace function public.process_ticket_deadlines(target_tenant uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.tickets;c public.ticket_categories;processed integer:=0;auto_days integer;
begin
 -- Limit actionable work, not the oldest open records: otherwise a full batch
 -- of future/paused/already-notified tickets permanently starves later deadlines.
 for t in
  select tt.* from public.tickets tt
  join public.tenants te on te.id=tt.tenant_id and te.status='active'
  join public.tenant_settings ts on ts.tenant_id=te.id and 'tickets'=any(ts.enabled_services)
  join public.ticket_categories tc on tc.id=tt.category_id
  where (target_tenant is null or tt.tenant_id=target_tenant) and tt.archived_at is null
   and ((tt.status='resolved' and tc.auto_close_days>0 and tt.resolved_at+tc.auto_close_days*interval '1 day'<=now())
    or (tt.status not in ('resolved','closed','cancelled')
     and ((tt.first_response_at is null and tt.first_response_due_at<now()) or tt.resolution_due_at<now())
     and not exists(select 1 from public.ticket_events e where e.ticket_id=tt.id and e.type='deadline_exceeded')))
  order by tt.created_at,tt.id for update of tt skip locked limit 100
 loop
  select * into c from public.ticket_categories where id=t.category_id;auto_days:=coalesce(c.auto_close_days,0);
  if t.status='resolved' and auto_days>0 and t.resolved_at+auto_days*interval '1 day'<=now() then
   update public.tickets set status='closed',closed_at=now() where id=t.id and status='resolved' and revision=t.revision;
   if found then perform private.ticket_emit(t.id,'reporter','auto_closed','Opgeloste melding automatisch gesloten',null);processed:=processed+1;end if;
  elsif t.status not in ('resolved','closed','cancelled') and ((t.first_response_at is null and t.first_response_due_at<now()) or t.resolution_due_at<now()) and not exists(select 1 from public.ticket_events e where e.ticket_id=t.id and e.type='deadline_exceeded') then
   perform private.ticket_emit(t.id,'reporter','deadline_exceeded','Opvolgtermijn verstreken',null);processed:=processed+1;
  end if;
 end loop;
 return jsonb_build_object('processed',processed);
end$$;
create or replace function private.ticket_onboard_membership() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if current_setting('request.jwt.claims',true)::jsonb->>'role'='service_role' or (session_user='postgres' and auth.uid() is null) then perform private.ticket_seed_membership(new.id);else insert into private.ticket_permission_bootstrap(membership_id,tenant_id) values(new.id,new.tenant_id) on conflict do nothing;end if;return new;
end$$;
drop trigger if exists ticket_membership_onboarding on public.tenant_memberships;
create trigger ticket_membership_onboarding after insert on public.tenant_memberships for each row execute function private.ticket_onboard_membership();
create or replace function private.ticket_role_revocation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.permission_grants g set enabled=false,revision=revision+1,updated_at=now() where g.membership_id=new.id and g.source='bootstrap' and g.enabled and not exists(select 1 from public.permission_role_defaults d where d.role=any(new.roles) and d.capability=g.capability);
 return new;
end$$;
drop trigger if exists ticket_role_revocation on public.tenant_memberships;
create trigger ticket_role_revocation after update of roles on public.tenant_memberships for each row execute function private.ticket_role_revocation();
create or replace function private.ticket_entitlement_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if ((tg_op='INSERT' and 'tickets'=any(new.enabled_services)) or(tg_op='UPDATE' and ('tickets'=any(new.enabled_services)) is distinct from ('tickets'=any(old.enabled_services)))) and not coalesce(current_setting('request.jwt.claims',true)::jsonb->>'role'='service_role' or(session_user='postgres' and auth.uid() is null),false) then raise exception 'Alleen platformconfiguratie kan de ticketmodule activeren of deactiveren' using errcode='42501';end if;return new;
end$$;
drop trigger if exists ticket_entitlement_guard on public.tenant_settings;
create trigger ticket_entitlement_guard before insert or update of enabled_services on public.tenant_settings for each row execute function private.ticket_entitlement_guard();
create or replace function private.ticket_onboard_platform() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.permission_grants(user_id,capability,scope,source) select new.user_id,c,'{"all":true}','bootstrap' from unnest(array['platform.support.config','platform.support.permissions'])c on conflict do nothing;return new;
end$$;
drop trigger if exists ticket_platform_onboarding on public.platform_admins;
create trigger ticket_platform_onboarding after insert on public.platform_admins for each row execute function private.ticket_onboard_platform();
create or replace function private.ticket_immutable_content() returns trigger language plpgsql set search_path='' as $$begin raise exception 'Gepubliceerde berichten en gebeurtenissen zijn onveranderlijk' using errcode='23514';end$$;
drop trigger if exists ticket_message_immutable on public.ticket_messages;
create trigger ticket_message_immutable before update or delete on public.ticket_messages for each row execute function private.ticket_immutable_content();
drop trigger if exists ticket_event_immutable on public.ticket_events;
create trigger ticket_event_immutable before update or delete on public.ticket_events for each row execute function private.ticket_immutable_content();
create or replace function private.ticket_immutable_identity() returns trigger language plpgsql set search_path='' as $$
begin if (new.id,new.tenant_id,new.route,new.reporter_user_id,new.reporter_personnel_id) is distinct from (old.id,old.tenant_id,old.route,old.reporter_user_id,old.reporter_personnel_id) then raise exception 'Route, tenant en melder zijn onveranderlijk' using errcode='23514';end if;return new;end$$;
drop trigger if exists ticket_identity_immutable on public.tickets;
create trigger ticket_identity_immutable before update on public.tickets for each row execute function private.ticket_immutable_identity();

do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like 'ticket_%' and p.proname not in ('ticket_notification_visible','ticket_platform_notification_visible') loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);end loop;
end$$;
revoke all on function public.ticket_query(uuid,text,text,jsonb) from public,anon,service_role;
grant execute on function public.ticket_query(uuid,text,text,jsonb) to authenticated;
revoke all on function public.ticket_command(uuid,text,text,jsonb,uuid) from public,anon,service_role;
grant execute on function public.ticket_command(uuid,text,text,jsonb,uuid) to authenticated;
revoke all on function public.ticket_verification(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.ticket_verification(uuid,uuid,uuid,text,jsonb) to service_role;
revoke all on function public.process_ticket_deadlines(uuid) from public,anon,authenticated;
grant execute on function public.process_ticket_deadlines(uuid) to service_role;

create or replace function public.provision_platform_tenant(
  tenant_name text,
  tenant_slug text,
  actor_user_id uuid,
  request_key uuid,
  primary_color text,
  accent_color text,
  enabled_services text[],
  admin_name text,
  admin_email text,
  tenant_domain text default null,
  sender_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_tenant_id uuid;
  normalized_domain text := nullif(lower(btrim(tenant_domain)), '');
  normalized_sender text := nullif(lower(btrim(sender_email)), '');
begin
  if not exists (select 1 from public.platform_admins pa where pa.user_id = actor_user_id) then
    raise exception 'Platform administrator required' using errcode = '42501';
  end if;
  select id into new_tenant_id from public.tenants where onboarding_key = request_key;
  if found then return new_tenant_id; end if;
  if btrim(tenant_name) = '' or lower(btrim(tenant_slug)) !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Invalid tenant identity' using errcode = '22023';
  end if;
  if primary_color !~ '^#[0-9A-Fa-f]{6}$' or accent_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Invalid tenant colors' using errcode = '22023';
  end if;
  if not enabled_services <@ array['planning','personeel','rapportage','finance','tickets']::text[] then
    raise exception 'Invalid tenant modules' using errcode = '22023';
  end if;
  if normalized_domain is not null and normalized_domain !~ '^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$' then
    raise exception 'Invalid tenant domain' using errcode = '22023';
  end if;
  if normalized_sender is not null and normalized_sender !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Invalid sender email' using errcode = '22023';
  end if;

  insert into public.tenants (name, slug, onboarding_key)
  values (btrim(tenant_name), lower(btrim(tenant_slug)), request_key)
  returning id into new_tenant_id;
  insert into public.tenant_settings (tenant_id, enabled_services)
  values (new_tenant_id, enabled_services);
  insert into public.tenant_branding (tenant_id, sender_name, sender_email, primary_color, accent_color)
  values (new_tenant_id, btrim(tenant_name), normalized_sender, upper(primary_color), upper(accent_color));
  insert into public.invoice_sequences (tenant_id, year, last_number)
  values (new_tenant_id, extract(year from current_date)::integer, 0);
  if normalized_domain is not null then
    insert into public.tenant_domains (tenant_id, host) values (new_tenant_id, normalized_domain);
  end if;
  perform private.insert_default_message_templates(new_tenant_id, actor_user_id);
  insert into public.tenant_admin_invitations (tenant_id, full_name, email)
  values (new_tenant_id, btrim(admin_name), lower(btrim(admin_email)));
  insert into public.audit_events (tenant_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (new_tenant_id, actor_user_id, 'tenant.provisioned', 'tenant', new_tenant_id,
    jsonb_build_object('name', btrim(tenant_name), 'slug', lower(btrim(tenant_slug)), 'modules', enabled_services));
  return new_tenant_id;
end;
$$;

commit;
