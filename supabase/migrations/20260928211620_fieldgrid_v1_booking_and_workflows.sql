-- Atomic customer booking and planner confirmation complete the V1 workflows
-- without exposing service-role table access to either browser.

create unique index notifications_event_recipient_channel_uidx
on public.notifications (tenant_id, user_id, outbox_event_id, channel)
where outbox_event_id is not null;

create table public.booking_options (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  token_id uuid not null,
  slot_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, token_id, slot_id),
  foreign key (tenant_id, token_id) references public.external_action_tokens(tenant_id, id) on delete cascade,
  foreign key (tenant_id, slot_id) references public.appointment_slots(tenant_id, id) on delete cascade
);
alter table public.booking_options enable row level security;
alter table public.booking_options force row level security;
revoke all on public.booking_options from anon, authenticated;
grant all on public.booking_options to service_role;

create or replace function public.book_appointment_slot(
  target_tenant_id uuid,
  target_request_id uuid,
  target_slot_id uuid,
  target_token_id uuid
)
returns public.appointment_slots
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_slot public.appointment_slots;
  target_token public.external_action_tokens;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  select * into target_token from public.external_action_tokens t
  where t.id = target_token_id and t.tenant_id = target_tenant_id
    and t.purpose = 'booking' and t.subject_id = target_request_id
  for update;
  if not found or target_token.consumed_at is not null or target_token.expires_at <= clock_timestamp() then
    raise exception 'Booking link is invalid or expired' using errcode = '42501';
  end if;
  if not exists (select 1 from public.booking_options o where o.tenant_id = target_tenant_id and o.token_id = target_token_id and o.slot_id = target_slot_id) then
    raise exception 'Appointment slot is not offered by this link' using errcode = '42501';
  end if;
  select * into target_slot from public.appointment_slots s
  where s.id = target_slot_id and s.tenant_id = target_tenant_id
  for update;
  if not found or target_slot.status <> 'available' or target_slot.booked_count >= target_slot.capacity then
    raise exception 'Appointment slot is no longer available' using errcode = '23514';
  end if;
  if not exists (select 1 from public.requests r where r.id = target_request_id and r.tenant_id = target_tenant_id) then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  update public.appointment_slots
  set booked_count = booked_count + 1,
      status = case when booked_count + 1 >= capacity then 'full' else 'available' end
  where id = target_slot.id
  returning * into target_slot;
  update public.requests set preferred_slot_id = target_slot.id, status = 'accepted' where id = target_request_id;
  update public.external_action_tokens set consumed_at = clock_timestamp() where id = target_token.id;
  insert into public.audit_events (tenant_id, action, entity_type, entity_id, after_data, request_id)
  values (target_tenant_id, 'appointment.booked', 'request', target_request_id,
    jsonb_build_object('slot_id', target_slot.id, 'starts_at', target_slot.starts_at, 'ends_at', target_slot.ends_at),
    'booking:' || target_token.id::text);
  return target_slot;
end;
$$;
revoke execute on function public.book_appointment_slot(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.book_appointment_slot(uuid, uuid, uuid, uuid) to service_role;

create or replace function public.confirm_shift_interest(target_shift_id uuid, target_personnel_id uuid)
returns public.open_shifts
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.open_shifts;
  result public.open_shifts;
begin
  select * into target from public.open_shifts s where s.id = target_shift_id for update;
  if not found then raise exception 'Open shift not found' using errcode = 'P0002'; end if;
  if not private.has_role(target.tenant_id, array['tenant_admin','management','planner']::public.app_role[]) then
    raise exception 'Planner role required' using errcode = '42501';
  end if;
  if target.status <> 'open' then raise exception 'Open shift is no longer open' using errcode = '23514'; end if;
  if not exists (
    select 1 from public.shift_interests i
    join public.personnel p on p.tenant_id = i.tenant_id and p.id = i.personnel_id and p.status = 'active'
    join public.personnel_functions pf on pf.tenant_id = p.tenant_id and pf.personnel_id = p.id and pf.function_id = target.function_id
    where i.tenant_id = target.tenant_id and i.open_shift_id = target.id
      and i.personnel_id = target_personnel_id and i.status = 'interested'
      and not exists (
        select 1 from unnest(target.required_certificate_codes) required_code
        where not exists (
          select 1 from public.qualifications q where q.tenant_id = target.tenant_id
            and q.personnel_id = p.id and q.code = required_code
            and (q.valid_until is null or q.valid_until >= current_date)
        )
      )
  ) then raise exception 'Personnel is not eligible or interested' using errcode = '42501'; end if;
  if exists (
    select 1 from public.work_order_assignments a
    where a.tenant_id = target.tenant_id and a.personnel_id = target_personnel_id
      and a.status not in ('completed','returned','cancelled')
      and tstzrange(a.projected_start_at, a.projected_end_at, '[)') && tstzrange(target.starts_at, target.ends_at, '[)')
  ) then raise exception 'Personnel already has an overlapping assignment' using errcode = '23514'; end if;
  perform 1 from public.work_orders w where w.tenant_id = target.tenant_id and w.id = target.work_order_id for update;
  insert into public.work_order_assignments (tenant_id, work_order_id, personnel_id, planned_start_at, planned_end_at, projected_start_at, projected_end_at)
  values (target.tenant_id, target.work_order_id, target_personnel_id, target.starts_at, target.ends_at, target.starts_at, target.ends_at)
  on conflict (tenant_id, work_order_id, personnel_id) do update
  set planned_start_at = excluded.planned_start_at, planned_end_at = excluded.planned_end_at,
      projected_start_at = excluded.projected_start_at, projected_end_at = excluded.projected_end_at;
  update public.open_shifts set status = 'assigned', selected_personnel_id = target_personnel_id where id = target.id returning * into result;
  update public.shift_interests set status = case when personnel_id = target_personnel_id then 'selected' else 'rejected' end
  where tenant_id = target.tenant_id and open_shift_id = target.id;
  update public.work_orders set projected_start_at = target.starts_at, projected_end_at = target.ends_at where id = target.work_order_id;
  insert into public.audit_events (tenant_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (target.tenant_id, auth.uid(), 'open_shift.assigned', 'open_shift', target.id, jsonb_build_object('personnel_id', target_personnel_id));
  return result;
end;
$$;
revoke execute on function public.confirm_shift_interest(uuid, uuid) from public, anon;
grant execute on function public.confirm_shift_interest(uuid, uuid) to authenticated;

alter table public.mail_deliveries add column locked_until timestamptz;

create or replace function public.claim_mail_delivery(
  target_tenant_id uuid,
  target_recipient text,
  target_template text,
  target_idempotency_key text
)
returns table (delivery_id uuid, should_send boolean, current_status public.delivery_status)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.mail_deliveries;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  insert into public.mail_deliveries (tenant_id, recipient, template, status, attempts, idempotency_key, locked_until)
  values (target_tenant_id, target_recipient, target_template, 'processing', 1, target_idempotency_key, clock_timestamp() + interval '2 minutes')
  on conflict (tenant_id, idempotency_key) do nothing
  returning * into target;
  if found then return query select target.id, true, target.status; return; end if;
  select * into target from public.mail_deliveries d
  where d.tenant_id = target_tenant_id and d.idempotency_key = target_idempotency_key
  for update;
  if target.status = 'sent' or (target.status = 'processing' and target.locked_until > clock_timestamp()) then
    return query select target.id, false, target.status; return;
  end if;
  update public.mail_deliveries set status = 'processing', attempts = attempts + 1,
    locked_until = clock_timestamp() + interval '2 minutes', last_error = null
  where id = target.id returning * into target;
  return query select target.id, true, target.status;
end;
$$;
revoke execute on function public.claim_mail_delivery(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.claim_mail_delivery(uuid, text, text, text) to service_role;
