BEGIN;

ALTER TABLE public.website_page_sections
  ADD COLUMN IF NOT EXISTS requires_review boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.website_page_sections.requires_review IS
  'Blocks managed publication until code-owned template placeholder content has been explicitly reviewed.';

COMMIT;
