import {
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { permissionsTable } from "./permissions";
import { rolesTable } from "./roles";
import { tenantsTable } from "./tenants";

/** Links roles to permissions within a tenant. */
export const tenantRolePermissionsTable = pgTable(
  "tenant_role_permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    roleId: uuid("role_id").notNull().references(() => rolesTable.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id").notNull().references(() => permissionsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("tenant_role_permissions_unique_idx").on(table.tenantId, table.roleId, table.permissionId),
    index("tenant_role_permissions_role_tenant_idx").on(table.roleId, table.tenantId),
  ],
);

export type TenantRolePermission = typeof tenantRolePermissionsTable.$inferSelect;
