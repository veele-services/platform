import { notFound, redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { getPlanningShellData } from "@/lib/planning/data";
import { BackofficeShell } from "@/components/fieldgrid/backoffice-shell";
import { CustomersList } from "@/components/fieldgrid/customers/list";
import {
  canManageCustomers,
  customerFilters,
  customerTab,
  type CustomerList,
} from "@/lib/customers/model";
export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getAuthContext();
  if (
    !context.tenant ||
    !canManageCustomers(context.tenant.roles) ||
    !context.tenant.enabledServices.includes("planning")
  )
    notFound();
  const params = await searchParams;
  const query = Object.fromEntries(
    Object.entries(params).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
  if (query.record && /^[a-f0-9-]{36}$/i.test(query.record))
    redirect(`/app/klanten/${query.record}?tab=${customerTab(query.tab)}`);
  const filters = customerFilters.parse(query),
    db = await createClient();
  const [r, owners, shell] = await Promise.all([
    db.rpc("customer_list", { target_tenant: context.tenant.id, filters }),
    db.rpc("customer_owners", { target_tenant: context.tenant.id }),
    getPlanningShellData(context.tenant.id),
  ]);
  if (r.error || owners.error)
    throw new Error("De klantenlijst kon niet worden geladen.");
  const settings = await db
    .from("tenant_settings")
    .select("payment_terms_days")
    .eq("tenant_id", context.tenant.id)
    .single();
  if (settings.error)
    throw new Error("De betaalafspraken konden niet worden geladen.");
  return (
    <BackofficeShell
      context={{ ...context, tenant: context.tenant }}
      data={shell}
      initialView="klanten"
    >
      <CustomersList
        key={JSON.stringify(filters)}
        tenant={context.tenant}
        filters={filters}
        data={r.data as unknown as CustomerList}
        owners={owners.data ?? []}
        defaultPaymentTermsDays={settings.data.payment_terms_days}
        create={query.new === "1"}
      />
    </BackofficeShell>
  );
}
