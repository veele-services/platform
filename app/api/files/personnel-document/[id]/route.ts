import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/context";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return NextResponse.json({ error: "Document niet gevonden" }, { status: 404 });
  const supabase = await createClient();
  const context=await getAuthContext();
  if(!context.tenant)return NextResponse.json({error:"Document niet gevonden"},{status:404});
  const { data: document } = await supabase.from("personnel_documents").select("storage_path,tenant_id,personnel_id,dossier_managed").eq("tenant_id",context.tenant.id).eq("id", id.data).maybeSingle();
  if (!document) return NextResponse.json({ error: "Document niet gevonden" }, { status: 404 });
  if(document.dossier_managed){
    const {error}=await supabase.from("personnel_dossier_access").insert({tenant_id:document.tenant_id,personnel_id:document.personnel_id,actor_user_id:context.user.id,action:"download"});
    if(error)return NextResponse.json({error:"Document niet beschikbaar"},{status:503});
  }
  const { data, error } = await supabase.storage.from("personnel-documents").createSignedUrl(document.storage_path, 60);
  if (error || !data?.signedUrl) return NextResponse.json({ error: "Document niet beschikbaar" }, { status: 404 });
  return NextResponse.redirect(data.signedUrl, { headers: { "cache-control": "private, no-store" } });
}
