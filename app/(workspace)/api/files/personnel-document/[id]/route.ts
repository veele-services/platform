import { downloadDossierDocument } from "@/lib/dossiers/download";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return downloadDossierDocument((await params).id, "personnel",new URL(request.url).searchParams.get('preview')==='1');
}
