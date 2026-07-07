-- Tenant-scoped e-mail template overrides.
-- The application server renders templates through @workspace/db; browser/API roles do not get direct table access.

CREATE TABLE IF NOT EXISTS public.tenant_email_template_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  template_key varchar(120) NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  subject_template text,
  preheader_template text,
  headline_template text,
  intro_template text,
  cta_label_template text,
  cta_url_template text,
  footer_note_template text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_email_template_overrides_tenant_template_idx
  ON public.tenant_email_template_overrides (tenant_id, template_key);

CREATE INDEX IF NOT EXISTS tenant_email_template_overrides_enabled_idx
  ON public.tenant_email_template_overrides (is_enabled);

ALTER TABLE public.tenant_email_template_overrides ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.tenant_email_template_overrides FROM anon, authenticated;

COMMENT ON TABLE public.tenant_email_template_overrides IS
  'Tenant-specific overrides for centralized transactional e-mail templates. Effective template is code registry plus enabled tenant override.';
