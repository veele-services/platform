-- Owner request (2026-10-08): platform administrators operate the Supportdesk.
-- Materialize explicit operator grants. These capabilities only authorize
-- platform_support tickets; private.ticket_allowed still rejects internal
-- tenant tickets and private tenant audiences. Never restore a revoked grant
-- or broaden an existing scope during this promotion.
insert into public.permission_grants(user_id, capability, scope, source)
select a.user_id, capability, '{"all":true}'::jsonb, 'bootstrap'
from public.platform_admins a
join auth.users u on u.id=a.user_id and u.deleted_at is null
cross join unnest(array[
  'platform.support.read', 'platform.support.reply',
  'platform.support.note', 'platform.support.manage'
]) capability
on conflict do nothing;

create or replace function private.ticket_onboard_platform()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.permission_grants(user_id, capability, scope, source)
  select new.user_id, capability, '{"all":true}'::jsonb, 'bootstrap'
  from unnest(array[
    'platform.support.config', 'platform.support.permissions',
    'platform.support.read', 'platform.support.reply',
    'platform.support.note', 'platform.support.manage'
  ]) capability
  on conflict do nothing;
  return new;
end $$;
-- The existing platform lifecycle trigger disables every bootstrap grant when
-- the platform role is removed. Re-adding it preserves disabled tombstones.
