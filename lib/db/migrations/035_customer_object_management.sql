-- ============================================================================
-- Customer object management
--
-- Lets customer portal accounts create and maintain their own service objects.
-- Also installs the object code trigger that the application schema already
-- expects, so inserts never depend on application-generated object codes.
-- ============================================================================

CREATE SEQUENCE IF NOT EXISTS objects_code_seq;

DO $$
DECLARE
  max_code integer;
BEGIN
  SELECT COALESCE(MAX((substring(code from '^OBJ-([0-9]+)$'))::integer), 0)
    INTO max_code
  FROM objects
  WHERE code ~ '^OBJ-[0-9]+$';

  IF max_code > 0 THEN
    PERFORM setval('objects_code_seq', max_code, true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION set_object_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.code IS NULL OR btrim(NEW.code) = '' THEN
    NEW.code := 'OBJ-' || lpad(nextval('objects_code_seq')::text, 5, '0');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_objects_set_code ON objects;
CREATE TRIGGER trg_objects_set_code
  BEFORE INSERT ON objects
  FOR EACH ROW
  EXECUTE FUNCTION set_object_code();

GRANT USAGE, SELECT ON SEQUENCE objects_code_seq TO authenticated;
GRANT SELECT, INSERT, UPDATE ON objects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON object_contacts TO authenticated;

ALTER TABLE objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_contacts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_object_contacts_is_primary ON object_contacts(object_id, is_primary);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'customers'
      AND policyname = 'customers_select_own_email_ci'
  ) THEN
    CREATE POLICY customers_select_own_email_ci
      ON customers
      FOR SELECT
      TO authenticated
      USING (lower(contact_email) = lower(auth.jwt() ->> 'email'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'objects'
      AND policyname = 'objects_select_customer_email_ci'
  ) THEN
    CREATE POLICY objects_select_customer_email_ci
      ON objects
      FOR SELECT
      TO authenticated
      USING (
        customer_id IN (
          SELECT id
          FROM customers
          WHERE lower(contact_email) = lower(auth.jwt() ->> 'email')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'objects'
      AND policyname = 'objects_insert_customer'
  ) THEN
    CREATE POLICY objects_insert_customer
      ON objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        customer_id IN (
          SELECT id
          FROM customers
          WHERE lower(contact_email) = lower(auth.jwt() ->> 'email')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'objects'
      AND policyname = 'objects_update_customer'
  ) THEN
    CREATE POLICY objects_update_customer
      ON objects
      FOR UPDATE
      TO authenticated
      USING (
        customer_id IN (
          SELECT id
          FROM customers
          WHERE lower(contact_email) = lower(auth.jwt() ->> 'email')
        )
      )
      WITH CHECK (
        customer_id IN (
          SELECT id
          FROM customers
          WHERE lower(contact_email) = lower(auth.jwt() ->> 'email')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'object_contacts'
      AND policyname = 'object_contacts_select_customer'
  ) THEN
    CREATE POLICY object_contacts_select_customer
      ON object_contacts
      FOR SELECT
      TO authenticated
      USING (
        object_id IN (
          SELECT objects.id
          FROM objects
          JOIN customers ON customers.id = objects.customer_id
          WHERE lower(customers.contact_email) = lower(auth.jwt() ->> 'email')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'object_contacts'
      AND policyname = 'object_contacts_insert_customer'
  ) THEN
    CREATE POLICY object_contacts_insert_customer
      ON object_contacts
      FOR INSERT
      TO authenticated
      WITH CHECK (
        object_id IN (
          SELECT objects.id
          FROM objects
          JOIN customers ON customers.id = objects.customer_id
          WHERE lower(customers.contact_email) = lower(auth.jwt() ->> 'email')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'object_contacts'
      AND policyname = 'object_contacts_update_customer'
  ) THEN
    CREATE POLICY object_contacts_update_customer
      ON object_contacts
      FOR UPDATE
      TO authenticated
      USING (
        object_id IN (
          SELECT objects.id
          FROM objects
          JOIN customers ON customers.id = objects.customer_id
          WHERE lower(customers.contact_email) = lower(auth.jwt() ->> 'email')
        )
      )
      WITH CHECK (
        object_id IN (
          SELECT objects.id
          FROM objects
          JOIN customers ON customers.id = objects.customer_id
          WHERE lower(customers.contact_email) = lower(auth.jwt() ->> 'email')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'object_contacts'
      AND policyname = 'object_contacts_delete_customer'
  ) THEN
    CREATE POLICY object_contacts_delete_customer
      ON object_contacts
      FOR DELETE
      TO authenticated
      USING (
        object_id IN (
          SELECT objects.id
          FROM objects
          JOIN customers ON customers.id = objects.customer_id
          WHERE lower(customers.contact_email) = lower(auth.jwt() ->> 'email')
        )
      );
  END IF;
END $$;
