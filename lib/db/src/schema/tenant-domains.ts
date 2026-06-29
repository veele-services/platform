import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { DEFAULT_TENANT_ID, tenantsTable } from "./tenants";

export const tenantDomainsTable = pgTable(
  "tenant_domains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .default(sql`'${sql.raw(DEFAULT_TENANT_ID)}'::uuid`)
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(),
    type: text("type").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    verificationStatus: text("verification_status").notNull().default("pending"),
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

export type TenantDomain = typeof tenantDomainsTable.$inferSelect;
export type InsertTenantDomain = typeof tenantDomainsTable.$inferInsert;
