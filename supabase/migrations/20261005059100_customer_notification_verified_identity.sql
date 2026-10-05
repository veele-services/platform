-- Only the customer identity branch tightens. The direct central-inbox test
-- proves removing a bound user's confirmed email otherwise leaves inbox access.
-- Staff/backoffice/platform identity and provider/delivery behavior are unchanged.
create or replace function private.notification_actor_active(t uuid,ctx text,actor uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(ctx in('platform','backoffice','staff','customer') and exists(select 1 from auth.users u
  where u.id=actor and u.deleted_at is null and not coalesce(u.is_anonymous,false) and(u.banned_until is null or u.banned_until<now())
   and(ctx<>'customer' or(u.email_confirmed_at is not null and nullif(btrim(u.email),'') is not null)))
 and((ctx='platform' and t is null and(exists(select 1 from public.platform_admins a where a.user_id=actor)
  or exists(select 1 from public.permission_grants g where g.user_id=actor and g.tenant_id is null and g.enabled and g.capability like 'platform.%')))
 or(ctx<>'platform' and exists(select 1 from public.tenants where id=t and status='active') and
 case when ctx='customer' then exists(select 1 from public.customer_portal_accounts a
  join public.customers c on c.tenant_id=a.tenant_id and c.id=a.customer_id
  join public.tenants tn on tn.id=a.tenant_id
  left join public.customer_contacts ct on ct.tenant_id=a.tenant_id and ct.id=a.contact_id and ct.customer_id=a.customer_id
  where a.tenant_id=t and a.user_id=actor and a.active and c.status not in('inactive','archived','draft')
   and(a.contact_id is null or(ct.active and(ct.active_from is null or ct.active_from<=(now() at time zone tn.timezone)::date)
    and(ct.active_until is null or ct.active_until>=(now() at time zone tn.timezone)::date))))
 else exists(select 1 from public.tenant_memberships m where m.tenant_id=t and m.user_id=actor and m.status='active')
  and(ctx<>'staff' or exists(select 1 from public.personnel p where p.tenant_id=t and p.user_id=actor and p.status='active')) end)),false);
$$;
