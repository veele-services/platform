import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";
import { HOST_KIND_HEADER, resolveHostContext, TENANT_SLUG_HEADER } from "@/lib/tenancy/hostname";

const protectedPrefixes = ["/app", "/staff"];

export async function proxy(request: NextRequest) {
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
  requestHeaders.set(HOST_KIND_HEADER, hostContext.kind);
  if (hostContext.kind === "tenant") requestHeaders.set(TENANT_SLUG_HEADER, hostContext.slug);
  else requestHeaders.delete(TENANT_SLUG_HEADER);

  let response = NextResponse.next({ request: { headers: requestHeaders } });
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(items) {
          items.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: requestHeaders } });
          items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const protectedPath = protectedPrefixes.some((prefix) => request.nextUrl.pathname === prefix || request.nextUrl.pathname.startsWith(`${prefix}/`));
  if (protectedPath && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
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
  matcher: ["/((?!_next/static|_next/image|favicon.svg|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
