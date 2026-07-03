import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { ObjectDetailTabs, type ObjectTabKey, OBJECT_TAB_KEYS } from "@/components/objects/ObjectDetailTabs";
import { ObjectDetailActions } from "@/components/objects/ObjectDetailActions";
import { ObjectOverviewTab } from "@/components/objects/tabs/ObjectOverviewTab";
import { ObjectDetailsTab } from "@/components/objects/tabs/ObjectDetailsTab";
import { ObjectContactsTab } from "@/components/objects/tabs/ObjectContactsTab";
import { ObjectPersonnelTab } from "@/components/objects/tabs/ObjectPersonnelTab";
import { ObjectServicesTab } from "@/components/objects/tabs/ObjectServicesTab";
import { MaterialStockPanel } from "@/components/materials/MaterialStockPanel";
import { InventoryItemsPanel } from "@/components/inventory/InventoryItemsPanel";
import { StatusBadge } from "@/components/ui/status-badge";
import { getObjectForDetailPage } from "@/app/actions/object-detail-safe";
import {
  getObject,
  getObjectPerformance,
  listObjectHistory,
  listObjectContacts,
  listObjectPersonnel,
  listPersonnelOptions,
  listCustomerOptions,
} from "@/app/actions/objects";
import { listSectors } from "@/app/actions/customers";
import { listAssignmentsForObject } from "@/app/actions/assignments";
import { listMaterialStockForObject } from "@/app/actions/materials";
import { listInventoryForObject } from "@/app/actions/inventory";

async function safeOptional<T>(
  label: string,
  objectId: string,
  loader: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await loader();
  } catch (error) {
    console.error("object detail optional data failed", {
      label,
      objectId,
      error,
    });
    return fallback;
  }
}

const emptyPerformance: Awaited<ReturnType<typeof getObjectPerformance>> = {
  totalAssignments: 0,
  activeAssignments: 0,
  completedAssignments: 0,
  notCompletedAssignments: 0,
  reportsSubmitted: 0,
  reportsApproved: 0,
  openTickets: 0,
  mediaItems: 0,
  documents: 0,
  fixedPersonnel: 0,
  openActions: 0,
  completionRate: 0,
  lastServiceDate: null,
  nextServiceDate: null,
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  try {
    const canRead = await hasPermission("objects", "read");
    if (!canRead) return { title: "Toegang geweigerd" };
    const { id } = await params;
    const obj = await getObject(id);
    return { title: obj?.name ?? "Object" };
  } catch {
    return { title: "Object" };
  }
}

interface Props {
  params:       Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export default async function ObjectDetailPage({ params, searchParams }: Props) {
  const canRead = await hasPermission("objects", "read");
  if (!canRead) return <ForbiddenPage resource="objects" action="read" />;

  const { id }   = await params;
  const sp       = await searchParams;
  const rawTab   = sp.tab ?? "overzicht";
  const activeTab: ObjectTabKey = (OBJECT_TAB_KEYS as readonly string[]).includes(rawTab)
    ? (rawTab as ObjectTabKey)
    : "overzicht";

  const [canWrite, canReadAssignments, canReadMaterials, canReadInventory] = await Promise.all([
    hasPermission("objects",     "write"),
    hasPermission("assignments", "read"),
    hasPermission("materials",   "view"),
    hasPermission("inventory",   "view"),
  ]);

  const obj = await safeOptional("object", id, () => getObjectForDetailPage(id), null);
  if (!obj) notFound();

  const [contacts, personnel, personnelOptions, assignments, sectors, customers, performance, history, materialStock, inventoryItems] = await Promise.all([
    safeOptional("contacts", id, () => listObjectContacts(id), []),
    safeOptional("personnel", id, () => listObjectPersonnel(id), []),
    canWrite
      ? safeOptional("personnel-options", id, () => listPersonnelOptions(), [])
      : Promise.resolve([]),
    canReadAssignments
      ? safeOptional("assignments", id, () => listAssignmentsForObject(id, 50), [])
      : Promise.resolve([]),
    canWrite
      ? safeOptional("sectors", id, () => listSectors(), [])
      : Promise.resolve([]),
    canWrite
      ? safeOptional("customers", id, () => listCustomerOptions(), [])
      : Promise.resolve([]),
    safeOptional("performance", id, () => getObjectPerformance(id), emptyPerformance),
    safeOptional("history", id, () => listObjectHistory(id), []),
    canReadMaterials
      ? safeOptional("material-stock", id, () => listMaterialStockForObject(id), [])
      : Promise.resolve([]),
    canReadInventory
      ? safeOptional("inventory-items", id, () => listInventoryForObject(id), [])
      : Promise.resolve([]),
  ]);

  const counts = {
    contacten:  contacts.length,
    diensten:   assignments.length,
    materiaal:  materialStock.length,
    inventaris: inventoryItems.length,
  };

  return (
    <div className="mx-auto w-full max-w-[1600px] p-8">
      {/* Back link */}
      <Link
        href="/objects"
        className="inline-flex items-center gap-1 text-sm mb-4 transition-colors hover:underline"
        style={{ color: "#64748B" }}
      >
        <ArrowLeft className="h-4 w-4" />
        Objecten
      </Link>

      {/* Header */}
      <div className="veele-card mb-6 flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-heading text-2xl font-bold" style={{ color: "#081D3A" }}>
              {obj.name}
            </h1>
            <span className="font-mono text-xs rounded px-1.5 py-0.5 bg-slate-100" style={{ color: "#475569" }}>
              {obj.code}
            </span>
            <StatusBadge isActive={obj.isActive} />
          </div>
          <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
            {obj.customerName ? (
              <>
                <Link href={`/customers/${obj.customerId}`} className="hover:underline" style={{ color: "#00B7B3" }}>
                  {obj.customerName}
                </Link>
                {obj.city && ` · ${obj.city}`}
              </>
            ) : (
              obj.city ?? ""
            )}
            {obj.serviceType && (
              <span> · <span style={{ color: "#081D3A" }}>{obj.serviceType}</span></span>
            )}
          </p>
        </div>
        {canWrite && (
          <ObjectDetailActions object={obj} sectors={sectors} customers={customers} />
        )}
      </div>

      {/* Tab navigation */}
      <ObjectDetailTabs activeTab={activeTab} counts={counts} />

      {/* Tab content */}
      {activeTab === "overzicht" && (
        <>
          <ObjectOverviewTab object={obj} performance={performance} history={history} />
          {(personnel.length > 0 || canWrite) && (
            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#64748B" }}>
                Gekoppeld personeel
              </p>
              <ObjectPersonnelTab
                objectId={id}
                personnel={personnel}
                options={personnelOptions}
                canWrite={canWrite}
              />
            </div>
          )}
        </>
      )}

      {activeTab === "materiaal" && (
        canReadMaterials ? (
          <MaterialStockPanel
            rows={materialStock}
            emptyMessage="Er is nog geen materiaalvoorraad aan dit object gekoppeld."
          />
        ) : (
          <ForbiddenPage resource="materials" action="view" />
        )
      )}

      {activeTab === "inventaris" && (
        canReadInventory ? (
          <InventoryItemsPanel
            rows={inventoryItems}
            emptyMessage="Er is nog geen inventaris aan dit object gekoppeld."
          />
        ) : (
          <ForbiddenPage resource="inventory" action="view" />
        )
      )}

      {activeTab === "details" && (
        <ObjectDetailsTab object={obj} canWrite={canWrite} />
      )}

      {activeTab === "contacten" && (
        <ObjectContactsTab
          objectId={id}
          contacts={contacts}
          canWrite={canWrite}
        />
      )}

      {activeTab === "diensten" && (
        <ObjectServicesTab
          objectId={id}
          assignments={assignments}
        />
      )}
    </div>
  );
}
