import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return NextResponse.json({ error: "Bijlage niet gevonden" }, { status: 404 });
  const supabase = await createClient();
  const { data: attachment } = await supabase.from("attachments").select("storage_bucket,storage_path").eq("id", id.data).is("deleted_at", null).maybeSingle();
  if (!attachment) return NextResponse.json({ error: "Bijlage niet gevonden" }, { status: 404 });
  const { data, error } = await supabase.storage.from(attachment.storage_bucket).createSignedUrl(attachment.storage_path, 60);
  if (error || !data?.signedUrl) return NextResponse.json({ error: "Bijlage niet beschikbaar" }, { status: 404 });
  return NextResponse.redirect(data.signedUrl, { headers: { "cache-control": "private, no-store" } });
}
