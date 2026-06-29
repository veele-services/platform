-- Customer portal preferences and multi-invoice Mollie payment batches.

CREATE TABLE IF NOT EXISTS customer_portal_preferences (
  customer_id uuid PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  email_notifications boolean DEFAULT true NOT NULL,
  invoice_emails boolean DEFAULT true NOT NULL,
  quote_emails boolean DEFAULT true NOT NULL,
  report_emails boolean DEFAULT true NOT NULL,
  service_update_emails boolean DEFAULT true NOT NULL,
  marketing_emails boolean DEFAULT false NOT NULL,
  push_notifications boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS customer_payment_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  mollie_payment_id varchar(50) NOT NULL UNIQUE,
  amount_cents integer NOT NULL,
  currency varchar(3) DEFAULT 'EUR' NOT NULL,
  status varchar(20) DEFAULT 'open' NOT NULL,
  checkout_url text,
  paid_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT customer_payment_batches_status_check CHECK (
    status IN ('open', 'paid', 'canceled', 'expired', 'failed')
  )
);

CREATE INDEX IF NOT EXISTS customer_payment_batches_customer_created_idx
  ON customer_payment_batches(customer_id, created_at);
CREATE INDEX IF NOT EXISTS customer_payment_batches_mollie_idx
  ON customer_payment_batches(mollie_payment_id);

CREATE TABLE IF NOT EXISTS customer_payment_batch_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  batch_id uuid NOT NULL REFERENCES customer_payment_batches(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT customer_payment_batch_items_unique UNIQUE (batch_id, invoice_id)
);

CREATE INDEX IF NOT EXISTS customer_payment_batch_items_batch_idx
  ON customer_payment_batch_items(batch_id);
CREATE INDEX IF NOT EXISTS customer_payment_batch_items_invoice_idx
  ON customer_payment_batch_items(invoice_id);

ALTER TABLE customer_portal_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_payment_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_payment_batch_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'customer_portal_preferences'
      AND policyname = 'customer_portal_preferences_management'
  ) THEN
    CREATE POLICY customer_portal_preferences_management
      ON customer_portal_preferences
      TO authenticated
      USING (is_management())
      WITH CHECK (is_management());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'customer_portal_preferences'
      AND policyname = 'customer_portal_preferences_own'
  ) THEN
    CREATE POLICY customer_portal_preferences_own
      ON customer_portal_preferences
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM customers c
          WHERE c.id = customer_portal_preferences.customer_id
            AND lower(c.contact_email) = lower((SELECT auth.jwt() ->> 'email'))
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM customers c
          WHERE c.id = customer_portal_preferences.customer_id
            AND lower(c.contact_email) = lower((SELECT auth.jwt() ->> 'email'))
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'customer_payment_batches'
      AND policyname = 'customer_payment_batches_management'
  ) THEN
    CREATE POLICY customer_payment_batches_management
      ON customer_payment_batches
      TO authenticated
      USING (is_management())
      WITH CHECK (is_management());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'customer_payment_batches'
      AND policyname = 'customer_payment_batches_own'
  ) THEN
    CREATE POLICY customer_payment_batches_own
      ON customer_payment_batches
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM customers c
          WHERE c.id = customer_payment_batches.customer_id
            AND lower(c.contact_email) = lower((SELECT auth.jwt() ->> 'email'))
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM customers c
          WHERE c.id = customer_payment_batches.customer_id
            AND lower(c.contact_email) = lower((SELECT auth.jwt() ->> 'email'))
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'customer_payment_batch_items'
      AND policyname = 'customer_payment_batch_items_management'
  ) THEN
    CREATE POLICY customer_payment_batch_items_management
      ON customer_payment_batch_items
      TO authenticated
      USING (is_management())
      WITH CHECK (is_management());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'customer_payment_batch_items'
      AND policyname = 'customer_payment_batch_items_own'
  ) THEN
    CREATE POLICY customer_payment_batch_items_own
      ON customer_payment_batch_items
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM customer_payment_batches b
          JOIN customers c ON c.id = b.customer_id
          WHERE b.id = customer_payment_batch_items.batch_id
            AND lower(c.contact_email) = lower((SELECT auth.jwt() ->> 'email'))
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM customer_payment_batches b
          JOIN customers c ON c.id = b.customer_id
          WHERE b.id = customer_payment_batch_items.batch_id
            AND lower(c.contact_email) = lower((SELECT auth.jwt() ->> 'email'))
        )
      );
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON customer_portal_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON customer_payment_batches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON customer_payment_batch_items TO authenticated;
