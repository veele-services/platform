-- D360 SEC-ACCESS foundation: dedicated encrypted object-security records,
-- OTP challenges, revocable unlock sessions and append-only access evidence.
--
-- This is an additive migration. Existing legacy plaintext columns remain only
-- as a quarantined backfill source. New writes to those columns fail closed.

CREATE UNIQUE INDEX IF NOT EXISTS objects_tenant_id_id_unique
  ON public.objects (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS personnel_tenant_id_id_unique
  ON public.personnel (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS customers_tenant_id_id_unique
  ON public.customers (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS assignments_tenant_id_id_unique
  ON public.assignments (tenant_id, id);

CREATE TABLE IF NOT EXISTS public.object_security_object_revisions (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  object_id uuid NOT NULL,
  generation bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, object_id),
  CONSTRAINT object_security_object_revisions_object_tenant_fk
    FOREIGN KEY (tenant_id, object_id)
    REFERENCES public.objects (tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT object_security_object_revisions_generation_check CHECK (generation >= 0)
);

CREATE TABLE IF NOT EXISTS public.object_security_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  object_id uuid NOT NULL,
  category varchar(48) NOT NULL,
  title varchar(160) NOT NULL,
  encrypted_payload text NOT NULL,
  encryption_key_version integer NOT NULL DEFAULT 1,
  version integer NOT NULL,
  generation bigint NOT NULL DEFAULT 1,
  status varchar(24) NOT NULL DEFAULT 'draft',
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  source varchar(32) NOT NULL DEFAULT 'management',
  change_reason text NOT NULL,
  supersedes_record_id uuid,
  created_by uuid NOT NULL,
  reviewed_by uuid,
  reviewed_at timestamptz,
  revoked_by uuid,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT object_security_records_object_tenant_fk
    FOREIGN KEY (tenant_id, object_id)
    REFERENCES public.objects (tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT object_security_records_category_check CHECK (
    category IN (
      'access_instructions', 'key_location', 'key_code', 'alarm_procedure',
      'alarm_code', 'entrance', 'badge_instructions', 'key_management',
      'opening_procedure', 'closing_procedure', 'security_contact',
      'emergency_procedure', 'confidential_route', 'temporary_access'
    )
  ),
  CONSTRAINT object_security_records_status_check CHECK (
    status IN ('draft', 'pending_review', 'active', 'superseded', 'revoked')
  ),
  CONSTRAINT object_security_records_source_check CHECK (
    source IN ('management', 'customer_portal', 'legacy_backfill', 'system')
  ),
  CONSTRAINT object_security_records_version_positive CHECK (version > 0),
  CONSTRAINT object_security_records_generation_positive CHECK (generation > 0),
  CONSTRAINT object_security_records_key_version_positive CHECK (encryption_key_version > 0),
  CONSTRAINT object_security_records_valid_interval CHECK (
    valid_until IS NULL OR valid_until > valid_from
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS object_security_records_version_unique
  ON public.object_security_records (tenant_id, object_id, category, version);

CREATE UNIQUE INDEX IF NOT EXISTS object_security_records_active_unique
  ON public.object_security_records (tenant_id, object_id, category)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS object_security_records_lookup_idx
  ON public.object_security_records (tenant_id, object_id, status, valid_from, valid_until);

CREATE UNIQUE INDEX IF NOT EXISTS object_security_records_tenant_object_id_unique
  ON public.object_security_records (tenant_id, object_id, id);

ALTER TABLE public.object_security_records
  ADD CONSTRAINT object_security_records_supersedes_tenant_fk
  FOREIGN KEY (tenant_id, object_id, supersedes_record_id)
  REFERENCES public.object_security_records (tenant_id, object_id, id)
  ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS public.object_security_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  personnel_id uuid,
  customer_id uuid,
  object_id uuid NOT NULL,
  assignment_id uuid,
  access_path varchar(24) NOT NULL,
  code_hmac text,
  business_email_revision text NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'pending_delivery',
  failed_attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  expires_at timestamptz NOT NULL,
  resend_after timestamptz NOT NULL,
  delivery_started_at timestamptz,
  delivered_at timestamptz,
  consumed_at timestamptz,
  invalidated_at timestamptz,
  invalidation_reason varchar(64),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT object_security_challenges_object_tenant_fk
    FOREIGN KEY (tenant_id, object_id)
    REFERENCES public.objects (tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT object_security_challenges_personnel_tenant_fk
    FOREIGN KEY (tenant_id, personnel_id)
    REFERENCES public.personnel (tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT object_security_challenges_customer_tenant_fk
    FOREIGN KEY (tenant_id, customer_id)
    REFERENCES public.customers (tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT object_security_challenges_assignment_tenant_fk
    FOREIGN KEY (tenant_id, assignment_id)
    REFERENCES public.assignments (tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT object_security_challenges_access_path_check CHECK (
    access_path IN ('management', 'personnel', 'customer', 'break_glass')
  ),
  CONSTRAINT object_security_challenges_status_check CHECK (
    status IN ('pending_delivery', 'delivered', 'used', 'expired', 'blocked', 'invalidated', 'delivery_failed')
  ),
  CONSTRAINT object_security_challenges_attempts_check CHECK (
    failed_attempts >= 0 AND max_attempts BETWEEN 1 AND 10 AND failed_attempts <= max_attempts
  ),
  CONSTRAINT object_security_challenges_context_check CHECK (
    (access_path = 'personnel' AND personnel_id IS NOT NULL AND assignment_id IS NOT NULL AND customer_id IS NULL)
    OR (access_path = 'customer' AND customer_id IS NOT NULL AND personnel_id IS NULL)
    OR (access_path IN ('management', 'break_glass') AND personnel_id IS NULL AND customer_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS object_security_challenges_rate_limit_idx
  ON public.object_security_challenges (tenant_id, user_id, object_id, created_at DESC);

CREATE INDEX IF NOT EXISTS object_security_challenges_context_idx
  ON public.object_security_challenges (tenant_id, object_id, assignment_id, status, expires_at);

CREATE UNIQUE INDEX IF NOT EXISTS object_security_challenges_one_open_context
  ON public.object_security_challenges (
    tenant_id,
    user_id,
    object_id,
    COALESCE(assignment_id, '00000000-0000-0000-0000-000000000000'::uuid),
    access_path
  )
  WHERE status IN ('pending_delivery', 'delivered');

CREATE UNIQUE INDEX IF NOT EXISTS object_security_challenges_tenant_id_unique
  ON public.object_security_challenges (tenant_id, id);

CREATE TABLE IF NOT EXISTS public.object_security_unlock_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  challenge_id uuid NOT NULL UNIQUE,
  handle_hash text NOT NULL UNIQUE,
  user_id uuid NOT NULL,
  personnel_id uuid,
  customer_id uuid,
  object_id uuid NOT NULL,
  assignment_id uuid,
  access_path varchar(24) NOT NULL,
  auth_session_id text NOT NULL,
  business_email_revision text NOT NULL,
  assignment_revision bigint,
  policy_revision bigint NOT NULL,
  record_generation bigint NOT NULL,
  idle_expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid,
  revocation_reason varchar(80),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT object_security_unlock_sessions_object_tenant_fk
    FOREIGN KEY (tenant_id, object_id)
    REFERENCES public.objects (tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT object_security_unlock_sessions_challenge_tenant_fk
    FOREIGN KEY (tenant_id, challenge_id)
    REFERENCES public.object_security_challenges (tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT object_security_unlock_sessions_personnel_tenant_fk
    FOREIGN KEY (tenant_id, personnel_id)
    REFERENCES public.personnel (tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT object_security_unlock_sessions_customer_tenant_fk
    FOREIGN KEY (tenant_id, customer_id)
    REFERENCES public.customers (tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT object_security_unlock_sessions_assignment_tenant_fk
    FOREIGN KEY (tenant_id, assignment_id)
    REFERENCES public.assignments (tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT object_security_unlock_sessions_access_path_check CHECK (
    access_path IN ('management', 'personnel', 'customer', 'break_glass')
  ),
  CONSTRAINT object_security_unlock_sessions_expiry_check CHECK (
    idle_expires_at <= absolute_expires_at AND absolute_expires_at > created_at
  ),
  CONSTRAINT object_security_unlock_sessions_revision_check CHECK (
    policy_revision > 0 AND record_generation >= 0
  )
);

CREATE INDEX IF NOT EXISTS object_security_unlock_sessions_context_idx
  ON public.object_security_unlock_sessions (
    tenant_id, user_id, object_id, assignment_id, revoked_at, absolute_expires_at
  );

CREATE UNIQUE INDEX IF NOT EXISTS object_security_unlock_sessions_tenant_id_unique
  ON public.object_security_unlock_sessions (tenant_id, id);

CREATE TABLE IF NOT EXISTS public.object_security_access_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  actor_user_id uuid,
  object_id uuid NOT NULL,
  assignment_id uuid,
  security_record_id uuid,
  challenge_id uuid,
  unlock_session_id uuid,
  access_path varchar(24) NOT NULL,
  event_type varchar(64) NOT NULL,
  result varchar(24) NOT NULL,
  category varchar(48),
  reason_code varchar(80),
  policy_revision bigint,
  request_id varchar(128),
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT object_security_access_audit_object_tenant_fk
    FOREIGN KEY (tenant_id, object_id)
    REFERENCES public.objects (tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT object_security_access_audit_assignment_tenant_fk
    FOREIGN KEY (tenant_id, assignment_id)
    REFERENCES public.assignments (tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT object_security_access_audit_record_tenant_fk
    FOREIGN KEY (tenant_id, object_id, security_record_id)
    REFERENCES public.object_security_records (tenant_id, object_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT object_security_access_audit_challenge_tenant_fk
    FOREIGN KEY (tenant_id, challenge_id)
    REFERENCES public.object_security_challenges (tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT object_security_access_audit_unlock_tenant_fk
    FOREIGN KEY (tenant_id, unlock_session_id)
    REFERENCES public.object_security_unlock_sessions (tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT object_security_access_audit_path_check CHECK (
    access_path IN ('management', 'personnel', 'customer', 'break_glass', 'system')
  ),
  CONSTRAINT object_security_access_audit_result_check CHECK (
    result IN ('allowed', 'denied', 'failed', 'invalidated', 'completed')
  )
);

CREATE INDEX IF NOT EXISTS object_security_access_audit_tenant_time_idx
  ON public.object_security_access_audit (tenant_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS object_security_access_audit_object_time_idx
  ON public.object_security_access_audit (tenant_id, object_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.fieldgrid_object_security_record_revision_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  current_generation bigint;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'object security records are immutable; revoke with a new generation';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.tenant_id, NEW.object_id) IS DISTINCT FROM (OLD.tenant_id, OLD.object_id) THEN
    RAISE EXCEPTION 'object security record context is immutable';
  END IF;

  INSERT INTO public.object_security_object_revisions (tenant_id, object_id, generation)
  VALUES (NEW.tenant_id, NEW.object_id, 0)
  ON CONFLICT (tenant_id, object_id) DO NOTHING;

  SELECT revision.generation
    INTO current_generation
  FROM public.object_security_object_revisions revision
  WHERE revision.tenant_id = NEW.tenant_id
    AND revision.object_id = NEW.object_id
  FOR UPDATE;

  IF NEW.generation <= current_generation THEN
    RAISE EXCEPTION 'object security generation must increase monotonically';
  END IF;

  UPDATE public.object_security_object_revisions
  SET generation = NEW.generation, updated_at = now()
  WHERE tenant_id = NEW.tenant_id AND object_id = NEW.object_id;

  UPDATE public.object_security_unlock_sessions
  SET revoked_at = COALESCE(revoked_at, now()),
      revocation_reason = COALESCE(revocation_reason, 'record_generation_changed')
  WHERE tenant_id = NEW.tenant_id
    AND object_id = NEW.object_id
    AND revoked_at IS NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_object_security_record_revision_guard ON public.object_security_records;
CREATE TRIGGER trg_object_security_record_revision_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.object_security_records
FOR EACH ROW EXECUTE FUNCTION public.fieldgrid_object_security_record_revision_guard();

CREATE OR REPLACE FUNCTION public.fieldgrid_reject_legacy_object_secret_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.access_info IS NOT NULL OR NEW.key_info IS NOT NULL OR NEW.alarm_info IS NOT NULL THEN
      RAISE EXCEPTION 'legacy object secret columns are read-only quarantine sources';
    END IF;
  ELSIF NEW.access_info IS DISTINCT FROM OLD.access_info
     OR NEW.key_info IS DISTINCT FROM OLD.key_info
     OR NEW.alarm_info IS DISTINCT FROM OLD.alarm_info THEN
    RAISE EXCEPTION 'legacy object secret columns are read-only quarantine sources';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_objects_reject_legacy_secret_write ON public.objects;
CREATE TRIGGER trg_objects_reject_legacy_secret_write
BEFORE INSERT OR UPDATE OF access_info, key_info, alarm_info ON public.objects
FOR EACH ROW EXECUTE FUNCTION public.fieldgrid_reject_legacy_object_secret_write();

CREATE OR REPLACE FUNCTION public.fieldgrid_object_security_audit_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'object security audit is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_object_security_audit_append_only ON public.object_security_access_audit;
CREATE TRIGGER trg_object_security_audit_append_only
BEFORE UPDATE OR DELETE ON public.object_security_access_audit
FOR EACH ROW EXECUTE FUNCTION public.fieldgrid_object_security_audit_append_only();

ALTER TABLE public.object_security_object_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.object_security_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.object_security_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.object_security_unlock_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.object_security_access_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.object_security_object_revisions FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.object_security_records FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.object_security_challenges FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.object_security_unlock_sessions FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.object_security_access_audit FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fieldgrid_object_security_record_revision_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fieldgrid_reject_legacy_object_secret_write() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fieldgrid_object_security_audit_append_only() FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO public.permissions (resource, action, description)
VALUES
  ('object_security', 'read', 'Afgeschermde objectbeveiliging bekijken na aanvullende verificatie'),
  ('object_security', 'write', 'Afgeschermde objectbeveiliging versieerbaar beheren'),
  ('object_security', 'audit', 'Toegangsactiviteit voor objectbeveiliging controleren'),
  ('object_security', 'break_glass', 'Noodtoegang tot objectbeveiliging aanvragen')
ON CONFLICT (resource, action) DO UPDATE
SET description = EXCLUDED.description;

-- Deliberately grant none of these capabilities here. Role names (including
-- Management/Eigenaar), tenant-admin status, support mode and service-role are
-- never implicit authorization for plaintext. A tenant must publish an
-- explicit object_security permission assignment through rights management.

COMMENT ON TABLE public.object_security_records IS
  'Encrypted, versioned Object 360 security data. Decryption is server-only and separately authorized.';
COMMENT ON COLUMN public.object_security_records.encrypted_payload IS
  'AES-GCM application envelope; never index, log, export or expose through ordinary object DTOs.';
COMMENT ON TABLE public.object_security_challenges IS
  'OTP verification state. code_hmac stores only a keyed HMAC; plaintext codes are never persisted.';
COMMENT ON TABLE public.object_security_unlock_sessions IS
  'Revocable server-side handles bound to auth, assignment, policy and secret-generation context.';
