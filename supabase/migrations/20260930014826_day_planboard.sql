SET local check_function_bodies = off;

CREATE TABLE "public"."planning_changes" (
  "id"                 uuid                     NOT NULL,
  "tenant_id"          uuid                     NOT NULL,
  "work_order_id"      uuid                     NOT NULL,
  "actor_user_id"      uuid                     NOT NULL,
  "before_data"        jsonb                    NOT NULL,
  "after_data"         jsonb                    NOT NULL,
  "confirmed_warnings" jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  "created_at"         timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  "undone_by"          uuid,
  CONSTRAINT "planning_changes_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."planning_changes"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."planning_changes"
  FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."planning_changes" FROM "anon";

ALTER TABLE "public"."work_orders"
  ADD COLUMN "requested_date" date;

ALTER TABLE "public"."work_orders"
  ADD COLUMN "customer_window_kind" text NOT NULL DEFAULT 'unknown'::text;

ALTER TABLE "public"."work_orders"
  ADD COLUMN "required_personnel" integer NOT NULL DEFAULT 1;

ALTER TABLE "public"."work_orders"
  ADD COLUMN "day_instructions" text NOT NULL DEFAULT ''::text;

ALTER TABLE "public"."work_orders"
  ALTER COLUMN "planned_end_at" DROP NOT NULL;

ALTER TABLE "public"."work_orders"
  ALTER COLUMN "planned_start_at" DROP NOT NULL;

ALTER TABLE "public"."work_orders"
  ALTER COLUMN "projected_end_at" DROP NOT NULL;

ALTER TABLE "public"."work_orders"
  ALTER COLUMN "projected_start_at" DROP NOT NULL;

CREATE OR REPLACE FUNCTION private.assignment_qualification_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare r record; snapshot jsonb:='[]';passed boolean;evidence uuid;evidence_revision bigint;
begin
 if tg_op='UPDATE' and (new.status in ('completed','returned','cancelled')
  or(new.personnel_id=old.personnel_id and new.work_order_id=old.work_order_id and new.projected_start_at=old.projected_start_at and new.projected_end_at=old.projected_end_at and new.status=old.status)) then new.qualification_snapshot:=old.qualification_snapshot;return new;end if;
 for r in select * from private.assignment_requirements(new.tenant_id,new.personnel_id,new.work_order_id,new.projected_start_at,new.projected_end_at) loop
  passed:=private.qualified_for_period(new.tenant_id,new.personnel_id,r.code,new.projected_start_at,new.projected_end_at);
  if r.hard_requirement and not passed then raise exception 'Vereiste kwalificatie % ontbreekt of is niet geldig voor de volledige uitvoering',r.code using errcode='23514';end if;
  select c.id,c.dossier_revision into evidence,evidence_revision from public.certificates c where c.tenant_id=new.tenant_id and c.personnel_id=new.personnel_id and c.code=r.code and c.dossier_status='approved'
   and(c.valid_from is null or c.valid_from<=(new.projected_start_at at time zone 'Europe/Amsterdam')::date) and(c.expires_on is null or c.expires_on>=((new.projected_end_at-interval '1 microsecond') at time zone 'Europe/Amsterdam')::date) order by c.verified_at desc limit 1;
  snapshot:=snapshot||jsonb_build_array(jsonb_build_object('code',r.code,'hard',r.hard_requirement,'verified',passed,'checked_at',now(),'starts_at',new.projected_start_at,'ends_at',new.projected_end_at,'evidence_id',evidence,'evidence_revision',evidence_revision));
 end loop;
 new.qualification_snapshot:=snapshot;return new;
end $function$;

CREATE OR REPLACE FUNCTION private.planboard_category (
  s            public.work_order_status,
  actual       timestamp with time zone,
  has_interval boolean,
  crew         integer,
  required     integer
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
 select case when s='cancelled' then 'cancelled'
 when s in ('completed','returned','under_review','correction_required','approved','invoice_ready','invoiced') then 'completed'
 when s='in_progress' then 'running'
 when s in ('planned','released','seen','travelling') and has_interval and crew>=required then 'planned'
 else 'unassigned' end;
$function$;

CREATE OR REPLACE FUNCTION private.planboard_row (
  w uuid
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select jsonb_build_object('id',o.id,'number',o.work_order_number,'customerId',o.customer_id,'objectId',o.object_id,'customer',c.name,'object',ob.name,
 'status',o.status,'version',o.version,'start',o.projected_start_at,'end',o.projected_end_at,'actualStart',o.actual_start_at,'actualEnd',o.actual_end_at,
 'requestedDate',o.requested_date,'windowStart',s.starts_at,'windowEnd',s.ends_at,'windowKind',o.customer_window_kind,'requiredPersonnel',o.required_personnel,'discipline',o.discipline,'instructions',o.day_instructions,
 'durationMinutes',case when o.projected_end_at>o.projected_start_at then extract(epoch from(o.projected_end_at-o.projected_start_at))/60 else (select sum(t.duration_minutes*t.quantity) from public.work_order_tasks t where t.tenant_id=o.tenant_id and t.work_order_id=o.id and (not t.is_extra_work or t.extra_work_status='approved')) end,
 'priority',coalesce(r.priority,'normal'),
 'assignments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'personnelId',a.personnel_id,'start',a.projected_start_at,'end',a.projected_end_at,'status',a.status,'version',a.version,
 'qualifications',coalesce((select jsonb_agg(jsonb_build_object('code',req.code,'hard',req.hard_requirement)) from private.assignment_requirements(a.tenant_id,a.personnel_id,a.work_order_id,a.projected_start_at,a.projected_end_at)req where not private.qualified_for_period(a.tenant_id,a.personnel_id,req.code,a.projected_start_at,a.projected_end_at)),'[]'),
 'travel',coalesce((select jsonb_agg(jsonb_build_object('direction',l.direction,'minutes',case when l.error_code is null and l.calculated_at is not null then l.estimated_minutes end,'state',case when l.error_code='planning_changed' then 'stale' when l.error_code is not null then 'failed' when l.calculated_at is not null and l.estimated_minutes is not null then 'known' else 'unknown' end)) from public.travel_legs l where l.tenant_id=a.tenant_id and l.assignment_id=a.id),'[]')) order by a.personnel_id)
 from public.work_order_assignments a where a.tenant_id=o.tenant_id and a.work_order_id=o.id and a.status not in ('returned','cancelled')),'[]'),
 'category',private.planboard_category(o.status,o.actual_start_at,o.projected_start_at is not null,(select count(*)::integer from public.work_order_assignments a where a.tenant_id=o.tenant_id and a.work_order_id=o.id and a.status not in ('returned','cancelled')),o.required_personnel))
 from public.work_orders o join public.customers c on c.id=o.customer_id and c.tenant_id=o.tenant_id join public.objects ob on ob.id=o.object_id and ob.tenant_id=o.tenant_id and ob.customer_id=o.customer_id
 left join public.appointment_slots s on s.tenant_id=o.tenant_id and s.id=o.appointment_slot_id left join public.requests r on r.tenant_id=o.tenant_id and r.id=o.request_id where o.id=w;
$function$;

CREATE OR REPLACE FUNCTION private.planning_access (
  t uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
 select auth.uid() is not null and private.has_role(t,array['tenant_admin','management','planner']::public.app_role[]) and private.service_enabled(t,'planning');
$function$;

CREATE OR REPLACE FUNCTION private.planning_assignment_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare w public.work_orders; p public.personnel; changed boolean;
begin
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||coalesce(new.tenant_id,old.tenant_id)::text,0));
 if tg_op='DELETE' then return old;end if;
 select * into w from public.work_orders where tenant_id=new.tenant_id and id=new.work_order_id;
 if not found then raise exception 'Werkbon bestaat niet in deze organisatie' using errcode='23503';end if;
 changed:=tg_op='INSERT';
 if tg_op='UPDATE' then
   changed:=(new.personnel_id,new.work_order_id,new.projected_start_at,new.projected_end_at) is distinct from (old.personnel_id,old.work_order_id,old.projected_start_at,old.projected_end_at)
     or (old.status in ('cancelled','returned') and new.status not in ('cancelled','returned'));
 end if;
 if new.status in ('cancelled','returned','completed') or not changed then return new;end if;
 if new.actual_start_at is null and w.status not in ('planned','released','seen','travelling') then
   raise exception 'Deze uitvoering kan niet meer via het planbord worden gewijzigd' using errcode='23514';end if;
 select * into p from public.personnel where tenant_id=new.tenant_id and id=new.personnel_id;
 if not found or p.status<>'active' then raise exception 'Medewerker is niet actief' using errcode='23514';end if;
 -- Actual execution is recorded by the existing status command. Do not erase
 -- or reject an actual start because reality deviates from the plan.
 if new.actual_start_at is not null then return new;end if;
 if exists(select 1 from public.availability a where a.tenant_id=new.tenant_id and a.personnel_id=new.personnel_id and a.kind in ('unavailable','leave','sick') and a.starts_at<new.projected_end_at and a.ends_at>new.projected_start_at) then
   raise exception 'Medewerker is niet beschikbaar in dit tijdvak' using errcode='23P01';end if;
 if exists(select 1 from public.work_order_assignments a join public.work_orders other on other.tenant_id=a.tenant_id and other.id=a.work_order_id
   where a.tenant_id=new.tenant_id and a.personnel_id=new.personnel_id and a.id<>new.id and a.status not in ('completed','returned','cancelled') and other.status<>'cancelled'
   and a.projected_start_at<new.projected_end_at and a.projected_end_at>new.projected_start_at) then
   raise exception 'Medewerker heeft een overlappende uitvoering' using errcode='23P01';end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.planning_assignment_version()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 update public.work_orders set version=version+1 where tenant_id=coalesce(new.tenant_id,old.tenant_id) and id=coalesce(new.work_order_id,old.work_order_id);
 return coalesce(new,old);
end $function$;

CREATE OR REPLACE FUNCTION private.planning_relation_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 if not exists(select 1 from public.customers c where c.id=new.customer_id and c.tenant_id=new.tenant_id) then
   raise exception 'Klant bestaat niet in deze organisatie' using errcode='23503';end if;
 if not exists(select 1 from public.objects o where o.id=new.object_id and o.tenant_id=new.tenant_id) then
   raise exception 'Object bestaat niet in deze organisatie' using errcode='23503';end if;
 if not exists(select 1 from public.objects o where o.id=new.object_id and o.tenant_id=new.tenant_id and o.customer_id=new.customer_id) then
   raise exception 'Het object hoort niet bij deze klant' using errcode='23514';end if;
 if new.appointment_slot_id is not null and not exists(select 1 from public.appointment_slots s where s.tenant_id=new.tenant_id and s.id=new.appointment_slot_id) then
   raise exception 'Klantafspraak bestaat niet in deze organisatie' using errcode='23503';end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.planning_snapshot (
  w uuid
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select jsonb_build_object('start',o.projected_start_at,'end',o.projected_end_at,'plannedStart',o.planned_start_at,'plannedEnd',o.planned_end_at,'version',o.version,
 'assignments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'personnelId',a.personnel_id,'start',a.projected_start_at,'end',a.projected_end_at,'plannedStart',a.planned_start_at,'plannedEnd',a.planned_end_at,'status',a.status) order by a.personnel_id)
 from public.work_order_assignments a where a.tenant_id=o.tenant_id and a.work_order_id=o.id and a.status not in ('cancelled','returned')),'[]'),
 'appointment',jsonb_build_object('requestedDate',o.requested_date,'windowKind',o.customer_window_kind,'requiredPersonnel',o.required_personnel,'instructions',o.day_instructions),
 'dispatches',coalesce((select jsonb_agg(d.id) from public.dispatches d where d.tenant_id=o.tenant_id and d.work_order_id=o.id and d.revoked_at is null),'[]')) from public.work_orders o where o.id=w;
$function$;

CREATE OR REPLACE FUNCTION public.change_work_order_planning (
  target_tenant      uuid,
  target_work_order  uuid,
  expected_version   bigint,
  mutation_id        uuid,
  target_start       timestamp with time zone,
  target_end         timestamp with time zone,
  target_assignments jsonb,
  confirmed_warnings text[]                   DEFAULT '{}'::text[],
  undo_change        uuid                     DEFAULT NULL::uuid,
  appointment_data   jsonb                    DEFAULT NULL::jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
<<planning_mutation>>
declare w public.work_orders; person public.personnel; a record; req record; current_a public.work_order_assignments;
 old_state jsonb; new_state jsonb; prior public.planning_changes; undo_record public.planning_changes;
 warnings jsonb:='[]'::jsonb; tz text; window_start timestamptz; window_end timestamptz;
 n integer; assignment_id uuid; desired_status text; route record; neighbour public.work_order_assignments;
begin
 if not private.planning_access(target_tenant) then raise exception 'Geen toegang tot planning' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 select * into w from public.work_orders where tenant_id=target_tenant and id=target_work_order for update;
 if not found then raise exception 'Werkbon niet gevonden' using errcode='42501';end if;
 select * into prior from public.planning_changes where id=mutation_id;
 if found then
   if prior.tenant_id<>target_tenant or prior.actor_user_id<>auth.uid() or prior.work_order_id<>w.id then raise exception 'Ongeldige wijzigingssleutel' using errcode='42501';end if;
   return jsonb_build_object('ok',true,'changeId',prior.id,'version',w.version,'replayed',true);
 end if;
 if w.version<>expected_version then raise exception 'De planning is intussen gewijzigd. Bekijk de actuele situatie en probeer opnieuw.' using errcode='40001';end if;
 if w.status not in ('planned','released','seen','travelling') or w.actual_start_at is not null or exists(select 1 from public.work_order_assignments where tenant_id=target_tenant and work_order_id=w.id and (actual_start_at is not null or status in ('in_progress','completed'))) then
   raise exception 'Deze uitvoering kan niet meer via het planbord worden gewijzigd' using errcode='23514';end if;
 old_state:=private.planning_snapshot(w.id);
 if undo_change is not null then
   select * into undo_record from public.planning_changes where id=undo_change and tenant_id=target_tenant and actor_user_id=auth.uid() and work_order_id=w.id and undone_by is null for update;
   if not found or (undo_record.after_data->>'version')::bigint<>w.version or exists(select 1 from public.planning_changes c where c.tenant_id=target_tenant and c.actor_user_id=auth.uid() and c.created_at>undo_record.created_at) then
     raise exception 'Deze wijziging kan niet meer veilig ongedaan worden gemaakt' using errcode='40001';end if;
   target_start:=(undo_record.before_data->>'start')::timestamptz;
   target_end:=(undo_record.before_data->>'end')::timestamptz;
   target_assignments:=undo_record.before_data->'assignments';
   appointment_data:=undo_record.before_data->'appointment';
 end if;
 if appointment_data is not null then
   if jsonb_typeof(appointment_data)<>'object' or not(appointment_data ?& array['requestedDate','windowKind','requiredPersonnel','instructions']) then raise exception 'Ongeldige afspraakgegevens' using errcode='23514';end if;
   w.requested_date:=(appointment_data->>'requestedDate')::date;
   w.customer_window_kind:=appointment_data->>'windowKind';
   w.required_personnel:=(appointment_data->>'requiredPersonnel')::integer;
   w.day_instructions:=appointment_data->>'instructions';
   if w.customer_window_kind is null or w.customer_window_kind not in ('unknown','arrival','execution') or w.required_personnel is null or w.required_personnel not between 1 and 100 or w.day_instructions is null or length(w.day_instructions)>2000 or (w.requested_date is not null and not isfinite(w.requested_date)) then raise exception 'Controleer de afspraakgegevens' using errcode='23514';end if;
 end if;
 if target_assignments is null or jsonb_typeof(target_assignments)<>'array' or jsonb_array_length(target_assignments)>100 then raise exception 'Ongeldige medewerkersselectie' using errcode='23514';end if;
 if (target_start is null)<>(target_end is null) or target_end<=target_start or (target_start is null and (w.status<>'planned' or jsonb_array_length(target_assignments)>0)) then raise exception 'Vul een geldige begin- en eindtijd in' using errcode='23514';end if;
 if target_start is not null and (not isfinite(target_start) or not isfinite(target_end) or target_end-target_start>interval '7 days' or date_trunc('minute',target_start)<>target_start or date_trunc('minute',target_end)<>target_end) then raise exception 'Gebruik hele minuten en een uitvoering van maximaal zeven dagen' using errcode='23514';end if;
 select timezone into tz from public.tenants where id=target_tenant;
 if (select count(*) from jsonb_array_elements(target_assignments))<>(select count(distinct x->>'personnelId') from jsonb_array_elements(target_assignments)x) then raise exception 'Selecteer iedere medewerker maximaal één keer' using errcode='23514';end if;
 select s.starts_at,s.ends_at into window_start,window_end from public.appointment_slots s where s.tenant_id=target_tenant and s.id=w.appointment_slot_id;
 if target_start is not null then
   if w.requested_date is not null and (target_start at time zone tz)::date<>w.requested_date then warnings:=warnings||jsonb_build_array(jsonb_build_object('key','requested-date','message','De planning wijkt af van de gewenste datum '||to_char(w.requested_date,'DD-MM-YYYY')));end if;
   if window_start is not null then
     if w.customer_window_kind='unknown' then warnings:=warnings||jsonb_build_array(jsonb_build_object('key','window-unknown','message','Het type klantvenster is onbekend; controleer de afspraak.'));
     elsif target_start<window_start or (w.customer_window_kind='arrival' and target_start>window_end) or(w.customer_window_kind='execution' and target_end>window_end) then
       warnings:=warnings||jsonb_build_array(jsonb_build_object('key','customer-window','message',case when w.customer_window_kind='arrival' then 'De begintijd valt buiten het aankomstvenster.' else 'De volledige uitvoering past niet binnen het klantvenster.' end));end if;
   end if;
 end if;
 n:=jsonb_array_length(target_assignments);
 if n<w.required_personnel then warnings:=warnings||jsonb_build_array(jsonb_build_object('key','staffing','message',(w.required_personnel-n)::text||' medewerker(s) ontbreken voor de gewenste bezetting.'));end if;
 for a in select * from jsonb_to_recordset(target_assignments) as x("personnelId" uuid,start timestamptz,"end" timestamptz) loop
   if a."personnelId" is null or a.start is null or a."end" is null or a."end"<=a.start or a.start<target_start or a."end">target_end or date_trunc('minute',a.start)<>a.start or date_trunc('minute',a."end")<>a."end" then raise exception 'Ongeldig tijdvak voor medewerker' using errcode='23514';end if;
   select * into person from public.personnel where tenant_id=target_tenant and id=a."personnelId";
   if not found then raise exception 'Medewerker niet gevonden in deze organisatie' using errcode='42501';end if;
   select * into current_a from public.work_order_assignments where tenant_id=target_tenant and work_order_id=w.id and personnel_id=person.id and status not in ('cancelled','returned');
   -- An unchanged historical assignment remains intact; no new work for inactive staff.
   if person.status<>'active' and (current_a.id is null or (current_a.projected_start_at,current_a.projected_end_at) is distinct from (a.start,a."end")) then raise exception 'Medewerker % is niet actief',person.full_name using errcode='23514';end if;
   if exists(select 1 from public.availability v where v.tenant_id=target_tenant and v.personnel_id=person.id and v.kind in ('unavailable','leave','sick') and v.starts_at<a."end" and v.ends_at>a.start) then raise exception '% is niet beschikbaar in dit tijdvak',person.full_name using errcode='23P01';end if;
   if exists(select 1 from public.work_order_assignments other join public.work_orders ow on ow.id=other.work_order_id and ow.tenant_id=other.tenant_id where other.tenant_id=target_tenant and other.personnel_id=person.id and other.work_order_id<>w.id and other.status not in ('completed','returned','cancelled') and ow.status<>'cancelled' and other.projected_start_at<a."end" and other.projected_end_at>a.start) then raise exception '% heeft een overlappende uitvoering',person.full_name using errcode='23P01';end if;
   if exists(select 1 from public.availability v where v.tenant_id=target_tenant and v.personnel_id=person.id and v.kind='available' and v.starts_at<(date_trunc('day',a.start at time zone tz)+interval '1 day') at time zone tz and v.ends_at>date_trunc('day',a.start at time zone tz) at time zone tz)
    and not exists(select 1 from public.availability v where v.tenant_id=target_tenant and v.personnel_id=person.id and v.kind='available' and v.starts_at<=a.start and v.ends_at>=a."end") then warnings:=warnings||jsonb_build_array(jsonb_build_object('key','hours:'||person.id,'message',person.full_name||': buiten de bekende werktijden.'));end if;
   for req in select * from private.assignment_requirements(target_tenant,person.id,w.id,a.start,a."end") loop
     if not private.qualified_for_period(target_tenant,person.id,req.code,a.start,a."end") then
       if req.hard_requirement then raise exception '% mist de vereiste kwalificatie % voor de volledige uitvoering',person.full_name,req.code using errcode='23514';end if;
       warnings:=warnings||jsonb_build_array(jsonb_build_object('key','qualification:'||person.id||':'||req.code,'message',person.full_name||': controleer kwalificatie '||req.code));
     end if;
   end loop;
   -- Only an existing calculation whose endpoints match the actual neighbouring
   -- objects is usable here. No assumed home base, mode or invented minutes.
   for route in select l.* from public.travel_legs l join public.work_order_assignments ra on ra.id=l.assignment_id and ra.tenant_id=l.tenant_id
     where l.tenant_id=target_tenant and ra.work_order_id=w.id and ra.personnel_id=person.id and l.error_code is null and l.calculated_at is not null and l.estimated_minutes is not null loop
     if route.direction='before' then
       select aa.* into neighbour from public.work_order_assignments aa join public.work_orders ow on ow.tenant_id=aa.tenant_id and ow.id=aa.work_order_id
       where aa.tenant_id=target_tenant and aa.personnel_id=person.id and aa.work_order_id<>w.id and aa.status not in ('cancelled','returned') and ow.status<>'cancelled' and aa.projected_end_at<=a.start order by aa.projected_end_at desc limit 1;
     else
       select aa.* into neighbour from public.work_order_assignments aa join public.work_orders ow on ow.tenant_id=aa.tenant_id and ow.id=aa.work_order_id
       where aa.tenant_id=target_tenant and aa.personnel_id=person.id and aa.work_order_id<>w.id and aa.status not in ('cancelled','returned') and ow.status<>'cancelled' and aa.projected_start_at>=a."end" order by aa.projected_start_at limit 1;
     end if;
     if neighbour.id is not null and exists(select 1 from public.objects ob join public.work_orders ow on ow.object_id=ob.id and ow.tenant_id=ob.tenant_id
       where ow.tenant_id=target_tenant and ow.id=neighbour.work_order_id and ob.address=case when route.direction='before' then route.origin_address else route.destination_address end)
       and exists(select 1 from public.objects ob where ob.tenant_id=target_tenant and ob.id=w.object_id and ob.address=case when route.direction='before' then route.destination_address else route.origin_address end)
       and (case when route.direction='before' then a.start-neighbour.projected_end_at else neighbour.projected_start_at-a."end" end)<make_interval(mins=>route.estimated_minutes) then
         warnings:=warnings||jsonb_build_array(jsonb_build_object('key','travel:'||person.id||':'||route.direction,'message',person.full_name||': minder ruimte tussen afspraken dan de bestaande reisberekening van '||route.estimated_minutes||' minuten. Controleer de route opnieuw.'));
     end if;
   end loop;
 end loop;
 if exists(select 1 from jsonb_array_elements(warnings)x where not(coalesce(x->>'key','')=any(coalesce(confirmed_warnings,'{}')))) then
   return jsonb_build_object('ok',false,'code','confirmation','warnings',warnings,'before',old_state,'proposed',jsonb_build_object('start',target_start,'end',target_end,'assignments',target_assignments));
 end if;
 -- Removing an assignment archives it and revokes its dispatch, preserving time,
 -- reports, historical dispatches and invoice relations. Never delete the work order.
 update public.dispatches d set revoked_at=clock_timestamp() where d.tenant_id=target_tenant and d.work_order_id=w.id and d.revoked_at is null and not exists(select 1 from public.work_order_assignments aa join jsonb_array_elements(target_assignments)x on (x->>'personnelId')::uuid=aa.personnel_id where aa.id=d.assignment_id);
 update public.work_order_assignments aa set status='cancelled' where aa.tenant_id=target_tenant and aa.work_order_id=w.id and aa.status not in ('cancelled','returned') and not exists(select 1 from jsonb_array_elements(target_assignments)x where (x->>'personnelId')::uuid=aa.personnel_id);
 for a in select * from jsonb_to_recordset(target_assignments) as x("personnelId" uuid,start timestamptz,"end" timestamptz) loop
   select * into current_a from public.work_order_assignments where tenant_id=target_tenant and work_order_id=w.id and personnel_id=a."personnelId";
   desired_status:=case when w.status='planned' then 'planned' else 'released' end;
   if current_a.id is null then
     insert into public.work_order_assignments(tenant_id,work_order_id,personnel_id,planned_start_at,planned_end_at,projected_start_at,projected_end_at,status)
     values(target_tenant,w.id,a."personnelId",a.start,a."end",a.start,a."end",desired_status) returning id into assignment_id;
   else
     assignment_id:=current_a.id;
     if (current_a.projected_start_at,current_a.projected_end_at) is distinct from (a.start,a."end") or current_a.status in ('cancelled','returned') then
       update public.work_order_assignments set planned_start_at=a.start,planned_end_at=a."end",projected_start_at=a.start,projected_end_at=a."end",status=case when status in ('cancelled','returned') then desired_status else status end where id=assignment_id;
     end if;
   end if;
   if w.status<>'planned' and not exists(select 1 from public.dispatches d where d.tenant_id=target_tenant and d.assignment_id=planning_mutation.assignment_id and d.revoked_at is null) then
     insert into public.dispatches(tenant_id,work_order_id,assignment_id,dispatched_by,idempotency_key) values(target_tenant,w.id,assignment_id,auth.uid(),'planning:'||mutation_id||':'||a."personnelId");
   end if;
 end loop;
 update public.work_orders set planned_start_at=target_start,planned_end_at=target_end,projected_start_at=target_start,projected_end_at=target_end,
   requested_date=w.requested_date,customer_window_kind=w.customer_window_kind,required_personnel=w.required_personnel,day_instructions=w.day_instructions where id=w.id;
 -- Restore the old contractual planned interval on undo without changing reality.
 if undo_change is not null then
   update public.work_orders set planned_start_at=(undo_record.before_data->>'plannedStart')::timestamptz,planned_end_at=(undo_record.before_data->>'plannedEnd')::timestamptz where id=w.id;
   update public.work_order_assignments aa set planned_start_at=(x->>'plannedStart')::timestamptz,planned_end_at=(x->>'plannedEnd')::timestamptz from jsonb_array_elements(target_assignments)x where aa.tenant_id=target_tenant and aa.work_order_id=w.id and aa.personnel_id=(x->>'personnelId')::uuid;
 end if;
 -- Cached routes depend on both neighbours, their origins and departure times.
 -- The existing route module can recalculate; stale minutes must not masquerade as reliable.
 update public.travel_legs leg set error_code='planning_changed',calculated_at=null where leg.tenant_id=target_tenant and leg.actual_started_at is null and exists(select 1 from public.work_order_assignments aa where aa.id=leg.assignment_id and aa.tenant_id=target_tenant and aa.personnel_id in(select (x->>'personnelId')::uuid from jsonb_array_elements(target_assignments||(old_state->'assignments'))x));
 new_state:=private.planning_snapshot(w.id);
 insert into public.planning_changes(id,tenant_id,work_order_id,actor_user_id,before_data,after_data,confirmed_warnings) values(mutation_id,target_tenant,w.id,auth.uid(),old_state,new_state,warnings);
 if undo_change is not null then update public.planning_changes set undone_by=mutation_id where id=undo_change;end if;
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,before_data,after_data) values(target_tenant,auth.uid(),case when undo_change is null then 'planning.changed' else 'planning.undone' end,'work_order',w.id,old_state,new_state||jsonb_build_object('confirmed_warnings',warnings,'mutation_id',mutation_id));
 if w.status<>'planned' then
   for a in select distinct (x->>'personnelId')::uuid as pid from jsonb_array_elements(target_assignments)x loop
     perform private.enqueue_event(target_tenant,'work_order.rescheduled','work_order',w.id,jsonb_build_object('personnel_id',a.pid),'planning:'||mutation_id||':'||a.pid);
   end loop;
 end if;
 return jsonb_build_object('ok',true,'changeId',mutation_id,'version',(new_state->>'version')::bigint,'warnings',warnings);
end $function$;

REVOKE ALL
  ON FUNCTION "public"."change_work_order_planning"(uuid, uuid, bigint, uuid, timestamp WITH time zone, timestamp WITH time zone, jsonb, text[], uuid, jsonb)
  FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.dispatch_work_order (
  target_work_order_id uuid,
  target_personnel_id  uuid,
  expected_version     bigint,
  idempotency_key      text
)
  RETURNS public.work_orders
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  target public.work_orders;
  assignment public.work_order_assignments;
  result public.work_orders;
begin
  perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||w.tenant_id::text,0)) from public.work_orders w where w.id=target_work_order_id; select * into target from public.work_orders w where w.id = target_work_order_id for update;
  if not found then raise exception 'Work order not found' using errcode = 'P0002'; end if;
  if not private.has_role(target.tenant_id, array['tenant_admin','management','planner']::public.app_role[]) then
    raise exception 'Planner role required' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.dispatches d
    where d.tenant_id = target.tenant_id
      and d.idempotency_key = dispatch_work_order.idempotency_key
  ) then
    return target;
  end if;
  if target.version <> expected_version then
    raise exception 'Work order was changed by another user' using errcode = '40001';
  end if;
  if target.status not in ('planned','released') then
    raise exception 'Only planned work can be dispatched' using errcode = '23514';
  end if;

  select * into assignment
  from public.work_order_assignments a
  where a.tenant_id = target.tenant_id
    and a.work_order_id = target.id
    and a.personnel_id = target_personnel_id
  for update;
  if not found then raise exception 'Personnel is not assigned to this work order' using errcode = '23503'; end if;

  if assignment.status in ('cancelled','returned','completed') then raise exception 'Deze toewijzing is niet meer actief' using errcode='23514';end if; insert into public.dispatches (tenant_id, work_order_id, assignment_id, dispatched_by, idempotency_key)
  values (target.tenant_id, target.id, assignment.id, auth.uid(), dispatch_work_order.idempotency_key)
  on conflict on constraint dispatches_tenant_id_idempotency_key_key do nothing;

  update public.work_order_assignments
  set status = 'released'
  where id = assignment.id and status = 'planned';

  update public.work_orders
  set status = 'released', attention_reason = null
  where id = target.id
  returning * into result;

  insert into public.status_events (
    tenant_id, work_order_id, assignment_id, actor_user_id,
    previous_status, new_status, idempotency_key
  ) values (
    target.tenant_id, target.id, assignment.id, auth.uid(),
    target.status, 'released', dispatch_work_order.idempotency_key
  ) on conflict on constraint status_events_tenant_id_idempotency_key_key do nothing;

  perform private.enqueue_event(
    target.tenant_id,
    'work_order.dispatched',
    'work_order',
    target.id,
    jsonb_build_object('work_order_id', target.id, 'personnel_id', target_personnel_id),
    'dispatch:' || dispatch_work_order.idempotency_key
  );
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_planboard (
  target_tenant uuid,
  target_day    date,
  list_view     text    DEFAULT 'unassigned'::text,
  search_text   text    DEFAULT ''::text,
  status_filter text    DEFAULT ''::text,
  page_number   integer DEFAULT 1
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare tz text; ds timestamptz; de timestamptz; orders jsonb; board jsonb; people jsonb; availability_data jsonb; total integer; last_change jsonb;
begin
 if not private.planning_access(target_tenant) then raise exception 'Geen toegang tot planning' using errcode='42501';end if;
 if target_day is null or not isfinite(target_day) or list_view not in ('unassigned','planned','running','completed','cancelled','all') or page_number<1 or page_number>100000 or length(search_text)>200 then raise exception 'Ongeldige planbordfilters' using errcode='23514';end if;
 select timezone into tz from public.tenants where id=target_tenant;
 ds:=target_day::timestamp at time zone tz;de:=(target_day+1)::timestamp at time zone tz;
 with context_orders as materialized(
  select private.planboard_row(w.id) as row from public.work_orders w left join public.appointment_slots s on s.tenant_id=w.tenant_id and s.id=w.appointment_slot_id
  where w.tenant_id=target_tenant and ((w.projected_start_at<de and w.projected_end_at>ds)
   or(w.projected_start_at is null and w.status='planned' and coalesce(w.requested_date,(s.starts_at at time zone tz)::date,target_day)=target_day))
 ), filtered as materialized(select row from context_orders where (list_view='all' or row->>'category'=list_view) and (status_filter='' or row->>'status'=status_filter)
  and (btrim(search_text)='' or position(lower(btrim(search_text)) in lower(concat_ws(' ',row->>'number',row->>'customer',row->>'object')))>0)),
 paged as(select row from filtered order by case when list_view='unassigned' then case row->>'priority' when 'urgent' then 0 when 'high' then 1 else 2 end end,
 case when list_view='unassigned' then coalesce(row->>'requestedDate',row->>'windowStart',row->>'start') else row->>'start' end nulls last,row->>'id' limit 50 offset (page_number-1)*50)
 select (select count(*) from filtered),coalesce((select jsonb_agg(row) from paged),'[]') into total,orders;
 select coalesce(jsonb_agg(private.planboard_row(w.id) order by w.projected_start_at,w.id),'[]') into board from public.work_orders w where w.tenant_id=target_tenant and (w.projected_start_at<de and w.projected_end_at>ds or exists(select 1 from public.work_order_assignments a where a.tenant_id=w.tenant_id and a.work_order_id=w.id and a.status not in ('cancelled','returned') and a.projected_start_at<de and a.projected_end_at>ds));
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'number',p.employee_number,'status',p.status) order by p.full_name,p.id),'[]') into people from public.personnel p where p.tenant_id=target_tenant and (p.status='active' or exists(select 1 from public.work_order_assignments a where a.tenant_id=p.tenant_id and a.personnel_id=p.id and a.status not in ('cancelled','returned') and a.projected_start_at<de and a.projected_end_at>ds));
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'personnelId',a.personnel_id,'start',a.starts_at,'end',a.ends_at,'kind',case when a.kind='available' then 'available' else 'unavailable' end)),'[]') into availability_data from public.availability a where a.tenant_id=target_tenant and a.starts_at<de and a.ends_at>ds;
 select jsonb_build_object('id',c.id,'orderId',c.work_order_id,'version',(c.after_data->>'version')::bigint) into last_change from public.planning_changes c join public.work_orders w on w.tenant_id=c.tenant_id and w.id=c.work_order_id
 where c.tenant_id=target_tenant and c.actor_user_id=auth.uid() and c.undone_by is null and w.version=(c.after_data->>'version')::bigint and w.status in ('planned','released','seen','travelling') and w.actual_start_at is null
 and not exists(select 1 from public.planning_changes newer where newer.tenant_id=c.tenant_id and newer.actor_user_id=c.actor_user_id and newer.created_at>c.created_at) order by c.created_at desc limit 1;
 return jsonb_build_object('day',target_day,'timezone',tz,'board',board,'orders',orders,'total',total,'page',page_number,'people',people,'availability',availability_data,'undo',last_change);
end $function$;

REVOKE ALL ON FUNCTION "public"."get_planboard"(uuid, date, text, text, text, integer) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.get_planboard_order (
  target_tenant uuid,
  target_order  uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 if not private.planning_access(target_tenant) or not exists(select 1 from public.work_orders where tenant_id=target_tenant and id=target_order) then raise exception 'Werkbon niet beschikbaar' using errcode='42501';end if;
 return private.planboard_row(target_order);
end $function$;

REVOKE ALL ON FUNCTION "public"."get_planboard_order"(uuid, uuid) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.reschedule_work_order (
  target_work_order_id uuid,
  target_personnel_id  uuid,
  target_start_at      timestamp with time zone,
  expected_version     bigint
)
  RETURNS public.work_orders
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare w public.work_orders; result jsonb;
begin
 select * into w from public.work_orders where id=target_work_order_id;
 if not found or not private.planning_access(w.tenant_id) then raise exception 'Geen toegang tot planning' using errcode='42501';end if;
 if (select count(*) from public.work_order_assignments where tenant_id=w.tenant_id and work_order_id=w.id and status not in ('cancelled','returned'))>1 then
   raise exception 'Gebruik het planbord om de volledige ploeg te verplaatsen' using errcode='23514';end if;
 result:=public.change_work_order_planning(w.tenant_id,w.id,expected_version,gen_random_uuid(),target_start_at,target_start_at+(w.projected_end_at-w.projected_start_at),jsonb_build_array(jsonb_build_object('personnelId',target_personnel_id,'start',target_start_at,'end',target_start_at+(w.projected_end_at-w.projected_start_at))));
 if not(result->>'ok')::boolean then raise exception 'Controleer en bevestig de afwijkingen in het planbord' using errcode='23514';end if;
 select * into w from public.work_orders where id=w.id;
 return w;
end $function$;

CREATE OR REPLACE FUNCTION public.transition_work_order (
  target_work_order_id uuid,
  action               text,
  expected_version     bigint,
  idempotency_key      text,
  reason_code          text   DEFAULT NULL::text,
  note                 text   DEFAULT NULL::text
)
  RETURNS public.work_orders
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  target public.work_orders;
  assignment public.work_order_assignments;
  next_status public.work_order_status;
  event_time timestamptz := clock_timestamp();
  old_projected_end timestamptz;
  duration_minutes integer;
  shift_delta interval := interval '0 seconds';
  result public.work_orders;
begin
  perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||w.tenant_id::text,0)) from public.work_orders w where w.id=target_work_order_id; select * into target from public.work_orders w where w.id = target_work_order_id for update;
  if not found then raise exception 'Work order not found' using errcode = 'P0002'; end if;
  select a.* into assignment
  from public.work_order_assignments a
  join public.personnel p on p.tenant_id = a.tenant_id and p.id = a.personnel_id
  where a.tenant_id = target.tenant_id
    and a.work_order_id = target.id
    and p.user_id = auth.uid()
    and exists (
      select 1 from public.dispatches d
      where d.tenant_id = a.tenant_id and d.assignment_id = a.id and d.revoked_at is null
    )
  for update of a;
  if not found then
    raise exception 'The work order is not released to this user' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.status_events e
    where e.tenant_id = target.tenant_id and e.idempotency_key = transition_work_order.idempotency_key
  ) then
    return target;
  end if;
  if target.version <> expected_version then
    raise exception 'Work order was changed by another user' using errcode = '40001';
  end if;

  if target.status in ('cancelled','approved','invoice_ready','invoiced','under_review') or (target.status='completed' and action<>'resubmit') then
    raise exception 'Deze uitvoering staat niet open voor deze actie' using errcode='23514';
  end if;
  next_status := case
    when action = 'open' and assignment.status = 'released' then 'seen'::public.work_order_status
    when action = 'travel' and assignment.status = 'seen' then 'travelling'::public.work_order_status
    when action = 'start' and assignment.status = 'travelling' then 'in_progress'::public.work_order_status
    when action = 'complete' and assignment.status = 'in_progress' then 'completed'::public.work_order_status
    when action = 'resubmit' and target.status = 'correction_required' then 'completed'::public.work_order_status
    when action = 'return' and (assignment.status in ('seen','travelling','in_progress') or target.status='correction_required') then 'returned'::public.work_order_status
    else null
  end;
  if next_status is null then
    raise exception 'Invalid status transition from % with action %', target.status, action using errcode = '23514';
  end if;
  if action = 'return' and btrim(coalesce(reason_code, '')) = '' then
    raise exception 'A return reason is required' using errcode = '23514';
  end if;
  if action in ('complete','resubmit') then
    if exists (
      select 1 from public.work_order_tasks wt
      where wt.tenant_id = target.tenant_id
        and wt.work_order_id = target.id
        and wt.completed_at is null
        and (not wt.is_extra_work or wt.extra_work_status <> 'rejected')
    ) then
      raise exception 'Complete every required task before submitting the work order' using errcode = '23514';
    end if;
    if target.signature_required and not exists (
      select 1 from public.signatures s
      where s.tenant_id = target.tenant_id
        and s.work_order_id = target.id
        and s.report_version = target.report_version
        and s.revoked_at is null
    ) then
      raise exception 'A customer signature is required' using errcode = '23514';
    end if;
    if exists (
      select 1
      from public.work_order_tasks wt
      join public.extra_work_rules rule
        on rule.tenant_id = wt.tenant_id
       and rule.task_revision_id = wt.task_revision_id
       and rule.requires_photo
      where wt.tenant_id = target.tenant_id
        and wt.work_order_id = target.id
        and wt.is_extra_work
        and wt.extra_work_status <> 'rejected'
    ) and not exists (
      select 1 from public.attachments attachment
      where attachment.tenant_id = target.tenant_id
        and attachment.work_order_id = target.id
        and attachment.deleted_at is null
        and attachment.mime_type in ('image/jpeg','image/png','image/webp')
    ) then
      raise exception 'Photo evidence is required for selected extra work' using errcode = '23514';
    end if;
  end if;

  old_projected_end := assignment.projected_end_at;
  if action = 'start' then
    select coalesce(sum(wt.duration_minutes), 0)::integer into duration_minutes
    from public.work_order_tasks wt
    where wt.tenant_id = target.tenant_id
      and wt.work_order_id = target.id
      and (not wt.is_extra_work or wt.extra_work_status in ('awaiting_review','approved'));
    if duration_minutes <= 0 then raise exception 'Work order has no executable tasks' using errcode = '23514'; end if;

    update public.work_order_assignments
    set status = 'in_progress',
        actual_start_at = coalesce(actual_start_at, event_time),
        projected_start_at = coalesce(actual_start_at, event_time),
        projected_end_at = coalesce(actual_start_at, event_time) + make_interval(mins => duration_minutes)
    where id = assignment.id
    returning * into assignment;
    shift_delta := assignment.projected_end_at - old_projected_end;

    update public.work_orders
    set status = next_status,
        actual_start_at = coalesce(actual_start_at, event_time),
        projected_start_at = assignment.projected_start_at,
        projected_end_at = assignment.projected_end_at
    where id = target.id
    returning * into result;
  elsif action = 'complete' then
    update public.work_order_assignments
    set status = 'completed', actual_end_at = coalesce(actual_end_at, event_time), projected_end_at = coalesce(actual_end_at, event_time)
    where id = assignment.id
    returning * into assignment;
    shift_delta := assignment.projected_end_at - old_projected_end;

    update public.time_entries
    set ends_at = event_time
    where tenant_id = target.tenant_id
      and assignment_id = assignment.id
      and kind = 'work'
      and ends_at is null;
    update public.work_orders
    set status = next_status, actual_end_at = coalesce(actual_end_at, event_time), projected_end_at = event_time
    where id = target.id
    returning * into result;
  elsif action = 'resubmit' then
    update public.work_order_assignments
    set status = 'completed'
    where id = assignment.id;
    update public.work_orders
    set status = next_status, attention_reason = null
    where id = target.id
    returning * into result;
  elsif action = 'travel' then
    update public.work_order_assignments
    set status = 'travelling', departed_at = coalesce(departed_at, event_time)
    where id = assignment.id;
    update public.work_orders set status = next_status where id = target.id returning * into result;
  elsif action = 'return' then
    update public.work_order_assignments
    set status = 'returned', return_reason_code = reason_code, return_note = note,
        actual_end_at = case when actual_start_at is not null then event_time else actual_end_at end
    where id = assignment.id;
    update public.time_entries set ends_at = event_time
    where tenant_id = target.tenant_id and assignment_id = assignment.id and ends_at is null;
    update public.work_orders
    set status = next_status, attention_reason = reason_code,
        actual_end_at = case when actual_start_at is not null then event_time else actual_end_at end
    where id = target.id returning * into result;
  else
    update public.work_order_assignments set status = 'seen' where id = assignment.id;
    update public.work_orders set status = next_status where id = target.id returning * into result;
  end if;

  if action in ('start','complete') and shift_delta <> interval '0 seconds' then
    begin
    update public.work_order_assignments future
    set projected_start_at = future.projected_start_at + shift_delta,
        projected_end_at = future.projected_end_at + shift_delta
    where future.tenant_id = target.tenant_id
      and future.personnel_id = assignment.personnel_id
      and future.id <> assignment.id
      and future.status in ('planned','released')
      and future.projected_start_at >= old_projected_end
      and not exists(select 1 from public.work_order_assignments crew where crew.tenant_id=future.tenant_id and crew.work_order_id=future.work_order_id and crew.id<>future.id and crew.status not in ('cancelled','returned'));

    update public.work_orders future_order
    set projected_start_at = future.projected_start_at,
        projected_end_at = future.projected_end_at,
        attention_reason = case
          when future_order.appointment_slot_id is not null
            and future.projected_start_at >= (
              select slot.ends_at
              from public.appointment_slots slot
              where slot.tenant_id = future_order.tenant_id
                and slot.id = future_order.appointment_slot_id
            ) then 'appointment_window_exceeded'
          else future_order.attention_reason
        end
    from public.work_order_assignments future
    where future.tenant_id = target.tenant_id
      and future.personnel_id = assignment.personnel_id
      and future.work_order_id = future_order.id
      and future.id <> assignment.id
      and future.status in ('planned','released')
      and not exists(select 1 from public.work_order_assignments crew where crew.tenant_id=future.tenant_id and crew.work_order_id=future.work_order_id and crew.id<>future.id and crew.status not in ('cancelled','returned'));
    exception when check_violation or exclusion_violation then
      -- Reality must be recordable even when a derived shift cannot be planned.
      update public.work_orders set attention_reason='planning_review_required' where id=target.id;
    end;
  end if;

  if action = 'start' then
    insert into public.time_entries (tenant_id, personnel_id, assignment_id, kind, starts_at)
    values (target.tenant_id, assignment.personnel_id, assignment.id, 'work', event_time);
  end if;

  -- Assignment transitions remain individual; the shared execution is only
  -- finished when every still assigned crew member has finished/returned.
  if action<>'resubmit' then
    update public.work_orders w set
      status=case
        when not exists(select 1 from public.work_order_assignments a where a.tenant_id=w.tenant_id and a.work_order_id=w.id and a.status not in ('cancelled','completed','returned'))
          then case when exists(select 1 from public.work_order_assignments a where a.tenant_id=w.tenant_id and a.work_order_id=w.id and a.status='returned') then 'returned'::public.work_order_status else 'completed'::public.work_order_status end
        when w.actual_start_at is not null then 'in_progress'::public.work_order_status
        when exists(select 1 from public.work_order_assignments a where a.tenant_id=w.tenant_id and a.work_order_id=w.id and a.status='travelling') then 'travelling'::public.work_order_status
        when exists(select 1 from public.work_order_assignments a where a.tenant_id=w.tenant_id and a.work_order_id=w.id and a.status='seen') then 'seen'::public.work_order_status
        else 'released'::public.work_order_status end,
      actual_end_at=case when w.actual_start_at is not null and not exists(select 1 from public.work_order_assignments a where a.tenant_id=w.tenant_id and a.work_order_id=w.id and a.status not in ('cancelled','completed','returned'))
        then (select max(a.actual_end_at) from public.work_order_assignments a where a.tenant_id=w.tenant_id and a.work_order_id=w.id and a.status<>'cancelled') else null end,
      projected_start_at=coalesce((select min(a.projected_start_at) from public.work_order_assignments a where a.tenant_id=w.tenant_id and a.work_order_id=w.id and a.status<>'cancelled'),w.projected_start_at),
      projected_end_at=coalesce((select max(a.projected_end_at) from public.work_order_assignments a where a.tenant_id=w.tenant_id and a.work_order_id=w.id and a.status<>'cancelled'),w.projected_end_at)
    where w.id=target.id returning * into result;
  end if;

  insert into public.status_events (
    tenant_id, work_order_id, assignment_id, actor_user_id, previous_status,
    new_status, reason_code, note, idempotency_key, created_at
  ) values (
    target.tenant_id, target.id, assignment.id, auth.uid(), target.status,
    next_status, reason_code, note, idempotency_key, event_time
  );

  perform private.enqueue_event(
    target.tenant_id,
    'work_order.' || action,
    'work_order',
    target.id,
    jsonb_build_object('work_order_id', target.id, 'status', next_status, 'assignment_id', assignment.id),
    'transition:' || idempotency_key
  );

  insert into public.audit_events (tenant_id, actor_user_id, action, entity_type, entity_id, before_data, after_data)
  values (
    target.tenant_id, auth.uid(), 'work_order.' || action, 'work_order', target.id,
    jsonb_build_object('status', target.status, 'version', target.version),
    jsonb_build_object('status', result.status, 'version', result.version)
  );
  return result;
end;
$function$;

ALTER TABLE "public"."planning_changes"
  ADD CONSTRAINT "planning_changes_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES auth.users(id);

ALTER TABLE "public"."planning_changes"
  ADD CONSTRAINT "planning_changes_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);

ALTER TABLE "public"."planning_changes"
  ADD CONSTRAINT "planning_changes_tenant_id_work_order_id_fkey" FOREIGN KEY (tenant_id, work_order_id) REFERENCES public.work_orders(tenant_id, id);

ALTER TABLE "public"."planning_changes"
  ADD CONSTRAINT "planning_changes_undone_by_fkey" FOREIGN KEY (undone_by) REFERENCES public.planning_changes(id);

ALTER TABLE "public"."work_orders"
  ADD CONSTRAINT "work_orders_customer_window_kind_check" CHECK ((customer_window_kind = ANY (ARRAY['unknown'::text, 'arrival'::text, 'execution'::text])));

ALTER TABLE "public"."work_orders"
  ADD CONSTRAINT "work_orders_day_instructions_check" CHECK ((length(day_instructions) <= 2000));

ALTER TABLE "public"."work_orders"
  ADD CONSTRAINT "work_orders_nullable_planning"
    CHECK
    ((((planned_start_at IS NULL) AND (planned_end_at IS NULL) AND (projected_start_at IS NULL) AND (projected_end_at IS NULL) AND (status = 'planned'::public.work_order_status))
    OR ((planned_start_at IS NOT NULL) AND (planned_end_at IS NOT NULL) AND (projected_start_at IS NOT NULL) AND (projected_end_at IS NOT NULL))));

ALTER TABLE "public"."work_orders"
  ADD CONSTRAINT "work_orders_required_personnel_check" CHECK (((required_personnel >= 1) AND (required_personnel <= 100)));

CREATE INDEX planning_changes_actor_idx ON public.planning_changes USING btree (tenant_id, actor_user_id, created_at DESC);

CREATE INDEX planning_changes_order_idx ON public.planning_changes USING btree (tenant_id, work_order_id, created_at DESC);

CREATE INDEX planning_changes_undo_idx ON public.planning_changes USING btree (undone_by)
  WHERE (undone_by IS NOT NULL);

CREATE INDEX work_orders_requested_date_idx ON public.work_orders USING btree (tenant_id, requested_date)
  WHERE (projected_start_at IS NULL);

CREATE TRIGGER a_planning_assignment_guard
  BEFORE INSERT OR DELETE OR UPDATE ON public.work_order_assignments
  FOR EACH ROW
  EXECUTE FUNCTION private.planning_assignment_guard();

CREATE TRIGGER planning_assignment_version
  AFTER INSERT OR DELETE OR UPDATE ON public.work_order_assignments
  FOR EACH ROW
  EXECUTE FUNCTION private.planning_assignment_version();

CREATE TRIGGER planning_relation_guard
  BEFORE INSERT OR UPDATE OF customer_id, object_id, appointment_slot_id, tenant_id ON public.work_orders
  FOR EACH ROW
  EXECUTE FUNCTION private.planning_relation_guard();

CREATE POLICY "planning_changes_read" ON "public"."planning_changes"
  FOR SELECT
  TO "authenticated"
  USING (((actor_user_id = ( SELECT auth.uid() AS uid)) AND private.planning_access(tenant_id)));

REVOKE ALL ON FUNCTION "private"."planboard_category"(public.work_order_status, timestamp WITH time zone, boolean, integer, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."planboard_category"(public.work_order_status, timestamp WITH time zone, boolean, integer, integer) TO "postgres";

REVOKE ALL ON FUNCTION "private"."planboard_row"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."planboard_row"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."planning_access"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."planning_access"(uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."planning_assignment_guard"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."planning_assignment_guard"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."planning_assignment_version"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."planning_assignment_version"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."planning_relation_guard"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."planning_relation_guard"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."planning_snapshot"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."planning_snapshot"(uuid) TO "postgres";

GRANT EXECUTE
  ON FUNCTION "public"."change_work_order_planning"(uuid, uuid, bigint, uuid, timestamp WITH time zone, timestamp WITH time zone, jsonb, text[], uuid, jsonb)
  TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_planboard"(uuid, date, text, text, text, integer) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_planboard_order"(uuid, uuid) TO "authenticated", "postgres";

REVOKE ALL ON TABLE "public"."planning_changes" FROM "authenticated";

GRANT SELECT ON TABLE "public"."planning_changes" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."planning_changes" TO "postgres";

REVOKE ALL ON TABLE "public"."planning_changes" FROM "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."planning_changes" TO "service_role";

REVOKE ALL ("id") ON TABLE "public"."work_order_assignments" FROM "authenticated";

GRANT INSERT ("id") ON TABLE "public"."work_order_assignments" TO "authenticated";

REVOKE ALL ("personnel_id") ON TABLE "public"."work_order_assignments" FROM "authenticated";

GRANT INSERT ("personnel_id") ON TABLE "public"."work_order_assignments" TO "authenticated";

REVOKE ALL ("planned_end_at") ON TABLE "public"."work_order_assignments" FROM "authenticated";

GRANT INSERT ("planned_end_at") ON TABLE "public"."work_order_assignments" TO "authenticated";

REVOKE ALL ("planned_start_at") ON TABLE "public"."work_order_assignments" FROM "authenticated";

GRANT INSERT ("planned_start_at") ON TABLE "public"."work_order_assignments" TO "authenticated";

REVOKE ALL ("projected_end_at") ON TABLE "public"."work_order_assignments" FROM "authenticated";

GRANT INSERT ("projected_end_at") ON TABLE "public"."work_order_assignments" TO "authenticated";

REVOKE ALL ("projected_start_at") ON TABLE "public"."work_order_assignments" FROM "authenticated";

GRANT INSERT ("projected_start_at") ON TABLE "public"."work_order_assignments" TO "authenticated";

REVOKE ALL ("tenant_id") ON TABLE "public"."work_order_assignments" FROM "authenticated";

GRANT INSERT ("tenant_id") ON TABLE "public"."work_order_assignments" TO "authenticated";

REVOKE ALL ("work_order_id") ON TABLE "public"."work_order_assignments" FROM "authenticated";

GRANT INSERT ("work_order_id") ON TABLE "public"."work_order_assignments" TO "authenticated";

REVOKE ALL ON TABLE "public"."work_order_assignments" FROM "authenticated";

GRANT SELECT ON TABLE "public"."work_order_assignments" TO "authenticated";

REVOKE ALL ON TABLE "public"."work_orders" FROM "authenticated";

GRANT DELETE, INSERT, SELECT ON TABLE "public"."work_orders" TO "authenticated";
