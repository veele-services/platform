import { sql } from "drizzle-orm";
import {
  boolean,
  foreignKey,
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
import { tenantsTable } from "./tenants";
import type {
  PortalOnboardingDraft,
  PortalOnboardingPortal,
  PortalOnboardingStatus,
  PortalPushStatus,
} from "../portal-onboarding-client";

export {
  PORTAL_ONBOARDING_PORTALS,
  PORTAL_ONBOARDING_STATUSES,
  PORTAL_PUSH_STATUSES,
} from "../portal-onboarding-client";
export type {
  PortalOnboardingDraft,
  PortalOnboardingPortal,
  PortalOnboardingStatus,
  PortalPushStatus,
} from "../portal-onboarding-client";

export const portalOnboardingSessionsTable = pgTable(
  "portal_onboarding_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    portal: varchar("portal", { length: 20 })
      .notNull()
      .$type<PortalOnboardingPortal>(),
    subjectId: uuid("subject_id").notNull(),
    status: varchar("status", { length: 40 })
      .notNull()
      .default("not_started")
      .$type<PortalOnboardingStatus>(),
    currentStep: varchar("current_step", { length: 80 })
      .notNull()
      .default("welcome"),
    completedSteps: jsonb("completed_steps")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    draftData: jsonb("draft_data")
      .$type<PortalOnboardingDraft>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    onboardingVersion: integer("onboarding_version").notNull().default(1),
    profileCompletenessPercentage: integer("profile_completeness_percentage")
      .notNull()
      .default(0),
    pushStatus: varchar("push_status", { length: 32 })
      .notNull()
      .default("not_asked")
      .$type<PortalPushStatus>(),
    pushAttemptedAt: timestamp("push_attempted_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedBy: uuid("completed_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("portal_onboarding_session_identity_idx").on(
      table.tenantId,
      table.userId,
      table.portal,
    ),
    uniqueIndex("portal_onboarding_session_id_tenant_idx").on(
      table.id,
      table.tenantId,
    ),
    index("portal_onboarding_session_status_idx").on(
      table.tenantId,
      table.portal,
      table.status,
      table.lastActivityAt,
    ),
    index("portal_onboarding_session_subject_idx").on(
      table.tenantId,
      table.portal,
      table.subjectId,
    ),
  ],
);

export const portalOnboardingStepCompletionsTable = pgTable(
  "portal_onboarding_step_completions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").notNull(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    stepKey: varchar("step_key", { length: 80 }).notNull(),
    onboardingVersion: integer("onboarding_version").notNull().default(1),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    completedAt: timestamp("completed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "portal_onboarding_step_session_tenant_fk",
      columns: [table.sessionId, table.tenantId],
      foreignColumns: [
        portalOnboardingSessionsTable.id,
        portalOnboardingSessionsTable.tenantId,
      ],
    }).onDelete("cascade"),
    uniqueIndex("portal_onboarding_step_session_idx").on(
      table.sessionId,
      table.stepKey,
    ),
    index("portal_onboarding_step_tenant_idx").on(
      table.tenantId,
      table.completedAt,
    ),
  ],
);

export const portalNotificationPreferencesTable = pgTable(
  "portal_notification_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    portal: varchar("portal", { length: 20 })
      .notNull()
      .$type<PortalOnboardingPortal>(),
    category: varchar("category", { length: 80 }).notNull(),
    emailEnabled: boolean("email_enabled").notNull().default(true),
    pushEnabled: boolean("push_enabled").notNull().default(false),
    inAppEnabled: boolean("in_app_enabled").notNull().default(true),
    critical: boolean("critical").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("portal_notification_preference_identity_idx").on(
      table.tenantId,
      table.userId,
      table.portal,
      table.category,
    ),
    index("portal_notification_preference_tenant_idx").on(
      table.tenantId,
      table.portal,
      table.userId,
    ),
  ],
);

export type PortalOnboardingSession =
  typeof portalOnboardingSessionsTable.$inferSelect;
export type PortalOnboardingStepCompletion =
  typeof portalOnboardingStepCompletionsTable.$inferSelect;
export type PortalNotificationPreference =
  typeof portalNotificationPreferencesTable.$inferSelect;
