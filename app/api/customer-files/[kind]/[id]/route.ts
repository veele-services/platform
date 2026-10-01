import { z } from "zod";
import { getObjectActor } from "@/lib/objects/auth";
import { authorizedFileResponse, privateFileHeaders as headers, type PrivateFile } from "@/lib/files/private-download";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  try {
    const { kind, id } = await params;
    z.enum(["document", "invoice"]).parse(kind);
    z.uuid().parse(id);
    const { db, tenant } = await getObjectActor();
    const disposition =
      new URL(request.url).searchParams.get("preview") === "1"
        ? "inline"
        : "attachment";
    return await authorizedFileResponse(async () => {
      const r = await db.rpc("customer_file_access", { target_tenant: tenant.id, target_id: id, kind });
      if (r.error || !r.data) throw new Error();
      const file = r.data as PrivateFile;
      if (file.scope?.[0] !== tenant.id || file.bucket !== (kind === "invoice" ? "invoices" : "customer-documents") || (kind === "invoice" && (file.scope[1] !== id || !file.sha256))) throw new Error();
      return file;
    }, disposition);
  } catch {
    return new Response("Document niet gevonden", { status: 404, headers });
  }
}
