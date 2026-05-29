import { pgTable, uuid, varchar, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const rolesTable = pgTable("roles", {
  id:          uuid("id").primaryKey().defaultRandom(),
  name:        varchar("name", { length: 100 }).notNull().unique(),
  description: text("description"),
  isSystem:    boolean("is_system").notNull().default(false),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertRoleSchema = createInsertSchema(rolesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRole = z.infer<typeof insertRoleSchema>;
export type Role = typeof rolesTable.$inferSelect;
