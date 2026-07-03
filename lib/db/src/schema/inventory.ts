import {
  boolean,
  date,
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
import { assignmentsTable } from "./assignments";
import { documentsTable } from "./documents";
import { objectsTable } from "./objects";
import { personnelTable } from "./personnel";
import { stockLocationsTable } from "./materials";
import { tenantsTable } from "./tenants";

export const INVENTORY_ITEM_STATUSES = [
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
export type InventoryItemStatus = (typeof INVENTORY_ITEM_STATUSES)[number];

export const INVENTORY_MOVEMENT_TYPES = [
  "created",
  "assigned_to_object",
  "assigned_to_personnel",
  "transferred",
  "returned",
  "lost",
  "disposed",
  "corrected",
] as const;
export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPES)[number];

export const INVENTORY_ISSUE_STATUSES = [
  "new",
  "in_progress",
  "waiting_supplier",
  "resolved",
  "unresolvable",
  "cancelled",
] as const;
export type InventoryIssueStatus = (typeof INVENTORY_ISSUE_STATUSES)[number];

export const INVENTORY_ISSUE_SEVERITIES = ["low", "normal", "high", "urgent"] as const;
export type InventoryIssueSeverity = (typeof INVENTORY_ISSUE_SEVERITIES)[number];

export const INVENTORY_MAINTENANCE_EVENT_TYPES = ["inspection", "maintenance", "repair"] as const;
export type InventoryMaintenanceEventType = (typeof INVENTORY_MAINTENANCE_EVENT_TYPES)[number];

export const INVENTORY_MAINTENANCE_STATUSES = [
  "scheduled",
  "due",
  "completed",
  "cancelled",
] as const;
export type InventoryMaintenanceStatus = (typeof INVENTORY_MAINTENANCE_STATUSES)[number];

export const ASSIGNMENT_INVENTORY_USAGE_TYPES = [
  "used",
  "rented",
  "issued",
  "returned",
  "defect_found",
] as const;
export type AssignmentInventoryUsageType = (typeof ASSIGNMENT_INVENTORY_USAGE_TYPES)[number];

export const inventoryCategoriesTable = pgTable(
  "inventory_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    name: varchar("name", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 180 }).notNull(),
    description: text("description"),
    defaultInspectionIntervalDays: integer("default_inspection_interval_days"),
    defaultMaintenanceIntervalDays: integer("default_maintenance_interval_days"),
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
    uniqueIndex("inventory_categories_tenant_slug_idx").on(table.tenantId, table.slug),
    index("inventory_categories_tenant_active_idx").on(table.tenantId, table.isActive),
    index("inventory_categories_parent_idx").on(table.parentId),
  ],
);

export const inventoryItemsTable = pgTable(
  "inventory_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 20 }).notNull(),
    categoryId: uuid("category_id").references(() => inventoryCategoriesTable.id, { onDelete: "set null" }),
    name: varchar("name", { length: 220 }).notNull(),
    type: varchar("type", { length: 120 }),
    brand: varchar("brand", { length: 120 }),
    model: varchar("model", { length: 120 }),
    serialNumber: varchar("serial_number", { length: 160 }),
    purchaseDate: date("purchase_date"),
    purchaseValue: numeric("purchase_value", { precision: 12, scale: 2 }),
    status: varchar("status", { length: 40 }).notNull().default("available").$type<InventoryItemStatus>(),
    currentStockLocationId: uuid("current_stock_location_id").references(() => stockLocationsTable.id, {
      onDelete: "set null",
    }),
    currentObjectId: uuid("current_object_id").references(() => objectsTable.id, { onDelete: "set null" }),
    currentPersonnelId: uuid("current_personnel_id").references(() => personnelTable.id, {
      onDelete: "set null",
    }),
    qrToken: varchar("qr_token", { length: 160 }).notNull(),
    qrGeneratedAt: timestamp("qr_generated_at", { withTimezone: true }),
    imageDocumentId: uuid("image_document_id").references(() => documentsTable.id, { onDelete: "set null" }),
    nextInspectionDate: date("next_inspection_date"),
    lastInspectionDate: date("last_inspection_date"),
    inspectionIntervalDays: integer("inspection_interval_days"),
    maintenanceIntervalDays: integer("maintenance_interval_days"),
    warrantyUntil: date("warranty_until"),
    customerVisible: boolean("customer_visible").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    notes: text("notes"),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("inventory_items_tenant_code_idx").on(table.tenantId, table.code),
    uniqueIndex("inventory_items_tenant_qr_token_idx").on(table.tenantId, table.qrToken),
    uniqueIndex("inventory_items_tenant_serial_idx").on(table.tenantId, table.serialNumber),
    index("inventory_items_tenant_status_idx").on(table.tenantId, table.status),
    index("inventory_items_tenant_category_idx").on(table.tenantId, table.categoryId),
    index("inventory_items_tenant_location_idx").on(table.tenantId, table.currentStockLocationId),
    index("inventory_items_tenant_object_idx").on(table.tenantId, table.currentObjectId),
    index("inventory_items_tenant_personnel_idx").on(table.tenantId, table.currentPersonnelId),
    index("inventory_items_tenant_next_inspection_idx").on(table.tenantId, table.nextInspectionDate),
  ],
);

export const inventoryMovementsTable = pgTable(
  "inventory_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    inventoryItemId: uuid("inventory_item_id")
      .notNull()
      .references(() => inventoryItemsTable.id, { onDelete: "cascade" }),
    fromStockLocationId: uuid("from_stock_location_id").references(() => stockLocationsTable.id, {
      onDelete: "set null",
    }),
    toStockLocationId: uuid("to_stock_location_id").references(() => stockLocationsTable.id, {
      onDelete: "set null",
    }),
    movementType: varchar("movement_type", { length: 40 }).notNull().$type<InventoryMovementType>(),
    assignmentId: uuid("assignment_id").references(() => assignmentsTable.id, { onDelete: "set null" }),
    reason: text("reason"),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    notes: text("notes"),
  },
  (table) => [
    index("inventory_movements_tenant_item_created_idx").on(
      table.tenantId,
      table.inventoryItemId,
      table.createdAt,
    ),
    index("inventory_movements_tenant_to_idx").on(table.tenantId, table.toStockLocationId),
    index("inventory_movements_tenant_assignment_idx").on(table.tenantId, table.assignmentId),
  ],
);

export const inventoryIssuesTable = pgTable(
  "inventory_issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    inventoryItemId: uuid("inventory_item_id")
      .notNull()
      .references(() => inventoryItemsTable.id, { onDelete: "cascade" }),
    assignmentId: uuid("assignment_id").references(() => assignmentsTable.id, { onDelete: "set null" }),
    objectId: uuid("object_id").references(() => objectsTable.id, { onDelete: "set null" }),
    personnelId: uuid("personnel_id").references(() => personnelTable.id, { onDelete: "set null" }),
    reportedBy: uuid("reported_by").notNull(),
    severity: varchar("severity", { length: 20 }).notNull().default("normal").$type<InventoryIssueSeverity>(),
    status: varchar("status", { length: 30 }).notNull().default("new").$type<InventoryIssueStatus>(),
    description: text("description").notNull(),
    resolutionNotes: text("resolution_notes"),
    resolvedBy: uuid("resolved_by"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("inventory_issues_tenant_status_idx").on(table.tenantId, table.status),
    index("inventory_issues_tenant_item_idx").on(table.tenantId, table.inventoryItemId),
    index("inventory_issues_tenant_assignment_idx").on(table.tenantId, table.assignmentId),
    index("inventory_issues_tenant_reported_by_idx").on(table.tenantId, table.reportedBy),
  ],
);

export const inventoryMaintenanceEventsTable = pgTable(
  "inventory_maintenance_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    inventoryItemId: uuid("inventory_item_id")
      .notNull()
      .references(() => inventoryItemsTable.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 30 }).notNull().$type<InventoryMaintenanceEventType>(),
    status: varchar("status", { length: 30 }).notNull().default("scheduled").$type<InventoryMaintenanceStatus>(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    dueDate: date("due_date"),
    performedAt: timestamp("performed_at", { withTimezone: true }),
    performedBy: uuid("performed_by").references(() => personnelTable.id, { onDelete: "set null" }),
    notes: text("notes"),
    documentId: uuid("document_id").references(() => documentsTable.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("inventory_maintenance_tenant_item_idx").on(table.tenantId, table.inventoryItemId),
    index("inventory_maintenance_tenant_due_idx").on(table.tenantId, table.dueDate),
    index("inventory_maintenance_tenant_status_idx").on(table.tenantId, table.status),
  ],
);

export const assignmentInventoryItemsTable = pgTable(
  "assignment_inventory_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignmentsTable.id, { onDelete: "cascade" }),
    inventoryItemId: uuid("inventory_item_id")
      .notNull()
      .references(() => inventoryItemsTable.id, { onDelete: "restrict" }),
    usageType: varchar("usage_type", { length: 40 }).notNull().default("used").$type<AssignmentInventoryUsageType>(),
    registeredQuantity: numeric("registered_quantity", { precision: 12, scale: 3 }),
    registeredPeriodLabel: varchar("registered_period_label", { length: 80 }),
    invoiceable: boolean("invoiceable").notNull().default(false),
    customerVisible: boolean("customer_visible").notNull().default(false),
    approvedQuantity: numeric("approved_quantity", { precision: 12, scale: 3 }),
    approvedUnitPrice: numeric("approved_unit_price", { precision: 12, scale: 2 }),
    approvedVatRate: numeric("approved_vat_rate", { precision: 5, scale: 2 }),
    approvalStatus: varchar("approval_status", { length: 30 }).notNull().default("pending"),
    approvalReason: text("approval_reason"),
    approvedBy: uuid("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    attachedBy: uuid("attached_by").notNull(),
    attachedAt: timestamp("attached_at", { withTimezone: true }).notNull().defaultNow(),
    notes: text("notes"),
  },
  (table) => [
    uniqueIndex("assignment_inventory_items_tenant_assignment_item_idx").on(
      table.tenantId,
      table.assignmentId,
      table.inventoryItemId,
    ),
    index("assignment_inventory_items_tenant_assignment_idx").on(table.tenantId, table.assignmentId),
    index("assignment_inventory_items_tenant_item_idx").on(table.tenantId, table.inventoryItemId),
    index("assignment_inventory_items_tenant_approval_idx").on(table.tenantId, table.approvalStatus),
  ],
);

export type InventoryCategory = typeof inventoryCategoriesTable.$inferSelect;
export type InsertInventoryCategory = typeof inventoryCategoriesTable.$inferInsert;
export type InventoryItem = typeof inventoryItemsTable.$inferSelect;
export type InsertInventoryItem = typeof inventoryItemsTable.$inferInsert;
export type InventoryMovement = typeof inventoryMovementsTable.$inferSelect;
export type InsertInventoryMovement = typeof inventoryMovementsTable.$inferInsert;
export type InventoryIssue = typeof inventoryIssuesTable.$inferSelect;
export type InsertInventoryIssue = typeof inventoryIssuesTable.$inferInsert;
export type InventoryMaintenanceEvent = typeof inventoryMaintenanceEventsTable.$inferSelect;
export type InsertInventoryMaintenanceEvent = typeof inventoryMaintenanceEventsTable.$inferInsert;
export type AssignmentInventoryItem = typeof assignmentInventoryItemsTable.$inferSelect;
export type InsertAssignmentInventoryItem = typeof assignmentInventoryItemsTable.$inferInsert;
