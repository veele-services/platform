import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { assignmentsTable } from "./assignments";
import { customersTable } from "./customers";
import { objectsTable } from "./objects";
import { personnelTable } from "./personnel";
import { tenantsTable } from "./tenants";

export const REGION_LINK_SOURCES = ["legacy_backfill", "manual", "object_default", "planning"] as const;
export type RegionLinkSource = (typeof REGION_LINK_SOURCES)[number];

export const tenantRegionsTable = pgTable(
  "tenant_regions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    normalizedName: varchar("normalized_name", { length: 120 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("tenant_regions_tenant_normalized_name_idx").on(table.tenantId, table.normalizedName),
    index("tenant_regions_tenant_idx").on(table.tenantId),
    index("tenant_regions_active_idx").on(table.tenantId, table.isActive),
  ],
);

export const personnelRegionsTable = pgTable(
  "personnel_regions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    personnelId: uuid("personnel_id")
      .notNull()
      .references(() => personnelTable.id, { onDelete: "cascade" }),
    tenantRegionId: uuid("tenant_region_id")
      .notNull()
      .references(() => tenantRegionsTable.id, { onDelete: "cascade" }),
    isPrimary: boolean("is_primary").notNull().default(false),
    source: varchar("source", { length: 40 }).notNull().default("manual").$type<RegionLinkSource>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("personnel_regions_personnel_region_idx").on(table.personnelId, table.tenantRegionId),
    uniqueIndex("personnel_regions_primary_idx")
      .on(table.personnelId)
      .where(sql`${table.isPrimary} = true`),
    index("personnel_regions_tenant_idx").on(table.tenantId),
    index("personnel_regions_region_idx").on(table.tenantRegionId),
  ],
);

export const objectRegionsTable = pgTable(
  "object_regions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    objectId: uuid("object_id")
      .notNull()
      .references(() => objectsTable.id, { onDelete: "cascade" }),
    tenantRegionId: uuid("tenant_region_id")
      .notNull()
      .references(() => tenantRegionsTable.id, { onDelete: "cascade" }),
    source: varchar("source", { length: 40 }).notNull().default("manual").$type<RegionLinkSource>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("object_regions_object_region_idx").on(table.objectId, table.tenantRegionId),
    index("object_regions_tenant_idx").on(table.tenantId),
    index("object_regions_region_idx").on(table.tenantRegionId),
  ],
);

export const customerRegionsTable = pgTable(
  "customer_regions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customersTable.id, { onDelete: "cascade" }),
    tenantRegionId: uuid("tenant_region_id")
      .notNull()
      .references(() => tenantRegionsTable.id, { onDelete: "cascade" }),
    source: varchar("source", { length: 40 }).notNull().default("manual").$type<RegionLinkSource>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("customer_regions_customer_region_idx").on(table.customerId, table.tenantRegionId),
    index("customer_regions_tenant_idx").on(table.tenantId),
    index("customer_regions_region_idx").on(table.tenantRegionId),
  ],
);

export const assignmentRequiredRegionsTable = pgTable(
  "assignment_required_regions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignmentsTable.id, { onDelete: "cascade" }),
    tenantRegionId: uuid("tenant_region_id")
      .notNull()
      .references(() => tenantRegionsTable.id, { onDelete: "cascade" }),
    source: varchar("source", { length: 40 }).notNull().default("manual").$type<RegionLinkSource>(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("assignment_required_regions_assignment_region_idx").on(
      table.assignmentId,
      table.tenantRegionId,
    ),
    index("assignment_required_regions_tenant_idx").on(table.tenantId),
    index("assignment_required_regions_region_idx").on(table.tenantRegionId),
  ],
);

export type TenantRegion = typeof tenantRegionsTable.$inferSelect;
export type InsertTenantRegion = typeof tenantRegionsTable.$inferInsert;
export type PersonnelRegion = typeof personnelRegionsTable.$inferSelect;
export type InsertPersonnelRegion = typeof personnelRegionsTable.$inferInsert;
export type ObjectRegion = typeof objectRegionsTable.$inferSelect;
export type InsertObjectRegion = typeof objectRegionsTable.$inferInsert;
export type CustomerRegion = typeof customerRegionsTable.$inferSelect;
export type InsertCustomerRegion = typeof customerRegionsTable.$inferInsert;
export type AssignmentRequiredRegion = typeof assignmentRequiredRegionsTable.$inferSelect;
export type InsertAssignmentRequiredRegion = typeof assignmentRequiredRegionsTable.$inferInsert;
