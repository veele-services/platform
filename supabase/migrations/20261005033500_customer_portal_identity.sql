-- Explicit customer identity before the first object; never an email-based grant.
-- Existing object bindings remain the independent resource boundary.
create table public.customer_portal_accounts (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 customer_id uuid not null,
 user_id uuid not null references auth.users(id) on delete restrict,
 contact_id uuid,
 active boolean not null default true,
 can_create_objects boolean not null default false,
 can_edit_objects boolean not null default false,
 can_edit_profile boolean not null default false,
 onboarding_draft jsonb not null default '{}'::jsonb check(jsonb_typeof(onboarding_draft)='object' and octet_length(onboarding_draft::text)<=30000),
 onboarding_step integer not null default 0 check(onboarding_step between 0 and 3),
 onboarding_completed_at timestamptz,
 version bigint not null default 1 check(version>0),
 created_by uuid references auth.users(id) on delete restrict,
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 unique(tenant_id,id),
 unique(tenant_id,customer_id,user_id),
 foreign key(tenant_id,customer_id) references public.customers(tenant_id,id) on delete restrict,
 foreign key(tenant_id,contact_id) references public.customer_contacts(tenant_id,id) on delete restrict
);
alter table public.customer_portal_accounts enable row level security;
alter table public.customer_portal_accounts force row level security;
revoke all on public.customer_portal_accounts from public,anon,authenticated;
grant select(id,tenant_id,customer_id,user_id,active) on public.customer_portal_accounts to authenticated;
grant all on public.customer_portal_accounts to service_role;

create table private.customer_portal_commands (
 id uuid primary key,
 tenant_id uuid not null,
 account_id uuid not null,
 actor_id uuid not null,
 command text not null,
 input_hash text not null,
 result jsonb not null,
 created_at timestamptz not null default clock_timestamp()
);
alter table private.customer_portal_commands enable row level security;
alter table private.customer_portal_commands force row level security;
revoke all on private.customer_portal_commands from public,anon,authenticated,service_role;

alter table public.objects add column floor_area_m2 numeric(12,2) check(floor_area_m2>0 and floor_area_m2<=1000000);
alter table public.object_records add column customer_visible boolean not null default false;

create function private.customer_account_access(t uuid,a uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.object_session_active() and exists(
  select 1 from public.customer_portal_accounts p
  join public.tenants tn on tn.id=p.tenant_id and tn.status='active'
  join public.customers c on c.tenant_id=p.tenant_id and c.id=p.customer_id
  left join public.customer_contacts ct on ct.tenant_id=p.tenant_id and ct.id=p.contact_id and ct.customer_id=p.customer_id
  where p.tenant_id=t and p.id=a and p.user_id=auth.uid() and p.active
   and c.status not in ('inactive','archived','draft')
   and(p.contact_id is null or(ct.active and(ct.active_from is null or ct.active_from<=(clock_timestamp() at time zone tn.timezone)::date)
    and(ct.active_until is null or ct.active_until>=(clock_timestamp() at time zone tn.timezone)::date)))
 );
$$;
revoke all on function private.customer_account_access(uuid,uuid) from public,anon,service_role;
grant execute on function private.customer_account_access(uuid,uuid) to authenticated;
create policy customer_portal_account_own on public.customer_portal_accounts for select to authenticated
using(private.customer_account_access(tenant_id,id));

create function private.customer_portal_manage(t uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.object_session_active() and private.service_enabled(t,'planning')
 and exists(select 1 from public.tenants tn join public.tenant_memberships m on m.tenant_id=tn.id
  where tn.id=t and tn.status='active' and m.user_id=auth.uid() and m.status='active'
   and m.roles&&array['tenant_admin','management']::public.app_role[]);
$$;
revoke all on function private.customer_portal_manage(uuid) from public,anon,service_role;
grant execute on function private.customer_portal_manage(uuid) to authenticated;

-- Minimal identity for historical bindings. No inferred contact, broad object
-- scope or self-service capability; existing history is not onboarded/reset.
insert into public.customer_portal_accounts(tenant_id,customer_id,user_id,created_by,onboarding_completed_at)
select distinct on(b.tenant_id,o.customer_id,b.user_id) b.tenant_id,o.customer_id,b.user_id,b.created_by,clock_timestamp()
from public.object_customer_bindings b join public.objects o on o.tenant_id=b.tenant_id and o.id=b.object_id
where b.active order by b.tenant_id,o.customer_id,b.user_id,b.created_at,b.id;

create function private.customer_binding_identity()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.active then
  insert into public.customer_portal_accounts(tenant_id,customer_id,user_id,created_by,onboarding_completed_at)
  select new.tenant_id,o.customer_id,new.user_id,new.created_by,clock_timestamp()
  from public.objects o where o.tenant_id=new.tenant_id and o.id=new.object_id
  on conflict(tenant_id,customer_id,user_id) do nothing;
 end if;
 return new;
end $$;
revoke all on function private.customer_binding_identity() from public,anon,authenticated,service_role;
create trigger customer_binding_identity after insert or update of active on public.object_customer_bindings
for each row execute function private.customer_binding_identity();

create function public.customer_portal_accounts(target_tenant uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.object_session_active() or not exists(select 1 from public.tenants where id=target_tenant and status='active')
 then raise exception 'Geen toegang' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',c.name)
  order by c.name,p.id) from public.customer_portal_accounts p join public.customers c on c.tenant_id=p.tenant_id and c.id=p.customer_id
  where p.tenant_id=target_tenant and private.customer_account_access(target_tenant,p.id)),'[]'::jsonb);
end $$;
revoke all on function public.customer_portal_accounts(uuid) from public,anon,service_role;
grant execute on function public.customer_portal_accounts(uuid) to authenticated;

create function public.customer_portal_management(target_tenant uuid,target_customer uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.customer_portal_manage(target_tenant) or not exists(select 1 from public.customers where tenant_id=target_tenant and id=target_customer)
 then raise exception 'Geen toegang tot klantaccountbeheer' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'userId',a.user_id,'email',u.email,'contactId',a.contact_id,
  'active',a.active,'canCreateObjects',a.can_create_objects,'canEditObjects',a.can_edit_objects,'canEditProfile',a.can_edit_profile,
  'version',a.version,'onboardingCompletedAt',a.onboarding_completed_at) order by a.created_at,a.id)
  from public.customer_portal_accounts a join auth.users u on u.id=a.user_id
  where a.tenant_id=target_tenant and a.customer_id=target_customer),'[]'::jsonb);
end $$;
revoke all on function public.customer_portal_management(uuid,uuid) from public,anon,service_role;
grant execute on function public.customer_portal_management(uuid,uuid) to authenticated;

create function public.customer_portal_bind(target_tenant uuid,target_customer uuid,target_user uuid,target_contact uuid,
 expected_version bigint,can_create boolean,can_edit_objects boolean,can_edit_profile boolean,enabled boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare a public.customer_portal_accounts;
begin
 if not private.customer_portal_manage(target_tenant) then raise exception 'Geen toegang tot klantaccountbeheer' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 if not exists(select 1 from public.customers where tenant_id=target_tenant and id=target_customer and status not in ('inactive','archived','draft'))
 or not exists(select 1 from auth.users u where u.id=target_user and u.deleted_at is null and not coalesce(u.is_anonymous,false)
   and (u.banned_until is null or u.banned_until<clock_timestamp()))
 or not exists(select 1 from public.customer_contacts c where c.tenant_id=target_tenant and c.id=target_contact and c.customer_id=target_customer and c.active)
 then raise exception 'Kies een actief account en een contact van deze klant' using errcode='23514';end if;
 select * into a from public.customer_portal_accounts where tenant_id=target_tenant and customer_id=target_customer and user_id=target_user for update;
 if (a.id is null and expected_version<>0) or(a.id is not null and a.version<>expected_version)
 then raise exception 'Het klantaccount is gewijzigd. Vernieuw het dossier.' using errcode='40001';end if;
 if a.id is null then
  insert into public.customer_portal_accounts(tenant_id,customer_id,user_id,contact_id,active,can_create_objects,can_edit_objects,can_edit_profile,created_by)
  values(target_tenant,target_customer,target_user,target_contact,enabled,can_create,can_edit_objects,can_edit_profile,auth.uid()) returning * into a;
 else
  update public.customer_portal_accounts set contact_id=target_contact,active=enabled,can_create_objects=can_create,
   can_edit_objects=customer_portal_bind.can_edit_objects,can_edit_profile=customer_portal_bind.can_edit_profile,
   version=version+1,updated_at=clock_timestamp() where id=a.id returning * into a;
 end if;
 if not enabled then
  update public.object_customer_bindings b set active=false,version=b.version+1
  from public.objects o where b.tenant_id=target_tenant and b.user_id=target_user and b.active and o.tenant_id=b.tenant_id and o.id=b.object_id and o.customer_id=target_customer;
 end if;
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data)
 values(target_tenant,auth.uid(),'customer.portal_binding','customer',target_customer,jsonb_build_object('accountId',a.id,'active',enabled,'canCreateObjects',can_create,'canEditObjects',can_edit_objects,'canEditProfile',can_edit_profile));
 return a.id;
end $$;
revoke all on function public.customer_portal_bind(uuid,uuid,uuid,uuid,bigint,boolean,boolean,boolean,boolean) from public,anon,service_role;
grant execute on function public.customer_portal_bind(uuid,uuid,uuid,uuid,bigint,boolean,boolean,boolean,boolean) to authenticated;

-- Forward-only download repair: preserve the final authorization, restore the
-- metadata required by the existing reauthorizing HTTP proxy.
create or replace function public.customer_file_access(target_tenant uuid,target_id uuid,kind text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.object_session_active() then raise exception 'Geen toegang' using errcode='42501';end if;
 if kind='document' then
  select jsonb_build_object('bucket','customer-documents','path',d.storage_path,'name',d.file_name,'mime',d.mime_type,
   'scope',jsonb_build_array(d.tenant_id::text,d.customer_id::text),'sha256',d.sha256)
  into result from public.customer_documents d where d.tenant_id=target_tenant and d.id=target_id
   and(private.customer_manage(target_tenant) or private.customer_document_access(target_tenant,d.id));
 elsif kind='invoice' then
  select jsonb_build_object('bucket','invoices','path',i.pdf_storage_path,'name',i.invoice_number||'.pdf','mime','application/pdf',
   'scope',jsonb_build_array(i.tenant_id::text,i.id::text),'sha256',i.pdf_sha256)
  into result from public.invoices i where i.tenant_id=target_tenant and i.id=target_id and i.pdf_storage_path is not null
   and((private.commercial_access(target_tenant) and private.service_enabled(target_tenant,'finance')) or private.customer_invoice_access(target_tenant,i.id));
 end if;
 if result is null then raise exception 'Document niet beschikbaar' using errcode='42501';end if;return result;
end $$;

-- Central customer notification identity must also work before an object. This
-- helper serves the worker and therefore intentionally does not require the
-- worker to impersonate a browser session; live RPCs retain their session guard.
create or replace function private.notification_actor_active(t uuid,ctx text,actor uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(ctx in ('platform','backoffice','staff','customer') and exists(select 1 from auth.users u
  where u.id=actor and u.deleted_at is null and not coalesce(u.is_anonymous,false) and(u.banned_until is null or u.banned_until<now()))
 and((ctx='platform' and t is null and(exists(select 1 from public.platform_admins a where a.user_id=actor)
  or exists(select 1 from public.permission_grants g where g.user_id=actor and g.tenant_id is null and g.enabled and g.capability like 'platform.%')))
 or(ctx<>'platform' and exists(select 1 from public.tenants where id=t and status='active') and
 case when ctx='customer' then exists(select 1 from public.customer_portal_accounts a
  join public.customers c on c.tenant_id=a.tenant_id and c.id=a.customer_id
  join public.tenants tn on tn.id=a.tenant_id
  left join public.customer_contacts ct on ct.tenant_id=a.tenant_id and ct.id=a.contact_id and ct.customer_id=a.customer_id
  where a.tenant_id=t and a.user_id=actor and a.active and c.status not in ('inactive','archived','draft')
   and(a.contact_id is null or(ct.active and(ct.active_from is null or ct.active_from<=(now() at time zone tn.timezone)::date)
    and(ct.active_until is null or ct.active_until>=(now() at time zone tn.timezone)::date))))
 else exists(select 1 from public.tenant_memberships m where m.tenant_id=t and m.user_id=actor and m.status='active')
  and(ctx<>'staff' or exists(select 1 from public.personnel p where p.tenant_id=t and p.user_id=actor and p.status='active')) end)),false);
$$;
