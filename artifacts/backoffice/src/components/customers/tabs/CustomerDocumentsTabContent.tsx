import { EntityDocumentsPanel } from "@/components/documents/EntityDocumentsPanel";
import type { DocumentRow } from "@/app/actions/documents";

interface Props {
  entityId:  string;
  documents: DocumentRow[];
  canWrite:  boolean;
  canDelete: boolean;
}

export function CustomerDocumentsTabContent({ entityId, documents, canWrite, canDelete }: Props) {
  return (
    <EntityDocumentsPanel
      entityType="customer"
      entityId={entityId}
      initialDocuments={documents}
      canWrite={canWrite}
      canDelete={canDelete}
    />
  );
}
