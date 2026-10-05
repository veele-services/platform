import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import {
  parseStaffWorkspaceProjection,
  staffAnnouncementReadSchema,
  staffAnnouncementSchema,
  staffAttachmentSchema,
  staffDayReviewSchema,
  staffExpenseSchema,
  staffLeaveRequestSchema,
  staffMaterialSchema,
  staffOpenShiftSchema,
  staffPersonnelSchema,
  staffReportEntrySchema,
  staffSignatureSchema,
  staffTimeCorrectionRequestSchema,
  staffTimeEntrySchema,
  staffTravelLegSchema,
  staffWorkspaceProjectionSchema,
} from "./workspace";

const tenantId = "11111111-1111-4111-8111-111111111111";
const personnelId = "22222222-2222-4222-8222-222222222222";
const customerId = "33333333-3333-4333-8333-333333333333";
const objectId = "44444444-4444-4444-8444-444444444444";
const workOrderId = "55555555-5555-4555-8555-555555555555";
const assignmentId = "66666666-6666-4666-8666-666666666666";
const rowId = "77777777-7777-4777-8777-777777777777";

const emptyProjection = () => ({
  customers: [],
  contacts: [],
  staffContacts: [],
  objects: [],
  personnel: [],
  staffDepots: [],
  workOrders: [],
  assignments: [],
  workOrderTasks: [],
  tasks: [],
  taskRevisions: [],
  reports: [],
  attachments: [],
  signatures: [],
  timeEntries: [],
  staffTimeCorrectionRequests: [],
  availability: [],
  staffLeaveRequests: [],
  staffLeaveEntitlements: [],
  staffDayReviews: [],
  staffStatusEvents: [],
  staffMaterials: [],
  staffExpenses: [],
  announcements: [],
  announcementReads: [],
  openShifts: [],
  shiftInterests: [],
  personnelDocuments: [],
  extraWorkRules: [],
  allowedExtraWork: [],
  travelLegs: [],
});

const person = {
  id: personnelId,
  tenant_id: tenantId,
  employee_number: "FG-001",
  full_name: "Ada Medewerker",
  preferred_name: "Ada",
  email: "ada@example.test",
  phone: null,
  mobile_phone: "+31612345678",
  birth_date: "1990-01-01",
  status: "active",
  home_address: {},
  emergency_contact: {},
  standard_vehicle: "bicycle",
  departure_kind: "home",
  departure_depot_id: null,
  alternate_departure_address: {},
  return_to_departure: true,
  driving_license: false,
  driving_license_categories: [],
  carpool_allowed: false,
  own_transport: true,
  travel_limitations: null,
  notification_preferences: {},
  availability_preferences: {},
  availability_self_service_enabled: true,
  onboarding_draft: {},
  onboarding_step: 5,
  onboarding_completed_at: "2026-10-04T10:00:00+00:00",
  onboarding_version: 2,
  version: 3,
};

const order = {
  id: workOrderId,
  tenant_id: tenantId,
  customer_id: customerId,
  object_id: objectId,
  work_order_number: "WB-001",
  discipline: "Onderhoud",
  title: "Inspectie",
  description: "Controleer de installatie",
  status: "released",
  version: 2,
  report_version: 0,
  report_state: "draft",
  signature_required: false,
  day_instructions: "Meld je bij de receptie",
  projected_start_at: "2026-10-05T08:00:00+00:00",
  projected_end_at: "2026-10-05T09:00:00+00:00",
  actual_start_at: null,
  actual_end_at: null,
  published_at: "2026-10-04T10:00:00+00:00",
  deadline: null,
  requested_date: "2026-10-05",
  details: {},
};

const assignment = {
  id: assignmentId,
  tenant_id: tenantId,
  work_order_id: workOrderId,
  personnel_id: personnelId,
  status: "released",
  planned_start_at: "2026-10-05T08:00:00+00:00",
  planned_end_at: "2026-10-05T09:00:00+00:00",
  projected_start_at: "2026-10-05T08:00:00+00:00",
  projected_end_at: "2026-10-05T09:00:00+00:00",
  departed_at: null,
  paused_at: null,
  actual_start_at: null,
  actual_end_at: null,
  return_reason_code: null,
  return_note: null,
  version: 1,
  created_at: "2026-10-04T10:00:00+00:00",
};

const relationalProjection = () => ({
  ...emptyProjection(),
  customers: [{ id: customerId, tenant_id: tenantId, name: "Klant" }],
  objects: [{ id: objectId, tenant_id: tenantId, name: "Pand", address: {} }],
  personnel: [person],
  workOrders: [order],
  assignments: [assignment],
});

function expectUnexpectedFieldRejected(schema: ZodType, safe: Record<string, unknown>, field: string) {
  expect(schema.safeParse({ ...safe, [field]: "leak" }).success).toBe(false);
}

describe("staff_workspace browser boundary", () => {
  it("accepts the complete explicit empty RPC shape", () => {
    expect(parseStaffWorkspaceProjection(emptyProjection(), tenantId)).toEqual(emptyProjection());
  });

  it("accepts a relationship-complete own staff projection", () => {
    const parsed = parseStaffWorkspaceProjection(relationalProjection(), tenantId);
    expect(parsed.personnel[0]?.id).toBe(personnelId);
    expect(parsed.workOrders[0]?.id).toBe(workOrderId);
  });

  it("rejects unknown root collections instead of widening the DTO", () => {
    expect(staffWorkspaceProjectionSchema.safeParse({ ...emptyProjection(), invoices: [] }).success).toBe(false);
  });

  it("rejects rows from another tenant", () => {
    const projection = relationalProjection();
    projection.customers[0] = { ...projection.customers[0], tenant_id: "88888888-8888-4888-8888-888888888888" };
    expect(() => parseStaffWorkspaceProjection(projection, tenantId)).toThrow(/tenantgrens/);
  });

  it("rejects another employee's records and task assignment", () => {
    const projection = relationalProjection();
    projection.assignments[0] = { ...assignment, personnel_id: "88888888-8888-4888-8888-888888888888" };
    expect(() => parseStaffWorkspaceProjection(projection, tenantId)).toThrow(/personeelsgrens/);
  });

  it("rejects personnel-scoped rows when the own profile is absent", () => {
    const projection = { ...emptyProjection(), shiftInterests: [{
      id: rowId, tenant_id: tenantId,
      open_shift_id: "88888888-8888-4888-8888-888888888888",
      personnel_id: personnelId, status: "interested", created_at: "now", updated_at: "now",
    }] };
    expect(() => parseStaffWorkspaceProjection(projection, tenantId)).toThrow(/Personeelsprofiel ontbreekt/);
  });

  it("rejects orphaned order and assignment relationships", () => {
    const projection = relationalProjection();
    projection.assignments[0] = { ...assignment, work_order_id: "88888888-8888-4888-8888-888888888888" };
    expect(() => parseStaffWorkspaceProjection(projection, tenantId)).toThrow(/Onbekende werkbon/);
  });

  it("accepts only own correction requests linked to a projected time entry", () => {
    const projection = { ...relationalProjection(), timeEntries: [{
      id: rowId, tenant_id: tenantId, personnel_id: personnelId, assignment_id: assignmentId,
      kind: "work", starts_at: "2026-10-05T08:00:00Z", ends_at: "2026-10-05T09:00:00Z",
      status: "approved", correction_reason: null, approved_at: "2026-10-05T10:00:00Z",
      created_at: "now", updated_at: "now", version: 2,
    }], staffTimeCorrectionRequests: [{
      id: "99999999-9999-4999-8999-999999999999", tenant_id: tenantId,
      personnel_id: personnelId, time_entry_id: rowId, correction_mode: "duration",
      source_version: 2, source_kind: "work", source_status: "approved",
      source_starts_at: "2026-10-05T08:00:00Z", source_ends_at: "2026-10-05T09:00:00Z",
      source_day_state: "confirmed", requested_starts_at: "2026-10-05T08:00:00Z",
      requested_ends_at: "2026-10-05T09:15:00Z", requested_duration_minutes: 75,
      reason: "Timer te vroeg gestopt", status: "pending", reviewed_at: null,
      review_note: null, created_at: "now", updated_at: "now", version: 1,
    }] };
    expect(parseStaffWorkspaceProjection(projection, tenantId).staffTimeCorrectionRequests).toHaveLength(1);
    projection.staffTimeCorrectionRequests[0] = { ...projection.staffTimeCorrectionRequests[0], time_entry_id: "88888888-8888-4888-8888-888888888888" };
    expect(() => parseStaffWorkspaceProjection(projection, tenantId)).toThrow(/Onbekende tijdregel/);
  });

  it("rejects account, actor and storage fields stripped by the RPC", () => {
    expectUnexpectedFieldRejected(staffPersonnelSchema, person, "user_id");
    expectUnexpectedFieldRejected(staffReportEntrySchema, {
      id: rowId, tenant_id: tenantId, work_order_id: workOrderId, body: "Gereed",
      customer_visible: false, deleted_at: null, incident_severity: null,
      incident_status: null, is_incident: false, created_at: "now", updated_at: "now",
      version: 1, owned_by_current_user: true,
    }, "author_user_id");
    expectUnexpectedFieldRejected(staffAttachmentSchema, {
      id: rowId, tenant_id: tenantId, work_order_id: workOrderId, report_entry_id: null,
      file_name: "bewijs.jpg", mime_type: "image/jpeg", sha256: "abc", size_bytes: 10,
      customer_visible: false, deleted_at: null, created_at: "now", owned_by_current_user: true,
    }, "storage_path");
    expectUnexpectedFieldRejected(staffSignatureSchema, {
      id: rowId, tenant_id: tenantId, work_order_id: workOrderId, report_id: null,
      report_version: 1, captured_by_name: null, channel: "device", content_hash: null,
      revoked_at: null, sha256: "abc", signature_kind: "customer", signed_at: "now",
      signer_capacity: null, signer_name: "Klant",
    }, "captured_by");
    expectUnexpectedFieldRejected(staffTimeEntrySchema, {
      id: rowId, tenant_id: tenantId, personnel_id: personnelId, assignment_id: assignmentId,
      kind: "work", starts_at: "now", ends_at: null, status: "open",
      correction_reason: null, approved_at: null, created_at: "now", updated_at: "now", version: 1,
    }, "approved_by");
    expectUnexpectedFieldRejected(staffTimeCorrectionRequestSchema, {
      id: "99999999-9999-4999-8999-999999999999", tenant_id: tenantId,
      personnel_id: personnelId, time_entry_id: rowId, correction_mode: "times",
      source_version: 1, source_kind: "work", source_status: "approved",
      source_starts_at: "2026-10-05T08:00:00Z", source_ends_at: "2026-10-05T09:00:00Z",
      source_day_state: "confirmed", requested_starts_at: "2026-10-05T08:15:00Z",
      requested_ends_at: "2026-10-05T09:15:00Z", requested_duration_minutes: 60,
      reason: "Verkeerde starttijd", status: "pending", reviewed_at: null,
      review_note: null, created_at: "now", updated_at: "now", version: 1,
    }, "created_by");
  });

  it("rejects HR, announcement, shift and travel actor fields stripped by the RPC", () => {
    expectUnexpectedFieldRejected(staffLeaveRequestSchema, {
      id: rowId, tenant_id: tenantId, personnel_id: personnelId, leave_type: "vacation",
      starts_on: "2026-10-05", ends_on: "2026-10-06", note: "", status: "pending",
      requested_minutes: 960, requested_minutes_by_year: { "2026": 960 },
      approved_minutes: null, approved_minutes_by_year: {},
      reviewed_at: null, review_note: null, availability_id: null, withdrawn_at: null,
      withdrawal_note: null, created_at: "now", updated_at: "now", version: 1,
    }, "reviewed_by");
    expectUnexpectedFieldRejected(staffDayReviewSchema, {
      id: rowId, tenant_id: tenantId, personnel_id: personnelId, day: "2026-10-05",
      state: "open", note: "", closed_at: null, confirmed_at: null,
      correction_requested_at: null, created_at: "now", updated_at: "now", version: 1,
    }, "created_by");
    expectUnexpectedFieldRejected(staffAnnouncementSchema, {
      id: rowId, tenant_id: tenantId, audience_roles: ["staff"], body: "Nieuws",
      created_at: "now", publish_at: null, published_at: "now", send_push: false,
      title: "Bericht", updated_at: "now", withdrawn_at: null,
    }, "created_by");
    expectUnexpectedFieldRejected(staffAnnouncementReadSchema, {
      id: rowId, tenant_id: tenantId, announcement_id: rowId, read_at: "now",
    }, "user_id");
    expectUnexpectedFieldRejected(staffOpenShiftSchema, {
      id: rowId, tenant_id: tenantId, work_order_id: workOrderId,
      function_id: "88888888-8888-4888-8888-888888888888", starts_at: "now",
      ends_at: "later", status: "open", required_certificate_codes: [], created_at: "now",
    }, "selected_personnel_id");
  });

  it("rejects cost ownership actors and travel addresses", () => {
    expectUnexpectedFieldRejected(staffMaterialSchema, {
      id: rowId, tenant_id: tenantId, work_order_id: workOrderId, task_id: null,
      description: "Materiaal", quantity: 1, unit: "stuk", unit_price_cents: 100,
      customer_visible: false, created_at: "now", owned_by_current_user: true,
    }, "created_by");
    expectUnexpectedFieldRejected(staffExpenseSchema, {
      id: rowId, tenant_id: tenantId, work_order_id: workOrderId,
      description: "Parkeren", amount_cents: 500, customer_visible: false,
      created_at: "now", updated_at: "now", version: 1,
      owned_by_current_user: true,
    }, "created_by");
    expectUnexpectedFieldRejected(staffTravelLegSchema, {
      id: rowId, tenant_id: tenantId, assignment_id: assignmentId,
      actual_ended_at: null, actual_started_at: null, basis_calculated_at: null,
      basis_distance_metres: null, basis_seconds: null, billable: false,
      calculated_at: null, created_at: "now", direction: "before", error_code: null,
      estimate_snapshot: null, estimated_distance_metres: null, estimated_minutes: null,
      manual_metres: null, manual_reason: null, manual_seconds: null,
      manual_signature: null, manual_updated_at: null, planning_day: null,
      planning_margin_minutes: 0, planning_revision: null, provider: null,
      provider_reference: null, route_signature: null, routing_profile: null,
      travel_mode: "bicycle",
    }, "origin_address");
  });
});
