-- ============================================================================
-- Smart planning MVP: capacity checks, candidate snapshots and interest rounds.
-- Keeps the existing assignment lifecycle intact and stores planning intelligence
-- in sidecar tables that can be recalculated safely.
-- ============================================================================

ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS required_personnel_count integer DEFAULT 1 NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'assignments_required_personnel_count_check'
  ) THEN
    ALTER TABLE assignments
      ADD CONSTRAINT assignments_required_personnel_count_check
      CHECK (required_personnel_count BETWEEN 1 AND 50);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS assignment_capacity_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid DEFAULT '00000000-0000-0000-0000-000000000010' NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  required_slots integer DEFAULT 1 NOT NULL,
  suitable_total integer DEFAULT 0 NOT NULL,
  available_total integer DEFAULT 0 NOT NULL,
  top_match_total integer DEFAULT 0 NOT NULL,
  conflict_total integer DEFAULT 0 NOT NULL,
  interested_total integer DEFAULT 0 NOT NULL,
  highest_match_score integer DEFAULT 0 NOT NULL,
  capacity_status varchar(20) DEFAULT 'red' NOT NULL,
  advice text NOT NULL,
  input_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
  summary jsonb DEFAULT '{}'::jsonb NOT NULL,
  generated_at timestamp with time zone DEFAULT now() NOT NULL,
  generated_by uuid,
  is_latest boolean DEFAULT true NOT NULL,
  CONSTRAINT assignment_capacity_checks_status_check CHECK (
    capacity_status IN ('green', 'orange', 'red')
  )
);

CREATE INDEX IF NOT EXISTS assignment_capacity_checks_assignment_generated_idx
  ON assignment_capacity_checks(assignment_id, generated_at);
CREATE INDEX IF NOT EXISTS assignment_capacity_checks_tenant_status_idx
  ON assignment_capacity_checks(tenant_id, capacity_status);
CREATE UNIQUE INDEX IF NOT EXISTS assignment_capacity_checks_latest_idx
  ON assignment_capacity_checks(assignment_id)
  WHERE is_latest = true;

CREATE TABLE IF NOT EXISTS assignment_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid DEFAULT '00000000-0000-0000-0000-000000000010' NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  personnel_id uuid NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
  hard_status varchar(20) DEFAULT 'blocked' NOT NULL,
  is_eligible boolean DEFAULT false NOT NULL,
  is_available boolean DEFAULT false NOT NULL,
  has_conflict boolean DEFAULT false NOT NULL,
  match_score integer DEFAULT 0 NOT NULL,
  reasons jsonb DEFAULT '[]'::jsonb NOT NULL,
  score_breakdown jsonb DEFAULT '{}'::jsonb NOT NULL,
  last_calculated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT assignment_candidates_hard_status_check CHECK (
    hard_status IN ('eligible', 'warning', 'blocked')
  ),
  CONSTRAINT assignment_candidates_match_score_check CHECK (
    match_score BETWEEN 0 AND 100
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS assignment_candidates_assignment_personnel_idx
  ON assignment_candidates(assignment_id, personnel_id);
CREATE INDEX IF NOT EXISTS assignment_candidates_assignment_score_idx
  ON assignment_candidates(assignment_id, hard_status, match_score);
CREATE INDEX IF NOT EXISTS assignment_candidates_personnel_idx
  ON assignment_candidates(personnel_id);

CREATE TABLE IF NOT EXISTS assignment_interest_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid DEFAULT '00000000-0000-0000-0000-000000000010' NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  round_number integer NOT NULL,
  audience_type varchar(30) DEFAULT 'top_matches' NOT NULL,
  candidate_limit integer DEFAULT 5 NOT NULL,
  status varchar(20) DEFAULT 'draft' NOT NULL,
  sent_at timestamp with time zone,
  expires_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT assignment_interest_rounds_audience_check CHECK (
    audience_type IN ('top_matches', 'next_matches', 'flexpool', 'spoedpool', 'manual')
  ),
  CONSTRAINT assignment_interest_rounds_status_check CHECK (
    status IN ('draft', 'sent', 'expired', 'cancelled')
  ),
  CONSTRAINT assignment_interest_rounds_candidate_limit_check CHECK (
    candidate_limit BETWEEN 1 AND 250
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS assignment_interest_rounds_assignment_round_idx
  ON assignment_interest_rounds(assignment_id, round_number);
CREATE INDEX IF NOT EXISTS assignment_interest_rounds_assignment_status_idx
  ON assignment_interest_rounds(assignment_id, status);

CREATE TABLE IF NOT EXISTS assignment_interest_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid DEFAULT '00000000-0000-0000-0000-000000000010' NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES assignment_interest_rounds(id) ON DELETE CASCADE,
  personnel_id uuid NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
  status varchar(30) DEFAULT 'invited' NOT NULL,
  response_note text,
  viewed_at timestamp with time zone,
  responded_at timestamp with time zone,
  selected_at timestamp with time zone,
  expires_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT assignment_interest_responses_status_check CHECK (
    status IN (
      'invited', 'viewed', 'interested', 'unavailable', 'question',
      'selected', 'reserve', 'confirmed', 'cancelled', 'expired'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS assignment_interest_responses_round_personnel_idx
  ON assignment_interest_responses(round_id, personnel_id);
CREATE INDEX IF NOT EXISTS assignment_interest_responses_assignment_status_idx
  ON assignment_interest_responses(assignment_id, status);
CREATE INDEX IF NOT EXISTS assignment_interest_responses_personnel_status_idx
  ON assignment_interest_responses(personnel_id, status);

CREATE TABLE IF NOT EXISTS planning_sector_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid DEFAULT '00000000-0000-0000-0000-000000000010' NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sector_id uuid REFERENCES sectors(id) ON DELETE CASCADE,
  weights jsonb DEFAULT '{"availability":25,"qualifications":25,"region":15,"objectExperience":10,"workload":10,"emergency":5,"reliability":5,"preferences":5}'::jsonb NOT NULL,
  top_match_threshold integer DEFAULT 85 NOT NULL,
  default_round_size integer DEFAULT 5 NOT NULL,
  round_interval_minutes integer DEFAULT 30 NOT NULL,
  max_daily_invites integer DEFAULT 6 NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT planning_sector_rules_threshold_check CHECK (top_match_threshold BETWEEN 1 AND 100),
  CONSTRAINT planning_sector_rules_round_size_check CHECK (default_round_size BETWEEN 1 AND 50),
  CONSTRAINT planning_sector_rules_round_interval_check CHECK (round_interval_minutes BETWEEN 1 AND 1440),
  CONSTRAINT planning_sector_rules_max_daily_invites_check CHECK (max_daily_invites BETWEEN 1 AND 100)
);

CREATE UNIQUE INDEX IF NOT EXISTS planning_sector_rules_tenant_sector_idx
  ON planning_sector_rules(tenant_id, sector_id);

INSERT INTO planning_sector_rules (tenant_id, sector_id, weights, top_match_threshold, default_round_size, round_interval_minutes, max_daily_invites)
SELECT
  '00000000-0000-0000-0000-000000000010'::uuid,
  s.id,
  CASE
    WHEN lower(s.name) LIKE '%beveilig%' THEN
      '{"availability":20,"qualifications":35,"region":10,"objectExperience":10,"workload":10,"emergency":5,"reliability":7,"preferences":3}'::jsonb
    WHEN lower(s.name) LIKE '%facilit%' THEN
      '{"availability":30,"qualifications":20,"region":12,"objectExperience":8,"workload":10,"emergency":10,"reliability":5,"preferences":5}'::jsonb
    ELSE
      '{"availability":25,"qualifications":25,"region":15,"objectExperience":10,"workload":10,"emergency":5,"reliability":5,"preferences":5}'::jsonb
  END,
  85,
  5,
  30,
  6
FROM sectors s
WHERE s.is_active = true
ON CONFLICT (tenant_id, sector_id) DO NOTHING;

ALTER TABLE assignment_capacity_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_interest_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_interest_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_sector_rules ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'assignment_capacity_checks'
      AND policyname = 'assignment_capacity_checks_management'
  ) THEN
    CREATE POLICY assignment_capacity_checks_management
      ON assignment_capacity_checks
      TO authenticated
      USING (is_management())
      WITH CHECK (is_management());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'assignment_candidates'
      AND policyname = 'assignment_candidates_management'
  ) THEN
    CREATE POLICY assignment_candidates_management
      ON assignment_candidates
      TO authenticated
      USING (is_management())
      WITH CHECK (is_management());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'assignment_interest_rounds'
      AND policyname = 'assignment_interest_rounds_management'
  ) THEN
    CREATE POLICY assignment_interest_rounds_management
      ON assignment_interest_rounds
      TO authenticated
      USING (is_management())
      WITH CHECK (is_management());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'assignment_interest_responses'
      AND policyname = 'assignment_interest_responses_management'
  ) THEN
    CREATE POLICY assignment_interest_responses_management
      ON assignment_interest_responses
      TO authenticated
      USING (is_management())
      WITH CHECK (is_management());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'assignment_interest_responses'
      AND policyname = 'assignment_interest_responses_own'
  ) THEN
    CREATE POLICY assignment_interest_responses_own
      ON assignment_interest_responses
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM personnel p
          WHERE p.id = assignment_interest_responses.personnel_id
            AND p.user_id = (SELECT auth.uid())
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM personnel p
          WHERE p.id = assignment_interest_responses.personnel_id
            AND p.user_id = (SELECT auth.uid())
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'planning_sector_rules'
      AND policyname = 'planning_sector_rules_management'
  ) THEN
    CREATE POLICY planning_sector_rules_management
      ON planning_sector_rules
      TO authenticated
      USING (is_management())
      WITH CHECK (is_management());
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON assignment_capacity_checks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON assignment_candidates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON assignment_interest_rounds TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON assignment_interest_responses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON planning_sector_rules TO authenticated;

INSERT INTO notification_event_settings (
  event_key, event_group, audience, title, description,
  email_enabled, push_enabled, in_app_enabled,
  email_subject, email_preheader, email_body,
  push_title, push_body, shortcodes
)
VALUES
(
  'assignment_interest_invited',
  'Planning',
  'personnel',
  'Nieuwe opdracht onder voorbehoud',
  'Een medewerker is uitgenodigd voor een interessepeiling.',
  true,
  true,
  true,
  'Interessepeiling voor {{assignment.code}}',
  'Laat weten of je deze opdracht kunt oppakken.',
  '<p>Beste {{recipient.name}},</p><p>Er staat een nieuwe opdracht onder voorbehoud klaar.</p><p><strong>{{assignment.code}}</strong><br>{{assignment.title}}<br>{{assignment.date}} {{assignment.time_range}}<br>{{object.name}} - {{object.city}}</p><p>Laat in de personeelsapp weten of je interesse hebt. Dit is nog geen definitieve planning.</p>',
  'Nieuwe opdracht onder voorbehoud',
  '{{assignment.code}} · {{assignment.date}} {{assignment.time_range}}',
  '["{{recipient.name}}","{{assignment.code}}","{{assignment.title}}","{{assignment.date}}","{{assignment.time_range}}","{{object.name}}","{{object.city}}"]'::jsonb
),
(
  'assignment_interest_selected',
  'Planning',
  'personnel',
  'Je bent geselecteerd voor een opdracht',
  'Planning heeft een geïnteresseerde medewerker geselecteerd.',
  true,
  true,
  true,
  'Geselecteerd voor {{assignment.code}}',
  'Planning heeft je geselecteerd.',
  '<p>Beste {{recipient.name}},</p><p>Je bent geselecteerd voor <strong>{{assignment.code}}</strong>. De planning bevestigt de werkbon zodra deze definitief is.</p>',
  'Geselecteerd voor opdracht',
  'Je bent geselecteerd voor {{assignment.code}}.',
  '["{{recipient.name}}","{{assignment.code}}","{{assignment.title}}"]'::jsonb
),
(
  'assignment_interest_reminder',
  'Planning',
  'personnel',
  'Herinnering interessepeiling',
  'Een medewerker krijgt een herinnering voor een openstaande interessepeiling.',
  true,
  true,
  true,
  'Herinnering: {{assignment.code}}',
  'Laat weten of je deze opdracht kunt oppakken.',
  '<p>Beste {{recipient.name}},</p><p>Je hebt nog niet gereageerd op de interessepeiling voor <strong>{{assignment.code}}</strong>.</p><p>{{assignment.title}}<br>{{assignment.date}} {{assignment.time_range}}<br>{{object.name}} - {{object.city}}</p><p>Geef in de personeelsapp aan of je interesse hebt of niet beschikbaar bent.</p>',
  'Herinnering opdracht',
  'Reageer op {{assignment.code}}.',
  '["{{recipient.name}}","{{assignment.code}}","{{assignment.title}}","{{assignment.date}}","{{assignment.time_range}}","{{object.name}}","{{object.city}}"]'::jsonb
),
(
  'assignment_interest_reserve',
  'Planning',
  'personnel',
  'Je staat reserve voor een opdracht',
  'Planning heeft een geïnteresseerde medewerker als reserve gemarkeerd.',
  true,
  true,
  true,
  'Reserve voor {{assignment.code}}',
  'Je staat reserve voor deze opdracht.',
  '<p>Beste {{recipient.name}},</p><p>Je staat als reserve voor <strong>{{assignment.code}}</strong>. Je ontvangt bericht als je definitief nodig bent.</p>',
  'Reserve voor opdracht',
  'Je staat reserve voor {{assignment.code}}.',
  '["{{recipient.name}}","{{assignment.code}}","{{assignment.title}}"]'::jsonb
),
(
  'assignment_interest_cancelled',
  'Planning',
  'personnel',
  'Interessepeiling geannuleerd',
  'Een interessepeiling voor een opdracht is geannuleerd.',
  true,
  true,
  true,
  'Interessepeiling {{assignment.code}} geannuleerd',
  'Deze opdracht wordt niet via deze ronde gepland.',
  '<p>Beste {{recipient.name}},</p><p>De interessepeiling voor <strong>{{assignment.code}}</strong> is geannuleerd. Je hoeft hier niets meer voor te doen.</p>',
  'Interessepeiling geannuleerd',
  '{{assignment.code}} is geannuleerd.',
  '["{{recipient.name}}","{{assignment.code}}","{{assignment.title}}"]'::jsonb
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
