import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { getPlanningShellData } from "@/lib/planning/data";
import { BackofficeShell } from "@/components/fieldgrid/backoffice-shell";
import { DossierChainPanel } from "@/components/fieldgrid/dossier-chain";
export default async function FollowupPage() {
  const context = await getAuthContext();
  if (!context.tenant || !context.tenant.roles.some(r => ["tenant_admin", "management", "hr", "planner", "finance"].includes(r))) notFound();
  const data = await getPlanningShellData(context.tenant.id);
  return <BackofficeShell context={{ ...context, tenant: context.tenant }} data={data} initialView="opvolging"><div className="personnel-dossier"><header className="page-intro"><span className="eyebrow">DOSSIER 360</span><h1>Opvolging</h1><p>Klantverzoeken, objectacties, uitvoeringstaken en bevoegde personeelsacties bij elkaar, met behoud van hun eigen proces.</p></header><DossierChainPanel scope={{}} view="actions" timezone={context.tenant.timezone}/></div></BackofficeShell>;
}
