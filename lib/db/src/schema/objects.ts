import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customersTable } from "./customers";
import { sectorsTable } from "./sectors";

/**
 * A service location or physical asset belonging to a customer.
 * Assignments are always linked to an object.
 */
export const objectsTable = pgTable("objects", {
  id:          uuid("id").primaryKey().defaultRandom(),
  customerId:  uuid("customer_id").notNull().references(() => customersTable.id, { onDelete: "cascade" }),
  sectorId:    uuid("sector_id").references(() => sectorsTable.id, { onDelete: "set null" }),

  name:        varchar("name", { length: 255 }).notNull(),
  code:        varchar("code", { length: 50 }),

  address:     text("address"),
  city:        varchar("city", { length: 100 }),
  postalCode:  varchar("postal_code", { length: 20 }),

  description: text("description"),
  isActive:    boolean("is_active").notNull().default(true),

  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  /** Supabase Auth user UUID of the staff member who created the record. */
  createdBy:   uuid("created_by"),
});

export const insertObjectSchema = createInsertSchema(objectsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectObjectSchema = createSelectSchema(objectsTable);
export const updateObjectSchema  = insertObjectSchema.partial();

export type InsertObject  = z.infer<typeof insertObjectSchema>;
export type UpdateObject  = z.infer<typeof updateObjectSchema>;
export type ServiceObject = z.infer<typeof selectObjectSchema>;
