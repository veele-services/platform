"use server";

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/permissions";
import { requireCurrentTenantId } from "@/lib/auth/tenant";

type SqlResult<T> = { rows?: T[] };

export type DashboardMetric = {
  label: string;
  value: string;
  description: string;
  tone: "neutral" | "success" | "warn" | "danger";
};

export type MaterialStockRiskRow = {
  materialId: string;
  materialCode: string;
  materialName: string;
  unit: string;
  stockLocationName: string;
  stockLocationType: string;
  quantity: string;
  minStock: string | null;
  maxStock: string | null;
  status: "negative" | "low" | "ok";
  lastMovementAt: string | null;
};

export type MaterialUsageReportRow = {
  usageId: string;
  assignmentId: string;
  assignmentCode: string | null;
  assignmentTitle: string | null;
  materialCode: string | null;
  name: string;
  quantity: string;
  unitLabel: string | null;
  approvalStatus: string;
  invoiceable: boolean;
  customerVisible: boolean;
  unitPrice: string | null;
  createdAt: string;
};

export type MaterialsDashboardData = {
  metrics: DashboardMetric[];
  stockRisks: MaterialStockRiskRow[];
  pendingUsage: MaterialUsageReportRow[];
  customerVisibleUsage: MaterialUsageReportRow[];
};

export type InventoryStatusCountRow = {
  status: string;
  count: number;
};

export type InventoryIssueDashboardRow = {
  issueId: string;
  inventoryItemId: string;
  inventoryCode: string;
  inventoryName: string;
  severity: string;
  status: string;
  objectName: string | null;
  personnelName: string | null;
  createdAt: string;
};

export type InventoryMaintenanceDashboardRow = {
  eventId: string;
  inventoryItemId: string;
  inventoryCode: string;
  inventoryName: string;
  eventType: string;
  status: string;
  dueDate: string | null;
};

export type InventoryUsageDashboardRow = {
  usageId: string;
  assignmentId: string;
  assignmentCode: string | null;
  assignmentTitle: string | null;
  inventoryItemId: string;
  inventoryCode: string;
  inventoryName: string;
  usageType: string;
  approvalStatus: string;
  invoiceable: boolean;
  customerVisible: boolean;
  approvedQuantity: string | null;
  approvedUnitPrice: string | null;
  attachedAt: string;
};

export type InventoryDashboardData = {
  metrics: DashboardMetric[];
  statusCounts: InventoryStatusCountRow[];
  openIssues: InventoryIssueDashboardRow[];
  maintenanceDue: InventoryMaintenanceDashboardRow[];
  usageRows: InventoryUsageDashboardRow[];
};

export type CsvExport = {
  filename: string;
  content: string;
  mimeType: string;
};

function rowsFrom<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    const maybeRows = (result as SqlResult<T>).rows;
    return Array.isArray(maybeRows) ? maybeRows : [];
  }
  return [];
}

function numberText(value: number | null | undefined): string {
  return new Intl.NumberFormat("nl-NL").format(value ?? 0);
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value).replace(/\r?\n/g, " ");
  return /[";,]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
  const headerLine = headers.map(csvEscape).join(";");
  const body = rows.map((row) => headers.map((header) => csvEscape(row[header])).join(";"));
  return [headerLine, ...body].join("\n");
}

function csvExport(filename: string, headers: string[], rows: Array<Record<string, unknown>>): CsvExport {
  return {
    filename,
    content: toCsv(headers, rows),
    mimeType: "text/csv;charset=utf-8",
  };
}

async function requireMaterialsDashboardTenant(): Promise<string> {
  await requirePermission("materials", "view");
  return requireCurrentTenantId();
}

async function requireInventoryDashboardTenant(): Promise<string> {
  await requirePermission("inventory", "view");
  return requireCurrentTenantId();
}

async function loadMaterialStockRisks(tenantId: string, limit = 50): Promise<MaterialStockRiskRow[]> {
  return rowsFrom<MaterialStockRiskRow>(await db.execute(sql`
    SELECT m.id::text AS "materialId",
           m.code AS "materialCode",
           m.name AS "materialName",
           m.unit,
           l.name AS "stockLocationName",
           l.location_type AS "stockLocationType",
           b.quantity::text AS quantity,
           COALESCE(b.min_stock_override, m.min_stock)::text AS "minStock",
           COALESCE(b.max_stock_override, m.max_stock)::text AS "maxStock",
           CASE
             WHEN b.quantity < 0 THEN 'negative'
             WHEN COALESCE(b.min_stock_override, m.min_stock) IS NOT NULL
               AND b.quantity <= COALESCE(b.min_stock_override, m.min_stock) THEN 'low'
             ELSE 'ok'
           END AS status,
           b.last_movement_at::text AS "lastMovementAt"
    FROM material_stock_balances b
    JOIN materials m ON m.id = b.material_id AND m.tenant_id = b.tenant_id
    JOIN stock_locations l ON l.id = b.stock_location_id AND l.tenant_id = b.tenant_id
    WHERE b.tenant_id = ${tenantId}::uuid
      AND m.archived_at IS NULL
      AND (
        b.quantity < 0
        OR (
          COALESCE(b.min_stock_override, m.min_stock) IS NOT NULL
          AND b.quantity <= COALESCE(b.min_stock_override, m.min_stock)
        )
      )
    ORDER BY CASE WHEN b.quantity < 0 THEN 0 ELSE 1 END,
             b.quantity ASC,
             m.name ASC
    LIMIT ${limit}
  `));
}

async function loadMaterialUsageRows(
  tenantId: string,
  whereClause: ReturnType<typeof sql>,
  limit = 50,
): Promise<MaterialUsageReportRow[]> {
  return rowsFrom<MaterialUsageReportRow>(await db.execute(sql`
    SELECT u.id::text AS "usageId",
           u.assignment_id::text AS "assignmentId",
           assignments.code AS "assignmentCode",
           assignments.title AS "assignmentTitle",
           COALESCE(u.material_code_snapshot, materials.code) AS "materialCode",
           COALESCE(u.approved_name, u.registered_name, u.name, materials.name) AS name,
           COALESCE(u.approved_quantity, u.registered_quantity, u.quantity)::text AS quantity,
           COALESCE(u.approved_unit_label, u.registered_unit_label, u.unit_label) AS "unitLabel",
           u.approval_status AS "approvalStatus",
           u.invoiceable,
           u.customer_visible AS "customerVisible",
           COALESCE(u.approved_unit_price, u.unit_price)::text AS "unitPrice",
           u.created_at::text AS "createdAt"
    FROM assignment_material_usage u
    LEFT JOIN assignments ON assignments.id = u.assignment_id AND assignments.tenant_id = u.tenant_id
    LEFT JOIN materials ON materials.id = u.material_id AND materials.tenant_id = u.tenant_id
    WHERE u.tenant_id = ${tenantId}::uuid
      AND ${whereClause}
    ORDER BY u.created_at DESC
    LIMIT ${limit}
  `));
}

export async function getMaterialsDashboard(): Promise<MaterialsDashboardData> {
  const tenantId = await requireMaterialsDashboardTenant();

  const [metricsRow] = rowsFrom<{
    totalMaterials: number;
    negativeStockLocations: number;
    lowStockLocations: number;
    pendingUsageCount: number;
    approvedInvoiceableUsageCount: number;
    recentMovementCount: number;
  }>(await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM materials WHERE tenant_id = ${tenantId}::uuid AND archived_at IS NULL AND is_active = true) AS "totalMaterials",
      (SELECT count(*)::int FROM material_stock_balances WHERE tenant_id = ${tenantId}::uuid AND quantity < 0) AS "negativeStockLocations",
      (
        SELECT count(*)::int
        FROM material_stock_balances b
        JOIN materials m ON m.id = b.material_id AND m.tenant_id = b.tenant_id
        WHERE b.tenant_id = ${tenantId}::uuid
          AND b.quantity >= 0
          AND COALESCE(b.min_stock_override, m.min_stock) IS NOT NULL
          AND b.quantity <= COALESCE(b.min_stock_override, m.min_stock)
      ) AS "lowStockLocations",
      (SELECT count(*)::int FROM assignment_material_usage WHERE tenant_id = ${tenantId}::uuid AND approval_status = 'pending') AS "pendingUsageCount",
      (
        SELECT count(*)::int
        FROM assignment_material_usage
        WHERE tenant_id = ${tenantId}::uuid
          AND approval_status = 'approved'
          AND invoiceable = true
      ) AS "approvedInvoiceableUsageCount",
      (
        SELECT count(*)::int
        FROM material_stock_movements
        WHERE tenant_id = ${tenantId}::uuid
          AND created_at >= now() - interval '30 days'
      ) AS "recentMovementCount"
  `));

  const [stockRisks, pendingUsage, customerVisibleUsage] = await Promise.all([
    loadMaterialStockRisks(tenantId),
    loadMaterialUsageRows(tenantId, sql`u.approval_status = 'pending'`, 30),
    loadMaterialUsageRows(
      tenantId,
      sql`u.customer_visible = true AND u.approval_status = 'approved'`,
      30,
    ),
  ]);

  const metrics = metricsRow ?? {
    totalMaterials: 0,
    negativeStockLocations: 0,
    lowStockLocations: 0,
    pendingUsageCount: 0,
    approvedInvoiceableUsageCount: 0,
    recentMovementCount: 0,
  };

  return {
    metrics: [
      { label: "Materialen", value: numberText(metrics.totalMaterials), description: "Actieve catalogusitems", tone: "neutral" },
      { label: "Negatieve voorraad", value: numberText(metrics.negativeStockLocations), description: "Locaties onder nul", tone: metrics.negativeStockLocations > 0 ? "danger" : "success" },
      { label: "Lage voorraad", value: numberText(metrics.lowStockLocations), description: "Locaties op of onder minimum", tone: metrics.lowStockLocations > 0 ? "warn" : "success" },
      { label: "Te keuren verbruik", value: numberText(metrics.pendingUsageCount), description: "Materiaalregels in goedkeuringswachtrij", tone: metrics.pendingUsageCount > 0 ? "warn" : "success" },
      { label: "Factureerbaar", value: numberText(metrics.approvedInvoiceableUsageCount), description: "Goedgekeurde factureerbare regels", tone: "neutral" },
      { label: "Mutaties 30 dagen", value: numberText(metrics.recentMovementCount), description: "Voorraadbewegingen", tone: "neutral" },
    ],
    stockRisks,
    pendingUsage,
    customerVisibleUsage,
  };
}

export async function exportMaterialStockCsv(): Promise<CsvExport> {
  const tenantId = await requireMaterialsDashboardTenant();
  const rows = await loadMaterialStockRisks(tenantId, 5000);
  return csvExport(
    "fieldgrid-materiaal-voorraad-risicos.csv",
    ["materialCode", "materialName", "stockLocationName", "stockLocationType", "quantity", "minStock", "maxStock", "status", "lastMovementAt"],
    rows,
  );
}

export async function exportCustomerVisibleMaterialUsageCsv(): Promise<CsvExport> {
  const tenantId = await requireMaterialsDashboardTenant();
  const rows = await loadMaterialUsageRows(
    tenantId,
    sql`u.customer_visible = true AND u.approval_status = 'approved'`,
    5000,
  );
  return csvExport(
    "fieldgrid-klantzichtbaar-materiaalverbruik.csv",
    ["assignmentCode", "assignmentTitle", "materialCode", "name", "quantity", "unitLabel", "invoiceable", "customerVisible", "unitPrice", "createdAt"],
    rows,
  );
}

async function loadOpenInventoryIssues(tenantId: string, limit = 50): Promise<InventoryIssueDashboardRow[]> {
  return rowsFrom<InventoryIssueDashboardRow>(await db.execute(sql`
    SELECT issue.id::text AS "issueId",
           issue.inventory_item_id::text AS "inventoryItemId",
           item.code AS "inventoryCode",
           item.name AS "inventoryName",
           issue.severity,
           issue.status,
           objects.name AS "objectName",
           trim(concat(personnel.first_name, ' ', personnel.last_name)) AS "personnelName",
           issue.created_at::text AS "createdAt"
    FROM inventory_issues issue
    JOIN inventory_items item ON item.id = issue.inventory_item_id AND item.tenant_id = issue.tenant_id
    LEFT JOIN objects ON objects.id = COALESCE(issue.object_id, item.current_object_id) AND objects.tenant_id = issue.tenant_id
    LEFT JOIN personnel ON personnel.id = COALESCE(issue.personnel_id, item.current_personnel_id) AND personnel.tenant_id = issue.tenant_id
    WHERE issue.tenant_id = ${tenantId}::uuid
      AND issue.status NOT IN ('resolved', 'unresolvable', 'cancelled')
    ORDER BY CASE issue.severity WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
             issue.created_at DESC
    LIMIT ${limit}
  `));
}

async function loadInventoryMaintenanceDue(tenantId: string, limit = 50): Promise<InventoryMaintenanceDashboardRow[]> {
  return rowsFrom<InventoryMaintenanceDashboardRow>(await db.execute(sql`
    SELECT event.id::text AS "eventId",
           event.inventory_item_id::text AS "inventoryItemId",
           item.code AS "inventoryCode",
           item.name AS "inventoryName",
           event.event_type AS "eventType",
           event.status,
           event.due_date::text AS "dueDate"
    FROM inventory_maintenance_events event
    JOIN inventory_items item ON item.id = event.inventory_item_id AND item.tenant_id = event.tenant_id
    WHERE event.tenant_id = ${tenantId}::uuid
      AND event.status NOT IN ('completed', 'cancelled')
      AND event.due_date IS NOT NULL
      AND event.due_date <= (current_date + interval '30 days')::date
    ORDER BY event.due_date ASC, item.code ASC
    LIMIT ${limit}
  `));
}

async function loadInventoryUsageRows(tenantId: string, limit = 50): Promise<InventoryUsageDashboardRow[]> {
  return rowsFrom<InventoryUsageDashboardRow>(await db.execute(sql`
    SELECT usage.id::text AS "usageId",
           usage.assignment_id::text AS "assignmentId",
           assignments.code AS "assignmentCode",
           assignments.title AS "assignmentTitle",
           usage.inventory_item_id::text AS "inventoryItemId",
           item.code AS "inventoryCode",
           item.name AS "inventoryName",
           usage.usage_type AS "usageType",
           usage.approval_status AS "approvalStatus",
           usage.invoiceable,
           usage.customer_visible AS "customerVisible",
           usage.approved_quantity::text AS "approvedQuantity",
           usage.approved_unit_price::text AS "approvedUnitPrice",
           usage.attached_at::text AS "attachedAt"
    FROM assignment_inventory_items usage
    JOIN inventory_items item ON item.id = usage.inventory_item_id AND item.tenant_id = usage.tenant_id
    LEFT JOIN assignments ON assignments.id = usage.assignment_id AND assignments.tenant_id = usage.tenant_id
    WHERE usage.tenant_id = ${tenantId}::uuid
    ORDER BY usage.attached_at DESC
    LIMIT ${limit}
  `));
}

export async function getInventoryDashboard(): Promise<InventoryDashboardData> {
  const tenantId = await requireInventoryDashboardTenant();

  const [metricsRow] = rowsFrom<{
    totalItems: number;
    defectItems: number;
    openIssues: number;
    overdueMaintenance: number;
    dueSoonMaintenance: number;
    rentableOrInvoiceableUsage: number;
  }>(await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM inventory_items WHERE tenant_id = ${tenantId}::uuid AND archived_at IS NULL AND is_active = true) AS "totalItems",
      (SELECT count(*)::int FROM inventory_items WHERE tenant_id = ${tenantId}::uuid AND archived_at IS NULL AND status IN ('defect', 'out_of_service', 'lost')) AS "defectItems",
      (SELECT count(*)::int FROM inventory_issues WHERE tenant_id = ${tenantId}::uuid AND status NOT IN ('resolved', 'unresolvable', 'cancelled')) AS "openIssues",
      (
        SELECT count(*)::int
        FROM inventory_maintenance_events
        WHERE tenant_id = ${tenantId}::uuid
          AND status NOT IN ('completed', 'cancelled')
          AND due_date IS NOT NULL
          AND due_date < current_date
      ) AS "overdueMaintenance",
      (
        SELECT count(*)::int
        FROM inventory_maintenance_events
        WHERE tenant_id = ${tenantId}::uuid
          AND status NOT IN ('completed', 'cancelled')
          AND due_date IS NOT NULL
          AND due_date BETWEEN current_date AND (current_date + interval '30 days')::date
      ) AS "dueSoonMaintenance",
      (
        SELECT count(*)::int
        FROM assignment_inventory_items
        WHERE tenant_id = ${tenantId}::uuid
          AND (usage_type = 'rented' OR invoiceable = true OR approval_status = 'pending')
      ) AS "rentableOrInvoiceableUsage"
  `));

  const [statusCounts, openIssues, maintenanceDue, usageRows] = await Promise.all([
    rowsFrom<InventoryStatusCountRow>(await db.execute(sql`
      SELECT status, count(*)::int AS count
      FROM inventory_items
      WHERE tenant_id = ${tenantId}::uuid
        AND archived_at IS NULL
      GROUP BY status
      ORDER BY count(*) DESC, status ASC
    `)),
    loadOpenInventoryIssues(tenantId),
    loadInventoryMaintenanceDue(tenantId),
    loadInventoryUsageRows(tenantId),
  ]);

  const metrics = metricsRow ?? {
    totalItems: 0,
    defectItems: 0,
    openIssues: 0,
    overdueMaintenance: 0,
    dueSoonMaintenance: 0,
    rentableOrInvoiceableUsage: 0,
  };

  return {
    metrics: [
      { label: "Inventarisitems", value: numberText(metrics.totalItems), description: "Actieve items", tone: "neutral" },
      { label: "Defect/buiten gebruik", value: numberText(metrics.defectItems), description: "Defect, kwijt of buiten gebruik", tone: metrics.defectItems > 0 ? "danger" : "success" },
      { label: "Open storingen", value: numberText(metrics.openIssues), description: "Nog op te volgen", tone: metrics.openIssues > 0 ? "warn" : "success" },
      { label: "Onderhoud verlopen", value: numberText(metrics.overdueMaintenance), description: "Voor vandaag verlopen", tone: metrics.overdueMaintenance > 0 ? "danger" : "success" },
      { label: "Onderhoud 30 dagen", value: numberText(metrics.dueSoonMaintenance), description: "Binnenkort gepland", tone: metrics.dueSoonMaintenance > 0 ? "warn" : "neutral" },
      { label: "Gebruik/verhuur", value: numberText(metrics.rentableOrInvoiceableUsage), description: "Werkbonkoppelingen en doorbelasting", tone: "neutral" },
    ],
    statusCounts,
    openIssues,
    maintenanceDue,
    usageRows,
  };
}

export async function exportInventoryStatusCsv(): Promise<CsvExport> {
  const tenantId = await requireInventoryDashboardTenant();
  const rows = rowsFrom<Record<string, unknown>>(await db.execute(sql`
    SELECT i.code AS "inventoryCode",
           i.name AS "inventoryName",
           i.status,
           c.name AS "categoryName",
           l.name AS "currentLocationName",
           objects.name AS "objectName",
           trim(concat(personnel.first_name, ' ', personnel.last_name)) AS "personnelName",
           i.next_inspection_date::text AS "nextInspectionDate",
           i.customer_visible AS "customerVisible"
    FROM inventory_items i
    LEFT JOIN inventory_categories c ON c.id = i.category_id AND c.tenant_id = i.tenant_id
    LEFT JOIN stock_locations l ON l.id = i.current_stock_location_id AND l.tenant_id = i.tenant_id
    LEFT JOIN objects ON objects.id = i.current_object_id AND objects.tenant_id = i.tenant_id
    LEFT JOIN personnel ON personnel.id = i.current_personnel_id AND personnel.tenant_id = i.tenant_id
    WHERE i.tenant_id = ${tenantId}::uuid
      AND i.archived_at IS NULL
    ORDER BY i.code ASC
    LIMIT 5000
  `));
  return csvExport(
    "fieldgrid-inventaris-status.csv",
    ["inventoryCode", "inventoryName", "status", "categoryName", "currentLocationName", "objectName", "personnelName", "nextInspectionDate", "customerVisible"],
    rows,
  );
}

export async function exportInventoryUsageCsv(): Promise<CsvExport> {
  const tenantId = await requireInventoryDashboardTenant();
  const rows = await loadInventoryUsageRows(tenantId, 5000);
  return csvExport(
    "fieldgrid-inventaris-werkbongebruik.csv",
    ["assignmentCode", "assignmentTitle", "inventoryCode", "inventoryName", "usageType", "approvalStatus", "invoiceable", "customerVisible", "approvedQuantity", "approvedUnitPrice", "attachedAt"],
    rows,
  );
}
