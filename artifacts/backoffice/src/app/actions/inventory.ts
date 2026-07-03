"use server";

import { db } from "@workspace/db";
import { sql, type SQL } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { getCurrentBackofficeUser, requireCurrentTenantId } from "@/lib/auth/tenant";

export type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; message: string; fieldErrors?: Record<string, string> };

const INVENTORY_STATUS_OPTIONS = [
  "available",
  "in_use",
  "assigned_to_object",
  "assigned_to_personnel",
  "maintenance",
  "defect",
  "out_of_service",
  "lost",
  "disposed",
  "archived",
] as const;

export type InventoryStatus = (typeof INVENTORY_STATUS_OPTIONS)[number];

export type InventoryRow = {
  id: string;
  code: string;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  type: string | null;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  status: InventoryStatus | string;
  currentStockLocationId: string | null;
  currentLocationName: string | null;
  currentObjectId: string | null;
  currentObjectName: string | null;
  currentPersonnelId: string | null;
  currentPersonnelName: string | null;
  nextInspectionDate: string | null;
  isActive: boolean;
  archivedAt: string | null;
  createdAt: string;
};

export type InventoryMovementRow = {
  id: string;
  movementType: string;
  fromLocationName: string | null;
  toLocationName: string | null;
  assignmentCode: string | null;
  reason: string | null;
  notes: string | null;
  createdAt: string;
};

export type InventoryDetail = InventoryRow & {
  purchaseDate: string | null;
  purchaseValue: string | null;
  warrantyUntil: string | null;
  lastInspectionDate: string | null;
  inspectionIntervalDays: number | null;
  maintenanceIntervalDays: number | null;
  customerVisible: boolean;
  notes: string | null;
  qrToken: string;
  movements: InventoryMovementRow[];
};

export type InventoryDossierItem = Pick<
  InventoryRow,
  | "id"
  | "code"
  | "name"
  | "categoryName"
  | "type"
  | "brand"
  | "model"
  | "serialNumber"
  | "status"
  | "currentLocationName"
  | "nextInspectionDate"
  | "archivedAt"
>;

export type InventoryCategoryOption = { id: string; name: string };
export type InventoryEntityOption = { id: string; label: string; meta: string | null };
export type InventoryStockLocationOption = {
  id: string;
  name: string;
  locationType: string;
  objectId: string | null;
  personnelId: string | null;
};

export type InventoryManagementOptions = {
  categories: InventoryCategoryOption[];
  stockLocations: InventoryStockLocationOption[];
  objects: InventoryEntityOption[];
  personnel: InventoryEntityOption[];
};

export type InventoryFormInput = {
  name: string;
  categoryId?: string | null;
  categoryName?: string | null;
  type?: string | null;
  brand?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  purchaseDate?: string | null;
  purchaseValue?: string | null;
  status?: string | null;
  locationType?: "none" | "object" | "personnel" | "existing" | string | null;
  stockLocationId?: string | null;
  objectId?: string | null;
  personnelId?: string | null;
  nextInspectionDate?: string | null;
  lastInspectionDate?: string | null;
  inspectionIntervalDays?: string | null;
  maintenanceIntervalDays?: string | null;
  warrantyUntil?: string | null;
  customerVisible?: boolean;
  notes?: string | null;
  movementReason?: string | null;
};

type SqlResult<T> = { rows?: T[] } | T[];
type DbExecutor = { execute: (query: SQL) => Promise<unknown> };

type ResolvedLocation = {
  stockLocationId: string | null;
  objectId: string | null;
  personnelId: string | null;
  locationName: string | null;
};

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

function normalizeDecimal(value: unknown, label: string, scale = 2): string | null {
  const raw = cleanText(value);
  if (!raw) return null;
  const parsed = Number(raw.replace(",", "."));
  if (!Number.isFinite(parsed)) throw new Error(`${label} moet een geldig getal zijn.`);
  if (parsed < 0) throw new Error(`${label} mag niet negatief zijn.`);
  return parsed.toFixed(scale).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function normalizeInteger(value: unknown, label: string): number | null {
  const raw = cleanText(value);
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${label} moet minimaal 1 zijn.`);
  return parsed;
}

function normalizeDate(value: unknown, label: string): string | null {
  const raw = cleanText(value);
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error(`${label} moet een geldige datum zijn.`);
  return raw;
}

function normalizeStatus(value: unknown, fallback: InventoryStatus = "available"): InventoryStatus {
  const raw = cleanText(value);
  return INVENTORY_STATUS_OPTIONS.includes(raw as InventoryStatus) ? raw as InventoryStatus : fallback;
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

function inferStatusForLocation(location: ResolvedLocation, requestedStatus: InventoryStatus): InventoryStatus {
  if (requestedStatus !== "available") return requestedStatus;
  if (location.objectId) return "assigned_to_object";
  if (location.personnelId) return "assigned_to_personnel";
  return requestedStatus;
}

function movementTypeFor(location: ResolvedLocation, status: InventoryStatus): string {
  if (status === "lost") return "lost";
  if (status === "disposed" || status === "archived") return "disposed";
  if (location.objectId) return "assigned_to_object";
  if (location.personnelId) return "assigned_to_personnel";
  if (location.stockLocationId) return "transferred";
  return "corrected";
}

async function requireInventoryWrite(action: string): Promise<void> {
  if (await hasPermission("inventory", action)) return;
  if (await hasPermission("inventory", "manage")) return;
  throw new Error(`Forbidden: inventory:${action}`);
}

async function requireActorId(): Promise<string> {
  const user = await getCurrentBackofficeUser();
  if (!user) throw new Error("Geen ingelogde gebruiker gevonden.");
  return user.id;
}

function revalidateInventory(itemId?: string | null) {
  revalidatePath("/inventory");
  if (itemId) revalidatePath(`/inventory/${itemId}`);
  revalidatePath("/objects");
  revalidatePath("/personnel");
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

async function nextInventoryCode(tx: DbExecutor, tenantId: string): Promise<string> {
  const result = await tx.execute(sql`
    INSERT INTO tenant_sequences (tenant_id, sequence_key, next_value)
    VALUES (${tenantId}::uuid, 'inventory_code', 2)
    ON CONFLICT (tenant_id, sequence_key)
    DO UPDATE SET next_value = tenant_sequences.next_value + 1,
                  updated_at = now()
    RETURNING (next_value - 1)::int AS value
  `);
  const [row] = rowsFrom<{ value: number }>(result);
  if (!row) throw new Error("Kon geen inventariscode genereren.");
  return `I${String(row.value).padStart(6, "0")}`;
}

async function resolveCategoryId(
  tx: DbExecutor,
  tenantId: string,
  categoryId?: string | null,
  categoryName?: string | null,
): Promise<string | null> {
  const cleanCategoryId = cleanText(categoryId);
  if (cleanCategoryId) {
    const [existing] = rowsFrom<{ id: string }>(await tx.execute(sql`
      SELECT id
      FROM inventory_categories
      WHERE tenant_id = ${tenantId}::uuid
        AND id = ${cleanCategoryId}::uuid
        AND archived_at IS NULL
      LIMIT 1
    `));
    if (!existing) throw new Error("Inventariscategorie niet gevonden.");
    return existing.id;
  }

  const name = cleanText(categoryName);
  if (!name) return null;
  const slug = slugify(name);
  const [row] = rowsFrom<{ id: string }>(await tx.execute(sql`
    INSERT INTO inventory_categories (tenant_id, name, slug)
    VALUES (${tenantId}::uuid, ${name}, ${slug})
    ON CONFLICT (tenant_id, slug)
    DO UPDATE SET name = EXCLUDED.name,
                  archived_at = NULL,
                  is_active = true,
                  updated_at = now()
    RETURNING id
  `));
  return row?.id ?? null;
}

async function getStockLocationById(
  tx: DbExecutor,
  tenantId: string,
  stockLocationId: string,
): Promise<ResolvedLocation | null> {
  const [row] = rowsFrom<ResolvedLocation>(await tx.execute(sql`
    SELECT id AS "stockLocationId",
           object_id::text AS "objectId",
           personnel_id::text AS "personnelId",
           name AS "locationName"
    FROM stock_locations
    WHERE tenant_id = ${tenantId}::uuid
      AND id = ${stockLocationId}::uuid
      AND archived_at IS NULL
    LIMIT 1
  `));
  return row ?? null;
}

async function ensureObjectStockLocation(tx: DbExecutor, tenantId: string, objectId: string): Promise<ResolvedLocation> {
  const [objectRow] = rowsFrom<{ id: string; name: string }>(await tx.execute(sql`
    SELECT id, name
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

  if (existing) {
    return {
      stockLocationId: existing.id,
      objectId: objectRow.id,
      personnelId: null,
      locationName: objectRow.name,
    };
  }

  const [created] = rowsFrom<{ id: string }>(await tx.execute(sql`
    INSERT INTO stock_locations (tenant_id, location_type, name, object_id)
    VALUES (${tenantId}::uuid, 'object', ${objectRow.name}, ${objectId}::uuid)
    RETURNING id
  `));
  if (!created) throw new Error("Kon inventarislocatie voor object niet aanmaken.");

  return {
    stockLocationId: created.id,
    objectId: objectRow.id,
    personnelId: null,
    locationName: objectRow.name,
  };
}

async function ensurePersonnelStockLocation(tx: DbExecutor, tenantId: string, personnelId: string): Promise<ResolvedLocation> {
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

  if (existing) {
    return {
      stockLocationId: existing.id,
      objectId: null,
      personnelId: personnelRow.id,
      locationName: personnelRow.name,
    };
  }

  const [created] = rowsFrom<{ id: string }>(await tx.execute(sql`
    INSERT INTO stock_locations (tenant_id, location_type, name, personnel_id)
    VALUES (${tenantId}::uuid, 'personnel', ${personnelRow.name}, ${personnelId}::uuid)
    RETURNING id
  `));
  if (!created) throw new Error("Kon inventarislocatie voor personeelslid niet aanmaken.");

  return {
    stockLocationId: created.id,
    objectId: null,
    personnelId: personnelRow.id,
    locationName: personnelRow.name,
  };
}

async function resolveLocation(
  tx: DbExecutor,
  tenantId: string,
  input: InventoryFormInput,
): Promise<ResolvedLocation> {
  const locationType = cleanText(input.locationType) ?? "none";
  if (locationType === "existing") {
    const stockLocationId = requireText(input.stockLocationId, "Locatie");
    const location = await getStockLocationById(tx, tenantId, stockLocationId);
    if (!location) throw new Error("Inventarislocatie niet gevonden.");
    return location;
  }
  if (locationType === "object") {
    return ensureObjectStockLocation(tx, tenantId, requireText(input.objectId, "Object"));
  }
  if (locationType === "personnel") {
    return ensurePersonnelStockLocation(tx, tenantId, requireText(input.personnelId, "Personeelslid"));
  }

  return { stockLocationId: null, objectId: null, personnelId: null, locationName: null };
}

export async function listInventory(params: {
  search?: string;
  status?: string;
  categoryId?: string;
  page?: number;
} = {}): Promise<{ rows: InventoryRow[]; total: number }> {
  await requirePermission("inventory", "view");
  const tenantId = await requireCurrentTenantId();
  const search = cleanText(params.search);
  const term = search ? `%${search}%` : null;
  const status = cleanText(params.status) ?? "active";
  const categoryId = cleanText(params.categoryId);
  const page = Math.max(1, params.page ?? 1);
  const offset = (page - 1) * PAGE_SIZE;
  const whereStatus = status === "archived"
    ? sql`i.archived_at IS NOT NULL`
    : status === "inactive"
      ? sql`i.archived_at IS NULL AND i.is_active = false`
      : INVENTORY_STATUS_OPTIONS.includes(status as InventoryStatus)
        ? sql`i.archived_at IS NULL AND i.status = ${status}`
        : sql`i.archived_at IS NULL AND i.is_active = true`;

  const rows = rowsFrom<InventoryRow>(await db.execute(sql`
    SELECT i.id,
           i.code,
           i.name,
           i.category_id::text AS "categoryId",
           c.name AS "categoryName",
           i.type,
           i.brand,
           i.model,
           i.serial_number AS "serialNumber",
           i.status,
           i.current_stock_location_id::text AS "currentStockLocationId",
           l.name AS "currentLocationName",
           i.current_object_id::text AS "currentObjectId",
           objects.name AS "currentObjectName",
           i.current_personnel_id::text AS "currentPersonnelId",
           trim(concat(personnel.first_name, ' ', personnel.last_name)) AS "currentPersonnelName",
           i.next_inspection_date::text AS "nextInspectionDate",
           i.is_active AS "isActive",
           i.archived_at::text AS "archivedAt",
           i.created_at::text AS "createdAt"
    FROM inventory_items i
    LEFT JOIN inventory_categories c ON c.id = i.category_id AND c.tenant_id = i.tenant_id
    LEFT JOIN stock_locations l ON l.id = i.current_stock_location_id AND l.tenant_id = i.tenant_id
    LEFT JOIN objects ON objects.id = i.current_object_id AND objects.tenant_id = i.tenant_id
    LEFT JOIN personnel ON personnel.id = i.current_personnel_id AND personnel.tenant_id = i.tenant_id
    WHERE i.tenant_id = ${tenantId}::uuid
      AND ${whereStatus}
      AND (${term}::text IS NULL OR i.name ILIKE ${term} OR i.code ILIKE ${term} OR i.serial_number ILIKE ${term})
      AND (${categoryId}::uuid IS NULL OR i.category_id = ${categoryId}::uuid)
    ORDER BY i.name ASC
    LIMIT ${PAGE_SIZE} OFFSET ${offset}
  `));

  const [countRow] = rowsFrom<{ total: number }>(await db.execute(sql`
    SELECT count(*)::int AS total
    FROM inventory_items i
    WHERE i.tenant_id = ${tenantId}::uuid
      AND ${whereStatus}
      AND (${term}::text IS NULL OR i.name ILIKE ${term} OR i.code ILIKE ${term} OR i.serial_number ILIKE ${term})
      AND (${categoryId}::uuid IS NULL OR i.category_id = ${categoryId}::uuid)
  `));

  return { rows, total: countRow?.total ?? 0 };
}

export async function listInventoryManagementOptions(): Promise<InventoryManagementOptions> {
  await requirePermission("inventory", "view");
  const tenantId = await requireCurrentTenantId();

  const [categories, stockLocations, objects, personnel] = await Promise.all([
    db.execute(sql`
      SELECT id, name
      FROM inventory_categories
      WHERE tenant_id = ${tenantId}::uuid
        AND archived_at IS NULL
        AND is_active = true
      ORDER BY name ASC
    `),
    db.execute(sql`
      SELECT id,
             name,
             location_type AS "locationType",
             object_id::text AS "objectId",
             personnel_id::text AS "personnelId"
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
    categories: rowsFrom<InventoryCategoryOption>(categories),
    stockLocations: rowsFrom<InventoryStockLocationOption>(stockLocations),
    objects: rowsFrom<InventoryEntityOption>(objects),
    personnel: rowsFrom<InventoryEntityOption>(personnel),
  };
}

export async function getInventoryDetail(itemId: string): Promise<InventoryDetail | null> {
  await requirePermission("inventory", "view");
  const tenantId = await requireCurrentTenantId();

  const [item] = rowsFrom<InventoryDetail>(await db.execute(sql`
    SELECT i.id,
           i.code,
           i.name,
           i.category_id::text AS "categoryId",
           c.name AS "categoryName",
           i.type,
           i.brand,
           i.model,
           i.serial_number AS "serialNumber",
           i.purchase_date::text AS "purchaseDate",
           i.purchase_value::text AS "purchaseValue",
           i.status,
           i.current_stock_location_id::text AS "currentStockLocationId",
           l.name AS "currentLocationName",
           i.current_object_id::text AS "currentObjectId",
           objects.name AS "currentObjectName",
           i.current_personnel_id::text AS "currentPersonnelId",
           trim(concat(personnel.first_name, ' ', personnel.last_name)) AS "currentPersonnelName",
           i.next_inspection_date::text AS "nextInspectionDate",
           i.last_inspection_date::text AS "lastInspectionDate",
           i.inspection_interval_days AS "inspectionIntervalDays",
           i.maintenance_interval_days AS "maintenanceIntervalDays",
           i.warranty_until::text AS "warrantyUntil",
           i.customer_visible AS "customerVisible",
           i.is_active AS "isActive",
           i.archived_at::text AS "archivedAt",
           i.notes,
           i.qr_token AS "qrToken",
           i.created_at::text AS "createdAt"
    FROM inventory_items i
    LEFT JOIN inventory_categories c ON c.id = i.category_id AND c.tenant_id = i.tenant_id
    LEFT JOIN stock_locations l ON l.id = i.current_stock_location_id AND l.tenant_id = i.tenant_id
    LEFT JOIN objects ON objects.id = i.current_object_id AND objects.tenant_id = i.tenant_id
    LEFT JOIN personnel ON personnel.id = i.current_personnel_id AND personnel.tenant_id = i.tenant_id
    WHERE i.tenant_id = ${tenantId}::uuid
      AND i.id = ${itemId}::uuid
    LIMIT 1
  `));

  if (!item) return null;

  const movements = rowsFrom<InventoryMovementRow>(await db.execute(sql`
    SELECT mv.id,
           mv.movement_type AS "movementType",
           from_location.name AS "fromLocationName",
           to_location.name AS "toLocationName",
           assignments.code AS "assignmentCode",
           mv.reason,
           mv.notes,
           mv.created_at::text AS "createdAt"
    FROM inventory_movements mv
    LEFT JOIN stock_locations from_location ON from_location.id = mv.from_stock_location_id AND from_location.tenant_id = mv.tenant_id
    LEFT JOIN stock_locations to_location ON to_location.id = mv.to_stock_location_id AND to_location.tenant_id = mv.tenant_id
    LEFT JOIN assignments ON assignments.id = mv.assignment_id AND assignments.tenant_id = mv.tenant_id
    WHERE mv.tenant_id = ${tenantId}::uuid
      AND mv.inventory_item_id = ${itemId}::uuid
    ORDER BY mv.created_at DESC
    LIMIT 80
  `));

  return { ...item, movements };
}

async function listInventoryForWhere(where: SQL): Promise<InventoryDossierItem[]> {
  return rowsFrom<InventoryDossierItem>(await db.execute(sql`
    SELECT i.id,
           i.code,
           i.name,
           c.name AS "categoryName",
           i.type,
           i.brand,
           i.model,
           i.serial_number AS "serialNumber",
           i.status,
           l.name AS "currentLocationName",
           i.next_inspection_date::text AS "nextInspectionDate",
           i.archived_at::text AS "archivedAt"
    FROM inventory_items i
    LEFT JOIN inventory_categories c ON c.id = i.category_id AND c.tenant_id = i.tenant_id
    LEFT JOIN stock_locations l ON l.id = i.current_stock_location_id AND l.tenant_id = i.tenant_id
    WHERE ${where}
    ORDER BY i.name ASC
  `));
}

export async function listInventoryForObject(objectId: string): Promise<InventoryDossierItem[]> {
  await requirePermission("inventory", "view");
  const tenantId = await requireCurrentTenantId();
  return listInventoryForWhere(sql`
    i.tenant_id = ${tenantId}::uuid
    AND i.current_object_id = ${objectId}::uuid
  `);
}

export async function listInventoryForPersonnel(personnelId: string): Promise<InventoryDossierItem[]> {
  await requirePermission("inventory", "view");
  const tenantId = await requireCurrentTenantId();
  return listInventoryForWhere(sql`
    i.tenant_id = ${tenantId}::uuid
    AND i.current_personnel_id = ${personnelId}::uuid
  `);
}

export async function createInventoryItem(input: InventoryFormInput): Promise<ActionResult<{ id: string; code: string }>> {
  await requireInventoryWrite("create");
  const tenantId = await requireCurrentTenantId();
  const userId = await requireActorId();

  try {
    const name = requireText(input.name, "Naam");
    const purchaseDate = normalizeDate(input.purchaseDate, "Aanschafdatum");
    const purchaseValue = normalizeDecimal(input.purchaseValue, "Aanschafwaarde", 2);
    const nextInspectionDate = normalizeDate(input.nextInspectionDate, "Volgende keuring");
    const lastInspectionDate = normalizeDate(input.lastInspectionDate, "Laatste keuring");
    const warrantyUntil = normalizeDate(input.warrantyUntil, "Garantie tot");
    const inspectionIntervalDays = normalizeInteger(input.inspectionIntervalDays, "Keuringsinterval");
    const maintenanceIntervalDays = normalizeInteger(input.maintenanceIntervalDays, "Onderhoudsinterval");

    const result = await db.transaction(async (tx) => {
      const exec = tx as unknown as DbExecutor;
      const categoryId = await resolveCategoryId(exec, tenantId, input.categoryId, input.categoryName);
      const location = await resolveLocation(exec, tenantId, input);
      const requestedStatus = normalizeStatus(input.status);
      const status = inferStatusForLocation(location, requestedStatus);
      const code = await nextInventoryCode(exec, tenantId);
      const qrToken = `inv_${randomUUID()}`;

      const [created] = rowsFrom<{ id: string; code: string }>(await exec.execute(sql`
        INSERT INTO inventory_items (
          tenant_id, code, category_id, name, type, brand, model, serial_number,
          purchase_date, purchase_value, status, current_stock_location_id,
          current_object_id, current_personnel_id, qr_token, qr_generated_at,
          next_inspection_date, last_inspection_date, inspection_interval_days,
          maintenance_interval_days, warranty_until, customer_visible, notes, created_by
        ) VALUES (
          ${tenantId}::uuid, ${code}, ${categoryId}::uuid, ${name}, ${cleanText(input.type)},
          ${cleanText(input.brand)}, ${cleanText(input.model)}, ${cleanText(input.serialNumber)},
          ${purchaseDate}::date, ${purchaseValue}::numeric, ${status}, ${location.stockLocationId}::uuid,
          ${location.objectId}::uuid, ${location.personnelId}::uuid, ${qrToken}, now(),
          ${nextInspectionDate}::date, ${lastInspectionDate}::date, ${inspectionIntervalDays},
          ${maintenanceIntervalDays}, ${warrantyUntil}::date, ${input.customerVisible === true},
          ${cleanText(input.notes)}, ${userId}::uuid
        )
        RETURNING id, code
      `));
      if (!created) throw new Error("Inventarisitem kon niet worden aangemaakt.");

      await exec.execute(sql`
        INSERT INTO inventory_movements (
          tenant_id, inventory_item_id, to_stock_location_id, movement_type, reason, created_by, notes
        ) VALUES (
          ${tenantId}::uuid, ${created.id}::uuid, ${location.stockLocationId}::uuid,
          ${movementTypeFor(location, status)}, ${cleanText(input.movementReason) ?? "Aangemaakt"},
          ${userId}::uuid, ${cleanText(input.notes)}
        )
      `);

      return created;
    });

    await writeTenantAuditLog({
      tenantId,
      userId,
      action: "inventory_item_created",
      resource: "inventory_items",
      resourceId: result.id,
      metadata: { code: result.code, name },
    });

    revalidateInventory(result.id);
    return { success: true, data: result };
  } catch (error) {
    if ((error as { code?: string })?.code === "23505") {
      return { success: false, message: "Inventariscode, QR-token of serienummer bestaat al." };
    }
    return { success: false, message: (error as Error).message };
  }
}

export async function updateInventoryItem(itemId: string, input: InventoryFormInput): Promise<ActionResult> {
  await requireInventoryWrite("update");
  const tenantId = await requireCurrentTenantId();
  const userId = await requireActorId();

  try {
    const name = requireText(input.name, "Naam");
    const purchaseDate = normalizeDate(input.purchaseDate, "Aanschafdatum");
    const purchaseValue = normalizeDecimal(input.purchaseValue, "Aanschafwaarde", 2);
    const nextInspectionDate = normalizeDate(input.nextInspectionDate, "Volgende keuring");
    const lastInspectionDate = normalizeDate(input.lastInspectionDate, "Laatste keuring");
    const warrantyUntil = normalizeDate(input.warrantyUntil, "Garantie tot");
    const inspectionIntervalDays = normalizeInteger(input.inspectionIntervalDays, "Keuringsinterval");
    const maintenanceIntervalDays = normalizeInteger(input.maintenanceIntervalDays, "Onderhoudsinterval");

    await db.transaction(async (tx) => {
      const exec = tx as unknown as DbExecutor;
      const [existing] = rowsFrom<{
        id: string;
        code: string;
        status: InventoryStatus;
        currentStockLocationId: string | null;
      }>(await exec.execute(sql`
        SELECT id,
               code,
               status,
               current_stock_location_id::text AS "currentStockLocationId"
        FROM inventory_items
        WHERE tenant_id = ${tenantId}::uuid
          AND id = ${itemId}::uuid
          AND archived_at IS NULL
        LIMIT 1
      `));
      if (!existing) throw new Error("Inventarisitem niet gevonden.");

      const categoryId = await resolveCategoryId(exec, tenantId, input.categoryId, input.categoryName);
      const location = await resolveLocation(exec, tenantId, input);
      const requestedStatus = normalizeStatus(input.status, existing.status);
      const status = inferStatusForLocation(location, requestedStatus);

      const [updated] = rowsFrom<{ id: string; code: string }>(await exec.execute(sql`
        UPDATE inventory_items
        SET category_id = ${categoryId}::uuid,
            name = ${name},
            type = ${cleanText(input.type)},
            brand = ${cleanText(input.brand)},
            model = ${cleanText(input.model)},
            serial_number = ${cleanText(input.serialNumber)},
            purchase_date = ${purchaseDate}::date,
            purchase_value = ${purchaseValue}::numeric,
            status = ${status},
            current_stock_location_id = ${location.stockLocationId}::uuid,
            current_object_id = ${location.objectId}::uuid,
            current_personnel_id = ${location.personnelId}::uuid,
            next_inspection_date = ${nextInspectionDate}::date,
            last_inspection_date = ${lastInspectionDate}::date,
            inspection_interval_days = ${inspectionIntervalDays},
            maintenance_interval_days = ${maintenanceIntervalDays},
            warranty_until = ${warrantyUntil}::date,
            customer_visible = ${input.customerVisible === true},
            notes = ${cleanText(input.notes)},
            updated_at = now()
        WHERE tenant_id = ${tenantId}::uuid
          AND id = ${itemId}::uuid
          AND archived_at IS NULL
        RETURNING id, code
      `));
      if (!updated) throw new Error("Inventarisitem kon niet worden bijgewerkt.");

      const locationChanged = existing.currentStockLocationId !== location.stockLocationId;
      const statusChanged = existing.status !== status;
      if (locationChanged || statusChanged) {
        await exec.execute(sql`
          INSERT INTO inventory_movements (
            tenant_id, inventory_item_id, from_stock_location_id, to_stock_location_id,
            movement_type, reason, created_by, notes
          ) VALUES (
            ${tenantId}::uuid, ${itemId}::uuid, ${existing.currentStockLocationId}::uuid,
            ${location.stockLocationId}::uuid, ${movementTypeFor(location, status)},
            ${cleanText(input.movementReason)}, ${userId}::uuid, ${cleanText(input.notes)}
          )
        `);
      }
    });

    await writeTenantAuditLog({
      tenantId,
      userId,
      action: "inventory_item_updated",
      resource: "inventory_items",
      resourceId: itemId,
      metadata: { name, status: input.status ?? null },
    });

    revalidateInventory(itemId);
    return { success: true };
  } catch (error) {
    if ((error as { code?: string })?.code === "23505") {
      return { success: false, message: "Serienummer of categorie bestaat al." };
    }
    return { success: false, message: (error as Error).message };
  }
}

export async function archiveInventoryItem(itemId: string): Promise<ActionResult> {
  await requireInventoryWrite("archive");
  const tenantId = await requireCurrentTenantId();
  const userId = await requireActorId();

  const [updated] = rowsFrom<{ id: string; code: string; name: string }>(await db.execute(sql`
    UPDATE inventory_items
    SET is_active = false,
        status = 'archived',
        archived_at = COALESCE(archived_at, now()),
        updated_at = now()
    WHERE tenant_id = ${tenantId}::uuid
      AND id = ${itemId}::uuid
    RETURNING id, code, name
  `));

  if (!updated) return { success: false, message: "Inventarisitem niet gevonden." };

  await writeTenantAuditLog({
    tenantId,
    userId,
    action: "inventory_item_archived",
    resource: "inventory_items",
    resourceId: updated.id,
    metadata: { code: updated.code, name: updated.name },
  });

  revalidateInventory(itemId);
  return { success: true };
}
