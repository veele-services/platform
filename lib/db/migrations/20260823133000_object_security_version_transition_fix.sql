-- Preserve ciphertext AAD for immutable historical records while allowing
-- explicit status transitions. The object revision remains monotonic and any
-- record change still revokes all open unlock sessions immediately.

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
    RAISE EXCEPTION 'object security records are immutable; revoke with an explicit status transition';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF (NEW.tenant_id, NEW.object_id, NEW.category, NEW.title,
        NEW.encrypted_payload, NEW.encryption_key_version, NEW.version,
        NEW.generation, NEW.valid_from, NEW.valid_until, NEW.source,
        NEW.change_reason, NEW.supersedes_record_id, NEW.created_by,
        NEW.created_at)
      IS DISTINCT FROM
       (OLD.tenant_id, OLD.object_id, OLD.category, OLD.title,
        OLD.encrypted_payload, OLD.encryption_key_version, OLD.version,
        OLD.generation, OLD.valid_from, OLD.valid_until, OLD.source,
        OLD.change_reason, OLD.supersedes_record_id, OLD.created_by,
        OLD.created_at) THEN
      RAISE EXCEPTION 'object security record content and cryptographic context are immutable';
    END IF;
    IF NEW.status NOT IN ('draft', 'pending_review', 'active', 'superseded', 'revoked') THEN
      RAISE EXCEPTION 'unsupported object security status transition';
    END IF;
  END IF;

  INSERT INTO public.object_security_object_revisions (tenant_id, object_id, generation)
  VALUES (NEW.tenant_id, NEW.object_id, 0)
  ON CONFLICT (tenant_id, object_id) DO NOTHING;

  SELECT revision.generation INTO current_generation
  FROM public.object_security_object_revisions revision
  WHERE revision.tenant_id = NEW.tenant_id
    AND revision.object_id = NEW.object_id
  FOR UPDATE;

  IF TG_OP = 'INSERT' THEN
    IF NEW.generation <= current_generation THEN
      RAISE EXCEPTION 'object security generation must increase monotonically';
    END IF;
    current_generation := NEW.generation;
  ELSE
    current_generation := current_generation + 1;
    NEW.updated_at := now();
  END IF;

  UPDATE public.object_security_object_revisions
  SET generation = current_generation, updated_at = now()
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

REVOKE ALL ON FUNCTION public.fieldgrid_object_security_record_revision_guard()
  FROM PUBLIC, anon, authenticated, service_role;
