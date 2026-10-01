do $migration$
begin
-- One-way completion marker survives Auth deletion and membership revocation.
alter table public.tenant_admin_invitations add column if not exists request_fingerprint text;
alter table public.tenant_admin_invitations add column if not exists bound_at timestamptz;
update public.tenant_admin_invitations i set bound_at=coalesce(i.invited_at,i.created_at)
 where i.bound_at is null and (i.status in ('invited','active') or i.auth_user_id is not null or i.invited_at is not null
 or exists(select 1 from public.tenant_memberships m join auth.users u on u.id=m.user_id
   where m.tenant_id=i.tenant_id and lower(u.email)=lower(i.email)));

create or replace function private.platform_invitation_identity() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if (new.tenant_id,new.email,new.full_name,new.request_fingerprint) is distinct from
    (old.tenant_id,old.email,old.full_name,old.request_fingerprint)
 or (old.bound_at is not null and (new.bound_at is distinct from old.bound_at
     or new.status is distinct from old.status
     or (new.auth_user_id is not null and new.auth_user_id is distinct from old.auth_user_id))) then
  raise exception 'De oorspronkelijke beheerdersuitnodiging en afgeronde koppeling zijn onveranderlijk' using errcode='23514';
 end if;
 return new;
end$$;
drop trigger if exists platform_invitation_identity on public.tenant_admin_invitations;
create trigger platform_invitation_identity before update on public.tenant_admin_invitations
 for each row execute function private.platform_invitation_identity();
revoke all on function private.platform_invitation_identity() from public,anon,authenticated,service_role;

create or replace function public.provision_platform_tenant(
 tenant_name text,tenant_slug text,actor_user_id uuid,request_key uuid,primary_color text,
 accent_color text,enabled_services text[],admin_name text,admin_email text,
 tenant_domain text default null,sender_email text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare
 new_tenant_id uuid;inv public.tenant_admin_invitations;existing public.tenants;
 normalized_domain text:=nullif(lower(btrim(tenant_domain)),'');
 normalized_sender text:=nullif(lower(btrim(sender_email)),'');
 modules text[];fingerprint text;
begin
 if not exists(select 1 from public.platform_admins pa join auth.users u on u.id=pa.user_id
   where pa.user_id=actor_user_id and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())) then
  raise exception 'Platform administrator required' using errcode='42501';
 end if;
 if request_key is null or tenant_name is null or btrim(tenant_name)='' or tenant_slug is null or lower(btrim(tenant_slug)) !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
 or admin_name is null or btrim(admin_name)='' or admin_email is null or btrim(admin_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 or primary_color is null or primary_color !~ '^#[0-9A-Fa-f]{6}$' or accent_color is null or accent_color !~ '^#[0-9A-Fa-f]{6}$'
 or enabled_services is null or array_position(enabled_services,null) is not null or not enabled_services <@ array['planning','personeel','rapportage','finance','tickets']::text[] then
  raise exception 'Ongeldige tenant- of beheerdergegevens' using errcode='22023';
 end if;
 if normalized_domain is not null and normalized_domain !~ '^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$' then raise exception 'Invalid tenant domain' using errcode='22023';end if;
 if normalized_sender is not null and normalized_sender !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid sender email' using errcode='22023';end if;
 select coalesce(array_agg(distinct x order by x),'{}') into modules from unnest(enabled_services)x;
 fingerprint:=encode(extensions.digest(jsonb_build_object('name',btrim(tenant_name),'slug',lower(btrim(tenant_slug)),
  'primary',upper(primary_color),'accent',upper(accent_color),'services',modules,'adminName',btrim(admin_name),
  'adminEmail',lower(btrim(admin_email)),'domain',normalized_domain,'sender',normalized_sender)::text,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('platform-onboarding:'||request_key::text,0));
 select * into existing from public.tenants where onboarding_key=request_key;
 if found then
  select * into strict inv from public.tenant_admin_invitations where tenant_id=existing.id;
  if inv.email<>lower(btrim(admin_email)) or inv.full_name<>btrim(admin_name)
   or (inv.request_fingerprint is not null and inv.request_fingerprint<>fingerprint)
   -- Legacy records have no original full snapshot; never invent one or change their recipient.
   or (inv.request_fingerprint is null and (existing.slug<>lower(btrim(tenant_slug)) or existing.name<>btrim(tenant_name))) then
   raise exception 'Deze aanmaakcode hoort bij andere tenant- of beheerdergegevens' using errcode='23505';
  end if;
  return existing.id;
 end if;
 insert into public.tenants(name,slug,onboarding_key) values(btrim(tenant_name),lower(btrim(tenant_slug)),request_key) returning id into new_tenant_id;
 insert into public.tenant_settings(tenant_id,enabled_services) values(new_tenant_id,modules);
 insert into public.tenant_branding(tenant_id,sender_name,sender_email,primary_color,accent_color)
 values(new_tenant_id,btrim(tenant_name),normalized_sender,upper(primary_color),upper(accent_color));
 insert into public.invoice_sequences(tenant_id,year,last_number) values(new_tenant_id,extract(year from current_date)::integer,0);
 if normalized_domain is not null then insert into public.tenant_domains(tenant_id,host) values(new_tenant_id,normalized_domain);end if;
 perform private.insert_default_message_templates(new_tenant_id,actor_user_id);
 insert into public.tenant_admin_invitations(tenant_id,full_name,email,request_fingerprint)
 values(new_tenant_id,btrim(admin_name),lower(btrim(admin_email)),fingerprint);
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data)
 values(new_tenant_id,actor_user_id,'tenant.provisioned','tenant',new_tenant_id,
 jsonb_build_object('name',btrim(tenant_name),'slug',lower(btrim(tenant_slug)),'modules',modules));
 return new_tenant_id;
end$$;

-- Only the server can bind the original Auth recipient. No upsert can restore
-- an existing/revoked membership; membership and completion commit together.
create or replace function public.complete_platform_admin_invitation(target_tenant uuid,actor_user_id uuid,target_user uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare inv public.tenant_admin_invitations;recipient text;
begin
 if not exists(select 1 from public.platform_admins p join auth.users u on u.id=p.user_id
   where p.user_id=actor_user_id and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())) then
  raise exception 'Platform administrator required' using errcode='42501';
 end if;
 select * into strict inv from public.tenant_admin_invitations where tenant_id=target_tenant for update;
 if inv.bound_at is not null or inv.status in ('invited','active') then return false;end if;
 select lower(u.email) into recipient from auth.users u where u.id=target_user and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now());
 if recipient is null or recipient<>inv.email or not exists(select 1 from public.tenants where id=target_tenant and status='active') then
  raise exception 'De beheerder hoort niet bij deze actieve tenantuitnodiging' using errcode='42501';
 end if;
 insert into public.tenant_memberships(tenant_id,user_id,roles,status,activated_at)
 values(target_tenant,target_user,array['tenant_admin','management']::public.app_role[],'active',clock_timestamp()) on conflict(tenant_id,user_id) do nothing;
 if not found then raise exception 'Dit account heeft al een lidmaatschapsregistratie; wijzig rechten via tenantbeheer' using errcode='42501';end if;
 update public.tenant_admin_invitations set auth_user_id=target_user,bound_at=clock_timestamp(),
  status=case when target_user=actor_user_id then 'active' else 'invited' end,invited_at=clock_timestamp(),last_error=null where id=inv.id;
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id)
 values(target_tenant,actor_user_id,'tenant.admin.initial_bound','tenant_admin_invitation',inv.id);
 return true;
end$$;
revoke all on function public.complete_platform_admin_invitation(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.complete_platform_admin_invitation(uuid,uuid,uuid) to service_role;

-- Match existing tenant-role revocation: preserve explicit delegations and the
-- disabled bootstrap rows (ON CONFLICT must not resurrect revoked authority).
create or replace function private.platform_role_revocation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' or old.user_id is distinct from new.user_id then
  update public.permission_grants set enabled=false,revision=revision+1,updated_at=now()
   where user_id=old.user_id and tenant_id is null and source='bootstrap' and enabled;
 end if;
 return null;
end$$;
drop trigger if exists platform_role_revocation on public.platform_admins;
create trigger platform_role_revocation after delete or update of user_id on public.platform_admins
 for each row execute function private.platform_role_revocation();
revoke all on function private.platform_role_revocation() from public,anon,authenticated,service_role;
update public.permission_grants g set enabled=false,revision=revision+1,updated_at=now()
 where g.tenant_id is null and g.source='bootstrap' and g.enabled
 and not exists(select 1 from public.platform_admins p where p.user_id=g.user_id);

alter policy platform_admins_read_self on public.platform_admins
 using(user_id=(select auth.uid()) and (select private.actor_session_active()));
notify pgrst,'reload schema';
end;
$migration$;
