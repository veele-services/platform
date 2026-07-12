import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export const CREDENTIAL_CHALLENGE_PURPOSES = ["invite_activation", "password_reset", "admin_initiated_reset"] as const;
export type CredentialChallengePurpose = (typeof CREDENTIAL_CHALLENGE_PURPOSES)[number];
export const CREDENTIAL_PORTALS = ["platform", "backoffice", "personnel", "customer", "tenant-admin", "platform-admin"] as const;
export type CredentialPortal = (typeof CREDENTIAL_PORTALS)[number];

export const credentialChallengesTable = pgTable(
  "credential_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    purpose: varchar("purpose", { length: 40 }).notNull().$type<CredentialChallengePurpose>(),
    userId: uuid("user_id").notNull(),
    portal: varchar("portal", { length: 40 }).notNull().$type<CredentialPortal>(),
    tenantId: uuid("tenant_id").references(() => tenantsTable.id, { onDelete: "cascade" }),
    hostClass: varchar("host_class", { length: 120 }).notNull(),
    emailHmac: text("email_hmac").notNull(),
    codeHash: text("code_hash").notNull(),
    keyVersion: varchar("key_version", { length: 80 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    resendCount: integer("resend_count").notNull().default(0),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    invalidatedAt: timestamp("invalidated_at", { withTimezone: true }),
    requestIpHash: text("request_ip_hash"),
    userAgentHash: text("user_agent_hash"),
    status: varchar("status", { length: 40 }).notNull().default("pending"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  },
  (table) => [
    uniqueIndex("credential_challenges_one_active_idx").on(table.purpose, table.userId, table.portal, table.tenantId, table.hostClass),
    index("credential_challenges_email_lookup_idx").on(table.emailHmac, table.purpose, table.createdAt),
    index("credential_challenges_tenant_lookup_idx").on(table.tenantId, table.purpose, table.createdAt),
    index("credential_challenges_cleanup_idx").on(table.expiresAt),
  ],
);

export const credentialResetGrantsTable = pgTable(
  "credential_reset_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    challengeId: uuid("challenge_id").notNull().references(() => credentialChallengesTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    purpose: varchar("purpose", { length: 40 }).notNull().$type<CredentialChallengePurpose>(),
    tenantId: uuid("tenant_id").references(() => tenantsTable.id, { onDelete: "cascade" }),
    hostClass: varchar("host_class", { length: 120 }).notNull(),
    grantHash: text("grant_hash").notNull(),
    keyVersion: varchar("key_version", { length: 80 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    invalidatedAt: timestamp("invalidated_at", { withTimezone: true }),
    status: varchar("status", { length: 40 }).notNull().default("active"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  },
  (table) => [
    uniqueIndex("credential_reset_grants_one_active_per_challenge_idx").on(table.challengeId),
    uniqueIndex("credential_reset_grants_hash_idx").on(table.grantHash),
    index("credential_reset_grants_cleanup_idx").on(table.expiresAt),
  ],
);

export type CredentialChallenge = typeof credentialChallengesTable.$inferSelect;
export type CredentialResetGrant = typeof credentialResetGrantsTable.$inferSelect;
