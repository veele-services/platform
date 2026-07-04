import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { modulesTable } from "./modules";
import { tenantsTable, type TenantPlanKey } from "./tenants";

export const PLAN_LIMIT_KEYS = ["custom_roles", "custom_domains", "max_seats"] as const;
export const TENANT_SUBSCRIPTION_STATUSES = [
  "trial",
  "active",
  "past_due",
  "canceled",
  "expired",
] as const;
export const TENANT_SUBSCRIPTION_SOURCES = ["system", "migration", "manual", "support"] as const;

export type PlanLimitKey = (typeof PLAN_LIMIT_KEYS)[number] | (string & {});
export type TenantSubscriptionStatus = (typeof TENANT_SUBSCRIPTION_STATUSES)[number];
export type TenantSubscriptionSource = (typeof TENANT_SUBSCRIPTION_SOURCES)[number];

export const plansTable = pgTable(
  "plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: varchar("key", { length: 40 }).notNull().$type<TenantPlanKey>(),
    name: varchar("name", { length: 120 }).notNull(),
    description: text("description"),
    supportLevel: varchar("support_level", { length: 40 }).notNull().default("standard"),
    supportDescription: text("support_description"),
    maxSeats: integer("max_seats"),
    isActive: boolean("is_active").notNull().default(true),
    isPublic: boolean("is_public").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("plans_key_idx").on(table.key),
    index("plans_active_idx").on(table.isActive),
    index("plans_sort_order_idx").on(table.sortOrder),
  ],
);

export const planModulesTable = pgTable(
  "plan_modules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plansTable.id, { onDelete: "cascade" }),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => modulesTable.id, { onDelete: "cascade" }),
    isIncluded: boolean("is_included").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("plan_modules_plan_module_idx").on(table.planId, table.moduleId),
    index("plan_modules_module_idx").on(table.moduleId),
  ],
);

export const planLimitsTable = pgTable(
  "plan_limits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plansTable.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 80 }).notNull().$type<PlanLimitKey>(),
    description: text("description"),
    isEnabled: boolean("is_enabled").notNull().default(true),
    limitValue: integer("limit_value"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("plan_limits_plan_key_idx").on(table.planId, table.key),
    index("plan_limits_key_idx").on(table.key),
  ],
);

export const tenantSubscriptionsTable = pgTable(
  "tenant_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plansTable.id, { onDelete: "restrict" }),
    status: varchar("status", { length: 30 })
      .notNull()
      .default("active")
      .$type<TenantSubscriptionStatus>(),
    source: varchar("source", { length: 40 })
      .notNull()
      .default("manual")
      .$type<TenantSubscriptionSource>(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
    currentPeriodStartsAt: timestamp("current_period_starts_at", { withTimezone: true }),
    currentPeriodEndsAt: timestamp("current_period_ends_at", { withTimezone: true }),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    billingReference: varchar("billing_reference", { length: 160 }),
    manualBillingNotes: text("manual_billing_notes"),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("tenant_subscriptions_tenant_idx").on(table.tenantId),
    index("tenant_subscriptions_plan_idx").on(table.planId),
    index("tenant_subscriptions_status_idx").on(table.status),
    uniqueIndex("tenant_subscriptions_tenant_active_idx")
      .on(table.tenantId)
      .where(sql`${table.status} IN ('trial', 'active')`),
  ],
);

export type Plan = typeof plansTable.$inferSelect;
export type InsertPlan = typeof plansTable.$inferInsert;
export type PlanModule = typeof planModulesTable.$inferSelect;
export type PlanLimit = typeof planLimitsTable.$inferSelect;
export type TenantSubscription = typeof tenantSubscriptionsTable.$inferSelect;
export type InsertTenantSubscription = typeof tenantSubscriptionsTable.$inferInsert;
