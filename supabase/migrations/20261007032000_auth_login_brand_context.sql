-- A short-lived server-only request context preserves the hostname-selected
-- brand when hosted Auth sanitizes redirect_to to the platform Site URL.
-- It never grants workspace access and never stores a code, token or mail body.
create table private.email_login_brand_requests (
 actor_id uuid primary key references auth.users(id) on delete cascade,
 request_id uuid not null unique,
 tenant_id uuid references public.tenants(id) on delete cascade,
 expires_at timestamptz not null,
 hook_id text
);
alter table private.email_login_brand_requests enable row level security;
revoke all on private.email_login_brand_requests from public,anon,authenticated,service_role;

create function public.email_auth_login_prepare(target_slug text, recipient text)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid; t uuid; request uuid:=gen_random_uuid(); existing private.email_login_brand_requests;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 select id into actor from auth.users where lower(email)=lower(btrim(recipient)) and deleted_at is null
  and not coalesce(is_anonymous,false) and (banned_until is null or banned_until<=clock_timestamp());
 if actor is null then return null;end if;
 -- The existing live membership/customer/contact policy authorizes this identity.
 perform public.email_auth_context(target_slug,actor,recipient,'magiclink');
 if target_slug is not null then select id into t from public.tenants where slug=target_slug and status='active';end if;
 perform pg_advisory_xact_lock(hashtextextended('email-login-brand:'||actor::text,0));
 select * into existing from private.email_login_brand_requests where actor_id=actor for update;
 -- Do not let a concurrent request replace the brand of an in-flight hook.
 if existing.actor_id is not null and existing.hook_id is null and existing.expires_at>clock_timestamp() then return null;end if;
 insert into private.email_login_brand_requests(actor_id,request_id,tenant_id,expires_at)
 values(actor,request,t,clock_timestamp()+interval '60 seconds')
 on conflict(actor_id) do update set request_id=excluded.request_id,tenant_id=excluded.tenant_id,expires_at=excluded.expires_at,hook_id=null;
 return request;
end$$;

create function public.email_auth_login_release(target_request uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 delete from private.email_login_brand_requests where request_id=target_request and hook_id is null;
end$$;

create function public.email_auth_login_resolve(actor uuid, target_slug text, hook_id text)
returns text language plpgsql security definer set search_path='' as $$
declare r private.email_login_brand_requests; slug text;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 if actor is null or hook_id is null or length(hook_id) not between 1 and 200 then raise exception 'Ongeldige hookcontext' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('email-login-brand:'||actor::text,0));
 select * into r from private.email_login_brand_requests where actor_id=actor for update;
 if r.actor_id is null or r.expires_at<=clock_timestamp() then return target_slug;end if;
 if r.hook_id is not null and r.hook_id<>email_auth_login_resolve.hook_id then raise exception 'Nieuwe codeaanvraag vereist' using errcode='42501';end if;
 if r.tenant_id is not null then
  select t.slug into slug from public.tenants t where t.id=r.tenant_id and t.status='active';
  if slug is null then raise exception 'Tenant niet beschikbaar' using errcode='42501';end if;
 end if;
 if target_slug is not null and target_slug is distinct from slug then raise exception 'Onjuiste tenantcontext' using errcode='42501';end if;
 update private.email_login_brand_requests set hook_id=email_auth_login_resolve.hook_id where actor_id=actor;
 return slug;
end$$;
revoke all on function public.email_auth_login_prepare(text,text),public.email_auth_login_release(uuid),public.email_auth_login_resolve(uuid,text,text) from public,anon,authenticated;
grant execute on function public.email_auth_login_prepare(text,text),public.email_auth_login_release(uuid),public.email_auth_login_resolve(uuid,text,text) to service_role;
