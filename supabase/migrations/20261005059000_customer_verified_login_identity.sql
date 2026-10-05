-- Only the new portal identity guard: a bound user becoming anonymous or
-- losing confirmed email must fail closed. The rollback test reproduces that
-- both states otherwise retained access; no other role/session helper changes.
create or replace function private.customer_account_access(t uuid,a uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.object_session_active() and exists(
  select 1 from public.customer_portal_accounts p
  join auth.users u on u.id=p.user_id and not coalesce(u.is_anonymous,false) and u.email_confirmed_at is not null and nullif(btrim(u.email),'') is not null
  join public.tenants tn on tn.id=p.tenant_id and tn.status='active'
  join public.customers c on c.tenant_id=p.tenant_id and c.id=p.customer_id
  left join public.customer_contacts ct on ct.tenant_id=p.tenant_id and ct.id=p.contact_id and ct.customer_id=p.customer_id
  where p.tenant_id=t and p.id=a and p.user_id=auth.uid() and p.active
   and c.status not in('inactive','archived','draft')
   and(p.contact_id is null or(ct.active and(ct.active_from is null or ct.active_from<=(clock_timestamp() at time zone tn.timezone)::date)
    and(ct.active_until is null or ct.active_until>=(clock_timestamp() at time zone tn.timezone)::date)))
 );
$$;
