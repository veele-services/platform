import {
  boolean,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sectorsTable } from "./sectors";
import { DEFAULT_TENANT_ID, tenantsTable } from "./tenants";

export const tenantSectorsTable = pgTable(
  "tenant_sectors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .default(DEFAULT_TENANT_ID)
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    sectorId: uuid("sector_id")
      .notNull()
      .references(() => sectorsTable.id, { onDelete: "cascade" }),
    isEnabled: boolean("is_enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("tenant_sectors_tenant_sector_idx").on(table.tenantId, table.sectorId),
    index("tenant_sectors_tenant_idx").on(table.tenantId),
    index("tenant_sectors_sector_idx").on(table.sectorId),
  ],
);

export type TenantSector = typeof tenantSectorsTable.$inferSelect;
export type InsertTenantSector = typeof tenantSectorsTable.$inferInsert;
