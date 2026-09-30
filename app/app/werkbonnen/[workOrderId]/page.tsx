import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { getWorkOrderDossier, getWorkOrderOptions } from "@/lib/work-orders/data";
import { workOrderReturn, workOrderTabs } from "@/lib/work-orders/model";
import { WorkOrderDossierPage } from "@/components/fieldgrid/work-orders/dossier";

export default async function WorkOrderDetail({ params, searchParams }: { params: Promise<{ workOrderId: string }>; searchParams: Promise<{ tab?: string; return?: string; edit?: string }> }) {
  const context = await getAuthContext();
  const { workOrderId } = await params;
  if (!context.tenant?.enabledServices.includes("planning") || !context.tenant.roles.some(r => ["tenant_admin", "management", "planner", "finance"].includes(r)) || !/^[a-f0-9-]{36}$/i.test(workOrderId)) notFound();
  const [data, query] = await Promise.all([getWorkOrderDossier(context.tenant.id, workOrderId), searchParams]);
  if (!data) notFound();
  const options = data.canManage ? await getWorkOrderOptions(context.tenant.id) : null;
  const tab = workOrderTabs.some(([id]) => id === query.tab) && (query.tab !== "financieel" || data.finance) ? query.tab! : "overzicht";
  return <WorkOrderDossierPage data={data} options={options} tenant={context.tenant} tab={tab} back={workOrderReturn(query.return)} edit={query.edit === "1"}/>;
}
