import { NextResponse, type NextRequest } from "next/server";
import { externalOrLocalUrl, getCustomerPwaBranding } from "@/lib/pwa-branding";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const branding = await getCustomerPwaBranding();
  return NextResponse.redirect(externalOrLocalUrl(branding.faviconUrl, request.url, "/klant/favicon.svg"));
}

