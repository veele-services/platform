-- Transactional domain commands. Each public command fixes search_path,
-- performs its own actor/tenant check, and has an explicit EXECUTE grant.

create or replace function public.provision_tenant(
  tenant_name text,
  tenant_slug text,
  owner_user_id uuid,
  actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_tenant_id uuid;
begin
  if not exists (select 1 from public.platform_admins pa where pa.user_id = actor_user_id) then
    raise exception 'Platform administrator required' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users u where u.id = owner_user_id) then
    raise exception 'Owner user does not exist' using errcode = '23503';
  end if;

  insert into public.tenants (name, slug)
  values (btrim(tenant_name), lower(btrim(tenant_slug)))
  returning id into new_tenant_id;

  insert into public.tenant_settings (tenant_id) values (new_tenant_id);
  insert into public.tenant_branding (tenant_id, sender_name) values (new_tenant_id, btrim(tenant_name));
  insert into public.invoice_sequences (tenant_id, year, last_number)
  values (new_tenant_id, extract(year from current_date)::integer, 0);
  insert into public.tenant_memberships (tenant_id, user_id, roles, status, activated_at)
  values (
    new_tenant_id,
    owner_user_id,
    array['tenant_admin','management']::public.app_role[],
    'active',
    clock_timestamp()
  );
  insert into public.audit_events (tenant_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (
    new_tenant_id,
    actor_user_id,
    'tenant.provisioned',
    'tenant',
    new_tenant_id,
    jsonb_build_object('name', btrim(tenant_name), 'slug', lower(btrim(tenant_slug)), 'owner_user_id', owner_user_id)
  );
  return new_tenant_id;
end;
$$;

revoke execute on function public.provision_tenant(text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.provision_tenant(text, text, uuid, uuid) to service_role;

create or replace function public.resolve_tenant_context(requested_tenant_id uuid default null, requested_host text default null)
returns table (
  tenant_id uuid,
  tenant_slug text,
  tenant_name text,
  roles public.app_role[],
  timezone text,
  primary_color text,
  accent_color text,
  logo_path text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    t.id,
    t.slug,
    t.name,
    tm.roles,
    t.timezone,
    b.primary_color,
    b.accent_color,
    b.logo_path
  from public.tenants t
  join public.tenant_memberships tm
    on tm.tenant_id = t.id
   and tm.user_id = (select auth.uid())
   and tm.status = 'active'
  join public.tenant_branding b on b.tenant_id = t.id
  left join public.tenant_domains d
    on d.tenant_id = t.id
   and d.verified_at is not null
   and lower(d.host) = lower(requested_host)
  where t.status = 'active'
    and (requested_tenant_id is null or t.id = requested_tenant_id)
    and (requested_host is null or d.id is not null)
  order by t.created_at
  limit 1;
$$;

revoke execute on function public.resolve_tenant_context(uuid, text) from public, anon;
grant execute on function public.resolve_tenant_context(uuid, text) to authenticated;

create or replace function private.enqueue_event(
  target_tenant_id uuid,
  target_event_type text,
  target_aggregate_type text,
  target_aggregate_id uuid,
  target_payload jsonb,
  target_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_id uuid;
begin
  insert into public.outbox_events (
    tenant_id, event_type, aggregate_type, aggregate_id, payload, idempotency_key
  ) values (
    target_tenant_id, target_event_type, target_aggregate_type, target_aggregate_id,
    target_payload, target_idempotency_key
  )
  on conflict (tenant_id, idempotency_key) do update
    set idempotency_key = excluded.idempotency_key
  returning id into event_id;
  return event_id;
end;
$$;
revoke all on function private.enqueue_event(uuid, text, text, uuid, jsonb, text) from public, anon, authenticated;

create or replace function public.dispatch_work_order(
  target_work_order_id uuid,
  target_personnel_id uuid,
  expected_version bigint,
  idempotency_key text
)
returns public.work_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.work_orders;
  assignment public.work_order_assignments;
  result public.work_orders;
begin
  select * into target from public.work_orders w where w.id = target_work_order_id for update;
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

  insert into public.dispatches (tenant_id, work_order_id, assignment_id, dispatched_by, idempotency_key)
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
$$;
revoke execute on function public.dispatch_work_order(uuid, uuid, bigint, text) from public, anon;
grant execute on function public.dispatch_work_order(uuid, uuid, bigint, text) to authenticated;

create or replace function public.transition_work_order(
  target_work_order_id uuid,
  action text,
  expected_version bigint,
  idempotency_key text,
  reason_code text default null,
  note text default null
)
returns public.work_orders
language plpgsql
security definer
set search_path = ''
as $$
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
  select * into target from public.work_orders w where w.id = target_work_order_id for update;
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

  next_status := case
    when action = 'open' and target.status = 'released' then 'seen'::public.work_order_status
    when action = 'travel' and target.status = 'seen' then 'travelling'::public.work_order_status
    when action = 'start' and target.status = 'travelling' then 'in_progress'::public.work_order_status
    when action = 'complete' and target.status = 'in_progress' then 'completed'::public.work_order_status
    when action = 'resubmit' and target.status = 'correction_required' then 'completed'::public.work_order_status
    when action = 'return' and target.status in ('seen','travelling','in_progress','correction_required') then 'returned'::public.work_order_status
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
    update public.work_order_assignments future
    set projected_start_at = future.projected_start_at + shift_delta,
        projected_end_at = future.projected_end_at + shift_delta
    where future.tenant_id = target.tenant_id
      and future.personnel_id = assignment.personnel_id
      and future.id <> assignment.id
      and future.status in ('planned','released')
      and future.projected_start_at >= old_projected_end;

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
      and future.status in ('planned','released');
  end if;

  if action = 'start' then
    insert into public.time_entries (tenant_id, personnel_id, assignment_id, kind, starts_at)
    values (target.tenant_id, assignment.personnel_id, assignment.id, 'work', event_time);
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
$$;
revoke execute on function public.transition_work_order(uuid, text, bigint, text, text, text) from public, anon;
grant execute on function public.transition_work_order(uuid, text, bigint, text, text, text) to authenticated;

create or replace function public.complete_work_order_task(
  target_task_id uuid,
  completed boolean,
  completion_note text default null
)
returns public.work_order_tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.work_order_tasks;
  result public.work_order_tasks;
begin
  select * into target from public.work_order_tasks wt where wt.id = target_task_id for update;
  if not found then raise exception 'Task not found' using errcode = 'P0002'; end if;
  if not private.is_work_order_assignee(target.tenant_id, target.work_order_id) then
    raise exception 'Work order assignment required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.work_orders w where w.id = target.work_order_id and w.status in ('in_progress','correction_required')
  ) then
    raise exception 'Tasks can only be changed during execution or correction' using errcode = '23514';
  end if;
  update public.work_order_tasks
  set completed_at = case when completed then clock_timestamp() else null end,
      completion_note = complete_work_order_task.completion_note
  where id = target.id
  returning * into result;
  return result;
end;
$$;
revoke execute on function public.complete_work_order_task(uuid, boolean, text) from public, anon;
grant execute on function public.complete_work_order_task(uuid, boolean, text) to authenticated;

create or replace function public.add_extra_work(
  target_work_order_id uuid,
  target_extra_work_rule_id uuid,
  idempotency_key text
)
returns public.work_order_tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order public.work_orders;
  rule record;
  result public.work_order_tasks;
begin
  select * into target_order from public.work_orders w where w.id = target_work_order_id for update;
  if not found then raise exception 'Work order not found' using errcode = 'P0002'; end if;
  if target_order.status <> 'in_progress' then raise exception 'Extra work requires an active work order' using errcode = '23514'; end if;
  if not private.is_work_order_assignee(target_order.tenant_id, target_order.id) then
    raise exception 'Work order assignment required' using errcode = '42501';
  end if;
  select
    tr.id as task_revision_id,
    tc.code,
    tc.name,
    tr.duration_minutes,
    tr.price_cents,
    tr.vat_basis_points,
    tr.unit
  into rule
  from public.work_order_allowed_extra_work allowed
  join public.extra_work_rules ewr on ewr.tenant_id = allowed.tenant_id and ewr.id = allowed.extra_work_rule_id and ewr.active
  join public.task_revisions tr on tr.tenant_id = ewr.tenant_id and tr.id = ewr.task_revision_id
  join public.task_catalog tc on tc.tenant_id = tr.tenant_id and tc.id = tr.task_id and tc.active
  where allowed.tenant_id = target_order.tenant_id
    and allowed.work_order_id = target_order.id
    and allowed.extra_work_rule_id = target_extra_work_rule_id;
  if not found then raise exception 'This extra work option is not allowed for the work order' using errcode = '42501'; end if;

  if exists (
    select 1 from public.audit_events a
    where a.tenant_id = target_order.tenant_id
      and a.request_id = add_extra_work.idempotency_key
  ) then
    select wt.* into result from public.work_order_tasks wt
    where wt.tenant_id = target_order.tenant_id
      and wt.work_order_id = target_order.id
      and wt.task_revision_id = rule.task_revision_id
      and wt.is_extra_work
    order by wt.created_at desc limit 1;
    return result;
  end if;

  insert into public.work_order_tasks (
    tenant_id, work_order_id, task_revision_id, task_code, task_name,
    duration_minutes, unit, unit_price_cents, vat_basis_points,
    is_extra_work, extra_work_status, added_by
  ) values (
    target_order.tenant_id, target_order.id, rule.task_revision_id, rule.code, rule.name,
    rule.duration_minutes, rule.unit, rule.price_cents, rule.vat_basis_points,
    true, 'awaiting_review', auth.uid()
  ) returning * into result;

  update public.work_orders
  set projected_end_at = projected_end_at + make_interval(mins => rule.duration_minutes)
  where id = target_order.id;
  update public.work_order_assignments
  set projected_end_at = projected_end_at + make_interval(mins => rule.duration_minutes)
  where tenant_id = target_order.tenant_id and work_order_id = target_order.id and status = 'in_progress';

  insert into public.audit_events (tenant_id, actor_user_id, action, entity_type, entity_id, after_data, request_id)
  values (
    target_order.tenant_id, auth.uid(), 'work_order.extra_work_added', 'work_order_task', result.id,
    jsonb_build_object('task_code', result.task_code, 'duration_minutes', result.duration_minutes, 'price_cents', result.unit_price_cents),
    idempotency_key
  );
  perform private.enqueue_event(
    target_order.tenant_id, 'work_order.extra_work_added', 'work_order', target_order.id,
    jsonb_build_object('work_order_id', target_order.id, 'task_id', result.id),
    'extra:' || idempotency_key
  );
  return result;
end;
$$;
revoke execute on function public.add_extra_work(uuid, uuid, text) from public, anon;
grant execute on function public.add_extra_work(uuid, uuid, text) to authenticated;

create or replace function public.review_work_order(
  target_work_order_id uuid,
  decision text,
  reason text default null
)
returns public.work_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.work_orders;
  result public.work_orders;
  next_status public.work_order_status;
begin
  select * into target from public.work_orders w where w.id = target_work_order_id for update;
  if not found then raise exception 'Work order not found' using errcode = 'P0002'; end if;
  if not private.has_role(target.tenant_id, array['tenant_admin','management','finance']::public.app_role[]) then
    raise exception 'Review role required' using errcode = '42501';
  end if;
  if target.status not in ('completed','under_review','correction_required') then
    raise exception 'Work order is not ready for review' using errcode = '23514';
  end if;
  if decision = 'returned' and btrim(coalesce(reason, '')) = '' then
    raise exception 'A return reason is required' using errcode = '23514';
  elsif decision not in ('approved','returned') then
    raise exception 'Unknown review decision' using errcode = '23514';
  end if;
  next_status := case
    when decision = 'approved' then 'invoice_ready'::public.work_order_status
    else 'correction_required'::public.work_order_status
  end;

  insert into public.review_decisions (tenant_id, work_order_id, report_version, decision, reason, decided_by)
  values (target.tenant_id, target.id, target.report_version, decision, reason, auth.uid())
  on conflict (tenant_id, work_order_id, report_version) do update
    set decision = excluded.decision, reason = excluded.reason, decided_by = excluded.decided_by, created_at = clock_timestamp();

  update public.work_orders
  set status = next_status,
      report_version = case when decision = 'returned' then report_version + 1 else report_version end,
      attention_reason = case when decision = 'returned' then reason else null end
  where id = target.id
  returning * into result;
  perform private.enqueue_event(
    target.tenant_id, 'work_order.reviewed', 'work_order', target.id,
    jsonb_build_object('work_order_id', target.id, 'decision', decision, 'reason', reason),
    'review:' || target.id::text || ':' || target.report_version::text || ':' || decision
  );
  return result;
end;
$$;
revoke execute on function public.review_work_order(uuid, text, text) from public, anon;
grant execute on function public.review_work_order(uuid, text, text) to authenticated;

create or replace function public.finalize_invoice(target_invoice_id uuid)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.invoices;
  seq public.invoice_sequences;
  prefix text;
  next_number bigint;
  result public.invoices;
  lines jsonb;
  customer_data jsonb;
  branding_data jsonb;
  calculated_subtotal bigint;
  calculated_vat bigint;
  calculated_total bigint;
begin
  select * into target from public.invoices i where i.id = target_invoice_id for update;
  if not found then raise exception 'Invoice not found' using errcode = 'P0002'; end if;
  if not private.has_role(target.tenant_id, array['tenant_admin','management','finance']::public.app_role[]) then
    raise exception 'Finance role required' using errcode = '42501';
  end if;
  if target.status <> 'draft' then return target; end if;
  if not exists (select 1 from public.invoice_lines l where l.tenant_id = target.tenant_id and l.invoice_id = target.id) then
    raise exception 'Invoice must contain at least one line' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.invoice_lines l
    join public.work_orders w on w.tenant_id = l.tenant_id and w.id = l.work_order_id
    where l.tenant_id = target.tenant_id and l.invoice_id = target.id
      and (w.customer_id <> target.customer_id or w.status <> 'invoice_ready')
  ) then
    raise exception 'All source work orders must be approved and belong to the invoice customer' using errcode = '23514';
  end if;

  select
    coalesce(sum(l.subtotal_cents),0)::bigint,
    coalesce(sum(l.vat_cents),0)::bigint,
    coalesce(sum(l.total_cents),0)::bigint,
    jsonb_agg(to_jsonb(l) - 'id' - 'tenant_id' - 'invoice_id' order by l.created_at, l.id)
  into calculated_subtotal, calculated_vat, calculated_total, lines
  from public.invoice_lines l
  where l.tenant_id = target.tenant_id and l.invoice_id = target.id;

  select to_jsonb(c) - 'id' - 'tenant_id' - 'created_at' - 'updated_at' - 'version'
  into customer_data from public.customers c where c.tenant_id = target.tenant_id and c.id = target.customer_id;
  select jsonb_build_object(
    'tenant_name', t.name,
    'primary_color', b.primary_color,
    'accent_color', b.accent_color,
    'surface_color', b.surface_color,
    'logo_path', b.logo_path,
    'sender_name', b.sender_name,
    'sender_email', b.sender_email,
    'pdf_footer', b.pdf_footer
  ) into branding_data
  from public.tenants t join public.tenant_branding b on b.tenant_id = t.id
  where t.id = target.tenant_id;

  insert into public.invoice_sequences (tenant_id, year, last_number)
  values (target.tenant_id, extract(year from current_date)::integer, 0)
  on conflict (tenant_id) do nothing;
  select * into seq from public.invoice_sequences s where s.tenant_id = target.tenant_id for update;
  if seq.year <> extract(year from current_date)::integer then
    update public.invoice_sequences set year = extract(year from current_date)::integer, last_number = 0
    where tenant_id = target.tenant_id returning * into seq;
  end if;
  next_number := seq.last_number + 1;
  update public.invoice_sequences set last_number = next_number where tenant_id = target.tenant_id;
  select invoice_prefix into prefix from public.tenant_settings where tenant_id = target.tenant_id;

  update public.invoices
  set invoice_number = prefix || '-' || extract(year from current_date)::integer::text || '-' || lpad(next_number::text, 6, '0'),
      status = 'final', issued_on = current_date,
      due_on = current_date + coalesce((select payment_terms_days from public.tenant_settings where tenant_id = target.tenant_id), 14),
      subtotal_cents = calculated_subtotal, vat_cents = calculated_vat, total_cents = calculated_total,
      customer_snapshot = customer_data, branding_snapshot = branding_data, lines_snapshot = lines,
      finalized_at = clock_timestamp()
  where id = target.id returning * into result;

  update public.work_orders w set status = 'invoiced'
  where w.tenant_id = target.tenant_id
    and w.id in (
      select l.work_order_id from public.invoice_lines l
      where l.tenant_id = target.tenant_id and l.invoice_id = target.id and l.work_order_id is not null
    );
  insert into public.audit_events (tenant_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (target.tenant_id, auth.uid(), 'invoice.finalized', 'invoice', target.id, jsonb_build_object('invoice_number', result.invoice_number, 'total_cents', result.total_cents));
  perform private.enqueue_event(
    target.tenant_id, 'invoice.finalized', 'invoice', target.id,
    jsonb_build_object('invoice_id', target.id, 'invoice_number', result.invoice_number),
    'invoice-final:' || target.id::text
  );
  return result;
end;
$$;
revoke execute on function public.finalize_invoice(uuid) from public, anon;
grant execute on function public.finalize_invoice(uuid) to authenticated;

create or replace function public.attach_invoice_pdf(target_invoice_id uuid, storage_path text, sha256 text)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.invoices;
begin
  select * into target from public.invoices i where i.id = target_invoice_id for update;
  if not found then raise exception 'Invoice not found' using errcode = 'P0002'; end if;
  if not private.has_role(target.tenant_id, array['tenant_admin','management','finance']::public.app_role[]) then
    raise exception 'Finance role required' using errcode = '42501';
  end if;
  if target.status = 'draft' then raise exception 'Finalize invoice before attaching its PDF' using errcode = '23514'; end if;
  if sha256 !~ '^[0-9a-f]{64}$' then raise exception 'Invalid SHA-256 digest' using errcode = '23514'; end if;
  if target.pdf_sha256 is not null and target.pdf_sha256 <> sha256 then
    raise exception 'A finalized invoice PDF cannot be replaced silently' using errcode = '23514';
  end if;
  update public.invoices set pdf_storage_path = storage_path, pdf_sha256 = sha256 where id = target.id returning * into target;
  return target;
end;
$$;
revoke execute on function public.attach_invoice_pdf(uuid, text, text) from public, anon;
grant execute on function public.attach_invoice_pdf(uuid, text, text) to authenticated;

create or replace function public.register_manual_payment(
  target_tenant_id uuid,
  payment_date timestamptz,
  reference text,
  allocations jsonb,
  idempotency_key text
)
returns public.payment_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  allocation jsonb;
  invoice_id uuid;
  allocation_amount bigint;
  total_amount bigint := 0;
  attempt public.payment_attempts;
begin
  if not private.has_role(target_tenant_id, array['tenant_admin','management','finance']::public.app_role[]) then
    raise exception 'Finance role required' using errcode = '42501';
  end if;
  if jsonb_typeof(allocations) <> 'array' or jsonb_array_length(allocations) = 0 then
    raise exception 'At least one payment allocation is required' using errcode = '23514';
  end if;
  if exists (select 1 from public.payment_attempts p where p.tenant_id = target_tenant_id and p.idempotency_key = register_manual_payment.idempotency_key) then
    select * into attempt from public.payment_attempts p where p.tenant_id = target_tenant_id and p.idempotency_key = register_manual_payment.idempotency_key;
    return attempt;
  end if;

  -- Deterministic ordering prevents deadlocks when two multi-invoice payments race.
  perform 1
  from public.invoices i
  join (
    select (value->>'invoice_id')::uuid as id
    from jsonb_array_elements(allocations)
  ) requested on requested.id = i.id
  where i.tenant_id = target_tenant_id
  order by i.id
  for update of i;

  for allocation in select value from jsonb_array_elements(allocations)
  loop
    invoice_id := (allocation->>'invoice_id')::uuid;
    allocation_amount := (allocation->>'amount_cents')::bigint;
    if allocation_amount <= 0 then raise exception 'Allocation amount must be positive' using errcode = '23514'; end if;
    if not exists (
      select 1 from public.invoices i
      where i.tenant_id = target_tenant_id and i.id = invoice_id
        and i.status not in ('draft','credited','void')
        and i.total_cents - i.paid_cents >= allocation_amount
    ) then
      raise exception 'Invalid or excessive allocation for invoice %', invoice_id using errcode = '23514';
    end if;
    total_amount := total_amount + allocation_amount;
  end loop;

  insert into public.payment_attempts (
    tenant_id, provider, provider_mode, status, amount_cents, idempotency_key,
    provider_payload, paid_at, last_checked_at, created_by
  ) values (
    target_tenant_id, 'manual', 'manual', 'paid', total_amount, idempotency_key,
    jsonb_build_object('reference', reference, 'payment_date', payment_date),
    payment_date, clock_timestamp(), auth.uid()
  ) returning * into attempt;

  for allocation in select value from jsonb_array_elements(allocations)
  loop
    invoice_id := (allocation->>'invoice_id')::uuid;
    allocation_amount := (allocation->>'amount_cents')::bigint;
    insert into public.payment_allocations (tenant_id, payment_attempt_id, invoice_id, amount_cents)
    values (target_tenant_id, attempt.id, invoice_id, allocation_amount);
    update public.invoices
    set paid_cents = paid_cents + allocation_amount,
        status = case when paid_cents + allocation_amount = total_cents then 'paid'::public.invoice_status else 'partially_paid'::public.invoice_status end
    where tenant_id = target_tenant_id and id = invoice_id;
  end loop;

  insert into public.audit_events (tenant_id, actor_user_id, action, entity_type, entity_id, after_data, request_id)
  values (target_tenant_id, auth.uid(), 'payment.manual_registered', 'payment_attempt', attempt.id, jsonb_build_object('amount_cents', total_amount, 'reference', reference), idempotency_key);
  return attempt;
end;
$$;
revoke execute on function public.register_manual_payment(uuid, timestamptz, text, jsonb, text) from public, anon;
grant execute on function public.register_manual_payment(uuid, timestamptz, text, jsonb, text) to authenticated;

create or replace function public.publish_announcement(target_announcement_id uuid)
returns public.announcements
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.announcements;
begin
  select * into target from public.announcements a where a.id = target_announcement_id for update;
  if not found then raise exception 'Announcement not found' using errcode = 'P0002'; end if;
  if not private.has_role(target.tenant_id, array['tenant_admin','management']::public.app_role[]) then
    raise exception 'Management role required' using errcode = '42501';
  end if;
  if target.withdrawn_at is not null then raise exception 'A withdrawn announcement cannot be published' using errcode = '23514'; end if;
  update public.announcements
  set published_at = coalesce(publish_at, clock_timestamp())
  where id = target.id returning * into target;
  perform private.enqueue_event(
    target.tenant_id, 'announcement.published', 'announcement', target.id,
    jsonb_build_object('announcement_id', target.id, 'send_push', target.send_push, 'audience_roles', target.audience_roles),
    'announcement:' || target.id::text
  );
  return target;
end;
$$;
revoke execute on function public.publish_announcement(uuid) from public, anon;
grant execute on function public.publish_announcement(uuid) to authenticated;

create or replace function public.claim_outbox(batch_size integer default 25, lock_seconds integer default 60)
returns setof public.outbox_events
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  return query
  with selected as (
    select e.id
    from public.outbox_events e
    where e.status in ('queued','failed')
      and e.available_at <= clock_timestamp()
      and (e.locked_until is null or e.locked_until < clock_timestamp())
    order by e.created_at
    for update skip locked
    limit greatest(1, least(batch_size, 100))
  )
  update public.outbox_events e
  set status = 'processing',
      locked_until = clock_timestamp() + make_interval(secs => greatest(10, least(lock_seconds, 600))),
      attempts = e.attempts + 1
  from selected s
  where e.id = s.id
  returning e.*;
end;
$$;
revoke execute on function public.claim_outbox(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_outbox(integer, integer) to service_role;

create or replace function public.apply_confirmed_provider_payment(
  target_payment_attempt_id uuid,
  provider_payment_id text,
  provider_status public.payment_status,
  provider_amount_cents bigint,
  provider_currency text,
  provider_payload jsonb
)
returns public.payment_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.payment_attempts;
  allocation public.payment_allocations;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  select * into target from public.payment_attempts p where p.id = target_payment_attempt_id for update;
  if not found then raise exception 'Payment attempt not found' using errcode = 'P0002'; end if;
  if target.provider <> 'mollie' or target.provider_payment_id <> provider_payment_id then
    raise exception 'Provider payment identity mismatch' using errcode = '23514';
  end if;
  if target.amount_cents <> provider_amount_cents or target.currency <> provider_currency then
    raise exception 'Provider payment amount or currency mismatch' using errcode = '23514';
  end if;
  if target.status = 'paid' then return target; end if;

  update public.payment_attempts
  set status = provider_status,
      provider_payload = apply_confirmed_provider_payment.provider_payload,
      paid_at = case when provider_status = 'paid' then clock_timestamp() else paid_at end,
      last_checked_at = clock_timestamp()
  where id = target.id returning * into target;

  if provider_status = 'paid' then
    for allocation in
      select * from public.payment_allocations pa
      where pa.tenant_id = target.tenant_id and pa.payment_attempt_id = target.id
      order by pa.invoice_id
    loop
      update public.invoices
      set paid_cents = least(total_cents, paid_cents + allocation.amount_cents),
          status = case when paid_cents + allocation.amount_cents >= total_cents then 'paid'::public.invoice_status else 'partially_paid'::public.invoice_status end
      where tenant_id = target.tenant_id and id = allocation.invoice_id and status <> 'paid';
    end loop;
  end if;
  return target;
end;
$$;
revoke execute on function public.apply_confirmed_provider_payment(uuid, text, public.payment_status, bigint, text, jsonb) from public, anon, authenticated;
grant execute on function public.apply_confirmed_provider_payment(uuid, text, public.payment_status, bigint, text, jsonb) to service_role;

-- RPCs are the only browser write path for state transitions/finalization.
-- Direct table grants remain for planner CRUD, while triggers and RLS continue
-- to enforce tenant invariants on every relation.
