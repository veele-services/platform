-- Fieldgrid Phase 2 W01: protect planned and actual assignment time semantics.

alter table public.assignments
  add constraint assignments_scheduled_start_format_chk
  check (scheduled_start is null or scheduled_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  add constraint assignments_scheduled_end_format_chk
  check (scheduled_end is null or scheduled_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  add constraint assignments_scheduled_window_order_chk
  check (scheduled_start is null or scheduled_end is null or scheduled_start < scheduled_end),
  add constraint assignments_actual_completion_after_start_chk
  check (actual_started_at is null or actual_completed_at is null or actual_completed_at >= actual_started_at);
