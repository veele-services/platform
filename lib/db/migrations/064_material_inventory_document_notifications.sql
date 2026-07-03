-- ============================================================================
-- Phase 9 material/inventory document notification settings
--
-- Staging-safe data migration:
-- - only upserts notification event settings;
-- - does not change schema or tenant data;
-- - keeps inventory issue reporting, document upload and maintenance signals
--   visible in the tenant-scoped notification configuration.
-- ============================================================================

INSERT INTO notification_event_settings (
  event_key,
  event_group,
  audience,
  title,
  description,
  email_enabled,
  push_enabled,
  in_app_enabled,
  email_subject,
  email_preheader,
  email_body,
  push_title,
  push_body,
  shortcodes,
  updated_at
)
VALUES
  (
    'inventory.issue.reported',
    'inventory',
    'management',
    'Nieuwe inventarisstoring',
    'Melding wanneer personeel een storing op een inventarisitem rapporteert.',
    true,
    false,
    true,
    'Nieuwe inventarisstoring: {{inventory_code}}',
    'Er is een storing gemeld op {{inventory_name}}.',
    'Er is een storing gemeld op {{inventory_name}} ({{inventory_code}}). Prioriteit: {{severity}}. Open Fieldgrid om de opvolging te starten.',
    'Nieuwe inventarisstoring',
    '{{inventory_code}} - {{inventory_name}}',
    '["inventory_code", "inventory_name", "severity", "tenant_name"]'::jsonb,
    now()
  ),
  (
    'inventory.document.uploaded',
    'inventory',
    'management',
    'Inventarisdocument geüpload',
    'Melding wanneer een foto, certificaat, handleiding of bewijsstuk aan inventaris wordt gekoppeld.',
    true,
    false,
    true,
    'Inventarisdocument toegevoegd: {{document_name}}',
    'Er is een document gekoppeld aan {{inventory_name}}.',
    'Het document {{document_name}} is gekoppeld aan {{inventory_name}}. Downloads blijven tenant-gebonden en worden gelogd.',
    'Inventarisdocument toegevoegd',
    '{{document_name}}',
    '["document_name", "inventory_code", "inventory_name", "tenant_name"]'::jsonb,
    now()
  ),
  (
    'inventory.maintenance.due',
    'inventory',
    'management',
    'Inventarisonderhoud gepland of verlopen',
    'Signaal voor onderhoud, keuring of reparatie die binnenkort nodig is of verlopen is.',
    true,
    false,
    true,
    'Onderhoud inventaris: {{inventory_code}}',
    '{{inventory_name}} heeft opvolging nodig.',
    '{{inventory_name}} ({{inventory_code}}) heeft onderhoud, keuring of reparatie nodig. Controleer de inventarisopvolging in Fieldgrid.',
    'Onderhoud inventaris',
    '{{inventory_code}} vraagt opvolging',
    '["inventory_code", "inventory_name", "due_date", "tenant_name"]'::jsonb,
    now()
  ),
  (
    'material.stock.low',
    'materials',
    'management',
    'Materiaalvoorraad laag',
    'Signaal wanneer materiaalvoorraad onder de ingestelde minimumwaarde komt.',
    true,
    false,
    true,
    'Materiaalvoorraad laag: {{material_code}}',
    '{{material_name}} vraagt aanvulling.',
    'De voorraad van {{material_name}} ({{material_code}}) is laag op {{location_name}}. Controleer voorraad en bestel of verplaats materiaal waar nodig.',
    'Materiaalvoorraad laag',
    '{{material_code}} - {{location_name}}',
    '["material_code", "material_name", "location_name", "tenant_name"]'::jsonb,
    now()
  )
ON CONFLICT (event_key) DO UPDATE
SET event_group = EXCLUDED.event_group,
    audience = EXCLUDED.audience,
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    email_enabled = EXCLUDED.email_enabled,
    push_enabled = EXCLUDED.push_enabled,
    in_app_enabled = EXCLUDED.in_app_enabled,
    email_subject = EXCLUDED.email_subject,
    email_preheader = EXCLUDED.email_preheader,
    email_body = EXCLUDED.email_body,
    push_title = EXCLUDED.push_title,
    push_body = EXCLUDED.push_body,
    shortcodes = EXCLUDED.shortcodes,
    updated_at = now();
