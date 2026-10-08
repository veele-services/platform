import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { getPlanningShellData } from "@/lib/planning/data";
import { BackofficeShell } from "@/components/fieldgrid/backoffice-shell";
import { DossierChainPanel } from "@/components/fieldgrid/dossier-chain";
import { loadDossierChain } from "@/lib/dossiers/data";
export default async function FollowupPage() {
  const context = await getAuthContext();
  if (!context.tenant || !context.tenant.roles.some(r => ["tenant_admin", "management", "hr", "planner", "finance"].includes(r))) notFound();
  const [data, chain] = await Promise.all([
    getPlanningShellData(context.tenant.id),
    loadDossierChain(context.tenant.id, {}).catch(() => null),
  ]);
  return <BackofficeShell context={{ ...context, tenant: context.tenant }} data={data} initialView="opvolging"><div className="personnel-dossier"><DossierChainPanel key={`${context.tenant.id}:${context.user.id}`} scope={{}} view="actions" timezone={context.tenant.timezone} initial={chain} pageHeading/></div></BackofficeShell>;
}
