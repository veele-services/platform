-- Quality & Checklists: immutable templates, contextual resolution and safe assignment snapshots.
-- Forward-only. Existing assignment_tasks remain unchanged and no production data is rewritten.

INSERT INTO public.modules (key, name, description, category, is_system, is_enabled_by_default)
VALUES ('quality', 'Quality & Checklists', 'Versiebeheer, contextuele checklists en kwaliteitsbewijs op werkbonnen.', 'operations', true, true)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  is_system = true,
  is_enabled_by_default = true,
  updated_at = now();

INSERT INTO public.plan_modules (plan_id, module_id, is_included)
SELECT plan.id, module.id, true
FROM public.plans plan
JOIN public.modules module ON module.key = 'quality'
ON CONFLICT (plan_id, module_id) DO UPDATE SET is_included = true, updated_at = now();

INSERT INTO public.tenant_modules (tenant_id, module_id, is_enabled, source, enabled_at, disabled_at)
SELECT tenant.id, module.id, true, 'system', now(), NULL::timestamptz
FROM public.tenants tenant
JOIN public.modules module ON module.key = 'quality'
ON CONFLICT (tenant_id, module_id) DO UPDATE SET
  is_enabled = true,
  source = CASE WHEN tenant_modules.is_enabled THEN tenant_modules.source ELSE 'system' END,
  enabled_at = COALESCE(tenant_modules.enabled_at, now()),
  disabled_at = NULL,
  updated_at = now();

WITH dependencies(module_key, depends_on_key) AS (
  VALUES ('quality', 'assignments'), ('quality', 'objects')
)
INSERT INTO public.module_dependencies (module_id, depends_on_module_id)
SELECT child.id, parent.id
FROM dependencies dependency
JOIN public.modules child ON child.key = dependency.module_key
JOIN public.modules parent ON parent.key = dependency.depends_on_key
ON CONFLICT DO NOTHING;

INSERT INTO public.permissions (resource, action, description)
VALUES
  ('checklists', 'read', 'Checklisttemplates, koppelingen en werkbonsnapshots bekijken.'),
  ('checklists', 'respond', 'Toegewezen checklistvragen en bewijs invullen.'),
  ('checklists', 'write', 'Checklistconcepten en koppelingen beheren.'),
  ('checklists', 'publish', 'Onveranderlijke checklistversies publiceren.'),
  ('checklists', 'review', 'Reconciliatievoorstellen en vrijstellingen beoordelen.')
ON CONFLICT (resource, action) DO UPDATE SET description = EXCLUDED.description;

WITH grants(role_name, action) AS (
  VALUES
    ('Management', 'read'), ('Management', 'respond'), ('Management', 'write'), ('Management', 'publish'), ('Management', 'review'),
    ('Administration', 'read'), ('Administration', 'write'), ('Administration', 'publish'), ('Administration', 'review'),
    ('Planning', 'read'), ('Planning', 'review'),
    ('Teamlead', 'read'), ('Teamlead', 'respond'), ('Teamlead', 'review'),
    ('Employee', 'read'), ('Employee', 'respond'),
    ('Flex Employee', 'read'), ('Flex Employee', 'respond')
)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM grants grant_row
JOIN public.roles role ON role.name = grant_row.role_name
JOIN public.permissions permission ON permission.resource = 'checklists' AND permission.action = grant_row.action
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.tenant_role_permissions (tenant_role_id, permission_id, created_at)
SELECT tenant_role.id, role_permission.permission_id, now()
FROM public.tenant_roles tenant_role
JOIN public.role_permissions role_permission ON role_permission.role_id = tenant_role.template_role_id
JOIN public.permissions permission ON permission.id = role_permission.permission_id AND permission.resource = 'checklists'
WHERE tenant_role.template_role_id IS NOT NULL
ON CONFLICT (tenant_role_id, permission_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  family_key varchar(120) NOT NULL,
  name varchar(240) NOT NULL,
  description text,
  cardinality varchar(40) NOT NULL,
  is_protected boolean NOT NULL DEFAULT false,
  is_waivable boolean NOT NULL DEFAULT false,
  status varchar(20) NOT NULL DEFAULT 'draft',
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  archived_by uuid,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT checklist_templates_cardinality_check CHECK (cardinality IN ('per_work_order', 'per_object', 'per_task_code', 'per_task_instance')),
  CONSTRAINT checklist_templates_status_check CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT checklist_templates_protected_waiver_check CHECK (NOT (is_protected AND is_waivable)),
  CONSTRAINT checklist_templates_family_key_check CHECK (family_key = lower(trim(family_key)) AND family_key ~ '^[a-z0-9][a-z0-9._-]{1,119}$'),
  CONSTRAINT checklist_templates_archive_check CHECK ((status = 'archived') = (archived_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS checklist_templates_tenant_family_idx ON public.checklist_templates(tenant_id, family_key);
CREATE INDEX IF NOT EXISTS checklist_templates_tenant_status_idx ON public.checklist_templates(tenant_id, status);

CREATE TABLE IF NOT EXISTS public.checklist_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  template_id uuid NOT NULL REFERENCES public.checklist_templates(id) ON DELETE RESTRICT,
  version_number integer NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'draft',
  schema jsonb NOT NULL,
  schema_hash varchar(80) NOT NULL,
  change_summary text,
  created_by uuid NOT NULL,
  published_by uuid,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT checklist_template_versions_number_check CHECK (version_number > 0),
  CONSTRAINT checklist_template_versions_status_check CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT checklist_template_versions_schema_check CHECK (jsonb_typeof(schema) = 'object' AND jsonb_typeof(schema->'sections') = 'array'),
  CONSTRAINT checklist_template_versions_publish_check CHECK ((status = 'draft' AND published_at IS NULL AND published_by IS NULL) OR (status IN ('published', 'archived') AND published_at IS NOT NULL AND published_by IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS checklist_template_versions_number_idx ON public.checklist_template_versions(template_id, version_number);
CREATE UNIQUE INDEX IF NOT EXISTS checklist_template_versions_tenant_id_idx ON public.checklist_template_versions(tenant_id, id);
CREATE INDEX IF NOT EXISTS checklist_template_versions_tenant_status_idx ON public.checklist_template_versions(tenant_id, status);

CREATE TABLE IF NOT EXISTS public.checklist_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  template_id uuid REFERENCES public.checklist_templates(id) ON DELETE RESTRICT,
  template_version_id uuid REFERENCES public.checklist_template_versions(id) ON DELETE RESTRICT,
  version_strategy varchar(30) NOT NULL DEFAULT 'latest_published',
  status varchar(20) NOT NULL DEFAULT 'active',
  mode varchar(20) NOT NULL DEFAULT 'add',
  assignment_id uuid REFERENCES public.assignments(id) ON DELETE RESTRICT,
  sector_id uuid REFERENCES public.sectors(id) ON DELETE RESTRICT,
  customer_id uuid REFERENCES public.customers(id) ON DELETE RESTRICT,
  object_type varchar(100),
  object_id uuid REFERENCES public.objects(id) ON DELETE RESTRICT,
  task_code_id uuid REFERENCES public.task_codes(id) ON DELETE RESTRICT,
  tenant_task_code_id uuid REFERENCES public.tenant_task_codes(id) ON DELETE RESTRICT,
  target_template_id uuid REFERENCES public.checklist_templates(id) ON DELETE RESTRICT,
  target_family_key varchar(120),
  active_from timestamptz,
  active_until timestamptz,
  auto_attach boolean NOT NULL DEFAULT true,
  required boolean NOT NULL DEFAULT false,
  blocking_moments jsonb NOT NULL DEFAULT '[]'::jsonb,
  skip_allowed boolean NOT NULL DEFAULT false,
  personnel_can_remove boolean NOT NULL DEFAULT false,
  minimum_photos integer NOT NULL DEFAULT 0,
  signature_required boolean NOT NULL DEFAULT false,
  deviation_note_required boolean NOT NULL DEFAULT false,
  display_name varchar(240),
  instruction text,
  instruction_mode varchar(20) NOT NULL DEFAULT 'append',
  sort_order integer NOT NULL DEFAULT 0,
  tie_breaker integer NOT NULL DEFAULT 0,
  reason text,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT checklist_bindings_version_strategy_check CHECK (version_strategy IN ('pinned', 'latest_published')),
  CONSTRAINT checklist_bindings_status_check CHECK (status IN ('active', 'inactive', 'archived')),
  CONSTRAINT checklist_bindings_mode_check CHECK (mode IN ('add', 'available', 'replace', 'suppress')),
  CONSTRAINT checklist_bindings_template_check CHECK ((mode = 'suppress') OR template_id IS NOT NULL),
  CONSTRAINT checklist_bindings_pinned_check CHECK ((version_strategy = 'pinned' AND template_version_id IS NOT NULL) OR (version_strategy = 'latest_published' AND template_version_id IS NULL)),
  CONSTRAINT checklist_bindings_control_check CHECK ((mode IN ('replace', 'suppress') AND (target_template_id IS NOT NULL OR nullif(trim(target_family_key), '') IS NOT NULL) AND nullif(trim(reason), '') IS NOT NULL) OR mode IN ('add', 'available')),
  CONSTRAINT checklist_bindings_validity_check CHECK (active_until IS NULL OR active_from IS NULL OR active_until >= active_from),
  CONSTRAINT checklist_bindings_minimum_photos_check CHECK (minimum_photos >= 0),
  CONSTRAINT checklist_bindings_blocking_check CHECK (jsonb_typeof(blocking_moments) = 'array' AND blocking_moments <@ '["before_start", "before_complete", "before_report_submit"]'::jsonb),
  CONSTRAINT checklist_bindings_instruction_mode_check CHECK (instruction_mode IN ('append', 'replace'))
);
CREATE INDEX IF NOT EXISTS checklist_bindings_tenant_status_idx ON public.checklist_bindings(tenant_id, status);
CREATE INDEX IF NOT EXISTS checklist_bindings_assignment_idx ON public.checklist_bindings(tenant_id, assignment_id);
CREATE INDEX IF NOT EXISTS checklist_bindings_sector_idx ON public.checklist_bindings(tenant_id, sector_id);
CREATE INDEX IF NOT EXISTS checklist_bindings_customer_idx ON public.checklist_bindings(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS checklist_bindings_object_idx ON public.checklist_bindings(tenant_id, object_id);
CREATE INDEX IF NOT EXISTS checklist_bindings_task_code_idx ON public.checklist_bindings(tenant_id, task_code_id, tenant_task_code_id);

CREATE TABLE IF NOT EXISTS public.assignment_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE RESTRICT,
  template_id uuid NOT NULL REFERENCES public.checklist_templates(id) ON DELETE RESTRICT,
  template_version_id uuid NOT NULL REFERENCES public.checklist_template_versions(id) ON DELETE RESTRICT,
  cardinality varchar(40) NOT NULL,
  cardinality_key varchar(300) NOT NULL,
  status varchar(40) NOT NULL DEFAULT 'active',
  template_snapshot jsonb NOT NULL,
  effective_rules jsonb NOT NULL,
  source_fingerprint varchar(80) NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  response_count integer NOT NULL DEFAULT 0,
  locked_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assignment_checklists_cardinality_check CHECK (cardinality IN ('per_work_order', 'per_object', 'per_task_code', 'per_task_instance')),
  CONSTRAINT assignment_checklists_status_check CHECK (status IN ('active', 'completed', 'cancelled', 'detached_pending_review', 'not_applicable', 'waived')),
  CONSTRAINT assignment_checklists_snapshot_check CHECK (jsonb_typeof(template_snapshot) = 'object' AND jsonb_typeof(effective_rules) = 'object'),
  CONSTRAINT assignment_checklists_response_count_check CHECK (response_count >= 0),
  CONSTRAINT assignment_checklists_completed_check CHECK ((status = 'completed') = (completed_at IS NOT NULL)),
  CONSTRAINT assignment_checklists_cancelled_check CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS assignment_checklists_cardinality_idx ON public.assignment_checklists(tenant_id, assignment_id, template_id, cardinality, cardinality_key);
CREATE UNIQUE INDEX IF NOT EXISTS assignment_checklists_tenant_id_idx ON public.assignment_checklists(tenant_id, id);
CREATE INDEX IF NOT EXISTS assignment_checklists_assignment_status_idx ON public.assignment_checklists(tenant_id, assignment_id, status);
CREATE INDEX IF NOT EXISTS assignment_checklists_template_idx ON public.assignment_checklists(tenant_id, template_id);

CREATE TABLE IF NOT EXISTS public.assignment_checklist_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  assignment_checklist_id uuid NOT NULL REFERENCES public.assignment_checklists(id) ON DELETE RESTRICT,
  binding_id uuid NOT NULL REFERENCES public.checklist_bindings(id) ON DELETE RESTRICT,
  source_key varchar(300) NOT NULL,
  priority integer NOT NULL,
  specificity integer NOT NULL,
  source_snapshot jsonb NOT NULL,
  decisions jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  detached_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assignment_checklist_sources_decisions_check CHECK (jsonb_typeof(decisions) = 'array'),
  CONSTRAINT assignment_checklist_sources_detached_check CHECK (is_active OR detached_at IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS assignment_checklist_sources_identity_idx ON public.assignment_checklist_sources(assignment_checklist_id, binding_id, source_key);
CREATE INDEX IF NOT EXISTS assignment_checklist_sources_tenant_checklist_idx ON public.assignment_checklist_sources(tenant_id, assignment_checklist_id, is_active);

CREATE TABLE IF NOT EXISTS public.assignment_checklist_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  assignment_checklist_id uuid NOT NULL REFERENCES public.assignment_checklists(id) ON DELETE RESTRICT,
  snapshot_item_id varchar(160) NOT NULL,
  value jsonb NOT NULL DEFAULT 'null'::jsonb,
  is_deviation boolean NOT NULL DEFAULT false,
  deviation_note text,
  revision integer NOT NULL DEFAULT 1,
  last_operation_key varchar(200),
  answered_by uuid NOT NULL,
  answered_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assignment_checklist_answers_revision_check CHECK (revision > 0),
  CONSTRAINT assignment_checklist_answers_deviation_check CHECK (NOT is_deviation OR nullif(trim(deviation_note), '') IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS assignment_checklist_answers_item_idx ON public.assignment_checklist_answers(assignment_checklist_id, snapshot_item_id);
CREATE UNIQUE INDEX IF NOT EXISTS assignment_checklist_answers_operation_idx ON public.assignment_checklist_answers(tenant_id, last_operation_key) WHERE last_operation_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS assignment_checklist_answers_tenant_checklist_idx ON public.assignment_checklist_answers(tenant_id, assignment_checklist_id);

CREATE TABLE IF NOT EXISTS public.assignment_checklist_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  assignment_checklist_id uuid NOT NULL REFERENCES public.assignment_checklists(id) ON DELETE RESTRICT,
  answer_id uuid REFERENCES public.assignment_checklist_answers(id) ON DELETE RESTRICT,
  snapshot_item_id varchar(160) NOT NULL,
  kind varchar(20) NOT NULL,
  storage_path text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  operation_key varchar(200) NOT NULL,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assignment_checklist_evidence_kind_check CHECK (kind IN ('photo', 'file', 'signature')),
  CONSTRAINT assignment_checklist_evidence_metadata_check CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE UNIQUE INDEX IF NOT EXISTS assignment_checklist_evidence_operation_idx ON public.assignment_checklist_evidence(tenant_id, operation_key);
CREATE UNIQUE INDEX IF NOT EXISTS assignment_checklist_evidence_storage_idx ON public.assignment_checklist_evidence(tenant_id, storage_path);
CREATE INDEX IF NOT EXISTS assignment_checklist_evidence_item_idx ON public.assignment_checklist_evidence(tenant_id, assignment_checklist_id, snapshot_item_id);

CREATE TABLE IF NOT EXISTS public.checklist_reconciliation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE RESTRICT,
  trigger varchar(80) NOT NULL,
  idempotency_key varchar(240) NOT NULL,
  context_fingerprint varchar(80) NOT NULL,
  context_snapshot jsonb NOT NULL,
  desired_snapshot jsonb NOT NULL,
  diff jsonb NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'pending',
  retry_count integer NOT NULL DEFAULT 0,
  last_error_code varchar(100),
  review_reason text,
  decision varchar(40),
  decision_reason text,
  actor_user_id uuid,
  decided_by uuid,
  decided_at timestamptz,
  processing_started_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT checklist_reconciliation_events_status_check CHECK (status IN ('pending', 'processing', 'applied', 'pending_review', 'failed', 'dismissed')),
  CONSTRAINT checklist_reconciliation_events_retry_check CHECK (retry_count >= 0),
  CONSTRAINT checklist_reconciliation_events_json_check CHECK (jsonb_typeof(context_snapshot) = 'object' AND jsonb_typeof(desired_snapshot) = 'object' AND jsonb_typeof(diff) = 'object'),
  CONSTRAINT checklist_reconciliation_events_decision_check CHECK ((decided_at IS NULL AND decided_by IS NULL) OR (decided_at IS NOT NULL AND decided_by IS NOT NULL AND nullif(trim(decision_reason), '') IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS checklist_reconciliation_events_idempotency_idx ON public.checklist_reconciliation_events(tenant_id, idempotency_key);
CREATE INDEX IF NOT EXISTS checklist_reconciliation_events_queue_idx ON public.checklist_reconciliation_events(tenant_id, status, created_at);
CREATE INDEX IF NOT EXISTS checklist_reconciliation_events_assignment_idx ON public.checklist_reconciliation_events(tenant_id, assignment_id, status);

CREATE TABLE IF NOT EXISTS public.checklist_waivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  assignment_checklist_id uuid NOT NULL REFERENCES public.assignment_checklists(id) ON DELETE RESTRICT,
  kind varchar(30) NOT NULL,
  reason text NOT NULL,
  original_sources jsonb NOT NULL,
  template_version_id uuid NOT NULL REFERENCES public.checklist_template_versions(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL,
  approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT checklist_waivers_kind_check CHECK (kind IN ('waived', 'not_applicable')),
  CONSTRAINT checklist_waivers_reason_check CHECK (nullif(trim(reason), '') IS NOT NULL),
  CONSTRAINT checklist_waivers_sources_check CHECK (jsonb_typeof(original_sources) = 'array')
);
CREATE INDEX IF NOT EXISTS checklist_waivers_tenant_checklist_idx ON public.checklist_waivers(tenant_id, assignment_checklist_id, created_at);

CREATE TABLE IF NOT EXISTS public.checklist_configuration_warnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  binding_id uuid REFERENCES public.checklist_bindings(id) ON DELETE RESTRICT,
  reconciliation_event_id uuid REFERENCES public.checklist_reconciliation_events(id) ON DELETE RESTRICT,
  code varchar(100) NOT NULL,
  message text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  fingerprint varchar(80) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'open',
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT checklist_configuration_warnings_status_check CHECK (status IN ('open', 'resolved')),
  CONSTRAINT checklist_configuration_warnings_details_check CHECK (jsonb_typeof(details) = 'object'),
  CONSTRAINT checklist_configuration_warnings_resolved_check CHECK ((status = 'open' AND resolved_at IS NULL AND resolved_by IS NULL) OR (status = 'resolved' AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS checklist_configuration_warnings_fingerprint_idx ON public.checklist_configuration_warnings(tenant_id, fingerprint);
CREATE INDEX IF NOT EXISTS checklist_configuration_warnings_status_idx ON public.checklist_configuration_warnings(tenant_id, status, created_at);

-- Enforce tenant consistency even when service-role code bypasses RLS.
CREATE OR REPLACE FUNCTION public.checklist_assert_tenant_links()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_TABLE_NAME = 'checklist_template_versions' THEN
    IF NOT EXISTS (SELECT 1 FROM public.checklist_templates t WHERE t.id = NEW.template_id AND t.tenant_id = NEW.tenant_id) THEN RAISE EXCEPTION 'checklist tenant mismatch'; END IF;
  ELSIF TG_TABLE_NAME = 'checklist_bindings' THEN
    IF NEW.template_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.checklist_templates t WHERE t.id = NEW.template_id AND t.tenant_id = NEW.tenant_id) THEN RAISE EXCEPTION 'binding template tenant mismatch'; END IF;
    IF NEW.template_version_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.checklist_template_versions v WHERE v.id = NEW.template_version_id AND v.tenant_id = NEW.tenant_id AND (NEW.template_id IS NULL OR v.template_id = NEW.template_id)) THEN RAISE EXCEPTION 'binding version tenant mismatch'; END IF;
    IF NEW.target_template_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.checklist_templates t WHERE t.id = NEW.target_template_id AND t.tenant_id = NEW.tenant_id) THEN RAISE EXCEPTION 'binding target tenant mismatch'; END IF;
    IF NEW.assignment_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.assignments a WHERE a.id = NEW.assignment_id AND a.tenant_id = NEW.tenant_id) THEN RAISE EXCEPTION 'binding assignment tenant mismatch'; END IF;
    IF NEW.customer_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id = NEW.customer_id AND c.tenant_id = NEW.tenant_id) THEN RAISE EXCEPTION 'binding customer tenant mismatch'; END IF;
    IF NEW.object_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.objects o WHERE o.id = NEW.object_id AND o.tenant_id = NEW.tenant_id) THEN RAISE EXCEPTION 'binding object tenant mismatch'; END IF;
    IF NEW.task_code_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.task_codes tc WHERE tc.id = NEW.task_code_id AND tc.tenant_id = NEW.tenant_id) THEN RAISE EXCEPTION 'binding task-code tenant mismatch'; END IF;
    IF NEW.tenant_task_code_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.tenant_task_codes tc WHERE tc.id = NEW.tenant_task_code_id AND tc.tenant_id = NEW.tenant_id) THEN RAISE EXCEPTION 'binding tenant-task-code tenant mismatch'; END IF;
  ELSIF TG_TABLE_NAME = 'assignment_checklists' THEN
    IF NOT EXISTS (SELECT 1 FROM public.assignments a WHERE a.id = NEW.assignment_id AND a.tenant_id = NEW.tenant_id) THEN RAISE EXCEPTION 'assignment checklist tenant mismatch'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.checklist_template_versions v JOIN public.checklist_templates t ON t.id = v.template_id WHERE v.id = NEW.template_version_id AND v.template_id = NEW.template_id AND v.tenant_id = NEW.tenant_id AND t.tenant_id = NEW.tenant_id) THEN RAISE EXCEPTION 'assignment checklist version tenant mismatch'; END IF;
  ELSIF TG_TABLE_NAME = 'assignment_checklist_sources' THEN
    IF NOT EXISTS (SELECT 1 FROM public.assignment_checklists c WHERE c.id = NEW.assignment_checklist_id AND c.tenant_id = NEW.tenant_id) OR NOT EXISTS (SELECT 1 FROM public.checklist_bindings b WHERE b.id = NEW.binding_id AND b.tenant_id = NEW.tenant_id) THEN RAISE EXCEPTION 'checklist source tenant mismatch'; END IF;
  ELSIF TG_TABLE_NAME = 'assignment_checklist_answers' THEN
    IF NOT EXISTS (SELECT 1 FROM public.assignment_checklists c WHERE c.id = NEW.assignment_checklist_id AND c.tenant_id = NEW.tenant_id) THEN RAISE EXCEPTION 'checklist answer tenant mismatch'; END IF;
  ELSIF TG_TABLE_NAME = 'assignment_checklist_evidence' THEN
    IF NOT EXISTS (SELECT 1 FROM public.assignment_checklists c WHERE c.id = NEW.assignment_checklist_id AND c.tenant_id = NEW.tenant_id) THEN RAISE EXCEPTION 'checklist evidence tenant mismatch'; END IF;
    IF NEW.answer_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.assignment_checklist_answers a WHERE a.id = NEW.answer_id AND a.tenant_id = NEW.tenant_id AND a.assignment_checklist_id = NEW.assignment_checklist_id AND a.snapshot_item_id = NEW.snapshot_item_id) THEN RAISE EXCEPTION 'checklist evidence answer mismatch'; END IF;
  ELSIF TG_TABLE_NAME = 'checklist_reconciliation_events' THEN
    IF NOT EXISTS (SELECT 1 FROM public.assignments a WHERE a.id = NEW.assignment_id AND a.tenant_id = NEW.tenant_id) THEN RAISE EXCEPTION 'checklist event tenant mismatch'; END IF;
  ELSIF TG_TABLE_NAME = 'checklist_waivers' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.assignment_checklists c
      JOIN public.checklist_templates t ON t.id = c.template_id
      WHERE c.id = NEW.assignment_checklist_id AND c.tenant_id = NEW.tenant_id
        AND c.template_version_id = NEW.template_version_id AND NOT t.is_protected
        AND (t.is_waivable OR (NEW.kind = 'not_applicable' AND COALESCE((c.effective_rules->>'required')::boolean, false) = false))
    ) THEN RAISE EXCEPTION 'checklist is protected, not waivable or tenant mismatched'; END IF;
  ELSIF TG_TABLE_NAME = 'checklist_configuration_warnings' THEN
    IF NEW.binding_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.checklist_bindings b WHERE b.id = NEW.binding_id AND b.tenant_id = NEW.tenant_id) THEN RAISE EXCEPTION 'checklist warning binding mismatch'; END IF;
    IF NEW.reconciliation_event_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.checklist_reconciliation_events e WHERE e.id = NEW.reconciliation_event_id AND e.tenant_id = NEW.tenant_id) THEN RAISE EXCEPTION 'checklist warning event mismatch'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.checklist_assert_tenant_links() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'checklist_template_versions', 'checklist_bindings', 'assignment_checklists',
    'assignment_checklist_sources', 'assignment_checklist_answers',
    'assignment_checklist_evidence', 'checklist_reconciliation_events',
    'checklist_waivers', 'checklist_configuration_warnings'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_tenant_guard ON public.%I', table_name, table_name);
    EXECUTE format('CREATE TRIGGER trg_%I_tenant_guard BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.checklist_assert_tenant_links()', table_name, table_name);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.checklist_protect_published_version()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF OLD.status IN ('published', 'archived') THEN RAISE EXCEPTION 'published checklist versions are immutable'; END IF;
  IF TG_OP = 'DELETE' AND OLD.status <> 'draft' THEN RAISE EXCEPTION 'only unused draft versions can be deleted'; END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
DROP TRIGGER IF EXISTS trg_checklist_template_versions_immutable ON public.checklist_template_versions;
CREATE TRIGGER trg_checklist_template_versions_immutable BEFORE UPDATE OR DELETE ON public.checklist_template_versions FOR EACH ROW EXECUTE FUNCTION public.checklist_protect_published_version();

CREATE OR REPLACE FUNCTION public.checklist_history_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, auth, pg_temp AS $$
BEGIN
  IF current_setting('fieldgrid.allow_checklist_history_correction', true) = 'on' AND current_user = 'service_role' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  RAISE EXCEPTION 'historical checklist records are append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_assignment_checklist_answers_no_delete ON public.assignment_checklist_answers;
CREATE TRIGGER trg_assignment_checklist_answers_no_delete BEFORE DELETE ON public.assignment_checklist_answers FOR EACH ROW EXECUTE FUNCTION public.checklist_history_guard();
DROP TRIGGER IF EXISTS trg_assignment_checklist_evidence_no_delete ON public.assignment_checklist_evidence;
CREATE TRIGGER trg_assignment_checklist_evidence_no_delete BEFORE UPDATE OR DELETE ON public.assignment_checklist_evidence FOR EACH ROW EXECUTE FUNCTION public.checklist_history_guard();
DROP TRIGGER IF EXISTS trg_checklist_waivers_append_only ON public.checklist_waivers;
CREATE TRIGGER trg_checklist_waivers_append_only BEFORE UPDATE OR DELETE ON public.checklist_waivers FOR EACH ROW EXECUTE FUNCTION public.checklist_history_guard();

CREATE OR REPLACE FUNCTION public.checklist_snapshot_mutation_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, auth, pg_temp AS $$
DECLARE assignment_status text; actual_start timestamptz; signed_at timestamptz;
BEGIN
  IF current_setting('fieldgrid.allow_checklist_history_correction', true) = 'on' AND current_user = 'service_role' THEN RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END; END IF;
  SELECT a.status, a.actual_started_at, a.customer_signed_at INTO assignment_status, actual_start, signed_at FROM public.assignments a WHERE a.id = OLD.assignment_id FOR UPDATE;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'assignment checklist snapshots cannot be deleted'; END IF;
  IF OLD.status IN ('completed', 'cancelled', 'not_applicable', 'waived') OR signed_at IS NOT NULL OR assignment_status IN ('report_submitted', 'report_approved', 'invoice_ready', 'invoiced', 'paid', 'closed') THEN RAISE EXCEPTION 'terminal checklist snapshot is immutable'; END IF;
  IF current_setting('fieldgrid.allow_checklist_review_decision', true) = 'on' THEN RETURN NEW; END IF;
  IF OLD.locked_at IS NOT NULL OR actual_start IS NOT NULL OR assignment_status = 'in_progress' THEN
    IF NEW.template_id IS DISTINCT FROM OLD.template_id OR NEW.template_version_id IS DISTINCT FROM OLD.template_version_id OR NEW.cardinality IS DISTINCT FROM OLD.cardinality OR NEW.cardinality_key IS DISTINCT FROM OLD.cardinality_key OR NEW.template_snapshot IS DISTINCT FROM OLD.template_snapshot OR NEW.effective_rules IS DISTINCT FROM OLD.effective_rules OR NEW.source_fingerprint IS DISTINCT FROM OLD.source_fingerprint THEN
      RAISE EXCEPTION 'started checklist composition is immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_assignment_checklists_mutation_guard ON public.assignment_checklists;
CREATE TRIGGER trg_assignment_checklists_mutation_guard BEFORE UPDATE OR DELETE ON public.assignment_checklists FOR EACH ROW EXECUTE FUNCTION public.checklist_snapshot_mutation_guard();

CREATE OR REPLACE FUNCTION public.checklist_snapshot_insert_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE assignment_status text; actual_start timestamptz; signed_at timestamptz;
BEGIN
  SELECT status, actual_started_at, customer_signed_at INTO assignment_status, actual_start, signed_at
  FROM public.assignments WHERE id = NEW.assignment_id AND tenant_id = NEW.tenant_id FOR UPDATE;
  IF (actual_start IS NOT NULL OR assignment_status IN ('in_progress', 'completed', 'report_submitted', 'report_approved', 'invoice_ready', 'invoiced', 'paid', 'closed') OR signed_at IS NOT NULL)
     AND current_setting('fieldgrid.allow_checklist_review_decision', true) <> 'on' THEN
    RAISE EXCEPTION 'started assignment requires an explicit checklist review decision';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_assignment_checklists_insert_guard ON public.assignment_checklists;
CREATE TRIGGER trg_assignment_checklists_insert_guard BEFORE INSERT ON public.assignment_checklists FOR EACH ROW EXECUTE FUNCTION public.checklist_snapshot_insert_guard();

CREATE OR REPLACE FUNCTION public.checklist_answer_write_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, auth, pg_temp AS $$
DECLARE assignment_status text; checklist_status text; signed_at timestamptz; snapshot jsonb; assignment_id_value uuid; canonical_item_segment text;
BEGIN
  SELECT a.status, c.status, a.customer_signed_at, c.template_snapshot, a.id
  INTO assignment_status, checklist_status, signed_at, snapshot, assignment_id_value
  FROM public.assignment_checklists c JOIN public.assignments a ON a.id = c.assignment_id
  WHERE c.id = NEW.assignment_checklist_id AND c.tenant_id = NEW.tenant_id FOR UPDATE OF a;
  IF checklist_status <> 'active' OR signed_at IS NOT NULL OR assignment_status IN ('completed', 'report_submitted', 'report_approved', 'invoice_ready', 'invoiced', 'paid', 'closed', 'cancelled') THEN RAISE EXCEPTION 'checklist answers are immutable for this work order'; END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(snapshot->'sections', '[]'::jsonb)) section,
         jsonb_array_elements(COALESCE(section->'items', '[]'::jsonb)) item
    WHERE item->>'id' = NEW.snapshot_item_id
  ) THEN RAISE EXCEPTION 'checklist item is not part of the immutable snapshot'; END IF;
  IF TG_TABLE_NAME = 'assignment_checklist_evidence' THEN
    canonical_item_segment := left(trim(both '-' from regexp_replace(lower(trim(NEW.snapshot_item_id)), '[^a-z0-9._-]+', '-', 'g')), 120);
    IF split_part(NEW.storage_path, '/', 1) <> 'tenant'
       OR split_part(NEW.storage_path, '/', 2) <> NEW.tenant_id::text
       OR split_part(NEW.storage_path, '/', 3) <> 'assignments'
       OR split_part(NEW.storage_path, '/', 4) <> assignment_id_value::text
       OR split_part(NEW.storage_path, '/', 5) <> 'checklists'
       OR split_part(NEW.storage_path, '/', 6) <> NEW.assignment_checklist_id::text
       OR split_part(NEW.storage_path, '/', 7) <> canonical_item_segment
       OR nullif(split_part(NEW.storage_path, '/', 8), '') IS NULL
       OR split_part(NEW.storage_path, '/', 9) <> ''
    THEN RAISE EXCEPTION 'checklist evidence path is not canonical for this tenant snapshot item'; END IF;
  END IF;
  IF TG_TABLE_NAME = 'assignment_checklist_answers' AND TG_OP = 'UPDATE' AND NEW.revision <> OLD.revision + 1 THEN RAISE EXCEPTION 'checklist answer revision conflict'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.checklist_answer_write_guard() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS trg_assignment_checklist_answers_write_guard ON public.assignment_checklist_answers;
CREATE TRIGGER trg_assignment_checklist_answers_write_guard BEFORE INSERT OR UPDATE ON public.assignment_checklist_answers FOR EACH ROW EXECUTE FUNCTION public.checklist_answer_write_guard();
DROP TRIGGER IF EXISTS trg_assignment_checklist_evidence_write_guard ON public.assignment_checklist_evidence;
CREATE TRIGGER trg_assignment_checklist_evidence_write_guard BEFORE INSERT ON public.assignment_checklist_evidence FOR EACH ROW EXECUTE FUNCTION public.checklist_answer_write_guard();

CREATE OR REPLACE FUNCTION public.checklist_increment_response_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  UPDATE public.assignment_checklists SET response_count = response_count + 1, updated_at = now() WHERE id = NEW.assignment_checklist_id AND tenant_id = NEW.tenant_id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.checklist_increment_response_count() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS trg_assignment_checklist_answers_count ON public.assignment_checklist_answers;
CREATE TRIGGER trg_assignment_checklist_answers_count AFTER INSERT ON public.assignment_checklist_answers FOR EACH ROW EXECUTE FUNCTION public.checklist_increment_response_count();

ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_checklist_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_checklist_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_checklist_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_reconciliation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_waivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_configuration_warnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY checklist_templates_management_all ON public.checklist_templates TO authenticated USING (public.is_management_for_tenant(tenant_id)) WITH CHECK (public.is_management_for_tenant(tenant_id));
CREATE POLICY checklist_template_versions_management_all ON public.checklist_template_versions TO authenticated USING (public.is_management_for_tenant(tenant_id)) WITH CHECK (public.is_management_for_tenant(tenant_id));
CREATE POLICY checklist_bindings_management_all ON public.checklist_bindings TO authenticated USING (public.is_management_for_tenant(tenant_id)) WITH CHECK (public.is_management_for_tenant(tenant_id));
CREATE POLICY assignment_checklists_management_all ON public.assignment_checklists TO authenticated USING (public.is_management_for_tenant(tenant_id)) WITH CHECK (public.is_management_for_tenant(tenant_id));
CREATE POLICY assignment_checklist_sources_management_all ON public.assignment_checklist_sources TO authenticated USING (public.is_management_for_tenant(tenant_id)) WITH CHECK (public.is_management_for_tenant(tenant_id));
CREATE POLICY assignment_checklist_answers_management_all ON public.assignment_checklist_answers TO authenticated USING (public.is_management_for_tenant(tenant_id)) WITH CHECK (public.is_management_for_tenant(tenant_id));
CREATE POLICY assignment_checklist_evidence_management_all ON public.assignment_checklist_evidence TO authenticated USING (public.is_management_for_tenant(tenant_id)) WITH CHECK (public.is_management_for_tenant(tenant_id));
CREATE POLICY checklist_reconciliation_events_management_all ON public.checklist_reconciliation_events TO authenticated USING (public.is_management_for_tenant(tenant_id)) WITH CHECK (public.is_management_for_tenant(tenant_id));
CREATE POLICY checklist_waivers_management_read ON public.checklist_waivers FOR SELECT TO authenticated USING (public.is_management_for_tenant(tenant_id));
CREATE POLICY checklist_configuration_warnings_management_all ON public.checklist_configuration_warnings TO authenticated USING (public.is_management_for_tenant(tenant_id)) WITH CHECK (public.is_management_for_tenant(tenant_id));

CREATE POLICY assignment_checklists_personnel_read ON public.assignment_checklists FOR SELECT TO authenticated USING (public.personnel_assigned_to_assignment(assignment_id));
CREATE POLICY assignment_checklist_sources_personnel_read ON public.assignment_checklist_sources FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.assignment_checklists c WHERE c.id = assignment_checklist_sources.assignment_checklist_id AND c.tenant_id = assignment_checklist_sources.tenant_id AND public.personnel_assigned_to_assignment(c.assignment_id)));
CREATE POLICY assignment_checklist_answers_personnel_read ON public.assignment_checklist_answers FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.assignment_checklists c WHERE c.id = assignment_checklist_answers.assignment_checklist_id AND c.tenant_id = assignment_checklist_answers.tenant_id AND public.personnel_assigned_to_assignment(c.assignment_id)));
CREATE POLICY assignment_checklist_answers_personnel_insert ON public.assignment_checklist_answers FOR INSERT TO authenticated WITH CHECK (answered_by = auth.uid() AND EXISTS (SELECT 1 FROM public.assignment_checklists c WHERE c.id = assignment_checklist_answers.assignment_checklist_id AND c.tenant_id = assignment_checklist_answers.tenant_id AND c.status = 'active' AND public.personnel_assigned_to_assignment(c.assignment_id)));
CREATE POLICY assignment_checklist_answers_personnel_update ON public.assignment_checklist_answers FOR UPDATE TO authenticated USING (answered_by = auth.uid() AND EXISTS (SELECT 1 FROM public.assignment_checklists c WHERE c.id = assignment_checklist_answers.assignment_checklist_id AND c.tenant_id = assignment_checklist_answers.tenant_id AND c.status = 'active' AND public.personnel_assigned_to_assignment(c.assignment_id))) WITH CHECK (answered_by = auth.uid() AND EXISTS (SELECT 1 FROM public.assignment_checklists c WHERE c.id = assignment_checklist_answers.assignment_checklist_id AND c.tenant_id = assignment_checklist_answers.tenant_id AND c.status = 'active' AND public.personnel_assigned_to_assignment(c.assignment_id)));
CREATE POLICY assignment_checklist_evidence_personnel_read ON public.assignment_checklist_evidence FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.assignment_checklists c WHERE c.id = assignment_checklist_evidence.assignment_checklist_id AND c.tenant_id = assignment_checklist_evidence.tenant_id AND public.personnel_assigned_to_assignment(c.assignment_id)));
CREATE POLICY assignment_checklist_evidence_personnel_insert ON public.assignment_checklist_evidence FOR INSERT TO authenticated WITH CHECK (uploaded_by = auth.uid() AND EXISTS (SELECT 1 FROM public.assignment_checklists c WHERE c.id = assignment_checklist_evidence.assignment_checklist_id AND c.tenant_id = assignment_checklist_evidence.tenant_id AND c.status = 'active' AND public.personnel_assigned_to_assignment(c.assignment_id)));

GRANT SELECT ON public.checklist_templates, public.checklist_template_versions, public.checklist_bindings, public.assignment_checklists, public.assignment_checklist_sources, public.assignment_checklist_answers, public.assignment_checklist_evidence, public.checklist_reconciliation_events, public.checklist_waivers, public.checklist_configuration_warnings TO authenticated;
GRANT INSERT, UPDATE ON public.assignment_checklist_answers TO authenticated;
GRANT INSERT ON public.assignment_checklist_evidence TO authenticated;

-- Existing assignment-photos paths are tenant/assignment scoped. Checklist evidence
-- uses: tenant/<tenant>/assignments/<assignment>/checklists/<assignment-checklist>/<item>/<uuid>.<ext>.
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    DROP POLICY IF EXISTS assignment_checklist_evidence_read ON storage.objects;
    CREATE POLICY assignment_checklist_evidence_read ON storage.objects FOR SELECT TO authenticated USING (
      bucket_id = 'assignment-photos' AND (name LIKE '%/checklists/%') AND EXISTS (
        SELECT 1 FROM public.assignment_checklists c
        WHERE split_part(name, '/', 1) = 'tenant'
          AND c.tenant_id::text = split_part(name, '/', 2)
          AND split_part(name, '/', 3) = 'assignments'
          AND c.assignment_id::text = split_part(name, '/', 4)
          AND split_part(name, '/', 5) = 'checklists'
          AND c.id::text = split_part(name, '/', 6)
          AND (public.is_management_for_tenant(c.tenant_id) OR public.personnel_assigned_to_assignment(c.assignment_id))
      )
    );
    DROP POLICY IF EXISTS assignment_checklist_evidence_insert ON storage.objects;
    CREATE POLICY assignment_checklist_evidence_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
      bucket_id = 'assignment-photos' AND (name LIKE '%/checklists/%') AND EXISTS (
        SELECT 1 FROM public.assignment_checklists c
        WHERE split_part(name, '/', 1) = 'tenant'
          AND c.tenant_id::text = split_part(name, '/', 2)
          AND split_part(name, '/', 3) = 'assignments'
          AND c.assignment_id::text = split_part(name, '/', 4)
          AND split_part(name, '/', 5) = 'checklists'
          AND c.id::text = split_part(name, '/', 6)
          AND c.status = 'active'
          AND (public.is_management_for_tenant(c.tenant_id) OR public.personnel_assigned_to_assignment(c.assignment_id))
      )
    );
  END IF;
END;
$$;

-- Deployment verification queries (zero rows expected):
-- SELECT v.id FROM checklist_template_versions v LEFT JOIN checklist_templates t ON t.id=v.template_id AND t.tenant_id=v.tenant_id WHERE t.id IS NULL;
-- SELECT c.id FROM assignment_checklists c LEFT JOIN assignments a ON a.id=c.assignment_id AND a.tenant_id=c.tenant_id LEFT JOIN checklist_template_versions v ON v.id=c.template_version_id AND v.template_id=c.template_id AND v.tenant_id=c.tenant_id WHERE a.id IS NULL OR v.id IS NULL;
-- SELECT s.id FROM assignment_checklist_sources s LEFT JOIN assignment_checklists c ON c.id=s.assignment_checklist_id AND c.tenant_id=s.tenant_id LEFT JOIN checklist_bindings b ON b.id=s.binding_id AND b.tenant_id=s.tenant_id WHERE c.id IS NULL OR b.id IS NULL;
-- SELECT tenant_id, assignment_id, template_id, cardinality, cardinality_key, count(*) FROM assignment_checklists GROUP BY 1,2,3,4,5 HAVING count(*) > 1;
