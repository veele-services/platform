-- Adds the personnel PWA "Onderweg" milestone and customer-facing notification.

ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS en_route_at timestamptz;

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
  shortcodes
)
VALUES (
  'assignment_en_route',
  'Planning',
  'customer',
  'Medewerker onderweg',
  'Een medewerker heeft gemeld onderweg te zijn naar de locatie.',
  true,
  true,
  true,
  'We zijn onderweg voor {{assignment.code}}',
  'Onze medewerker is onderweg naar de locatie.',
  '<p>Beste {{customer.name}},</p><p>Onze medewerker is onderweg voor werkbon <strong>{{assignment.code}}</strong>.</p><p>Planning: <strong>{{assignment.date}}</strong>, {{assignment.time_range}}.</p><p>U kunt de opdracht volgen in het klantportaal.</p>',
  'Medewerker onderweg',
  'Onze medewerker is onderweg voor {{assignment.code}}.',
  '["{{customer.name}}","{{assignment.code}}","{{assignment.title}}","{{assignment.date}}","{{assignment.time_range}}","{{object.name}}","{{personnel.name}}"]'::jsonb
)
ON CONFLICT (event_key) DO UPDATE SET
  event_group = EXCLUDED.event_group,
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
