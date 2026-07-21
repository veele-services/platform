import { sql } from "drizzle-orm";
import {
  boolean,
  check,
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
import { assignmentsTable } from "./assignments";
import { customersTable } from "./customers";
import { objectsTable } from "./objects";
import { sectorsTable } from "./sectors";
import { taskCodesTable, tenantTaskCodesTable } from "./task-codes";
import { tenantsTable } from "./tenants";
import type {
  ChecklistBlockingMoment,
  ChecklistCardinality,
  ChecklistCompositionMode,
  ChecklistTemplateSnapshot,
  EffectiveChecklistRules,
} from "../checklist-resolution";

export const CHECKLIST_TEMPLATE_STATUSES = ["draft", "published", "archived"] as const;
export const CHECKLIST_VERSION_STATUSES = ["draft", "published", "archived"] as const;
export const CHECKLIST_BINDING_STATUSES = ["active", "inactive", "archived"] as const;
export const CHECKLIST_VERSION_STRATEGIES = ["pinned", "latest_published"] as const;
export const ASSIGNMENT_CHECKLIST_STATUSES = [
  "active",
  "completed",
  "cancelled",
  "detached_pending_review",
  "not_applicable",
  "waived",
] as const;
export const CHECKLIST_RECONCILIATION_STATUSES = [
  "pending",
  "processing",
  "applied",
  "pending_review",
  "failed",
  "dismissed",
] as const;
export const CHECKLIST_WAIVER_KINDS = ["waived", "not_applicable"] as const;
export const CHECKLIST_EVIDENCE_KINDS = ["photo", "file", "signature"] as const;

export type ChecklistTemplateStatus = (typeof CHECKLIST_TEMPLATE_STATUSES)[number];
export type ChecklistVersionStatus = (typeof CHECKLIST_VERSION_STATUSES)[number];
export type ChecklistBindingStatus = (typeof CHECKLIST_BINDING_STATUSES)[number];
export type ChecklistVersionStrategy = (typeof CHECKLIST_VERSION_STRATEGIES)[number];
export type AssignmentChecklistStatus = (typeof ASSIGNMENT_CHECKLIST_STATUSES)[number];
export type ChecklistReconciliationStatus = (typeof CHECKLIST_RECONCILIATION_STATUSES)[number];
export type ChecklistWaiverKind = (typeof CHECKLIST_WAIVER_KINDS)[number];
export type ChecklistEvidenceKind = (typeof CHECKLIST_EVIDENCE_KINDS)[number];

export const checklistTemplatesTable = pgTable(
  "checklist_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "restrict" }),
    familyKey: varchar("family_key", { length: 120 }).notNull(),
    name: varchar("name", { length: 240 }).notNull(),
    description: text("description"),
    cardinality: varchar("cardinality", { length: 40 }).notNull().$type<ChecklistCardinality>(),
    isProtected: boolean("is_protected").notNull().default(false),
    isWaivable: boolean("is_waivable").notNull().default(false),
    status: varchar("status", { length: 20 }).notNull().default("draft").$type<ChecklistTemplateStatus>(),
    createdBy: uuid("created_by").notNull(),
    updatedBy: uuid("updated_by").notNull(),
    archivedBy: uuid("archived_by"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("checklist_templates_tenant_family_idx").on(table.tenantId, table.familyKey),
    index("checklist_templates_tenant_status_idx").on(table.tenantId, table.status),
    check("checklist_templates_protected_waiver_check", sql`NOT (${table.isProtected} AND ${table.isWaivable})`),
  ],
);

export const checklistTemplateVersionsTable = pgTable(
  "checklist_template_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "restrict" }),
    templateId: uuid("template_id").notNull().references(() => checklistTemplatesTable.id, { onDelete: "restrict" }),
    versionNumber: integer("version_number").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("draft").$type<ChecklistVersionStatus>(),
    schema: jsonb("schema").notNull().$type<ChecklistTemplateSnapshot>(),
    schemaHash: varchar("schema_hash", { length: 80 }).notNull(),
    changeSummary: text("change_summary"),
    createdBy: uuid("created_by").notNull(),
    publishedBy: uuid("published_by"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("checklist_template_versions_number_idx").on(table.templateId, table.versionNumber),
    uniqueIndex("checklist_template_versions_tenant_id_idx").on(table.tenantId, table.id),
    index("checklist_template_versions_tenant_status_idx").on(table.tenantId, table.status),
    check("checklist_template_versions_positive_check", sql`${table.versionNumber} > 0`),
  ],
);

export const checklistBindingsTable = pgTable(
  "checklist_bindings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "restrict" }),
    templateId: uuid("template_id").references(() => checklistTemplatesTable.id, { onDelete: "restrict" }),
    templateVersionId: uuid("template_version_id").references(() => checklistTemplateVersionsTable.id, { onDelete: "restrict" }),
    versionStrategy: varchar("version_strategy", { length: 30 }).notNull().default("latest_published").$type<ChecklistVersionStrategy>(),
    status: varchar("status", { length: 20 }).notNull().default("active").$type<ChecklistBindingStatus>(),
    mode: varchar("mode", { length: 20 }).notNull().default("add").$type<ChecklistCompositionMode>(),
    assignmentId: uuid("assignment_id").references(() => assignmentsTable.id, { onDelete: "restrict" }),
    sectorId: uuid("sector_id").references(() => sectorsTable.id, { onDelete: "restrict" }),
    customerId: uuid("customer_id").references(() => customersTable.id, { onDelete: "restrict" }),
    objectType: varchar("object_type", { length: 100 }),
    objectId: uuid("object_id").references(() => objectsTable.id, { onDelete: "restrict" }),
    taskCodeId: uuid("task_code_id").references(() => taskCodesTable.id, { onDelete: "restrict" }),
    tenantTaskCodeId: uuid("tenant_task_code_id").references(() => tenantTaskCodesTable.id, { onDelete: "restrict" }),
    targetTemplateId: uuid("target_template_id").references(() => checklistTemplatesTable.id, { onDelete: "restrict" }),
    targetFamilyKey: varchar("target_family_key", { length: 120 }),
    activeFrom: timestamp("active_from", { withTimezone: true }),
    activeUntil: timestamp("active_until", { withTimezone: true }),
    autoAttach: boolean("auto_attach").notNull().default(true),
    required: boolean("required").notNull().default(false),
    blockingMoments: jsonb("blocking_moments").notNull().default(sql`'[]'::jsonb`).$type<ChecklistBlockingMoment[]>(),
    skipAllowed: boolean("skip_allowed").notNull().default(false),
    personnelCanRemove: boolean("personnel_can_remove").notNull().default(false),
    minimumPhotos: integer("minimum_photos").notNull().default(0),
    signatureRequired: boolean("signature_required").notNull().default(false),
    deviationNoteRequired: boolean("deviation_note_required").notNull().default(false),
    displayName: varchar("display_name", { length: 240 }),
    instruction: text("instruction"),
    instructionMode: varchar("instruction_mode", { length: 20 }).notNull().default("append"),
    sortOrder: integer("sort_order").notNull().default(0),
    tieBreaker: integer("tie_breaker").notNull().default(0),
    reason: text("reason"),
    createdBy: uuid("created_by").notNull(),
    updatedBy: uuid("updated_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("checklist_bindings_tenant_status_idx").on(table.tenantId, table.status),
    index("checklist_bindings_assignment_idx").on(table.tenantId, table.assignmentId),
    index("checklist_bindings_sector_idx").on(table.tenantId, table.sectorId),
    index("checklist_bindings_customer_idx").on(table.tenantId, table.customerId),
    index("checklist_bindings_object_idx").on(table.tenantId, table.objectId),
    index("checklist_bindings_task_code_idx").on(table.tenantId, table.taskCodeId, table.tenantTaskCodeId),
    check("checklist_bindings_minimum_photos_check", sql`${table.minimumPhotos} >= 0`),
    check("checklist_bindings_validity_check", sql`${table.activeUntil} IS NULL OR ${table.activeFrom} IS NULL OR ${table.activeUntil} >= ${table.activeFrom}`),
  ],
);

export const assignmentChecklistsTable = pgTable(
  "assignment_checklists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "restrict" }),
    assignmentId: uuid("assignment_id").notNull().references(() => assignmentsTable.id, { onDelete: "restrict" }),
    templateId: uuid("template_id").notNull().references(() => checklistTemplatesTable.id, { onDelete: "restrict" }),
    templateVersionId: uuid("template_version_id").notNull().references(() => checklistTemplateVersionsTable.id, { onDelete: "restrict" }),
    cardinality: varchar("cardinality", { length: 40 }).notNull().$type<ChecklistCardinality>(),
    cardinalityKey: varchar("cardinality_key", { length: 300 }).notNull(),
    status: varchar("status", { length: 40 }).notNull().default("active").$type<AssignmentChecklistStatus>(),
    templateSnapshot: jsonb("template_snapshot").notNull().$type<ChecklistTemplateSnapshot>(),
    effectiveRules: jsonb("effective_rules").notNull().$type<EffectiveChecklistRules>(),
    sourceFingerprint: varchar("source_fingerprint", { length: 80 }).notNull(),
    displayOrder: integer("display_order").notNull().default(0),
    responseCount: integer("response_count").notNull().default(0),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdBy: uuid("created_by"),
    updatedBy: uuid("updated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("assignment_checklists_cardinality_idx").on(
      table.tenantId,
      table.assignmentId,
      table.templateId,
      table.cardinality,
      table.cardinalityKey,
    ),
    uniqueIndex("assignment_checklists_tenant_id_idx").on(table.tenantId, table.id),
    index("assignment_checklists_assignment_status_idx").on(table.tenantId, table.assignmentId, table.status),
    index("assignment_checklists_template_idx").on(table.tenantId, table.templateId),
    check("assignment_checklists_response_count_check", sql`${table.responseCount} >= 0`),
  ],
);

export const assignmentChecklistSourcesTable = pgTable(
  "assignment_checklist_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "restrict" }),
    assignmentChecklistId: uuid("assignment_checklist_id").notNull().references(() => assignmentChecklistsTable.id, { onDelete: "restrict" }),
    bindingId: uuid("binding_id").notNull().references(() => checklistBindingsTable.id, { onDelete: "restrict" }),
    sourceKey: varchar("source_key", { length: 300 }).notNull(),
    priority: integer("priority").notNull(),
    specificity: integer("specificity").notNull(),
    sourceSnapshot: jsonb("source_snapshot").notNull(),
    decisions: jsonb("decisions").notNull().default(sql`'[]'::jsonb`).$type<string[]>(),
    isActive: boolean("is_active").notNull().default(true),
    detachedAt: timestamp("detached_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("assignment_checklist_sources_identity_idx").on(table.assignmentChecklistId, table.bindingId, table.sourceKey),
    index("assignment_checklist_sources_tenant_checklist_idx").on(table.tenantId, table.assignmentChecklistId, table.isActive),
  ],
);

export const assignmentChecklistAnswersTable = pgTable(
  "assignment_checklist_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "restrict" }),
    assignmentChecklistId: uuid("assignment_checklist_id").notNull().references(() => assignmentChecklistsTable.id, { onDelete: "restrict" }),
    snapshotItemId: varchar("snapshot_item_id", { length: 160 }).notNull(),
    value: jsonb("value").notNull().default(sql`'null'::jsonb`),
    isDeviation: boolean("is_deviation").notNull().default(false),
    deviationNote: text("deviation_note"),
    revision: integer("revision").notNull().default(1),
    lastOperationKey: varchar("last_operation_key", { length: 200 }),
    answeredBy: uuid("answered_by").notNull(),
    answeredAt: timestamp("answered_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("assignment_checklist_answers_item_idx").on(table.assignmentChecklistId, table.snapshotItemId),
    uniqueIndex("assignment_checklist_answers_operation_idx").on(table.tenantId, table.lastOperationKey),
    index("assignment_checklist_answers_tenant_checklist_idx").on(table.tenantId, table.assignmentChecklistId),
    check("assignment_checklist_answers_revision_check", sql`${table.revision} > 0`),
  ],
);

export const assignmentChecklistEvidenceTable = pgTable(
  "assignment_checklist_evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "restrict" }),
    assignmentChecklistId: uuid("assignment_checklist_id").notNull().references(() => assignmentChecklistsTable.id, { onDelete: "restrict" }),
    answerId: uuid("answer_id").references(() => assignmentChecklistAnswersTable.id, { onDelete: "restrict" }),
    snapshotItemId: varchar("snapshot_item_id", { length: 160 }).notNull(),
    kind: varchar("kind", { length: 20 }).notNull().$type<ChecklistEvidenceKind>(),
    storagePath: text("storage_path").notNull(),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    operationKey: varchar("operation_key", { length: 200 }).notNull(),
    uploadedBy: uuid("uploaded_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("assignment_checklist_evidence_operation_idx").on(table.tenantId, table.operationKey),
    uniqueIndex("assignment_checklist_evidence_storage_idx").on(table.tenantId, table.storagePath),
    index("assignment_checklist_evidence_item_idx").on(table.tenantId, table.assignmentChecklistId, table.snapshotItemId),
  ],
);

export const checklistReconciliationEventsTable = pgTable(
  "checklist_reconciliation_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "restrict" }),
    assignmentId: uuid("assignment_id").notNull().references(() => assignmentsTable.id, { onDelete: "restrict" }),
    trigger: varchar("trigger", { length: 80 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 240 }).notNull(),
    contextFingerprint: varchar("context_fingerprint", { length: 80 }).notNull(),
    contextSnapshot: jsonb("context_snapshot").notNull(),
    desiredSnapshot: jsonb("desired_snapshot").notNull(),
    diff: jsonb("diff").notNull(),
    status: varchar("status", { length: 30 }).notNull().default("pending").$type<ChecklistReconciliationStatus>(),
    retryCount: integer("retry_count").notNull().default(0),
    lastErrorCode: varchar("last_error_code", { length: 100 }),
    reviewReason: text("review_reason"),
    decision: varchar("decision", { length: 40 }),
    decisionReason: text("decision_reason"),
    actorUserId: uuid("actor_user_id"),
    decidedBy: uuid("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    processingStartedAt: timestamp("processing_started_at", { withTimezone: true }),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("checklist_reconciliation_events_idempotency_idx").on(table.tenantId, table.idempotencyKey),
    index("checklist_reconciliation_events_queue_idx").on(table.tenantId, table.status, table.createdAt),
    index("checklist_reconciliation_events_assignment_idx").on(table.tenantId, table.assignmentId, table.status),
    check("checklist_reconciliation_events_retry_check", sql`${table.retryCount} >= 0`),
  ],
);

export const checklistWaiversTable = pgTable(
  "checklist_waivers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "restrict" }),
    assignmentChecklistId: uuid("assignment_checklist_id").notNull().references(() => assignmentChecklistsTable.id, { onDelete: "restrict" }),
    kind: varchar("kind", { length: 30 }).notNull().$type<ChecklistWaiverKind>(),
    reason: text("reason").notNull(),
    originalSources: jsonb("original_sources").notNull(),
    templateVersionId: uuid("template_version_id").notNull().references(() => checklistTemplateVersionsTable.id, { onDelete: "restrict" }),
    actorUserId: uuid("actor_user_id").notNull(),
    approvedBy: uuid("approved_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("checklist_waivers_tenant_checklist_idx").on(table.tenantId, table.assignmentChecklistId, table.createdAt),
  ],
);

export const checklistConfigurationWarningsTable = pgTable(
  "checklist_configuration_warnings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "restrict" }),
    bindingId: uuid("binding_id").references(() => checklistBindingsTable.id, { onDelete: "restrict" }),
    reconciliationEventId: uuid("reconciliation_event_id").references(() => checklistReconciliationEventsTable.id, { onDelete: "restrict" }),
    code: varchar("code", { length: 100 }).notNull(),
    message: text("message").notNull(),
    details: jsonb("details").notNull().default(sql`'{}'::jsonb`),
    fingerprint: varchar("fingerprint", { length: 80 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("open"),
    resolvedBy: uuid("resolved_by"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("checklist_configuration_warnings_fingerprint_idx").on(table.tenantId, table.fingerprint),
    index("checklist_configuration_warnings_status_idx").on(table.tenantId, table.status, table.createdAt),
  ],
);

export type ChecklistTemplate = typeof checklistTemplatesTable.$inferSelect;
export type ChecklistTemplateVersion = typeof checklistTemplateVersionsTable.$inferSelect;
export type ChecklistBindingRecord = typeof checklistBindingsTable.$inferSelect;
export type AssignmentChecklist = typeof assignmentChecklistsTable.$inferSelect;
export type AssignmentChecklistAnswer = typeof assignmentChecklistAnswersTable.$inferSelect;
export type AssignmentChecklistEvidence = typeof assignmentChecklistEvidenceTable.$inferSelect;
export type ChecklistReconciliationEvent = typeof checklistReconciliationEventsTable.$inferSelect;
export type ChecklistWaiver = typeof checklistWaiversTable.$inferSelect;
