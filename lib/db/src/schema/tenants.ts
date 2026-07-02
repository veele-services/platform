import {
  boolean,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000010";

export const TENANT_STATUSES = [
  "provisioning",
  "trial",
  "active",
  "suspended",
  "archived",
] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const TENANT_RUNTIME_ACTIVE_STATUSES = ["trial", "active"] as const;
export type TenantRuntimeActiveStatus = (typeof TENANT_RUNTIME_ACTIVE_STATUSES)[number];

export const TENANT_PLAN_KEYS = ["starter", "professional", "enterprise"] as const;
export type TenantPlanKey = (typeof TENANT_PLAN_KEYS)[number];

export const tenantsTable = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: varchar("slug", { length: 80 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    status: varchar("status", { length: 30 })
      .notNull()
      .default("active")
      .$type<TenantStatus>(),
    planKey: varchar("plan_key", { length: 40 })
      .notNull()
      .default("starter")
      .$type<TenantPlanKey>(),
    createdBy: uuid("created_by"),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    suspendedBy: uuid("suspended_by"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedBy: uuid("archived_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("tenants_slug_idx").on(table.slug),
    index("tenants_status_idx").on(table.status),
    index("tenants_plan_key_idx").on(table.planKey),
  ],
);

export const tenantUsersTable = pgTable(
  "tenant_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    role: varchar("role", { length: 40 }).notNull().default("member"),
    status: varchar("status", { length: 30 }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("tenant_users_tenant_user_idx").on(table.tenantId, table.userId),
    index("tenant_users_user_idx").on(table.userId),
  ],
);

export type Tenant = typeof tenantsTable.$inferSelect;
export type TenantUser = typeof tenantUsersTable.$inferSelect;
