import { NextResponse, type NextRequest } from "next/server";
import { externalOrLocalUrl, getPersonnelPwaBranding } from "@/lib/pwa-branding";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const branding = await getPersonnelPwaBranding();
  const fallback = branding.faviconUrl ?? "/personeel/icons/icon-512.png";
  return NextResponse.redirect(externalOrLocalUrl(branding.splashUrl, request.url, fallback));
}

