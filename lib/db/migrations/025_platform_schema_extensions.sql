-- ============================================================================
-- Platform schema extensions used by the backoffice, customer PWA, personnel
-- PWA and API server.
--
-- This migration is intentionally idempotent because staging/production may
-- already contain part of this schema from the pre-baseline period.
-- ============================================================================

-- Customer classification lookup.
CREATE TABLE IF NOT EXISTS customer_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid,
  name varchar(100) NOT NULL,
  slug varchar(100) NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- CRM fields on customers.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS legal_entity varchar(255);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS vat_number varchar(50);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS chamber_of_commerce_number varchar(50);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS website varchar(255);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS mobile varchar(50);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_type_id uuid;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS status varchar(20) DEFAULT 'active' NOT NULL;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS account_manager_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_customer_type_id_customer_types_id_fk'
  ) THEN
    ALTER TABLE customers
      ADD CONSTRAINT customers_customer_type_id_customer_types_id_fk
      FOREIGN KEY (customer_type_id) REFERENCES customer_types(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Multiple contacts per customer.
CREATE TABLE IF NOT EXISTS customer_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  first_name varchar(100) NOT NULL,
  last_name varchar(100) NOT NULL,
  function varchar(100),
  email varchar(255),
  phone varchar(50),
  mobile varchar(50),
  preferred_comm varchar(20),
  is_emergency_contact boolean DEFAULT false NOT NULL,
  is_primary boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Extended object/service-location details.
ALTER TABLE objects ADD COLUMN IF NOT EXISTS service_type varchar(100);
ALTER TABLE objects ADD COLUMN IF NOT EXISTS access_info text;
ALTER TABLE objects ADD COLUMN IF NOT EXISTS key_info text;
ALTER TABLE objects ADD COLUMN IF NOT EXISTS alarm_info text;
ALTER TABLE objects ADD COLUMN IF NOT EXISTS fixed_instructions text;
ALTER TABLE objects ADD COLUMN IF NOT EXISTS special_notes text;
ALTER TABLE objects ADD COLUMN IF NOT EXISTS required_roles jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE objects ADD COLUMN IF NOT EXISTS required_certificates jsonb DEFAULT '[]'::jsonb NOT NULL;

-- Contacts and preferred personnel links per object.
CREATE TABLE IF NOT EXISTS object_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  object_id uuid NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  first_name varchar(100) NOT NULL,
  last_name varchar(100) NOT NULL,
  function varchar(100),
  phone varchar(50),
  email varchar(255),
  is_primary boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS object_personnel (
  object_id uuid NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  personnel_id uuid NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
  linked_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (object_id, personnel_id)
);

-- Extended personnel fields used by planning and profile screens.
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS personnel_type varchar(20);
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS emergency_available boolean DEFAULT false NOT NULL;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS preferred_regions jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS contract_info jsonb;

-- Payment reminder deduplication.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS last_reminder_sent_at timestamp with time zone;

-- Extra work and photos for personnel/customer report flows.
CREATE TABLE IF NOT EXISTS assignment_extra_work (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  task_code_id uuid REFERENCES task_codes(id) ON DELETE SET NULL,
  task_code_name varchar(200),
  description text NOT NULL,
  hours numeric(5, 2),
  price numeric(10, 2),
  created_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS assignment_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  extra_work_id uuid REFERENCES assignment_extra_work(id) ON DELETE SET NULL,
  storage_path text NOT NULL,
  uploaded_by uuid NOT NULL,
  is_approved boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Indexes for the new operational screens.
CREATE INDEX IF NOT EXISTS idx_customers_customer_type_id ON customers(customer_type_id);
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
CREATE INDEX IF NOT EXISTS idx_customer_contacts_customer_id ON customer_contacts(customer_id);
CREATE INDEX IF NOT EXISTS idx_objects_service_type ON objects(service_type);
CREATE INDEX IF NOT EXISTS idx_object_contacts_object_id ON object_contacts(object_id);
CREATE INDEX IF NOT EXISTS idx_object_personnel_personnel_id ON object_personnel(personnel_id);
CREATE INDEX IF NOT EXISTS idx_personnel_personnel_type ON personnel(personnel_type);
CREATE INDEX IF NOT EXISTS idx_invoices_last_reminder_sent_at ON invoices(last_reminder_sent_at);
CREATE INDEX IF NOT EXISTS idx_assignment_extra_work_assignment_id ON assignment_extra_work(assignment_id);
CREATE INDEX IF NOT EXISTS idx_assignment_photos_assignment_id ON assignment_photos(assignment_id);
CREATE INDEX IF NOT EXISTS idx_assignment_photos_extra_work_id ON assignment_photos(extra_work_id);

-- Enable RLS for new public tables. Application server-side DB access uses the
-- privileged database connection; browser/Data API access stays closed unless
-- explicit policies grant rows.
ALTER TABLE customer_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_personnel ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_extra_work ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_photos ENABLE ROW LEVEL SECURITY;

-- Management users may manage the new tables through authenticated Data API
-- contexts if needed. Server-side backoffice access remains authoritative.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'customer_types' AND policyname = 'customer_types_select_authenticated') THEN
    CREATE POLICY customer_types_select_authenticated ON customer_types FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'customer_types' AND policyname = 'customer_types_management') THEN
    CREATE POLICY customer_types_management ON customer_types TO authenticated USING (is_management()) WITH CHECK (is_management());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'customer_contacts' AND policyname = 'customer_contacts_management') THEN
    CREATE POLICY customer_contacts_management ON customer_contacts TO authenticated USING (is_management()) WITH CHECK (is_management());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'object_contacts' AND policyname = 'object_contacts_management') THEN
    CREATE POLICY object_contacts_management ON object_contacts TO authenticated USING (is_management()) WITH CHECK (is_management());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'object_personnel' AND policyname = 'object_personnel_management') THEN
    CREATE POLICY object_personnel_management ON object_personnel TO authenticated USING (is_management()) WITH CHECK (is_management());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'assignment_extra_work' AND policyname = 'assignment_extra_work_management') THEN
    CREATE POLICY assignment_extra_work_management ON assignment_extra_work TO authenticated USING (is_management()) WITH CHECK (is_management());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'assignment_photos' AND policyname = 'assignment_photos_management') THEN
    CREATE POLICY assignment_photos_management ON assignment_photos TO authenticated USING (is_management()) WITH CHECK (is_management());
  END IF;
END $$;
