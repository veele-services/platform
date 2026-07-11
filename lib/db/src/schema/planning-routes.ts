import {
  pgTable,
  uuid,
  varchar,
  integer,
  numeric,
  timestamp,
  jsonb,
  text,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { assignmentsTable } from "./assignments";
import { personnelTable, type PersonnelVehicleType } from "./personnel";
import { tenantsTable } from "./tenants";

export const planningRouteSnapStatuses = [
  "ok",
  "suggested",
  "outside_window",
  "missing_location",
  "provider_error",
] as const;
export type PlanningRouteSnapStatus =
  (typeof planningRouteSnapStatuses)[number];

export const assignmentRouteCacheTable = pgTable(
  "assignment_route_cache",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 40 }).notNull(),
    vehicleType: varchar("vehicle_type", { length: 40 })
      .notNull()
      .$type<PersonnelVehicleType>(),
    originLat: numeric("origin_lat", { precision: 9, scale: 6 }).notNull(),
    originLng: numeric("origin_lng", { precision: 9, scale: 6 }).notNull(),
    destinationLat: numeric("destination_lat", { precision: 9, scale: 6 }).notNull(),
    destinationLng: numeric("destination_lng", { precision: 9, scale: 6 }).notNull(),
    originHash: varchar("origin_hash", { length: 80 }).notNull(),
    destinationHash: varchar("destination_hash", { length: 80 }).notNull(),
    requestContextHash: varchar("request_context_hash", { length: 80 })
      .notNull()
      .default("legacy"),
    durationSeconds: integer("duration_seconds").notNull(),
    distanceMeters: integer("distance_meters"),
    providerMeta: jsonb("provider_meta").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    calculatedAt: timestamp("calculated_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("assignment_route_cache_unique_idx").on(
      table.tenantId,
      table.provider,
      table.vehicleType,
      table.originHash,
      table.destinationHash,
      table.requestContextHash,
    ),
    index("assignment_route_cache_tenant_expires_idx").on(table.tenantId, table.expiresAt),
  ],
);

export const assignmentRouteContextsTable = pgTable(
  "assignment_route_contexts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignmentsTable.id, { onDelete: "cascade" }),
    personnelId: uuid("personnel_id")
      .notNull()
      .references(() => personnelTable.id, { onDelete: "cascade" }),
    previousAssignmentId: uuid("previous_assignment_id").references(() => assignmentsTable.id, { onDelete: "set null" }),
    scheduledDate: varchar("scheduled_date", { length: 10 }).notNull(),
    sequenceIndex: integer("sequence_index").notNull(),
    originKind: varchar("origin_kind", { length: 40 }),
    originAssignmentId: uuid("origin_assignment_id").references(() => assignmentsTable.id, { onDelete: "set null" }),
    originLat: numeric("origin_lat", { precision: 9, scale: 6 }),
    originLng: numeric("origin_lng", { precision: 9, scale: 6 }),
    destinationLat: numeric("destination_lat", { precision: 9, scale: 6 }),
    destinationLng: numeric("destination_lng", { precision: 9, scale: 6 }),
    vehicleType: varchar("vehicle_type", { length: 40 })
      .notNull()
      .$type<PersonnelVehicleType>(),
    travelDurationSeconds: integer("travel_duration_seconds"),
    travelDistanceMeters: integer("travel_distance_meters"),
    bufferMinutes: integer("buffer_minutes").notNull().default(0),
    computedEarliestStart: timestamp("computed_earliest_start", { withTimezone: true }),
    customerWindowStart: varchar("customer_window_start", { length: 5 }),
    customerWindowEnd: varchar("customer_window_end", { length: 5 }),
    snapStatus: varchar("snap_status", { length: 40 }).$type<PlanningRouteSnapStatus>(),
    snapSuggestedStart: varchar("snap_suggested_start", { length: 5 }),
    snapSuggestedEnd: varchar("snap_suggested_end", { length: 5 }),
    warningCode: varchar("warning_code", { length: 80 }),
    warningMessage: text("warning_message"),
    calculatedAt: timestamp("calculated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("assignment_route_contexts_assignment_personnel_day_idx").on(
      table.tenantId,
      table.assignmentId,
      table.personnelId,
      table.scheduledDate,
    ),
    index("assignment_route_contexts_tenant_day_idx").on(table.tenantId, table.scheduledDate),
    index("assignment_route_contexts_personnel_day_idx").on(table.tenantId, table.personnelId, table.scheduledDate),
    index("assignment_route_contexts_assignment_idx").on(table.assignmentId),
    index("assignment_route_contexts_warning_idx").on(table.tenantId, table.warningCode),
  ],
);

export type AssignmentRouteCache =
  typeof assignmentRouteCacheTable.$inferSelect;
export type InsertAssignmentRouteCache =
  typeof assignmentRouteCacheTable.$inferInsert;
export type AssignmentRouteContext =
  typeof assignmentRouteContextsTable.$inferSelect;
export type InsertAssignmentRouteContext =
  typeof assignmentRouteContextsTable.$inferInsert;
