import "server-only";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizedFileResponse, privateFileHeaders as headers } from "@/lib/files/private-download";
export async function downloadDossierDocument(documentId: string, sourceKind?: "customer" | "personnel") {
  try {
    const id = z.uuid().parse(documentId); const context = await getAuthContext(); if (!context.tenant) throw new Error();
    const db = await createClient();
    const tenantId = context.tenant.id;
    let audited = false;
    return await authorizedFileResponse(async () => {
      // Repeat registry AND source RLS after the bytes have been buffered.
      let query = db.from("dossier_documents").select("*").eq("tenant_id", tenantId);
      query = sourceKind ? query.eq("source_kind", sourceKind).eq("source_id", id) : query.eq("id", id);
      const { data: entry, error } = await query.single();
      if (error || !entry) throw new Error();
      const table = entry.source_kind === "personnel" ? "personnel_documents" : entry.source_kind === "object" ? "object_documents" : "customer_documents";
      const { data: doc, error: sourceError } = entry.source_kind === "personnel"
        ? await db.rpc("personnel_document_file", { target_tenant: tenantId, target_document: entry.source_id }).single()
        : await db.from(table).select("*").eq("tenant_id", tenantId).eq("id", entry.source_id).single();
      if (sourceError || !doc) throw new Error();
      const parentId = "personnel_id" in doc ? doc.personnel_id : "object_id" in doc ? doc.object_id : doc.customer_id;
      if (!parentId || parentId !== (entry.personnel_id || entry.object_id || entry.customer_id)) throw new Error();
      if (entry.personnel_id && !audited) {
        const { error: audit } = await createAdminClient().from("personnel_dossier_access").insert({ tenant_id: tenantId, personnel_id: entry.personnel_id, actor_user_id: context.user.id, action: "download" });
        if (audit) throw new Error();
        audited = true;
      }
      return { bucket: `${entry.source_kind}-documents`, path: doc.storage_path, scope: [tenantId, parentId], name: doc.file_name || "document", mime: doc.mime_type || "application/octet-stream", sha256: "sha256" in doc ? doc.sha256 : null };
    });
  } catch { return new Response("Document niet gevonden", { status: 404, headers }); }
}
