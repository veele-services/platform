-- ============================================================================
-- Material and inventory management foundation
--
-- Phase 1 foundation migration:
-- - adds materials and inventory modules;
-- - seeds canonical permissions;
-- - adds tenant-safe sequence, material, stock and inventory tables;
-- - extends assignment_material_usage without removing legacy columns;
-- - backfills assignment material tenant_id from assignments;
-- - enables RLS skeleton policies for the new runtime tables.
--
-- Staging-safe: no existing data is deleted or reset.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Modules and entitlements
-- ---------------------------------------------------------------------------

INSERT INTO modules (key, name, description, category, is_system, is_enabled_by_default)
VALUES
  ('materials', 'Materiaalbeheer', 'Productcatalogus, voorraad en materiaalverbruik op werkbonnen.', 'operations', true, true),
  ('inventory', 'Inventarisbeheer', 'Unieke bedrijfsmiddelen, QR-codes, locatie, storingen en onderhoud.', 'operations', true, true)
ON CONFLICT (key) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    is_system = true,
    is_enabled_by_default = true,
    updated_at = now();

INSERT INTO plan_modules (plan_id, module_id, is_included)
SELECT plans.id, modules.id, true
FROM plans
JOIN modules ON modules.key IN ('materials', 'inventory')
ON CONFLICT (plan_id, module_id) DO UPDATE
SET is_included = true,
    updated_at = now();

INSERT INTO tenant_modules (tenant_id, module_id, is_enabled, source, enabled_at, disabled_at)
SELECT tenants.id,
       modules.id,
       true,
       'system',
       now(),
       NULL::timestamptz
FROM tenants
JOIN modules ON modules.key IN ('materials', 'inventory')
ON CONFLICT (tenant_id, module_id) DO UPDATE
SET is_enabled = true,
    source = CASE
      WHEN tenant_modules.is_enabled = true THEN tenant_modules.source
      ELSE 'system'
    END,
    enabled_at = COALESCE(tenant_modules.enabled_at, now()),
    disabled_at = NULL,
    updated_at = now();

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

INSERT INTO permissions (resource, action, description)
VALUES
  ('materials', 'view', 'Materiaal bekijken.'),
  ('materials', 'manage', 'Materiaalbeheer volledig beheren.'),
  ('materials', 'create', 'Materiaalproducten aanmaken.'),
  ('materials', 'update', 'Materiaalproducten wijzigen.'),
  ('materials', 'archive', 'Materiaalproducten archiveren.'),
  ('materials', 'view_stock', 'Materiaalvoorraad bekijken.'),
  ('materials', 'adjust_stock', 'Materiaalvoorraad corrigeren.'),
  ('materials', 'transfer_stock', 'Materiaalvoorraad verplaatsen.'),
  ('materials', 'view_costs', 'Kostprijzen van materiaal bekijken.'),
  ('materials', 'view_sale_prices', 'Verkoopprijzen van materiaal bekijken.'),
  ('materials', 'use_on_assignment', 'Materiaal registreren op werkbonnen.'),
  ('materials', 'approve_usage', 'Materiaalverbruik tijdens bon-goedkeuring goedkeuren.'),
  ('materials', 'invoice_usage', 'Materiaalverbruik factureerbaar maken.'),
  ('inventory', 'view', 'Inventaris bekijken.'),
  ('inventory', 'manage', 'Inventarisbeheer volledig beheren.'),
  ('inventory', 'create', 'Inventarisitems aanmaken.'),
  ('inventory', 'update', 'Inventarisitems wijzigen.'),
  ('inventory', 'archive', 'Inventarisitems archiveren.'),
  ('inventory', 'assign_to_object', 'Inventaris aan objecten koppelen.'),
  ('inventory', 'assign_to_personnel', 'Inventaris aan personeel koppelen.'),
  ('inventory', 'transfer', 'Inventaris verplaatsen.'),
  ('inventory', 'generate_qr', 'Inventaris QR-codes genereren.'),
  ('inventory', 'view_costs', 'Inventariswaarden en kosten bekijken.'),
  ('inventory', 'scan', 'Inventaris QR-codes scannen.'),
  ('inventory', 'report_issue', 'Inventarisstoringen melden.'),
  ('inventory', 'resolve_issue', 'Inventarisstoringen oplossen.'),
  ('inventory', 'view_maintenance', 'Inventarisonderhoud bekijken.'),
  ('inventory', 'manage_maintenance', 'Inventarisonderhoud beheren.'),
  ('inventory', 'approve_billing', 'Inventarisgebruik of verhuur goedkeuren voor facturatie.'),
  ('inventory', 'invoice_usage', 'Inventarisgebruik of verhuur factureerbaar maken.')
ON CONFLICT (resource, action) DO UPDATE
SET description = EXCLUDED.description;

-- ---------------------------------------------------------------------------
-- Tenant sequence foundation for M00001 and I000001 codes
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tenant_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sequence_key varchar(80) NOT NULL,
  next_value integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_sequences_tenant_key_idx
  ON tenant_sequences (tenant_id, sequence_key);
CREATE INDEX IF NOT EXISTS tenant_sequences_key_idx
  ON tenant_sequences (sequence_key);

INSERT INTO tenant_sequences (tenant_id, sequence_key, next_value)
SELECT tenants.id, sequence_key, 1
FROM tenants
CROSS JOIN (VALUES ('material_code'), ('inventory_code')) AS sequence_keys(sequence_key)
ON CONFLICT (tenant_id, sequence_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Material catalog and stock foundation
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS material_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES material_categories(id) ON DELETE SET NULL,
  name varchar(160) NOT NULL,
  slug varchar(180) NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS material_categories_tenant_slug_idx
  ON material_categories (tenant_id, slug);
CREATE INDEX IF NOT EXISTS material_categories_tenant_active_idx
  ON material_categories (tenant_id, is_active);
CREATE INDEX IF NOT EXISTS material_categories_parent_idx
  ON material_categories (parent_id);

CREATE TABLE IF NOT EXISTS materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category_id uuid REFERENCES material_categories(id) ON DELETE SET NULL,
  code varchar(20) NOT NULL,
  name varchar(220) NOT NULL,
  description text,
  unit varchar(40) NOT NULL,
  cost_price numeric(12,2),
  sale_price numeric(12,2),
  vat_rate numeric(5,2),
  vat_type varchar(40),
  supplier_name varchar(220),
  supplier_item_number varchar(120),
  barcode varchar(160),
  image_document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  min_stock numeric(12,3),
  max_stock numeric(12,3),
  default_invoiceable boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS materials_tenant_code_idx
  ON materials (tenant_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS materials_tenant_barcode_idx
  ON materials (tenant_id, barcode)
  WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS materials_tenant_category_idx
  ON materials (tenant_id, category_id);
CREATE INDEX IF NOT EXISTS materials_tenant_active_idx
  ON materials (tenant_id, is_active);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'materials_prices_non_negative_check') THEN
    ALTER TABLE materials
      ADD CONSTRAINT materials_prices_non_negative_check
      CHECK (
        (cost_price IS NULL OR cost_price >= 0)
        AND (sale_price IS NULL OR sale_price >= 0)
        AND (min_stock IS NULL OR min_stock >= 0)
        AND (max_stock IS NULL OR max_stock >= 0)
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS stock_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_type varchar(40) NOT NULL,
  name varchar(220) NOT NULL,
  object_id uuid REFERENCES objects(id) ON DELETE CASCADE,
  personnel_id uuid REFERENCES personnel(id) ON DELETE CASCADE,
  vehicle_id uuid,
  warehouse_id uuid,
  office_id uuid,
  temporary_label varchar(220),
  is_active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stock_locations_tenant_type_idx
  ON stock_locations (tenant_id, location_type);
CREATE INDEX IF NOT EXISTS stock_locations_tenant_object_idx
  ON stock_locations (tenant_id, object_id);
CREATE INDEX IF NOT EXISTS stock_locations_tenant_personnel_idx
  ON stock_locations (tenant_id, personnel_id);
CREATE INDEX IF NOT EXISTS stock_locations_tenant_active_idx
  ON stock_locations (tenant_id, is_active);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_locations_type_check') THEN
    ALTER TABLE stock_locations
      ADD CONSTRAINT stock_locations_type_check
      CHECK (location_type IN ('object', 'personnel', 'vehicle', 'warehouse', 'office', 'temporary'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS material_stock_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  stock_location_id uuid NOT NULL REFERENCES stock_locations(id) ON DELETE CASCADE,
  quantity numeric(12,3) NOT NULL DEFAULT 0,
  min_stock_override numeric(12,3),
  max_stock_override numeric(12,3),
  last_movement_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS material_stock_balances_tenant_material_location_idx
  ON material_stock_balances (tenant_id, material_id, stock_location_id);
CREATE INDEX IF NOT EXISTS material_stock_balances_tenant_material_idx
  ON material_stock_balances (tenant_id, material_id);
CREATE INDEX IF NOT EXISTS material_stock_balances_tenant_location_idx
  ON material_stock_balances (tenant_id, stock_location_id);
CREATE INDEX IF NOT EXISTS material_stock_balances_tenant_quantity_idx
  ON material_stock_balances (tenant_id, quantity);

CREATE TABLE IF NOT EXISTS material_stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  from_stock_location_id uuid REFERENCES stock_locations(id) ON DELETE SET NULL,
  to_stock_location_id uuid REFERENCES stock_locations(id) ON DELETE SET NULL,
  quantity numeric(12,3) NOT NULL,
  movement_type varchar(40) NOT NULL,
  reason text,
  assignment_id uuid REFERENCES assignments(id) ON DELETE SET NULL,
  assignment_material_usage_id uuid,
  personnel_id uuid REFERENCES personnel(id) ON DELETE SET NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

CREATE INDEX IF NOT EXISTS material_stock_movements_tenant_material_created_idx
  ON material_stock_movements (tenant_id, material_id, created_at);
CREATE INDEX IF NOT EXISTS material_stock_movements_tenant_from_idx
  ON material_stock_movements (tenant_id, from_stock_location_id);
CREATE INDEX IF NOT EXISTS material_stock_movements_tenant_to_idx
  ON material_stock_movements (tenant_id, to_stock_location_id);
CREATE INDEX IF NOT EXISTS material_stock_movements_tenant_assignment_idx
  ON material_stock_movements (tenant_id, assignment_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'material_stock_movements_type_check') THEN
    ALTER TABLE material_stock_movements
      ADD CONSTRAINT material_stock_movements_type_check
      CHECK (movement_type IN ('added', 'used', 'corrected', 'transferred', 'received', 'returned', 'damaged', 'lost', 'written_off', 'used_on_assignment'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'material_stock_movements_quantity_positive_check') THEN
    ALTER TABLE material_stock_movements
      ADD CONSTRAINT material_stock_movements_quantity_positive_check
      CHECK (quantity > 0);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Assignment material usage transition columns
-- ---------------------------------------------------------------------------

ALTER TABLE assignment_material_usage ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE assignment_material_usage ADD COLUMN IF NOT EXISTS material_id uuid;
ALTER TABLE assignment_material_usage ADD COLUMN IF NOT EXISTS material_code_snapshot varchar(40);
ALTER TABLE assignment_material_usage ADD COLUMN IF NOT EXISTS registered_name text;
ALTER TABLE assignment_material_usage ADD COLUMN IF NOT EXISTS registered_quantity numeric(12,3);
ALTER TABLE assignment_material_usage ADD COLUMN IF NOT EXISTS registered_unit_label varchar(40);
ALTER TABLE assignment_material_usage ADD COLUMN IF NOT EXISTS stock_location_id uuid;
ALTER TABLE assignment_material_usage ADD COLUMN IF NOT EXISTS stock_movement_id uuid;
ALTER TABLE assignment_material_usage ADD COLUMN IF NOT EXISTS uses_stock boolean NOT NULL DEFAULT false;
ALTER TABLE assignment_material_usage ADD COLUMN IF NOT EXISTS is_other boolean NOT NULL DEFAULT false;
ALTER TABLE assignment_material_usage ADD COLUMN IF NOT EXISTS approved_name text;
ALTER TABLE assignment_material_usage ADD COLUMN IF NOT EXISTS approved_quantity numeric(12,3);
ALTER TABLE assignment_material_usage ADD COLUMN IF NOT EXISTS approved_unit_label varchar(40);
ALTER TABLE assignment_material_usage ADD COLUMN IF NOT EXISTS approved_unit_price numeric(12,2);
ALTER TABLE assignment_material_usage ADD COLUMN IF NOT EXISTS approved_vat_rate numeric(5,2);
ALTER TABLE assignment_material_usage ADD COLUMN IF NOT EXISTS invoiceable boolean NOT NULL DEFAULT false;
ALTER TABLE assignment_material_usage ADD COLUMN IF NOT EXISTS customer_visible boolean NOT NULL DEFAULT false;
ALTER TABLE assignment_material_usage ADD COLUMN IF NOT EXISTS approval_status varchar(30) NOT NULL DEFAULT 'pending';
ALTER TABLE assignment_material_usage ADD COLUMN IF NOT EXISTS approved_by uuid;
ALTER TABLE assignment_material_usage ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE assignment_material_usage ADD COLUMN IF NOT EXISTS approval_reason text;
ALTER TABLE assignment_material_usage ADD COLUMN IF NOT EXISTS invoice_id uuid;
ALTER TABLE assignment_material_usage ADD COLUMN IF NOT EXISTS photo_document_id uuid;

UPDATE assignment_material_usage usage
SET tenant_id = assignments.tenant_id,
    registered_name = COALESCE(usage.registered_name, usage.name),
    registered_quantity = COALESCE(usage.registered_quantity, usage.quantity::numeric(12,3)),
    registered_unit_label = COALESCE(usage.registered_unit_label, usage.unit_label),
    approved_name = COALESCE(usage.approved_name, usage.name),
    approved_quantity = COALESCE(usage.approved_quantity, usage.quantity::numeric(12,3)),
    approved_unit_label = COALESCE(usage.approved_unit_label, usage.unit_label),
    approved_unit_price = COALESCE(usage.approved_unit_price, usage.unit_price::numeric(12,2)),
    is_other = COALESCE(usage.is_other, usage.material_id IS NULL)
FROM assignments
WHERE usage.assignment_id = assignments.id
  AND (
    usage.tenant_id IS NULL
    OR usage.registered_name IS NULL
    OR usage.registered_quantity IS NULL
    OR usage.approved_name IS NULL
    OR usage.approved_quantity IS NULL
    OR usage.approved_unit_price IS NULL
  );

CREATE INDEX IF NOT EXISTS assignment_material_usage_tenant_idx
  ON assignment_material_usage (tenant_id);
CREATE INDEX IF NOT EXISTS assignment_material_usage_tenant_assignment_idx
  ON assignment_material_usage (tenant_id, assignment_id);
CREATE INDEX IF NOT EXISTS assignment_material_usage_tenant_material_idx
  ON assignment_material_usage (tenant_id, material_id);
CREATE INDEX IF NOT EXISTS assignment_material_usage_tenant_approval_idx
  ON assignment_material_usage (tenant_id, approval_status);
CREATE INDEX IF NOT EXISTS assignment_material_usage_stock_location_idx
  ON assignment_material_usage (tenant_id, stock_location_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignment_material_usage_tenant_fk') THEN
    ALTER TABLE assignment_material_usage
      ADD CONSTRAINT assignment_material_usage_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignment_material_usage_material_fk') THEN
    ALTER TABLE assignment_material_usage
      ADD CONSTRAINT assignment_material_usage_material_fk
      FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE SET NULL NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignment_material_usage_stock_location_fk') THEN
    ALTER TABLE assignment_material_usage
      ADD CONSTRAINT assignment_material_usage_stock_location_fk
      FOREIGN KEY (stock_location_id) REFERENCES stock_locations(id) ON DELETE SET NULL NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignment_material_usage_stock_movement_fk') THEN
    ALTER TABLE assignment_material_usage
      ADD CONSTRAINT assignment_material_usage_stock_movement_fk
      FOREIGN KEY (stock_movement_id) REFERENCES material_stock_movements(id) ON DELETE SET NULL NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignment_material_usage_photo_document_fk') THEN
    ALTER TABLE assignment_material_usage
      ADD CONSTRAINT assignment_material_usage_photo_document_fk
      FOREIGN KEY (photo_document_id) REFERENCES documents(id) ON DELETE SET NULL NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignment_material_usage_approval_status_check') THEN
    ALTER TABLE assignment_material_usage
      ADD CONSTRAINT assignment_material_usage_approval_status_check
      CHECK (approval_status IN ('pending', 'approved', 'rejected'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignment_material_usage_tenant_required_check') THEN
    ALTER TABLE assignment_material_usage
      ADD CONSTRAINT assignment_material_usage_tenant_required_check
      CHECK (tenant_id IS NOT NULL) NOT VALID;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fieldgrid_set_assignment_material_usage_tenant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  assignment_tenant_id uuid;
  material_tenant_id uuid;
  location_tenant_id uuid;
BEGIN
  SELECT tenant_id INTO assignment_tenant_id
  FROM assignments
  WHERE id = NEW.assignment_id;

  IF assignment_tenant_id IS NULL THEN
    RAISE EXCEPTION 'assignment_material_usage assignment % does not exist', NEW.assignment_id;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := assignment_tenant_id;
  ELSIF NEW.tenant_id <> assignment_tenant_id THEN
    RAISE EXCEPTION 'assignment_material_usage tenant mismatch for assignment %', NEW.assignment_id;
  END IF;

  IF NEW.material_id IS NOT NULL THEN
    SELECT tenant_id INTO material_tenant_id FROM materials WHERE id = NEW.material_id;
    IF material_tenant_id IS NULL OR material_tenant_id <> NEW.tenant_id THEN
      RAISE EXCEPTION 'assignment_material_usage material tenant mismatch';
    END IF;
  END IF;

  IF NEW.stock_location_id IS NOT NULL THEN
    SELECT tenant_id INTO location_tenant_id FROM stock_locations WHERE id = NEW.stock_location_id;
    IF location_tenant_id IS NULL OR location_tenant_id <> NEW.tenant_id THEN
      RAISE EXCEPTION 'assignment_material_usage stock location tenant mismatch';
    END IF;
  END IF;

  NEW.registered_name := COALESCE(NEW.registered_name, NEW.name);
  NEW.registered_quantity := COALESCE(NEW.registered_quantity, NEW.quantity::numeric(12,3));
  NEW.registered_unit_label := COALESCE(NEW.registered_unit_label, NEW.unit_label);
  NEW.approved_name := COALESCE(NEW.approved_name, NEW.name);
  NEW.approved_quantity := COALESCE(NEW.approved_quantity, NEW.quantity::numeric(12,3));
  NEW.approved_unit_label := COALESCE(NEW.approved_unit_label, NEW.unit_label);
  NEW.approved_unit_price := COALESCE(NEW.approved_unit_price, NEW.unit_price::numeric(12,2));
  NEW.is_other := COALESCE(NEW.is_other, NEW.material_id IS NULL);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assignment_material_usage_set_tenant ON assignment_material_usage;
CREATE TRIGGER trg_assignment_material_usage_set_tenant
  BEFORE INSERT OR UPDATE OF assignment_id, tenant_id, material_id, stock_location_id, name, quantity, unit_label, unit_price
  ON assignment_material_usage
  FOR EACH ROW
  EXECUTE FUNCTION public.fieldgrid_set_assignment_material_usage_tenant();

-- ---------------------------------------------------------------------------
-- Inventory foundation
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS inventory_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES inventory_categories(id) ON DELETE SET NULL,
  name varchar(160) NOT NULL,
  slug varchar(180) NOT NULL,
  description text,
  default_inspection_interval_days integer,
  default_maintenance_interval_days integer,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_categories_tenant_slug_idx
  ON inventory_categories (tenant_id, slug);
CREATE INDEX IF NOT EXISTS inventory_categories_tenant_active_idx
  ON inventory_categories (tenant_id, is_active);
CREATE INDEX IF NOT EXISTS inventory_categories_parent_idx
  ON inventory_categories (parent_id);

CREATE TABLE IF NOT EXISTS inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code varchar(20) NOT NULL,
  category_id uuid REFERENCES inventory_categories(id) ON DELETE SET NULL,
  name varchar(220) NOT NULL,
  type varchar(120),
  brand varchar(120),
  model varchar(120),
  serial_number varchar(160),
  purchase_date date,
  purchase_value numeric(12,2),
  status varchar(40) NOT NULL DEFAULT 'available',
  current_stock_location_id uuid REFERENCES stock_locations(id) ON DELETE SET NULL,
  current_object_id uuid REFERENCES objects(id) ON DELETE SET NULL,
  current_personnel_id uuid REFERENCES personnel(id) ON DELETE SET NULL,
  qr_token varchar(160) NOT NULL,
  qr_generated_at timestamptz,
  image_document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  next_inspection_date date,
  last_inspection_date date,
  inspection_interval_days integer,
  maintenance_interval_days integer,
  warranty_until date,
  customer_visible boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_items_tenant_code_idx
  ON inventory_items (tenant_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_items_tenant_qr_token_idx
  ON inventory_items (tenant_id, qr_token);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_items_tenant_serial_idx
  ON inventory_items (tenant_id, serial_number)
  WHERE serial_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS inventory_items_tenant_status_idx
  ON inventory_items (tenant_id, status);
CREATE INDEX IF NOT EXISTS inventory_items_tenant_category_idx
  ON inventory_items (tenant_id, category_id);
CREATE INDEX IF NOT EXISTS inventory_items_tenant_location_idx
  ON inventory_items (tenant_id, current_stock_location_id);
CREATE INDEX IF NOT EXISTS inventory_items_tenant_object_idx
  ON inventory_items (tenant_id, current_object_id);
CREATE INDEX IF NOT EXISTS inventory_items_tenant_personnel_idx
  ON inventory_items (tenant_id, current_personnel_id);
CREATE INDEX IF NOT EXISTS inventory_items_tenant_next_inspection_idx
  ON inventory_items (tenant_id, next_inspection_date);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_items_status_check') THEN
    ALTER TABLE inventory_items
      ADD CONSTRAINT inventory_items_status_check
      CHECK (status IN ('available', 'in_use', 'assigned_to_object', 'assigned_to_personnel', 'maintenance', 'defect', 'out_of_service', 'lost', 'disposed', 'archived'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  from_stock_location_id uuid REFERENCES stock_locations(id) ON DELETE SET NULL,
  to_stock_location_id uuid REFERENCES stock_locations(id) ON DELETE SET NULL,
  movement_type varchar(40) NOT NULL,
  assignment_id uuid REFERENCES assignments(id) ON DELETE SET NULL,
  reason text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

CREATE INDEX IF NOT EXISTS inventory_movements_tenant_item_created_idx
  ON inventory_movements (tenant_id, inventory_item_id, created_at);
CREATE INDEX IF NOT EXISTS inventory_movements_tenant_to_idx
  ON inventory_movements (tenant_id, to_stock_location_id);
CREATE INDEX IF NOT EXISTS inventory_movements_tenant_assignment_idx
  ON inventory_movements (tenant_id, assignment_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_movements_type_check') THEN
    ALTER TABLE inventory_movements
      ADD CONSTRAINT inventory_movements_type_check
      CHECK (movement_type IN ('created', 'assigned_to_object', 'assigned_to_personnel', 'transferred', 'returned', 'lost', 'disposed', 'corrected'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS inventory_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES assignments(id) ON DELETE SET NULL,
  object_id uuid REFERENCES objects(id) ON DELETE SET NULL,
  personnel_id uuid REFERENCES personnel(id) ON DELETE SET NULL,
  reported_by uuid NOT NULL,
  severity varchar(20) NOT NULL DEFAULT 'normal',
  status varchar(30) NOT NULL DEFAULT 'new',
  description text NOT NULL,
  resolution_notes text,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_issues_tenant_status_idx
  ON inventory_issues (tenant_id, status);
CREATE INDEX IF NOT EXISTS inventory_issues_tenant_item_idx
  ON inventory_issues (tenant_id, inventory_item_id);
CREATE INDEX IF NOT EXISTS inventory_issues_tenant_assignment_idx
  ON inventory_issues (tenant_id, assignment_id);
CREATE INDEX IF NOT EXISTS inventory_issues_tenant_reported_by_idx
  ON inventory_issues (tenant_id, reported_by);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_issues_status_check') THEN
    ALTER TABLE inventory_issues
      ADD CONSTRAINT inventory_issues_status_check
      CHECK (status IN ('new', 'in_progress', 'waiting_supplier', 'resolved', 'unresolvable', 'cancelled'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_issues_severity_check') THEN
    ALTER TABLE inventory_issues
      ADD CONSTRAINT inventory_issues_severity_check
      CHECK (severity IN ('low', 'normal', 'high', 'urgent'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS inventory_maintenance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  event_type varchar(30) NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'scheduled',
  scheduled_at timestamptz,
  due_date date,
  performed_at timestamptz,
  performed_by uuid REFERENCES personnel(id) ON DELETE SET NULL,
  notes text,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_maintenance_tenant_item_idx
  ON inventory_maintenance_events (tenant_id, inventory_item_id);
CREATE INDEX IF NOT EXISTS inventory_maintenance_tenant_due_idx
  ON inventory_maintenance_events (tenant_id, due_date);
CREATE INDEX IF NOT EXISTS inventory_maintenance_tenant_status_idx
  ON inventory_maintenance_events (tenant_id, status);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_maintenance_event_type_check') THEN
    ALTER TABLE inventory_maintenance_events
      ADD CONSTRAINT inventory_maintenance_event_type_check
      CHECK (event_type IN ('inspection', 'maintenance', 'repair'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_maintenance_status_check') THEN
    ALTER TABLE inventory_maintenance_events
      ADD CONSTRAINT inventory_maintenance_status_check
      CHECK (status IN ('scheduled', 'due', 'completed', 'cancelled'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS assignment_inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  usage_type varchar(40) NOT NULL DEFAULT 'used',
  registered_quantity numeric(12,3),
  registered_period_label varchar(80),
  invoiceable boolean NOT NULL DEFAULT false,
  customer_visible boolean NOT NULL DEFAULT false,
  approved_quantity numeric(12,3),
  approved_unit_price numeric(12,2),
  approved_vat_rate numeric(5,2),
  approval_status varchar(30) NOT NULL DEFAULT 'pending',
  approval_reason text,
  approved_by uuid,
  approved_at timestamptz,
  attached_by uuid NOT NULL,
  attached_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

CREATE UNIQUE INDEX IF NOT EXISTS assignment_inventory_items_tenant_assignment_item_idx
  ON assignment_inventory_items (tenant_id, assignment_id, inventory_item_id);
CREATE INDEX IF NOT EXISTS assignment_inventory_items_tenant_assignment_idx
  ON assignment_inventory_items (tenant_id, assignment_id);
CREATE INDEX IF NOT EXISTS assignment_inventory_items_tenant_item_idx
  ON assignment_inventory_items (tenant_id, inventory_item_id);
CREATE INDEX IF NOT EXISTS assignment_inventory_items_tenant_approval_idx
  ON assignment_inventory_items (tenant_id, approval_status);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignment_inventory_items_usage_type_check') THEN
    ALTER TABLE assignment_inventory_items
      ADD CONSTRAINT assignment_inventory_items_usage_type_check
      CHECK (usage_type IN ('used', 'rented', 'issued', 'returned', 'defect_found'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignment_inventory_items_approval_status_check') THEN
    ALTER TABLE assignment_inventory_items
      ADD CONSTRAINT assignment_inventory_items_approval_status_check
      CHECK (approval_status IN ('pending', 'approved', 'rejected'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fieldgrid_set_assignment_inventory_item_tenant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  assignment_tenant_id uuid;
  inventory_tenant_id uuid;
BEGIN
  SELECT tenant_id INTO assignment_tenant_id
  FROM assignments
  WHERE id = NEW.assignment_id;

  SELECT tenant_id INTO inventory_tenant_id
  FROM inventory_items
  WHERE id = NEW.inventory_item_id;

  IF assignment_tenant_id IS NULL THEN
    RAISE EXCEPTION 'assignment_inventory_items assignment % does not exist', NEW.assignment_id;
  END IF;

  IF inventory_tenant_id IS NULL THEN
    RAISE EXCEPTION 'assignment_inventory_items inventory item % does not exist', NEW.inventory_item_id;
  END IF;

  IF assignment_tenant_id <> inventory_tenant_id THEN
    RAISE EXCEPTION 'assignment_inventory_items assignment/inventory tenant mismatch';
  END IF;

  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := assignment_tenant_id;
  ELSIF NEW.tenant_id <> assignment_tenant_id THEN
    RAISE EXCEPTION 'assignment_inventory_items tenant mismatch';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assignment_inventory_items_set_tenant ON assignment_inventory_items;
CREATE TRIGGER trg_assignment_inventory_items_set_tenant
  BEFORE INSERT OR UPDATE OF assignment_id, inventory_item_id, tenant_id
  ON assignment_inventory_items
  FOR EACH ROW
  EXECUTE FUNCTION public.fieldgrid_set_assignment_inventory_item_tenant();

-- ---------------------------------------------------------------------------
-- Documents entity type length for material and inventory entity names
-- ---------------------------------------------------------------------------

ALTER TABLE documents
  ALTER COLUMN entity_type TYPE varchar(40);

-- ---------------------------------------------------------------------------
-- RLS skeleton policies. Runtime server actions still enforce tenant-RBAC and
-- module guards; these policies provide Supabase Data API defense in depth.
-- ---------------------------------------------------------------------------

ALTER TABLE tenant_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_stock_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_maintenance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_inventory_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_sequences_management_all ON tenant_sequences;
CREATE POLICY tenant_sequences_management_all ON tenant_sequences
  TO authenticated
  USING (is_management())
  WITH CHECK (is_management());

DROP POLICY IF EXISTS material_categories_management_all ON material_categories;
CREATE POLICY material_categories_management_all ON material_categories
  TO authenticated
  USING (is_management())
  WITH CHECK (is_management());

DROP POLICY IF EXISTS materials_management_all ON materials;
CREATE POLICY materials_management_all ON materials
  TO authenticated
  USING (is_management())
  WITH CHECK (is_management());

DROP POLICY IF EXISTS stock_locations_management_all ON stock_locations;
CREATE POLICY stock_locations_management_all ON stock_locations
  TO authenticated
  USING (is_management())
  WITH CHECK (is_management());

DROP POLICY IF EXISTS material_stock_balances_management_all ON material_stock_balances;
CREATE POLICY material_stock_balances_management_all ON material_stock_balances
  TO authenticated
  USING (is_management())
  WITH CHECK (is_management());

DROP POLICY IF EXISTS material_stock_movements_management_all ON material_stock_movements;
CREATE POLICY material_stock_movements_management_all ON material_stock_movements
  TO authenticated
  USING (is_management())
  WITH CHECK (is_management());

DROP POLICY IF EXISTS inventory_categories_management_all ON inventory_categories;
CREATE POLICY inventory_categories_management_all ON inventory_categories
  TO authenticated
  USING (is_management())
  WITH CHECK (is_management());

DROP POLICY IF EXISTS inventory_items_management_all ON inventory_items;
CREATE POLICY inventory_items_management_all ON inventory_items
  TO authenticated
  USING (is_management())
  WITH CHECK (is_management());

DROP POLICY IF EXISTS inventory_movements_management_all ON inventory_movements;
CREATE POLICY inventory_movements_management_all ON inventory_movements
  TO authenticated
  USING (is_management())
  WITH CHECK (is_management());

DROP POLICY IF EXISTS inventory_issues_management_all ON inventory_issues;
CREATE POLICY inventory_issues_management_all ON inventory_issues
  TO authenticated
  USING (is_management())
  WITH CHECK (is_management());

DROP POLICY IF EXISTS inventory_maintenance_events_management_all ON inventory_maintenance_events;
CREATE POLICY inventory_maintenance_events_management_all ON inventory_maintenance_events
  TO authenticated
  USING (is_management())
  WITH CHECK (is_management());

DROP POLICY IF EXISTS assignment_inventory_items_management_all ON assignment_inventory_items;
CREATE POLICY assignment_inventory_items_management_all ON assignment_inventory_items
  TO authenticated
  USING (is_management())
  WITH CHECK (is_management());
