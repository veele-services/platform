import { sql } from "drizzle-orm";
import {
  customType,
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

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const CREDENTIAL_RECOVERY_SURFACES = [
  "tenant-backoffice",
  "personnel-portal",
  "customer-portal",
  "platform-admin",
] as const;

export const CREDENTIAL_RECOVERY_PURPOSES = ["activation", "password-reset"] as const;

export const credentialRecoveryChallengesTable = pgTable(
  "credential_recovery_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenantsTable.id, { onDelete: "restrict" }),
    surface: varchar("surface", { length: 32 }).notNull(),
    purpose: varchar("purpose", { length: 32 }).notNull(),
    subjectUserId: uuid("subject_user_id"),
    accountLookupHmac: bytea("account_lookup_hmac").notNull(),
    codeHash: bytea("code_hash").notNull(),
    grantHash: bytea("grant_hash"),
    requestFingerprintHmac: bytea("request_fingerprint_hmac").notNull(),
    redirectOrigin: text("redirect_origin").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    grantExpiresAt: timestamp("grant_expires_at", { withTimezone: true }),
    resendAvailableAt: timestamp("resend_available_at", { withTimezone: true }).notNull(),
    attemptsRemaining: integer("attempts_remaining").notNull().default(6),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    usedAt: timestamp("used_at", { withTimezone: true }),
    invalidatedAt: timestamp("invalidated_at", { withTimezone: true }),
    invalidatedReason: varchar("invalidated_reason", { length: 80 }),
    deliveryStatus: varchar("delivery_status", { length: 24 }).notNull().default("pending"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    requestedByUserId: uuid("requested_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("credential_recovery_active_challenge_v2_idx")
      .on(
        table.surface,
        sql`coalesce(${table.tenantId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
        table.accountLookupHmac,
        table.purpose,
      )
      .where(sql`${table.usedAt} IS NULL AND ${table.invalidatedAt} IS NULL`),
    uniqueIndex("credential_recovery_active_grant_v2_idx")
      .on(table.grantHash)
      .where(sql`${table.grantHash} IS NOT NULL AND ${table.usedAt} IS NULL AND ${table.invalidatedAt} IS NULL`),
    index("credential_recovery_expiry_v2_idx").on(table.expiresAt),
    index("credential_recovery_subject_v2_idx").on(table.subjectUserId, table.createdAt),
  ],
);

export const credentialRecoveryEventsTable = pgTable(
  "credential_recovery_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    challengeId: uuid("challenge_id").references(() => credentialRecoveryChallengesTable.id, { onDelete: "set null" }),
    tenantId: uuid("tenant_id").references(() => tenantsTable.id, { onDelete: "restrict" }),
    surface: varchar("surface", { length: 32 }).notNull(),
    purpose: varchar("purpose", { length: 32 }).notNull(),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    accountLookupHmac: bytea("account_lookup_hmac").notNull(),
    requestFingerprintHmac: bytea("request_fingerprint_hmac").notNull(),
    actorUserId: uuid("actor_user_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("credential_recovery_events_lookup_idx").on(table.accountLookupHmac, table.createdAt),
    index("credential_recovery_events_fingerprint_idx").on(table.requestFingerprintHmac, table.createdAt),
    index("credential_recovery_events_tenant_idx").on(table.tenantId, table.createdAt),
  ],
);

export type CredentialRecoveryChallenge = typeof credentialRecoveryChallengesTable.$inferSelect;
export type CredentialRecoveryEvent = typeof credentialRecoveryEventsTable.$inferSelect;
