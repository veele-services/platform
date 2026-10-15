import { downloadDossierDocument } from "@/lib/dossiers/download";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return downloadDossierDocument((await params).id);
}
