-- Reflow updates affected orders only; reading an unrelated dossier preserves its deliberate planning.
create or replace function private.refresh_live_planning(t uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare p record;a record;c record;changes jsonb;next_start timestamptz;next_end timestamptz;previous_end timestamptz;previous_object uuid;travel integer;duration interval;breaks interval;changed integer:=0;at timestamptz:=clock_timestamp();bad boolean;affected uuid[]:=array[]::uuid[];
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
    perform private.planning_window_signal(t,(c.v->>'id')::uuid,'unreachable');changed:=changed+1;affected:=array_append(affected,(c.v->>'order')::uuid);
   else
    begin
     update public.work_order_assignments set projected_start_at=(c.v->>'start')::timestamptz,projected_end_at=(c.v->>'end')::timestamptz where tenant_id=t and id=(c.v->>'id')::uuid and(projected_start_at,projected_end_at) is distinct from((c.v->>'start')::timestamptz,(c.v->>'end')::timestamptz);
     if found then changed:=changed+1;affected:=array_append(affected,(c.v->>'order')::uuid);end if;
    exception when check_violation or exclusion_violation then
     -- Record reality; an invalid derived future assignment needs a deliberate planner decision.
     update public.work_order_assignments set status='returned',return_reason_code='reflow_requires_planner',return_note='Automatisch teruggezet: beschikbaarheid of planningsvoorwaarden vragen controle.' where tenant_id=t and id=(c.v->>'id')::uuid and actual_start_at is null and status in('planned','released','seen');
     if found then
      update public.dispatches set revoked_at=coalesce(revoked_at,at) where tenant_id=t and assignment_id=(c.v->>'id')::uuid and revoked_at is null;
      perform private.planning_window_signal(t,(c.v->>'id')::uuid,'replan');changed:=changed+1;affected:=array_append(affected,(c.v->>'order')::uuid);
     else raise;end if;
    end;
   end if;
  end loop;
 end loop;
 for a in select aa.id,aa.work_order_id from public.work_order_assignments aa join public.work_orders w on w.tenant_id=aa.tenant_id and w.id=aa.work_order_id join public.appointment_slots s on s.tenant_id=w.tenant_id and s.id=w.appointment_slot_id where aa.tenant_id=t and aa.actual_start_at is null and aa.status in('planned','released','seen') and w.archive_at is null and w.status<>'cancelled' and s.ends_at<=at and s.ends_at>at-interval '1 day' loop
  update public.work_order_assignments set status='returned',return_reason_code='customer_window_unreachable',return_note='Automatisch teruggezet: klantvenster verstreken zonder werkstart.' where tenant_id=t and id=a.id;
  update public.dispatches set revoked_at=coalesce(revoked_at,at) where tenant_id=t and assignment_id=a.id and revoked_at is null;
  perform private.planning_window_signal(t,a.id,'unreachable');changed:=changed+1;affected:=array_append(affected,a.work_order_id);
 end loop;
 update public.work_orders w set projected_start_at=coalesce(b.starts,w.planned_start_at),projected_end_at=coalesce(b.ends,w.planned_end_at),attention_reason=case when b.active=0 and w.actual_start_at is null then 'planning_review_required' else w.attention_reason end,status=case when b.active=0 and w.actual_start_at is null then 'planned'::public.work_order_status else w.status end
 from(select aa.work_order_id,min(aa.projected_start_at) filter(where aa.status not in('returned','cancelled')) starts,max(aa.projected_end_at) filter(where aa.status not in('returned','cancelled')) ends,count(*) filter(where aa.status not in('returned','cancelled')) active from public.work_order_assignments aa where aa.tenant_id=t group by aa.work_order_id)b
 where w.tenant_id=t and w.id=b.work_order_id and(w.id=any(affected) or w.actual_start_at is not null or b.active=0) and w.archive_at is null and w.status<>'cancelled' and((w.projected_start_at,w.projected_end_at) is distinct from(coalesce(b.starts,w.planned_start_at),coalesce(b.ends,w.planned_end_at)) or(b.active=0 and w.actual_start_at is null and w.status<>'planned'));
 for a in select aa.id,aa.projected_start_at,s.ends_at,aa.status,l.estimated_minutes from public.work_order_assignments aa join public.work_orders w on w.tenant_id=aa.tenant_id and w.id=aa.work_order_id join public.appointment_slots s on s.tenant_id=w.tenant_id and s.id=w.appointment_slot_id left join public.travel_legs l on l.tenant_id=aa.tenant_id and l.assignment_id=aa.id and l.direction='before' where aa.tenant_id=t and aa.status in('planned','released','seen','travelling') and aa.actual_start_at is null and w.archive_at is null and w.status<>'cancelled' and s.ends_at>at and(s.ends_at<=at+interval '30 minutes' or greatest(at,aa.projected_start_at)+make_interval(mins=>coalesce(l.estimated_minutes,0)+5)>=s.ends_at) loop
  perform private.planning_window_signal(t,a.id,'warning');
 end loop;
 return changed;
end;
$$;
revoke all on function private.refresh_live_planning(uuid) from public,anon,authenticated,service_role;

