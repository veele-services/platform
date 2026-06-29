-- ============================================================================
-- Native push device tokens.
--
-- Browser/PWA push blijft via push_subscriptions lopen. Deze tabel is alleen
-- voor Capacitor/native apps die FCM device tokens registreren.
-- ============================================================================

CREATE TABLE IF NOT EXISTS native_push_device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid DEFAULT '00000000-0000-0000-0000-000000000010' NOT NULL
    REFERENCES tenants(id) ON DELETE CASCADE,
  owner_type varchar(20) NOT NULL,
  personnel_id uuid REFERENCES personnel(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE,
  user_id uuid,
  provider varchar(30) DEFAULT 'fcm' NOT NULL,
  platform varchar(30) DEFAULT 'android' NOT NULL,
  token text NOT NULL,
  app_id varchar(160),
  app_version varchar(80),
  device_id varchar(160),
  device_model varchar(160),
  user_agent text,
  is_active boolean DEFAULT true NOT NULL,
  last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT native_push_device_tokens_owner_type_check
    CHECK (owner_type IN ('personnel', 'customer')),
  CONSTRAINT native_push_device_tokens_provider_check
    CHECK (provider IN ('fcm')),
  CONSTRAINT native_push_device_tokens_platform_check
    CHECK (platform IN ('android', 'ios')),
  CONSTRAINT native_push_device_tokens_owner_check CHECK (
    (owner_type = 'personnel' AND personnel_id IS NOT NULL AND customer_id IS NULL)
    OR
    (owner_type = 'customer' AND customer_id IS NOT NULL AND personnel_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS native_push_device_tokens_token_unique
  ON native_push_device_tokens(token);

CREATE INDEX IF NOT EXISTS native_push_device_tokens_personnel_idx
  ON native_push_device_tokens(personnel_id, is_active);

CREATE INDEX IF NOT EXISTS native_push_device_tokens_customer_idx
  ON native_push_device_tokens(customer_id, is_active);

CREATE INDEX IF NOT EXISTS native_push_device_tokens_user_idx
  ON native_push_device_tokens(user_id, is_active);

CREATE INDEX IF NOT EXISTS native_push_device_tokens_tenant_provider_idx
  ON native_push_device_tokens(tenant_id, provider, is_active);

ALTER TABLE native_push_device_tokens ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'native_push_device_tokens'
      AND policyname = 'native_push_device_tokens_management'
  ) THEN
    CREATE POLICY native_push_device_tokens_management
      ON native_push_device_tokens
      TO authenticated
      USING (is_management())
      WITH CHECK (is_management());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'native_push_device_tokens'
      AND policyname = 'native_push_device_tokens_personnel_own'
  ) THEN
    CREATE POLICY native_push_device_tokens_personnel_own
      ON native_push_device_tokens
      TO authenticated
      USING (
        owner_type = 'personnel'
        AND EXISTS (
          SELECT 1 FROM personnel p
          WHERE p.id = native_push_device_tokens.personnel_id
            AND p.user_id = (SELECT auth.uid())
        )
      )
      WITH CHECK (
        owner_type = 'personnel'
        AND EXISTS (
          SELECT 1 FROM personnel p
          WHERE p.id = native_push_device_tokens.personnel_id
            AND p.user_id = (SELECT auth.uid())
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'native_push_device_tokens'
      AND policyname = 'native_push_device_tokens_customer_own'
  ) THEN
    CREATE POLICY native_push_device_tokens_customer_own
      ON native_push_device_tokens
      TO authenticated
      USING (
        owner_type = 'customer'
        AND EXISTS (
          SELECT 1
          FROM customer_users cu
          WHERE cu.customer_id = native_push_device_tokens.customer_id
            AND cu.user_id = (SELECT auth.uid())
            AND cu.status = 'active'
        )
      )
      WITH CHECK (
        owner_type = 'customer'
        AND EXISTS (
          SELECT 1
          FROM customer_users cu
          WHERE cu.customer_id = native_push_device_tokens.customer_id
            AND cu.user_id = (SELECT auth.uid())
            AND cu.status = 'active'
        )
      );
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON native_push_device_tokens TO authenticated;
