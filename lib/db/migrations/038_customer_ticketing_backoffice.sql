-- ============================================================================
-- Customer ticketing + backoffice ticket handling.
-- Adds customer-facing ticket threads, RLS, RBAC permissions and event templates.
-- ============================================================================

CREATE TABLE IF NOT EXISTS customer_message_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid DEFAULT '00000000-0000-0000-0000-000000000010' NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  customer_user_id uuid REFERENCES customer_users(id) ON DELETE SET NULL,
  subject varchar(180) NOT NULL,
  department varchar(40) DEFAULT 'backoffice' NOT NULL,
  status varchar(30) DEFAULT 'open' NOT NULL,
  priority varchar(20) DEFAULT 'normal' NOT NULL,
  last_message_preview text,
  last_message_at timestamp with time zone DEFAULT now() NOT NULL,
  closed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT customer_message_threads_department_check CHECK (
    department IN ('planning', 'management', 'backoffice', 'finance', 'service', 'support')
  ),
  CONSTRAINT customer_message_threads_status_check CHECK (
    status IN ('open', 'waiting_backoffice', 'waiting_customer', 'closed')
  ),
  CONSTRAINT customer_message_threads_priority_check CHECK (
    priority IN ('low', 'normal', 'high', 'urgent')
  )
);

CREATE INDEX IF NOT EXISTS customer_msg_threads_customer_status_idx
  ON customer_message_threads(customer_id, status);
CREATE INDEX IF NOT EXISTS customer_msg_threads_tenant_status_idx
  ON customer_message_threads(tenant_id, status);
CREATE INDEX IF NOT EXISTS customer_msg_threads_last_msg_idx
  ON customer_message_threads(last_message_at);

CREATE TABLE IF NOT EXISTS customer_message_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  thread_id uuid NOT NULL REFERENCES customer_message_threads(id) ON DELETE CASCADE,
  author_type varchar(30) NOT NULL,
  author_user_id uuid,
  author_name varchar(140) NOT NULL,
  department varchar(40),
  body text NOT NULL,
  read_by_customer_at timestamp with time zone,
  read_by_backoffice_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT customer_message_entries_author_type_check CHECK (
    author_type IN ('customer', 'backoffice', 'system')
  ),
  CONSTRAINT customer_message_entries_department_check CHECK (
    department IS NULL OR department IN ('planning', 'management', 'backoffice', 'finance', 'service', 'support')
  )
);

CREATE INDEX IF NOT EXISTS customer_msg_entries_thread_created_idx
  ON customer_message_entries(thread_id, created_at);
CREATE INDEX IF NOT EXISTS customer_msg_entries_unread_customer_idx
  ON customer_message_entries(thread_id, read_by_customer_at);
CREATE INDEX IF NOT EXISTS customer_msg_entries_unread_backoffice_idx
  ON customer_message_entries(thread_id, read_by_backoffice_at);

ALTER TABLE customer_message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_message_entries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'customer_message_threads'
      AND policyname = 'customer_message_threads_management'
  ) THEN
    CREATE POLICY customer_message_threads_management
      ON customer_message_threads
      TO authenticated
      USING (is_management())
      WITH CHECK (is_management());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'customer_message_threads'
      AND policyname = 'customer_message_threads_own'
  ) THEN
    CREATE POLICY customer_message_threads_own
      ON customer_message_threads
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM customer_users cu
          WHERE cu.customer_id = customer_message_threads.customer_id
            AND cu.status = 'active'
            AND (
              cu.user_id = (SELECT auth.uid())
              OR lower(cu.email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
            )
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM customer_users cu
          WHERE cu.customer_id = customer_message_threads.customer_id
            AND cu.status = 'active'
            AND (
              cu.user_id = (SELECT auth.uid())
              OR lower(cu.email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
            )
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'customer_message_entries'
      AND policyname = 'customer_message_entries_management'
  ) THEN
    CREATE POLICY customer_message_entries_management
      ON customer_message_entries
      TO authenticated
      USING (is_management())
      WITH CHECK (is_management());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'customer_message_entries'
      AND policyname = 'customer_message_entries_own'
  ) THEN
    CREATE POLICY customer_message_entries_own
      ON customer_message_entries
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM customer_message_threads t
          JOIN customer_users cu ON cu.customer_id = t.customer_id
          WHERE t.id = customer_message_entries.thread_id
            AND cu.status = 'active'
            AND (
              cu.user_id = (SELECT auth.uid())
              OR lower(cu.email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
            )
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM customer_message_threads t
          JOIN customer_users cu ON cu.customer_id = t.customer_id
          WHERE t.id = customer_message_entries.thread_id
            AND cu.status = 'active'
            AND (
              cu.user_id = (SELECT auth.uid())
              OR lower(cu.email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
            )
        )
      );
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON customer_message_threads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON customer_message_entries TO authenticated;

INSERT INTO permissions (resource, action, description)
VALUES
  ('tickets', 'read', 'Klant- en medewerker tickets bekijken'),
  ('tickets', 'write', 'Tickets beantwoorden en behandelen')
ON CONFLICT (resource, action) DO UPDATE
  SET description = excluded.description;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.resource = 'tickets'
WHERE r.name IN ('Management', 'Administration', 'Planning', 'Support')
ON CONFLICT DO NOTHING;

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
VALUES
  (
    'customer_ticket_created',
    'tickets',
    'management',
    'Nieuw klantticket: {{ticket.subject}}',
    'Een klant heeft een nieuw ticket aangemaakt.',
    false,
    false,
    true,
    'Nieuw klantticket: {{ticket.subject}}',
    'Er staat een klantticket klaar voor behandeling.',
    '<h2>Nieuw klantticket</h2><p><strong>{{customer.name}}</strong> heeft een nieuw ticket aangemaakt.</p><p>Onderwerp: <strong>{{ticket.subject}}</strong><br>Afdeling: {{ticket.department}}</p>',
    'Nieuw klantticket',
    '{{customer.name}} heeft een ticket aangemaakt.',
    '["{{customer.name}}","{{ticket.subject}}","{{ticket.department}}","{{ticket.priority}}"]'::jsonb
  ),
  (
    'customer_ticket_replied',
    'tickets',
    'management',
    'Nieuwe klantreactie: {{ticket.subject}}',
    'Een klant heeft gereageerd op een ticket.',
    false,
    false,
    true,
    'Nieuwe klantreactie: {{ticket.subject}}',
    'Een klant heeft gereageerd op een ticket.',
    '<h2>Nieuwe klantreactie</h2><p><strong>{{customer.name}}</strong> heeft gereageerd op ticket <strong>{{ticket.subject}}</strong>.</p>',
    'Nieuwe klantreactie',
    '{{customer.name}} heeft gereageerd.',
    '["{{customer.name}}","{{ticket.subject}}","{{ticket.department}}"]'::jsonb
  ),
  (
    'customer_ticket_backoffice_reply',
    'tickets',
    'customer',
    'Reactie op uw ticket',
    'Veele Services heeft gereageerd op een klantticket.',
    true,
    true,
    true,
    'Reactie op uw ticket: {{ticket.subject}}',
    'Er staat een reactie klaar in het klantportaal.',
    '<h2>Reactie op uw ticket</h2><p>Wij hebben gereageerd op uw ticket <strong>{{ticket.subject}}</strong>.</p><p>Bekijk de reactie in het klantportaal.</p>',
    'Reactie op uw ticket',
    'Er staat een reactie klaar op {{ticket.subject}}.',
    '["{{ticket.subject}}","{{ticket.department}}","{{href}}"]'::jsonb
  ),
  (
    'personnel_ticket_backoffice_reply',
    'tickets',
    'personnel',
    'Reactie op je ticket',
    'Backoffice heeft gereageerd op een medewerkerticket.',
    true,
    true,
    true,
    'Reactie op je ticket: {{ticket.subject}}',
    'Er staat een reactie klaar in de personeelsapp.',
    '<h2>Reactie op je ticket</h2><p>Er staat een reactie klaar op ticket <strong>{{ticket.subject}}</strong>.</p>',
    'Reactie op je ticket',
    'Er staat een reactie klaar op {{ticket.subject}}.',
    '["{{ticket.subject}}","{{ticket.department}}","{{href}}"]'::jsonb
  )
ON CONFLICT (event_key) DO UPDATE
  SET event_group = excluded.event_group,
      audience = excluded.audience,
      title = excluded.title,
      description = excluded.description,
      email_subject = excluded.email_subject,
      email_preheader = excluded.email_preheader,
      email_body = excluded.email_body,
      push_title = excluded.push_title,
      push_body = excluded.push_body,
      shortcodes = excluded.shortcodes,
      updated_at = now();
