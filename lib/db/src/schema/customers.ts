import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sectorsTable } from "./sectors";

export const customersTable = pgTable("customers", {
  id:           uuid("id").primaryKey().defaultRandom(),
  name:         varchar("name", { length: 255 }).notNull(),
  code:         varchar("code", { length: 50 }).unique(),
  sectorId:     uuid("sector_id").references(() => sectorsTable.id, { onDelete: "set null" }),

  address:      text("address"),
  city:         varchar("city", { length: 100 }),
  postalCode:   varchar("postal_code", { length: 20 }),
  country:      varchar("country", { length: 100 }).notNull().default("NL"),

  contactName:  varchar("contact_name", { length: 200 }),
  /**
   * contact_email is used for customer portal access.
   * RLS policy on Supabase: SELECT WHERE contact_email = (auth.jwt() ->> 'email')
   */
  contactEmail: varchar("contact_email", { length: 255 }),
  contactPhone: varchar("contact_phone", { length: 50 }),

  isActive:     boolean("is_active").notNull().default(true),

  /**
   * Internal field — never shown to customers.
   * Enforcement: RLS excludes customer-role users from SELECT on this row;
   * additionally the Customer PWA layer must never expose this field.
   */
  notes:        text("notes"),

  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  /** Supabase Auth user UUID of the staff member who created the record. */
  createdBy:    uuid("created_by"),
});

export const insertCustomerSchema = createInsertSchema(customersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateCustomerSchema = insertCustomerSchema.partial();

export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type UpdateCustomer = z.infer<typeof updateCustomerSchema>;
export type Customer = typeof customersTable.$inferSelect;
