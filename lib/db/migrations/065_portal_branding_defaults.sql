-- ============================================================================
-- Portal branding defaults
--
-- Staging-safe migration:
-- - changes only future organization_settings defaults from legacy text to
--   Fieldgrid platform-neutral copy;
-- - keeps existing tenant rows unchanged so tenant-specific branding/content is
--   preserved.
-- ============================================================================

ALTER TABLE organization_settings
  ALTER COLUMN email_template_footer_text
  SET DEFAULT 'Dit is een automatisch bericht van Fieldgrid. U ontvangt dit bericht omdat u betrokken bent bij een aanvraag, opdracht, rapportage, factuur of portaalmelding.';

ALTER TABLE organization_settings
  ALTER COLUMN email_template_signature
  SET DEFAULT 'Met vriendelijke groet,
Fieldgrid';
