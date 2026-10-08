import "server-only";
import { getBrandingLogoUrl } from "@/lib/branding/logo";
import { getAuthContext } from "@/lib/auth/context";
import { hasManagementPermission } from "@/lib/management/model";
import { invoiceConceptSchema, type InvoiceConcept } from "@/lib/finance/invoice-concepts";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";
import { reportRpc } from "@/lib/work-orders/report-rpc";
import { operationalOrderRows,operationalTaskData } from "@/lib/work-orders/operational-data";
import type { StaffDayReview, StaffDepot, StaffExpense, StaffLeaveRequest, StaffMaterial, StaffStatusEvent, StaffWorkOrderContact } from "@/lib/staff/model";
import { parseStaffWorkspaceProjection, type StaffWorkspaceData } from "@/lib/staff/workspace";

type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];

export type WorkspaceData = {
  customers: Row<"customers">[];
  contacts: Row<"customer_contacts">[];
  customerNotes: Row<"customer_notes">[];
  customerDocuments: Row<"customer_documents">[];
  objects: Row<"objects">[];
  requests: Row<"requests">[];
  quotes: Row<"quotes">[];
  tasks: Row<"task_catalog">[];
  taskRevisions: Row<"task_revisions">[];
  personnel: Row<"personnel">[];
  personnelFunctions: Row<"personnel_functions">[];
  functions: Row<"function_catalog">[];
  qualifications: Row<"qualifications">[];
  workOrders: Row<"work_orders">[];
  assignments: Row<"work_order_assignments">[];
  workOrderTasks: Row<"work_order_tasks">[];
  dispatches: Row<"dispatches">[];
  reports: Row<"report_entries">[];
  attachments: Row<"attachments">[];
  signatures: Row<"signatures">[];
  reviews: Row<"review_decisions">[];
  invoices: Row<"invoices">[];
  invoiceConcepts?: InvoiceConcept[];
  invoiceLines: Row<"invoice_lines">[];
  payments: Row<"payment_attempts">[];
  allocations: Row<"payment_allocations">[];
  announcements: Row<"announcements">[];
  reminders: Row<"reminders">[];
  openShifts: Row<"open_shifts">[];
  shiftInterests: Row<"shift_interests">[];
  timeEntries: Row<"time_entries">[];
  notifications: Row<"notifications">[];
  personnelDocuments: Row<"personnel_documents">[];
  availability: Row<"availability">[];
  announcementReads: Row<"announcement_reads">[];
  extraWorkRules: Row<"extra_work_rules">[];
  allowedExtraWork: Row<"work_order_allowed_extra_work">[];
  travelLegs: Row<"travel_legs">[];
  settings: Row<"tenant_settings"> | null;
  branding: Row<"tenant_branding"> | null;
  brandingLogoUrl: string | null;
  dossierSummary?: Database["public"]["Functions"]["personnel_dossier_summary"]["Returns"];
  qualificationGaps?: Database["public"]["Functions"]["personnel_qualification_gaps"]["Returns"];
  staffLeaveRequests?: StaffLeaveRequest[];
  staffDayReviews?: StaffDayReview[];
  staffStatusEvents?: StaffStatusEvent[];
  staffContacts?: StaffWorkOrderContact[];
  staffDepots?: StaffDepot[];
  staffMaterials?: StaffMaterial[];
  staffExpenses?: StaffExpense[];
};

/** Full authorized collections for client-paginated lists; stable id ties prevent silent API truncation. */
async function allWorkspaceRows<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const data: T[] = [];
  for (let from = 0; ; from += 500) {
    const page = await fetchPage(from, from + 499);
    if (page.error) throw new Error("De lijst kon niet volledig worden geladen.");
    data.push(...(page.data ?? []));
    if ((page.data?.length ?? 0) < 500) return { data, error: null };
  }
}

function rows<T>(result: { data: T[] | null; error: { message: string } | null }): T[] {
  if (result.error) throw new Error(result.error.message);
  return result.data ?? [];
}

export function getWorkspaceData(tenantId: string, scope: "staff"): Promise<StaffWorkspaceData>;
export function getWorkspaceData(tenantId: string, scope?: "backoffice"): Promise<WorkspaceData>;
export async function getWorkspaceData(tenantId: string, scope: "backoffice" | "staff" = "backoffice"): Promise<WorkspaceData | StaffWorkspaceData> {
  const supabase = await createClient();
  if (scope === "staff") {
    const [projection, brandingResult] = await Promise.all([
      reportRpc(supabase, "staff_workspace", { target_tenant: tenantId }),
      supabase.from("tenant_branding").select("*").eq("tenant_id", tenantId).maybeSingle(),
    ]);
    if (brandingResult.error) throw new Error("Huisstijl niet beschikbaar");
    const branding = brandingResult.data;
    const logo = await getBrandingLogoUrl(supabase, branding?.logo_path);
    return { ...parseStaffWorkspaceProjection(projection, tenantId), brandingLogoUrl: logo };
  }
  const actor = await getAuthContext();
  if(actor.tenant?.id!==tenantId)throw new Error("Geen toegang tot deze organisatie.");
  const canRead=(module:string,operation:string)=>hasManagementPermission(actor.tenant!,"backoffice.access")&&hasManagementPermission(actor.tenant!,`backoffice.${module}.read`)&&hasManagementPermission(actor.tenant!,`backoffice.functions.${operation}`);
  const empty={data:[],error:null};
  // Shared navigation must not request unavailable module RPCs. Their database
  // guards remain authoritative when a permission changes during this request.
  const taskProjection=canRead("work_orders","work_order_operational_task_data")?operationalTaskData(supabase,tenantId):Promise.resolve({taskRevisions:[],workOrderTasks:[]});
  const results = await Promise.all([
    allWorkspaceRows((from, to) => supabase.from("customers").select("*").eq("tenant_id", tenantId).order("name").order("id").range(from, to)),
    allWorkspaceRows((from, to) => supabase.from("customer_contacts").select("*").eq("tenant_id", tenantId).order("full_name").order("id").range(from, to)),
    allWorkspaceRows((from, to) => supabase.from("objects").select("*").eq("tenant_id", tenantId).order("name").order("id").range(from, to)),
    supabase.from("requests").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(250),
    supabase.from("quotes").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(250),
    allWorkspaceRows((from, to) => supabase.from("task_catalog").select("*").eq("tenant_id", tenantId).order("code").order("id").range(from, to)),
    taskProjection.then(p=>({data:p.taskRevisions,error:null})),
    allWorkspaceRows((from, to) => supabase.from("personnel").select("id,tenant_id,user_id,employee_number,full_name,email,phone,status,start_date,end_date,created_at,updated_at,version,standard_vehicle,departure_kind,departure_depot_id,return_to_departure").eq("tenant_id", tenantId).order("full_name").order("id").range(from, to)),
    allWorkspaceRows((from, to) => supabase.from("function_catalog").select("*").eq("tenant_id", tenantId).order("name").order("id").range(from, to)),
    allWorkspaceRows((from, to) => supabase.from("qualifications").select("*").eq("tenant_id", tenantId).order("id").range(from, to)),
    canRead("work_orders","work_order_operational_rows")?operationalOrderRows(supabase,tenantId,{all:true}):empty,
    allWorkspaceRows((from, to) => supabase.from("work_order_assignments").select("*").eq("tenant_id", tenantId).order("projected_start_at").order("id").range(from, to)),
    taskProjection.then(p=>({data:p.workOrderTasks,error:null})),
    allWorkspaceRows((from, to) => supabase.from("dispatches").select("*").eq("tenant_id", tenantId).order("dispatched_at", { ascending: false }).order("id").range(from, to)),
    allWorkspaceRows((from, to) => supabase.from("report_entries").select("*").eq("tenant_id", tenantId).is("deleted_at", null).order("created_at", { ascending: false }).order("id").range(from, to)),
    allWorkspaceRows((from, to) => supabase.from("attachments").select("*").eq("tenant_id", tenantId).is("deleted_at", null).order("created_at", { ascending: false }).order("id").range(from, to)),
    allWorkspaceRows((from, to) => supabase.from("signatures").select("*").eq("tenant_id", tenantId).is("revoked_at", null).order("signed_at", { ascending: false }).order("id").range(from, to)),
    allWorkspaceRows((from, to) => supabase.from("review_decisions").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).order("id").range(from, to)),
    allWorkspaceRows((from, to) => supabase.from("invoices").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).order("id").range(from, to)),
    allWorkspaceRows((from, to) => supabase.from("invoice_lines").select("*").eq("tenant_id", tenantId).order("created_at").order("id").range(from, to)),
    allWorkspaceRows((from, to) => supabase.from("payment_attempts").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).order("id").range(from, to)),
    allWorkspaceRows((from, to) => supabase.from("payment_allocations").select("*").eq("tenant_id", tenantId).order("allocated_at", { ascending: false }).order("id").range(from, to)),
    allWorkspaceRows((from, to) => supabase.from("announcements").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).order("id").range(from, to)),
    allWorkspaceRows((from, to) => supabase.from("reminders").select("*").eq("tenant_id", tenantId).order("due_at").order("id").range(from, to)),
    allWorkspaceRows((from, to) => supabase.from("open_shifts").select("*").eq("tenant_id", tenantId).order("starts_at").order("id").range(from, to)),
    allWorkspaceRows((from, to) => supabase.from("shift_interests").select("*").eq("tenant_id", tenantId).order("created_at").order("id").range(from, to)),
    supabase.from("time_entries").select("*").eq("tenant_id", tenantId).order("starts_at", { ascending: false }).limit(500),
    supabase.from("notifications").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(100),
    supabase.from("tenant_settings").select("*").eq("tenant_id", tenantId).maybeSingle(),
    supabase.from("tenant_branding").select("*").eq("tenant_id", tenantId).maybeSingle(),
    allWorkspaceRows((from, to) => supabase.from("personnel_documents").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).order("id").range(from, to)),
    canRead("personnel","personnel_availability")?supabase.rpc("personnel_availability", { target_tenant: tenantId }):empty,
    allWorkspaceRows((from, to) => supabase.from("announcement_reads").select("*").eq("tenant_id", tenantId).order("id").range(from, to)),
    allWorkspaceRows((from, to) => supabase.from("extra_work_rules").select("*").eq("tenant_id", tenantId).eq("active", true).order("id").range(from, to)),
    allWorkspaceRows((from, to) => supabase.from("work_order_allowed_extra_work").select("*").eq("tenant_id", tenantId).order("id").range(from, to)),
    allWorkspaceRows((from, to) => supabase.from("travel_legs").select("*").eq("tenant_id", tenantId).order("id").range(from, to)),
    allWorkspaceRows((from, to) => supabase.from("personnel_functions").select("*").eq("tenant_id", tenantId).order("id").range(from, to)),
    allWorkspaceRows((from, to) => supabase.from("customer_notes").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).order("id").range(from, to)),
    allWorkspaceRows((from, to) => supabase.from("customer_documents").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).order("id").range(from, to)),
    canRead("personnel","personnel_dossier_summary")?supabase.rpc("personnel_dossier_summary", { target_tenant: tenantId }):empty,
  ]);
  const singleton = <T>(result: { data: T | null; error: { message: string } | null }): T | null => {
    if (result.error) throw new Error(result.error.message);
    return result.data;
  };
  const branding = singleton(results[29]);
  const signedLogo = await getBrandingLogoUrl(supabase, branding?.logo_path);
  const workspace: WorkspaceData = {
    customers: rows(results[0]), contacts: rows(results[1]), objects: rows(results[2]),
    requests: rows(results[3]), quotes: rows(results[4]), tasks: rows(results[5]), taskRevisions: rows(results[6]),
    personnel: rows(results[7]).map(p=>({
      ...p,
      emergency_contact: {}, home_address: {}, alternate_departure_address: {},
      preferred_name: null, mobile_phone: null, birth_date: null,
      driving_license: false, driving_license_categories: [], carpool_allowed: false,
      own_transport: false, travel_limitations: null,
      notification_preferences: {}, availability_preferences: {},
      availability_self_service_enabled: false,
      onboarding_draft: {}, onboarding_step: 0,
      onboarding_completed_at: null, onboarding_version: 1,
    })), functions: rows(results[8]), qualifications: rows(results[9]),
    workOrders: rows(results[10]), assignments: rows(results[11]), workOrderTasks: rows(results[12]), dispatches: rows(results[13]),
    reports: rows(results[14]), attachments: rows(results[15]), signatures: rows(results[16]), reviews: rows(results[17]),
    invoices: rows(results[18]), invoiceLines: rows(results[19]), payments: rows(results[20]), allocations: rows(results[21]),
    announcements: rows(results[22]), reminders: rows(results[23]), openShifts: rows(results[24]), shiftInterests: rows(results[25]),
    timeEntries: rows(results[26]), notifications: rows(results[27]), settings: singleton(results[28]), branding,
    brandingLogoUrl: signedLogo,
    personnelDocuments: rows(results[30]), availability: rows(results[31]), announcementReads: rows(results[32]),
    extraWorkRules: rows(results[33]), allowedExtraWork: rows(results[34]),
    travelLegs: rows(results[35]),
    personnelFunctions: rows(results[36]),
    customerNotes: rows(results[37]),
    customerDocuments: rows(results[38]),
    dossierSummary: rows(results[39]),
  };
  if (actor.tenant.enabledServices.includes("finance") && actor.tenant.roles.some(role => ["tenant_admin", "management", "finance"].includes(role)) && canRead("finance","execution_invoice_concepts")) {
    const concepts = await supabase.rpc("execution_invoice_concepts", { target_tenant: tenantId });
    if (concepts.error) throw new Error("Factuurconcepten konden niet worden geladen.");
    workspace.invoiceConcepts = invoiceConceptSchema.array().parse(concepts.data);
  }
  return workspace;
}
