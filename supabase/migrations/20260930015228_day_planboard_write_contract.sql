SET local check_function_bodies = off;

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
 if expected_version is null or expected_version<1 or mutation_id is null then raise exception 'Een geldige wijzigingsversie en wijzigingssleutel zijn verplicht' using errcode='23514';end if;
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
