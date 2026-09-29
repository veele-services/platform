import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return NextResponse.json({ error: "Document niet gevonden" }, { status: 404 });
  const supabase = await createClient();
  const { data: document } = await supabase.from("personnel_documents").select("storage_path").eq("id", id.data).maybeSingle();
  if (!document) return NextResponse.json({ error: "Document niet gevonden" }, { status: 404 });
  const { data, error } = await supabase.storage.from("personnel-documents").createSignedUrl(document.storage_path, 60);
  if (error || !data?.signedUrl) return NextResponse.json({ error: "Document niet beschikbaar" }, { status: 404 });
  return NextResponse.redirect(data.signedUrl, { headers: { "cache-control": "private, no-store" } });
}
