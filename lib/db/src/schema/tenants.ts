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

export const tenantsTable = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: varchar("slug", { length: 80 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("tenants_slug_idx").on(table.slug)],
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
