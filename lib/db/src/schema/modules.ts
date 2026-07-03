import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export const FIELDGRID_MODULE_KEYS = [
  "customers",
  "objects",
  "personnel",
  "assignments",
  "planning",
  "reporting",
  "documents",
  "finance",
  "customer_portal",
  "personnel_portal",
  "notifications",
  "smart_planning",
  "materials",
  "inventory",
] as const;

export const TENANT_MODULE_SOURCES = ["system", "plan", "manual", "trial", "support"] as const;

export type FieldgridModuleKey = (typeof FIELDGRID_MODULE_KEYS)[number];
export type TenantModuleSource = (typeof TENANT_MODULE_SOURCES)[number];

export const modulesTable = pgTable(
  "modules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: varchar("key", { length: 80 }).notNull().$type<FieldgridModuleKey | (string & {})>(),
    name: varchar("name", { length: 120 }).notNull(),
    description: text("description"),
    category: varchar("category", { length: 60 }).notNull().default("core"),
    isSystem: boolean("is_system").notNull().default(true),
    isEnabledByDefault: boolean("is_enabled_by_default").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("modules_key_idx").on(table.key),
    index("modules_category_idx").on(table.category),
  ],
);

export const moduleDependenciesTable = pgTable(
  "module_dependencies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => modulesTable.id, { onDelete: "cascade" }),
    dependsOnModuleId: uuid("depends_on_module_id")
      .notNull()
      .references(() => modulesTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("module_dependencies_unique_idx").on(table.moduleId, table.dependsOnModuleId),
    index("module_dependencies_depends_on_idx").on(table.dependsOnModuleId),
  ],
);

export const tenantModulesTable = pgTable(
  "tenant_modules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => modulesTable.id, { onDelete: "cascade" }),
    isEnabled: boolean("is_enabled").notNull().default(true),
    source: varchar("source", { length: 40 }).notNull().default("manual").$type<TenantModuleSource>(),
    configuredBy: uuid("configured_by"),
    enabledAt: timestamp("enabled_at", { withTimezone: true }),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("tenant_modules_tenant_module_idx").on(table.tenantId, table.moduleId),
    index("tenant_modules_tenant_idx").on(table.tenantId),
    index("tenant_modules_module_idx").on(table.moduleId),
    index("tenant_modules_enabled_idx").on(table.tenantId, table.isEnabled),
  ],
);

export type Module = typeof modulesTable.$inferSelect;
export type InsertModule = typeof modulesTable.$inferInsert;
export type ModuleDependency = typeof moduleDependenciesTable.$inferSelect;
export type TenantModule = typeof tenantModulesTable.$inferSelect;
export type InsertTenantModule = typeof tenantModulesTable.$inferInsert;
