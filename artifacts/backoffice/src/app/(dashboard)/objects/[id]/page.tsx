import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { listAssignmentsForObject } from "@/app/actions/assignments";
import { listSectors } from "@/app/actions/customers";
import { listInventoryForObject } from "@/app/actions/inventory";
import { listMaterialStockForObject } from "@/app/actions/materials";
import { getObjectForDetailPage } from "@/app/actions/object-detail-safe";
import {
  getObject,
  getObjectPerformance,
  listCustomerOptions,
  listObjectContacts,
  listObjectHistory,
  listObjectPersonnel,
  listPersonnelOptions,
} from "@/app/actions/objects";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { InventoryItemsPanel } from "@/components/inventory/InventoryItemsPanel";
import { MaterialStockPanel } from "@/components/materials/MaterialStockPanel";
import { ObjectDetailActions } from "@/components/objects/ObjectDetailActions";
import { OBJECT_TAB_KEYS, OBJECT_TAB_LABELS, type ObjectTabKey } from "@/components/objects/object-tabs";
import { ObjectContactsTab } from "@/components/objects/tabs/ObjectContactsTab";
import { ObjectDetailsTab } from "@/components/objects/tabs/ObjectDetailsTab";
import { ObjectOverviewTab } from "@/components/objects/tabs/ObjectOverviewTab";
import { ObjectPersonnelTab } from "@/components/objects/tabs/ObjectPersonnelTab";
import { ObjectServicesTab } from "@/components/objects/tabs/ObjectServicesTab";
import {
  TenantDetailActionPanel,
  TenantDetailHeader,
  TenantDetailLayout,
  TenantDetailSectionNav,
  TenantPageShell,
} from "@/components/tenant-ui";
import { StatusBadge } from "@/components/ui/status-badge";
import { hasPermission } from "@/lib/auth/permissions";

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

function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function asPerformance(
  value: Awaited<ReturnType<typeof getObjectPerformance>> | null | undefined,
): Awaited<ReturnType<typeof getObjectPerformance>> {
  return value ? { ...emptyPerformance, ...value } : emptyPerformance;
}

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
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export default async function ObjectDetailPage({ params, searchParams }: Props) {
  const canRead = await hasPermission("objects", "read");
  if (!canRead) return <ForbiddenPage resource="objects" action="read" />;

  const { id } = await params;
  const sp = await searchParams;
  const rawTab = sp.tab ?? "overzicht";
  const activeTab: ObjectTabKey = (OBJECT_TAB_KEYS as readonly string[]).includes(rawTab)
    ? (rawTab as ObjectTabKey)
    : "overzicht";

  const [canWrite, canReadAssignments, canReadMaterials, canReadInventory] = await Promise.all([
    hasPermission("objects", "write"),
    hasPermission("assignments", "read"),
    hasPermission("materials", "view"),
    hasPermission("inventory", "view"),
  ]);

  const obj = await safeOptional("object", id, () => getObjectForDetailPage(id), null);
  if (!obj) notFound();

  const [
    rawContacts,
    rawPersonnel,
    rawPersonnelOptions,
    rawAssignments,
    rawSectors,
    rawCustomers,
    rawPerformance,
    rawHistory,
    rawMaterialStock,
    rawInventoryItems,
  ] = await Promise.all([
    safeOptional("contacts", id, () => listObjectContacts(id), []),
    safeOptional("personnel", id, () => listObjectPersonnel(id), []),
    canWrite ? safeOptional("personnel-options", id, () => listPersonnelOptions(), []) : Promise.resolve([]),
    canReadAssignments ? safeOptional("assignments", id, () => listAssignmentsForObject(id, 50), []) : Promise.resolve([]),
    canWrite ? safeOptional("sectors", id, () => listSectors(), []) : Promise.resolve([]),
    canWrite ? safeOptional("customers", id, () => listCustomerOptions(), []) : Promise.resolve([]),
    safeOptional("performance", id, () => getObjectPerformance(id), emptyPerformance),
    safeOptional("history", id, () => listObjectHistory(id), []),
    canReadMaterials ? safeOptional("material-stock", id, () => listMaterialStockForObject(id), []) : Promise.resolve([]),
    canReadInventory ? safeOptional("inventory-items", id, () => listInventoryForObject(id), []) : Promise.resolve([]),
  ]);

  const contacts         = asArray(rawContacts);
  const personnel        = asArray(rawPersonnel);
  const personnelOptions = asArray(rawPersonnelOptions);
  const assignments      = asArray(rawAssignments);
  const sectors          = asArray(rawSectors);
  const customers        = asArray(rawCustomers);
  const performance      = asPerformance(rawPerformance);
  const history          = asArray(rawHistory);
  const materialStock    = asArray(rawMaterialStock);
  const inventoryItems   = asArray(rawInventoryItems);

  const counts = {
    contacten: contacts.length,
    diensten: assignments.length,
    materiaal: materialStock.length,
    inventaris: inventoryItems.length,
  };

  return (
    <TenantPageShell>
      <TenantDetailHeader
        backHref="/objects"
        backLabel="Objecten"
        title={obj.name}
        description={
          <>
            {obj.customerName ? (
              <Link href={`/customers/${obj.customerId}`} className="font-medium text-primary hover:underline">
                {obj.customerName}
              </Link>
            ) : (
              "Geen klant gekoppeld"
            )}
            {obj.city ? ` · ${obj.city}` : ""}
            {obj.serviceType ? ` · ${obj.serviceType}` : ""}
          </>
        }
        badges={
          <>
            <span className="rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
              {obj.code}
            </span>
            <StatusBadge isActive={obj.isActive} />
          </>
        }
        summary={
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Totaal opdrachten", value: performance.totalAssignments },
              { label: "Actief", value: performance.activeAssignments },
              { label: "Open acties", value: performance.openActions },
              { label: "Vast personeel", value: performance.fixedPersonnel },
            ].map((item) => (
              <div key={item.label} className="rounded-md border border-border bg-background px-3 py-3">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="mt-1 text-lg font-semibold text-foreground">{item.value}</p>
              </div>
            ))}
          </div>
        }
      />

      <TenantDetailSectionNav
        items={OBJECT_TAB_KEYS.map((tab) => ({
          label: OBJECT_TAB_LABELS[tab],
          href: `/objects/${id}?tab=${tab}`,
          active: activeTab === tab,
          count: counts[tab as keyof typeof counts],
        }))}
      />

      <TenantDetailLayout
        aside={
          canWrite ? (
            <TenantDetailActionPanel
              title="Objectacties"
              description="Pas objectgegevens, klantkoppeling en servicecontext aan."
            >
              <ObjectDetailActions object={obj} sectors={sectors} customers={customers} />
            </TenantDetailActionPanel>
          ) : undefined
        }
      >
        {activeTab === "overzicht" && (
          <>
            <ObjectOverviewTab object={obj} performance={performance} history={history} />
            {(personnel.length > 0 || canWrite) && (
              <div className="mt-6">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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

        {activeTab === "details" && <ObjectDetailsTab object={obj} canWrite={canWrite} />}

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
      </TenantDetailLayout>
    </TenantPageShell>
  );
}
