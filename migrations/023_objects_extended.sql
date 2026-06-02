-- Migration 023: Extend objects table + new object_contacts + object_personnel tables
-- Run manually in Supabase SQL Editor

-- ─── 1. Extend objects table ─────────────────────────────────────────────────

ALTER TABLE objects
  ADD COLUMN IF NOT EXISTS contact_name        varchar(200),
  ADD COLUMN IF NOT EXISTS contact_function    varchar(100),
  ADD COLUMN IF NOT EXISTS contact_phone       varchar(50),
  ADD COLUMN IF NOT EXISTS contact_email       varchar(255),
  ADD COLUMN IF NOT EXISTS service_type        varchar(100),
  ADD COLUMN IF NOT EXISTS access_info         text,
  ADD COLUMN IF NOT EXISTS key_info            text,
  ADD COLUMN IF NOT EXISTS alarm_info          text,
  ADD COLUMN IF NOT EXISTS fixed_instructions  text,
  ADD COLUMN IF NOT EXISTS special_notes       text,
  ADD COLUMN IF NOT EXISTS required_roles      jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS required_certificates jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ─── 2. object_contacts table (multiple contacts per object) ──────────────────

CREATE TABLE IF NOT EXISTS object_contacts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id   uuid NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  first_name  varchar(100) NOT NULL,
  last_name   varchar(100) NOT NULL,
  function    varchar(100),
  phone       varchar(50),
  email       varchar(255),
  is_primary  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_object_contacts_object_id ON object_contacts(object_id);

-- ─── 3. object_personnel junction table ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS object_personnel (
  object_id    uuid NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  personnel_id uuid NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
  linked_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (object_id, personnel_id)
);

CREATE INDEX IF NOT EXISTS idx_object_personnel_object_id    ON object_personnel(object_id);
CREATE INDEX IF NOT EXISTS idx_object_personnel_personnel_id ON object_personnel(personnel_id);

-- ─── 4. RLS policies for new tables ──────────────────────────────────────────

ALTER TABLE object_contacts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_personnel ENABLE ROW LEVEL SECURITY;

CREATE POLICY "object_contacts_management_all" ON object_contacts
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND r.name IN ('Management', 'Administration', 'Planning', 'Support')
    )
  );

CREATE POLICY "object_personnel_management_all" ON object_personnel
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND r.name IN ('Management', 'Administration', 'Planning', 'Support')
    )
  );

-- ─── 5. updated_at trigger for object_contacts ────────────────────────────────

CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_object_contacts_updated_at ON object_contacts;
CREATE TRIGGER trg_object_contacts_updated_at
  BEFORE UPDATE ON object_contacts
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
