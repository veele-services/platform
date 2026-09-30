SET local check_function_bodies = off;

ALTER TABLE "public"."personnel_travel_days"
  ADD COLUMN "departure_address" jsonb;

CREATE OR REPLACE FUNCTION private.travel_day_address_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
 if new.departure_address is not null then new.departure_address:=private.normalize_changed_address(new.departure_address,case when tg_op='UPDATE' then coalesce(old.departure_address,'{}') else '{}'::jsonb end);end if;
 return new;
end$function$;

CREATE OR REPLACE FUNCTION public.travel_context (
  t uuid,
  u uuid,
  s uuid,
  d date,
  p uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare roles public.app_role[];tz text;own uuid;manager boolean; start_at timestamptz;end_at timestamptz;
begin
 if not exists(select 1 from auth.sessions se join auth.users au on au.id=se.user_id where se.id=s and se.user_id=u and (se.not_after is null or se.not_after>clock_timestamp()) and au.deleted_at is null and (au.banned_until is null or au.banned_until<clock_timestamp())) then raise exception 'Geen toegang' using errcode='42501';end if;
 select m.roles,te.timezone into roles,tz from public.tenant_memberships m join public.tenants te on te.id=m.tenant_id join public.tenant_settings st on st.tenant_id=te.id where m.tenant_id=t and m.user_id=u and m.status='active' and te.status='active' and 'planning'=any(st.enabled_services);
 if roles is null then raise exception 'Geen toegang' using errcode='42501';end if;
 manager:=roles&&array['tenant_admin','management','planner','hr']::public.app_role[];
 select id into own from public.personnel where tenant_id=t and user_id=u and status='active';
 if not manager and (own is null or (p is not null and p<>own)) then raise exception 'Geen toegang' using errcode='42501';end if;
 start_at:=d::timestamp at time zone tz;end_at:=(d+1)::timestamp at time zone tz;
 return jsonb_build_object('revision',coalesce((select revision from private.travel_revisions where tenant_id=t),0),'timezone',tz,'day',d,'today',(clock_timestamp() at time zone tz)::date,
 'canManage',roles&&array['tenant_admin','management','planner']::public.app_role[],
 'defaultMargin',(select travel_margin_minutes from public.tenant_settings where tenant_id=t),'vehicleMargins',(select travel_vehicle_margins from public.tenant_settings where tenant_id=t),
 'depots',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'address',address,'active',active)) from public.travel_depots where tenant_id=t),'[]'),
 'people',coalesce((select jsonb_agg(jsonb_build_object('id',pe.id,'name',pe.full_name,'standard_vehicle',pe.standard_vehicle,'departure_kind',pe.departure_kind,'departure_depot_id',pe.departure_depot_id,'home_address',pe.home_address,'alternate_departure_address',pe.alternate_departure_address,'return_to_departure',pe.return_to_departure,'privateAllowed',coalesce(pe.id=own or roles&&array['tenant_admin','management','hr']::public.app_role[],false), 'override',(select jsonb_strip_nulls(jsonb_build_object('alternate_departure_address',dy.departure_address,'standard_vehicle',dy.standard_vehicle,'departure_kind',dy.departure_kind,'departure_depot_id',dy.departure_depot_id,'return_to_departure',dy.return_to_departure)) from public.personnel_travel_days dy where dy.tenant_id=t and dy.personnel_id=pe.id and dy.day=d))) from public.personnel pe where pe.tenant_id=t and (manager or pe.id=own) and (p is null or pe.id=p)),'[]'),
 'assignments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'workOrderId',w.id,'personnelId',a.personnel_id,'start',a.planned_start_at,'end',a.planned_end_at,'status',a.status,'orderStatus',w.status,'objectId',o.id,'objectName',o.name,'address',o.address,'arrival',o.arrival_location,'instruction',o.arrival_instruction,'margin',o.travel_margin_minutes,'version',a.version)) from public.work_order_assignments a join public.work_orders w on w.tenant_id=a.tenant_id and w.id=a.work_order_id join public.objects o on o.tenant_id=w.tenant_id and o.id=w.object_id where a.tenant_id=t and a.planned_start_at<end_at and a.planned_end_at>start_at and a.status<>'cancelled' and w.status<>'cancelled' and (p is null or a.personnel_id=p) and (manager or (a.personnel_id=own and exists(select 1 from public.dispatches dp where dp.tenant_id=t and dp.assignment_id=a.id and dp.revoked_at is null)))),'[]'));
end$function$;

CREATE OR REPLACE FUNCTION public.travel_day_departure (
  t uuid,
  p uuid,
  d date
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 if private.object_session_active() is not true or private.can_access_personnel(t,p,true) is not true then raise exception 'Geen toegang' using errcode='42501';end if;
 return (select departure_address from public.personnel_travel_days where tenant_id=t and personnel_id=p and day=d);
end$function$;

REVOKE ALL ON FUNCTION "public"."travel_day_departure"(uuid, uuid, date) FROM PUBLIC, "anon", "service_role";

CREATE TRIGGER travel_day_address_guard
  BEFORE INSERT OR UPDATE ON public.personnel_travel_days
  FOR EACH ROW
  EXECUTE FUNCTION private.travel_day_address_guard();

REVOKE ALL ON FUNCTION "private"."travel_day_address_guard"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."travel_day_address_guard"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."travel_day_departure"(uuid, uuid, date) TO "authenticated", "postgres";

REVOKE ALL ("day") ON TABLE "public"."personnel_travel_days" FROM "authenticated";

GRANT SELECT ("day") ON TABLE "public"."personnel_travel_days" TO "authenticated";

REVOKE ALL ("departure_depot_id") ON TABLE "public"."personnel_travel_days" FROM "authenticated";

GRANT SELECT ("departure_depot_id") ON TABLE "public"."personnel_travel_days" TO "authenticated";

REVOKE ALL ("departure_kind") ON TABLE "public"."personnel_travel_days" FROM "authenticated";

GRANT SELECT ("departure_kind") ON TABLE "public"."personnel_travel_days" TO "authenticated";

REVOKE ALL ("personnel_id") ON TABLE "public"."personnel_travel_days" FROM "authenticated";

GRANT SELECT ("personnel_id") ON TABLE "public"."personnel_travel_days" TO "authenticated";

REVOKE ALL ("return_to_departure") ON TABLE "public"."personnel_travel_days" FROM "authenticated";

GRANT SELECT ("return_to_departure") ON TABLE "public"."personnel_travel_days" TO "authenticated";

REVOKE ALL ("standard_vehicle") ON TABLE "public"."personnel_travel_days" FROM "authenticated";

GRANT SELECT ("standard_vehicle") ON TABLE "public"."personnel_travel_days" TO "authenticated";

REVOKE ALL ("tenant_id") ON TABLE "public"."personnel_travel_days" FROM "authenticated";

GRANT SELECT ("tenant_id") ON TABLE "public"."personnel_travel_days" TO "authenticated";

REVOKE ALL ("updated_at") ON TABLE "public"."personnel_travel_days" FROM "authenticated";

GRANT SELECT ("updated_at") ON TABLE "public"."personnel_travel_days" TO "authenticated";

REVOKE ALL ("updated_by") ON TABLE "public"."personnel_travel_days" FROM "authenticated";

GRANT SELECT ("updated_by") ON TABLE "public"."personnel_travel_days" TO "authenticated";

REVOKE ALL ("version") ON TABLE "public"."personnel_travel_days" FROM "authenticated";

GRANT SELECT ("version") ON TABLE "public"."personnel_travel_days" TO "authenticated";

REVOKE ALL ON TABLE "public"."personnel_travel_days" FROM "authenticated";

GRANT DELETE, INSERT, UPDATE ON TABLE "public"."personnel_travel_days" TO "authenticated";

-- Restore only non-private columns after the diff's table-level revoke.
GRANT SELECT(tenant_id,personnel_id,day,standard_vehicle,departure_kind,departure_depot_id,return_to_departure,version,updated_at,updated_by) ON public.personnel_travel_days TO authenticated;
