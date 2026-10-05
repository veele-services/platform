import { z } from "zod";
import type { Json } from "@/lib/database.types";

const id = z.string().uuid();
const text = z.string();
const nullableText = text.nullable();
const positiveVersion = z.number().int().positive();
const nonNegativeInteger = z.number().int().nonnegative();

function isJson(value: unknown): value is Json {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
    return typeof value !== "number" || Number.isFinite(value);
  }
  if (Array.isArray(value)) return value.every(isJson);
  if (typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).every(isJson);
}

const json = z.custom<Json>(isJson, "Ongeldige JSON-waarde");

export const staffCustomerSchema = z.object({
  id,
  tenant_id: id,
  name: text,
}).strict();

export const staffContactSchema = z.object({
  id,
  tenant_id: id,
  work_order_id: id,
  name: nullableText,
  email: nullableText,
  phone: nullableText,
  roles: z.array(text),
}).strict();

export const staffObjectSchema = z.object({
  id,
  tenant_id: id,
  name: text,
  address: json,
}).strict();

export const staffPersonnelSchema = z.object({
  id,
  tenant_id: id,
  employee_number: text,
  full_name: text,
  preferred_name: nullableText,
  email: nullableText,
  phone: nullableText,
  mobile_phone: nullableText,
  birth_date: nullableText,
  status: text,
  home_address: json,
  emergency_contact: json,
  standard_vehicle: nullableText,
  departure_kind: nullableText,
  departure_depot_id: id.nullable(),
  alternate_departure_address: json,
  return_to_departure: z.boolean(),
  driving_license: z.boolean(),
  driving_license_categories: z.array(text),
  carpool_allowed: z.boolean(),
  own_transport: z.boolean(),
  travel_limitations: nullableText,
  notification_preferences: json,
  availability_preferences: json,
  availability_self_service_enabled: z.boolean(),
  onboarding_draft: json,
  onboarding_step: z.number().int().min(0).max(6),
  onboarding_completed_at: nullableText,
  onboarding_version: positiveVersion,
  version: positiveVersion,
}).strict();

export const staffDepotSchema = z.object({
  id,
  tenant_id: id,
  name: text,
}).strict();

export const staffWorkOrderSchema = z.object({
  id,
  tenant_id: id,
  customer_id: id,
  object_id: id,
  work_order_number: text,
  discipline: text,
  title: text,
  description: text,
  status: text,
  version: positiveVersion,
  report_version: nonNegativeInteger,
  report_state: text,
  signature_required: z.boolean(),
  day_instructions: text,
  projected_start_at: nullableText,
  projected_end_at: nullableText,
  actual_start_at: nullableText,
  actual_end_at: nullableText,
  published_at: nullableText,
  deadline: nullableText,
  requested_date: nullableText,
  details: z.object({
    customerReference: json.optional(),
    locationLabel: json.optional(),
    recurrence_window: json.optional(),
  }).strict(),
}).strict();

export const staffAssignmentSchema = z.object({
  id,
  tenant_id: id,
  work_order_id: id,
  personnel_id: id,
  status: text,
  planned_start_at: text,
  planned_end_at: text,
  projected_start_at: text,
  projected_end_at: text,
  departed_at: nullableText,
  paused_at: nullableText,
  actual_start_at: nullableText,
  actual_end_at: nullableText,
  return_reason_code: nullableText,
  return_note: nullableText,
  version: positiveVersion,
  created_at: text,
}).strict();

export const staffWorkOrderTaskSchema = z.object({
  id,
  tenant_id: id,
  work_order_id: id,
  task_revision_id: id.nullable(),
  task_code: text,
  task_name: text,
  quantity: z.number(),
  unit: text,
  duration_minutes: nonNegativeInteger,
  is_extra_work: z.boolean(),
  extra_work_status: nullableText,
  completed_at: nullableText,
  created_at: text,
  updated_at: text.optional(),
  executed_quantity: z.number().nullable(),
  execution_state: text,
  execution_version: positiveVersion,
  instructions: text,
  staff_request_reason: nullableText,
  staff_requested_amount_cents: nonNegativeInteger.nullable(),
  scope_root_task_id: id.nullable(),
  transferred_quantity: z.number().nonnegative(),
  withdrawn_quantity: z.number().nonnegative(),
  assigned_personnel_id: id.nullable(),
  completion_note: nullableText,
  can_execute: z.boolean(),
}).strict();

export const staffTaskSchema = z.object({
  id,
  tenant_id: id,
  code: text,
  discipline: text,
  name: text,
  description: nullableText,
  active: z.boolean(),
}).strict();

export const staffTaskRevisionSchema = z.object({
  id,
  tenant_id: id,
  task_id: id,
  revision: positiveVersion,
  duration_minutes: nonNegativeInteger,
  unit: text,
  valid_from: text,
  valid_until: nullableText,
}).strict();

export const staffReportEntrySchema = z.object({
  id,
  tenant_id: id,
  work_order_id: id,
  body: text,
  customer_visible: z.boolean(),
  deleted_at: nullableText,
  incident_severity: nullableText,
  incident_status: nullableText,
  is_incident: z.boolean(),
  created_at: text,
  updated_at: text,
  version: positiveVersion,
  owned_by_current_user: z.literal(true),
}).strict();

export const staffAttachmentSchema = z.object({
  id,
  tenant_id: id,
  work_order_id: id,
  report_entry_id: id.nullable(),
  file_name: text,
  mime_type: text,
  sha256: text,
  size_bytes: nonNegativeInteger,
  customer_visible: z.boolean(),
  deleted_at: nullableText,
  created_at: text,
  owned_by_current_user: z.literal(true),
}).strict();

export const staffSignatureSchema = z.object({
  id,
  tenant_id: id,
  work_order_id: id,
  report_id: id.nullable(),
  report_version: positiveVersion,
  captured_by_name: nullableText,
  channel: text,
  content_hash: nullableText,
  revoked_at: nullableText,
  sha256: text,
  signature_kind: text,
  signed_at: text,
  signer_capacity: nullableText,
  signer_name: text,
}).strict();

export const staffTimeEntrySchema = z.object({
  id,
  tenant_id: id,
  personnel_id: id,
  assignment_id: id.nullable(),
  kind: text,
  starts_at: text,
  ends_at: nullableText,
  status: text,
  correction_reason: nullableText,
  approved_at: nullableText,
  created_at: text,
  updated_at: text,
  version: positiveVersion,
}).strict();

export const staffTimeCorrectionRequestSchema = z.object({
  id,
  tenant_id: id,
  personnel_id: id,
  time_entry_id: id,
  correction_mode: z.enum(["times", "duration"]),
  source_version: positiveVersion,
  source_kind: text,
  source_status: text,
  source_starts_at: text,
  source_ends_at: text,
  source_day_state: z.enum(["open", "closed", "confirmed", "correction_requested"]),
  requested_starts_at: text,
  requested_ends_at: text,
  requested_duration_minutes: z.number().int().min(1).max(600),
  reason: text,
  status: z.enum(["pending", "approved", "rejected", "withdrawn"]),
  reviewed_at: nullableText,
  review_note: nullableText,
  created_at: text,
  updated_at: text,
  version: positiveVersion,
}).strict();

export const staffAvailabilitySchema = z.object({
  id,
  tenant_id: id,
  personnel_id: id,
  starts_at: text,
  ends_at: text,
  kind: text,
  note: nullableText,
  approved_at: nullableText,
  dossier_source_id: id.nullable(),
  created_at: text,
}).strict();

export const staffLeaveRequestSchema = z.object({
  id,
  tenant_id: id,
  personnel_id: id,
  leave_type: z.enum(["vacation", "short", "care", "unpaid", "other"]),
  starts_on: text,
  ends_on: text,
  requested_minutes: z.number().int().positive().nullable(),
  requested_minutes_by_year: z.record(z.string().regex(/^\d{4}$/), nonNegativeInteger),
  approved_minutes: z.number().int().positive().nullable(),
  approved_minutes_by_year: z.record(z.string().regex(/^\d{4}$/), nonNegativeInteger),
  note: text,
  status: z.enum(["pending", "approved", "rejected", "withdrawn"]),
  reviewed_at: nullableText,
  review_note: nullableText,
  availability_id: id.nullable(),
  withdrawn_at: nullableText,
  withdrawal_note: nullableText,
  created_at: text,
  updated_at: text,
  version: positiveVersion,
}).strict();

export const staffLeaveEntitlementSchema = z.object({
  id,
  tenant_id: id,
  personnel_id: id,
  calendar_year: z.number().int().min(2000).max(2200),
  allowance_minutes: nonNegativeInteger,
  carryover_minutes: nonNegativeInteger,
  created_at: text,
  updated_at: text,
  version: positiveVersion,
}).strict();

export const staffDayReviewSchema = z.object({
  id,
  tenant_id: id,
  personnel_id: id,
  day: text,
  state: z.enum(["open", "closed", "confirmed", "correction_requested"]),
  note: text,
  closed_at: nullableText,
  confirmed_at: nullableText,
  correction_requested_at: nullableText,
  created_at: text,
  updated_at: text,
  version: positiveVersion,
}).strict();

export const staffStatusEventSchema = z.object({
  id,
  tenant_id: id,
  work_order_id: id,
  assignment_id: id.nullable(),
  previous_status: nullableText,
  new_status: text,
  reason_code: nullableText,
  note: nullableText,
  created_at: text,
}).strict();

export const staffMaterialSchema = z.object({
  id,
  tenant_id: id,
  work_order_id: id,
  task_id: id.nullable(),
  description: text,
  quantity: z.number().positive(),
  unit: text,
  unit_price_cents: nonNegativeInteger.nullable(),
  customer_visible: z.boolean(),
  created_at: text,
  owned_by_current_user: z.boolean(),
}).strict();

export const staffExpenseSchema = z.object({
  id,
  tenant_id: id,
  work_order_id: id,
  description: text,
  amount_cents: z.number().int().positive(),
  customer_visible: z.boolean(),
  created_at: text,
  updated_at: text,
  version: positiveVersion,
  owned_by_current_user: z.boolean(),
}).strict();

export const staffAnnouncementSchema = z.object({
  id,
  tenant_id: id,
  audience_roles: z.array(text),
  body: text,
  created_at: text,
  publish_at: nullableText,
  published_at: nullableText,
  send_push: z.boolean(),
  title: text,
  updated_at: text,
  withdrawn_at: nullableText,
}).strict();

export const staffAnnouncementReadSchema = z.object({
  id,
  tenant_id: id,
  announcement_id: id,
  read_at: text,
}).strict();

export const staffOpenShiftSchema = z.object({
  id,
  tenant_id: id,
  work_order_id: id,
  function_id: id,
  starts_at: text,
  ends_at: text,
  status: text,
  required_certificate_codes: z.array(text),
  created_at: text,
}).strict();

export const staffShiftInterestSchema = z.object({
  id,
  tenant_id: id,
  open_shift_id: id,
  personnel_id: id,
  status: text,
  created_at: text,
  updated_at: text,
}).strict();

export const staffPersonnelDocumentSchema = z.object({
  id,
  tenant_id: id,
  personnel_id: id,
  title: text,
  file_name: nullableText,
  version: positiveVersion,
  visible_to_employee: z.boolean(),
}).strict();

export const staffExtraWorkRuleSchema = z.object({
  id,
  tenant_id: id,
  task_revision_id: id,
  active: z.boolean(),
  requires_photo: z.boolean(),
  requires_review: z.boolean(),
}).strict();

export const staffAllowedExtraWorkSchema = z.object({
  id,
  tenant_id: id,
  work_order_id: id,
  extra_work_rule_id: id,
  created_at: text,
}).strict();

export const staffTravelLegSchema = z.object({
  id,
  tenant_id: id,
  assignment_id: id,
  actual_ended_at: nullableText,
  actual_started_at: nullableText,
  basis_calculated_at: nullableText,
  basis_distance_metres: z.number().nullable(),
  basis_seconds: z.number().nullable(),
  billable: z.boolean(),
  calculated_at: nullableText,
  created_at: text,
  direction: text,
  error_code: nullableText,
  estimate_snapshot: json,
  estimated_distance_metres: z.number().nullable(),
  estimated_minutes: z.number().nullable(),
  manual_metres: z.number().nullable(),
  manual_reason: nullableText,
  manual_seconds: z.number().nullable(),
  manual_signature: nullableText,
  manual_updated_at: nullableText,
  planning_day: nullableText,
  planning_margin_minutes: nonNegativeInteger,
  planning_revision: nonNegativeInteger.nullable(),
  provider: nullableText,
  provider_reference: nullableText,
  route_signature: nullableText,
  routing_profile: nullableText,
  travel_mode: text,
}).strict();

export const staffWorkspaceProjectionSchema = z.object({
  customers: z.array(staffCustomerSchema),
  contacts: z.array(z.never()).max(0),
  staffContacts: z.array(staffContactSchema),
  objects: z.array(staffObjectSchema),
  personnel: z.array(staffPersonnelSchema).max(1),
  staffDepots: z.array(staffDepotSchema),
  workOrders: z.array(staffWorkOrderSchema),
  assignments: z.array(staffAssignmentSchema),
  workOrderTasks: z.array(staffWorkOrderTaskSchema),
  tasks: z.array(staffTaskSchema),
  taskRevisions: z.array(staffTaskRevisionSchema),
  reports: z.array(staffReportEntrySchema),
  attachments: z.array(staffAttachmentSchema),
  signatures: z.array(staffSignatureSchema),
  timeEntries: z.array(staffTimeEntrySchema),
  staffTimeCorrectionRequests: z.array(staffTimeCorrectionRequestSchema),
  availability: z.array(staffAvailabilitySchema),
  staffLeaveRequests: z.array(staffLeaveRequestSchema),
  staffLeaveEntitlements: z.array(staffLeaveEntitlementSchema),
  staffDayReviews: z.array(staffDayReviewSchema),
  staffStatusEvents: z.array(staffStatusEventSchema),
  staffMaterials: z.array(staffMaterialSchema),
  staffExpenses: z.array(staffExpenseSchema),
  announcements: z.array(staffAnnouncementSchema),
  announcementReads: z.array(staffAnnouncementReadSchema),
  openShifts: z.array(staffOpenShiftSchema),
  shiftInterests: z.array(staffShiftInterestSchema),
  personnelDocuments: z.array(staffPersonnelDocumentSchema),
  extraWorkRules: z.array(staffExtraWorkRuleSchema),
  allowedExtraWork: z.array(staffAllowedExtraWorkSchema),
  travelLegs: z.array(staffTravelLegSchema),
}).strict();

export type StaffWorkspaceProjection = z.infer<typeof staffWorkspaceProjectionSchema>;
export type StaffWorkspaceData = StaffWorkspaceProjection & { brandingLogoUrl: string | null };
export type StaffPersonnel = StaffWorkspaceProjection["personnel"][number];
export type StaffWorkOrder = StaffWorkspaceProjection["workOrders"][number];
export type StaffWorkOrderTask = StaffWorkspaceProjection["workOrderTasks"][number];

const personnelCollections = [
  "assignments", "timeEntries", "staffTimeCorrectionRequests", "availability", "staffLeaveRequests", "staffLeaveEntitlements",
  "staffDayReviews", "shiftInterests", "personnelDocuments",
] as const;

const orderCollections = [
  "staffContacts", "workOrderTasks", "reports", "attachments",
  "signatures", "staffStatusEvents", "staffMaterials", "staffExpenses",
  "allowedExtraWork",
] as const;

/**
 * Fail closed at the single browser DTO boundary. Every item schema is strict,
 * so an accidental actor id, storage path, finance field or newly added table
 * column cannot silently cross from the security-definer RPC into React.
 */
export function parseStaffWorkspaceProjection(input: unknown, tenantId: string): StaffWorkspaceProjection {
  const parsed = staffWorkspaceProjectionSchema.parse(input);
  const tenantCollections = Object.entries(parsed).filter(([, value]) => Array.isArray(value));
  for (const [name, items] of tenantCollections) {
    for (const item of items as unknown[]) {
      if (item && typeof item === "object" && "tenant_id" in item && (item as { tenant_id: string }).tenant_id !== tenantId) {
        throw new Error(`Ongeldige tenantgrens in staff_workspace.${name}`);
      }
    }
  }

  const personnelId = parsed.personnel[0]?.id;
  if (personnelId) {
    for (const name of personnelCollections) {
      for (const item of parsed[name]) {
        if (item.personnel_id !== personnelId) throw new Error(`Ongeldige personeelsgrens in staff_workspace.${name}`);
      }
    }
    for (const task of parsed.workOrderTasks) {
      if (task.assigned_personnel_id !== null && task.assigned_personnel_id !== personnelId) {
        throw new Error("Ongeldige taaktoewijzing in staff_workspace.workOrderTasks");
      }
    }
  } else {
    for (const name of personnelCollections) {
      if (parsed[name].length > 0) throw new Error(`Personeelsprofiel ontbreekt voor staff_workspace.${name}`);
    }
    if (parsed.workOrderTasks.some((task) => task.assigned_personnel_id !== null)) {
      throw new Error("Personeelsprofiel ontbreekt voor staff_workspace.workOrderTasks");
    }
  }

  const workOrderIds = new Set(parsed.workOrders.map((item) => item.id));
  for (const assignment of parsed.assignments) {
    if (!workOrderIds.has(assignment.work_order_id)) throw new Error("Onbekende werkbon in staff_workspace.assignments");
  }
  for (const name of orderCollections) {
    for (const item of parsed[name]) {
      if (!workOrderIds.has(item.work_order_id)) throw new Error(`Onbekende werkbon in staff_workspace.${name}`);
    }
  }

  const assignmentIds = new Set(parsed.assignments.map((item) => item.id));
  for (const leg of parsed.travelLegs) {
    if (!assignmentIds.has(leg.assignment_id)) throw new Error("Onbekende toewijzing in staff_workspace.travelLegs");
  }
  for (const entry of parsed.timeEntries) {
    if (entry.assignment_id !== null && !assignmentIds.has(entry.assignment_id)) {
      throw new Error("Onbekende toewijzing in staff_workspace.timeEntries");
    }
  }
  const timeEntryIds = new Set(parsed.timeEntries.map((item) => item.id));
  for (const request of parsed.staffTimeCorrectionRequests) {
    if (!timeEntryIds.has(request.time_entry_id)) {
      throw new Error("Onbekende tijdregel in staff_workspace.staffTimeCorrectionRequests");
    }
  }

  const customerIds = new Set(parsed.customers.map((item) => item.id));
  const objectIds = new Set(parsed.objects.map((item) => item.id));
  for (const order of parsed.workOrders) {
    if (!customerIds.has(order.customer_id) || !objectIds.has(order.object_id)) {
      throw new Error("Onvolledige relatie in staff_workspace.workOrders");
    }
  }
  return parsed;
}
