SET local check_function_bodies = off;

DROP POLICY "availability_read" ON "public"."availability";

CREATE OR REPLACE FUNCTION public.personnel_availability (
  target_tenant uuid
)
  RETURNS TABLE (
    id                uuid,
    tenant_id         uuid,
    personnel_id      uuid,
    starts_at         timestamp with time zone,
    ends_at           timestamp with time zone,
    kind              text,
    note              text,
    approved_at       timestamp with time zone,
    created_at        timestamp with time zone,
    dossier_source_id uuid
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION "public"."personnel_availability"(uuid) FROM PUBLIC, "anon", "service_role";

CREATE POLICY "availability_read" ON "public"."availability"
  FOR SELECT
  TO "authenticated"
  USING (private.can_access_personnel(tenant_id, personnel_id, true));

GRANT EXECUTE ON FUNCTION "public"."personnel_availability"(uuid) TO "authenticated", "postgres";
