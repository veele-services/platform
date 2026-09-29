-- Platform backoffice, tenant entitlements and versioned communication templates.
-- The platform UI uses the service role only after verifying platform_admins.

alter table public.tenants
  add column onboarding_key uuid;

create unique index tenants_onboarding_key_uidx
on public.tenants (onboarding_key)
where onboarding_key is not null;

alter table public.tenant_settings
  alter column enabled_services set default array['planning','personeel','rapportage','finance']::text[];

update public.tenant_settings
set enabled_services = array['planning','personeel','rapportage','finance']::text[]
where enabled_services = '{}'::text[];

alter table public.tenant_settings
  add constraint tenant_settings_enabled_services_valid
  check (
    enabled_services <@ array['planning','personeel','rapportage','finance']::text[]
    and cardinality(enabled_services) <= 4
  );

alter table public.tenant_branding
  alter column primary_color set default '#222C35',
  alter column accent_color set default '#41AC42';

-- Only replace the exact previous Fieldgrid defaults. Tenant customisation is preserved.
update public.tenant_branding
set primary_color = '#222C35', accent_color = '#41AC42'
where upper(primary_color) = '#0B1D3A'
  and upper(accent_color) = '#00B7B3';

create table public.tenant_admin_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  full_name text not null,
  email text not null,
  status text not null default 'pending' check (status in ('pending','invited','active','failed')),
  auth_user_id uuid references auth.users(id) on delete set null,
  last_error text,
  invited_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, email),
  unique (tenant_id, id),
  constraint tenant_admin_invitations_name_not_blank check (btrim(full_name) <> ''),
  constraint tenant_admin_invitations_email_shape check (email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);

create table public.tenant_message_templates (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  template_key text not null check (template_key in ('invoice','quote','workorder','schedule')),
  channel text not null check (channel in ('email','push')),
  default_subject text not null,
  default_body text not null,
  subject text not null,
  body text not null,
  revision integer not null default 1 check (revision > 0),
  customized boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (tenant_id, template_key),
  constraint tenant_message_templates_subject_valid check (
    length(btrim(subject)) between 1 and 200 and subject !~ E'[\r\n]'
  ),
  constraint tenant_message_templates_body_valid check (length(btrim(body)) between 1 and 6000),
  constraint tenant_message_templates_default_subject_valid check (
    length(btrim(default_subject)) between 1 and 200 and default_subject !~ E'[\r\n]'
  ),
  constraint tenant_message_templates_default_body_valid check (length(btrim(default_body)) between 1 and 6000),
  constraint tenant_message_templates_channel_key check (
    (template_key in ('invoice','quote') and channel = 'email')
    or (template_key in ('workorder','schedule') and channel = 'push')
  )
);

create table public.tenant_message_template_revisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  template_key text not null,
  revision integer not null check (revision > 0),
  channel text not null check (channel in ('email','push')),
  subject text not null,
  body text not null,
  customized boolean not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, template_key, revision),
  foreign key (tenant_id, template_key)
    references public.tenant_message_templates(tenant_id, template_key) on delete cascade
);

create index tenant_message_template_revisions_history_idx
on public.tenant_message_template_revisions (tenant_id, template_key, revision desc);

alter table public.mail_deliveries
  add column template_revision integer,
  add column render_snapshot jsonb,
  add column branding_snapshot jsonb;

alter table public.mail_deliveries
  add constraint mail_deliveries_template_revision_valid
    check (template_revision is null or template_revision > 0);

create or replace function private.insert_default_message_templates(target_tenant_id uuid, actor_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.tenant_message_templates (
    tenant_id, template_key, channel, default_subject, default_body,
    subject, body, customized, updated_by
  )
  values
    (target_tenant_id, 'invoice', 'email',
      'Factuur {factuurnummer} van {bedrijfsnaam}',
      E'Beste {klantnaam},\n\nBijgevoegd vindt u factuur {factuurnummer}. U kunt deze veilig betalen met de knop hieronder.\n\nMet vriendelijke groet,\n{bedrijfsnaam}',
      'Factuur {factuurnummer} van {bedrijfsnaam}',
      E'Beste {klantnaam},\n\nBijgevoegd vindt u factuur {factuurnummer}. U kunt deze veilig betalen met de knop hieronder.\n\nMet vriendelijke groet,\n{bedrijfsnaam}', false, actor_user_id),
    (target_tenant_id, 'quote', 'email',
      'Uw prijsopgave van {bedrijfsnaam}',
      E'Beste {klantnaam},\n\nUw prijsopgave staat klaar. Bekijk de werkzaamheden en geef uw akkoord via de knop hieronder.\n\nMet vriendelijke groet,\n{bedrijfsnaam}',
      'Uw prijsopgave van {bedrijfsnaam}',
      E'Beste {klantnaam},\n\nUw prijsopgave staat klaar. Bekijk de werkzaamheden en geef uw akkoord via de knop hieronder.\n\nMet vriendelijke groet,\n{bedrijfsnaam}', false, actor_user_id),
    (target_tenant_id, 'workorder', 'push',
      'Nieuwe werkbon',
      'Er staat een nieuwe werkbon voor {datum} bij {locatie} voor je klaar.',
      'Nieuwe werkbon',
      'Er staat een nieuwe werkbon voor {datum} bij {locatie} voor je klaar.', false, actor_user_id),
    (target_tenant_id, 'schedule', 'push',
      'Je planning is gewijzigd',
      'De planning van werkbon {bonnummer} is aangepast. Bekijk de bijgewerkte tijden in de app.',
      'Je planning is gewijzigd',
      'De planning van werkbon {bonnummer} is aangepast. Bekijk de bijgewerkte tijden in de app.', false, actor_user_id)
  on conflict (tenant_id, template_key) do nothing;

  insert into public.tenant_message_template_revisions (
    tenant_id, template_key, revision, channel, subject, body, customized, actor_user_id
  )
  select tenant_id, template_key, revision, channel, subject, body, customized, updated_by
  from public.tenant_message_templates
  where tenant_id = target_tenant_id
  on conflict (tenant_id, template_key, revision) do nothing;
$$;

revoke all on function private.insert_default_message_templates(uuid, uuid) from public, anon, authenticated;

select private.insert_default_message_templates(t.id, null)
from public.tenants t;

create or replace function private.initialize_tenant_templates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.insert_default_message_templates(new.id, auth.uid());
  return new;
end;
$$;

revoke all on function private.initialize_tenant_templates() from public, anon, authenticated;

create trigger tenants_initialize_message_templates
after insert on public.tenants
for each row execute function private.initialize_tenant_templates();

drop function public.resolve_tenant_context(uuid, text);

create function public.resolve_tenant_context(requested_tenant_id uuid default null, requested_host text default null)
returns table (
  tenant_id uuid,
  tenant_slug text,
  tenant_name text,
  roles public.app_role[],
  timezone text,
  primary_color text,
  accent_color text,
  logo_path text,
  enabled_services text[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    t.id,
    t.slug,
    t.name,
    tm.roles,
    t.timezone,
    b.primary_color,
    b.accent_color,
    b.logo_path,
    s.enabled_services
  from public.tenants t
  join public.tenant_memberships tm
    on tm.tenant_id = t.id
   and tm.user_id = (select auth.uid())
   and tm.status = 'active'
  join public.tenant_branding b on b.tenant_id = t.id
  join public.tenant_settings s on s.tenant_id = t.id
  left join public.tenant_domains d
    on d.tenant_id = t.id
   and d.verified_at is not null
   and lower(d.host) = lower(requested_host)
  where t.status = 'active'
    and (requested_tenant_id is null or t.id = requested_tenant_id)
    and (requested_host is null or d.id is not null)
  order by t.created_at
  limit 1;
$$;

revoke execute on function public.resolve_tenant_context(uuid, text) from public, anon;
grant execute on function public.resolve_tenant_context(uuid, text) to authenticated;

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
  if not enabled_services <@ array['planning','personeel','rapportage','finance']::text[] then
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

revoke execute on function public.provision_platform_tenant(text,text,uuid,uuid,text,text,text[],text,text,text,text)
from public, anon, authenticated;
grant execute on function public.provision_platform_tenant(text,text,uuid,uuid,text,text,text[],text,text,text,text)
to service_role;

create or replace function public.save_tenant_message_template(
  target_tenant_id uuid,
  target_template_key text,
  target_subject text,
  target_body text,
  reset_to_default boolean,
  actor_user_id uuid
)
returns public.tenant_message_templates
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_template public.tenant_message_templates;
  result public.tenant_message_templates;
begin
  if not exists (select 1 from public.platform_admins pa where pa.user_id = actor_user_id) then
    raise exception 'Platform administrator required' using errcode = '42501';
  end if;
  select * into current_template
  from public.tenant_message_templates
  where tenant_id = target_tenant_id and template_key = target_template_key
  for update;
  if not found then raise exception 'Template not found' using errcode = 'P0002'; end if;

  update public.tenant_message_templates
  set subject = case when reset_to_default then default_subject else target_subject end,
      body = case when reset_to_default then default_body else target_body end,
      customized = not reset_to_default,
      revision = current_template.revision + 1,
      updated_by = actor_user_id,
      updated_at = clock_timestamp()
  where tenant_id = target_tenant_id and template_key = target_template_key
  returning * into result;

  insert into public.tenant_message_template_revisions (
    tenant_id, template_key, revision, channel, subject, body, customized, actor_user_id
  ) values (
    result.tenant_id, result.template_key, result.revision, result.channel,
    result.subject, result.body, result.customized, actor_user_id
  );
  insert into public.audit_events (tenant_id, actor_user_id, action, entity_type, after_data)
  values (target_tenant_id, actor_user_id,
    case when reset_to_default then 'message_template.reset' else 'message_template.updated' end,
    'message_template',
    jsonb_build_object('template_key', target_template_key, 'revision', result.revision, 'customized', result.customized));
  return result;
end;
$$;

revoke execute on function public.save_tenant_message_template(uuid,text,text,text,boolean,uuid)
from public, anon, authenticated;
grant execute on function public.save_tenant_message_template(uuid,text,text,text,boolean,uuid)
to service_role;

create or replace function private.enqueue_schedule_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'cancelled'
    and (
      new.personnel_id is distinct from old.personnel_id
      or new.projected_start_at is distinct from old.projected_start_at
      or new.projected_end_at is distinct from old.projected_end_at
    )
  then
    perform private.enqueue_event(
      new.tenant_id,
      'work_order.rescheduled',
      'work_order',
      new.work_order_id,
      jsonb_build_object('work_order_id', new.work_order_id, 'personnel_id', new.personnel_id),
      'schedule:' || new.id::text || ':' || new.version::text
    );
  end if;
  return new;
end;
$$;

revoke all on function private.enqueue_schedule_change() from public, anon, authenticated;

create trigger work_order_assignments_schedule_outbox
after update of personnel_id, projected_start_at, projected_end_at
on public.work_order_assignments
for each row execute function private.enqueue_schedule_change();

alter table public.tenant_admin_invitations enable row level security;
alter table public.tenant_admin_invitations force row level security;
alter table public.tenant_message_templates enable row level security;
alter table public.tenant_message_templates force row level security;
alter table public.tenant_message_template_revisions enable row level security;
alter table public.tenant_message_template_revisions force row level security;

create policy tenant_admin_invitations_platform_read
on public.tenant_admin_invitations for select to authenticated
using ((select private.is_platform_admin()));
create policy tenant_message_templates_member_read
on public.tenant_message_templates for select to authenticated
using ((select private.is_member(tenant_id)) or (select private.is_platform_admin()));
create policy tenant_message_template_revisions_platform_read
on public.tenant_message_template_revisions for select to authenticated
using ((select private.is_platform_admin()));

grant select on public.tenant_admin_invitations to authenticated;
grant select on public.tenant_message_templates to authenticated;
grant select on public.tenant_message_template_revisions to authenticated;
grant select, insert, update, delete on public.tenant_admin_invitations to service_role;
grant select, insert, update, delete on public.tenant_message_templates to service_role;
grant select, insert, update, delete on public.tenant_message_template_revisions to service_role;

create trigger tenant_admin_invitations_touch
before update on public.tenant_admin_invitations
for each row execute function private.touch_updated_at();

-- Entitlements are an authorization boundary as well as a navigation choice.
-- Restrictive policies augment the existing role and tenant policies.
create or replace function private.service_enabled(target_tenant_id uuid, target_service text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tenant_settings s
    where s.tenant_id = target_tenant_id
      and target_service = any(s.enabled_services)
  );
$$;

revoke all on function private.service_enabled(uuid, text) from public, anon, authenticated;
grant execute on function private.service_enabled(uuid, text) to authenticated;

create or replace function private.protect_platform_entitlements()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.enabled_services is distinct from old.enabled_services
    and coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
      ''
    ) <> 'service_role'
  then
    raise exception 'Module entitlements are managed by the platform' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.protect_platform_entitlements() from public, anon, authenticated;

create trigger tenant_settings_protect_platform_entitlements
before update of enabled_services on public.tenant_settings
for each row execute function private.protect_platform_entitlements();

create or replace function private.enforce_service_entitlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_tenant_id uuid := case when tg_op = 'DELETE' then old.tenant_id else new.tenant_id end;
  caller_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
begin
  if caller_role in ('authenticated', 'anon')
    and not private.service_enabled(target_tenant_id, tg_argv[0])
  then
    raise exception 'Module % is not enabled for this tenant', tg_argv[0] using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.enforce_service_entitlement() from public, anon, authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'customers','customer_contacts','objects','appointment_slots','requests','quotes',
    'task_catalog','task_revisions','work_orders','work_order_tasks','work_order_allowed_extra_work',
    'work_order_assignments','dispatches','status_events','travel_legs','open_shifts','shift_interests'
  ]
  loop
    execute format(
      'create policy %I_planning_entitlement on public.%I as restrictive for all to authenticated using ((select private.service_enabled(tenant_id, ''planning''))) with check ((select private.service_enabled(tenant_id, ''planning'')))',
      table_name,
      table_name
    );
    execute format(
      'create trigger %I_service_entitlement_guard before insert or update or delete on public.%I for each row execute function private.enforce_service_entitlement(''planning'')',
      table_name,
      table_name
    );
  end loop;

  foreach table_name in array array[
    'function_catalog','personnel','personnel_functions','availability','qualifications',
    'personnel_contracts','certificates','personnel_documents','personnel_notes','reminders',
    'announcements','announcement_reads','time_entries'
  ]
  loop
    execute format(
      'create policy %I_personnel_entitlement on public.%I as restrictive for all to authenticated using ((select private.service_enabled(tenant_id, ''personeel''))) with check ((select private.service_enabled(tenant_id, ''personeel'')))',
      table_name,
      table_name
    );
    execute format(
      'create trigger %I_service_entitlement_guard before insert or update or delete on public.%I for each row execute function private.enforce_service_entitlement(''personeel'')',
      table_name,
      table_name
    );
  end loop;

  foreach table_name in array array['extra_work_rules','report_entries','attachments','signatures','review_decisions']
  loop
    execute format(
      'create policy %I_reporting_entitlement on public.%I as restrictive for all to authenticated using ((select private.service_enabled(tenant_id, ''rapportage''))) with check ((select private.service_enabled(tenant_id, ''rapportage'')))',
      table_name,
      table_name
    );
    execute format(
      'create trigger %I_service_entitlement_guard before insert or update or delete on public.%I for each row execute function private.enforce_service_entitlement(''rapportage'')',
      table_name,
      table_name
    );
  end loop;

  foreach table_name in array array[
    'invoice_sequences','invoices','invoice_lines','invoice_groups','invoice_group_items',
    'payment_attempts','payment_allocations'
  ]
  loop
    execute format(
      'create policy %I_finance_entitlement on public.%I as restrictive for all to authenticated using ((select private.service_enabled(tenant_id, ''finance''))) with check ((select private.service_enabled(tenant_id, ''finance'')))',
      table_name,
      table_name
    );
    execute format(
      'create trigger %I_service_entitlement_guard before insert or update or delete on public.%I for each row execute function private.enforce_service_entitlement(''finance'')',
      table_name,
      table_name
    );
  end loop;
end;
$$;
