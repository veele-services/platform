import { notFound, redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import type { TenantContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceData } from "@/lib/data/workspace";
import { BackofficeShell, type BackofficeView } from "@/components/fieldgrid/backoffice-shell";
import { NoAccess } from "../no-access";
import { hasManagementPermission } from "@/lib/management/model";

const viewBySegment: Record<string, BackofficeView> = {
  aanvragen: "aanvragen",
  werkbonnen: "werkbonnen",
  taken: "taken",
  klanten: "klanten",
  objecten: "objecten",
  personeel: "personeel",
  rapporten: "controle",
  facturen: "facturen",
  nieuws: "nieuws",
  instellingen: "instellingen",
};

const serviceByView: Partial<Record<BackofficeView, string>> = {
  aanvragen: "planning", planning: "planning", werkbonnen: "planning", taken: "planning",
  klanten: "planning", objecten: "planning", personeel: "personeel", nieuws: "personeel",
  controle: "rapportage", facturen: "finance",
};

export default async function BackofficeViewPage({ params }: { params: Promise<{ view: string }> }) {
  const { view: segment } = await params;
  const view = viewBySegment[segment];
  if (!view) notFound();

  const context = await getAuthContext();
  if (!context.tenant) {
    if (context.isPlatformAdmin) redirect("/platform");
    return <NoAccess email={context.user.email} />;
  }
  if (context.tenant.roles.length === 1 && context.tenant.roles[0] === "staff") redirect("/staff");
  const requiredService = serviceByView[view];
  if (requiredService && !context.tenant.enabledServices.includes(requiredService)) notFound();

  const data = await getWorkspaceData(context.tenant.id);
  if (view === "werkbonnen" && context.tenant.roles.some(role => ["tenant_admin", "management", "hr", "planner"].includes(role)) && hasManagementPermission(context.tenant,"backoffice.personnel.read") && hasManagementPermission(context.tenant,"backoffice.functions.personnel_qualification_gaps")) {
    const db = await createClient();
    const { data: gaps, error } = await db.rpc("personnel_qualification_gaps", { target_tenant: context.tenant.id });
    if (error) throw new Error("De kwalificatiecontrole is tijdelijk niet beschikbaar.");
    data.qualificationGaps = gaps;
  }
  return <BackofficeShell context={{ ...context, tenant: context.tenant as TenantContext }} data={data} initialView={view} />;
}
