-- Phase 6: public website forms, durable tenant-scoped submissions and
-- idempotent CRM lead conversion. Public clients never receive table access;
-- all writes cross the host-bound platform API.

CREATE TABLE IF NOT EXISTS public.website_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  site_id uuid NOT NULL,
  key varchar(80) NOT NULL,
  locale varchar(20) NOT NULL DEFAULT 'nl-NL',
  kind varchar(20) NOT NULL,
  name varchar(160) NOT NULL,
  fields jsonb NOT NULL,
  submit_label varchar(80) NOT NULL,
  success_message varchar(500) NOT NULL,
  notification_email varchar(254),
  status varchar(20) NOT NULL DEFAULT 'draft',
  authoring_revision integer NOT NULL DEFAULT 1,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT website_forms_tenant_site_id_unique
    UNIQUE (tenant_id, site_id, id),
  CONSTRAINT website_forms_tenant_site_fk
    FOREIGN KEY (tenant_id, site_id)
    REFERENCES public.website_sites(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT website_forms_key_check
    CHECK (key ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  CONSTRAINT website_forms_locale_check
    CHECK (locale ~ '^[a-z]{2}-[A-Z]{2}$'),
  CONSTRAINT website_forms_kind_check
    CHECK (kind IN ('contact', 'quote', 'callback', 'emergency')),
  CONSTRAINT website_forms_status_check
    CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT website_forms_name_check
    CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 160),
  CONSTRAINT website_forms_submit_label_check
    CHECK (
      submit_label = btrim(submit_label)
      AND char_length(submit_label) BETWEEN 1 AND 80
    ),
  CONSTRAINT website_forms_success_message_check
    CHECK (
      success_message = btrim(success_message)
      AND char_length(success_message) BETWEEN 1 AND 500
    ),
  CONSTRAINT website_forms_notification_email_check
    CHECK (
      notification_email IS NULL
      OR (
        notification_email = lower(btrim(notification_email))
        AND char_length(notification_email) BETWEEN 3 AND 254
        AND notification_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      )
    ),
  CONSTRAINT website_forms_fields_check
    CHECK (
      jsonb_typeof(fields) = 'array'
      AND jsonb_array_length(fields) BETWEEN 1 AND 12
      AND octet_length(fields::text) <= 16384
    ),
  CONSTRAINT website_forms_authoring_revision_check
    CHECK (authoring_revision > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS website_forms_site_locale_key_idx
  ON public.website_forms (tenant_id, site_id, locale, key)
  WHERE status <> 'archived';
CREATE INDEX IF NOT EXISTS website_forms_tenant_site_status_idx
  ON public.website_forms (tenant_id, site_id, status);

CREATE TABLE IF NOT EXISTS public.website_form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  site_id uuid NOT NULL,
  form_id uuid NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'new',
  payload jsonb NOT NULL,
  payload_hash varchar(64) NOT NULL,
  idempotency_hash varchar(64) NOT NULL,
  request_fingerprint varchar(64) NOT NULL,
  source_hostname varchar(253) NOT NULL,
  contact_name varchar(160),
  contact_email varchar(254),
  contact_phone varchar(50),
  notification_status varchar(20) NOT NULL DEFAULT 'pending',
  notification_attempted_at timestamptz,
  notification_error varchar(500),
  customer_id uuid REFERENCES public.customers(id) ON DELETE RESTRICT,
  converted_at timestamptz,
  converted_by uuid,
  read_at timestamptz,
  read_by uuid,
  retention_until timestamptz NOT NULL DEFAULT (now() + interval '365 days'),
  is_redacted boolean NOT NULL DEFAULT false,
  redacted_at timestamptz,
  redacted_by uuid,
  received_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT website_form_submissions_tenant_site_id_unique
    UNIQUE (tenant_id, site_id, id),
  CONSTRAINT website_form_submissions_form_fk
    FOREIGN KEY (tenant_id, site_id, form_id)
    REFERENCES public.website_forms(tenant_id, site_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT website_form_submissions_status_check
    CHECK (
      status IN ('new', 'read', 'in_progress', 'converted', 'archived', 'spam')
    ),
  CONSTRAINT website_form_submissions_notification_status_check
    CHECK (
      notification_status IN ('pending', 'sending', 'sent', 'failed', 'skipped')
    ),
  CONSTRAINT website_form_submissions_payload_check
    CHECK (
      jsonb_typeof(payload) = 'object'
      AND octet_length(payload::text) <= 16384
    ),
  CONSTRAINT website_form_submissions_hash_check
    CHECK (
      payload_hash ~ '^[0-9a-f]{64}$'
      AND idempotency_hash ~ '^[0-9a-f]{64}$'
      AND request_fingerprint ~ '^[0-9a-f]{64}$'
    ),
  CONSTRAINT website_form_submissions_hostname_check
    CHECK (
      source_hostname = lower(btrim(source_hostname))
      AND source_hostname ~ '^[a-z0-9][a-z0-9.-]*[a-z0-9]$'
      AND position('.' in source_hostname) > 0
      AND position('..' in source_hostname) = 0
    ),
  CONSTRAINT website_form_submissions_email_check
    CHECK (
      contact_email IS NULL
      OR (
        contact_email = lower(btrim(contact_email))
        AND char_length(contact_email) BETWEEN 3 AND 254
        AND contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      )
    ),
  CONSTRAINT website_form_submissions_conversion_check
    CHECK (
      (
        status IN ('converted', 'archived')
        AND customer_id IS NOT NULL
        AND converted_at IS NOT NULL
        AND converted_by IS NOT NULL
      )
      OR (
        status <> 'converted'
        AND customer_id IS NULL
        AND converted_at IS NULL
        AND converted_by IS NULL
      )
    ),
  CONSTRAINT website_form_submissions_read_check
    CHECK (
      (read_at IS NULL AND read_by IS NULL)
      OR (read_at IS NOT NULL AND read_by IS NOT NULL)
    ),
  CONSTRAINT website_form_submissions_notification_check
    CHECK (
      notification_status = 'pending'
      OR notification_attempted_at IS NOT NULL
    ),
  CONSTRAINT website_form_submissions_redaction_check
    CHECK (
      (
        is_redacted = false
        AND redacted_at IS NULL
        AND redacted_by IS NULL
      )
      OR (
        is_redacted = true
        AND redacted_at IS NOT NULL
        AND redacted_by IS NOT NULL
        AND payload = '{}'::jsonb
        AND contact_name IS NULL
        AND contact_email IS NULL
        AND contact_phone IS NULL
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS website_form_submissions_idempotency_idx
  ON public.website_form_submissions (tenant_id, form_id, idempotency_hash);
CREATE INDEX IF NOT EXISTS website_form_submissions_inbox_idx
  ON public.website_form_submissions
    (tenant_id, site_id, status, received_at DESC);
CREATE INDEX IF NOT EXISTS website_form_submissions_retention_idx
  ON public.website_form_submissions
    (tenant_id, retention_until)
  WHERE is_redacted = false;
CREATE INDEX IF NOT EXISTS website_form_submissions_customer_idx
  ON public.website_form_submissions (tenant_id, customer_id)
  WHERE customer_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.website_form_submission_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  site_id uuid NOT NULL,
  submission_id uuid NOT NULL,
  event_type varchar(40) NOT NULL,
  actor_user_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT website_form_submission_events_submission_fk
    FOREIGN KEY (tenant_id, site_id, submission_id)
    REFERENCES public.website_form_submissions(tenant_id, site_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT website_form_submission_events_type_check
    CHECK (
      event_type IN (
        'received',
        'notification_sent',
        'notification_failed',
        'notification_skipped',
        'marked_read',
        'status_changed',
        'converted_to_lead',
        'redacted'
      )
    ),
  CONSTRAINT website_form_submission_events_metadata_check
    CHECK (
      jsonb_typeof(metadata) = 'object'
      AND octet_length(metadata::text) <= 8192
    )
);

CREATE INDEX IF NOT EXISTS website_form_submission_events_timeline_idx
  ON public.website_form_submission_events
    (tenant_id, submission_id, created_at, id);

CREATE TABLE IF NOT EXISTS public.website_form_rate_limits (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  site_id uuid NOT NULL,
  form_id uuid NOT NULL,
  request_fingerprint varchar(64) NOT NULL,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 1,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (
    tenant_id,
    form_id,
    request_fingerprint,
    window_started_at
  ),
  CONSTRAINT website_form_rate_limits_form_fk
    FOREIGN KEY (tenant_id, site_id, form_id)
    REFERENCES public.website_forms(tenant_id, site_id, id)
    ON DELETE CASCADE,
  CONSTRAINT website_form_rate_limits_hash_check
    CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT website_form_rate_limits_count_check
    CHECK (request_count > 0 AND request_count <= 100000),
  CONSTRAINT website_form_rate_limits_expiry_check
    CHECK (expires_at > window_started_at)
);

CREATE INDEX IF NOT EXISTS website_form_rate_limits_expiry_idx
  ON public.website_form_rate_limits (expires_at);

CREATE OR REPLACE FUNCTION public.website_guard_form_ownership()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.site_id IS DISTINCT FROM OLD.site_id
  THEN
    RAISE EXCEPTION 'website form ownership is immutable';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.website_guard_form_ownership()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.website_guard_form_submission()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  customer_tenant_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
      OR NEW.site_id IS DISTINCT FROM OLD.site_id
      OR NEW.form_id IS DISTINCT FROM OLD.form_id
      OR NEW.payload_hash IS DISTINCT FROM OLD.payload_hash
      OR NEW.idempotency_hash IS DISTINCT FROM OLD.idempotency_hash
      OR NEW.request_fingerprint IS DISTINCT FROM OLD.request_fingerprint
      OR NEW.source_hostname IS DISTINCT FROM OLD.source_hostname
      OR NEW.received_at IS DISTINCT FROM OLD.received_at
      OR NEW.retention_until IS DISTINCT FROM OLD.retention_until
    THEN
      RAISE EXCEPTION 'website submission source identity is immutable';
    END IF;

    IF NEW.is_redacted IS DISTINCT FROM OLD.is_redacted
      AND NOT (OLD.is_redacted = false AND NEW.is_redacted = true)
    THEN
      RAISE EXCEPTION 'website submission redaction is irreversible';
    END IF;
    IF OLD.is_redacted AND (
      NEW.payload IS DISTINCT FROM OLD.payload
      OR NEW.contact_name IS DISTINCT FROM OLD.contact_name
      OR NEW.contact_email IS DISTINCT FROM OLD.contact_email
      OR NEW.contact_phone IS DISTINCT FROM OLD.contact_phone
    ) THEN
      RAISE EXCEPTION 'redacted website submission data is immutable';
    END IF;
    IF NOT OLD.is_redacted
      AND NOT NEW.is_redacted
      AND (
        NEW.payload IS DISTINCT FROM OLD.payload
        OR NEW.contact_name IS DISTINCT FROM OLD.contact_name
        OR NEW.contact_email IS DISTINCT FROM OLD.contact_email
        OR NEW.contact_phone IS DISTINCT FROM OLD.contact_phone
      )
    THEN
      RAISE EXCEPTION 'website submission payload is immutable';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
      (OLD.status = 'new' AND NEW.status IN (
        'read', 'in_progress', 'converted', 'archived', 'spam'
      ))
      OR (OLD.status = 'read' AND NEW.status IN (
        'in_progress', 'converted', 'archived', 'spam'
      ))
      OR (OLD.status = 'in_progress' AND NEW.status IN (
        'read', 'converted', 'archived', 'spam'
      ))
      OR (OLD.status = 'converted' AND NEW.status = 'archived')
      OR (OLD.status = 'spam' AND NEW.status = 'archived')
    ) THEN
      RAISE EXCEPTION 'invalid website submission lifecycle transition';
    END IF;

    IF OLD.notification_status IN ('sent', 'skipped')
      AND NEW.notification_status IS DISTINCT FROM OLD.notification_status
    THEN
      RAISE EXCEPTION 'completed website submission notification is immutable';
    END IF;
  END IF;

  IF NEW.customer_id IS NOT NULL THEN
    SELECT customer.tenant_id
    INTO customer_tenant_id
    FROM public.customers customer
    WHERE customer.id = NEW.customer_id;
    IF customer_tenant_id IS DISTINCT FROM NEW.tenant_id THEN
      RAISE EXCEPTION 'converted customer must belong to the submission tenant';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.website_guard_form_submission()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.website_form_submission_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'website form submission events are append-only';
END;
$$;
REVOKE ALL ON FUNCTION public.website_form_submission_events_append_only()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_website_forms_guard
BEFORE UPDATE ON public.website_forms
FOR EACH ROW EXECUTE FUNCTION public.website_guard_form_ownership();
CREATE TRIGGER trg_website_form_submissions_guard
BEFORE INSERT OR UPDATE ON public.website_form_submissions
FOR EACH ROW EXECUTE FUNCTION public.website_guard_form_submission();
CREATE TRIGGER trg_website_form_submission_events_append_only
BEFORE UPDATE OR DELETE ON public.website_form_submission_events
FOR EACH ROW EXECUTE FUNCTION public.website_form_submission_events_append_only();

-- Existing sites receive a safe published contact form. The notification
-- recipient is copied only when the existing public contact e-mail is valid.
-- The authoring revision bump makes the new publication input explicit.
INSERT INTO public.website_forms (
  tenant_id,
  site_id,
  key,
  locale,
  kind,
  name,
  fields,
  submit_label,
  success_message,
  notification_email,
  status,
  created_by,
  updated_by
)
SELECT
  site.tenant_id,
  site.id,
  'contact',
  site.default_locale,
  'contact',
  'Contactformulier',
  '[
    {"key":"name","label":"Naam","required":true,"placeholder":null},
    {"key":"email","label":"E-mailadres","required":true,"placeholder":null},
    {"key":"phone","label":"Telefoonnummer","required":false,"placeholder":null},
    {"key":"message","label":"Bericht","required":true,"placeholder":null}
  ]'::jsonb,
  'Versturen',
  'Bedankt. We nemen zo snel mogelijk contact met u op.',
  CASE
    WHEN lower(btrim(site.contact ->> 'email'))
      ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    THEN lower(btrim(site.contact ->> 'email'))
    ELSE NULL
  END,
  'published',
  site.created_by,
  site.updated_by
FROM public.website_sites site
WHERE NOT EXISTS (
  SELECT 1
  FROM public.website_forms form
  WHERE form.tenant_id = site.tenant_id
    AND form.site_id = site.id
    AND form.locale = site.default_locale
    AND form.key = 'contact'
    AND form.status <> 'archived'
);

UPDATE public.website_sites site
SET
  authoring_revision = site.authoring_revision + 1,
  updated_at = now()
WHERE EXISTS (
  SELECT 1
  FROM public.website_forms form
  WHERE form.tenant_id = site.tenant_id
    AND form.site_id = site.id
    AND form.key = 'contact'
    AND form.created_at >= transaction_timestamp()
);

CREATE TRIGGER trg_website_forms_touch_authoring
AFTER INSERT OR UPDATE OR DELETE ON public.website_forms
FOR EACH ROW EXECUTE FUNCTION public.website_touch_child_authoring_revision();

ALTER TABLE public.website_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_form_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_form_submission_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_form_rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.website_forms FROM anon, authenticated;
REVOKE ALL ON TABLE public.website_form_submissions FROM anon, authenticated;
REVOKE ALL ON TABLE public.website_form_submission_events FROM anon, authenticated;
REVOKE ALL ON TABLE public.website_form_rate_limits FROM anon, authenticated;

COMMENT ON TABLE public.website_forms IS
  'Tenant-owned form definitions; only published public fields enter immutable website snapshots.';
COMMENT ON TABLE public.website_form_submissions IS
  'Durable host-bound public form submissions. Raw network identifiers are never stored.';
COMMENT ON TABLE public.website_form_submission_events IS
  'Append-only submission lifecycle and notification timeline without duplicated contact payloads.';
COMMENT ON TABLE public.website_form_rate_limits IS
  'Durable HMAC-pseudonymized throttling buckets for public website forms.';
