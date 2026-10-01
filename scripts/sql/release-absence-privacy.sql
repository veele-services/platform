do $migration$
begin
-- Scheduling needs time blocks, not medical reasons or internal HR links.
-- Preserve original records and the existing HR/own-person write/read paths.
alter policy availability_read on public.availability
using (private.can_access_personnel(tenant_id,personnel_id,true));

create or replace function public.personnel_availability(target_tenant uuid)
returns table(id uuid,tenant_id uuid,personnel_id uuid,starts_at timestamptz,
 ends_at timestamptz,kind text,note text,approved_at timestamptz,
 created_at timestamptz,dossier_source_id uuid)
language sql stable security definer set search_path='' as $$
 select a.id,a.tenant_id,a.personnel_id,a.starts_at,a.ends_at,
   case when private.can_access_personnel(a.tenant_id,a.personnel_id,true)
     then a.kind when a.kind='available' then 'available' else 'unavailable' end,
   case when private.can_access_personnel(a.tenant_id,a.personnel_id,true) then a.note end,
   a.approved_at,a.created_at,
   case when private.can_access_personnel(a.tenant_id,a.personnel_id,true) then a.dossier_source_id end
 from public.availability a
 where a.tenant_id=target_tenant and (select auth.uid()) is not null
   and private.object_session_active() and private.service_enabled(target_tenant,'personeel')
   and private.can_access_personnel(a.tenant_id,a.personnel_id,false)
 order by a.starts_at,a.id;
$$;
revoke all on function public.personnel_availability(uuid) from public,anon,authenticated,service_role;
grant execute on function public.personnel_availability(uuid) to authenticated;
notify pgrst,'reload schema';
end;
$migration$;
