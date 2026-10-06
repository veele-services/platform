import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { getPlanningShellData } from "@/lib/planning/data";
import { BackofficeShell } from "@/components/fieldgrid/backoffice-shell";
import { DossierChainPanel } from "@/components/fieldgrid/dossier-chain";
import { PageHeading } from "@/components/fieldgrid/page-heading";
export default async function FollowupPage() {
  const context = await getAuthContext();
  if (!context.tenant || !context.tenant.roles.some(r => ["tenant_admin", "management", "hr", "planner", "finance"].includes(r))) notFound();
  const data = await getPlanningShellData(context.tenant.id);
  return <BackofficeShell context={{ ...context, tenant: context.tenant }} data={data} initialView="opvolging"><div className="personnel-dossier"><PageHeading eyebrow="DOSSIER 360" title="Opvolging" help="Klantverzoeken, objectacties, uitvoeringstaken en bevoegde personeelsacties bij elkaar, met behoud van hun eigen proces."/><DossierChainPanel scope={{}} view="actions" timezone={context.tenant.timezone}/></div></BackofficeShell>;
}
