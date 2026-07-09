import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { DocumentAttachmentPanel } from "@/components/documents/DocumentAttachmentPanel";
import { MaterialDetailView } from "@/components/materials/MaterialDetailView";
import { listDocuments, type DocumentEntityType, type DocumentRow } from "@/app/actions/documents";
import { getMaterialDetail, listMaterialManagementOptions } from "@/app/actions/materials";

interface Props {
  params: Promise<{ id: string }>;
}

async function listContextDocuments(
  canReadDocuments: boolean,
  entityType: DocumentEntityType,
  entityId: string,
): Promise<DocumentRow[]> {
  if (!canReadDocuments) return [];
  try {
    return await listDocuments({ entityType, entityId });
  } catch {
    return [];
  }
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
  const [canRead, canWrite, canReadDocuments, canWriteDocuments] = await Promise.all([
    hasPermission("materials", "view"),
    hasPermission("materials", "update"),
    hasPermission("documents", "read"),
    hasPermission("documents", "write"),
  ]);

  if (!canRead) return <ForbiddenPage resource="materials" action="view" />;

  const { id } = await params;
  const [material, options, documents] = await Promise.all([
    getMaterialDetail(id),
    listMaterialManagementOptions(),
    listContextDocuments(canReadDocuments, "material", id),
  ]);

  if (!material) notFound();

  return (
    <>
      <MaterialDetailView material={material} options={options} canWrite={canWrite} />
      {canReadDocuments && (
        <div className="mx-auto w-full max-w-[1800px] px-8 pb-8">
          <DocumentAttachmentPanel
            entityType="material"
            entityId={material.id}
            initialDocuments={documents}
            canWrite={canWrite && canWriteDocuments}
            title="Materiaalafbeeldingen en documenten"
            uploadLabel="Bestand koppelen"
            emptyMessage="Nog geen afbeelding, veiligheidsblad of productdocument gekoppeld."
            namePlaceholder="bijv. Productfoto of veiligheidsblad"
          />
        </div>
      )}
    </>
  );
}
