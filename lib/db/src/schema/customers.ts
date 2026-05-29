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
   * Unique constraint prevents a single JWT email from matching multiple rows
   * (cross-customer data leakage).
   * RLS policy: WHERE contact_email = (auth.jwt() ->> 'email')
   */
  contactEmail: varchar("contact_email", { length: 255 }).unique(),
  contactPhone: varchar("contact_phone", { length: 50 }),

  isActive:     boolean("is_active").notNull().default(true),

  /**
   * Internal staff notes — must never be exposed to customer-portal users.
   *
   * DB-level protection:
   *   The `v_customers_portal` view (migrations/002_sprint1_rls.sql) excludes
   *   this column.  Customer-portal Server Components MUST query the view,
   *   not the base table.  Management Server Components query the base table.
   *
   * Application-layer protection:
   *   Customer-facing API routes and Server Actions must omit this field.
   *   RLS on the base table further restricts rows (not columns) for
   *   customer-role users.
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
