-- Adds workflow notification events that were introduced after the first
-- notification-center baseline. Existing tenant-customized events are left
-- untouched by ON CONFLICT DO NOTHING.

INSERT INTO notification_event_settings (
  event_key, event_group, audience, title, description,
  email_enabled, push_enabled, in_app_enabled,
  email_subject, email_preheader, email_body,
  push_title, push_body, shortcodes
)
VALUES
('assignment_seen', 'Planning', 'management', 'Werkbon gezien', 'Een medewerker heeft een ingeplande werkbon geopend.', false, true, true, 'Werkbon {{assignment.code}} is gezien', 'De medewerker heeft de werkbon geopend.', '<p>Beste collega,</p><p>Werkbon <strong>{{assignment.code}}</strong> is gezien door <strong>{{personnel.name}}</strong>.</p><p>Planning weet hiermee dat de medewerker de opdracht heeft ontvangen en geopend.</p>', 'Werkbon gezien', '{{personnel.name}} heeft {{assignment.code}} gezien.', '["{{assignment.code}}","{{assignment.title}}","{{personnel.name}}"]'::jsonb),
('assignment_started', 'Planning', 'management', 'Werkbon gestart', 'Een medewerker heeft de werkzaamheden gestart.', false, true, true, 'Werkbon {{assignment.code}} is gestart', 'De uitvoering is gestart.', '<p>Beste collega,</p><p><strong>{{personnel.name}}</strong> is gestart met werkbon <strong>{{assignment.code}}</strong>.</p><p>De actuele starttijd is vastgelegd in de werkbon.</p>', 'Werkbon gestart', '{{assignment.code}} is gestart.', '["{{assignment.code}}","{{assignment.title}}","{{personnel.name}}","{{assignment.time_range}}"]'::jsonb),
('report_available_to_customer', 'Rapportage', 'customer', 'Rapport beschikbaar', 'Een goedgekeurd rapport is beschikbaar voor de klant.', true, true, true, 'Rapport {{assignment.code}} staat klaar', 'Bekijk het rapport in het klantportaal.', '<p>Beste {{customer.name}},</p><p>Het rapport voor <strong>{{assignment.code}}</strong> staat klaar in het klantportaal.</p><p>U kunt de uitgevoerde werkzaamheden en opmerkingen daar bekijken.</p>', 'Rapport beschikbaar', 'Rapport {{assignment.code}} staat klaar.', '["{{customer.name}}","{{assignment.code}}","{{assignment.title}}"]'::jsonb),
('invoice_paid', 'Facturatie', 'customer', 'Factuur betaald', 'Een factuurbetaling is verwerkt.', true, true, true, 'Betaling ontvangen voor {{invoice.number}}', 'Uw betaling is verwerkt.', '<p>Beste {{customer.name}},</p><p>Hartelijk dank. De betaling voor factuur <strong>{{invoice.number}}</strong> is ontvangen en verwerkt.</p><p>De bijbehorende opdracht is hiermee financieel afgerond.</p>', 'Betaling ontvangen', 'Factuur {{invoice.number}} is betaald.', '["{{customer.name}}","{{invoice.number}}","{{invoice.amount}}","{{invoice.paid_date}}"]'::jsonb)
ON CONFLICT (event_key) DO NOTHING;
