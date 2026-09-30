SET local check_function_bodies = off;

DROP POLICY "travel_legs_read" ON "public"."travel_legs";

ALTER TABLE "public"."travel_legs"
  DROP CONSTRAINT "travel_legs_estimated_minutes_check";

CREATE TABLE "private"."route_cache" (
  "key"           text                     NOT NULL,
  "result"        jsonb,
  "calculated_at" timestamp with time zone,
  "expires_at"    timestamp with time zone,
  "lease"         uuid,
  "leased_until"  timestamp with time zone,
  "retry_after"   timestamp with time zone,
  "error_code"    text,
  CONSTRAINT "route_cache_pkey" PRIMARY KEY (key)
);

ALTER TABLE "private"."route_cache"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "private"."route_provider_usage" (
  "id"        bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "provider"  text                     NOT NULL,
  "kind"      text                     NOT NULL,
  "called_at" timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "route_provider_usage_pkey" PRIMARY KEY (id)
);

ALTER TABLE "private"."route_provider_usage"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "private"."travel_revisions" (
  "tenant_id" uuid   NOT NULL,
  "revision"  bigint NOT NULL DEFAULT 1,
  CONSTRAINT "travel_revisions_pkey" PRIMARY KEY (tenant_id)
);

ALTER TABLE "private"."travel_revisions"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."personnel_travel_days" (
  "tenant_id"           uuid                     NOT NULL,
  "personnel_id"        uuid                     NOT NULL,
  "day"                 date                     NOT NULL,
  "standard_vehicle"    text,
  "departure_kind"      text,
  "departure_depot_id"  uuid,
  "return_to_departure" boolean,
  "version"             bigint                   NOT NULL DEFAULT 1,
  "updated_at"          timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  "updated_by"          uuid,
  CONSTRAINT "personnel_travel_days_departure_kind_check" CHECK ((departure_kind = ANY (ARRAY['home'::text, 'depot'::text, 'custom'::text]))),
  CONSTRAINT "personnel_travel_days_pkey" PRIMARY KEY (tenant_id, personnel_id, day),
  CONSTRAINT "personnel_travel_days_standard_vehicle_check"
    CHECK ((standard_vehicle = ANY (ARRAY['car'::text, 'van'::text, 'bicycle'::text, 'ebike'::text, 'walking'::text, 'other'::text])))
);

ALTER TABLE "public"."personnel_travel_days"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."personnel_travel_days"
  FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."personnel_travel_days" FROM "anon";

CREATE TABLE "public"."travel_depots" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"  uuid                     NOT NULL,
  "name"       text                     NOT NULL,
  "address"    jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "active"     boolean                  NOT NULL DEFAULT true,
  "version"    bigint                   NOT NULL DEFAULT 1,
  "updated_at" timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "travel_depots_name_check" CHECK (((length(name) >= 2) AND (length(name) <= 160))),
  CONSTRAINT "travel_depots_pkey" PRIMARY KEY (id),
  CONSTRAINT "travel_depots_tenant_id_id_key" UNIQUE (tenant_id, id)
);

ALTER TABLE "public"."travel_depots"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."travel_depots"
  FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."travel_depots" FROM "anon";

ALTER TABLE "public"."objects"
  ADD COLUMN "arrival_location" jsonb;

ALTER TABLE "public"."objects"
  ADD COLUMN "arrival_instruction" text NOT NULL DEFAULT ''::text;

ALTER TABLE "public"."objects"
  ADD COLUMN "travel_margin_minutes" integer;

ALTER TABLE "public"."personnel"
  ADD COLUMN "standard_vehicle" text;

ALTER TABLE "public"."personnel"
  ADD COLUMN "departure_kind" text;

ALTER TABLE "public"."personnel"
  ADD COLUMN "departure_depot_id" uuid;

ALTER TABLE "public"."personnel"
  ADD COLUMN "alternate_departure_address" jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "public"."personnel"
  ADD COLUMN "return_to_departure" boolean NOT NULL DEFAULT false;

ALTER TABLE "public"."tenant_settings"
  ADD COLUMN "travel_margin_minutes" integer NOT NULL DEFAULT 5;

ALTER TABLE "public"."tenant_settings"
  ADD COLUMN "travel_vehicle_margins" jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "public"."travel_legs"
  ADD COLUMN "basis_seconds" numeric;

ALTER TABLE "public"."travel_legs"
  ADD COLUMN "planning_margin_minutes" integer NOT NULL DEFAULT 0;

ALTER TABLE "public"."travel_legs"
  ADD COLUMN "routing_profile" text;

ALTER TABLE "public"."travel_legs"
  ADD COLUMN "route_signature" text;

ALTER TABLE "public"."travel_legs"
  ADD COLUMN "planning_day" date;

ALTER TABLE "public"."travel_legs"
  ADD COLUMN "planning_revision" bigint;

ALTER TABLE "public"."travel_legs"
  ADD COLUMN "estimate_snapshot" jsonb;

ALTER TABLE "public"."travel_legs"
  ADD COLUMN "manual_seconds" numeric;

ALTER TABLE "public"."travel_legs"
  ADD COLUMN "manual_metres" numeric;

ALTER TABLE "public"."travel_legs"
  ADD COLUMN "manual_reason" text;

ALTER TABLE "public"."travel_legs"
  ADD COLUMN "manual_signature" text;

ALTER TABLE "public"."travel_legs"
  ADD COLUMN "manual_updated_at" timestamp WITH time zone;

ALTER TABLE "public"."travel_legs"
  ADD COLUMN "manual_updated_by" uuid;

ALTER TABLE "public"."travel_legs"
  ADD COLUMN "basis_distance_metres" numeric;

ALTER TABLE "public"."travel_legs"
  ADD COLUMN "basis_calculated_at" timestamp WITH time zone;

CREATE OR REPLACE FUNCTION private.address_fingerprint (
  a jsonb
)
  RETURNS jsonb
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
 select jsonb_build_array(a->>'street_name',a->>'house_number',a->>'house_letter',a->>'house_addition',a->>'postal_code',a->>'city',a->>'country',a->>'street');
$function$;

CREATE OR REPLACE FUNCTION private.address_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
 if tg_table_name='objects' then
  new.address:=private.normalize_changed_address(new.address,case when tg_op='UPDATE' then old.address else '{}'::jsonb end);
  if new.arrival_location is not null and (jsonb_typeof(new.arrival_location)<>'array' or jsonb_array_length(new.arrival_location)<>2 or not coalesce((new.arrival_location->>0)::numeric between -180 and 180 and (new.arrival_location->>1)::numeric between -90 and 90,false)) then raise exception 'Ongeldige aankomstlocatie' using errcode='23514';end if;
  if tg_op='UPDATE' and private.address_fingerprint(new.address) is distinct from private.address_fingerprint(old.address) and new.arrival_location is not distinct from old.arrival_location then new.arrival_location:=null;end if;
  new.latitude:=case when new.address->>'status'='confirmed' then (new.address->>'latitude')::numeric end;
  new.longitude:=case when new.address->>'status'='confirmed' then (new.address->>'longitude')::numeric end;
 elsif tg_table_name='customers' then
  new.billing_address:=private.normalize_changed_address(new.billing_address,case when tg_op='UPDATE' then old.billing_address else '{}'::jsonb end);
 elsif tg_table_name='personnel' then
  new.home_address:=private.normalize_changed_address(new.home_address,case when tg_op='UPDATE' then old.home_address else '{}'::jsonb end);
  new.alternate_departure_address:=private.normalize_changed_address(new.alternate_departure_address,case when tg_op='UPDATE' then old.alternate_departure_address else '{}'::jsonb end);
 elsif tg_table_name='travel_depots' then
  new.address:=private.normalize_changed_address(new.address,case when tg_op='UPDATE' then old.address else '{}'::jsonb end);
 end if;
 return new;
end$function$;

CREATE OR REPLACE FUNCTION private.bump_travel_revision()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare t uuid:=coalesce(new.tenant_id,old.tenant_id);
begin
 if not exists(select 1 from public.tenants where id=t) then return null;end if;
 perform pg_advisory_xact_lock(hashtextextended('travel:'||t::text,0));
 insert into private.travel_revisions values(t,1) on conflict(tenant_id) do update set revision=private.travel_revisions.revision+1;
 return null;
end$function$;

CREATE OR REPLACE FUNCTION private.margins_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare k text;v jsonb;
begin
 if jsonb_typeof(new.travel_vehicle_margins)<>'object' then raise exception 'Ongeldige reismarges' using errcode='23514';end if;
 for k,v in select * from jsonb_each(new.travel_vehicle_margins) loop
  if k not in ('car','van','bicycle','ebike','walking','other') or jsonb_typeof(v)<>'number' or (v::text)::numeric not between 0 and 180 or (v::text)::numeric<>trunc((v::text)::numeric) then raise exception 'Ongeldige reismarge' using errcode='23514';end if;
 end loop;return new;
end$function$;

CREATE OR REPLACE FUNCTION private.normalize_changed_address (
  a     jsonb,
  old_a jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
 if not coalesce(private.valid_address(a),false) then raise exception 'Ongeldige adresgegevens' using errcode='23514';end if;
 if private.address_fingerprint(a) is distinct from private.address_fingerprint(old_a) and a->>'located_at' is not distinct from old_a->>'located_at' then
  a:=a||jsonb_build_object('latitude',null,'longitude',null,'status','needs_review','source','manual','source_id',null,'bag_id',null,'located_at',null);
 end if;
 return a;
end$function$;

CREATE OR REPLACE FUNCTION private.valid_address (
  a jsonb
)
  RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
 select jsonb_typeof(a)='object' and length(a::text)<10000 and (a->>'status' is distinct from 'confirmed' or (
 a->>'source' in ('pdok','manual') and length(coalesce(a->>'street_name',''))>0 and length(coalesce(a->>'house_number',''))>0 and
 (a->>'latitude')::numeric between -90 and 90 and (a->>'longitude')::numeric between -180 and 180 and a->>'located_at' is not null));
$function$;

CREATE OR REPLACE FUNCTION public.personnel_mobility (
  target_tenant    uuid,
  target_personnel uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 if not private.object_session_active() or private.can_access_personnel(target_tenant,target_personnel,true) is not true then raise exception 'Geen toegang' using errcode='42501';end if;
 return (select jsonb_build_object('id',id,'version',version,'standard_vehicle',standard_vehicle,'departure_kind',departure_kind,'departure_depot_id',departure_depot_id,'return_to_departure',return_to_departure,'home_address',home_address,'alternate_departure_address',alternate_departure_address) from public.personnel where tenant_id=target_tenant and id=target_personnel);
end$function$;

REVOKE ALL ON FUNCTION "public"."personnel_mobility"(uuid, uuid) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.route_cache_claim (
  keys          text[],
  provider_name text,
  request_kind  text,
  minute_limit  integer,
  day_limit     integer,
  lease_id      uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare k text;claimed text[]:=array[]::text[];c private.route_cache;
begin
 if cardinality(keys)>21 or cardinality(keys)<1 or minute_limit not between 1 and 1000 or day_limit not between 1 and 100000 then raise exception 'Ongeldige batch';end if;
 perform pg_advisory_xact_lock(hashtextextended('route-provider:'||provider_name||request_kind,0));
 if (select count(*) from private.route_provider_usage where provider=provider_name and kind=request_kind and called_at>clock_timestamp()-interval '1 minute')>=minute_limit or (select count(*) from private.route_provider_usage where provider=provider_name and kind=request_kind and called_at>clock_timestamp()-interval '24 hours')>=day_limit then return jsonb_build_object('claimed','[]'::jsonb,'limited',true);end if;
 foreach k in array keys loop
  insert into private.route_cache(key) values(k) on conflict do nothing;
  select * into c from private.route_cache where key=k for update;
  if coalesce(c.expires_at,'epoch')>clock_timestamp() or coalesce(c.leased_until,'epoch')>clock_timestamp() or coalesce(c.retry_after,'epoch')>clock_timestamp() then continue;end if;
  update private.route_cache set lease=lease_id,leased_until=clock_timestamp()+interval '30 seconds' where key=k;
  claimed:=array_append(claimed,k);
 end loop;
 if cardinality(claimed)>0 then insert into private.route_provider_usage(provider,kind) values(provider_name,request_kind);end if;
 delete from private.route_provider_usage where called_at<clock_timestamp()-interval '2 days';
 return jsonb_build_object('claimed',to_jsonb(claimed),'limited',false);
end$function$;

REVOKE ALL ON FUNCTION "public"."route_cache_claim"(text[], text, text, integer, integer, uuid) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.route_cache_finish (
  cache_key text,
  lease_id  uuid,
  payload   jsonb,
  failure   text,
  ttl_days  integer
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 if ttl_days not between 1 and 90 then raise exception 'Ongeldige geldigheid';end if;
 update private.route_cache set result=case when failure is null then payload else result end,calculated_at=case when failure is null then clock_timestamp() else calculated_at end,expires_at=case when failure is null then clock_timestamp()+make_interval(days=>ttl_days) else expires_at end,lease=null,leased_until=null,retry_after=case when failure is not null then clock_timestamp()+case when failure='rate_limit' then interval '5 minutes' else interval '1 minute' end end,error_code=failure where key=cache_key and lease=lease_id;
end$function$;

REVOKE ALL ON FUNCTION "public"."route_cache_finish"(text, uuid, jsonb, text, integer) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.route_cache_read (
  keys text[]
)
  RETURNS jsonb
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$ select coalesce(jsonb_agg(to_jsonb(c)),'[]') from private.route_cache c where key=any(keys) $function$;

REVOKE ALL ON FUNCTION "public"."route_cache_read"(text[]) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.save_object_dossier (
  target_tenant uuid,
  input         jsonb
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare o public.objects;v bigint;line text;
begin
 if not private.object_manage(target_tenant) then raise exception 'Geen toegang' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 if not exists(select 1 from public.customers where tenant_id=target_tenant and id=(input->>'customerId')::uuid and status<>'inactive') then raise exception 'Kies een actieve klant binnen je organisatie' using errcode='23514';end if;
 select * into o from public.objects where tenant_id=target_tenant and id=(input->>'id')::uuid for update;
 v:=(input->>'version')::bigint;
 if v=0 then
  if o.id is not null then return o.id;end if;
  insert into public.objects(id,tenant_id,customer_id,object_number,name,object_type,address,latitude,longitude,location_description,access_instructions,dossier_status)
  values((input->>'id')::uuid,target_tenant,(input->>'customerId')::uuid,'OBJ-'||upper(substr(replace(input->>'id','-',''),1,10)),input->>'name',input->>'type',coalesce(input->'address',jsonb_build_object('street',input->>'street','postal_code',input->>'postalCode','city',input->>'city')),nullif(input->>'latitude','')::numeric,nullif(input->>'longitude','')::numeric,input->>'locationDescription',input->>'instructions',input->>'status') returning * into o;
  for line in select btrim(x) from unnest(string_to_array(coalesce(input->>'structure',''),E'\n'))x where btrim(x)<>'' loop
   insert into public.object_nodes(tenant_id,object_id,name,kind) values(target_tenant,o.id,line,'room');
  end loop;
  if length(coalesce(input->>'contact',''))>0 then insert into public.object_records(tenant_id,object_id,kind,title,body,state) values(target_tenant,o.id,'contact','Contact en bereikbaarheid',input->>'contact','active');end if;
  if length(coalesce(input->>'programme',''))>0 then insert into public.object_records(tenant_id,object_id,kind,title,body,state) values(target_tenant,o.id,'programme','Werkprogramma',input->>'programme','draft');end if;
  if length(coalesce(input->>'safety',''))>0 then insert into public.object_records(tenant_id,object_id,kind,title,body,state,instruction_type,starts_at,details) values(target_tenant,o.id,'instruction','Veilig werken',input->>'safety','active','fixed',clock_timestamp(),'{"acknowledgement":true}');end if;
 else
  if o.id is null or o.version<>v then raise exception 'Het object is intussen gewijzigd. Vernieuw de pagina.' using errcode='40001';end if;
  update public.objects set customer_id=(input->>'customerId')::uuid,name=input->>'name',object_type=input->>'type',address=coalesce(input->'address',jsonb_build_object('street',input->>'street','postal_code',input->>'postalCode','city',input->>'city')),latitude=nullif(input->>'latitude','')::numeric,longitude=nullif(input->>'longitude','')::numeric,location_description=input->>'locationDescription',access_instructions=input->>'instructions',dossier_status=input->>'status' where id=o.id;
 end if;
 return o.id;
end $function$;

CREATE OR REPLACE FUNCTION public.store_travel_estimates (
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

REVOKE ALL ON FUNCTION "public"."store_travel_estimates"(uuid, bigint, jsonb, text, uuid) FROM PUBLIC, "anon", "authenticated";

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
 'people',coalesce((select jsonb_agg(jsonb_build_object('id',pe.id,'name',pe.full_name,'standard_vehicle',pe.standard_vehicle,'departure_kind',pe.departure_kind,'departure_depot_id',pe.departure_depot_id,'home_address',pe.home_address,'alternate_departure_address',pe.alternate_departure_address,'return_to_departure',pe.return_to_departure,'privateAllowed',coalesce(pe.id=own or roles&&array['tenant_admin','management','hr']::public.app_role[],false), 'override',(select jsonb_strip_nulls(jsonb_build_object('standard_vehicle',dy.standard_vehicle,'departure_kind',dy.departure_kind,'departure_depot_id',dy.departure_depot_id,'return_to_departure',dy.return_to_departure)) from public.personnel_travel_days dy where dy.tenant_id=t and dy.personnel_id=pe.id and dy.day=d))) from public.personnel pe where pe.tenant_id=t and (manager or pe.id=own) and (p is null or pe.id=p)),'[]'),
 'assignments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'workOrderId',w.id,'personnelId',a.personnel_id,'start',a.planned_start_at,'end',a.planned_end_at,'status',a.status,'orderStatus',w.status,'objectId',o.id,'objectName',o.name,'address',o.address,'arrival',o.arrival_location,'instruction',o.arrival_instruction,'margin',o.travel_margin_minutes,'version',a.version)) from public.work_order_assignments a join public.work_orders w on w.tenant_id=a.tenant_id and w.id=a.work_order_id join public.objects o on o.tenant_id=w.tenant_id and o.id=w.object_id where a.tenant_id=t and a.planned_start_at<end_at and a.planned_end_at>start_at and a.status<>'cancelled' and w.status<>'cancelled' and (p is null or a.personnel_id=p) and (manager or (a.personnel_id=own and exists(select 1 from public.dispatches dp where dp.tenant_id=t and dp.assignment_id=a.id and dp.revoked_at is null)))),'[]'));
end$function$;

REVOKE ALL ON FUNCTION "public"."travel_context"(uuid, uuid, uuid, date, uuid) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.travel_session_active()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$select private.object_session_active()$function$;

REVOKE ALL ON FUNCTION "public"."travel_session_active"() FROM PUBLIC, "anon", "service_role";

ALTER TABLE "private"."travel_revisions"
  ADD CONSTRAINT "travel_revisions_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE "public"."objects"
  ADD CONSTRAINT "objects_arrival_instruction_check" CHECK ((length(arrival_instruction) <= 1000));

ALTER TABLE "public"."objects"
  ADD CONSTRAINT "objects_travel_margin_minutes_check" CHECK (((travel_margin_minutes >= 0) AND (travel_margin_minutes <= 180)));

ALTER TABLE "public"."personnel"
  ADD CONSTRAINT "personnel_departure_kind_check" CHECK ((departure_kind = ANY (ARRAY['home'::text, 'depot'::text, 'custom'::text])));

ALTER TABLE "public"."personnel"
  ADD CONSTRAINT "personnel_standard_vehicle_check"
    CHECK ((standard_vehicle = ANY (ARRAY['car'::text, 'van'::text, 'bicycle'::text, 'ebike'::text, 'walking'::text, 'other'::text])));

ALTER TABLE "public"."personnel_travel_days"
  ADD CONSTRAINT "personnel_travel_days_tenant_id_personnel_id_fkey" FOREIGN KEY (tenant_id, personnel_id) REFERENCES public.personnel(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE "public"."personnel_travel_days"
  ADD CONSTRAINT "personnel_travel_days_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id);

ALTER TABLE "public"."tenant_settings"
  ADD CONSTRAINT "tenant_settings_travel_margin_minutes_check" CHECK (((travel_margin_minutes >= 0) AND (travel_margin_minutes <= 180)));

ALTER TABLE "public"."travel_depots"
  ADD CONSTRAINT "travel_depots_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE "public"."personnel"
  ADD CONSTRAINT "personnel_tenant_id_departure_depot_id_fkey" FOREIGN KEY (tenant_id, departure_depot_id) REFERENCES public.travel_depots(tenant_id, id);

ALTER TABLE "public"."personnel_travel_days"
  ADD CONSTRAINT "personnel_travel_days_tenant_id_departure_depot_id_fkey" FOREIGN KEY (tenant_id, departure_depot_id) REFERENCES public.travel_depots(tenant_id, id);

ALTER TABLE "public"."travel_legs"
  ADD CONSTRAINT "travel_legs_basis_distance_metres_check" CHECK ((basis_distance_metres >= (0)::numeric));

ALTER TABLE "public"."travel_legs"
  ADD CONSTRAINT "travel_legs_basis_seconds_check" CHECK ((basis_seconds >= (0)::numeric));

ALTER TABLE "public"."travel_legs"
  ADD CONSTRAINT "travel_legs_estimated_minutes_check" CHECK ((estimated_minutes >= 0));

ALTER TABLE "public"."travel_legs"
  ADD CONSTRAINT "travel_legs_manual_metres_check" CHECK ((manual_metres >= (0)::numeric));

ALTER TABLE "public"."travel_legs"
  ADD CONSTRAINT "travel_legs_manual_seconds_check" CHECK (((manual_seconds >= (0)::numeric) AND (manual_seconds <= (172800)::numeric)));

ALTER TABLE "public"."travel_legs"
  ADD CONSTRAINT "travel_legs_manual_updated_by_fkey" FOREIGN KEY (manual_updated_by) REFERENCES auth.users(id);

ALTER TABLE "public"."travel_legs"
  ADD CONSTRAINT "travel_legs_planning_margin_minutes_check" CHECK (((planning_margin_minutes >= 0) AND (planning_margin_minutes <= 180)));

CREATE INDEX route_usage_window ON private.route_provider_usage USING btree (PROVIDER, kind, called_at);

CREATE TRIGGER address_guard
  BEFORE INSERT OR UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION private.address_guard();

CREATE TRIGGER travel_revision
  AFTER INSERT OR DELETE OR UPDATE ON public.dispatches
  FOR EACH ROW
  EXECUTE FUNCTION private.bump_travel_revision();

CREATE TRIGGER address_guard
  BEFORE INSERT OR UPDATE ON public.objects
  FOR EACH ROW
  EXECUTE FUNCTION private.address_guard();

CREATE TRIGGER travel_revision
  AFTER INSERT OR DELETE OR UPDATE ON public.objects
  FOR EACH ROW
  EXECUTE FUNCTION private.bump_travel_revision();

CREATE TRIGGER address_guard
  BEFORE INSERT OR UPDATE ON public.personnel
  FOR EACH ROW
  EXECUTE FUNCTION private.address_guard();

CREATE TRIGGER travel_revision
  AFTER INSERT OR DELETE OR UPDATE ON public.personnel
  FOR EACH ROW
  EXECUTE FUNCTION private.bump_travel_revision();

CREATE TRIGGER travel_revision
  AFTER INSERT OR DELETE OR UPDATE ON public.personnel_travel_days
  FOR EACH ROW
  EXECUTE FUNCTION private.bump_travel_revision();

CREATE TRIGGER margins_guard
  BEFORE INSERT OR UPDATE ON public.tenant_settings
  FOR EACH ROW
  EXECUTE FUNCTION private.margins_guard();

CREATE TRIGGER travel_revision
  AFTER INSERT OR DELETE OR UPDATE ON public.tenant_settings
  FOR EACH ROW
  EXECUTE FUNCTION private.bump_travel_revision();

CREATE TRIGGER address_guard
  BEFORE INSERT OR UPDATE ON public.travel_depots
  FOR EACH ROW
  EXECUTE FUNCTION private.address_guard();

CREATE TRIGGER travel_revision
  AFTER INSERT OR DELETE OR UPDATE ON public.travel_depots
  FOR EACH ROW
  EXECUTE FUNCTION private.bump_travel_revision();

CREATE TRIGGER travel_revision
  AFTER INSERT OR DELETE OR UPDATE ON public.work_order_assignments
  FOR EACH ROW
  EXECUTE FUNCTION private.bump_travel_revision();

CREATE TRIGGER travel_revision
  AFTER INSERT OR DELETE OR UPDATE ON public.work_orders
  FOR EACH ROW
  EXECUTE FUNCTION private.bump_travel_revision();

CREATE POLICY "travel_days_delete" ON "public"."personnel_travel_days"
  FOR DELETE
  TO "authenticated"
  USING
    ((private.object_session_active() AND private.has_role(tenant_id, ARRAY['tenant_admin'::public.app_role, 'management'::public.app_role, 'planner'::public.app_role,
    'hr'::public.app_role])));

CREATE POLICY "travel_days_insert" ON "public"."personnel_travel_days"
  FOR INSERT
  TO "authenticated"
  WITH
    CHECK
    ((private.object_session_active() AND private.has_role(tenant_id, ARRAY['tenant_admin'::public.app_role, 'management'::public.app_role, 'planner'::public.app_role,
    'hr'::public.app_role])));

CREATE POLICY "travel_days_read" ON "public"."personnel_travel_days"
  FOR SELECT
  TO "authenticated"
  USING ((private.object_session_active() AND private.can_access_personnel(tenant_id, personnel_id, false)));

CREATE POLICY "travel_days_update" ON "public"."personnel_travel_days"
  FOR UPDATE
  TO "authenticated"
  USING
    ((private.object_session_active() AND private.has_role(tenant_id, ARRAY['tenant_admin'::public.app_role, 'management'::public.app_role, 'planner'::public.app_role,
    'hr'::public.app_role])))
  WITH
    CHECK
    ((private.object_session_active() AND private.has_role(tenant_id, ARRAY['tenant_admin'::public.app_role, 'management'::public.app_role, 'planner'::public.app_role,
    'hr'::public.app_role])));

CREATE POLICY "depots_insert" ON "public"."travel_depots"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((private.object_session_active() AND private.has_role(tenant_id, ARRAY['tenant_admin'::public.app_role, 'management'::public.app_role, 'planner'::public.app_role])));

CREATE POLICY "depots_read" ON "public"."travel_depots"
  FOR SELECT
  TO "authenticated"
  USING ((private.object_session_active() AND private.is_member(tenant_id)));

CREATE POLICY "depots_update" ON "public"."travel_depots"
  FOR UPDATE
  TO "authenticated"
  USING ((private.object_session_active() AND private.has_role(tenant_id, ARRAY['tenant_admin'::public.app_role, 'management'::public.app_role, 'planner'::public.app_role])))
  WITH CHECK ((private.object_session_active() AND private.has_role(tenant_id, ARRAY['tenant_admin'::public.app_role, 'management'::public.app_role, 'planner'::public.app_role])));

CREATE POLICY "travel_legs_read" ON "public"."travel_legs"
  FOR SELECT
  TO "authenticated"
  USING
    ((private.object_session_active() AND (private.has_role(tenant_id, ARRAY['tenant_admin'::public.app_role, 'management'::public.app_role, 'planner'::public.app_role,
    'hr'::public.app_role]) OR (EXISTS ( SELECT 1
   FROM public.work_order_assignments a
  WHERE
    ((a.tenant_id = travel_legs.tenant_id) AND (a.id = travel_legs.assignment_id) AND (a.personnel_id = private.current_personnel_id(a.tenant_id)) AND (a.status <>
    'cancelled'::text) AND private.is_work_order_assignee(a.tenant_id, a.work_order_id)))))));

REVOKE ALL ON FUNCTION "private"."address_fingerprint"(jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."address_fingerprint"(jsonb) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "private"."address_guard"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."address_guard"() TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "private"."bump_travel_revision"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."bump_travel_revision"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."margins_guard"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."margins_guard"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."normalize_changed_address"(jsonb, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."normalize_changed_address"(jsonb, jsonb) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "private"."valid_address"(jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."valid_address"(jsonb) TO "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."personnel_mobility"(uuid, uuid) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."route_cache_claim"(text[], text, text, integer, integer, uuid) TO "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."route_cache_finish"(text, uuid, jsonb, text, integer) TO "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."route_cache_read"(text[]) TO "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."store_travel_estimates"(uuid, bigint, jsonb, text, uuid) TO "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."travel_context"(uuid, uuid, uuid, date, uuid) TO "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."travel_session_active"() TO "authenticated", "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."route_cache" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."route_provider_usage" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."travel_revisions" TO "postgres";

REVOKE ALL ("created_at") ON TABLE "public"."personnel" FROM "authenticated";

GRANT SELECT ("created_at") ON TABLE "public"."personnel" TO "authenticated";

REVOKE ALL ("departure_depot_id") ON TABLE "public"."personnel" FROM "authenticated";

GRANT SELECT ("departure_depot_id") ON TABLE "public"."personnel" TO "authenticated";

REVOKE ALL ("departure_kind") ON TABLE "public"."personnel" FROM "authenticated";

GRANT SELECT ("departure_kind") ON TABLE "public"."personnel" TO "authenticated";

REVOKE ALL ("email") ON TABLE "public"."personnel" FROM "authenticated";

GRANT SELECT ("email") ON TABLE "public"."personnel" TO "authenticated";

REVOKE ALL ("emergency_contact") ON TABLE "public"."personnel" FROM "authenticated";

GRANT SELECT ("emergency_contact") ON TABLE "public"."personnel" TO "authenticated";

REVOKE ALL ("employee_number") ON TABLE "public"."personnel" FROM "authenticated";

GRANT SELECT ("employee_number") ON TABLE "public"."personnel" TO "authenticated";

REVOKE ALL ("end_date") ON TABLE "public"."personnel" FROM "authenticated";

GRANT SELECT ("end_date") ON TABLE "public"."personnel" TO "authenticated";

REVOKE ALL ("full_name") ON TABLE "public"."personnel" FROM "authenticated";

GRANT SELECT ("full_name") ON TABLE "public"."personnel" TO "authenticated";

REVOKE ALL ("id") ON TABLE "public"."personnel" FROM "authenticated";

GRANT SELECT ("id") ON TABLE "public"."personnel" TO "authenticated";

REVOKE ALL ("phone") ON TABLE "public"."personnel" FROM "authenticated";

GRANT SELECT ("phone") ON TABLE "public"."personnel" TO "authenticated";

REVOKE ALL ("return_to_departure") ON TABLE "public"."personnel" FROM "authenticated";

GRANT SELECT ("return_to_departure") ON TABLE "public"."personnel" TO "authenticated";

REVOKE ALL ("standard_vehicle") ON TABLE "public"."personnel" FROM "authenticated";

GRANT SELECT ("standard_vehicle") ON TABLE "public"."personnel" TO "authenticated";

REVOKE ALL ("start_date") ON TABLE "public"."personnel" FROM "authenticated";

GRANT SELECT ("start_date") ON TABLE "public"."personnel" TO "authenticated";

REVOKE ALL ("status") ON TABLE "public"."personnel" FROM "authenticated";

GRANT SELECT ("status") ON TABLE "public"."personnel" TO "authenticated";

REVOKE ALL ("tenant_id") ON TABLE "public"."personnel" FROM "authenticated";

GRANT SELECT ("tenant_id") ON TABLE "public"."personnel" TO "authenticated";

REVOKE ALL ("updated_at") ON TABLE "public"."personnel" FROM "authenticated";

GRANT SELECT ("updated_at") ON TABLE "public"."personnel" TO "authenticated";

REVOKE ALL ("user_id") ON TABLE "public"."personnel" FROM "authenticated";

GRANT SELECT ("user_id") ON TABLE "public"."personnel" TO "authenticated";

REVOKE ALL ("version") ON TABLE "public"."personnel" FROM "authenticated";

GRANT SELECT ("version") ON TABLE "public"."personnel" TO "authenticated";

REVOKE ALL ON TABLE "public"."personnel" FROM "authenticated";

GRANT DELETE, INSERT, UPDATE ON TABLE "public"."personnel" TO "authenticated";

REVOKE ALL ON TABLE "public"."personnel_travel_days" FROM "authenticated";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."personnel_travel_days" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."personnel_travel_days" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."travel_depots" FROM "authenticated";

GRANT INSERT, SELECT, UPDATE ON TABLE "public"."travel_depots" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."travel_depots" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."travel_legs" FROM "authenticated";

GRANT SELECT ON TABLE "public"."travel_legs" TO "authenticated";


-- Preserve existing HR addresses without geocoding or replacing a supplied home address.
update public.personnel p
set home_address=jsonb_build_object('street',i.dossier_data->>'street','postal_code',i.dossier_data->>'postalCode','city',i.dossier_data->>'city','country','NL','source','legacy','status','needs_review')
from public.personnel_dossier_items i
where i.tenant_id=p.tenant_id and i.personnel_id=p.id and i.kind='profile'
  and p.home_address='{}' and length(coalesce(i.dossier_data->>'street',''))>0;

-- Column grants must follow the table-level REVOKE ALL emitted by schema diff.
-- REVOKE ALL also clears column ACLs; never restore whole-table SELECT.
do $$declare cols text; begin
 select string_agg(quote_ident(column_name),',') into cols from information_schema.columns
 where table_schema='public' and table_name='personnel'
 and column_name not in ('home_address','alternate_departure_address');
 execute 'grant select('||cols||') on public.personnel to authenticated';
end$$;
