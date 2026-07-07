-- ============================================================================
-- Tenant/customer-user foundation, central domain events and storage hardening.
-- Safe for staging/production: idempotent, backfills the current single tenant.
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  slug varchar(80) NOT NULL,
  name varchar(200) NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS tenants_slug_idx ON tenants(slug);

INSERT INTO tenants (id, slug, name)
VALUES ('00000000-0000-0000-0000-000000000010', 'veele-services', 'Fieldgrid Default')
ON CONFLICT (id) DO UPDATE
  SET slug = excluded.slug,
      name = excluded.name,
      is_active = true,
      updated_at = now();

CREATE TABLE IF NOT EXISTS tenant_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role varchar(40) DEFAULT 'member' NOT NULL,
  status varchar(30) DEFAULT 'active' NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT tenant_users_role_check CHECK (role IN ('owner', 'admin', 'member', 'support')),
  CONSTRAINT tenant_users_status_check CHECK (status IN ('active', 'invited', 'disabled', 'archived'))
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_users_tenant_user_idx ON tenant_users(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS tenant_users_user_idx ON tenant_users(user_id);

ALTER TABLE organization_settings ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE objects ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE customer_notifications ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE personnel_notifications ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE notification_dispatches ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE notification_delivery_queue ADD COLUMN IF NOT EXISTS tenant_id uuid;

UPDATE organization_settings SET tenant_id = '00000000-0000-0000-0000-000000000010' WHERE tenant_id IS NULL;
UPDATE customers SET tenant_id = '00000000-0000-0000-0000-000000000010' WHERE tenant_id IS NULL;
UPDATE personnel SET tenant_id = '00000000-0000-0000-0000-000000000010' WHERE tenant_id IS NULL;
UPDATE objects SET tenant_id = '00000000-0000-0000-0000-000000000010' WHERE tenant_id IS NULL;
UPDATE assignments SET tenant_id = '00000000-0000-0000-0000-000000000010' WHERE tenant_id IS NULL;
UPDATE customer_notifications SET tenant_id = '00000000-0000-0000-0000-000000000010' WHERE tenant_id IS NULL;
UPDATE personnel_notifications SET tenant_id = '00000000-0000-0000-0000-000000000010' WHERE tenant_id IS NULL;
UPDATE push_subscriptions SET tenant_id = '00000000-0000-0000-0000-000000000010' WHERE tenant_id IS NULL;
UPDATE notification_dispatches SET tenant_id = '00000000-0000-0000-0000-000000000010' WHERE tenant_id IS NULL;
UPDATE notification_delivery_queue SET tenant_id = '00000000-0000-0000-0000-000000000010' WHERE tenant_id IS NULL;

ALTER TABLE organization_settings ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000010';
ALTER TABLE customers ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000010';
ALTER TABLE personnel ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000010';
ALTER TABLE objects ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000010';
ALTER TABLE assignments ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000010';
ALTER TABLE customer_notifications ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000010';
ALTER TABLE personnel_notifications ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000010';
ALTER TABLE push_subscriptions ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000010';
ALTER TABLE notification_dispatches ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000010';
ALTER TABLE notification_delivery_queue ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000010';

ALTER TABLE organization_settings ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE customers ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE personnel ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE objects ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE assignments ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE customer_notifications ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE personnel_notifications ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE push_subscriptions ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE notification_dispatches ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE notification_delivery_queue ALTER COLUMN tenant_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'organization_settings'
      AND constraint_name = 'organization_settings_tenant_id_fkey'
  ) THEN
    ALTER TABLE organization_settings
      ADD CONSTRAINT organization_settings_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'customers'
      AND constraint_name = 'customers_tenant_id_fkey'
  ) THEN
    ALTER TABLE customers
      ADD CONSTRAINT customers_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'personnel'
      AND constraint_name = 'personnel_tenant_id_fkey'
  ) THEN
    ALTER TABLE personnel
      ADD CONSTRAINT personnel_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'objects'
      AND constraint_name = 'objects_tenant_id_fkey'
  ) THEN
    ALTER TABLE objects
      ADD CONSTRAINT objects_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'assignments'
      AND constraint_name = 'assignments_tenant_id_fkey'
  ) THEN
    ALTER TABLE assignments
      ADD CONSTRAINT assignments_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
DECLARE
  tenant_table text;
  tenant_constraint text;
BEGIN
  FOREACH tenant_table IN ARRAY ARRAY[
    'customer_notifications',
    'personnel_notifications',
    'push_subscriptions',
    'notification_dispatches',
    'notification_delivery_queue'
  ]
  LOOP
    tenant_constraint := tenant_table || '_tenant_id_fkey';
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_schema = 'public'
        AND table_name = tenant_table
        AND constraint_name = tenant_constraint
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE',
        tenant_table,
        tenant_constraint
      );
    END IF;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS organization_settings_tenant_idx ON organization_settings(tenant_id);
CREATE INDEX IF NOT EXISTS customers_tenant_idx ON customers(tenant_id);
CREATE INDEX IF NOT EXISTS personnel_tenant_idx ON personnel(tenant_id);
CREATE INDEX IF NOT EXISTS objects_tenant_idx ON objects(tenant_id);
CREATE INDEX IF NOT EXISTS assignments_tenant_idx ON assignments(tenant_id);
CREATE INDEX IF NOT EXISTS customer_notifications_tenant_idx ON customer_notifications(tenant_id);
CREATE INDEX IF NOT EXISTS personnel_notifications_tenant_idx ON personnel_notifications(tenant_id);
CREATE INDEX IF NOT EXISTS notification_delivery_queue_tenant_idx ON notification_delivery_queue(tenant_id, status, created_at);

CREATE TABLE IF NOT EXISTS customer_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid DEFAULT '00000000-0000-0000-0000-000000000010' NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  user_id uuid,
  email varchar(255) NOT NULL,
  first_name varchar(100),
  last_name varchar(100),
  role varchar(40) DEFAULT 'viewer' NOT NULL,
  status varchar(30) DEFAULT 'invited' NOT NULL,
  invite_sent_at timestamp with time zone,
  last_login_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT customer_users_role_check CHECK (role IN ('primary', 'admin', 'billing', 'operations', 'viewer')),
  CONSTRAINT customer_users_status_check CHECK (status IN ('invited', 'active', 'disabled', 'archived'))
);

CREATE INDEX IF NOT EXISTS customer_users_tenant_idx ON customer_users(tenant_id);
CREATE INDEX IF NOT EXISTS customer_users_customer_idx ON customer_users(customer_id);
CREATE INDEX IF NOT EXISTS customer_users_user_idx ON customer_users(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS customer_users_customer_email_idx ON customer_users(customer_id, email);
CREATE UNIQUE INDEX IF NOT EXISTS customer_users_customer_email_ci_idx ON customer_users(customer_id, lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS customer_users_user_customer_idx
  ON customer_users(user_id, customer_id)
  WHERE user_id IS NOT NULL;

INSERT INTO customer_users (
  tenant_id,
  customer_id,
  email,
  first_name,
  role,
  status,
  created_at,
  updated_at
)
SELECT
  c.tenant_id,
  c.id,
  lower(c.contact_email),
  c.contact_name,
  'primary',
  'active',
  now(),
  now()
FROM customers c
WHERE c.contact_email IS NOT NULL
  AND btrim(c.contact_email) <> ''
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS domain_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid DEFAULT '00000000-0000-0000-0000-000000000010' NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_key varchar(100) NOT NULL,
  actor_user_id uuid,
  audience varchar(30) DEFAULT 'management' NOT NULL,
  aggregate_type varchar(80),
  aggregate_id text,
  payload jsonb DEFAULT '{}'::jsonb NOT NULL,
  dispatch_status varchar(30) DEFAULT 'recorded' NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT domain_events_audience_check CHECK (audience IN ('customer', 'personnel', 'management', 'mixed')),
  CONSTRAINT domain_events_dispatch_status_check CHECK (dispatch_status IN ('recorded', 'queued', 'dispatched', 'failed'))
);

CREATE INDEX IF NOT EXISTS domain_events_tenant_created_idx ON domain_events(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS domain_events_event_key_idx ON domain_events(event_key);
CREATE INDEX IF NOT EXISTS domain_events_aggregate_idx ON domain_events(aggregate_type, aggregate_id);

CREATE OR REPLACE FUNCTION public.current_user_tenant_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT COALESCE(array_agg(DISTINCT tenant_id), ARRAY[]::uuid[])
  FROM (
    SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() AND status = 'active'
    UNION
    SELECT tenant_id FROM customer_users WHERE user_id = auth.uid() AND status = 'active'
    UNION
    SELECT tenant_id FROM personnel WHERE user_id = auth.uid() AND is_active = true
  ) scoped_tenants;
$$;

REVOKE ALL ON FUNCTION public.current_user_tenant_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_tenant_ids() TO authenticated;

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE domain_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tenants' AND policyname = 'tenants_member_read'
  ) THEN
    CREATE POLICY tenants_member_read ON tenants
      FOR SELECT TO authenticated
      USING (id = ANY(public.current_user_tenant_ids()) OR is_management());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tenant_users' AND policyname = 'tenant_users_self_or_management'
  ) THEN
    CREATE POLICY tenant_users_self_or_management ON tenant_users
      FOR SELECT TO authenticated
      USING (user_id = auth.uid() OR is_management());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'customer_users' AND policyname = 'customer_users_self_or_management'
  ) THEN
    CREATE POLICY customer_users_self_or_management ON customer_users
      FOR SELECT TO authenticated
      USING (
        (
          status IN ('active', 'invited')
          AND (
            user_id = auth.uid()
            OR lower(email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
          )
        )
        OR is_management()
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'customer_users' AND policyname = 'customer_users_management_write'
  ) THEN
    CREATE POLICY customer_users_management_write ON customer_users
      FOR ALL TO authenticated
      USING (is_management())
      WITH CHECK (is_management());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'domain_events' AND policyname = 'domain_events_management_read'
  ) THEN
    CREATE POLICY domain_events_management_read ON domain_events
      FOR SELECT TO authenticated
      USING (is_management());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'domain_events' AND policyname = 'domain_events_management_insert'
  ) THEN
    CREATE POLICY domain_events_management_insert ON domain_events
      FOR INSERT TO authenticated
      WITH CHECK (
        is_management()
        OR (
          actor_user_id = auth.uid()
          AND tenant_id = ANY(public.current_user_tenant_ids())
        )
      );
  END IF;
END $$;

GRANT SELECT ON tenants TO authenticated;
GRANT SELECT ON tenant_users TO authenticated;
GRANT SELECT, INSERT, UPDATE ON customer_users TO authenticated;
GRANT SELECT, INSERT ON domain_events TO authenticated;

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
    'customer_assignment_requested',
    'planning',
    'management',
    'Nieuwe aanvraag: {{title}}',
    'Er is een nieuwe aanvraag ontvangen voor {{objectName}}.',
    false,
    false,
    true,
    'Nieuwe aanvraag: {{title}}',
    'Er is een nieuwe aanvraag ontvangen via het klantportaal.',
    '<h2>Nieuwe aanvraag ontvangen</h2><p>Er is een nieuwe aanvraag ontvangen voor <strong>{{objectName}}</strong>.</p><p>Sector: {{sectorName}}<br>Gewenst tijdvak: {{scheduledDate}} {{scheduledStart}} - {{scheduledEnd}}</p>',
    'Nieuwe aanvraag',
    '{{title}} voor {{objectName}}',
    '["title", "objectName", "sectorName", "scheduledDate", "scheduledStart", "scheduledEnd", "priority"]'::jsonb
  ),
  (
    'quote_sent_to_customer',
    'quotes',
    'customer',
    'Offerte {{quoteNumber}} staat klaar',
    'Er staat een nieuwe offerte klaar in het klantportaal.',
    true,
    true,
    true,
    'Offerte {{quoteNumber}} staat klaar',
    'Bekijk en beoordeel de offerte in het klantportaal.',
    '<h2>Uw offerte staat klaar</h2><p>Beste klant,</p><p>Offerte <strong>{{quoteNumber}}</strong> staat klaar in het klantportaal.</p><p>Bedrag: {{amount}}<br>Geldig tot: {{validityDate}}</p>',
    'Offerte staat klaar',
    'Offerte {{quoteNumber}} staat klaar om te beoordelen.',
    '["quoteNumber", "amount", "validityDate", "href"]'::jsonb
  ),
  (
    'quote_approved_by_customer',
    'quotes',
    'management',
    'Offerte geaccepteerd',
    'Een klant heeft een offerte geaccepteerd. De opdracht is nu planbaar.',
    false,
    false,
    true,
    'Offerte geaccepteerd',
    'Een klant heeft een offerte geaccepteerd.',
    '<h2>Offerte geaccepteerd</h2><p>Een klant heeft een offerte geaccepteerd. De opdracht is nu planbaar.</p>',
    'Offerte geaccepteerd',
    'De opdracht is nu planbaar.',
    '["assignmentId", "quoteId", "nextAssignmentStatus"]'::jsonb
  ),
  (
    'quote_rejected_by_customer',
    'quotes',
    'management',
    'Offerte afgewezen',
    'Een klant heeft een offerte afgewezen.',
    false,
    false,
    true,
    'Offerte afgewezen',
    'Een klant heeft een offerte afgewezen.',
    '<h2>Offerte afgewezen</h2><p>Een klant heeft een offerte afgewezen.</p><p>Reden: {{reason}}</p>',
    'Offerte afgewezen',
    'Een offerte is afgewezen door de klant.',
    '["assignmentId", "quoteId", "reason", "nextAssignmentStatus"]'::jsonb
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

-- Storage buckets and policies. Server actions may still use service_role for
-- signed URLs, but these policies make browser-side upload/read surfaces explicit.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES
      (
        'documents',
        'documents',
        false,
        52428800,
        ARRAY[
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'image/jpeg',
          'image/png',
          'image/webp'
        ]::text[]
      ),
      (
        'org-assets',
        'org-assets',
        true,
        3145728,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']::text[]
      ),
      (
        'assignment-photos',
        'assignment-photos',
        false,
        26214400,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']::text[]
      )
    ON CONFLICT (id) DO UPDATE
      SET public = excluded.public,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  END IF;

  IF to_regclass('storage.objects') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'org_assets_public_read'
    ) THEN
      EXECUTE 'CREATE POLICY org_assets_public_read ON storage.objects
        FOR SELECT TO anon, authenticated
        USING (bucket_id = ''org-assets'')';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'org_assets_management_write'
    ) THEN
      EXECUTE 'CREATE POLICY org_assets_management_write ON storage.objects
        FOR ALL TO authenticated
        USING (bucket_id = ''org-assets'' AND is_management())
        WITH CHECK (bucket_id = ''org-assets'' AND is_management())';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'documents_management_all'
    ) THEN
      EXECUTE 'CREATE POLICY documents_management_all ON storage.objects
        FOR ALL TO authenticated
        USING (bucket_id = ''documents'' AND is_management())
        WITH CHECK (bucket_id = ''documents'' AND is_management())';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'assignment_photos_management_all'
    ) THEN
      EXECUTE 'CREATE POLICY assignment_photos_management_all ON storage.objects
        FOR ALL TO authenticated
        USING (bucket_id = ''assignment-photos'' AND is_management())
        WITH CHECK (bucket_id = ''assignment-photos'' AND is_management())';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'assignment_photos_assigned_personnel'
    ) THEN
      EXECUTE 'CREATE POLICY assignment_photos_assigned_personnel ON storage.objects
        FOR SELECT TO authenticated
        USING (
          bucket_id = ''assignment-photos''
          AND EXISTS (
            SELECT 1
            FROM assignment_personnel ap
            JOIN personnel p ON p.id = ap.personnel_id
            WHERE ap.assignment_id::text = (storage.foldername(name))[1]
              AND p.user_id = auth.uid()
              AND p.is_active = true
          )
        )';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'assignment_photos_assigned_personnel_insert'
    ) THEN
      EXECUTE 'CREATE POLICY assignment_photos_assigned_personnel_insert ON storage.objects
        FOR INSERT TO authenticated
        WITH CHECK (
          bucket_id = ''assignment-photos''
          AND EXISTS (
            SELECT 1
            FROM assignment_personnel ap
            JOIN personnel p ON p.id = ap.personnel_id
            WHERE ap.assignment_id::text = (storage.foldername(name))[1]
              AND p.user_id = auth.uid()
              AND p.is_active = true
          )
        )';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'assignment_photos_assigned_personnel_delete'
    ) THEN
      EXECUTE 'CREATE POLICY assignment_photos_assigned_personnel_delete ON storage.objects
        FOR DELETE TO authenticated
        USING (
          bucket_id = ''assignment-photos''
          AND EXISTS (
            SELECT 1
            FROM assignment_personnel ap
            JOIN personnel p ON p.id = ap.personnel_id
            WHERE ap.assignment_id::text = (storage.foldername(name))[1]
              AND p.user_id = auth.uid()
              AND p.is_active = true
          )
        )';
    END IF;
  END IF;
END $$;
