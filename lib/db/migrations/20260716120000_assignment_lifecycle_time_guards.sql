-- Fieldgrid Phase 2 W01: protect planned and actual assignment time semantics.

-- Legacy data can contain equal or reversed planned times. The current model has
-- no end date, so swapping those values could silently turn an intended
-- overnight assignment into a long same-day assignment. Preserve the original
-- values in the tenant audit trail and require explicit rescheduling instead.
lock table public.assignments in share row exclusive mode;

insert into public.audit_log (
  tenant_id,
  user_id,
  action,
  resource,
  resource_id,
  metadata
)
select
  assignment.tenant_id,
  coalesce(assignment.created_by, '00000000-0000-0000-0000-000000000000'::uuid),
  'migration_schedule_reconciled',
  'assignments',
  assignment.id::text,
  jsonb_build_object(
    'migration', '20260716120000_assignment_lifecycle_time_guards.sql',
    'reason', 'scheduled_start_not_before_scheduled_end',
    'scheduledDate', assignment.scheduled_date,
    'scheduledStart', assignment.scheduled_start,
    'scheduledEnd', assignment.scheduled_end,
    'status', assignment.status,
    'requiresRescheduling', true
  )
from public.assignments assignment
where assignment.scheduled_start is not null
  and assignment.scheduled_end is not null
  and assignment.scheduled_start >= assignment.scheduled_end;

update public.assignments
set
  scheduled_start = null,
  scheduled_end = null,
  updated_at = now()
where scheduled_start is not null
  and scheduled_end is not null
  and scheduled_start >= scheduled_end;

alter table public.assignments
  add constraint assignments_scheduled_start_format_chk
  check (scheduled_start is null or scheduled_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  add constraint assignments_scheduled_end_format_chk
  check (scheduled_end is null or scheduled_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  add constraint assignments_scheduled_window_order_chk
  check (scheduled_start is null or scheduled_end is null or scheduled_start < scheduled_end),
  add constraint assignments_actual_completion_after_start_chk
  check (actual_started_at is null or actual_completed_at is null or actual_completed_at >= actual_started_at);
