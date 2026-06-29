import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { assignmentsTable } from "./assignments";
import { personnelTable } from "./personnel";
import { assignmentInterestResponsesTable } from "./planning-intelligence";
import { DEFAULT_TENANT_ID, tenantsTable } from "./tenants";

export const PERSONNEL_TICKET_DEPARTMENTS = [
  "planning",
  "management",
  "backoffice",
  "hr",
  "finance",
  "it",
] as const;
export type PersonnelTicketDepartment =
  (typeof PERSONNEL_TICKET_DEPARTMENTS)[number];

export const PERSONNEL_TICKET_STATUSES = [
  "open",
  "waiting_backoffice",
  "waiting_personnel",
  "closed",
] as const;
export type PersonnelTicketStatus = (typeof PERSONNEL_TICKET_STATUSES)[number];

export const PERSONNEL_TICKET_PRIORITIES = [
  "low",
  "normal",
  "high",
  "urgent",
] as const;
export type PersonnelTicketPriority =
  (typeof PERSONNEL_TICKET_PRIORITIES)[number];

export const PERSONNEL_MESSAGE_AUTHOR_TYPES = [
  "personnel",
  "backoffice",
  "system",
] as const;
export type PersonnelMessageAuthorType =
  (typeof PERSONNEL_MESSAGE_AUTHOR_TYPES)[number];

export const personnelMessageThreadsTable = pgTable(
  "personnel_message_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .default(sql`'${sql.raw(DEFAULT_TENANT_ID)}'::uuid`)
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    personnelId: uuid("personnel_id")
      .notNull()
      .references(() => personnelTable.id, { onDelete: "cascade" }),
    assignmentId: uuid("assignment_id").references(() => assignmentsTable.id, {
      onDelete: "set null",
    }),
    interestResponseId: uuid("interest_response_id").references(
      () => assignmentInterestResponsesTable.id,
      { onDelete: "set null" },
    ),
    subject: varchar("subject", { length: 180 }).notNull(),
    department: varchar("department", { length: 40 })
      .notNull()
      .default("backoffice")
      .$type<PersonnelTicketDepartment>(),
    status: varchar("status", { length: 30 })
      .notNull()
      .default("open")
      .$type<PersonnelTicketStatus>(),
    priority: varchar("priority", { length: 20 })
      .notNull()
      .default("normal")
      .$type<PersonnelTicketPriority>(),
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
    index("personnel_msg_threads_personnel_status_idx").on(
      table.personnelId,
      table.status,
    ),
    index("personnel_msg_threads_tenant_status_idx").on(
      table.tenantId,
      table.status,
    ),
    index("personnel_msg_threads_assignment_idx").on(table.assignmentId),
    index("personnel_msg_threads_interest_response_idx").on(
      table.interestResponseId,
    ),
    uniqueIndex("personnel_msg_threads_open_assignment_question_idx")
      .on(table.personnelId, table.assignmentId)
      .where(sql`${table.assignmentId} IS NOT NULL AND ${table.status} <> 'closed'`),
    index("personnel_msg_threads_last_msg_idx").on(table.lastMessageAt),
  ],
);

export const personnelMessageEntriesTable = pgTable(
  "personnel_message_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => personnelMessageThreadsTable.id, { onDelete: "cascade" }),
    authorType: varchar("author_type", { length: 30 })
      .notNull()
      .$type<PersonnelMessageAuthorType>(),
    authorUserId: uuid("author_user_id"),
    authorName: varchar("author_name", { length: 140 }).notNull(),
    department: varchar("department", { length: 40 }).$type<PersonnelTicketDepartment>(),
    body: text("body").notNull(),
    readByPersonnelAt: timestamp("read_by_personnel_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("personnel_msg_entries_thread_created_idx").on(
      table.threadId,
      table.createdAt,
    ),
    index("personnel_msg_entries_unread_personnel_idx").on(
      table.threadId,
      table.readByPersonnelAt,
    ),
  ],
);

export const insertPersonnelMessageThreadSchema = createInsertSchema(
  personnelMessageThreadsTable,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectPersonnelMessageThreadSchema = createSelectSchema(
  personnelMessageThreadsTable,
);
export const updatePersonnelMessageThreadSchema =
  insertPersonnelMessageThreadSchema.partial();

export const insertPersonnelMessageEntrySchema = createInsertSchema(
  personnelMessageEntriesTable,
).omit({
  id: true,
  createdAt: true,
});
export const selectPersonnelMessageEntrySchema = createSelectSchema(
  personnelMessageEntriesTable,
);

export type InsertPersonnelMessageThread = z.infer<
  typeof insertPersonnelMessageThreadSchema
>;
export type UpdatePersonnelMessageThread = z.infer<
  typeof updatePersonnelMessageThreadSchema
>;
export type PersonnelMessageThread = z.infer<
  typeof selectPersonnelMessageThreadSchema
>;
export type InsertPersonnelMessageEntry = z.infer<
  typeof insertPersonnelMessageEntrySchema
>;
export type PersonnelMessageEntry = z.infer<
  typeof selectPersonnelMessageEntrySchema
>;
