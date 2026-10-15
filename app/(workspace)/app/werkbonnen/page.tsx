import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { getWorkOrderList, getWorkOrderOptions } from "@/lib/work-orders/data";
import { workOrderQuery } from "@/lib/work-orders/model";
import { WorkOrdersList } from "@/components/fieldgrid/work-orders/list";

export default async function WorkOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getAuthContext();
  if (!context.tenant?.enabledServices.includes("planning") || !context.tenant.roles.some(r => ["tenant_admin", "management", "planner", "finance"].includes(r))) notFound();
  const raw = await searchParams;
  const params = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
  const query = workOrderQuery.parse(params);
  const [data, options] = await Promise.all([getWorkOrderList(context.tenant.id, query), getWorkOrderOptions(context.tenant.id)]);
  return <WorkOrdersList key={JSON.stringify(query)} data={data} options={options} query={query} tenant={context.tenant} create={params.new === "1"}/>;
}
