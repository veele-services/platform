import {
  pgTable,
  uuid,
  integer,
  varchar,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { personnelTable } from "./personnel";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const LEAVE_TYPES = ["vakantie", "ziekte", "overig"] as const;
export type LeaveType = typeof LEAVE_TYPES[number];

export const LEAVE_STATUSES = ["pending", "approved", "rejected"] as const;
export type LeaveStatus = typeof LEAVE_STATUSES[number];

export type AvailabilityStatus =
  | "beschikbaar"
  | "op_verlof"
  | "ziek"
  | "niet_ingesteld"
  | "niet_beschikbaar";

// ─── Tables ───────────────────────────────────────────────────────────────────

/**
 * One row per workday that a personnel member is available.
 * day_of_week follows JS convention: 0 = Sunday, 1 = Monday, …, 6 = Saturday.
 * At most one window per (personnel_id, day_of_week) — enforced via UNIQUE constraint.
 */
export const availabilityWindowsTable = pgTable(
  "availability_windows",
  {
    id:          uuid("id").primaryKey().defaultRandom(),
    personnelId: uuid("personnel_id")
      .notNull()
      .references(() => personnelTable.id, { onDelete: "cascade" }),
    dayOfWeek:   integer("day_of_week").notNull(),
    startTime:   varchar("start_time", { length: 5 }).notNull().default("08:00"),
    endTime:     varchar("end_time",   { length: 5 }).notNull().default("17:00"),
    createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("avail_windows_personnel_dow_idx").on(t.personnelId, t.dayOfWeek),
  ],
);

/**
 * A leave period (vakantie, ziekte, overig) for a personnel member.
 * start_date / end_date are stored as YYYY-MM-DD strings to avoid tz issues.
 * status: 'pending' = awaiting management approval (PWA requests),
 *         'approved' = accepted, 'rejected' = declined.
 */
export const leavePeriodsTable = pgTable("leave_periods", {
  id:          uuid("id").primaryKey().defaultRandom(),
  personnelId: uuid("personnel_id")
    .notNull()
    .references(() => personnelTable.id, { onDelete: "cascade" }),
  startDate:   varchar("start_date", { length: 10 }).notNull(),
  endDate:     varchar("end_date",   { length: 10 }),
  leaveType:   varchar("leave_type", { length: 20 }).notNull().$type<LeaveType>(),
  reason:      text("reason"),
  status:      varchar("status", { length: 20 }).notNull().default("approved").$type<LeaveStatus>(),
  createdBy:   uuid("created_by"),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
