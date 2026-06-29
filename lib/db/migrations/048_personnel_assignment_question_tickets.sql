-- Link personnel assignment questions to the ticketflow.
-- Keeps the existing personnel-ticket model intact while making assignment
-- questions traceable by tenant, assignment and interest response.

ALTER TABLE personnel_message_threads
  ADD COLUMN IF NOT EXISTS tenant_id uuid
    DEFAULT '00000000-0000-0000-0000-000000000010'
    NOT NULL
    REFERENCES tenants(id)
    ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS assignment_id uuid
    REFERENCES assignments(id)
    ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS interest_response_id uuid
    REFERENCES assignment_interest_responses(id)
    ON DELETE SET NULL;

UPDATE personnel_message_threads pmt
SET tenant_id = p.tenant_id
FROM personnel p
WHERE p.id = pmt.personnel_id
  AND pmt.tenant_id IS DISTINCT FROM p.tenant_id;

CREATE INDEX IF NOT EXISTS personnel_msg_threads_tenant_status_idx
  ON personnel_message_threads(tenant_id, status);

CREATE INDEX IF NOT EXISTS personnel_msg_threads_assignment_idx
  ON personnel_message_threads(assignment_id);

CREATE INDEX IF NOT EXISTS personnel_msg_threads_interest_response_idx
  ON personnel_message_threads(interest_response_id);

CREATE UNIQUE INDEX IF NOT EXISTS personnel_msg_threads_open_assignment_question_idx
  ON personnel_message_threads(personnel_id, assignment_id)
  WHERE assignment_id IS NOT NULL
    AND status <> 'closed';

INSERT INTO notification_event_settings (
  event_key,
  event_group,
  audience,
  title,
  description,
  email_subject,
  email_body,
  push_title,
  push_body,
  in_app_enabled,
  email_enabled,
  push_enabled,
  updated_at
)
VALUES (
  'personnel_assignment_question_created',
  'tickets',
  'management',
  'Vraag van medewerker over werkbon',
  '{{personnel.name}} heeft een vraag gesteld over {{assignment.code}}.',
  'Vraag van medewerker over {{assignment.code}}',
  '<p>{{personnel.name}} heeft een vraag gesteld over werkbon {{assignment.code}}.</p><p>Open het ticket in de backoffice om te reageren.</p>',
  'Vraag over {{assignment.code}}',
  '{{personnel.name}} heeft een vraag gesteld.',
  true,
  false,
  false,
  now()
)
ON CONFLICT (event_key) DO UPDATE
SET
  event_group = EXCLUDED.event_group,
  audience = EXCLUDED.audience,
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  email_subject = EXCLUDED.email_subject,
  email_body = EXCLUDED.email_body,
  push_title = EXCLUDED.push_title,
  push_body = EXCLUDED.push_body,
  updated_at = now();
