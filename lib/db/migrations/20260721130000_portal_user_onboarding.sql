-- Fieldgrid portal user onboarding v1.
-- Draft onboarding data is private and can only be accessed through tenant-bound server actions.

ALTER TABLE public.personnel
  ADD COLUMN IF NOT EXISTS preferred_name varchar(100),
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS secondary_phone varchar(50),
  ADD COLUMN IF NOT EXISTS personal_email varchar(255),
  ADD COLUMN IF NOT EXISTS emergency_contact jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS travel_preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS work_preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.customer_users
  ADD COLUMN IF NOT EXISTS function varchar(120),
  ADD COLUMN IF NOT EXISTS phone varchar(50),
  ADD COLUMN IF NOT EXISTS mobile varchar(50);

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS trade_name varchar(255),
  ADD COLUMN IF NOT EXISTS registration_country varchar(100);

CREATE TABLE IF NOT EXISTS public.portal_onboarding_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  portal varchar(20) NOT NULL,
  subject_id uuid NOT NULL,
  status varchar(40) NOT NULL DEFAULT 'not_started',
  current_step varchar(80) NOT NULL DEFAULT 'welcome',
  completed_steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  draft_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  onboarding_version integer NOT NULL DEFAULT 1,
  profile_completeness_percentage integer NOT NULL DEFAULT 0,
  push_status varchar(32) NOT NULL DEFAULT 'not_asked',
  push_attempted_at timestamptz,
  started_at timestamptz,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  completed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT portal_onboarding_portal_check CHECK (portal IN ('personnel', 'customer')),
  CONSTRAINT portal_onboarding_status_check CHECK (
    status IN ('not_started', 'in_progress', 'awaiting_push_permission', 'awaiting_review', 'completed', 'reopened', 'waived_by_admin')
  ),
  CONSTRAINT portal_onboarding_push_status_check CHECK (
    push_status IN ('not_asked', 'allowed', 'denied', 'unsupported', 'revoked', 'expired')
  ),
  CONSTRAINT portal_onboarding_version_check CHECK (onboarding_version > 0),
  CONSTRAINT portal_onboarding_completeness_check CHECK (
    profile_completeness_percentage BETWEEN 0 AND 100
  ),
  CONSTRAINT portal_onboarding_session_id_tenant_unique UNIQUE (id, tenant_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS portal_onboarding_session_identity_idx
  ON public.portal_onboarding_sessions (tenant_id, user_id, portal);
CREATE INDEX IF NOT EXISTS portal_onboarding_session_status_idx
  ON public.portal_onboarding_sessions (tenant_id, portal, status, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS portal_onboarding_session_subject_idx
  ON public.portal_onboarding_sessions (tenant_id, portal, subject_id);

CREATE TABLE IF NOT EXISTS public.portal_onboarding_step_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  step_key varchar(80) NOT NULL,
  onboarding_version integer NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT portal_onboarding_step_version_check CHECK (onboarding_version > 0),
  CONSTRAINT portal_onboarding_step_session_unique UNIQUE (session_id, step_key),
  CONSTRAINT portal_onboarding_step_session_tenant_fk
    FOREIGN KEY (session_id, tenant_id)
    REFERENCES public.portal_onboarding_sessions(id, tenant_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS portal_onboarding_step_tenant_idx
  ON public.portal_onboarding_step_completions (tenant_id, completed_at DESC);

CREATE TABLE IF NOT EXISTS public.portal_notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  portal varchar(20) NOT NULL,
  category varchar(80) NOT NULL,
  email_enabled boolean NOT NULL DEFAULT true,
  push_enabled boolean NOT NULL DEFAULT false,
  in_app_enabled boolean NOT NULL DEFAULT true,
  critical boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT portal_notification_preference_portal_check CHECK (portal IN ('personnel', 'customer')),
  CONSTRAINT portal_notification_preference_identity_unique UNIQUE (tenant_id, user_id, portal, category)
);

CREATE INDEX IF NOT EXISTS portal_notification_preference_tenant_idx
  ON public.portal_notification_preferences (tenant_id, portal, user_id);

ALTER TABLE public.portal_onboarding_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_onboarding_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.portal_onboarding_step_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_onboarding_step_completions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.portal_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_notification_preferences FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.portal_onboarding_sessions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.portal_onboarding_step_completions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.portal_notification_preferences FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.portal_onboarding_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.portal_onboarding_step_completions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.portal_notification_preferences TO service_role;

COMMENT ON TABLE public.portal_onboarding_sessions IS
  'Private, resumable onboarding state for tenant-bound personnel and customer portal users.';
COMMENT ON COLUMN public.portal_onboarding_sessions.draft_data IS
  'Temporary step drafts. Canonical profile data is updated only by authorized server actions.';
