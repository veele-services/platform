-- Live planning is derived from individual execution; time extensions never change prices.
create table private.work_order_time_extensions (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, assignment_id uuid not null,
 minutes integer not null default 15 check(minutes=15), actor_id uuid not null references auth.users(id),
 idempotency_key uuid not null, created_at timestamptz not null default clock_timestamp(),
 unique(tenant_id,idempotency_key), foreign key(tenant_id,assignment_id) references public.work_order_assignments(tenant_id,id) on delete cascade
);
alter table private.work_order_time_extensions enable row level security;
alter table private.work_order_time_extensions force row level security;
revoke all on private.work_order_time_extensions from public,anon,authenticated,service_role;

create or replace function private.assignment_time_budget(t uuid,a uuid) returns integer
language sql stable security definer set search_path='' as $$
 select greatest(1,coalesce((select ceil(sum(x.duration_minutes*x.quantity))::integer from public.work_order_tasks x where x.tenant_id=t and x.work_order_id=aa.work_order_id and(not x.is_extra_work or x.extra_work_status='approved')),ceil(extract(epoch from(aa.planned_end_at-aa.planned_start_at))/60)::integer))
  +coalesce((select sum(e.minutes)::integer from private.work_order_time_extensions e where e.tenant_id=t and e.assignment_id=a),0)
 from public.work_order_assignments aa where aa.tenant_id=t and aa.id=a;
$$;
create or replace function private.assignment_work_minutes(t uuid,a uuid) returns numeric
language sql stable security definer set search_path='' as $$
 select coalesce(sum(greatest(0,extract(epoch from(coalesce(e.ends_at,now())-e.starts_at))/60)),0) from public.time_entries e where e.tenant_id=t and e.assignment_id=a and e.kind='work' and e.status<>'rejected';
$$;
revoke all on function private.assignment_time_budget(uuid,uuid),private.assignment_work_minutes(uuid,uuid) from public,anon,authenticated,service_role;

insert into public.notification_catalog(code,name,description,category,module,status,contexts,channels,default_channels,recipient_description,variables,ttl_minutes)
values('work_order.window_risk','Klantvenster vraagt aandacht','Een medewerker dreigt een klantvenster te missen of de inzet moet opnieuw worden ingepland.','planning','planning','active',array['backoffice'],array['in_app','push','email'],array['in_app'],'Actieve planners en leidinggevenden',array['bedrijfsnaam','bonnummer','datum','locatie'],1440);
insert into private.notification_templates(type_code,context,channel,draft)
select 'work_order.window_risk','backoffice',ch,jsonb_build_object('title','Klantvenster vraagt aandacht','body',case when ch='push' then 'Controleer een urgent planningssignaal bij {bedrijfsnaam}.' else 'Controleer werkbon {bonnummer} bij {locatie}. Het klantvenster dreigt te worden gemist of de inzet is teruggezet naar de planning.' end,'cta_label','Planning bekijken') from unnest(array['in_app','push','email'])ch;
insert into private.notification_template_versions(template_id,revision,definition) select id,1,draft from private.notification_templates where type_code='work_order.window_risk';
update private.notification_templates t set active_version_id=v.id from private.notification_template_versions v where v.template_id=t.id and t.type_code='work_order.window_risk';

create or replace function private.planning_window_signal(t uuid,a uuid,cause text) returns void
language plpgsql security definer set search_path='' as $$
declare w uuid;recipients jsonb;revision text;
begin
 select aa.work_order_id,concat_ws(':',aa.id,s.ends_at,cause) into w,revision from public.work_order_assignments aa join public.work_orders wo on wo.tenant_id=aa.tenant_id and wo.id=aa.work_order_id left join public.appointment_slots s on s.tenant_id=wo.tenant_id and s.id=wo.appointment_slot_id where aa.tenant_id=t and aa.id=a;
 select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'context','backoffice')),'[]') into recipients from public.tenant_memberships m where m.tenant_id=t and m.status='active' and m.roles&&array['tenant_admin','management','planner']::public.app_role[];
 perform private.notification_domain_emit(t,'work_order.window_risk','assignment',a,w,revision,'window-risk:'||revision,recipients,jsonb_build_object('cause',cause));
end;
$$;
revoke all on function private.planning_window_signal(uuid,uuid,text) from public,anon,authenticated,service_role;

create or replace function private.refresh_live_planning(t uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare p record;a record;c record;changes jsonb;next_start timestamptz;next_end timestamptz;previous_end timestamptz;previous_object uuid;travel integer;duration interval;breaks interval;changed integer:=0;at timestamptz:=clock_timestamp();bad boolean;
begin
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||t::text,0));
 -- Only the current execution and its future work are reflowed. Original planned times remain immutable.
 for p in select distinct aa.personnel_id from public.work_order_assignments aa join public.work_orders w on w.tenant_id=aa.tenant_id and w.id=aa.work_order_id where aa.tenant_id=t and w.archive_at is null and w.status<>'cancelled' and aa.actual_start_at is not null and aa.status not in('cancelled','returned') and (aa.actual_end_at is null or aa.actual_end_at>at-interval '1 day') loop
  previous_end:=null;previous_object:=null;changes:='[]';
  for a in select aa.*,w.object_id,w.customer_window_kind,s.starts_at window_start,s.ends_at window_end from public.work_order_assignments aa join public.work_orders w on w.tenant_id=aa.tenant_id and w.id=aa.work_order_id left join public.appointment_slots s on s.tenant_id=w.tenant_id and s.id=w.appointment_slot_id where aa.tenant_id=t and aa.personnel_id=p.personnel_id and aa.status not in('returned','cancelled') and w.archive_at is null and w.status<>'cancelled' and(aa.planned_end_at>at-interval '1 day' or aa.actual_start_at is not null and aa.actual_end_at is null) and aa.planned_start_at<at+interval '2 days' order by coalesce(aa.actual_start_at,aa.planned_start_at),aa.created_at,aa.id loop
   next_start:=a.projected_start_at;next_end:=a.projected_end_at;bad:=false;
   if a.actual_start_at is not null then
    next_start:=a.actual_start_at;
    if a.actual_end_at is not null then next_end:=greatest(a.actual_end_at,next_start+interval '1 second');
    else
     select coalesce(sum(coalesce(e.ends_at,at)-e.starts_at),interval '0') into breaks from public.time_entries e where e.tenant_id=t and e.assignment_id=a.id and e.kind='break' and e.status<>'rejected';
     next_end:=greatest(next_start+make_interval(mins=>private.assignment_time_budget(t,a.id))+breaks,date_trunc('minute',at)+interval '1 minute');
    end if;
   elsif previous_end is not null and a.status in('planned','released','seen') then
    -- Keep a known leg's last measured estimate while recalculation is pending; never invent unknown travel.
    select l.estimated_minutes into travel from public.travel_legs l where l.tenant_id=t and l.assignment_id=a.id and l.direction='before' and l.calculated_at is not null;
    if previous_object=a.object_id then travel:=0;end if;
    duration:=a.planned_end_at-a.planned_start_at;
    next_start:=greatest(a.planned_start_at,a.projected_start_at,previous_end+make_interval(mins=>coalesce(travel,0)+case when travel>0 then 5 else 0 end));
    next_end:=next_start+duration;
    bad:=a.window_end is not null and(next_start>=a.window_end or(a.customer_window_kind='execution' and next_end>a.window_end));
   end if;
   changes:=changes||jsonb_build_array(jsonb_build_object('id',a.id,'start',next_start,'end',next_end,'drop',bad,'order',a.work_order_id));
   if not bad then previous_end:=greatest(previous_end,next_end);previous_object:=a.object_id;end if;
  end loop;
  -- Move later assignments first so normal overlap/availability/qualification guards remain active.
  for c in select value v from jsonb_array_elements(changes) with ordinality x(value,n) order by n desc loop
   if(c.v->>'drop')::boolean then
    update public.work_order_assignments set status='returned',return_reason_code='customer_window_unreachable',return_note='Automatisch teruggezet: klantvenster niet meer haalbaar.' where tenant_id=t and id=(c.v->>'id')::uuid and actual_start_at is null and status in('planned','released','seen');
    update public.dispatches set revoked_at=coalesce(revoked_at,at) where tenant_id=t and assignment_id=(c.v->>'id')::uuid and revoked_at is null;
    perform private.planning_window_signal(t,(c.v->>'id')::uuid,'unreachable');changed:=changed+1;
   else
    begin
     update public.work_order_assignments set projected_start_at=(c.v->>'start')::timestamptz,projected_end_at=(c.v->>'end')::timestamptz where tenant_id=t and id=(c.v->>'id')::uuid and(projected_start_at,projected_end_at) is distinct from((c.v->>'start')::timestamptz,(c.v->>'end')::timestamptz);
     if found then changed:=changed+1;end if;
    exception when check_violation or exclusion_violation then
     -- Record reality; an invalid derived future assignment needs a deliberate planner decision.
     update public.work_order_assignments set status='returned',return_reason_code='reflow_requires_planner',return_note='Automatisch teruggezet: beschikbaarheid of planningsvoorwaarden vragen controle.' where tenant_id=t and id=(c.v->>'id')::uuid and actual_start_at is null and status in('planned','released','seen');
     if found then
      update public.dispatches set revoked_at=coalesce(revoked_at,at) where tenant_id=t and assignment_id=(c.v->>'id')::uuid and revoked_at is null;
      perform private.planning_window_signal(t,(c.v->>'id')::uuid,'replan');changed:=changed+1;
     else raise;end if;
    end;
   end if;
  end loop;
 end loop;
 for a in select aa.id,aa.work_order_id from public.work_order_assignments aa join public.work_orders w on w.tenant_id=aa.tenant_id and w.id=aa.work_order_id join public.appointment_slots s on s.tenant_id=w.tenant_id and s.id=w.appointment_slot_id where aa.tenant_id=t and aa.actual_start_at is null and aa.status in('planned','released','seen') and w.archive_at is null and w.status<>'cancelled' and s.ends_at<=at and s.ends_at>at-interval '1 day' loop
  update public.work_order_assignments set status='returned',return_reason_code='customer_window_unreachable',return_note='Automatisch teruggezet: klantvenster verstreken zonder werkstart.' where tenant_id=t and id=a.id;
  update public.dispatches set revoked_at=coalesce(revoked_at,at) where tenant_id=t and assignment_id=a.id and revoked_at is null;
  perform private.planning_window_signal(t,a.id,'unreachable');changed:=changed+1;
 end loop;
 update public.work_orders w set projected_start_at=coalesce(b.starts,w.planned_start_at),projected_end_at=coalesce(b.ends,w.planned_end_at),attention_reason=case when b.active=0 and w.actual_start_at is null then 'planning_review_required' else w.attention_reason end,status=case when b.active=0 and w.actual_start_at is null then 'planned'::public.work_order_status else w.status end
 from(select aa.work_order_id,min(aa.projected_start_at) filter(where aa.status not in('returned','cancelled')) starts,max(aa.projected_end_at) filter(where aa.status not in('returned','cancelled')) ends,count(*) filter(where aa.status not in('returned','cancelled')) active from public.work_order_assignments aa where aa.tenant_id=t group by aa.work_order_id)b
 where w.tenant_id=t and w.id=b.work_order_id and w.archive_at is null and w.status<>'cancelled' and((w.projected_start_at,w.projected_end_at) is distinct from(coalesce(b.starts,w.planned_start_at),coalesce(b.ends,w.planned_end_at)) or(b.active=0 and w.actual_start_at is null and w.status<>'planned'));
 for a in select aa.id,aa.projected_start_at,s.ends_at,aa.status,l.estimated_minutes from public.work_order_assignments aa join public.work_orders w on w.tenant_id=aa.tenant_id and w.id=aa.work_order_id join public.appointment_slots s on s.tenant_id=w.tenant_id and s.id=w.appointment_slot_id left join public.travel_legs l on l.tenant_id=aa.tenant_id and l.assignment_id=aa.id and l.direction='before' where aa.tenant_id=t and aa.status in('planned','released','seen','travelling') and aa.actual_start_at is null and w.archive_at is null and w.status<>'cancelled' and s.ends_at>at and(s.ends_at<=at+interval '30 minutes' or greatest(at,aa.projected_start_at)+make_interval(mins=>coalesce(l.estimated_minutes,0)+5)>=s.ends_at) loop
  perform private.planning_window_signal(t,a.id,'warning');
 end loop;
 return changed;
end;
$$;
revoke all on function private.refresh_live_planning(uuid) from public,anon,authenticated,service_role;

create or replace function public.extend_staff_work_order(target_work_order uuid,expected_version bigint,idempotency_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w public.work_orders;a public.work_order_assignments;e private.work_order_time_extensions;
begin
 select * into w from public.work_orders where id=target_work_order;
 if not private.work_order_execution_actor(w.tenant_id,w.id,auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid) then raise exception 'Actuele personeelsuitvoering vereist' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||w.tenant_id::text,0));
 select * into w from public.work_orders where id=w.id for update;
 select aa.* into a from public.work_order_assignments aa join public.personnel p on p.tenant_id=aa.tenant_id and p.id=aa.personnel_id where aa.tenant_id=w.tenant_id and aa.work_order_id=w.id and p.user_id=auth.uid() and aa.status not in('returned','cancelled') for update of aa;
 select * into e from private.work_order_time_extensions where tenant_id=w.tenant_id and work_order_time_extensions.idempotency_key=extend_staff_work_order.idempotency_key;
 if e.id is not null then if e.actor_id<>auth.uid() or e.assignment_id<>a.id then raise exception 'Ongeldige herhaalsleutel' using errcode='23514';end if;return jsonb_build_object('minutes',15,'replayed',true);end if;
 if idempotency_key is null or w.version is distinct from expected_version then raise exception 'De werkbon is gewijzigd. Herlaad en probeer opnieuw.' using errcode='40001';end if;
 if a.status<>'in_progress' or a.actual_end_at is not null then raise exception 'Verleng alleen je actieve werkzaamheden' using errcode='23514';end if;
 insert into private.work_order_time_extensions(tenant_id,assignment_id,actor_id,idempotency_key) values(w.tenant_id,a.id,auth.uid(),idempotency_key);
 insert into public.status_events(tenant_id,work_order_id,assignment_id,actor_user_id,previous_status,new_status,reason_code,note,idempotency_key) values(w.tenant_id,w.id,a.id,auth.uid(),w.status,w.status,'time_extended','15 minuten extra werktijd, zonder extra kosten','extension:'||idempotency_key);
 update public.work_orders set version=version+1 where tenant_id=w.tenant_id and id=w.id;
 perform private.refresh_live_planning(w.tenant_id);
 return jsonb_build_object('minutes',15,'replayed',false);
end;
$$;
revoke all on function public.extend_staff_work_order(uuid,bigint,uuid) from public,anon,service_role;
grant execute on function public.extend_staff_work_order(uuid,bigint,uuid) to authenticated;

create or replace function public.process_live_planning() returns integer
language plpgsql security definer set search_path='' as $$
declare t record;changed integer:=0;
begin
 if auth.role()<>'service_role' then raise exception 'Worker vereist' using errcode='42501';end if;
 for t in select id from public.tenants where status='active' loop changed:=changed+private.refresh_live_planning(t.id);end loop;return changed;
end;
$$;
revoke all on function public.process_live_planning() from public,anon,authenticated;
grant execute on function public.process_live_planning() to service_role;
CREATE OR REPLACE FUNCTION private.work_order_transition_legacy(target_work_order_id uuid, action text, expected_version bigint, idempotency_key text, reason_code text DEFAULT NULL::text, note text DEFAULT NULL::text)
 RETURNS work_orders
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
    where e.tenant_id = target.tenant_id and e.idempotency_key = work_order_transition_legacy.idempotency_key
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
$function$
;

CREATE OR REPLACE FUNCTION public.transition_work_order(target_work_order_id uuid, action text, expected_version bigint, idempotency_key text, reason_code text DEFAULT NULL::text, note text DEFAULT NULL::text)
 RETURNS work_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare w public.work_orders;a public.work_order_assignments;e public.status_events;now_at timestamptz:=clock_timestamp();result public.work_orders;
begin
 select * into w from public.work_orders where id=target_work_order_id;
 if not private.work_order_execution_actor(w.tenant_id,w.id,auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid) then raise exception 'Actuele personeelsuitvoering vereist' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||w.tenant_id::text,0));select * into w from public.work_orders where id=w.id for update;
 select aa.* into a from public.work_order_assignments aa join public.personnel p on p.id=aa.personnel_id and p.tenant_id=aa.tenant_id where aa.tenant_id=w.tenant_id and aa.work_order_id=w.id and p.user_id=auth.uid() and aa.status not in ('cancelled','returned') for update of aa;
 select * into e from public.status_events where tenant_id=w.tenant_id and status_events.idempotency_key=transition_work_order.idempotency_key;
 if found then if e.work_order_id<>w.id or e.actor_user_id<>auth.uid() or e.assignment_id<>a.id then raise exception 'Ongeldige herhaalsleutel' using errcode='23514';end if;return private.staff_work_order_result(w);end if;
 if w.version is distinct from expected_version then raise exception 'De uitvoering is gewijzigd. Herlaad en probeer opnieuw.' using errcode='40001';end if;
 if action not in ('stop','pause','resume','complete','resubmit') then
  if action='start' and a.status='seen' then update public.work_order_assignments set status='travelling' where id=a.id;select version into expected_version from public.work_orders where id=w.id;end if;
  result:=private.work_order_transition_legacy(w.id,action,expected_version,idempotency_key,reason_code,note);
  if action='open' then update public.work_order_assignments set seen_at=coalesce(seen_at,now_at) where id=a.id;end if;
  if action='start' then perform private.refresh_live_planning(w.tenant_id);select * into result from public.work_orders where id=w.id;end if;
  return private.staff_work_order_result(result);
 end if;
 if action='resubmit' then
  perform public.submit_work_order_report(w.id,w.version,coalesce(nullif(note,''),'Bijgewerkte taakresultaten en klantzichtbare rapportage'),gen_random_uuid());
  select * into result from public.work_orders where id=w.id;
  insert into public.status_events(tenant_id,work_order_id,assignment_id,actor_user_id,previous_status,new_status,reason_code,note,idempotency_key) values(w.tenant_id,w.id,a.id,auth.uid(),w.status,result.status,action,note,idempotency_key);
  return private.staff_work_order_result(result);
 end if;
 if w.status in ('cancelled','approved','invoice_ready','invoiced') or a.status<>'in_progress' then raise exception 'Deze inzet is niet actief' using errcode='23514';end if;
 if action='pause' and a.paused_at is not null or action='resume' and a.paused_at is null then raise exception 'De pauzestatus is al gewijzigd' using errcode='40001';end if;
 if action='complete' and exists(select 1 from public.work_order_tasks t where t.tenant_id=w.tenant_id and t.work_order_id=w.id and t.completed_at is null and(not t.is_extra_work or t.extra_work_status<>'rejected')) then raise exception 'Leg de verplichte taakresultaten vast, of stop alleen de eigen inzet.' using errcode='23514';end if;
 update public.time_entries set ends_at=now_at where tenant_id=w.tenant_id and assignment_id=a.id and ends_at is null;
 if action='pause' then
  update public.work_order_assignments set paused_at=now_at where id=a.id;
  insert into public.time_entries(tenant_id,personnel_id,assignment_id,kind,starts_at) values(w.tenant_id,a.personnel_id,a.id,'break',now_at);
 elsif action='resume' then
  update public.work_order_assignments set paused_at=null where id=a.id;
  insert into public.time_entries(tenant_id,personnel_id,assignment_id,kind,starts_at) values(w.tenant_id,a.personnel_id,a.id,'work',now_at);
 else
  update public.work_order_assignments set status='completed',paused_at=null,actual_end_at=now_at,projected_start_at=coalesce(actual_start_at,projected_start_at),projected_end_at=greatest(now_at,coalesce(actual_start_at,projected_start_at)+interval '1 second') where id=a.id;
 end if;
 update public.work_orders set status=case when exists(select 1 from public.work_order_assignments aa where aa.tenant_id=w.tenant_id and aa.work_order_id=w.id and aa.status not in ('completed','returned','cancelled')) then 'in_progress'::public.work_order_status else 'completed'::public.work_order_status end,
 actual_end_at=case when not exists(select 1 from public.work_order_assignments aa where aa.tenant_id=w.tenant_id and aa.work_order_id=w.id and aa.status not in ('completed','returned','cancelled')) then now_at else null end where id=w.id returning * into result;
 insert into public.status_events(tenant_id,work_order_id,assignment_id,actor_user_id,previous_status,new_status,reason_code,note,idempotency_key) values(w.tenant_id,w.id,a.id,auth.uid(),w.status,result.status,action,note,idempotency_key);
 perform private.enqueue_event(w.tenant_id,'work_order.'||action,'work_order',w.id,jsonb_build_object('assignment_id',a.id),'transition:'||idempotency_key);
 -- Compatibility for existing clients: their final complete creates a report;
 -- the current app explicitly separates stop from submit.
 if action='complete' and result.status='completed' and private.is_delivery_owner(w.tenant_id,w.id,auth.uid()) then
  perform public.submit_work_order_report(w.id,result.version,coalesce(nullif(note,''),'Uitgevoerde werkzaamheden volgens de vastgelegde taakresultaten'),gen_random_uuid());
  select * into result from public.work_orders where id=w.id;
 end if;
 perform private.refresh_live_planning(w.tenant_id);select * into result from public.work_orders where id=w.id;
 return private.staff_work_order_result(result);
end $function$
;


CREATE OR REPLACE FUNCTION public.get_planboard(target_tenant uuid, target_day date, list_view text DEFAULT 'unassigned'::text, search_text text DEFAULT ''::text, status_filter text DEFAULT ''::text, page_number integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare tz text; ds timestamptz; de timestamptz; orders jsonb; board jsonb; people jsonb; availability_data jsonb; total integer; last_change jsonb;
begin
 if not private.planning_access(target_tenant) then raise exception 'Geen toegang tot planning' using errcode='42501';end if;
 perform private.refresh_live_planning(target_tenant);
 if target_day is null or not isfinite(target_day) or list_view not in ('unassigned','planned','running','completed','cancelled','all') or page_number<1 or page_number>100000 or length(search_text)>200 then raise exception 'Ongeldige planbordfilters' using errcode='23514';end if;
 select timezone into tz from public.tenants where id=target_tenant;
 ds:=target_day::timestamp at time zone tz;de:=(target_day+1)::timestamp at time zone tz;
 with context_orders as materialized(
  select private.planboard_row(w.id) as row from public.work_orders w left join public.appointment_slots s on s.tenant_id=w.tenant_id and s.id=w.appointment_slot_id
  where w.tenant_id=target_tenant and w.archive_at is null and w.planning_state<>'draft' and ((w.projected_start_at<de and w.projected_end_at>ds)
   or(w.projected_start_at is null and w.status='planned' and coalesce(w.requested_date,(s.starts_at at time zone tz)::date,target_day)=target_day))
 ), filtered as materialized(select row from context_orders where (list_view='all' or row->>'category'=list_view) and (status_filter='' or row->>'status'=status_filter)
  and (btrim(search_text)='' or position(lower(btrim(search_text)) in lower(concat_ws(' ',row->>'number',row->>'customer',row->>'object')))>0)),
 paged as(select row from filtered order by case when list_view='unassigned' then case row->>'priority' when 'urgent' then 0 when 'high' then 1 else 2 end end,
 case when list_view='unassigned' then coalesce(row->>'requestedDate',row->>'windowStart',row->>'start') else row->>'start' end nulls last,row->>'id' limit 50 offset (page_number-1)*50)
 select (select count(*) from filtered),coalesce((select jsonb_agg(row) from paged),'[]') into total,orders;
 select coalesce(jsonb_agg(private.planboard_row(w.id) order by w.projected_start_at,w.id),'[]') into board from public.work_orders w where w.tenant_id=target_tenant and w.archive_at is null and w.planning_state<>'draft' and (w.projected_start_at<de and w.projected_end_at>ds or exists(select 1 from public.work_order_assignments a where a.tenant_id=w.tenant_id and a.work_order_id=w.id and a.status not in ('cancelled','returned') and a.projected_start_at<de and a.projected_end_at>ds));
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'number',p.employee_number,'status',p.status) order by p.full_name,p.id),'[]') into people from public.personnel p where p.tenant_id=target_tenant and (p.status='active' or exists(select 1 from public.work_order_assignments a where a.tenant_id=p.tenant_id and a.personnel_id=p.id and a.status not in ('cancelled','returned') and a.projected_start_at<de and a.projected_end_at>ds));
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'personnelId',a.personnel_id,'start',a.starts_at,'end',a.ends_at,'kind',case when a.kind='available' then 'available' else 'unavailable' end)),'[]') into availability_data from public.availability a where a.tenant_id=target_tenant and a.starts_at<de and a.ends_at>ds;
 select jsonb_build_object('id',c.id,'orderId',c.work_order_id,'version',(c.after_data->>'version')::bigint) into last_change from public.planning_changes c join public.work_orders w on w.tenant_id=c.tenant_id and w.id=c.work_order_id
 where c.tenant_id=target_tenant and w.archive_at is null and w.planning_state<>'draft' and c.actor_user_id=auth.uid() and c.undone_by is null and w.version=(c.after_data->>'version')::bigint and w.status in ('planned','released','seen','travelling') and w.actual_start_at is null
 and not exists(select 1 from public.planning_changes newer where newer.tenant_id=c.tenant_id and newer.actor_user_id=c.actor_user_id and newer.created_at>c.created_at) order by c.created_at desc limit 1;
 return jsonb_build_object('day',target_day,'timezone',tz,'board',board,'orders',orders,'total',total,'page',page_number,'people',people,'availability',availability_data,'undo',last_change);
end $function$
;

CREATE OR REPLACE FUNCTION public.get_planboard_order(target_tenant uuid, target_order uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not private.planning_access(target_tenant) or not exists(select 1 from public.work_orders where tenant_id=target_tenant and id=target_order and archive_at is null and planning_state<>'draft') then raise exception 'Werkbon niet beschikbaar' using errcode='42501';end if;
 perform private.refresh_live_planning(target_tenant);
 return private.planboard_row(target_order);
end $function$
;


CREATE OR REPLACE FUNCTION private.planboard_row(w uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object('id',o.id,'number',o.work_order_number,'customerId',o.customer_id,'objectId',o.object_id,'customer',c.name,'object',ob.name,
 'status',o.status,'version',o.version,'start',o.projected_start_at,'end',o.projected_end_at,'actualStart',o.actual_start_at,'actualEnd',o.actual_end_at,
 'requestedDate',o.requested_date,'windowStart',s.starts_at,'windowEnd',s.ends_at,'windowKind',o.customer_window_kind,'requiredPersonnel',o.required_personnel,'discipline',o.discipline,'instructions',o.day_instructions,
 'durationMinutes',case when o.projected_end_at>o.projected_start_at then ceil(extract(epoch from(o.projected_end_at-o.projected_start_at))/60) else (select sum(t.duration_minutes*t.quantity) from public.work_order_tasks t where t.tenant_id=o.tenant_id and t.work_order_id=o.id and (not t.is_extra_work or t.extra_work_status='approved')) end,
 'priority',coalesce(r.priority,'normal'),
 'assignments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'personnelId',a.personnel_id,'start',a.projected_start_at,'end',a.projected_end_at,'status',a.status,'version',a.version,
 'actualStart',a.actual_start_at,'actualEnd',a.actual_end_at,'timeBudgetMinutes',private.assignment_time_budget(a.tenant_id,a.id),'workMinutes',round(private.assignment_work_minutes(a.tenant_id,a.id),1),'overrun',a.status='in_progress' and private.assignment_work_minutes(a.tenant_id,a.id)>private.assignment_time_budget(a.tenant_id,a.id),
 'qualifications',coalesce((select jsonb_agg(jsonb_build_object('code',req.code,'hard',req.hard_requirement)) from private.assignment_requirements(a.tenant_id,a.personnel_id,a.work_order_id,a.projected_start_at,a.projected_end_at)req where not private.qualified_for_period(a.tenant_id,a.personnel_id,req.code,a.projected_start_at,a.projected_end_at)),'[]'),
 'travel',coalesce((select jsonb_agg(jsonb_build_object('direction',l.direction,'minutes',case when l.error_code is null and l.calculated_at is not null then l.estimated_minutes end,'state',case when l.error_code='planning_changed' then 'stale' when l.error_code is not null then 'failed' when l.calculated_at is not null and l.estimated_minutes is not null then 'known' else 'unknown' end)) from public.travel_legs l where l.tenant_id=a.tenant_id and l.assignment_id=a.id),'[]')) order by a.personnel_id)
 from public.work_order_assignments a where a.tenant_id=o.tenant_id and a.work_order_id=o.id and a.status not in ('returned','cancelled')),'[]'),
 'category',private.planboard_category(o.status,o.actual_start_at,o.projected_start_at is not null,(select count(*)::integer from public.work_order_assignments a where a.tenant_id=o.tenant_id and a.work_order_id=o.id and a.status not in ('returned','cancelled')),o.required_personnel))
 from public.work_orders o join public.customers c on c.id=o.customer_id and c.tenant_id=o.tenant_id join public.objects ob on ob.id=o.object_id and ob.tenant_id=o.tenant_id and ob.customer_id=o.customer_id
 left join public.appointment_slots s on s.tenant_id=o.tenant_id and s.id=o.appointment_slot_id left join public.requests r on r.tenant_id=o.tenant_id and r.id=o.request_id where o.id=w;
$function$
;

CREATE OR REPLACE FUNCTION private.notification_domain_source_before_customer_delivery(t uuid, code text, source uuid, revision text, recipient uuid, ctx text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e private.notification_domain_events;w public.work_orders;te public.time_entries;task public.work_order_tasks;
begin
 select * into e from private.notification_domain_events where id=source and tenant_id=t and type_code=code and source_revision=revision;
 if e.entity_kind='customer_planning' then return ctx='customer' and private.notification_domain_customer_planning_allowed(t,e.id,recipient);end if;
 if e.id is null or not private.notification_actor_active(t,ctx,recipient) or not exists(select 1 from jsonb_array_elements(e.recipients)r where r->>'user_id'=recipient::text and r->>'context'=ctx) then return false;end if;
 if e.entity_kind in ('quote','invoice') then return ctx='customer' and private.notification_domain_document_allowed(t,code,e.entity_id,recipient);end if;
 -- Cancellation acknowledges the former assignment; it deliberately does not
 -- confer source access or a work-order link, even if the source was deleted.
 if code='work_order.cancelled' then return true;end if;
 if code='work_order.window_risk' then return ctx='backoffice' and exists(select 1 from public.tenant_memberships m where m.tenant_id=t and m.user_id=recipient and m.status='active' and m.roles&&array['tenant_admin','management','planner']::public.app_role[]) and exists(select 1 from public.work_order_assignments a join public.work_orders wo on wo.tenant_id=a.tenant_id and wo.id=a.work_order_id left join public.appointment_slots s on s.tenant_id=wo.tenant_id and s.id=wo.appointment_slot_id where a.tenant_id=t and a.id=e.entity_id and wo.archive_at is null and wo.status<>'cancelled' and ((a.status='returned' and a.return_reason_code in('customer_window_unreachable','reflow_requires_planner')) or(a.actual_start_at is null and a.status in('planned','released','seen','travelling') and s.ends_at>now() and(s.ends_at<=now()+interval '30 minutes' or greatest(now(),a.projected_start_at)+make_interval(mins=>coalesce((select l.estimated_minutes from public.travel_legs l where l.tenant_id=t and l.assignment_id=a.id and l.direction='before'),0)+5)>=s.ends_at))));end if;
 if e.entity_kind='time_entry' then
  select * into te from public.time_entries where tenant_id=t and id=e.entity_id;if te.id is null or te.status is distinct from e.details->>'state' or exists(select 1 from private.notification_domain_events later where later.tenant_id=t and later.entity_kind='time_entry' and later.entity_id=e.entity_id and later.created_at>e.created_at) then return false;end if;
  return(case when ctx='staff' then exists(select 1 from public.personnel p where p.tenant_id=t and p.id=te.personnel_id and p.user_id=recipient and p.status='active') else exists(select 1 from public.tenant_memberships m where m.tenant_id=t and m.user_id=recipient and m.status='active' and m.roles&&array['tenant_admin','management','hr']::public.app_role[]) end);
 end if;
 select * into w from public.work_orders where tenant_id=t and id=e.work_order_id;
 if w.id is null or w.archive_at is not null or w.status='cancelled' then return false;end if;
 if code='work_order.submitted' and(w.report_state<>'review' or w.report_version::text<>e.source_revision) then return false;end if;
 if code='work_order.signature_required' and(w.report_state<>'waiting_signature' or w.report_version::text<>e.source_revision) then return false;end if;
 if code='work_order.approved' and(w.report_state<>'approved' or w.report_version::text<>e.source_revision) then return false;end if;
 if code='work_order.travelling' and w.status<>'travelling' then return false;end if;
 if code='work_order.started' and w.status<>'in_progress' then return false;end if;
 if e.entity_kind='task' then
  select * into task from public.work_order_tasks where tenant_id=t and id=e.entity_id and work_order_id=w.id;
  if task.id is null or task.extra_work_status is distinct from e.details->>'state' or exists(select 1 from private.notification_domain_events later where later.tenant_id=t and later.entity_kind='task' and later.entity_id=e.entity_id and later.created_at>e.created_at) then return false;end if;
 end if;
 if ctx='backoffice' then return exists(select 1 from public.tenant_memberships m where m.tenant_id=t and m.user_id=recipient and m.status='active' and m.roles&&case when code='work_order.extra_requested' then array['tenant_admin','management','finance']::public.app_role[] else array['tenant_admin','management','planner','finance']::public.app_role[] end);end if;
 if ctx='customer' then return code in ('work_order.travelling','work_order.started') and exists(select 1 from public.object_customer_bindings b where b.tenant_id=t and b.object_id=w.object_id and b.user_id=recipient and b.active);end if;
 return ctx='staff' and exists(select 1 from public.work_order_assignments a join public.personnel p on p.tenant_id=a.tenant_id and p.id=a.personnel_id where a.tenant_id=t and a.work_order_id=w.id and p.user_id=recipient and p.status='active' and a.status not in ('cancelled','returned') and exists(select 1 from public.dispatches d where d.tenant_id=t and d.assignment_id=a.id and d.revoked_at is null));
end$function$
;


CREATE OR REPLACE FUNCTION private.notification_domain_emit(t uuid, code text, entity_kind text, entity_id uuid, wo uuid, revision text, key text, recipients jsonb, details jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare event_id uuid;r jsonb;actor uuid;ctx text;path text;vars jsonb;
begin
 if jsonb_array_length(recipients)=0 then return null;end if;
 insert into private.notification_domain_events(tenant_id,type_code,entity_kind,entity_id,work_order_id,source_revision,dedupe_key,recipients,details) values(t,code,entity_kind,entity_id,wo,revision,key,recipients,details) on conflict do nothing returning id into event_id;
 if event_id is null then return null;end if;
 select jsonb_build_object('bonnummer',w.work_order_number,'datum',to_char(w.planned_start_at at time zone te.timezone,'DD-MM-YYYY'),'locatie',o.name) into vars from public.work_orders w join public.tenants te on te.id=w.tenant_id join public.objects o on o.tenant_id=w.tenant_id and o.id=w.object_id where w.tenant_id=t and w.id=wo;
 for r in select distinct value from jsonb_array_elements(recipients) loop
  actor:=(r->>'user_id')::uuid;ctx:=r->>'context';if not private.notification_actor_active(t,ctx,actor) then continue;end if;
  path:=case when code='work_order.window_risk' then '/app/planning' when code='work_order.cancelled' then case ctx when 'staff' then '/staff/notificaties' when 'customer' then '/klant/notificaties' else '/app/notificaties' end when entity_kind='time_entry' then case when ctx='staff' then '/staff?tab=uren' else '/app/personeel' end when ctx='staff' then '/staff?workOrder='||wo when ctx='backoffice' then '/app/werkbonnen/'||wo else '/klant?object='||(details->>'object_id')||'&order='||wo end;
  perform private.notification_enqueue(t,code,'domain',event_id,revision,case when code='work_order.cancelled' then 'cancellation:'||wo||':'||actor||':'||ctx||':'||pg_current_xact_id()::text else 'domain:'||event_id||':'||actor||':'||ctx end,jsonb_build_object('recipient_user_id',actor,'context',ctx,'channels',array['in_app','push','email'],'path',path,'variables',coalesce(vars,'{}'::jsonb)));
 end loop;return event_id;
end$function$
;

CREATE OR REPLACE FUNCTION public.notification_delivery_prepare(request_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r private.notification_requests;u uuid;c uuid;ctx text;ch text;recipient text;label text;tmpl jsonb;snapshot jsonb;decision jsonb;dev record;n integer:=0;inserted integer;vars jsonb;path text;campaign private.notification_campaigns;bundle integer;pe private.notification_planning_events;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 select * into r from private.notification_requests where id=request_id for update;if not found or r.prepared_at is not null then return 0;end if;
 u:=nullif(r.payload->>'recipient_user_id','')::uuid;c:=nullif(r.payload->>'contact_id','')::uuid;ctx:=r.payload->>'context';
 if ctx is null or ctx not in ('platform','backoffice','staff','customer') or (u is null and c is null) then raise exception 'Ontvanger ontbreekt' using errcode='23514';end if;
 if u is not null then select email,coalesce(raw_user_meta_data->>'full_name','Gebruiker') into recipient,label from auth.users where id=u;else select email,full_name into recipient,label from public.customer_contacts where id=c and tenant_id=r.tenant_id;end if;
 bundle:=private.notification_bundle_seconds(r.tenant_id,r.type_code,ctx);
 if r.source_kind='outbox' and r.type_code='work_order.rescheduled' and bundle>0 then
  select * into pe from private.notification_planning_events where event_id=r.source_id;
  r.available_at:=greatest(r.available_at,pe.created_at+make_interval(secs=>bundle));
  update private.notification_requests set available_at=r.available_at where id=r.id;
  -- Only pending, unadmitted work is folded into the latest employee/order/day.
  -- Sent history and provider-admitted requests are never rewritten or replayed.
  update private.notification_deliveries d set state='cancelled',reason='planning_bundled',lease=null,locked_until=null,revision=d.revision+1 from private.notification_requests older,private.notification_planning_events prior
  where d.request_id=older.id and older.source_kind='outbox' and older.type_code=r.type_code and prior.event_id=older.source_id and prior.tenant_id=pe.tenant_id and prior.work_order_id=pe.work_order_id and prior.planning_day=pe.planning_day and prior.sequence<pe.sequence and d.recipient_user_id=u
  and(d.state in ('queued','deferred','claimed','failed') or(d.state='sending' and not exists(select 1 from private.notification_provider_permits p where p.source_kind='delivery' and p.source_id=d.id and p.state in ('admitted','accepted','uncertain'))));
 end if;
 vars:=coalesce(r.payload->'variables','{}');
 for ch in select jsonb_array_elements_text(coalesce(r.payload->'channels','["in_app"]')) loop
  if ch not in ('in_app','email','push') or (u is null and ch<>'email') then continue;end if;
  decision:=private.notification_policy(r.tenant_id,r.type_code,ctx,ch,u);tmpl:=private.notification_template(r.tenant_id,r.type_code,ctx,ch);
  if r.payload->'suppressed_routes' ? (ctx||':'||ch) then decision:=decision||jsonb_build_object('allowed',false,'reason','disabled_at_enqueue');end if;
  if tmpl is null then tmpl:=jsonb_build_object('title','Nieuwe melding','body','Er staat een update klaar in de beveiligde omgeving.','cta_label','Bekijken','revision',1,'branding',jsonb_build_object('company',(select name from public.tenants where id=r.tenant_id),'primary','#222C35','accent','#41AC42'));end if;
  if ctx='platform' or coalesce((r.payload->>'platform_brand')::boolean,false) or r.type_code='manual.platform' then tmpl:=coalesce(private.notification_template(null,r.type_code,ctx,ch),tmpl);tmpl:=jsonb_set(tmpl,'{branding}',jsonb_build_object('company','Fieldgrid','primary','#222C35','accent','#41AC42'));end if;
  vars:=jsonb_build_object('bedrijfsnaam',tmpl#>>'{branding,company}')||vars;
  path:=coalesce(r.payload->>'path',case ctx when 'platform' then '/platform/notificaties' when 'backoffice' then '/app/notificaties' when 'customer' then '/klant/notificaties' else '/staff/notificaties' end);
  if path !~ ('^'||case ctx when 'platform' then '/platform' when 'backoffice' then '/app' when 'customer' then '/klant' else '/staff' end||'([/?]|$)') or path ~ '[\\[:cntrl:]]' then raise exception 'Ongeldige notificatieroute' using errcode='23514';end if;
  if r.source_kind='campaign' then select x.* into campaign from private.notification_campaigns x join private.notification_campaign_recipients cr on cr.campaign_id=x.id where cr.id=r.source_id;end if;
  snapshot:=jsonb_build_object('title',coalesce(campaign.title,private.notification_text(tmpl->>'title',vars)),'body',coalesce(campaign.body,private.notification_text(tmpl->>'body',vars)),'actionLabel',coalesce(campaign.action_label,tmpl->>'cta_label','Bekijken'),'path',path,'recipient',recipient,'recipientLabel',label,'templateVersion',coalesce((tmpl->>'revision')::bigint,1),'templateVersionId',tmpl->>'version_id','brand',tmpl->'branding','priority',case when r.type_code='work_order.window_risk' then 'urgent' else coalesce(campaign.priority,'normal') end,'ackRequired',coalesce(campaign.ack_required,false),'campaignId',campaign.id,'slug',(select slug from public.tenants where id=r.tenant_id),'ttlSeconds',least(2419200,(select ttl_minutes*60 from public.notification_catalog where code=r.type_code)));
  if ch='push' then
   -- Lockscreens use only the published channel template and public branding;
   -- never campaign prose or source-record variables from the full inbox item.
   snapshot:=snapshot||jsonb_build_object('pushTitle',private.notification_text(tmpl->>'title',jsonb_build_object('bedrijfsnaam',tmpl#>>'{branding,company}')),'pushBody',private.notification_text(tmpl->>'body',jsonb_build_object('bedrijfsnaam',tmpl#>>'{branding,company}')),'pushTemplateWarning',tmpl->>'warning');
  end if;
  -- An immutable snapshot is created even for suppressed work; OFF cannot later
  -- resurrect an envelope that was scheduled while disabled.
  for dev in select id,generation from private.notification_devices d where ch='push' and private.notification_device_live(d.id,d.generation,r.tenant_id,ctx,u)
   union all select null::uuid,null::bigint where ch<>'push' or not exists(select 1 from private.notification_devices d where private.notification_device_live(d.id,d.generation,r.tenant_id,ctx,u)) loop
   insert into private.notification_deliveries(request_id,tenant_id,recipient_user_id,contact_id,recipient_key,context,channel,device_id,device_generation,snapshot,state,reason,policy_revision,available_at,expires_at)
   values(r.id,r.tenant_id,u,c,coalesce(u,c)::text,ctx,ch,dev.id,dev.generation,snapshot,
   case when r.expires_at<=now() then 'expired' when not coalesce((decision->>'allowed')::boolean,false) then 'suppressed' when ch='push' and dev.id is null then 'cancelled' when campaign.state='paused' then 'deferred' when not private.notification_source_allowed(r.tenant_id,r.type_code,r.source_kind,r.source_id,r.source_revision,u,ctx) or not private.notification_planning_current(r.id,u) then 'cancelled' when decision->>'quiet_until' is not null then 'deferred' else 'queued' end,
   case when ch='push' and dev.id is null then 'no_active_device' else decision->>'reason' end,coalesce((decision->>'policy_revision')::bigint,1),greatest(r.available_at,coalesce((decision->>'quiet_until')::timestamptz,r.available_at)),r.expires_at) on conflict do nothing;
   get diagnostics inserted=row_count;n:=n+inserted;
  end loop;
 end loop;
 update private.notification_requests set prepared_at=now() where id=r.id;
 if r.source_kind='campaign' then perform private.notification_campaign_delivery_sync(campaign.id);end if;
 return n;
end$function$
;
