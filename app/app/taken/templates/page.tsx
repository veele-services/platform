import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { getPlanningShellData } from "@/lib/planning/data";
import { getWorkOrderOptions } from "@/lib/work-orders/data";
import { BackofficeShell } from "@/components/fieldgrid/backoffice-shell";
import { WorkOrderTemplates } from "@/components/fieldgrid/work-orders/templates";
export default async function TemplatesPage() {
  const context = await getAuthContext();
  if (!context.tenant?.enabledServices.includes("planning") || !context.tenant.roles.some(r => ["tenant_admin","management","planner"].includes(r))) notFound();
  const [shell, options] = await Promise.all([getPlanningShellData(context.tenant.id), getWorkOrderOptions(context.tenant.id)]);
  return <BackofficeShell context={{ ...context, tenant: context.tenant }} data={shell} initialView="taken"><WorkOrderTemplates tenant={context.tenant} options={options}/></BackofficeShell>;
}
