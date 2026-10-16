import { notFound, redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { getPlanningShellData } from "@/lib/planning/data";
import { BackofficeShell } from "@/components/fieldgrid/backoffice-shell";
import {SitesCustomersList,type CustomerCards} from '@/components/fieldgrid/management-cockpit/customers-list';
import {ticketRpc} from '@/lib/tickets/rpc';
import {hasManagementPermission} from '@/lib/management/model';
import {PageHeading,Panel,Empty} from '@/components/fieldgrid/crm/ui';
import {
  canManageCustomers,
  customerFilters,
  customerTab,
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
  if(!hasManagementPermission(context.tenant,'backoffice.functions.cockpit_customer_cards')||!hasManagementPermission(context.tenant,'backoffice.functions.cockpit_entity_query'))return <BackofficeShell context={{...context,tenant:context.tenant}} data={await getPlanningShellData(context.tenant.id)} initialView="klanten" presentation="sites-management"><PageHeading eyebrow="RELATIES" title="Klanten"/><Panel><Empty title="Deze weergave is afgeschermd" text="Je actuele rechten geven geen toegang tot deze lijst- en dossierweergave."/></Panel></BackofficeShell>;
  const params = await searchParams;
  const query = Object.fromEntries(
    Object.entries(params).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
  if (query.record && /^[a-f0-9-]{36}$/i.test(query.record))
    redirect(`/app/klanten/${query.record}?tab=${customerTab(query.tab)}`);
  const filters = customerFilters.parse(query),
    db = await createClient();
  const [r, owners, shell] = await Promise.all([
    ticketRpc(db,"cockpit_customer_cards", { target_tenant: context.tenant.id, filters }),
    db.rpc("customer_owners", { target_tenant: context.tenant.id }),
    getPlanningShellData(context.tenant.id),
  ]).catch(error=>{if(error&&typeof error==='object'&&'code'in error&&error.code==='42501')notFound();throw error});
  if (owners.error)
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
      presentation="sites-management"
    >
      <SitesCustomersList
        tenant={context.tenant}
        data={r as CustomerCards}
        owners={owners.data ?? []}
        defaultPaymentTermsDays={settings.data.payment_terms_days}
        create={query.new === "1"}
      />
    </BackofficeShell>
  );
}
