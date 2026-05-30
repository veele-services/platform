import {
  pgTable,
  uuid,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { rolesTable } from "./roles";

/** Links a Supabase Auth user UUID to one or more Roles. */
export const userRolesTable = pgTable(
  "user_roles",
  {
    id:        uuid("id").primaryKey().defaultRandom(),
    /** Supabase Auth user ID (auth.users.id) */
    userId:    uuid("user_id").notNull(),
    roleId:    uuid("role_id").notNull().references(() => rolesTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("user_roles_unique_idx").on(table.userId, table.roleId),
  ],
);

export type UserRole = typeof userRolesTable.$inferSelect;
