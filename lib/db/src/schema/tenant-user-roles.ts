import {
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { rolesTable } from "./roles";
import { tenantsTable } from "./tenants";

/** Links a Supabase Auth user UUID to one or more roles within a tenant. */
export const tenantUserRolesTable = pgTable(
  "tenant_user_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    /** Supabase Auth user ID (auth.users.id) */
    userId: uuid("user_id").notNull(),
    roleId: uuid("role_id").notNull().references(() => rolesTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("tenant_user_roles_unique_idx").on(table.tenantId, table.userId, table.roleId),
    index("tenant_user_roles_user_tenant_idx").on(table.userId, table.tenantId),
  ],
);

export type TenantUserRole = typeof tenantUserRolesTable.$inferSelect;
