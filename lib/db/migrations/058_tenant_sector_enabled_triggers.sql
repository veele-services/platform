-- ============================================================================
-- Tenant sector enabled enforcement
--
-- Foreign keys guarantee tenant-sector membership. These triggers additionally
-- guarantee that new or changed rows use an enabled tenant sector.
-- Existing staging rows are not rewritten by this migration.
-- ============================================================================

CREATE OR REPLACE FUNCTION fieldgrid_assert_tenant_sector_enabled()
RETURNS trigger AS $$
BEGIN
  IF NEW.sector_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM tenant_sectors ts
    WHERE ts.tenant_id = NEW.tenant_id
      AND ts.sector_id = NEW.sector_id
      AND ts.is_enabled = true
  ) THEN
    RAISE EXCEPTION 'Sector % is not enabled for tenant %', NEW.sector_id, NEW.tenant_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS customers_tenant_sector_enabled_trigger ON customers;
CREATE TRIGGER customers_tenant_sector_enabled_trigger
  BEFORE INSERT OR UPDATE OF tenant_id, sector_id ON customers
  FOR EACH ROW
  EXECUTE FUNCTION fieldgrid_assert_tenant_sector_enabled();

DROP TRIGGER IF EXISTS objects_tenant_sector_enabled_trigger ON objects;
CREATE TRIGGER objects_tenant_sector_enabled_trigger
  BEFORE INSERT OR UPDATE OF tenant_id, sector_id ON objects
  FOR EACH ROW
  EXECUTE FUNCTION fieldgrid_assert_tenant_sector_enabled();

DROP TRIGGER IF EXISTS personnel_tenant_sector_enabled_trigger ON personnel;
CREATE TRIGGER personnel_tenant_sector_enabled_trigger
  BEFORE INSERT OR UPDATE OF tenant_id, sector_id ON personnel
  FOR EACH ROW
  EXECUTE FUNCTION fieldgrid_assert_tenant_sector_enabled();

DROP TRIGGER IF EXISTS task_codes_tenant_sector_enabled_trigger ON task_codes;
CREATE TRIGGER task_codes_tenant_sector_enabled_trigger
  BEFORE INSERT OR UPDATE OF tenant_id, sector_id ON task_codes
  FOR EACH ROW
  EXECUTE FUNCTION fieldgrid_assert_tenant_sector_enabled();
