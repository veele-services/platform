import "server-only";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" };
export async function downloadDossierDocument(documentId: string, sourceKind?: "customer" | "personnel") {
  try {
    const id = z.uuid().parse(documentId); const context = await getAuthContext(); if (!context.tenant) throw new Error();
    const db = await createClient();
    // Registry RLS checks the current session and the original document's policy.
    let query = db.from("dossier_documents").select("*").eq("tenant_id", context.tenant.id);
    query = sourceKind ? query.eq("source_kind", sourceKind).eq("source_id", id) : query.eq("id", id);
    const { data: entry, error } = await query.single();
    if (error || !entry) throw new Error();
    const table = entry.source_kind === "personnel" ? "personnel_documents" : entry.source_kind === "object" ? "object_documents" : "customer_documents";
    const { data: doc } = await db.from(table).select("storage_path,file_name,mime_type").eq("tenant_id", context.tenant.id).eq("id", entry.source_id).single();
    if (!doc) throw new Error();
    if (entry.personnel_id) {
      const { error: audit } = await createAdminClient().from("personnel_dossier_access").insert({ tenant_id: context.tenant.id, personnel_id: entry.personnel_id, actor_user_id: context.user.id, action: "download" });
      if (audit) throw new Error();
    }
    const bucket = entry.source_kind === "personnel" ? "personnel-documents" : entry.source_kind === "object" ? "object-documents" : "customer-documents";
    const { data: file, error: downloadError } = await createAdminClient().storage.from(bucket).download(doc.storage_path);
    if (downloadError || !file) throw new Error();
    return new Response(file, { headers: { ...headers, "Content-Type": doc.mime_type || "application/octet-stream", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(doc.file_name || "document")}` } });
  } catch { return new Response("Document niet gevonden", { status: 404, headers }); }
}
