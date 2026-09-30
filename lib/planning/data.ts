import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { WorkspaceData } from "@/lib/data/workspace";
import type { PlanboardData, PlanningQuery } from "./model";

export async function getPlanboard(
  tenantId: string,
  query: PlanningQuery,
): Promise<PlanboardData> {
  const db = await createClient();
  const result = await db.rpc("get_planboard", {
    target_tenant: tenantId,
    target_day: query.day,
    list_view: query.view,
    search_text: query.search,
    status_filter: query.status,
    page_number: query.page,
  });
  if (result.error)
    throw new Error("Het planbord kon niet worden geladen. Probeer opnieuw.");
  return result.data as unknown as PlanboardData;
}
// The shared navigation needs only branding. Never pass broad workspace/HR/object
// payloads through a planner page just to render its sidebar.
export async function getPlanningShellData(
  tenantId: string,
): Promise<WorkspaceData> {
  const db = await createClient();
  const { data: branding, error } = await db
    .from("tenant_branding")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error("Huisstijl kon niet worden geladen.");
  const logo = branding?.logo_path
    ? await db.storage
        .from("branding")
        .createSignedUrl(branding.logo_path, 3600)
    : null;
  return {
    customers: [],
    contacts: [],
    customerNotes: [],
    customerDocuments: [],
    objects: [],
    requests: [],
    quotes: [],
    tasks: [],
    taskRevisions: [],
    personnel: [],
    personnelFunctions: [],
    functions: [],
    qualifications: [],
    workOrders: [],
    assignments: [],
    workOrderTasks: [],
    dispatches: [],
    reports: [],
    attachments: [],
    signatures: [],
    reviews: [],
    invoices: [],
    invoiceLines: [],
    payments: [],
    allocations: [],
    announcements: [],
    reminders: [],
    openShifts: [],
    shiftInterests: [],
    timeEntries: [],
    notifications: [],
    personnelDocuments: [],
    availability: [],
    announcementReads: [],
    extraWorkRules: [],
    allowedExtraWork: [],
    travelLegs: [],
    settings: null,
    branding,
    brandingLogoUrl: logo?.data?.signedUrl ?? null,
  };
}
