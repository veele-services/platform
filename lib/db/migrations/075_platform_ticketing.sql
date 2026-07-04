CREATE TABLE IF NOT EXISTS platform_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type varchar(30) NOT NULL DEFAULT 'support',
  status varchar(30) NOT NULL DEFAULT 'open',
  priority varchar(20) NOT NULL DEFAULT 'normal',
  title varchar(220) NOT NULL,
  description text,
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  subscription_id uuid REFERENCES tenant_subscriptions(id) ON DELETE SET NULL,
  domain_id uuid REFERENCES tenant_domains(id) ON DELETE SET NULL,
  support_grant_id uuid REFERENCES support_access_grants(id) ON DELETE SET NULL,
  smoke_run_id text,
  audit_log_id uuid REFERENCES audit_log(id) ON DELETE SET NULL,
  assignee_platform_user_id uuid REFERENCES platform_users(id) ON DELETE SET NULL,
  created_by_platform_user_id uuid REFERENCES platform_users(id) ON DELETE SET NULL,
  sla_due_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_tickets_type_check CHECK (type IN ('support', 'incident', 'onboarding', 'billing', 'domain', 'security')),
  CONSTRAINT platform_tickets_status_check CHECK (status IN ('open', 'in_progress', 'waiting_customer', 'waiting_internal', 'resolved', 'closed')),
  CONSTRAINT platform_tickets_priority_check CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  CONSTRAINT platform_tickets_resolution_dates_check CHECK (
    (status NOT IN ('resolved', 'closed') OR resolved_at IS NOT NULL)
    AND (status <> 'closed' OR closed_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS platform_ticket_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES platform_tickets(id) ON DELETE CASCADE,
  author_platform_user_id uuid REFERENCES platform_users(id) ON DELETE SET NULL,
  visibility varchar(20) NOT NULL DEFAULT 'internal',
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_ticket_notes_visibility_check CHECK (visibility IN ('internal', 'public'))
);

CREATE INDEX IF NOT EXISTS platform_tickets_status_priority_idx ON platform_tickets(status, priority);
CREATE INDEX IF NOT EXISTS platform_tickets_tenant_idx ON platform_tickets(tenant_id);
CREATE INDEX IF NOT EXISTS platform_tickets_subscription_idx ON platform_tickets(subscription_id);
CREATE INDEX IF NOT EXISTS platform_tickets_domain_idx ON platform_tickets(domain_id);
CREATE INDEX IF NOT EXISTS platform_tickets_support_grant_idx ON platform_tickets(support_grant_id);
CREATE INDEX IF NOT EXISTS platform_tickets_smoke_run_idx ON platform_tickets(smoke_run_id);
CREATE INDEX IF NOT EXISTS platform_tickets_audit_log_idx ON platform_tickets(audit_log_id);
CREATE INDEX IF NOT EXISTS platform_tickets_sla_idx ON platform_tickets(sla_due_at);
CREATE INDEX IF NOT EXISTS platform_tickets_activity_idx ON platform_tickets(last_activity_at);
CREATE INDEX IF NOT EXISTS platform_tickets_open_domain_idx ON platform_tickets(domain_id, status)
  WHERE domain_id IS NOT NULL AND status NOT IN ('resolved', 'closed');
CREATE INDEX IF NOT EXISTS platform_ticket_notes_ticket_created_idx ON platform_ticket_notes(ticket_id, created_at);
CREATE INDEX IF NOT EXISTS platform_ticket_notes_author_idx ON platform_ticket_notes(author_platform_user_id);

ALTER TABLE platform_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_ticket_notes ENABLE ROW LEVEL SECURITY;
