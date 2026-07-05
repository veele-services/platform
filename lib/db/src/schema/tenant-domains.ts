import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { platformUsersTable } from "./platform-users";

export const tenantDomainsTable = pgTable(
  "tenant_domains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(),
    type: text("type").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    verificationStatus: text("verification_status").notNull().default("pending"),
    verificationToken: text("verification_token"),
    verificationMethod: varchar("verification_method", { length: 30 }).notNull().default("dns_txt"),
    dnsTxtName: text("dns_txt_name"),
    dnsTarget: text("dns_target"),
    dnsLastCheckedAt: timestamp("dns_last_checked_at", { withTimezone: true }),
    dnsLastError: text("dns_last_error"),
    tlsStatus: varchar("tls_status", { length: 30 }).notNull().default("pending"),
    tlsLastCheckedAt: timestamp("tls_last_checked_at", { withTimezone: true }),
    tlsLastError: text("tls_last_error"),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    disabledReason: text("disabled_reason"),
    createdByPlatformUserId: uuid("created_by_platform_user_id").references(() => platformUsersTable.id, { onDelete: "set null" }),
    verifiedByPlatformUserId: uuid("verified_by_platform_user_id").references(() => platformUsersTable.id, { onDelete: "set null" }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("tenant_domains_domain_unique").on(table.domain),
    index("tenant_domains_tenant_idx").on(table.tenantId),
    uniqueIndex("tenant_domains_tenant_primary_idx")
      .on(table.tenantId)
      .where(sql`${table.isPrimary} = true`),
  ],
);

export const tenantDomainChecksTable = pgTable(
  "tenant_domain_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantDomainId: uuid("tenant_domain_id")
      .notNull()
      .references(() => tenantDomainsTable.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    checkType: varchar("check_type", { length: 40 }).notNull(),
    status: varchar("status", { length: 30 }).notNull(),
    details: jsonb("details"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("tenant_domain_checks_domain_created_idx").on(table.tenantDomainId, table.createdAt),
    index("tenant_domain_checks_tenant_created_idx").on(table.tenantId, table.createdAt),
  ],
);

export type TenantDomain = typeof tenantDomainsTable.$inferSelect;
export type InsertTenantDomain = typeof tenantDomainsTable.$inferInsert;
export type TenantDomainCheck = typeof tenantDomainChecksTable.$inferSelect;
