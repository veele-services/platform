import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { otpNext } from "@/lib/auth/login-destination";

export async function GET(request: NextRequest) {
  // Old link credentials and GETs never create a login session. In particular
  // email scanners cannot authenticate by following a URL.
  const target = new URL("/login", request.url);
  target.searchParams.set("error", "otp_required");
  target.searchParams.set("next", otpNext(request.nextUrl.searchParams.get("next")));
  const response = NextResponse.redirect(target);
  response.headers.set("cache-control", "no-store");
  response.headers.set("referrer-policy", "no-referrer");
  return response;
}
