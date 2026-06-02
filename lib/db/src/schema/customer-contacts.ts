import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customersTable } from "./customers";

export const PREFERRED_COMM_OPTIONS = ["email", "phone", "mobile", "whatsapp"] as const;
export type PreferredComm = (typeof PREFERRED_COMM_OPTIONS)[number];

export const customerContactsTable = pgTable("customer_contacts", {
  id:                 uuid("id").primaryKey().defaultRandom(),
  customerId:         uuid("customer_id")
    .notNull()
    .references(() => customersTable.id, { onDelete: "cascade" }),
  firstName:          varchar("first_name", { length: 100 }).notNull(),
  lastName:           varchar("last_name", { length: 100 }).notNull(),
  function:           varchar("function", { length: 100 }),
  email:              varchar("email", { length: 255 }),
  phone:              varchar("phone", { length: 50 }),
  mobile:             varchar("mobile", { length: 50 }),
  preferredComm:      varchar("preferred_comm", { length: 20 }),
  isEmergencyContact: boolean("is_emergency_contact").notNull().default(false),
  isPrimary:          boolean("is_primary").notNull().default(false),
  createdAt:          timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:          timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCustomerContactSchema = createInsertSchema(customerContactsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectCustomerContactSchema = createSelectSchema(customerContactsTable);
export const updateCustomerContactSchema  = insertCustomerContactSchema.partial();

export type InsertCustomerContact = z.infer<typeof insertCustomerContactSchema>;
export type UpdateCustomerContact = z.infer<typeof updateCustomerContactSchema>;
export type CustomerContact       = z.infer<typeof selectCustomerContactSchema>;
