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
   * Customer portal identity key.
   * UNIQUE constraint prevents cross-customer RLS leakage when matching by JWT email.
   * RLS policy: WHERE contact_email = (auth.jwt() ->> 'email')
   */
  contactEmail: varchar("contact_email", { length: 255 }).unique(),
  contactPhone: varchar("contact_phone", { length: 50 }),

  isActive:     boolean("is_active").notNull().default(true),

  /**
   * Internal staff notes — never shown to customer-portal users.
   *
   * DB-level enforcement (Supabase production):
   *   migrations/002_sprint1_rls.sql runs:
   *     REVOKE SELECT (notes) ON customers FROM authenticated;
   *   so customer-role queries can never read this column.
   *   Backoffice uses service_role key which bypasses RLS and sees all columns.
   *
   * Application-layer enforcement:
   *   Customer-facing Server Components and API routes must also omit this field.
   *
   * Additional protection:
   *   Internal notes are additionally mirrored to `customer_notes` table
   *   (management-only RLS, no authenticated SELECT policy).
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

export const selectCustomerSchema = createSelectSchema(customersTable);
export const updateCustomerSchema  = insertCustomerSchema.partial();

export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type UpdateCustomer = z.infer<typeof updateCustomerSchema>;
export type Customer       = z.infer<typeof selectCustomerSchema>;
