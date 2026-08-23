-- Close the remaining history and backfill invariants without modifying prior
-- migrations: every UPDATE must be a real forward status transition, and a
-- legacy value may only be cleared after a matching encrypted record exists.

CREATE OR REPLACE FUNCTION public.fieldgrid_object_security_record_revision_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE current_generation bigint;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'object security records are immutable';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status = OLD.status THEN
      RAISE EXCEPTION 'object security updates require an explicit forward status transition';
    END IF;
    IF (NEW.tenant_id, NEW.object_id, NEW.category, NEW.title,
        NEW.encrypted_payload, NEW.encryption_key_version, NEW.version,
        NEW.generation, NEW.valid_from, NEW.valid_until, NEW.source,
        NEW.change_reason, NEW.supersedes_record_id, NEW.created_by,
        NEW.created_at, NEW.reviewed_by, NEW.reviewed_at)
      IS DISTINCT FROM
       (OLD.tenant_id, OLD.object_id, OLD.category, OLD.title,
        OLD.encrypted_payload, OLD.encryption_key_version, OLD.version,
        OLD.generation, OLD.valid_from, OLD.valid_until, OLD.source,
        OLD.change_reason, OLD.supersedes_record_id, OLD.created_by,
        OLD.created_at, OLD.reviewed_by, OLD.reviewed_at) THEN
      RAISE EXCEPTION 'object security content, context and review evidence are immutable';
    END IF;
    IF NOT (
      (OLD.status = 'draft' AND NEW.status IN ('pending_review', 'active', 'revoked'))
      OR (OLD.status = 'pending_review' AND NEW.status IN ('active', 'revoked'))
      OR (OLD.status = 'active' AND NEW.status IN ('superseded', 'revoked'))
    ) THEN
      RAISE EXCEPTION 'object security status cannot regress or reactivate historical content';
    END IF;
    IF NEW.status = 'revoked' AND (NEW.revoked_at IS NULL OR NEW.revoked_by IS NULL) THEN
      RAISE EXCEPTION 'revocation evidence is required';
    END IF;
  END IF;
  INSERT INTO public.object_security_object_revisions(tenant_id, object_id, generation)
  VALUES (NEW.tenant_id, NEW.object_id, 0) ON CONFLICT (tenant_id, object_id) DO NOTHING;
  SELECT generation INTO current_generation FROM public.object_security_object_revisions
  WHERE tenant_id = NEW.tenant_id AND object_id = NEW.object_id FOR UPDATE;
  IF TG_OP = 'INSERT' THEN
    IF NEW.generation <= current_generation THEN RAISE EXCEPTION 'object security generation must increase monotonically'; END IF;
    current_generation := NEW.generation;
  ELSE
    current_generation := current_generation + 1;
    NEW.updated_at := now();
  END IF;
  UPDATE public.object_security_object_revisions SET generation = current_generation, updated_at = now()
  WHERE tenant_id = NEW.tenant_id AND object_id = NEW.object_id;
  UPDATE public.object_security_unlock_sessions
  SET revoked_at = COALESCE(revoked_at, now()), revocation_reason = COALESCE(revocation_reason, 'record_generation_changed')
  WHERE tenant_id = NEW.tenant_id AND object_id = NEW.object_id AND revoked_at IS NULL;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fieldgrid_reject_legacy_object_secret_write()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.access_info IS NOT NULL OR NEW.key_info IS NOT NULL OR NEW.alarm_info IS NOT NULL THEN
      RAISE EXCEPTION 'legacy object secret columns reject plaintext';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.access_info IS DISTINCT FROM OLD.access_info THEN
    IF NEW.access_info IS NOT NULL OR NOT EXISTS (
      SELECT 1 FROM public.object_security_records r WHERE r.tenant_id = OLD.tenant_id AND r.object_id = OLD.id
        AND r.category = 'access_instructions' AND r.status = 'active'
    ) THEN RAISE EXCEPTION 'access info may only clear after encrypted backfill'; END IF;
  END IF;
  IF NEW.key_info IS DISTINCT FROM OLD.key_info THEN
    IF NEW.key_info IS NOT NULL OR NOT EXISTS (
      SELECT 1 FROM public.object_security_records r WHERE r.tenant_id = OLD.tenant_id AND r.object_id = OLD.id
        AND r.category = 'key_management' AND r.status = 'active'
    ) THEN RAISE EXCEPTION 'key info may only clear after encrypted backfill'; END IF;
  END IF;
  IF NEW.alarm_info IS DISTINCT FROM OLD.alarm_info THEN
    IF NEW.alarm_info IS NOT NULL OR NOT EXISTS (
      SELECT 1 FROM public.object_security_records r WHERE r.tenant_id = OLD.tenant_id AND r.object_id = OLD.id
        AND r.category = 'alarm_procedure' AND r.status = 'active'
    ) THEN RAISE EXCEPTION 'alarm info may only clear after encrypted backfill'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fieldgrid_object_security_record_revision_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fieldgrid_reject_legacy_object_secret_write() FROM PUBLIC, anon, authenticated, service_role;
