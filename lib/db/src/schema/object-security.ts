import {
  bigint,
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
import { assignmentsTable } from "./assignments";
import { customersTable } from "./customers";
import { objectsTable } from "./objects";
import { personnelTable } from "./personnel";
import { tenantsTable } from "./tenants";

export const OBJECT_SECURITY_CATEGORIES = [
  "access_instructions",
  "key_location",
  "key_code",
  "alarm_procedure",
  "alarm_code",
  "entrance",
  "badge_instructions",
  "key_management",
  "opening_procedure",
  "closing_procedure",
  "security_contact",
  "emergency_procedure",
  "confidential_route",
  "temporary_access",
] as const;

export type ObjectSecurityCategory =
  (typeof OBJECT_SECURITY_CATEGORIES)[number];

export const OBJECT_SECURITY_ACCESS_PATHS = [
  "management",
  "personnel",
  "customer",
  "break_glass",
] as const;

export type ObjectSecurityAccessPath =
  (typeof OBJECT_SECURITY_ACCESS_PATHS)[number];

export const objectSecurityRecordsTable = pgTable(
  "object_security_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "restrict" }),
    objectId: uuid("object_id")
      .notNull()
      .references(() => objectsTable.id, { onDelete: "restrict" }),
    category: varchar("category", { length: 48 })
      .notNull()
      .$type<ObjectSecurityCategory>(),
    title: varchar("title", { length: 160 }).notNull(),
    encryptedPayload: text("encrypted_payload").notNull(),
    encryptionKeyVersion: integer("encryption_key_version").notNull().default(1),
    version: integer("version").notNull(),
    generation: bigint("generation", { mode: "number" }).notNull().default(1),
    status: varchar("status", { length: 24 }).notNull().default("draft"),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull().defaultNow(),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    source: varchar("source", { length: 32 }).notNull().default("management"),
    changeReason: text("change_reason").notNull(),
    supersedesRecordId: uuid("supersedes_record_id"),
    createdBy: uuid("created_by").notNull(),
    reviewedBy: uuid("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    revokedBy: uuid("revoked_by"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("object_security_records_version_unique").on(
      table.tenantId,
      table.objectId,
      table.category,
      table.version,
    ),
    index("object_security_records_lookup_idx").on(
      table.tenantId,
      table.objectId,
      table.status,
      table.validFrom,
      table.validUntil,
    ),
  ],
);

export const objectSecurityChallengesTable = pgTable(
  "object_security_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "restrict" }),
    userId: uuid("user_id").notNull(),
    personnelId: uuid("personnel_id").references(() => personnelTable.id, {
      onDelete: "restrict",
    }),
    customerId: uuid("customer_id").references(() => customersTable.id, {
      onDelete: "restrict",
    }),
    objectId: uuid("object_id")
      .notNull()
      .references(() => objectsTable.id, { onDelete: "restrict" }),
    assignmentId: uuid("assignment_id").references(() => assignmentsTable.id, {
      onDelete: "restrict",
    }),
    accessPath: varchar("access_path", { length: 24 })
      .notNull()
      .$type<ObjectSecurityAccessPath>(),
    codeHmac: text("code_hmac"),
    businessEmailRevision: text("business_email_revision").notNull(),
    status: varchar("status", { length: 24 }).notNull().default("pending_delivery"),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    resendAfter: timestamp("resend_after", { withTimezone: true }).notNull(),
    deliveryStartedAt: timestamp("delivery_started_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    invalidatedAt: timestamp("invalidated_at", { withTimezone: true }),
    invalidationReason: varchar("invalidation_reason", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("object_security_challenges_rate_limit_idx").on(
      table.tenantId,
      table.userId,
      table.objectId,
      table.createdAt,
    ),
    index("object_security_challenges_context_idx").on(
      table.tenantId,
      table.objectId,
      table.assignmentId,
      table.status,
      table.expiresAt,
    ),
  ],
);

export const objectSecurityUnlockSessionsTable = pgTable(
  "object_security_unlock_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "restrict" }),
    challengeId: uuid("challenge_id")
      .notNull()
      .unique()
      .references(() => objectSecurityChallengesTable.id, { onDelete: "restrict" }),
    handleHash: text("handle_hash").notNull().unique(),
    userId: uuid("user_id").notNull(),
    personnelId: uuid("personnel_id").references(() => personnelTable.id, {
      onDelete: "restrict",
    }),
    customerId: uuid("customer_id").references(() => customersTable.id, {
      onDelete: "restrict",
    }),
    objectId: uuid("object_id")
      .notNull()
      .references(() => objectsTable.id, { onDelete: "restrict" }),
    assignmentId: uuid("assignment_id").references(() => assignmentsTable.id, {
      onDelete: "restrict",
    }),
    accessPath: varchar("access_path", { length: 24 })
      .notNull()
      .$type<ObjectSecurityAccessPath>(),
    authSessionId: text("auth_session_id").notNull(),
    businessEmailRevision: text("business_email_revision").notNull(),
    assignmentRevision: bigint("assignment_revision", { mode: "number" }),
    policyRevision: bigint("policy_revision", { mode: "number" }).notNull(),
    recordGeneration: bigint("record_generation", { mode: "number" }).notNull(),
    idleExpiresAt: timestamp("idle_expires_at", { withTimezone: true }).notNull(),
    absoluteExpiresAt: timestamp("absolute_expires_at", { withTimezone: true }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: uuid("revoked_by"),
    revocationReason: varchar("revocation_reason", { length: 80 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("object_security_unlock_sessions_context_idx").on(
      table.tenantId,
      table.userId,
      table.objectId,
      table.assignmentId,
      table.revokedAt,
      table.absoluteExpiresAt,
    ),
  ],
);

export const objectSecurityAccessAuditTable = pgTable(
  "object_security_access_audit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "restrict" }),
    actorUserId: uuid("actor_user_id"),
    objectId: uuid("object_id")
      .notNull()
      .references(() => objectsTable.id, { onDelete: "restrict" }),
    assignmentId: uuid("assignment_id").references(() => assignmentsTable.id, {
      onDelete: "restrict",
    }),
    securityRecordId: uuid("security_record_id").references(
      () => objectSecurityRecordsTable.id,
      { onDelete: "restrict" },
    ),
    challengeId: uuid("challenge_id").references(
      () => objectSecurityChallengesTable.id,
      { onDelete: "restrict" },
    ),
    unlockSessionId: uuid("unlock_session_id").references(
      () => objectSecurityUnlockSessionsTable.id,
      { onDelete: "restrict" },
    ),
    accessPath: varchar("access_path", { length: 24 }).notNull(),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    result: varchar("result", { length: 24 }).notNull(),
    category: varchar("category", { length: 48 }).$type<ObjectSecurityCategory>(),
    reasonCode: varchar("reason_code", { length: 80 }),
    policyRevision: bigint("policy_revision", { mode: "number" }),
    requestId: varchar("request_id", { length: 128 }),
    safeMetadata: jsonb("safe_metadata").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("object_security_access_audit_tenant_time_idx").on(
      table.tenantId,
      table.occurredAt,
    ),
    index("object_security_access_audit_object_time_idx").on(
      table.tenantId,
      table.objectId,
      table.occurredAt,
    ),
  ],
);

export type ObjectSecurityRecord = typeof objectSecurityRecordsTable.$inferSelect;
export type ObjectSecurityChallenge = typeof objectSecurityChallengesTable.$inferSelect;
export type ObjectSecurityUnlockSession =
  typeof objectSecurityUnlockSessionsTable.$inferSelect;
export type ObjectSecurityAccessAudit =
  typeof objectSecurityAccessAuditTable.$inferSelect;
