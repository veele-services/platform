-- Customer login must work before the first object. Historical object bindings
-- already have portal accounts (33500); they must not bypass account revocation.
-- Auth invokes this before login, so check the same live identity as the portal
-- without requiring an existing browser session or changing any account.
-- Signed Auth email-change payloads can precede the stored email update; the
-- actor binding authorizes the brand, not equality with the recipient address.
create or replace function public.email_auth_context(target_slug text,actor uuid,recipient text,action_type text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.tenants;b public.tenant_branding;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 if actor is null or coalesce(recipient,'')!~*'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid Auth context' using errcode='23514';end if;
 if target_slug is null then return '{"tenant_id":null,"company":"Fieldgrid","primary":"#222C35","accent":"#41AC42","logo":false}';end if;
 select * into t from public.tenants where slug=target_slug and status='active';
 if t.id is null or not (
  exists(select 1 from public.tenant_memberships m where m.tenant_id=t.id and m.user_id=actor and m.status='active')
  or exists(
   select 1 from public.customer_portal_accounts p
   join auth.users u on u.id=p.user_id and u.deleted_at is null
    and (u.banned_until is null or u.banned_until<=clock_timestamp())
    and not coalesce(u.is_anonymous,false)
    and(u.email_confirmed_at is not null or action_type in('signup','invite','email_change','email_changed_notification'))
    and nullif(btrim(u.email),'') is not null
   join public.customers c on c.tenant_id=p.tenant_id and c.id=p.customer_id
    and c.status not in('inactive','archived','draft')
   left join public.customer_contacts ct on ct.tenant_id=p.tenant_id and ct.id=p.contact_id and ct.customer_id=p.customer_id
   where p.tenant_id=t.id and p.user_id=actor and p.active
    and(p.contact_id is null or(ct.active
     and(ct.active_from is null or ct.active_from<=(clock_timestamp() at time zone t.timezone)::date)
     and(ct.active_until is null or ct.active_until>=(clock_timestamp() at time zone t.timezone)::date)))
  )
  or(action_type='invite' and exists(select 1 from public.tenant_admin_invitations i where i.tenant_id=t.id and lower(btrim(i.email))=lower(btrim(recipient)) and i.status in ('pending','invited','failed') and (i.auth_user_id is null or i.auth_user_id=actor)))
 ) then raise exception 'Auth tenant context unavailable' using errcode='42501';end if;
 select * into b from public.tenant_branding where tenant_id=t.id;
 return jsonb_build_object('tenant_id',t.id,'company',t.name,'primary',coalesce(b.primary_color,'#222C35'),'accent',coalesce(b.accent_color,'#41AC42'),'logo',b.logo_path is not null);
end$$;
revoke all on function public.email_auth_context(text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.email_auth_context(text,uuid,text,text) to service_role;
