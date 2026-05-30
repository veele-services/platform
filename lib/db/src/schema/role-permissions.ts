import {
  pgTable,
  uuid,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { rolesTable } from "./roles";
import { permissionsTable } from "./permissions";

export const rolePermissionsTable = pgTable(
  "role_permissions",
  {
    id:           uuid("id").primaryKey().defaultRandom(),
    roleId:       uuid("role_id").notNull().references(() => rolesTable.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id").notNull().references(() => permissionsTable.id, { onDelete: "cascade" }),
    createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("role_permissions_unique_idx").on(table.roleId, table.permissionId),
  ],
);

export type RolePermission = typeof rolePermissionsTable.$inferSelect;
