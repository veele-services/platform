import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { InventoryDetailView } from "@/components/inventory/InventoryDetailView";
import { getInventoryDetail, listInventoryManagementOptions } from "@/app/actions/inventory";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const canRead = await hasPermission("inventory", "view");
    if (!canRead) return { title: "Toegang geweigerd" };
    const { id } = await params;
    const item = await getInventoryDetail(id);
    return { title: item?.name ?? "Inventaris" };
  } catch {
    return { title: "Inventaris" };
  }
}

export default async function InventoryDetailPage({ params }: Props) {
  const [canRead, canUpdate, canManage] = await Promise.all([
    hasPermission("inventory", "view"),
    hasPermission("inventory", "update"),
    hasPermission("inventory", "manage"),
  ]);

  if (!canRead) return <ForbiddenPage resource="inventory" action="view" />;

  const { id } = await params;
  const [item, options] = await Promise.all([
    getInventoryDetail(id),
    listInventoryManagementOptions(),
  ]);

  if (!item) notFound();

  return <InventoryDetailView item={item} options={options} canWrite={canUpdate || canManage} />;
}
