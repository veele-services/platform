create or replace function private.ticket_onboard_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role' = 'service_role'
      or (session_user = 'postgres' and auth.uid() is null),
    false
  ) then
    perform private.ticket_seed_membership(new.id);
  else
    insert into private.ticket_permission_bootstrap(membership_id, tenant_id)
    values (new.id, new.tenant_id)
    on conflict do nothing;
  end if;
  return new;
end
$$;

create or replace function private.ticket_entitlement_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    (tg_op = 'INSERT' and 'tickets' = any(new.enabled_services))
      or (
        tg_op = 'UPDATE'
        and ('tickets' = any(new.enabled_services)) is distinct from ('tickets' = any(old.enabled_services))
      )
  ) and not coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role' = 'service_role'
      or (session_user = 'postgres' and auth.uid() is null),
    false
  ) then
    raise exception 'Alleen platformconfiguratie kan de ticketmodule activeren of deactiveren'
      using errcode = '42501';
  end if;
  return new;
end
$$;
