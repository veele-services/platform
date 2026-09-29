import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];

export type WorkspaceData = {
  customers: Row<"customers">[];
  contacts: Row<"customer_contacts">[];
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
};

function rows<T>(result: { data: T[] | null; error: { message: string } | null }): T[] {
  if (result.error) throw new Error(result.error.message);
  return result.data ?? [];
}

export async function getWorkspaceData(tenantId: string): Promise<WorkspaceData> {
  const supabase = await createClient();
  const results = await Promise.all([
    supabase.from("customers").select("*").eq("tenant_id", tenantId).order("name"),
    supabase.from("customer_contacts").select("*").eq("tenant_id", tenantId).order("full_name"),
    supabase.from("objects").select("*").eq("tenant_id", tenantId).order("name"),
    supabase.from("requests").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(250),
    supabase.from("quotes").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(250),
    supabase.from("task_catalog").select("*").eq("tenant_id", tenantId).order("code"),
    supabase.from("task_revisions").select("*").eq("tenant_id", tenantId).order("revision", { ascending: false }),
    supabase.from("personnel").select("*").eq("tenant_id", tenantId).order("full_name"),
    supabase.from("function_catalog").select("*").eq("tenant_id", tenantId).order("name"),
    supabase.from("qualifications").select("*").eq("tenant_id", tenantId),
    supabase.from("work_orders").select("*").eq("tenant_id", tenantId).order("projected_start_at", { ascending: false }).limit(500),
    supabase.from("work_order_assignments").select("*").eq("tenant_id", tenantId).order("projected_start_at"),
    supabase.from("work_order_tasks").select("*").eq("tenant_id", tenantId).order("created_at"),
    supabase.from("dispatches").select("*").eq("tenant_id", tenantId).order("dispatched_at", { ascending: false }),
    supabase.from("report_entries").select("*").eq("tenant_id", tenantId).is("deleted_at", null).order("created_at", { ascending: false }),
    supabase.from("attachments").select("*").eq("tenant_id", tenantId).is("deleted_at", null).order("created_at", { ascending: false }),
    supabase.from("signatures").select("*").eq("tenant_id", tenantId).is("revoked_at", null).order("signed_at", { ascending: false }),
    supabase.from("review_decisions").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
    supabase.from("invoices").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
    supabase.from("invoice_lines").select("*").eq("tenant_id", tenantId).order("created_at"),
    supabase.from("payment_attempts").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
    supabase.from("payment_allocations").select("*").eq("tenant_id", tenantId).order("allocated_at", { ascending: false }),
    supabase.from("announcements").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
    supabase.from("reminders").select("*").eq("tenant_id", tenantId).order("due_at"),
    supabase.from("open_shifts").select("*").eq("tenant_id", tenantId).order("starts_at"),
    supabase.from("shift_interests").select("*").eq("tenant_id", tenantId).order("created_at"),
    supabase.from("time_entries").select("*").eq("tenant_id", tenantId).order("starts_at", { ascending: false }).limit(500),
    supabase.from("notifications").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(100),
    supabase.from("tenant_settings").select("*").eq("tenant_id", tenantId).maybeSingle(),
    supabase.from("tenant_branding").select("*").eq("tenant_id", tenantId).maybeSingle(),
    supabase.from("personnel_documents").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
    supabase.from("availability").select("*").eq("tenant_id", tenantId).order("starts_at"),
    supabase.from("announcement_reads").select("*").eq("tenant_id", tenantId),
    supabase.from("extra_work_rules").select("*").eq("tenant_id", tenantId).eq("active", true),
    supabase.from("work_order_allowed_extra_work").select("*").eq("tenant_id", tenantId),
    supabase.from("travel_legs").select("*").eq("tenant_id", tenantId),
    supabase.from("personnel_functions").select("*").eq("tenant_id", tenantId),
  ]);
  const singleton = <T>(result: { data: T | null; error: { message: string } | null }): T | null => {
    if (result.error) throw new Error(result.error.message);
    return result.data;
  };
  const branding = singleton(results[29]);
  const signedLogo = branding?.logo_path
    ? await supabase.storage.from("branding").createSignedUrl(branding.logo_path, 3600)
    : null;
  return {
    customers: rows(results[0]), contacts: rows(results[1]), objects: rows(results[2]),
    requests: rows(results[3]), quotes: rows(results[4]), tasks: rows(results[5]), taskRevisions: rows(results[6]),
    personnel: rows(results[7]), functions: rows(results[8]), qualifications: rows(results[9]),
    workOrders: rows(results[10]), assignments: rows(results[11]), workOrderTasks: rows(results[12]), dispatches: rows(results[13]),
    reports: rows(results[14]), attachments: rows(results[15]), signatures: rows(results[16]), reviews: rows(results[17]),
    invoices: rows(results[18]), invoiceLines: rows(results[19]), payments: rows(results[20]), allocations: rows(results[21]),
    announcements: rows(results[22]), reminders: rows(results[23]), openShifts: rows(results[24]), shiftInterests: rows(results[25]),
    timeEntries: rows(results[26]), notifications: rows(results[27]), settings: singleton(results[28]), branding,
    brandingLogoUrl: signedLogo?.data?.signedUrl ?? null,
    personnelDocuments: rows(results[30]), availability: rows(results[31]), announcementReads: rows(results[32]),
    extraWorkRules: rows(results[33]), allowedExtraWork: rows(results[34]),
    travelLegs: rows(results[35]),
    personnelFunctions: rows(results[36]),
  };
}
