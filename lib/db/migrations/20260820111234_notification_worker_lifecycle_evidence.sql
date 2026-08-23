-- Durable notification delivery evidence, lifecycle-safe outcomes and tenant ACL.

ALTER TABLE public.notification_delivery_queue
  ADD COLUMN IF NOT EXISTS delivery_key text,
  ADD COLUMN IF NOT EXISTS delivery_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS current_attempt_id uuid,
  ADD COLUMN IF NOT EXISTS terminal_attempt_id uuid;

UPDATE public.notification_delivery_queue
SET delivery_key = 'notification:' || id::text
WHERE delivery_key IS NULL;

ALTER TABLE public.notification_delivery_queue
  ALTER COLUMN delivery_key SET NOT NULL,
  ALTER COLUMN delivery_key SET DEFAULT ('notification:' || gen_random_uuid()::text);

CREATE UNIQUE INDEX IF NOT EXISTS notification_delivery_queue_delivery_key_idx
  ON public.notification_delivery_queue(delivery_key);

ALTER TABLE public.notification_delivery_attempts
  ADD COLUMN IF NOT EXISTS delivery_key text,
  ADD COLUMN IF NOT EXISTS provider_message_id text;

UPDATE public.notification_delivery_attempts attempt
SET delivery_key = queue.delivery_key
FROM public.notification_delivery_queue queue
WHERE queue.id = attempt.queue_id
  AND attempt.delivery_key IS NULL;

ALTER TABLE public.notification_delivery_attempts
  ALTER COLUMN delivery_key SET NOT NULL;

ALTER TABLE public.notification_delivery_queue
  DROP CONSTRAINT IF EXISTS notification_delivery_queue_status_check;
ALTER TABLE public.notification_delivery_queue
  ADD CONSTRAINT notification_delivery_queue_status_check
  CHECK (status IN (
    'pending', 'processing', 'sent', 'failed', 'retry', 'skipped', 'partial',
    'outcome_pending'
  ));

ALTER TABLE public.notification_delivery_attempts
  DROP CONSTRAINT IF EXISTS notification_delivery_attempts_status_check;
ALTER TABLE public.notification_delivery_attempts
  ADD CONSTRAINT notification_delivery_attempts_status_check
  CHECK (status IN (
    'processing', 'sent', 'failed', 'retry', 'skipped', 'partial',
    'outcome_pending', 'abandoned'
  ));

CREATE UNIQUE INDEX IF NOT EXISTS notification_delivery_attempts_queue_attempt_idx
  ON public.notification_delivery_attempts(queue_id, attempt_no);

-- Preserve old terminal evidence by reconciling the latest recorded attempt.
WITH latest AS (
  SELECT DISTINCT ON (attempt.queue_id) attempt.id, queue.status
  FROM public.notification_delivery_attempts attempt
  JOIN public.notification_delivery_queue queue ON queue.id = attempt.queue_id
  WHERE queue.status IN ('sent', 'failed')
  ORDER BY attempt.queue_id, attempt.attempt_no DESC, attempt.finished_at DESC
)
UPDATE public.notification_delivery_attempts attempt
SET status = latest.status,
    finished_at = COALESCE(attempt.finished_at, now())
FROM latest
WHERE attempt.id = latest.id;

INSERT INTO public.notification_delivery_attempts (
  queue_id, tenant_id, channel, attempt_no, worker_id, status, error, response,
  delivery_key, started_at, finished_at
)
SELECT queue.id, queue.tenant_id, queue.channel, GREATEST(queue.attempts, 1),
       'migration-evidence-backfill', queue.status,
       CASE WHEN queue.status = 'failed' THEN COALESCE(queue.last_error, 'Legacy terminal failure') ELSE NULL END,
       COALESCE(queue.response, '{}'::jsonb), queue.delivery_key,
       COALESCE(queue.last_attempt_at, queue.created_at, now()),
       COALESCE(queue.updated_at, queue.sent_at, now())
FROM public.notification_delivery_queue queue
WHERE queue.status IN ('sent', 'failed')
  AND NOT EXISTS (
    SELECT 1 FROM public.notification_delivery_attempts attempt
    WHERE attempt.queue_id = queue.id AND attempt.status = queue.status
  )
ON CONFLICT (queue_id, attempt_no) DO UPDATE
SET status = EXCLUDED.status,
    error = EXCLUDED.error,
    response = EXCLUDED.response,
    delivery_key = EXCLUDED.delivery_key,
    finished_at = EXCLUDED.finished_at;

WITH evidence AS (
  SELECT DISTINCT ON (attempt.queue_id) attempt.queue_id, attempt.id
  FROM public.notification_delivery_attempts attempt
  JOIN public.notification_delivery_queue queue ON queue.id = attempt.queue_id
  WHERE queue.status IN ('sent', 'failed') AND attempt.status = queue.status
  ORDER BY attempt.queue_id, attempt.attempt_no DESC, attempt.finished_at DESC
)
UPDATE public.notification_delivery_queue queue
SET terminal_attempt_id = evidence.id,
    current_attempt_id = evidence.id
FROM evidence
WHERE queue.id = evidence.queue_id AND queue.status IN ('sent', 'failed');

ALTER TABLE public.notification_delivery_queue
  ADD CONSTRAINT notification_delivery_queue_current_attempt_fkey
    FOREIGN KEY (current_attempt_id)
    REFERENCES public.notification_delivery_attempts(id) ON DELETE SET NULL,
  ADD CONSTRAINT notification_delivery_queue_terminal_attempt_fkey
    FOREIGN KEY (terminal_attempt_id)
    REFERENCES public.notification_delivery_attempts(id) ON DELETE RESTRICT,
  ADD CONSTRAINT notification_delivery_queue_terminal_evidence_check
    CHECK (
      (status IN ('sent', 'failed', 'skipped', 'partial'))
      = (terminal_attempt_id IS NOT NULL)
    );

CREATE INDEX IF NOT EXISTS notification_delivery_queue_outcome_pending_idx
  ON public.notification_delivery_queue(status, locked_at, updated_at)
  WHERE status = 'outcome_pending';

CREATE OR REPLACE FUNCTION app_private.fieldgrid_validate_notification_attempt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, app_private
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.notification_delivery_queue queue
    WHERE queue.id = NEW.queue_id
      AND queue.tenant_id = NEW.tenant_id
      AND queue.channel = NEW.channel
      AND queue.delivery_key = NEW.delivery_key
  ) THEN
    RAISE EXCEPTION 'Notification attempt does not match its queue item.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER notification_delivery_attempts_queue_match
BEFORE INSERT OR UPDATE OF queue_id, tenant_id, channel, delivery_key
ON public.notification_delivery_attempts
FOR EACH ROW EXECUTE FUNCTION app_private.fieldgrid_validate_notification_attempt();

CREATE OR REPLACE FUNCTION app_private.fieldgrid_validate_notification_queue_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, app_private
AS $$
BEGIN
  IF NEW.current_attempt_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.notification_delivery_attempts attempt
    WHERE attempt.id = NEW.current_attempt_id
      AND attempt.queue_id = NEW.id
      AND attempt.tenant_id = NEW.tenant_id
      AND attempt.delivery_key = NEW.delivery_key
  ) THEN
    RAISE EXCEPTION 'Current notification attempt does not match its queue item.'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.terminal_attempt_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.notification_delivery_attempts attempt
    WHERE attempt.id = NEW.terminal_attempt_id
      AND attempt.queue_id = NEW.id
      AND attempt.tenant_id = NEW.tenant_id
      AND attempt.delivery_key = NEW.delivery_key
      AND attempt.status = NEW.status
  ) THEN
    RAISE EXCEPTION 'Terminal notification evidence does not match its queue outcome.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER notification_delivery_queue_evidence_match
BEFORE INSERT OR UPDATE OF current_attempt_id, terminal_attempt_id, status, tenant_id, delivery_key
ON public.notification_delivery_queue
FOR EACH ROW EXECUTE FUNCTION app_private.fieldgrid_validate_notification_queue_evidence();

REVOKE ALL ON FUNCTION app_private.fieldgrid_validate_notification_attempt()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.fieldgrid_validate_notification_queue_evidence()
  FROM PUBLIC, anon, authenticated, service_role;

DROP POLICY IF EXISTS notification_delivery_queue_management
  ON public.notification_delivery_queue;
CREATE POLICY notification_delivery_queue_management
  ON public.notification_delivery_queue
  TO authenticated
  USING (public.is_management_for_tenant(tenant_id))
  WITH CHECK (public.is_management_for_tenant(tenant_id));

DROP POLICY IF EXISTS notification_delivery_attempts_management
  ON public.notification_delivery_attempts;
CREATE POLICY notification_delivery_attempts_management
  ON public.notification_delivery_attempts
  TO authenticated
  USING (public.is_management_for_tenant(tenant_id))
  WITH CHECK (public.is_management_for_tenant(tenant_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_delivery_queue TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_delivery_attempts TO authenticated;

COMMENT ON COLUMN public.notification_delivery_queue.delivery_started_at IS
  'Set immediately before an external provider call. A stale non-null value is reconciled to outcome_pending, never blindly redelivered.';
COMMENT ON COLUMN public.notification_delivery_queue.terminal_attempt_id IS
  'Required matching delivery evidence for sent, failed, skipped and partial terminal states.';
