import {
  pgTable,
  uuid,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customersTable } from "./customers";

/**
 * Internal staff notes for a customer.
 *
 * Stored in a dedicated table so Supabase RLS can enforce management-only
 * access at the database level.  Because this is a separate table, the
 * `authenticated` role (used by all portal users) simply receives zero rows
 * from the customer-portal RLS policy — no application-layer filtering needed.
 *
 * RLS in migrations/002_sprint1_rls.sql:
 *   - Management: full access (SELECT / INSERT / UPDATE / DELETE)
 *   - All other roles: denied — no policy, no rows returned
 */
export const customerNotesTable = pgTable("customer_notes", {
  id:         uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customersTable.id, { onDelete: "cascade" }),
  notes:      text("notes").notNull(),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  /** Supabase Auth user UUID of the staff member who last updated the notes. */
  updatedBy:  uuid("updated_by"),
});

export const insertCustomerNoteSchema = createInsertSchema(customerNotesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectCustomerNoteSchema = createSelectSchema(customerNotesTable);
export const updateCustomerNoteSchema  = insertCustomerNoteSchema.partial();

export type InsertCustomerNote = z.infer<typeof insertCustomerNoteSchema>;
export type UpdateCustomerNote = z.infer<typeof updateCustomerNoteSchema>;
export type CustomerNote       = z.infer<typeof selectCustomerNoteSchema>;
