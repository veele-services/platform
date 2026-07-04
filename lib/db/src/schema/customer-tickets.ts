import {
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customerUsersTable } from "./customer-users";
import { customersTable } from "./customers";
import { tenantsTable } from "./tenants";

export const CUSTOMER_TICKET_DEPARTMENTS = [
  "planning",
  "management",
  "backoffice",
  "finance",
  "service",
  "support",
] as const;
export type CustomerTicketDepartment =
  (typeof CUSTOMER_TICKET_DEPARTMENTS)[number];

export const CUSTOMER_TICKET_STATUSES = [
  "open",
  "waiting_backoffice",
  "waiting_customer",
  "closed",
] as const;
export type CustomerTicketStatus = (typeof CUSTOMER_TICKET_STATUSES)[number];

export const CUSTOMER_TICKET_PRIORITIES = [
  "low",
  "normal",
  "high",
  "urgent",
] as const;
export type CustomerTicketPriority =
  (typeof CUSTOMER_TICKET_PRIORITIES)[number];

export const CUSTOMER_MESSAGE_AUTHOR_TYPES = [
  "customer",
  "backoffice",
  "system",
] as const;
export type CustomerMessageAuthorType =
  (typeof CUSTOMER_MESSAGE_AUTHOR_TYPES)[number];

export const customerMessageThreadsTable = pgTable(
  "customer_message_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customersTable.id, { onDelete: "cascade" }),
    customerUserId: uuid("customer_user_id").references(
      () => customerUsersTable.id,
      { onDelete: "set null" },
    ),
    subject: varchar("subject", { length: 180 }).notNull(),
    department: varchar("department", { length: 40 })
      .notNull()
      .default("backoffice")
      .$type<CustomerTicketDepartment>(),
    status: varchar("status", { length: 30 })
      .notNull()
      .default("open")
      .$type<CustomerTicketStatus>(),
    priority: varchar("priority", { length: 20 })
      .notNull()
      .default("normal")
      .$type<CustomerTicketPriority>(),
    lastMessagePreview: text("last_message_preview"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("customer_msg_threads_customer_status_idx").on(
      table.customerId,
      table.status,
    ),
    index("customer_msg_threads_tenant_status_idx").on(table.tenantId, table.status),
    index("customer_msg_threads_last_msg_idx").on(table.lastMessageAt),
  ],
);

export const customerMessageEntriesTable = pgTable(
  "customer_message_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => customerMessageThreadsTable.id, { onDelete: "cascade" }),
    authorType: varchar("author_type", { length: 30 })
      .notNull()
      .$type<CustomerMessageAuthorType>(),
    authorUserId: uuid("author_user_id"),
    authorName: varchar("author_name", { length: 140 }).notNull(),
    department: varchar("department", { length: 40 }).$type<CustomerTicketDepartment>(),
    body: text("body").notNull(),
    readByCustomerAt: timestamp("read_by_customer_at", { withTimezone: true }),
    readByBackofficeAt: timestamp("read_by_backoffice_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("customer_msg_entries_thread_created_idx").on(
      table.threadId,
      table.createdAt,
    ),
    index("customer_msg_entries_unread_customer_idx").on(
      table.threadId,
      table.readByCustomerAt,
    ),
    index("customer_msg_entries_unread_backoffice_idx").on(
      table.threadId,
      table.readByBackofficeAt,
    ),
  ],
);

export const insertCustomerMessageThreadSchema = createInsertSchema(
  customerMessageThreadsTable,
).omit({
  id: true,
  tenantId: true,
  createdAt: true,
  updatedAt: true,
});

export const selectCustomerMessageThreadSchema = createSelectSchema(
  customerMessageThreadsTable,
);
export const updateCustomerMessageThreadSchema =
  insertCustomerMessageThreadSchema.partial();

export const insertCustomerMessageEntrySchema = createInsertSchema(
  customerMessageEntriesTable,
).omit({
  id: true,
  createdAt: true,
});
export const selectCustomerMessageEntrySchema = createSelectSchema(
  customerMessageEntriesTable,
);

export type InsertCustomerMessageThread = z.infer<
  typeof insertCustomerMessageThreadSchema
>;
export type UpdateCustomerMessageThread = z.infer<
  typeof updateCustomerMessageThreadSchema
>;
export type CustomerMessageThread = z.infer<
  typeof selectCustomerMessageThreadSchema
>;
export type InsertCustomerMessageEntry = z.infer<
  typeof insertCustomerMessageEntrySchema
>;
export type CustomerMessageEntry = z.infer<
  typeof selectCustomerMessageEntrySchema
>;
