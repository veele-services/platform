import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { assignmentsTable } from "./assignments";
import { personnelTable } from "./personnel";
import { sectorsTable } from "./sectors";
import { DEFAULT_TENANT_ID, tenantsTable } from "./tenants";

export const SMART_PLANNING_CAPACITY_STATUSES = ["green", "orange", "red"] as const;
export type SmartPlanningCapacityStatus =
  (typeof SMART_PLANNING_CAPACITY_STATUSES)[number];

export const SMART_PLANNING_CANDIDATE_STATUSES = [
  "eligible",
  "warning",
  "blocked",
] as const;
export type SmartPlanningCandidateStatus =
  (typeof SMART_PLANNING_CANDIDATE_STATUSES)[number];

export const SMART_PLANNING_INTEREST_ROUND_AUDIENCES = [
  "top_matches",
  "next_matches",
  "flexpool",
  "spoedpool",
  "manual",
] as const;
export type SmartPlanningInterestRoundAudience =
  (typeof SMART_PLANNING_INTEREST_ROUND_AUDIENCES)[number];

export const SMART_PLANNING_INTEREST_ROUND_STATUSES = [
  "draft",
  "sent",
  "expired",
  "cancelled",
] as const;
export type SmartPlanningInterestRoundStatus =
  (typeof SMART_PLANNING_INTEREST_ROUND_STATUSES)[number];

export const SMART_PLANNING_INTEREST_RESPONSE_STATUSES = [
  "invited",
  "viewed",
  "interested",
  "unavailable",
  "question",
  "selected",
  "reserve",
  "confirmed",
  "cancelled",
  "expired",
] as const;
export type SmartPlanningInterestResponseStatus =
  (typeof SMART_PLANNING_INTEREST_RESPONSE_STATUSES)[number];

export type SmartPlanningScoreWeights = {
  availability: number;
  role: number;
  qualifications: number;
  region: number;
  objectExperience: number;
  workload: number;
  emergency: number;
  fixedTeams: number;
  preferences: number;
};

export type SmartPlanningReason = {
  code: string;
  label: string;
  severity: "ok" | "warning" | "block";
};

export type SmartPlanningScoreBreakdown = Record<
  keyof SmartPlanningScoreWeights,
  {
    weight: number;
    awarded: number;
    label: string;
  }
>;

export const assignmentCapacityChecksTable = pgTable(
  "assignment_capacity_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .default(sql`'${sql.raw(DEFAULT_TENANT_ID)}'::uuid`)
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignmentsTable.id, { onDelete: "cascade" }),
    requiredSlots: integer("required_slots").notNull().default(1),
    suitableTotal: integer("suitable_total").notNull().default(0),
    availableTotal: integer("available_total").notNull().default(0),
    topMatchTotal: integer("top_match_total").notNull().default(0),
    conflictTotal: integer("conflict_total").notNull().default(0),
    interestedTotal: integer("interested_total").notNull().default(0),
    highestMatchScore: integer("highest_match_score").notNull().default(0),
    capacityStatus: varchar("capacity_status", { length: 20 })
      .notNull()
      .default("red")
      .$type<SmartPlanningCapacityStatus>(),
    advice: text("advice").notNull(),
    inputSnapshot: jsonb("input_snapshot")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    summary: jsonb("summary")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    generatedBy: uuid("generated_by"),
    isLatest: boolean("is_latest").notNull().default(true),
  },
  (table) => [
    index("assignment_capacity_checks_assignment_generated_idx").on(
      table.assignmentId,
      table.generatedAt,
    ),
    index("assignment_capacity_checks_tenant_status_idx").on(
      table.tenantId,
      table.capacityStatus,
    ),
    uniqueIndex("assignment_capacity_checks_latest_idx")
      .on(table.assignmentId)
      .where(sql`${table.isLatest} = true`),
  ],
);

export const assignmentCandidatesTable = pgTable(
  "assignment_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .default(sql`'${sql.raw(DEFAULT_TENANT_ID)}'::uuid`)
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignmentsTable.id, { onDelete: "cascade" }),
    personnelId: uuid("personnel_id")
      .notNull()
      .references(() => personnelTable.id, { onDelete: "cascade" }),
    hardStatus: varchar("hard_status", { length: 20 })
      .notNull()
      .default("blocked")
      .$type<SmartPlanningCandidateStatus>(),
    isEligible: boolean("is_eligible").notNull().default(false),
    isAvailable: boolean("is_available").notNull().default(false),
    hasConflict: boolean("has_conflict").notNull().default(false),
    matchScore: integer("match_score").notNull().default(0),
    reasons: jsonb("reasons")
      .$type<SmartPlanningReason[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    scoreBreakdown: jsonb("score_breakdown")
      .$type<Partial<SmartPlanningScoreBreakdown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    lastCalculatedAt: timestamp("last_calculated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("assignment_candidates_assignment_personnel_idx").on(
      table.assignmentId,
      table.personnelId,
    ),
    index("assignment_candidates_assignment_score_idx").on(
      table.assignmentId,
      table.hardStatus,
      table.matchScore,
    ),
    index("assignment_candidates_personnel_idx").on(table.personnelId),
  ],
);

export const assignmentInterestRoundsTable = pgTable(
  "assignment_interest_rounds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .default(sql`'${sql.raw(DEFAULT_TENANT_ID)}'::uuid`)
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignmentsTable.id, { onDelete: "cascade" }),
    roundNumber: integer("round_number").notNull(),
    audienceType: varchar("audience_type", { length: 30 })
      .notNull()
      .default("top_matches")
      .$type<SmartPlanningInterestRoundAudience>(),
    candidateLimit: integer("candidate_limit").notNull().default(5),
    status: varchar("status", { length: 20 })
      .notNull()
      .default("draft")
      .$type<SmartPlanningInterestRoundStatus>(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("assignment_interest_rounds_assignment_round_idx").on(
      table.assignmentId,
      table.roundNumber,
    ),
    index("assignment_interest_rounds_assignment_status_idx").on(
      table.assignmentId,
      table.status,
    ),
  ],
);

export const assignmentInterestResponsesTable = pgTable(
  "assignment_interest_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .default(sql`'${sql.raw(DEFAULT_TENANT_ID)}'::uuid`)
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignmentsTable.id, { onDelete: "cascade" }),
    roundId: uuid("round_id")
      .notNull()
      .references(() => assignmentInterestRoundsTable.id, {
        onDelete: "cascade",
      }),
    personnelId: uuid("personnel_id")
      .notNull()
      .references(() => personnelTable.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 30 })
      .notNull()
      .default("invited")
      .$type<SmartPlanningInterestResponseStatus>(),
    responseNote: text("response_note"),
    viewedAt: timestamp("viewed_at", { withTimezone: true }),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    selectedAt: timestamp("selected_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("assignment_interest_responses_round_personnel_idx").on(
      table.roundId,
      table.personnelId,
    ),
    index("assignment_interest_responses_assignment_status_idx").on(
      table.assignmentId,
      table.status,
    ),
    index("assignment_interest_responses_personnel_status_idx").on(
      table.personnelId,
      table.status,
    ),
  ],
);

export const planningSectorRulesTable = pgTable(
  "planning_sector_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .default(sql`'${sql.raw(DEFAULT_TENANT_ID)}'::uuid`)
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    sectorId: uuid("sector_id").references(() => sectorsTable.id, {
      onDelete: "cascade",
    }),
    weights: jsonb("weights")
      .$type<SmartPlanningScoreWeights>()
      .notNull()
      .default(
        sql`'{"availability":25,"role":12,"qualifications":20,"region":15,"objectExperience":10,"workload":8,"emergency":4,"fixedTeams":3,"preferences":3}'::jsonb`,
      ),
    topMatchThreshold: integer("top_match_threshold").notNull().default(85),
    defaultRoundSize: integer("default_round_size").notNull().default(5),
    roundIntervalMinutes: integer("round_interval_minutes").notNull().default(30),
    maxDailyInvites: integer("max_daily_invites").notNull().default(6),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("planning_sector_rules_tenant_sector_idx").on(
      table.tenantId,
      table.sectorId,
    ),
  ],
);

export type AssignmentCapacityCheck =
  typeof assignmentCapacityChecksTable.$inferSelect;
export type AssignmentCandidate = typeof assignmentCandidatesTable.$inferSelect;
export type AssignmentInterestRound =
  typeof assignmentInterestRoundsTable.$inferSelect;
export type AssignmentInterestResponse =
  typeof assignmentInterestResponsesTable.$inferSelect;
export type PlanningSectorRule = typeof planningSectorRulesTable.$inferSelect;
