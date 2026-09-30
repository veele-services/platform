-- Schema captured from the locally tested database with `supabase db pull`.
-- Historical data backfills and the private signature MIME restriction below
-- are intentional DML additions; schema diffing cannot capture those values.
SET local check_function_bodies = off;

DROP POLICY "report_entries_insert" ON "public"."report_entries";

DROP POLICY "report_entries_update" ON "public"."report_entries";

ALTER TABLE "public"."signatures"
  DROP CONSTRAINT "signatures_tenant_id_work_order_id_report_version_key";

ALTER TABLE "public"."work_order_tasks"
  DROP CONSTRAINT "work_order_tasks_execution_state_check";

CREATE TABLE "private"."work_order_commands" (
  "id"           uuid                     NOT NULL,
  "tenant_id"    uuid                     NOT NULL,
  "actor_id"     uuid                     NOT NULL,
  "command"      text                     NOT NULL,
  "payload_hash" text                     NOT NULL,
  "result"       jsonb                    NOT NULL,
  "created_at"   timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "work_order_commands_pkey" PRIMARY KEY (id)
);

CREATE TABLE "private"."work_order_material_finance" (
  "tenant_id"        uuid   NOT NULL,
  "usage_id"         uuid   NOT NULL,
  "cost_cents"       bigint,
  "unit_price_cents" bigint,
  CONSTRAINT "work_order_material_finance_cost_cents_check" CHECK ((cost_cents >= 0)),
  CONSTRAINT "work_order_material_finance_pkey" PRIMARY KEY (tenant_id, usage_id),
  CONSTRAINT "work_order_material_finance_unit_price_cents_check" CHECK ((unit_price_cents >= 0))
);

ALTER TABLE "private"."work_order_material_finance"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "private"."work_order_material_finance"
  FORCE ROW LEVEL SECURITY;

CREATE TABLE "private"."work_order_policy_changes" (
  "id"                uuid                     NOT NULL,
  "tenant_id"         uuid                     NOT NULL,
  "work_order_id"     uuid                     NOT NULL,
  "actor_id"          uuid                     NOT NULL,
  "transaction_id"    xid8                     NOT NULL,
  "old_policy"        jsonb,
  "new_policy"        jsonb                    NOT NULL,
  "mode"              text                     NOT NULL,
  "employee_required" boolean                  NOT NULL,
  "reason"            text                     NOT NULL,
  "created_at"        timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "work_order_policy_changes_pkey" PRIMARY KEY (id)
);

ALTER TABLE "private"."work_order_policy_changes"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "private"."work_order_related_receipts" (
  "tenant_id"  uuid                     NOT NULL,
  "id"         uuid                     NOT NULL,
  "actor_id"   uuid                     NOT NULL,
  "command"    text                     NOT NULL,
  "payload"    jsonb                    NOT NULL,
  "result"     jsonb                    NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "work_order_related_receipts_pkey" PRIMARY KEY (tenant_id, id)
);

ALTER TABLE "private"."work_order_related_receipts"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "private"."work_order_related_receipts"
  FORCE ROW LEVEL SECURITY;

CREATE TABLE "private"."work_order_signature_intents" (
  "id"              uuid                     NOT NULL,
  "tenant_id"       uuid                     NOT NULL,
  "work_order_id"   uuid                     NOT NULL,
  "report_id"       uuid                     NOT NULL,
  "actor_id"        uuid                     NOT NULL,
  "session_id"      uuid                     NOT NULL,
  "content_hash"    text                     NOT NULL,
  "signer_name"     text                     NOT NULL,
  "signer_capacity" text                     NOT NULL,
  "signature_kind"  text                     NOT NULL,
  "storage_path"    text                     NOT NULL,
  "created_at"      timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  "consumed_at"     timestamp with time zone,
  CONSTRAINT "work_order_signature_intents_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_order_signature_intents_storage_path_key" UNIQUE (storage_path)
);

CREATE TABLE "public"."work_order_checklist_answers" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"      uuid                     NOT NULL,
  "checklist_id"   uuid                     NOT NULL,
  "question_id"    text                     NOT NULL,
  "value"          jsonb,
  "not_applicable" boolean                  NOT NULL DEFAULT false,
  "reason"         text                     NOT NULL DEFAULT ''::text,
  "attachment_id"  uuid,
  "version"        bigint                   NOT NULL DEFAULT 1,
  "updated_by"     uuid                     NOT NULL,
  "updated_at"     timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "work_order_checklist_answers_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_order_checklist_answers_tenant_id_checklist_id_questio_key" UNIQUE (tenant_id, checklist_id, question_id)
);

ALTER TABLE "public"."work_order_checklist_answers"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."work_order_checklist_answers"
  FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."work_order_checklist_answers" FROM "anon", "authenticated";

CREATE TABLE "public"."work_order_checklists" (
  "id"                   uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"            uuid                     NOT NULL,
  "work_order_id"        uuid                     NOT NULL,
  "template_revision_id" uuid                     NOT NULL,
  "name"                 text                     NOT NULL,
  "definition"           jsonb                    NOT NULL,
  "created_at"           timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "work_order_checklists_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_order_checklists_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "work_order_checklists_tenant_id_work_order_id_template_revi_key" UNIQUE (tenant_id, work_order_id, template_revision_id)
);

ALTER TABLE "public"."work_order_checklists"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."work_order_checklists"
  FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."work_order_checklists" FROM "anon", "authenticated";

CREATE TABLE "public"."work_order_contacts" (
  "id"            uuid   NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"     uuid   NOT NULL,
  "work_order_id" uuid   NOT NULL,
  "contact_id"    uuid   NOT NULL,
  "roles"         text[] NOT NULL,
  "snapshot"      jsonb  NOT NULL,
  CONSTRAINT "work_order_contacts_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_order_contacts_roles_check"
    CHECK (((cardinality(roles) > 0) AND (roles <@ ARRAY['site'::text, 'requester'::text, 'extra_approver'::text, 'handover'::text, 'billing'::text]))),
  CONSTRAINT "work_order_contacts_tenant_id_work_order_id_contact_id_key" UNIQUE (tenant_id, work_order_id, contact_id)
);

ALTER TABLE "public"."work_order_contacts"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."work_order_contacts"
  FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."work_order_contacts" FROM "anon", "authenticated";

CREATE TABLE "public"."work_order_exceptions" (
  "id"            uuid                     NOT NULL,
  "tenant_id"     uuid                     NOT NULL,
  "work_order_id" uuid                     NOT NULL,
  "kind"          text                     NOT NULL,
  "description"   text                     NOT NULL,
  "owner_user_id" uuid,
  "state"         text                     NOT NULL DEFAULT 'open'::text,
  "blocking"      boolean                  NOT NULL DEFAULT false,
  "attachment_id" uuid,
  "resolution"    text,
  "version"       bigint                   NOT NULL DEFAULT 1,
  "created_by"    uuid                     NOT NULL,
  "created_at"    timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  "resolved_by"   uuid,
  "resolved_at"   timestamp with time zone,
  CONSTRAINT "work_order_exceptions_description_check" CHECK (((length(btrim(description)) >= 3) AND (length(btrim(description)) <= 3000))),
  CONSTRAINT "work_order_exceptions_kind_check"
    CHECK ((kind = ANY (ARRAY['no_access'::text, 'absence'::text, 'material'::text, 'unsafe'::text, 'damage'::text, 'customer_cancelled'::text, 'delay'::text, 'other'::text]))),
  CONSTRAINT "work_order_exceptions_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_order_exceptions_state_check" CHECK ((state = ANY (ARRAY['open'::text, 'resolved'::text]))),
  CONSTRAINT "work_order_exceptions_tenant_id_id_key" UNIQUE (tenant_id, id)
);

ALTER TABLE "public"."work_order_exceptions"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."work_order_exceptions"
  FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."work_order_exceptions" FROM "anon", "authenticated";

CREATE TABLE "public"."work_order_material_usage" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"        uuid                     NOT NULL,
  "work_order_id"    uuid                     NOT NULL,
  "task_id"          uuid,
  "description"      text                     NOT NULL,
  "quantity"         numeric(12,3)            NOT NULL,
  "unit"             text                     NOT NULL,
  "created_by"       uuid                     NOT NULL,
  "created_at"       timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  "customer_visible" boolean                  NOT NULL DEFAULT false,
  CONSTRAINT "work_order_material_usage_description_check" CHECK (((length(description) >= 2) AND (length(description) <= 300))),
  CONSTRAINT "work_order_material_usage_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_order_material_usage_quantity_check" CHECK ((quantity > (0)::numeric)),
  CONSTRAINT "work_order_material_usage_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "work_order_material_usage_unit_check" CHECK (((length(unit) >= 1) AND (length(unit) <= 40)))
);

ALTER TABLE "public"."work_order_material_usage"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."work_order_material_usage"
  FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."work_order_material_usage" FROM "anon", "authenticated", "service_role";

CREATE TABLE "public"."work_order_occurrences" (
  "tenant_id"               uuid                     NOT NULL,
  "series_id"               uuid                     NOT NULL,
  "occurrence_on"           date                     NOT NULL,
  "work_order_id"           uuid,
  "state"                   text                     NOT NULL,
  "reason"                  text                     NOT NULL DEFAULT ''::text,
  "series_version"          bigint                   NOT NULL,
  "generated_order_version" bigint,
  "created_at"              timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "work_order_occurrences_pkey" PRIMARY KEY (tenant_id, series_id, occurrence_on),
  CONSTRAINT "work_order_occurrences_state_check" CHECK ((state = ANY (ARRAY['generated'::text, 'skipped'::text]))),
  CONSTRAINT "work_order_occurrences_tenant_id_work_order_id_key" UNIQUE (tenant_id, work_order_id)
);

ALTER TABLE "public"."work_order_occurrences"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."work_order_occurrences"
  FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."work_order_occurrences" FROM "anon", "authenticated", "service_role";

CREATE TABLE "public"."work_order_relations" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"       uuid                     NOT NULL,
  "source_order_id" uuid                     NOT NULL,
  "target_order_id" uuid                     NOT NULL,
  "kind"            text                     NOT NULL,
  "reason"          text                     NOT NULL DEFAULT ''::text,
  "created_by"      uuid                     NOT NULL,
  "created_at"      timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "work_order_relations_check" CHECK ((source_order_id <> target_order_id)),
  CONSTRAINT "work_order_relations_kind_check" CHECK ((kind = ANY (ARRAY['split'::text, 'followup'::text, 'duplicate'::text, 'recurrence'::text]))),
  CONSTRAINT "work_order_relations_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_order_relations_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "work_order_relations_tenant_id_target_order_id_key" UNIQUE (tenant_id, target_order_id)
);

ALTER TABLE "public"."work_order_relations"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."work_order_relations"
  FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."work_order_relations" FROM "anon", "authenticated", "service_role";

CREATE TABLE "public"."work_order_report_versions" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"        uuid                     NOT NULL,
  "work_order_id"    uuid                     NOT NULL,
  "version"          integer                  NOT NULL,
  "snapshot"         jsonb                    NOT NULL,
  "content_hash"     text                     NOT NULL,
  "signature_policy" jsonb                    NOT NULL,
  "state"            text                     NOT NULL,
  "created_by"       uuid                     NOT NULL,
  "created_at"       timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  "approved_at"      timestamp with time zone,
  "approved_by"      uuid,
  "submission_key"   uuid                     NOT NULL,
  CONSTRAINT "work_order_report_versions_content_hash_check" CHECK ((content_hash ~ '^[a-f0-9]{64}$'::text)),
  CONSTRAINT "work_order_report_versions_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_order_report_versions_state_check"
    CHECK ((state = ANY (ARRAY['waiting_signature'::text, 'review'::text, 'correction'::text, 'approved'::text, 'superseded'::text]))),
  CONSTRAINT "work_order_report_versions_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "work_order_report_versions_tenant_id_submission_key_key" UNIQUE (tenant_id, submission_key),
  CONSTRAINT "work_order_report_versions_tenant_id_work_order_id_version_key" UNIQUE (tenant_id, work_order_id, VERSION),
  CONSTRAINT "work_order_report_versions_version_check" CHECK ((version > 0))
);

ALTER TABLE "public"."work_order_report_versions"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."work_order_report_versions"
  FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."work_order_report_versions" FROM "anon";

CREATE TABLE "public"."work_order_scope_transfers" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"       uuid                     NOT NULL,
  "source_task_id"  uuid                     NOT NULL,
  "target_task_id"  uuid                     NOT NULL,
  "target_order_id" uuid                     NOT NULL,
  "quantity"        numeric(12,3)            NOT NULL,
  "reason"          text                     NOT NULL,
  "created_by"      uuid                     NOT NULL,
  "created_at"      timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "work_order_scope_transfers_check" CHECK ((source_task_id <> target_task_id)),
  CONSTRAINT "work_order_scope_transfers_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_order_scope_transfers_quantity_check" CHECK ((quantity > (0)::numeric)),
  CONSTRAINT "work_order_scope_transfers_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "work_order_scope_transfers_tenant_id_target_task_id_key" UNIQUE (tenant_id, target_task_id)
);

ALTER TABLE "public"."work_order_scope_transfers"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."work_order_scope_transfers"
  FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."work_order_scope_transfers" FROM "anon", "authenticated", "service_role";

CREATE TABLE "public"."work_order_series" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"       uuid                     NOT NULL,
  "source_order_id" uuid                     NOT NULL,
  "title"           text                     NOT NULL,
  "definition"      jsonb                    NOT NULL,
  "timezone"        text                     NOT NULL,
  "version"         bigint                   NOT NULL DEFAULT 1,
  "active"          boolean                  NOT NULL DEFAULT true,
  "created_by"      uuid                     NOT NULL,
  "created_at"      timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "work_order_series_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_order_series_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "work_order_series_title_check" CHECK (((length(title) >= 2) AND (length(title) <= 180)))
);

ALTER TABLE "public"."work_order_series"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."work_order_series"
  FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."work_order_series" FROM "anon", "authenticated", "service_role";

CREATE TABLE "public"."work_order_signature_waivers" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"  uuid                     NOT NULL,
  "report_id"  uuid                     NOT NULL,
  "reason"     text                     NOT NULL,
  "actor_id"   uuid                     NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "work_order_signature_waivers_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_order_signature_waivers_reason_check" CHECK (((length(btrim(reason)) >= 5) AND (length(btrim(reason)) <= 1000))),
  CONSTRAINT "work_order_signature_waivers_tenant_id_report_id_key" UNIQUE (tenant_id, report_id)
);

ALTER TABLE "public"."work_order_signature_waivers"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."work_order_signature_waivers"
  FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."work_order_signature_waivers" FROM "anon";

CREATE TABLE "public"."work_order_task_contributions" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"         uuid                     NOT NULL,
  "task_id"           uuid                     NOT NULL,
  "actor_id"          uuid                     NOT NULL,
  "recorded_at"       timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  "execution_version" bigint                   NOT NULL,
  "from_quantity"     numeric(12,3)            NOT NULL,
  "to_quantity"       numeric(12,3)            NOT NULL,
  "result"            text                     NOT NULL,
  "note"              text,
  CONSTRAINT "work_order_task_contributions_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_order_task_contributions_tenant_id_task_id_execution_v_key" UNIQUE (tenant_id, task_id, execution_version)
);

ALTER TABLE "public"."work_order_task_contributions"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."work_order_task_contributions"
  FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."work_order_task_contributions" FROM "anon", "authenticated", "service_role";

CREATE TABLE "public"."work_order_template_versions" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"    uuid                     NOT NULL,
  "template_id"  uuid                     NOT NULL,
  "version"      integer                  NOT NULL,
  "state"        text                     NOT NULL DEFAULT 'draft'::text,
  "definition"   jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_by"   uuid                     NOT NULL,
  "created_at"   timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  "published_at" timestamp with time zone,
  "edit_version" bigint                   NOT NULL DEFAULT 1,
  CONSTRAINT "work_order_template_versions_edit_version_check" CHECK ((edit_version > 0)),
  CONSTRAINT "work_order_template_versions_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_order_template_versions_state_check" CHECK ((state = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text]))),
  CONSTRAINT "work_order_template_versions_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "work_order_template_versions_tenant_id_template_id_version_key" UNIQUE (tenant_id, template_id, VERSION),
  CONSTRAINT "work_order_template_versions_version_check" CHECK ((version > 0))
);

ALTER TABLE "public"."work_order_template_versions"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."work_order_template_versions"
  FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."work_order_template_versions" FROM "anon", "authenticated";

CREATE TABLE "public"."work_order_templates" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"  uuid                     NOT NULL,
  "name"       text                     NOT NULL,
  "kind"       text                     NOT NULL,
  "created_by" uuid                     NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "work_order_templates_kind_check" CHECK ((kind = ANY (ARRAY['work_order'::text, 'checklist'::text]))),
  CONSTRAINT "work_order_templates_name_check" CHECK (((length(btrim(name)) >= 2) AND (length(btrim(name)) <= 180))),
  CONSTRAINT "work_order_templates_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_order_templates_tenant_id_id_key" UNIQUE (tenant_id, id)
);

ALTER TABLE "public"."work_order_templates"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."work_order_templates"
  FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."work_order_templates" FROM "anon", "authenticated";

ALTER TABLE "public"."objects"
  ADD COLUMN "signature_mode" text NOT NULL DEFAULT 'inherit'::text;

ALTER TABLE "public"."signatures"
  ADD COLUMN "report_id" uuid;

ALTER TABLE "public"."signatures"
  ADD COLUMN "content_hash" text;

ALTER TABLE "public"."signatures"
  ADD COLUMN "signer_capacity" text;

ALTER TABLE "public"."signatures"
  ADD COLUMN "signature_kind" text NOT NULL DEFAULT 'customer'::text;

ALTER TABLE "public"."signatures"
  ADD COLUMN "channel" text NOT NULL DEFAULT 'historical'::text;

ALTER TABLE "public"."signatures"
  ADD COLUMN "captured_by_name" text;

ALTER TABLE "public"."work_order_assignments"
  ADD COLUMN "paused_at" timestamp WITH time zone;

ALTER TABLE "public"."work_order_assignments"
  ADD COLUMN "seen_at" timestamp WITH time zone;

ALTER TABLE "public"."work_order_tasks"
  ADD COLUMN "instructions" text NOT NULL DEFAULT ''::text;

ALTER TABLE "public"."work_order_tasks"
  ADD COLUMN "assigned_personnel_id" uuid;

ALTER TABLE "public"."work_order_tasks"
  ADD COLUMN "scope_root_task_id" uuid;

ALTER TABLE "public"."work_order_tasks"
  ADD COLUMN "transferred_quantity" numeric(12,3) NOT NULL DEFAULT 0;

ALTER TABLE "public"."work_order_tasks"
  ADD COLUMN "withdrawn_quantity" numeric(12,3) NOT NULL DEFAULT 0;

ALTER TABLE "public"."work_orders"
  ADD COLUMN "title" text NOT NULL DEFAULT ''::text;

ALTER TABLE "public"."work_orders"
  ADD COLUMN "description" text NOT NULL DEFAULT ''::text;

ALTER TABLE "public"."work_orders"
  ADD COLUMN "labels" text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE "public"."work_orders"
  ADD COLUMN "priority" text NOT NULL DEFAULT 'normal'::text;

ALTER TABLE "public"."work_orders"
  ADD COLUMN "source_kind" text NOT NULL DEFAULT 'manual'::text;

ALTER TABLE "public"."work_orders"
  ADD COLUMN "planner_user_id" uuid;

ALTER TABLE "public"."work_orders"
  ADD COLUMN "lead_personnel_id" uuid;

ALTER TABLE "public"."work_orders"
  ADD COLUMN "signature_mode" text NOT NULL DEFAULT 'inherit'::text;

ALTER TABLE "public"."work_orders"
  ADD COLUMN "employee_signature_required" boolean NOT NULL DEFAULT false;

ALTER TABLE "public"."work_orders"
  ADD COLUMN "published_at" timestamp WITH time zone;

ALTER TABLE "public"."work_orders"
  ADD COLUMN "planning_state" text NOT NULL DEFAULT 'final'::text;

ALTER TABLE "public"."work_orders"
  ADD COLUMN "archive_at" timestamp WITH time zone;

ALTER TABLE "public"."work_orders"
  ADD COLUMN "deadline" date;

ALTER TABLE "public"."work_orders"
  ADD COLUMN "budget_labor_minutes" integer;

ALTER TABLE "public"."work_orders"
  ADD COLUMN "details" jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "public"."work_orders"
  ADD COLUMN "template_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "public"."work_orders"
  ADD COLUMN "report_state" text NOT NULL DEFAULT 'draft'::text;

ALTER TABLE "public"."work_orders"
  ADD COLUMN "signature_policy_snapshot" jsonb;

-- Preserve existing identities, actual times, review decisions and signatures.
-- No historical report content/hash or assignment is invented.
UPDATE public.work_order_tasks SET scope_root_task_id=id WHERE scope_root_task_id IS NULL;
UPDATE public.work_orders w SET
 title=discipline,
 source_kind=CASE WHEN quote_id IS NOT NULL THEN 'quote' WHEN request_id IS NOT NULL THEN 'request' ELSE 'manual' END,
 signature_mode=CASE WHEN signature_required THEN 'required' ELSE 'none' END,
 published_at=(SELECT min(dispatched_at) FROM public.dispatches WHERE work_order_id=w.id),
 planning_state=CASE WHEN projected_start_at IS NULL THEN 'unassigned' ELSE 'final' END,
 report_state=CASE WHEN status IN ('approved','invoice_ready','invoiced') THEN 'approved' WHEN status='correction_required' THEN 'correction' WHEN status IN ('completed','under_review') THEN 'review' ELSE 'draft' END,
 signature_policy_snapshot=CASE WHEN status<>'planned' THEN jsonb_build_object('mode',CASE WHEN signature_required THEN 'required' ELSE 'none' END,'source','historical','employeeRequired',false) ELSE NULL END;
UPDATE storage.buckets SET allowed_mime_types=ARRAY['image/png'] WHERE id='signatures';

CREATE OR REPLACE FUNCTION private.agreement_scope_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare l public.customer_agreement_lines; a public.customer_agreements; o uuid; w public.work_orders; business_day date; candidates uuid[];
begin
 if tg_table_name='work_order_tasks' then
  if new.scope_root_task_id is not null and new.scope_root_task_id<>new.id and exists(select 1 from public.work_order_scope_transfers x where x.tenant_id=new.tenant_id and x.target_task_id=new.id) then return new;end if;
 end if;
 if tg_table_name='work_order_tasks' then
  if new.commercial_snapshot ? 'quote_id' then return new;end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||new.tenant_id::text,0));
 if tg_table_name='work_order_tasks' then
  if tg_op='UPDATE' then
   if old.agreement_line_id is distinct from new.agreement_line_id or old.commercial_snapshot is distinct from new.commercial_snapshot then raise exception 'De vastgelegde commerciële bron is onveranderlijk' using errcode='23514';end if;
  else new.commercial_snapshot:='{}'::jsonb;end if;
 end if;
 if tg_table_name='work_order_tasks' then
 if tg_op='INSERT' and new.agreement_line_id is null and not new.is_extra_work and new.unit_price_cents>0 then
  select * into w from public.work_orders where tenant_id=new.tenant_id and id=new.work_order_id;
  select array_agg(distinct l1.id) into candidates from public.object_records r join public.customer_agreement_lines l1 on l1.id=r.agreement_line_id join public.customer_agreements a1 on a1.id=l1.agreement_id
  where a1.state='active' and l1.price_basis='visit' and not l1.extra_work and r.tenant_id=new.tenant_id and r.object_id=w.object_id and r.kind='programme' and r.state='active' and r.task_revision_id=new.task_revision_id
  and a1.starts_on<=(w.projected_start_at at time zone (select timezone from public.tenants where id=new.tenant_id))::date and (a1.ends_on is null or a1.ends_on>=((w.projected_end_at - interval '1 microsecond') at time zone (select timezone from public.tenants where id=new.tenant_id))::date)
  and not exists(select 1 from public.customer_agreements next_a where next_a.previous_id=a1.id and next_a.state='active' and next_a.starts_on<=(w.projected_start_at at time zone (select timezone from public.tenants where id=new.tenant_id))::date)
  ;
  if cardinality(candidates)>1 then raise exception 'Meerdere contractregels zijn van toepassing. Kies de concrete contractregel voor deze uitvoering' using errcode='23514';end if;
  select * into l from public.customer_agreement_lines where id=candidates[1];
  if l.id is null and exists(select 1 from public.object_records r where r.tenant_id=new.tenant_id and r.object_id=w.object_id and r.kind='programme' and r.state='active' and r.task_revision_id=new.task_revision_id and r.agreement_line_id is not null) then raise exception 'Het werkprogramma heeft geen geldige contractversie voor dit bezoek. Werk eerst de klantafspraak bij' using errcode='23514';end if;
  if l.id is not null then new.agreement_line_id:=l.id;new.unit_price_cents:=l.price_cents;end if;
 end if;
 end if;
 if new.agreement_line_id is null then return new;end if;
 select * into l from public.customer_agreement_lines where tenant_id=new.tenant_id and id=new.agreement_line_id;
 select * into a from public.customer_agreements where tenant_id=new.tenant_id and id=l.agreement_id;
 if tg_table_name='object_records' then o:=new.object_id;else select * into w from public.work_orders where tenant_id=new.tenant_id and id=new.work_order_id;o:=w.object_id;end if;
 if a.state<>'active' or l.price_basis<>'visit' or (tg_table_name='object_records' and l.extra_work) or l.id is null or l.object_id<>o or l.task_revision_id is distinct from new.task_revision_id or not exists(select 1 from public.objects where tenant_id=new.tenant_id and id=o and customer_id=a.customer_id) then raise exception 'De afspraak hoort niet bij dit object of deze catalogustaak' using errcode='23514';end if;
 if tg_table_name='work_order_tasks' then
  if l.extra_work is distinct from new.is_extra_work then raise exception 'De contractregel is niet bestemd voor dit type werk' using errcode='23514';end if;
  if tg_op='UPDATE' and (old.agreement_line_id is distinct from new.agreement_line_id or old.commercial_snapshot is distinct from new.commercial_snapshot) then raise exception 'De vastgelegde commerciële bron is onveranderlijk' using errcode='23514';end if;
  if new.unit_price_cents<>l.price_cents or new.quantity+coalesce((select sum(t.quantity) from public.work_order_tasks t where t.tenant_id=new.tenant_id and t.work_order_id=new.work_order_id and t.agreement_line_id=l.id and t.id<>new.id),0)>l.quantity or round((new.quantity+coalesce((select sum(t.quantity) from public.work_order_tasks t where t.tenant_id=new.tenant_id and t.work_order_id=new.work_order_id and t.agreement_line_id=l.id and t.id<>new.id),0))*new.unit_price_cents)>l.limit_cents then raise exception 'De gezamenlijke uitvoering overschrijdt de afgesproken hoeveelheid of prijs per bezoek' using errcode='23514';end if;
  if tg_op='INSERT' then
   if l.vat_basis_points is not null then new.vat_basis_points:=l.vat_basis_points;end if;
   business_day:=(coalesce(w.projected_start_at,clock_timestamp()) at time zone (select timezone from public.tenants where id=new.tenant_id))::date;
   if a.state<>'active' or a.starts_on>business_day or a.ends_on<((coalesce(w.projected_end_at,w.projected_start_at,clock_timestamp())-interval '1 microsecond') at time zone (select timezone from public.tenants where id=new.tenant_id))::date or exists(select 1 from public.customer_agreements n where n.previous_id=a.id and n.state='active' and n.starts_on<=business_day) then raise exception 'Kies de geldige contractversie voor deze uitvoering' using errcode='23514';end if;
   if new.quantity>l.quantity or new.unit_price_cents<>l.price_cents or round(new.quantity*new.unit_price_cents)>l.limit_cents then raise exception 'Deze uitvoering overschrijdt de contractafspraak' using errcode='23514';end if;
   new.commercial_snapshot:=jsonb_build_object('agreementId',a.id,'version',a.version,'lineId',l.id,'scope',l.scope,'quantity',l.quantity,'limitCents',l.limit_cents,'priceCents',l.price_cents,'acceptedBy',a.accepted_by_name,'acceptedOn',a.accepted_on,'evidenceDocumentId',a.evidence_document_id);
  end if;
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.object_instruction_completion_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$begin return new;end $function$;

CREATE OR REPLACE FUNCTION private.report_storage_frozen (
  bucket text,
  path   text
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select exists(select 1 from public.attachments a join public.work_order_report_versions r on r.tenant_id=a.tenant_id and r.work_order_id=a.work_order_id where a.storage_bucket=bucket and a.storage_path=path and exists(select 1 from jsonb_array_elements(r.snapshot->'attachments') x where x->>'id'=a.id::text));
$function$;

CREATE OR REPLACE FUNCTION private.staff_report_editable (
  t uuid,
  w uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select private.work_order_execution_actor(t,w,auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid)
 and exists(select 1 from public.work_orders wo where wo.tenant_id=t and wo.id=w and wo.status in ('seen','travelling','in_progress','completed','correction_required') and wo.report_state in ('draft','correction'));
$function$;

CREATE OR REPLACE FUNCTION private.staff_work_order_result (
  w public.work_orders
)
  RETURNS public.work_orders
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select case when private.has_role(w.tenant_id,array['tenant_admin','management','finance']::public.app_role[]) then w
 else jsonb_populate_record(null::public.work_orders,to_jsonb(w)-array['template_snapshot','details','object_snapshot','commercial_terms','commercial_snapshot','bill_travel','quote_id','request_id']) end;
$function$;

CREATE OR REPLACE FUNCTION private.sync_execution_request()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 if new.execution_version<>old.execution_version then
  update public.object_visit_requests set state=case when new.completed_at is null then case when new.is_extra_work then 'accepted' else 'regular' end when new.execution_state='not_applicable' then 'not_done' else new.execution_state end,response=coalesce(nullif(new.completion_note,''),response)
  where tenant_id=new.tenant_id and work_order_task_id=new.id;
  perform private.enqueue_event(new.tenant_id,'task.executed','work_order',new.work_order_id,jsonb_build_object('task_id',new.id,'version',new.execution_version,'result',new.execution_state),'task-execution:'||new.id::text||':'||new.execution_version::text);
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.validate_work_order_recurrence (
  rule jsonb
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare anchor date;ending date;
begin
 anchor:=(rule->>'startsOn')::date;ending:=nullif(rule->>'endsOn','')::date;
 if anchor is null or not isfinite(anchor) or(ending is not null and(not isfinite(ending) or ending<anchor))
  or coalesce(rule->>'frequency','') not in ('daily','weekly','monthly')
  or coalesce((rule->>'interval')::integer,0) not between 1 and 52
  or jsonb_typeof(rule->'weekdays') is distinct from 'array' or jsonb_array_length(rule->'weekdays') not between 1 and 7
  or exists(select 1 from jsonb_array_elements_text(rule->'weekdays') x where x::integer not between 1 and 7)
  or coalesce(rule->>'monthlyMode','') not in ('date','weekday')
  or coalesce((rule->>'monthDay')::integer,0) not between 1 and 31
  or coalesce((rule->>'monthWeekday')::integer,0) not between 1 and 7
  or coalesce((rule->>'monthPosition')::integer,0) not in (-1,1,2,3,4,5)
  or coalesce(rule->>'startsAt','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$'
  or coalesce(rule->>'endsAt','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$'
  or(rule->>'endsAt')::time<=(rule->>'startsAt')::time
  or coalesce((rule->>'requiredPersonnel')::integer,0) not between 1 and 100
 then raise exception 'Controleer patroon, looptijd, tijdvenster en bezetting' using errcode='23514';end if;
end $function$;

CREATE OR REPLACE FUNCTION private.validate_work_order_report (
  w public.work_orders
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 if exists(select 1 from public.work_order_exceptions e where e.tenant_id=w.tenant_id and e.work_order_id=w.id and e.blocking and e.state='open') then raise exception 'Los eerst de blokkerende bijzonderheden op' using errcode='23514';end if;
 if not private.work_order_checklist_ready(w.id) then raise exception 'Vul de verplichte checklistvragen en bewijsgegevens in' using errcode='23514';end if;
 if exists(select 1 from public.work_order_assignments a where a.tenant_id=w.tenant_id and a.work_order_id=w.id and a.status not in ('completed','returned','cancelled'))
 or exists(select 1 from public.time_entries e join public.work_order_assignments a on a.id=e.assignment_id and a.tenant_id=e.tenant_id where a.work_order_id=w.id and a.tenant_id=w.tenant_id and e.ends_at is null) then
 raise exception 'Laat iedere medewerker eerst de eigen inzet stoppen' using errcode='23514';end if;
 if not exists(select 1 from public.work_order_tasks t where t.tenant_id=w.tenant_id and t.work_order_id=w.id) or exists(select 1 from public.work_order_tasks t where t.tenant_id=w.tenant_id and t.work_order_id=w.id and (not t.is_extra_work or t.extra_work_status<>'rejected')
 and (t.completed_at is null and coalesce((to_jsonb(t)->>'transferred_quantity')::numeric,0)+coalesce((to_jsonb(t)->>'withdrawn_quantity')::numeric,0)<t.quantity)) then
 raise exception 'Leg alle verplichte taakresultaten of scopeoverdrachten vast' using errcode='23514';end if;
 if exists(select 1 from public.object_records r cross join public.work_order_assignments a join public.personnel p on p.id=a.personnel_id and p.tenant_id=a.tenant_id
 where r.tenant_id=w.tenant_id and r.object_id=w.object_id and r.kind='instruction' and r.state='active' and coalesce((r.details->>'acknowledgement')::boolean,false)
 and a.tenant_id=w.tenant_id and a.work_order_id=w.id and a.actual_start_at is not null and r.starts_at<=a.projected_end_at and (r.ends_at is null or r.ends_at>=a.projected_start_at)
 and (r.work_order_id is null or r.work_order_id=w.id) and (r.service='' or r.service=w.discipline)
 and not exists(select 1 from public.object_instruction_receipts rc where rc.tenant_id=w.tenant_id and rc.record_id=r.id and rc.record_version=r.version and rc.user_id=p.user_id and rc.work_order_id=w.id)) then
 raise exception 'Bevestig eerst de actuele verplichte objectinstructies' using errcode='23514';end if;
end $function$;

CREATE OR REPLACE FUNCTION private.work_order_access (
  t         uuid,
  financial boolean DEFAULT false
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select private.object_session_active() and private.service_enabled(t,'planning') and private.has_role(t,case when financial then array['tenant_admin','management','finance']::public.app_role[] else array['tenant_admin','management','planner','finance']::public.app_role[] end)
$function$;

CREATE OR REPLACE FUNCTION private.work_order_approval_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare r public.work_order_report_versions;
begin
 if auth.uid() is null and current_user in ('postgres','supabase_admin') then return new;end if;
 if new.status in ('approved','invoice_ready') and (tg_op='INSERT' or old.status is distinct from new.status) then
  select * into r from public.work_order_report_versions where tenant_id=new.tenant_id and work_order_id=new.id and version=new.report_version;
  if r.id is null or r.state<>'approved' or not private.work_order_report_ready(r) then raise exception 'Goedkeuring vereist een gecontroleerde actuele rapportversie' using errcode='23514';end if;
 end if;return new;
end $function$;

CREATE OR REPLACE FUNCTION private.work_order_archive_planning_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 if tg_table_name='work_orders' then
  if old.archive_at is not null and (new.status,new.projected_start_at,new.projected_end_at,new.planned_start_at,new.planned_end_at) is distinct from(old.status,old.projected_start_at,old.projected_end_at,old.planned_start_at,old.planned_end_at) then raise exception 'Een gearchiveerde bon kan niet opnieuw worden ingepland of vrijgegeven' using errcode='23514';end if;
 else
  if exists(select 1 from public.work_orders where id=new.work_order_id and tenant_id=new.tenant_id and archive_at is not null) then raise exception 'Een gearchiveerde bon kan niet opnieuw worden toegewezen' using errcode='23514';end if;
 end if;return new;
end $function$;

CREATE OR REPLACE FUNCTION private.work_order_checklist_errors (
  target_order uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare c record;q jsonb;a public.work_order_checklist_answers;condition_value jsonb;errors jsonb:='[]'::jsonb;
begin
 for c in select * from public.work_order_checklists where work_order_id=target_order loop
 for q in select * from jsonb_array_elements(coalesce(c.definition->'questions','[]')) loop
   if q ? 'condition' then
     select value into condition_value from public.work_order_checklist_answers where checklist_id=c.id and question_id=q->'condition'->>'questionId';
     if condition_value is distinct from q->'condition'->'equals' then continue;end if;
   end if;
   select * into a from public.work_order_checklist_answers where checklist_id=c.id and question_id=q->>'id';
   if a.not_applicable then
     if not coalesce((q->>'allowNA')::boolean,false) or length(btrim(a.reason))<3 then errors:=errors||jsonb_build_array(q->>'label');end if;
   elsif coalesce((q->>'required')::boolean,false) and (a.id is null or a.value is null or a.value in ('null'::jsonb,'""'::jsonb) or (q->>'type'='check' and a.value<>'true') or (q->>'type'='photo' and a.attachment_id is null)) then errors:=errors||jsonb_build_array(q->>'label');
   elsif (coalesce((q->>'proof')::boolean,false) or q->>'type'='photo') and a.id is not null and not exists(select 1 from public.attachments p where p.tenant_id=c.tenant_id and p.work_order_id=c.work_order_id and p.id=a.attachment_id and p.deleted_at is null and p.mime_type in ('image/jpeg','image/png','image/webp')) then errors:=errors||jsonb_build_array(q->>'label'||' (bewijs)');end if;
 end loop;end loop;
 return errors;
end $function$;

CREATE OR REPLACE FUNCTION private.work_order_checklist_ready (
  target_order uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$ select jsonb_array_length(private.work_order_checklist_errors(target_order))=0 $function$;

CREATE OR REPLACE FUNCTION private.work_order_clone (
  t              uuid,
  source_id      uuid,
  title          text,
  instructions   text,
  requested      date,
  kind           text,
  copy_template  boolean,
  copy_contacts  boolean,
  copy_personnel boolean
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare source public.work_orders;created uuid;details jsonb;
begin
 select * into source from public.work_orders where tenant_id=t and id=source_id;
 if source.id is null then raise exception 'Werkbon niet beschikbaar' using errcode='42501';end if;
 details:='{}';
 if copy_contacts then details:=details||jsonb_build_object('contacts',coalesce(source.details->'contacts','[]'));end if;
 if copy_personnel then details:=details||jsonb_build_object('personnel_suggestion',coalesce((select jsonb_agg(a.personnel_id) from public.work_order_assignments a join public.personnel p on p.tenant_id=a.tenant_id and p.id=a.personnel_id and p.status='active' where a.tenant_id=t and a.work_order_id=source.id and a.status not in ('cancelled','returned')),'[]'));end if;
 insert into public.work_orders(tenant_id,work_order_number,customer_id,object_id,discipline,created_by,title,description,day_instructions,requested_date,source_kind,required_personnel,signature_required,signature_mode,employee_signature_required,template_snapshot,details,planning_state)
 values(t,'WB-'||to_char(clock_timestamp(),'YYYY')||'-'||upper(substr(gen_random_uuid()::text,1,8)),source.customer_id,source.object_id,source.discipline,auth.uid(),title,instructions,instructions,requested,kind,source.required_personnel,source.signature_required,coalesce(to_jsonb(source)#>>'{signature_policy_snapshot,mode}',source.signature_mode),coalesce((to_jsonb(source)#>>'{signature_policy_snapshot,employeeRequired}')::boolean,source.employee_signature_required),case when copy_template then source.template_snapshot else '{}' end,details,'unassigned') returning id into created;
 if copy_contacts then
  insert into public.work_order_contacts(tenant_id,work_order_id,contact_id,roles,snapshot)
  select t,created,c.contact_id,c.roles,c.snapshot from public.work_order_contacts c join public.customer_contacts contact on contact.tenant_id=c.tenant_id and contact.id=c.contact_id and contact.customer_id=source.customer_id
  where c.tenant_id=t and c.work_order_id=source.id;
 end if;
 if copy_template then
  insert into public.work_order_checklists(tenant_id,work_order_id,template_revision_id,name,definition)
  select t,created,template_revision_id,name,definition from public.work_order_checklists where tenant_id=t and work_order_id=source.id;
 end if;
 return created;
end $function$;

CREATE OR REPLACE FUNCTION private.work_order_execution_actor (
  t uuid,
  w uuid,
  u uuid,
  s uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select exists(select 1 from auth.sessions se join auth.users au on au.id=se.user_id
 join public.tenant_memberships m on m.user_id=au.id and m.tenant_id=t
 join public.personnel p on p.user_id=m.user_id and p.tenant_id=m.tenant_id
 join public.work_order_assignments a on a.personnel_id=p.id and a.tenant_id=p.tenant_id
 join public.work_orders wo on wo.id=a.work_order_id and wo.tenant_id=a.tenant_id
 where au.id=u and se.id=s and (se.not_after is null or se.not_after>clock_timestamp()) and au.deleted_at is null
 and (au.banned_until is null or au.banned_until<clock_timestamp()) and m.status='active' and 'staff'=any(m.roles)
 and p.status='active' and a.work_order_id=w and a.status not in ('cancelled','returned') and wo.status<>'cancelled'
 and exists(select 1 from public.dispatches d where d.tenant_id=t and d.assignment_id=a.id and d.revoked_at is null)
 and exists(select 1 from public.tenants te where te.id=t and te.status='active'))
 and private.service_enabled(t,'personeel') and private.service_enabled(t,'planning') and private.service_enabled(t,'rapportage');
$function$;

CREATE OR REPLACE FUNCTION private.work_order_invoice_signature_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare w public.work_orders;r public.work_order_report_versions;
begin
 if auth.uid() is null and current_user in ('postgres','supabase_admin') then return new;end if;
 if new.work_order_id is null then return new;end if;
 select * into w from public.work_orders where tenant_id=new.tenant_id and id=new.work_order_id;
 select * into r from public.work_order_report_versions where tenant_id=w.tenant_id and work_order_id=w.id and version=w.report_version;
 if r.id is null then
  -- Already approved historical work retains its existing genuine commercial
  -- state, but never obtains new approval through this compatibility branch.
  if w.signature_policy_snapshot->>'source'<>'historical' or w.status not in ('invoice_ready','invoiced') or(w.signature_required and not exists(select 1 from public.signatures s where s.tenant_id=w.tenant_id and s.work_order_id=w.id and s.report_version=w.report_version and s.revoked_at is null)) then raise exception 'Actueel goedgekeurd rapport ontbreekt' using errcode='23514';end if;
 elsif r.state<>'approved' or not private.work_order_report_ready(r) then raise exception 'Rapport en verplichte ondertekening zijn nog niet vrijgegeven' using errcode='23514';end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.work_order_lineage_authorized (
  t uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select private.object_session_active() and private.object_manage(t);
$function$;

CREATE OR REPLACE FUNCTION private.work_order_lineage_invoice_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare task public.work_order_tasks;root public.work_order_tasks;allocated numeric;prior_amount bigint;invoice_prior bigint;price numeric;
begin
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||new.tenant_id::text,0));
 select * into task from public.work_order_tasks where tenant_id=new.tenant_id and id=new.work_order_task_id;
 if task.id is null then return new;end if;
 select * into root from public.work_order_tasks where tenant_id=new.tenant_id and id=task.scope_root_task_id for update;
 select coalesce(sum(l.quantity),0),coalesce(sum(l.subtotal_cents),0) into allocated,prior_amount
 from public.invoice_lines l join public.work_order_tasks t on t.tenant_id=l.tenant_id and (t.id=l.work_order_task_id or l.work_order_task_id is null and l.source_snapshot->>'work_order_task_id'=t.id::text)
 where l.tenant_id=new.tenant_id and t.scope_root_task_id=root.id and l.id<>new.id;
 if allocated+new.quantity>root.quantity-root.withdrawn_quantity then raise exception 'De oorspronkelijke prestatie is al toegewezen aan een factuur' using errcode='23514';end if;
 if task.scope_root_task_id<>task.id or task.transferred_quantity>0 then
  price:=case when root.commercial_snapshot ? 'quote_id' then (root.commercial_snapshot#>>'{line,net_cents}')::numeric/(root.commercial_snapshot#>>'{line,quantity}')::numeric else root.unit_price_cents end;
  -- Preserve cumulative fixed-price rounding across all split performances.
  new.subtotal_cents:=round((allocated+new.quantity)*price)-prior_amount;
  if new.subtotal_cents<0 then raise exception 'Controleer de eerdere financiële bronverdeling' using errcode='23514';end if;
  select coalesce(sum(l.subtotal_cents),0) into invoice_prior from public.invoice_lines l where l.tenant_id=new.tenant_id and l.invoice_id=new.invoice_id and l.id<>new.id and l.vat_basis_points=new.vat_basis_points and(l.created_at,l.id)<(new.created_at,new.id);
  new.vat_cents:=round((invoice_prior+new.subtotal_cents)*new.vat_basis_points/10000.0)-round(invoice_prior*new.vat_basis_points/10000.0);
  new.total_cents:=new.subtotal_cents+new.vat_cents;
 end if;
 new.source_snapshot:=new.source_snapshot||jsonb_build_object('scope_root_task_id',root.id,'scope_transfer_id',(select id from public.work_order_scope_transfers where tenant_id=new.tenant_id and target_task_id=task.id));
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.work_order_policy_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 if tg_op='UPDATE' and old.signature_policy_snapshot is not null and (new.signature_mode,new.employee_signature_required,new.signature_required,new.signature_policy_snapshot) is distinct from (old.signature_mode,old.employee_signature_required,old.signature_required,old.signature_policy_snapshot)
 and not exists(select 1 from private.work_order_policy_changes c where c.tenant_id=old.tenant_id and c.work_order_id=old.id and c.transaction_id=pg_current_xact_id() and c.actor_id=auth.uid() and c.old_policy=old.signature_policy_snapshot and c.new_policy=new.signature_policy_snapshot and c.mode=new.signature_mode and c.employee_required=new.employee_signature_required and new.signature_required=(c.new_policy->>'mode'='required')) then
  raise exception 'Gebruik de gemotiveerde wijziging van de ondertekenafspraak' using errcode='23514';end if;
 if new.signature_policy_snapshot is null and new.status<>'planned' then new.signature_policy_snapshot:=private.work_order_signature_policy(new);new.signature_required:=new.signature_policy_snapshot->>'mode'='required';end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.work_order_recurrence_matches (
  rule jsonb,
  day  date
)
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare anchor date:=(rule->>'startsOn')::date;step integer:=(rule->>'interval')::integer;months integer;position integer;
begin
 if day<anchor or day>nullif(rule->>'endsOn','')::date then return false;end if;
 if rule->>'frequency'='daily' then return (day-anchor)%step=0;end if;
 if rule->>'frequency'='weekly' then return floor(((day-anchor)+extract(isodow from anchor)-1)/7)::integer%step=0 and rule->'weekdays' @> to_jsonb(array[extract(isodow from day)::integer]);end if;
 months:=(extract(year from day)::integer-extract(year from anchor)::integer)*12+extract(month from day)::integer-extract(month from anchor)::integer;
 if months%step<>0 then return false;end if;
 if rule->>'monthlyMode'='date' then return extract(day from day)::integer=(rule->>'monthDay')::integer;end if;
 if extract(isodow from day)::integer<>(rule->>'monthWeekday')::integer then return false;end if;
 position:=(rule->>'monthPosition')::integer;
 if position=-1 then return date_trunc('month',day+7)<>date_trunc('month',day);end if;
 return floor((extract(day from day)-1)/7)::integer+1=position;
end $function$;

CREATE OR REPLACE FUNCTION private.work_order_report_immutable()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
 if tg_op='DELETE' then raise exception 'Rapportgeschiedenis kan niet worden verwijderd' using errcode='23514';end if;
 if (new.tenant_id,new.work_order_id,new.version,new.snapshot,new.content_hash,new.signature_policy,new.created_by,new.created_at,new.submission_key)
 is distinct from (old.tenant_id,old.work_order_id,old.version,old.snapshot,old.content_hash,old.signature_policy,old.created_by,old.created_at,old.submission_key) then
 raise exception 'Rapportinhoud is onveranderlijk. Lever een nieuwe versie aan.' using errcode='23514';end if;return new;
end $function$;

CREATE OR REPLACE FUNCTION private.work_order_report_ready (
  r public.work_order_report_versions
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select (r.signature_policy->>'mode'<>'required' or exists(select 1 from public.signatures s where s.report_id=r.id and s.tenant_id=r.tenant_id and s.signature_kind='customer' and s.content_hash=r.content_hash and s.revoked_at is null)
 or exists(select 1 from public.work_order_signature_waivers x where x.tenant_id=r.tenant_id and x.report_id=r.id))
 and(not coalesce((r.signature_policy->>'employeeRequired')::boolean,false) or exists(select 1 from public.signatures s where s.report_id=r.id and s.tenant_id=r.tenant_id and s.signature_kind='employee' and s.content_hash=r.content_hash and s.revoked_at is null));
$function$;

CREATE OR REPLACE FUNCTION private.work_order_report_snapshot (
  w       public.work_orders,
  summary text
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select jsonb_build_object('schema',1,'number',w.work_order_number,'title',coalesce(nullif(w.title,''),w.discipline),'summary',summary,
 'tenant',jsonb_build_object('name',te.name,'primaryColor',coalesce(b.primary_color,'#173750'),'accentColor',coalesce(b.accent_color,'#41ac42')),
 'customer',jsonb_build_object('name',c.name),'object',jsonb_build_object('name',o.name,'address',o.address),
 'executionDate',coalesce(w.actual_start_at,w.projected_start_at),'endedAt',w.actual_end_at,'timezone',te.timezone,
 'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'code',t.task_code,'name',t.task_name,'quantity',t.quantity,'unit',t.unit,
 'executedQuantity',coalesce(t.executed_quantity,case when t.completed_at is not null then t.quantity else 0 end),'result',t.execution_state,
 'transferredQuantity',coalesce((to_jsonb(t)->>'transferred_quantity')::numeric,0),'withdrawnQuantity',coalesce((to_jsonb(t)->>'withdrawn_quantity')::numeric,0),'extraWork',t.is_extra_work) order by t.created_at,t.id)
 from public.work_order_tasks t where t.tenant_id=w.tenant_id and t.work_order_id=w.id and(not t.is_extra_work or t.extra_work_status<>'rejected')),'[]'),
 'checklists',coalesce((select jsonb_agg(jsonb_build_object('name',cl.name,'version',tv.version,'question',q->>'label','unit',q->>'unit','type',q->>'type','value',a.value,'notApplicable',a.not_applicable,'reason',case when a.not_applicable then a.reason else null end,'answerVersion',a.version,'attachmentId',a.attachment_id) order by cl.created_at,q->>'id')
 from public.work_order_checklists cl join public.work_order_template_versions tv on tv.id=cl.template_revision_id cross join lateral jsonb_array_elements(cl.definition->'questions')q join public.work_order_checklist_answers a on a.checklist_id=cl.id and a.question_id=q->>'id'
 where cl.tenant_id=w.tenant_id and cl.work_order_id=w.id and coalesce((q->>'customerVisible')::boolean,false) and (q->'condition' is null or q->'condition'='null'::jsonb or exists(select 1 from public.work_order_checklist_answers condition_answer where condition_answer.checklist_id=cl.id and condition_answer.question_id=q->'condition'->>'questionId' and condition_answer.value=q->'condition'->'equals'))),'[]'),
 'materials',coalesce((select jsonb_agg(jsonb_build_object('description',m.description,'quantity',m.quantity,'unit',m.unit,'taskId',m.task_id) order by m.created_at,m.id) from public.work_order_material_usage m where m.tenant_id=w.tenant_id and m.work_order_id=w.id and coalesce((to_jsonb(m)->>'customer_visible')::boolean,false)),'[]'),
 'notes',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'body',e.body) order by e.created_at,e.id) from public.report_entries e where e.tenant_id=w.tenant_id and e.work_order_id=w.id and e.customer_visible and e.deleted_at is null),'[]'),
 'attachments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',a.file_name,'mime',a.mime_type,'sha256',a.sha256) order by a.created_at,a.id) from public.attachments a where a.tenant_id=w.tenant_id and a.work_order_id=w.id and a.deleted_at is null and(a.customer_visible or exists(select 1 from public.work_order_checklists cl cross join lateral jsonb_array_elements(cl.definition->'questions')q join public.work_order_checklist_answers ca on ca.checklist_id=cl.id and ca.question_id=q->>'id' where cl.work_order_id=w.id and ca.attachment_id=a.id and coalesce((q->>'customerVisible')::boolean,false)))),'[]'))
 from public.tenants te left join public.tenant_branding b on b.tenant_id=te.id join public.customers c on c.tenant_id=te.id and c.id=w.customer_id join public.objects o on o.tenant_id=te.id and o.id=w.object_id where te.id=w.tenant_id;
$function$;

CREATE OR REPLACE FUNCTION private.work_order_report_source_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare w uuid;t uuid;changed boolean:=true;
begin
 if tg_op='DELETE' then w:=old.work_order_id;t:=old.tenant_id;else w:=new.work_order_id;t:=new.tenant_id;end if;
 if tg_table_name='attachments' and tg_op<>'INSERT' and exists(select 1 from public.work_order_report_versions r where r.tenant_id=old.tenant_id and r.work_order_id=old.work_order_id and exists(select 1 from jsonb_array_elements(r.snapshot->'attachments')x where x->>'id'=old.id::text)) then
  if tg_op='DELETE' or (to_jsonb(old)-array['updated_at','version']) is distinct from (to_jsonb(new)-array['updated_at','version']) then raise exception 'Bewijsbijlage van een rapportversie is onveranderlijk; voeg een nieuwe bijlage toe' using errcode='23514';end if;
 end if;
 if tg_table_name='report_entries' then
  if tg_op='UPDATE' then changed:=(old.customer_visible or new.customer_visible) and (old.body,old.customer_visible,old.deleted_at,old.work_order_id,old.tenant_id) is distinct from (new.body,new.customer_visible,new.deleted_at,new.work_order_id,new.tenant_id);
  elsif tg_op='INSERT' then changed:=new.customer_visible;else changed:=old.customer_visible;end if;
 elsif tg_table_name='attachments' and tg_op='UPDATE' then changed:=old.customer_visible or new.customer_visible;
 elsif tg_table_name='work_order_tasks' and tg_op='UPDATE' then changed:=(old.task_code,old.task_name,old.quantity,old.executed_quantity,old.unit,old.completed_at,old.execution_state) is distinct from (new.task_code,new.task_name,new.quantity,new.executed_quantity,new.unit,new.completed_at,new.execution_state);
 end if;
 if changed and exists(select 1 from public.work_order_report_versions r where r.tenant_id=t and r.work_order_id=w and r.state in ('waiting_signature','review','approved')) then raise exception 'Vraag eerst een rapportcorrectie aan voordat klantzichtbare uitvoering wordt gewijzigd' using errcode='23514';end if;
 if tg_op='DELETE' then return old;end if;return new;
end $function$;

CREATE OR REPLACE FUNCTION private.work_order_review_legacy (
  target_work_order_id uuid,
  decision             text,
  reason               text DEFAULT NULL::text
)
  RETURNS public.work_orders
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare w public.work_orders;t public.work_order_tasks;result public.work_orders;
begin
 select * into w from public.work_orders where id=target_work_order_id;
 if not private.commercial_access(w.tenant_id) then raise exception 'Geen rapportcontroletoegang' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||w.tenant_id::text,0));
 select * into w from public.work_orders where id=target_work_order_id for update;
 if decision='approved' then
  if exists(select 1 from public.object_visit_requests where tenant_id=w.tenant_id and work_order_id=w.id and needs_review) then raise exception 'Beoordeel eerst de gewijzigde verzoeken bij deze uitvoering' using errcode='23514';end if;
  for t in select * from public.work_order_tasks where tenant_id=w.tenant_id and work_order_id=w.id and is_extra_work and extra_work_status='awaiting_review' for update loop
   if not exists(select 1 from public.object_visit_requests r join public.object_request_proposals p on p.request_id=r.id where r.work_order_task_id=t.id and p.accepted_at is not null and p.quantity=t.quantity and p.price_cents=t.unit_price_cents and p.task_revision_id=t.task_revision_id)
   and not exists(select 1 from public.customer_agreement_lines l join public.customer_agreements a on a.tenant_id=l.tenant_id and a.id=l.agreement_id where l.tenant_id=t.tenant_id and l.id=t.agreement_line_id and l.extra_work and a.evidence_document_id is not null and t.commercial_snapshot->>'lineId'=l.id::text and t.commercial_snapshot->>'evidenceDocumentId'=a.evidence_document_id::text)
   and not exists(select 1 from public.work_order_allowed_extra_work a join public.extra_work_rules r on r.id=a.extra_work_rule_id and r.tenant_id=a.tenant_id where a.tenant_id=t.tenant_id and a.work_order_id=t.work_order_id and r.task_revision_id=t.task_revision_id and r.active) then raise exception 'Meerwerk heeft nog geen aantoonbaar akkoord. Leg een passend voorstel vast of stuur het rapport terug.' using errcode='23514';end if;
   update public.work_order_tasks set extra_work_status='approved' where id=t.id;
  end loop;
 end if;
 result:=private.review_work_order_base(target_work_order_id,decision,reason);
 return result;
end $function$;

CREATE OR REPLACE FUNCTION private.work_order_row (
  target_order uuid,
  fin          boolean
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select jsonb_build_object('id',w.id,'number',w.work_order_number,'title',coalesce(nullif(w.title,''),w.discipline),'customerId',w.customer_id,'customer',c.name,'objectId',w.object_id,'object',o.name,
 'address',concat_ws(', ',o.address->>'street',o.address->>'postal_code',o.address->>'city'),'discipline',w.discipline,'priority',w.priority,'source',w.source_kind,
 'start',w.projected_start_at,'end',w.projected_end_at,'deadline',w.deadline,'version',w.version,'status',w.status,'planningState',w.planning_state,
 'reportState',coalesce(to_jsonb(w)->>'report_state',case when w.status='correction_required' then 'correction' when w.status in ('invoice_ready','invoiced','approved') then 'approved' when w.status in ('completed','under_review') then 'review' else 'draft' end),
 'billingState',case when not fin then null when w.status='invoiced' then 'invoiced' when exists(select 1 from public.invoice_lines i where i.work_order_id=w.id) then 'partial' when w.status='invoice_ready' then 'ready' else 'not_ready' end,
 'signatureRequired',w.signature_required,'signatureState',case when exists(select 1 from public.work_order_signature_waivers x join public.work_order_report_versions r on r.id=x.report_id where r.work_order_id=w.id and r.version=w.report_version and r.state not in ('superseded','correction')) then 'waived' when exists(select 1 from public.signatures s where s.work_order_id=w.id and s.report_version=w.report_version and s.revoked_at is null and s.signature_kind='customer') then 'signed' when w.signature_required then 'waiting' when w.signature_mode='optional' then 'optional' else 'not_required' end,
 'requiredPersonnel',w.required_personnel,'assignedPersonnel',(select count(*) from public.work_order_assignments a where a.work_order_id=w.id and a.status not in ('cancelled','returned')),
 'crew',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'status',a.status,'start',a.projected_start_at,'end',a.projected_end_at) order by p.full_name,p.id) from public.work_order_assignments a join public.personnel p on p.tenant_id=a.tenant_id and p.id=a.personnel_id where a.work_order_id=w.id and a.status not in ('cancelled','returned')),'[]'),
 'archived',w.archive_at is not null,'canEdit',w.actual_start_at is null and w.status in ('planned','released','seen','travelling') and w.archive_at is null,
 'canDelete',w.planning_state='draft' and w.published_at is null and w.request_id is null and w.quote_id is null and not exists(select 1 from public.work_order_assignments a where a.work_order_id=w.id) and not exists(select 1 from public.report_entries r where r.work_order_id=w.id),
 'category',case when w.status in ('invoice_ready','invoiced','approved','cancelled') then 'completed' when w.status in ('completed','returned','under_review','correction_required') then 'handling' when w.status in ('in_progress','travelling') then 'running' when w.projected_start_at is not null and (select count(*) from public.work_order_assignments a where a.work_order_id=w.id and a.status not in ('cancelled','returned'))>=w.required_personnel then 'planned' else 'unassigned' end)
 from public.work_orders w join public.customers c on c.tenant_id=w.tenant_id and c.id=w.customer_id join public.objects o on o.tenant_id=w.tenant_id and o.id=w.object_id where w.id=target_order
$function$;

CREATE OR REPLACE FUNCTION private.work_order_scope_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare root public.work_order_tasks;src public.work_order_tasks;transfer public.work_order_scope_transfers;target public.work_orders;original public.work_orders;outgoing numeric;
begin
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||new.tenant_id::text,0));
 if tg_op='INSERT' then new.scope_root_task_id:=coalesce(new.scope_root_task_id,new.id);
 elsif (new.scope_root_task_id,new.withdrawn_quantity) is distinct from(old.scope_root_task_id,old.withdrawn_quantity) then
  raise exception 'De oorspronkelijke scope en ingetrokken hoeveelheid zijn niet rechtstreeks wijzigbaar' using errcode='23514';
 end if;
 select coalesce(sum(quantity),0) into outgoing from public.work_order_scope_transfers where tenant_id=new.tenant_id and source_task_id=new.id;
 if new.transferred_quantity<>outgoing then raise exception 'Scopeoverdracht vereist een gekoppelde, transactionele overdracht' using errcode='23514';end if;
 if tg_op='UPDATE' and (outgoing>0 or old.scope_root_task_id<>old.id)
 and (new.quantity,new.unit,new.unit_price_cents,new.vat_basis_points,new.task_revision_id,new.agreement_line_id,new.commercial_snapshot,new.is_extra_work,new.work_order_id)
 is distinct from (old.quantity,old.unit,old.unit_price_cents,old.vat_basis_points,old.task_revision_id,old.agreement_line_id,old.commercial_snapshot,old.is_extra_work,old.work_order_id) then
 raise exception 'Een overgedragen scope behoudt de oorspronkelijke hoeveelheid en financiële bron' using errcode='23514';end if;
 if coalesce(new.executed_quantity,case when new.completed_at is not null then new.quantity else 0 end)+new.transferred_quantity+new.withdrawn_quantity>new.quantity then
  raise exception 'Uitvoering en overdracht overschrijden de beschikbare hoeveelheid' using errcode='23514';end if;
 if new.scope_root_task_id<>new.id then
  select * into root from public.work_order_tasks where tenant_id=new.tenant_id and id=new.scope_root_task_id;
  select * into transfer from public.work_order_scope_transfers where tenant_id=new.tenant_id and target_task_id=new.id;
  select * into src from public.work_order_tasks where tenant_id=new.tenant_id and id=transfer.source_task_id;
  select * into target from public.work_orders where tenant_id=new.tenant_id and id=new.work_order_id;
  select * into original from public.work_orders where tenant_id=new.tenant_id and id=root.work_order_id;
  if root.id is null or transfer.id is null or src.scope_root_task_id<>root.id or transfer.target_order_id<>new.work_order_id
   or target.customer_id<>original.customer_id or target.object_id<>original.object_id
   or new.quantity<>transfer.quantity or new.unit_price_cents<>root.unit_price_cents or new.vat_basis_points<>root.vat_basis_points
   or new.task_revision_id is distinct from root.task_revision_id or new.commercial_snapshot is distinct from root.commercial_snapshot
   or new.agreement_line_id is distinct from root.agreement_line_id or new.is_extra_work<>root.is_extra_work
  then raise exception 'Overgedragen werkzaamheden moeten de oorspronkelijke scope en afspraak behouden' using errcode='23514';end if;
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.work_order_signature_immutable()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin raise exception 'Ontvangen ondertekening is onveranderlijk' using errcode='23514';end $function$;

CREATE OR REPLACE FUNCTION private.work_order_signature_policy (
  w public.work_orders
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare mode text;source text;object_mode text;settings jsonb;employee boolean;legacy_default boolean;
begin
 if w.signature_policy_snapshot is not null then return w.signature_policy_snapshot;end if;
 select s.settings->'workOrders',s.signature_required_default into settings,legacy_default from public.tenant_settings s where tenant_id=w.tenant_id;
 select o.signature_mode into object_mode from public.objects o where tenant_id=w.tenant_id and id=w.object_id;
 mode:=nullif(to_jsonb(w)->>'signature_mode','inherit');source:='work_order';
 if mode is null and object_mode<>'inherit' then mode:=object_mode;source:='object';end if;
 if mode is null then mode:=nullif(w.template_snapshot->'definition'->>'signatureMode','inherit');source:='template';end if;
 if mode is null then mode:=coalesce(settings->>'signatureMode',case when legacy_default then 'required' else 'none' end);source:='tenant';end if;
 if mode not in ('none','optional','required') then raise exception 'Ongeldige ondertekeninstelling' using errcode='23514';end if;
 employee:=coalesce((settings->>'employeeSignatureRequired')::boolean,false) or coalesce((w.template_snapshot->'definition'->>'employeeSignatureRequired')::boolean,false) or w.employee_signature_required;
 return jsonb_build_object('mode',mode,'source',source,'employeeRequired',employee);
end $function$;

CREATE OR REPLACE FUNCTION private.work_order_task_assignee_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 if tg_op='UPDATE' and new.assigned_personnel_id is not distinct from old.assigned_personnel_id then return new;end if;
 if new.assigned_personnel_id is null then return new;end if;
 if not exists(select 1 from public.work_order_assignments a join public.personnel p on p.id=a.personnel_id and p.tenant_id=a.tenant_id
 where a.tenant_id=new.tenant_id and a.work_order_id=new.work_order_id and a.personnel_id=new.assigned_personnel_id and a.status not in ('cancelled','returned') and p.status='active') then
 raise exception 'Kies een medewerker uit de actuele werkbonbezetting' using errcode='23514';end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.work_order_task_contribution()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 if new.execution_version<>old.execution_version and auth.uid() is not null
 and (new.executed_quantity,new.execution_state,new.completed_at,new.completion_note) is distinct from (old.executed_quantity,old.execution_state,old.completed_at,old.completion_note) then
  insert into public.work_order_task_contributions(tenant_id,task_id,actor_id,execution_version,from_quantity,to_quantity,result,note)
  values(new.tenant_id,new.id,auth.uid(),new.execution_version,coalesce(old.executed_quantity,0),coalesce(new.executed_quantity,0),new.execution_state,new.completion_note);
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.work_order_template_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 if tg_op='DELETE' then raise exception 'Templateversies worden bewaard; archiveer de template' using errcode='23514';end if;
 if tg_op='UPDATE' and old.state<>'draft' and (new.definition,new.version,new.template_id,new.tenant_id,new.created_by,new.created_at) is distinct from (old.definition,old.version,old.template_id,old.tenant_id,old.created_by,old.created_at) then
 raise exception 'Een gepubliceerde templateversie is onveranderlijk. Maak een nieuwe versie.' using errcode='23514';end if;
 if tg_op='UPDATE' and old.state<>'draft' and new.state='draft' then raise exception 'Een gepubliceerde versie kan geen concept worden' using errcode='23514';end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.work_order_transition_legacy (
  target_work_order_id uuid,
  action               text,
  expected_version     bigint,
  idempotency_key      text,
  reason_code          text   DEFAULT NULL::text,
  note                 text   DEFAULT NULL::text
)
  RETURNS public.work_orders
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

  if action in ('start','complete') and shift_delta <> interval '0 seconds' then
    begin
    update public.work_order_assignments future
    set projected_start_at = future.projected_start_at + shift_delta,
        projected_end_at = future.projected_end_at + shift_delta
    where future.tenant_id = target.tenant_id
      and future.personnel_id = assignment.personnel_id
      and future.id <> assignment.id
      and future.status in ('planned','released')
      and future.projected_start_at >= old_projected_end
      and not exists(select 1 from public.work_order_assignments crew where crew.tenant_id=future.tenant_id and crew.work_order_id=future.work_order_id and crew.id<>future.id and crew.status not in ('cancelled','returned'));

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
      and future.status in ('planned','released')
      and not exists(select 1 from public.work_order_assignments crew where crew.tenant_id=future.tenant_id and crew.work_order_id=future.work_order_id and crew.id<>future.id and crew.status not in ('cancelled','returned'));
    exception when check_violation or exclusion_violation then
      -- Reality must be recordable even when a derived shift cannot be planned.
      update public.work_orders set attention_reason='planning_review_required' where id=target.id;
    end;
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
$function$;

CREATE OR REPLACE FUNCTION public.add_extra_work (
  target_work_order_id      uuid,
  target_extra_work_rule_id uuid,
  idempotency_key           text
)
  RETURNS public.work_order_tasks
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
    if not private.commercial_access(target_order.tenant_id) then result.unit_price_cents:=0;result.vat_basis_points:=0;result.commercial_snapshot:='{}';end if; return result;
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
  if not private.commercial_access(target_order.tenant_id) then result.unit_price_cents:=0;result.vat_basis_points:=0;result.commercial_snapshot:='{}';end if; return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.answer_work_order_checklist (
  target_tenant uuid,
  input         jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare c public.work_order_checklists;w public.work_orders;a public.work_order_checklist_answers;q jsonb;prior private.work_order_commands;mid uuid:=(input->>'mutationId')::uuid;hash text;r jsonb;val jsonb:=input->'value';na boolean:=coalesce((input->>'notApplicable')::boolean,false);attachment uuid:=nullif(input->>'attachmentId','')::uuid;
begin
 if not private.object_session_active() then raise exception 'Een actieve sessie is vereist' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 select * into c from public.work_order_checklists where tenant_id=target_tenant and id=(input->>'checklistId')::uuid;
 select * into w from public.work_orders where tenant_id=target_tenant and id=c.work_order_id for update;
 if w.id is null or not(private.planning_access(target_tenant) or (private.has_role(target_tenant,array['staff']::public.app_role[]) and exists(select 1 from public.work_order_assignments crew join public.personnel p on p.tenant_id=crew.tenant_id and p.id=crew.personnel_id join public.dispatches d on d.assignment_id=crew.id and d.revoked_at is null where crew.work_order_id=w.id and p.user_id=auth.uid() and crew.status not in ('cancelled','returned')))) then raise exception 'Geen toegang tot deze checklist' using errcode='42501';end if;
 if w.status not in ('in_progress','completed','correction_required') or coalesce(to_jsonb(w)->>'report_state','draft') in ('waiting_signature','review','approved') then raise exception 'Antwoorden horen bij de actieve uitvoering; een ingediend rapport blijft bewaard' using errcode='23514';end if;
 if mid is null then raise exception 'Een herhaalsleutel is vereist' using errcode='23514';end if;
 hash:=encode(extensions.digest(input::text,'sha256'),'hex');select * into prior from private.work_order_commands where id=mid;
 if found then if (prior.tenant_id,prior.actor_id,prior.command,prior.payload_hash) is distinct from(target_tenant,auth.uid(),'answer',hash) then raise exception 'Ongeldige herhaalsleutel' using errcode='23514';end if;return prior.result;end if;
 select x into q from jsonb_array_elements(c.definition->'questions')x where x->>'id'=input->>'questionId';
 if q is null then raise exception 'Deze vraag bestaat niet in de checklistversie' using errcode='23514';end if;
 if na then if not coalesce((q->>'allowNA')::boolean,false) or length(btrim(coalesce(input->>'reason','')))<3 then raise exception 'Niet van toepassing vereist toestemming en een reden' using errcode='23514';end if;
 else
 if q->>'type' in ('check','boolean') and jsonb_typeof(val) is distinct from 'boolean' or q->>'type'='number' and jsonb_typeof(val) is distinct from 'number' or q->>'type' in ('text','choice') and jsonb_typeof(val) is distinct from 'string' then raise exception 'Het antwoord past niet bij deze vraag' using errcode='23514';end if;
 if q->>'type'='choice' and not((q->'options') ? (val#>>'{}')) then raise exception 'Kies een beschikbare antwoordoptie' using errcode='23514';end if;
 if length(val::text)>10000 then raise exception 'Het antwoord is te lang' using errcode='23514';end if;
 end if;
 if attachment is not null and not exists(select 1 from public.attachments x where x.tenant_id=target_tenant and x.id=attachment and x.work_order_id=w.id and x.deleted_at is null and x.mime_type in ('image/jpeg','image/png','image/webp')) then raise exception 'Kies een foto uit deze werkbon' using errcode='23514';end if;
 select * into a from public.work_order_checklist_answers where checklist_id=c.id and question_id=q->>'id' for update;
 if coalesce(a.version,0)<>coalesce((input->>'version')::bigint,0) then raise exception 'Dit antwoord is intussen gewijzigd. Bekijk de actuele waarde.' using errcode='40001';end if;
 insert into public.work_order_checklist_answers(tenant_id,checklist_id,question_id,value,not_applicable,reason,attachment_id,updated_by) values(target_tenant,c.id,q->>'id',val,na,coalesce(input->>'reason',''),attachment,auth.uid())
 on conflict(tenant_id,checklist_id,question_id) do update set value=excluded.value,not_applicable=excluded.not_applicable,reason=excluded.reason,attachment_id=excluded.attachment_id,updated_by=excluded.updated_by,version=public.work_order_checklist_answers.version+1,updated_at=clock_timestamp() returning * into a;
 update public.work_orders set version=version+1 where id=w.id;
 r:=jsonb_build_object('ok',true,'id',a.id,'version',a.version);
 insert into private.work_order_commands values(mid,target_tenant,auth.uid(),'answer',hash,r,clock_timestamp());
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(target_tenant,auth.uid(),'work_order.checklist_answer','work_order',w.id,jsonb_build_object('checklistId',c.id,'questionId',q->>'id','answerVersion',a.version));
 return r;
end $function$;

REVOKE ALL ON FUNCTION "public"."answer_work_order_checklist"(uuid, jsonb) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.assign_work_order_task (
  target_tenant    uuid,
  target_task      uuid,
  expected_version bigint,
  personnel        uuid   DEFAULT NULL::uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare task public.work_order_tasks;work public.work_orders;
begin
 if not private.work_order_lineage_authorized(target_tenant) then raise exception 'Geen actuele beheertoegang' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 select * into task from public.work_order_tasks where tenant_id=target_tenant and id=target_task for update;
 select * into work from public.work_orders where tenant_id=target_tenant and id=task.work_order_id for update;
 if task.id is null or task.execution_version<>expected_version then raise exception 'De taak is gewijzigd' using errcode='40001';end if;
 if work.archive_at is not null or work.status in ('approved','invoice_ready','invoiced','cancelled') or work.report_state in ('waiting_signature','review','approved') then raise exception 'Deze taak kan niet meer worden verdeeld' using errcode='23514';end if;
 update public.work_order_tasks set assigned_personnel_id=personnel,execution_version=execution_version+1 where id=task.id;
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(target_tenant,auth.uid(),'work_order.task_assigned','work_order_task',task.id,jsonb_build_object('personnel_id',personnel));
end $function$;

REVOKE ALL ON FUNCTION "public"."assign_work_order_task"(uuid, uuid, bigint, uuid) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.change_work_order_signature_policy (
  target_order      uuid,
  expected_version  bigint,
  mode              text,
  employee_required boolean,
  reason            text,
  mutation_id       uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare w public.work_orders;candidate public.work_orders;before_policy jsonb;after_policy jsonb;prior private.work_order_policy_changes;
begin
 select * into w from public.work_orders where id=target_order for update;
 if w.id is null or not private.object_session_active() or not private.has_role(w.tenant_id,array['tenant_admin','management']::public.app_role[]) or not private.service_enabled(w.tenant_id,'rapportage') then raise exception 'Geen bevoegdheid om de ondertekenafspraak te wijzigen' using errcode='42501';end if;
 select * into prior from private.work_order_policy_changes where id=mutation_id;
 if found then
  if (prior.work_order_id,prior.actor_id,prior.mode,prior.employee_required,prior.reason) is distinct from (w.id,auth.uid(),mode,employee_required,btrim(reason)) then raise exception 'Herhaalsleutel is al voor een andere wijziging gebruikt' using errcode='23514';end if;return;
 end if;
 if w.version is distinct from expected_version then raise exception 'De werkbon is gewijzigd; herlaad voor aanpassen' using errcode='40001';end if;
 if mode is null or mode not in ('inherit','none','optional','required') or employee_required is null or reason is null or length(btrim(reason)) not between 5 and 2000 then raise exception 'Kies een ondertekenregel en motiveer de wijziging' using errcode='23514';end if;
 if w.status in ('cancelled','approved','invoice_ready','invoiced') or w.report_state not in ('draft','correction') then raise exception 'Vraag eerst rapportcorrectie aan; goedgekeurde afspraken blijven bewaard' using errcode='23514';end if;
 before_policy:=private.work_order_signature_policy(w);candidate:=w;candidate.signature_mode:=mode;candidate.employee_signature_required:=employee_required;candidate.signature_policy_snapshot:=null;
 after_policy:=private.work_order_signature_policy(candidate);
 -- An existing report obligation may not be lowered through the policy UI.
 -- Its independently authorized waiver remains the explicit exception path.
 if exists(select 1 from public.work_order_report_versions r where r.tenant_id=w.tenant_id and r.work_order_id=w.id)
 and ((before_policy->>'mode'='required' and after_policy->>'mode'<>'required') or (coalesce((before_policy->>'employeeRequired')::boolean,false) and not coalesce((after_policy->>'employeeRequired')::boolean,false))) then
  raise exception 'Een bestaande rapportplicht kan niet worden verlaagd; gebruik een afzonderlijk bevoegde vrijstelling voor klantondertekening' using errcode='23514';end if;
 insert into private.work_order_policy_changes(id,tenant_id,work_order_id,actor_id,transaction_id,old_policy,new_policy,mode,employee_required,reason)
 values(mutation_id,w.tenant_id,w.id,auth.uid(),pg_current_xact_id(),w.signature_policy_snapshot,after_policy,mode,employee_required,btrim(reason));
 update public.work_orders set signature_mode=mode,employee_signature_required=employee_required,signature_policy_snapshot=after_policy,signature_required=after_policy->>'mode'='required' where id=w.id;
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,before_data,after_data) values(w.tenant_id,auth.uid(),'work_order.signature_policy_changed','work_order',w.id,before_policy,jsonb_build_object('policy',after_policy,'reason',btrim(reason),'mutationId',mutation_id));
end $function$;

REVOKE ALL ON FUNCTION "public"."change_work_order_signature_policy"(uuid, bigint, text, boolean, text, uuid) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.complete_work_order_task (
  target_task_id  uuid,
  completed       boolean,
  completion_note text    DEFAULT NULL::text
)
  RETURNS public.work_order_tasks
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare task public.work_order_tasks;work public.work_orders;result public.work_order_tasks;own_quantity numeric;
begin
 select * into task from public.work_order_tasks where id=target_task_id;
 if task.id is null then raise exception 'Taak niet beschikbaar' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||task.tenant_id::text,0));
 select * into task from public.work_order_tasks where id=task.id for update;
 select * into work from public.work_orders where tenant_id=task.tenant_id and id=task.work_order_id for update;
 if not private.object_visit_access(task.tenant_id,work.object_id,work.id) or not private.is_work_order_assignee(task.tenant_id,task.work_order_id) then raise exception 'Actuele werkbontoewijzing vereist' using errcode='42501';end if;
 if work.status not in ('in_progress','correction_required') then raise exception 'Taken wijzigen kan alleen tijdens uitvoering of correctie' using errcode='23514';end if;
 if completed is null then raise exception 'Kies een uitvoeringsresultaat' using errcode='23514';end if;
 if completed and task.completed_at is not null then result:=task;
 else
  own_quantity:=task.quantity-task.transferred_quantity-task.withdrawn_quantity;
  update public.work_order_tasks set completed_at=case when completed then clock_timestamp() else null end,
   executed_quantity=case when completed then own_quantity else null end,execution_state=case when completed then 'completed' else 'planned' end,
   completion_note=complete_work_order_task.completion_note where id=task.id returning * into result;
 end if;
 -- Preserve the legacy composite return shape without exposing prices to staff.
 if not private.commercial_access(task.tenant_id) then result.unit_price_cents:=0;result.vat_basis_points:=0;result.commercial_snapshot:='{}';end if;
 return result;
end $function$;

CREATE OR REPLACE FUNCTION public.current_event_recipients (
  target_event uuid
)
  RETURNS TABLE (
    user_id uuid
  )
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select distinct m.user_id from public.outbox_events e
 join public.tenant_memberships m on m.tenant_id=e.tenant_id and m.status='active'
 join auth.users u on u.id=m.user_id and u.deleted_at is null and (u.banned_until is null or u.banned_until<clock_timestamp())
 join public.tenants t on t.id=e.tenant_id and t.status='active'
 where e.id=target_event and (
 (e.event_type='announcement.published' and 'staff'=any(m.roles)) or
 (e.event_type='work_order.exception' and m.roles&&array['tenant_admin','management','planner']::public.app_role[] and m.user_id=nullif(e.payload->>'owner_id','')::uuid and private.service_enabled(e.tenant_id,'planning') and exists(select 1 from public.work_orders w where w.id=e.aggregate_id and w.tenant_id=e.tenant_id and w.status<>'cancelled')) or
 (e.aggregate_type='work_order' and e.event_type<>'work_order.exception' and 'staff'=any(m.roles) and private.service_enabled(e.tenant_id,'personeel') and exists(
 select 1 from public.work_orders w join public.work_order_assignments a on a.tenant_id=w.tenant_id and a.work_order_id=w.id
 join public.personnel p on p.tenant_id=a.tenant_id and p.id=a.personnel_id and p.user_id=m.user_id and p.status='active'
 where w.id=e.aggregate_id and w.tenant_id=e.tenant_id and w.status<>'cancelled' and a.status not in ('cancelled','returned')
 and (nullif(e.payload->>'personnel_id','') is null or a.personnel_id=(e.payload->>'personnel_id')::uuid)
 and (e.event_type<>'work_order.report_submitted' or exists(select 1 from public.work_order_report_versions r where r.id=nullif(e.payload->>'report_id','')::uuid and r.work_order_id=w.id and r.version=w.report_version and r.state='waiting_signature'))
 and (e.event_type<>'work_order.reviewed' or e.payload->>'decision'<>'returned' or w.report_state='correction')
 and exists(select 1 from public.dispatches d where d.assignment_id=a.id and d.revoked_at is null)))
 );
$function$;

CREATE OR REPLACE FUNCTION public.customer_portal_documents (
  target_tenant uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 if not private.object_session_active() then raise exception 'Geen toegang' using errcode='42501';end if;
 return jsonb_build_object(
 'documents',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'title',d.title,'version',d.version,'category',d.category,'date',d.document_on,'validUntil',d.valid_until)) from public.customer_documents d where d.tenant_id=target_tenant and d.visibility='customer' and not d.archived and private.customer_portal_bound(target_tenant,d.customer_id)),'[]'),
 'reports',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'body',r.body,'at',r.created_at,'orderId',w.id,'number',w.work_order_number,'object',o.name)) from public.report_entries r join public.work_orders w on w.tenant_id=r.tenant_id and w.id=r.work_order_id join public.objects o on o.tenant_id=w.tenant_id and o.id=w.object_id where r.tenant_id=target_tenant and private.service_enabled(target_tenant,'rapportage') and r.customer_visible and r.deleted_at is null and w.status in ('approved','invoice_ready','invoiced') and exists(select 1 from public.object_customer_bindings b where b.tenant_id=target_tenant and b.object_id=o.id and b.user_id=auth.uid() and b.active)),'[]'),
 'workReports',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'version',r.version,'number',r.snapshot->>'number','object',r.snapshot->'object'->>'name','approvedAt',r.approved_at) order by r.approved_at desc,r.version desc) from public.work_order_report_versions r join public.work_orders w on w.tenant_id=r.tenant_id and w.id=r.work_order_id where r.tenant_id=target_tenant and r.state='approved' and private.service_enabled(target_tenant,'rapportage') and exists(select 1 from public.object_customer_bindings b where b.tenant_id=target_tenant and b.object_id=w.object_id and b.user_id=auth.uid() and b.active)),'[]'),
 'invoices',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'number',i.invoice_number,'date',i.issued_on,'due',i.due_on,'total',i.total_cents,'paid',i.paid_cents,'status',i.status,'pdf',i.pdf_storage_path is not null)) from public.invoices i where i.tenant_id=target_tenant and private.customer_invoice_access(target_tenant,i.id)),'[]'));
end $function$;

CREATE OR REPLACE FUNCTION public.expired_work_order_signature_uploads()
  RETURNS TABLE (
    id           uuid,
    storage_path text
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select i.id,i.storage_path from private.work_order_signature_intents i
 where i.consumed_at is null and i.created_at<clock_timestamp()-interval '24 hours'
 and not exists(select 1 from public.signatures s where s.id=i.id or s.storage_path=i.storage_path)
 and exists(select 1 from storage.objects o where o.bucket_id='signatures' and o.name=i.storage_path)
 order by i.created_at limit 100;
$function$;

REVOKE ALL ON FUNCTION "public"."expired_work_order_signature_uploads"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.finalize_work_order_signature (
  target_intent uuid,
  image_hash    text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare i private.work_order_signature_intents;w public.work_orders;r public.work_order_report_versions;sig public.signatures;
begin
 select * into i from private.work_order_signature_intents where id=target_intent for update;
 if i.id is null or not private.work_order_execution_actor(i.tenant_id,i.work_order_id,i.actor_id,i.session_id) then raise exception 'Ondertekenbevoegdheid vervallen' using errcode='42501';end if;
 select * into w from public.work_orders where tenant_id=i.tenant_id and id=i.work_order_id for update;
 select * into r from public.work_order_report_versions where tenant_id=i.tenant_id and id=i.report_id for update;
 if i.consumed_at is not null then select * into sig from public.signatures where id=i.id; if sig.sha256<>image_hash then raise exception 'De herhaalde afbeelding wijkt af' using errcode='23514';end if;return jsonb_build_object('id',sig.id,'state',r.state);end if;
 if r.version<>w.report_version or r.content_hash<>i.content_hash or r.state not in ('waiting_signature','review') or i.created_at<clock_timestamp()-interval '15 minutes' then raise exception 'Bekijk de actuele rapportversie opnieuw' using errcode='40001';end if;
 if image_hash!~'^[a-f0-9]{64}$' or not exists(select 1 from storage.objects so where so.bucket_id='signatures' and so.name=i.storage_path and so.metadata->>'mimetype'='image/png' and (so.metadata->>'size')::bigint between 1 and 2097152) then raise exception 'Ondertekeningbestand ontbreekt' using errcode='23514';end if;
 insert into public.signatures(id,tenant_id,work_order_id,captured_by,captured_by_name,signer_name,signer_capacity,storage_path,sha256,report_version,report_id,content_hash,signature_kind,channel)
 values(i.id,i.tenant_id,w.id,i.actor_id,(select p.full_name from public.personnel p where p.tenant_id=i.tenant_id and p.user_id=i.actor_id),i.signer_name,i.signer_capacity,i.storage_path,image_hash,r.version,r.id,r.content_hash,i.signature_kind,'personnel_app_on_site');
 update private.work_order_signature_intents set consumed_at=clock_timestamp() where id=i.id;
 if private.work_order_report_ready(r) then update public.work_order_report_versions set state='review' where id=r.id;update public.work_orders set report_state='review',attention_reason=null where id=w.id;end if;
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(w.tenant_id,i.actor_id,'report.signed','work_order',w.id,jsonb_build_object('report_id',r.id,'signature_id',i.id,'kind',i.signature_kind));
 return jsonb_build_object('id',i.id,'state',case when private.work_order_report_ready(r) then 'review' else 'waiting_signature' end);
end $function$;

REVOKE ALL ON FUNCTION "public"."finalize_work_order_signature"(uuid, text) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.get_planboard (
  target_tenant uuid,
  target_day    date,
  list_view     text    DEFAULT 'unassigned'::text,
  search_text   text    DEFAULT ''::text,
  status_filter text    DEFAULT ''::text,
  page_number   integer DEFAULT 1
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare tz text; ds timestamptz; de timestamptz; orders jsonb; board jsonb; people jsonb; availability_data jsonb; total integer; last_change jsonb;
begin
 if not private.planning_access(target_tenant) then raise exception 'Geen toegang tot planning' using errcode='42501';end if;
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
end $function$;

CREATE OR REPLACE FUNCTION public.get_planboard_order (
  target_tenant uuid,
  target_order  uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 if not private.planning_access(target_tenant) or not exists(select 1 from public.work_orders where tenant_id=target_tenant and id=target_order and archive_at is null and planning_state<>'draft') then raise exception 'Werkbon niet beschikbaar' using errcode='42501';end if;
 return private.planboard_row(target_order);
end $function$;

CREATE OR REPLACE FUNCTION public.mutate_work_order (
  target_tenant uuid,
  input         jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare w public.work_orders;prior private.work_order_commands;mid uuid:=(input->>'mutationId')::uuid;hash text;action text:=input->>'action';r jsonb;a record;
begin
 if not private.object_session_active() or not private.planning_access(target_tenant) then raise exception 'Geen toegang tot werkbonbeheer' using errcode='42501';end if;
 if mid is null or action is null or action not in ('publish','archive','cancel','delete') then raise exception 'Ongeldige werkbonactie' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 hash:=encode(extensions.digest(input::text,'sha256'),'hex');select * into prior from private.work_order_commands where id=mid;
 if found then if (prior.tenant_id,prior.actor_id,prior.command,prior.payload_hash) is distinct from (target_tenant,auth.uid(),action,hash) then raise exception 'Ongeldige herhaalsleutel' using errcode='23514';end if;return prior.result;end if;
 select * into w from public.work_orders where tenant_id=target_tenant and id=(input->>'orderId')::uuid for update;
 if not found then raise exception 'Werkbon niet beschikbaar' using errcode='42501';end if;
 if w.version is distinct from (input->>'version')::bigint then raise exception 'De werkbon is intussen gewijzigd' using errcode='40001';end if;
 if w.archive_at is not null and action<>'archive' then raise exception 'Een gearchiveerde werkbon is alleen leesbaar' using errcode='23514';end if;
 if action='publish' then
  if w.status not in ('planned','released') or w.projected_start_at is null or not exists(select 1 from public.work_order_tasks where work_order_id=w.id) or not exists(select 1 from public.work_order_assignments where work_order_id=w.id and status not in ('cancelled','returned')) then raise exception 'Kies taken, een datum en minimaal één medewerker vóór publicatie' using errcode='23514';end if;
  update public.work_orders set published_at=coalesce(published_at,clock_timestamp()),planning_state='final' where id=w.id;
  for a in select * from public.work_order_assignments where work_order_id=w.id and status='planned' loop
    select * into w from public.work_orders where id=w.id;
    perform public.dispatch_work_order(w.id,a.personnel_id,w.version,'publish:'||mid||':'||a.id);
  end loop;
 elsif action='archive' then update public.work_orders set archive_at=clock_timestamp() where id=w.id;
 elsif action='cancel' then
  if length(btrim(coalesce(input->>'reason','')))<3 then raise exception 'Vul de reden van annulering in' using errcode='23514';end if;
  if w.actual_start_at is not null or w.status in ('approved','invoice_ready','invoiced','under_review','completed') then raise exception 'Een uitgevoerde of beoordeelde bon kan niet worden geannuleerd' using errcode='23514';end if;
  update public.dispatches set revoked_at=clock_timestamp() where work_order_id=w.id and revoked_at is null;
  update public.work_order_assignments set status='cancelled' where work_order_id=w.id and status not in ('completed','returned','cancelled');
  update public.work_orders set status='cancelled',attention_reason=btrim(input->>'reason') where id=w.id;
 elsif action='delete' then
  if not (private.work_order_row(w.id,false)->>'canDelete')::boolean or exists(select 1 from public.invoice_lines where work_order_id=w.id) or exists(select 1 from public.attachments where work_order_id=w.id) then raise exception 'Alleen een ongebruikt concept kan worden verwijderd; archiveer deze bon' using errcode='23514';end if;
  delete from public.work_orders where id=w.id;
 end if;
 r:=jsonb_build_object('ok',true,'id',w.id,'version',coalesce((select version from public.work_orders where id=w.id),w.version));
 insert into private.work_order_commands values(mid,target_tenant,auth.uid(),action,hash,r,clock_timestamp());
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(target_tenant,auth.uid(),'work_order.'||action,'work_order',w.id,jsonb_build_object('reason',input->>'reason'));
 return r;
end $function$;

REVOKE ALL ON FUNCTION "public"."mutate_work_order"(uuid, jsonb) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.object_visit_context (
  target_tenant uuid,
  target_object uuid,
  target_order  uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v jsonb;
begin
 v:=private.object_visit_projection(target_tenant,target_object,target_order);
 if not(v->>'manager')::boolean then v:=jsonb_set(v,'{requests}',coalesce((select jsonb_agg(r-'review_note') from jsonb_array_elements(v->'requests') r),'[]'));end if;
 if not(v->>'customer')::boolean and not private.has_role(target_tenant,array['tenant_admin','management','finance']::public.app_role[]) then
 v:=jsonb_set(v,'{requests}',coalesce((select jsonb_agg(jsonb_set(r,'{proposals}',coalesce((select jsonb_agg(p-array['price_cents','vat_basis_points','total_cents']) from jsonb_array_elements(coalesce(r->'proposals','[]'))p),'[]'))) from jsonb_array_elements(v->'requests')r),'[]'));
 end if;return v;
end $function$;

CREATE OR REPLACE FUNCTION public.prepare_work_order_signature (
  target_work_order_id uuid,
  target_report_id     uuid,
  expected_hash        text,
  signer_name          text,
  signer_capacity      text,
  signature_kind       text,
  idempotency_key      uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare w public.work_orders;r public.work_order_report_versions;i private.work_order_signature_intents;s uuid;
begin
 select * into w from public.work_orders where id=target_work_order_id;s:=nullif(auth.jwt()->>'session_id','')::uuid;
 if not private.work_order_execution_actor(w.tenant_id,w.id,auth.uid(),s) then raise exception 'Vastleggen vereist personeelsuitvoering en actuele toewijzing' using errcode='42501';end if;
 select * into w from public.work_orders where id=w.id for update;select * into r from public.work_order_report_versions where tenant_id=w.tenant_id and id=target_report_id and work_order_id=w.id;
 if r.id is null or r.version<>w.report_version or r.content_hash<>expected_hash or r.state not in ('waiting_signature','review') then raise exception 'Bekijk eerst de actuele rapportversie opnieuw' using errcode='40001';end if;
 if signature_kind not in ('customer','employee') or (signature_kind='customer' and r.signature_policy->>'mode'='none') or length(btrim(signer_name)) not between 2 and 120 or length(btrim(signer_capacity)) not between 2 and 120 then raise exception 'Vul naam en hoedanigheid in' using errcode='23514';end if;
 select * into i from private.work_order_signature_intents where id=idempotency_key;
 if found then
 if (i.actor_id,i.session_id,i.report_id,i.content_hash,i.signer_name,i.signer_capacity,i.signature_kind) is distinct from (auth.uid(),s,r.id,expected_hash,btrim(signer_name),btrim(signer_capacity),signature_kind) then raise exception 'Ongeldige herhaalsleutel' using errcode='23514';end if;
 else insert into private.work_order_signature_intents(id,tenant_id,work_order_id,report_id,actor_id,session_id,content_hash,signer_name,signer_capacity,signature_kind,storage_path)
 values(idempotency_key,w.tenant_id,w.id,r.id,auth.uid(),s,expected_hash,btrim(signer_name),btrim(signer_capacity),signature_kind,w.tenant_id||'/'||w.id||'/'||idempotency_key||'.png') returning * into i;end if;
 return jsonb_build_object('id',i.id,'path',i.storage_path,'consumed',i.consumed_at is not null);
end $function$;

REVOKE ALL ON FUNCTION "public"."prepare_work_order_signature"(uuid, uuid, text, text, text, text, uuid) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.record_task_execution (
  target_tenant    uuid,
  target_task      uuid,
  expected_version bigint,
  result           text,
  actual_quantity  numeric,
  reason           text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare task public.work_order_tasks;work public.work_orders;own_quantity numeric;
begin
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 select * into task from public.work_order_tasks where tenant_id=target_tenant and id=target_task for update;
 select * into work from public.work_orders where tenant_id=target_tenant and id=task.work_order_id for update;
 if task.id is null or not private.object_visit_access(target_tenant,work.object_id,work.id) or not(private.object_manage(target_tenant) or private.is_work_order_assignee(target_tenant,work.id)) then raise exception 'Geen actuele uitvoeringstoegang' using errcode='42501';end if;
 if task.execution_version<>expected_version then raise exception 'De uitvoering is gewijzigd. Vernieuw de werkbon.' using errcode='40001';end if;
 own_quantity:=task.quantity-task.transferred_quantity-task.withdrawn_quantity;
 if work.status not in ('in_progress','correction_required') or result not in ('in_progress','completed','partial','not_done','not_applicable') or actual_quantity is null or actual_quantity<0 or actual_quantity>own_quantity
  or(result='completed' and actual_quantity<>own_quantity) or(result in ('not_done','not_applicable') and actual_quantity<>0)
  or(result='partial' and(actual_quantity<=0 or actual_quantity>=own_quantity))
  or(result not in ('completed','in_progress') and length(btrim(coalesce(reason,'')))<5)
 then raise exception 'Controleer de eigen resterende hoeveelheid, uitvoeringsstatus en toelichting' using errcode='23514';end if;
 update public.work_order_tasks set executed_quantity=actual_quantity,execution_state=result,completed_at=case when result='in_progress' then null else clock_timestamp() end,completion_note=reason where id=task.id;
end $function$;

CREATE OR REPLACE FUNCTION public.review_work_order (
  target_work_order_id uuid,
  decision             text,
  reason               text DEFAULT NULL::text
)
  RETURNS public.work_orders
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare r uuid;
begin
 select v.id into r from public.work_order_report_versions v join public.work_orders w on w.id=v.work_order_id and w.tenant_id=v.tenant_id where w.id=target_work_order_id and v.version=w.report_version;
 if r is null then raise exception 'Laat eerst de actuele rapportversie in de personeelsapp vastleggen' using errcode='23514';end if;
 return public.review_work_order_report(target_work_order_id,r,decision,reason);
end $function$;

CREATE OR REPLACE FUNCTION public.review_work_order_report (
  target_work_order_id uuid,
  target_report_id     uuid,
  decision             text,
  reason               text DEFAULT NULL::text
)
  RETURNS public.work_orders
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare w public.work_orders;r public.work_order_report_versions;result public.work_orders;
begin
 select * into w from public.work_orders where id=target_work_order_id;
 if not private.object_session_active() or not private.has_role(w.tenant_id,array['tenant_admin','management','finance']::public.app_role[]) then raise exception 'Rapportcontrolerecht vereist' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||w.tenant_id::text,0));select * into w from public.work_orders where id=w.id for update;
 select * into r from public.work_order_report_versions where tenant_id=w.tenant_id and work_order_id=w.id and id=target_report_id for update;
 if r.id is null or r.version<>w.report_version or r.state not in ('waiting_signature','review','correction') then raise exception 'Rapportversie is gewijzigd of reeds gecontroleerd' using errcode='40001';end if;
 if decision='approved' then
  perform private.validate_work_order_report(w);
  if not private.work_order_report_ready(r) or r.state<>'review' then raise exception 'Een geldige ondertekening of geautoriseerde vrijstelling ontbreekt' using errcode='23514';end if;
  update public.work_order_report_versions set state='approved',approved_at=clock_timestamp(),approved_by=auth.uid() where id=r.id;
 elsif decision='returned' and length(btrim(coalesce(reason,'')))>=3 then
  update public.work_order_report_versions set state='correction' where id=r.id;
 else raise exception 'Kies goedkeuren of een correctie met reden' using errcode='23514';end if;
 result:=private.work_order_review_legacy(w.id,decision,reason);
 update public.work_orders set report_state=case when decision='approved' then 'approved' else 'correction' end where id=w.id returning * into result;
 return result;
end $function$;

REVOKE ALL ON FUNCTION "public"."review_work_order_report"(uuid, uuid, text, text) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.save_work_order (
  target_tenant uuid,
  input         jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare w public.work_orders;old_w public.work_orders;prior private.work_order_commands;mid uuid:=(input->>'mutationId')::uuid;oid uuid:=(input->>'id')::uuid;hash text;
 item jsonb;r jsonb;planning jsonb;revision public.task_revisions;task public.task_catalog;contact public.customer_contacts;template public.work_order_template_versions;template_name text;
 task_json jsonb;old_tasks jsonb;new_tasks jsonb;new_checklists uuid[];old_checklists uuid[];cid uuid;slot uuid;warn text;
begin
 if not private.object_session_active() or not private.planning_access(target_tenant) then raise exception 'Geen toegang tot werkbonbeheer' using errcode='42501';end if;
 if mid is null or oid is null or input->>'version' is null or (input->>'version')::bigint<0 then raise exception 'Een wijzigingssleutel en versie zijn verplicht' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 hash:=encode(extensions.digest(input::text,'sha256'),'hex');select * into prior from private.work_order_commands where id=mid;
 if found then if (prior.tenant_id,prior.actor_id,prior.command,prior.payload_hash) is distinct from (target_tenant,auth.uid(),'save',hash) then raise exception 'Ongeldige herhaalsleutel' using errcode='23514';end if;return prior.result;end if;
 if not exists(select 1 from public.objects o join public.customers c on c.tenant_id=o.tenant_id and c.id=o.customer_id where o.tenant_id=target_tenant and o.id=(input->>'objectId')::uuid and c.id=(input->>'customerId')::uuid and o.active and c.status not in ('archived','inactive')) then raise exception 'Selecteer een object van de gekozen klant' using errcode='23514';end if;
 if length(btrim(coalesce(input->>'title','')))<2 or length(input->>'title')>180 or length(btrim(coalesce(input->>'discipline','')))=0 or length(input->>'description')>10000 or length(input->>'instructions')>4000 then raise exception 'Vul titel, dienst en geldige instructies in' using errcode='23514';end if;
 if coalesce(input->>'state','') not in ('draft','unassigned','tentative','final') or coalesce(input->>'signatureMode','') not in ('inherit','none','optional','required') or coalesce((input->>'requiredPersonnel')::int,0) not between 1 and 100 then raise exception 'Controleer planning en ondertekeninstellingen' using errcode='23514';end if;
 if nullif(input->>'plannerId','') is not null and not exists(select 1 from public.tenant_memberships m where m.tenant_id=target_tenant and m.user_id=(input->>'plannerId')::uuid and m.status='active' and m.roles&&array['tenant_admin','management','planner']::public.app_role[]) then raise exception 'Kies een actieve planner van deze organisatie' using errcode='23514';end if;
 if nullif(input->>'leadPersonnelId','') is not null and not exists(select 1 from jsonb_array_elements(input->'assignments')x where x->>'personnelId'=input->>'leadPersonnelId') then raise exception 'De uitvoeringsverantwoordelijke moet aan deze bon zijn toegewezen' using errcode='23514';end if;
 for item in select * from jsonb_array_elements(coalesce(input->'assignments','[]')) loop
 if not exists(select 1 from public.personnel p join public.tenant_memberships m on m.tenant_id=p.tenant_id and m.user_id=p.user_id where p.tenant_id=target_tenant and p.id=(item->>'personnelId')::uuid and p.status='active' and m.status='active' and 'staff'=any(m.roles)) then raise exception 'Een medewerker heeft geen actieve uitvoeringstoegang' using errcode='23514';end if;end loop;
 select * into old_w from public.work_orders where tenant_id=target_tenant and id=oid for update;
 if old_w.id is null and (input->>'version')::bigint<>0 or old_w.id is not null and old_w.version<>(input->>'version')::bigint then raise exception 'De werkbon is intussen gewijzigd. Laad de actuele versie.' using errcode='40001';end if;
 if old_w.id is not null and (old_w.actual_start_at is not null or old_w.status not in ('planned','released','seen','travelling') or old_w.archive_at is not null) then raise exception 'De uitvoering is gestart of afgesloten; de afgesproken scope blijft bewaard' using errcode='23514';end if;
 if old_w.id is not null and (old_w.customer_id<>(input->>'customerId')::uuid or old_w.object_id<>(input->>'objectId')::uuid) then raise exception 'Klant en object van een bestaande bon blijven vastgelegd. Maak zo nodig een nieuwe bon.' using errcode='23514';end if;
 if old_w.published_at is not null and (old_w.signature_mode,old_w.employee_signature_required) is distinct from (input->>'signatureMode',(input->>'employeeSignatureRequired')::boolean) then raise exception 'Wijzig een gepubliceerde ondertekenafspraak via het gemotiveerde beleid in het rapportdossier' using errcode='23514';end if;
 if (old_w.id is null and input->>'signatureMode'<>'inherit' or old_w.id is not null and old_w.signature_mode<>input->>'signatureMode') and not private.has_role(target_tenant,array['tenant_admin','management']::public.app_role[]) then raise exception 'Alleen beheer kan afwijken van het ondertekenbeleid' using errcode='42501';end if;
 if coalesce(old_w.employee_signature_required,false) is distinct from coalesce((input->>'employeeSignatureRequired')::boolean,false) and not private.has_role(target_tenant,array['tenant_admin','management']::public.app_role[]) then raise exception 'Alleen beheer wijzigt de medewerkershandtekening' using errcode='42501';end if;
 task_json:=coalesce(input->'tasks','[]');
 if old_w.id is not null and coalesce((input->>'preserveTasks')::boolean,false) then select coalesce(jsonb_agg(jsonb_build_object('revisionId',task_revision_id,'quantity',quantity,'instructions',instructions)),'[]') into task_json from public.work_order_tasks where work_order_id=oid;end if;
 if jsonb_array_length(task_json)>100 or (input->>'state'<>'draft' and jsonb_array_length(task_json)=0) then raise exception 'Kies minimaal één taak voor deze werkbon' using errcode='23514';end if;
 if nullif(input->>'templateRevisionId','') is not null then
 select v.* into template from public.work_order_template_versions v join public.work_order_templates t on t.id=v.template_id where v.tenant_id=target_tenant and v.id=(input->>'templateRevisionId')::uuid and t.kind='work_order' and v.state='published';
 if template.id is null then raise exception 'Kies een gepubliceerde werkbontemplate' using errcode='23514';end if;
 select name into template_name from public.work_order_templates where id=template.template_id;
 end if;
 select coalesce(array_agg(x::uuid order by x),'{}') into new_checklists from jsonb_array_elements_text(coalesce(input->'checklistRevisionIds','[]'))x;
 select coalesce(array_agg(template_revision_id order by template_revision_id),'{}') into old_checklists from public.work_order_checklists where work_order_id=oid;
 select coalesce(jsonb_agg(jsonb_build_object('revisionId',task_revision_id,'quantity',quantity,'instructions',instructions) order by task_revision_id,quantity,instructions),'[]') into old_tasks from public.work_order_tasks where work_order_id=oid;
 select coalesce(jsonb_agg(jsonb_build_object('revisionId',x->>'revisionId','quantity',(x->>'quantity')::numeric,'instructions',coalesce(x->>'instructions','')) order by x->>'revisionId',(x->>'quantity')::numeric,x->>'instructions'),'[]') into new_tasks from jsonb_array_elements(task_json)x;
 if old_w.id is not null and (old_tasks<>new_tasks or old_checklists<>new_checklists) and (old_w.published_at is not null or old_w.quote_id is not null or exists(select 1 from public.work_order_tasks t where t.work_order_id=oid and (t.execution_state<>'planned' or t.agreement_line_id is not null)) or exists(select 1 from public.work_order_checklist_answers a join public.work_order_checklists c on c.id=a.checklist_id where c.work_order_id=oid)) then raise exception 'De gepubliceerde of commerciële taken en antwoorden blijven behouden. Maak een gecontroleerde opvolgbon voor nieuwe scope.' using errcode='23514';end if;
 begin
 if nullif(input->>'windowStart','') is not null or nullif(input->>'windowEnd','') is not null then
  if (input->>'windowStart')::timestamptz is null or (input->>'windowEnd')::timestamptz<=(input->>'windowStart')::timestamptz then raise exception 'Controleer het klanttijdvenster' using errcode='23514';end if;
  if old_w.appointment_slot_id is not null then update public.appointment_slots set starts_at=(input->>'windowStart')::timestamptz,ends_at=(input->>'windowEnd')::timestamptz where id=old_w.appointment_slot_id;slot:=old_w.appointment_slot_id;
  else insert into public.appointment_slots(tenant_id,starts_at,ends_at,capacity,booked_count,status) values(target_tenant,(input->>'windowStart')::timestamptz,(input->>'windowEnd')::timestamptz,1,1,'full') returning id into slot;end if;
 else slot:=old_w.appointment_slot_id;end if;
 if old_w.id is null then
 insert into public.work_orders(id,tenant_id,work_order_number,customer_id,object_id,discipline,created_by,planning_state)
 values(oid,target_tenant,'WB-'||to_char(clock_timestamp(),'YYYY')||'-'||upper(substr(replace(oid::text,'-',''),1,12)),(input->>'customerId')::uuid,(input->>'objectId')::uuid,input->>'discipline',auth.uid(),input->>'state');
 end if;
 update public.work_orders set title=btrim(input->>'title'),description=coalesce(input->>'description',''),discipline=input->>'discipline',priority=coalesce(input->>'priority','normal'),labels=array(select jsonb_array_elements_text(coalesce(input->'labels','[]'))),
 planner_user_id=nullif(input->>'plannerId','')::uuid,lead_personnel_id=nullif(input->>'leadPersonnelId','')::uuid,signature_mode=input->>'signatureMode',employee_signature_required=coalesce((input->>'employeeSignatureRequired')::boolean,false),
 planning_state=input->>'state',deadline=nullif(input->>'deadline','')::date,budget_labor_minutes=nullif(input->>'durationMinutes','')::int,
 requested_date=nullif(input->>'requestedDate','')::date,customer_window_kind=input->>'windowKind',required_personnel=(input->>'requiredPersonnel')::int,day_instructions=coalesce(input->>'instructions',''),appointment_slot_id=slot,
 details=details||jsonb_build_object('customerReference',coalesce(input->>'customerReference',''),'purchaseOrder',coalesce(input->>'purchaseOrder',''),'costCenter',coalesce(input->>'costCenter',''),'locationLabel',coalesce(input->>'locationLabel','')),
 template_snapshot=case when template.id is not null then jsonb_build_object('id',template.id,'name',template_name,'version',template.version,'definition',template.definition) else template_snapshot end
 where id=oid returning * into w;
 if old_w.id is null or old_tasks<>new_tasks then
 delete from public.work_order_tasks where work_order_id=oid;
 for item in select * from jsonb_array_elements(task_json) loop
 select * into revision from public.task_revisions where tenant_id=target_tenant and id=(item->>'revisionId')::uuid;
 select * into task from public.task_catalog where tenant_id=target_tenant and id=revision.task_id and active;
 if task.id is null or not((item->>'quantity')::numeric>0) or (item->>'quantity')::numeric>100000 then raise exception 'Controleer taak en hoeveelheid' using errcode='23514';end if;
 insert into public.work_order_tasks(tenant_id,work_order_id,task_revision_id,task_code,task_name,duration_minutes,quantity,unit,unit_price_cents,vat_basis_points,instructions,added_by)
 values(target_tenant,oid,revision.id,task.code,task.name,revision.duration_minutes,(item->>'quantity')::numeric,revision.unit,revision.price_cents,revision.vat_basis_points,coalesce(item->>'instructions',''),auth.uid());
 end loop;end if;
 delete from public.work_order_contacts where work_order_id=oid;
 for item in select * from jsonb_array_elements(coalesce(input->'contacts','[]')) loop
 select * into contact from public.customer_contacts where tenant_id=target_tenant and customer_id=w.customer_id and id=(item->>'id')::uuid and active and (cardinality(object_ids)=0 or w.object_id=any(object_ids));
 if not found then raise exception 'Contactpersoon hoort niet bij deze klant of dit object' using errcode='23514';end if;
 insert into public.work_order_contacts(tenant_id,work_order_id,contact_id,roles,snapshot) values(target_tenant,oid,contact.id,array(select jsonb_array_elements_text(item->'roles')),jsonb_build_object('name',contact.full_name,'email',contact.email,'phone',contact.phone));
 end loop;
 if old_checklists<>new_checklists then
 delete from public.work_order_checklists where work_order_id=oid;
 foreach cid in array new_checklists loop
 insert into public.work_order_checklists(tenant_id,work_order_id,template_revision_id,name,definition)
 select target_tenant,oid,v.id,t.name,v.definition from public.work_order_template_versions v join public.work_order_templates t on t.id=v.template_id where v.tenant_id=target_tenant and v.id=cid and v.state='published' and t.kind='checklist';
 if not found then raise exception 'Kies een gepubliceerde checklistversie' using errcode='23514';end if;
 end loop;end if;
 if nullif(input->>'start','') is not null or old_w.projected_start_at is not null or jsonb_array_length(coalesce(input->'assignments','[]'))>0 then
 select * into w from public.work_orders where id=oid;
 planning:=public.change_work_order_planning(target_tenant,oid,w.version,gen_random_uuid(),nullif(input->>'start','')::timestamptz,nullif(input->>'end','')::timestamptz,coalesce(input->'assignments','[]'),array(select jsonb_array_elements_text(coalesce(input->'confirmedWarnings','[]'))));
 if not (planning->>'ok')::boolean then raise exception 'Planning vraagt bevestiging' using errcode='P0001',detail=planning::text;end if;
 end if;
 select * into w from public.work_orders where id=oid;
 r:=jsonb_build_object('ok',true,'id',w.id,'version',w.version);
 insert into private.work_order_commands values(mid,target_tenant,auth.uid(),'save',hash,r,clock_timestamp());
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(target_tenant,auth.uid(),case when old_w.id is null then 'work_order.created' else 'work_order.updated' end,'work_order',w.id,jsonb_build_object('version',w.version,'planningState',w.planning_state));
 return r;
 exception when sqlstate 'P0001' then get stacked diagnostics warn=pg_exception_detail;if warn is null or warn='' then raise;end if;return warn::jsonb||jsonb_build_object('error','Controleer en bevestig de planningswaarschuwingen.');
 end;
end $function$;

REVOKE ALL ON FUNCTION "public"."save_work_order"(uuid, jsonb) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.staff_workspace (
  target_tenant uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare ids uuid[];pid uuid;result jsonb;
begin
 if not private.object_session_active() or not private.has_role(target_tenant,array['staff']::public.app_role[]) or not private.service_enabled(target_tenant,'personeel') then raise exception 'Personeelstoegang vereist' using errcode='42501';end if;
 select p.id into pid from public.personnel p where p.tenant_id=target_tenant and p.user_id=auth.uid() and p.status='active';
 select coalesce(array_agg(w.id),'{}') into ids from public.work_orders w where w.tenant_id=target_tenant and private.is_work_order_assignee(target_tenant,w.id);
 select jsonb_build_object(
 'customers',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'tenant_id',c.tenant_id,'name',c.name)) from public.customers c where c.tenant_id=target_tenant and exists(select 1 from public.work_orders w where w.id=any(ids) and w.customer_id=c.id)),'[]'),
 'objects',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'tenant_id',o.tenant_id,'name',o.name,'address',o.address)) from public.objects o where o.tenant_id=target_tenant and exists(select 1 from public.work_orders w where w.id=any(ids) and w.object_id=o.id)),'[]'),
 'personnel',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'tenant_id',p.tenant_id,'user_id',p.user_id,'employee_number',p.employee_number,'full_name',p.full_name,'status',p.status)) from public.personnel p where p.tenant_id=target_tenant and p.id=pid),'[]'),
 'workOrders',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'tenant_id',w.tenant_id,'customer_id',w.customer_id,'object_id',w.object_id,'work_order_number',w.work_order_number,'discipline',w.discipline,'title',w.title,'status',w.status,'version',w.version,'report_version',w.report_version,'report_state',w.report_state,'signature_required',w.signature_required,'day_instructions',w.day_instructions,'projected_start_at',w.projected_start_at,'projected_end_at',w.projected_end_at,'actual_start_at',w.actual_start_at,'actual_end_at',w.actual_end_at)) from public.work_orders w where w.id=any(ids)),'[]'),
 'assignments',coalesce((select jsonb_agg(to_jsonb(a)-'qualification_snapshot') from public.work_order_assignments a where a.tenant_id=target_tenant and a.work_order_id=any(ids) and a.personnel_id=pid),'[]'),
 'workOrderTasks',coalesce((select jsonb_agg(to_jsonb(t)-array['unit_price_cents','vat_basis_points','commercial_snapshot','agreement_line_id']) from public.work_order_tasks t where t.tenant_id=target_tenant and t.work_order_id=any(ids)),'[]'),
 'tasks',coalesce((select jsonb_agg(to_jsonb(c)) from public.task_catalog c where c.tenant_id=target_tenant),'[]'),
 'taskRevisions',coalesce((select jsonb_agg(to_jsonb(r)-array['price_cents','vat_basis_points']) from public.task_revisions r where r.tenant_id=target_tenant),'[]'),
 'reports',coalesce((select jsonb_agg(to_jsonb(e)) from public.report_entries e where e.tenant_id=target_tenant and e.work_order_id=any(ids) and e.deleted_at is null),'[]'),
 'attachments',coalesce((select jsonb_agg(to_jsonb(a)-array['storage_path','storage_bucket']) from public.attachments a where a.tenant_id=target_tenant and a.work_order_id=any(ids) and a.deleted_at is null),'[]'),
 'signatures',coalesce((select jsonb_agg(to_jsonb(s)-array['storage_path']) from public.signatures s where s.tenant_id=target_tenant and s.work_order_id=any(ids)),'[]'),
 'timeEntries',coalesce((select jsonb_agg(to_jsonb(e)) from public.time_entries e where e.tenant_id=target_tenant and e.personnel_id=pid),'[]'),
 'announcements',coalesce((select jsonb_agg(to_jsonb(a)) from public.announcements a where a.tenant_id=target_tenant and a.published_at<=clock_timestamp() and a.withdrawn_at is null and 'staff'=any(a.audience_roles)),'[]'),
 'announcementReads',coalesce((select jsonb_agg(to_jsonb(a)) from public.announcement_reads a where a.tenant_id=target_tenant and a.user_id=auth.uid()),'[]'),
 'openShifts',coalesce((select jsonb_agg(to_jsonb(a)) from public.open_shifts a where a.tenant_id=target_tenant and a.status='open'),'[]'),
 'shiftInterests',coalesce((select jsonb_agg(to_jsonb(a)) from public.shift_interests a where a.tenant_id=target_tenant and a.personnel_id=pid),'[]'),
 'personnelDocuments',coalesce((select jsonb_agg(to_jsonb(a)-'storage_path') from public.personnel_documents a where a.tenant_id=target_tenant and a.personnel_id=pid and a.visible_to_employee),'[]'),
 'extraWorkRules',coalesce((select jsonb_agg(to_jsonb(a)) from public.extra_work_rules a where a.tenant_id=target_tenant and a.active),'[]'),
 'allowedExtraWork',coalesce((select jsonb_agg(to_jsonb(a)) from public.work_order_allowed_extra_work a where a.tenant_id=target_tenant and a.work_order_id=any(ids)),'[]'),
 'travelLegs',coalesce((select jsonb_agg(to_jsonb(l)-array['origin_address','destination_address']) from public.travel_legs l join public.work_order_assignments a on a.id=l.assignment_id and a.tenant_id=l.tenant_id where a.tenant_id=target_tenant and a.personnel_id=pid and a.work_order_id=any(ids)),'[]')) into result;
 return result;
end $function$;

REVOKE ALL ON FUNCTION "public"."staff_workspace"(uuid) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.submit_work_order_report (
  target_work_order_id uuid,
  expected_version     bigint,
  summary              text,
  idempotency_key      uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare w public.work_orders;r public.work_order_report_versions;body jsonb;policy jsonb;n integer;s uuid;
begin
 select * into w from public.work_orders where id=target_work_order_id;
 s:=nullif(auth.jwt()->>'session_id','')::uuid;
 if not private.work_order_execution_actor(w.tenant_id,w.id,auth.uid(),s) then raise exception 'Actuele personeelsuitvoering vereist' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||w.tenant_id::text,0));select * into w from public.work_orders where id=w.id for update;
 select * into r from public.work_order_report_versions where tenant_id=w.tenant_id and submission_key=idempotency_key;
 if found then if r.work_order_id<>w.id or r.created_by<>auth.uid() or r.snapshot->>'summary'<>btrim(summary) then raise exception 'Ongeldige herhaalsleutel' using errcode='23514';end if;return jsonb_build_object('id',r.id,'version',r.version,'state',r.state);end if;
 if w.version is distinct from expected_version then raise exception 'De werkbon is gewijzigd. Herlaad voor oplevering.' using errcode='40001';end if;
 if w.status in ('cancelled','invoice_ready','invoiced','approved') or length(btrim(summary)) not between 3 and 5000 then raise exception 'Controleer de rapportsamenvatting en actuele fase' using errcode='23514';end if;
 if w.lead_personnel_id is not null and not exists(select 1 from public.personnel p where p.id=w.lead_personnel_id and p.tenant_id=w.tenant_id and p.user_id=auth.uid()) then raise exception 'De uitvoeringsverantwoordelijke verzorgt de oplevering' using errcode='42501';end if;
 perform private.validate_work_order_report(w);
 select greatest(coalesce(max(version),0)+1,w.report_version) into n from public.work_order_report_versions where tenant_id=w.tenant_id and work_order_id=w.id;
 policy:=private.work_order_signature_policy(w);body:=private.work_order_report_snapshot(w,btrim(summary));
 update public.work_order_report_versions set state='superseded' where tenant_id=w.tenant_id and work_order_id=w.id and state in ('waiting_signature','review','correction');
 insert into public.work_order_report_versions(tenant_id,work_order_id,version,snapshot,content_hash,signature_policy,state,created_by,submission_key)
 values(w.tenant_id,w.id,n,body,encode(extensions.digest(body::text,'sha256'),'hex'),policy,case when policy->>'mode'='required' or (policy->>'employeeRequired')::boolean then 'waiting_signature' else 'review' end,auth.uid(),idempotency_key) returning * into r;
 update public.work_orders set report_version=n,report_state=r.state,signature_policy_snapshot=policy,status='completed',attention_reason=case when r.state='waiting_signature' then 'waiting_signature' else null end where id=w.id;
 perform private.enqueue_event(w.tenant_id,'work_order.report_submitted','work_order',w.id,jsonb_build_object('report_id',r.id,'state',r.state),'report-submitted:'||r.id);
 return jsonb_build_object('id',r.id,'version',r.version,'state',r.state);
end $function$;

REVOKE ALL ON FUNCTION "public"."submit_work_order_report"(uuid, bigint, text, uuid) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.transition_work_order (
  target_work_order_id uuid,
  action               text,
  expected_version     bigint,
  idempotency_key      text,
  reason_code          text   DEFAULT NULL::text,
  note                 text   DEFAULT NULL::text
)
  RETURNS public.work_orders
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
  update public.work_order_assignments set status='completed',paused_at=null,actual_end_at=now_at where id=a.id;
 end if;
 update public.work_orders set status=case when exists(select 1 from public.work_order_assignments aa where aa.tenant_id=w.tenant_id and aa.work_order_id=w.id and aa.status not in ('completed','returned','cancelled')) then 'in_progress'::public.work_order_status else 'completed'::public.work_order_status end,
 actual_end_at=case when not exists(select 1 from public.work_order_assignments aa where aa.tenant_id=w.tenant_id and aa.work_order_id=w.id and aa.status not in ('completed','returned','cancelled')) then now_at else null end where id=w.id returning * into result;
 insert into public.status_events(tenant_id,work_order_id,assignment_id,actor_user_id,previous_status,new_status,reason_code,note,idempotency_key) values(w.tenant_id,w.id,a.id,auth.uid(),w.status,result.status,action,note,idempotency_key);
 perform private.enqueue_event(w.tenant_id,'work_order.'||action,'work_order',w.id,jsonb_build_object('assignment_id',a.id),'transition:'||idempotency_key);
 -- Compatibility for existing clients: their final complete creates a report;
 -- the current app explicitly separates stop from submit.
 if action='complete' and result.status='completed' then
  perform public.submit_work_order_report(w.id,result.version,coalesce(nullif(note,''),'Uitgevoerde werkzaamheden volgens de vastgelegde taakresultaten'),gen_random_uuid());
  select * into result from public.work_orders where id=w.id;
 end if;
 return private.staff_work_order_result(result);
end $function$;

CREATE OR REPLACE FUNCTION public.waive_work_order_signature (
  target_report_id uuid,
  reason           text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare r public.work_order_report_versions;w public.work_orders;settings jsonb;
begin
 select * into r from public.work_order_report_versions where id=target_report_id;select * into w from public.work_orders where tenant_id=r.tenant_id and id=r.work_order_id for update;
 select s.settings->'workOrders' into settings from public.tenant_settings s where tenant_id=r.tenant_id;
 if not private.object_session_active() or not private.has_role(r.tenant_id,array['tenant_admin','management']::public.app_role[]) or not coalesce((settings->>'allowSignatureWaivers')::boolean,false) or not coalesce(settings->'signatureWaiverUsers','[]') ? auth.uid()::text then raise exception 'Geen afzonderlijke bevoegdheid voor ondertekenvrijstelling' using errcode='42501';end if;
 if r.version<>w.report_version or r.state<>'waiting_signature' or length(btrim(reason)) not between 5 and 1000 then raise exception 'Kies de actuele rapportversie en leg een reden vast' using errcode='23514';end if;
 insert into public.work_order_signature_waivers(tenant_id,report_id,reason,actor_id) values(r.tenant_id,r.id,btrim(reason),auth.uid());
 if private.work_order_report_ready(r) then update public.work_order_report_versions set state='review' where id=r.id;update public.work_orders set report_state='review',attention_reason=null where id=w.id;end if;
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(w.tenant_id,auth.uid(),'report.signature_waived','work_order',w.id,jsonb_build_object('report_id',r.id,'reason',btrim(reason)));
end $function$;

REVOKE ALL ON FUNCTION "public"."waive_work_order_signature"(uuid, text) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.work_order_communication (
  target_tenant uuid,
  input         jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare w public.work_orders;prior private.work_order_commands;mid uuid:=(input->>'mutationId')::uuid;hash text;result jsonb;a jsonb:=input->'attachment';body text:=btrim(coalesce(input->>'body',''));path text;
begin
 if not private.planning_access(target_tenant) or not private.object_session_active() then raise exception 'Geen toegang tot werkboncommunicatie' using errcode='42501';end if;
 select * into w from public.work_orders where tenant_id=target_tenant and id=(input->>'orderId')::uuid for update;
 if w.id is null then raise exception 'Werkbon niet beschikbaar' using errcode='42501';end if;
 if mid is null then raise exception 'Een wijzigingssleutel is verplicht' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('work-order-communication:'||mid,0));
 hash:=encode(extensions.digest(input::text,'sha256'),'hex');select * into prior from private.work_order_commands where id=mid;
 if found then if(prior.tenant_id,prior.actor_id,prior.command,prior.payload_hash) is distinct from(target_tenant,auth.uid(),'communication',hash) then raise exception 'Ongeldige herhaalsleutel' using errcode='23514';end if;return prior.result;end if;
 if length(body)>5000 or (length(body)=0 and a is null) then raise exception 'Vul een bericht in of kies een bestand' using errcode='23514';end if;
 if w.archive_at is not null then raise exception 'Een gearchiveerde werkbon is alleen leesbaar' using errcode='23514';end if;
 if coalesce((input->>'customerVisible')::boolean,false) and w.report_state in ('waiting_signature','review','approved') then raise exception 'Vraag eerst rapportcorrectie aan voordat klantzichtbare inhoud wordt toegevoegd' using errcode='23514';end if;
 if a is not null then
  path:=target_tenant||'/'||w.id||'/communication/'||mid||'.'||case a->>'mime' when 'application/pdf' then 'pdf' when 'image/png' then 'png' when 'image/jpeg' then 'jpg' end;
  if path is null or a->>'path' is distinct from path or coalesce((a->>'size')::bigint,0) not between 1 and 10485760 or a->>'sha256' !~ '^[0-9a-f]{64}$' or length(coalesce(a->>'name','')) not between 1 and 255 then raise exception 'Ongeldig werkbonbestand' using errcode='23514';end if;
  if not exists(select 1 from storage.objects s where s.bucket_id='reports' and s.name=path and s.metadata->>'mimetype'=a->>'mime' and (s.metadata->>'size')::bigint=(a->>'size')::bigint) then raise exception 'Het bestand is nog niet volledig opgeslagen. Probeer opnieuw.' using errcode='23514';end if;
 end if;
 if length(body)>0 then insert into public.report_entries(id,tenant_id,work_order_id,author_user_id,body,customer_visible) values(mid,target_tenant,w.id,auth.uid(),body,coalesce((input->>'customerVisible')::boolean,false));end if;
 if a is not null then insert into public.attachments(id,tenant_id,work_order_id,report_entry_id,uploaded_by,storage_bucket,storage_path,file_name,mime_type,size_bytes,sha256,customer_visible) values(mid,target_tenant,w.id,case when length(body)>0 then mid else null end,auth.uid(),'reports',path,a->>'name',a->>'mime',(a->>'size')::bigint,a->>'sha256',coalesce((input->>'customerVisible')::boolean,false));end if;
 result:=jsonb_build_object('ok',true,'id',mid);
 insert into private.work_order_commands values(mid,target_tenant,auth.uid(),'communication',hash,result,clock_timestamp());
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(target_tenant,auth.uid(),'work_order.communication','work_order',w.id,jsonb_build_object('entryId',mid,'attachment',a is not null,'customerVisible',coalesce((input->>'customerVisible')::boolean,false)));
 return result;
end $function$;

REVOKE ALL ON FUNCTION "public"."work_order_communication"(uuid, jsonb) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.work_order_dossier (
  target_tenant uuid,
  target_order  uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare w public.work_orders;fin boolean;manage boolean;r jsonb;
begin
 if not private.work_order_access(target_tenant) then raise exception 'Geen toegang tot werkbonnen' using errcode='42501';end if;
 select * into w from public.work_orders where tenant_id=target_tenant and id=target_order;
 if not found then return null;end if;
 fin:=private.work_order_access(target_tenant,true);manage:=private.has_role(target_tenant,array['tenant_admin','management','planner']::public.app_role[]);
 select jsonb_build_object('order',private.work_order_row(w.id,fin)||jsonb_build_object('description',w.description,'labels',w.labels,'instructions',w.day_instructions,
 'customerReference',coalesce(w.details->>'customerReference',''),'purchaseOrder',coalesce(w.details->>'purchaseOrder',''),'costCenter',coalesce(w.details->>'costCenter',''),'locationLabel',coalesce(w.details->>'locationLabel',''),
 'leadPersonnelId',w.lead_personnel_id,'plannerId',w.planner_user_id,'requestedDate',w.requested_date,'windowStart',s.starts_at,'windowEnd',s.ends_at,'windowKind',w.customer_window_kind,'durationMinutes',w.budget_labor_minutes,
 'signatureMode',w.signature_mode,'employeeSignatureRequired',w.employee_signature_required,'publishedAt',w.published_at,'templateSnapshot',w.template_snapshot,'templateRevisionId',w.template_snapshot->>'id','requestId',w.request_id,'quoteId',w.quote_id),
 'finance',fin,'canManage',manage,'canReview',private.has_role(target_tenant,array['tenant_admin','management','finance']::public.app_role[]),
 'contacts',coalesce((select jsonb_agg(jsonb_build_object('id',c.contact_id,'name',c.snapshot->>'name','roles',c.roles,'email',c.snapshot->>'email','phone',c.snapshot->>'phone') order by c.snapshot->>'name') from public.work_order_contacts c where c.work_order_id=w.id),'[]'),
 'tasks',coalesce((select jsonb_agg(case when fin then to_jsonb(t) else to_jsonb(t)-'unit_price_cents'-'vat_basis_points'-'commercial_snapshot' end order by t.created_at,t.id) from public.work_order_tasks t where t.work_order_id=w.id),'[]'),
 'assignments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'personnelId',p.id,'name',p.full_name,'start',a.projected_start_at,'end',a.projected_end_at,'status',a.status,'seenAt',(select min(created_at) from public.status_events e where e.assignment_id=a.id and e.new_status='seen'),'actualStart',a.actual_start_at,'actualEnd',a.actual_end_at) order by a.projected_start_at,a.id) from public.work_order_assignments a join public.personnel p on p.tenant_id=a.tenant_id and p.id=a.personnel_id where a.work_order_id=w.id),'[]'),
 'times',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'personnelId',p.id,'name',p.full_name,'start',t.starts_at,'end',t.ends_at,'kind',t.kind,'status',t.status) order by t.starts_at,t.id) from public.time_entries t join public.work_order_assignments a on a.id=t.assignment_id join public.personnel p on p.id=t.personnel_id where a.work_order_id=w.id and t.tenant_id=w.tenant_id),'[]'),
 'checklists',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'revisionId',v.id,'name',c.name,'version',v.version,'questions',c.definition->'questions','answers',coalesce((select jsonb_agg(jsonb_build_object('questionId',a.question_id,'value',a.value,'notApplicable',a.not_applicable,'reason',a.reason,'attachmentId',a.attachment_id,'version',a.version,'actor',a.updated_by,'updatedAt',a.updated_at) order by a.question_id) from public.work_order_checklist_answers a where a.checklist_id=c.id),'[]')) order by c.created_at,c.id) from public.work_order_checklists c join public.work_order_template_versions v on v.id=c.template_revision_id where c.work_order_id=w.id),'[]'),
 'reports',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'body',r.body,'created_at',r.created_at,'customer_visible',r.customer_visible) order by r.created_at,r.id) from public.report_entries r where r.work_order_id=w.id and r.deleted_at is null),'[]'),
 'attachments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'file_name',a.file_name,'mime_type',a.mime_type,'created_at',a.created_at) order by a.created_at,a.id) from public.attachments a where a.work_order_id=w.id and a.deleted_at is null),'[]'),
 'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.at desc,h.id) from (
 select e.id,e.created_at at,e.actor_user_id::text actor,'status.'||e.new_status::text event,e.note from public.status_events e where e.work_order_id=w.id
 union all select e.id,e.created_at,e.actor_user_id::text,e.action,null from public.audit_events e where e.tenant_id=w.tenant_id and e.entity_type='work_order' and e.entity_id=w.id
 )h),'[]')) into r from (select 1) dummy left join public.appointment_slots s on s.id=w.appointment_slot_id;
 return r;
end $function$;

REVOKE ALL ON FUNCTION "public"."work_order_dossier"(uuid, uuid) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.work_order_exception_command (
  target_tenant uuid,
  input         jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare w public.work_orders;e public.work_order_exceptions;prior private.work_order_commands;mid uuid:=(input->>'mutationId')::uuid;hash text;result jsonb;manager boolean;
begin
 if not private.object_session_active() then raise exception 'Actieve sessie vereist' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 select * into w from public.work_orders where tenant_id=target_tenant and id=(input->>'orderId')::uuid for update;
 manager:=private.planning_access(target_tenant);
 if w.id is null or not(manager or private.work_order_execution_actor(target_tenant,w.id,auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid)) then raise exception 'Geen toegang tot deze werkbon' using errcode='42501';end if;
 if mid is null then raise exception 'Een wijzigingssleutel is verplicht' using errcode='23514';end if;
 hash:=encode(extensions.digest(input::text,'sha256'),'hex');select * into prior from private.work_order_commands where id=mid;
 if found then if(prior.tenant_id,prior.actor_id,prior.command,prior.payload_hash) is distinct from(target_tenant,auth.uid(),'exception',hash) then raise exception 'Ongeldige herhaalsleutel' using errcode='23514';end if;return prior.result;end if;
 if input->>'action'='resolve' then
  if not manager then raise exception 'Alleen de planning kan een melding afhandelen' using errcode='42501';end if;
  select * into e from public.work_order_exceptions where tenant_id=target_tenant and work_order_id=w.id and id=(input->>'id')::uuid for update;
  if e.id is null or e.version<>(input->>'version')::bigint or e.state<>'open' then raise exception 'Deze melding is intussen gewijzigd' using errcode='40001';end if;
  if length(btrim(coalesce(input->>'resolution','')))<3 then raise exception 'Vul in hoe de melding is opgelost' using errcode='23514';end if;
  update public.work_order_exceptions set state='resolved',resolution=input->>'resolution',resolved_by=auth.uid(),resolved_at=clock_timestamp(),version=version+1 where id=e.id returning * into e;
 elsif input->>'action'='create' then
  if nullif(input->>'ownerId','') is not null and not exists(select 1 from public.tenant_memberships m where m.tenant_id=target_tenant and m.user_id=(input->>'ownerId')::uuid and m.status='active' and m.roles&&array['tenant_admin','management','planner']::public.app_role[]) then raise exception 'Kies een actieve behandelaar' using errcode='23514';end if;
  if nullif(input->>'attachmentId','') is not null and not exists(select 1 from public.attachments a where a.tenant_id=target_tenant and a.work_order_id=w.id and a.id=(input->>'attachmentId')::uuid) then raise exception 'De bijlage hoort niet bij deze werkbon' using errcode='23514';end if;
  insert into public.work_order_exceptions(id,tenant_id,work_order_id,kind,description,owner_user_id,blocking,attachment_id,created_by)
  values(gen_random_uuid(),target_tenant,w.id,input->>'kind',input->>'description',coalesce(nullif(input->>'ownerId','')::uuid,w.planner_user_id,w.created_by),coalesce((input->>'blocking')::boolean,false),nullif(input->>'attachmentId','')::uuid,auth.uid()) returning * into e;
 else raise exception 'Ongeldige meldingsactie' using errcode='23514';end if;
 result:=jsonb_build_object('ok',true,'id',e.id,'version',e.version);insert into private.work_order_commands values(mid,target_tenant,auth.uid(),'exception',hash,result,clock_timestamp());
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(target_tenant,auth.uid(),'work_order.exception_'||(input->>'action'),'work_order',w.id,jsonb_build_object('exceptionId',e.id,'kind',e.kind,'state',e.state));
 perform private.enqueue_event(target_tenant,'work_order.exception','work_order',w.id,jsonb_build_object('work_order_id',w.id,'exception_id',e.id,'owner_id',e.owner_user_id),'work-order-exception:'||mid);
 return result;
end $function$;

REVOKE ALL ON FUNCTION "public"."work_order_exception_command"(uuid, jsonb) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.work_order_exceptions (
  target_tenant uuid,
  target_order  uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 if not private.object_session_active() or not private.can_access_work_order(target_tenant,target_order) or not exists(select 1 from public.work_orders where id=target_order and tenant_id=target_tenant) then raise exception 'Geen toegang tot werkbonmeldingen' using errcode='42501';end if;
 return jsonb_build_object('canManage',private.planning_access(target_tenant),'items',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'kind',e.kind,'description',e.description,'ownerId',e.owner_user_id,'state',e.state,'blocking',e.blocking,'attachmentId',e.attachment_id,'resolution',e.resolution,'version',e.version,'createdAt',e.created_at,'resolvedAt',e.resolved_at) order by e.created_at desc,e.id) from public.work_order_exceptions e where e.tenant_id=target_tenant and e.work_order_id=target_order),'[]'));
end $function$;

REVOKE ALL ON FUNCTION "public"."work_order_exceptions"(uuid, uuid) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.work_order_list (
  target_tenant uuid,
  filters       jsonb DEFAULT '{}'::jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare fin boolean;page_n int:=greatest(1,least(100000,coalesce((filters->>'page')::int,1)));q text:=coalesce(filters->>'q','');sorting text:=coalesce(filters->>'sort','date');result jsonb;
begin
 if not private.work_order_access(target_tenant) then raise exception 'Geen toegang tot werkbonnen' using errcode='42501';end if;
 fin:=private.work_order_access(target_tenant,true);
 if length(q)>200 or sorting not in ('date','date_desc','number','title','customer','status') then raise exception 'Ongeldige zoekopdracht' using errcode='23514';end if;
 with filtered as materialized(
 select w.id,w.projected_start_at,w.created_at,private.work_order_row(w.id,fin) row from public.work_orders w join public.customers c on c.id=w.customer_id join public.objects o on o.id=w.object_id
 where w.tenant_id=target_tenant and ((filters->>'archived'='yes' and w.archive_at is not null) or (coalesce(filters->>'archived','')<>'yes' and w.archive_at is null))
 and (q='' or concat_ws(' ',w.work_order_number,w.title,w.discipline,c.name,o.name,o.address->>'street',o.address->>'postal_code',o.address->>'city',w.details->>'customerReference') ilike '%'||replace(replace(replace(q,'\','\\'),'%','\%'),'_','\_')||'%')
 and (coalesce(filters->>'customer','')='' or w.customer_id=(filters->>'customer')::uuid) and (coalesce(filters->>'object','')='' or w.object_id=(filters->>'object')::uuid)
 and (coalesce(filters->>'employee','')='' or exists(select 1 from public.work_order_assignments a where a.work_order_id=w.id and a.personnel_id=(filters->>'employee')::uuid and a.status not in ('cancelled','returned')))
 and (coalesce(filters->>'discipline','')='' or w.discipline=filters->>'discipline') and (coalesce(filters->>'priority','')='' or w.priority=filters->>'priority') and (coalesce(filters->>'source','')='' or w.source_kind=filters->>'source')
 and (coalesce(filters->>'from','')='' or (w.projected_start_at at time zone (select timezone from public.tenants where id=target_tenant))::date>=(filters->>'from')::date)
 and (coalesce(filters->>'to','')='' or (w.projected_start_at at time zone (select timezone from public.tenants where id=target_tenant))::date<=(filters->>'to')::date)
 ), flagged as materialized(select * from filtered where
 (coalesce(filters->>'report','')='' or row->>'reportState'=filters->>'report') and
 (coalesce(filters->>'planning','')='' or row->>'planningState'=filters->>'planning') and (coalesce(filters->>'execution','')='' or row->>'status'=filters->>'execution') and (coalesce(filters->>'billing','')='' or fin and row->>'billingState'=filters->>'billing') and
 (coalesce(filters->>'exception','')='' or (filters->>'exception'='crew' and (row->>'assignedPersonnel')::int<(row->>'requiredPersonnel')::int) or (filters->>'exception'='signature' and row->>'signatureState'='waiting') or (filters->>'exception'='remaining' and exists(select 1 from public.work_order_tasks t where t.work_order_id=filtered.id and t.execution_state in ('partial','not_done'))) or (filters->>'exception'='blocked' and row->>'status'='returned'))
 ), selected as(select * from flagged where coalesce(filters->>'view','all')='all' or row->>'category'=filters->>'view'), paged as(
 select * from selected order by
 case when sorting='date' then projected_start_at end asc nulls last,case when sorting='date_desc' then projected_start_at end desc nulls last,
 case when sorting='number' then row->>'number' when sorting='title' then row->>'title' when sorting='customer' then row->>'customer' when sorting='status' then row->>'status' end asc,
 created_at desc,id limit 25 offset (page_n-1)*25
 ) select jsonb_build_object('rows',coalesce((select jsonb_agg(row) from paged),'[]'),'total',(select count(*) from selected),'page',page_n,'pageSize',25,'finance',fin,
 'canManage',private.has_role(target_tenant,array['tenant_admin','management','planner']::public.app_role[]),
 'counts',jsonb_build_object('all',(select count(*) from flagged),'unassigned',(select count(*) from flagged where row->>'category'='unassigned'),'planned',(select count(*) from flagged where row->>'category'='planned'),'running',(select count(*) from flagged where row->>'category'='running'),'handling',(select count(*) from flagged where row->>'category'='handling'),'completed',(select count(*) from flagged where row->>'category'='completed'))) into result;
 return result;
end $function$;

REVOKE ALL ON FUNCTION "public"."work_order_list"(uuid, jsonb) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.work_order_options (
  target_tenant uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare fin boolean;s public.tenant_settings;res jsonb;
begin
 if not private.work_order_access(target_tenant) then raise exception 'Geen toegang tot werkbonnen' using errcode='42501';end if;
 fin:=private.work_order_access(target_tenant,true);select * into s from public.tenant_settings where tenant_id=target_tenant;
 select jsonb_build_object('finance',fin,'canManageSignature',private.has_role(target_tenant,array['tenant_admin','management']::public.app_role[]),'defaultPaymentTermsDays',s.payment_terms_days,
 'defaultSignatureMode',coalesce(s.settings->'workOrders'->>'signatureMode',case when s.signature_required_default then 'required' else 'none' end),
 'customers',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'customer_number',c.customer_number) order by c.name,c.id) from public.customers c where tenant_id=target_tenant and status not in ('archived','inactive')),'[]'),
 'objects',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'customer_id',o.customer_id,'name',o.name,'address',o.address,'signatureMode',coalesce(to_jsonb(o)->>'signature_mode','inherit'),'instructions',o.arrival_instruction) order by o.name,o.id) from public.objects o where tenant_id=target_tenant and active and dossier_status not in ('archived','paused')),'[]'),
 'contacts',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'customer_id',c.customer_id,'objectIds',c.object_ids,'full_name',c.full_name,'email',c.email,'phone',c.phone) order by c.full_name,c.id) from public.customer_contacts c where c.tenant_id=target_tenant and c.active),'[]'),
 'personnel',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'full_name',p.full_name,'personnel_number',p.employee_number) order by p.full_name,p.id) from public.personnel p where p.tenant_id=target_tenant and p.status='active' and exists(select 1 from public.tenant_memberships m where m.tenant_id=p.tenant_id and m.user_id=p.user_id and m.status='active' and 'staff'=any(m.roles))),'[]'),
 'planners',coalesce((select jsonb_agg(jsonb_build_object('id',m.user_id,'label',coalesce(p.full_name,u.email,'Planner')) order by coalesce(p.full_name,u.email),m.user_id) from public.tenant_memberships m join auth.users u on u.id=m.user_id left join public.personnel p on p.tenant_id=m.tenant_id and p.user_id=m.user_id where m.tenant_id=target_tenant and m.status='active' and m.roles&&array['tenant_admin','management','planner']::public.app_role[]),'[]'),
 'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'revisionId',r.id,'code',t.code,'name',t.name,'discipline',t.discipline,'unit',r.unit,'durationMinutes',r.duration_minutes)||case when fin then jsonb_build_object('priceCents',r.price_cents,'vatBasisPoints',r.vat_basis_points) else '{}' end order by t.name,t.id) from public.task_catalog t join lateral(select * from public.task_revisions r where r.tenant_id=t.tenant_id and r.task_id=t.id and r.valid_until is null order by revision desc limit 1)r on true where t.tenant_id=target_tenant and t.active),'[]'),
 'templates',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'kind',t.kind,'revisionId',v.id,'version',v.version,'editVersion',v.edit_version,'state',v.state,'definition',v.definition) order by t.name,v.version desc) from public.work_order_templates t join public.work_order_template_versions v on v.tenant_id=t.tenant_id and v.template_id=t.id where t.tenant_id=target_tenant),'[]'),
 'disciplines',coalesce((select jsonb_agg(d.discipline order by d.discipline) from (select distinct discipline from public.task_catalog where tenant_id=target_tenant and active)d),'[]')) into res;
 return res;
end $function$;

REVOKE ALL ON FUNCTION "public"."work_order_options"(uuid) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.work_order_related_command (
  target_tenant uuid,
  command_id    uuid,
  command       text,
  input         jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare receipt private.work_order_related_receipts;source public.work_orders;task public.work_order_tasks;root public.work_order_tasks;line jsonb;
 target uuid;new_task uuid;amount numeric;actual numeric;transfer_mode boolean;result jsonb;reason text;source_id uuid;quote public.quotes;
begin
 if not private.work_order_lineage_authorized(target_tenant) then raise exception 'Geen toegang tot deze werkbonactie' using errcode='42501';end if;
 if command_id is null or jsonb_typeof(input)<>'object' then raise exception 'Een actiereferentie en invoer zijn verplicht' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 select * into receipt from private.work_order_related_receipts where tenant_id=target_tenant and id=command_id;
 if found then
  if receipt.actor_id<>auth.uid() or receipt.command<>command or receipt.payload<>input then raise exception 'Gebruik een nieuwe actiereferentie voor gewijzigde invoer' using errcode='23514';end if;
  return receipt.result;
 end if;
 source_id:=(input->>'orderId')::uuid;
 select * into source from public.work_orders where tenant_id=target_tenant and id=source_id for update;
 if source.id is null then raise exception 'Werkbon niet beschikbaar' using errcode='42501';end if;
 if source.version is distinct from (input->>'version')::bigint then raise exception 'De werkbon is gewijzigd. Vernieuw eerst.' using errcode='40001';end if;
 if command='material' then
  if source.status in ('invoice_ready','invoiced','cancelled') or source.archive_at is not null or exists(select 1 from public.signatures where tenant_id=target_tenant and work_order_id=source.id and report_version=source.report_version)
   or coalesce((input->>'customerVisible')::boolean,false) and to_jsonb(source)->>'report_state' in ('waiting_signature','review','approved') then raise exception 'Registreer verbruik vóór ondertekening en definitieve rapportcontrole' using errcode='23514';end if;
  if nullif(input->>'taskId','') is not null and not exists(select 1 from public.work_order_tasks where tenant_id=target_tenant and work_order_id=source.id and id=(input->>'taskId')::uuid) then raise exception 'Taak hoort niet bij deze werkbon' using errcode='23514';end if;
  if input ? 'unitPriceCents' or input ? 'costCents' then if not private.commercial_access(target_tenant) then raise exception 'Financiële bevoegdheid vereist' using errcode='42501';end if;end if;
  insert into public.work_order_material_usage(tenant_id,work_order_id,task_id,description,quantity,unit,customer_visible,created_by)
  values(target_tenant,source.id,nullif(input->>'taskId','')::uuid,input->>'description',(input->>'quantity')::numeric,input->>'unit',coalesce((input->>'customerVisible')::boolean,false),auth.uid()) returning id into target;
  if input ? 'unitPriceCents' or input ? 'costCents' then insert into private.work_order_material_finance values(target_tenant,target,(input->>'costCents')::bigint,(input->>'unitPriceCents')::bigint);end if;
  result:=jsonb_build_object('id',target);
 elsif command in ('split','followup','duplicate') then
  reason:=coalesce(input->>'reason','remainder');transfer_mode:=command='split' or(command='followup' and reason='remainder');
  if length(trim(coalesce(input->>'title',''))) not between 2 and 180 or length(coalesce(input->>'instructions',''))>2000 then raise exception 'Vul titel en geldige instructies in' using errcode='23514';end if;
  if command='followup' and reason not in ('remainder','repair','warranty','paid','inspection') then raise exception 'Kies een opvolgreden' using errcode='23514';end if;
  if transfer_mode and source.status='cancelled' then raise exception 'Een geannuleerde bon draagt geen nieuwe scope over' using errcode='23514';end if;
  if command='split' and exists(select 1 from public.work_order_relations where tenant_id=target_tenant and target_order_id=source.id and kind='split') then raise exception 'V1 ondersteunt één niveau deelbonnen. Gebruik een opvolgbon voor later restwerk.' using errcode='23514';end if;
  if command='followup' and reason='paid' then
   if not private.commercial_access(target_tenant) then raise exception 'Financiële bevoegdheid vereist' using errcode='42501';end if;
   select * into quote from public.quotes where tenant_id=target_tenant and id=(input->>'acceptedQuoteId')::uuid and customer_id=source.customer_id and object_id=source.object_id and status='accepted' and operation_id is null and archived_at is null;
   if quote.id is null then raise exception 'Kies een afzonderlijke geaccepteerde offerte voor dit betaalde vervolgwerk' using errcode='23514';end if;
   result:=public.commercial_command(target_tenant,gen_random_uuid(),'convert',jsonb_build_object('id',quote.id,'version',quote.version));
   target:=(result->>'operation_id')::uuid;
   update public.work_orders set title=input->>'title',description=coalesce(input->>'instructions',''),day_instructions=coalesce(input->>'instructions',''),requested_date=nullif(input->>'requestedDate','')::date,source_kind='followup' where id=target;
  else
   if jsonb_typeof(input->'tasks') is distinct from 'array' or jsonb_array_length(input->'tasks')>100 or(transfer_mode and jsonb_array_length(input->'tasks')=0) then raise exception 'Selecteer de over te nemen werkzaamheden' using errcode='23514';end if;
   if(select count(*) from jsonb_array_elements(input->'tasks'))<>(select count(distinct value->>'id') from jsonb_array_elements(input->'tasks')) then raise exception 'Selecteer iedere taak eenmaal' using errcode='23514';end if;
   target:=private.work_order_clone(target_tenant,source.id,input->>'title',coalesce(input->>'instructions',''),nullif(input->>'requestedDate','')::date,command,coalesce((input->>'copyTemplate')::boolean,true),coalesce((input->>'copyContacts')::boolean,true),coalesce((input->>'copyPersonnel')::boolean,false));
   if transfer_mode then update public.work_orders set request_id=source.request_id,quote_id=source.quote_id,commercial_terms=source.commercial_terms where id=target;end if;
   for line in select value from jsonb_array_elements(input->'tasks') loop
    select * into task from public.work_order_tasks where tenant_id=target_tenant and work_order_id=source.id and id=(line->>'id')::uuid for update;
    if task.id is null then raise exception 'Taak hoort niet bij de bronwerkbon' using errcode='23514';end if;
    amount:=(line->>'quantity')::numeric;
    if amount is null or amount<=0 or amount<>round(amount,3) then raise exception 'Gebruik een positieve hoeveelheid met maximaal drie decimalen' using errcode='23514';end if;
    new_task:=gen_random_uuid();
    if transfer_mode then
     actual:=coalesce(task.executed_quantity,case when task.completed_at is not null then task.quantity else 0 end);
     if amount>task.quantity-actual-task.transferred_quantity-task.withdrawn_quantity then raise exception 'Alleen nog beschikbare resthoeveelheid kan worden overgedragen' using errcode='23514';end if;
     select * into root from public.work_order_tasks where tenant_id=target_tenant and id=task.scope_root_task_id;
     if root.is_extra_work and root.extra_work_status is distinct from 'approved' and not exists(select 1 from public.object_visit_requests r join public.object_request_proposals p on p.tenant_id=r.tenant_id and p.request_id=r.id where r.tenant_id=target_tenant and r.work_order_task_id=root.id and p.accepted_at is not null and not r.needs_review and p.quantity=root.quantity and p.price_cents=root.unit_price_cents and p.task_revision_id=root.task_revision_id)
      and not exists(select 1 from public.customer_agreement_lines l join public.customer_agreements a on a.tenant_id=l.tenant_id and a.id=l.agreement_id where l.tenant_id=target_tenant and l.id=root.agreement_line_id and l.extra_work and a.evidence_document_id is not null) then raise exception 'Leg eerst passend akkoord op dit meerwerk vast' using errcode='23514';end if;
     insert into public.work_order_scope_transfers(tenant_id,source_task_id,target_task_id,target_order_id,quantity,reason,created_by) values(target_tenant,task.id,new_task,target,amount,reason,auth.uid());
     insert into public.work_order_tasks(id,tenant_id,work_order_id,task_revision_id,task_code,task_name,duration_minutes,quantity,unit,unit_price_cents,vat_basis_points,is_extra_work,extra_work_status,agreement_line_id,commercial_snapshot,scope_root_task_id,instructions,added_by)
     values(new_task,target_tenant,target,root.task_revision_id,task.task_code,task.task_name,task.duration_minutes,amount,task.unit,root.unit_price_cents,root.vat_basis_points,root.is_extra_work,case when root.is_extra_work then 'approved' end,root.agreement_line_id,root.commercial_snapshot,root.id,task.instructions,auth.uid());
     update public.work_order_tasks set transferred_quantity=transferred_quantity+amount where id=task.id;
    else
     -- Independent duplication/repair does not copy a financial entitlement.
     insert into public.work_order_tasks(id,tenant_id,work_order_id,task_revision_id,task_code,task_name,duration_minutes,quantity,unit,unit_price_cents,vat_basis_points,instructions,added_by)
     values(new_task,target_tenant,target,task.task_revision_id,task.task_code,task.task_name,task.duration_minutes,amount,task.unit,0,task.vat_basis_points,task.instructions,auth.uid());
    end if;
   end loop;
  end if;
  insert into public.work_order_relations(tenant_id,source_order_id,target_order_id,kind,reason,created_by) values(target_tenant,source.id,target,command,reason,auth.uid());
  result:=jsonb_build_object('id',target);
 else raise exception 'Onbekende werkbonactie' using errcode='23514';end if;
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(target_tenant,auth.uid(),'work_order.'||command,'work_order',source.id,jsonb_build_object('target_id',target,'reason',reason));
 insert into private.work_order_related_receipts(tenant_id,id,actor_id,command,payload,result) values(target_tenant,command_id,auth.uid(),command,input,result);
 return result;
end $function$;

REVOKE ALL ON FUNCTION "public"."work_order_related_command"(uuid, uuid, text, jsonb) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.work_order_related_context (
  target_tenant uuid,
  target_order  uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare source public.work_orders;can_finance boolean;
begin
 if not private.work_order_lineage_authorized(target_tenant) and not(private.object_session_active() and private.commercial_access(target_tenant)) then raise exception 'Geen toegang tot de gekoppelde werkbonnen' using errcode='42501';end if;
 select * into source from public.work_orders where tenant_id=target_tenant and id=target_order;
 if source.id is null then raise exception 'Werkbon niet beschikbaar' using errcode='42501';end if;
 can_finance:=private.commercial_access(target_tenant);
 return jsonb_build_object(
 'order',jsonb_build_object('id',source.id,'number',source.work_order_number,'title',source.title,'version',source.version,'status',source.status,'signatureMode',coalesce(to_jsonb(source)#>>'{signature_policy_snapshot,mode}',source.signature_mode),'employeeSignatureRequired',source.employee_signature_required),
 'canManage',private.work_order_lineage_authorized(target_tenant),'canFinance',can_finance,
 'canSplit',source.status<>'cancelled' and not exists(select 1 from public.work_order_relations where tenant_id=target_tenant and target_order_id=source.id and kind='split'),
 'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',task_name,'unit',unit,'planned',quantity,'executed',coalesce(executed_quantity,case when completed_at is not null then quantity else 0 end),'transferred',transferred_quantity,'withdrawn',withdrawn_quantity,'available',greatest(0,quantity-coalesce(executed_quantity,case when completed_at is not null then quantity else 0 end)-transferred_quantity-withdrawn_quantity)) order by created_at,id) from public.work_order_tasks where tenant_id=target_tenant and work_order_id=source.id),'[]'),
 'relations',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'number',w.work_order_number,'title',w.title,'kind',r.kind,'reason',r.reason,'direction',case when r.target_order_id=source.id then 'source' else 'child' end) order by r.created_at) from public.work_order_relations r join public.work_orders w on w.tenant_id=r.tenant_id and w.id=case when r.target_order_id=source.id then r.source_order_id else r.target_order_id end where r.tenant_id=target_tenant and(source.id=r.source_order_id or source.id=r.target_order_id)),'[]'),
 'transfers',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'sourceTask',t.task_name,'targetOrder',w.id,'targetNumber',w.work_order_number,'quantity',x.quantity,'unit',t.unit,'createdAt',x.created_at) order by x.created_at) from public.work_order_scope_transfers x join public.work_order_tasks t on t.tenant_id=x.tenant_id and t.id=x.source_task_id join public.work_orders w on w.tenant_id=x.tenant_id and w.id=x.target_order_id where x.tenant_id=target_tenant and(t.work_order_id=source.id or x.target_order_id=source.id)),'[]'),
 'series',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'version',s.version,'definition',s.definition,'occurrences',coalesce((select jsonb_agg(jsonb_build_object('day',o.occurrence_on,'state',o.state,'reason',o.reason,'orderId',w.id,'number',w.work_order_number) order by o.occurrence_on) from public.work_order_occurrences o left join public.work_orders w on w.tenant_id=o.tenant_id and w.id=o.work_order_id where o.tenant_id=s.tenant_id and o.series_id=s.id),'[]'))) from public.work_order_series s where s.tenant_id=target_tenant and(s.source_order_id=source.id or exists(select 1 from public.work_order_occurrences o where o.tenant_id=s.tenant_id and o.series_id=s.id and o.work_order_id=source.id))),'[]'),
 'materials',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'description',m.description,'quantity',m.quantity,'unit',m.unit,'taskId',m.task_id,'createdAt',m.created_at,'customerVisible',m.customer_visible)||case when can_finance then jsonb_build_object('unitPriceCents',f.unit_price_cents,'costCents',f.cost_cents) else '{}' end order by m.created_at) from public.work_order_material_usage m left join private.work_order_material_finance f on f.tenant_id=m.tenant_id and f.usage_id=m.id where m.tenant_id=target_tenant and m.work_order_id=source.id),'[]'),
 'acceptedQuotes',case when can_finance then coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'number',q.quote_number,'title',q.subject)) from public.quotes q where q.tenant_id=target_tenant and q.customer_id=source.customer_id and q.object_id=source.object_id and q.status='accepted' and q.operation_id is null and q.archived_at is null),'[]') else '[]' end
 );
end $function$;

REVOKE ALL ON FUNCTION "public"."work_order_related_context"(uuid, uuid) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.work_order_report (
  target_work_order_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare w public.work_orders;can_review boolean;can_execute boolean;policy jsonb;
begin
 select * into w from public.work_orders where id=target_work_order_id;
 if not private.object_session_active() or not private.can_access_work_order(w.tenant_id,w.id) or not private.service_enabled(w.tenant_id,'rapportage') then raise exception 'Geen rapporttoegang' using errcode='42501';end if;
 can_review:=private.has_role(w.tenant_id,array['tenant_admin','management','finance']::public.app_role[]);
 can_execute:=private.work_order_execution_actor(w.tenant_id,w.id,auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid);
 policy:=private.work_order_signature_policy(w);
 return jsonb_build_object('orderId',w.id,'orderVersion',w.version,'number',w.work_order_number,'state',w.report_state,'policy',policy,'canReview',can_review,
 'canEditPolicy',private.has_role(w.tenant_id,array['tenant_admin','management']::public.app_role[]) and w.status not in ('cancelled','approved','invoice_ready','invoiced') and w.report_state in ('draft','correction'),'configuredMode',w.signature_mode,'employeeSignatureRequired',w.employee_signature_required,
 'canSubmit',can_execute and w.status not in ('cancelled','approved','invoice_ready','invoiced') and (w.lead_personnel_id is null or exists(select 1 from public.personnel p where p.id=w.lead_personnel_id and p.user_id=auth.uid())),
 'canCapture',can_execute,'canWaive',can_review and exists(select 1 from public.tenant_settings ts where ts.tenant_id=w.tenant_id and coalesce((ts.settings->'workOrders'->>'allowSignatureWaivers')::boolean,false) and coalesce(ts.settings->'workOrders'->'signatureWaiverUsers','[]') ? auth.uid()::text),'legacy',not exists(select 1 from public.work_order_report_versions r where r.work_order_id=w.id),
 'checklists',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'revisionId',v.id,'name',c.name,'version',v.version,'questions',c.definition->'questions','answers',coalesce((select jsonb_agg(jsonb_build_object('questionId',a.question_id,'value',a.value,'notApplicable',a.not_applicable,'reason',a.reason,'attachmentId',a.attachment_id,'version',a.version,'actor',a.updated_by,'updatedAt',a.updated_at) order by a.question_id) from public.work_order_checklist_answers a where a.checklist_id=c.id),'[]')) order by c.created_at,c.id) from public.work_order_checklists c join public.work_order_template_versions v on v.id=c.template_revision_id where c.work_order_id=w.id),'[]'),
 'versions',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'version',r.version,'state',r.state,'snapshot',r.snapshot,'contentHash',r.content_hash,'policy',r.signature_policy,'createdAt',r.created_at,'approvedAt',r.approved_at,
 'waiver',(select jsonb_build_object('reason',x.reason,'at',x.created_at) from public.work_order_signature_waivers x where x.report_id=r.id),
 'signatures',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.signer_name,'capacity',s.signer_capacity,'capturedBy',coalesce(s.captured_by_name,p.full_name,'Medewerker'),'signedAt',s.signed_at,'channel',s.channel,'kind',s.signature_kind)) from public.signatures s left join public.personnel p on p.tenant_id=s.tenant_id and p.user_id=s.captured_by where s.report_id=r.id and s.revoked_at is null),'[]')) order by r.version desc) from public.work_order_report_versions r where r.tenant_id=w.tenant_id and r.work_order_id=w.id),'[]'),
 'historicalSignatures',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.signer_name,'version',s.report_version,'signedAt',s.signed_at)) from public.signatures s where s.tenant_id=w.tenant_id and s.work_order_id=w.id and s.report_id is null),'[]'));
end $function$;

REVOKE ALL ON FUNCTION "public"."work_order_report"(uuid) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.work_order_report_file (
  target_report_id uuid,
  asset_id         uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare r public.work_order_report_versions;w public.work_orders;signed_record public.signatures;a public.attachments;allowed boolean;
begin
 select * into r from public.work_order_report_versions where id=target_report_id;select * into w from public.work_orders where tenant_id=r.tenant_id and id=r.work_order_id;
 allowed:=private.can_access_work_order(w.tenant_id,w.id) or(r.state='approved' and exists(select 1 from public.object_customer_bindings b where b.tenant_id=w.tenant_id and b.object_id=w.object_id and b.user_id=auth.uid() and b.active));
 if r.id is null or not private.object_session_active() or not allowed or not private.service_enabled(w.tenant_id,'rapportage') then raise exception 'Rapportbestand niet beschikbaar' using errcode='42501';end if;
 if asset_id is not null then
  select * into signed_record from public.signatures where tenant_id=r.tenant_id and report_id=r.id and id=asset_id;
  if found then return jsonb_build_object('bucket','signatures','path',signed_record.storage_path,'name','handtekening.png','mime','image/png','sha256',signed_record.sha256);end if;
  select * into a from public.attachments where tenant_id=r.tenant_id and work_order_id=w.id and id=asset_id;
  if a.id is null or not exists(select 1 from jsonb_array_elements(r.snapshot->'attachments') x where x->>'id'=a.id::text and x->>'sha256'=a.sha256) then raise exception 'Bijlage hoort niet bij deze rapportversie' using errcode='42501';end if;
  return jsonb_build_object('bucket',a.storage_bucket,'path',a.storage_path,'name',a.file_name,'mime',a.mime_type,'sha256',a.sha256);
 end if;
 return jsonb_build_object('id',r.id,'version',r.version,'state',r.state,'snapshot',r.snapshot,'contentHash',r.content_hash,'policy',r.signature_policy,'createdAt',r.created_at,'approvedAt',r.approved_at,
 'waiver',(select jsonb_build_object('reason',x.reason,'at',x.created_at) from public.work_order_signature_waivers x where x.report_id=r.id),
 'signatures',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.signer_name,'capacity',s.signer_capacity,'capturedBy',coalesce(s.captured_by_name,p.full_name,'Medewerker'),'signedAt',s.signed_at,'channel',s.channel,'kind',s.signature_kind)) from public.signatures s left join public.personnel p on p.tenant_id=s.tenant_id and p.user_id=s.captured_by where s.report_id=r.id and s.revoked_at is null),'[]'));
end $function$;

REVOKE ALL ON FUNCTION "public"."work_order_report_file"(uuid, uuid) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.work_order_series_command (
  target_tenant uuid,
  command_id    uuid,
  command       text,
  input         jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare receipt private.work_order_related_receipts;series public.work_order_series;source public.work_orders;task public.work_order_tasks;created public.work_orders;
 occurrence public.work_order_occurrences;day date;from_day date;until_day date;tz text;horizon integer;start_at timestamptz;end_at timestamptz;rule jsonb;result jsonb;
 target uuid;count_created integer:=0;count_skipped integer:=0;count_preserved integer:=0;serial_command text:='series.'||command;
begin
 if not private.work_order_lineage_authorized(target_tenant) then raise exception 'Geen toegang tot terugkerend werk' using errcode='42501';end if;
 if command_id is null or jsonb_typeof(input)<>'object' then raise exception 'Een actiereferentie is verplicht' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 select * into receipt from private.work_order_related_receipts where tenant_id=target_tenant and id=command_id;
 if found then
  if receipt.actor_id<>auth.uid() or receipt.command<>serial_command or receipt.payload<>input then raise exception 'Gebruik een nieuwe actiereferentie voor gewijzigde invoer' using errcode='23514';end if;
  return receipt.result;
 end if;
 select timezone into tz from public.tenants where id=target_tenant;
 if command='create' then
  select * into source from public.work_orders where tenant_id=target_tenant and id=(input->>'orderId')::uuid for update;
  if source.id is null then raise exception 'Bronwerkbon niet beschikbaar' using errcode='42501';end if;
  if source.version is distinct from(input->>'version')::bigint then raise exception 'De werkbon is gewijzigd' using errcode='40001';end if;
  if exists(select 1 from public.work_order_tasks where tenant_id=target_tenant and work_order_id=source.id and unit_price_cents>0) and not private.commercial_access(target_tenant) then raise exception 'Laat de financiële afspraken van de reeks door een bevoegde collega bevestigen' using errcode='42501';end if;
  if source.quote_id is not null and not exists(select 1 from public.quotes where tenant_id=target_tenant and id=source.quote_id and status='accepted' and work_kind='recurring') then raise exception 'Een eenmalige offerte wordt geen nieuwe periodieke prijsafspraak. Leg eerst de terugkerende afspraak vast.' using errcode='23514';end if;
  if exists(select 1 from public.work_order_tasks where tenant_id=target_tenant and work_order_id=source.id and(scope_root_task_id<>id or transferred_quantity>0 or is_extra_work)) then raise exception 'Gebruik oorspronkelijke reguliere werkzaamheden als basis voor een reeks' using errcode='23514';end if;
  rule:=input->'definition';perform private.validate_work_order_recurrence(rule);
  insert into public.work_order_series(tenant_id,source_order_id,title,definition,timezone,created_by) values(target_tenant,source.id,input->>'title',rule,tz,auth.uid()) returning * into series;
  result:=jsonb_build_object('id',series.id);
 else
  select * into series from public.work_order_series where tenant_id=target_tenant and id=(input->>'seriesId')::uuid for update;
  if series.id is null then raise exception 'Reeks niet beschikbaar' using errcode='42501';end if;
  if series.version is distinct from(input->>'version')::bigint then raise exception 'De reeks is gewijzigd. Vernieuw eerst.' using errcode='40001';end if;
  select * into source from public.work_orders where tenant_id=target_tenant and id=series.source_order_id;
  tz:=series.timezone;
  if command='update' then
   rule:=input->'definition';perform private.validate_work_order_recurrence(rule);
   update public.work_order_series set title=input->>'title',definition=rule,version=version+1 where id=series.id returning * into series;
   if coalesce((input->>'applyFuture')::boolean,false) then
    for occurrence in select * from public.work_order_occurrences where tenant_id=target_tenant and series_id=series.id and state='generated' and occurrence_on>=(clock_timestamp() at time zone tz)::date for update loop
     select * into created from public.work_orders where tenant_id=target_tenant and id=occurrence.work_order_id for update;
     if created.version=occurrence.generated_order_version and created.status='planned' and created.actual_start_at is null and created.projected_start_at is null
      and not exists(select 1 from public.work_order_assignments where tenant_id=target_tenant and work_order_id=created.id)
      and not exists(select 1 from public.report_entries where tenant_id=target_tenant and work_order_id=created.id)
      and not exists(select 1 from public.work_order_tasks where tenant_id=target_tenant and work_order_id=created.id and completed_at is not null)
      and not exists(select 1 from public.invoice_lines where tenant_id=target_tenant and work_order_id=created.id)
     then
      if private.work_order_recurrence_matches(rule,occurrence.occurrence_on) then
       update public.work_orders set title=series.title,required_personnel=(rule->>'requiredPersonnel')::integer,details=details||jsonb_build_object('recurrence_window',jsonb_build_object('startsAt',rule->>'startsAt','endsAt',rule->>'endsAt','timezone',tz)),version=version+1 where id=created.id returning * into created;
       update public.work_order_occurrences set series_version=series.version,generated_order_version=created.version where tenant_id=target_tenant and series_id=series.id and occurrence_on=occurrence.occurrence_on;
      else
       update public.work_orders set archive_at=clock_timestamp(),version=version+1 where id=created.id;
       update public.work_order_occurrences set state='skipped',reason='Niet meer in herhaalpatroon',series_version=series.version where tenant_id=target_tenant and series_id=series.id and occurrence_on=occurrence.occurrence_on;
      end if;
     else count_preserved:=count_preserved+1;end if;
    end loop;
   end if;
   result:=jsonb_build_object('id',series.id,'preserved',count_preserved);
  elsif command='skip' then
   day:=(input->>'day')::date;
   if day is null or length(trim(coalesce(input->>'reason','')))<3 or not private.work_order_recurrence_matches(series.definition,day) then raise exception 'Kies een datum binnen de reeks en leg een reden vast' using errcode='23514';end if;
   select * into occurrence from public.work_order_occurrences where tenant_id=target_tenant and series_id=series.id and occurrence_on=day for update;
   if occurrence.work_order_id is not null and occurrence.state<>'skipped' then
    select * into created from public.work_orders where tenant_id=target_tenant and id=occurrence.work_order_id for update;
    if created.version<>occurrence.generated_order_version or created.status<>'planned' or created.actual_start_at is not null or created.projected_start_at is not null
     or exists(select 1 from public.work_order_assignments where tenant_id=target_tenant and work_order_id=created.id)
     or exists(select 1 from public.report_entries where tenant_id=target_tenant and work_order_id=created.id)
     or exists(select 1 from public.invoice_lines where tenant_id=target_tenant and work_order_id=created.id)
    then raise exception 'Deze bon is gewijzigd of in uitvoering. Behandel de afspraak afzonderlijk via het dossier of planbord.' using errcode='23514';end if;
    update public.work_orders set archive_at=clock_timestamp(),version=version+1 where id=created.id;
   end if;
   insert into public.work_order_occurrences(tenant_id,series_id,occurrence_on,state,reason,series_version) values(target_tenant,series.id,day,'skipped',input->>'reason',series.version)
   on conflict(tenant_id,series_id,occurrence_on) do update set state='skipped',reason=excluded.reason;
   result:=jsonb_build_object('id',series.id);
  elsif command='generate' then
   if not series.active then raise exception 'Deze reeks is niet actief' using errcode='23514';end if;
   select least(26,greatest(1,coalesce(nullif(settings#>>'{planning,generation_horizon_weeks}','')::integer,6))) into horizon from public.tenant_settings where tenant_id=target_tenant;
   horizon:=coalesce(horizon,6);from_day:=(clock_timestamp() at time zone tz)::date;until_day:=from_day+horizon*7-1;
   for day in select d::date from generate_series(from_day::timestamp,until_day::timestamp,interval '1 day') d loop
    if not private.work_order_recurrence_matches(series.definition,day) then continue;end if;
    if exists(select 1 from public.work_order_occurrences where tenant_id=target_tenant and series_id=series.id and occurrence_on=day) then continue;end if;
    start_at:=(day+(series.definition->>'startsAt')::time) at time zone tz;
    end_at:=(day+(series.definition->>'endsAt')::time) at time zone tz;
    if start_at at time zone tz<>day+(series.definition->>'startsAt')::time or end_at at time zone tz<>day+(series.definition->>'endsAt')::time then
     insert into public.work_order_occurrences(tenant_id,series_id,occurrence_on,state,reason,series_version) values(target_tenant,series.id,day,'skipped','Tijd bestaat niet door overgang naar zomertijd',series.version);
     count_skipped:=count_skipped+1;continue;
    end if;
    if source.quote_id is not null then
     -- The existing conversion retains accepted lines, period prices and evidence.
     target:=public.commercial_next_visit(target_tenant,source.quote_id,day,gen_random_uuid());
     select * into created from public.work_orders where tenant_id=target_tenant and id=target;
     if exists(select 1 from public.work_order_occurrences where tenant_id=target_tenant and work_order_id=target) then raise exception 'Dit bezoek hoort al bij een andere reeks' using errcode='23514';end if;
    else
     target:=private.work_order_clone(target_tenant,source.id,series.title,source.day_instructions,day,'recurrence',true,true,true);
     -- Snapshot each new occurrence at its own commercial date. A contract task
     -- uses actual occurrence timestamps while it is copied, then awaits planning.
     update public.work_orders set planned_start_at=start_at,planned_end_at=end_at,projected_start_at=start_at,projected_end_at=end_at,commercial_terms=source.commercial_terms where id=target;
     for task in select * from public.work_order_tasks where tenant_id=target_tenant and work_order_id=source.id order by created_at,id loop
      insert into public.work_order_tasks(tenant_id,work_order_id,task_revision_id,task_code,task_name,duration_minutes,quantity,unit,unit_price_cents,vat_basis_points,agreement_line_id,added_by)
      values(target_tenant,target,task.task_revision_id,task.task_code,task.task_name,task.duration_minutes,task.quantity,task.unit,task.unit_price_cents,task.vat_basis_points,task.agreement_line_id,auth.uid());
     end loop;
     update public.work_orders set planned_start_at=null,planned_end_at=null,projected_start_at=null,projected_end_at=null where id=target;
     select * into created from public.work_orders where id=target;
    end if;
    -- Do not rewrite a visit that was previously created or planned manually.
    if created.status='planned' and created.projected_start_at is null and created.actual_start_at is null and not exists(select 1 from public.work_order_assignments where tenant_id=target_tenant and work_order_id=target) then
     update public.work_orders set required_personnel=(series.definition->>'requiredPersonnel')::integer,details=details||jsonb_build_object('recurrence_window',jsonb_build_object('startsAt',series.definition->>'startsAt','endsAt',series.definition->>'endsAt','timezone',tz,'start',start_at,'end',end_at)),version=version+1 where id=target returning * into created;
    end if;
    insert into public.work_order_occurrences(tenant_id,series_id,occurrence_on,work_order_id,state,series_version,generated_order_version) values(target_tenant,series.id,day,target,'generated',series.version,created.version);
    if target<>source.id then insert into public.work_order_relations(tenant_id,source_order_id,target_order_id,kind,reason,created_by) values(target_tenant,source.id,target,'recurrence',day::text,auth.uid()) on conflict(tenant_id,target_order_id) do nothing;end if;
    count_created:=count_created+1;
   end loop;
   result:=jsonb_build_object('id',series.id,'created',count_created,'skipped',count_skipped,'until',until_day);
  else raise exception 'Onbekende reeksactie' using errcode='23514';end if;
 end if;
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(target_tenant,auth.uid(),'work_order.'||serial_command,'work_order',source.id,result);
 insert into private.work_order_related_receipts(tenant_id,id,actor_id,command,payload,result) values(target_tenant,command_id,auth.uid(),serial_command,input,result);
 return result;
end $function$;

REVOKE ALL ON FUNCTION "public"."work_order_series_command"(uuid, uuid, text, jsonb) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.work_order_signature_settings (
  target_tenant uuid,
  target_object uuid  DEFAULT NULL::uuid,
  input         jsonb DEFAULT NULL::jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare cfg jsonb;mode text;employee boolean;waivers boolean;users jsonb;
begin
 if not private.work_order_access(target_tenant) then raise exception 'Geen toegang tot ondertekeninstellingen' using errcode='42501';end if;
 if target_object is not null and not exists(select 1 from public.objects where tenant_id=target_tenant and id=target_object) then raise exception 'Object niet beschikbaar' using errcode='42501';end if;
 if input is not null then
  if not private.has_role(target_tenant,array['tenant_admin','management']::public.app_role[]) then raise exception 'Alleen beheer kan ondertekeninstellingen wijzigen' using errcode='42501';end if;
  mode:=input->>'mode';employee:=coalesce((input->>'employeeRequired')::boolean,false);waivers:=coalesce((input->>'allowWaivers')::boolean,false);users:=coalesce(input->'waiverUsers','[]');
  if mode is null or mode not in ('none','optional','required','inherit') or(target_object is null and mode='inherit') then raise exception 'Kies een ondertekeninstelling' using errcode='23514';end if;
  if jsonb_typeof(users)<>'array' or exists(select 1 from jsonb_array_elements_text(users)u where not exists(select 1 from public.tenant_memberships m where m.tenant_id=target_tenant and m.user_id=u::uuid and m.status='active' and m.roles&&array['tenant_admin','management','finance']::public.app_role[])) then raise exception 'Kies bevoegde gebruikers voor gemotiveerde klantvrijstellingen' using errcode='23514';end if;
  if target_object is not null then update public.objects set signature_mode=mode where tenant_id=target_tenant and id=target_object;
  else update public.tenant_settings set signature_required_default=mode='required',settings=jsonb_set(settings,'{workOrders}',coalesce(settings->'workOrders','{}')||jsonb_build_object('signatureMode',mode,'employeeSignatureRequired',employee,'allowSignatureWaivers',waivers,'signatureWaiverUsers',users)) where tenant_id=target_tenant;end if;
  insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(target_tenant,auth.uid(),'signature_policy.settings',case when target_object is null then 'tenant' else 'object' end,coalesce(target_object,target_tenant),jsonb_build_object('mode',mode,'employeeRequired',employee,'allowWaivers',waivers));
 end if;
 select s.settings->'workOrders' into cfg from public.tenant_settings s where tenant_id=target_tenant;
 if target_object is not null then select signature_mode into mode from public.objects where tenant_id=target_tenant and id=target_object;
 else select coalesce(cfg->>'signatureMode',case when signature_required_default then 'required' else 'none' end) into mode from public.tenant_settings where tenant_id=target_tenant;end if;
 return jsonb_build_object('mode',mode,'employeeRequired',coalesce((cfg->>'employeeSignatureRequired')::boolean,false),'allowWaivers',coalesce((cfg->>'allowSignatureWaivers')::boolean,false),'waiverUsers',coalesce(cfg->'signatureWaiverUsers','[]'),
 'affectedDrafts',(select count(*) from public.work_orders where tenant_id=target_tenant and status='planned' and signature_policy_snapshot is null and (target_object is null or object_id=target_object)),
 'canManage',private.has_role(target_tenant,array['tenant_admin','management']::public.app_role[]),
 'reviewers',coalesce((select jsonb_agg(jsonb_build_object('id',m.user_id,'name',coalesce(p.full_name,u.email,'Beheerder'))) from public.tenant_memberships m join auth.users u on u.id=m.user_id left join public.personnel p on p.tenant_id=m.tenant_id and p.user_id=m.user_id where m.tenant_id=target_tenant and m.status='active' and m.roles&&array['tenant_admin','management','finance']::public.app_role[]),'[]'));
end $function$;

REVOKE ALL ON FUNCTION "public"."work_order_signature_settings"(uuid, uuid, jsonb) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.work_order_task_context (
  target_tenant uuid,
  target_task   uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare task public.work_order_tasks;work public.work_orders;
begin
 select * into task from public.work_order_tasks where tenant_id=target_tenant and id=target_task;
 select * into work from public.work_orders where tenant_id=target_tenant and id=task.work_order_id;
 if task.id is null or not private.object_session_active() or not private.object_visit_access(target_tenant,work.object_id,work.id)
 or not(private.object_manage(target_tenant) or private.is_work_order_assignee(target_tenant,work.id)) then raise exception 'Geen actuele taaktoegang' using errcode='42501';end if;
 return jsonb_build_object('assignedPersonnelId',task.assigned_personnel_id,'canAssign',private.object_manage(target_tenant),
 'crew',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name) order by p.full_name,p.id) from public.work_order_assignments a join public.personnel p on p.id=a.personnel_id and p.tenant_id=a.tenant_id where a.tenant_id=target_tenant and a.work_order_id=work.id and a.status not in ('cancelled','returned') and p.status='active'),'[]'),
 'contributions',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'actor',coalesce(p.full_name,'Medewerker'),'recordedAt',c.recorded_at,'fromQuantity',c.from_quantity,'toQuantity',c.to_quantity,'result',c.result,'note',c.note) order by c.execution_version desc) from public.work_order_task_contributions c left join public.personnel p on p.user_id=c.actor_id and p.tenant_id=c.tenant_id where c.tenant_id=target_tenant and c.task_id=task.id),'[]'));
end $function$;

REVOKE ALL ON FUNCTION "public"."work_order_task_context"(uuid, uuid) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.work_order_template_command (
  target_tenant uuid,
  command_id    uuid,
  command       text,
  input         jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v public.work_order_template_versions;t public.work_order_templates;prior private.work_order_commands;hash text;r jsonb;question jsonb;condition_question jsonb;ids text[]:='{}'::text[]; item jsonb;next_version int;
begin
 if not private.object_session_active() or not private.has_role(target_tenant,array['tenant_admin','management','planner']::public.app_role[]) or not private.service_enabled(target_tenant,'planning') then raise exception 'Geen toegang tot werkbontemplates' using errcode='42501';end if;
 if command_id is null or command is null or command not in ('save','publish','archive','copy') or jsonb_typeof(input) is distinct from 'object' then raise exception 'Ongeldige templateactie' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 hash:=encode(extensions.digest(input::text,'sha256'),'hex');select * into prior from private.work_order_commands where id=command_id;
 if found then if (prior.tenant_id,prior.actor_id,prior.command,prior.payload_hash) is distinct from (target_tenant,auth.uid(),'template:'||command,hash) then raise exception 'Ongeldige herhaalsleutel' using errcode='23514';end if;return prior.result;end if;
 select * into v from public.work_order_template_versions where tenant_id=target_tenant and id=nullif(input->>'revisionId','')::uuid for update;
 if nullif(input->>'revisionId','') is not null and v.id is null then raise exception 'Templateversie niet gevonden' using errcode='42501';end if;
 if v.id is not null and (input->>'editVersion')::bigint is distinct from v.edit_version then raise exception 'Deze template is intussen gewijzigd. Laad de actuele versie opnieuw.' using errcode='40001';end if;
 if command in ('publish','archive') then
   if v.id is null then raise exception 'Templateversie niet gevonden' using errcode='42501';end if;
   if command='publish' and v.state<>'draft' then raise exception 'Alleen een concept kan worden gepubliceerd' using errcode='23514';end if;
   select * into t from public.work_order_templates where id=v.template_id;
   if command='publish' then
    if t.kind='work_order' and jsonb_array_length(coalesce(v.definition->'tasks','[]'))=0 then raise exception 'Voeg minimaal één taak toe' using errcode='23514';end if;
    if t.kind='checklist' and jsonb_array_length(coalesce(v.definition->'questions','[]'))=0 then raise exception 'Voeg minimaal één controlevraag toe' using errcode='23514';end if;
   end if;
   update public.work_order_template_versions set state=case when command='publish' then 'published' else 'archived' end,published_at=case when command='publish' then clock_timestamp() else published_at end,edit_version=edit_version+1 where id=v.id;
 else
   if jsonb_typeof(input->'definition') is distinct from 'object' or length(btrim(coalesce(input->>'name',''))) not between 2 and 180 or coalesce(input->>'kind','') not in ('work_order','checklist') then raise exception 'Controleer naam en templategegevens' using errcode='23514';end if;
   if (input->'definition'->'signatureMode',input->'definition'->'employeeSignatureRequired') is distinct from (v.definition->'signatureMode',v.definition->'employeeSignatureRequired') and not private.has_role(target_tenant,array['tenant_admin','management']::public.app_role[]) then raise exception 'Alleen beheer wijzigt ondertekeninstellingen in templates' using errcode='42501';end if;
   if input->'definition' ? 'signatureMode' and coalesce(input->'definition'->>'signatureMode','') not in ('none','optional','required') or input->'definition' ? 'employeeSignatureRequired' and jsonb_typeof(input->'definition'->'employeeSignatureRequired') is distinct from 'boolean' then raise exception 'Controleer de ondertekeninstellingen van de template' using errcode='23514';end if;
   if jsonb_typeof(coalesce(input->'definition'->'questions','[]')) is distinct from 'array' or jsonb_typeof(coalesce(input->'definition'->'tasks','[]')) is distinct from 'array' or jsonb_typeof(coalesce(input->'definition'->'checklistRevisionIds','[]')) is distinct from 'array' then raise exception 'Templateonderdelen moeten lijsten zijn' using errcode='23514';end if;
   if jsonb_array_length(coalesce(input->'definition'->'questions','[]'))>100 or jsonb_array_length(coalesce(input->'definition'->'tasks','[]'))>100 then raise exception 'Maximaal 100 regels per template' using errcode='23514';end if;
   for question in select * from jsonb_array_elements(coalesce(input->'definition'->'questions','[]')) loop
    if coalesce(question->>'id','')='' or (question->>'id')=any(ids) or length(btrim(coalesce(question->>'label','')))<2 or coalesce(question->>'type','') not in ('check','boolean','choice','text','number','photo') then raise exception 'Controleer de checklistvragen; handtekeningen zijn geen checklistvraag' using errcode='23514';end if;
    if question ? 'condition' then
     if jsonb_typeof(question->'condition') is distinct from 'object' or not(coalesce(question->'condition'->>'questionId','')=any(ids)) or coalesce(jsonb_typeof(question->'condition'->'equals'),'') not in ('string','boolean') then raise exception 'Een voorwaarde bevat een geldig antwoord op een eerdere vraag' using errcode='23514';end if;
     select x into condition_question from jsonb_array_elements(input->'definition'->'questions')x where x->>'id'=question->'condition'->>'questionId';
     if condition_question->>'type' not in ('check','boolean','choice') or condition_question->>'type' in ('check','boolean') and jsonb_typeof(question->'condition'->'equals')<>'boolean' or condition_question->>'type'='choice' and (jsonb_typeof(question->'condition'->'equals')<>'string' or not(condition_question->'options' ? (question->'condition'->>'equals'))) then raise exception 'De voorwaarde past niet bij het eerdere antwoordtype' using errcode='23514';end if;
    end if;
    if question->>'type'='choice' then
     if jsonb_typeof(question->'options') is distinct from 'array' then raise exception 'Voeg antwoordopties toe' using errcode='23514';end if;
     if jsonb_array_length(question->'options') not between 1 and 30 or exists(select 1 from jsonb_array_elements(question->'options')option where jsonb_typeof(option)<>'string' or length(btrim(option#>>'{}')) not between 1 and 200) then raise exception 'Voeg geldige antwoordopties toe' using errcode='23514';end if;
    end if;
    ids:=array_append(ids,question->>'id');
   end loop;
   for item in select * from jsonb_array_elements(coalesce(input->'definition'->'tasks','[]')) loop
    if not exists(select 1 from public.task_revisions r join public.task_catalog c on c.tenant_id=r.tenant_id and c.id=r.task_id where r.tenant_id=target_tenant and r.id=(item->>'revisionId')::uuid and c.active) or (item->>'quantity') is null or not((item->>'quantity')::numeric>0) or (item->>'quantity')::numeric>100000 then raise exception 'Een template bevat een ongeldige catalogustaak' using errcode='23514';end if;
   end loop;
   for item in select * from jsonb_array_elements(coalesce(input->'definition'->'checklistRevisionIds','[]')) loop
    if not exists(select 1 from public.work_order_template_versions r join public.work_order_templates c on c.id=r.template_id where r.tenant_id=target_tenant and r.id=(item#>>'{}')::uuid and c.kind='checklist' and r.state='published') then raise exception 'Kies een gepubliceerde checklistversie' using errcode='23514';end if;
   end loop;
   if v.id is not null and v.state='draft' and command<>'copy' then
     select * into t from public.work_order_templates where id=v.template_id;
     if t.kind<>input->>'kind' then raise exception 'Het type template kan niet worden gewijzigd' using errcode='23514';end if;
     update public.work_order_templates set name=btrim(input->>'name') where id=t.id;
     update public.work_order_template_versions set definition=input->'definition',edit_version=edit_version+1 where id=v.id;
   else
     if v.id is not null and command<>'copy' then select * into t from public.work_order_templates where id=v.template_id;
     else insert into public.work_order_templates(tenant_id,name,kind,created_by) values(target_tenant,btrim(input->>'name'),input->>'kind',auth.uid()) returning * into t;end if;
     select coalesce(max(version),0)+1 into next_version from public.work_order_template_versions where template_id=t.id;
     insert into public.work_order_template_versions(tenant_id,template_id,version,definition,created_by) values(target_tenant,t.id,next_version,input->'definition',auth.uid()) returning * into v;
   end if;
 end if;
 r:=jsonb_build_object('ok',true,'id',v.id,'version',v.version);
 insert into private.work_order_commands values(command_id,target_tenant,auth.uid(),'template:'||command,hash,r,clock_timestamp());
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(target_tenant,auth.uid(),'work_template.'||command,'work_order_template',v.id,jsonb_build_object('version',v.version));
 return r;
end $function$;

REVOKE ALL ON FUNCTION "public"."work_order_template_command"(uuid, uuid, text, jsonb) FROM PUBLIC, "anon", "service_role";

ALTER TABLE "private"."work_order_policy_changes"
  ADD CONSTRAINT "work_order_policy_changes_tenant_id_work_order_id_fkey" FOREIGN KEY (tenant_id, work_order_id) REFERENCES public.work_orders(tenant_id, id);

ALTER TABLE "public"."objects"
  ADD CONSTRAINT "objects_signature_mode_check" CHECK ((signature_mode = ANY (ARRAY['inherit'::text, 'none'::text, 'optional'::text, 'required'::text])));

ALTER TABLE "public"."signatures"
  ADD CONSTRAINT "signatures_channel_check" CHECK ((channel = ANY (ARRAY['historical'::text, 'personnel_app_on_site'::text])));

ALTER TABLE "public"."signatures"
  ADD CONSTRAINT "signatures_signature_kind_check" CHECK ((signature_kind = ANY (ARRAY['customer'::text, 'employee'::text])));

ALTER TABLE "public"."signatures"
  ADD CONSTRAINT "signatures_version_kind_unique" UNIQUE (tenant_id, work_order_id, report_version, signature_kind);

ALTER TABLE "public"."work_order_checklist_answers"
  ADD CONSTRAINT "work_order_checklist_answers_tenant_id_attachment_id_fkey" FOREIGN KEY (tenant_id, attachment_id) REFERENCES public.attachments(tenant_id, id);

ALTER TABLE "public"."work_order_checklist_answers"
  ADD CONSTRAINT "work_order_checklist_answers_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id);

ALTER TABLE "public"."work_order_checklist_answers"
  ADD CONSTRAINT "work_order_checklist_answers_tenant_id_checklist_id_fkey" FOREIGN KEY (tenant_id, checklist_id) REFERENCES public.work_order_checklists(tenant_id, id)
    ON DELETE CASCADE;

ALTER TABLE "public"."work_order_checklists"
  ADD CONSTRAINT "work_order_checklists_tenant_id_work_order_id_fkey" FOREIGN KEY (tenant_id, work_order_id) REFERENCES public.work_orders(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE "public"."work_order_contacts"
  ADD CONSTRAINT "work_order_contacts_tenant_id_contact_id_fkey" FOREIGN KEY (tenant_id, contact_id) REFERENCES public.customer_contacts(tenant_id, id);

ALTER TABLE "public"."work_order_contacts"
  ADD CONSTRAINT "work_order_contacts_tenant_id_work_order_id_fkey" FOREIGN KEY (tenant_id, work_order_id) REFERENCES public.work_orders(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE "public"."work_order_exceptions"
  ADD CONSTRAINT "work_order_exceptions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE "public"."work_order_exceptions"
  ADD CONSTRAINT "work_order_exceptions_owner_user_id_fkey" FOREIGN KEY (owner_user_id) REFERENCES auth.users(id);

ALTER TABLE "public"."work_order_exceptions"
  ADD CONSTRAINT "work_order_exceptions_resolved_by_fkey" FOREIGN KEY (resolved_by) REFERENCES auth.users(id);

ALTER TABLE "public"."work_order_exceptions"
  ADD CONSTRAINT "work_order_exceptions_tenant_id_attachment_id_fkey" FOREIGN KEY (tenant_id, attachment_id) REFERENCES public.attachments(tenant_id, id);

ALTER TABLE "public"."work_order_exceptions"
  ADD CONSTRAINT "work_order_exceptions_tenant_id_work_order_id_fkey" FOREIGN KEY (tenant_id, work_order_id) REFERENCES public.work_orders(tenant_id, id);

ALTER TABLE "public"."work_order_material_usage"
  ADD CONSTRAINT "work_order_material_usage_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE "private"."work_order_material_finance"
  ADD CONSTRAINT "work_order_material_finance_tenant_id_usage_id_fkey" FOREIGN KEY (tenant_id, usage_id) REFERENCES public.work_order_material_usage(tenant_id, id);

ALTER TABLE "public"."work_order_material_usage"
  ADD CONSTRAINT "work_order_material_usage_tenant_id_task_id_fkey" FOREIGN KEY (tenant_id, task_id) REFERENCES public.work_order_tasks(tenant_id, id);

ALTER TABLE "public"."work_order_material_usage"
  ADD CONSTRAINT "work_order_material_usage_tenant_id_work_order_id_fkey" FOREIGN KEY (tenant_id, work_order_id) REFERENCES public.work_orders(tenant_id, id);

ALTER TABLE "public"."work_order_occurrences"
  ADD CONSTRAINT "work_order_occurrences_tenant_id_work_order_id_fkey" FOREIGN KEY (tenant_id, work_order_id) REFERENCES public.work_orders(tenant_id, id);

ALTER TABLE "public"."work_order_relations"
  ADD CONSTRAINT "work_order_relations_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE "public"."work_order_relations"
  ADD CONSTRAINT "work_order_relations_tenant_id_source_order_id_fkey" FOREIGN KEY (tenant_id, source_order_id) REFERENCES public.work_orders(tenant_id, id);

ALTER TABLE "public"."work_order_relations"
  ADD CONSTRAINT "work_order_relations_tenant_id_target_order_id_fkey" FOREIGN KEY (tenant_id, target_order_id) REFERENCES public.work_orders(tenant_id, id);

ALTER TABLE "public"."work_order_report_versions"
  ADD CONSTRAINT "work_order_report_versions_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES auth.users(id);

ALTER TABLE "public"."work_order_report_versions"
  ADD CONSTRAINT "work_order_report_versions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE "private"."work_order_signature_intents"
  ADD CONSTRAINT "work_order_signature_intents_tenant_id_report_id_fkey" FOREIGN KEY (tenant_id, report_id) REFERENCES public.work_order_report_versions(tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE "public"."signatures"
  ADD CONSTRAINT "signatures_report_fk" FOREIGN KEY (tenant_id, report_id) REFERENCES public.work_order_report_versions(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE "public"."work_order_report_versions"
  ADD CONSTRAINT "work_order_report_versions_tenant_id_work_order_id_fkey" FOREIGN KEY (tenant_id, work_order_id) REFERENCES public.work_orders(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE "public"."work_order_scope_transfers"
  ADD CONSTRAINT "work_order_scope_transfers_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE "public"."work_order_scope_transfers"
  ADD CONSTRAINT "work_order_scope_transfers_tenant_id_source_task_id_fkey" FOREIGN KEY (tenant_id, source_task_id) REFERENCES public.work_order_tasks(tenant_id, id);

ALTER TABLE "public"."work_order_scope_transfers"
  ADD CONSTRAINT "work_order_scope_transfers_tenant_id_target_order_id_fkey" FOREIGN KEY (tenant_id, target_order_id) REFERENCES public.work_orders(tenant_id, id);

ALTER TABLE "public"."work_order_scope_transfers"
  ADD CONSTRAINT "work_order_scope_transfers_tenant_id_target_task_id_fkey" FOREIGN KEY (tenant_id, target_task_id) REFERENCES public.work_order_tasks(tenant_id, id) DEFERRABLE
    INITIALLY DEFERRED;

ALTER TABLE "public"."work_order_series"
  ADD CONSTRAINT "work_order_series_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE "public"."work_order_occurrences"
  ADD CONSTRAINT "work_order_occurrences_tenant_id_series_id_fkey" FOREIGN KEY (tenant_id, series_id) REFERENCES public.work_order_series(tenant_id, id);

ALTER TABLE "public"."work_order_series"
  ADD CONSTRAINT "work_order_series_tenant_id_source_order_id_fkey" FOREIGN KEY (tenant_id, source_order_id) REFERENCES public.work_orders(tenant_id, id);

ALTER TABLE "public"."work_order_signature_waivers"
  ADD CONSTRAINT "work_order_signature_waivers_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id);

ALTER TABLE "public"."work_order_signature_waivers"
  ADD CONSTRAINT "work_order_signature_waivers_tenant_id_report_id_fkey" FOREIGN KEY (tenant_id, report_id) REFERENCES public.work_order_report_versions(tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE "public"."work_order_task_contributions"
  ADD CONSTRAINT "work_order_task_contributions_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id);

ALTER TABLE "public"."work_order_task_contributions"
  ADD CONSTRAINT "work_order_task_contributions_tenant_id_task_id_fkey" FOREIGN KEY (tenant_id, task_id) REFERENCES public.work_order_tasks(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE "public"."work_order_tasks"
  ADD CONSTRAINT "work_order_scope_root_fk" FOREIGN KEY (tenant_id, scope_root_task_id) REFERENCES public.work_order_tasks(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE "public"."work_order_tasks"
  ADD CONSTRAINT "work_order_tasks_execution_state_check"
    CHECK ((execution_state = ANY (ARRAY['planned'::text, 'in_progress'::text, 'completed'::text, 'partial'::text, 'not_done'::text, 'not_applicable'::text])));

ALTER TABLE "public"."work_order_tasks"
  ADD CONSTRAINT "work_order_tasks_personnel_fk" FOREIGN KEY (tenant_id, assigned_personnel_id) REFERENCES public.personnel(tenant_id, id);

ALTER TABLE "public"."work_order_tasks"
  ADD CONSTRAINT "work_order_tasks_transferred_quantity_check" CHECK ((transferred_quantity >= (0)::numeric));

ALTER TABLE "public"."work_order_tasks"
  ADD CONSTRAINT "work_order_tasks_withdrawn_quantity_check" CHECK ((withdrawn_quantity >= (0)::numeric));

ALTER TABLE "public"."work_order_template_versions"
  ADD CONSTRAINT "work_order_template_versions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE "public"."work_order_checklists"
  ADD CONSTRAINT "work_order_checklists_tenant_id_template_revision_id_fkey" FOREIGN KEY (tenant_id, template_revision_id)
    REFERENCES public.work_order_template_versions(tenant_id, id);

ALTER TABLE "public"."work_order_templates"
  ADD CONSTRAINT "work_order_templates_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE "public"."work_order_templates"
  ADD CONSTRAINT "work_order_templates_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);

ALTER TABLE "public"."work_order_template_versions"
  ADD CONSTRAINT "work_order_template_versions_tenant_id_template_id_fkey" FOREIGN KEY (tenant_id, template_id) REFERENCES public.work_order_templates(tenant_id, id);

ALTER TABLE "public"."work_orders"
  ADD CONSTRAINT "work_orders_budget_labor_minutes_check" CHECK ((budget_labor_minutes > 0));

ALTER TABLE "public"."work_orders"
  ADD CONSTRAINT "work_orders_lead_fk" FOREIGN KEY (tenant_id, lead_personnel_id) REFERENCES public.personnel(tenant_id, id);

ALTER TABLE "public"."work_orders"
  ADD CONSTRAINT "work_orders_planner_user_id_fkey" FOREIGN KEY (planner_user_id) REFERENCES auth.users(id);

ALTER TABLE "public"."work_orders"
  ADD CONSTRAINT "work_orders_planning_state_check" CHECK ((planning_state = ANY (ARRAY['draft'::text, 'unassigned'::text, 'tentative'::text, 'final'::text])));

ALTER TABLE "public"."work_orders"
  ADD CONSTRAINT "work_orders_priority_check" CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text])));

ALTER TABLE "public"."work_orders"
  ADD CONSTRAINT "work_orders_report_state_check"
    CHECK ((report_state = ANY (ARRAY['draft'::text, 'waiting_signature'::text, 'review'::text, 'correction'::text, 'approved'::text])));

ALTER TABLE "public"."work_orders"
  ADD CONSTRAINT "work_orders_signature_mode_check" CHECK ((signature_mode = ANY (ARRAY['inherit'::text, 'none'::text, 'optional'::text, 'required'::text])));

CREATE INDEX work_order_commands_tenant_idx ON private.work_order_commands USING btree (tenant_id, created_at);

CREATE INDEX work_order_policy_changes_order_idx ON private.work_order_policy_changes USING btree (tenant_id, work_order_id, created_at);

CREATE INDEX work_order_checklist_answers_attachment_idx ON public.work_order_checklist_answers USING btree (tenant_id, attachment_id);

CREATE INDEX work_order_checklists_revision_idx ON public.work_order_checklists USING btree (tenant_id, template_revision_id);

CREATE INDEX work_order_contacts_contact_idx ON public.work_order_contacts USING btree (tenant_id, contact_id);

CREATE INDEX work_order_exceptions_attachment_idx ON public.work_order_exceptions USING btree (tenant_id, attachment_id);

CREATE INDEX work_order_exceptions_order_idx ON public.work_order_exceptions USING btree (tenant_id, work_order_id, state);

CREATE INDEX work_order_exceptions_owner_idx ON public.work_order_exceptions USING btree (tenant_id, owner_user_id)
  WHERE (state = 'open'::text);

CREATE INDEX work_order_material_usage_order_idx ON public.work_order_material_usage USING btree (tenant_id, work_order_id);

CREATE INDEX work_order_relations_source_idx ON public.work_order_relations USING btree (tenant_id, source_order_id);

CREATE INDEX work_order_scope_root_idx ON public.work_order_tasks USING btree (tenant_id, scope_root_task_id);

CREATE INDEX work_order_series_source_idx ON public.work_order_series USING btree (tenant_id, source_order_id);

CREATE INDEX work_order_task_contributions_task_idx ON public.work_order_task_contributions USING btree (tenant_id, task_id, recorded_at);

CREATE INDEX work_order_tasks_personnel_idx ON public.work_order_tasks USING btree (tenant_id, assigned_personnel_id);

CREATE INDEX work_order_transfers_source_idx ON public.work_order_scope_transfers USING btree (tenant_id, source_task_id);

CREATE INDEX work_orders_tenant_deadline_idx ON public.work_orders USING btree (tenant_id, deadline, id)
  WHERE (archive_at IS NULL);

CREATE INDEX work_orders_tenant_lead_idx ON public.work_orders USING btree (tenant_id, lead_personnel_id);

CREATE INDEX work_orders_tenant_planner_idx ON public.work_orders USING btree (tenant_id, planner_user_id);

CREATE TRIGGER attachments_snapshot_guard
  BEFORE DELETE OR UPDATE ON public.attachments
  FOR EACH ROW
  EXECUTE FUNCTION private.work_order_report_source_guard();

CREATE TRIGGER work_order_invoice_signature_guard
  BEFORE INSERT OR UPDATE ON public.invoice_lines
  FOR EACH ROW
  EXECUTE FUNCTION private.work_order_invoice_signature_guard();

CREATE TRIGGER zz_work_order_lineage_invoice
  BEFORE INSERT OR UPDATE ON public.invoice_lines
  FOR EACH ROW
  EXECUTE FUNCTION private.work_order_lineage_invoice_guard();

CREATE TRIGGER report_entries_snapshot_guard
  BEFORE INSERT OR DELETE OR UPDATE ON public.report_entries
  FOR EACH ROW
  EXECUTE FUNCTION private.work_order_report_source_guard();

CREATE TRIGGER work_order_signature_immutable
  BEFORE DELETE OR UPDATE ON public.signatures
  FOR EACH ROW
  EXECUTE FUNCTION private.work_order_signature_immutable();

CREATE TRIGGER work_order_archive_assignment_guard
  BEFORE INSERT OR UPDATE ON public.work_order_assignments
  FOR EACH ROW
  EXECUTE FUNCTION private.work_order_archive_planning_guard();

CREATE TRIGGER work_order_report_immutable
  BEFORE DELETE OR UPDATE ON public.work_order_report_versions
  FOR EACH ROW
  EXECUTE FUNCTION private.work_order_report_immutable();

CREATE TRIGGER work_order_waiver_immutable
  BEFORE DELETE OR UPDATE ON public.work_order_signature_waivers
  FOR EACH ROW
  EXECUTE FUNCTION private.work_order_signature_immutable();

CREATE TRIGGER a0_work_order_scope
  BEFORE INSERT OR UPDATE ON public.work_order_tasks
  FOR EACH ROW
  EXECUTE FUNCTION private.work_order_scope_guard();

CREATE TRIGGER task_contribution
  AFTER UPDATE ON public.work_order_tasks
  FOR EACH ROW
  EXECUTE FUNCTION private.work_order_task_contribution();

CREATE TRIGGER work_order_task_assignee
  BEFORE INSERT OR UPDATE ON public.work_order_tasks
  FOR EACH ROW
  EXECUTE FUNCTION private.work_order_task_assignee_guard();

CREATE TRIGGER work_order_tasks_snapshot_guard
  BEFORE INSERT OR DELETE OR UPDATE ON public.work_order_tasks
  FOR EACH ROW
  EXECUTE FUNCTION private.work_order_report_source_guard();

CREATE TRIGGER work_order_template_immutable
  BEFORE DELETE OR UPDATE ON public.work_order_template_versions
  FOR EACH ROW
  EXECUTE FUNCTION private.work_order_template_guard();

CREATE TRIGGER work_order_approval_guard
  BEFORE INSERT OR UPDATE ON public.work_orders
  FOR EACH ROW
  EXECUTE FUNCTION private.work_order_approval_guard();

CREATE TRIGGER work_order_archive_planning_guard
  BEFORE UPDATE ON public.work_orders
  FOR EACH ROW
  EXECUTE FUNCTION private.work_order_archive_planning_guard();

CREATE TRIGGER work_order_policy_guard
  BEFORE INSERT OR UPDATE ON public.work_orders
  FOR EACH ROW
  EXECUTE FUNCTION private.work_order_policy_guard();

CREATE POLICY "report_entries_insert" ON "public"."report_entries"
  FOR INSERT
  TO "authenticated"
  WITH
    CHECK
    ((private.has_role(tenant_id, ARRAY['tenant_admin'::public.app_role, 'management'::public.app_role, 'planner'::public.app_role]) OR ((author_user_id = ( SELECT auth.uid() AS
    uid)) AND private.staff_report_editable(tenant_id, work_order_id))));

CREATE POLICY "report_entries_update" ON "public"."report_entries"
  FOR UPDATE
  TO "authenticated"
  USING
    ((private.has_role(tenant_id, ARRAY['tenant_admin'::public.app_role, 'management'::public.app_role, 'planner'::public.app_role]) OR ((author_user_id = ( SELECT auth.uid() AS
    uid)) AND private.staff_report_editable(tenant_id, work_order_id))))
  WITH
    CHECK
    ((private.has_role(tenant_id, ARRAY['tenant_admin'::public.app_role, 'management'::public.app_role, 'planner'::public.app_role]) OR ((author_user_id = ( SELECT auth.uid() AS
    uid)) AND private.staff_report_editable(tenant_id, work_order_id))));

CREATE POLICY "status_events_personal_execution" ON "public"."status_events"
  AS RESTRICTIVE
  FOR SELECT
  TO "authenticated"
  USING
    ((private.has_role(tenant_id, ARRAY['tenant_admin'::public.app_role, 'management'::public.app_role, 'planner'::public.app_role, 'finance'::public.app_role]) OR (EXISTS ( SELECT
    1
   FROM public.work_order_assignments a
  WHERE ((a.tenant_id = status_events.tenant_id) AND (a.id = status_events.assignment_id) AND (a.personnel_id = private.current_personnel_id(a.tenant_id)))))));

CREATE POLICY "task_revision_financial_projection" ON "public"."task_revisions"
  AS RESTRICTIVE
  FOR SELECT
  TO "authenticated"
  USING (private.has_role(tenant_id, ARRAY['tenant_admin'::public.app_role, 'management'::public.app_role, 'finance'::public.app_role]));

CREATE POLICY "travel_legs_personal_execution" ON "public"."travel_legs"
  AS RESTRICTIVE
  FOR SELECT
  TO "authenticated"
  USING
    ((private.has_role(tenant_id, ARRAY['tenant_admin'::public.app_role, 'management'::public.app_role, 'planner'::public.app_role, 'finance'::public.app_role]) OR (EXISTS ( SELECT
    1
   FROM public.work_order_assignments a
  WHERE ((a.tenant_id = travel_legs.tenant_id) AND (a.id = travel_legs.assignment_id) AND (a.personnel_id = private.current_personnel_id(a.tenant_id)))))));

CREATE POLICY "assignments_personal_execution" ON "public"."work_order_assignments"
  AS RESTRICTIVE
  FOR SELECT
  TO "authenticated"
  USING
    (((personnel_id = private.current_personnel_id(tenant_id)) OR private.has_role(tenant_id, ARRAY['tenant_admin'::public.app_role, 'management'::public.app_role,
    'planner'::public.app_role, 'finance'::public.app_role])));

CREATE POLICY "work_order_reports_read" ON "public"."work_order_report_versions"
  FOR SELECT
  TO "authenticated"
  USING ((private.can_access_work_order(tenant_id, work_order_id) AND private.service_enabled(tenant_id, 'rapportage'::text)));

CREATE POLICY "signature_waivers_read" ON "public"."work_order_signature_waivers"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.work_order_report_versions r
  WHERE ((r.id = work_order_signature_waivers.report_id) AND (r.tenant_id = work_order_signature_waivers.tenant_id)))));

CREATE POLICY "work_order_task_financial_projection" ON "public"."work_order_tasks"
  AS RESTRICTIVE
  FOR SELECT
  TO "authenticated"
  USING (private.has_role(tenant_id, ARRAY['tenant_admin'::public.app_role, 'management'::public.app_role, 'finance'::public.app_role]));

CREATE POLICY "work_orders_staff_projection" ON "public"."work_orders"
  AS RESTRICTIVE
  FOR SELECT
  TO "authenticated"
  USING (private.has_role(tenant_id, ARRAY['tenant_admin'::public.app_role, 'management'::public.app_role, 'planner'::public.app_role, 'finance'::public.app_role]));

CREATE POLICY "report_files_immutable_delete" ON "storage"."objects"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING ((NOT private.report_storage_frozen(bucket_id, name)));

CREATE POLICY "report_files_immutable_update" ON "storage"."objects"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING ((NOT private.report_storage_frozen(bucket_id, name)))
  WITH CHECK ((NOT private.report_storage_frozen(bucket_id, name)));

CREATE POLICY "signature_files_no_client_delete" ON "storage"."objects"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING ((bucket_id <> 'signatures'::text));

CREATE POLICY "signature_files_no_client_write" ON "storage"."objects"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (((bucket_id <> 'signatures'::text) OR (EXISTS ( SELECT 1
   FROM public.signatures s
  WHERE ((s.storage_path = objects.name) AND private.can_access_work_order(s.tenant_id, s.work_order_id))))))
  WITH CHECK ((bucket_id <> 'signatures'::text));

REVOKE ALL ON FUNCTION "private"."report_storage_frozen"(text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."report_storage_frozen"(text, text) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."staff_report_editable"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."staff_report_editable"(uuid, uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."staff_work_order_result"(public.work_orders) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."staff_work_order_result"(public.work_orders) TO "postgres";

REVOKE ALL ON FUNCTION "private"."validate_work_order_recurrence"(jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."validate_work_order_recurrence"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "private"."validate_work_order_report"(public.work_orders) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."validate_work_order_report"(public.work_orders) TO "postgres";

REVOKE ALL ON FUNCTION "private"."work_order_access"(uuid, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."work_order_access"(uuid, boolean) TO "postgres";

REVOKE ALL ON FUNCTION "private"."work_order_approval_guard"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."work_order_approval_guard"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."work_order_archive_planning_guard"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."work_order_archive_planning_guard"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."work_order_checklist_errors"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."work_order_checklist_errors"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."work_order_checklist_ready"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."work_order_checklist_ready"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."work_order_clone"(uuid, uuid, text, text, date, text, boolean, boolean, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."work_order_clone"(uuid, uuid, text, text, date, text, boolean, boolean, boolean) TO "postgres";

REVOKE ALL ON FUNCTION "private"."work_order_execution_actor"(uuid, uuid, uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."work_order_execution_actor"(uuid, uuid, uuid, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."work_order_invoice_signature_guard"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."work_order_invoice_signature_guard"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."work_order_lineage_authorized"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."work_order_lineage_authorized"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."work_order_lineage_invoice_guard"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."work_order_lineage_invoice_guard"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."work_order_policy_guard"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."work_order_policy_guard"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."work_order_recurrence_matches"(jsonb, date) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."work_order_recurrence_matches"(jsonb, date) TO "postgres";

REVOKE ALL ON FUNCTION "private"."work_order_report_immutable"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."work_order_report_immutable"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."work_order_report_ready"(public.work_order_report_versions) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."work_order_report_ready"(public.work_order_report_versions) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."work_order_report_snapshot"(public.work_orders, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."work_order_report_snapshot"(public.work_orders, text) TO "postgres";

REVOKE ALL ON FUNCTION "private"."work_order_report_source_guard"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."work_order_report_source_guard"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."work_order_review_legacy"(uuid, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."work_order_review_legacy"(uuid, text, text) TO "postgres";

REVOKE ALL ON FUNCTION "private"."work_order_row"(uuid, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."work_order_row"(uuid, boolean) TO "postgres";

REVOKE ALL ON FUNCTION "private"."work_order_scope_guard"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."work_order_scope_guard"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."work_order_signature_immutable"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."work_order_signature_immutable"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."work_order_signature_policy"(public.work_orders) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."work_order_signature_policy"(public.work_orders) TO "postgres";

REVOKE ALL ON FUNCTION "private"."work_order_task_assignee_guard"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."work_order_task_assignee_guard"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."work_order_task_contribution"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."work_order_task_contribution"() TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."work_order_template_guard"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."work_order_transition_legacy"(uuid, text, bigint, text, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."work_order_transition_legacy"(uuid, text, bigint, text, text, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."answer_work_order_checklist"(uuid, jsonb) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."assign_work_order_task"(uuid, uuid, bigint, uuid) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."change_work_order_signature_policy"(uuid, bigint, text, boolean, text, uuid) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."expired_work_order_signature_uploads"() TO "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."finalize_work_order_signature"(uuid, text) TO "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."mutate_work_order"(uuid, jsonb) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."prepare_work_order_signature"(uuid, uuid, text, text, text, text, uuid) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."review_work_order_report"(uuid, uuid, text, text) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."save_work_order"(uuid, jsonb) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."staff_workspace"(uuid) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."submit_work_order_report"(uuid, bigint, text, uuid) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."waive_work_order_signature"(uuid, text) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."work_order_communication"(uuid, jsonb) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."work_order_dossier"(uuid, uuid) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."work_order_exception_command"(uuid, jsonb) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."work_order_exceptions"(uuid, uuid) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."work_order_list"(uuid, jsonb) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."work_order_options"(uuid) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."work_order_related_command"(uuid, uuid, text, jsonb) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."work_order_related_context"(uuid, uuid) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."work_order_report"(uuid) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."work_order_report_file"(uuid, uuid) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."work_order_series_command"(uuid, uuid, text, jsonb) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."work_order_signature_settings"(uuid, uuid, jsonb) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."work_order_task_context"(uuid, uuid) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."work_order_template_command"(uuid, uuid, text, jsonb) TO "authenticated", "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."work_order_commands" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."work_order_material_finance" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."work_order_policy_changes" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."work_order_related_receipts" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."work_order_signature_intents" TO "postgres";

REVOKE ALL ON TABLE "public"."review_decisions" FROM "authenticated";

GRANT SELECT ON TABLE "public"."review_decisions" TO "authenticated";

REVOKE ALL ON TABLE "public"."signatures" FROM "authenticated";

GRANT SELECT ON TABLE "public"."signatures" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."work_order_checklist_answers" TO "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."work_order_checklists" TO "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."work_order_contacts" TO "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."work_order_exceptions" TO "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."work_order_material_usage" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."work_order_occurrences" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."work_order_relations" TO "postgres";

REVOKE ALL ON TABLE "public"."work_order_report_versions" FROM "authenticated";

GRANT SELECT ON TABLE "public"."work_order_report_versions" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."work_order_report_versions" TO "postgres";

REVOKE ALL ON TABLE "public"."work_order_report_versions" FROM "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."work_order_report_versions" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."work_order_scope_transfers" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."work_order_series" TO "postgres";

REVOKE ALL ON TABLE "public"."work_order_signature_waivers" FROM "authenticated";

GRANT SELECT ON TABLE "public"."work_order_signature_waivers" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."work_order_signature_waivers" TO "postgres";

REVOKE ALL ON TABLE "public"."work_order_signature_waivers" FROM "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."work_order_signature_waivers" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."work_order_task_contributions" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."work_order_template_versions" TO "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."work_order_templates" TO "postgres", "service_role";
