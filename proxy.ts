import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";
import { HOST_KIND_HEADER, resolveHostContext, TENANT_SLUG_HEADER } from "@/lib/tenancy/hostname";
import { isAuthenticatedWorkerRequest } from "@/lib/operations/worker-request";
import { isProtectedPage, PROTECTED_PAGE_HEADER } from "@/lib/auth/session-signal";
import { createContentSecurityPolicy } from "@/lib/auth/content-security-policy";

export async function proxy(request: NextRequest) {
  if (isAuthenticatedWorkerRequest({ method: request.method, pathname: request.nextUrl.pathname, search: request.nextUrl.search, host: request.headers.get("host"), authorization: request.headers.get("authorization") }, { DEPLOY_TARGET: process.env.DEPLOY_TARGET, PORT: process.env.PORT, ADMIN_API_SECRET: process.env.ADMIN_API_SECRET })) {
    const workerHeaders = new Headers(request.headers);
    workerHeaders.delete(TENANT_SLUG_HEADER);
    workerHeaders.set(HOST_KIND_HEADER, "platform");
    workerHeaders.set(PROTECTED_PAGE_HEADER, "0");
    return NextResponse.next({ request: { headers: workerHeaders } });
  }
  const hostContext = resolveHostContext(request.headers.get("host"), process.env.APP_URL!, process.env.DEPLOY_TARGET ?? "local");
  if (hostContext.kind === "invalid") {
    return new NextResponse("Onbekende Fieldgrid-host", { status: 404, headers: { "cache-control": "no-store" } });
  }

  if (hostContext.kind === "tenant" && process.env.DEPLOY_TARGET !== "local") {
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
  const contentSecurityPolicy = createContentSecurityPolicy();
  // Always overwrite incoming presentation headers, including public routes.
  requestHeaders.set("x-nonce", contentSecurityPolicy.nonce);
  requestHeaders.set("content-security-policy", contentSecurityPolicy.value);
  requestHeaders.set(PROTECTED_PAGE_HEADER, isProtectedPage(request.nextUrl.pathname) ? "1" : "0");
  requestHeaders.set(HOST_KIND_HEADER, hostContext.kind);
  if (hostContext.kind === "tenant") requestHeaders.set(TENANT_SLUG_HEADER, hostContext.slug);
  else requestHeaders.delete(TENANT_SLUG_HEADER);

  const nextResponse = () => {
    const result = NextResponse.next({ request: { headers: requestHeaders } });
    result.headers.set("content-security-policy", contentSecurityPolicy.value);
    return result;
  };
  let response = nextResponse();
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

  const { data: { user } } = await supabase.auth.getUser();
  const protectedPath = isProtectedPage(request.nextUrl.pathname);
  if (protectedPath && !user) {
    const destination = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", destination);
    return NextResponse.redirect(url);
  }
  if (request.nextUrl.pathname === "/login" && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  // Dynamic route parameters can end in an image extension, including POSTs
  // dispatching a Server Action. Exempt actual static endpoints, not suffixes.
  matcher: ["/((?!_next/static/|_next/image$|favicon\\.svg$|manifest\\.webmanifest$|sw\\.js$).*)"],
};
