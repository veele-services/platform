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
   * Customer portal identity — used by Supabase RLS to scope SELECT access.
   * Unique so a single email cannot match more than one customer record.
   * (Supabase RLS: WHERE contact_email = auth.jwt() ->> 'email')
   */
  contactEmail: varchar("contact_email", { length: 255 }).unique(),
  contactPhone: varchar("contact_phone", { length: 50 }),

  isActive:     boolean("is_active").notNull().default(true),

  /**
   * Internal notes have been moved to the `customer_notes` table so that
   * Supabase RLS can deny customer-portal users at the database level
   * without any application-layer filtering.
   */

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

export const selectCustomerSchema = createSelectSchema(customersTable);
export const updateCustomerSchema = insertCustomerSchema.partial();

export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type UpdateCustomer = z.infer<typeof updateCustomerSchema>;
export type Customer = z.infer<typeof selectCustomerSchema>;
