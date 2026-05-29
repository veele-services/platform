import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
  integer,
  numeric,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sectorsTable } from "./sectors";
import { rolesTable } from "./roles";

/**
 * Centrally managed work type definitions.
 * Task codes drive planning eligibility, reporting requirements, and invoicing.
 */
export const taskCodesTable = pgTable("task_codes", {
  id:                    uuid("id").primaryKey().defaultRandom(),
  code:                  varchar("code", { length: 50 }).notNull().unique(),
  name:                  varchar("name", { length: 200 }).notNull(),
  sectorId:              uuid("sector_id").references(() => sectorsTable.id, { onDelete: "set null" }),
  description:           text("description"),

  /** Selling price per unit / occurrence in EUR. */
  price:                 numeric("price", { precision: 10, scale: 2 }),
  /** Planned task duration in minutes. */
  durationMinutes:       integer("duration_minutes"),

  /** Planning eligibility — all must be satisfied before an employee can be assigned. */
  requiredCertificates:  jsonb("required_certificates").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  requiredDiploma:       varchar("required_diploma", { length: 200 }),
  requiredKnowledge:     jsonb("required_knowledge").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  /** If set, only employees with this role can be assigned. */
  requiredRoleId:        uuid("required_role_id").references(() => rolesTable.id, { onDelete: "set null" }),

  /** Whether field photos must be submitted with the task report. */
  photoRequired:         boolean("photo_required").notNull().default(false),
  /** Whether a written report must be submitted upon completion. */
  reportRequired:        boolean("report_required").notNull().default(false),
  /** Whether this task generates an invoice line. */
  invoiceable:           boolean("invoiceable").notNull().default(true),

  isActive:              boolean("is_active").notNull().default(true),
  createdAt:             timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:             timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTaskCodeSchema = createInsertSchema(taskCodesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateTaskCodeSchema = insertTaskCodeSchema.partial();

export type InsertTaskCode = z.infer<typeof insertTaskCodeSchema>;
export type UpdateTaskCode = z.infer<typeof updateTaskCodeSchema>;
export type TaskCode = typeof taskCodesTable.$inferSelect;
