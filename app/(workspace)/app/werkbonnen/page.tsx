import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { getWorkOrderList, getWorkOrderOptions } from "@/lib/work-orders/data";
import { workOrderQuery } from "@/lib/work-orders/model";
import { SitesWorkOrdersList } from "@/components/fieldgrid/work-orders/source-list";
import {hasManagementPermission} from '@/lib/management/model';

export default async function WorkOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getAuthContext();
  if (!context.tenant?.enabledServices.includes("planning") || !context.tenant.roles.some(r => ["tenant_admin", "management", "planner", "finance"].includes(r))) notFound();
  if(!hasManagementPermission(context.tenant,'backoffice.work_orders.read')||!hasManagementPermission(context.tenant,'backoffice.functions.work_order_list'))notFound();
  const raw = await searchParams;
  const params = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
  const query = workOrderQuery.parse(params);
  const [data, options] = await Promise.all([getWorkOrderList(context.tenant.id, query), hasManagementPermission(context.tenant,'backoffice.functions.work_order_options')?getWorkOrderOptions(context.tenant.id):Promise.resolve(null)]);
  return <SitesWorkOrdersList initial={data} options={options} tenant={context.tenant} userId={context.user.id} create={params.new === "1"}/>;
}
