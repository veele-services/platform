import {
  boolean,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const platformEmailProvidersTable = pgTable("platform_email_providers", {
  id: uuid("id").primaryKey().defaultRandom(),
  providerType: varchar("provider_type", { length: 40 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  isActive: boolean("is_active").notNull().default(false),
  isDefault: boolean("is_default").notNull().default(false),
  encryptedConfigJson: text("encrypted_config_json").notNull().default("{}"),
  fromEmail: varchar("from_email", { length: 255 }).notNull().default("noreply@fieldgrid.nl"),
  fromName: varchar("from_name", { length: 200 }).notNull().default("Fieldgrid"),
  replyToEmail: varchar("reply_to_email", { length: 255 }),
  status: varchar("status", { length: 30 }).notNull().default("draft"),
  lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
  lastTestStatus: varchar("last_test_status", { length: 30 }),
  lastTestError: text("last_test_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by"),
});

export const emailDeliveryLogTable = pgTable("email_delivery_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  providerId: uuid("provider_id").references(() => platformEmailProvidersTable.id, { onDelete: "set null" }),
  providerType: varchar("provider_type", { length: 40 }).notNull(),
  templateKey: varchar("template_key", { length: 120 }),
  tenantId: uuid("tenant_id"),
  recipientEmail: varchar("recipient_email", { length: 320 }).notNull(),
  subject: varchar("subject", { length: 500 }).notNull(),
  status: varchar("status", { length: 30 }).notNull(),
  providerMessageId: varchar("provider_message_id", { length: 255 }),
  errorMessage: text("error_message"),
  triggeredBy: uuid("triggered_by"),
  triggeredByType: varchar("triggered_by_type", { length: 40 }).notNull().default("system"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PlatformEmailProvider = typeof platformEmailProvidersTable.$inferSelect;
export type NewPlatformEmailProvider = typeof platformEmailProvidersTable.$inferInsert;
export type EmailDeliveryLog = typeof emailDeliveryLogTable.$inferSelect;
