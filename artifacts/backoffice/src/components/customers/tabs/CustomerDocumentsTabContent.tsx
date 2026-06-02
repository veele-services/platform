import { EntityDocumentsPanel } from "@/components/documents/EntityDocumentsPanel";
import type { DocumentRow } from "@/app/actions/documents";

interface Props {
  entityId:  string;
  documents: DocumentRow[];
  canWrite:  boolean;
}

export function CustomerDocumentsTabContent({ entityId, documents, canWrite }: Props) {
  return (
    <EntityDocumentsPanel
      entityType="customer"
      entityId={entityId}
      initialDocuments={documents}
      canWrite={canWrite}
    />
  );
}
