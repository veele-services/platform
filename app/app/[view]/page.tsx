import { notFound, redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import type { TenantContext } from "@/lib/auth/context";
import { getWorkspaceData } from "@/lib/data/workspace";
import { BackofficeShell, type BackofficeView } from "@/components/fieldgrid/backoffice-shell";
import { NoAccess } from "../no-access";
import { ProvisionForm } from "../provision-form";

const viewBySegment: Record<string, BackofficeView> = {
  aanvragen: "aanvragen",
  planning: "planning",
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

export default async function BackofficeViewPage({ params }: { params: Promise<{ view: string }> }) {
  const { view: segment } = await params;
  const view = viewBySegment[segment];
  if (!view) notFound();

  const context = await getAuthContext();
  if (!context.tenant) {
    return context.isPlatformAdmin ? <ProvisionForm email={context.user.email} /> : <NoAccess email={context.user.email} />;
  }
  if (context.tenant.roles.length === 1 && context.tenant.roles[0] === "staff") redirect("/staff");

  const data = await getWorkspaceData(context.tenant.id);
  return <BackofficeShell context={{ ...context, tenant: context.tenant as TenantContext }} data={data} initialView={view} />;
}
