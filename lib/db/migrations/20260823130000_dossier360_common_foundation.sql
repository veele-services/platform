-- D360-COM foundation: constrained common dossier metadata, tasks, immutable
-- notes and a redacted append-only timeline. Canonical domain tables remain the
-- sole source for personnel, customer and object data.

CREATE TABLE IF NOT EXISTS public.dossier_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  subject_type varchar(20) NOT NULL,
  personnel_id uuid,
  customer_id uuid,
  object_id uuid,
  dossier_number varchar(80) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'active',
  manager_user_id uuid,
  last_reviewed_at timestamptz,
  last_reviewed_by uuid,
  retention_policy_key varchar(80),
  scheduled_deletion_at timestamptz,
  legal_hold_at timestamptz,
  legal_hold_by uuid,
  legal_hold_reason text,
  archived_at timestamptz,
  archived_by uuid,
  archive_reason text,
  record_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dossier_profiles_subject_type_check CHECK (
    subject_type IN ('personnel', 'customer', 'object')
  ),
  CONSTRAINT dossier_profiles_exact_subject_check CHECK (
    num_nonnulls(personnel_id, customer_id, object_id) = 1
    AND (subject_type <> 'personnel' OR personnel_id IS NOT NULL)
    AND (subject_type <> 'customer' OR customer_id IS NOT NULL)
    AND (subject_type <> 'object' OR object_id IS NOT NULL)
  ),
  CONSTRAINT dossier_profiles_status_check CHECK (
    status IN ('active', 'attention', 'archived', 'closed')
  ),
  CONSTRAINT dossier_profiles_record_version_check CHECK (record_version > 0),
  CONSTRAINT dossier_profiles_archive_consistency_check CHECK (
    (status = 'archived') = (archived_at IS NOT NULL)
  ),
  CONSTRAINT dossier_profiles_legal_hold_consistency_check CHECK (
    (legal_hold_at IS NULL AND legal_hold_by IS NULL AND legal_hold_reason IS NULL)
    OR (legal_hold_at IS NOT NULL AND legal_hold_by IS NOT NULL AND length(trim(legal_hold_reason)) >= 3)
  ),
  CONSTRAINT dossier_profiles_personnel_tenant_fk
    FOREIGN KEY (tenant_id, personnel_id)
    REFERENCES public.personnel(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT dossier_profiles_customer_tenant_fk
    FOREIGN KEY (tenant_id, customer_id)
    REFERENCES public.customers(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT dossier_profiles_object_tenant_fk
    FOREIGN KEY (tenant_id, object_id)
    REFERENCES public.objects(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT dossier_profiles_manager_tenant_fk
    FOREIGN KEY (tenant_id, manager_user_id)
    REFERENCES public.tenant_users(tenant_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT dossier_profiles_last_reviewed_by_tenant_fk
    FOREIGN KEY (tenant_id, last_reviewed_by)
    REFERENCES public.tenant_users(tenant_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT dossier_profiles_legal_hold_by_tenant_fk
    FOREIGN KEY (tenant_id, legal_hold_by)
    REFERENCES public.tenant_users(tenant_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT dossier_profiles_archived_by_tenant_fk
    FOREIGN KEY (tenant_id, archived_by)
    REFERENCES public.tenant_users(tenant_id, user_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS dossier_profiles_tenant_number_unique
  ON public.dossier_profiles(tenant_id, dossier_number);
CREATE UNIQUE INDEX IF NOT EXISTS dossier_profiles_tenant_id_unique
  ON public.dossier_profiles(tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS dossier_profiles_personnel_unique
  ON public.dossier_profiles(tenant_id, personnel_id) WHERE personnel_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS dossier_profiles_customer_unique
  ON public.dossier_profiles(tenant_id, customer_id) WHERE customer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS dossier_profiles_object_unique
  ON public.dossier_profiles(tenant_id, object_id) WHERE object_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dossier_profiles_attention_idx
  ON public.dossier_profiles(tenant_id, status, last_reviewed_at, scheduled_deletion_at);

CREATE TABLE IF NOT EXISTS public.dossier_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  dossier_profile_id uuid NOT NULL,
  classification varchar(24) NOT NULL DEFAULT 'internal',
  content text NOT NULL,
  correction_of_id uuid,
  correction_reason text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dossier_notes_profile_tenant_fk
    FOREIGN KEY (tenant_id, dossier_profile_id)
    REFERENCES public.dossier_profiles(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT dossier_notes_classification_check CHECK (
    classification IN ('internal', 'confidential', 'restricted')
  ),
  CONSTRAINT dossier_notes_correction_check CHECK (
    (correction_of_id IS NULL AND correction_reason IS NULL)
    OR (correction_of_id IS NOT NULL AND length(trim(correction_reason)) >= 3)
  ),
  CONSTRAINT dossier_notes_tenant_profile_id_unique
    UNIQUE (tenant_id, dossier_profile_id, id),
  CONSTRAINT dossier_notes_correction_tenant_fk
    FOREIGN KEY (tenant_id, dossier_profile_id, correction_of_id)
    REFERENCES public.dossier_notes(tenant_id, dossier_profile_id, id) ON DELETE RESTRICT,
  CONSTRAINT dossier_notes_created_by_tenant_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES public.tenant_users(tenant_id, user_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS dossier_notes_tenant_id_unique
  ON public.dossier_notes(tenant_id, id);
CREATE INDEX IF NOT EXISTS dossier_notes_profile_time_idx
  ON public.dossier_notes(tenant_id, dossier_profile_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.dossier_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  dossier_profile_id uuid NOT NULL,
  title varchar(240) NOT NULL,
  description text,
  status varchar(24) NOT NULL DEFAULT 'open',
  priority varchar(20) NOT NULL DEFAULT 'normal',
  owner_user_id uuid,
  due_at timestamptz,
  completed_at timestamptz,
  completed_by uuid,
  record_version integer NOT NULL DEFAULT 1,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dossier_tasks_profile_tenant_fk
    FOREIGN KEY (tenant_id, dossier_profile_id)
    REFERENCES public.dossier_profiles(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT dossier_tasks_status_check CHECK (
    status IN ('open', 'in_progress', 'completed', 'cancelled')
  ),
  CONSTRAINT dossier_tasks_priority_check CHECK (
    priority IN ('low', 'normal', 'high', 'urgent')
  ),
  CONSTRAINT dossier_tasks_completion_check CHECK (
    (status = 'completed' AND completed_at IS NOT NULL AND completed_by IS NOT NULL)
    OR (status <> 'completed' AND completed_at IS NULL AND completed_by IS NULL)
  ),
  CONSTRAINT dossier_tasks_record_version_check CHECK (record_version > 0)
  ,CONSTRAINT dossier_tasks_owner_tenant_fk
    FOREIGN KEY (tenant_id, owner_user_id)
    REFERENCES public.tenant_users(tenant_id, user_id) ON DELETE RESTRICT
  ,CONSTRAINT dossier_tasks_completed_by_tenant_fk
    FOREIGN KEY (tenant_id, completed_by)
    REFERENCES public.tenant_users(tenant_id, user_id) ON DELETE RESTRICT
  ,CONSTRAINT dossier_tasks_created_by_tenant_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES public.tenant_users(tenant_id, user_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS dossier_tasks_open_due_idx
  ON public.dossier_tasks(tenant_id, dossier_profile_id, status, due_at);

CREATE TABLE IF NOT EXISTS public.dossier_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  dossier_profile_id uuid NOT NULL,
  actor_user_id uuid,
  event_type varchar(80) NOT NULL,
  title varchar(240) NOT NULL,
  summary text,
  classification varchar(24) NOT NULL DEFAULT 'internal',
  source_type varchar(60) NOT NULL,
  source_id uuid,
  correlation_id varchar(128),
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dossier_events_profile_tenant_fk
    FOREIGN KEY (tenant_id, dossier_profile_id)
    REFERENCES public.dossier_profiles(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT dossier_events_classification_check CHECK (
    classification IN ('normal', 'internal', 'confidential', 'restricted')
  ),
  CONSTRAINT dossier_events_actor_tenant_fk
    FOREIGN KEY (tenant_id, actor_user_id)
    REFERENCES public.tenant_users(tenant_id, user_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS dossier_events_profile_time_idx
  ON public.dossier_events(tenant_id, dossier_profile_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.fieldgrid_create_dossier_profile_for_subject()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE prefix text;
BEGIN
  prefix := CASE TG_TABLE_NAME
    WHEN 'personnel' THEN 'P'
    WHEN 'customers' THEN 'K'
    WHEN 'objects' THEN 'O'
    ELSE NULL
  END;
  IF prefix IS NULL THEN RAISE EXCEPTION 'unsupported dossier subject'; END IF;
  INSERT INTO public.dossier_profiles (
    tenant_id, subject_type, personnel_id, customer_id, object_id, dossier_number
  ) VALUES (
    NEW.tenant_id,
    CASE TG_TABLE_NAME WHEN 'personnel' THEN 'personnel' WHEN 'customers' THEN 'customer' ELSE 'object' END,
    CASE WHEN TG_TABLE_NAME = 'personnel' THEN NEW.id ELSE NULL END,
    CASE WHEN TG_TABLE_NAME = 'customers' THEN NEW.id ELSE NULL END,
    CASE WHEN TG_TABLE_NAME = 'objects' THEN NEW.id ELSE NULL END,
    prefix || '-' || NEW.code
  ) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_personnel_create_dossier_profile ON public.personnel;
CREATE TRIGGER trg_personnel_create_dossier_profile
AFTER INSERT ON public.personnel FOR EACH ROW
EXECUTE FUNCTION public.fieldgrid_create_dossier_profile_for_subject();
DROP TRIGGER IF EXISTS trg_customers_create_dossier_profile ON public.customers;
CREATE TRIGGER trg_customers_create_dossier_profile
AFTER INSERT ON public.customers FOR EACH ROW
EXECUTE FUNCTION public.fieldgrid_create_dossier_profile_for_subject();
DROP TRIGGER IF EXISTS trg_objects_create_dossier_profile ON public.objects;
CREATE TRIGGER trg_objects_create_dossier_profile
AFTER INSERT ON public.objects FOR EACH ROW
EXECUTE FUNCTION public.fieldgrid_create_dossier_profile_for_subject();

INSERT INTO public.dossier_profiles (tenant_id, subject_type, personnel_id, dossier_number)
SELECT tenant_id, 'personnel', id, 'P-' || code FROM public.personnel
ON CONFLICT DO NOTHING;
INSERT INTO public.dossier_profiles (tenant_id, subject_type, customer_id, dossier_number)
SELECT tenant_id, 'customer', id, 'K-' || code FROM public.customers
ON CONFLICT DO NOTHING;
INSERT INTO public.dossier_profiles (tenant_id, subject_type, object_id, dossier_number)
SELECT tenant_id, 'object', id, 'O-' || code FROM public.objects
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.fieldgrid_dossier_bump_version()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  NEW.record_version := OLD.record_version + 1;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_dossier_profiles_bump_version
BEFORE UPDATE ON public.dossier_profiles FOR EACH ROW
EXECUTE FUNCTION public.fieldgrid_dossier_bump_version();
CREATE TRIGGER trg_dossier_tasks_bump_version
BEFORE UPDATE ON public.dossier_tasks FOR EACH ROW
EXECUTE FUNCTION public.fieldgrid_dossier_bump_version();

CREATE OR REPLACE FUNCTION public.fieldgrid_dossier_append_only()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN RAISE EXCEPTION 'dossier notes and events are append-only'; END;
$$;
CREATE TRIGGER trg_dossier_notes_append_only
BEFORE UPDATE OR DELETE ON public.dossier_notes FOR EACH ROW
EXECUTE FUNCTION public.fieldgrid_dossier_append_only();
CREATE TRIGGER trg_dossier_events_append_only
BEFORE UPDATE OR DELETE ON public.dossier_events FOR EACH ROW
EXECUTE FUNCTION public.fieldgrid_dossier_append_only();

CREATE OR REPLACE FUNCTION public.fieldgrid_dossier_legal_hold_delete_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  IF OLD.legal_hold_at IS NOT NULL THEN RAISE EXCEPTION 'legal hold blocks dossier deletion'; END IF;
  RAISE EXCEPTION 'hard delete is unavailable through the normal dossier lifecycle';
END;
$$;
CREATE TRIGGER trg_dossier_profile_delete_guard
BEFORE DELETE ON public.dossier_profiles FOR EACH ROW
EXECUTE FUNCTION public.fieldgrid_dossier_legal_hold_delete_guard();

ALTER TABLE public.dossier_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dossier_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dossier_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dossier_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.dossier_profiles FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.dossier_notes FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.dossier_tasks FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.dossier_events FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fieldgrid_create_dossier_profile_for_subject() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fieldgrid_dossier_bump_version() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fieldgrid_dossier_append_only() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fieldgrid_dossier_legal_hold_delete_guard() FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO public.permissions(resource, action, description) VALUES
  ('dossiers', 'manage', 'Dossierstatus, verantwoordelijke, taken, retentie en legal hold beheren'),
  ('dossiers', 'notes', 'Gestructureerde dossiernotities toevoegen en corrigeren'),
  ('dossiers', 'timeline', 'Geautoriseerde dossiertijdlijn bekijken')
ON CONFLICT (resource, action) DO UPDATE SET description = EXCLUDED.description;

COMMENT ON TABLE public.dossier_profiles IS
  'Common Dossier 360 metadata only; canonical subject data stays in personnel/customers/objects.';
COMMENT ON TABLE public.dossier_events IS
  'Redacted append-only dossier timeline; audit evidence remains in dedicated audit tables.';
