import { z } from "zod";
import { getAuthContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { authorizedFileResponse, privateFileHeaders, type PrivateFile } from "@/lib/files/private-download";

/** An invoice's saved, scanned PDF is read only through live tenant finance access. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = z.uuid().parse((await params).id), db = await createClient();
    const resolve = async (): Promise<PrivateFile> => {
      const { tenant } = await getAuthContext();
      if (!tenant?.enabledServices.includes("finance") || !tenant.roles.some(role => ["tenant_admin", "management", "finance"].includes(role))) throw new Error("Factuur niet beschikbaar");
      // This existing command re-evaluates the live session, membership and module.
      const access = await db.rpc("customer_file_access", { target_tenant: tenant.id, target_id: id, kind: "invoice" });
      if (access.error || !access.data) throw new Error("Factuur niet beschikbaar");
      const { data, error } = await db.from("invoices").select("id,tenant_id,invoice_number,pdf_storage_path,pdf_sha256,status").eq("tenant_id", tenant.id).eq("id", id).single();
      if (error || !data.invoice_number || !data.pdf_storage_path || !data.pdf_sha256 || data.status === "draft") throw new Error("Factuur niet beschikbaar");
      const location = access.data as { bucket?: string; path?: string };
      if (location.bucket !== "invoices" || location.path !== data.pdf_storage_path) throw new Error("Factuur niet beschikbaar");
      return { bucket: "invoices", path: data.pdf_storage_path, scope: [tenant.id, data.id], name: `${data.invoice_number}.pdf`, mime: "application/pdf", sha256: data.pdf_sha256 };
    };
    return await authorizedFileResponse(resolve, new URL(request.url).searchParams.get("preview") === "1" ? "inline" : "attachment");
  } catch { return Response.json({ error: "Factuurbestand niet beschikbaar" }, { status: 404, headers: privateFileHeaders }); }
}
