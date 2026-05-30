import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const permissionsTable = pgTable(
  "permissions",
  {
    id:          uuid("id").primaryKey().defaultRandom(),
    resource:    varchar("resource", { length: 100 }).notNull(),
    action:      varchar("action", { length: 100 }).notNull(),
    description: text("description"),
    createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("permissions_resource_action_idx").on(table.resource, table.action),
  ],
);

export const insertPermissionSchema = createInsertSchema(permissionsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertPermission = z.infer<typeof insertPermissionSchema>;
export type Permission = typeof permissionsTable.$inferSelect;

/** Canonical permission key format: "resource:action" */
export type PermissionKey = `${string}:${string}`;
