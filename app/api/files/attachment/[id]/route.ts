import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { authorizedFileResponse, privateFileHeaders } from "@/lib/files/private-download";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = z.uuid().parse((await params).id), db = await createClient();
    return await authorizedFileResponse(async () => {
      const { data: a, error } = await db.from("attachments").select("tenant_id,work_order_id,report_entry_id,storage_bucket,storage_path,file_name,mime_type,sha256").eq("id", id).is("deleted_at", null).single();
      if (error || !a || a.storage_bucket !== "reports") throw new Error();
      // Backoffice communication attachments have their own established folder.
      const folder = a.storage_path.startsWith(`${a.tenant_id}/${a.work_order_id}/communication/`) ? "communication" : a.report_entry_id;
      if (!folder) throw new Error();
      return { bucket: a.storage_bucket, path: a.storage_path, scope: [a.tenant_id, a.work_order_id, folder], name: a.file_name, mime: a.mime_type, sha256: a.sha256 };
    }, "inline");
  } catch { return new Response("Bijlage niet gevonden", { status: 404, headers: privateFileHeaders }); }
}
