import { NextResponse } from "next/server";
import { readScannedFile } from "@/lib/files/scanned-storage";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  try {
  const parsed = z.string().uuid().safeParse((await params).tenantId);
  if (!parsed.success) return new NextResponse("Niet gevonden", { status: 404 });
  const tenantId = parsed.data;
  const admin = createAdminClient();
  const { data: tenant } = await admin.from("tenants").select("id").eq("id", tenantId).eq("status", "active").maybeSingle();
  if (!tenant) return new NextResponse("Niet gevonden", { status: 404 });
  const asset = new URL(request.url).searchParams.get("asset");
  if (asset !== null && !/^[a-f0-9]{64}\.(png|jpg|webp)$/.test(asset)) return new NextResponse("Niet gevonden", { status: 404 });
  const { data: branding } = asset ? { data: null } : await admin.from("tenant_branding").select("logo_path").eq("tenant_id", tenantId).maybeSingle();
  const path = asset ? `${tenantId}/notification-assets/${asset}` : branding?.logo_path;
  if (!path || !path.startsWith(`${tenantId}/`)) return new NextResponse("Niet gevonden", { status: 404 });
  const logo = await readScannedFile("branding", path, asset?.split(".")[0], admin);
  if (!logo || logo.bytes.length > 2 * 1024 * 1024 || !["image/png","image/jpeg","image/webp"].includes(logo.mime)) return new NextResponse("Niet gevonden", { status: 404 });
  const stillActive = await admin.from("tenants").select("id").eq("id", tenantId).eq("status", "active").maybeSingle();
  if (stillActive.error || !stillActive.data) return new NextResponse("Niet gevonden", { status: 404 });
  if (!asset) {
    const current = await admin.from("tenant_branding").select("logo_path").eq("tenant_id", tenantId).maybeSingle();
    if (current.error || current.data?.logo_path !== path) return new NextResponse("Niet gevonden", { status: 404 });
  }
  return new NextResponse(new Uint8Array(logo.bytes), {
    headers: {
      "content-type": logo.mime,
      "cache-control": asset ? "public, max-age=31536000, immutable" : "public, max-age=3600, stale-while-revalidate=86400",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'",
    },
  });
  } catch { return new NextResponse("Niet gevonden", { status: 404, headers: { "cache-control": "no-store" } }); }
}
