begin;

set local check_function_bodies = off;

-- The personnel app writes through narrow RPCs.  These helpers deliberately
-- stay private so browser clients cannot use them as an alternate data API.
create or replace function private.staff_text_array_valid(
  value text[],
  max_items integer,
  max_item_length integer
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(cardinality(value), 0) <= max_items
    and not exists (
      select 1
      from unnest(coalesce(value, '{}'::text[])) item
      where length(btrim(item)) not between 1 and max_item_length
    );
$$;

create or replace function private.staff_availability_preferences_valid(
  value jsonb,
  require_selection boolean default false
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  day_name text;
  day_value jsonb;
  has_enabled_day boolean := false;
  shift_count integer;
begin
  if jsonb_typeof(value) <> 'object' or octet_length(value::text) > 16000 then
    return false;
  end if;
  if value = '{}'::jsonb then
    return not require_selection;
  end if;
  if value - array['week','shifts','planningNote','weekends','holidays'] <> '{}'::jsonb
    or not (value ?& array['week','shifts','planningNote','weekends','holidays'])
    or jsonb_typeof(value -> 'week') <> 'object'
    or jsonb_typeof(value -> 'shifts') <> 'array'
    or jsonb_typeof(value -> 'planningNote') <> 'string'
    or jsonb_typeof(value -> 'weekends') <> 'boolean'
    or jsonb_typeof(value -> 'holidays') <> 'boolean'
    or length(value ->> 'planningNote') > 1000
    or (value -> 'week') - array['monday','tuesday','wednesday','thursday','friday','saturday','sunday'] <> '{}'::jsonb
    or not ((value -> 'week') ?& array['monday','tuesday','wednesday','thursday','friday','saturday','sunday'])
  then
    return false;
  end if;

  for day_name, day_value in select key, val from jsonb_each(value -> 'week') as days(key, val)
  loop
    if jsonb_typeof(day_value) <> 'object'
      or day_value - array['enabled','start','end'] <> '{}'::jsonb
      or not (day_value ?& array['enabled','start','end'])
      or jsonb_typeof(day_value -> 'enabled') <> 'boolean'
      or jsonb_typeof(day_value -> 'start') <> 'string'
      or jsonb_typeof(day_value -> 'end') <> 'string'
      or day_value ->> 'start' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or day_value ->> 'end' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or day_value ->> 'start' >= day_value ->> 'end'
    then
      return false;
    end if;
    has_enabled_day := has_enabled_day or (day_value ->> 'enabled')::boolean;
  end loop;

  shift_count := jsonb_array_length(value -> 'shifts');
  if shift_count > 3
    or exists (
      select 1
      from jsonb_array_elements(value -> 'shifts') shift
      where jsonb_typeof(shift) <> 'string'
        or shift #>> '{}' not in ('day','evening','night')
    )
    or shift_count <> (
      select count(distinct shift #>> '{}')
      from jsonb_array_elements(value -> 'shifts') shift
    )
  then
    return false;
  end if;
  return not require_selection or (has_enabled_day and shift_count between 1 and 3);
end;
$$;

revoke all on function private.staff_text_array_valid(text[],integer,integer) from public, anon, authenticated, service_role;
revoke all on function private.staff_availability_preferences_valid(jsonb,boolean) from public, anon, authenticated, service_role;
-- Personnel CHECK constraints invoke these validators under the inserting
-- role. They expose no rows and therefore receive only the narrow EXECUTE
-- privilege required by existing authenticated and service-role imports.
grant execute on function private.staff_text_array_valid(text[],integer,integer)
  to authenticated, service_role, postgres;
grant execute on function private.staff_availability_preferences_valid(jsonb,boolean)
  to authenticated, service_role, postgres;

alter table public.personnel
  add column preferred_name text,
  add column mobile_phone text,
  add column birth_date date,
  add column driving_license boolean not null default false,
  add column driving_license_categories text[] not null default '{}'::text[],
  add column carpool_allowed boolean not null default false,
  add column own_transport boolean not null default false,
  add column travel_limitations text,
  add column notification_preferences jsonb not null default '{}'::jsonb,
  add column availability_preferences jsonb not null default '{}'::jsonb,
  add column availability_self_service_enabled boolean not null default false,
  add column onboarding_draft jsonb not null default '{}'::jsonb,
  add column onboarding_step smallint not null default 0,
  add column onboarding_completed_at timestamptz,
  add column onboarding_version bigint not null default 1,
  add constraint personnel_preferred_name_length check (
    preferred_name is null or length(btrim(preferred_name)) between 1 and 120
  ),
  add constraint personnel_mobile_phone_length check (
    mobile_phone is null or length(btrim(mobile_phone)) between 7 and 40
  ),
  add constraint personnel_birth_date_valid check (
    birth_date is null or birth_date >= date '1900-01-01'
  ),
  add constraint personnel_driving_license_categories_valid check (
    private.staff_text_array_valid(driving_license_categories, 12, 10)
    and (driving_license or cardinality(driving_license_categories) = 0)
  ),
  add constraint personnel_travel_limitations_valid check (
    travel_limitations is null or length(btrim(travel_limitations)) between 1 and 1000
  ),
  add constraint personnel_notification_preferences_valid check (
    jsonb_typeof(notification_preferences) = 'object'
    and octet_length(notification_preferences::text) <= 16000
  ),
  add constraint personnel_availability_preferences_valid check (
    private.staff_availability_preferences_valid(availability_preferences, false)
  ),
  add constraint personnel_onboarding_draft_valid check (
    jsonb_typeof(onboarding_draft) = 'object'
    and octet_length(onboarding_draft::text) <= 32768
  ),
  add constraint personnel_onboarding_step_valid check (
    onboarding_step between 0 and 6
  ),
  add constraint personnel_onboarding_version_valid check (
    onboarding_version > 0
  );

-- The personnel prototype distinguishes all nine transport modes. Preserve
-- those values end-to-end instead of folding them into the legacy `other` or
-- `ebike` buckets.
alter table public.personnel
  drop constraint personnel_standard_vehicle_check;
alter table public.personnel_travel_days
  drop constraint personnel_travel_days_standard_vehicle_check;
update public.personnel
set standard_vehicle = 'electric_bicycle'
where standard_vehicle = 'ebike';
update public.personnel_travel_days
set standard_vehicle = 'electric_bicycle'
where standard_vehicle = 'ebike';
alter table public.personnel
  add constraint personnel_standard_vehicle_check check (
    standard_vehicle in (
      'car','van','motorcycle','scooter','electric_bicycle','bicycle',
      'public_transport','walking','other'
    )
  );
alter table public.personnel_travel_days
  add constraint personnel_travel_days_standard_vehicle_check check (
    standard_vehicle in (
      'car','van','motorcycle','scooter','electric_bicycle','bicycle',
      'public_transport','walking','other'
    )
  );

create or replace function private.margins_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  key text;
  margin jsonb;
begin
  if jsonb_typeof(new.travel_vehicle_margins) <> 'object' then
    raise exception 'Ongeldige reismarges' using errcode = '23514';
  end if;
  for key, margin in select * from jsonb_each(new.travel_vehicle_margins)
  loop
    if key not in (
      'car','van','motorcycle','scooter','electric_bicycle','bicycle',
      'public_transport','walking','other'
    )
      or jsonb_typeof(margin) <> 'number'
      or (margin::text)::numeric not between 0 and 180
      or (margin::text)::numeric <> trunc((margin::text)::numeric)
    then
      raise exception 'Ongeldige reismarge' using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;

update public.tenant_settings
set travel_vehicle_margins =
  (travel_vehicle_margins - 'ebike')
  || case
    when travel_vehicle_margins ? 'electric_bicycle' then '{}'::jsonb
    else jsonb_build_object('electric_bicycle', travel_vehicle_margins -> 'ebike')
  end
where travel_vehicle_margins ? 'ebike';

-- Keep the persisted vehicle value and its routing semantics aligned. The
-- legacy function only knew `ebike`, causing the renamed and newly supported
-- two-wheel modes to be stored as public transport legs.
create or replace function private.store_travel_estimates(
  t uuid,
  revision bigint,
  legs jsonb,
  manual_action text default null,
  actor uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  leg jsonb;
  assignment public.work_order_assignments;
begin
  perform pg_advisory_xact_lock(hashtextextended('travel:' || t::text, 0));
  if coalesce((select current.revision from private.travel_revisions current where current.tenant_id = t), 0) <> revision then
    return false;
  end if;
  if jsonb_array_length(legs) > 1000 then raise exception 'Te veel ritten'; end if;
  for leg in select value from jsonb_array_elements(legs)
  loop
    select * into assignment
    from public.work_order_assignments current
    where current.tenant_id = t and current.id = (leg ->> 'assignmentId')::uuid;
    if assignment.id is null
      or assignment.personnel_id <> (leg ->> 'personnelId')::uuid
      or assignment.status in ('cancelled','completed','returned')
    then
      continue;
    end if;
    insert into public.travel_legs (
      tenant_id, assignment_id, direction, origin_address, destination_address,
      travel_mode, provider, estimated_minutes, estimated_distance_metres,
      basis_seconds, basis_distance_metres, basis_calculated_at,
      planning_margin_minutes, routing_profile, route_signature, planning_day,
      planning_revision, error_code, calculated_at, estimate_snapshot
    ) values (
      t, assignment.id, leg ->> 'direction', '{}'::jsonb, '{}'::jsonb,
      case
        when leg ->> 'vehicle' in ('car','van','motorcycle','scooter') then 'driving'
        when leg ->> 'vehicle' in ('bicycle','electric_bicycle') then 'bicycling'
        when leg ->> 'vehicle' = 'walking' then 'walking'
        else 'transit'
      end,
      'openrouteservice', (leg ->> 'minutes')::integer,
      round((leg ->> 'metres')::numeric)::integer,
      case when leg ->> 'state' = 'known' then (leg ->> 'seconds')::numeric end,
      case when leg ->> 'state' = 'known' then (leg ->> 'metres')::numeric end,
      case when leg ->> 'state' = 'known' then (leg ->> 'calculatedAt')::timestamptz end,
      (leg ->> 'marginMinutes')::integer, leg ->> 'profile', leg ->> 'signature',
      (leg ->> 'day')::date, revision,
      case when leg ->> 'state' in ('known','manual') then null else leg ->> 'state' end,
      (leg ->> 'calculatedAt')::timestamptz, leg - 'origin' - 'destination'
    )
    on conflict (tenant_id, assignment_id, direction)
    do update set
      estimated_minutes = excluded.estimated_minutes,
      estimated_distance_metres = excluded.estimated_distance_metres,
      basis_seconds = case
        when leg ->> 'state' = 'known' then excluded.basis_seconds
        when public.travel_legs.route_signature = excluded.route_signature then public.travel_legs.basis_seconds
        else null
      end,
      basis_distance_metres = case
        when leg ->> 'state' = 'known' then excluded.basis_distance_metres
        when public.travel_legs.route_signature = excluded.route_signature then public.travel_legs.basis_distance_metres
        else null
      end,
      basis_calculated_at = case
        when leg ->> 'state' = 'known' then excluded.basis_calculated_at
        when public.travel_legs.route_signature = excluded.route_signature then public.travel_legs.basis_calculated_at
        else null
      end,
      planning_margin_minutes = excluded.planning_margin_minutes,
      routing_profile = excluded.routing_profile,
      route_signature = excluded.route_signature,
      planning_day = excluded.planning_day,
      planning_revision = excluded.planning_revision,
      error_code = excluded.error_code,
      calculated_at = excluded.calculated_at,
      estimate_snapshot = excluded.estimate_snapshot,
      provider = excluded.provider,
      travel_mode = excluded.travel_mode,
      origin_address = '{}'::jsonb,
      destination_address = '{}'::jsonb;
    if manual_action is not null then
      update public.travel_legs
      set manual_seconds = case when manual_action = 'set' then (leg ->> 'seconds')::numeric end,
          manual_metres = case when manual_action = 'set' then (leg ->> 'metres')::numeric end,
          manual_reason = case when manual_action = 'set' then leg ->> 'reason' end,
          manual_signature = case when manual_action = 'set' then leg ->> 'signature' end,
          manual_updated_at = clock_timestamp(),
          manual_updated_by = actor
      where tenant_id = t
        and assignment_id = assignment.id
        and direction = leg ->> 'direction';
      insert into public.audit_events (
        tenant_id, actor_user_id, action, entity_type, entity_id, after_data
      ) values (
        t, actor, 'travel.manual.' || manual_action, 'assignment', assignment.id,
        jsonb_build_object('seconds', leg -> 'seconds', 'direction', leg ->> 'direction')
      );
    end if;
  end loop;
  if manual_action is not null then
    insert into private.travel_revisions values (t, 1)
    on conflict (tenant_id) do update
    set revision = private.travel_revisions.revision + 1;
  end if;
  return true;
end;
$$;

-- Existing, linked active accounts predate the wizard and must retain direct
-- access. New/invited personnel keep the null completion default and onboard
-- explicitly after their account becomes active.
update public.personnel
set onboarding_step = 5,
    onboarding_completed_at = coalesce(updated_at, clock_timestamp())
where status = 'active'
  and user_id is not null
  and onboarding_completed_at is null;

do $$
begin
  if exists (
    select 1
    from public.personnel
    where status = 'active'
      and user_id is not null
      and onboarding_completed_at is null
  ) then
    raise exception 'Existing active linked personnel onboarding backfill failed';
  end if;
end;
$$;

comment on column public.personnel.availability_self_service_enabled is
  'Management-owned capability. Staff RPCs must fail closed while false.';
comment on column public.personnel.onboarding_draft is
  'Resumable personnel-app onboarding draft; login email is intentionally not stored here by server RPCs.';

-- Existing time rows did not have an optimistic concurrency token.  The
-- existing time_entries_touch trigger sees this column and increments it.
alter table public.time_entries
  add column version bigint not null default 1,
  add constraint time_entries_version_valid check (version > 0);

alter table public.time_entries
  drop constraint time_entries_kind_check,
  add constraint time_entries_kind_check check (
    kind in ('work','travel','break','other','correction')
  );

-- A staff-entered extra-work proposal is deliberately kept separate from an
-- approved commercial price. The requested amount is evidence for review;
-- unit_price_cents remains zero until an authorised commercial workflow binds
-- an agreement or proposal.
alter table public.work_order_tasks
  add column staff_request_reason text,
  add column staff_requested_amount_cents bigint,
  add constraint work_order_tasks_staff_request_reason_valid check (
    staff_request_reason is null
    or (is_extra_work and length(btrim(staff_request_reason)) between 3 and 1000)
  ),
  add constraint work_order_tasks_staff_requested_amount_valid check (
    staff_requested_amount_cents is null
    or (is_extra_work and staff_requested_amount_cents between 0 and 10000000)
  );

alter table public.work_order_exceptions
  drop constraint work_order_exceptions_kind_check,
  add constraint work_order_exceptions_kind_check check (
    kind = any (array[
      'no_access'::text, 'absence'::text, 'material'::text,
      'unsafe'::text, 'damage'::text, 'customer_cancelled'::text,
      'customer_absent'::text, 'delay'::text, 'other'::text
    ])
  );

create table public.staff_leave_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  personnel_id uuid not null,
  leave_type text not null check (leave_type in ('vacation','short','care','unpaid','other')),
  starts_on date not null,
  ends_on date not null,
  requested_minutes integer,
  requested_minutes_by_year jsonb not null default '{}'::jsonb,
  approved_minutes integer,
  approved_minutes_by_year jsonb not null default '{}'::jsonb,
  note text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','rejected','withdrawn')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  availability_id uuid unique,
  withdrawn_at timestamptz,
  withdrawal_note text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  version bigint not null default 1,
  unique (tenant_id, id),
  foreign key (tenant_id, personnel_id) references public.personnel(tenant_id, id) on delete restrict,
  foreign key (tenant_id, availability_id) references public.availability(tenant_id, id) on delete restrict,
  constraint staff_leave_period_valid check (ends_on >= starts_on and ends_on - starts_on <= 366),
  constraint staff_leave_requested_minutes_valid check (requested_minutes is null or requested_minutes between 1 and 527040),
  constraint staff_leave_approved_minutes_valid check (approved_minutes is null or approved_minutes between 1 and 527040),
  constraint staff_leave_requested_years_valid check (jsonb_typeof(requested_minutes_by_year) = 'object'),
  constraint staff_leave_approved_years_valid check (jsonb_typeof(approved_minutes_by_year) = 'object'),
  constraint staff_leave_note_valid check (length(note) <= 2000),
  constraint staff_leave_review_note_valid check (review_note is null or length(review_note) <= 2000),
  constraint staff_leave_withdrawal_note_valid check (withdrawal_note is null or length(withdrawal_note) <= 1000),
  constraint staff_leave_review_metadata_valid check (
    status not in ('approved','rejected') or (reviewed_by is not null and reviewed_at is not null)
  ),
  constraint staff_leave_withdrawal_valid check (
    status <> 'withdrawn' or withdrawn_at is not null
  ),
  constraint staff_leave_version_valid check (version > 0)
);

create index staff_leave_requests_personnel_period_idx
  on public.staff_leave_requests (tenant_id, personnel_id, starts_on, ends_on);
create index staff_leave_requests_review_idx
  on public.staff_leave_requests (tenant_id, status, starts_on);

create table public.staff_leave_entitlements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  personnel_id uuid not null,
  calendar_year integer not null check (calendar_year between 2000 and 2200),
  allowance_minutes integer not null check (allowance_minutes between 0 and 527040),
  carryover_minutes integer not null default 0 check (carryover_minutes between 0 and 527040),
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  version bigint not null default 1 check (version > 0),
  unique (tenant_id, id),
  unique (tenant_id, personnel_id, calendar_year),
  foreign key (tenant_id, personnel_id) references public.personnel(tenant_id, id) on delete restrict,
  constraint staff_leave_entitlement_total_valid check (allowance_minutes + carryover_minutes <= 1054080)
);

create index staff_leave_entitlements_personnel_year_idx
  on public.staff_leave_entitlements (tenant_id, personnel_id, calendar_year desc);

create table public.staff_day_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  personnel_id uuid not null,
  day date not null,
  state text not null default 'open' check (state in ('open','closed','confirmed','correction_requested')),
  note text not null default '',
  closed_at timestamptz,
  confirmed_at timestamptz,
  correction_requested_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  version bigint not null default 1,
  unique (tenant_id, id),
  unique (tenant_id, personnel_id, day),
  foreign key (tenant_id, personnel_id) references public.personnel(tenant_id, id) on delete restrict,
  constraint staff_day_review_note_valid check (length(note) <= 2000),
  constraint staff_day_review_timestamps_valid check (
    (state <> 'closed' or closed_at is not null)
    and (state <> 'confirmed' or (closed_at is not null and confirmed_at is not null))
    and (state <> 'correction_requested' or correction_requested_at is not null)
  ),
  constraint staff_day_review_version_valid check (version > 0)
);

create index staff_day_reviews_personnel_day_idx
  on public.staff_day_reviews (tenant_id, personnel_id, day desc);

-- A correction is a review request, never an in-place rewrite by staff. Keep
-- the immutable source snapshot and the requested replacement together so
-- management can make a deliberate, versioned decision later.
create table public.staff_time_correction_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  personnel_id uuid not null,
  time_entry_id uuid not null,
  correction_mode text not null check (correction_mode in ('times','duration')),
  source_version bigint not null check (source_version > 0),
  source_kind text not null,
  source_status text not null,
  source_starts_at timestamptz not null,
  source_ends_at timestamptz not null,
  source_day_state text not null check (source_day_state in ('open','closed','confirmed','correction_requested')),
  requested_starts_at timestamptz not null,
  requested_ends_at timestamptz not null,
  requested_duration_minutes integer not null check (requested_duration_minutes between 1 and 600),
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','withdrawn')),
  created_by uuid not null references auth.users(id) on delete restrict,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  version bigint not null default 1,
  unique (tenant_id, id),
  foreign key (tenant_id, personnel_id) references public.personnel(tenant_id, id) on delete restrict,
  -- A correction request is durable review evidence. Deleting its source row
  -- must fail instead of silently erasing pending or terminal history.
  foreign key (tenant_id, time_entry_id) references public.time_entries(tenant_id, id) on delete restrict,
  constraint staff_time_correction_requested_period_valid check (
    requested_ends_at > requested_starts_at
    and extract(epoch from requested_ends_at - requested_starts_at) = requested_duration_minutes * 60
  ),
  constraint staff_time_correction_reason_valid check (length(btrim(reason)) between 3 and 2000),
  constraint staff_time_correction_review_note_valid check (review_note is null or length(review_note) <= 2000),
  constraint staff_time_correction_review_metadata_valid check (
    status = 'pending'
    or status = 'withdrawn'
    or (reviewed_by is not null and reviewed_at is not null)
  ),
  constraint staff_time_correction_version_valid check (version > 0)
);

create unique index staff_time_correction_one_pending_idx
  on public.staff_time_correction_requests (tenant_id, time_entry_id)
  where status = 'pending';
create index staff_time_correction_personnel_idx
  on public.staff_time_correction_requests (tenant_id, personnel_id, created_at desc);
create index staff_time_correction_management_idx
  on public.staff_time_correction_requests (tenant_id, status, created_at);

create table public.work_order_expenses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  work_order_id uuid not null,
  assignment_id uuid not null,
  personnel_id uuid not null,
  description text not null,
  amount_cents bigint not null,
  customer_visible boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  version bigint not null default 1,
  unique (tenant_id, id),
  foreign key (tenant_id, work_order_id) references public.work_orders(tenant_id, id) on delete cascade,
  foreign key (tenant_id, assignment_id) references public.work_order_assignments(tenant_id, id) on delete restrict,
  foreign key (tenant_id, personnel_id) references public.personnel(tenant_id, id) on delete restrict,
  constraint work_order_expenses_description_valid check (
    length(btrim(description)) between 2 and 300
  ),
  constraint work_order_expenses_amount_valid check (
    amount_cents between 1 and 100000000
  ),
  constraint work_order_expenses_version_valid check (version > 0)
);

create index work_order_expenses_order_idx
  on public.work_order_expenses (tenant_id, work_order_id, created_at, id);
create index work_order_expenses_personnel_idx
  on public.work_order_expenses (tenant_id, personnel_id, created_at desc);

-- One receipt store gives command retries deterministic results without
-- widening write access to any public table.
create table private.staff_app_command_receipts (
  tenant_id uuid not null,
  id uuid not null,
  actor_id uuid not null,
  command text not null,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (tenant_id, id)
);

alter table private.staff_app_command_receipts enable row level security;
alter table private.staff_app_command_receipts force row level security;
revoke all on table private.staff_app_command_receipts from public, anon, authenticated, service_role;
grant all on table private.staff_app_command_receipts to postgres;

-- Realtime consumers receive only this coarse invalidation counter. They
-- refresh through staff_workspace instead of subscribing to privacy-rich
-- source rows whose replication payload can contain actor IDs or addresses.
create table public.staff_workspace_revisions (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default clock_timestamp()
);

insert into public.staff_workspace_revisions (tenant_id)
select tenant.id from public.tenants tenant
on conflict (tenant_id) do nothing;

alter table public.staff_workspace_revisions enable row level security;
alter table public.staff_workspace_revisions force row level security;
revoke all on table public.staff_workspace_revisions from public, anon, authenticated, service_role;
grant all on table public.staff_workspace_revisions to postgres;
grant select on table public.staff_workspace_revisions to authenticated;

create policy staff_workspace_revisions_read
on public.staff_workspace_revisions
for select to authenticated
using (
  private.object_session_active()
  and (
    (
      private.service_enabled(tenant_id, 'personeel')
      and private.has_role(tenant_id, array['staff']::public.app_role[])
      and exists (
        select 1
        from public.personnel person
        where person.tenant_id = staff_workspace_revisions.tenant_id
          and person.user_id = auth.uid()
          and person.status = 'active'
      )
    )
    or (
      private.service_enabled(tenant_id, 'planning')
      and private.planning_access(tenant_id)
    )
  )
);

create or replace function private.bump_staff_workspace_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_tenant uuid;
  old_data jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) else '{}'::jsonb end;
  new_data jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) else '{}'::jsonb end;
begin
  source_tenant := case
    when tg_table_schema = 'public' and tg_table_name = 'tenants' then coalesce(
      nullif(new_data ->> 'id', '')::uuid,
      nullif(old_data ->> 'id', '')::uuid
    )
    else coalesce(
      nullif(new_data ->> 'tenant_id', '')::uuid,
      nullif(old_data ->> 'tenant_id', '')::uuid
    )
  end;
  -- Cascading tenant deletion can fire child-table triggers after the parent
  -- (and its revision row) has already disappeared. A revision only belongs
  -- to a live tenant, so never recreate it from teardown activity.
  if source_tenant is not null
     and exists (
       select 1
       from public.tenants tenant
       where tenant.id = source_tenant
     ) then
    insert into public.staff_workspace_revisions (tenant_id, revision, updated_at)
    values (source_tenant, 1, clock_timestamp())
    on conflict (tenant_id) do update
    set revision = public.staff_workspace_revisions.revision + 1,
        updated_at = excluded.updated_at;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

do $$
declare
  source_table text;
begin
  foreach source_table in array array[
    'tenant_settings',
    'tenant_memberships',
    'customers',
    'objects',
    'work_order_contacts',
    'personnel',
    'personnel_functions',
    'qualifications',
    'travel_depots',
    'work_orders',
    'work_order_assignments',
    'dispatches',
    'time_entries',
    'staff_time_correction_requests',
    'work_order_tasks',
    'work_order_task_contributions',
    'task_catalog',
    'task_revisions',
    'report_entries',
    'attachments',
    'signatures',
    'status_events',
    'availability',
    'staff_leave_requests',
    'staff_leave_entitlements',
    'staff_day_reviews',
    'work_order_material_usage',
    'work_order_expenses',
    'announcements',
    'announcement_reads',
    'open_shifts',
    'shift_interests',
    'personnel_documents',
    'extra_work_rules',
    'work_order_allowed_extra_work',
    'travel_legs'
  ]
  loop
    execute format(
      'create trigger %I_staff_workspace_revision after insert or update or delete on public.%I for each row execute function private.bump_staff_workspace_revision()',
      source_table,
      source_table
    );
  end loop;

  execute $trigger$
    create trigger tenants_staff_workspace_revision
    after update on public.tenants
    for each row execute function private.bump_staff_workspace_revision()
  $trigger$;

  execute $trigger$
    create trigger work_order_material_finance_staff_workspace_revision
    after insert or update or delete on private.work_order_material_finance
    for each row execute function private.bump_staff_workspace_revision()
  $trigger$;
end;
$$;

revoke all on function private.bump_staff_workspace_revision() from public, anon, authenticated, service_role;
grant execute on function private.bump_staff_workspace_revision() to postgres;

create or replace function private.staff_leave_overlap_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended('fieldgrid-staff-leave:' || new.tenant_id::text || ':' || new.personnel_id::text, 0)
  );
  if new.status in ('pending','approved') and exists (
    select 1
    from public.staff_leave_requests other
    where other.tenant_id = new.tenant_id
      and other.personnel_id = new.personnel_id
      and other.id <> new.id
      and other.status in ('pending','approved')
      and other.starts_on <= new.ends_on
      and other.ends_on >= new.starts_on
  ) then
    raise exception 'Deze verlofaanvraag overlapt met bestaand verlof' using errcode = '23P01';
  end if;
  return new;
end;
$$;

create trigger staff_leave_requests_overlap
before insert or update of personnel_id, starts_on, ends_on, status
on public.staff_leave_requests
for each row execute function private.staff_leave_overlap_guard();

create trigger staff_leave_requests_touch
before update on public.staff_leave_requests
for each row execute function private.touch_updated_at();

create trigger staff_leave_entitlements_touch
before update on public.staff_leave_entitlements
for each row execute function private.touch_updated_at();

create trigger staff_day_reviews_touch
before update on public.staff_day_reviews
for each row execute function private.touch_updated_at();

create trigger staff_time_correction_requests_touch
before update on public.staff_time_correction_requests
for each row execute function private.touch_updated_at();

create trigger work_order_expenses_touch
before update on public.work_order_expenses
for each row execute function private.touch_updated_at();

revoke all on function private.staff_leave_overlap_guard() from public, anon, authenticated, service_role;
grant execute on function private.staff_leave_overlap_guard() to postgres;

alter table public.staff_leave_requests enable row level security;
alter table public.staff_leave_requests force row level security;
alter table public.staff_leave_entitlements enable row level security;
alter table public.staff_leave_entitlements force row level security;
alter table public.staff_day_reviews enable row level security;
alter table public.staff_day_reviews force row level security;
alter table public.staff_time_correction_requests enable row level security;
alter table public.staff_time_correction_requests force row level security;
alter table public.work_order_expenses enable row level security;
alter table public.work_order_expenses force row level security;

revoke all on table public.staff_leave_requests from public, anon, authenticated, service_role;
revoke all on table public.staff_leave_entitlements from public, anon, authenticated, service_role;
revoke all on table public.staff_day_reviews from public, anon, authenticated, service_role;
revoke all on table public.staff_time_correction_requests from public, anon, authenticated, service_role;
revoke all on table public.work_order_expenses from public, anon, authenticated, service_role;
grant all on table public.staff_leave_requests to postgres;
grant all on table public.staff_leave_entitlements to postgres;
grant all on table public.staff_day_reviews to postgres;
grant all on table public.staff_time_correction_requests to postgres;
grant all on table public.work_order_expenses to postgres;
grant select on table public.staff_leave_requests to authenticated;
grant select on table public.staff_leave_entitlements to authenticated;
grant select on table public.staff_day_reviews to authenticated;
grant select on table public.staff_time_correction_requests to authenticated;
grant select on table public.work_order_expenses to authenticated;

create policy staff_leave_requests_read
on public.staff_leave_requests
for select to authenticated
using (
  private.object_session_active()
  and private.service_enabled(tenant_id, 'personeel')
  and (
    personnel_id = private.current_personnel_id(tenant_id)
    or private.has_role(tenant_id, array['tenant_admin','management','hr']::public.app_role[])
  )
);

create policy staff_leave_entitlements_read
on public.staff_leave_entitlements
for select to authenticated
using (
  private.object_session_active()
  and private.service_enabled(tenant_id, 'personeel')
  and (
    personnel_id = private.current_personnel_id(tenant_id)
    or private.has_role(tenant_id, array['tenant_admin','management','hr']::public.app_role[])
  )
);

create policy staff_day_reviews_read
on public.staff_day_reviews
for select to authenticated
using (
  private.object_session_active()
  and private.service_enabled(tenant_id, 'personeel')
  and (
    personnel_id = private.current_personnel_id(tenant_id)
    or private.has_role(tenant_id, array['tenant_admin','management','hr']::public.app_role[])
  )
);

create policy staff_time_correction_requests_read
on public.staff_time_correction_requests
for select to authenticated
using (
  private.object_session_active()
  and private.service_enabled(tenant_id, 'personeel')
  and (
    personnel_id = private.current_personnel_id(tenant_id)
    or private.has_role(tenant_id, array['tenant_admin','management','hr']::public.app_role[])
  )
);

create policy work_order_expenses_read
on public.work_order_expenses
for select to authenticated
using (
  private.object_session_active()
  and private.service_enabled(tenant_id, 'planning')
  and private.service_enabled(tenant_id, 'rapportage')
  and (
    personnel_id = private.current_personnel_id(tenant_id)
    or private.has_role(tenant_id, array['tenant_admin','management','planner','finance']::public.app_role[])
  )
);

-- Direct self-service availability writes used to be possible through the
-- Data API.  Managers retain their existing capability; staff must use the
-- guarded preferences RPC below.
drop policy if exists availability_insert_self_or_hr on public.availability;
drop policy if exists availability_update_self_or_hr on public.availability;
drop policy if exists availability_insert_management_hr on public.availability;
drop policy if exists availability_update_management_hr on public.availability;
drop policy if exists availability_delete_management_hr on public.availability;

create policy availability_insert_management_hr
on public.availability
for insert to authenticated
with check (
  private.object_session_active()
  and private.has_role(tenant_id, array['tenant_admin','management','hr']::public.app_role[])
);

create policy availability_update_management_hr
on public.availability
for update to authenticated
using (
  private.object_session_active()
  and private.has_role(tenant_id, array['tenant_admin','management','hr']::public.app_role[])
)
with check (
  private.object_session_active()
  and private.has_role(tenant_id, array['tenant_admin','management','hr']::public.app_role[])
);

create policy availability_delete_management_hr
on public.availability
for delete to authenticated
using (
  private.object_session_active()
  and private.has_role(tenant_id, array['tenant_admin','management','hr']::public.app_role[])
);

create or replace function private.require_staff_personnel(target_tenant uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  staff_personnel_id uuid;
begin
  if not private.object_session_active()
    or not exists (select 1 from public.tenants t where t.id = target_tenant and t.status = 'active')
    or not private.has_role(target_tenant, array['staff']::public.app_role[])
    or not private.service_enabled(target_tenant, 'personeel')
  then
    raise exception 'Personeelstoegang vereist' using errcode = '42501';
  end if;

  select p.id
  into staff_personnel_id
  from public.personnel p
  where p.tenant_id = target_tenant
    and p.user_id = auth.uid()
    and p.status = 'active';

  if staff_personnel_id is null then
    raise exception 'Geen actief personeelsdossier' using errcode = '42501';
  end if;
  return staff_personnel_id;
end;
$$;

revoke all on function private.require_staff_personnel(uuid) from public, anon, authenticated, service_role;
grant execute on function private.require_staff_personnel(uuid) to postgres;

create or replace function private.staff_normalize_address(value jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  street text;
  house_number text;
  postal_code text;
  city text;
  country text;
  compact_postcode text;
begin
  if value is null
    or jsonb_typeof(value) <> 'object'
    or value - array['street','street_name','house_number','postal_code','postalCode','city','country'] <> '{}'::jsonb
  then
    return jsonb_build_object('__invalid', true);
  end if;
  street := regexp_replace(btrim(coalesce(value ->> 'street', value ->> 'street_name', '')), '\s+', ' ', 'g');
  house_number := regexp_replace(btrim(coalesce(value ->> 'house_number', '')), '\s+', ' ', 'g');
  postal_code := regexp_replace(btrim(coalesce(value ->> 'postal_code', value ->> 'postalCode', '')), '\s+', ' ', 'g');
  city := regexp_replace(btrim(coalesce(value ->> 'city', '')), '\s+', ' ', 'g');
  country := regexp_replace(btrim(coalesce(value ->> 'country', '')), '\s+', ' ', 'g');

  if lower(country) in ('nl','nederland','netherlands') then
    compact_postcode := upper(regexp_replace(postal_code, '\s+', '', 'g'));
    if compact_postcode !~ '^[0-9]{4}[A-Z]{2}$' then
      return jsonb_build_object('__invalid', true);
    end if;
    postal_code := substring(compact_postcode from 1 for 4) || ' ' || substring(compact_postcode from 5 for 2);
    country := 'NL';
  end if;

  if length(street) not between 1 and 200
    or length(house_number) > 30
    or length(postal_code) not between 1 and 20
    or length(city) not between 1 and 120
    or length(country) not between 1 and 80
  then
    return jsonb_build_object('__invalid', true);
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'street', street,
    'house_number', nullif(house_number, ''),
    'postal_code', postal_code,
    'city', city,
    'country', country
  ));
end;
$$;

create or replace function private.staff_home_address_complete(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select not (
    private.staff_normalize_address(
      value - array['latitude','longitude','status','source','source_id','bag_id','located_at']
    ) ? '__invalid'
  );
$$;

revoke all on function private.staff_normalize_address(jsonb) from public, anon, authenticated, service_role;
grant execute on function private.staff_normalize_address(jsonb) to postgres;
revoke all on function private.staff_home_address_complete(jsonb) from public, anon, authenticated, service_role;
grant execute on function private.staff_home_address_complete(jsonb) to postgres;

create or replace function private.staff_normalize_profile_payload(value jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  result jsonb := value - array['profile','transport','notifications','availability'];
  profile jsonb := value -> 'profile';
  transport jsonb := value -> 'transport';
  address jsonb;
  full_name text;
  vehicle text;
  departure text;
begin
  if value ? 'profile' then
    if jsonb_typeof(profile) <> 'object'
      or profile - array[
        'fullName','firstName','lastName','preferredName','phone','mobilePhone',
        'secondaryPhone','birthDate','homeAddress','emergencyContact'
      ] <> '{}'::jsonb
    then
      return result || jsonb_build_object('__invalid_nested_profile', true);
    end if;

    result := result || (profile - array[
      'firstName','lastName','phone','mobilePhone','secondaryPhone',
      'homeAddress','emergencyContact'
    ]);
    if profile ? 'fullName' then
      full_name := profile ->> 'fullName';
    elsif profile ? 'firstName' or profile ? 'lastName' then
      full_name := btrim(concat_ws(' ', profile ->> 'firstName', profile ->> 'lastName'));
    end if;
    if full_name is not null then result := result || jsonb_build_object('fullName', full_name); end if;

    if profile ? 'mobilePhone' then
      result := result || jsonb_build_object('mobilePhone', profile -> 'mobilePhone');
    end if;
    if profile ? 'secondaryPhone' then
      result := result || jsonb_build_object('phone', profile -> 'secondaryPhone');
    elsif profile ? 'phone' then
      result := result || jsonb_build_object('phone', profile -> 'phone');
    end if;

    if profile ? 'homeAddress' then
      address := profile -> 'homeAddress';
      address := private.staff_normalize_address(address);
      if address ? '__invalid' then
        return result || jsonb_build_object('__invalid_nested_address', true);
      end if;
      result := result || jsonb_build_object('homeAddress', address);
    end if;
    if profile ? 'emergencyContact' then
      result := result || jsonb_build_object('emergencyContact', profile -> 'emergencyContact');
    end if;
  end if;

  if value ? 'transport' then
    if jsonb_typeof(transport) <> 'object'
      or transport - array[
        'standardVehicle','primaryTransportType','vehicle','drivingLicense',
        'validDrivingLicense','drivingLicenseCategories','carpoolAllowed',
        'willingToCarpool','departureKind','departureSameAsHome',
        'departureDepotId','alternateDepartureAddress','departureLocation',
        'returnToDeparture','ownTransport','limitations','travelLimitations'
      ] <> '{}'::jsonb
    then
      return result || jsonb_build_object('__invalid_nested_transport', true);
    end if;

    vehicle := coalesce(
      transport ->> 'standardVehicle',
      transport ->> 'primaryTransportType',
      transport ->> 'vehicle'
    );
    if transport ? 'standardVehicle' or transport ? 'primaryTransportType' or transport ? 'vehicle' then
      result := result || jsonb_build_object('standardVehicle', vehicle);
    end if;
    if transport ? 'drivingLicense' then
      result := result || jsonb_build_object('drivingLicense', transport -> 'drivingLicense');
    elsif transport ? 'validDrivingLicense' then
      result := result || jsonb_build_object('drivingLicense', transport -> 'validDrivingLicense');
    end if;
    if transport ? 'drivingLicenseCategories' then
      result := result || jsonb_build_object('drivingLicenseCategories', transport -> 'drivingLicenseCategories');
    end if;
    if transport ? 'carpoolAllowed' then
      result := result || jsonb_build_object('carpoolAllowed', transport -> 'carpoolAllowed');
    elsif transport ? 'willingToCarpool' then
      result := result || jsonb_build_object('carpoolAllowed', transport -> 'willingToCarpool');
    end if;
    if transport ? 'ownTransport' then
      result := result || jsonb_build_object('ownTransport', transport -> 'ownTransport');
    end if;
    if transport ? 'limitations' then
      result := result || jsonb_build_object('travelLimitations', transport -> 'limitations');
    elsif transport ? 'travelLimitations' then
      result := result || jsonb_build_object('travelLimitations', transport -> 'travelLimitations');
    end if;

    departure := transport ->> 'departureKind';
    if departure is null and transport ? 'departureSameAsHome' then
      departure := case when (transport ->> 'departureSameAsHome')::boolean then 'home' else 'custom' end;
    end if;
    if departure = 'alternate' then departure := 'custom'; end if;
    if departure is not null then result := result || jsonb_build_object('departureKind', departure); end if;
    if transport ? 'departureDepotId' then
      result := result || jsonb_build_object('departureDepotId', transport -> 'departureDepotId');
    end if;
    if transport ? 'alternateDepartureAddress' then
      result := result || jsonb_build_object('alternateDepartureAddress', transport -> 'alternateDepartureAddress');
    elsif transport ? 'departureLocation' then
      result := result || jsonb_build_object(
        'alternateDepartureAddress',
        jsonb_build_object('street', transport ->> 'departureLocation')
      );
    end if;
    if transport ? 'returnToDeparture' then
      result := result || jsonb_build_object('returnToDeparture', transport -> 'returnToDeparture');
    end if;
  end if;

  if result ? 'homeAddress' then
    address := result -> 'homeAddress';
    address := private.staff_normalize_address(address);
    if address ? '__invalid' then
      return result || jsonb_build_object('__invalid_home_address', true);
    end if;
    result := result || jsonb_build_object('homeAddress', address);
  end if;
  if result ? 'alternateDepartureAddress' and result -> 'alternateDepartureAddress' <> 'null'::jsonb then
    address := result -> 'alternateDepartureAddress';
    address := private.staff_normalize_address(address);
    if address ? '__invalid' then
      return result || jsonb_build_object('__invalid_alternate_address', true);
    end if;
    result := result || jsonb_build_object('alternateDepartureAddress', address);
  end if;

  if value ? 'notifications' then
    if jsonb_typeof(value -> 'notifications') <> 'object' then
      return result || jsonb_build_object('__invalid_nested_notifications', true);
    end if;
    result := result || jsonb_build_object('notificationPreferences', value -> 'notifications');
  end if;
  if value ? 'availability' then
    if jsonb_typeof(value -> 'availability') <> 'object' then
      return result || jsonb_build_object('__invalid_nested_availability', true);
    end if;
    result := result || jsonb_build_object('availabilityPreferences', value -> 'availability');
  end if;
  return result;
end;
$$;

revoke all on function private.staff_normalize_profile_payload(jsonb) from public, anon, authenticated, service_role;
grant execute on function private.staff_normalize_profile_payload(jsonb) to postgres;

create or replace function public.staff_update_profile(
  target_tenant uuid,
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  personnel_id uuid;
  current_person public.personnel;
  updated_person public.personnel;
  categories text[];
  next_driving_license boolean;
  next_departure_kind text;
  next_departure_depot uuid;
  next_home jsonb;
  next_alternate jsonb;
  next_availability jsonb;
begin
  personnel_id := private.require_staff_personnel(target_tenant);
  if jsonb_typeof(input) <> 'object' then
    raise exception 'Ongeldige profielinvoer' using errcode = '23514';
  end if;
  input := private.staff_normalize_profile_payload(input);
  if input - array[
      'version','fullName','preferredName','phone','mobilePhone','birthDate',
      'homeAddress','emergencyContact','standardVehicle','departureKind',
      'departureDepotId','alternateDepartureAddress','returnToDeparture',
      'drivingLicense','drivingLicenseCategories','carpoolAllowed',
      'ownTransport','travelLimitations','notificationPreferences','availabilityPreferences'
    ] <> '{}'::jsonb
  then
    raise exception 'Ongeldige profielinvoer' using errcode = '23514';
  end if;

  select *
  into current_person
  from public.personnel p
  where p.tenant_id = target_tenant and p.id = personnel_id
  for update;

  if input ->> 'version' is null
    or current_person.version is distinct from (input ->> 'version')::bigint
  then
    raise exception 'Je profiel is intussen gewijzigd. Laad het opnieuw.' using errcode = '40001';
  end if;

  if not (input ?| array[
    'fullName','preferredName','phone','mobilePhone','birthDate','homeAddress',
    'emergencyContact','standardVehicle','departureKind','departureDepotId',
    'alternateDepartureAddress','returnToDeparture','drivingLicense',
    'drivingLicenseCategories','carpoolAllowed','ownTransport','travelLimitations','notificationPreferences',
    'availabilityPreferences'
  ]) then
    raise exception 'Er zijn geen profielwijzigingen aangeleverd' using errcode = '23514';
  end if;

  if input ? 'fullName'
    and length(btrim(coalesce(input ->> 'fullName', ''))) not between 2 and 160
  then
    raise exception 'Vul een geldige naam in' using errcode = '23514';
  end if;
  if input ? 'preferredName'
    and input -> 'preferredName' <> 'null'::jsonb
    and btrim(input ->> 'preferredName') <> ''
    and length(btrim(input ->> 'preferredName')) not between 1 and 120
  then
    raise exception 'Vul een geldige roepnaam in' using errcode = '23514';
  end if;
  if input ? 'phone'
    and input -> 'phone' <> 'null'::jsonb
    and btrim(input ->> 'phone') <> ''
    and btrim(input ->> 'phone') !~ '^\+?[0-9 ().-]{7,40}$'
  then
    raise exception 'Vul een geldig telefoonnummer in' using errcode = '23514';
  end if;
  if input ? 'mobilePhone'
    and input -> 'mobilePhone' <> 'null'::jsonb
    and btrim(input ->> 'mobilePhone') <> ''
    and btrim(input ->> 'mobilePhone') !~ '^\+?[0-9 ().-]{7,40}$'
  then
    raise exception 'Vul een geldig mobiel nummer in' using errcode = '23514';
  end if;
  if input ? 'birthDate'
    and input -> 'birthDate' <> 'null'::jsonb
    and nullif(input ->> 'birthDate', '') is not null
    and (
      (input ->> 'birthDate')::date < date '1900-01-01'
      or (input ->> 'birthDate')::date > current_date
    )
  then
    raise exception 'Vul een geldige geboortedatum in' using errcode = '23514';
  end if;
  if input ? 'homeAddress'
    and not private.staff_home_address_complete(input -> 'homeAddress')
  then
    raise exception 'Vul een geldig woonadres in' using errcode = '23514';
  end if;
  if input ? 'emergencyContact'
    and (
      jsonb_typeof(input -> 'emergencyContact') <> 'object'
      or octet_length((input -> 'emergencyContact')::text) > 4000
    )
  then
    raise exception 'Vul een geldig noodcontact in' using errcode = '23514';
  end if;
  if input ? 'notificationPreferences'
    and (
      jsonb_typeof(input -> 'notificationPreferences') <> 'object'
      or octet_length((input -> 'notificationPreferences')::text) > 16000
    )
  then
    raise exception 'Ongeldige meldingsvoorkeuren' using errcode = '23514';
  end if;
  if input ? 'travelLimitations'
    and input -> 'travelLimitations' <> 'null'::jsonb
    and (
      jsonb_typeof(input -> 'travelLimitations') <> 'string'
      or length(btrim(input ->> 'travelLimitations')) > 1000
    )
  then
    raise exception 'Bijzonderheden onderweg zijn te lang' using errcode = '23514';
  end if;
  if (input ? 'ownTransport' and jsonb_typeof(input -> 'ownTransport') <> 'boolean')
    or (input ? 'returnToDeparture' and jsonb_typeof(input -> 'returnToDeparture') <> 'boolean')
    or (input ? 'drivingLicense' and jsonb_typeof(input -> 'drivingLicense') <> 'boolean')
    or (input ? 'carpoolAllowed' and jsonb_typeof(input -> 'carpoolAllowed') <> 'boolean')
  then
    raise exception 'Ongeldige vervoerskeuze' using errcode = '23514';
  end if;
  if input ? 'availabilityPreferences' and not current_person.availability_self_service_enabled then
    raise exception 'Beschikbaarheid is niet vrijgegeven door management' using errcode = '42501';
  end if;

  next_availability := case
    when input ? 'availabilityPreferences' then input -> 'availabilityPreferences'
    else current_person.availability_preferences
  end;
  if not private.staff_availability_preferences_valid(
    next_availability,
    input ? 'availabilityPreferences'
  ) then
    raise exception 'Kies minimaal één geldig beschikbaar tijdvak en een dienstvoorkeur' using errcode = '23514';
  end if;

  if input ? 'drivingLicenseCategories' then
    if jsonb_typeof(input -> 'drivingLicenseCategories') <> 'array' then
      raise exception 'Ongeldige rijbewijscategorieën' using errcode = '23514';
    end if;
    select coalesce(array_agg(distinct upper(btrim(value)) order by upper(btrim(value))), '{}'::text[])
    into categories
    from jsonb_array_elements_text(input -> 'drivingLicenseCategories');
  else
    categories := current_person.driving_license_categories;
  end if;
  next_driving_license := case
    when input ? 'drivingLicense' then (input ->> 'drivingLicense')::boolean
    else current_person.driving_license
  end;
  if not private.staff_text_array_valid(categories, 12, 10) then
    raise exception 'Gebruik maximaal twaalf geldige rijbewijscategorieën' using errcode = '23514';
  end if;
  if not next_driving_license then categories := '{}'::text[]; end if;

  next_departure_kind := case
    when input ? 'departureKind' then nullif(input ->> 'departureKind', '')
    else current_person.departure_kind
  end;
  next_departure_depot := case
    when input ? 'departureDepotId' then nullif(input ->> 'departureDepotId', '')::uuid
    else current_person.departure_depot_id
  end;
  next_home := case
    when input ? 'homeAddress' then input -> 'homeAddress'
    else current_person.home_address
  end;
  next_alternate := case
    when input ? 'alternateDepartureAddress' then input -> 'alternateDepartureAddress'
    else current_person.alternate_departure_address
  end;

  if input ? 'standardVehicle'
    and nullif(input ->> 'standardVehicle', '') is not null
    and input ->> 'standardVehicle' not in (
      'car','van','motorcycle','scooter','electric_bicycle','bicycle',
      'public_transport','walking','other'
    )
  then
    raise exception 'Kies een geldig vervoermiddel' using errcode = '23514';
  end if;
  if next_departure_kind is not null and next_departure_kind not in ('home','depot','custom') then
    raise exception 'Kies een geldige vertreklocatie' using errcode = '23514';
  end if;
  if next_departure_kind = 'depot'
    and (
      next_departure_depot is null
      or not exists (
        select 1 from public.travel_depots d
        where d.tenant_id = target_tenant and d.id = next_departure_depot and d.active
      )
    )
  then
    raise exception 'Kies een actief depot' using errcode = '23514';
  end if;
  if next_departure_kind = 'home' and not private.staff_home_address_complete(next_home) then
    raise exception 'Vul eerst een volledig woonadres in' using errcode = '23514';
  end if;
  if next_departure_kind = 'custom'
    and not private.staff_home_address_complete(next_alternate)
  then
    raise exception 'Vul een afwijkende vertreklocatie in' using errcode = '23514';
  end if;

  update public.personnel
  set full_name = case when input ? 'fullName' then btrim(input ->> 'fullName') else full_name end,
      preferred_name = case when input ? 'preferredName' then nullif(btrim(input ->> 'preferredName'), '') else preferred_name end,
      phone = case when input ? 'phone' then nullif(btrim(input ->> 'phone'), '') else phone end,
      mobile_phone = case when input ? 'mobilePhone' then nullif(btrim(input ->> 'mobilePhone'), '') else mobile_phone end,
      birth_date = case when input ? 'birthDate' then nullif(input ->> 'birthDate', '')::date else birth_date end,
      home_address = next_home,
      emergency_contact = case when input ? 'emergencyContact' then input -> 'emergencyContact' else emergency_contact end,
      standard_vehicle = case when input ? 'standardVehicle' then nullif(input ->> 'standardVehicle', '') else standard_vehicle end,
      departure_kind = next_departure_kind,
      departure_depot_id = case when next_departure_kind = 'depot' then next_departure_depot else null end,
      alternate_departure_address = case when next_departure_kind = 'custom' then next_alternate else '{}'::jsonb end,
      return_to_departure = case when input ? 'returnToDeparture' then (input ->> 'returnToDeparture')::boolean else return_to_departure end,
      driving_license = next_driving_license,
      driving_license_categories = categories,
      carpool_allowed = case when input ? 'carpoolAllowed' then (input ->> 'carpoolAllowed')::boolean else carpool_allowed end,
      own_transport = case when input ? 'ownTransport' then (input ->> 'ownTransport')::boolean else own_transport end,
      travel_limitations = case when input ? 'travelLimitations' then nullif(btrim(input ->> 'travelLimitations'), '') else travel_limitations end,
      notification_preferences = case when input ? 'notificationPreferences' then input -> 'notificationPreferences' else notification_preferences end,
      availability_preferences = next_availability
  where tenant_id = target_tenant and id = personnel_id
  returning * into updated_person;

  insert into public.audit_events (
    tenant_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    target_tenant, auth.uid(), 'staff.profile.updated', 'personnel', personnel_id,
    jsonb_build_object('version', current_person.version),
    jsonb_build_object(
      'version', updated_person.version,
      'fields', (
        select coalesce(jsonb_agg(keys.key order by keys.key), '[]'::jsonb)
        from jsonb_object_keys(input - 'version') as keys(key)
      )
    )
  );

  return to_jsonb(updated_person);
end;
$$;

create or replace function public.staff_save_onboarding(
  target_tenant uuid,
  input jsonb,
  complete boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  personnel_id uuid;
  current_person public.personnel;
  updated_person public.personnel;
  categories text[];
  next_driving_license boolean;
  next_step integer;
  max_step integer;
  next_home jsonb;
  next_availability jsonb;
  next_notification jsonb;
  next_draft jsonb;
  notification_payload jsonb;
  notification_request_hash text;
begin
  personnel_id := private.require_staff_personnel(target_tenant);
  if jsonb_typeof(input) <> 'object' then
    raise exception 'Ongeldige onboardinginvoer' using errcode = '23514';
  end if;
  if complete and jsonb_typeof(input -> 'draft') = 'object' then
    -- Intermediate steps persist the complete draft without copying unfinished
    -- fields into the canonical personnel record. Completion promotes and
    -- validates every canonical section atomically.
    if jsonb_typeof(input #> '{draft,profile}') = 'object' then
      input := input || jsonb_build_object('profile', input #> '{draft,profile}');
    end if;
    if jsonb_typeof(input #> '{draft,transport}') = 'object' then
      input := input || jsonb_build_object('transport', input #> '{draft,transport}');
    end if;
    if jsonb_typeof(input #> '{draft,notifications}') = 'object' then
      input := input || jsonb_build_object('notifications', input #> '{draft,notifications}');
    end if;
    if jsonb_typeof(input #> '{draft,availability}') = 'object' then
      input := input || jsonb_build_object('availability', input #> '{draft,availability}');
    end if;
  end if;
  if input ? 'version' and not input ? 'onboardingVersion' then
    input := (input - 'version') || jsonb_build_object('onboardingVersion', input -> 'version');
  end if;
  input := private.staff_normalize_profile_payload(input);
  if input - array[
      'onboardingVersion','personnelVersion','step','draft','fullName','preferredName','phone',
      'mobilePhone','birthDate','homeAddress','emergencyContact',
      'standardVehicle','departureKind','departureDepotId',
      'alternateDepartureAddress','returnToDeparture','drivingLicense',
      'drivingLicenseCategories','carpoolAllowed','ownTransport','travelLimitations','notificationPreferences',
      'availabilityPreferences'
    ] <> '{}'::jsonb
  then
    raise exception 'Ongeldige onboardinginvoer' using errcode = '23514';
  end if;

  select *
  into current_person
  from public.personnel p
  where p.tenant_id = target_tenant and p.id = personnel_id
  for update;

  if current_person.onboarding_completed_at is not null then
    if complete then return to_jsonb(current_person); end if;
    raise exception 'Onboarding is al afgerond; gebruik profielinstellingen' using errcode = '23514';
  end if;
  if input ->> 'onboardingVersion' is null
    or current_person.onboarding_version is distinct from (input ->> 'onboardingVersion')::bigint
    or input ->> 'personnelVersion' is null
    or current_person.version is distinct from (input ->> 'personnelVersion')::bigint
  then
    raise exception 'Je onboarding is intussen gewijzigd. Laad hem opnieuw.' using errcode = '40001';
  end if;

  if not current_person.availability_self_service_enabled then
    -- The draft may contain a client-side placeholder, but without the
    -- management capability it must never overwrite managed availability.
    input := input - 'availabilityPreferences';
  end if;
  max_step := case when current_person.availability_self_service_enabled then 6 else 5 end;
  next_step := case
    when nullif(input ->> 'step', '') is null then current_person.onboarding_step
    else (input ->> 'step')::integer + 1
  end;
  if next_step not between 1 and max_step then
    raise exception 'Ongeldige onboardingstap' using errcode = '23514';
  end if;
  if input ? 'draft'
    and (
      jsonb_typeof(input -> 'draft') <> 'object'
      or octet_length((input -> 'draft')::text) > 32768
      or (input -> 'draft') ?| array['email','personalEmail','loginEmail']
    )
  then
    raise exception 'Ongeldig onboardingconcept' using errcode = '23514';
  end if;

  if input ? 'fullName'
    and length(btrim(coalesce(input ->> 'fullName', ''))) not between 2 and 160
  then
    raise exception 'Vul een geldige naam in' using errcode = '23514';
  end if;
  if input ? 'mobilePhone'
    and input -> 'mobilePhone' <> 'null'::jsonb
    and btrim(input ->> 'mobilePhone') <> ''
    and btrim(input ->> 'mobilePhone') !~ '^\+?[0-9 ().-]{7,40}$'
  then
    raise exception 'Vul een geldig mobiel nummer in' using errcode = '23514';
  end if;
  if input ? 'phone'
    and input -> 'phone' <> 'null'::jsonb
    and btrim(input ->> 'phone') <> ''
    and btrim(input ->> 'phone') !~ '^\+?[0-9 ().-]{7,40}$'
  then
    raise exception 'Vul een geldig telefoonnummer in' using errcode = '23514';
  end if;
  if input ? 'birthDate'
    and input -> 'birthDate' <> 'null'::jsonb
    and nullif(input ->> 'birthDate', '') is not null
    and (
      (input ->> 'birthDate')::date < date '1900-01-01'
      or (input ->> 'birthDate')::date > current_date
    )
  then
    raise exception 'Vul een geldige geboortedatum in' using errcode = '23514';
  end if;
  if input ? 'homeAddress'
    and not private.staff_home_address_complete(input -> 'homeAddress')
  then
    raise exception 'Vul een geldig woonadres in' using errcode = '23514';
  end if;
  if input ? 'emergencyContact'
    and (
      jsonb_typeof(input -> 'emergencyContact') <> 'object'
      or octet_length((input -> 'emergencyContact')::text) > 4000
    )
  then
    raise exception 'Vul een geldig noodcontact in' using errcode = '23514';
  end if;
  if input ? 'notificationPreferences'
    and (
      jsonb_typeof(input -> 'notificationPreferences') <> 'object'
      or octet_length((input -> 'notificationPreferences')::text) > 16000
    )
  then
    raise exception 'Ongeldige meldingsvoorkeuren' using errcode = '23514';
  end if;
  if input ? 'travelLimitations'
    and input -> 'travelLimitations' <> 'null'::jsonb
    and (
      jsonb_typeof(input -> 'travelLimitations') <> 'string'
      or length(btrim(input ->> 'travelLimitations')) > 1000
    )
  then
    raise exception 'Bijzonderheden onderweg zijn te lang' using errcode = '23514';
  end if;
  if (input ? 'ownTransport' and jsonb_typeof(input -> 'ownTransport') <> 'boolean')
    or (input ? 'returnToDeparture' and jsonb_typeof(input -> 'returnToDeparture') <> 'boolean')
    or (input ? 'drivingLicense' and jsonb_typeof(input -> 'drivingLicense') <> 'boolean')
    or (input ? 'carpoolAllowed' and jsonb_typeof(input -> 'carpoolAllowed') <> 'boolean')
  then
    raise exception 'Ongeldige vervoerskeuze' using errcode = '23514';
  end if;
  if input ? 'drivingLicenseCategories' then
    if jsonb_typeof(input -> 'drivingLicenseCategories') <> 'array' then
      raise exception 'Ongeldige rijbewijscategorieën' using errcode = '23514';
    end if;
    select coalesce(array_agg(distinct upper(btrim(value)) order by upper(btrim(value))), '{}'::text[])
    into categories
    from jsonb_array_elements_text(input -> 'drivingLicenseCategories');
  else
    categories := current_person.driving_license_categories;
  end if;
  next_driving_license := case
    when input ? 'drivingLicense' then (input ->> 'drivingLicense')::boolean
    else current_person.driving_license
  end;
  if not private.staff_text_array_valid(categories, 12, 10) then
    raise exception 'Gebruik maximaal twaalf geldige rijbewijscategorieën' using errcode = '23514';
  end if;
  if not next_driving_license then categories := '{}'::text[]; end if;

  if input ? 'standardVehicle'
    and nullif(input ->> 'standardVehicle', '') is not null
    and input ->> 'standardVehicle' not in (
      'car','van','motorcycle','scooter','electric_bicycle','bicycle',
      'public_transport','walking','other'
    )
  then
    raise exception 'Kies een geldig vervoermiddel' using errcode = '23514';
  end if;
  if input ? 'departureKind'
    and nullif(input ->> 'departureKind', '') is not null
    and input ->> 'departureKind' not in ('home','depot','custom')
  then
    raise exception 'Kies een geldige vertreklocatie' using errcode = '23514';
  end if;
  if coalesce(nullif(input ->> 'departureKind', ''), current_person.departure_kind) = 'depot'
    and (
      coalesce(nullif(input ->> 'departureDepotId', '')::uuid, current_person.departure_depot_id) is null
      or not exists (
        select 1 from public.travel_depots d
        where d.tenant_id = target_tenant
          and d.id = coalesce(nullif(input ->> 'departureDepotId', '')::uuid, current_person.departure_depot_id)
          and d.active
      )
    )
  then
    raise exception 'Kies een actief depot' using errcode = '23514';
  end if;
  if coalesce(nullif(input ->> 'departureKind', ''), current_person.departure_kind) = 'custom'
    and (
      not input ? 'alternateDepartureAddress'
      or input -> 'alternateDepartureAddress' = 'null'::jsonb
      or not private.staff_home_address_complete(input -> 'alternateDepartureAddress')
    )
  then
    raise exception 'Vul een afwijkende vertreklocatie in' using errcode = '23514';
  end if;

  next_home := case when input ? 'homeAddress' then input -> 'homeAddress' else current_person.home_address end;
  next_availability := case
    when input ? 'availabilityPreferences' then input -> 'availabilityPreferences'
    else current_person.availability_preferences
  end;
  next_notification := case
    when input ? 'notificationPreferences' then input -> 'notificationPreferences'
    else current_person.notification_preferences
  end;
  next_draft := case
    when input ? 'draft' then
      (input -> 'draft')
        #- '{profile,email}'
        #- '{profile,personalEmail}'
        #- '{profile,loginEmail}'
    else current_person.onboarding_draft
  end;

  if current_person.availability_self_service_enabled
    and (input ? 'availabilityPreferences' or complete)
    and not private.staff_availability_preferences_valid(next_availability, true)
  then
    raise exception 'Kies minimaal één geldig beschikbaar tijdvak en een dienstvoorkeur' using errcode = '23514';
  end if;

  if complete and (
    length(btrim(coalesce(input ->> 'fullName', current_person.full_name, ''))) < 2
    or length(btrim(coalesce(input ->> 'mobilePhone', current_person.mobile_phone, ''))) < 7
    or not private.staff_home_address_complete(next_home)
    or next_notification = '{}'::jsonb
    or coalesce((next_draft #>> '{confirmations,details}')::boolean, false) is not true
    or coalesce((next_draft #>> '{confirmations,notifications}')::boolean, false) is not true
    or coalesce((next_draft #>> '{confirmations,privacy}')::boolean, false) is not true
    or coalesce((next_draft #>> '{confirmations,terms}')::boolean, false) is not true
    or (
      current_person.availability_self_service_enabled
      and coalesce((next_draft #>> '{confirmations,availability}')::boolean, false) is not true
    )
  ) then
    raise exception 'Vul profiel, adres, meldingskeuzes en bevestigingen volledig in' using errcode = '23514';
  end if;

  if complete then
    notification_payload := jsonb_build_object(
      'expected_revision', nullif(next_notification ->> 'version', '')::bigint,
      'email', next_notification -> 'email',
      'push', next_notification -> 'push',
      'quiet_enabled', next_notification -> 'quietEnabled',
      'quiet_start', next_notification -> 'quietStart',
      'quiet_end', next_notification -> 'quietEnd',
      'timezone', next_notification -> 'timezone',
      'types', next_notification -> 'types'
    );
    notification_request_hash := md5(
      'staff-onboarding-notifications:' || target_tenant::text || ':' ||
      personnel_id::text || ':' || current_person.onboarding_version::text
    );
    perform public.notification_command(
      target_tenant,
      'staff',
      'preferences_save',
      notification_payload,
      (
        substring(notification_request_hash from 1 for 8) || '-' ||
        substring(notification_request_hash from 9 for 4) || '-' ||
        substring(notification_request_hash from 13 for 4) || '-' ||
        substring(notification_request_hash from 17 for 4) || '-' ||
        substring(notification_request_hash from 21 for 12)
      )::uuid
    );
  end if;

  update public.personnel
  set full_name = case when input ? 'fullName' then btrim(input ->> 'fullName') else full_name end,
      preferred_name = case when input ? 'preferredName' then nullif(btrim(input ->> 'preferredName'), '') else preferred_name end,
      phone = case when input ? 'phone' then nullif(btrim(input ->> 'phone'), '') else phone end,
      mobile_phone = case
        when input ? 'mobilePhone' then nullif(btrim(input ->> 'mobilePhone'), '')
        else mobile_phone
      end,
      birth_date = case when input ? 'birthDate' then nullif(input ->> 'birthDate', '')::date else birth_date end,
      home_address = next_home,
      emergency_contact = case when input ? 'emergencyContact' then input -> 'emergencyContact' else emergency_contact end,
      standard_vehicle = case when input ? 'standardVehicle' then nullif(input ->> 'standardVehicle', '') else standard_vehicle end,
      departure_kind = case when input ? 'departureKind' then nullif(input ->> 'departureKind', '') else departure_kind end,
      departure_depot_id = case
        when coalesce(nullif(input ->> 'departureKind', ''), departure_kind) = 'depot'
          then coalesce(nullif(input ->> 'departureDepotId', '')::uuid, departure_depot_id)
        else null
      end,
      alternate_departure_address = case
        when coalesce(nullif(input ->> 'departureKind', ''), departure_kind) = 'custom'
          then case when input ? 'alternateDepartureAddress' then input -> 'alternateDepartureAddress' else alternate_departure_address end
        else '{}'::jsonb
      end,
      return_to_departure = case when input ? 'returnToDeparture' then (input ->> 'returnToDeparture')::boolean else return_to_departure end,
      driving_license = next_driving_license,
      driving_license_categories = categories,
      carpool_allowed = case when input ? 'carpoolAllowed' then (input ->> 'carpoolAllowed')::boolean else carpool_allowed end,
      own_transport = case when input ? 'ownTransport' then (input ->> 'ownTransport')::boolean else own_transport end,
      travel_limitations = case when input ? 'travelLimitations' then nullif(btrim(input ->> 'travelLimitations'), '') else travel_limitations end,
      notification_preferences = next_notification,
      availability_preferences = next_availability,
      onboarding_draft = next_draft,
      onboarding_step = case when complete then max_step else next_step end,
      onboarding_completed_at = case when complete then clock_timestamp() else null end,
      onboarding_version = onboarding_version + 1
  where tenant_id = target_tenant and id = personnel_id
  returning * into updated_person;

  insert into public.audit_events (
    tenant_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    target_tenant, auth.uid(),
    case when complete then 'staff.onboarding.completed' else 'staff.onboarding.saved' end,
    'personnel', personnel_id,
    jsonb_build_object('step', current_person.onboarding_step, 'version', current_person.onboarding_version),
    jsonb_build_object('step', updated_person.onboarding_step, 'version', updated_person.onboarding_version)
  );

  return to_jsonb(updated_person);
end;
$$;

create or replace function public.staff_update_availability(
  target_tenant uuid,
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  personnel_id uuid;
  current_person public.personnel;
  updated_person public.personnel;
  preferences jsonb;
begin
  personnel_id := private.require_staff_personnel(target_tenant);
  if jsonb_typeof(input) <> 'object' then
    raise exception 'Ongeldige beschikbaarheidsinvoer' using errcode = '23514';
  end if;
  if input ? 'preferences' then
    if input - array['version','preferences'] <> '{}'::jsonb
      or jsonb_typeof(input -> 'preferences') <> 'object'
    then
      raise exception 'Ongeldige beschikbaarheidsinvoer' using errcode = '23514';
    end if;
    preferences := input -> 'preferences';
  else
    preferences := input - 'version';
  end if;

  select *
  into current_person
  from public.personnel p
  where p.tenant_id = target_tenant and p.id = personnel_id
  for update;

  if not current_person.availability_self_service_enabled then
    raise exception 'Beschikbaarheid is niet vrijgegeven door management' using errcode = '42501';
  end if;
  if input ->> 'version' is null
    or current_person.version is distinct from (input ->> 'version')::bigint
  then
    raise exception 'Je beschikbaarheid is intussen gewijzigd. Laad haar opnieuw.' using errcode = '40001';
  end if;

  if not private.staff_availability_preferences_valid(preferences, true) then
    raise exception 'Kies minimaal één geldig beschikbaar tijdvak en een dienstvoorkeur' using errcode = '23514';
  end if;

  update public.personnel
  set availability_preferences = preferences
  where tenant_id = target_tenant and id = personnel_id
  returning * into updated_person;

  insert into public.audit_events (
    tenant_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    target_tenant, auth.uid(), 'staff.availability.updated', 'personnel', personnel_id,
    jsonb_build_object('version', current_person.version),
    jsonb_build_object('version', updated_person.version)
  );

  return jsonb_build_object(
    'personnel_id', personnel_id,
    'availability_preferences', updated_person.availability_preferences,
    'version', updated_person.version
  );
end;
$$;

create or replace function private.staff_leave_minutes_by_year(
  target_tenant uuid,
  target_personnel uuid,
  starts_on date,
  ends_on date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  business_days integer;
  matched_days integer;
  allocation jsonb;
begin
  if target_tenant is null or target_personnel is null or starts_on is null
    or ends_on is null or ends_on < starts_on
  then
    return '{}'::jsonb;
  end if;

  select
    count(*) filter (where extract(isodow from day_value) between 1 and 5),
    count(contract.id) filter (where extract(isodow from day_value) between 1 and 5)
  into business_days, matched_days
  from generate_series(starts_on, ends_on, interval '1 day') generated(day_value)
  left join lateral (
    select agreement.id
    from public.personnel_contracts agreement
    where agreement.tenant_id = target_tenant
      and agreement.personnel_id = target_personnel
      and agreement.active
      and agreement.hours_per_week > 0
      and agreement.starts_on <= day_value::date
      and (agreement.ends_on is null or agreement.ends_on >= day_value::date)
    order by agreement.starts_on desc, agreement.version desc, agreement.id
    limit 1
  ) contract on true;

  if business_days = 0 or matched_days <> business_days then
    return '{}'::jsonb;
  end if;

  select coalesce(
    jsonb_object_agg(yearly.calendar_year::text, yearly.total_minutes order by yearly.calendar_year),
    '{}'::jsonb
  )
  into allocation
  from (
    select
      extract(year from day_value)::integer as calendar_year,
      sum(round(contract.hours_per_week * 60 / 5.0))::integer as total_minutes
    from generate_series(starts_on, ends_on, interval '1 day') generated(day_value)
    join lateral (
      select agreement.hours_per_week
      from public.personnel_contracts agreement
      where agreement.tenant_id = target_tenant
        and agreement.personnel_id = target_personnel
        and agreement.active
        and agreement.hours_per_week > 0
        and agreement.starts_on <= day_value::date
        and (agreement.ends_on is null or agreement.ends_on >= day_value::date)
      order by agreement.starts_on desc, agreement.version desc, agreement.id
      limit 1
    ) contract on true
    where extract(isodow from day_value) between 1 and 5
    group by extract(year from day_value)::integer
  ) yearly;

  return allocation;
end;
$$;

create or replace function private.staff_leave_minutes_for_period(
  target_tenant uuid,
  target_personnel uuid,
  starts_on date,
  ends_on date
)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  business_days integer;
  matched_days integer;
  total_minutes integer;
begin
  if target_tenant is null or target_personnel is null or starts_on is null
    or ends_on is null or ends_on < starts_on
  then
    return null;
  end if;

  select
    count(*) filter (where extract(isodow from day_value) between 1 and 5),
    count(contract.id) filter (where extract(isodow from day_value) between 1 and 5),
    (sum(round(contract.hours_per_week * 60 / 5.0))
      filter (where extract(isodow from day_value) between 1 and 5))::integer
  into business_days, matched_days, total_minutes
  from generate_series(starts_on, ends_on, interval '1 day') generated(day_value)
  left join lateral (
    select agreement.id, agreement.hours_per_week
    from public.personnel_contracts agreement
    where agreement.tenant_id = target_tenant
      and agreement.personnel_id = target_personnel
      and agreement.active
      and agreement.hours_per_week > 0
      and agreement.starts_on <= day_value::date
      and (agreement.ends_on is null or agreement.ends_on >= day_value::date)
    order by agreement.starts_on desc, agreement.version desc, agreement.id
    limit 1
  ) contract on true;

  if business_days = 0 or matched_days <> business_days or total_minutes < 1 then
    return null;
  end if;
  return total_minutes;
end;
$$;

revoke all on function private.staff_leave_minutes_for_period(uuid,uuid,date,date)
  from public, anon, authenticated, service_role;
grant execute on function private.staff_leave_minutes_for_period(uuid,uuid,date,date) to postgres;

revoke all on function private.staff_leave_minutes_by_year(uuid,uuid,date,date)
  from public, anon, authenticated, service_role;
grant execute on function private.staff_leave_minutes_by_year(uuid,uuid,date,date) to postgres;

create or replace function private.staff_leave_allocate_minutes_by_year(
  starts_on date,
  ends_on date,
  requested_by_year jsonb,
  total_minutes integer
)
returns jsonb
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  weights jsonb := coalesce(requested_by_year, '{}'::jsonb);
  weight_total numeric;
  allocated integer := 0;
  share integer;
  allocation jsonb := '{}'::jsonb;
  item record;
begin
  if starts_on is null or ends_on is null or ends_on < starts_on
    or total_minutes is null or total_minutes < 1
    or jsonb_typeof(weights) <> 'object'
  then
    return '{}'::jsonb;
  end if;

  select coalesce(sum(value::numeric), 0)
  into weight_total
  from jsonb_each_text(weights);

  if weight_total <= 0 then
    select coalesce(
      jsonb_object_agg(yearly.calendar_year::text, yearly.weight order by yearly.calendar_year),
      '{}'::jsonb
    )
    into weights
    from (
      select extract(year from day_value)::integer as calendar_year, count(*)::integer as weight
      from generate_series(starts_on, ends_on, interval '1 day') generated(day_value)
      where extract(isodow from day_value) between 1 and 5
      group by extract(year from day_value)::integer
    ) yearly;
    select coalesce(sum(value::numeric), 0) into weight_total from jsonb_each_text(weights);
  end if;

  if weight_total <= 0 then
    select coalesce(
      jsonb_object_agg(yearly.calendar_year::text, yearly.weight order by yearly.calendar_year),
      '{}'::jsonb
    )
    into weights
    from (
      select extract(year from day_value)::integer as calendar_year, count(*)::integer as weight
      from generate_series(starts_on, ends_on, interval '1 day') generated(day_value)
      group by extract(year from day_value)::integer
    ) yearly;
    select coalesce(sum(value::numeric), 0) into weight_total from jsonb_each_text(weights);
  end if;

  if weight_total <= 0 then
    return '{}'::jsonb;
  end if;

  for item in
    select key as calendar_year,
           value::numeric as weight,
           row_number() over (order by key) as position,
           count(*) over () as item_count
    from jsonb_each_text(weights)
    where value::numeric > 0
    order by key
  loop
    share := case
      when item.position = item.item_count then total_minutes - allocated
      else floor(total_minutes::numeric * item.weight / weight_total)::integer
    end;
    allocation := allocation || jsonb_build_object(item.calendar_year, share);
    allocated := allocated + share;
  end loop;

  return allocation;
end;
$$;

revoke all on function private.staff_leave_allocate_minutes_by_year(date,date,jsonb,integer)
  from public, anon, authenticated, service_role;
grant execute on function private.staff_leave_allocate_minutes_by_year(date,date,jsonb,integer) to postgres;

create or replace function public.staff_leave_command(
  target_tenant uuid,
  command text,
  input jsonb,
  idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  staff_personnel_id uuid;
  receipt private.staff_app_command_receipts;
  leave_request public.staff_leave_requests;
  result jsonb;
  starts_on date;
  ends_on date;
  leave_kind text;
  today date;
  timezone text;
  expected_version bigint;
  linked_availability_id uuid;
  requested_leave_minutes integer;
  requested_leave_minutes_by_year jsonb;
begin
  staff_personnel_id := private.require_staff_personnel(target_tenant);
  if idempotency_key is null or jsonb_typeof(input) <> 'object' or command not in ('create','withdraw') then
    raise exception 'Ongeldige verlofopdracht' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('fieldgrid-staff-command:' || target_tenant::text || ':' || idempotency_key::text, 0)
  );
  select *
  into receipt
  from private.staff_app_command_receipts r
  where r.tenant_id = target_tenant and r.id = idempotency_key;
  if found then
    if receipt.actor_id <> auth.uid()
      or receipt.command <> 'leave.' || command
      or receipt.payload <> input
    then
      raise exception 'Gebruik een nieuwe herhaalsleutel voor gewijzigde invoer' using errcode = '23514';
    end if;
    return receipt.result;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('fieldgrid-staff-leave:' || target_tenant::text || ':' || staff_personnel_id::text, 0)
  );
  select t.timezone into timezone from public.tenants t where t.id = target_tenant;
  today := (clock_timestamp() at time zone timezone)::date;

  if command = 'create' then
    if input - array['leaveType','leave_type','startsOn','starts_on','endsOn','ends_on','note'] <> '{}'::jsonb then
      raise exception 'Ongeldige verlofinvoer' using errcode = '23514';
    end if;
    leave_kind := coalesce(input ->> 'leaveType', input ->> 'leave_type');
    starts_on := coalesce(input ->> 'startsOn', input ->> 'starts_on')::date;
    ends_on := coalesce(input ->> 'endsOn', input ->> 'ends_on')::date;
    if leave_kind not in ('vacation','short','care','unpaid','other')
      or starts_on is null
      or ends_on is null
      or starts_on < today
      or ends_on < starts_on
      or ends_on - starts_on > 366
      or length(coalesce(input ->> 'note', '')) > 2000
    then
      raise exception 'Controleer type, periode en toelichting' using errcode = '23514';
    end if;

    requested_leave_minutes_by_year := private.staff_leave_minutes_by_year(
      target_tenant, staff_personnel_id, starts_on, ends_on
    );
    requested_leave_minutes := private.staff_leave_minutes_for_period(
      target_tenant, staff_personnel_id, starts_on, ends_on
    );

    insert into public.staff_leave_requests (
      tenant_id, personnel_id, leave_type, starts_on, ends_on,
      requested_minutes, requested_minutes_by_year, note, created_by
    ) values (
      target_tenant, staff_personnel_id, leave_kind, starts_on, ends_on,
      requested_leave_minutes, requested_leave_minutes_by_year,
      btrim(coalesce(input ->> 'note', '')), auth.uid()
    )
    returning * into leave_request;

    insert into public.audit_events (
      tenant_id, actor_user_id, action, entity_type, entity_id, after_data
    ) values (
      target_tenant, auth.uid(), 'staff.leave.created', 'staff_leave_request', leave_request.id,
      jsonb_build_object(
        'personnel_id', staff_personnel_id,
        'leave_type', leave_request.leave_type,
        'starts_on', leave_request.starts_on,
        'ends_on', leave_request.ends_on,
        'requested_minutes', leave_request.requested_minutes,
        'requested_minutes_by_year', leave_request.requested_minutes_by_year,
        'status', leave_request.status,
        'version', leave_request.version
      )
    );
  else
    if input - array['id','leaveRequestId','version','reason'] <> '{}'::jsonb
      or coalesce(input ->> 'leaveRequestId', input ->> 'id') is null
      or input ->> 'version' is null
      or length(coalesce(input ->> 'reason', '')) > 1000
    then
      raise exception 'Verlofaanvraag en versie zijn verplicht' using errcode = '23514';
    end if;
    expected_version := (input ->> 'version')::bigint;
    select *
    into leave_request
    from public.staff_leave_requests r
    where r.tenant_id = target_tenant
      and r.id = coalesce(input ->> 'leaveRequestId', input ->> 'id')::uuid
      and r.personnel_id = staff_personnel_id
    for update;

    if leave_request.id is null then
      raise exception 'Verlofaanvraag niet beschikbaar' using errcode = '42501';
    end if;
    if leave_request.version is distinct from expected_version then
      raise exception 'De verlofaanvraag is intussen gewijzigd. Laad opnieuw.' using errcode = '40001';
    end if;
    if leave_request.status not in ('pending','approved') or leave_request.ends_on < today then
      raise exception 'Deze verlofaanvraag kan niet meer worden ingetrokken' using errcode = '23514';
    end if;

    linked_availability_id := leave_request.availability_id;
    update public.staff_leave_requests
    set status = 'withdrawn',
        withdrawn_at = clock_timestamp(),
        withdrawal_note = nullif(btrim(input ->> 'reason'), ''),
        availability_id = null
    where tenant_id = target_tenant and id = leave_request.id
    returning * into leave_request;

    if linked_availability_id is not null then
      delete from public.availability slot
      where slot.tenant_id = target_tenant
        and slot.id = linked_availability_id
        and slot.personnel_id = staff_personnel_id
        and slot.kind = 'leave';
      if not found then
        raise exception 'Gekoppelde verlofbeschikbaarheid ontbreekt' using errcode = '23514';
      end if;
    end if;

    insert into public.audit_events (
      tenant_id, actor_user_id, action, entity_type, entity_id, after_data
    ) values (
      target_tenant, auth.uid(), 'staff.leave.withdrawn', 'staff_leave_request', leave_request.id,
      jsonb_build_object('status', leave_request.status, 'version', leave_request.version)
    );
  end if;

  result := to_jsonb(leave_request);
  insert into private.staff_app_command_receipts (
    tenant_id, id, actor_id, command, payload, result
  ) values (
    target_tenant, idempotency_key, auth.uid(), 'leave.' || command, input, result
  );
  return result;
end;
$$;

create or replace function public.review_staff_leave_request(
  target_tenant uuid,
  target_request uuid,
  decision text,
  expected_version bigint,
  approved_minutes integer,
  note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.staff_leave_requests;
  staff_personnel_id uuid;
  availability_slot_id uuid;
  tenant_timezone text;
  before_request jsonb;
  decision_note text := note;
  confirmed_minutes integer;
  confirmed_minutes_by_year jsonb;
begin
  if not private.object_session_active()
    or not exists (
      select 1 from public.tenants tenant
      where tenant.id = target_tenant and tenant.status = 'active'
    )
    or not private.service_enabled(target_tenant, 'personeel')
    or not private.has_role(
      target_tenant,
      array['tenant_admin','management','hr']::public.app_role[]
    )
  then
    raise exception 'Management- of HR-toegang vereist' using errcode = '42501';
  end if;
  if target_request is null
    or decision not in ('approve','reject')
    or expected_version is null
    or length(coalesce(decision_note, '')) > 2000
    or (
      decision = 'reject'
      and nullif(btrim(coalesce(decision_note, '')), '') is null
    )
  then
    raise exception 'Ongeldige verlofbeoordeling' using errcode = '23514';
  end if;

  select request.personnel_id
  into staff_personnel_id
  from public.staff_leave_requests request
  where request.tenant_id = target_tenant and request.id = target_request;
  if staff_personnel_id is null then
    raise exception 'Verlofaanvraag niet beschikbaar' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'fieldgrid-staff-leave:' || target_tenant::text || ':' || staff_personnel_id::text,
      0
    )
  );
  select request.*
  into request_row
  from public.staff_leave_requests request
  where request.tenant_id = target_tenant and request.id = target_request
  for update;

  if request_row.id is null then
    raise exception 'Verlofaanvraag niet beschikbaar' using errcode = '42501';
  end if;
  if request_row.version is distinct from expected_version then
    raise exception 'De verlofaanvraag is intussen gewijzigd. Laad opnieuw.' using errcode = '40001';
  end if;
  if request_row.status <> 'pending' or request_row.availability_id is not null then
    raise exception 'Alleen een open verlofaanvraag kan worden beoordeeld' using errcode = '23514';
  end if;

  before_request := to_jsonb(request_row);
  if decision = 'approve' then
    confirmed_minutes := coalesce(approved_minutes, request_row.requested_minutes);
    if confirmed_minutes is null or confirmed_minutes not between 1 and 527040 then
      raise exception 'Leg het goedgekeurde aantal verlofuren vast' using errcode = '23514';
    end if;
    confirmed_minutes_by_year := private.staff_leave_allocate_minutes_by_year(
      request_row.starts_on,
      request_row.ends_on,
      request_row.requested_minutes_by_year,
      confirmed_minutes
    );
    if confirmed_minutes_by_year = '{}'::jsonb then
      raise exception 'Het goedgekeurde verlof kon niet per kalenderjaar worden verdeeld' using errcode = '23514';
    end if;
    select tenant.timezone
    into tenant_timezone
    from public.tenants tenant
    where tenant.id = target_tenant;

    insert into public.availability (
      tenant_id, personnel_id, starts_at, ends_at, kind, note, approved_at
    ) values (
      target_tenant,
      request_row.personnel_id,
      request_row.starts_on::timestamp without time zone at time zone tenant_timezone,
      (request_row.ends_on + 1)::timestamp without time zone at time zone tenant_timezone,
      'leave',
      nullif(request_row.note, ''),
      clock_timestamp()
    )
    returning id into availability_slot_id;

    update public.staff_leave_requests request
    set status = 'approved',
        reviewed_by = auth.uid(),
        reviewed_at = clock_timestamp(),
        review_note = nullif(btrim(decision_note), ''),
        approved_minutes = confirmed_minutes,
        approved_minutes_by_year = confirmed_minutes_by_year,
        availability_id = availability_slot_id
    where request.tenant_id = target_tenant and request.id = target_request
    returning request.* into request_row;
  else
    update public.staff_leave_requests request
    set status = 'rejected',
        reviewed_by = auth.uid(),
        reviewed_at = clock_timestamp(),
        review_note = nullif(btrim(decision_note), '')
    where request.tenant_id = target_tenant and request.id = target_request
    returning request.* into request_row;
  end if;

  insert into public.audit_events (
    tenant_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    target_tenant,
    auth.uid(),
    'staff.leave.' || case when decision = 'approve' then 'approved' else 'rejected' end,
    'staff_leave_request',
    request_row.id,
    before_request,
    to_jsonb(request_row)
  );

  return to_jsonb(request_row);
end;
$$;

create or replace function public.review_staff_leave_request(
  target_tenant uuid,
  target_request uuid,
  decision text,
  expected_version bigint,
  note text default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.review_staff_leave_request(
    target_tenant,
    target_request,
    decision,
    expected_version,
    null::integer,
    note
  )
$$;

create or replace function public.set_staff_leave_entitlement(
  target_tenant uuid,
  target_personnel uuid,
  calendar_year integer,
  allowance_minutes integer,
  carryover_minutes integer,
  expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_row public.staff_leave_entitlements;
  updated_row public.staff_leave_entitlements;
begin
  if not private.object_session_active()
    or not private.service_enabled(target_tenant, 'personeel')
    or not private.has_role(
      target_tenant,
      array['tenant_admin','management','hr']::public.app_role[]
    )
    or not exists (
      select 1 from public.personnel person
      where person.tenant_id = target_tenant and person.id = target_personnel
    )
  then
    raise exception 'Management- of HR-toegang vereist' using errcode = '42501';
  end if;
  if calendar_year not between 2000 and 2200
    or allowance_minutes not between 0 and 527040
    or carryover_minutes not between 0 and 527040
    or allowance_minutes + carryover_minutes > 1054080
    or expected_version is null or expected_version < 0
  then
    raise exception 'Controleer kalenderjaar en verlofuren' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'fieldgrid-staff-leave-entitlement:' || target_tenant::text || ':'
      || target_personnel::text || ':' || calendar_year::text,
      0
    )
  );
  select entitlement.*
  into current_row
  from public.staff_leave_entitlements entitlement
  where entitlement.tenant_id = target_tenant
    and entitlement.personnel_id = target_personnel
    and entitlement.calendar_year = set_staff_leave_entitlement.calendar_year
  for update;

  if found then
    if current_row.version is distinct from expected_version then
      raise exception 'Het verlofsaldo is intussen gewijzigd. Laad opnieuw.' using errcode = '40001';
    end if;
    update public.staff_leave_entitlements entitlement
    set allowance_minutes = set_staff_leave_entitlement.allowance_minutes,
        carryover_minutes = set_staff_leave_entitlement.carryover_minutes,
        updated_by = auth.uid()
    where entitlement.tenant_id = target_tenant and entitlement.id = current_row.id
    returning entitlement.* into updated_row;
  else
    if expected_version <> 0 then
      raise exception 'Het verlofsaldo is intussen gewijzigd. Laad opnieuw.' using errcode = '40001';
    end if;
    insert into public.staff_leave_entitlements (
      tenant_id, personnel_id, calendar_year, allowance_minutes,
      carryover_minutes, updated_by
    ) values (
      target_tenant, target_personnel, calendar_year, allowance_minutes,
      carryover_minutes, auth.uid()
    ) returning * into updated_row;
  end if;

  insert into public.audit_events (
    tenant_id, actor_user_id, action, entity_type, entity_id,
    before_data, after_data
  ) values (
    target_tenant, auth.uid(), 'staff.leave.entitlement.updated',
    'staff_leave_entitlement', updated_row.id,
    case when current_row.id is null then null else jsonb_build_object(
      'calendar_year', current_row.calendar_year,
      'allowance_minutes', current_row.allowance_minutes,
      'carryover_minutes', current_row.carryover_minutes,
      'version', current_row.version
    ) end,
    jsonb_build_object(
      'calendar_year', updated_row.calendar_year,
      'allowance_minutes', updated_row.allowance_minutes,
      'carryover_minutes', updated_row.carryover_minutes,
      'version', updated_row.version
    )
  );
  return to_jsonb(updated_row) - 'updated_by';
end;
$$;

create or replace function private.staff_confirmed_day_time_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_data jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) else '{}'::jsonb end;
  new_data jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) else '{}'::jsonb end;
  affected record;
begin
  if tg_op = 'UPDATE'
    and (old_data - array['updated_at','version']) = (new_data - array['updated_at','version'])
  then
    return new;
  end if;

  for affected in
    select distinct source.tenant_id, source.personnel_id, source.day
    from (
      select
        nullif(old_data ->> 'tenant_id', '')::uuid as tenant_id,
        nullif(old_data ->> 'personnel_id', '')::uuid as personnel_id,
        (
          nullif(old_data ->> 'starts_at', '')::timestamptz
          at time zone tenant.timezone
        )::date as day
      from public.tenants tenant
      where tg_op <> 'INSERT'
        and tenant.id = nullif(old_data ->> 'tenant_id', '')::uuid
      union all
      select
        nullif(new_data ->> 'tenant_id', '')::uuid,
        nullif(new_data ->> 'personnel_id', '')::uuid,
        (
          nullif(new_data ->> 'starts_at', '')::timestamptz
          at time zone tenant.timezone
        )::date
      from public.tenants tenant
      where tg_op <> 'DELETE'
        and tenant.id = nullif(new_data ->> 'tenant_id', '')::uuid
    ) source
    where source.day is not null
    order by source.tenant_id, source.personnel_id, source.day
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(
        'fieldgrid-staff-day:' || affected.tenant_id::text || ':' ||
        affected.personnel_id::text || ':' || affected.day::text,
        0
      )
    );
    if exists (
      select 1
      from public.staff_day_reviews review
      where review.tenant_id = affected.tenant_id
        and review.personnel_id = affected.personnel_id
        and review.day = affected.day
        and review.state = 'confirmed'
    ) then
      raise exception 'Een bevestigde dagstaat is onveranderlijk; heropen de dag of vraag een correctie aan'
        using errcode = '23514';
    end if;
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger time_entries_confirmed_day_guard
before insert or update or delete on public.time_entries
for each row execute function private.staff_confirmed_day_time_guard();

revoke all on function private.staff_confirmed_day_time_guard() from public, anon, authenticated, service_role;
grant execute on function private.staff_confirmed_day_time_guard() to postgres;

-- Status transitions are the authority for actual travel time. The legacy
-- transition opens work time, while this narrow trigger adds the missing
-- travel segment and closes it exactly when that assignment starts work.
create or replace function private.staff_transition_time_segments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  assignment public.work_order_assignments;
begin
  if new.assignment_id is null then return new; end if;
  if new.new_status = 'returned'
    and exists (
      select 1
      from public.work_order_assignments returned_assignment
      join public.personnel person
        on person.tenant_id = returned_assignment.tenant_id
       and person.id = returned_assignment.personnel_id
      where returned_assignment.tenant_id = new.tenant_id
        and returned_assignment.id = new.assignment_id
        and person.user_id = new.actor_user_id
    )
    and (
      new.reason_code is null
      or new.reason_code not in (
        'customer_unavailable','unsafe_situation','materials_missing',
        'planning_issue','other'
      )
      or length(btrim(coalesce(new.note, ''))) not between 3 and 1000
    )
  then
    raise exception 'Kies een geldige terugmeldreden en geef een concrete toelichting'
      using errcode = '23514';
  end if;
  select *
  into assignment
  from public.work_order_assignments current_assignment
  where current_assignment.tenant_id = new.tenant_id
    and current_assignment.id = new.assignment_id;
  if assignment.id is null then return new; end if;

  if new.new_status = 'travelling' then
    if not exists (
      select 1
      from public.time_entries entry
      where entry.tenant_id = new.tenant_id
        and entry.assignment_id = new.assignment_id
        and entry.kind = 'travel'
        and entry.ends_at is null
    ) then
      insert into public.time_entries (
        tenant_id, personnel_id, assignment_id, kind, starts_at
      ) values (
        new.tenant_id, assignment.personnel_id, assignment.id, 'travel', new.created_at
      );
    end if;
  elsif new.new_status = 'in_progress' then
    update public.time_entries
    set ends_at = new.created_at
    where tenant_id = new.tenant_id
      and assignment_id = new.assignment_id
      and kind = 'travel'
      and ends_at is null;
  elsif new.new_status = 'returned' then
    update public.time_entries
    set ends_at = new.created_at
    where tenant_id = new.tenant_id
      and assignment_id = new.assignment_id
      and ends_at is null;
  end if;
  return new;
end;
$$;

create trigger staff_transition_time_segments
after insert on public.status_events
for each row execute function private.staff_transition_time_segments();

revoke all on function private.staff_transition_time_segments()
  from public, anon, authenticated, service_role;
grant execute on function private.staff_transition_time_segments() to postgres;

create or replace function public.staff_day_command(
  target_tenant uuid,
  command text,
  input jsonb,
  idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  staff_personnel_id uuid;
  receipt private.staff_app_command_receipts;
  review public.staff_day_reviews;
  result jsonb;
  target_day date;
  today date;
  timezone text;
  expected_version bigint;
  day_note text;
begin
  staff_personnel_id := private.require_staff_personnel(target_tenant);
  if idempotency_key is null
    or jsonb_typeof(input) <> 'object'
    or command not in ('close','confirm','reopen')
  then
    raise exception 'Ongeldige dagopdracht' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('fieldgrid-staff-command:' || target_tenant::text || ':' || idempotency_key::text, 0)
  );
  select *
  into receipt
  from private.staff_app_command_receipts r
  where r.tenant_id = target_tenant and r.id = idempotency_key;
  if found then
    if receipt.actor_id <> auth.uid()
      or receipt.command <> 'day.' || command
      or receipt.payload <> input
    then
      raise exception 'Gebruik een nieuwe herhaalsleutel voor gewijzigde invoer' using errcode = '23514';
    end if;
    return receipt.result;
  end if;

  select t.timezone into timezone from public.tenants t where t.id = target_tenant;
  today := (clock_timestamp() at time zone timezone)::date;
  day_note := btrim(coalesce(input ->> 'note', ''));
  if length(day_note) > 2000 then
    raise exception 'De toelichting is te lang' using errcode = '23514';
  end if;

  if command = 'close' then
    if input - array['workDay','day','note'] <> '{}'::jsonb
      or coalesce(input ->> 'workDay', input ->> 'day') is null
    then
      raise exception 'Werkdag is verplicht' using errcode = '23514';
    end if;
    target_day := coalesce(input ->> 'workDay', input ->> 'day')::date;
    if target_day > today or target_day < today - 366 then
      raise exception 'Kies een geldige werkdag' using errcode = '23514';
    end if;
    perform pg_advisory_xact_lock(
      hashtextextended('fieldgrid-staff-day:' || target_tenant::text || ':' || staff_personnel_id::text || ':' || target_day::text, 0)
    );
    select *
    into review
    from public.staff_day_reviews d
    where d.tenant_id = target_tenant and d.personnel_id = staff_personnel_id and d.day = target_day
    for update;

    if not exists (
      select 1
      from public.time_entries e
      where e.tenant_id = target_tenant
        and e.personnel_id = staff_personnel_id
        and (e.starts_at at time zone timezone)::date = target_day
    ) then
      raise exception 'Er zijn geen uren voor deze werkdag' using errcode = '23514';
    end if;
    if exists (
      select 1
      from public.time_entries e
      where e.tenant_id = target_tenant
        and e.personnel_id = staff_personnel_id
        and (e.starts_at at time zone timezone)::date = target_day
        and (e.ends_at is null or e.status = 'correction_requested')
    ) then
      raise exception 'Sluit alle tijdregels en rond openstaande correcties af' using errcode = '23514';
    end if;
    if review.id is not null then
      if review.state = 'confirmed' then
        raise exception 'Deze dagstaat is al bevestigd' using errcode = '23514';
      end if;
      update public.staff_day_reviews
      set state = 'closed',
          note = day_note,
          closed_at = clock_timestamp(),
          confirmed_at = null,
          correction_requested_at = null
      where id = review.id
      returning * into review;
    else
      insert into public.staff_day_reviews (
        tenant_id, personnel_id, day, state, note, closed_at, created_by
      ) values (
        target_tenant, staff_personnel_id, target_day, 'closed', day_note, clock_timestamp(), auth.uid()
      )
      returning * into review;
    end if;
  else
    if input - array['dayReviewId','id','version','note'] <> '{}'::jsonb
      or coalesce(input ->> 'dayReviewId', input ->> 'id') is null
      or input ->> 'version' is null
    then
      raise exception 'Dagstaat en versie zijn verplicht' using errcode = '23514';
    end if;
    expected_version := nullif(input ->> 'version', '')::bigint;
    select d.day
    into target_day
    from public.staff_day_reviews d
    where d.tenant_id = target_tenant
      and d.personnel_id = staff_personnel_id
      and d.id = coalesce(input ->> 'dayReviewId', input ->> 'id')::uuid;
    if target_day is null then
      raise exception 'Dagstaat niet beschikbaar' using errcode = '42501';
    end if;
    perform pg_advisory_xact_lock(
      hashtextextended('fieldgrid-staff-day:' || target_tenant::text || ':' || staff_personnel_id::text || ':' || target_day::text, 0)
    );
    select *
    into review
    from public.staff_day_reviews d
    where d.tenant_id = target_tenant
      and d.personnel_id = staff_personnel_id
      and d.id = coalesce(input ->> 'dayReviewId', input ->> 'id')::uuid
    for update;
    if review.id is null then
      raise exception 'Dagstaat niet beschikbaar' using errcode = '42501';
    end if;
    if expected_version is null or review.version is distinct from expected_version then
      raise exception 'De dagstaat is intussen gewijzigd. Laad opnieuw.' using errcode = '40001';
    end if;
    if command = 'confirm' then
      if review.state <> 'closed' then
        raise exception 'Sluit de werkdag voordat je de uren bevestigt' using errcode = '23514';
      end if;
      if not exists (
        select 1
        from public.time_entries e
        where e.tenant_id = target_tenant
          and e.personnel_id = staff_personnel_id
          and (e.starts_at at time zone timezone)::date = target_day
      ) or exists (
        select 1
        from public.time_entries e
        where e.tenant_id = target_tenant
          and e.personnel_id = staff_personnel_id
          and (e.starts_at at time zone timezone)::date = target_day
          and (e.ends_at is null or e.status = 'correction_requested')
      ) or exists (
        select 1
        from public.staff_time_correction_requests correction
        where correction.tenant_id = target_tenant
          and correction.personnel_id = staff_personnel_id
          and correction.status = 'pending'
          and (correction.source_starts_at at time zone timezone)::date = target_day
      ) then
        raise exception 'Sluit alle tijdregels en rond openstaande correcties af' using errcode = '23514';
      end if;
      update public.staff_day_reviews
      set state = 'confirmed',
          note = day_note,
          confirmed_at = clock_timestamp()
      where id = review.id
      returning * into review;
    else
      if review.state not in ('closed','confirmed','correction_requested') then
        raise exception 'Deze dagstaat staat al open' using errcode = '23514';
      end if;
      update public.staff_day_reviews
      set state = 'open',
          note = day_note,
          closed_at = null,
          confirmed_at = null,
          correction_requested_at = null
      where id = review.id
      returning * into review;
    end if;
  end if;

  insert into public.audit_events (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    target_tenant, auth.uid(), 'staff.day.' || command, 'staff_day_review', review.id,
    jsonb_build_object('day', review.day, 'state', review.state, 'version', review.version)
  );

  result := to_jsonb(review);
  insert into private.staff_app_command_receipts (
    tenant_id, id, actor_id, command, payload, result
  ) values (
    target_tenant, idempotency_key, auth.uid(), 'day.' || command, input, result
  );
  return result;
end;
$$;

create or replace function public.staff_request_time_correction(
  target_tenant uuid,
  target_time_entry uuid,
  expected_version bigint,
  correction_mode text,
  requested_start timestamptz,
  requested_end timestamptz,
  requested_duration integer,
  reason text,
  idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  staff_personnel_id uuid;
  receipt private.staff_app_command_receipts;
  entry public.time_entries;
  review public.staff_day_reviews;
  request public.staff_time_correction_requests;
  result jsonb;
  payload jsonb;
  timezone text;
  entry_day date;
  desired_start timestamptz;
  desired_end timestamptz;
  desired_duration integer;
begin
  staff_personnel_id := private.require_staff_personnel(target_tenant);
  payload := jsonb_build_object(
    'time_entry_id', target_time_entry,
    'expected_version', expected_version,
    'correction_mode', correction_mode,
    'requested_start', requested_start,
    'requested_end', requested_end,
    'requested_duration', requested_duration,
    'reason', btrim(coalesce(reason, ''))
  );
  if idempotency_key is null
    or target_time_entry is null
    or expected_version is null
    or correction_mode is null
    or correction_mode not in ('times','duration')
    or length(btrim(coalesce(reason, ''))) not between 3 and 2000
  then
    raise exception 'Tijdregel, gewenste correctie, versie en reden zijn verplicht' using errcode = '23514';
  end if;
  if (correction_mode = 'times' and (
      requested_start is null or requested_end is null or requested_duration is not null
    )) or (correction_mode = 'duration' and (
      requested_start is not null or requested_end is not null
      or requested_duration is null or requested_duration not between 1 and 600
    ))
  then
    raise exception 'Kies correcte begin- en eindtijden of een duur van 1 tot en met 600 minuten'
      using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('fieldgrid-staff-command:' || target_tenant::text || ':' || idempotency_key::text, 0)
  );
  select *
  into receipt
  from private.staff_app_command_receipts r
  where r.tenant_id = target_tenant and r.id = idempotency_key;
  if found then
    if receipt.actor_id <> auth.uid()
      or receipt.command <> 'time.correction'
      or receipt.payload <> payload
    then
      raise exception 'Gebruik een nieuwe herhaalsleutel voor gewijzigde invoer' using errcode = '23514';
    end if;
    return receipt.result;
  end if;

  select e.starts_at, t.timezone
  into entry.starts_at, timezone
  from public.time_entries e
  join public.tenants t on t.id = e.tenant_id
  where e.tenant_id = target_tenant
    and e.id = target_time_entry
    and e.personnel_id = staff_personnel_id;

  if entry.starts_at is null then
    raise exception 'Tijdregel niet beschikbaar' using errcode = '42501';
  end if;
  entry_day := (entry.starts_at at time zone timezone)::date;
  perform pg_advisory_xact_lock(
    hashtextextended('fieldgrid-staff-day:' || target_tenant::text || ':' || staff_personnel_id::text || ':' || entry_day::text, 0)
  );
  select *
  into entry
  from public.time_entries e
  where e.tenant_id = target_tenant
    and e.id = target_time_entry
    and e.personnel_id = staff_personnel_id
  for update;
  if entry.id is null then
    raise exception 'Tijdregel niet beschikbaar' using errcode = '42501';
  end if;
  if entry.version is distinct from expected_version then
    raise exception 'De tijdregel is intussen gewijzigd. Laad opnieuw.' using errcode = '40001';
  end if;
  if (entry.starts_at at time zone timezone)::date is distinct from entry_day then
    raise exception 'De tijdregel is intussen verplaatst. Laad opnieuw.' using errcode = '40001';
  end if;
  if entry.ends_at is null or entry.status not in ('draft','approved','rejected') then
    raise exception 'Alleen een gesloten tijdregel zonder openstaand correctieverzoek kan worden gecorrigeerd'
      using errcode = '23514';
  end if;

  if correction_mode = 'times' then
    desired_start := requested_start;
    desired_end := requested_end;
    if desired_end <= desired_start
      or date_trunc('minute', desired_start) <> desired_start
      or date_trunc('minute', desired_end) <> desired_end
      or extract(epoch from desired_end - desired_start) % 60 <> 0
    then
      raise exception 'De correcte eindtijd moet na de begintijd liggen en op hele minuten vallen'
        using errcode = '23514';
    end if;
    desired_duration := extract(epoch from desired_end - desired_start)::integer / 60;
  else
    desired_start := entry.starts_at;
    desired_duration := requested_duration;
    desired_end := entry.starts_at + make_interval(mins => desired_duration);
  end if;

  if desired_duration not between 1 and 600
    or (desired_start at time zone timezone)::date is distinct from entry_day
  then
    raise exception 'De gewenste correctie moet op dezelfde werkdag starten en 1 tot en met 600 minuten duren'
      using errcode = '23514';
  end if;
  if desired_start = entry.starts_at and desired_end = entry.ends_at then
    raise exception 'De gewenste correctie is gelijk aan de bestaande tijdregel' using errcode = '23514';
  end if;
  if exists (
    select 1
    from public.staff_time_correction_requests pending
    where pending.tenant_id = target_tenant
      and pending.time_entry_id = entry.id
      and pending.status = 'pending'
  ) then
    raise exception 'Voor deze tijdregel staat al een correctieverzoek open' using errcode = '23514';
  end if;

  select *
  into review
  from public.staff_day_reviews day_review
  where day_review.tenant_id = target_tenant
    and day_review.personnel_id = staff_personnel_id
    and day_review.day = entry_day;

  insert into public.staff_time_correction_requests (
    tenant_id, personnel_id, time_entry_id, correction_mode,
    source_version, source_kind, source_status, source_starts_at, source_ends_at,
    source_day_state, requested_starts_at, requested_ends_at,
    requested_duration_minutes, reason, created_by
  ) values (
    target_tenant, staff_personnel_id, entry.id, correction_mode,
    entry.version, entry.kind, entry.status, entry.starts_at, entry.ends_at,
    coalesce(review.state, 'open'), desired_start, desired_end,
    desired_duration, btrim(reason), auth.uid()
  )
  returning * into request;

  insert into public.audit_events (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    target_tenant, auth.uid(), 'staff.time.correction_requested', 'staff_time_correction_request', request.id,
    jsonb_build_object(
      'time_entry_id', entry.id,
      'source_version', entry.version,
      'source_day_state', coalesce(review.state, 'open'),
      'correction_mode', correction_mode,
      'requested_starts_at', desired_start,
      'requested_ends_at', desired_end,
      'requested_duration_minutes', desired_duration,
      'status', request.status
    )
  );

  result := to_jsonb(request) - array['created_by','reviewed_by'];
  insert into private.staff_app_command_receipts (
    tenant_id, id, actor_id, command, payload, result
  ) values (
    target_tenant, idempotency_key, auth.uid(), 'time.correction', payload, result
  );
  return result;
end;
$$;

create or replace function public.review_staff_time_correction(
  target_tenant uuid,
  target_request uuid,
  decision text,
  expected_version bigint,
  note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.staff_time_correction_requests;
  entry_row public.time_entries;
  day_review public.staff_day_reviews;
  staff_personnel_id uuid;
  tenant_timezone text;
  entry_day date;
  decision_note text := nullif(btrim(coalesce(note, '')), '');
  before_request jsonb;
  before_entry jsonb;
  before_day_review jsonb;
begin
  if not private.object_session_active()
    or not exists (
      select 1 from public.tenants tenant
      where tenant.id = target_tenant and tenant.status = 'active'
    )
    or not private.service_enabled(target_tenant, 'personeel')
    or not private.has_role(
      target_tenant,
      array['tenant_admin','management','hr']::public.app_role[]
    )
  then
    raise exception 'Management- of HR-toegang vereist' using errcode = '42501';
  end if;
  if target_request is null
    or decision not in ('approve','reject')
    or expected_version is null
    or length(coalesce(note, '')) > 2000
    or (decision = 'reject' and decision_note is null)
  then
    raise exception 'Ongeldige beoordeling van het correctieverzoek' using errcode = '23514';
  end if;

  select request.personnel_id,
         tenant.timezone,
         (request.source_starts_at at time zone tenant.timezone)::date
  into staff_personnel_id, tenant_timezone, entry_day
  from public.staff_time_correction_requests request
  join public.tenants tenant on tenant.id = request.tenant_id
  where request.tenant_id = target_tenant
    and request.id = target_request;
  if staff_personnel_id is null then
    raise exception 'Correctieverzoek niet beschikbaar' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'fieldgrid-staff-day:' || target_tenant::text || ':' ||
      staff_personnel_id::text || ':' || entry_day::text,
      0
    )
  );
  select request.*
  into request_row
  from public.staff_time_correction_requests request
  where request.tenant_id = target_tenant
    and request.id = target_request
  for update;
  if request_row.id is null then
    raise exception 'Correctieverzoek niet beschikbaar' using errcode = '42501';
  end if;
  if request_row.created_by = auth.uid() then
    raise exception 'Een eigen correctieverzoek kan niet zelf worden beoordeeld' using errcode = '42501';
  end if;
  if request_row.version is distinct from expected_version then
    raise exception 'Het correctieverzoek is intussen gewijzigd. Laad opnieuw.' using errcode = '40001';
  end if;
  if request_row.status <> 'pending' then
    raise exception 'Alleen een open correctieverzoek kan worden beoordeeld' using errcode = '23514';
  end if;

  select entry.*
  into entry_row
  from public.time_entries entry
  where entry.tenant_id = target_tenant
    and entry.personnel_id = request_row.personnel_id
    and entry.id = request_row.time_entry_id
  for update;
  if entry_row.id is null then
    raise exception 'De oorspronkelijke tijdregel is niet meer beschikbaar' using errcode = '42501';
  end if;

  select review.*
  into day_review
  from public.staff_day_reviews review
  where review.tenant_id = target_tenant
    and review.personnel_id = request_row.personnel_id
    and review.day = entry_day
  for update;

  before_request := to_jsonb(request_row);
  before_entry := to_jsonb(entry_row);
  before_day_review := case when day_review.id is null then null else to_jsonb(day_review) end;

  if decision = 'approve' then
    if entry_row.version is distinct from request_row.source_version
      or entry_row.kind is distinct from request_row.source_kind
      or entry_row.status is distinct from request_row.source_status
      or entry_row.starts_at is distinct from request_row.source_starts_at
      or entry_row.ends_at is distinct from request_row.source_ends_at
    then
      raise exception 'De oorspronkelijke tijdregel is intussen gewijzigd. Laad opnieuw.' using errcode = '40001';
    end if;
    if (request_row.requested_starts_at at time zone tenant_timezone)::date is distinct from entry_day
      or request_row.requested_ends_at <= request_row.requested_starts_at
      or exists (
        select 1
        from public.time_entries other
        where other.tenant_id = target_tenant
          and other.personnel_id = request_row.personnel_id
          and other.id <> request_row.time_entry_id
          and tstzrange(
                other.starts_at,
                coalesce(other.ends_at, 'infinity'::timestamptz),
                '[)'
              )
            && tstzrange(request_row.requested_starts_at, request_row.requested_ends_at, '[)')
      )
    then
      raise exception 'De gewenste correctie overlapt een andere tijdregel of valt buiten de werkdag' using errcode = '23514';
    end if;

    -- A confirmed snapshot must be explicitly confirmed again after its
    -- underlying hours change. Move it to closed before touching the guarded
    -- time row; an open day remains open and must first be closed by staff.
    if day_review.id is not null and day_review.state in ('confirmed','correction_requested') then
      update public.staff_day_reviews review
      set state = 'closed',
          closed_at = coalesce(review.closed_at, clock_timestamp()),
          confirmed_at = null,
          correction_requested_at = null
      where review.id = day_review.id
      returning review.* into day_review;
    end if;

    update public.time_entries entry
    set starts_at = request_row.requested_starts_at,
        ends_at = request_row.requested_ends_at,
        -- Approved hours are a signed-off snapshot. A changed snapshot must
        -- return to draft and be approved again; stale approval metadata may
        -- never survive the correction.
        status = case when entry.status = 'approved' then 'draft' else entry.status end,
        approved_by = case when entry.status = 'approved' then null else entry.approved_by end,
        approved_at = case when entry.status = 'approved' then null else entry.approved_at end
    where entry.tenant_id = target_tenant
      and entry.id = request_row.time_entry_id
    returning entry.* into entry_row;

    update public.staff_time_correction_requests request
    set status = 'approved',
        reviewed_by = auth.uid(),
        reviewed_at = clock_timestamp(),
        review_note = decision_note
    where request.tenant_id = target_tenant
      and request.id = target_request
    returning request.* into request_row;
  else
    update public.staff_time_correction_requests request
    set status = 'rejected',
        reviewed_by = auth.uid(),
        reviewed_at = clock_timestamp(),
        review_note = decision_note
    where request.tenant_id = target_tenant
      and request.id = target_request
    returning request.* into request_row;
  end if;

  insert into public.audit_events (
    tenant_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    target_tenant,
    auth.uid(),
    'staff.time.correction_' || case when decision = 'approve' then 'approved' else 'rejected' end,
    'staff_time_correction_request',
    request_row.id,
    jsonb_build_object(
      'request', before_request,
      'time_entry', before_entry,
      'day_review', before_day_review
    ),
    jsonb_build_object(
      'request', to_jsonb(request_row),
      'time_entry', to_jsonb(entry_row),
      'day_review', case when day_review.id is null then null else to_jsonb(day_review) end
    )
  );

  return to_jsonb(request_row) - array['created_by','reviewed_by'];
end;
$$;

-- The dossier needs three staff-account fields, but authenticated dossier
-- readers deliberately do not receive SELECT on the broad personnel table.
-- Keep that boundary intact and expose only the fields this screen needs.
create or replace function public.personnel_dossier_staff_projection(
  target_tenant uuid,
  target_personnel uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  projection jsonb;
begin
  if target_tenant is null
    or target_personnel is null
    or not private.dossier_access(target_tenant)
    or not private.service_enabled(target_tenant, 'personeel')
  then
    raise exception 'Dossiertoegang vereist' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'availability_self_service_enabled', person.availability_self_service_enabled,
    'version', person.version,
    'account_status', membership.status
  )
  into projection
  from public.personnel person
  left join public.tenant_memberships membership
    on membership.tenant_id = person.tenant_id
   and membership.user_id = person.user_id
  where person.tenant_id = target_tenant
    and person.id = target_personnel;

  if projection is null then
    raise exception 'Personeelslid niet beschikbaar' using errcode = '42501';
  end if;
  return projection;
end;
$$;

-- Correction requests are their own domain trigger. Reuse the central
-- time-entry source authorization, but enqueue only an in-app deep link here:
-- no correction reason or personnel data leaves the authenticated product.
create or replace function private.notification_domain_staff_time_correction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipients jsonb;
  recipient jsonb;
  event_id uuid;
  actor uuid;
  context_name text;
  revision text;
  period text;
  entry_status text;
  target_path text;
begin
  if (tg_op = 'INSERT' and new.status <> 'pending')
    or (tg_op = 'UPDATE' and new.status is not distinct from old.status)
  then
    return new;
  end if;

  if new.status = 'pending' then
    select coalesce(
      jsonb_agg(jsonb_build_object('user_id', membership.user_id, 'context', 'backoffice')),
      '[]'::jsonb
    )
    into recipients
    from public.tenant_memberships membership
    where membership.tenant_id = new.tenant_id
      and membership.status = 'active'
      and membership.user_id <> new.created_by
      and membership.roles && array['tenant_admin','management','hr']::public.app_role[];
  elsif new.status in ('approved','rejected') then
    select coalesce(
      jsonb_agg(jsonb_build_object('user_id', person.user_id, 'context', 'staff')),
      '[]'::jsonb
    )
    into recipients
    from public.personnel person
    where person.tenant_id = new.tenant_id
      and person.id = new.personnel_id
      and person.user_id is not null
      and person.status = 'active';
  else
    return new;
  end if;
  if jsonb_array_length(recipients) = 0 then
    return new;
  end if;

  select entry.status,
         to_char(new.source_starts_at at time zone tenant.timezone, 'YYYY-MM')
  into entry_status, period
  from public.time_entries entry
  join public.tenants tenant on tenant.id = entry.tenant_id
  where entry.tenant_id = new.tenant_id
    and entry.id = new.time_entry_id;
  if entry_status is null then
    return new;
  end if;

  revision := new.status || ':' || new.version::text;
  insert into private.notification_domain_events (
    tenant_id, type_code, entity_kind, entity_id, source_revision,
    dedupe_key, recipients, details
  ) values (
    new.tenant_id,
    'time.correction',
    'time_entry',
    new.time_entry_id,
    revision,
    'staff-time-correction:' || new.id::text || ':' || revision,
    recipients,
    jsonb_build_object(
      'state', entry_status,
      'correction_id', new.id,
      'request_state', new.status,
      'personnel_id', new.personnel_id,
      'period', period
    )
  )
  on conflict do nothing
  returning id into event_id;
  if event_id is null then
    return new;
  end if;

  for recipient in select distinct value from jsonb_array_elements(recipients)
  loop
    actor := (recipient->>'user_id')::uuid;
    context_name := recipient->>'context';
    if not private.notification_actor_active(new.tenant_id, context_name, actor) then
      continue;
    end if;
    target_path := case when context_name = 'staff'
      then '/staff?tab=uren#time-correction-' || new.id::text
      else '/app/personeel/' || new.personnel_id::text ||
        '?tab=uren&period=' || period || '#time-correction-' || new.id::text
    end;
    perform private.notification_enqueue(
      new.tenant_id,
      'time.correction',
      'domain',
      event_id,
      revision,
      'domain:' || event_id::text || ':' || actor::text || ':' || context_name,
      jsonb_build_object(
        'recipient_user_id', actor,
        'context', context_name,
        'channels', array['in_app'],
        'path', target_path,
        'variables', '{}'::jsonb
      )
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists notification_domain_staff_time_correction
  on public.staff_time_correction_requests;
create trigger notification_domain_staff_time_correction
after insert or update on public.staff_time_correction_requests
for each row execute function private.notification_domain_staff_time_correction();

revoke all on function private.notification_domain_staff_time_correction()
  from public, anon, authenticated, service_role;
grant execute on function private.notification_domain_staff_time_correction() to postgres;


create or replace function public.set_staff_availability_permission(
  target_tenant uuid,
  target_personnel uuid,
  enabled boolean,
  expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_person public.personnel;
  updated_person public.personnel;
begin
  if not private.object_session_active()
    or not private.service_enabled(target_tenant, 'personeel')
    or not private.has_role(target_tenant, array['tenant_admin','management','hr']::public.app_role[])
  then
    raise exception 'Personeelsbeheer vereist' using errcode = '42501';
  end if;

  select *
  into current_person
  from public.personnel p
  where p.tenant_id = target_tenant
    and p.id = target_personnel
    and p.status in ('invited','active')
  for update;

  if current_person.id is null then
    raise exception 'Medewerker niet beschikbaar' using errcode = '42501';
  end if;
  if current_person.version is distinct from expected_version then
    raise exception 'De medewerker is intussen gewijzigd. Laad opnieuw.' using errcode = '40001';
  end if;

  update public.personnel
  set availability_self_service_enabled = enabled
  where tenant_id = target_tenant and id = target_personnel
  returning * into updated_person;

  insert into public.audit_events (
    tenant_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    target_tenant, auth.uid(), 'staff.availability_permission.updated', 'personnel', target_personnel,
    jsonb_build_object('enabled', current_person.availability_self_service_enabled, 'version', current_person.version),
    jsonb_build_object('enabled', updated_person.availability_self_service_enabled, 'version', updated_person.version)
  );

  return jsonb_build_object(
    'personnel_id', target_personnel,
    'availability_self_service_enabled', updated_person.availability_self_service_enabled,
    'version', updated_person.version
  );
end;
$$;

create or replace function public.staff_work_order_cost_command(
  target_tenant uuid,
  command text,
  input jsonb,
  idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  staff_personnel_id uuid;
  receipt private.staff_app_command_receipts;
  work_order public.work_orders;
  assignment public.work_order_assignments;
  material public.work_order_material_usage;
  expense public.work_order_expenses;
  result jsonb;
  target_order uuid;
  target_id uuid;
  quantity numeric;
  amount_cents bigint;
  unit_price_cents bigint;
  normalized_command text;
begin
  staff_personnel_id := private.require_staff_personnel(target_tenant);
  if not private.service_enabled(target_tenant, 'planning')
    or not private.service_enabled(target_tenant, 'rapportage')
  then
    raise exception 'Werkbonrapportage is niet beschikbaar' using errcode = '42501';
  end if;
  normalized_command := case command
    when 'add_material' then 'material.create'
    when 'remove_material' then 'material.delete'
    when 'add_expense' then 'expense.create'
    when 'remove_expense' then 'expense.delete'
    else command
  end;
  if idempotency_key is null
    or jsonb_typeof(input) <> 'object'
    or normalized_command not in ('material.create','material.delete','expense.create','expense.delete')
  then
    raise exception 'Ongeldige kostenopdracht' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('fieldgrid-staff-command:' || target_tenant::text || ':' || idempotency_key::text, 0)
  );
  select *
  into receipt
  from private.staff_app_command_receipts r
  where r.tenant_id = target_tenant and r.id = idempotency_key;
  if found then
    if receipt.actor_id <> auth.uid()
      or receipt.command <> 'cost.' || command
      or receipt.payload <> input
    then
      raise exception 'Gebruik een nieuwe herhaalsleutel voor gewijzigde invoer' using errcode = '23514';
    end if;
    return receipt.result;
  end if;

  if normalized_command = 'material.create' then
    if input - array['orderId','workOrderId','taskId','description','quantity','unit','unitPriceCents','customerVisible'] <> '{}'::jsonb
      or coalesce(input ->> 'orderId', input ->> 'workOrderId') is null
      or input ->> 'unitPriceCents' is null
    then
      raise exception 'Ongeldige materiaalinvoer' using errcode = '23514';
    end if;
    target_order := coalesce(input ->> 'orderId', input ->> 'workOrderId')::uuid;
  elsif normalized_command = 'expense.create' then
    if input - array['orderId','workOrderId','description','amountCents','customerVisible'] <> '{}'::jsonb
      or coalesce(input ->> 'orderId', input ->> 'workOrderId') is null
    then
      raise exception 'Ongeldige kosteninvoer' using errcode = '23514';
    end if;
    target_order := coalesce(input ->> 'orderId', input ->> 'workOrderId')::uuid;
  elsif normalized_command = 'material.delete' then
    if input - array['id','materialId','workOrderId'] <> '{}'::jsonb
      or coalesce(input ->> 'id', input ->> 'materialId') is null
    then
      raise exception 'Materiaalregel is verplicht' using errcode = '23514';
    end if;
    select *
    into material
    from public.work_order_material_usage m
    where m.tenant_id = target_tenant
      and m.id = coalesce(input ->> 'id', input ->> 'materialId')::uuid
      and m.created_by = auth.uid()
    for update;
    if material.id is null
      or (
        input ->> 'workOrderId' is not null
        and material.work_order_id is distinct from (input ->> 'workOrderId')::uuid
      )
    then
      raise exception 'Materiaalregel niet beschikbaar' using errcode = '42501';
    end if;
    target_order := material.work_order_id;
  else
    if input - array['id','expenseId','workOrderId','version'] <> '{}'::jsonb
      or coalesce(input ->> 'id', input ->> 'expenseId') is null
      or input ->> 'version' is null
    then
      raise exception 'Kostenregel en versie zijn verplicht' using errcode = '23514';
    end if;
    select *
    into expense
    from public.work_order_expenses e
    where e.tenant_id = target_tenant
      and e.id = coalesce(input ->> 'id', input ->> 'expenseId')::uuid
      and e.personnel_id = staff_personnel_id
      and e.created_by = auth.uid()
    for update;
    if expense.id is null
      or (
        input ->> 'workOrderId' is not null
        and expense.work_order_id is distinct from (input ->> 'workOrderId')::uuid
      )
    then
      raise exception 'Kostenregel niet beschikbaar' using errcode = '42501';
    end if;
    if expense.version is distinct from (input ->> 'version')::bigint then
      raise exception 'De kostenregel is intussen gewijzigd. Laad opnieuw.' using errcode = '40001';
    end if;
    target_order := expense.work_order_id;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('fieldgrid-staff-cost:' || target_tenant::text || ':' || target_order::text, 0)
  );
  select *
  into work_order
  from public.work_orders w
  where w.tenant_id = target_tenant and w.id = target_order
  for update;

  select a.*
  into assignment
  from public.work_order_assignments a
  join public.dispatches d
    on d.tenant_id = a.tenant_id
   and d.assignment_id = a.id
   and d.revoked_at is null
  where a.tenant_id = target_tenant
    and a.work_order_id = target_order
    and a.personnel_id = staff_personnel_id
    and a.status not in ('cancelled','returned')
  for update of a;

  if work_order.id is null or assignment.id is null then
    raise exception 'Actuele toegewezen werkbon vereist' using errcode = '42501';
  end if;
  if not private.staff_report_editable(target_tenant, work_order.id)
    or exists (
      select 1
      from public.work_order_report_versions report
      where report.tenant_id = target_tenant
        and report.work_order_id = work_order.id
        and report.version = work_order.report_version
        and report.state in ('waiting_signature','review','approved')
    )
  then
    raise exception 'Kosten en materialen zijn vergrendeld door de actuele rapportversie' using errcode = '23514';
  end if;

  if normalized_command = 'material.create' then
    quantity := (input ->> 'quantity')::numeric;
    unit_price_cents := (input ->> 'unitPriceCents')::bigint;
    if length(btrim(coalesce(input ->> 'description', ''))) not between 2 and 300
      or length(btrim(coalesce(input ->> 'unit', ''))) not between 1 and 40
      or quantity is null
      or quantity <= 0
      or quantity > 1000000000
      or quantity <> round(quantity, 3)
      or unit_price_cents is null
      or unit_price_cents not between 0 and 100000000
    then
      raise exception 'Controleer omschrijving, hoeveelheid en eenheid' using errcode = '23514';
    end if;
    if nullif(input ->> 'taskId', '') is not null
      and not exists (
        select 1
        from public.work_order_tasks task
        where task.tenant_id = target_tenant
          and task.work_order_id = work_order.id
          and task.id = (input ->> 'taskId')::uuid
      )
    then
      raise exception 'Taak hoort niet bij deze werkbon' using errcode = '23514';
    end if;

    insert into public.work_order_material_usage (
      tenant_id, work_order_id, task_id, description, quantity, unit,
      customer_visible, created_by
    ) values (
      target_tenant, work_order.id, nullif(input ->> 'taskId', '')::uuid,
      btrim(input ->> 'description'), quantity, btrim(input ->> 'unit'),
      coalesce((input ->> 'customerVisible')::boolean, false), auth.uid()
    )
    returning * into material;
    insert into private.work_order_material_finance (
      tenant_id, usage_id, cost_cents, unit_price_cents
    ) values (
      target_tenant, material.id, null, unit_price_cents
    );
    target_id := material.id;
    result := jsonb_build_object(
      'kind', 'material',
      'row', to_jsonb(material) || jsonb_build_object('unit_price_cents', unit_price_cents)
    );
  elsif normalized_command = 'material.delete' then
    delete from private.work_order_material_finance finance
    where finance.tenant_id = target_tenant and finance.usage_id = material.id;
    delete from public.work_order_material_usage m
    where m.tenant_id = target_tenant and m.id = material.id;
    target_id := material.id;
    result := jsonb_build_object('kind', 'material', 'id', material.id, 'deleted', true);
  elsif normalized_command = 'expense.create' then
    amount_cents := (input ->> 'amountCents')::bigint;
    if length(btrim(coalesce(input ->> 'description', ''))) not between 2 and 300
      or amount_cents is null
      or amount_cents not between 1 and 100000000
    then
      raise exception 'Controleer omschrijving en positief bedrag' using errcode = '23514';
    end if;
    insert into public.work_order_expenses (
      tenant_id, work_order_id, assignment_id, personnel_id, description,
      amount_cents, customer_visible, created_by
    ) values (
      target_tenant, work_order.id, assignment.id, staff_personnel_id,
      btrim(input ->> 'description'), amount_cents,
      coalesce((input ->> 'customerVisible')::boolean, false), auth.uid()
    )
    returning * into expense;
    target_id := expense.id;
    result := jsonb_build_object('kind', 'expense', 'row', to_jsonb(expense));
  else
    delete from public.work_order_expenses e
    where e.tenant_id = target_tenant and e.id = expense.id;
    target_id := expense.id;
    result := jsonb_build_object('kind', 'expense', 'id', expense.id, 'deleted', true);
  end if;

  insert into public.audit_events (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    target_tenant, auth.uid(), 'staff.cost.' || normalized_command,
    case when normalized_command like 'material.%' then 'work_order_material_usage' else 'work_order_expense' end,
    target_id,
    jsonb_build_object(
      'work_order_id', work_order.id,
      'assignment_id', assignment.id,
      'customer_visible', coalesce(
        material.customer_visible,
        expense.customer_visible,
        false
      )
    )
  );

  insert into private.staff_app_command_receipts (
    tenant_id, id, actor_id, command, payload, result
  ) values (
    target_tenant, idempotency_key, auth.uid(), 'cost.' || command, input, result
  );
  return result;
end;
$$;

create or replace function public.staff_request_extra_work(
  target_tenant uuid,
  input jsonb,
  idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  staff_personnel_id uuid;
  receipt private.staff_app_command_receipts;
  work_order public.work_orders;
  assignment public.work_order_assignments;
  task public.work_order_tasks;
  result jsonb;
  requested_minutes integer;
  requested_amount bigint;
begin
  staff_personnel_id := private.require_staff_personnel(target_tenant);
  if not private.service_enabled(target_tenant, 'planning')
    or not private.service_enabled(target_tenant, 'rapportage')
  then
    raise exception 'Werkbonrapportage is niet beschikbaar' using errcode = '42501';
  end if;
  if idempotency_key is null
    or jsonb_typeof(input) <> 'object'
    or input - array['workOrderId','title','reason','minutes','amountCents'] <> '{}'::jsonb
    or input ->> 'workOrderId' is null
    or input ->> 'minutes' is null
  then
    raise exception 'Ongeldige meerwerkaanvraag' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('fieldgrid-staff-command:' || target_tenant::text || ':' || idempotency_key::text, 0)
  );
  select *
  into receipt
  from private.staff_app_command_receipts saved
  where saved.tenant_id = target_tenant and saved.id = idempotency_key;
  if found then
    if receipt.actor_id <> auth.uid()
      or receipt.command <> 'extra_work.create'
      or receipt.payload <> input
    then
      raise exception 'Gebruik een nieuwe herhaalsleutel voor gewijzigde invoer' using errcode = '23514';
    end if;
    return receipt.result;
  end if;

  requested_minutes := (input ->> 'minutes')::integer;
  requested_amount := nullif(input ->> 'amountCents', '')::bigint;
  if length(btrim(coalesce(input ->> 'title', ''))) not between 2 and 200
    or length(btrim(coalesce(input ->> 'reason', ''))) not between 3 and 1000
    or requested_minutes not between 5 and 480
    or requested_minutes % 5 <> 0
    or (requested_amount is not null and requested_amount not between 0 and 10000000)
  then
    raise exception 'Controleer omschrijving, toelichting, tijd en bedrag' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('fieldgrid-staff-extra-work:' || target_tenant::text || ':' || (input ->> 'workOrderId'), 0)
  );
  select *
  into work_order
  from public.work_orders candidate
  where candidate.tenant_id = target_tenant
    and candidate.id = (input ->> 'workOrderId')::uuid
  for update;

  select candidate.*
  into assignment
  from public.work_order_assignments candidate
  join public.dispatches dispatch
    on dispatch.tenant_id = candidate.tenant_id
   and dispatch.assignment_id = candidate.id
   and dispatch.revoked_at is null
  where candidate.tenant_id = target_tenant
    and candidate.work_order_id = work_order.id
    and candidate.personnel_id = staff_personnel_id
    and candidate.status = 'in_progress'
  for update of candidate;

  if work_order.id is null or assignment.id is null
    or work_order.status <> 'in_progress'
  then
    raise exception 'Een actieve eigen werkbon is vereist' using errcode = '42501';
  end if;
  if not private.staff_report_editable(target_tenant, work_order.id)
    or exists (
      select 1
      from public.work_order_report_versions report
      where report.tenant_id = target_tenant
        and report.work_order_id = work_order.id
        and report.version = work_order.report_version
        and report.state in ('waiting_signature','review','approved')
    )
  then
    raise exception 'Meerwerk is vergrendeld door de actuele rapportversie' using errcode = '23514';
  end if;

  insert into public.work_order_tasks (
    tenant_id, work_order_id, task_revision_id, task_code, task_name,
    duration_minutes, quantity, unit, unit_price_cents, vat_basis_points,
    is_extra_work, extra_work_status, allowed_for_staff, completed_at,
    executed_quantity, execution_state, instructions, added_by,
    staff_request_reason, staff_requested_amount_cents
  ) values (
    target_tenant, work_order.id, null, 'STAFF-EXTRA', btrim(input ->> 'title'),
    requested_minutes, 1, 'opdracht', 0, 0,
    true, 'awaiting_review', true, clock_timestamp(),
    1, 'completed', btrim(input ->> 'reason'), auth.uid(),
    btrim(input ->> 'reason'), requested_amount
  )
  returning * into task;

  update public.work_orders
  set projected_end_at = projected_end_at + make_interval(mins => requested_minutes)
  where tenant_id = target_tenant and id = work_order.id;
  update public.work_order_assignments
  set projected_end_at = projected_end_at + make_interval(mins => requested_minutes)
  where tenant_id = target_tenant
    and work_order_id = work_order.id
    and status = 'in_progress';

  result := jsonb_build_object(
    'id', task.id,
    'status', task.extra_work_status,
    'minutes', task.duration_minutes,
    'requestedAmountCents', task.staff_requested_amount_cents
  );
  insert into public.audit_events (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    target_tenant, auth.uid(), 'staff.extra_work.requested', 'work_order_task', task.id,
    jsonb_build_object(
      'work_order_id', work_order.id,
      'assignment_id', assignment.id,
      'duration_minutes', requested_minutes,
      'requested_amount_cents', requested_amount,
      'status', task.extra_work_status
    )
  );
  perform private.enqueue_event(
    target_tenant,
    'work_order.extra_work_requested',
    'work_order',
    work_order.id,
    jsonb_build_object('work_order_id', work_order.id, 'task_id', task.id),
    'staff-extra-work:' || idempotency_key::text
  );
  insert into private.staff_app_command_receipts (
    tenant_id, id, actor_id, command, payload, result
  ) values (
    target_tenant, idempotency_key, auth.uid(), 'extra_work.create', input, result
  );
  return result;
end;
$$;

revoke all on function public.staff_request_extra_work(uuid, jsonb, uuid)
  from public, anon, service_role;
grant execute on function public.staff_request_extra_work(uuid, jsonb, uuid)
  to authenticated, postgres;

create or replace function public.staff_report_customer_absent(
  target_tenant uuid,
  target_report uuid,
  expected_content_hash text,
  absence_reason text,
  idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  staff_personnel_id uuid;
  receipt private.staff_app_command_receipts;
  report public.work_order_report_versions;
  work_order public.work_orders;
  assignment public.work_order_assignments;
  exception_row public.work_order_exceptions;
  payload jsonb;
  result jsonb;
begin
  staff_personnel_id := private.require_staff_personnel(target_tenant);
  if not private.service_enabled(target_tenant, 'planning')
    or not private.service_enabled(target_tenant, 'rapportage')
  then
    raise exception 'Werkbonrapportage is niet beschikbaar' using errcode = '42501';
  end if;
  if idempotency_key is null
    or expected_content_hash !~ '^[a-f0-9]{64}$'
    or length(btrim(coalesce(absence_reason, ''))) not between 3 and 1000
  then
    raise exception 'Geef een concrete reden voor de afwezige klant' using errcode = '23514';
  end if;
  payload := jsonb_build_object(
    'reportId', target_report,
    'contentHash', expected_content_hash,
    'reason', btrim(absence_reason)
  );

  perform pg_advisory_xact_lock(
    hashtextextended('fieldgrid-staff-command:' || target_tenant::text || ':' || idempotency_key::text, 0)
  );
  select *
  into receipt
  from private.staff_app_command_receipts saved
  where saved.tenant_id = target_tenant and saved.id = idempotency_key;
  if found then
    if receipt.actor_id <> auth.uid()
      or receipt.command <> 'report.customer_absent'
      or receipt.payload <> payload
    then
      raise exception 'Gebruik een nieuwe herhaalsleutel voor gewijzigde invoer' using errcode = '23514';
    end if;
    return receipt.result;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('fieldgrid-staff-customer-absent:' || target_tenant::text || ':' || target_report::text, 0)
  );
  select *
  into report
  from public.work_order_report_versions current_report
  where current_report.tenant_id = target_tenant
    and current_report.id = target_report
  for update;
  select *
  into work_order
  from public.work_orders candidate
  where candidate.tenant_id = target_tenant
    and candidate.id = report.work_order_id
  for update;
  select candidate.*
  into assignment
  from public.work_order_assignments candidate
  join public.dispatches dispatch
    on dispatch.tenant_id = candidate.tenant_id
   and dispatch.assignment_id = candidate.id
   and dispatch.revoked_at is null
  where candidate.tenant_id = target_tenant
    and candidate.work_order_id = work_order.id
    and candidate.personnel_id = staff_personnel_id
    and candidate.status not in ('cancelled','returned')
  for update of candidate;

  if report.id is null or work_order.id is null or assignment.id is null then
    raise exception 'Actuele toegewezen rapportversie vereist' using errcode = '42501';
  end if;
  if report.version <> work_order.report_version
    or report.state <> 'waiting_signature'
    or report.content_hash <> expected_content_hash
  then
    raise exception 'De rapportversie is intussen gewijzigd' using errcode = '40001';
  end if;
  if exists (
    select 1
    from public.signatures signature
    where signature.tenant_id = target_tenant
      and signature.report_id = report.id
      and signature.signature_kind = 'customer'
      and signature.revoked_at is null
  ) then
    raise exception 'De klantondertekening is al vastgelegd' using errcode = '23514';
  end if;

  select exception_record.*
  into exception_row
  from public.work_order_exceptions exception_record
  join public.audit_events event
    on event.tenant_id = exception_record.tenant_id
   and event.entity_type = 'work_order_exception'
   and event.entity_id = exception_record.id
   and event.action = 'staff.report.customer_absent'
   and event.after_data ->> 'report_id' = report.id::text
  where exception_record.tenant_id = target_tenant
    and exception_record.work_order_id = work_order.id
    and exception_record.kind = 'customer_absent'
  order by exception_record.created_at
  limit 1;

  if exception_row.id is null then
    insert into public.work_order_exceptions (
      id, tenant_id, work_order_id, kind, description, owner_user_id,
      blocking, created_by
    ) values (
      gen_random_uuid(), target_tenant, work_order.id, 'customer_absent',
      btrim(absence_reason), coalesce(work_order.planner_user_id, work_order.created_by),
      false, auth.uid()
    ) returning * into exception_row;
    insert into public.audit_events (
      tenant_id, actor_user_id, action, entity_type, entity_id, after_data
    ) values (
      target_tenant, auth.uid(), 'staff.report.customer_absent',
      'work_order_exception', exception_row.id,
      jsonb_build_object(
        'work_order_id', work_order.id,
        'report_id', report.id,
        'report_version', report.version,
        'content_hash', report.content_hash,
        'reason', exception_row.description
      )
    );
    perform private.enqueue_event(
      target_tenant,
      'work_order.customer_absent',
      'work_order',
      work_order.id,
      jsonb_build_object(
        'work_order_id', work_order.id,
        'report_id', report.id,
        'exception_id', exception_row.id
      ),
      'staff-customer-absent:' || report.id::text
    );
  end if;

  update public.work_orders
  set attention_reason = 'customer_absent_signature_followup'
  where tenant_id = target_tenant and id = work_order.id;
  result := jsonb_build_object(
    'id', exception_row.id,
    'reportId', report.id,
    'state', report.state
  );
  insert into private.staff_app_command_receipts (
    tenant_id, id, actor_id, command, payload, result
  ) values (
    target_tenant, idempotency_key, auth.uid(), 'report.customer_absent', payload, result
  );
  return result;
end;
$$;

revoke all on function public.staff_report_customer_absent(uuid, uuid, text, text, uuid)
  from public, anon, service_role;
grant execute on function public.staff_report_customer_absent(uuid, uuid, text, text, uuid)
  to authenticated, postgres;

-- Staff report writes must cross the SECURITY DEFINER command boundary. Older
-- permissive policies allowed a staff session to create a visible parent row
-- before its files were uploaded, or to bypass optimistic version checks with
-- a direct update. Backoffice roles retain normal table writes, but only from
-- an active object session and while both required modules are enabled.
drop policy if exists report_entries_staff_insert on public.report_entries;
drop policy if exists report_entries_staff_update on public.report_entries;
drop policy if exists report_entries_manage on public.report_entries;
drop policy if exists report_entries_manage_insert on public.report_entries;
drop policy if exists report_entries_manage_update on public.report_entries;
drop policy if exists report_entries_insert on public.report_entries;
drop policy if exists report_entries_update on public.report_entries;
create policy report_entries_insert
on public.report_entries for insert to authenticated
with check (
  private.object_session_active()
  and private.service_enabled(tenant_id, 'planning')
  and private.service_enabled(tenant_id, 'rapportage')
  and private.has_role(tenant_id, array['tenant_admin','management','planner']::public.app_role[])
);
create policy report_entries_update
on public.report_entries for update to authenticated
using (
  private.object_session_active()
  and private.service_enabled(tenant_id, 'planning')
  and private.service_enabled(tenant_id, 'rapportage')
  and private.has_role(tenant_id, array['tenant_admin','management','planner']::public.app_role[])
)
with check (
  private.object_session_active()
  and private.service_enabled(tenant_id, 'planning')
  and private.service_enabled(tenant_id, 'rapportage')
  and private.has_role(tenant_id, array['tenant_admin','management','planner']::public.app_role[])
);

drop policy if exists attachments_staff_insert on public.attachments;
drop policy if exists attachments_staff_update on public.attachments;
drop policy if exists attachments_manage on public.attachments;
drop policy if exists attachments_manage_insert on public.attachments;
drop policy if exists attachments_manage_update on public.attachments;
drop policy if exists attachments_insert on public.attachments;
drop policy if exists attachments_update on public.attachments;
create policy attachments_insert
on public.attachments for insert to authenticated
with check (
  private.object_session_active()
  and private.service_enabled(tenant_id, 'planning')
  and private.service_enabled(tenant_id, 'rapportage')
  and private.has_role(tenant_id, array['tenant_admin','management','planner']::public.app_role[])
);
create policy attachments_update
on public.attachments for update to authenticated
using (
  private.object_session_active()
  and private.service_enabled(tenant_id, 'planning')
  and private.service_enabled(tenant_id, 'rapportage')
  and private.has_role(tenant_id, array['tenant_admin','management','planner']::public.app_role[])
)
with check (
  private.object_session_active()
  and private.service_enabled(tenant_id, 'planning')
  and private.service_enabled(tenant_id, 'rapportage')
  and private.has_role(tenant_id, array['tenant_admin','management','planner']::public.app_role[])
);

-- Report files are staged under a deterministic, mutation-owned path. The
-- boolean preflight is intentionally read-only: storage publication still
-- happens through the server-side scanner, never through a client bypass.
create or replace function public.staff_report_upload_allowed(
  target_tenant uuid,
  target_order uuid,
  target_entry uuid,
  target_path text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  parts text[] := string_to_array(target_path, '/');
begin
  perform private.require_staff_personnel(target_tenant);
  if not private.service_enabled(target_tenant, 'planning')
    or not private.service_enabled(target_tenant, 'rapportage')
    or target_entry is null
    or array_length(parts, 1) <> 4
    or parts[1] is distinct from target_tenant::text
    or parts[2] is distinct from target_order::text
    or parts[3] is distinct from target_entry::text
    or parts[4] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(pdf|png|jpg|webp)$'
  then
    return false;
  end if;
  return private.staff_report_editable(target_tenant, target_order);
end;
$$;

revoke all on function public.staff_report_upload_allowed(uuid,uuid,uuid,text)
  from public, anon, service_role;
grant execute on function public.staff_report_upload_allowed(uuid,uuid,uuid,text)
  to authenticated, postgres;
comment on function public.staff_report_upload_allowed(uuid,uuid,uuid,text) is
  'Read-only live authorization for server-scanned report files staged below a deterministic report mutation path.';

-- This is the only create boundary for a staff report note with attachments.
-- No report row exists while bytes are being staged. The note, every metadata
-- row, audit event and receipt become visible in one database transaction.
create or replace function public.staff_finalize_report_entry(
  target_tenant uuid,
  input jsonb,
  idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  staff_personnel_id uuid;
  receipt private.staff_app_command_receipts;
  work_order public.work_orders;
  entry public.report_entries;
  attachment_data jsonb;
  attachment_id uuid;
  attachment_path text;
  attachment_mime text;
  attachment_extension text;
  attachment_size bigint;
  attachment_hash text;
  customer_visible boolean;
  incident_severity text;
  result jsonb;
begin
  staff_personnel_id := private.require_staff_personnel(target_tenant);
  if not private.service_enabled(target_tenant, 'planning')
    or not private.service_enabled(target_tenant, 'rapportage')
  then
    raise exception 'Werkbonrapportage is niet beschikbaar' using errcode = '42501';
  end if;
  if idempotency_key is null
    or jsonb_typeof(input) <> 'object'
    or not (input ?& array[
      'reportEntryId','workOrderId','body','customerVisible',
      'incidentSeverity','attachments'
    ])
    or input - array[
      'reportEntryId','workOrderId','body','customerVisible',
      'incidentSeverity','attachments'
    ] <> '{}'::jsonb
    or input ->> 'reportEntryId' is null
    or input ->> 'workOrderId' is null
    or input ->> 'reportEntryId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or input ->> 'workOrderId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or input ->> 'reportEntryId' <> idempotency_key::text
    or jsonb_typeof(input -> 'body') <> 'string'
    or length(btrim(input ->> 'body')) not between 1 and 5000
    or jsonb_typeof(input -> 'customerVisible') <> 'boolean'
    or jsonb_typeof(input -> 'attachments') <> 'array'
    or jsonb_array_length(input -> 'attachments') > 5
    or (
      input ->> 'incidentSeverity' is not null
      and input ->> 'incidentSeverity' not in ('low','medium','high','critical')
    )
  then
    raise exception 'Ongeldige rapportregel of bijlagen' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('fieldgrid-staff-command:' || target_tenant::text || ':' || idempotency_key::text, 0)
  );
  select *
  into receipt
  from private.staff_app_command_receipts saved
  where saved.tenant_id = target_tenant and saved.id = idempotency_key;
  if found then
    if receipt.actor_id <> auth.uid()
      or receipt.command <> 'report_entry.create'
      or receipt.payload <> input
    then
      raise exception 'Gebruik een nieuwe herhaalsleutel voor gewijzigde invoer' using errcode = '23514';
    end if;
    return receipt.result;
  end if;

  select candidate.*
  into work_order
  from public.work_orders candidate
  where candidate.tenant_id = target_tenant
    and candidate.id = (input ->> 'workOrderId')::uuid
  for update;
  if work_order.id is null
    or not private.staff_report_editable(target_tenant, work_order.id)
  then
    raise exception 'Actuele toegewezen werkbon vereist' using errcode = '42501';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(input -> 'attachments') item
    where jsonb_typeof(item) <> 'object'
      or not (item ?& array['id','storagePath','fileName','mimeType','sizeBytes','sha256'])
      or item - array['id','storagePath','fileName','mimeType','sizeBytes','sha256'] <> '{}'::jsonb
      or jsonb_typeof(item -> 'id') <> 'string'
      or item ->> 'id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or jsonb_typeof(item -> 'storagePath') <> 'string'
      or jsonb_typeof(item -> 'fileName') <> 'string'
      or length(item ->> 'fileName') not between 1 and 180
      or item ->> 'fileName' ~ '[\\/[:cntrl:]]'
      or jsonb_typeof(item -> 'mimeType') <> 'string'
      or item ->> 'mimeType' not in ('application/pdf','image/png','image/jpeg','image/webp')
      or jsonb_typeof(item -> 'sizeBytes') <> 'number'
      or (item ->> 'sizeBytes')::numeric <> trunc((item ->> 'sizeBytes')::numeric)
      or (item ->> 'sizeBytes')::numeric not between 1 and 10485760
      or jsonb_typeof(item -> 'sha256') <> 'string'
      or item ->> 'sha256' !~ '^[a-f0-9]{64}$'
  ) or (
    select count(*) <> count(distinct item ->> 'id')
      or count(*) <> count(distinct item ->> 'storagePath')
    from jsonb_array_elements(input -> 'attachments') item
  ) then
    raise exception 'Ongeldige rapportbijlage' using errcode = '23514';
  end if;

  customer_visible := (input ->> 'customerVisible')::boolean;
  incident_severity := nullif(input ->> 'incidentSeverity', '');
  for attachment_data in
    select item
    from jsonb_array_elements(input -> 'attachments') item
  loop
    attachment_id := (attachment_data ->> 'id')::uuid;
    attachment_path := attachment_data ->> 'storagePath';
    attachment_mime := attachment_data ->> 'mimeType';
    attachment_size := (attachment_data ->> 'sizeBytes')::bigint;
    attachment_hash := attachment_data ->> 'sha256';
    attachment_extension := case attachment_mime
      when 'application/pdf' then 'pdf'
      when 'image/png' then 'png'
      when 'image/jpeg' then 'jpg'
      when 'image/webp' then 'webp'
    end;
    if attachment_path is distinct from concat_ws(
      '/', target_tenant::text, work_order.id::text, idempotency_key::text,
      attachment_id::text || '.' || attachment_extension
    ) or not exists (
      select 1
      from storage.objects object
      join private.file_scan_receipts scan
        on scan.object_id = object.id
       and scan.object_version = object.version
      where object.bucket_id = 'reports'
        and object.name = attachment_path
        and not coalesce(object.is_delete_marker, false)
        and object.metadata ->> 'mimetype' = attachment_mime
        and (object.metadata ->> 'size')::bigint = attachment_size
        and scan.mime_type = attachment_mime
        and scan.size_bytes = attachment_size
        and scan.sha256 = attachment_hash
    ) then
      raise exception 'Het rapportbestand is niet volledig en veilig opgeslagen. Probeer opnieuw.' using errcode = '23514';
    end if;
  end loop;

  insert into public.report_entries (
    id, tenant_id, work_order_id, author_user_id, body,
    is_incident, incident_severity, incident_status, customer_visible
  ) values (
    idempotency_key, target_tenant, work_order.id, auth.uid(), btrim(input ->> 'body'),
    incident_severity is not null, incident_severity,
    case when incident_severity is not null then 'open' end,
    customer_visible
  )
  returning * into entry;

  for attachment_data in
    select item
    from jsonb_array_elements(input -> 'attachments') item
  loop
    insert into public.attachments (
      id, tenant_id, work_order_id, report_entry_id, uploaded_by,
      storage_bucket, storage_path, file_name, mime_type, size_bytes,
      sha256, customer_visible
    ) values (
      (attachment_data ->> 'id')::uuid, target_tenant, work_order.id,
      entry.id, auth.uid(), 'reports', attachment_data ->> 'storagePath',
      attachment_data ->> 'fileName', attachment_data ->> 'mimeType',
      (attachment_data ->> 'sizeBytes')::bigint,
      attachment_data ->> 'sha256', customer_visible
    );
  end loop;

  result := jsonb_build_object(
    'kind', 'report_entry',
    'row', to_jsonb(entry) - 'author_user_id'
      || jsonb_build_object('owned_by_current_user', true),
    'attachments', coalesce((
      select jsonb_agg(
        to_jsonb(attachment) - array['storage_bucket','storage_path','uploaded_by']
        || jsonb_build_object('owned_by_current_user', true)
        order by attachment.created_at, attachment.id
      )
      from public.attachments attachment
      where attachment.tenant_id = target_tenant
        and attachment.report_entry_id = entry.id
        and attachment.deleted_at is null
    ), '[]'::jsonb)
  );
  insert into public.audit_events (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    target_tenant, auth.uid(), 'staff.report_entry.create', 'report_entry', entry.id,
    jsonb_build_object(
      'work_order_id', entry.work_order_id,
      'customer_visible', entry.customer_visible,
      'incident_severity', entry.incident_severity,
      'attachment_count', jsonb_array_length(input -> 'attachments')
    )
  );
  insert into private.staff_app_command_receipts (
    tenant_id, id, actor_id, command, payload, result
  ) values (
    target_tenant, idempotency_key, auth.uid(), 'report_entry.create', input, result
  );
  return result;
end;
$$;

revoke all on function public.staff_finalize_report_entry(uuid,jsonb,uuid)
  from public, anon, service_role;
grant execute on function public.staff_finalize_report_entry(uuid,jsonb,uuid)
  to authenticated, postgres;
comment on function public.staff_finalize_report_entry(uuid,jsonb,uuid) is
  'Idempotently creates one assigned-staff report entry and all scanner-attested attachment metadata in a single transaction.';

create or replace function public.staff_report_entry_command(
  target_tenant uuid,
  command text,
  input jsonb,
  idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  staff_personnel_id uuid;
  receipt private.staff_app_command_receipts;
  entry public.report_entries;
  result jsonb;
  target_entry uuid;
  expected_version integer;
  next_body text;
  next_customer_visible boolean;
  deletion_time timestamptz;
begin
  staff_personnel_id := private.require_staff_personnel(target_tenant);
  if not private.service_enabled(target_tenant, 'planning')
    or not private.service_enabled(target_tenant, 'rapportage')
  then
    raise exception 'Werkbonrapportage is niet beschikbaar' using errcode = '42501';
  end if;
  if idempotency_key is null
    or command not in ('update','delete')
    or jsonb_typeof(input) <> 'object'
    or input - array['id','entryId','reportEntryId','version','body','customerVisible'] <> '{}'::jsonb
    or coalesce(input ->> 'reportEntryId', input ->> 'entryId', input ->> 'id') is null
    or input ->> 'version' is null
  then
    raise exception 'Ongeldige rapportregelopdracht' using errcode = '23514';
  end if;
  if command = 'delete' and input ?| array['body','customerVisible'] then
    raise exception 'Ongeldige rapportregelopdracht' using errcode = '23514';
  end if;
  if command = 'update' and not (input ?| array['body','customerVisible']) then
    raise exception 'Er zijn geen rapportwijzigingen aangeleverd' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('fieldgrid-staff-command:' || target_tenant::text || ':' || idempotency_key::text, 0)
  );
  select *
  into receipt
  from private.staff_app_command_receipts saved
  where saved.tenant_id = target_tenant and saved.id = idempotency_key;
  if found then
    if receipt.actor_id <> auth.uid()
      or receipt.command <> 'report_entry.' || command
      or receipt.payload <> input
    then
      raise exception 'Gebruik een nieuwe herhaalsleutel voor gewijzigde invoer' using errcode = '23514';
    end if;
    return receipt.result;
  end if;

  target_entry := coalesce(input ->> 'reportEntryId', input ->> 'entryId', input ->> 'id')::uuid;
  expected_version := (input ->> 'version')::integer;
  select report.*
  into entry
  from public.report_entries report
  where report.tenant_id = target_tenant
    and report.id = target_entry
    and report.author_user_id = auth.uid()
    and report.deleted_at is null
  for update;
  if entry.id is null then
    raise exception 'Rapportregel niet beschikbaar' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('fieldgrid-staff-report:' || target_tenant::text || ':' || entry.work_order_id::text, 0)
  );
  if entry.version is distinct from expected_version then
    raise exception 'De rapportregel is intussen gewijzigd. Laad opnieuw.' using errcode = '40001';
  end if;
  if not private.staff_report_editable(target_tenant, entry.work_order_id) then
    raise exception 'De rapportage van deze werkbon kan niet meer worden gewijzigd' using errcode = '23514';
  end if;

  if command = 'update' then
    next_body := case when input ? 'body' then btrim(input ->> 'body') else entry.body end;
    next_customer_visible := case
      when input ? 'customerVisible' then (input ->> 'customerVisible')::boolean
      else entry.customer_visible
    end;
    if length(next_body) not between 1 and 10000
      or (input ? 'customerVisible' and jsonb_typeof(input -> 'customerVisible') <> 'boolean')
    then
      raise exception 'Vul een geldige rapporttekst in' using errcode = '23514';
    end if;
    if input ? 'customerVisible' then
      update public.attachments attachment
      set customer_visible = next_customer_visible
      where attachment.tenant_id = target_tenant
        and attachment.report_entry_id = entry.id
        and attachment.deleted_at is null;
    end if;
    update public.report_entries report
    set body = next_body,
        customer_visible = next_customer_visible
    where report.tenant_id = target_tenant and report.id = entry.id
    returning report.* into entry;
    result := jsonb_build_object(
      'kind', 'report_entry',
      'row', to_jsonb(entry) - 'author_user_id' || jsonb_build_object('owned_by_current_user', true)
    );
  else
    deletion_time := clock_timestamp();
    update public.attachments attachment
    set deleted_at = deletion_time
    where attachment.tenant_id = target_tenant
      and attachment.report_entry_id = entry.id
      and attachment.deleted_at is null;
    update public.report_entries report
    set deleted_at = deletion_time
    where report.tenant_id = target_tenant and report.id = entry.id
    returning report.* into entry;
    result := jsonb_build_object('kind', 'report_entry', 'id', entry.id, 'deleted', true);
  end if;

  insert into public.audit_events (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    target_tenant, auth.uid(), 'staff.report_entry.' || command,
    'report_entry', entry.id,
    jsonb_build_object('work_order_id', entry.work_order_id, 'version', entry.version)
  );
  insert into private.staff_app_command_receipts (
    tenant_id, id, actor_id, command, payload, result
  ) values (
    target_tenant, idempotency_key, auth.uid(), 'report_entry.' || command, input, result
  );
  return result;
end;
$$;

-- Expenses that the employee marks customer-visible are part of the signed
-- report content just like customer-visible material usage.
create or replace function private.work_order_report_snapshot(
  w public.work_orders,
  summary text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'schema', 1,
    'number', w.work_order_number,
    'title', coalesce(nullif(w.title, ''), w.discipline),
    'summary', summary,
    'tenant', jsonb_build_object(
      'name', te.name,
      'primaryColor', coalesce(b.primary_color, '#222C35'),
      'accentColor', coalesce(b.accent_color, '#41AC42')
    ),
    'customer', jsonb_build_object('name', c.name),
    'object', jsonb_build_object(
      'name', o.name,
      'address', jsonb_build_object(
        'street', o.address ->> 'street',
        'postal_code', o.address ->> 'postal_code',
        'city', o.address ->> 'city',
        'country', o.address ->> 'country'
      )
    ),
    'executionDate', coalesce(w.actual_start_at, w.projected_start_at),
    'endedAt', w.actual_end_at,
    'timezone', te.timezone,
    'tasks', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'code', t.task_code,
          'name', t.task_name,
          'quantity', t.quantity,
          'unit', t.unit,
          'executedQuantity', coalesce(t.executed_quantity, case when t.completed_at is not null then t.quantity else 0 end),
          'result', t.execution_state,
          'transferredQuantity', coalesce((to_jsonb(t) ->> 'transferred_quantity')::numeric, 0),
          'withdrawnQuantity', coalesce((to_jsonb(t) ->> 'withdrawn_quantity')::numeric, 0),
          'extraWork', t.is_extra_work
        )
        order by t.created_at, t.id
      )
      from public.work_order_tasks t
      where t.tenant_id = w.tenant_id
        and t.work_order_id = w.id
        and (not t.is_extra_work or t.extra_work_status <> 'rejected')
    ), '[]'::jsonb),
    'checklists', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'name', checklist.name,
          'version', template.version,
          'question', question ->> 'label',
          'unit', question ->> 'unit',
          'type', question ->> 'type',
          'value', answer.value,
          'notApplicable', answer.not_applicable,
          'reason', case when answer.not_applicable then answer.reason else null end,
          'answerVersion', answer.version,
          'attachmentId', answer.attachment_id
        )
        order by checklist.created_at, question ->> 'id'
      )
      from public.work_order_checklists checklist
      join public.work_order_template_versions template
        on template.id = checklist.template_revision_id
      cross join lateral jsonb_array_elements(checklist.definition -> 'questions') question
      join public.work_order_checklist_answers answer
        on answer.checklist_id = checklist.id
       and answer.question_id = question ->> 'id'
      where checklist.tenant_id = w.tenant_id
        and checklist.work_order_id = w.id
        and coalesce((question ->> 'customerVisible')::boolean, false)
        and (
          question -> 'condition' is null
          or question -> 'condition' = 'null'::jsonb
          or exists (
            select 1
            from public.work_order_checklist_answers condition_answer
            where condition_answer.checklist_id = checklist.id
              and condition_answer.question_id = question -> 'condition' ->> 'questionId'
              and condition_answer.value = question -> 'condition' -> 'equals'
          )
        )
    ), '[]'::jsonb),
    'materials', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'description', material.description,
          'quantity', material.quantity,
          'unit', material.unit,
          'taskId', material.task_id,
          'unitPriceCents', finance.unit_price_cents
        )
        order by material.created_at, material.id
      )
      from public.work_order_material_usage material
      left join private.work_order_material_finance finance
        on finance.tenant_id = material.tenant_id and finance.usage_id = material.id
      where material.tenant_id = w.tenant_id
        and material.work_order_id = w.id
        and material.customer_visible
    ), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', expense.id,
          'description', expense.description,
          'amountCents', expense.amount_cents
        )
        order by expense.created_at, expense.id
      )
      from public.work_order_expenses expense
      where expense.tenant_id = w.tenant_id
        and expense.work_order_id = w.id
        and expense.customer_visible
    ), '[]'::jsonb),
    'notes', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', entry.id, 'body', entry.body)
        order by entry.created_at, entry.id
      )
      from public.report_entries entry
      where entry.tenant_id = w.tenant_id
        and entry.work_order_id = w.id
        and entry.customer_visible
        and entry.deleted_at is null
    ), '[]'::jsonb),
    'attachments', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', attachment.id,
          'name', attachment.file_name,
          'mime', attachment.mime_type,
          'sha256', attachment.sha256
        )
        order by attachment.created_at, attachment.id
      )
      from public.attachments attachment
      where attachment.tenant_id = w.tenant_id
        and attachment.work_order_id = w.id
        and attachment.deleted_at is null
        and (
          attachment.report_entry_id is null
          or exists (
            select 1
            from public.report_entries parent_entry
            where parent_entry.tenant_id = attachment.tenant_id
              and parent_entry.id = attachment.report_entry_id
              and parent_entry.work_order_id = attachment.work_order_id
              and parent_entry.deleted_at is null
          )
        )
        and (
          attachment.customer_visible
          or exists (
            select 1
            from public.work_order_checklists checklist
            cross join lateral jsonb_array_elements(checklist.definition -> 'questions') question
            join public.work_order_checklist_answers answer
              on answer.checklist_id = checklist.id
             and answer.question_id = question ->> 'id'
            where checklist.work_order_id = w.id
              and answer.attachment_id = attachment.id
              and coalesce((question ->> 'customerVisible')::boolean, false)
          )
        )
    ), '[]'::jsonb)
  )
  from public.tenants te
  left join public.tenant_branding b on b.tenant_id = te.id
  join public.customers c on c.tenant_id = te.id and c.id = w.customer_id
  join public.objects o on o.tenant_id = te.id and o.id = w.object_id
  where te.id = w.tenant_id;
$$;

revoke all on function private.work_order_report_snapshot(public.work_orders,text)
  from public, anon, authenticated, service_role;
grant execute on function private.work_order_report_snapshot(public.work_orders,text) to postgres;

-- The customer snapshot now freezes the material sales price as a separate
-- finance-owned field. Ownership still comes from the immutable operational
-- material row; compare only that row's original fields so the expanded
-- snapshot cannot make an employee's own material disappear.
create or replace function private.capture_report_ownership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  section text;
  item record;
  actor uuid;
  owners jsonb := '{}'::jsonb;
  part jsonb;
begin
  foreach section in array array['notes','attachments','checklists','materials'] loop
    part := '{}'::jsonb;
    for item in
      select value, ordinality
      from jsonb_array_elements(coalesce(new.snapshot -> section, '[]'::jsonb)) with ordinality
    loop
      actor := null;
      if section = 'notes' then
        select entry.author_user_id
        into actor
        from public.report_entries entry
        where entry.tenant_id = new.tenant_id
          and entry.work_order_id = new.work_order_id
          and entry.id::text = item.value ->> 'id';
      elsif section = 'attachments' then
        select attachment.uploaded_by
        into actor
        from public.attachments attachment
        where attachment.tenant_id = new.tenant_id
          and attachment.work_order_id = new.work_order_id
          and attachment.id::text = item.value ->> 'id'
          and attachment.sha256 = item.value ->> 'sha256';
      elsif section = 'materials' then
        select case
          when count(distinct material.created_by) = 1
            then min(material.created_by::text)::uuid
        end
        into actor
        from public.work_order_material_usage material
        where material.tenant_id = new.tenant_id
          and material.work_order_id = new.work_order_id
          and jsonb_build_object(
            'description', material.description,
            'quantity', material.quantity,
            'unit', material.unit,
            'taskId', material.task_id
          ) = item.value - 'unitPriceCents';
      else
        select case
          when count(distinct answer.updated_by) = 1
            then min(answer.updated_by::text)::uuid
        end
        into actor
        from public.work_order_checklists checklist
        join public.work_order_template_versions template
          on template.id = checklist.template_revision_id
        cross join lateral jsonb_array_elements(checklist.definition -> 'questions') question
        join public.work_order_checklist_answers answer
          on answer.checklist_id = checklist.id
         and answer.question_id = question ->> 'id'
        where checklist.tenant_id = new.tenant_id
          and checklist.work_order_id = new.work_order_id
          and jsonb_build_object(
            'name', checklist.name,
            'version', template.version,
            'question', question ->> 'label',
            'unit', question ->> 'unit',
            'type', question ->> 'type',
            'value', answer.value,
            'notApplicable', answer.not_applicable,
            'reason', case when answer.not_applicable then answer.reason else null end,
            'answerVersion', answer.version,
            'attachmentId', answer.attachment_id
          ) = item.value;
      end if;
      if actor is not null then
        part := part || jsonb_build_object(item.ordinality::text, actor);
      end if;
    end loop;
    owners := owners || jsonb_build_object(section, part);
  end loop;
  insert into private.work_order_report_ownership (report_id, tenant_id, owners)
  values (new.id, new.tenant_id, owners);
  return new;
end;
$$;

revoke all on function private.capture_report_ownership()
  from public, anon, authenticated, service_role;
grant execute on function private.capture_report_ownership() to postgres;

-- Keep every customer-visible field in customer deliveries. Staff keep the
-- existing contribution-only projection; the exact customer copy used for an
-- on-device signature is exposed only through the guarded RPC below.
create or replace function private.report_snapshot_for_actor(
  r public.work_order_report_versions
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
  owners jsonb;
  section text;
  visible jsonb;
begin
  if private.report_backoffice(r.tenant_id) then
    return r.snapshot;
  end if;
  select jsonb_object_agg(key, value)
  into result
  from jsonb_each(r.snapshot)
  where key = any(array[
    'schema','number','title','summary','tenant','customer','object',
    'executionDate','endedAt','timezone','tasks','notes','checklists',
    'materials','expenses','attachments'
  ]);
  if not private.is_work_order_assignee(r.tenant_id, r.work_order_id) then
    return result;
  end if;
  select ownership.owners
  into owners
  from private.work_order_report_ownership ownership
  where ownership.tenant_id = r.tenant_id
    and ownership.report_id = r.id;
  foreach section in array array['notes','attachments','checklists','materials'] loop
    select coalesce(jsonb_agg(value order by ordinality), '[]'::jsonb)
    into visible
    from jsonb_array_elements(coalesce(result -> section, '[]'::jsonb)) with ordinality
    where owners -> section ->> ordinality::text = auth.uid()::text;
    result := jsonb_set(result, array[section], visible);
  end loop;
  -- Expense ownership was not captured for historical report versions. Never
  -- guess it from matching labels or amounts; own live costs remain available
  -- through the bounded staff workspace.
  result := jsonb_set(result, '{expenses}', '[]'::jsonb);
  if r.created_by is distinct from auth.uid() then
    result := jsonb_set(
      result,
      '{summary}',
      '"Gezamenlijk rapport. Je ziet hier de opdrachtresultaten en je eigen bijdrage."'
    );
  end if;
  return result;
end;
$$;

revoke all on function private.report_snapshot_for_actor(public.work_order_report_versions)
  from public, anon, authenticated, service_role;

create or replace function private.customer_signature_snapshot(snapshot jsonb)
returns jsonb
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  allowed_keys text[] := array[
    'schema','number','title','summary','tenant','customer','object',
    'executionDate','endedAt','timezone','tasks','notes','checklists',
    'materials','expenses','attachments'
  ];
begin
  if jsonb_typeof(snapshot) <> 'object'
    or not (snapshot ?& allowed_keys)
    or snapshot - allowed_keys <> '{}'::jsonb
    or snapshot ->> 'schema' <> '1'
    or jsonb_typeof(snapshot -> 'tenant') <> 'object'
    or jsonb_typeof(snapshot -> 'customer') <> 'object'
    or jsonb_typeof(snapshot -> 'object') <> 'object'
    or jsonb_typeof(snapshot #> '{object,address}') <> 'object'
    or jsonb_typeof(snapshot -> 'tasks') <> 'array'
    or jsonb_typeof(snapshot -> 'notes') <> 'array'
    or jsonb_typeof(snapshot -> 'checklists') <> 'array'
    or jsonb_typeof(snapshot -> 'materials') <> 'array'
    or jsonb_typeof(snapshot -> 'expenses') <> 'array'
    or jsonb_typeof(snapshot -> 'attachments') <> 'array'
    or (snapshot -> 'tenant') - array['name','primaryColor','accentColor'] <> '{}'::jsonb
    or (snapshot -> 'customer') - array['name'] <> '{}'::jsonb
    or (snapshot -> 'object') - array['name','address'] <> '{}'::jsonb
    or (snapshot #> '{object,address}') - array['street','postal_code','city','country'] <> '{}'::jsonb
    or exists (
      select 1 from jsonb_array_elements(snapshot -> 'tasks') item
      where jsonb_typeof(item) <> 'object'
        or item - array[
          'id','code','name','quantity','unit','executedQuantity','result',
          'transferredQuantity','withdrawnQuantity','extraWork'
        ] <> '{}'::jsonb
    )
    or exists (
      select 1 from jsonb_array_elements(snapshot -> 'notes') item
      where jsonb_typeof(item) <> 'object'
        or item - array['id','body'] <> '{}'::jsonb
    )
    or exists (
      select 1 from jsonb_array_elements(snapshot -> 'checklists') item
      where jsonb_typeof(item) <> 'object'
        or item - array[
          'name','version','question','unit','type','value','notApplicable',
          'reason','answerVersion','attachmentId'
        ] <> '{}'::jsonb
    )
    or exists (
      select 1 from jsonb_array_elements(snapshot -> 'materials') item
      where jsonb_typeof(item) <> 'object'
        or item - array['description','quantity','unit','taskId','unitPriceCents'] <> '{}'::jsonb
    )
    or exists (
      select 1 from jsonb_array_elements(snapshot -> 'expenses') item
      where jsonb_typeof(item) <> 'object'
        or item - array['id','description','amountCents'] <> '{}'::jsonb
    )
    or exists (
      select 1 from jsonb_array_elements(snapshot -> 'attachments') item
      where jsonb_typeof(item) <> 'object'
        or item - array['id','name','mime','sha256'] <> '{}'::jsonb
    )
  then
    raise exception 'Deze rapportversie gebruikt een niet-ondersteund klantschema'
      using errcode = '23514';
  end if;
  return snapshot;
end;
$$;

revoke all on function private.customer_signature_snapshot(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function private.customer_signature_snapshot(jsonb) to postgres;

create or replace function public.staff_report_signature_preview(
  target_tenant uuid,
  target_report uuid,
  expected_content_hash text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  staff_personnel_id uuid;
  report public.work_order_report_versions;
  work_order public.work_orders;
begin
  staff_personnel_id := private.require_staff_personnel(target_tenant);
  if not private.service_enabled(target_tenant, 'planning')
    or not private.service_enabled(target_tenant, 'rapportage')
    or target_report is null
    or expected_content_hash !~ '^[a-f0-9]{64}$'
  then
    raise exception 'Actuele rapportweergave vereist' using errcode = '42501';
  end if;

  select current_report.*
  into report
  from public.work_order_report_versions current_report
  where current_report.tenant_id = target_tenant
    and current_report.id = target_report;
  select candidate.*
  into work_order
  from public.work_orders candidate
  where candidate.tenant_id = target_tenant
    and candidate.id = report.work_order_id;

  if report.id is null
    or work_order.id is null
    or report.version <> work_order.report_version
    or report.state not in ('waiting_signature','review')
    or report.content_hash <> expected_content_hash
    or encode(extensions.digest(report.snapshot::text, 'sha256'), 'hex') <> report.content_hash
    or report.signature_policy ->> 'mode' = 'none'
    or exists (
      select 1
      from public.signatures signature
      where signature.tenant_id = report.tenant_id
        and signature.report_id = report.id
        and signature.signature_kind = 'customer'
        and signature.revoked_at is null
    )
    or not private.work_order_execution_actor(
      target_tenant,
      work_order.id,
      auth.uid(),
      nullif(auth.jwt() ->> 'session_id', '')::uuid
    )
    or not exists (
      select 1
      from public.work_order_assignments assignment
      join public.dispatches dispatch
        on dispatch.tenant_id = assignment.tenant_id
       and dispatch.assignment_id = assignment.id
       and dispatch.revoked_at is null
      where assignment.tenant_id = target_tenant
        and assignment.work_order_id = work_order.id
        and assignment.personnel_id = staff_personnel_id
        and assignment.status not in ('cancelled','returned')
    )
  then
    raise exception 'De rapportversie is niet beschikbaar voor ondertekening'
      using errcode = '42501';
  end if;
  perform private.customer_signature_snapshot(report.snapshot);

  return jsonb_build_object(
    'id', report.id,
    'version', report.version,
    'state', report.state,
    'snapshot', report.snapshot,
    'contentHash', report.content_hash,
    'projection', 'customer_copy',
    'policy', report.signature_policy,
    'createdAt', report.created_at,
    'approvedAt', report.approved_at,
    'employeeVerified', false,
    'waiver', null,
    'signatures', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', signature.id,
          'name', signature.signer_name,
          'capacity', signature.signer_capacity,
          'capturedBy', null,
          'signedAt', signature.signed_at,
          'channel', signature.channel,
          'kind', signature.signature_kind
        ) order by signature.signed_at, signature.id
      )
      from public.signatures signature
      where signature.tenant_id = report.tenant_id
        and signature.report_id = report.id
        and signature.signature_kind = 'customer'
        and signature.revoked_at is null
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.staff_report_signature_preview(uuid,uuid,text)
  from public, anon, service_role;
grant execute on function public.staff_report_signature_preview(uuid,uuid,text)
  to authenticated, postgres;

create or replace function public.staff_report_signature_preview_file(
  target_report uuid,
  asset_id uuid,
  expected_content_hash text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  report public.work_order_report_versions;
  preview jsonb;
  attachment public.attachments;
begin
  select current_report.*
  into report
  from public.work_order_report_versions current_report
  where current_report.id = target_report;
  if report.id is null or asset_id is null then
    raise exception 'Rapportbijlage niet beschikbaar' using errcode = '42501';
  end if;
  preview := public.staff_report_signature_preview(
    report.tenant_id,
    report.id,
    expected_content_hash
  );
  select candidate.*
  into attachment
  from public.attachments candidate
  where candidate.tenant_id = report.tenant_id
    and candidate.work_order_id = report.work_order_id
    and candidate.id = asset_id
    and candidate.deleted_at is null
    and exists (
      select 1
      from jsonb_array_elements(preview #> '{snapshot,attachments}') item
      where item ->> 'id' = candidate.id::text
        and item ->> 'sha256' = candidate.sha256
    );
  if attachment.id is null then
    raise exception 'Rapportbijlage niet beschikbaar' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'bucket', attachment.storage_bucket,
    'path', attachment.storage_path,
    'name', attachment.file_name,
    'mime', attachment.mime_type,
    'sha256', attachment.sha256,
    'scope', case
      when array_length(string_to_array(attachment.storage_path, '/'), 1) = 3
        then jsonb_build_array(report.tenant_id, report.work_order_id)
      when attachment.storage_path like report.tenant_id::text || '/' || report.work_order_id::text || '/communication/%'
        then jsonb_build_array(report.tenant_id, report.work_order_id, 'communication')
      else jsonb_build_array(report.tenant_id, report.work_order_id, attachment.report_entry_id)
    end
  );
end;
$$;

revoke all on function public.staff_report_signature_preview_file(uuid,uuid,text)
  from public, anon, service_role;
grant execute on function public.staff_report_signature_preview_file(uuid,uuid,text)
  to authenticated, postgres;

-- Re-apply the exact customer-preview guard at intent creation. The browser
-- confirmation is useful UX, but this server check is the authority even for
-- direct RPC callers.
create or replace function public.prepare_work_order_signature(
  target_work_order_id uuid,
  target_report_id uuid,
  expected_hash text,
  signer_name text,
  signer_capacity text,
  signature_kind text,
  idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  work_order public.work_orders;
  report public.work_order_report_versions;
  intent private.work_order_signature_intents;
  session_id uuid;
begin
  select candidate.* into work_order
  from public.work_orders candidate
  where candidate.id = target_work_order_id;
  session_id := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  if not private.work_order_execution_actor(
    work_order.tenant_id,
    work_order.id,
    auth.uid(),
    session_id
  ) then
    raise exception 'Vastleggen vereist personeelsuitvoering en actuele toewijzing'
      using errcode = '42501';
  end if;
  select candidate.* into work_order
  from public.work_orders candidate
  where candidate.id = work_order.id
  for update;
  select candidate.* into report
  from public.work_order_report_versions candidate
  where candidate.tenant_id = work_order.tenant_id
    and candidate.id = target_report_id
    and candidate.work_order_id = work_order.id;
  if report.id is null
    or report.version <> work_order.report_version
    or report.content_hash <> expected_hash
    or report.state not in ('waiting_signature','review')
  then
    raise exception 'Bekijk eerst de actuele rapportversie opnieuw' using errcode = '40001';
  end if;
  if signature_kind not in ('customer','employee')
    or (signature_kind = 'customer' and report.signature_policy ->> 'mode' = 'none')
    or length(btrim(signer_name)) not between 2 and 120
    or length(btrim(signer_capacity)) not between 2 and 120
  then
    raise exception 'Vul naam en hoedanigheid in' using errcode = '23514';
  end if;
  if signature_kind = 'customer' then
    perform private.customer_signature_snapshot(report.snapshot);
    if encode(extensions.digest(report.snapshot::text, 'sha256'), 'hex') <> report.content_hash then
      raise exception 'De rapportinhoud en het inhoudskenmerk komen niet overeen'
        using errcode = '40001';
    end if;
    if exists (
      select 1 from public.signatures signature
      where signature.tenant_id = report.tenant_id
        and signature.report_id = report.id
        and signature.signature_kind = 'customer'
        and signature.revoked_at is null
    ) then
      raise exception 'De klantondertekening is al vastgelegd' using errcode = '23514';
    end if;
  end if;
  select saved.* into intent
  from private.work_order_signature_intents saved
  where saved.id = idempotency_key;
  if found then
    if (
      intent.actor_id,
      intent.session_id,
      intent.report_id,
      intent.content_hash,
      intent.signer_name,
      intent.signer_capacity,
      intent.signature_kind
    ) is distinct from (
      auth.uid(),
      session_id,
      report.id,
      expected_hash,
      btrim(signer_name),
      btrim(signer_capacity),
      signature_kind
    ) then
      raise exception 'Ongeldige herhaalsleutel' using errcode = '23514';
    end if;
  else
    insert into private.work_order_signature_intents (
      id, tenant_id, work_order_id, report_id, actor_id, session_id,
      content_hash, signer_name, signer_capacity, signature_kind, storage_path
    ) values (
      idempotency_key, work_order.tenant_id, work_order.id, report.id,
      auth.uid(), session_id, expected_hash, btrim(signer_name),
      btrim(signer_capacity), signature_kind,
      work_order.tenant_id || '/' || work_order.id || '/' || idempotency_key || '.png'
    ) returning * into intent;
  end if;
  return jsonb_build_object(
    'id', intent.id,
    'path', intent.storage_path,
    'consumed', intent.consumed_at is not null
  );
end;
$$;

revoke all on function public.prepare_work_order_signature(uuid,uuid,text,text,text,text,uuid)
  from public, anon, service_role;
grant execute on function public.prepare_work_order_signature(uuid,uuid,text,text,text,text,uuid)
  to authenticated, postgres;

create or replace function private.work_order_report_source_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  guarded_work_order_id uuid;
  guarded_tenant_id uuid;
  changed boolean := true;
  old_data jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) else '{}'::jsonb end;
  new_data jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) else '{}'::jsonb end;
  old_customer_visible boolean := coalesce((old_data ->> 'customer_visible')::boolean, false);
  new_customer_visible boolean := coalesce((new_data ->> 'customer_visible')::boolean, false);
begin
  guarded_work_order_id := coalesce(
    nullif(new_data ->> 'work_order_id', '')::uuid,
    nullif(old_data ->> 'work_order_id', '')::uuid
  );
  guarded_tenant_id := coalesce(
    nullif(new_data ->> 'tenant_id', '')::uuid,
    nullif(old_data ->> 'tenant_id', '')::uuid
  );

  if tg_table_name = 'attachments'
    and tg_op <> 'INSERT'
    and exists (
      select 1
      from public.work_order_report_versions report
      where report.tenant_id = (old_data ->> 'tenant_id')::uuid
        and report.work_order_id = (old_data ->> 'work_order_id')::uuid
        and exists (
          select 1
          from jsonb_array_elements(report.snapshot -> 'attachments') item
          where item ->> 'id' = old_data ->> 'id'
            and item ->> 'sha256' = old_data ->> 'sha256'
        )
    )
  then
    if tg_op = 'DELETE'
      or (old_data - array['updated_at','version'])
        is distinct from (new_data - array['updated_at','version'])
    then
      raise exception 'Bewijsbijlage van een rapportversie is onveranderlijk; voeg een nieuwe bijlage toe'
        using errcode = '23514';
    end if;
  end if;

  if tg_table_name = 'report_entries' then
    if tg_op = 'UPDATE' then
      changed := (old_customer_visible or new_customer_visible)
        and jsonb_build_array(
          old_data -> 'body', old_data -> 'customer_visible', old_data -> 'deleted_at',
          old_data -> 'work_order_id', old_data -> 'tenant_id'
        ) is distinct from jsonb_build_array(
          new_data -> 'body', new_data -> 'customer_visible', new_data -> 'deleted_at',
          new_data -> 'work_order_id', new_data -> 'tenant_id'
        );
    elsif tg_op = 'INSERT' then
      changed := new_customer_visible;
    else
      changed := old_customer_visible;
    end if;
  elsif tg_table_name = 'attachments' then
    if tg_op = 'UPDATE' then
      changed := old_customer_visible or new_customer_visible;
    elsif tg_op = 'INSERT' then
      changed := new_customer_visible;
    else
      changed := old_customer_visible;
    end if;
  elsif tg_table_name = 'work_order_tasks' and tg_op = 'UPDATE' then
    changed := jsonb_build_array(
      old_data -> 'task_code', old_data -> 'task_name', old_data -> 'quantity',
      old_data -> 'executed_quantity', old_data -> 'unit', old_data -> 'completed_at',
      old_data -> 'execution_state'
    ) is distinct from jsonb_build_array(
      new_data -> 'task_code', new_data -> 'task_name', new_data -> 'quantity',
      new_data -> 'executed_quantity', new_data -> 'unit', new_data -> 'completed_at',
      new_data -> 'execution_state'
    );
  elsif tg_table_name in ('work_order_material_usage','work_order_expenses') then
    -- Once a report is submitted, both customer-visible and internal cost
    -- sources stay fixed until the report returns to correction.
    changed := true;
  end if;

  if tg_table_name = 'work_order_expenses' and tg_op <> 'DELETE' and not exists (
    select 1
    from public.work_order_assignments assignment
    where assignment.tenant_id = (new_data ->> 'tenant_id')::uuid
      and assignment.id = (new_data ->> 'assignment_id')::uuid
      and assignment.work_order_id = (new_data ->> 'work_order_id')::uuid
      and assignment.personnel_id = (new_data ->> 'personnel_id')::uuid
  ) then
    raise exception 'Kostenregel en medewerkerstoewijzing horen niet bij elkaar' using errcode = '23514';
  end if;

  if changed and exists (
    select 1
    from public.work_order_report_versions report
    where report.tenant_id = guarded_tenant_id
      and report.work_order_id = guarded_work_order_id
      and report.state in ('waiting_signature','review','approved')
  ) then
    raise exception 'Vraag eerst een rapportcorrectie aan voordat klantzichtbare uitvoering wordt gewijzigd'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists work_order_material_usage_snapshot_guard on public.work_order_material_usage;
create trigger work_order_material_usage_snapshot_guard
before insert or update or delete on public.work_order_material_usage
for each row execute function private.work_order_report_source_guard();

create trigger work_order_expenses_snapshot_guard
before insert or update or delete on public.work_order_expenses
for each row execute function private.work_order_report_source_guard();

revoke all on function private.work_order_report_source_guard() from public, anon, authenticated, service_role;
grant execute on function private.work_order_report_source_guard() to postgres;

-- Extend the existing strict task DTO only with operational proposal evidence.
-- The actual financial columns and commercial snapshot remain excluded. A
-- requested amount is visible solely to the employee who entered it.
create or replace function private.staff_task_dto(task public.work_order_tasks)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select (
    select jsonb_object_agg(key, value)
    from jsonb_each(to_jsonb(task))
    where key = any(array[
      'id','tenant_id','work_order_id','task_revision_id','task_code','task_name',
      'quantity','unit','duration_minutes','is_extra_work','extra_work_status',
      'completed_at','created_at','updated_at','executed_quantity','execution_state',
      'execution_version','instructions','scope_root_task_id','transferred_quantity',
      'withdrawn_quantity','staff_request_reason'
    ])
  ) || jsonb_build_object(
    'staff_requested_amount_cents', case
      when task.added_by = auth.uid() then task.staff_requested_amount_cents
      else null
    end,
    'assigned_personnel_id', case
      when task.assigned_personnel_id = private.current_personnel_id(task.tenant_id)
      then task.assigned_personnel_id
    end,
    'completion_note', case
      when exists (
        select 1
        from public.work_order_task_contributions contribution
        where contribution.tenant_id = task.tenant_id
          and contribution.task_id = task.id
          and contribution.execution_version = task.execution_version
          and contribution.actor_id = auth.uid()
      ) then task.completion_note
    end,
    'can_execute', private.task_execution_allowed(task)
  )
$$;

revoke all on function private.staff_task_dto(public.work_order_tasks)
  from public, anon, authenticated, service_role;
grant execute on function private.staff_task_dto(public.work_order_tasks) to postgres;

-- Start from the final security-gate projection, then add only data belonging
-- to the current personnel record or a currently dispatched work order.
create or replace function public.staff_workspace(target_tenant uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ids uuid[] := '{}'::uuid[];
  staff_personnel_id uuid;
  result jsonb;
begin
  if not private.object_session_active()
    or not private.has_role(target_tenant, array['staff']::public.app_role[])
    or not private.service_enabled(target_tenant, 'personeel')
  then
    raise exception 'Personeelstoegang vereist' using errcode = '42501';
  end if;

  select p.id
  into staff_personnel_id
  from public.personnel p
  where p.tenant_id = target_tenant
    and p.user_id = auth.uid()
    and p.status = 'active';

  -- Missing/inactive personnel is a friendly empty workspace. Authentication,
  -- tenant role and module checks above still fail closed.
  if staff_personnel_id is not null then
    select coalesce(array_agg(w.id), '{}'::uuid[])
    into ids
    from public.work_orders w
    where w.tenant_id = target_tenant
      and private.service_enabled(target_tenant, 'planning')
      and (
        private.is_work_order_assignee(target_tenant, w.id)
        -- A returned assignment is no longer an active execution capability,
        -- but remains visible to its employee as immutable planning/history.
        -- Keep this projection-only exception separate from
        -- is_work_order_assignee so storage and mutation guards stay closed.
        or (
          w.status <> 'cancelled'
          and exists (
            select 1
            from public.work_order_assignments returned_assignment
            where returned_assignment.tenant_id = target_tenant
              and returned_assignment.work_order_id = w.id
              and returned_assignment.personnel_id = staff_personnel_id
              and returned_assignment.status = 'returned'
              and exists (
                select 1
                from public.dispatches returned_dispatch
                where returned_dispatch.tenant_id = returned_assignment.tenant_id
                  and returned_dispatch.assignment_id = returned_assignment.id
                  and returned_dispatch.revoked_at is null
              )
          )
        )
      );
  end if;

  select jsonb_build_object(
    'customers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', customer.id,
        'tenant_id', customer.tenant_id,
        'name', customer.name
      ))
      from public.customers customer
      where customer.tenant_id = target_tenant
        and exists (
          select 1 from public.work_orders w
          where w.id = any(ids) and w.customer_id = customer.id
        )
    ), '[]'::jsonb),
    -- The shared WorkspaceData.contacts shape is a backoffice customer-contact
    -- DTO. Staff gets a separate assignment-bound projection instead.
    'contacts', '[]'::jsonb,
    'staffContacts', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', contact.contact_id,
          'tenant_id', contact.tenant_id,
          'work_order_id', contact.work_order_id,
          'name', contact.snapshot ->> 'name',
          'email', contact.snapshot ->> 'email',
          'phone', contact.snapshot ->> 'phone',
          'roles', contact.roles
        )
        order by
          case when 'site' = any(contact.roles) then 0 when 'requester' = any(contact.roles) then 1 else 2 end,
          contact.snapshot ->> 'name',
          contact.contact_id
      )
      from public.work_order_contacts contact
      where contact.tenant_id = target_tenant
        and contact.work_order_id = any(ids)
    ), '[]'::jsonb),
    'objects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', object.id,
        'tenant_id', object.tenant_id,
        'name', object.name,
        'address', object.address
      ))
      from public.objects object
      where object.tenant_id = target_tenant
        and exists (
          select 1 from public.work_orders w
          where w.id = any(ids) and w.object_id = object.id
        )
    ), '[]'::jsonb),
    'personnel', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', person.id,
        'tenant_id', person.tenant_id,
        'employee_number', person.employee_number,
        'full_name', person.full_name,
        'preferred_name', person.preferred_name,
        'email', person.email,
        'phone', person.phone,
        'mobile_phone', person.mobile_phone,
        'birth_date', person.birth_date,
        'status', person.status,
        'home_address', person.home_address,
        'emergency_contact', person.emergency_contact,
        'standard_vehicle', person.standard_vehicle,
        'departure_kind', person.departure_kind,
        'departure_depot_id', person.departure_depot_id,
        'alternate_departure_address', person.alternate_departure_address,
        'return_to_departure', person.return_to_departure,
        'driving_license', person.driving_license,
        'driving_license_categories', person.driving_license_categories,
        'carpool_allowed', person.carpool_allowed,
        'own_transport', person.own_transport,
        'travel_limitations', person.travel_limitations,
        'notification_preferences', person.notification_preferences,
        'availability_preferences', person.availability_preferences,
        'availability_self_service_enabled', person.availability_self_service_enabled,
        'onboarding_draft', person.onboarding_draft,
        'onboarding_step', person.onboarding_step,
        'onboarding_completed_at', person.onboarding_completed_at,
        'onboarding_version', person.onboarding_version,
        'version', person.version
      ))
      from public.personnel person
      where person.tenant_id = target_tenant and person.id = staff_personnel_id
    ), '[]'::jsonb),
    'staffDepots', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', depot.id,
          'tenant_id', depot.tenant_id,
          'name', depot.name
        )
        order by depot.name, depot.id
      )
      from public.travel_depots depot
      where staff_personnel_id is not null
        and depot.tenant_id = target_tenant
        and depot.active
    ), '[]'::jsonb),
    'workOrders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.id,
        'tenant_id', w.tenant_id,
        'customer_id', w.customer_id,
        'object_id', w.object_id,
        'work_order_number', w.work_order_number,
        'discipline', w.discipline,
        'title', w.title,
        'description', w.description,
        'status', w.status,
        'version', w.version,
        'report_version', w.report_version,
        'report_state', w.report_state,
        'signature_required', w.signature_required,
        'day_instructions', w.day_instructions,
        'projected_start_at', w.projected_start_at,
        'projected_end_at', w.projected_end_at,
        'actual_start_at', w.actual_start_at,
        'actual_end_at', w.actual_end_at,
        'published_at', w.published_at,
        'deadline', w.deadline,
        'requested_date', w.requested_date,
        'details', jsonb_strip_nulls(jsonb_build_object(
          'customerReference', w.details -> 'customerReference',
          'locationLabel', w.details -> 'locationLabel',
          'recurrence_window', w.details -> 'recurrence_window'
        ))
      ))
      from public.work_orders w
      where w.id = any(ids)
    ), '[]'::jsonb),
    'assignments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', assignment.id,
        'tenant_id', assignment.tenant_id,
        'work_order_id', assignment.work_order_id,
        'personnel_id', assignment.personnel_id,
        'status', assignment.status,
        'planned_start_at', assignment.planned_start_at,
        'planned_end_at', assignment.planned_end_at,
        'projected_start_at', assignment.projected_start_at,
        'projected_end_at', assignment.projected_end_at,
        'departed_at', assignment.departed_at,
        'paused_at', assignment.paused_at,
        'actual_start_at', assignment.actual_start_at,
        'actual_end_at', assignment.actual_end_at,
        'return_reason_code', assignment.return_reason_code,
        'return_note', assignment.return_note,
        'version', assignment.version,
        'created_at', assignment.created_at
      ))
      from public.work_order_assignments assignment
      where assignment.tenant_id = target_tenant
        and assignment.work_order_id = any(ids)
        and assignment.personnel_id = staff_personnel_id
    ), '[]'::jsonb),
    'workOrderTasks', coalesce((
      select jsonb_agg(private.staff_task_dto(task))
      from public.work_order_tasks task
      where task.tenant_id = target_tenant and task.work_order_id = any(ids)
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', task.id,
        'tenant_id', task.tenant_id,
        'code', task.code,
        'discipline', task.discipline,
        'name', task.name,
        'description', task.description,
        'active', task.active
      ))
      from public.task_catalog task
      where private.service_enabled(target_tenant, 'planning')
        and task.tenant_id = target_tenant
        and exists (
          select 1
          from public.task_revisions relevant_revision
          where relevant_revision.tenant_id = task.tenant_id
            and relevant_revision.task_id = task.id
            and (
              exists (
                select 1 from public.work_order_tasks work_task
                where work_task.tenant_id = target_tenant
                  and work_task.work_order_id = any(ids)
                  and work_task.task_revision_id = relevant_revision.id
              )
              or exists (
                select 1
                from public.extra_work_rules allowed_rule
                join public.work_order_allowed_extra_work allowed
                  on allowed.tenant_id = allowed_rule.tenant_id
                 and allowed.extra_work_rule_id = allowed_rule.id
                where allowed_rule.tenant_id = target_tenant
                  and allowed_rule.task_revision_id = relevant_revision.id
                  and allowed.work_order_id = any(ids)
              )
            )
        )
    ), '[]'::jsonb),
    'taskRevisions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', task_revision.id,
        'tenant_id', task_revision.tenant_id,
        'task_id', task_revision.task_id,
        'revision', task_revision.revision,
        'duration_minutes', task_revision.duration_minutes,
        'unit', task_revision.unit,
        'valid_from', task_revision.valid_from,
        'valid_until', task_revision.valid_until
      ))
      from public.task_revisions task_revision
      where private.service_enabled(target_tenant, 'planning')
        and task_revision.tenant_id = target_tenant
        and (
          exists (
            select 1 from public.work_order_tasks work_task
            where work_task.tenant_id = target_tenant
              and work_task.work_order_id = any(ids)
              and work_task.task_revision_id = task_revision.id
          )
          or exists (
            select 1
            from public.extra_work_rules allowed_rule
            join public.work_order_allowed_extra_work allowed
              on allowed.tenant_id = allowed_rule.tenant_id
             and allowed.extra_work_rule_id = allowed_rule.id
            where allowed_rule.tenant_id = target_tenant
              and allowed_rule.task_revision_id = task_revision.id
              and allowed.work_order_id = any(ids)
          )
        )
    ), '[]'::jsonb),
    'reports', coalesce((
      select jsonb_agg(
        to_jsonb(entry) - 'author_user_id'
        || jsonb_build_object('owned_by_current_user', true)
      )
      from public.report_entries entry
      where private.service_enabled(target_tenant, 'rapportage')
        and entry.tenant_id = target_tenant
        and entry.work_order_id = any(ids)
        and entry.author_user_id = auth.uid()
        and entry.deleted_at is null
    ), '[]'::jsonb),
    'attachments', coalesce((
      select jsonb_agg(
        to_jsonb(attachment) - array['storage_path','storage_bucket','uploaded_by']
        || jsonb_build_object('owned_by_current_user', true)
      )
      from public.attachments attachment
      where private.service_enabled(target_tenant, 'rapportage')
        and attachment.tenant_id = target_tenant
        and attachment.work_order_id = any(ids)
        and attachment.uploaded_by = auth.uid()
        and private.owns_report_path(attachment.tenant_id, attachment.work_order_id, attachment.storage_path)
        and attachment.deleted_at is null
        and (
          attachment.report_entry_id is null
          or exists (
            select 1
            from public.report_entries parent_entry
            where parent_entry.tenant_id = attachment.tenant_id
              and parent_entry.id = attachment.report_entry_id
              and parent_entry.work_order_id = attachment.work_order_id
              and parent_entry.author_user_id = auth.uid()
              and parent_entry.deleted_at is null
          )
        )
    ), '[]'::jsonb),
    'signatures', coalesce((
      select jsonb_agg(to_jsonb(signature) - array['storage_path','captured_by'])
      from public.signatures signature
      where private.service_enabled(target_tenant, 'rapportage')
        and signature.tenant_id = target_tenant
        and signature.work_order_id = any(ids)
        and signature.captured_by = auth.uid()
    ), '[]'::jsonb),
    'timeEntries', coalesce((
      select jsonb_agg(to_jsonb(entry) - 'approved_by' order by entry.starts_at desc, entry.id)
      from public.time_entries entry
      where entry.tenant_id = target_tenant and entry.personnel_id = staff_personnel_id
    ), '[]'::jsonb),
    'staffTimeCorrectionRequests', coalesce((
      select jsonb_agg(
        to_jsonb(correction) - array['created_by','reviewed_by']
        order by correction.created_at desc, correction.id
      )
      from public.staff_time_correction_requests correction
      where correction.tenant_id = target_tenant
        and correction.personnel_id = staff_personnel_id
    ), '[]'::jsonb),
    'availability', coalesce((
      select jsonb_agg(to_jsonb(slot) order by slot.starts_at, slot.id)
      from public.availability slot
      where slot.tenant_id = target_tenant and slot.personnel_id = staff_personnel_id
    ), '[]'::jsonb),
    'staffLeaveRequests', coalesce((
      select jsonb_agg(
        to_jsonb(request) - array['created_by','reviewed_by']
        order by request.starts_on desc, request.id
      )
      from public.staff_leave_requests request
      where request.tenant_id = target_tenant and request.personnel_id = staff_personnel_id
    ), '[]'::jsonb),
    'staffLeaveEntitlements', coalesce((
      select jsonb_agg(
        to_jsonb(entitlement) - 'updated_by'
        order by entitlement.calendar_year desc, entitlement.id
      )
      from public.staff_leave_entitlements entitlement
      where entitlement.tenant_id = target_tenant
        and entitlement.personnel_id = staff_personnel_id
    ), '[]'::jsonb),
    'staffDayReviews', coalesce((
      select jsonb_agg(to_jsonb(review) - 'created_by' order by review.day desc, review.id)
      from public.staff_day_reviews review
      where review.tenant_id = target_tenant and review.personnel_id = staff_personnel_id
    ), '[]'::jsonb),
    'staffStatusEvents', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', event.id,
          'tenant_id', event.tenant_id,
          'work_order_id', event.work_order_id,
          'assignment_id', event.assignment_id,
          'previous_status', event.previous_status,
          'new_status', event.new_status,
          'reason_code', event.reason_code,
          'note', event.note,
          'created_at', event.created_at
        )
        order by event.created_at, event.id
      )
      from public.status_events event
      where event.tenant_id = target_tenant
        and event.work_order_id = any(ids)
        and (
          event.assignment_id is null
          or exists (
            select 1
            from public.work_order_assignments own_assignment
            where own_assignment.tenant_id = event.tenant_id
              and own_assignment.id = event.assignment_id
              and own_assignment.personnel_id = staff_personnel_id
          )
        )
    ), '[]'::jsonb),
    'staffMaterials', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', material.id,
          'tenant_id', material.tenant_id,
          'work_order_id', material.work_order_id,
          'task_id', material.task_id,
          'description', material.description,
          'quantity', material.quantity,
          'unit', material.unit,
          'unit_price_cents', finance.unit_price_cents,
          'customer_visible', material.customer_visible,
          'created_at', material.created_at,
          'owned_by_current_user', material.created_by = auth.uid()
        )
        order by material.created_at, material.id
      )
      from public.work_order_material_usage material
      left join private.work_order_material_finance finance
        on finance.tenant_id = material.tenant_id and finance.usage_id = material.id
      where private.service_enabled(target_tenant, 'rapportage')
        and material.tenant_id = target_tenant
        and material.work_order_id = any(ids)
    ), '[]'::jsonb),
    'staffExpenses', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', expense.id,
          'tenant_id', expense.tenant_id,
          'work_order_id', expense.work_order_id,
          'description', expense.description,
          'amount_cents', expense.amount_cents,
          'customer_visible', expense.customer_visible,
          'created_at', expense.created_at,
          'updated_at', expense.updated_at,
          'version', expense.version,
          'owned_by_current_user', expense.created_by = auth.uid()
        ) order by expense.created_at, expense.id
      )
      from public.work_order_expenses expense
      where private.service_enabled(target_tenant, 'rapportage')
        and expense.tenant_id = target_tenant
        and expense.work_order_id = any(ids)
        and expense.personnel_id = staff_personnel_id
    ), '[]'::jsonb),
    'announcements', coalesce((
      select jsonb_agg(to_jsonb(announcement) - 'created_by')
      from public.announcements announcement
      where announcement.tenant_id = target_tenant
        and announcement.published_at <= clock_timestamp()
        and announcement.withdrawn_at is null
        and 'staff' = any(announcement.audience_roles)
    ), '[]'::jsonb),
    'announcementReads', coalesce((
      select jsonb_agg(to_jsonb(read) - 'user_id')
      from public.announcement_reads read
      where read.tenant_id = target_tenant
        and read.user_id = auth.uid()
        and private.announcement_read_allowed(read.tenant_id, read.announcement_id)
    ), '[]'::jsonb),
    'openShifts', coalesce((
      select jsonb_agg(to_jsonb(shift) - array['created_by','selected_personnel_id'])
      from public.open_shifts shift
      where staff_personnel_id is not null
        and private.service_enabled(target_tenant, 'planning')
        and shift.tenant_id = target_tenant
        and private.open_shift_eligible(target_tenant, shift.id, staff_personnel_id)
    ), '[]'::jsonb),
    'shiftInterests', coalesce((
      select jsonb_agg(to_jsonb(interest))
      from public.shift_interests interest
      where private.service_enabled(target_tenant, 'planning')
        and interest.tenant_id = target_tenant
        and interest.personnel_id = staff_personnel_id
    ), '[]'::jsonb),
    'personnelDocuments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', document.id,
        'tenant_id', document.tenant_id,
        'personnel_id', document.personnel_id,
        'title', document.title,
        'file_name', document.file_name,
        'version', document.version,
        'visible_to_employee', document.visible_to_employee
      ))
      from public.personnel_documents document
      where document.tenant_id = target_tenant
        and document.personnel_id = staff_personnel_id
        and document.visible_to_employee
        and not document.dossier_managed
    ), '[]'::jsonb),
    'extraWorkRules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', rule.id,
        'tenant_id', rule.tenant_id,
        'task_revision_id', rule.task_revision_id,
        'active', rule.active,
        'requires_photo', rule.requires_photo,
        'requires_review', rule.requires_review
      ))
      from public.extra_work_rules rule
      where private.service_enabled(target_tenant, 'planning')
        and private.service_enabled(target_tenant, 'rapportage')
        and rule.tenant_id = target_tenant
        and rule.active
        and exists (
          select 1
          from public.work_order_allowed_extra_work allowed
          where allowed.tenant_id = rule.tenant_id
            and allowed.extra_work_rule_id = rule.id
            and allowed.work_order_id = any(ids)
        )
    ), '[]'::jsonb),
    'allowedExtraWork', coalesce((
      select jsonb_agg(to_jsonb(extra))
      from public.work_order_allowed_extra_work extra
      where private.service_enabled(target_tenant, 'rapportage')
        and extra.tenant_id = target_tenant
        and extra.work_order_id = any(ids)
    ), '[]'::jsonb),
    'travelLegs', coalesce((
      select jsonb_agg(to_jsonb(leg) - array['origin_address','destination_address','manual_updated_by'])
      from public.travel_legs leg
      join public.work_order_assignments assignment
        on assignment.id = leg.assignment_id and assignment.tenant_id = leg.tenant_id
      where assignment.tenant_id = target_tenant
        and assignment.personnel_id = staff_personnel_id
        and assignment.work_order_id = any(ids)
    ), '[]'::jsonb)
  )
  into result;

  return result;
end;
$$;

revoke all on function public.staff_workspace(uuid) from public, anon, service_role;
grant execute on function public.staff_workspace(uuid) to authenticated, postgres;

-- Harden two legacy execution surfaces that remain callable independently of
-- the Next.js actions. UI module checks are never an authorization boundary.
create or replace function private.open_shift_eligible(t uuid, s uuid, p uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.object_session_active()
    and exists (
      select 1
      from public.tenants tenant
      where tenant.id = t and tenant.status = 'active'
    )
    and private.has_role(t, array['staff']::public.app_role[])
    and private.service_enabled(t, 'personeel')
    and private.service_enabled(t, 'planning')
    and exists (
      select 1
      from public.open_shifts shift
      join public.personnel person
        on person.tenant_id = shift.tenant_id
       and person.id = p
       and person.user_id = auth.uid()
       and person.status = 'active'
      join public.personnel_functions function_assignment
        on function_assignment.tenant_id = person.tenant_id
       and function_assignment.personnel_id = person.id
       and function_assignment.function_id = shift.function_id
      where shift.tenant_id = t
        and shift.id = s
        and shift.status = 'open'
        and not exists (
          select 1
          from unnest(shift.required_certificate_codes) required_code
          where not exists (
            select 1
            from public.qualifications qualification
            where qualification.tenant_id = t
              and qualification.personnel_id = p
              and qualification.code = required_code
              and (qualification.valid_until is null or qualification.valid_until >= current_date)
          )
        )
    );
$$;

create or replace function public.set_shift_interest(
  target_tenant uuid,
  target_shift uuid,
  interested boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  staff_personnel_id uuid;
  current_status text;
begin
  staff_personnel_id := private.require_staff_personnel(target_tenant);
  if not private.service_enabled(target_tenant, 'planning') then
    raise exception 'Open diensten zijn niet beschikbaar' using errcode = '42501';
  end if;

  perform 1
  from public.open_shifts shift
  where shift.tenant_id = target_tenant and shift.id = target_shift
  for update;
  if not found
    or not private.open_shift_eligible(target_tenant, target_shift, staff_personnel_id)
  then
    raise exception 'Deze open dienst is niet beschikbaar voor jouw functie en geldige kwalificaties'
      using errcode = '42501';
  end if;

  select response.status
  into current_status
  from public.shift_interests response
  where response.tenant_id = target_tenant
    and response.open_shift_id = target_shift
    and response.personnel_id = staff_personnel_id
  for update;
  if current_status in ('selected', 'rejected') then
    raise exception 'De planner heeft deze reactie al verwerkt' using errcode = '23514';
  end if;

  insert into public.shift_interests (
    tenant_id, open_shift_id, personnel_id, status
  ) values (
    target_tenant, target_shift, staff_personnel_id,
    case when interested then 'interested' else 'withdrawn' end
  )
  on conflict (tenant_id, open_shift_id, personnel_id) do update
  set status = excluded.status,
      updated_at = clock_timestamp();
end;
$$;

create or replace function public.record_task_execution(
  target_tenant uuid,
  target_task uuid,
  expected_version bigint,
  result text,
  actual_quantity numeric,
  reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  task public.work_order_tasks;
  work public.work_orders;
  own_quantity numeric;
  manager_actor boolean;
  staff_actor boolean;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('fieldgrid-planning:' || target_tenant::text, 0)
  );
  select * into task
  from public.work_order_tasks candidate
  where candidate.tenant_id = target_tenant and candidate.id = target_task
  for update;
  select * into work
  from public.work_orders candidate
  where candidate.tenant_id = target_tenant and candidate.id = task.work_order_id
  for update;

  manager_actor := task.id is not null and private.object_manage(target_tenant);
  staff_actor := task.id is not null and private.work_order_execution_actor(
    target_tenant,
    task.work_order_id,
    auth.uid(),
    nullif(auth.jwt() ->> 'session_id', '')::uuid
  );
  if task.id is null
    or not private.service_enabled(target_tenant, 'planning')
    or not private.service_enabled(target_tenant, 'rapportage')
    or not (manager_actor or staff_actor)
    or not private.task_execution_allowed(task)
  then
    raise exception 'Geen actuele uitvoeringstoegang' using errcode = '42501';
  end if;
  if task.execution_version <> expected_version then
    raise exception 'De uitvoering is gewijzigd. Vernieuw de werkbon.' using errcode = '40001';
  end if;

  own_quantity := task.quantity - task.transferred_quantity - task.withdrawn_quantity;
  if work.status not in ('in_progress', 'correction_required')
    or result not in ('in_progress', 'completed', 'partial', 'not_done', 'not_applicable')
    or actual_quantity is null
    or actual_quantity < 0
    or actual_quantity > own_quantity
    or (result = 'completed' and actual_quantity <> own_quantity)
    or (result in ('not_done', 'not_applicable') and actual_quantity <> 0)
    or (result = 'partial' and (actual_quantity <= 0 or actual_quantity >= own_quantity))
    or (result not in ('completed', 'in_progress') and length(btrim(coalesce(reason, ''))) < 5)
  then
    raise exception 'Controleer de eigen resterende hoeveelheid, uitvoeringsstatus en toelichting'
      using errcode = '23514';
  end if;

  update public.work_order_tasks updated
  set executed_quantity = actual_quantity,
      execution_state = result,
      completed_at = case when result = 'in_progress' then null else clock_timestamp() end,
      completion_note = reason
  where updated.id = task.id;
end;
$$;

-- This pre-versioning shortcut cannot provide an optimistic-lock contract.
-- All current callers use record_task_execution instead.
revoke all on function public.complete_work_order_task(uuid, boolean, text)
  from public, anon, authenticated, service_role;
grant execute on function public.complete_work_order_task(uuid, boolean, text)
  to postgres;

-- Publication changes are intentionally idempotent. Staff clients receive
-- only a tenant-scoped revision signal and then refetch the bounded RPC
-- projection. Publishing the raw source rows would expose fields that the
-- projection deliberately omits before a refetch can happen.
do $$
declare
  relation_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach relation_name in array array[
      'work_orders',
      'work_order_assignments',
      'time_entries',
      'work_order_tasks',
      'report_entries',
      'status_events',
      'availability',
      'staff_leave_requests',
      'staff_leave_entitlements',
      'staff_day_reviews',
      'staff_time_correction_requests',
      'work_order_material_usage',
      'work_order_expenses',
      'announcements',
      'announcement_reads',
      'dispatches',
      'travel_legs'
    ]
    loop
      if exists (
        select 1
        from pg_publication_tables published
        where published.pubname = 'supabase_realtime'
          and published.schemaname = 'public'
          and published.tablename = relation_name
      ) then
        execute format('alter publication supabase_realtime drop table public.%I', relation_name);
      end if;
    end loop;

    if not exists (
      select 1
      from pg_publication_tables published
      where published.pubname = 'supabase_realtime'
        and published.schemaname = 'public'
        and published.tablename = 'staff_workspace_revisions'
    ) then
      alter publication supabase_realtime add table public.staff_workspace_revisions;
    end if;
  end if;
end;
$$;

comment on table public.staff_leave_requests is
  'Employee leave requests with a contract-derived requested-hours snapshot and management-confirmed approved hours.';
comment on table public.staff_leave_entitlements is
  'Management-owned annual leave allowance and carryover; the staff projection derives available balance from approved vacation minutes.';
comment on table public.staff_day_reviews is
  'Per-person, per-local-day review state for closing and confirming recorded time.';
comment on table public.staff_time_correction_requests is
  'Persistent management queue with immutable source and desired-time snapshots; creating a request never rewrites or unlocks the source hours.';
comment on table public.work_order_expenses is
  'Staff-entered work-order expenses. Mutations are assignment-scoped and report-locked.';
comment on table public.staff_workspace_revisions is
  'Tenant-scoped coarse realtime invalidation only; staff and planning clients refetch through their bounded server projections.';

comment on function public.staff_save_onboarding(uuid,jsonb,boolean) is
  'Persists resumable onboarding and allowed canonical profile fields; never mutates account email.';
comment on function public.staff_update_profile(uuid,jsonb) is
  'Updates only the authenticated active personnel profile using optimistic concurrency.';
comment on function public.staff_update_availability(uuid,jsonb) is
  'Updates own availability preferences only while management-owned self-service permission is enabled.';
comment on function public.staff_leave_command(uuid,text,jsonb,uuid) is
  'Idempotent own leave command. Supported commands: create, withdraw.';
comment on function public.review_staff_leave_request(uuid,uuid,text,bigint,text) is
  'Compatibility wrapper for management/HR leave decisions using the contract-derived requested minutes.';
comment on function public.review_staff_leave_request(uuid,uuid,text,bigint,integer,text) is
  'Management/HR leave decision with explicit approved minutes; approval atomically creates a timezone-correct leave availability block.';
comment on function public.set_staff_leave_entitlement(uuid,uuid,integer,integer,integer,bigint) is
  'Versioned management/HR command for annual leave allowance and carryover.';
comment on function public.staff_day_command(uuid,text,jsonb,uuid) is
  'Idempotent own day review command. Supported commands: close, confirm, reopen.';
comment on function public.staff_request_time_correction(uuid,uuid,bigint,text,timestamptz,timestamptz,integer,text,uuid) is
  'Idempotent request that snapshots one own closed time entry and its desired correction without rewriting or unlocking the source.';
comment on function public.review_staff_time_correction(uuid,uuid,text,bigint,text) is
  'Versioned management/HR decision for a staff time-correction request; approval atomically applies the snapshot and requires a changed confirmed day to be confirmed again.';
comment on function public.personnel_dossier_staff_projection(uuid,uuid) is
  'Least-privilege dossier projection for account state, availability self-service permission and personnel version.';
comment on function public.staff_work_order_cost_command(uuid,text,jsonb,uuid) is
  'Idempotent assigned-staff cost command: material.create/delete and expense.create/delete.';
comment on function public.staff_report_entry_command(uuid,text,jsonb,uuid) is
  'Idempotent, versioned assigned-staff update/delete for own report entries and their child attachments.';
comment on function public.set_staff_availability_permission(uuid,uuid,boolean,bigint) is
  'Management/HR-owned switch controlling staff availability self-service.';

revoke all on function public.staff_save_onboarding(uuid,jsonb,boolean)
  from public, anon, service_role;
revoke all on function public.staff_update_profile(uuid,jsonb)
  from public, anon, service_role;
revoke all on function public.staff_update_availability(uuid,jsonb)
  from public, anon, service_role;
revoke all on function public.staff_leave_command(uuid,text,jsonb,uuid)
  from public, anon, service_role;
revoke all on function public.review_staff_leave_request(uuid,uuid,text,bigint,text)
  from public, anon, service_role;
revoke all on function public.review_staff_leave_request(uuid,uuid,text,bigint,integer,text)
  from public, anon, service_role;
revoke all on function public.set_staff_leave_entitlement(uuid,uuid,integer,integer,integer,bigint)
  from public, anon, service_role;
revoke all on function public.staff_day_command(uuid,text,jsonb,uuid)
  from public, anon, service_role;
revoke all on function public.staff_request_time_correction(uuid,uuid,bigint,text,timestamptz,timestamptz,integer,text,uuid)
  from public, anon, service_role;
revoke all on function public.review_staff_time_correction(uuid,uuid,text,bigint,text)
  from public, anon, service_role;
revoke all on function public.personnel_dossier_staff_projection(uuid,uuid)
  from public, anon, service_role;
revoke all on function public.staff_work_order_cost_command(uuid,text,jsonb,uuid)
  from public, anon, service_role;
revoke all on function public.staff_report_entry_command(uuid,text,jsonb,uuid)
  from public, anon, service_role;
revoke all on function public.set_staff_availability_permission(uuid,uuid,boolean,bigint)
  from public, anon, service_role;

grant execute on function public.staff_save_onboarding(uuid,jsonb,boolean) to authenticated, postgres;
grant execute on function public.staff_update_profile(uuid,jsonb) to authenticated, postgres;
grant execute on function public.staff_update_availability(uuid,jsonb) to authenticated, postgres;
grant execute on function public.staff_leave_command(uuid,text,jsonb,uuid) to authenticated, postgres;
grant execute on function public.review_staff_leave_request(uuid,uuid,text,bigint,text) to authenticated, postgres;
grant execute on function public.review_staff_leave_request(uuid,uuid,text,bigint,integer,text) to authenticated, postgres;
grant execute on function public.set_staff_leave_entitlement(uuid,uuid,integer,integer,integer,bigint) to authenticated, postgres;
grant execute on function public.staff_day_command(uuid,text,jsonb,uuid) to authenticated, postgres;
grant execute on function public.staff_request_time_correction(uuid,uuid,bigint,text,timestamptz,timestamptz,integer,text,uuid) to authenticated, postgres;
grant execute on function public.review_staff_time_correction(uuid,uuid,text,bigint,text) to authenticated, postgres;
grant execute on function public.personnel_dossier_staff_projection(uuid,uuid) to authenticated, postgres;
grant execute on function public.staff_work_order_cost_command(uuid,text,jsonb,uuid) to authenticated, postgres;
grant execute on function public.staff_report_entry_command(uuid,text,jsonb,uuid) to authenticated, postgres;
grant execute on function public.set_staff_availability_permission(uuid,uuid,boolean,bigint) to authenticated, postgres;

commit;
