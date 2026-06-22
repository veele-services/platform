-- ============================================================================
-- Notification worker queue hardening.
--
-- Converts the existing notification_delivery_queue into a durable worker queue
-- for e-mail and Web Push delivery with explicit claim locks, retry scheduling,
-- attempt logging and rate-limit metadata.
-- ============================================================================

ALTER TABLE notification_delivery_queue
  ADD COLUMN IF NOT EXISTS max_attempts integer DEFAULT 5 NOT NULL,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
  ADD COLUMN IF NOT EXISTS processing_started_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS locked_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS locked_by varchar(120),
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS error_details jsonb DEFAULT '{}'::jsonb NOT NULL,
  ADD COLUMN IF NOT EXISTS response jsonb DEFAULT '{}'::jsonb NOT NULL,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS rate_limit_key varchar(160),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;

UPDATE notification_delivery_queue
SET status = 'pending',
    next_attempt_at = COALESCE(next_attempt_at, created_at, now()),
    updated_at = now()
WHERE status = 'queued';

UPDATE notification_delivery_queue
SET status = 'failed',
    last_error = COALESCE(last_error, 'Oude skipped status geconverteerd naar failed.'),
    updated_at = now()
WHERE status = 'skipped';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'notification_delivery_queue'
      AND constraint_name = 'notification_delivery_queue_status_check'
  ) THEN
    ALTER TABLE notification_delivery_queue
      DROP CONSTRAINT notification_delivery_queue_status_check;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'notification_delivery_queue'
      AND constraint_name = 'notification_delivery_queue_status_check'
  ) THEN
    ALTER TABLE notification_delivery_queue
      ADD CONSTRAINT notification_delivery_queue_status_check
      CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'retry'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'notification_delivery_queue'
      AND constraint_name = 'notification_delivery_queue_attempts_check'
  ) THEN
    ALTER TABLE notification_delivery_queue
      ADD CONSTRAINT notification_delivery_queue_attempts_check
      CHECK (attempts >= 0 AND max_attempts BETWEEN 1 AND 20);
  END IF;
END $$;

ALTER TABLE notification_delivery_queue
  ALTER COLUMN status SET DEFAULT 'pending',
  ALTER COLUMN next_attempt_at SET DEFAULT now(),
  ALTER COLUMN max_attempts SET DEFAULT 5,
  ALTER COLUMN error_details SET DEFAULT '{}'::jsonb,
  ALTER COLUMN response SET DEFAULT '{}'::jsonb,
  ALTER COLUMN updated_at SET DEFAULT now();

CREATE INDEX IF NOT EXISTS notification_delivery_queue_ready_idx
  ON notification_delivery_queue(channel, status, next_attempt_at, created_at)
  WHERE status IN ('pending', 'retry');

CREATE INDEX IF NOT EXISTS notification_delivery_queue_processing_idx
  ON notification_delivery_queue(status, locked_at)
  WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS notification_delivery_queue_tenant_channel_idx
  ON notification_delivery_queue(tenant_id, channel, status, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS notification_delivery_queue_idempotency_idx
  ON notification_delivery_queue(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS notification_delivery_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  queue_id uuid NOT NULL REFERENCES notification_delivery_queue(id) ON DELETE CASCADE,
  tenant_id uuid DEFAULT '00000000-0000-0000-0000-000000000010' NOT NULL
    REFERENCES tenants(id) ON DELETE CASCADE,
  channel varchar(20) NOT NULL,
  attempt_no integer NOT NULL,
  worker_id varchar(120) NOT NULL,
  status varchar(20) NOT NULL,
  error text,
  response jsonb DEFAULT '{}'::jsonb NOT NULL,
  started_at timestamp with time zone DEFAULT now() NOT NULL,
  finished_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT notification_delivery_attempts_channel_check
    CHECK (channel IN ('email', 'push')),
  CONSTRAINT notification_delivery_attempts_status_check
    CHECK (status IN ('processing', 'sent', 'failed', 'retry'))
);

CREATE INDEX IF NOT EXISTS notification_delivery_attempts_queue_idx
  ON notification_delivery_attempts(queue_id, attempt_no);

CREATE INDEX IF NOT EXISTS notification_delivery_attempts_tenant_status_idx
  ON notification_delivery_attempts(tenant_id, status, finished_at DESC);

ALTER TABLE notification_delivery_attempts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notification_delivery_attempts'
      AND policyname = 'notification_delivery_attempts_management'
  ) THEN
    CREATE POLICY notification_delivery_attempts_management
      ON notification_delivery_attempts
      TO authenticated
      USING (is_management())
      WITH CHECK (is_management());
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON notification_delivery_attempts TO authenticated;

