import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { CustomerDetailActions } from "@/components/customers/CustomerDetailActions";
import { CustomerProfileHeader } from "@/components/customers/CustomerProfileHeader";
import { CustomerTabs, type TabKey } from "@/components/customers/CustomerTabs";
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

const VALID_TABS = [
  "overzicht", "contacten", "objecten", "opdrachten",
  "facturen", "betalingen", "rapporten", "documenten",
  "notities", "geschiedenis",
] as const;

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

  return (
    <div className="p-8 max-w-[1600px]">
      {/* Back link */}
      <Link
        href="/customers"
        className="inline-flex items-center gap-1 text-sm mb-4 transition-colors hover:underline"
        style={{ color: "#64748B" }}
      >
        <ArrowLeft className="h-4 w-4" />
        Klanten
      </Link>

      {/* Hero header with KPIs */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <CustomerProfileHeader customer={safeCustomer} kpis={kpis} />
        </div>
        {canWrite && (
          <div className="flex-shrink-0 mt-1">
            <CustomerDetailActions
              customer={safeCustomer}
              sectors={sectors}
              customerTypes={customerTypes}
              accountManagers={accountManagers}
              canWriteNotes={canWrite}
            />
          </div>
        )}
      </div>

      {/* Tab navigation */}
      <CustomerTabs activeTab={activeTab} counts={counts} />

      {/* Tab content */}
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
    </div>
  );
}
