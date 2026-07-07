import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertContains(content, phrases, label) {
  for (const phrase of phrases) {
    assert.ok(content.includes(phrase), `${label} should contain ${phrase}`);
  }
}

test("phase 10 material and inventory dashboard actions are tenant-scoped", () => {
  const action = read("artifacts/backoffice/src/app/actions/material-inventory-reports.ts");

  assertContains(
    action,
    [
      "getMaterialsDashboard",
      "getInventoryDashboard",
      "requirePermission(\"materials\", \"view\")",
      "requirePermission(\"inventory\", \"view\")",
      "requireCurrentTenantId",
      "WHERE b.tenant_id = ${tenantId}::uuid",
      "WHERE issue.tenant_id = ${tenantId}::uuid",
      "WHERE usage.tenant_id = ${tenantId}::uuid",
    ],
    "phase 10 dashboard action",
  );
});

test("phase 10 exports cover stock, customer-visible material and inventory usage", () => {
  const action = read("artifacts/backoffice/src/app/actions/material-inventory-reports.ts");
  const materialsView = read("artifacts/backoffice/src/components/materials/MaterialsDashboardView.tsx");
  const inventoryView = read("artifacts/backoffice/src/components/inventory/InventoryDashboardView.tsx");

  assertContains(
    action,
    [
      "exportMaterialStockCsv",
      "exportCustomerVisibleMaterialUsageCsv",
      "exportInventoryStatusCsv",
      "exportInventoryUsageCsv",
      "text/csv;charset=utf-8",
      "u.customer_visible = true AND u.approval_status = 'approved'",
      "invoiceable",
      "customerVisible",
    ],
    "phase 10 export actions",
  );
  assertContains(materialsView, ["Voorraadrisico CSV", "Klantzichtbaar verbruik CSV", "downloadCsv"], "materials dashboard export UI");
  assertContains(inventoryView, ["Status CSV", "Werkbongebruik CSV", "downloadCsv"], "inventory dashboard export UI");
});

test("phase 10 routes and overview links expose management dashboards", () => {
  const materialsPage = read("artifacts/backoffice/src/app/(dashboard)/materials/page.tsx");
  const inventoryPage = read("artifacts/backoffice/src/app/(dashboard)/inventory/page.tsx");
  const materialsDashboard = read("artifacts/backoffice/src/app/(dashboard)/materials/dashboard/page.tsx");
  const inventoryDashboard = read("artifacts/backoffice/src/app/(dashboard)/inventory/dashboard/page.tsx");

  assertContains(materialsPage, ["/materials/dashboard", "Dashboard"], "materials overview dashboard link");
  assertContains(inventoryPage, ["/inventory/dashboard", "Dashboard"], "inventory overview dashboard link");
  assertContains(materialsDashboard, ["MaterialsDashboardView", "getMaterialsDashboard", "Materiaal dashboard"], "materials dashboard route");
  assertContains(inventoryDashboard, ["InventoryDashboardView", "getInventoryDashboard", "Inventaris dashboard"], "inventory dashboard route");
});

test("phase 10 migration adds dashboard performance indexes only", () => {
  const migration = read("lib/db/migrations/069_material_inventory_dashboard_indexes.sql");

  assertContains(
    migration,
    [
      "CREATE INDEX IF NOT EXISTS material_stock_balances_tenant_quantity_material_idx",
      "assignment_material_usage_tenant_approval_created_idx",
      "assignment_material_usage_tenant_customer_visible_idx",
      "inventory_items_tenant_status_inspection_idx",
      "inventory_issues_tenant_status_created_idx",
      "inventory_maintenance_tenant_status_due_idx",
      "assignment_inventory_items_tenant_usage_visible_idx",
    ],
    "phase 10 dashboard index migration",
  );
  assert.ok(!migration.includes("ALTER TABLE"), "phase 10 index migration should not mutate table data or columns");
});
