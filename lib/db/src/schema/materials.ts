import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { documentsTable } from "./documents";
import { objectsTable } from "./objects";
import { personnelTable } from "./personnel";
import { tenantsTable } from "./tenants";

export const STOCK_LOCATION_TYPES = [
  "object",
  "personnel",
  "vehicle",
  "warehouse",
  "office",
  "temporary",
] as const;
export type StockLocationType = (typeof STOCK_LOCATION_TYPES)[number];

export const MATERIAL_STOCK_MOVEMENT_TYPES = [
  "added",
  "used",
  "corrected",
  "transferred",
  "received",
  "returned",
  "damaged",
  "lost",
  "written_off",
  "used_on_assignment",
] as const;
export type MaterialStockMovementType = (typeof MATERIAL_STOCK_MOVEMENT_TYPES)[number];

export const materialCategoriesTable = pgTable(
  "material_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    name: varchar("name", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 180 }).notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("material_categories_tenant_slug_idx").on(table.tenantId, table.slug),
    index("material_categories_tenant_active_idx").on(table.tenantId, table.isActive),
    index("material_categories_parent_idx").on(table.parentId),
  ],
);

export const materialsTable = pgTable(
  "materials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => materialCategoriesTable.id, { onDelete: "set null" }),
    code: varchar("code", { length: 20 }).notNull(),
    name: varchar("name", { length: 220 }).notNull(),
    description: text("description"),
    unit: varchar("unit", { length: 40 }).notNull(),
    costPrice: numeric("cost_price", { precision: 12, scale: 2 }),
    salePrice: numeric("sale_price", { precision: 12, scale: 2 }),
    vatRate: numeric("vat_rate", { precision: 5, scale: 2 }),
    vatType: varchar("vat_type", { length: 40 }),
    supplierName: varchar("supplier_name", { length: 220 }),
    supplierItemNumber: varchar("supplier_item_number", { length: 120 }),
    barcode: varchar("barcode", { length: 160 }),
    imageDocumentId: uuid("image_document_id").references(() => documentsTable.id, { onDelete: "set null" }),
    isActive: boolean("is_active").notNull().default(true),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    minStock: numeric("min_stock", { precision: 12, scale: 3 }),
    maxStock: numeric("max_stock", { precision: 12, scale: 3 }),
    defaultInvoiceable: boolean("default_invoiceable").notNull().default(false),
    notes: text("notes"),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("materials_tenant_code_idx").on(table.tenantId, table.code),
    uniqueIndex("materials_tenant_barcode_idx").on(table.tenantId, table.barcode),
    index("materials_tenant_category_idx").on(table.tenantId, table.categoryId),
    index("materials_tenant_active_idx").on(table.tenantId, table.isActive),
  ],
);

export const stockLocationsTable = pgTable(
  "stock_locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    locationType: varchar("location_type", { length: 40 }).notNull().$type<StockLocationType>(),
    name: varchar("name", { length: 220 }).notNull(),
    objectId: uuid("object_id").references(() => objectsTable.id, { onDelete: "cascade" }),
    personnelId: uuid("personnel_id").references(() => personnelTable.id, { onDelete: "cascade" }),
    vehicleId: uuid("vehicle_id"),
    warehouseId: uuid("warehouse_id"),
    officeId: uuid("office_id"),
    temporaryLabel: varchar("temporary_label", { length: 220 }),
    isActive: boolean("is_active").notNull().default(true),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("stock_locations_tenant_type_idx").on(table.tenantId, table.locationType),
    index("stock_locations_tenant_object_idx").on(table.tenantId, table.objectId),
    index("stock_locations_tenant_personnel_idx").on(table.tenantId, table.personnelId),
    index("stock_locations_tenant_active_idx").on(table.tenantId, table.isActive),
  ],
);

export const materialStockBalancesTable = pgTable(
  "material_stock_balances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materialsTable.id, { onDelete: "cascade" }),
    stockLocationId: uuid("stock_location_id")
      .notNull()
      .references(() => stockLocationsTable.id, { onDelete: "cascade" }),
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull().default("0"),
    minStockOverride: numeric("min_stock_override", { precision: 12, scale: 3 }),
    maxStockOverride: numeric("max_stock_override", { precision: 12, scale: 3 }),
    lastMovementAt: timestamp("last_movement_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("material_stock_balances_tenant_material_location_idx").on(
      table.tenantId,
      table.materialId,
      table.stockLocationId,
    ),
    index("material_stock_balances_tenant_material_idx").on(table.tenantId, table.materialId),
    index("material_stock_balances_tenant_location_idx").on(table.tenantId, table.stockLocationId),
    index("material_stock_balances_tenant_quantity_idx").on(table.tenantId, table.quantity),
  ],
);

export const materialStockMovementsTable = pgTable(
  "material_stock_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materialsTable.id, { onDelete: "restrict" }),
    fromStockLocationId: uuid("from_stock_location_id").references(() => stockLocationsTable.id, {
      onDelete: "set null",
    }),
    toStockLocationId: uuid("to_stock_location_id").references(() => stockLocationsTable.id, {
      onDelete: "set null",
    }),
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
    movementType: varchar("movement_type", { length: 40 }).notNull().$type<MaterialStockMovementType>(),
    reason: text("reason"),
    assignmentId: uuid("assignment_id"),
    assignmentMaterialUsageId: uuid("assignment_material_usage_id"),
    personnelId: uuid("personnel_id").references(() => personnelTable.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    notes: text("notes"),
  },
  (table) => [
    index("material_stock_movements_tenant_material_created_idx").on(
      table.tenantId,
      table.materialId,
      table.createdAt,
    ),
    index("material_stock_movements_tenant_from_idx").on(table.tenantId, table.fromStockLocationId),
    index("material_stock_movements_tenant_to_idx").on(table.tenantId, table.toStockLocationId),
    index("material_stock_movements_tenant_assignment_idx").on(table.tenantId, table.assignmentId),
  ],
);

export type MaterialCategory = typeof materialCategoriesTable.$inferSelect;
export type InsertMaterialCategory = typeof materialCategoriesTable.$inferInsert;
export type Material = typeof materialsTable.$inferSelect;
export type InsertMaterial = typeof materialsTable.$inferInsert;
export type StockLocation = typeof stockLocationsTable.$inferSelect;
export type InsertStockLocation = typeof stockLocationsTable.$inferInsert;
export type MaterialStockBalance = typeof materialStockBalancesTable.$inferSelect;
export type InsertMaterialStockBalance = typeof materialStockBalancesTable.$inferInsert;
export type MaterialStockMovement = typeof materialStockMovementsTable.$inferSelect;
export type InsertMaterialStockMovement = typeof materialStockMovementsTable.$inferInsert;
