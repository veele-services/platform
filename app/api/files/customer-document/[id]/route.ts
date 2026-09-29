import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext, hasAnyRole } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const missing = () => new NextResponse("Document niet gevonden", { status: 404, headers: { "Cache-Control": "private, no-store" } });
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return missing();
  const context = await getAuthContext();
  if (!context.tenant || !hasAnyRole(context, ["tenant_admin", "management", "planner", "finance"])
    || !context.tenant.enabledServices.includes("planning")) return missing();
  const supabase = await createClient();
  const { data: document } = await supabase.from("customer_documents").select("storage_path,file_name")
    .eq("tenant_id", context.tenant.id).eq("id", id.data).maybeSingle();
  if (!document) return missing();
  const { data } = await supabase.storage.from("customer-documents")
    .createSignedUrl(document.storage_path, 60, { download: document.file_name });
  if (!data?.signedUrl) return missing();
  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}
