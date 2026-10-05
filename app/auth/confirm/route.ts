import type { NextRequest } from "next/server";
import { otpNext } from "@/lib/auth/login-destination";

export async function GET(request: NextRequest) {
  // Old link credentials and GETs never create a login session. In particular
  // email scanners cannot authenticate by following a URL.
  const query = new URLSearchParams({
    error: "otp_required",
    next: otpNext(request.nextUrl.searchParams.get("next")),
  });
  // Standalone Next can expose its internal localhost origin in request.url.
  // A relative Location preserves the browser's platform or tenant origin
  // without trusting forwarded headers. The proxy already validates the host.
  return new Response(null, {
    status: 307,
    headers: {
      location: `/login?${query}`,
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    },
  });
}
