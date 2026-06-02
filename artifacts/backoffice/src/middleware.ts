import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { verifyPermissions, COOKIE_NAME } from "@/lib/auth/session-permissions";
import { getRoutePermission } from "@/lib/auth/route-permissions";

/**
 * Next.js Middleware — runs on every matched request (Edge Runtime).
 *
 * Layer 1 — Authentication:
 *   Refreshes the Supabase session cookie on every request.
 *   Unauthenticated users are redirected to /login.
 *   Authenticated users are redirected away from /login → /.
 *
 * Layer 2 — RBAC route guard:
 *   Reads the signed `veele_perms` cookie written at sign-in.
 *   When present and verified, checks whether the user holds the required
 *   permission for the requested path and redirects to / if not.
 *
 *   If the cookie is absent (e.g., legacy session, cookie cleared):
 *   access is not blocked here — Server Components perform the authoritative
 *   hasPermission() check and return <ForbiddenPage> when needed.
 *
 * NOTE: Never make database calls in middleware.  The Edge Runtime does not
 * support the Node.js `pg` driver.  All DB-backed permission checks live in
 * Server Components and Server Actions.
 *
 * PROXY NOTE: Behind NGINX, request.nextUrl may reflect the internal server
 * address (127.0.0.1:3000) rather than the external host.  All redirects
 * must be built via proxyAwareUrl() which reads X-Forwarded-Host / Host
 * headers set by NGINX to get the real external origin.
 */

/**
 * Build a redirect URL using the external origin as seen by the client.
 * Reads X-Forwarded-Host (set by NGINX) with Host as fallback, and
 * X-Forwarded-Proto for the scheme — never trusts request.nextUrl.origin
 * which may reflect the internal bind address (127.0.0.1:3000).
 */
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
  const isLoginPage   = pathname === "/login";
  const isPublicPage  =
    isLoginPage ||
    pathname === "/wachtwoord-vergeten" ||
    pathname.startsWith("/auth/confirm");

  // ── Config guard ──────────────────────────────────────────────────────────
  // When Supabase is not configured, /login is accessible (shows setup notice);
  // all other routes redirect to /login.  Never silently allow access.
  if (!url || !key) {
    if (isPublicPage) return NextResponse.next();
    return NextResponse.redirect(proxyAwareUrl("/login", request));
  }

  // ── Layer 1: Authentication ───────────────────────────────────────────────
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

  if (user && isLoginPage) {
    return NextResponse.redirect(proxyAwareUrl("/", request));
  }

  if (!user && !isPublicPage) {
    return NextResponse.redirect(proxyAwareUrl("/login", request));
  }

  // ── Layer 2: RBAC route guard ─────────────────────────────────────────────
  // Only runs for authenticated users on protected routes.
  if (user && !isLoginPage) {
    const required = getRoutePermission(pathname);

    if (required) {
      const permsCookieValue = request.cookies.get(COOKIE_NAME)?.value;

      if (permsCookieValue) {
        // Cookie is present — verify signature and check permission.
        const permissions = await verifyPermissions(permsCookieValue);

        if (
          permissions !== null &&
          !permissions.includes(`${required.resource}:${required.action}`)
        ) {
          // Verified cookie confirms user lacks the required permission.
          // Redirect to dashboard root rather than an error page for smoother UX.
          // The server component ForbiddenPage is the definitive access denial.
          return NextResponse.redirect(proxyAwareUrl("/", request));
        }
        // If permissions === null the signature was invalid — fall through to
        // server component checks (don't block access on a bad/expired cookie).
      }
      // If cookie absent — fall through; server components enforce RBAC.
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
