import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";
import { HOST_KIND_HEADER, REQUEST_PATH_HEADER, resolveHostContext, TENANT_SLUG_HEADER } from "@/lib/tenancy/hostname";
import { resolveCustomWorkspaceHost } from "@/lib/tenancy/workspace-domain";
import { isAuthenticatedWorkerRequest } from "@/lib/operations/worker-request";
import { BROWSER_SESSION_HEADER, isProtectedPage, PROTECTED_PAGE_HEADER } from "@/lib/auth/session-signal";
import { deriveBrowserSessionKey } from "@/lib/auth/session-key";
import { createContentSecurityPolicy } from "@/lib/auth/content-security-policy";
import { signedInLoginDestination } from "@/lib/auth/workspace-destination";
import { publicMarketingPath, VEELE_WEBSITE_SLUG } from "@/lib/marketing/veele/routes";
import { renderWebsite, websiteSitemap } from "@/lib/marketing/veele/render";
import { FIELDGRID_MARKETING_INTERNAL, FIELDGRID_MARKETING_ASSETS, FIELDGRID_PUBLIC_CRM_PATHS, isInternalMarketingPath, isMarketingPrivatePath } from "@/lib/marketing/fieldgrid/routes";

export async function proxy(request: NextRequest) {
  if (isAuthenticatedWorkerRequest({ method: request.method, pathname: request.nextUrl.pathname, search: request.nextUrl.search, host: request.headers.get("host"), authorization: request.headers.get("authorization") }, { DEPLOY_TARGET: process.env.DEPLOY_TARGET, PORT: process.env.PORT, ADMIN_API_SECRET: process.env.ADMIN_API_SECRET })) {
    const workerHeaders = new Headers(request.headers);
    workerHeaders.delete(TENANT_SLUG_HEADER);
    workerHeaders.delete(BROWSER_SESSION_HEADER);
    workerHeaders.delete(REQUEST_PATH_HEADER);
    workerHeaders.set(HOST_KIND_HEADER, "platform");
    workerHeaders.set(PROTECTED_PAGE_HEADER, "0");
    return NextResponse.next({ request: { headers: workerHeaders } });
  }
  let hostContext = resolveHostContext(request.headers.get("host"), process.env.APP_URL!, process.env.DEPLOY_TARGET ?? "local");
  let customWorkspace = false;
  if (hostContext.kind === "invalid") {
    const custom = await resolveCustomWorkspaceHost(hostContext.hostname, process.env.DEPLOY_TARGET ?? "local");
    if (custom.unavailable) return new NextResponse("Tenantcontrole tijdelijk niet beschikbaar", { status: 503, headers: { "cache-control": "no-store" } });
    if (custom.slug && hostContext.hostname) {
      hostContext = { kind: "tenant", hostname: hostContext.hostname, slug: custom.slug };
      customWorkspace = true;
    }
  }
  if (hostContext.kind === "invalid") {
    return new NextResponse("Onbekende Fieldgrid-host", { status: 404, headers: { "cache-control": "no-store" } });
  }

  // Dispatch before tenant lookup, Auth calls and the private /platform guard.
  // Never trust browser-supplied routing/presentation headers.
  const fieldgridPath = request.nextUrl.pathname;
  if (isInternalMarketingPath(fieldgridPath)) return new NextResponse("Pagina niet gevonden", { status: 404, headers: { "cache-control": "no-store" } });
  if (hostContext.kind === "marketing") {
    const isPublicApi = FIELDGRID_PUBLIC_CRM_PATHS.some(path => path === fieldgridPath);
    const isAsset = fieldgridPath.startsWith(FIELDGRID_MARKETING_ASSETS) || fieldgridPath.startsWith("/_next/");
    if ((!isPublicApi && isMarketingPrivatePath(fieldgridPath)) || (!isPublicApi && !["GET", "HEAD"].includes(request.method))) {
      return new NextResponse("Pagina niet gevonden", { status: 404, headers: { "cache-control": "no-store" } });
    }
    const csp = createContentSecurityPolicy();
    const marketingHeaders = new Headers(request.headers);
    for (const name of [TENANT_SLUG_HEADER, BROWSER_SESSION_HEADER]) marketingHeaders.delete(name);
    marketingHeaders.set(HOST_KIND_HEADER, "marketing");
    marketingHeaders.set(REQUEST_PATH_HEADER, fieldgridPath);
    marketingHeaders.set(PROTECTED_PAGE_HEADER, "0");
    marketingHeaders.set("x-nonce", csp.nonce);
    marketingHeaders.set("content-security-policy", csp.value);
    const internalUrl = new URL(request.url);
    internalUrl.pathname = FIELDGRID_MARKETING_INTERNAL + (fieldgridPath === "/" ? "" : fieldgridPath);
    const result = isPublicApi || isAsset ? NextResponse.next({ request: { headers: marketingHeaders } }) : NextResponse.rewrite(internalUrl, { request: { headers: marketingHeaders } });
    result.headers.set("content-security-policy", csp.value);
    result.headers.set("cache-control", "no-store");
    if (process.env.DEPLOY_TARGET !== "production") result.headers.set("x-robots-tag", "noindex, nofollow");
    return result;
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
  requestHeaders.set(REQUEST_PATH_HEADER, request.nextUrl.pathname);
  const publicPath = new URL(request.url).pathname;
  if (customWorkspace && publicPath === "/" && ["GET", "HEAD"].includes(request.method)) {
    const url = new URL(process.env.APP_URL!); url.hostname = hostContext.hostname!; url.pathname = "/app";
    return NextResponse.redirect(url, 307);
  }
  const marketing = !customWorkspace && hostContext.kind === "tenant" && hostContext.slug === VEELE_WEBSITE_SLUG && ["GET", "HEAD"].includes(request.method) && publicMarketingPath(publicPath);
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
    // Verified file previews supply a closed same-origin policy after live authorization.
    // Do not overwrite it with the page policy's frame-ancestors 'none'.
    const personnelPreview = request.nextUrl.searchParams.get("preview") === "1" && /^\/api\/files\/personnel-document\/[0-9a-f-]+$/i.test(request.nextUrl.pathname);
    if (!personnelPreview && !/^\/api\/files\/(?:invoice|invoice-concept)\/[0-9a-f-]+$/i.test(request.nextUrl.pathname)) {
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
    // Next's internal URL may use the loopback listener. The authority has
    // already passed hostname/custom-domain validation above; forwarded host
    // and protocol headers must never choose the login destination.
    const url = new URL(process.env.APP_URL!);
    url.hostname = hostContext.hostname;
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", destination);
    return NextResponse.redirect(url);
  }
  if (request.nextUrl.pathname === "/login" && user) {
    const origin = new URL(process.env.APP_URL!);
    origin.hostname = hostContext.hostname;
    const url = new URL(signedInLoginDestination(request.nextUrl.searchParams.get("next")), origin);
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  // Dynamic route parameters can end in an image extension, including POSTs
  // dispatching a Server Action. Exempt actual static endpoints, not suffixes.
  matcher: ["/((?!_next/static/|_next/image$|favicon\\.svg$|manifest\\.webmanifest$|sw\\.js$).*)"],
};
