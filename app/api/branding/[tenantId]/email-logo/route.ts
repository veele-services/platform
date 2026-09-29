import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(_: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  const parsed = z.string().uuid().safeParse((await params).tenantId);
  if (!parsed.success) return new NextResponse("Niet gevonden", { status: 404 });
  const tenantId = parsed.data;
  const admin = createAdminClient();
  const { data: tenant } = await admin.from("tenants").select("id").eq("id", tenantId).eq("status", "active").maybeSingle();
  if (!tenant) return new NextResponse("Niet gevonden", { status: 404 });
  const { data: branding } = await admin.from("tenant_branding").select("logo_path").eq("tenant_id", tenantId).maybeSingle();
  if (!branding?.logo_path || !branding.logo_path.startsWith(`${tenantId}/`)) return new NextResponse("Niet gevonden", { status: 404 });
  const { data: logo, error } = await admin.storage.from("branding").download(branding.logo_path);
  if (error) return new NextResponse("Niet gevonden", { status: 404 });
  return new NextResponse(await logo.arrayBuffer(), {
    headers: {
      "content-type": logo.type || "application/octet-stream",
      "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'",
    },
  });
}
