-- Canonical platform identity, separate from CRM transport and support operators.
-- Only one unambiguous existing registered administrator can be migrated without
-- a new choice. Multiple administrators require explicit, freshly authorized
-- designation; no Auth ordering or extra destination mailbox is a fallback.
create table private.platform_administrator_registration(
 singleton boolean primary key default true check(singleton),
 user_id uuid references public.platform_admins(user_id) on delete set null,
 revision bigint not null default 1,registered_by uuid references auth.users(id),registered_at timestamptz not null default clock_timestamp()
);
alter table private.platform_administrator_registration enable row level security;
alter table private.platform_administrator_registration force row level security;
revoke all on private.platform_administrator_registration from public,anon,authenticated,service_role;
insert into private.platform_administrator_registration(singleton,user_id)
select true,case when count(*)=1 then (array_agg(a.user_id))[1] end from public.platform_admins a join auth.users u on u.id=a.user_id
where u.deleted_at is null and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false) and(u.banned_until is null or u.banned_until<now());
drop trigger crm_register_primary on public.platform_admins;
-- The old CRM-local column is no longer an identity/configuration source.
create or replace function private.crm_primary_admin() returns uuid language sql stable security definer set search_path='' as $$
 select r.user_id from private.platform_administrator_registration r join public.platform_admins a on a.user_id=r.user_id join auth.users u on u.id=a.user_id
 where r.singleton and u.deleted_at is null and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false) and(u.banned_until is null or u.banned_until<now()) and u.email is not null
$$;
create function public.platform_account_query() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r private.platform_administrator_registration;begin
 perform private.platform_team_assert(false);
 select * into r from private.platform_administrator_registration where singleton;
 return jsonb_build_object('revision',r.revision,'primaryAdminId',private.crm_primary_admin(),'administrators',coalesce((
 select jsonb_agg(jsonb_build_object('id',a.user_id,'name',coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.email),'email',u.email) order by a.created_at,a.user_id)
 from public.platform_admins a join auth.users u on u.id=a.user_id where private.crm_owner_valid(a.user_id)),'[]'));
end$$;
create function public.platform_account_command(target_user uuid,expected_revision bigint,request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
<<platform_account_command>>
declare r private.platform_administrator_registration;receipt private.crm_receipts;fingerprint text;result jsonb;begin
 perform private.platform_team_assert(true);
 if target_user is null or request_id is null or expected_revision is null then raise exception 'Kies een geregistreerde beheerder.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('platform-account:'||auth.uid()::text||request_id::text,0));
 perform private.platform_team_assert(true);
 fingerprint:=encode(extensions.digest(target_user::text||':'||expected_revision::text,'sha256'),'hex');
 select * into receipt from private.crm_receipts where scope='platform-account:'||auth.uid()::text and crm_receipts.request_id=platform_account_command.request_id;
 if found then if receipt.input_hash<>fingerprint then raise exception 'De herhaalsleutel hoort bij andere invoer.' using errcode='23514';end if;return receipt.result;end if;
 select * into r from private.platform_administrator_registration where singleton for update;
 perform private.platform_team_assert(true);
 if r.revision<>expected_revision then raise exception 'De beheerregistratie is intussen gewijzigd.' using errcode='40001';end if;
 if not private.crm_owner_valid(target_user) then raise exception 'Kies een actieve, bevestigde platformbeheerder.' using errcode='22023';end if;
 perform 1 from public.platform_admins where user_id=target_user for key share;
 if not found then raise exception 'De beheerregistratie is ingetrokken.' using errcode='42501';end if;
 update private.platform_administrator_registration set user_id=target_user,revision=revision+1,registered_by=auth.uid(),registered_at=clock_timestamp() where singleton returning revision into expected_revision;
 insert into private.crm_audit(actor_id,command,record_id,details) values(auth.uid(),'platform.primary_admin',target_user,jsonb_build_object('previous',r.user_id,'revision',expected_revision));
 result:=jsonb_build_object('ok',true,'revision',expected_revision);
 insert into private.crm_receipts(scope,request_id,input_hash,result) values('platform-account:'||auth.uid()::text,request_id,fingerprint,result);
 return result;
end$$;
-- Existing bootstrap's explicit FIELDGRID_ADMIN_EMAIL is resolved to a user ID
-- and registered here. No email/provider configuration is added to CRM.
create function public.platform_register_primary_admin(target_user uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.jwt()->>'role' is distinct from 'service_role' or target_user is null or not private.crm_owner_valid(target_user) then raise exception 'Geen geldige bootstrapregistratie.' using errcode='42501';end if;
 perform 1 from public.platform_admins where user_id=target_user for key share;
 if not found then raise exception 'Beheerder niet geregistreerd.' using errcode='42501';end if;
 update private.platform_administrator_registration set user_id=target_user,revision=revision+1,registered_by=target_user,registered_at=clock_timestamp() where singleton;
 insert into private.crm_audit(actor_id,command,record_id,details) values(target_user,'platform.primary_admin.bootstrap',target_user,jsonb_build_object('source','existing-admin-bootstrap'));
end$$;
revoke all on function public.platform_account_query(),public.platform_account_command(uuid,bigint,uuid),public.platform_register_primary_admin(uuid) from public,anon,authenticated,service_role;
grant execute on function public.platform_account_query(),public.platform_account_command(uuid,bigint,uuid) to authenticated;
grant execute on function public.platform_register_primary_admin(uuid) to service_role;
notify pgrst,'reload schema';
