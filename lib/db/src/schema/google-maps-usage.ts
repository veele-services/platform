import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenantsTable } from "./tenants";

export const GOOGLE_MAPS_USAGE_EVENT_TYPES = [
  "maps_view_opened",
  "autocomplete_request",
  "autocomplete_session_started",
  "autocomplete_selection",
  "place_details_request",
  "route_request",
  "route_request_drive_traffic",
  "route_request_bicycle",
  "route_request_walk",
  "route_request_transit",
  "google_api_error",
  "google_api_rate_limited",
] as const;
export type GoogleMapsUsageEventType =
  (typeof GOOGLE_MAPS_USAGE_EVENT_TYPES)[number];

export const GOOGLE_MAPS_USAGE_CACHE_STATUSES = [
  "miss",
  "in_flight",
  "hit",
  "deduped",
  "cache_hit",
  "cache_miss",
  "bypass",
  "negative_cache",
  "rate_limited",
] as const;
export type GoogleMapsUsageCacheStatus =
  (typeof GOOGLE_MAPS_USAGE_CACHE_STATUSES)[number];

export const googleMapsUsageEventsTable = pgTable(
  "google_maps_usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id"),
    eventType: varchar("event_type", { length: 80 })
      .notNull()
      .$type<GoogleMapsUsageEventType>(),
    environment: varchar("environment", { length: 40 }).notNull(),
    requestDate: date("request_date", { mode: "string" })
      .notNull()
      .defaultNow(),
    success: boolean("success").notNull().default(true),
    responseTimeMs: integer("response_time_ms"),
    cacheOrDedupeStatus: varchar("cache_or_dedupe_status", { length: 40 })
      .notNull()
      .default("miss")
      .$type<GoogleMapsUsageCacheStatus>(),
    provider: varchar("provider", { length: 40 }).notNull().default("google_maps"),
    estimatedSku: varchar("estimated_sku", { length: 120 }),
    metadata: jsonb("metadata")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("google_maps_usage_events_tenant_date_idx").on(
      table.tenantId,
      table.requestDate,
    ),
    index("google_maps_usage_events_tenant_event_date_idx").on(
      table.tenantId,
      table.eventType,
      table.requestDate,
    ),
    index("google_maps_usage_events_tenant_success_created_idx").on(
      table.tenantId,
      table.success,
      table.createdAt,
    ),
    index("google_maps_usage_events_monthly_provider_idx").on(
      table.tenantId,
      table.provider,
      table.requestDate,
    ),
  ],
);

export type GoogleMapsUsageEvent =
  typeof googleMapsUsageEventsTable.$inferSelect;
export type InsertGoogleMapsUsageEvent =
  typeof googleMapsUsageEventsTable.$inferInsert;
