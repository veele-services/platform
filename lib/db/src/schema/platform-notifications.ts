import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  integer,
} from "drizzle-orm/pg-core";
import { platformUsersTable } from "./platform-users";
import { tenantOwnerInvitesTable } from "./tenant-provisioning";
import { tenantsTable } from "./tenants";

export const PLATFORM_NOTIFICATION_TEMPLATE_KEYS = [
  "maintenance",
  "incident",
  "onboarding_reminder",
  "domain_dns_reminder",
  "subscription_warning",
] as const;
export type PlatformNotificationTemplateKey = (typeof PLATFORM_NOTIFICATION_TEMPLATE_KEYS)[number];

export const PLATFORM_NOTIFICATION_AUDIENCE_TYPES = [
  "platform_users",
  "tenant_owners",
  "tenants_by_plan",
  "tenants_by_module",
  "tenants_with_readiness_issue",
] as const;
export type PlatformNotificationAudienceType = (typeof PLATFORM_NOTIFICATION_AUDIENCE_TYPES)[number];

export const PLATFORM_NOTIFICATION_CHANNELS = ["in_app", "email", "push"] as const;
export type PlatformNotificationChannel = (typeof PLATFORM_NOTIFICATION_CHANNELS)[number];

export const PLATFORM_NOTIFICATION_SCHEDULE_TYPES = ["immediate", "scheduled"] as const;
export type PlatformNotificationScheduleType = (typeof PLATFORM_NOTIFICATION_SCHEDULE_TYPES)[number];

export const PLATFORM_NOTIFICATION_DISPATCH_STATUSES = ["queued", "scheduled", "sent", "canceled"] as const;
export type PlatformNotificationDispatchStatus = (typeof PLATFORM_NOTIFICATION_DISPATCH_STATUSES)[number];

export const PLATFORM_NOTIFICATION_RECIPIENT_TYPES = ["platform_user", "tenant_owner"] as const;
export type PlatformNotificationRecipientType = (typeof PLATFORM_NOTIFICATION_RECIPIENT_TYPES)[number];

export const platformNotificationDispatchesTable = pgTable(
  "platform_notification_dispatches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateKey: varchar("template_key", { length: 60 })
      .notNull()
      .$type<PlatformNotificationTemplateKey>(),
    audienceType: varchar("audience_type", { length: 60 })
      .notNull()
      .$type<PlatformNotificationAudienceType>(),
    scheduleType: varchar("schedule_type", { length: 30 })
      .notNull()
      .default("immediate")
      .$type<PlatformNotificationScheduleType>(),
    status: varchar("status", { length: 30 })
      .notNull()
      .default("queued")
      .$type<PlatformNotificationDispatchStatus>(),
    title: varchar("title", { length: 180 }).notNull(),
    body: text("body").notNull(),
    channels: jsonb("channels").$type<PlatformNotificationChannel[]>().notNull().default(sql`'["in_app"]'::jsonb`),
    targetCriteria: jsonb("target_criteria").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    tenantCount: integer("tenant_count").notNull().default(0),
    recipientCount: integer("recipient_count").notNull().default(0),
    createdByPlatformUserId: uuid("created_by_platform_user_id").references(() => platformUsersTable.id, { onDelete: "set null" }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    queuedAt: timestamp("queued_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("platform_notification_dispatches_status_idx").on(table.status, table.scheduledAt, table.createdAt),
    index("platform_notification_dispatches_template_idx").on(table.templateKey),
    index("platform_notification_dispatches_audience_idx").on(table.audienceType),
  ],
);

export const platformNotificationRecipientsTable = pgTable(
  "platform_notification_recipients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dispatchId: uuid("dispatch_id")
      .notNull()
      .references(() => platformNotificationDispatchesTable.id, { onDelete: "cascade" }),
    recipientType: varchar("recipient_type", { length: 40 })
      .notNull()
      .$type<PlatformNotificationRecipientType>(),
    tenantId: uuid("tenant_id").references(() => tenantsTable.id, { onDelete: "set null" }),
    platformUserId: uuid("platform_user_id").references(() => platformUsersTable.id, { onDelete: "set null" }),
    tenantOwnerInviteId: uuid("tenant_owner_invite_id").references(() => tenantOwnerInvitesTable.id, { onDelete: "set null" }),
    recipientUserId: uuid("recipient_user_id"),
    recipientEmail: text("recipient_email"),
    tenantName: varchar("tenant_name", { length: 200 }),
    tenantSlug: varchar("tenant_slug", { length: 80 }),
    channels: jsonb("channels").$type<PlatformNotificationChannel[]>().notNull().default(sql`'["in_app"]'::jsonb`),
    deliveryStatus: varchar("delivery_status", { length: 30 }).notNull().default("queued"),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  },
  (table) => [
    index("platform_notification_recipients_dispatch_idx").on(table.dispatchId),
    index("platform_notification_recipients_tenant_idx").on(table.tenantId),
    index("platform_notification_recipients_platform_user_idx").on(table.platformUserId),
    index("platform_notification_recipients_owner_invite_idx").on(table.tenantOwnerInviteId),
    index("platform_notification_recipients_status_idx").on(table.deliveryStatus, table.createdAt),
  ],
);

export type PlatformNotificationDispatch = typeof platformNotificationDispatchesTable.$inferSelect;
export type InsertPlatformNotificationDispatch = typeof platformNotificationDispatchesTable.$inferInsert;
export type PlatformNotificationRecipient = typeof platformNotificationRecipientsTable.$inferSelect;
export type InsertPlatformNotificationRecipient = typeof platformNotificationRecipientsTable.$inferInsert;
