import { NextResponse, type NextRequest } from "next/server";
import { externalOrLocalUrl, getCustomerPwaBranding } from "@/lib/pwa-branding";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const branding = await getCustomerPwaBranding();
  if (!branding.splashUrl) {
    return NextResponse.json({ error: "No splashscreen configured" }, { status: 404 });
  }

  return NextResponse.redirect(externalOrLocalUrl(branding.splashUrl, request.url, "/klant/favicon.svg"));
}

