"use server";

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { getCurrentBackofficeUser, requireCurrentTenantId } from "@/lib/auth/tenant";

export type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; message: string; fieldErrors?: Record<string, string> };

export type MaterialRow = {
  id: string;
  code: string;
  name: string;
  categoryName: string | null;
  unit: string;
  salePrice: string | null;
  costPrice: string | null;
  defaultInvoiceable: boolean;
  isActive: boolean;
  archivedAt: string | null;
  totalStock: string;
  locationsCount: number;
  negativeLocationsCount: number;
  lowLocationsCount: number;
  lastMovementAt: string | null;
};

export type MaterialCategoryOption = {
  id: string;
  name: string;
};

export type MaterialEntityOption = {
  id: string;
  label: string;
  meta: string | null;
};

export type StockLocationOption = {
  id: string;
  name: string;
  locationType: string;
  objectId: string | null;
  personnelId: string | null;
};

export type MaterialStockRow = {
  balanceId: string;
  materialId: string;
  materialCode: string;
  materialName: string;
  unit: string;
  stockLocationId: string;
  stockLocationName: string;
  stockLocationType: string;
  quantity: string;
  minStock: string | null;
  status: "negative" | "low" | "ok";
  lastMovementAt: string | null;
};

export type MaterialMovementRow = {
  id: string;
  materialCode: string;
  materialName: string;
  fromLocationName: string | null;
  toLocationName: string | null;
  quantity: string;
  movementType: string;
  reason: string | null;
  notes: string | null;
  createdAt: string;
};

export type AssignmentMaterialUsageSummary = {
  id: string;
  assignmentId: string;
  assignmentCode: string | null;
  assignmentTitle: string | null;
  name: string;
  quantity: string;
  unitLabel: string | null;
  approvalStatus: string;
  invoiceable: boolean;
  customerVisible: boolean;
  createdAt: string;
};

export type MaterialDetail = MaterialRow & {
  description: string | null;
  notes: string | null;
  supplierName: string | null;
  supplierItemNumber: string | null;
  barcode: string | null;
  vatRate: string | null;
  vatType: string | null;
  minStock: string | null;
  maxStock: string | null;
  balances: MaterialStockRow[];
  movements: MaterialMovementRow[];
  usages: AssignmentMaterialUsageSummary[];
};

export type MaterialManagementOptions = {
  categories: MaterialCategoryOption[];
  stockLocations: StockLocationOption[];
  objects: MaterialEntityOption[];
  personnel: MaterialEntityOption[];
};

export type MaterialFormInput = {
  name: string;
  categoryId?: string | null;
  categoryName?: string | null;
  description?: string | null;
  unit: string;
  costPrice?: string | null;
  salePrice?: string | null;
  vatRate?: string | null;
  vatType?: string | null;
  supplierName?: string | null;
  supplierItemNumber?: string | null;
  barcode?: string | null;
  minStock?: string | null;
  maxStock?: string | null;
  defaultInvoiceable?: boolean;
  notes?: string | null;
};

export type MaterialStockMovementInput = {
  materialId: string;
  movementType: "received" | "corrected" | "transferred";
  quantity: string;
  reason?: string | null;
  notes?: string | null;
  fromStockLocationId?: string | null;
  toStockLocationId?: string | null;
  toObjectId?: string | null;
  toPersonnelId?: string | null;
};

type SqlResult<T> = { rows?: T[] } | T[];

const PAGE_SIZE = 25;

function rowsFrom<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const maybeRows = (result as SqlResult<T> | null)?.rows;
  return Array.isArray(maybeRows) ? maybeRows : [];
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function requireText(value: unknown, label: string): string {
  const trimmed = cleanText(value);
  if (!trimmed) throw new Error(`${label} is verplicht.`);
  return trimmed;
}

function normalizeDecimal(
  value: unknown,
  label: string,
  options: { required?: boolean; allowNegative?: boolean; scale?: number } = {},
): string | null {
  const raw = cleanText(value);
  if (!raw) {
    if (options.required) throw new Error(`${label} is verplicht.`);
    return null;
  }

  const normalized = raw.replace(",", ".");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) throw new Error(`${label} moet een geldig getal zijn.`);
  if (!options.allowNegative && parsed < 0) throw new Error(`${label} mag niet negatief zijn.`);
  if (parsed === 0 && options.required) throw new Error(`${label} moet groter of kleiner dan 0 zijn.`);

  const scale = options.scale ?? 3;
  return parsed.toFixed(scale).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function decimalNumber(value: string): number {
  return Number(value.replace(",", "."));
}

function negateDecimal(value: string): string {
  return String(decimalNumber(value) * -1);
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160) || "categorie";
}

function materialStatus(row: { quantity: string; minStock: string | null }): "negative" | "low" | "ok" {
  const quantity = Number(row.quantity);
  if (quantity < 0) return "negative";
  if (row.minStock !== null && Number(row.minStock) >= quantity) return "low";
  return "ok";
}

async function requireMaterialsWrite(action: string): Promise<void> {
  if (await hasPermission("materials", action)) return;
  if (await hasPermission("materials", "manage")) return;
  throw new Error(`Forbidden: materials:${action}`);
}

async function requireActorId(): Promise<string> {
  const user = await getCurrentBackofficeUser();
  if (!user) throw new Error("Geen ingelogde gebruiker gevonden.");
  return user.id;
}

async function writeTenantAuditLog(input: {
  tenantId: string;
  userId: string;
  action: string;
  resource: string;
  resourceId?: string | null;
  metadata?: unknown;
}) {
  await db.execute(sql`
    INSERT INTO audit_log (tenant_id, user_id, action, resource, resource_id, metadata)
    VALUES (
      ${input.tenantId}::uuid,
      ${input.userId}::uuid,
      ${input.action},
      ${input.resource},
      ${input.resourceId ?? null},
      ${JSON.stringify(input.metadata ?? {})}::jsonb
    )
  `);
}

async function nextMaterialCode(tx: typeof db, tenantId: string): Promise<string> {
  const result = await tx.execute(sql`
    INSERT INTO tenant_sequences (tenant_id, sequence_key, next_value)
    VALUES (${tenantId}::uuid, 'material_code', 2)
    ON CONFLICT (tenant_id, sequence_key)
    DO UPDATE SET next_value = tenant_sequences.next_value + 1,
                  updated_at = now()
    RETURNING (next_value - 1)::int AS value
  `);

  const [row] = rowsFrom<{ value: number }>(result);
  if (!row) throw new Error("Kon geen materiaalcode genereren.");
  return `M${String(row.value).padStart(5, "0")}`;
}

async function resolveCategoryId(
  tx: typeof db,
  tenantId: string,
  categoryId?: string | null,
  categoryName?: string | null,
): Promise<string | null> {
  const cleanCategoryId = cleanText(categoryId);
  if (cleanCategoryId) {
    const existing = rowsFrom<{ id: string }>(await tx.execute(sql`
      SELECT id
      FROM material_categories
      WHERE tenant_id = ${tenantId}::uuid
        AND id = ${cleanCategoryId}::uuid
        AND archived_at IS NULL
      LIMIT 1
    `));
    if (!existing[0]) throw new Error("Categorie niet gevonden.");
    return existing[0].id;
  }

  const name = cleanText(categoryName);
  if (!name) return null;

  const slug = slugify(name);
  const result = await tx.execute(sql`
    INSERT INTO material_categories (tenant_id, name, slug)
    VALUES (${tenantId}::uuid, ${name}, ${slug})
    ON CONFLICT (tenant_id, slug)
    DO UPDATE SET name = EXCLUDED.name,
                  archived_at = NULL,
                  is_active = true,
                  updated_at = now()
    RETURNING id
  `);
  const [row] = rowsFrom<{ id: string }>(result);
  return row?.id ?? null;
}

async function getStockLocationById(
  tx: typeof db,
  tenantId: string,
  stockLocationId: string,
): Promise<StockLocationOption | null> {
  const [row] = rowsFrom<StockLocationOption>(await tx.execute(sql`
    SELECT id,
           name,
           location_type AS "locationType",
           object_id AS "objectId",
           personnel_id AS "personnelId"
    FROM stock_locations
    WHERE tenant_id = ${tenantId}::uuid
      AND id = ${stockLocationId}::uuid
      AND archived_at IS NULL
    LIMIT 1
  `));
  return row ?? null;
}

async function ensureObjectStockLocation(
  tx: typeof db,
  tenantId: string,
  objectId: string,
): Promise<string> {
  const [objectRow] = rowsFrom<{ id: string; name: string; code: string | null }>(await tx.execute(sql`
    SELECT id, name, code
    FROM objects
    WHERE tenant_id = ${tenantId}::uuid
      AND id = ${objectId}::uuid
      AND is_active = true
    LIMIT 1
  `));
  if (!objectRow) throw new Error("Object niet gevonden voor deze tenant.");

  const [existing] = rowsFrom<{ id: string }>(await tx.execute(sql`
    SELECT id
    FROM stock_locations
    WHERE tenant_id = ${tenantId}::uuid
      AND location_type = 'object'
      AND object_id = ${objectId}::uuid
      AND archived_at IS NULL
    ORDER BY created_at ASC
    LIMIT 1
  `));
  if (existing) return existing.id;

  const [created] = rowsFrom<{ id: string }>(await tx.execute(sql`
    INSERT INTO stock_locations (tenant_id, location_type, name, object_id)
    VALUES (${tenantId}::uuid, 'object', ${objectRow.name}, ${objectId}::uuid)
    RETURNING id
  `));
  if (!created) throw new Error("Kon voorraadlocatie voor object niet aanmaken.");
  return created.id;
}

async function ensurePersonnelStockLocation(
  tx: typeof db,
  tenantId: string,
  personnelId: string,
): Promise<string> {
  const [personnelRow] = rowsFrom<{ id: string; name: string }>(await tx.execute(sql`
    SELECT id, concat(first_name, ' ', last_name) AS name
    FROM personnel
    WHERE tenant_id = ${tenantId}::uuid
      AND id = ${personnelId}::uuid
      AND is_active = true
    LIMIT 1
  `));
  if (!personnelRow) throw new Error("Personeelslid niet gevonden voor deze tenant.");

  const [existing] = rowsFrom<{ id: string }>(await tx.execute(sql`
    SELECT id
    FROM stock_locations
    WHERE tenant_id = ${tenantId}::uuid
      AND location_type = 'personnel'
      AND personnel_id = ${personnelId}::uuid
      AND archived_at IS NULL
    ORDER BY created_at ASC
    LIMIT 1
  `));
  if (existing) return existing.id;

  const [created] = rowsFrom<{ id: string }>(await tx.execute(sql`
    INSERT INTO stock_locations (tenant_id, location_type, name, personnel_id)
    VALUES (${tenantId}::uuid, 'personnel', ${personnelRow.name}, ${personnelId}::uuid)
    RETURNING id
  `));
  if (!created) throw new Error("Kon voorraadlocatie voor personeelslid niet aanmaken.");
  return created.id;
}

async function resolveTargetStockLocation(
  tx: typeof db,
  tenantId: string,
  input: {
    stockLocationId?: string | null;
    objectId?: string | null;
    personnelId?: string | null;
  },
): Promise<string | null> {
  const stockLocationId = cleanText(input.stockLocationId);
  if (stockLocationId) {
    const location = await getStockLocationById(tx, tenantId, stockLocationId);
    if (!location) throw new Error("Voorraadlocatie niet gevonden.");
    return location.id;
  }

  const objectId = cleanText(input.objectId);
  if (objectId) return ensureObjectStockLocation(tx, tenantId, objectId);

  const personnelId = cleanText(input.personnelId);
  if (personnelId) return ensurePersonnelStockLocation(tx, tenantId, personnelId);

  return null;
}

async function assertMaterialExists(tx: typeof db, tenantId: string, materialId: string): Promise<void> {
  const [material] = rowsFrom<{ id: string }>(await tx.execute(sql`
    SELECT id
    FROM materials
    WHERE tenant_id = ${tenantId}::uuid
      AND id = ${materialId}::uuid
      AND archived_at IS NULL
    LIMIT 1
  `));
  if (!material) throw new Error("Materiaal niet gevonden.");
}

async function applyBalanceDelta(
  tx: typeof db,
  tenantId: string,
  materialId: string,
  stockLocationId: string,
  delta: string,
): Promise<void> {
  await tx.execute(sql`
    INSERT INTO material_stock_balances (
      tenant_id,
      material_id,
      stock_location_id,
      quantity,
      last_movement_at
    )
    VALUES (
      ${tenantId}::uuid,
      ${materialId}::uuid,
      ${stockLocationId}::uuid,
      ${delta}::numeric,
      now()
    )
    ON CONFLICT (tenant_id, material_id, stock_location_id)
    DO UPDATE SET quantity = material_stock_balances.quantity + EXCLUDED.quantity,
                  last_movement_at = now(),
                  updated_at = now()
  `);
}

function revalidateMaterials(materialId?: string | null) {
  revalidatePath("/materials");
  if (materialId) revalidatePath(`/materials/${materialId}`);
  revalidatePath("/objects");
  revalidatePath("/personnel");
}

export async function listMaterials(params: {
  search?: string;
  status?: string;
  categoryId?: string;
  page?: number;
} = {}): Promise<{ rows: MaterialRow[]; total: number }> {
  await requirePermission("materials", "view");
  const tenantId = await requireCurrentTenantId();
  const search = cleanText(params.search);
  const term = search ? `%${search}%` : null;
  const status = params.status === "archived" || params.status === "inactive" ? params.status : "active";
  const categoryId = cleanText(params.categoryId);
  const page = Math.max(1, params.page ?? 1);
  const offset = (page - 1) * PAGE_SIZE;

  const whereStatus =
    status === "archived"
      ? sql`m.archived_at IS NOT NULL`
      : status === "inactive"
        ? sql`m.archived_at IS NULL AND m.is_active = false`
        : sql`m.archived_at IS NULL AND m.is_active = true`;

  const rows = rowsFrom<MaterialRow>(await db.execute(sql`
    SELECT m.id,
           m.code,
           m.name,
           c.name AS "categoryName",
           m.unit,
           m.sale_price::text AS "salePrice",
           m.cost_price::text AS "costPrice",
           m.default_invoiceable AS "defaultInvoiceable",
           m.is_active AS "isActive",
           m.archived_at::text AS "archivedAt",
           COALESCE(SUM(b.quantity), 0)::text AS "totalStock",
           COUNT(b.id)::int AS "locationsCount",
           COUNT(b.id) FILTER (WHERE b.quantity < 0)::int AS "negativeLocationsCount",
           COUNT(b.id) FILTER (
             WHERE COALESCE(b.min_stock_override, m.min_stock) IS NOT NULL
               AND b.quantity <= COALESCE(b.min_stock_override, m.min_stock)
           )::int AS "lowLocationsCount",
           MAX(b.last_movement_at)::text AS "lastMovementAt"
    FROM materials m
    LEFT JOIN material_categories c ON c.id = m.category_id AND c.tenant_id = m.tenant_id
    LEFT JOIN material_stock_balances b ON b.material_id = m.id AND b.tenant_id = m.tenant_id
    WHERE m.tenant_id = ${tenantId}::uuid
      AND ${whereStatus}
      AND (${term}::text IS NULL OR m.name ILIKE ${term} OR m.code ILIKE ${term} OR m.barcode ILIKE ${term})
      AND (${categoryId}::uuid IS NULL OR m.category_id = ${categoryId}::uuid)
    GROUP BY m.id, c.name
    ORDER BY m.name ASC
    LIMIT ${PAGE_SIZE} OFFSET ${offset}
  `));

  const [countRow] = rowsFrom<{ total: number }>(await db.execute(sql`
    SELECT count(*)::int AS total
    FROM materials m
    WHERE m.tenant_id = ${tenantId}::uuid
      AND ${whereStatus}
      AND (${term}::text IS NULL OR m.name ILIKE ${term} OR m.code ILIKE ${term} OR m.barcode ILIKE ${term})
      AND (${categoryId}::uuid IS NULL OR m.category_id = ${categoryId}::uuid)
  `));

  return { rows, total: countRow?.total ?? 0 };
}

export async function listMaterialManagementOptions(): Promise<MaterialManagementOptions> {
  await requirePermission("materials", "view");
  const tenantId = await requireCurrentTenantId();

  const [categories, stockLocations, objects, personnel] = await Promise.all([
    db.execute(sql`
      SELECT id, name
      FROM material_categories
      WHERE tenant_id = ${tenantId}::uuid
        AND archived_at IS NULL
        AND is_active = true
      ORDER BY name ASC
    `),
    db.execute(sql`
      SELECT id,
             name,
             location_type AS "locationType",
             object_id AS "objectId",
             personnel_id AS "personnelId"
      FROM stock_locations
      WHERE tenant_id = ${tenantId}::uuid
        AND archived_at IS NULL
        AND is_active = true
      ORDER BY location_type ASC, name ASC
    `),
    db.execute(sql`
      SELECT id,
             concat(code, ' - ', name) AS label,
             city AS meta
      FROM objects
      WHERE tenant_id = ${tenantId}::uuid
        AND is_active = true
      ORDER BY name ASC
      LIMIT 300
    `),
    db.execute(sql`
      SELECT id,
             concat(code, ' - ', first_name, ' ', last_name) AS label,
             email AS meta
      FROM personnel
      WHERE tenant_id = ${tenantId}::uuid
        AND is_active = true
      ORDER BY first_name ASC, last_name ASC
      LIMIT 300
    `),
  ]);

  return {
    categories: rowsFrom<MaterialCategoryOption>(categories),
    stockLocations: rowsFrom<StockLocationOption>(stockLocations),
    objects: rowsFrom<MaterialEntityOption>(objects),
    personnel: rowsFrom<MaterialEntityOption>(personnel),
  };
}

export async function getMaterialDetail(materialId: string): Promise<MaterialDetail | null> {
  await requirePermission("materials", "view");
  const tenantId = await requireCurrentTenantId();

  const [material] = rowsFrom<MaterialDetail>(await db.execute(sql`
    SELECT m.id,
           m.code,
           m.name,
           c.name AS "categoryName",
           m.description,
           m.unit,
           m.sale_price::text AS "salePrice",
           m.cost_price::text AS "costPrice",
           m.vat_rate::text AS "vatRate",
           m.vat_type AS "vatType",
           m.supplier_name AS "supplierName",
           m.supplier_item_number AS "supplierItemNumber",
           m.barcode,
           m.default_invoiceable AS "defaultInvoiceable",
           m.is_active AS "isActive",
           m.archived_at::text AS "archivedAt",
           m.min_stock::text AS "minStock",
           m.max_stock::text AS "maxStock",
           m.notes,
           COALESCE(SUM(b.quantity), 0)::text AS "totalStock",
           COUNT(b.id)::int AS "locationsCount",
           COUNT(b.id) FILTER (WHERE b.quantity < 0)::int AS "negativeLocationsCount",
           COUNT(b.id) FILTER (
             WHERE COALESCE(b.min_stock_override, m.min_stock) IS NOT NULL
               AND b.quantity <= COALESCE(b.min_stock_override, m.min_stock)
           )::int AS "lowLocationsCount",
           MAX(b.last_movement_at)::text AS "lastMovementAt"
    FROM materials m
    LEFT JOIN material_categories c ON c.id = m.category_id AND c.tenant_id = m.tenant_id
    LEFT JOIN material_stock_balances b ON b.material_id = m.id AND b.tenant_id = m.tenant_id
    WHERE m.tenant_id = ${tenantId}::uuid
      AND m.id = ${materialId}::uuid
    GROUP BY m.id, c.name
    LIMIT 1
  `));

  if (!material) return null;

  const balances = await listMaterialStockRows(sql`
    b.tenant_id = ${tenantId}::uuid
    AND b.material_id = ${materialId}::uuid
  `);

  const movements = rowsFrom<MaterialMovementRow>(await db.execute(sql`
    SELECT mv.id,
           m.code AS "materialCode",
           m.name AS "materialName",
           from_location.name AS "fromLocationName",
           to_location.name AS "toLocationName",
           mv.quantity::text AS quantity,
           mv.movement_type AS "movementType",
           mv.reason,
           mv.notes,
           mv.created_at::text AS "createdAt"
    FROM material_stock_movements mv
    JOIN materials m ON m.id = mv.material_id AND m.tenant_id = mv.tenant_id
    LEFT JOIN stock_locations from_location ON from_location.id = mv.from_stock_location_id
    LEFT JOIN stock_locations to_location ON to_location.id = mv.to_stock_location_id
    WHERE mv.tenant_id = ${tenantId}::uuid
      AND mv.material_id = ${materialId}::uuid
    ORDER BY mv.created_at DESC
    LIMIT 50
  `));

  const usages = rowsFrom<AssignmentMaterialUsageSummary>(await db.execute(sql`
    SELECT usage.id,
           usage.assignment_id AS "assignmentId",
           assignments.code AS "assignmentCode",
           assignments.title AS "assignmentTitle",
           COALESCE(usage.approved_name, usage.registered_name, usage.name) AS name,
           COALESCE(usage.approved_quantity, usage.registered_quantity, usage.quantity)::text AS quantity,
           COALESCE(usage.approved_unit_label, usage.registered_unit_label, usage.unit_label) AS "unitLabel",
           usage.approval_status AS "approvalStatus",
           usage.invoiceable,
           usage.customer_visible AS "customerVisible",
           usage.created_at::text AS "createdAt"
    FROM assignment_material_usage usage
    LEFT JOIN assignments ON assignments.id = usage.assignment_id AND assignments.tenant_id = usage.tenant_id
    WHERE usage.tenant_id = ${tenantId}::uuid
      AND usage.material_id = ${materialId}::uuid
    ORDER BY usage.created_at DESC
    LIMIT 50
  `));

  return { ...material, balances, movements, usages };
}

async function listMaterialStockRows(where: ReturnType<typeof sql>): Promise<MaterialStockRow[]> {
  const rows = rowsFrom<Omit<MaterialStockRow, "status">>(await db.execute(sql`
    SELECT b.id AS "balanceId",
           m.id AS "materialId",
           m.code AS "materialCode",
           m.name AS "materialName",
           m.unit,
           l.id AS "stockLocationId",
           l.name AS "stockLocationName",
           l.location_type AS "stockLocationType",
           b.quantity::text AS quantity,
           COALESCE(b.min_stock_override, m.min_stock)::text AS "minStock",
           b.last_movement_at::text AS "lastMovementAt"
    FROM material_stock_balances b
    JOIN materials m ON m.id = b.material_id AND m.tenant_id = b.tenant_id
    JOIN stock_locations l ON l.id = b.stock_location_id AND l.tenant_id = b.tenant_id
    WHERE ${where}
    ORDER BY l.location_type ASC, l.name ASC, m.name ASC
  `));

  return rows.map((row) => ({ ...row, status: materialStatus(row) }));
}

export async function listMaterialStockForObject(objectId: string): Promise<MaterialStockRow[]> {
  await requirePermission("materials", "view");
  const tenantId = await requireCurrentTenantId();
  return listMaterialStockRows(sql`
    b.tenant_id = ${tenantId}::uuid
    AND l.location_type = 'object'
    AND l.object_id = ${objectId}::uuid
  `);
}

export async function listMaterialStockForPersonnel(personnelId: string): Promise<MaterialStockRow[]> {
  await requirePermission("materials", "view");
  const tenantId = await requireCurrentTenantId();
  return listMaterialStockRows(sql`
    b.tenant_id = ${tenantId}::uuid
    AND l.location_type = 'personnel'
    AND l.personnel_id = ${personnelId}::uuid
  `);
}

export async function createMaterial(input: MaterialFormInput): Promise<ActionResult<{ id: string; code: string }>> {
  await requireMaterialsWrite("create");
  const tenantId = await requireCurrentTenantId();
  const userId = await requireActorId();

  try {
    const name = requireText(input.name, "Naam");
    const unit = requireText(input.unit, "Eenheid");
    const description = cleanText(input.description);
    const costPrice = normalizeDecimal(input.costPrice, "Kostprijs", { scale: 2 });
    const salePrice = normalizeDecimal(input.salePrice, "Verkoopprijs", { scale: 2 });
    const vatRate = normalizeDecimal(input.vatRate, "BTW", { scale: 2 });
    const minStock = normalizeDecimal(input.minStock, "Minimumvoorraad", { scale: 3 });
    const maxStock = normalizeDecimal(input.maxStock, "Maximumvoorraad", { scale: 3 });

    const result = await db.transaction(async (tx) => {
      const categoryId = await resolveCategoryId(tx, tenantId, input.categoryId, input.categoryName);
      const code = await nextMaterialCode(tx, tenantId);
      const [created] = rowsFrom<{ id: string; code: string }>(await tx.execute(sql`
        INSERT INTO materials (
          tenant_id,
          category_id,
          code,
          name,
          description,
          unit,
          cost_price,
          sale_price,
          vat_rate,
          vat_type,
          supplier_name,
          supplier_item_number,
          barcode,
          min_stock,
          max_stock,
          default_invoiceable,
          notes,
          created_by
        )
        VALUES (
          ${tenantId}::uuid,
          ${categoryId}::uuid,
          ${code},
          ${name},
          ${description},
          ${unit},
          ${costPrice}::numeric,
          ${salePrice}::numeric,
          ${vatRate}::numeric,
          ${cleanText(input.vatType)},
          ${cleanText(input.supplierName)},
          ${cleanText(input.supplierItemNumber)},
          ${cleanText(input.barcode)},
          ${minStock}::numeric,
          ${maxStock}::numeric,
          ${input.defaultInvoiceable === true},
          ${cleanText(input.notes)},
          ${userId}::uuid
        )
        RETURNING id, code
      `));

      if (!created) throw new Error("Materiaal kon niet worden aangemaakt.");
      await writeTenantAuditLog({
        tenantId,
        userId,
        action: "material_created",
        resource: "materials",
        resourceId: created.id,
        metadata: { code: created.code, name },
      });
      return created;
    });

    revalidateMaterials(result.id);
    return { success: true, data: result };
  } catch (error) {
    if ((error as { code?: string })?.code === "23505") {
      return { success: false, message: "Materiaalcode, barcode of categorie bestaat al." };
    }
    return { success: false, message: (error as Error).message };
  }
}

export async function updateMaterial(
  materialId: string,
  input: MaterialFormInput,
): Promise<ActionResult> {
  await requireMaterialsWrite("update");
  const tenantId = await requireCurrentTenantId();
  const userId = await requireActorId();

  try {
    const name = requireText(input.name, "Naam");
    const unit = requireText(input.unit, "Eenheid");
    const description = cleanText(input.description);
    const costPrice = normalizeDecimal(input.costPrice, "Kostprijs", { scale: 2 });
    const salePrice = normalizeDecimal(input.salePrice, "Verkoopprijs", { scale: 2 });
    const vatRate = normalizeDecimal(input.vatRate, "BTW", { scale: 2 });
    const minStock = normalizeDecimal(input.minStock, "Minimumvoorraad", { scale: 3 });
    const maxStock = normalizeDecimal(input.maxStock, "Maximumvoorraad", { scale: 3 });

    await db.transaction(async (tx) => {
      const categoryId = await resolveCategoryId(tx, tenantId, input.categoryId, input.categoryName);
      const [updated] = rowsFrom<{ id: string; code: string }>(await tx.execute(sql`
        UPDATE materials
        SET category_id = ${categoryId}::uuid,
            name = ${name},
            description = ${description},
            unit = ${unit},
            cost_price = ${costPrice}::numeric,
            sale_price = ${salePrice}::numeric,
            vat_rate = ${vatRate}::numeric,
            vat_type = ${cleanText(input.vatType)},
            supplier_name = ${cleanText(input.supplierName)},
            supplier_item_number = ${cleanText(input.supplierItemNumber)},
            barcode = ${cleanText(input.barcode)},
            min_stock = ${minStock}::numeric,
            max_stock = ${maxStock}::numeric,
            default_invoiceable = ${input.defaultInvoiceable === true},
            notes = ${cleanText(input.notes)},
            updated_at = now()
        WHERE tenant_id = ${tenantId}::uuid
          AND id = ${materialId}::uuid
          AND archived_at IS NULL
        RETURNING id, code
      `));
      if (!updated) throw new Error("Materiaal niet gevonden.");

      await writeTenantAuditLog({
        tenantId,
        userId,
        action: "material_updated",
        resource: "materials",
        resourceId: updated.id,
        metadata: { code: updated.code, name },
      });
    });

    revalidateMaterials(materialId);
    return { success: true };
  } catch (error) {
    if ((error as { code?: string })?.code === "23505") {
      return { success: false, message: "Barcode of categorie bestaat al." };
    }
    return { success: false, message: (error as Error).message };
  }
}

export async function archiveMaterial(materialId: string): Promise<ActionResult> {
  await requireMaterialsWrite("archive");
  const tenantId = await requireCurrentTenantId();
  const userId = await requireActorId();

  const [updated] = rowsFrom<{ id: string; code: string; name: string }>(await db.execute(sql`
    UPDATE materials
    SET is_active = false,
        archived_at = COALESCE(archived_at, now()),
        updated_at = now()
    WHERE tenant_id = ${tenantId}::uuid
      AND id = ${materialId}::uuid
    RETURNING id, code, name
  `));

  if (!updated) return { success: false, message: "Materiaal niet gevonden." };

  await writeTenantAuditLog({
    tenantId,
    userId,
    action: "material_archived",
    resource: "materials",
    resourceId: updated.id,
    metadata: { code: updated.code, name: updated.name },
  });

  revalidateMaterials(materialId);
  return { success: true };
}

export async function recordMaterialStockMovement(
  input: MaterialStockMovementInput,
): Promise<ActionResult<{ movementId: string }>> {
  const requiredPermission = input.movementType === "transferred" ? "transfer_stock" : "adjust_stock";
  await requireMaterialsWrite(requiredPermission);
  const tenantId = await requireCurrentTenantId();
  const userId = await requireActorId();

  try {
    const materialId = requireText(input.materialId, "Materiaal");
    const quantity = normalizeDecimal(input.quantity, "Aantal", {
      required: true,
      allowNegative: input.movementType === "corrected",
      scale: 3,
    });
    if (!quantity) throw new Error("Aantal is verplicht.");

    if (input.movementType !== "corrected" && decimalNumber(quantity) <= 0) {
      throw new Error("Aantal moet groter dan 0 zijn.");
    }

    const movement = await db.transaction(async (tx) => {
      await assertMaterialExists(tx, tenantId, materialId);

      let fromStockLocationId: string | null = null;
      let toStockLocationId: string | null = null;

      if (input.movementType === "transferred") {
        fromStockLocationId = cleanText(input.fromStockLocationId);
        if (!fromStockLocationId) throw new Error("Bronlocatie is verplicht bij verplaatsen.");
        const fromLocation = await getStockLocationById(tx, tenantId, fromStockLocationId);
        if (!fromLocation) throw new Error("Bronlocatie niet gevonden.");

        toStockLocationId = await resolveTargetStockLocation(tx, tenantId, {
          stockLocationId: input.toStockLocationId,
          objectId: input.toObjectId,
          personnelId: input.toPersonnelId,
        });
        if (!toStockLocationId) throw new Error("Doellocatie is verplicht bij verplaatsen.");
        if (toStockLocationId === fromStockLocationId) {
          throw new Error("Bron- en doellocatie mogen niet hetzelfde zijn.");
        }
      } else {
        toStockLocationId = await resolveTargetStockLocation(tx, tenantId, {
          stockLocationId: input.toStockLocationId,
          objectId: input.toObjectId,
          personnelId: input.toPersonnelId,
        });
        if (!toStockLocationId) throw new Error("Voorraadlocatie is verplicht.");
      }

      const [created] = rowsFrom<{ id: string }>(await tx.execute(sql`
        INSERT INTO material_stock_movements (
          tenant_id,
          material_id,
          from_stock_location_id,
          to_stock_location_id,
          quantity,
          movement_type,
          reason,
          created_by,
          notes
        )
        VALUES (
          ${tenantId}::uuid,
          ${materialId}::uuid,
          ${fromStockLocationId}::uuid,
          ${toStockLocationId}::uuid,
          ${quantity}::numeric,
          ${input.movementType},
          ${cleanText(input.reason)},
          ${userId}::uuid,
          ${cleanText(input.notes)}
        )
        RETURNING id
      `));
      if (!created) throw new Error("Voorraadmutatie kon niet worden opgeslagen.");

      if (input.movementType === "transferred") {
        await applyBalanceDelta(tx, tenantId, materialId, fromStockLocationId!, negateDecimal(quantity));
        await applyBalanceDelta(tx, tenantId, materialId, toStockLocationId!, quantity);
      } else {
        await applyBalanceDelta(tx, tenantId, materialId, toStockLocationId!, quantity);
      }

      await writeTenantAuditLog({
        tenantId,
        userId,
        action: `material_stock_${input.movementType}`,
        resource: "material_stock_movements",
        resourceId: created.id,
        metadata: {
          materialId,
          quantity,
          fromStockLocationId,
          toStockLocationId,
          reason: cleanText(input.reason),
        },
      });

      return created;
    });

    revalidateMaterials(input.materialId);
    return { success: true, data: { movementId: movement.id } };
  } catch (error) {
    return { success: false, message: (error as Error).message };
  }
}
