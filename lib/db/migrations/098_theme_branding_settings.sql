-- Central platform and tenant theme settings.
-- App servers read these tables over the direct database connection; browser/API access remains closed.

CREATE TABLE IF NOT EXISTS public.platform_theme_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton_key boolean NOT NULL DEFAULT true,
  brand_name varchar(120) NOT NULL DEFAULT 'Fieldgrid',
  logo_url text,
  logo_storage_path text,
  favicon_url text,
  favicon_storage_path text,
  primary_color varchar(20) NOT NULL DEFAULT '#081D3A',
  secondary_color varchar(20) NOT NULL DEFAULT '#133D6B',
  accent_color varchar(20) NOT NULL DEFAULT '#00B7B3',
  background_color varchar(20) NOT NULL DEFAULT '#F8FAFC',
  surface_color varchar(20) NOT NULL DEFAULT '#FFFFFF',
  text_color varchar(20) NOT NULL DEFAULT '#081D3A',
  muted_color varchar(20) NOT NULL DEFAULT '#64748B',
  font_family varchar(60) NOT NULL DEFAULT 'inter',
  heading_font_family varchar(60) NOT NULL DEFAULT 'poppins',
  border_radius varchar(20) NOT NULL DEFAULT 'md',
  density varchar(20) NOT NULL DEFAULT 'comfortable',
  email_footer_text text NOT NULL DEFAULT 'Dit is een automatisch bericht van Fieldgrid. U ontvangt dit bericht omdat u betrokken bent bij een aanvraag, opdracht, rapportage, factuur of portaalmelding.',
  email_signature text NOT NULL DEFAULT 'Met vriendelijke groet,
Fieldgrid',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_theme_settings_singleton_idx
  ON public.platform_theme_settings (singleton_key);

ALTER TABLE public.platform_theme_settings
  DROP CONSTRAINT IF EXISTS platform_theme_settings_color_check;
ALTER TABLE public.platform_theme_settings
  ADD CONSTRAINT platform_theme_settings_color_check
  CHECK (
    primary_color ~ '^#[0-9A-Fa-f]{6}$'
    AND secondary_color ~ '^#[0-9A-Fa-f]{6}$'
    AND accent_color ~ '^#[0-9A-Fa-f]{6}$'
    AND background_color ~ '^#[0-9A-Fa-f]{6}$'
    AND surface_color ~ '^#[0-9A-Fa-f]{6}$'
    AND text_color ~ '^#[0-9A-Fa-f]{6}$'
    AND muted_color ~ '^#[0-9A-Fa-f]{6}$'
  );

ALTER TABLE public.platform_theme_settings
  DROP CONSTRAINT IF EXISTS platform_theme_settings_choice_check;
ALTER TABLE public.platform_theme_settings
  ADD CONSTRAINT platform_theme_settings_choice_check
  CHECK (
    font_family IN ('inter', 'poppins', 'system')
    AND heading_font_family IN ('inter', 'poppins', 'system')
    AND border_radius IN ('sm', 'md', 'lg')
    AND density IN ('compact', 'comfortable', 'spacious')
  );

INSERT INTO public.platform_theme_settings (singleton_key)
VALUES (true)
ON CONFLICT (singleton_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.tenant_theme_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  use_custom_theme boolean NOT NULL DEFAULT false,
  brand_name varchar(120),
  logo_url text,
  logo_storage_path text,
  favicon_url text,
  favicon_storage_path text,
  primary_color varchar(20),
  secondary_color varchar(20),
  accent_color varchar(20),
  background_color varchar(20),
  surface_color varchar(20),
  text_color varchar(20),
  muted_color varchar(20),
  font_family varchar(60),
  heading_font_family varchar(60),
  border_radius varchar(20),
  density varchar(20),
  email_footer_text text,
  email_signature text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_theme_settings_tenant_idx
  ON public.tenant_theme_settings (tenant_id);

CREATE INDEX IF NOT EXISTS tenant_theme_settings_enabled_idx
  ON public.tenant_theme_settings (use_custom_theme);

ALTER TABLE public.tenant_theme_settings
  DROP CONSTRAINT IF EXISTS tenant_theme_settings_color_check;
ALTER TABLE public.tenant_theme_settings
  ADD CONSTRAINT tenant_theme_settings_color_check
  CHECK (
    (primary_color IS NULL OR primary_color ~ '^#[0-9A-Fa-f]{6}$')
    AND (secondary_color IS NULL OR secondary_color ~ '^#[0-9A-Fa-f]{6}$')
    AND (accent_color IS NULL OR accent_color ~ '^#[0-9A-Fa-f]{6}$')
    AND (background_color IS NULL OR background_color ~ '^#[0-9A-Fa-f]{6}$')
    AND (surface_color IS NULL OR surface_color ~ '^#[0-9A-Fa-f]{6}$')
    AND (text_color IS NULL OR text_color ~ '^#[0-9A-Fa-f]{6}$')
    AND (muted_color IS NULL OR muted_color ~ '^#[0-9A-Fa-f]{6}$')
  );

ALTER TABLE public.tenant_theme_settings
  DROP CONSTRAINT IF EXISTS tenant_theme_settings_choice_check;
ALTER TABLE public.tenant_theme_settings
  ADD CONSTRAINT tenant_theme_settings_choice_check
  CHECK (
    (font_family IS NULL OR font_family IN ('inter', 'poppins', 'system'))
    AND (heading_font_family IS NULL OR heading_font_family IN ('inter', 'poppins', 'system'))
    AND (border_radius IS NULL OR border_radius IN ('sm', 'md', 'lg'))
    AND (density IS NULL OR density IN ('compact', 'comfortable', 'spacious'))
  );

ALTER TABLE public.platform_theme_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_theme_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.platform_theme_settings FROM anon, authenticated;
REVOKE ALL ON TABLE public.tenant_theme_settings FROM anon, authenticated;

COMMENT ON TABLE public.platform_theme_settings IS
  'Singleton platform fallback theme for Fieldgrid surfaces.';
COMMENT ON TABLE public.tenant_theme_settings IS
  'Tenant-specific theme overrides. Effective theme is Fieldgrid defaults, then platform settings, then enabled tenant overrides.';
