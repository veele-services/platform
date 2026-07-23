import { filterWebsiteCookieHeader } from "@workspace/website-core/shared-host-routing";
import { resolveWebsiteDeliveryByHost } from "@workspace/db/website-public-runtime";
import { type NextRequest, NextResponse } from "next/server";
import { managedWebsiteRedirectResponse } from "./lib/public-responses";
import { buildCustomWebsiteRewrite } from "./lib/custom-proxy";
import { neutralErrorResponse } from "./lib/http";
import { requestPathOwner } from "./lib/request";

/** Defense in depth: the edge owns path-scoped application cookies, and this
 * runtime additionally removes legacy application cookies before rendering. */
export async function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  if (request.nextUrl.pathname === "/healthz") {
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
  }
  let managedDelivery = false;
  const ownsWebsitePath =
    requestPathOwner(host, request.nextUrl.pathname) === "website";
  if (ownsWebsitePath) {
    const delivery = await resolveWebsiteDeliveryByHost(host);
    if (delivery.status === "not_found") return neutralErrorResponse(404);
    if (delivery.status === "unavailable") return neutralErrorResponse(503);
    if (delivery.deliveryMode === "custom_nextjs") {
      const rewrite = buildCustomWebsiteRewrite(
        request.nextUrl,
        request.headers,
        delivery.website,
      );
      const response = NextResponse.rewrite(rewrite.destination, {
        request: { headers: rewrite.requestHeaders },
      });
      response.headers.set("Vary", "Host");
      response.headers.set("X-Content-Type-Options", "nosniff");
      response.headers.set("X-Fieldgrid-Website-Delivery", "custom_nextjs");
      return response;
    }
    managedDelivery = true;
    const redirect = await managedWebsiteRedirectResponse(request);
    if (redirect) {
      redirect.headers.set("X-Fieldgrid-Website-Delivery", "managed_cms");
      return redirect;
    }
  }

  const requestHeaders = new Headers(request.headers);
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const contentSecurityPolicy = [
    "default-src 'none'",
    "base-uri 'none'",
    "connect-src 'self' https://plausible.io",
    "font-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data: https:",
    `script-src 'nonce-${nonce}' 'strict-dynamic' https://plausible.io`,
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
  if (managedDelivery) {
    response.headers.set("X-Fieldgrid-Website-Delivery", "managed_cms");
  }
  return response;
}

export const config = {
  matcher: ["/:path*"],
  runtime: "nodejs",
};
