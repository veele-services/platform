-- Central notification and e-mail template center.

ALTER TABLE organization_settings
  ADD COLUMN IF NOT EXISTS email_template_brand_color varchar(20) DEFAULT '#081D3A' NOT NULL,
  ADD COLUMN IF NOT EXISTS email_template_accent_color varchar(20) DEFAULT '#00B7B3' NOT NULL,
  ADD COLUMN IF NOT EXISTS email_template_footer_text text DEFAULT 'Dit is een automatisch bericht van Fieldgrid. U ontvangt dit bericht omdat u betrokken bent bij een aanvraag, opdracht, rapportage, factuur of portaalmelding.' NOT NULL,
  ADD COLUMN IF NOT EXISTS email_template_signature text DEFAULT 'Met vriendelijke groet,\nFieldgrid' NOT NULL;

CREATE TABLE IF NOT EXISTS notification_event_settings (
  event_key varchar(100) PRIMARY KEY,
  event_group varchar(50) NOT NULL,
  audience varchar(30) NOT NULL,
  title varchar(180) NOT NULL,
  description text NOT NULL,
  email_enabled boolean DEFAULT true NOT NULL,
  push_enabled boolean DEFAULT false NOT NULL,
  in_app_enabled boolean DEFAULT true NOT NULL,
  email_subject varchar(240) NOT NULL,
  email_preheader varchar(240),
  email_body text NOT NULL,
  push_title varchar(120) NOT NULL,
  push_body text NOT NULL,
  shortcodes jsonb DEFAULT '[]'::jsonb NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  updated_by uuid,
  CONSTRAINT notification_event_settings_audience_check CHECK (
    audience IN ('customer', 'personnel', 'management', 'mixed')
  )
);

CREATE TABLE IF NOT EXISTS customer_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  title varchar(180) NOT NULL,
  body text,
  category varchar(30) DEFAULT 'system' NOT NULL,
  priority varchar(20) DEFAULT 'normal' NOT NULL,
  source_label varchar(120),
  href text,
  read_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT customer_notifications_category_check CHECK (
    category IN ('invoice', 'quote', 'report', 'request', 'system', 'message', 'news', 'planning')
  ),
  CONSTRAINT customer_notifications_priority_check CHECK (
    priority IN ('low', 'normal', 'high')
  )
);

CREATE INDEX IF NOT EXISTS customer_notifications_customer_created_idx
  ON customer_notifications(customer_id, created_at);
CREATE INDEX IF NOT EXISTS customer_notifications_customer_read_idx
  ON customer_notifications(customer_id, read_at);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  owner_type varchar(20) NOT NULL,
  personnel_id uuid REFERENCES personnel(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT push_subscriptions_endpoint_unique UNIQUE(endpoint),
  CONSTRAINT push_subscriptions_owner_type_check CHECK (owner_type IN ('personnel', 'customer')),
  CONSTRAINT push_subscriptions_owner_check CHECK (
    (owner_type = 'personnel' AND personnel_id IS NOT NULL AND customer_id IS NULL)
    OR
    (owner_type = 'customer' AND customer_id IS NOT NULL AND personnel_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS push_subscriptions_personnel_idx
  ON push_subscriptions(personnel_id);
CREATE INDEX IF NOT EXISTS push_subscriptions_customer_idx
  ON push_subscriptions(customer_id);

CREATE TABLE IF NOT EXISTS notification_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  title varchar(180) NOT NULL,
  body text NOT NULL,
  audience varchar(30) NOT NULL,
  channels jsonb DEFAULT '[]'::jsonb NOT NULL,
  target_criteria jsonb DEFAULT '{}'::jsonb NOT NULL,
  sent_personnel_count integer DEFAULT 0 NOT NULL,
  sent_customer_count integer DEFAULT 0 NOT NULL,
  email_success_count integer DEFAULT 0 NOT NULL,
  email_failed_count integer DEFAULT 0 NOT NULL,
  created_by uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT notification_dispatches_audience_check CHECK (
    audience IN ('personnel', 'customer', 'both')
  )
);

CREATE TABLE IF NOT EXISTS notification_delivery_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  event_key varchar(100),
  dispatch_id uuid REFERENCES notification_dispatches(id) ON DELETE SET NULL,
  channel varchar(20) NOT NULL,
  recipient_type varchar(20) NOT NULL,
  personnel_id uuid REFERENCES personnel(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  recipient_email varchar(255),
  subject varchar(240),
  title varchar(180) NOT NULL,
  body text,
  html text,
  payload jsonb DEFAULT '{}'::jsonb NOT NULL,
  status varchar(20) DEFAULT 'queued' NOT NULL,
  attempts integer DEFAULT 0 NOT NULL,
  last_error text,
  created_at timestamptz DEFAULT now() NOT NULL,
  sent_at timestamptz,
  CONSTRAINT notification_delivery_queue_channel_check CHECK (
    channel IN ('email', 'push', 'in_app')
  ),
  CONSTRAINT notification_delivery_queue_recipient_type_check CHECK (
    recipient_type IN ('personnel', 'customer', 'management')
  ),
  CONSTRAINT notification_delivery_queue_status_check CHECK (
    status IN ('queued', 'sent', 'failed', 'skipped')
  )
);

CREATE INDEX IF NOT EXISTS notification_delivery_queue_status_idx
  ON notification_delivery_queue(status, created_at);
CREATE INDEX IF NOT EXISTS notification_delivery_queue_dispatch_idx
  ON notification_delivery_queue(dispatch_id);

INSERT INTO notification_event_settings (
  event_key, event_group, audience, title, description,
  email_enabled, push_enabled, in_app_enabled,
  email_subject, email_preheader, email_body,
  push_title, push_body, shortcodes
)
VALUES
('customer_assignment_requested', 'Aanvragen', 'management', 'Nieuwe klantaanvraag', 'Een klant heeft een nieuwe opdracht aangevraagd voor een object en sector.', true, true, true, 'Nieuwe aanvraag {{assignment.code}} van {{customer.name}}', 'Er staat een nieuwe klantaanvraag klaar voor beoordeling.', '<p>Beste collega,</p><p>Er is een nieuwe aanvraag binnengekomen van <strong>{{customer.name}}</strong> voor <strong>{{object.name}}</strong>.</p><p>De aanvraag valt onder sector <strong>{{sector.name}}</strong> en is gewenst op <strong>{{assignment.date}}</strong> tussen <strong>{{assignment.start}}</strong> en <strong>{{assignment.end}}</strong>.</p><p>Beoordeel de aanvraag, voeg taken en kosten toe en stuur indien nodig een offerte naar de klant.</p>', 'Nieuwe aanvraag', '{{customer.name}} heeft {{assignment.code}} aangevraagd.', '["{{assignment.code}}","{{assignment.title}}","{{assignment.date}}","{{assignment.start}}","{{assignment.end}}","{{customer.name}}","{{object.name}}","{{sector.name}}"]'::jsonb),
('quote_sent_to_customer', 'Offertes', 'customer', 'Offerte verstuurd', 'Een offerte is naar de klant verstuurd en wacht op akkoord.', true, true, true, 'Offerte {{quote.number}} staat klaar voor akkoord', 'Bekijk en accordeer de offerte in het klantportaal.', '<p>Beste {{customer.name}},</p><p>Uw offerte <strong>{{quote.number}}</strong> voor <strong>{{assignment.title}}</strong> staat klaar in het klantportaal.</p><p>Het totaalbedrag bedraagt <strong>{{quote.amount}}</strong>. De offerte is geldig tot <strong>{{quote.valid_until}}</strong>.</p><p>Controleer de werkzaamheden en keur de offerte goed wanneer alles akkoord is. Na akkoord wordt de werkbon vrijgegeven voor planning.</p>', 'Offerte staat klaar', 'Offerte {{quote.number}} wacht op akkoord.', '["{{customer.name}}","{{assignment.title}}","{{quote.number}}","{{quote.amount}}","{{quote.valid_until}}"]'::jsonb),
('quote_approved_by_customer', 'Offertes', 'management', 'Offerte akkoord', 'De klant heeft een offerte goedgekeurd; de opdracht wordt planbaar.', true, true, true, 'Offerte {{quote.number}} is akkoord door {{customer.name}}', 'De opdracht kan worden ingepland.', '<p>Beste collega,</p><p><strong>{{customer.name}}</strong> heeft offerte <strong>{{quote.number}}</strong> akkoord gegeven.</p><p>De opdracht <strong>{{assignment.code}}</strong> is nu planbaar. Controleer de planningcheck en koppel de juiste medewerker(s).</p>', 'Offerte akkoord', '{{assignment.code}} is nu planbaar.', '["{{customer.name}}","{{assignment.code}}","{{assignment.title}}","{{quote.number}}"]'::jsonb),
('quote_rejected_by_customer', 'Offertes', 'management', 'Offerte afgewezen', 'De klant heeft een offerte afgewezen en eventueel een reden opgegeven.', true, true, true, 'Offerte {{quote.number}} is afgewezen door {{customer.name}}', 'De aanvraag staat terug in beoordeling.', '<p>Beste collega,</p><p><strong>{{customer.name}}</strong> heeft offerte <strong>{{quote.number}}</strong> afgewezen.</p><p>Reden/opmerking: <strong>{{quote.rejection_reason}}</strong></p><p>De aanvraag staat terug in beoordeling zodat de offerte aangepast kan worden.</p>', 'Offerte afgewezen', '{{customer.name}} heeft {{quote.number}} afgewezen.', '["{{customer.name}}","{{assignment.code}}","{{quote.number}}","{{quote.rejection_reason}}"]'::jsonb),
('assignment_interest_poll', 'Planning', 'personnel', 'Interessepeiling opdracht', 'Planning stuurt beschikbare medewerkers een interessepeiling voor een open opdracht.', false, true, true, 'Interessepeiling {{assignment.code}}', 'Er is een opdracht waarvoor uw beschikbaarheid mogelijk past.', '<p>Beste {{personnel.first_name}},</p><p>Er staat een open opdracht klaar waarvoor uw beschikbaarheid en profiel aansluiten.</p><p><strong>{{assignment.code}}</strong> - {{assignment.title}}<br>{{assignment.date}} van {{assignment.start}} tot {{assignment.end}}</p><p>Geef via het personeelsportaal aan of u deze bon kunt oppakken.</p>', 'Open opdracht beschikbaar', '{{assignment.code}} past mogelijk bij jouw beschikbaarheid.', '["{{personnel.first_name}}","{{assignment.code}}","{{assignment.title}}","{{assignment.date}}","{{assignment.start}}","{{assignment.end}}"]'::jsonb),
('assignment_assigned', 'Planning', 'personnel', 'Werkbon ingepland', 'Een medewerker is gekoppeld aan een werkbon.', true, true, true, 'Nieuwe werkbon {{assignment.code}} ingepland', 'Bekijk de details in het personeelsportaal.', '<p>Beste {{personnel.first_name}},</p><p>Er is een werkbon aan u toegewezen.</p><p><strong>{{assignment.code}}</strong> - {{assignment.title}}<br>{{object.name}}<br>{{assignment.date}} van {{assignment.start}} tot {{assignment.end}}</p><p>Bekijk de werkbon tijdig zodat planning weet dat u deze heeft gezien.</p>', 'Werkbon ingepland', '{{assignment.code}} staat in jouw planning.', '["{{personnel.first_name}}","{{assignment.code}}","{{assignment.title}}","{{object.name}}","{{assignment.date}}","{{assignment.start}}","{{assignment.end}}"]'::jsonb),
('assignment_rescheduled', 'Planning', 'personnel', 'Werkbon verplaatst', 'Een ingeplande werkbon is naar een andere datum of tijd verplaatst.', true, true, true, 'Werkbon {{assignment.code}} is verplaatst', 'Controleer de nieuwe planning.', '<p>Beste {{personnel.first_name}},</p><p>Werkbon <strong>{{assignment.code}}</strong> is gewijzigd.</p><p>Nieuwe planning: <strong>{{assignment.date}}</strong> van <strong>{{assignment.start}}</strong> tot <strong>{{assignment.end}}</strong>.</p><p>Controleer de details in het personeelsportaal.</p>', 'Werkbon verplaatst', '{{assignment.code}} heeft een nieuw tijdvak.', '["{{personnel.first_name}}","{{assignment.code}}","{{assignment.date}}","{{assignment.start}}","{{assignment.end}}"]'::jsonb),
('assignment_completed', 'Opdrachten', 'mixed', 'Werkbon afgerond', 'Een werkbon is afgerond door personeel en kan verder naar rapportage/facturatie.', true, true, true, 'Werkbon {{assignment.code}} is afgerond', 'De werkzaamheden zijn afgerond.', '<p>Beste {{recipient.name}},</p><p>Werkbon <strong>{{assignment.code}}</strong> is afgerond.</p><p>De uitgevoerde werkzaamheden en rapportage zijn beschikbaar in het platform.</p>', 'Werkbon afgerond', '{{assignment.code}} is afgerond.', '["{{recipient.name}}","{{assignment.code}}","{{assignment.title}}"]'::jsonb),
('assignment_not_completed', 'Opdrachten', 'management', 'Werkbon afgemeld', 'Een medewerker heeft gemeld dat een werkbon niet afgerond kon worden.', true, true, true, 'Werkbon {{assignment.code}} is niet afgerond', 'Planning moet de afmelding beoordelen.', '<p>Beste collega,</p><p>Werkbon <strong>{{assignment.code}}</strong> kon niet worden afgerond.</p><p>Reden: <strong>{{assignment.completion_reason}}</strong></p><p>Controleer de opmerkingen en bepaal de vervolgactie.</p>', 'Werkbon afgemeld', '{{assignment.code}} kon niet worden afgerond.', '["{{assignment.code}}","{{assignment.title}}","{{assignment.completion_reason}}"]'::jsonb),
('report_submitted', 'Rapportage', 'management', 'Rapport ingediend', 'Een medewerker heeft een rapport ingediend ter beoordeling.', true, true, true, 'Rapport ingediend voor {{assignment.code}}', 'Er staat een rapport klaar voor beoordeling.', '<p>Beste collega,</p><p>Er is een rapport ingediend voor <strong>{{assignment.code}}</strong> - {{assignment.title}}.</p><p>Beoordeel het rapport, keur het goed of stuur het terug met duidelijke feedback.</p>', 'Rapport ingediend', '{{assignment.code}} wacht op beoordeling.', '["{{assignment.code}}","{{assignment.title}}","{{personnel.name}}"]'::jsonb),
('report_approved', 'Rapportage', 'personnel', 'Rapport goedgekeurd', 'Een rapport is door management goedgekeurd.', true, true, true, 'Rapport {{assignment.code}} is goedgekeurd', 'Uw rapport is goedgekeurd.', '<p>Beste {{personnel.first_name}},</p><p>Uw rapport voor <strong>{{assignment.code}}</strong> is goedgekeurd.</p><p>Dank voor de volledige terugkoppeling. De opdracht kan verder worden verwerkt.</p>', 'Rapport goedgekeurd', '{{assignment.code}} is goedgekeurd.', '["{{personnel.first_name}}","{{assignment.code}}","{{assignment.title}}"]'::jsonb),
('report_rejected', 'Rapportage', 'personnel', 'Rapport afgekeurd', 'Een rapport is afgekeurd en moet worden aangepast.', true, true, true, 'Rapport {{assignment.code}} is afgekeurd', 'Controleer de feedback en pas het rapport aan.', '<p>Beste {{personnel.first_name}},</p><p>Uw rapport voor <strong>{{assignment.code}}</strong> is afgekeurd.</p><p>Feedback: <strong>{{report.rejection_reason}}</strong></p><p>Pas het rapport aan of neem contact op met planning.</p>', 'Rapport afgekeurd', '{{assignment.code}} vraagt om aanpassing.', '["{{personnel.first_name}}","{{assignment.code}}","{{report.rejection_reason}}"]'::jsonb),
('invoice_sent', 'Facturatie', 'customer', 'Factuur verstuurd', 'Een factuur is naar de klant verzonden.', true, true, true, 'Factuur {{invoice.number}} staat klaar', 'Uw factuur staat klaar in het klantportaal.', '<p>Beste {{customer.name}},</p><p>Factuur <strong>{{invoice.number}}</strong> staat klaar.</p><p>Het openstaande bedrag is <strong>{{invoice.amount}}</strong> met vervaldatum <strong>{{invoice.due_date}}</strong>.</p><p>U kunt de factuur bekijken en betalen via het klantportaal.</p>', 'Factuur staat klaar', 'Factuur {{invoice.number}} staat open.', '["{{customer.name}}","{{invoice.number}}","{{invoice.amount}}","{{invoice.due_date}}"]'::jsonb),
('payment_reminder', 'Facturatie', 'customer', 'Betalingsherinnering', 'Een klant ontvangt een herinnering voor een verlopen factuur.', true, true, true, 'Betalingsherinnering factuur {{invoice.number}}', 'Er staat nog een factuur open.', '<p>Beste {{customer.name}},</p><p>Volgens onze administratie is factuur <strong>{{invoice.number}}</strong> nog niet voldaan.</p><p>Het openstaande bedrag is <strong>{{invoice.amount}}</strong>. Wij verzoeken u vriendelijk de betaling alsnog te voldoen.</p><p>Heeft u al betaald? Dan kunt u dit bericht als niet verzonden beschouwen.</p>', 'Betalingsherinnering', 'Factuur {{invoice.number}} staat nog open.', '["{{customer.name}}","{{invoice.number}}","{{invoice.amount}}","{{invoice.due_date}}"]'::jsonb),
('leave_requested', 'Personeel', 'management', 'Verlof aangevraagd', 'Een medewerker heeft verlof aangevraagd.', true, true, true, 'Nieuwe verlofaanvraag van {{personnel.name}}', 'Een verlofaanvraag wacht op beoordeling.', '<p>Beste collega,</p><p><strong>{{personnel.name}}</strong> heeft verlof aangevraagd.</p><p>Periode: <strong>{{leave.start_date}}</strong> tot <strong>{{leave.end_date}}</strong>.</p><p>Beoordeel de aanvraag in de backoffice.</p>', 'Verlofaanvraag', '{{personnel.name}} vraagt verlof aan.', '["{{personnel.name}}","{{leave.start_date}}","{{leave.end_date}}","{{leave.reason}}"]'::jsonb),
('leave_decision', 'Personeel', 'personnel', 'Verlofbesluit', 'Een verlofaanvraag is goedgekeurd of afgewezen.', true, true, true, 'Verlofaanvraag {{leave.status}}', 'Uw verlofaanvraag is verwerkt.', '<p>Beste {{personnel.first_name}},</p><p>Uw verlofaanvraag voor <strong>{{leave.start_date}}</strong> tot <strong>{{leave.end_date}}</strong> is <strong>{{leave.status}}</strong>.</p><p>Controleer uw planning voor de actuele bezetting.</p>', 'Verlof verwerkt', 'Uw verlofaanvraag is {{leave.status}}.', '["{{personnel.first_name}}","{{leave.start_date}}","{{leave.end_date}}","{{leave.status}}"]'::jsonb),
('news_published', 'Nieuws', 'mixed', 'Nieuws gepubliceerd', 'Er is een nieuwsbericht gepubliceerd voor medewerkers en/of klanten.', false, true, true, 'Nieuw bericht: {{news.title}}', 'Er staat een nieuw nieuwsbericht klaar.', '<p>Beste {{recipient.name}},</p><p>Er staat een nieuw bericht klaar: <strong>{{news.title}}</strong>.</p><p>{{news.excerpt}}</p><p>Lees het volledige bericht in het portaal.</p>', 'Nieuw bericht', '{{news.title}}', '["{{recipient.name}}","{{news.title}}","{{news.excerpt}}"]'::jsonb),
('personnel_ticket_created', 'Berichten', 'management', 'Nieuw medewerkerbericht', 'Een medewerker heeft een bericht/ticket aangemaakt.', true, true, true, 'Nieuw bericht van {{personnel.name}}', 'Er staat een medewerkerbericht klaar.', '<p>Beste collega,</p><p><strong>{{personnel.name}}</strong> heeft een nieuw bericht aangemaakt voor afdeling <strong>{{ticket.department}}</strong>.</p><p>Onderwerp: <strong>{{ticket.subject}}</strong></p><p>Behandel het bericht via de backoffice.</p>', 'Nieuw medewerkerbericht', '{{personnel.name}} heeft een bericht gestuurd.', '["{{personnel.name}}","{{ticket.department}}","{{ticket.subject}}"]'::jsonb),
('portal_invite', 'Toegang', 'mixed', 'Portaaluitnodiging', 'Een klant of medewerker ontvangt portaaltoegang met tijdelijk wachtwoord.', true, false, false, 'Toegang tot het Fieldgrid-portaal', 'Uw portaalaccount is aangemaakt.', '<p>Beste {{recipient.name}},</p><p>Er is een portaalaccount voor u aangemaakt.</p><p>Log in met het tijdelijke wachtwoord dat in dit bericht staat. Bij de eerste login moet u direct een eigen wachtwoord kiezen.</p><p>Tijdelijk wachtwoord: <strong>{{temporary_password}}</strong></p>', 'Portaaltoegang', 'Uw portaalaccount is aangemaakt.', '["{{recipient.name}}","{{portal.name}}","{{portal.url}}","{{temporary_password}}"]'::jsonb)
ON CONFLICT (event_key) DO NOTHING;

ALTER TABLE notification_event_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_delivery_queue ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'notification_event_settings'
      AND policyname = 'notification_event_settings_management'
  ) THEN
    CREATE POLICY notification_event_settings_management
      ON notification_event_settings
      TO authenticated
      USING (is_management())
      WITH CHECK (is_management());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'customer_notifications'
      AND policyname = 'customer_notifications_management'
  ) THEN
    CREATE POLICY customer_notifications_management
      ON customer_notifications
      TO authenticated
      USING (is_management())
      WITH CHECK (is_management());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'customer_notifications'
      AND policyname = 'customer_notifications_own'
  ) THEN
    CREATE POLICY customer_notifications_own
      ON customer_notifications
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM customers c
          WHERE c.id = customer_notifications.customer_id
            AND lower(c.contact_email) = lower(auth.jwt() ->> 'email')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM customers c
          WHERE c.id = customer_notifications.customer_id
            AND lower(c.contact_email) = lower(auth.jwt() ->> 'email')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'push_subscriptions'
      AND policyname = 'push_subscriptions_management'
  ) THEN
    CREATE POLICY push_subscriptions_management
      ON push_subscriptions
      TO authenticated
      USING (is_management())
      WITH CHECK (is_management());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'push_subscriptions'
      AND policyname = 'push_subscriptions_personnel_own'
  ) THEN
    CREATE POLICY push_subscriptions_personnel_own
      ON push_subscriptions
      TO authenticated
      USING (
        owner_type = 'personnel'
        AND EXISTS (
          SELECT 1 FROM personnel p
          WHERE p.id = push_subscriptions.personnel_id
            AND p.user_id = (SELECT auth.uid())
        )
      )
      WITH CHECK (
        owner_type = 'personnel'
        AND EXISTS (
          SELECT 1 FROM personnel p
          WHERE p.id = push_subscriptions.personnel_id
            AND p.user_id = (SELECT auth.uid())
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'push_subscriptions'
      AND policyname = 'push_subscriptions_customer_own'
  ) THEN
    CREATE POLICY push_subscriptions_customer_own
      ON push_subscriptions
      TO authenticated
      USING (
        owner_type = 'customer'
        AND EXISTS (
          SELECT 1 FROM customers c
          WHERE c.id = push_subscriptions.customer_id
            AND lower(c.contact_email) = lower(auth.jwt() ->> 'email')
        )
      )
      WITH CHECK (
        owner_type = 'customer'
        AND EXISTS (
          SELECT 1 FROM customers c
          WHERE c.id = push_subscriptions.customer_id
            AND lower(c.contact_email) = lower(auth.jwt() ->> 'email')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'notification_dispatches'
      AND policyname = 'notification_dispatches_management'
  ) THEN
    CREATE POLICY notification_dispatches_management
      ON notification_dispatches
      TO authenticated
      USING (is_management())
      WITH CHECK (is_management());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'notification_delivery_queue'
      AND policyname = 'notification_delivery_queue_management'
  ) THEN
    CREATE POLICY notification_delivery_queue_management
      ON notification_delivery_queue
      TO authenticated
      USING (is_management())
      WITH CHECK (is_management());
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON notification_event_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON customer_notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON push_subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_dispatches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_delivery_queue TO authenticated;
