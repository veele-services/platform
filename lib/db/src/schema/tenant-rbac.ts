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
import { permissionsTable } from "./permissions";
import { rolesTable } from "./roles";
import { DEFAULT_TENANT_ID, tenantsTable } from "./tenants";

export const tenantRolesTable = pgTable(
  "tenant_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .default(DEFAULT_TENANT_ID)
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    templateRoleId: uuid("template_role_id").references(() => rolesTable.id, { onDelete: "set null" }),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    isSystem: boolean("is_system").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("tenant_roles_tenant_name_idx").on(table.tenantId, table.name),
    index("tenant_roles_tenant_idx").on(table.tenantId),
    index("tenant_roles_template_idx").on(table.templateRoleId),
  ],
);

export const tenantRolePermissionsTable = pgTable(
  "tenant_role_permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantRoleId: uuid("tenant_role_id")
      .notNull()
      .references(() => tenantRolesTable.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissionsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("tenant_role_permissions_unique_idx").on(table.tenantRoleId, table.permissionId),
    index("tenant_role_permissions_permission_idx").on(table.permissionId),
  ],
);

export const tenantUserRolesTable = pgTable(
  "tenant_user_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .default(DEFAULT_TENANT_ID)
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    tenantRoleId: uuid("tenant_role_id")
      .notNull()
      .references(() => tenantRolesTable.id, { onDelete: "cascade" }),
    sourceUserRoleId: uuid("source_user_role_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("tenant_user_roles_unique_idx").on(table.tenantId, table.userId, table.tenantRoleId),
    index("tenant_user_roles_user_idx").on(table.userId),
    index("tenant_user_roles_role_idx").on(table.tenantRoleId),
  ],
);

export type TenantRole = typeof tenantRolesTable.$inferSelect;
export type TenantRolePermission = typeof tenantRolePermissionsTable.$inferSelect;
export type TenantUserRole = typeof tenantUserRolesTable.$inferSelect;
