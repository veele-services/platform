import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * customer_types — lookup table for customer classification.
 * tenant_id is reserved for future multi-tenancy; currently nullable.
 * service_role writes; authenticated users read.
 */
export const customerTypesTable = pgTable("customer_types", {
  id:        uuid("id").primaryKey().defaultRandom(),
  tenantId:  uuid("tenant_id"),
  name:      varchar("name", { length: 100 }).notNull(),
  slug:      varchar("slug", { length: 100 }).notNull(),
  isActive:  boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCustomerTypeSchema = createInsertSchema(customerTypesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectCustomerTypeSchema = createSelectSchema(customerTypesTable);
export const updateCustomerTypeSchema  = insertCustomerTypeSchema.partial();

export type InsertCustomerType = z.infer<typeof insertCustomerTypeSchema>;
export type UpdateCustomerType = z.infer<typeof updateCustomerTypeSchema>;
export type CustomerType       = z.infer<typeof selectCustomerTypeSchema>;
