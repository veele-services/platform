-- Generated from the isolated query-first release database. No estimate/history rows are changed.
SET local check_function_bodies = off;

DROP FUNCTION "public"."store_travel_estimates"(uuid, bigint, jsonb, text, uuid);

CREATE OR REPLACE FUNCTION private.store_travel_estimates (
  t             uuid,
  revision      bigint,
  legs          jsonb,
  manual_action text   DEFAULT NULL::text,
  actor         uuid   DEFAULT NULL::uuid
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v jsonb; a public.work_order_assignments;
begin
 perform pg_advisory_xact_lock(hashtextextended('travel:'||t::text,0));
 if coalesce((select r.revision from private.travel_revisions r where r.tenant_id=t),0)<>revision then return false;end if;
 if jsonb_array_length(legs)>1000 then raise exception 'Te veel ritten';end if;
 for v in select value from jsonb_array_elements(legs) loop
  select * into a from public.work_order_assignments where tenant_id=t and id=(v->>'assignmentId')::uuid;
  if a.id is null or a.personnel_id<>(v->>'personnelId')::uuid or a.status in ('cancelled','completed','returned') then continue;end if;
  insert into public.travel_legs(tenant_id,assignment_id,direction,origin_address,destination_address,travel_mode,provider,estimated_minutes,estimated_distance_metres,basis_seconds,basis_distance_metres,basis_calculated_at,planning_margin_minutes,routing_profile,route_signature,planning_day,planning_revision,error_code,calculated_at,estimate_snapshot)
  values(t,a.id,v->>'direction','{}','{}',case when v->>'vehicle' in ('car','van') then 'driving' when v->>'vehicle' in ('bicycle','ebike') then 'bicycling' when v->>'vehicle'='walking' then 'walking' else 'transit' end,'openrouteservice',(v->>'minutes')::int,round((v->>'metres')::numeric)::int,case when v->>'state'='known' then (v->>'seconds')::numeric end,case when v->>'state'='known' then (v->>'metres')::numeric end,case when v->>'state'='known' then (v->>'calculatedAt')::timestamptz end,(v->>'marginMinutes')::int,v->>'profile',v->>'signature',(v->>'day')::date,revision,case when v->>'state' in ('known','manual') then null else v->>'state' end,(v->>'calculatedAt')::timestamptz,v-'origin'-'destination')
  on conflict(tenant_id,assignment_id,direction) do update set estimated_minutes=excluded.estimated_minutes,estimated_distance_metres=excluded.estimated_distance_metres,basis_seconds=case when v->>'state'='known' then excluded.basis_seconds when public.travel_legs.route_signature=excluded.route_signature then public.travel_legs.basis_seconds else null end,basis_distance_metres=case when v->>'state'='known' then excluded.basis_distance_metres when public.travel_legs.route_signature=excluded.route_signature then public.travel_legs.basis_distance_metres else null end,basis_calculated_at=case when v->>'state'='known' then excluded.basis_calculated_at when public.travel_legs.route_signature=excluded.route_signature then public.travel_legs.basis_calculated_at else null end,planning_margin_minutes=excluded.planning_margin_minutes,routing_profile=excluded.routing_profile,route_signature=excluded.route_signature,planning_day=excluded.planning_day,planning_revision=excluded.planning_revision,error_code=excluded.error_code,calculated_at=excluded.calculated_at,estimate_snapshot=excluded.estimate_snapshot,provider=excluded.provider,travel_mode=excluded.travel_mode,origin_address='{}',destination_address='{}';
  if manual_action is not null then
   update public.travel_legs set manual_seconds=case when manual_action='set' then (v->>'seconds')::numeric end,manual_metres=case when manual_action='set' then (v->>'metres')::numeric end,manual_reason=case when manual_action='set' then v->>'reason' end,manual_signature=case when manual_action='set' then v->>'signature' end,manual_updated_at=clock_timestamp(),manual_updated_by=actor where tenant_id=t and assignment_id=a.id and direction=v->>'direction';
   insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(t,actor,'travel.manual.'||manual_action,'assignment',a.id,jsonb_build_object('seconds',v->'seconds','direction',v->>'direction'));
  end if;
 end loop;
 -- In-flight automatic results must not overwrite a newer manual decision.
 if manual_action is not null then
  insert into private.travel_revisions values(t,1) on conflict(tenant_id) do update set revision=private.travel_revisions.revision+1;
 end if;
 return true;
end$function$;

CREATE OR REPLACE FUNCTION public.store_travel_estimates (
  t             uuid,
  revision      bigint,
  legs          jsonb,
  manual_action text   DEFAULT NULL::text,
  actor         uuid   DEFAULT NULL::uuid,
  actor_session uuid   DEFAULT NULL::uuid
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare leg jsonb; current_context jsonb;
begin
  if manual_action is not null then
    if manual_action not in ('set','clear') or actor is null or actor_session is null
      or jsonb_typeof(legs) is distinct from 'array' then
      raise exception 'Geen toegang' using errcode='42501';
    end if;
    if jsonb_array_length(legs)<>1 then
      raise exception 'Ongeldige handmatige rit' using errcode='22023';
    end if;
    -- Hold only the current authorization rows for this short local transaction.
    -- Acquire these before the travel lock (settings writes also take that lock).
    perform 1 from auth.users u join auth.sessions s on s.user_id=u.id
      join public.tenant_memberships m on m.user_id=u.id and m.tenant_id=t
      join public.tenants te on te.id=m.tenant_id
      join public.tenant_settings st on st.tenant_id=te.id
      where u.id=actor and s.id=actor_session and u.deleted_at is null
        and not coalesce(u.is_anonymous,false)
        and (u.banned_until is null or u.banned_until<=clock_timestamp())
        and (s.not_after is null or s.not_after>clock_timestamp())
        and m.status='active' and te.status='active'
        and 'planning'=any(st.enabled_services)
      for share of u,s,m,te,st;
    if not found then raise exception 'Geen toegang' using errcode='42501';end if;
    perform pg_advisory_xact_lock(hashtextextended('travel:'||t::text,0));
    leg:=legs->0;
    current_context:=public.travel_context(t,actor,actor_session,(leg->>'day')::date,null);
    if coalesce((current_context->>'canManage')::boolean,false) is not true then
      raise exception 'Geen toegang' using errcode='42501';
    end if;
    if not exists(select 1 from jsonb_array_elements(current_context->'assignments') a
      where a->>'id'=leg->>'assignmentId' and a->>'personnelId'=leg->>'personnelId') then
      raise exception 'Geen toegang tot deze rit' using errcode='42501';
    end if;
  end if;
  return private.store_travel_estimates(t,revision,legs,manual_action,actor);
end $function$;

REVOKE ALL ON FUNCTION "public"."store_travel_estimates"(uuid, bigint, jsonb, text, uuid, uuid) FROM PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "private"."store_travel_estimates"(uuid, bigint, jsonb, text, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."store_travel_estimates"(uuid, bigint, jsonb, text, uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."store_travel_estimates"(uuid, bigint, jsonb, text, uuid, uuid) TO "postgres", "service_role";


-- Explicitly preserve owner-only access independent of future schema defaults.
REVOKE ALL ON FUNCTION private.store_travel_estimates(uuid,bigint,jsonb,text,uuid) FROM anon,authenticated,service_role;
