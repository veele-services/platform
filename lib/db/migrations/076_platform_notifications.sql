CREATE TABLE IF NOT EXISTS platform_notification_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key varchar(60) NOT NULL,
  audience_type varchar(60) NOT NULL,
  schedule_type varchar(30) NOT NULL DEFAULT 'immediate',
  status varchar(30) NOT NULL DEFAULT 'queued',
  title varchar(180) NOT NULL,
  body text NOT NULL,
  channels jsonb NOT NULL DEFAULT '["in_app"]'::jsonb,
  target_criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  tenant_count integer NOT NULL DEFAULT 0,
  recipient_count integer NOT NULL DEFAULT 0,
  created_by_platform_user_id uuid REFERENCES platform_users(id) ON DELETE SET NULL,
  scheduled_at timestamptz,
  queued_at timestamptz,
  sent_at timestamptz,
  canceled_at timestamptz,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_notification_dispatches_template_check CHECK (
    template_key IN ('maintenance', 'incident', 'onboarding_reminder', 'domain_dns_reminder', 'subscription_warning')
  ),
  CONSTRAINT platform_notification_dispatches_audience_check CHECK (
    audience_type IN ('platform_users', 'tenant_owners', 'tenants_by_plan', 'tenants_by_module', 'tenants_with_readiness_issue')
  ),
  CONSTRAINT platform_notification_dispatches_schedule_check CHECK (
    schedule_type IN ('immediate', 'scheduled')
  ),
  CONSTRAINT platform_notification_dispatches_status_check CHECK (
    status IN ('queued', 'scheduled', 'sent', 'canceled')
  ),
  CONSTRAINT platform_notification_dispatches_channels_check CHECK (
    jsonb_typeof(channels) = 'array'
    AND channels <@ '["in_app","email","push"]'::jsonb
  ),
  CONSTRAINT platform_notification_dispatches_schedule_time_check CHECK (
    schedule_type = 'immediate'
    OR scheduled_at IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS platform_notification_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id uuid NOT NULL REFERENCES platform_notification_dispatches(id) ON DELETE CASCADE,
  recipient_type varchar(40) NOT NULL,
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  platform_user_id uuid REFERENCES platform_users(id) ON DELETE SET NULL,
  tenant_owner_invite_id uuid REFERENCES tenant_owner_invites(id) ON DELETE SET NULL,
  recipient_user_id uuid,
  recipient_email text,
  tenant_name varchar(200),
  tenant_slug varchar(80),
  channels jsonb NOT NULL DEFAULT '["in_app"]'::jsonb,
  delivery_status varchar(30) NOT NULL DEFAULT 'queued',
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  CONSTRAINT platform_notification_recipients_type_check CHECK (
    recipient_type IN ('platform_user', 'tenant_owner')
  ),
  CONSTRAINT platform_notification_recipients_channels_check CHECK (
    jsonb_typeof(channels) = 'array'
    AND channels <@ '["in_app","email","push"]'::jsonb
  ),
  CONSTRAINT platform_notification_recipients_delivery_status_check CHECK (
    delivery_status IN ('queued', 'scheduled', 'sent', 'skipped', 'failed')
  ),
  CONSTRAINT platform_notification_recipients_scope_check CHECK (
    (recipient_type = 'platform_user' AND platform_user_id IS NOT NULL AND tenant_id IS NULL)
    OR
    (recipient_type = 'tenant_owner' AND tenant_id IS NOT NULL AND (tenant_owner_invite_id IS NOT NULL OR recipient_email IS NOT NULL))
  )
);

CREATE INDEX IF NOT EXISTS platform_notification_dispatches_status_idx
  ON platform_notification_dispatches(status, scheduled_at, created_at);
CREATE INDEX IF NOT EXISTS platform_notification_dispatches_template_idx
  ON platform_notification_dispatches(template_key);
CREATE INDEX IF NOT EXISTS platform_notification_dispatches_audience_idx
  ON platform_notification_dispatches(audience_type);
CREATE INDEX IF NOT EXISTS platform_notification_recipients_dispatch_idx
  ON platform_notification_recipients(dispatch_id);
CREATE INDEX IF NOT EXISTS platform_notification_recipients_tenant_idx
  ON platform_notification_recipients(tenant_id);
CREATE INDEX IF NOT EXISTS platform_notification_recipients_platform_user_idx
  ON platform_notification_recipients(platform_user_id);
CREATE INDEX IF NOT EXISTS platform_notification_recipients_owner_invite_idx
  ON platform_notification_recipients(tenant_owner_invite_id);
CREATE INDEX IF NOT EXISTS platform_notification_recipients_status_idx
  ON platform_notification_recipients(delivery_status, created_at);

ALTER TABLE platform_notification_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_notification_recipients ENABLE ROW LEVEL SECURITY;
