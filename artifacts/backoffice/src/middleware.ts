import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js Middleware — runs on every matched request.
 *
 * Responsibilities:
 *   1. Refresh the Supabase session cookie (required for SSR auth).
 *   2. Redirect unauthenticated users to /login.
 *   3. Redirect authenticated users away from /login → /.
 *
 * Configuration guard:
 *   If Supabase env vars are not set, ALL protected routes redirect to /login.
 *   The login page then shows a "Supabase not configured" error banner.
 *   This is explicit failure — unauthenticated users NEVER reach protected routes.
 */
export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const { pathname } = request.nextUrl;
  const isLoginPage  = pathname === "/login";

  // Supabase not configured → block all protected routes, leave /login open.
  if (!url || !key) {
    if (isLoginPage) {
      return NextResponse.next();
    }
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    return NextResponse.redirect(redirectUrl);
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

  // Refresh session — do not remove this call.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Authenticated user visiting /login → redirect to dashboard.
  if (user && isLoginPage) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/";
    return NextResponse.redirect(redirectUrl);
  }

  // Unauthenticated user visiting a protected route → redirect to /login.
  if (!user && !isLoginPage) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static  (static assets)
     * - _next/image   (image optimisation)
     * - favicon.ico, robots.txt, sitemap.xml
     * - public image extensions
     */
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
