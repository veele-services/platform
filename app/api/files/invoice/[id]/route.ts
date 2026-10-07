import { z } from "zod";
import { getAuthContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { authorizedFileResponse, bufferPrivateFile, samePrivateFile, privateFileHeaders, type PrivateFile } from "@/lib/files/private-download";
import { invoiceSnapshotInput } from "@/lib/pdf/invoice-snapshot";
import { invoicePdfHeaders } from "@/lib/pdf/invoice-headers";
import { invoiceLogo } from "@/lib/pdf/invoice-brand";
import { renderInvoicePdf } from "@/lib/pdf/invoice";

/** An invoice's saved, scanned PDF is read only through live tenant finance access. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = z.uuid().parse((await params).id), db = await createClient();
    const resolveSource = async () => {
      const { tenant } = await getAuthContext();
      if (!tenant?.enabledServices.includes("finance") || !tenant.roles.some(role => ["tenant_admin", "management", "finance"].includes(role))) throw new Error("Factuur niet beschikbaar");
      // This existing command re-evaluates the live session, membership and module.
      const access = await db.rpc("customer_file_access", { target_tenant: tenant.id, target_id: id, kind: "invoice" });
      if (access.error || !access.data) throw new Error("Factuur niet beschikbaar");
      const { data, error } = await db.from("invoices").select("id,tenant_id,invoice_number,pdf_storage_path,pdf_sha256,status,issued_on,due_on,branding_snapshot,customer_snapshot,lines_snapshot,subtotal_cents,vat_cents,total_cents").eq("tenant_id", tenant.id).eq("id", id).single();
      if (error || !data.invoice_number || !data.pdf_storage_path || !data.pdf_sha256 || data.status === "draft") throw new Error("Factuur niet beschikbaar");
      const location = access.data as { bucket?: string; path?: string };
      if (location.bucket !== "invoices" || location.path !== data.pdf_storage_path) throw new Error("Factuur niet beschikbaar");
      const file:PrivateFile = { bucket: "invoices", path: data.pdf_storage_path, scope: [tenant.id, data.id], name: `${data.invoice_number}.pdf`, mime: "application/pdf", sha256: data.pdf_sha256 };
      return { file, invoice:data };
    };
    const query=new URL(request.url).searchParams, disposition=query.get("preview")==="1"?"inline":"attachment";
    if(query.get("presentation")==="1") {
      const source=await resolveSource();
      // The original, verified invoice remains the evidence for this display copy.
      await bufferPrivateFile(source.file);
      const brand=source.invoice.branding_snapshot as Record<string,unknown>;
      const bytes=await renderInvoicePdf({...invoiceSnapshotInput(source.invoice),logo:await invoiceLogo(source.invoice.tenant_id,brand)});
      const current=await resolveSource();
      if(!samePrivateFile(source.file,current.file) || JSON.stringify(source.invoice)!==JSON.stringify(current.invoice))throw new Error("Factuur niet beschikbaar");
      return new Response(new Uint8Array(bytes),{headers:{...invoicePdfHeaders,"Content-Type":"application/pdf","Content-Length":String(bytes.length),"Content-Disposition":`${disposition}; filename*=UTF-8''${encodeURIComponent(source.file.name)}`}});
    }
    const response=await authorizedFileResponse(async()=>(await resolveSource()).file,disposition);
    for(const[key,value]of Object.entries(invoicePdfHeaders))response.headers.set(key,value);
    return response;
  } catch { return Response.json({ error: "Factuurbestand niet beschikbaar" }, { status: 404, headers: privateFileHeaders }); }
}
