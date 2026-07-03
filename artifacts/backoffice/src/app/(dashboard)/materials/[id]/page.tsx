import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { MaterialDetailView } from "@/components/materials/MaterialDetailView";
import { getMaterialDetail, listMaterialManagementOptions } from "@/app/actions/materials";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const canRead = await hasPermission("materials", "view");
    if (!canRead) return { title: "Toegang geweigerd" };
    const { id } = await params;
    const material = await getMaterialDetail(id);
    return { title: material?.name ?? "Materiaal" };
  } catch {
    return { title: "Materiaal" };
  }
}

export default async function MaterialDetailPage({ params }: Props) {
  const [canRead, canWrite] = await Promise.all([
    hasPermission("materials", "view"),
    hasPermission("materials", "update"),
  ]);

  if (!canRead) return <ForbiddenPage resource="materials" action="view" />;

  const { id } = await params;
  const [material, options] = await Promise.all([
    getMaterialDetail(id),
    listMaterialManagementOptions(),
  ]);

  if (!material) notFound();

  return <MaterialDetailView material={material} options={options} canWrite={canWrite} />;
}
