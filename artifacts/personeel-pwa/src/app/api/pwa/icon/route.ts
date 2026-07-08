import { NextResponse, type NextRequest } from "next/server";
import { externalOrLocalUrl, getPersonnelPwaBranding } from "@/lib/pwa-branding";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const branding = await getPersonnelPwaBranding();
  const fallback = request.nextUrl.searchParams.get("size") === "192"
    ? "/personeel/icons/icon-192.png"
    : "/personeel/icons/icon-512.png";

  return NextResponse.redirect(externalOrLocalUrl(branding.faviconUrl, request.url, fallback));
}

