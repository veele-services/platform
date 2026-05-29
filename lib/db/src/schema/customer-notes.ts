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
 * Internal-only notes for a customer.
 *
 * Stored in a separate table so Supabase RLS can deny all access to
 * non-management users at the database level — no application-layer
 * filtering required.
 *
 * RLS policy in migrations/002_sprint1_rls.sql:
 *   Only the Management role may SELECT / INSERT / UPDATE / DELETE.
 *   Customer-portal users receive zero rows.
 */
export const customerNotesTable = pgTable("customer_notes", {
  id:         uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").notNull().references(() => customersTable.id, { onDelete: "cascade" }),
  notes:      text("notes").notNull(),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  /** Staff member who last updated the notes. */
  createdBy:  uuid("created_by"),
});

export const insertCustomerNoteSchema = createInsertSchema(customerNotesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectCustomerNoteSchema = createSelectSchema(customerNotesTable);
export const updateCustomerNoteSchema = insertCustomerNoteSchema.partial();

export type InsertCustomerNote = z.infer<typeof insertCustomerNoteSchema>;
export type UpdateCustomerNote = z.infer<typeof updateCustomerNoteSchema>;
export type CustomerNote = z.infer<typeof selectCustomerNoteSchema>;
