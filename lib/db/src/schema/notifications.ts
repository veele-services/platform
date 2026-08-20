import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { customersTable } from "./customers";
import { personnelTable } from "./personnel";
import { tenantsTable } from "./tenants";

export const NOTIFICATION_AUDIENCES = [
  "customer",
  "personnel",
  "management",
  "mixed",
] as const;
export type NotificationAudience = (typeof NOTIFICATION_AUDIENCES)[number];

export const NOTIFICATION_CHANNELS = ["email", "push", "in_app"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const notificationEventSettingsTable = pgTable("notification_event_settings", {
  eventKey: varchar("event_key", { length: 100 }).primaryKey(),
  eventGroup: varchar("event_group", { length: 50 }).notNull(),
  audience: varchar("audience", { length: 30 })
    .notNull()
    .$type<NotificationAudience>(),
  title: varchar("title", { length: 180 }).notNull(),
  description: text("description").notNull(),
  emailEnabled: boolean("email_enabled").notNull().default(true),
  pushEnabled: boolean("push_enabled").notNull().default(false),
  inAppEnabled: boolean("in_app_enabled").notNull().default(true),
  emailSubject: varchar("email_subject", { length: 240 }).notNull(),
  emailPreheader: varchar("email_preheader", { length: 240 }),
  emailBody: text("email_body").notNull(),
  pushTitle: varchar("push_title", { length: 120 }).notNull(),
  pushBody: text("push_body").notNull(),
  shortcodes: jsonb("shortcodes").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by"),
});

export const customerNotificationsTable = pgTable(
  "customer_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customersTable.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 180 }).notNull(),
    body: text("body"),
    category: varchar("category", { length: 30 }).notNull().default("system"),
    priority: varchar("priority", { length: 20 }).notNull().default("normal"),
    sourceLabel: varchar("source_label", { length: 120 }),
    href: text("href"),
    readAt: timestamp("read_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("customer_notifications_customer_created_idx").on(
      table.customerId,
      table.createdAt,
    ),
    index("customer_notifications_customer_read_idx").on(
      table.customerId,
      table.readAt,
    ),
  ],
);

export const pushSubscriptionsTable = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    ownerType: varchar("owner_type", { length: 20 }).notNull(),
    personnelId: uuid("personnel_id").references(() => personnelTable.id, {
      onDelete: "cascade",
    }),
    customerId: uuid("customer_id").references(() => customersTable.id, {
      onDelete: "cascade",
    }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("push_subscriptions_endpoint_unique").on(table.endpoint),
    index("push_subscriptions_personnel_idx").on(table.personnelId),
    index("push_subscriptions_customer_idx").on(table.customerId),
  ],
);

export const nativePushDeviceTokensTable = pgTable(
  "native_push_device_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    ownerType: varchar("owner_type", { length: 20 }).notNull(),
    personnelId: uuid("personnel_id").references(() => personnelTable.id, {
      onDelete: "cascade",
    }),
    customerId: uuid("customer_id").references(() => customersTable.id, {
      onDelete: "cascade",
    }),
    userId: uuid("user_id"),
    provider: varchar("provider", { length: 30 }).notNull().default("fcm"),
    platform: varchar("platform", { length: 30 }).notNull().default("android"),
    token: text("token").notNull(),
    appId: varchar("app_id", { length: 160 }),
    appVersion: varchar("app_version", { length: 80 }),
    deviceId: varchar("device_id", { length: 160 }),
    deviceModel: varchar("device_model", { length: 160 }),
    userAgent: text("user_agent"),
    isActive: boolean("is_active").notNull().default(true),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("native_push_device_tokens_token_unique").on(table.token),
    index("native_push_device_tokens_personnel_idx").on(table.personnelId, table.isActive),
    index("native_push_device_tokens_customer_idx").on(table.customerId, table.isActive),
    index("native_push_device_tokens_user_idx").on(table.userId, table.isActive),
    index("native_push_device_tokens_tenant_provider_idx").on(
      table.tenantId,
      table.provider,
      table.isActive,
    ),
  ],
);

export const notificationDispatchesTable = pgTable("notification_dispatches", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 180 }).notNull(),
  body: text("body").notNull(),
  audience: varchar("audience", { length: 30 }).notNull(),
  channels: jsonb("channels").$type<NotificationChannel[]>().notNull().default(sql`'[]'::jsonb`),
  targetCriteria: jsonb("target_criteria").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  sentPersonnelCount: integer("sent_personnel_count").notNull().default(0),
  sentCustomerCount: integer("sent_customer_count").notNull().default(0),
  emailSuccessCount: integer("email_success_count").notNull().default(0),
  emailFailedCount: integer("email_failed_count").notNull().default(0),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notificationDeliveryQueueTable = pgTable(
  "notification_delivery_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    eventKey: varchar("event_key", { length: 100 }),
    dispatchId: uuid("dispatch_id").references(() => notificationDispatchesTable.id, {
      onDelete: "set null",
    }),
    channel: varchar("channel", { length: 20 }).notNull().$type<NotificationChannel>(),
    recipientType: varchar("recipient_type", { length: 20 }).notNull(),
    personnelId: uuid("personnel_id").references(() => personnelTable.id, {
      onDelete: "set null",
    }),
    customerId: uuid("customer_id").references(() => customersTable.id, {
      onDelete: "set null",
    }),
    recipientEmail: varchar("recipient_email", { length: 255 }),
    subject: varchar("subject", { length: 240 }),
    title: varchar("title", { length: 180 }).notNull(),
    body: text(),
    html: text(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    processingStartedAt: timestamp("processing_started_at", { withTimezone: true }),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: varchar("locked_by", { length: 120 }),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    lastError: text("last_error"),
    errorDetails: jsonb("error_details").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    response: jsonb("response").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    idempotencyKey: text("idempotency_key"),
    rateLimitKey: varchar("rate_limit_key", { length: 160 }),
    deliveryKey: text("delivery_key").notNull().default(sql`'notification:' || gen_random_uuid()::text`),
    deliveryStartedAt: timestamp("delivery_started_at", { withTimezone: true }),
    currentAttemptId: uuid("current_attempt_id"),
    terminalAttemptId: uuid("terminal_attempt_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("notification_delivery_queue_status_idx").on(table.status, table.createdAt),
    index("notification_delivery_queue_ready_idx").on(table.channel, table.status, table.nextAttemptAt, table.createdAt),
    index("notification_delivery_queue_processing_idx").on(table.status, table.lockedAt),
    index("notification_delivery_queue_tenant_channel_idx").on(table.tenantId, table.channel, table.status, table.createdAt),
    uniqueIndex("notification_delivery_queue_idempotency_idx").on(table.idempotencyKey),
    index("notification_delivery_queue_dispatch_idx").on(table.dispatchId),
  ],
);

export const notificationDeliveryAttemptsTable = pgTable(
  "notification_delivery_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    queueId: uuid("queue_id")
      .notNull()
      .references(() => notificationDeliveryQueueTable.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    channel: varchar("channel", { length: 20 }).notNull(),
    attemptNo: integer("attempt_no").notNull(),
    workerId: varchar("worker_id", { length: 120 }).notNull(),
    deliveryKey: text("delivery_key").notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    error: text("error"),
    response: jsonb("response").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    providerMessageId: text("provider_message_id"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("notification_delivery_attempts_queue_idx").on(table.queueId, table.attemptNo),
    index("notification_delivery_attempts_tenant_status_idx").on(table.tenantId, table.status, table.finishedAt),
  ],
);

export type NotificationEventSetting =
  typeof notificationEventSettingsTable.$inferSelect;
export type CustomerNotification =
  typeof customerNotificationsTable.$inferSelect;
export type PushSubscription = typeof pushSubscriptionsTable.$inferSelect;
export type NativePushDeviceToken =
  typeof nativePushDeviceTokensTable.$inferSelect;
export type NotificationDispatch =
  typeof notificationDispatchesTable.$inferSelect;
export type NotificationDeliveryQueueItem =
  typeof notificationDeliveryQueueTable.$inferSelect;
export type NotificationDeliveryAttempt =
  typeof notificationDeliveryAttemptsTable.$inferSelect;
