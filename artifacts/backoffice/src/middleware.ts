import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js middleware for session handling.
 *
 * The middleware only handles authentication and Supabase session refresh.
 * RBAC is enforced by Server Components and Server Actions using live database
 * permissions. Keeping authorization out of middleware prevents stale cached
 * permission cookies from silently redirecting users back to the dashboard
 * after role changes.
 *
 * Never make database calls here: middleware runs in the Edge Runtime and
 * cannot use the Node.js PostgreSQL driver.
 */

function proxyAwareUrl(pathname: string, request: NextRequest): URL {
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    "localhost";
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  return new URL(pathname, `${proto}://${host}`);
}

function nextPathFromRequest(request: NextRequest): string {
  return `${request.nextUrl.pathname}${request.nextUrl.search}`;
}

function loginUrlWithNext(request: NextRequest): URL {
  const url = proxyAwareUrl("/login", request);
  url.searchParams.set("next", nextPathFromRequest(request));
  return url;
}

function resetPasswordUrlWithNext(request: NextRequest): URL {
  const url = proxyAwareUrl("/reset-wachtwoord", request);
  url.searchParams.set("force", "1");
  url.searchParams.set("next", nextPathFromRequest(request));
  return url;
}

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const { pathname } = request.nextUrl;
  const isLoginPage  = pathname === "/login";
  const isPasswordResetPage = pathname === "/reset-wachtwoord";
  const isPublicPage =
    isLoginPage ||
    pathname === "/wachtwoord-vergeten" ||
    pathname.startsWith("/auth/confirm");

  if (!url || !key) {
    if (isPublicPage) return NextResponse.next();
    return NextResponse.redirect(loginUrlWithNext(request));
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const mustChangePassword = user?.app_metadata?.force_password_change === true;

  if (user && mustChangePassword && !isPasswordResetPage && !pathname.startsWith("/auth/confirm")) {
    return NextResponse.redirect(resetPasswordUrlWithNext(request));
  }

  if (user && isLoginPage) {
    const next = request.nextUrl.searchParams.get("next");
    const nextPath = next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/";
    return NextResponse.redirect(proxyAwareUrl(nextPath, request));
  }

  if (!user && !isPublicPage) {
    return NextResponse.redirect(loginUrlWithNext(request));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
