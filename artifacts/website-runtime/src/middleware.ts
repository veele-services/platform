import { filterWebsiteCookieHeader } from "@workspace/website-core/shared-host-routing";
import { type NextRequest, NextResponse } from "next/server";
import { managedWebsiteRedirectResponse } from "./lib/public-responses";
import { requestPathOwner } from "./lib/request";

/** Defense in depth: the edge owns path-scoped application cookies, and this
 * runtime additionally removes legacy application cookies before rendering. */
export async function middleware(request: NextRequest) {
  if (
    requestPathOwner(
      request.headers.get("host") ?? "",
      request.nextUrl.pathname,
    ) === "website"
  ) {
    const redirect = await managedWebsiteRedirectResponse(request);
    if (redirect) return redirect;
  }

  const requestHeaders = new Headers(request.headers);
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const contentSecurityPolicy = [
    "default-src 'none'",
    "base-uri 'none'",
    "connect-src 'self'",
    "font-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data: https:",
    `script-src 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
  ].join("; ");
  const filteredCookies = filterWebsiteCookieHeader(
    requestHeaders.get("cookie"),
  );
  if (filteredCookies) requestHeaders.set("cookie", filteredCookies);
  else requestHeaders.delete("cookie");
  requestHeaders.set("content-security-policy", contentSecurityPolicy);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Vary", "Host");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
  runtime: "nodejs",
};
