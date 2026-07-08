import { NextResponse, type NextRequest } from "next/server";
import { externalOrLocalUrl, getCustomerPwaBranding } from "@/lib/pwa-branding";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const branding = await getCustomerPwaBranding();
  const fallback = branding.faviconUrl ?? "/klant/favicon.svg";
  return NextResponse.redirect(externalOrLocalUrl(branding.splashUrl, request.url, fallback));
}

