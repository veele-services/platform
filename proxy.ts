import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";
import { HOST_KIND_HEADER, resolveHostContext, TENANT_SLUG_HEADER } from "@/lib/tenancy/hostname";
import { isAuthenticatedWorkerRequest } from "@/lib/operations/worker-request";
import { BROWSER_SESSION_HEADER, isProtectedPage, PROTECTED_PAGE_HEADER } from "@/lib/auth/session-signal";
import { deriveBrowserSessionKey } from "@/lib/auth/session-key";
import { createContentSecurityPolicy } from "@/lib/auth/content-security-policy";
import { signedInLoginDestination } from "@/lib/auth/workspace-destination";
import { publicMarketingPath, VEELE_WEBSITE_SLUG } from "@/lib/marketing/veele/routes";
import { renderWebsite, websiteSitemap } from "@/lib/marketing/veele/render";

export async function proxy(request: NextRequest) {
  if (isAuthenticatedWorkerRequest({ method: request.method, pathname: request.nextUrl.pathname, search: request.nextUrl.search, host: request.headers.get("host"), authorization: request.headers.get("authorization") }, { DEPLOY_TARGET: process.env.DEPLOY_TARGET, PORT: process.env.PORT, ADMIN_API_SECRET: process.env.ADMIN_API_SECRET })) {
    const workerHeaders = new Headers(request.headers);
    workerHeaders.delete(TENANT_SLUG_HEADER);
    workerHeaders.delete(BROWSER_SESSION_HEADER);
    workerHeaders.set(HOST_KIND_HEADER, "platform");
    workerHeaders.set(PROTECTED_PAGE_HEADER, "0");
    return NextResponse.next({ request: { headers: workerHeaders } });
  }
  const hostContext = resolveHostContext(request.headers.get("host"), process.env.APP_URL!, process.env.DEPLOY_TARGET ?? "local");
  if (hostContext.kind === "invalid") {
    return new NextResponse("Onbekende Fieldgrid-host", { status: 404, headers: { "cache-control": "no-store" } });
  }

  if (hostContext.kind === "tenant" && (process.env.DEPLOY_TARGET !== "local" || hostContext.slug === VEELE_WEBSITE_SLUG)) {
    const result = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/tenants?select=id&slug=eq.${encodeURIComponent(hostContext.slug)}&status=eq.active&limit=1`,
      {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
          authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        cache: "no-store",
      },
    );
    if (!result.ok) {
      return new NextResponse("Tenantcontrole tijdelijk niet beschikbaar", { status: 503, headers: { "cache-control": "no-store" } });
    }
    const tenants = await result.json() as Array<{ id: string }>;
    if (tenants.length !== 1) {
      return new NextResponse("Tenant niet gevonden", { status: 404, headers: { "cache-control": "no-store" } });
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(BROWSER_SESSION_HEADER);
  const publicPath = new URL(request.url).pathname;
  const marketing = hostContext.kind === "tenant" && hostContext.slug === VEELE_WEBSITE_SLUG && ["GET", "HEAD"].includes(request.method) && publicMarketingPath(publicPath);
  const path = publicPath;
  if (marketing && path !== "/" && !path.endsWith("/") && !/\.[^/]+$/.test(path)) {
    const url = new URL(process.env.APP_URL!); url.hostname = hostContext.hostname; url.pathname = path + "/"; url.search = request.nextUrl.search;
    return NextResponse.redirect(url, 308);
  }
  if (!marketing && path.length > 1 && path.endsWith("/")) {
    const url = new URL(process.env.APP_URL!); url.hostname = hostContext.hostname; url.pathname = path.replace(/\/+$/, ""); url.search = request.nextUrl.search;
    return NextResponse.redirect(url, 308);
  }
  const contentSecurityPolicy = createContentSecurityPolicy(undefined, undefined, undefined, marketing);
  // Always overwrite incoming presentation headers, including public routes.
  requestHeaders.set("x-nonce", contentSecurityPolicy.nonce);
  requestHeaders.set("content-security-policy", contentSecurityPolicy.value);
  requestHeaders.set(PROTECTED_PAGE_HEADER, isProtectedPage(request.nextUrl.pathname) ? "1" : "0");
  requestHeaders.set(HOST_KIND_HEADER, hostContext.kind);
  if (hostContext.kind === "tenant") requestHeaders.set(TENANT_SLUG_HEADER, hostContext.slug);
  else requestHeaders.delete(TENANT_SLUG_HEADER);

  const nextResponse = () => {
    const result = NextResponse.next({ request: { headers: requestHeaders } });
    // Invoice route handlers supply a closed PDF policy after live authorization.
    // Do not overwrite it with the page policy's frame-ancestors 'none'.
    if (!/^\/api\/files\/(?:invoice|invoice-concept)\/[0-9a-f-]+$/i.test(request.nextUrl.pathname)) {
      result.headers.set("content-security-policy", contentSecurityPolicy.value);
    }
    return result;
  };
  let response = nextResponse();
  if (marketing && hostContext.kind === "tenant") {
    const originUrl = new URL(process.env.APP_URL!); originUrl.hostname = hostContext.hostname;
    const origin = originUrl.origin, indexable = process.env.DEPLOY_TARGET === "production";
    const headers = { "cache-control": "no-store", "content-security-policy": contentSecurityPolicy.value, ...(!indexable ? { "x-robots-tag": "noindex, nofollow" } : {}) };
    if (publicPath === "/robots.txt") return new NextResponse(`User-agent: *\n${indexable ? "Allow: /" : "Disallow: /"}\nSitemap: ${origin}/sitemap.xml\n`, { headers: { ...headers, "content-type": "text/plain; charset=utf-8" } });
    if (publicPath === "/sitemap.xml") return new NextResponse(websiteSitemap(origin), { headers: { ...headers, "content-type": "application/xml; charset=utf-8" } });
    const rendered = renderWebsite(publicPath, origin, contentSecurityPolicy.nonce, indexable);
    return new NextResponse(request.method === "HEAD" ? null : rendered.html, { status: rendered.status, headers: { ...headers, "content-type": "text/html; charset=utf-8" } });
  }
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(items) {
          items.forEach(({ name, value }) => request.cookies.set(name, value));
          response = nextResponse();
          items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  const protectedPath = isProtectedPage(request.nextUrl.pathname);
  if (protectedPath || request.nextUrl.pathname === "/api/auth/session") {
    const claims = user && !userError ? await supabase.auth.getClaims() : null;
    const localTenant = (process.env.DEPLOY_TARGET ?? "local") === "local"
      ? request.cookies.get("fieldgrid_tenant_id")?.value ?? "" : "";
    const key = claims && !claims.error ? deriveBrowserSessionKey(
      user?.id, claims.data?.claims,
      hostContext.kind === "tenant" ? hostContext.slug : "platform", localTenant,
    ) : null;
    requestHeaders.set(BROWSER_SESSION_HEADER, key ?? "");
    // Preserve refreshed session cookies when rebuilding the forwarded headers.
    const verifiedResponse = nextResponse();
    response.cookies.getAll().forEach(cookie => verifiedResponse.cookies.set(cookie));
    response = verifiedResponse;
  }
  if (protectedPath && !user) {
    const destination = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", destination);
    return NextResponse.redirect(url);
  }
  if (request.nextUrl.pathname === "/login" && user) {
    const url = new URL(signedInLoginDestination(request.nextUrl.searchParams.get("next")),request.nextUrl.origin);
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  // Dynamic route parameters can end in an image extension, including POSTs
  // dispatching a Server Action. Exempt actual static endpoints, not suffixes.
  matcher: ["/((?!_next/static/|_next/image$|favicon\\.svg$|manifest\\.webmanifest$|sw\\.js$).*)"],
};
