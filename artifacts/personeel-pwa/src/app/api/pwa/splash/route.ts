import { NextResponse, type NextRequest } from "next/server";
import { externalOrLocalUrl, getPersonnelPwaBranding } from "@/lib/pwa-branding";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const branding = await getPersonnelPwaBranding();
  if (!branding.splashUrl) {
    return NextResponse.json({ error: "No splashscreen configured" }, { status: 404 });
  }

  return NextResponse.redirect(externalOrLocalUrl(branding.splashUrl, request.url, "/personeel/icons/icon-512.png"));
}

