import { createServerClient } from "@supabase/ssr";
import { createFieldgridE2EAuthClient } from "@workspace/db/e2e-auth-adapter";
import { NextResponse, type NextRequest } from "next/server";
import {
  createSupabaseCookieOptions,
  withHostOnlyCookieOptions,
} from "@/lib/supabase/session-cookies";

const BASE = "/personeel";

function routePath(pathname: string): string {
  if (pathname === BASE) return "/";
  if (pathname.startsWith(`${BASE}/`)) {
    return pathname.slice(BASE.length) || "/";
  }
  return pathname;
}

function proxyAwareUrl(pathname: string, request: NextRequest): URL {
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    "localhost";
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  return new URL(pathname, `${proto}://${host}`);
}

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const { pathname } = request.nextUrl;
  const normalizedPathname = routePath(pathname);
  const isLoginPage  = normalizedPathname === "/login";
  const isPasswordResetPage = normalizedPathname === "/reset-wachtwoord";
  const isPwaAsset =
    normalizedPathname === "/manifest.json" ||
    normalizedPathname === "/manifest.webmanifest" ||
    normalizedPathname === "/sw.js" ||
    normalizedPathname === "/favicon.ico" ||
    normalizedPathname === "/icon-192.png" ||
    normalizedPathname === "/icon-512.png" ||
    normalizedPathname.startsWith("/api/pwa/") ||
    normalizedPathname.startsWith("/icons/");
  const isPublicPage =
    isPwaAsset ||
    isLoginPage ||
    isPasswordResetPage ||
    normalizedPathname === "/wachtwoord-vergeten" ||
    normalizedPathname.startsWith("/auth/confirm");

  if (!url || !key) {
    if (isPublicPage) return NextResponse.next();
    return NextResponse.redirect(proxyAwareUrl(`${BASE}/login`, request));
  }

  let supabaseResponse = NextResponse.next({ request });
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");

  const supabase = createServerClient(url, key, {
    cookieOptions: createSupabaseCookieOptions(host),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, responseHeaders) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, withHostOnlyCookieOptions(options)),
        );
        Object.entries(responseHeaders).forEach(([header, value]) =>
          supabaseResponse.headers.set(header, value),
        );
      },
    },
  });

  const authClient = process.env.FIELDGRID_E2E_AUTH_ENABLED === "true"
    ? createFieldgridE2EAuthClient(supabase, { cookies: request.cookies, headers: request.headers })
    : supabase;

  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user && !isPublicPage) {
    return NextResponse.redirect(proxyAwareUrl(`${BASE}/login`, request));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|manifest\\.json|manifest\\.webmanifest|sw\\.js|icons|healthz|icon-192\\.png|icon-512\\.png).*)",
  ],
};
