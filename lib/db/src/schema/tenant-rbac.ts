import {
  boolean,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { permissionsTable } from "./permissions";
import { rolesTable } from "./roles";
import { tenantsTable, tenantUsersTable } from "./tenants";

export const tenantRolesTable = pgTable(
  "tenant_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    templateRoleId: uuid("template_role_id").references(() => rolesTable.id, { onDelete: "set null" }),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    isSystem: boolean("is_system").notNull().default(false),
    isCustom: boolean("is_custom").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("tenant_roles_tenant_name_idx").on(table.tenantId, table.name),
    uniqueIndex("tenant_roles_tenant_id_idx").on(table.tenantId, table.id),
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
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    tenantRoleId: uuid("tenant_role_id")
      .notNull()
      .references(() => tenantRolesTable.id, { onDelete: "cascade" }),
    sourceUserRoleId: uuid("source_user_role_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId, table.tenantRoleId],
      foreignColumns: [tenantRolesTable.tenantId, tenantRolesTable.id],
      name: "tenant_user_roles_tenant_role_scope_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.tenantId, table.userId],
      foreignColumns: [tenantUsersTable.tenantId, tenantUsersTable.userId],
      name: "tenant_user_roles_tenant_membership_fk",
    }).onDelete("cascade"),
    uniqueIndex("tenant_user_roles_unique_idx").on(table.tenantId, table.userId, table.tenantRoleId),
    index("tenant_user_roles_user_idx").on(table.userId),
    index("tenant_user_roles_role_idx").on(table.tenantRoleId),
  ],
);

export const insertTenantRoleSchema = createInsertSchema(tenantRolesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTenantRole = z.infer<typeof insertTenantRoleSchema>;
export type TenantRole = typeof tenantRolesTable.$inferSelect;
export type TenantRolePermission = typeof tenantRolePermissionsTable.$inferSelect;
export type TenantUserRole = typeof tenantUserRolesTable.$inferSelect;
