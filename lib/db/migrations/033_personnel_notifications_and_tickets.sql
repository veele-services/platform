-- Personnel PWA notifications and department ticketing.
-- Tables are protected by RLS; the PWA uses server actions scoped by the
-- authenticated personnel row.

CREATE TABLE IF NOT EXISTS personnel_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  personnel_id uuid NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
  title varchar(180) NOT NULL,
  body text,
  category varchar(30) DEFAULT 'system' NOT NULL,
  priority varchar(20) DEFAULT 'normal' NOT NULL,
  source_label varchar(120),
  href text,
  read_at timestamp with time zone,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT personnel_notifications_category_check CHECK (
    category IN ('planning', 'news', 'hours', 'system', 'message')
  ),
  CONSTRAINT personnel_notifications_priority_check CHECK (
    priority IN ('low', 'normal', 'high')
  )
);

CREATE INDEX IF NOT EXISTS personnel_notifications_personnel_created_idx
  ON personnel_notifications(personnel_id, created_at);
CREATE INDEX IF NOT EXISTS personnel_notifications_personnel_read_idx
  ON personnel_notifications(personnel_id, read_at);

CREATE TABLE IF NOT EXISTS personnel_message_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  personnel_id uuid NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
  subject varchar(180) NOT NULL,
  department varchar(40) DEFAULT 'backoffice' NOT NULL,
  status varchar(30) DEFAULT 'open' NOT NULL,
  priority varchar(20) DEFAULT 'normal' NOT NULL,
  last_message_preview text,
  last_message_at timestamp with time zone DEFAULT now() NOT NULL,
  closed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT personnel_message_threads_department_check CHECK (
    department IN ('planning', 'management', 'backoffice', 'hr', 'finance', 'it')
  ),
  CONSTRAINT personnel_message_threads_status_check CHECK (
    status IN ('open', 'waiting_backoffice', 'waiting_personnel', 'closed')
  ),
  CONSTRAINT personnel_message_threads_priority_check CHECK (
    priority IN ('low', 'normal', 'high', 'urgent')
  )
);

CREATE INDEX IF NOT EXISTS personnel_msg_threads_personnel_status_idx
  ON personnel_message_threads(personnel_id, status);
CREATE INDEX IF NOT EXISTS personnel_msg_threads_last_msg_idx
  ON personnel_message_threads(last_message_at);

CREATE TABLE IF NOT EXISTS personnel_message_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  thread_id uuid NOT NULL REFERENCES personnel_message_threads(id) ON DELETE CASCADE,
  author_type varchar(30) NOT NULL,
  author_user_id uuid,
  author_name varchar(140) NOT NULL,
  department varchar(40),
  body text NOT NULL,
  read_by_personnel_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT personnel_message_entries_author_type_check CHECK (
    author_type IN ('personnel', 'backoffice', 'system')
  ),
  CONSTRAINT personnel_message_entries_department_check CHECK (
    department IS NULL OR department IN ('planning', 'management', 'backoffice', 'hr', 'finance', 'it')
  )
);

CREATE INDEX IF NOT EXISTS personnel_msg_entries_thread_created_idx
  ON personnel_message_entries(thread_id, created_at);
CREATE INDEX IF NOT EXISTS personnel_msg_entries_unread_personnel_idx
  ON personnel_message_entries(thread_id, read_by_personnel_at);

ALTER TABLE personnel_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE personnel_message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE personnel_message_entries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'personnel_notifications'
      AND policyname = 'personnel_notifications_management'
  ) THEN
    CREATE POLICY personnel_notifications_management
      ON personnel_notifications
      TO authenticated
      USING (is_management())
      WITH CHECK (is_management());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'personnel_notifications'
      AND policyname = 'personnel_notifications_own'
  ) THEN
    CREATE POLICY personnel_notifications_own
      ON personnel_notifications
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM personnel p
          WHERE p.id = personnel_notifications.personnel_id
            AND p.user_id = (SELECT auth.uid())
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM personnel p
          WHERE p.id = personnel_notifications.personnel_id
            AND p.user_id = (SELECT auth.uid())
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'personnel_message_threads'
      AND policyname = 'personnel_message_threads_management'
  ) THEN
    CREATE POLICY personnel_message_threads_management
      ON personnel_message_threads
      TO authenticated
      USING (is_management())
      WITH CHECK (is_management());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'personnel_message_threads'
      AND policyname = 'personnel_message_threads_own'
  ) THEN
    CREATE POLICY personnel_message_threads_own
      ON personnel_message_threads
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM personnel p
          WHERE p.id = personnel_message_threads.personnel_id
            AND p.user_id = (SELECT auth.uid())
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM personnel p
          WHERE p.id = personnel_message_threads.personnel_id
            AND p.user_id = (SELECT auth.uid())
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'personnel_message_entries'
      AND policyname = 'personnel_message_entries_management'
  ) THEN
    CREATE POLICY personnel_message_entries_management
      ON personnel_message_entries
      TO authenticated
      USING (is_management())
      WITH CHECK (is_management());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'personnel_message_entries'
      AND policyname = 'personnel_message_entries_own'
  ) THEN
    CREATE POLICY personnel_message_entries_own
      ON personnel_message_entries
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM personnel_message_threads t
          JOIN personnel p ON p.id = t.personnel_id
          WHERE t.id = personnel_message_entries.thread_id
            AND p.user_id = (SELECT auth.uid())
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM personnel_message_threads t
          JOIN personnel p ON p.id = t.personnel_id
          WHERE t.id = personnel_message_entries.thread_id
            AND p.user_id = (SELECT auth.uid())
        )
      );
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON personnel_notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON personnel_message_threads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON personnel_message_entries TO authenticated;
