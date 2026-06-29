UPDATE notification_event_settings
SET
  title = 'Je bent uitgenodigd',
  description = 'Je bent uitgenodigd voor een interessepeiling. Laat weten of je interesse hebt, niet beschikbaar bent of een vraag hebt.',
  email_subject = 'Je bent uitgenodigd voor {{assignment.code}}',
  email_preheader = 'Laat weten of je deze opdracht onder voorbehoud kunt oppakken.',
  email_body = '<p>Beste {{recipient.name}},</p><p>Je bent uitgenodigd voor een opdracht onder voorbehoud.</p><p><strong>{{assignment.code}}</strong><br>{{assignment.title}}<br>{{assignment.date_label}} {{assignment.time_range}}<br>{{object.name}} - {{object.city}}</p><p>Laat in de personeelsapp weten of je interesse hebt, niet beschikbaar bent of een vraag hebt. Dit is nog geen definitieve planning.</p>',
  push_title = 'Je bent uitgenodigd',
  push_body = '{{assignment.code}} · {{assignment.title}} · {{assignment.date_label}} {{assignment.time_range}}',
  push_enabled = true,
  in_app_enabled = true,
  updated_at = now()
WHERE event_key = 'assignment_interest_invited';
