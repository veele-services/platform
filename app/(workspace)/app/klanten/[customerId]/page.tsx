import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { getPlanningShellData } from "@/lib/planning/data";
import { getCustomerData } from "@/lib/customers/data";
import {
  canManageCustomers,
  canReadFinance,
  customerTab,
  customerReturn,
} from "@/lib/customers/model";
import { BackofficeShell } from "@/components/fieldgrid/backoffice-shell";
import { CustomerDossier } from "@/components/fieldgrid/customers/dossier";
export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<{ tab?: string; return?: string; edit?: string }>;
}) {
  const context = await getAuthContext(),
    { customerId } = await params,
    query = await searchParams;
  if (
    !context.tenant ||
    !canManageCustomers(context.tenant.roles) ||
    !context.tenant.enabledServices.includes("planning") ||
    !/^[a-f0-9-]{36}$/i.test(customerId)
  )
    notFound();
  const [data, shell] = await Promise.all([
    getCustomerData(
      context.tenant.id,
      customerId,
      canReadFinance(context.tenant.roles),
    ),
    getPlanningShellData(context.tenant.id),
  ]);
  if (!data) notFound();
  const tab = customerTab(query.tab);
  return (
    <BackofficeShell
      context={{ ...context, tenant: context.tenant }}
      initialView="klanten"
      data={shell}
    >
      <CustomerDossier
        key={`${customerId}:${tab}`}
        data={data}
        tenant={context.tenant}
        tab={tab}
        back={customerReturn(query.return)}
        edit={query.edit === "1"}
      />
    </BackofficeShell>
  );
}
