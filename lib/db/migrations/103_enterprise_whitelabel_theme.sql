-- Enterprise whitelabel theme extensions.
-- Sidebar colors are part of the effective brand theme for Enterprise tenants.

ALTER TABLE public.platform_theme_settings
  ADD COLUMN IF NOT EXISTS sidebar_background_color varchar(20) NOT NULL DEFAULT '#081D3A',
  ADD COLUMN IF NOT EXISTS sidebar_text_color varchar(20) NOT NULL DEFAULT '#FFFFFF',
  ADD COLUMN IF NOT EXISTS sidebar_accent_color varchar(20) NOT NULL DEFAULT '#00B7B3';

ALTER TABLE public.tenant_theme_settings
  ADD COLUMN IF NOT EXISTS sidebar_background_color varchar(20),
  ADD COLUMN IF NOT EXISTS sidebar_text_color varchar(20),
  ADD COLUMN IF NOT EXISTS sidebar_accent_color varchar(20);

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
    AND sidebar_background_color ~ '^#[0-9A-Fa-f]{6}$'
    AND sidebar_text_color ~ '^#[0-9A-Fa-f]{6}$'
    AND sidebar_accent_color ~ '^#[0-9A-Fa-f]{6}$'
  );

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
    AND (sidebar_background_color IS NULL OR sidebar_background_color ~ '^#[0-9A-Fa-f]{6}$')
    AND (sidebar_text_color IS NULL OR sidebar_text_color ~ '^#[0-9A-Fa-f]{6}$')
    AND (sidebar_accent_color IS NULL OR sidebar_accent_color ~ '^#[0-9A-Fa-f]{6}$')
  );

COMMENT ON COLUMN public.platform_theme_settings.sidebar_background_color IS
  'Platform default sidebar background color.';
COMMENT ON COLUMN public.tenant_theme_settings.sidebar_background_color IS
  'Enterprise organization sidebar background override.';
