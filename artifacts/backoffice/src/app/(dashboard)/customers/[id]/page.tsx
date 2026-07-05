import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { CustomerDetailActions } from "@/components/customers/CustomerDetailActions";
import type { TabKey } from "@/components/customers/CustomerTabs";
import { CustomerStatusBadge } from "@/components/customers/CustomerStatusBadge";
import { CustomerOverviewTab } from "@/components/customers/tabs/CustomerOverviewTab";
import { CustomerContactsTab } from "@/components/customers/tabs/CustomerContactsTab";
import { CustomerObjectsTab } from "@/components/customers/tabs/CustomerObjectsTab";
import { CustomerAssignmentsTab } from "@/components/customers/tabs/CustomerAssignmentsTab";
import { CustomerInvoicesTab } from "@/components/customers/tabs/CustomerInvoicesTab";
import { CustomerPaymentsTab } from "@/components/customers/tabs/CustomerPaymentsTab";
import { CustomerReportsTab } from "@/components/customers/tabs/CustomerReportsTab";
import { CustomerHistoryTab } from "@/components/customers/tabs/CustomerHistoryTab";
import { CustomerNotesTabContent } from "@/components/customers/tabs/CustomerNotesTabContent";
import { CustomerDocumentsTabContent } from "@/components/customers/tabs/CustomerDocumentsTabContent";
import {
  getCustomer,
  listSectors,
  listCustomerNotes,
  listCustomerHistory,
  listCustomerContacts,
  listCustomerTypes,
  listAccountManagers,
  getCustomerKpis,
  listCustomerPortalUsers,
  listCustomerTicketsForCustomer,
} from "@/app/actions/customers";
import { listObjectsForCustomer } from "@/app/actions/objects";
import { listAssignmentsForCustomer } from "@/app/actions/assignments";
import { listInvoicesForCustomer } from "@/app/actions/invoices";
import { listPaymentsForCustomer } from "@/app/actions/payments";
import { listDocuments } from "@/app/actions/documents";
import { listReportsForCustomer } from "@/app/actions/reports";
import {
  TenantDetailActionPanel,
  TenantDetailHeader,
  TenantDetailLayout,
  TenantDetailSectionNav,
  TenantPageShell,
} from "@/components/tenant-ui";

const VALID_TABS = [
  "overzicht", "contacten", "objecten", "opdrachten",
  "facturen", "betalingen", "rapporten", "documenten",
  "notities", "geschiedenis",
] as const;

const TAB_LABELS: Record<TabKey, string> = {
  overzicht: "Overzicht",
  contacten: "Contacten",
  objecten: "Objecten",
  opdrachten: "Opdrachten",
  facturen: "Facturen",
  betalingen: "Betalingen",
  rapporten: "Rapporten",
  documenten: "Documenten",
  notities: "Notities",
  geschiedenis: "Geschiedenis",
};

function formatCurrency(value: string | null | undefined): string {
  const parsed = parseFloat(value ?? "0");
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(Number.isFinite(parsed) ? parsed : 0);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Geen activiteit";
  return new Date(value).toLocaleDateString("nl-NL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

interface Props {
  params:       Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const canRead = await hasPermission("customers", "read");
    if (!canRead) return { title: "Access Denied" };
    const { id } = await params;
    const customer = await getCustomer(id);
    return { title: customer?.name ?? "Klant" };
  } catch {
    return { title: "Klant" };
  }
}

export default async function CustomerDetailPage({ params, searchParams }: Props) {
  const canRead = await hasPermission("customers", "read");
  if (!canRead) return <ForbiddenPage resource="customers" action="read" />;

  const { id } = await params;
  const sp      = await searchParams;
  const rawTab  = sp.tab ?? "overzicht";
  const activeTab: TabKey = (VALID_TABS as readonly string[]).includes(rawTab)
    ? (rawTab as TabKey)
    : "overzicht";

  const [canWrite, canReadAssignments, canReadDocuments, canWriteDocuments, canReadInvoices, canReadReports, canReadTickets] = await Promise.all([
    hasPermission("customers",   "write"),
    hasPermission("assignments", "read"),
    hasPermission("documents",   "read"),
    hasPermission("documents",   "write"),
    hasPermission("invoices",    "read"),
    hasPermission("reports",     "read"),
    hasPermission("tickets",     "read"),
  ]);

  // Load all data in parallel — gate expensive calls on permissions
  const [
    customer,
    sectors,
    customerTypes,
    accountManagers,
    kpis,
    contacts,
    objects,
    customerNotes,
    assignmentHistory,
    invoices,
    payments,
    reports,
    documents,
    history,
    portalUsers,
    tickets,
  ] = await Promise.all([
    getCustomer(id),
    listSectors(),
    listCustomerTypes(),
    listAccountManagers(),
    getCustomerKpis(id),
    listCustomerContacts(id),
    listObjectsForCustomer(id),
    canWrite    ? listCustomerNotes(id)                         : Promise.resolve([]),
    canReadAssignments ? listAssignmentsForCustomer(id, 25)     : Promise.resolve([]),
    canReadInvoices    ? listInvoicesForCustomer(id, 25)        : Promise.resolve([]),
    canReadInvoices    ? listPaymentsForCustomer(id, 25)        : Promise.resolve([]),
    canReadReports     ? listReportsForCustomer(id, 25)         : Promise.resolve([]),
    canReadDocuments   ? listDocuments({ entityType: "customer", entityId: id }) : Promise.resolve([]),
    canWrite           ? listCustomerHistory(id, 25)            : Promise.resolve([]),
    listCustomerPortalUsers(id),
    canReadTickets     ? listCustomerTicketsForCustomer(id, 10) : Promise.resolve([]),
  ]);

  if (!customer) notFound();

  const safeCustomer = canWrite ? customer : { ...customer, notes: null };

  // Tab counts for the tab bar
  const counts = {
    contacten:  contacts.length,
    objecten:   objects.length,
    opdrachten: assignmentHistory.length,
    facturen:   invoices.length,
    betalingen: payments.length,
    rapporten:  reports.length,
    notities:   customerNotes.length,
    documenten: documents.length,
    geschiedenis: history.length,
  };

  const customerSummary = [
    { label: "Omzet deze maand", value: formatCurrency(kpis.monthlyRevenue) },
    { label: "Actieve objecten", value: kpis.activeObjects },
    { label: "Open opdrachten", value: kpis.openAssignments },
    { label: "Open facturen", value: kpis.openInvoices },
    { label: "Openstaand saldo", value: formatCurrency(kpis.outstandingBalance) },
    { label: "Laatste activiteit", value: formatDate(kpis.lastActivityDate) },
  ];

  return (
    <TenantPageShell>
      <TenantDetailHeader
        backHref="/customers"
        backLabel="Klanten"
        title={safeCustomer.name}
        description={[
          safeCustomer.sectorName,
          safeCustomer.customerTypeName,
          safeCustomer.website?.replace(/^https?:\/\//, ""),
        ].filter(Boolean).join(" · ")}
        badges={
          <>
            {safeCustomer.code && (
              <span className="rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
                {safeCustomer.code}
              </span>
            )}
            <CustomerStatusBadge status={safeCustomer.status} />
          </>
        }
        summary={
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {customerSummary.map((item) => (
              <div key={item.label} className="rounded-md border border-border bg-background px-3 py-3">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="mt-1 text-lg font-semibold text-foreground">{item.value}</p>
              </div>
            ))}
          </div>
        }
      />

      <TenantDetailSectionNav
        items={VALID_TABS.map((tab) => ({
          label: TAB_LABELS[tab],
          href: `/customers/${id}?tab=${tab}`,
          active: activeTab === tab,
          count: counts[tab as keyof typeof counts],
        }))}
      />

      <TenantDetailLayout
        aside={
          canWrite ? (
            <TenantDetailActionPanel
              title="Klantacties"
              description="Beheer klantgegevens, notities en klantdossieracties."
            >
              <CustomerDetailActions
                customer={safeCustomer}
                sectors={sectors}
                customerTypes={customerTypes}
                accountManagers={accountManagers}
                canWriteNotes={canWrite}
              />
            </TenantDetailActionPanel>
          ) : undefined
        }
      >
      {activeTab === "overzicht" && (
        <CustomerOverviewTab
          customer={safeCustomer}
          canWrite={canWrite}
          kpis={kpis}
          contacts={contacts}
          portalUsers={portalUsers}
          objects={objects}
          assignments={canReadAssignments ? assignmentHistory : []}
          invoices={canReadInvoices ? invoices : []}
          payments={canReadInvoices ? payments : []}
          reports={canReadReports ? reports : []}
          documents={canReadDocuments ? documents : []}
          tickets={canReadTickets ? tickets : []}
          notes={canWrite ? customerNotes : []}
          history={canWrite ? history : []}
        />
      )}

      {activeTab === "contacten" && (
        <CustomerContactsTab
          customerId={id}
          contacts={contacts}
          canWrite={canWrite}
        />
      )}

      {activeTab === "objecten" && (
        <CustomerObjectsTab
          customerId={id}
          customerName={customer.name}
          objects={objects}
          sectors={sectors}
          canWrite={canWrite}
        />
      )}

      {activeTab === "opdrachten" && canReadAssignments && (
        <CustomerAssignmentsTab
          customerId={id}
          assignments={assignmentHistory}
        />
      )}

      {activeTab === "facturen" && canReadInvoices && (
        <CustomerInvoicesTab
          customerId={id}
          invoices={invoices}
        />
      )}

      {activeTab === "betalingen" && canReadInvoices && (
        <CustomerPaymentsTab
          customerId={id}
          payments={payments}
        />
      )}

      {activeTab === "rapporten" && canReadReports && (
        <CustomerReportsTab
          customerId={id}
          reports={reports}
        />
      )}

      {activeTab === "documenten" && canReadDocuments && (
        <CustomerDocumentsTabContent
          entityId={id}
          documents={documents}
          canWrite={canWriteDocuments}
        />
      )}

      {activeTab === "notities" && (
        <CustomerNotesTabContent
          customerId={id}
          notes={customerNotes}
          canWrite={canWrite}
        />
      )}

      {activeTab === "geschiedenis" && canWrite && (
        <CustomerHistoryTab
          history={history}
        />
      )}
      </TenantDetailLayout>
    </TenantPageShell>
  );
}
