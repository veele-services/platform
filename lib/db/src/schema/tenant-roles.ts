import {
  boolean,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { permissionsTable } from "./permissions";
import { tenantsTable } from "./tenants";

export const tenantRolesTable = pgTable(
  "tenant_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenantsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    isSystem: boolean("is_system").notNull().default(false),
    isCustom: boolean("is_custom").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("tenant_roles_tenant_name_idx").on(table.tenantId, table.name)],
);

export const tenantRolePermissionsTable = pgTable(
  "tenant_role_permissions",
  {
    tenantRoleId: uuid("tenant_role_id")
      .notNull()
      .references(() => tenantRolesTable.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissionsTable.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.tenantRoleId, table.permissionId] })],
);

export const tenantUserRolesTable = pgTable(
  "tenant_user_roles",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    tenantRoleId: uuid("tenant_role_id")
      .notNull()
      .references(() => tenantRolesTable.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.userId, table.tenantRoleId] })],
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
