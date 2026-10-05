-- Tenant managers cannot self-assert a verified merchant connection. Existing
-- operator/service-role provisioning stays the deliberate configuration path.
create function private.customer_merchant_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if ((tg_op<>'INSERT' and old.provider='mollie') or (tg_op<>'DELETE' and new.provider='mollie'))
  and coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','') in('anon','authenticated') then
  raise exception 'Betaalverbinding vereist operatorverificatie' using errcode='42501';end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function private.customer_merchant_guard() from public,anon,authenticated,service_role;
create trigger customer_merchant_guard before insert or update or delete on public.tenant_provider_connections
for each row execute function private.customer_merchant_guard();

create function private.customer_payment_profile_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.merchant_profile_id is distinct from old.merchant_profile_id then
  raise exception 'Betaalontvanger staat vast' using errcode='23514';end if;
 if new.merchant_profile_id is not null and new.provider_payment_id is not null
  and new.provider_payload->>'profileId' is distinct from new.merchant_profile_id then
  raise exception 'Betaalresultaat hoort bij een andere ontvanger' using errcode='23514';end if;
 return new;
end $$;
revoke all on function private.customer_payment_profile_guard() from public,anon,authenticated,service_role;
create trigger customer_payment_profile_guard before update on public.payment_attempts
for each row execute function private.customer_payment_profile_guard();
