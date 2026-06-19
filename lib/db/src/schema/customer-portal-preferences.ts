import {
  boolean,
  pgTable,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { customersTable } from "./customers";

export const customerPortalPreferencesTable = pgTable("customer_portal_preferences", {
  customerId:          uuid("customer_id")
    .primaryKey()
    .references(() => customersTable.id, { onDelete: "cascade" }),
  emailNotifications: boolean("email_notifications").notNull().default(true),
  invoiceEmails:      boolean("invoice_emails").notNull().default(true),
  quoteEmails:        boolean("quote_emails").notNull().default(true),
  reportEmails:       boolean("report_emails").notNull().default(true),
  serviceUpdateEmails:boolean("service_update_emails").notNull().default(true),
  marketingEmails:    boolean("marketing_emails").notNull().default(false),
  pushNotifications:  boolean("push_notifications").notNull().default(false),
  createdAt:          timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:          timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type CustomerPortalPreferences = typeof customerPortalPreferencesTable.$inferSelect;
export type InsertCustomerPortalPreferences = typeof customerPortalPreferencesTable.$inferInsert;
