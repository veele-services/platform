import {
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export const TENANT_SEQUENCE_KEYS = ["material_code", "inventory_code"] as const;
export type TenantSequenceKey = (typeof TENANT_SEQUENCE_KEYS)[number] | (string & {});

export const tenantSequencesTable = pgTable(
  "tenant_sequences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    sequenceKey: varchar("sequence_key", { length: 80 }).notNull().$type<TenantSequenceKey>(),
    nextValue: integer("next_value").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("tenant_sequences_tenant_key_idx").on(table.tenantId, table.sequenceKey),
    index("tenant_sequences_key_idx").on(table.sequenceKey),
  ],
);

export type TenantSequence = typeof tenantSequencesTable.$inferSelect;
export type InsertTenantSequence = typeof tenantSequencesTable.$inferInsert;
