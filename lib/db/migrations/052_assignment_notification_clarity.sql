-- Split personnel-link notifications from actual scheduled work-order notifications.

UPDATE notification_event_settings
SET
  title = 'Werkbon {{assignment.code}} ingepland',
  description = 'Je bent ingepland voor {{assignment.code}} op {{assignment.date}} van {{assignment.start}} tot {{assignment.end}}.',
  email_subject = 'Werkbon {{assignment.code}} ingepland',
  email_preheader = 'Bekijk je planning en werkbongegevens in het personeelsportaal.',
  email_body = '<p>Beste {{personnel.first_name}},</p><p>Je bent ingepland voor werkbon <strong>{{assignment.code}}</strong>.</p><p><strong>{{assignment.title}}</strong><br>{{object.name}}<br>{{assignment.date}} van {{assignment.start}} tot {{assignment.end}}</p><p>Open de werkbon tijdig in de personeelsapp zodat planning weet dat je deze hebt gezien.</p>',
  push_title = 'Werkbon {{assignment.code}} ingepland',
  push_body = '{{assignment.date}} {{assignment.time_range}} bij {{object.name}}.',
  push_enabled = true,
  in_app_enabled = true
WHERE event_key = 'assignment_assigned';

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
  'assignment_personnel_linked',
  'Planning',
  'personnel',
  'Werkbon {{assignment.code}} gekoppeld',
  'Je bent gekoppeld aan {{assignment.code}}. Planning zet datum en tijd nog definitief.',
  false,
  true,
  true,
  'Werkbon {{assignment.code}} gekoppeld',
  'Datum en tijd worden nog door planning vastgesteld.',
  '<p>Beste {{personnel.first_name}},</p><p>Je bent gekoppeld aan werkbon <strong>{{assignment.code}}</strong>.</p><p>Planning zet datum en tijd nog definitief. Zodra de bon is ingepland, verschijnt deze op de juiste dag in Mijn planning.</p>',
  'Werkbon {{assignment.code}} gekoppeld',
  'Je bent gekoppeld aan deze werkbon. Datum en tijd volgen nog.',
  '["{{personnel.first_name}}","{{assignment.code}}","{{assignment.title}}","{{object.name}}","{{assignment.date}}","{{assignment.start}}","{{assignment.end}}"]'::jsonb
)
ON CONFLICT (event_key) DO UPDATE
SET
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
