import {
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { customersTable } from "./customers";
import { tenantsTable } from "./tenants";

export const CUSTOMER_USER_ROLES = [
  "primary",
  "admin",
  "billing",
  "operations",
  "viewer",
] as const;
export type CustomerUserRole = (typeof CUSTOMER_USER_ROLES)[number];

export const CUSTOMER_USER_STATUSES = [
  "invited",
  "active",
  "disabled",
  "archived",
] as const;
export type CustomerUserStatus = (typeof CUSTOMER_USER_STATUSES)[number];

export const customerUsersTable = pgTable(
  "customer_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customersTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id"),
    email: varchar("email", { length: 255 }).notNull(),
    firstName: varchar("first_name", { length: 100 }),
    lastName: varchar("last_name", { length: 100 }),
    function: varchar("function", { length: 120 }),
    phone: varchar("phone", { length: 50 }),
    mobile: varchar("mobile", { length: 50 }),
    role: varchar("role", { length: 40 })
      .notNull()
      .default("viewer")
      .$type<CustomerUserRole>(),
    status: varchar("status", { length: 30 })
      .notNull()
      .default("invited")
      .$type<CustomerUserStatus>(),
    inviteSentAt: timestamp("invite_sent_at", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("customer_users_customer_idx").on(table.customerId),
    index("customer_users_tenant_idx").on(table.tenantId),
    index("customer_users_user_idx").on(table.userId),
    uniqueIndex("customer_users_customer_email_idx").on(table.customerId, table.email),
  ],
);

export type CustomerUser = typeof customerUsersTable.$inferSelect;
export type InsertCustomerUser = typeof customerUsersTable.$inferInsert;
