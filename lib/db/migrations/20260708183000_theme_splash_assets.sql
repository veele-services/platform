-- Theme splash assets for platform defaults and Enterprise tenant overrides.
-- Theme tables stay server-side only; existing RLS and revoked browser grants remain unchanged.

ALTER TABLE public.platform_theme_settings
  ADD COLUMN IF NOT EXISTS splash_url text,
  ADD COLUMN IF NOT EXISTS splash_storage_path text;

ALTER TABLE public.tenant_theme_settings
  ADD COLUMN IF NOT EXISTS splash_url text,
  ADD COLUMN IF NOT EXISTS splash_storage_path text;

