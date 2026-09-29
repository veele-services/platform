-- Final V1 operational constraints and personnel document metadata.

drop index if exists public.notifications_event_recipient_channel_uidx;
create unique index notifications_event_recipient_channel_uidx
on public.notifications (tenant_id, user_id, outbox_event_id, channel);

alter table public.personnel_documents
  add column file_name text,
  add column mime_type text,
  add column size_bytes bigint,
  add column sha256 text;

alter table public.personnel_documents
  add constraint personnel_documents_file_name_not_blank
    check (file_name is null or btrim(file_name) <> ''),
  add constraint personnel_documents_mime_type_allowed
    check (mime_type is null or mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  add constraint personnel_documents_size_valid
    check (size_bytes is null or (size_bytes > 0 and size_bytes <= 20971520)),
  add constraint personnel_documents_sha256_format
    check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$');

create index personnel_documents_personnel_created_idx
on public.personnel_documents (tenant_id, personnel_id, created_at desc);

create or replace function public.reschedule_work_order(
  target_work_order_id uuid,
  target_personnel_id uuid,
  target_start_at timestamptz,
  expected_version bigint
)
returns public.work_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.work_orders;
  target_assignment public.work_order_assignments;
  duration interval;
  target_end_at timestamptz;
  result public.work_orders;
begin
  select * into target from public.work_orders where id = target_work_order_id for update;
  if not found then raise exception 'Work order not found' using errcode = 'P0002'; end if;
  if not private.has_role(target.tenant_id, array['tenant_admin','management','planner']::public.app_role[]) then
    raise exception 'Planner access required' using errcode = '42501';
  end if;
  if target.status <> 'planned' then raise exception 'Only planned work orders can be moved' using errcode = '23514'; end if;
  if target.version <> expected_version then raise exception 'Work order was changed by another user' using errcode = '40001'; end if;

  select * into target_assignment
  from public.work_order_assignments
  where tenant_id = target.tenant_id and work_order_id = target.id
  for update;
  if not found then raise exception 'Assignment not found' using errcode = 'P0002'; end if;
  duration := target_assignment.projected_end_at - target_assignment.projected_start_at;
  if duration <= interval '0 seconds' then raise exception 'Invalid assignment duration' using errcode = '23514'; end if;
  target_end_at := target_start_at + duration;

  if not exists (
    select 1 from public.personnel p
    where p.tenant_id = target.tenant_id and p.id = target_personnel_id and p.status = 'active'
  ) then raise exception 'Personnel is not active in this tenant' using errcode = '23514'; end if;
  if exists (
    select 1 from public.availability a
    where a.tenant_id = target.tenant_id and a.personnel_id = target_personnel_id
      and a.kind in ('unavailable','leave','sick')
      and a.starts_at < target_end_at and a.ends_at > target_start_at
  ) then raise exception 'Personnel is unavailable in this period' using errcode = '23P01'; end if;
  if exists (
    select 1 from public.work_order_assignments a
    where a.tenant_id = target.tenant_id and a.personnel_id = target_personnel_id
      and a.id <> target_assignment.id
      and a.status not in ('completed','returned','cancelled')
      and a.projected_start_at < target_end_at and a.projected_end_at > target_start_at
  ) then raise exception 'Personnel has an overlapping assignment' using errcode = '23P01'; end if;

  update public.work_order_assignments
  set personnel_id = target_personnel_id,
      planned_start_at = target_start_at,
      planned_end_at = target_end_at,
      projected_start_at = target_start_at,
      projected_end_at = target_end_at
  where id = target_assignment.id;
  update public.work_orders
  set planned_start_at = target_start_at,
      planned_end_at = target_end_at,
      projected_start_at = target_start_at,
      projected_end_at = target_end_at
  where id = target.id
  returning * into result;
  insert into public.audit_events (tenant_id, actor_user_id, action, entity_type, entity_id, before_data, after_data)
  values (target.tenant_id, auth.uid(), 'work_order.rescheduled', 'work_order', target.id,
    jsonb_build_object('personnel_id', target_assignment.personnel_id, 'start_at', target_assignment.projected_start_at),
    jsonb_build_object('personnel_id', target_personnel_id, 'start_at', target_start_at));
  return result;
end;
$$;

revoke execute on function public.reschedule_work_order(uuid, uuid, timestamptz, bigint) from public, anon;
grant execute on function public.reschedule_work_order(uuid, uuid, timestamptz, bigint) to authenticated;

create or replace function private.approve_extra_work_with_work_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'invoice_ready' and old.status is distinct from new.status then
    update public.work_order_tasks
    set extra_work_status = 'approved'
    where tenant_id = new.tenant_id
      and work_order_id = new.id
      and is_extra_work
      and extra_work_status = 'awaiting_review';
  end if;
  return new;
end;
$$;

create trigger work_orders_approve_extra_work
after update of status on public.work_orders
for each row execute function private.approve_extra_work_with_work_order();
