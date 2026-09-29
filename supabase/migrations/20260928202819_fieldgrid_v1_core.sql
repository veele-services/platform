-- Fieldgrid V1 starts with an intentionally new schema. No legacy platform
-- tables or data are imported by this migration.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.app_role as enum (
  'tenant_admin',
  'management',
  'planner',
  'finance',
  'hr',
  'staff'
);

create type public.membership_status as enum ('invited', 'active', 'suspended', 'revoked');
create type public.work_order_status as enum (
  'planned',
  'released',
  'seen',
  'travelling',
  'in_progress',
  'completed',
  'returned',
  'under_review',
  'correction_required',
  'approved',
  'invoice_ready',
  'invoiced',
  'cancelled'
);
create type public.quote_status as enum ('draft', 'sent', 'awaiting_acceptance', 'accepted', 'rejected', 'expired');
create type public.invoice_status as enum ('draft', 'final', 'sent', 'partially_paid', 'paid', 'overdue', 'credited', 'void');
create type public.payment_status as enum ('open', 'pending', 'paid', 'failed', 'expired', 'canceled', 'refunded');
create type public.delivery_status as enum ('queued', 'processing', 'sent', 'failed', 'dead_letter');

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  status text not null default 'active' check (status in ('active', 'suspended', 'archived')),
  timezone text not null default 'Europe/Amsterdam',
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  version bigint not null default 1,
  constraint tenants_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint tenants_name_not_blank check (btrim(name) <> '')
);
create unique index tenants_slug_lower_uidx on public.tenants (lower(slug));

create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id) on delete set null
);

create table public.tenant_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  appointment_blocks jsonb not null default '[{"start":"08:00","end":"10:00"},{"start":"10:00","end":"12:00"},{"start":"12:00","end":"14:00"},{"start":"14:00","end":"16:00"}]'::jsonb,
  task_code_prefix text not null default 'FG',
  invoice_prefix text not null default 'FACT',
  payment_terms_days integer not null default 14 check (payment_terms_days between 0 and 365),
  signature_required_default boolean not null default false,
  bill_travel_default boolean not null default false,
  contract_reminder_days integer not null default 30 check (contract_reminder_days between 1 and 365),
  enabled_services text[] not null default '{}'::text[],
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default clock_timestamp()
);

create table public.tenant_branding (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  logo_path text,
  primary_color text not null default '#0B1D3A',
  accent_color text not null default '#00B7B3',
  surface_color text not null default '#F2F4F7',
  sender_name text,
  sender_email text,
  pdf_footer text,
  updated_at timestamptz not null default clock_timestamp(),
  constraint tenant_branding_primary_hex check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint tenant_branding_accent_hex check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint tenant_branding_surface_hex check (surface_color ~ '^#[0-9A-Fa-f]{6}$')
);

create table public.tenant_domains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  host text not null,
  verified_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id)
);
create unique index tenant_domains_host_lower_uidx on public.tenant_domains (lower(host));
create index tenant_domains_tenant_idx on public.tenant_domains (tenant_id);

create table public.tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  roles public.app_role[] not null,
  status public.membership_status not null default 'invited',
  invited_at timestamptz not null default clock_timestamp(),
  activated_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, user_id),
  unique (tenant_id, id),
  constraint tenant_memberships_roles_not_empty check (cardinality(roles) > 0)
);
create index tenant_memberships_user_active_idx on public.tenant_memberships (user_id, tenant_id) where status = 'active';

create table public.function_catalog (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  discipline text not null,
  required_certificate_codes text[] not null default '{}'::text[],
  active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, name),
  constraint function_catalog_name_not_blank check (btrim(name) <> '')
);

create table public.personnel (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  employee_number text not null,
  full_name text not null,
  email text,
  phone text,
  status text not null default 'active' check (status in ('invited', 'active', 'inactive', 'former')),
  start_date date,
  end_date date,
  home_address jsonb not null default '{}'::jsonb,
  emergency_contact jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  version bigint not null default 1,
  unique (tenant_id, id),
  unique (tenant_id, employee_number),
  unique (tenant_id, user_id),
  constraint personnel_name_not_blank check (btrim(full_name) <> ''),
  constraint personnel_dates_valid check (end_date is null or start_date is null or end_date >= start_date)
);
create index personnel_user_idx on public.personnel (user_id) where user_id is not null;

create table public.personnel_functions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  personnel_id uuid not null,
  function_id uuid not null,
  assigned_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, personnel_id, function_id),
  foreign key (tenant_id, personnel_id) references public.personnel(tenant_id, id) on delete cascade,
  foreign key (tenant_id, function_id) references public.function_catalog(tenant_id, id) on delete cascade
);

create table public.availability (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  personnel_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  kind text not null check (kind in ('available', 'unavailable', 'leave', 'sick')),
  note text,
  approved_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  foreign key (tenant_id, personnel_id) references public.personnel(tenant_id, id) on delete cascade,
  constraint availability_period_valid check (ends_at > starts_at)
);
create index availability_personnel_period_idx on public.availability (tenant_id, personnel_id, starts_at, ends_at);

create table public.qualifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  personnel_id uuid not null,
  code text not null,
  name text not null,
  issued_at date,
  valid_until date,
  verified_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, personnel_id, code),
  foreign key (tenant_id, personnel_id) references public.personnel(tenant_id, id) on delete cascade
);
create index qualifications_validity_idx on public.qualifications (tenant_id, personnel_id, valid_until);

create table public.personnel_contracts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  personnel_id uuid not null,
  starts_on date not null,
  ends_on date,
  review_on date,
  employment_type text not null,
  hours_per_week numeric(6,2),
  version integer not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  foreign key (tenant_id, personnel_id) references public.personnel(tenant_id, id) on delete cascade,
  constraint personnel_contract_dates_valid check (ends_on is null or ends_on >= starts_on)
);

create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  personnel_id uuid not null,
  code text not null,
  name text not null,
  issued_on date,
  expires_on date,
  storage_path text,
  version integer not null default 1,
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  foreign key (tenant_id, personnel_id) references public.personnel(tenant_id, id) on delete cascade
);

create table public.personnel_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  personnel_id uuid not null,
  title text not null,
  document_type text not null,
  storage_path text not null,
  version integer not null default 1,
  visible_to_employee boolean not null default false,
  replaced_by uuid,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  foreign key (tenant_id, personnel_id) references public.personnel(tenant_id, id) on delete cascade,
  foreign key (tenant_id, replaced_by) references public.personnel_documents(tenant_id, id) on delete restrict
);

create table public.personnel_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  personnel_id uuid not null,
  body text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  foreign key (tenant_id, personnel_id) references public.personnel(tenant_id, id) on delete cascade,
  constraint personnel_notes_body_not_blank check (btrim(body) <> '')
);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  personnel_id uuid,
  kind text not null,
  source_id uuid,
  title text not null,
  due_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'completed', 'dismissed')),
  assigned_user_id uuid references auth.users(id) on delete set null,
  deduplication_key text not null,
  completed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, deduplication_key),
  foreign key (tenant_id, personnel_id) references public.personnel(tenant_id, id) on delete cascade
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_number text not null,
  name text not null,
  billing_email text,
  phone text,
  billing_address jsonb not null default '{}'::jsonb,
  payment_terms_days integer check (payment_terms_days between 0 and 365),
  status text not null default 'active' check (status in ('lead', 'active', 'inactive')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  version bigint not null default 1,
  unique (tenant_id, id),
  unique (tenant_id, customer_number),
  constraint customers_name_not_blank check (btrim(name) <> '')
);

create table public.customer_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  customer_id uuid not null,
  full_name text not null,
  email text,
  phone text,
  role text,
  is_primary boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  foreign key (tenant_id, customer_id) references public.customers(tenant_id, id) on delete cascade
);
create index customer_contacts_customer_idx on public.customer_contacts (tenant_id, customer_id);

create table public.objects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  customer_id uuid not null,
  object_number text not null,
  name text not null,
  address jsonb not null,
  latitude numeric(9,6),
  longitude numeric(9,6),
  access_instructions text,
  active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, object_number),
  foreign key (tenant_id, customer_id) references public.customers(tenant_id, id) on delete restrict
);
create index objects_customer_idx on public.objects (tenant_id, customer_id);

create table public.appointment_slots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity integer not null default 1 check (capacity > 0),
  booked_count integer not null default 0 check (booked_count >= 0),
  status text not null default 'available' check (status in ('available', 'closed', 'full')),
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  constraint appointment_slots_period_valid check (ends_at > starts_at),
  constraint appointment_slots_capacity_valid check (booked_count <= capacity)
);
create index appointment_slots_tenant_period_idx on public.appointment_slots (tenant_id, starts_at, ends_at);

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  request_number text not null,
  customer_id uuid,
  object_id uuid,
  contact_id uuid,
  source text not null default 'backoffice' check (source in ('backoffice', 'email_link', 'phone', 'email')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  discipline text not null,
  description text not null,
  status text not null default 'new' check (status in ('new', 'quote_draft', 'awaiting_acceptance', 'accepted', 'rejected', 'planned', 'closed')),
  preferred_slot_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  version bigint not null default 1,
  unique (tenant_id, id),
  unique (tenant_id, request_number),
  foreign key (tenant_id, customer_id) references public.customers(tenant_id, id) on delete restrict,
  foreign key (tenant_id, object_id) references public.objects(tenant_id, id) on delete restrict,
  foreign key (tenant_id, contact_id) references public.customer_contacts(tenant_id, id) on delete restrict,
  foreign key (tenant_id, preferred_slot_id) references public.appointment_slots(tenant_id, id) on delete restrict
);
create index requests_tenant_status_created_idx on public.requests (tenant_id, status, created_at desc);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  request_id uuid not null,
  customer_id uuid not null,
  object_id uuid,
  quote_number text not null,
  revision integer not null default 1 check (revision > 0),
  status public.quote_status not null default 'draft',
  subtotal_cents bigint not null check (subtotal_cents >= 0),
  vat_cents bigint not null check (vat_cents >= 0),
  total_cents bigint not null check (total_cents >= 0),
  currency text not null default 'EUR' check (currency = 'EUR'),
  snapshot jsonb not null,
  sent_at timestamptz,
  accepted_at timestamptz,
  accepted_by_name text,
  acceptance_channel text,
  acceptance_evidence text,
  expires_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, quote_number, revision),
  foreign key (tenant_id, request_id) references public.requests(tenant_id, id) on delete restrict,
  foreign key (tenant_id, customer_id) references public.customers(tenant_id, id) on delete restrict,
  foreign key (tenant_id, object_id) references public.objects(tenant_id, id) on delete restrict,
  constraint quotes_total_valid check (subtotal_cents + vat_cents = total_cents)
);
create index quotes_tenant_status_idx on public.quotes (tenant_id, status, created_at desc);

create table public.task_catalog (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  discipline text not null,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, code),
  constraint task_catalog_code_format check (code ~ '^[A-Z0-9][A-Z0-9-]{1,31}$')
);

create table public.task_revisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  task_id uuid not null,
  revision integer not null check (revision > 0),
  duration_minutes integer not null check (duration_minutes > 0),
  price_cents bigint not null check (price_cents >= 0),
  vat_basis_points integer not null default 2100 check (vat_basis_points between 0 and 10000),
  unit text not null default 'task' check (unit in ('task', 'hour', 'item', 'kilometre')),
  valid_from timestamptz not null default clock_timestamp(),
  valid_until timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, task_id, revision),
  foreign key (tenant_id, task_id) references public.task_catalog(tenant_id, id) on delete restrict,
  constraint task_revisions_validity check (valid_until is null or valid_until > valid_from)
);
create index task_revisions_current_idx on public.task_revisions (tenant_id, task_id, valid_from desc);

create table public.extra_work_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  task_revision_id uuid not null,
  active boolean not null default true,
  requires_photo boolean not null default false,
  requires_review boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, task_revision_id),
  foreign key (tenant_id, task_revision_id) references public.task_revisions(tenant_id, id) on delete restrict
);

create table public.work_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  work_order_number text not null,
  request_id uuid,
  quote_id uuid,
  customer_id uuid not null,
  object_id uuid not null,
  appointment_slot_id uuid,
  discipline text not null,
  status public.work_order_status not null default 'planned',
  planned_start_at timestamptz not null,
  planned_end_at timestamptz not null,
  projected_start_at timestamptz not null,
  projected_end_at timestamptz not null,
  actual_start_at timestamptz,
  actual_end_at timestamptz,
  signature_required boolean not null default false,
  bill_travel boolean not null default false,
  report_version integer not null default 1,
  attention_reason text,
  version bigint not null default 1,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, work_order_number),
  foreign key (tenant_id, request_id) references public.requests(tenant_id, id) on delete restrict,
  foreign key (tenant_id, quote_id) references public.quotes(tenant_id, id) on delete restrict,
  foreign key (tenant_id, customer_id) references public.customers(tenant_id, id) on delete restrict,
  foreign key (tenant_id, object_id) references public.objects(tenant_id, id) on delete restrict,
  foreign key (tenant_id, appointment_slot_id) references public.appointment_slots(tenant_id, id) on delete restrict,
  constraint work_orders_planned_period_valid check (planned_end_at > planned_start_at),
  constraint work_orders_projected_period_valid check (projected_end_at > projected_start_at),
  constraint work_orders_actual_period_valid check (actual_end_at is null or actual_start_at is null or actual_end_at >= actual_start_at)
);
create index work_orders_tenant_status_time_idx on public.work_orders (tenant_id, status, projected_start_at);
create index work_orders_customer_idx on public.work_orders (tenant_id, customer_id, created_at desc);
create index work_orders_object_idx on public.work_orders (tenant_id, object_id, created_at desc);

create table public.work_order_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  work_order_id uuid not null,
  task_revision_id uuid,
  task_code text not null,
  task_name text not null,
  duration_minutes integer not null check (duration_minutes > 0),
  quantity numeric(12,3) not null default 1 check (quantity > 0),
  unit text not null,
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  vat_basis_points integer not null check (vat_basis_points between 0 and 10000),
  is_extra_work boolean not null default false,
  extra_work_status text check (extra_work_status in ('awaiting_review', 'approved', 'rejected')),
  allowed_for_staff boolean not null default false,
  completed_at timestamptz,
  completion_note text,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  foreign key (tenant_id, work_order_id) references public.work_orders(tenant_id, id) on delete cascade,
  foreign key (tenant_id, task_revision_id) references public.task_revisions(tenant_id, id) on delete restrict,
  constraint work_order_tasks_extra_status check ((not is_extra_work and extra_work_status is null) or is_extra_work)
);
create index work_order_tasks_order_idx on public.work_order_tasks (tenant_id, work_order_id, created_at);

create table public.work_order_allowed_extra_work (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  work_order_id uuid not null,
  extra_work_rule_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, work_order_id, extra_work_rule_id),
  foreign key (tenant_id, work_order_id) references public.work_orders(tenant_id, id) on delete cascade,
  foreign key (tenant_id, extra_work_rule_id) references public.extra_work_rules(tenant_id, id) on delete restrict
);

create table public.work_order_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  work_order_id uuid not null,
  personnel_id uuid not null,
  status text not null default 'planned' check (status in ('planned', 'released', 'seen', 'travelling', 'in_progress', 'completed', 'returned', 'cancelled')),
  planned_start_at timestamptz not null,
  planned_end_at timestamptz not null,
  projected_start_at timestamptz not null,
  projected_end_at timestamptz not null,
  departed_at timestamptz,
  actual_start_at timestamptz,
  actual_end_at timestamptz,
  return_reason_code text,
  return_note text,
  version bigint not null default 1,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, work_order_id, personnel_id),
  foreign key (tenant_id, work_order_id) references public.work_orders(tenant_id, id) on delete cascade,
  foreign key (tenant_id, personnel_id) references public.personnel(tenant_id, id) on delete restrict,
  constraint work_order_assignments_planned_valid check (planned_end_at > planned_start_at),
  constraint work_order_assignments_projected_valid check (projected_end_at > projected_start_at)
);
create index work_order_assignments_personnel_time_idx on public.work_order_assignments (tenant_id, personnel_id, projected_start_at);
create index work_order_assignments_order_idx on public.work_order_assignments (tenant_id, work_order_id);

create table public.dispatches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  work_order_id uuid not null,
  assignment_id uuid not null,
  dispatched_by uuid not null references auth.users(id),
  dispatched_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz,
  idempotency_key text not null,
  unique (tenant_id, id),
  unique (tenant_id, idempotency_key),
  foreign key (tenant_id, work_order_id) references public.work_orders(tenant_id, id) on delete cascade,
  foreign key (tenant_id, assignment_id) references public.work_order_assignments(tenant_id, id) on delete cascade
);

create table public.status_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  work_order_id uuid not null,
  assignment_id uuid,
  actor_user_id uuid references auth.users(id) on delete set null,
  previous_status public.work_order_status,
  new_status public.work_order_status not null,
  reason_code text,
  note text,
  idempotency_key text not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, idempotency_key),
  foreign key (tenant_id, work_order_id) references public.work_orders(tenant_id, id) on delete cascade,
  foreign key (tenant_id, assignment_id) references public.work_order_assignments(tenant_id, id) on delete cascade
);
create index status_events_order_created_idx on public.status_events (tenant_id, work_order_id, created_at desc);

create table public.travel_legs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  assignment_id uuid not null,
  direction text not null check (direction in ('before', 'after')),
  origin_address jsonb not null,
  destination_address jsonb not null,
  travel_mode text not null check (travel_mode in ('walking', 'bicycling', 'driving', 'transit')),
  estimated_minutes integer check (estimated_minutes > 0),
  estimated_distance_metres integer check (estimated_distance_metres >= 0),
  provider text,
  provider_reference text,
  calculated_at timestamptz,
  error_code text,
  actual_started_at timestamptz,
  actual_ended_at timestamptz,
  billable boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, assignment_id, direction),
  foreign key (tenant_id, assignment_id) references public.work_order_assignments(tenant_id, id) on delete cascade
);

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  personnel_id uuid not null,
  assignment_id uuid,
  kind text not null check (kind in ('work', 'travel', 'break', 'correction')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'correction_requested', 'approved', 'rejected')),
  correction_reason text,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  foreign key (tenant_id, personnel_id) references public.personnel(tenant_id, id) on delete restrict,
  foreign key (tenant_id, assignment_id) references public.work_order_assignments(tenant_id, id) on delete cascade,
  constraint time_entries_period_valid check (ends_at is null or ends_at >= starts_at)
);
create index time_entries_personnel_time_idx on public.time_entries (tenant_id, personnel_id, starts_at desc);

create table public.open_shifts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  work_order_id uuid not null,
  function_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  required_certificate_codes text[] not null default '{}'::text[],
  status text not null default 'open' check (status in ('open', 'assigned', 'closed', 'cancelled')),
  selected_personnel_id uuid,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  foreign key (tenant_id, work_order_id) references public.work_orders(tenant_id, id) on delete cascade,
  foreign key (tenant_id, function_id) references public.function_catalog(tenant_id, id) on delete restrict,
  foreign key (tenant_id, selected_personnel_id) references public.personnel(tenant_id, id) on delete restrict,
  constraint open_shifts_period_valid check (ends_at > starts_at)
);

create table public.shift_interests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  open_shift_id uuid not null,
  personnel_id uuid not null,
  status text not null default 'interested' check (status in ('interested', 'withdrawn', 'selected', 'rejected')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, open_shift_id, personnel_id),
  foreign key (tenant_id, open_shift_id) references public.open_shifts(tenant_id, id) on delete cascade,
  foreign key (tenant_id, personnel_id) references public.personnel(tenant_id, id) on delete cascade
);

create table public.report_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  work_order_id uuid not null,
  author_user_id uuid not null references auth.users(id),
  body text not null,
  is_incident boolean not null default false,
  incident_severity text check (incident_severity in ('low', 'medium', 'high', 'critical')),
  incident_status text check (incident_status in ('open', 'investigating', 'resolved', 'dismissed')),
  customer_visible boolean not null default false,
  version integer not null default 1,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  unique (tenant_id, id),
  foreign key (tenant_id, work_order_id) references public.work_orders(tenant_id, id) on delete cascade,
  constraint report_entries_body_not_blank check (btrim(body) <> ''),
  constraint report_entries_incident_valid check ((not is_incident and incident_severity is null and incident_status is null) or is_incident)
);
create index report_entries_order_created_idx on public.report_entries (tenant_id, work_order_id, created_at desc) where deleted_at is null;

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  work_order_id uuid not null,
  report_entry_id uuid,
  uploaded_by uuid not null references auth.users(id),
  storage_bucket text not null,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  sha256 text not null,
  customer_visible boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  unique (tenant_id, id),
  unique (storage_bucket, storage_path),
  foreign key (tenant_id, work_order_id) references public.work_orders(tenant_id, id) on delete cascade,
  foreign key (tenant_id, report_entry_id) references public.report_entries(tenant_id, id) on delete cascade,
  constraint attachments_sha256_format check (sha256 ~ '^[0-9a-f]{64}$')
);
create index attachments_report_idx on public.attachments (tenant_id, report_entry_id) where deleted_at is null;

create table public.signatures (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  work_order_id uuid not null,
  captured_by uuid not null references auth.users(id),
  signer_name text not null,
  storage_path text not null,
  sha256 text not null,
  report_version integer not null,
  signed_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz,
  unique (tenant_id, id),
  unique (tenant_id, work_order_id, report_version),
  foreign key (tenant_id, work_order_id) references public.work_orders(tenant_id, id) on delete restrict,
  constraint signatures_signer_not_blank check (btrim(signer_name) <> ''),
  constraint signatures_sha256_format check (sha256 ~ '^[0-9a-f]{64}$')
);

create table public.review_decisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  work_order_id uuid not null,
  report_version integer not null,
  decision text not null check (decision in ('approved', 'returned')),
  reason text,
  decided_by uuid not null references auth.users(id),
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, work_order_id, report_version),
  foreign key (tenant_id, work_order_id) references public.work_orders(tenant_id, id) on delete restrict,
  constraint review_decisions_return_reason check (decision <> 'returned' or btrim(coalesce(reason, '')) <> '')
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null,
  body text not null,
  audience_roles public.app_role[] not null default array['staff']::public.app_role[],
  publish_at timestamptz,
  published_at timestamptz,
  withdrawn_at timestamptz,
  send_push boolean not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  constraint announcements_title_not_blank check (btrim(title) <> ''),
  constraint announcements_body_not_blank check (btrim(body) <> '')
);
create index announcements_published_idx on public.announcements (tenant_id, published_at desc) where withdrawn_at is null;

create table public.announcement_reads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  announcement_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, announcement_id, user_id),
  foreign key (tenant_id, announcement_id) references public.announcements(tenant_id, id) on delete cascade
);

create table public.invoice_sequences (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  year integer not null,
  last_number bigint not null default 0 check (last_number >= 0),
  updated_at timestamptz not null default clock_timestamp()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  customer_id uuid not null,
  invoice_number text,
  status public.invoice_status not null default 'draft',
  issued_on date,
  due_on date,
  currency text not null default 'EUR' check (currency = 'EUR'),
  subtotal_cents bigint not null default 0 check (subtotal_cents >= 0),
  vat_cents bigint not null default 0 check (vat_cents >= 0),
  total_cents bigint not null default 0 check (total_cents >= 0),
  paid_cents bigint not null default 0 check (paid_cents >= 0),
  customer_snapshot jsonb,
  branding_snapshot jsonb,
  lines_snapshot jsonb,
  pdf_storage_path text,
  pdf_sha256 text,
  finalized_at timestamptz,
  sent_at timestamptz,
  version bigint not null default 1,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, invoice_number),
  foreign key (tenant_id, customer_id) references public.customers(tenant_id, id) on delete restrict,
  constraint invoices_total_valid check (subtotal_cents + vat_cents = total_cents),
  constraint invoices_paid_valid check (paid_cents <= total_cents),
  constraint invoices_final_snapshot check (
    status = 'draft' or (
      invoice_number is not null and issued_on is not null and due_on is not null and
      customer_snapshot is not null and branding_snapshot is not null and lines_snapshot is not null and
      finalized_at is not null
    )
  )
);
create index invoices_tenant_status_due_idx on public.invoices (tenant_id, status, due_on);
create index invoices_customer_idx on public.invoices (tenant_id, customer_id, created_at desc);

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  invoice_id uuid not null,
  work_order_id uuid,
  description text not null,
  quantity numeric(12,3) not null check (quantity > 0),
  unit text not null,
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  subtotal_cents bigint not null check (subtotal_cents >= 0),
  vat_basis_points integer not null check (vat_basis_points between 0 and 10000),
  vat_cents bigint not null check (vat_cents >= 0),
  total_cents bigint not null check (total_cents >= 0),
  source_snapshot jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  foreign key (tenant_id, invoice_id) references public.invoices(tenant_id, id) on delete cascade,
  foreign key (tenant_id, work_order_id) references public.work_orders(tenant_id, id) on delete restrict,
  constraint invoice_lines_total_valid check (subtotal_cents + vat_cents = total_cents)
);
create index invoice_lines_invoice_idx on public.invoice_lines (tenant_id, invoice_id);

create table public.invoice_groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null,
  purpose text not null check (purpose in ('consolidated_invoice', 'payment_bundle')),
  status text not null default 'open' check (status in ('open', 'completed', 'expired', 'cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  foreign key (tenant_id, customer_id) references public.customers(tenant_id, id) on delete restrict
);

create table public.invoice_group_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  invoice_group_id uuid not null,
  invoice_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, invoice_group_id, invoice_id),
  foreign key (tenant_id, invoice_group_id) references public.invoice_groups(tenant_id, id) on delete cascade,
  foreign key (tenant_id, invoice_id) references public.invoices(tenant_id, id) on delete restrict
);

create table public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  invoice_group_id uuid,
  provider text not null check (provider in ('mollie', 'manual')),
  provider_payment_id text,
  provider_mode text not null check (provider_mode in ('test', 'live', 'manual')),
  status public.payment_status not null default 'open',
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'EUR' check (currency = 'EUR'),
  checkout_url text,
  idempotency_key text not null,
  provider_payload jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  last_checked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, idempotency_key),
  unique (provider, provider_payment_id),
  foreign key (tenant_id, invoice_group_id) references public.invoice_groups(tenant_id, id) on delete restrict
);
create index payment_attempts_reconcile_idx on public.payment_attempts (provider, status, last_checked_at) where status in ('open', 'pending');

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  payment_attempt_id uuid not null,
  invoice_id uuid not null,
  amount_cents bigint not null check (amount_cents > 0),
  allocated_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, payment_attempt_id, invoice_id),
  foreign key (tenant_id, payment_attempt_id) references public.payment_attempts(tenant_id, id) on delete restrict,
  foreign key (tenant_id, invoice_id) references public.invoices(tenant_id, id) on delete restrict
);
create index payment_allocations_invoice_idx on public.payment_allocations (tenant_id, invoice_id);

create table public.tenant_provider_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null check (provider in ('mollie', 'sendgrid', 'google_routes', 'web_push')),
  mode text not null check (mode in ('test', 'live', 'disabled')),
  secret_reference text,
  public_config jsonb not null default '{}'::jsonb,
  verified_at timestamptz,
  active boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, provider)
);

create table public.external_action_tokens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  purpose text not null check (purpose in ('booking', 'quote_acceptance', 'payment', 'report_view')),
  subject_id uuid not null,
  token_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (token_hash),
  constraint external_action_tokens_hash_format check (token_hash ~ '^[0-9a-f]{64}$')
);
create index external_action_tokens_active_idx on public.external_action_tokens (token_hash, expires_at) where consumed_at is null;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_secret text not null,
  user_agent text,
  revoked_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, user_id, endpoint)
);

create table public.outbox_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  payload jsonb not null,
  status public.delivery_status not null default 'queued',
  available_at timestamptz not null default clock_timestamp(),
  locked_until timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  idempotency_key text not null,
  last_error text,
  processed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, idempotency_key)
);
create index outbox_events_worker_idx on public.outbox_events (status, available_at, created_at) where status in ('queued', 'failed');

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  outbox_event_id uuid,
  channel text not null check (channel in ('in_app', 'push', 'email')),
  title text not null,
  body text not null,
  target_path text,
  status public.delivery_status not null default 'queued',
  read_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  foreign key (tenant_id, outbox_event_id) references public.outbox_events(tenant_id, id) on delete set null
);
create index notifications_user_created_idx on public.notifications (tenant_id, user_id, created_at desc);

create table public.mail_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  outbox_event_id uuid,
  recipient text not null,
  template text not null,
  provider_message_id text,
  status public.delivery_status not null default 'queued',
  attempts integer not null default 0,
  idempotency_key text not null,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, idempotency_key),
  foreign key (tenant_id, outbox_event_id) references public.outbox_events(tenant_id, id) on delete set null
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  request_id text,
  ip_hash text,
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id)
);
create index audit_events_entity_idx on public.audit_events (tenant_id, entity_type, entity_id, created_at desc);

-- Shared timestamp/version trigger. It never accepts a client supplied version.
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  if to_jsonb(new) ? 'version' then
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'tenants', 'tenant_memberships', 'function_catalog', 'personnel', 'personnel_notes',
    'customers', 'objects', 'requests', 'quotes', 'task_catalog', 'work_orders',
    'work_order_assignments', 'time_entries', 'shift_interests', 'report_entries',
    'announcements', 'invoices', 'payment_attempts', 'tenant_provider_connections',
    'push_subscriptions'
  ]
  loop
    execute format(
      'create trigger %I_touch before update on public.%I for each row execute function private.touch_updated_at()',
      table_name,
      table_name
    );
  end loop;
end;
$$;

-- A final invoice is an immutable commercial snapshot. Payment fields are the
-- sole exception and are only changed by the allocation functions.
create or replace function private.protect_final_invoice()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'draft' and (
    new.tenant_id is distinct from old.tenant_id or
    new.customer_id is distinct from old.customer_id or
    new.invoice_number is distinct from old.invoice_number or
    new.issued_on is distinct from old.issued_on or
    new.due_on is distinct from old.due_on or
    new.currency is distinct from old.currency or
    new.subtotal_cents is distinct from old.subtotal_cents or
    new.vat_cents is distinct from old.vat_cents or
    new.total_cents is distinct from old.total_cents or
    new.customer_snapshot is distinct from old.customer_snapshot or
    new.branding_snapshot is distinct from old.branding_snapshot or
    new.lines_snapshot is distinct from old.lines_snapshot or
    new.finalized_at is distinct from old.finalized_at
  ) then
    raise exception 'A finalized invoice snapshot cannot be changed' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger invoices_protect_final
before update on public.invoices
for each row execute function private.protect_final_invoice();

-- No table is made public by implicit default privileges. Explicit grants are
-- added alongside RLS in the next migration.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
