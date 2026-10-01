-- Query-first workfile. Not a release migration: module cutover is still pending.
begin;
alter table public.permission_catalog add column if not exists resource text;
alter table public.permission_catalog add column if not exists classification text not null default 'normal' check(classification in ('normal','sensitive','administrative'));
alter table public.permission_catalog add column if not exists status text not null default 'active' check(status in ('active','deprecated','planned'));
alter table public.permission_catalog add column if not exists definition_version integer not null default 1 check(definition_version>0);
alter table public.permission_catalog add column if not exists conditions text[] not null default '{}';
alter table public.permission_catalog add column if not exists code_origins text[] not null default '{}';
update public.permission_catalog set resource=split_part(key,'.',1) where resource is null;
update public.permission_catalog set classification='sensitive' where sensitive and classification='normal';

insert into public.permission_catalog(key,domain,name,description,module,resource,action,scopes,classification,code_origins)
select key,'tenant',name,description,'authorization',resource,action,array['tenant'],classification,array['scripts/sql/authorization-roles.sql'] from (values
 ('backoffice.access','Backoffice openen','Opent de backofficecontext; geeft geen dossierinzage.','backoffice','access','normal'),
 ('permissions.read','Rechten bekijken','Bekijk het register en de uitleg van toewijsbare tenantrechten.','permissions','read','normal'),
 ('roles.read','Rollen bekijken','Bekijk rollen en de expliciete rechten en bereiken.','roles','read','normal'),
 ('roles.create','Rollen aanmaken','Maak een eigen rol binnen je delegatiebereik.','roles','create','administrative'),
 ('roles.update','Rollen wijzigen','Wijzig een rol voor alle gebruikers van die rol.','roles','update','administrative'),
 ('roles.duplicate','Rollen dupliceren','Maak een zelfstandige kopie binnen je delegatiebereik.','roles','duplicate','administrative'),
 ('roles.archive','Rollen archiveren','Archiveer een rol nadat actieve toewijzingen zijn vervangen of ingetrokken.','roles','archive','administrative'),
 ('roles.assign','Rollen toewijzen','Ken gecontroleerde rollen en bereiken toe aan een lidmaatschap.','roles','assign','administrative'),
 ('roles.unassign','Rollen intrekken','Trek een roltoewijzing in, zonder historie te verwijderen.','roles','unassign','administrative'),
 ('roles.permissions.delegate','Rechten delegeren','Delegeer uitsluitend de expliciet vastgelegde tenantrechten en bereiken; geeft zelf geen inzage.','roles','delegate','administrative'),
 ('users.read','Gebruikers bekijken','Bekijk tenantleden voor roltoewijzingen.','users','read','normal'),
 ('authorization.audit.read','Beheerhistorie bekijken','Bekijk rollenwijzigingen zonder de historie te kunnen wissen.','authorization','read','sensitive')
)v(key,name,description,resource,action,classification) on conflict(key) do nothing;

create table if not exists private.authorization_state (
 tenant_id uuid primary key references public.tenants(id), revision bigint not null default 1,
 -- This is a cutover guard, not an alternate permission system. Only a reviewed
 -- migration may activate after all legacy entry points have been converted.
 enforced boolean not null default false, seeded_at timestamptz not null default now()
);
create table if not exists private.role_templates (
 code text not null, version integer not null check(version>0), name text not null,
 description text not null, permissions jsonb not null, delegations jsonb not null,
 primary key(code,version)
);
create table if not exists private.tenant_roles (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 name text not null check(length(btrim(name)) between 2 and 100), description text not null default '' check(length(description)<=1000),
 template_code text, template_version integer, revision bigint not null default 1,
 archived_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(tenant_id,id), foreign key(template_code,template_version) references private.role_templates(code,version),
 check((template_code is null)=(template_version is null))
);
create unique index if not exists tenant_roles_name on private.tenant_roles(tenant_id,lower(btrim(name))) where archived_at is null;
create unique index if not exists tenant_roles_template on private.tenant_roles(tenant_id,template_code) where template_code is not null;
create table if not exists private.role_permissions (
 tenant_id uuid not null, role_id uuid not null, capability text not null references public.permission_catalog(key),
 scope jsonb not null default '{"all":true}', primary key(role_id,capability),
 foreign key(tenant_id,role_id) references private.tenant_roles(tenant_id,id)
);
create table if not exists private.role_delegations (
 tenant_id uuid not null, role_id uuid not null, capability text not null references public.permission_catalog(key),
 scope jsonb not null default '{"all":true}', primary key(role_id,capability),
 foreign key(tenant_id,role_id) references private.tenant_roles(tenant_id,id)
);
create unique index if not exists membership_tenant_identity on public.tenant_memberships(tenant_id,id);
create table if not exists private.role_assignments (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, membership_id uuid not null, role_id uuid not null,
 scope jsonb not null default '{"all":true}', expires_at timestamptz, revoked_at timestamptz,
 revision bigint not null default 1, created_at timestamptz not null default now(),
 foreign key(tenant_id,membership_id) references public.tenant_memberships(tenant_id,id),
 foreign key(tenant_id,role_id) references private.tenant_roles(tenant_id,id)
);
create unique index if not exists role_assignments_active on private.role_assignments(membership_id,role_id) where revoked_at is null;
create index if not exists role_assignments_role on private.role_assignments(role_id) where revoked_at is null;
create index if not exists role_permissions_tenant on private.role_permissions(tenant_id);
create index if not exists role_delegations_tenant on private.role_delegations(tenant_id);
create index if not exists role_assignments_tenant on private.role_assignments(tenant_id);
create table if not exists private.authorization_audit (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), actor_id uuid references auth.users(id),
 action text not null, resource_id uuid, before_value jsonb, after_value jsonb,
 revision bigint not null, created_at timestamptz not null default now()
);
create index if not exists authorization_audit_tenant on private.authorization_audit(tenant_id,created_at desc,id);
create table if not exists private.authorization_receipts (
 tenant_id uuid not null references public.tenants(id), actor_id uuid not null references auth.users(id), request_id uuid not null,
 input_hash text not null, result jsonb not null, primary key(tenant_id,actor_id,request_id)
);
do $$declare n text;begin
 foreach n in array array['authorization_state','role_templates','tenant_roles','role_permissions','role_delegations','role_assignments','authorization_audit','authorization_receipts'] loop
 execute format('alter table private.%I enable row level security',n);
 execute format('alter table private.%I force row level security',n);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',n);
 end loop;
end$$;

-- A scope is either the whole tenant, or an intersection of non-empty, real
-- selections. Unknown keys, false all and empty arrays never grant access.
create or replace function private.authorization_scope_valid(t uuid,s jsonb,cap text default null)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare k text; v jsonb; ref uuid; supported text[];
begin
 if s is null or jsonb_typeof(s)<>'object' or s='{}' then return false;end if;
 if cap is not null then select scopes into supported from public.permission_catalog where key=cap and domain='tenant' and status='active';if not found then return false;end if;end if;
 if s='{"all":true}'::jsonb then return cap is null or 'tenant'=any(supported);end if;
 for k,v in select * from jsonb_each(s) loop
  if k not in ('personnel_ids','object_ids','customer_ids','category_ids') or jsonb_typeof(v)<>'array' or jsonb_array_length(v)=0 or jsonb_array_length(v)>500 then return false;end if;
  if cap is not null and not(replace(k,'_ids','')=any(supported) or (k='category_ids' and 'category'=any(supported))) then return false;end if;
  for ref in select value::uuid from jsonb_array_elements_text(v) loop
   if ref is null or not (case k
    when 'personnel_ids' then exists(select 1 from public.personnel where tenant_id=t and id=ref)
    when 'object_ids' then exists(select 1 from public.objects where tenant_id=t and id=ref)
    when 'customer_ids' then exists(select 1 from public.customers where tenant_id=t and id=ref)
    when 'category_ids' then exists(select 1 from public.ticket_categories where id=ref and (tenant_id=t or (cap like 'tickets.support.%' and tenant_id is null and route='platform_support')))
    else false end) then return false;end if;
  end loop;
 end loop;
 return true;
exception when invalid_text_representation then return false;
end$$;
create or replace function private.authorization_scope_covers(outer_scope jsonb,inner_scope jsonb)
returns boolean language sql immutable set search_path='' as $$
 select coalesce(outer_scope='{"all":true}'::jsonb or
 (outer_scope<>'{}'::jsonb and inner_scope<>'{"all":true}'::jsonb and not exists(
  select 1 from jsonb_each(outer_scope) e where not(inner_scope ? e.key) or not(e.value @> (inner_scope->e.key))
 )),false)
$$;
create or replace function private.authorization_scope_matches(s jsonb,resource jsonb)
returns boolean language sql immutable set search_path='' as $$
 select coalesce(s='{"all":true}'::jsonb or (s<>'{}'::jsonb and not exists(
 select 1 from jsonb_each(s) e where e.key not in ('personnel_ids','object_ids','customer_ids','category_ids')
 or jsonb_typeof(e.value)<>'array' or jsonb_array_length(e.value)=0 or not coalesce(e.value ? (resource->>replace(e.key,'_ids','_id')),false)
 )),false)
$$;
create or replace function private.authorization_member(t uuid,actor uuid)
returns uuid language sql stable security definer set search_path='' as $$
 select m.id from public.tenant_memberships m join public.tenants x on x.id=m.tenant_id join auth.users u on u.id=m.user_id
 where m.tenant_id=t and m.user_id=actor and m.status='active' and x.status='active'
 and u.deleted_at is null and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<=now())
 and u.email_confirmed_at is not null
$$;
create or replace function private.authorization_resource_valid(t uuid,resource_context jsonb)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare k text;v jsonb;ref uuid;
begin
 if resource_context is null or jsonb_typeof(resource_context)<>'object' then return false;end if;
 for k,v in select * from jsonb_each(resource_context) loop
  if k not in ('personnel_id','object_id','customer_id','category_id') then return false;end if;
  if v='null'::jsonb then continue;end if;
  ref:=(v#>>'{}')::uuid;
  if ref is null or not (case k
   when 'personnel_id' then exists(select 1 from public.personnel where tenant_id=t and id=ref)
   when 'object_id' then exists(select 1 from public.objects where tenant_id=t and id=ref)
   when 'customer_id' then exists(select 1 from public.customers where tenant_id=t and id=ref)
   when 'category_id' then exists(select 1 from public.ticket_categories where id=ref and (tenant_id=t or (tenant_id is null and route='platform_support')))
   else false end) then return false;end if;
 end loop;
 return true;
exception when invalid_text_representation then return false;
end$$;
create or replace function private.authorization_has(t uuid,actor uuid,cap text,resource_context jsonb default '{}')
returns boolean language sql stable security definer set search_path='' as $$
 select private.authorization_resource_valid(t,resource_context) and exists(select 1 from private.role_assignments a join private.tenant_roles r on r.id=a.role_id and r.tenant_id=a.tenant_id
 join private.role_permissions p on p.role_id=r.id and p.tenant_id=r.tenant_id
 join public.permission_catalog c on c.key=p.capability and c.domain='tenant' and c.status='active'
 where a.tenant_id=t and a.membership_id=private.authorization_member(t,actor) and r.archived_at is null and a.revoked_at is null
 and (a.expires_at is null or a.expires_at>now()) and p.capability=cap
 and private.authorization_scope_matches(p.scope,resource_context) and private.authorization_scope_matches(a.scope,resource_context))
$$;
create or replace function private.authorization_can_delegate(t uuid,actor uuid,cap text,s jsonb)
returns boolean language sql stable security definer set search_path='' as $$
 select private.authorization_has(t,actor,'roles.permissions.delegate') and private.authorization_scope_valid(t,s,cap)
 and exists(select 1 from private.role_assignments a join private.tenant_roles r on r.id=a.role_id and r.tenant_id=a.tenant_id
 join private.role_delegations d on d.role_id=r.id and d.tenant_id=r.tenant_id
 where a.tenant_id=t and a.membership_id=private.authorization_member(t,actor) and r.archived_at is null and a.revoked_at is null
 and (a.expires_at is null or a.expires_at>now()) and d.capability=cap
 and private.authorization_scope_covers(d.scope,s) and private.authorization_scope_covers(a.scope,s))
$$;
create or replace function private.authorization_role_snapshot(rid uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(r)||jsonb_build_object('permissions',coalesce((select jsonb_agg(jsonb_build_object('key',capability,'scope',scope) order by capability) from private.role_permissions where role_id=r.id),'[]'),
 'delegations',coalesce((select jsonb_agg(jsonb_build_object('key',capability,'scope',scope) order by capability) from private.role_delegations where role_id=r.id),'[]')) from private.tenant_roles r where id=rid
$$;

-- Preserve the existing ticket/notification entry point. After the atomic
-- tenant cutover there is NO fallback to old direct grants for tenant keys.
-- Platform grants are deliberately outside tenant role management.
create or replace function private.ticket_has_cap(t uuid,actor uuid,cap text,category uuid default null,person uuid default null,obj uuid default null,customer uuid default null,assigned uuid default null)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if exists(select 1 from public.permission_catalog where key=cap and domain='tenant')
 and exists(select 1 from private.authorization_state where tenant_id=t and enforced) then
  return private.authorization_has(t,actor,cap,jsonb_build_object('category_id',category,'personnel_id',person,'object_id',obj,'customer_id',customer));
 end if;
 return exists(select 1 from public.permission_grants g join public.permission_catalog c on c.key=g.capability
 left join public.tenant_memberships m on m.id=g.membership_id and m.tenant_id=g.tenant_id and m.user_id=g.user_id
 where g.user_id=actor and g.capability=cap and g.enabled and ((c.domain='platform' and g.tenant_id is null) or (c.domain='tenant' and g.tenant_id=t and m.status='active'))
 and (not(g.scope?'tenant_ids') or g.scope->'tenant_ids' ? t::text)
 and (not(g.scope?'category_ids') or g.scope->'category_ids' ? category::text)
 and (not(g.scope?'personnel_ids') or g.scope->'personnel_ids' ? person::text)
 and (not(g.scope?'object_ids') or g.scope->'object_ids' ? obj::text)
 and (not(g.scope?'customer_ids') or g.scope->'customer_ids' ? customer::text)
 and (not coalesce((g.scope->>'assigned_only')::boolean,false) or assigned=actor)
 and (g.scope->>'all'='true' or g.scope ?| array['tenant_ids','category_ids','personnel_ids','object_ids','customer_ids','assigned_only']));
end$$;
create or replace function private.authorization_guard_manager(t uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.tenant_memberships m where m.tenant_id=t and not exists(
 select 1 from unnest(array['backoffice.access','roles.read','roles.update','roles.assign','roles.permissions.delegate']) cap
 where not private.authorization_has(t,m.user_id,cap) or not exists(
 select 1 from private.role_assignments a join private.tenant_roles r on r.id=a.role_id join private.role_permissions p on p.role_id=r.id
 where a.membership_id=m.id and a.revoked_at is null and a.expires_at is null and r.archived_at is null
 and a.scope='{"all":true}' and p.scope='{"all":true}' and p.capability=cap)) and exists(
 select 1 from private.role_assignments a join private.tenant_roles r on r.id=a.role_id join private.role_delegations d on d.role_id=a.role_id where a.membership_id=m.id
 and a.revoked_at is null and a.scope='{"all":true}' and d.scope='{"all":true}' and d.capability='roles.assign'
 and a.expires_at is null and r.archived_at is null)) then
 raise exception 'Geef eerst een andere actieve gebruiker werkend rollenbeheer; de laatste beheerder kan niet worden verwijderd.' using errcode='23514';end if;
end$$;

create or replace function private.authorization_assignment_constraint()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not private.authorization_scope_valid(new.tenant_id,new.scope) then raise exception 'Ongeldig toewijzingsbereik' using errcode='23514';end if;
 if tg_op='UPDATE' and (new.id<>old.id or new.tenant_id<>old.tenant_id or new.role_id<>old.role_id or new.membership_id<>old.membership_id) then
 raise exception 'De identiteit van een roltoewijzing is onveranderlijk' using errcode='23514';end if;
 return new;
end$$;
drop trigger if exists role_assignment_valid on private.role_assignments;
create trigger role_assignment_valid before insert or update on private.role_assignments for each row execute function private.authorization_assignment_constraint();

-- Status changes outside the roles UI must use the same serialized guard once
-- the reviewed tenant-wide cutover has been activated. Portal-only tenants and
-- pre-cutover memberships are deliberately not modified by this workfile.
create or replace function private.authorization_membership_guard()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from private.authorization_state where tenant_id=old.tenant_id and enforced)
 and (tg_op='DELETE' or new.status is distinct from old.status) then
  perform pg_advisory_xact_lock(hashtextextended('authorization:'||old.tenant_id::text,0));
  perform private.authorization_guard_manager(old.tenant_id);
  update private.authorization_state set revision=revision+1 where tenant_id=old.tenant_id;
 end if;
 return null;
end$$;
drop trigger if exists authorization_membership_guard on public.tenant_memberships;
create trigger authorization_membership_guard after update or delete on public.tenant_memberships for each row execute function private.authorization_membership_guard();

create or replace function private.authorization_user_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare t uuid;
begin
 if new.deleted_at is distinct from old.deleted_at or new.banned_until is distinct from old.banned_until
 or new.email_confirmed_at is distinct from old.email_confirmed_at or new.is_anonymous is distinct from old.is_anonymous then
  for t in select distinct m.tenant_id from public.tenant_memberships m join private.authorization_state s on s.tenant_id=m.tenant_id where m.user_id=new.id and s.enforced order by m.tenant_id loop
   perform pg_advisory_xact_lock(hashtextextended('authorization:'||t::text,0));
   perform private.authorization_guard_manager(t);
   update private.authorization_state set revision=revision+1 where tenant_id=t;
  end loop;
 end if;
 return null;
end$$;
drop trigger if exists authorization_user_guard on auth.users;
create trigger authorization_user_guard after update on auth.users for each row execute function private.authorization_user_guard();

-- The initial templates contain only implemented capabilities. Operational
-- additions require the corresponding module cutover, not invented CRUD keys.
insert into private.role_templates(code,version,name,description,permissions,delegations)
select code,1,name,description,
 (select jsonb_agg(jsonb_build_object('key',c.key,'scope','{"all":true}'::jsonb) order by c.key) from public.permission_catalog c where
 c.key='backoffice.access' or (code in ('tenant_admin','management') and c.module='authorization' and c.domain='tenant')),
 case when code in ('tenant_admin','management') then
 (select jsonb_agg(jsonb_build_object('key',c.key,'scope','{"all":true}'::jsonb) order by c.key) from public.permission_catalog c where c.domain='tenant' and c.status='active') else '[]'::jsonb end
from(values
 ('tenant_admin','Tenantbeheerder','Beheer van gebruikers, rollen en organisatie; geen impliciete vertrouwelijke inzage.'),
 ('management','Management','Bedrijfsleiding en expliciet rollenbeheer; delegatie staat los van inzage.'),
 ('planning','Planning','Planning, inzet en operationele gegevens; geen vertrouwelijke HR-inzage.'),
 ('finance','Administratie / Finance','Facturatie en betalingen; geen personeelscontracten of objectgeheimen.'),
 ('hr','HR / Personeelsbeheer','Personeelsbeheer; geen algemene facturatie of objectgeheimen.'),
 ('coordination','Uitvoeringscoördinator','Operationele voortgang en kwaliteit binnen toegewezen bereik.'),
 ('sales','Verkoop / Accountbeheer','Aanvragen, offertes en commerciële opvolging.')
)v(code,name,description) on conflict do nothing;

create or replace function private.authorization_seed(t uuid)
returns void language plpgsql security definer set search_path='' as $$
declare tpl private.role_templates;rid uuid; p jsonb; proposed_name text; suffix integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('authorization:'||t::text,0));
 insert into private.authorization_state(tenant_id) values(t) on conflict do nothing;
 for tpl in select * from private.role_templates where version=1 loop
  if exists(select 1 from private.tenant_roles where tenant_id=t and template_code=tpl.code) then continue;end if;
  rid:=null;
  proposed_name:=tpl.name;suffix:=0;
  while exists(select 1 from private.tenant_roles where tenant_id=t and lower(btrim(name))=lower(proposed_name) and archived_at is null) loop
   suffix:=suffix+1;proposed_name:=tpl.name||' (standaard '||suffix||')';
  end loop;
  insert into private.tenant_roles(tenant_id,name,description,template_code,template_version) values(t,proposed_name,tpl.description,tpl.code,tpl.version)
  on conflict do nothing returning id into rid;
  if rid is not null then
   for p in select * from jsonb_array_elements(tpl.permissions) loop
    insert into private.role_permissions(tenant_id,role_id,capability,scope) values(t,rid,p->>'key',p->'scope');end loop;
   for p in select * from jsonb_array_elements(tpl.delegations) loop
    insert into private.role_delegations(tenant_id,role_id,capability,scope) values(t,rid,p->>'key',p->'scope');end loop;
  end if;
 end loop;
end$$;

create or replace function private.authorization_permission_constraint()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not private.authorization_scope_valid(new.tenant_id,new.scope,new.capability) then raise exception 'Onbekend tenantrecht of ongeldig bereik' using errcode='23514';end if;return new;
end$$;
drop trigger if exists role_permission_valid on private.role_permissions;
create trigger role_permission_valid before insert or update on private.role_permissions for each row execute function private.authorization_permission_constraint();
drop trigger if exists role_delegation_valid on private.role_delegations;
create trigger role_delegation_valid before insert or update on private.role_delegations for each row execute function private.authorization_permission_constraint();

create or replace function public.authorization_command(target_tenant uuid,operation text,input jsonb,request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); session uuid:=nullif(auth.jwt()->>'session_id','')::uuid;
 rid uuid; mid uuid; a private.role_assignments; r private.tenant_roles; p jsonb; before_doc jsonb; result jsonb; h text;
 stored private.authorization_receipts; rev bigint; required text; tpl private.role_templates;
begin
 if not private.ticket_session_active(actor,session) or private.authorization_member(target_tenant,actor) is null then raise exception 'Geen toegang tot rollenbeheer' using errcode='42501';end if;
 if request_id is null or input is null or jsonb_typeof(input)<>'object' then raise exception 'Ongeldige opdracht' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('authorization:'||target_tenant::text,0));
 h:=encode(extensions.digest(operation||':'||input::text,'sha256'),'hex');
 select * into stored from private.authorization_receipts where tenant_id=target_tenant and actor_id=actor and authorization_receipts.request_id=authorization_command.request_id;
 -- Current authorization is checked before returning a receipt as well.
 required:=case operation when 'create' then 'roles.create' when 'update' then 'roles.update' when 'restore' then 'roles.update' when 'duplicate' then 'roles.duplicate' when 'archive' then 'roles.archive' when 'assign' then 'roles.assign' when 'unassign' then 'roles.unassign' end;
 if required is null or not private.authorization_has(target_tenant,actor,'backoffice.access') or not private.authorization_has(target_tenant,actor,required) then raise exception 'Onvoldoende rechten voor deze handeling' using errcode='42501';end if;
 if stored.request_id is not null then if stored.input_hash<>h then raise exception 'Deze aanvraag is al met andere gegevens verwerkt' using errcode='23514';end if;return stored.result;end if;
 if (input->>'expected_state_revision')::bigint is distinct from (select revision from private.authorization_state where tenant_id=target_tenant) then
 raise exception 'De toegangsrechten of betrokken gebruikers zijn ondertussen gewijzigd. Ververs en controleer de gevolgen opnieuw.' using errcode='40001';end if;
 -- Auth.sessions is server-maintained. Refreshing a JWT does not refresh this
 -- timestamp, unlike a client-controlled field or an access token's iat.
 if not exists(select 1 from auth.sessions where id=session and user_id=actor and created_at>now()-interval '5 minutes') then
 raise exception 'Bevestig je identiteit door opnieuw in te loggen voordat je rechten wijzigt.' using errcode='42501';end if;
 if operation in ('update','restore','duplicate','archive','assign') then
  rid:=(input->>'role_id')::uuid;select * into r from private.tenant_roles where tenant_id=target_tenant and id=rid for update;
  if not found then raise exception 'Rol niet beschikbaar' using errcode='42501';end if;
  if r.revision is distinct from (input->>'expected_revision')::bigint then raise exception 'Deze rol is ondertussen gewijzigd. Ververs de gegevens en controleer je aanpassingen.' using errcode='40001';end if;
  if r.archived_at is not null and operation<>'restore' then raise exception 'Deze rol is gearchiveerd' using errcode='23514';end if;
  before_doc:=private.authorization_role_snapshot(rid);
 end if;
 if operation='duplicate' then input:=jsonb_build_object('name',input->>'name','description',r.description,'permissions',before_doc->'permissions','delegations',before_doc->'delegations');end if;
 if operation='restore' then
  if r.template_code is null then raise exception 'Deze rol heeft geen standaardtemplate' using errcode='23514';end if;
  select * into tpl from private.role_templates where code=r.template_code and version=r.template_version;
  input:=input||jsonb_build_object('name',r.name,'description',tpl.description,'permissions',tpl.permissions,'delegations',tpl.delegations);
 end if;
 if operation in ('create','update','restore','duplicate') then
  if length(btrim(coalesce(input->>'name',''))) not between 2 and 100 or length(coalesce(input->>'description',''))>1000
   or jsonb_typeof(input->'permissions') is distinct from 'array' or jsonb_typeof(input->'delegations') is distinct from 'array'
   or jsonb_array_length(input->'permissions')>500 or jsonb_array_length(input->'delegations')>500 then raise exception 'Controleer de rolgegevens' using errcode='23514';end if;
  for p in select * from jsonb_array_elements((input->'permissions')||(input->'delegations')) loop
   if not private.authorization_can_delegate(target_tenant,actor,p->>'key',p->'scope') then raise exception 'Dit recht of bereik valt buiten je delegatiebevoegdheid' using errcode='42501';end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(input->'permissions') e join public.permission_catalog c on c.key=e->>'key', unnest(c.dependencies) dep
   where not exists(select 1 from jsonb_array_elements(input->'permissions') d where d->>'key'=dep and private.authorization_scope_covers(d->'scope',e->'scope'))) then raise exception 'Een noodzakelijk afhankelijk recht met passend bereik ontbreekt' using errcode='23514';end if;
  -- An editor must also be allowed to remove all old grants; a partial
  -- delegator cannot rewrite a more powerful existing role by sending less.
  if operation in ('update','restore') then
   for p in select * from jsonb_array_elements((before_doc->'permissions')||(before_doc->'delegations')) loop
    if not private.authorization_can_delegate(target_tenant,actor,p->>'key',p->'scope') then raise exception 'Deze rol valt buiten je delegatiebevoegdheid' using errcode='42501';end if;
   end loop;
   update private.tenant_roles set name=btrim(input->>'name'),description=coalesce(input->>'description',''),revision=revision+1,archived_at=null,updated_at=now() where id=rid;
   delete from private.role_permissions where role_id=rid;delete from private.role_delegations where role_id=rid;
  else
   insert into private.tenant_roles(tenant_id,name,description) values(target_tenant,btrim(input->>'name'),coalesce(input->>'description','')) returning id into rid;
  end if;
  for p in select * from jsonb_array_elements(input->'permissions') loop insert into private.role_permissions(tenant_id,role_id,capability,scope) values(target_tenant,rid,p->>'key',p->'scope');end loop;
  for p in select * from jsonb_array_elements(input->'delegations') loop insert into private.role_delegations(tenant_id,role_id,capability,scope) values(target_tenant,rid,p->>'key',p->'scope');end loop;
  result:=private.authorization_role_snapshot(rid);
 elsif operation='archive' then
  for p in select * from jsonb_array_elements((before_doc->'permissions')||(before_doc->'delegations')) loop
   if not private.authorization_can_delegate(target_tenant,actor,p->>'key',p->'scope') then raise exception 'Deze rol valt buiten je delegatiebevoegdheid' using errcode='42501';end if;end loop;
  if exists(select 1 from private.role_assignments where role_id=rid and revoked_at is null and (expires_at is null or expires_at>now())) then raise exception 'Trek eerst de actieve toewijzingen in of wijs een vervangende rol toe.' using errcode='23514';end if;
  update private.tenant_roles set archived_at=now(),revision=revision+1,updated_at=now() where id=rid;result:=private.authorization_role_snapshot(rid);
 elsif operation='assign' then
  mid:=(input->>'membership_id')::uuid;
  if not exists(select 1 from public.tenant_memberships where id=mid and tenant_id=target_tenant and status='active') or not private.authorization_scope_valid(target_tenant,input->'scope') then raise exception 'Ongeldig lidmaatschap of bereik' using errcode='23514';end if;
  for p in select * from jsonb_array_elements((before_doc->'permissions')||(before_doc->'delegations')) loop
   if not private.authorization_can_delegate(target_tenant,actor,p->>'key',p->'scope') then raise exception 'Deze rol valt buiten je delegatiebevoegdheid' using errcode='42501';end if;end loop;
  insert into private.role_assignments(tenant_id,membership_id,role_id,scope,expires_at)
  values(target_tenant,mid,rid,input->'scope',nullif(input->>'expires_at','')::timestamptz) returning * into a;
  if a.expires_at is not null and a.expires_at<=now() then raise exception 'Kies een toekomstige einddatum' using errcode='23514';end if;
  result:=to_jsonb(a);
 elsif operation='unassign' then
  select * into a from private.role_assignments where id=(input->>'assignment_id')::uuid and tenant_id=target_tenant for update;
  if not found then raise exception 'Toewijzing niet beschikbaar' using errcode='42501';end if;
  if a.revision is distinct from (input->>'expected_revision')::bigint or a.revoked_at is not null then raise exception 'Deze toewijzing is ondertussen gewijzigd' using errcode='40001';end if;
  for p in select * from jsonb_array_elements((private.authorization_role_snapshot(a.role_id)->'permissions')||(private.authorization_role_snapshot(a.role_id)->'delegations')) loop
   if not private.authorization_can_delegate(target_tenant,actor,p->>'key',p->'scope') then raise exception 'Deze rol valt buiten je delegatiebevoegdheid' using errcode='42501';end if;end loop;
  before_doc:=to_jsonb(a);rid:=a.id;
  update private.role_assignments set revoked_at=now(),revision=revision+1 where id=a.id returning to_jsonb(role_assignments) into result;
 end if;
 perform private.authorization_guard_manager(target_tenant);
 update private.authorization_state set revision=revision+1 where tenant_id=target_tenant returning revision into rev;
 if not found then raise exception 'Rollenbeheer is niet voorbereid voor deze tenant' using errcode='23514';end if;
 insert into private.authorization_audit(tenant_id,actor_id,action,resource_id,before_value,after_value,revision) values(target_tenant,actor,operation,rid,before_doc,result,rev);
 insert into private.authorization_receipts values(target_tenant,actor,request_id,h,result);
 return result;
end$$;

create or replace function public.authorization_query(target_tenant uuid,section text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();session uuid:=nullif(auth.jwt()->>'session_id','')::uuid;cap text;result jsonb;
begin
 if not private.ticket_session_active(actor,session) or private.authorization_member(target_tenant,actor) is null or not private.authorization_has(target_tenant,actor,'backoffice.access') then raise exception 'Geen toegang tot rollenbeheer' using errcode='42501';end if;
 cap:=case section when 'roles' then 'roles.read' when 'permissions' then 'permissions.read' when 'users' then 'users.read' when 'activity' then 'authorization.audit.read' when 'profile' then 'backoffice.access' end;
 if cap is null or not private.authorization_has(target_tenant,actor,cap) then raise exception 'Onvoldoende rechten voor dit overzicht' using errcode='42501';end if;
 if section='roles' then
  select coalesce(jsonb_agg(private.authorization_role_snapshot(r.id)||jsonb_build_object('active_users',(select count(*) from private.role_assignments a join public.tenant_memberships m on m.id=a.membership_id where a.role_id=r.id and a.revoked_at is null and (a.expires_at is null or a.expires_at>now()) and private.authorization_member(target_tenant,m.user_id)=m.id)) order by r.name,r.id),'[]') into result from private.tenant_roles r where r.tenant_id=target_tenant;
 elsif section='permissions' then select coalesce(jsonb_agg(to_jsonb(c) order by c.module,c.name,c.key),'[]') into result from public.permission_catalog c where c.domain='tenant';
 elsif section='users' then
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'user_id',m.user_id,'email',u.email,'status',m.status,'assignments',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('role_name',r.name) order by r.name,a.id) from private.role_assignments a join private.tenant_roles r on r.id=a.role_id where a.membership_id=m.id and a.revoked_at is null),'[]')) order by u.email,m.id),'[]') into result
  from public.tenant_memberships m join auth.users u on u.id=m.user_id where m.tenant_id=target_tenant;
 elsif section='activity' then select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc,a.id),'[]') into result from(select * from private.authorization_audit where tenant_id=target_tenant order by created_at desc,id limit 100)a;
 else select coalesce(jsonb_agg(jsonb_build_object('key',p.capability,'role_id',r.id,'role_name',r.name,'role_scope',p.scope,'assignment_scope',a.scope) order by p.capability,r.id),'[]') into result
 from private.role_assignments a join private.tenant_roles r on r.id=a.role_id join private.role_permissions p on p.role_id=r.id join public.permission_catalog c on c.key=p.capability
 where a.tenant_id=target_tenant and a.membership_id=private.authorization_member(target_tenant,actor) and a.revoked_at is null and r.archived_at is null and (a.expires_at is null or a.expires_at>now()) and c.status='active' and c.domain='tenant';end if;
 return jsonb_build_object('data',result,'revision',(select revision from private.authorization_state where tenant_id=target_tenant),'enforced',(select enforced from private.authorization_state where tenant_id=target_tenant));
end$$;

do $$declare f record;begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like 'authorization_%' loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.sig);end loop;
end$$;
revoke all on function public.authorization_command(uuid,text,jsonb,uuid),public.authorization_query(uuid,text) from public,anon,service_role;
grant execute on function public.authorization_command(uuid,text,jsonb,uuid),public.authorization_query(uuid,text) to authenticated;
commit;
