import {
  boolean,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sectorsTable } from "./sectors";
import { DEFAULT_TENANT_ID, tenantsTable } from "./tenants";

export const TENANT_SECTOR_POLICY_MODES = ["multi", "single"] as const;

export type TenantSectorPolicyMode = (typeof TENANT_SECTOR_POLICY_MODES)[number];

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

export const tenantSectorSettingsTable = pgTable(
  "tenant_sector_settings",
  {
    tenantId: uuid("tenant_id")
      .primaryKey()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    mode: varchar("mode", { length: 20 }).notNull().default("multi").$type<TenantSectorPolicyMode>(),
    maxSectors: integer("max_sectors"),
    defaultSectorId: uuid("default_sector_id").references(() => sectorsTable.id, { onDelete: "set null" }),
    enforceSectorScope: boolean("enforce_sector_scope").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("tenant_sector_settings_default_sector_idx").on(table.defaultSectorId),
    index("tenant_sector_settings_mode_idx").on(table.mode),
  ],
);

export type TenantSector = typeof tenantSectorsTable.$inferSelect;
export type InsertTenantSector = typeof tenantSectorsTable.$inferInsert;
export type TenantSectorSettings = typeof tenantSectorSettingsTable.$inferSelect;
export type InsertTenantSectorSettings = typeof tenantSectorSettingsTable.$inferInsert;
