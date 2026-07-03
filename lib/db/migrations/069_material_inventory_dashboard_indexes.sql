-- ============================================================================
-- Phase 10 material/inventory dashboard indexes
--
-- Staging-safe migration:
-- - only adds indexes with IF NOT EXISTS;
-- - does not rewrite or mutate tenant data;
-- - supports dashboard, export, customer-visible reporting and approval queues.
-- ============================================================================

CREATE INDEX IF NOT EXISTS material_stock_balances_tenant_quantity_material_idx
  ON material_stock_balances (tenant_id, quantity, material_id);

CREATE INDEX IF NOT EXISTS assignment_material_usage_tenant_approval_created_idx
  ON assignment_material_usage (tenant_id, approval_status, created_at DESC);

CREATE INDEX IF NOT EXISTS assignment_material_usage_tenant_customer_visible_idx
  ON assignment_material_usage (tenant_id, customer_visible, invoiceable, approval_status);

CREATE INDEX IF NOT EXISTS material_stock_movements_tenant_created_idx
  ON material_stock_movements (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS inventory_items_tenant_status_inspection_idx
  ON inventory_items (tenant_id, status, next_inspection_date);

CREATE INDEX IF NOT EXISTS inventory_issues_tenant_status_created_idx
  ON inventory_issues (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS inventory_maintenance_tenant_status_due_idx
  ON inventory_maintenance_events (tenant_id, status, due_date);

CREATE INDEX IF NOT EXISTS assignment_inventory_items_tenant_approval_attached_idx
  ON assignment_inventory_items (tenant_id, approval_status, attached_at DESC);

CREATE INDEX IF NOT EXISTS assignment_inventory_items_tenant_usage_visible_idx
  ON assignment_inventory_items (tenant_id, usage_type, customer_visible, invoiceable);
