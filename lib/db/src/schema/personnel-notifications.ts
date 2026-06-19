import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { personnelTable } from "./personnel";

export const PERSONNEL_NOTIFICATION_CATEGORIES = [
  "planning",
  "news",
  "hours",
  "system",
  "message",
] as const;
export type PersonnelNotificationCategory =
  (typeof PERSONNEL_NOTIFICATION_CATEGORIES)[number];

export const PERSONNEL_NOTIFICATION_PRIORITIES = [
  "low",
  "normal",
  "high",
] as const;
export type PersonnelNotificationPriority =
  (typeof PERSONNEL_NOTIFICATION_PRIORITIES)[number];

export const personnelNotificationsTable = pgTable(
  "personnel_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personnelId: uuid("personnel_id")
      .notNull()
      .references(() => personnelTable.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 180 }).notNull(),
    body: text("body"),
    category: varchar("category", { length: 30 })
      .notNull()
      .default("system")
      .$type<PersonnelNotificationCategory>(),
    priority: varchar("priority", { length: 20 })
      .notNull()
      .default("normal")
      .$type<PersonnelNotificationPriority>(),
    sourceLabel: varchar("source_label", { length: 120 }),
    href: text("href"),
    readAt: timestamp("read_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("personnel_notifications_personnel_created_idx").on(
      table.personnelId,
      table.createdAt,
    ),
    index("personnel_notifications_personnel_read_idx").on(
      table.personnelId,
      table.readAt,
    ),
  ],
);

export const insertPersonnelNotificationSchema = createInsertSchema(
  personnelNotificationsTable,
).omit({
  id: true,
  createdAt: true,
});

export const selectPersonnelNotificationSchema = createSelectSchema(
  personnelNotificationsTable,
);
export const updatePersonnelNotificationSchema =
  insertPersonnelNotificationSchema.partial();

export type InsertPersonnelNotification = z.infer<
  typeof insertPersonnelNotificationSchema
>;
export type UpdatePersonnelNotification = z.infer<
  typeof updatePersonnelNotificationSchema
>;
export type PersonnelNotification = z.infer<
  typeof selectPersonnelNotificationSchema
>;
