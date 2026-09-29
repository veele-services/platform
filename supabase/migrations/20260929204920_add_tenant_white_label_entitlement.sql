-- Whitelabel is a platform-managed entitlement, not an inference from whether a
-- tenant uploaded a logo. Existing and newly provisioned tenants retain the
-- Fieldgrid attribution unless platform management explicitly enables it.

alter table public.tenant_settings
  add column white_label_enabled boolean not null default false;

drop trigger tenant_settings_protect_platform_entitlements on public.tenant_settings;

create or replace function private.protect_platform_entitlements()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
      ''
    ) <> 'service_role' then
    if new.enabled_services is distinct from old.enabled_services then
      raise exception 'Module entitlements are managed by the platform' using errcode = '42501';
    end if;
    if new.white_label_enabled is distinct from old.white_label_enabled then
      raise exception 'Whitelabel entitlement is managed by the platform' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.protect_platform_entitlements() from public, anon, authenticated;

create trigger tenant_settings_protect_platform_entitlements
before update of enabled_services, white_label_enabled on public.tenant_settings
for each row execute function private.protect_platform_entitlements();

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
  white_label_enabled boolean,
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
    s.white_label_enabled,
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
