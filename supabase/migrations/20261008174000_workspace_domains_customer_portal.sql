-- Custom workspace hosts are separate from tenant_domains (verified mail senders).
-- Only platform-controlled, explicitly active hosts may resolve a tenant.
create table public.tenant_workspace_domains (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 host text not null unique,
 environment text not null check(environment in ('staging','production')),
 status text not null default 'pending' check(status in ('pending','verified','active')),
 verification_token uuid not null default gen_random_uuid(),
 verified_at timestamptz,
 activated_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),
 constraint workspace_host_valid check(host=lower(host) and length(host)<=253
  and host ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'
  and host !~ '(^|\.)fieldgrid\.nl$' and host !~ '(^|\.)localhost$'
  and host !~ '^[0-9.]+$'),
 constraint workspace_domain_state check(
  (status='pending' and verified_at is null and activated_at is null) or
  (status='verified' and verified_at is not null and activated_at is null) or
  (status='active' and verified_at is not null and activated_at is not null))
);
create unique index workspace_domain_active_tenant on public.tenant_workspace_domains(tenant_id,environment) where status='active';
alter table public.tenant_workspace_domains enable row level security;
alter table public.tenant_workspace_domains force row level security;
revoke all on public.tenant_workspace_domains from anon,authenticated;
grant select,insert,update,delete on public.tenant_workspace_domains to service_role;

create function public.resolve_workspace_hostname(requested_host text, requested_environment text)
returns text language sql stable security definer set search_path='' as $$
 select t.slug from public.tenant_workspace_domains d join public.tenants t on t.id=d.tenant_id
 where d.host=requested_host and d.environment=requested_environment
 and d.status='active' and t.status='active'
$$;
revoke all on function public.resolve_workspace_hostname(text,text) from public,anon,authenticated;
grant execute on function public.resolve_workspace_hostname(text,text) to service_role;

create function public.platform_workspace_domain_command(target_tenant uuid, actor_user_id uuid, operation text, input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.tenant_workspace_domains; target uuid; env text:=input->>'environment';
begin
 if not exists(select 1 from public.platform_admins p join auth.users u on u.id=p.user_id where p.user_id=actor_user_id
  and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())) then
  raise exception 'Platform administrator required' using errcode='42501';end if;
 perform 1 from public.tenants where id=target_tenant and status='active' for update;
 if not found then raise exception 'Actieve tenant vereist' using errcode='42501';end if;
 if env not in ('staging','production') or env is null then raise exception 'Ongeldige omgeving' using errcode='22023';end if;
 if operation='register' then
  insert into public.tenant_workspace_domains(tenant_id,host,environment)
  values(target_tenant,lower(btrim(input->>'host')),env) returning * into d;
 else
  target:=(input->>'id')::uuid;
  select * into d from public.tenant_workspace_domains where id=target and tenant_id=target_tenant and environment=env for update;
  if not found then raise exception 'Domein niet gevonden' using errcode='42501';end if;
  if operation='verify' then
   if d.verification_token::text is distinct from input->>'verificationToken' then raise exception 'Domein gewijzigd; controleer opnieuw' using errcode='40001';end if;
   if d.status='pending' then update public.tenant_workspace_domains set status='verified',verified_at=clock_timestamp() where id=d.id returning * into d;end if;
  elsif operation='activate' then
   if d.verification_token::text is distinct from input->>'verificationToken' then raise exception 'Domein gewijzigd; controleer opnieuw' using errcode='40001';end if;
   if d.status not in ('verified','active') then raise exception 'Verifieer eerst de DNS-records' using errcode='22023';end if;
   update public.tenant_workspace_domains set status='verified',activated_at=null where tenant_id=target_tenant and environment=env and status='active' and id<>d.id;
   update public.tenant_workspace_domains set status='active',activated_at=coalesce(activated_at,clock_timestamp()) where id=d.id returning * into d;
  elsif operation='remove' then delete from public.tenant_workspace_domains where id=d.id;
  else raise exception 'Onbekende domeinactie' using errcode='22023';end if;
 end if;
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data)
 values(target_tenant,actor_user_id,'tenant.workspace_domain.'||operation,'tenant_workspace_domain',d.id,jsonb_build_object('host',d.host,'environment',env));
 return to_jsonb(d);
end $$;
revoke all on function public.platform_workspace_domain_command(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.platform_workspace_domain_command(uuid,uuid,text,jsonb) to service_role;

alter table public.tenant_settings drop constraint tenant_settings_enabled_services_valid;
alter table public.tenant_settings add constraint tenant_settings_enabled_services_valid check(
 enabled_services <@ array['planning','personeel','rapportage','finance','tickets','klantportaal']::text[] and cardinality(enabled_services)<=6);
-- Extend the reviewed onboarding implementation without replacing its identity/replay guards.
do $$ declare definition text;begin
 select pg_get_functiondef('public.provision_platform_tenant(text,text,uuid,uuid,text,text,text[],text,text,text,text)'::regprocedure) into definition;
 if position($needle$array['planning','personeel','rapportage','finance','tickets']::text[]$needle$ in definition)=0 then
  raise exception 'Onverwachte onboardingdefinitie';end if;
 execute replace(definition,$needle$array['planning','personeel','rapportage','finance','tickets']::text[]$needle$,$replacement$array['planning','personeel','rapportage','finance','tickets','klantportaal']::text[]$replacement$);
end $$;
-- Explicit owner request: enable the already built portal for Veele Services in both isolated environments.
-- Preserve the platform entitlement trigger. This migration-only backfill needs
-- its service context even on a direct postgres connection without API claims.
do $$ declare previous_role text:=current_setting('request.jwt.claim.role',true);
begin
 perform set_config('request.jwt.claim.role','service_role',true);
 with changed as (
  update public.tenant_settings s set enabled_services=array_append(s.enabled_services,'klantportaal')
  from public.tenants t where t.id=s.tenant_id and t.slug='veele-services' and t.status='active'
  and not ('klantportaal'=any(s.enabled_services)) returning s.tenant_id
 ) insert into public.audit_events(tenant_id,action,entity_type,entity_id,after_data)
  select tenant_id,'tenant.customer_portal.enabled','tenant_settings',tenant_id,'{"module":"klantportaal","source":"owner-request-2026-10-08"}'::jsonb from changed;
 perform set_config('request.jwt.claim.role',previous_role,true);
end $$;
