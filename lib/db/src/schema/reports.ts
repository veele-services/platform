import {
  index,
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { assignmentsTable } from "./assignments";
import { tenantsTable } from "./tenants";

export const REPORT_STATUSES = ["draft", "submitted", "approved", "rejected"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/**
 * Operational reports submitted for completed assignments.
 * One report per assignment (enforced via unique index on assignment_id).
 */
export const reportsTable = pgTable(
  "reports",
  {
    id:           uuid("id").primaryKey().defaultRandom(),
    tenantId:     uuid("tenant_id").references(() => tenantsTable.id, { onDelete: "cascade" }),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignmentsTable.id, { onDelete: "cascade" }),

    /** Supabase Auth UUID of the staff member who submitted the report. */
    submittedBy:  uuid("submitted_by").notNull(),
    submittedAt:  timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),

    /** Current review status of this report. */
    status:       varchar("status", { length: 20 }).notNull().default("submitted"),

    /** The narrative report body written by the field worker. */
    content:        text("content").notNull(),

    /** Hours worked on this assignment, as reported by the field worker. */
    hoursWorked:    numeric("hours_worked", { precision: 5, scale: 2 }),

    /** Optional extra observations or remarks from the field worker. */
    submitterNotes: text("submitter_notes"),

    /** Management feedback — filled on approval or rejection. */
    notes:          text("notes"),

    /** Supabase Auth UUID of the manager who approved or rejected the report. */
    reviewedBy:   uuid("reviewed_by"),
    reviewedAt:   timestamp("reviewed_at", { withTimezone: true }),

    createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("reports_tenant_idx").on(table.tenantId),
    index("reports_tenant_assignment_idx").on(table.tenantId, table.assignmentId),
  ],
);

export const insertReportSchema = createInsertSchema(reportsTable).omit({
  id: true,
  tenantId: true,
  submittedAt: true,
  createdAt: true,
  updatedAt: true,
});

export const selectReportSchema = createSelectSchema(reportsTable);
export const updateReportSchema  = insertReportSchema.partial();

export type InsertReport = z.infer<typeof insertReportSchema>;
export type UpdateReport = z.infer<typeof updateReportSchema>;
export type Report       = z.infer<typeof selectReportSchema>;
