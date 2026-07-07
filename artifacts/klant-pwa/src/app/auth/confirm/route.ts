import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  createSupabaseCookieOptions,
  withHostOnlyCookieOptions,
} from "@/lib/supabase/session-cookies";

const BASE = "/klant";

function getOrigin(request: NextRequest): string {
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    "localhost";
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

/**
 * Auth confirm route handler — exchanges a Supabase PKCE code for a session.
 * Klant PWA: redirects to /klant/reset-wachtwoord on recovery.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code   = searchParams.get("code");
  const type   = searchParams.get("type");
  const origin = getOrigin(request);

  if (!code) {
    return NextResponse.redirect(`${origin}${BASE}/login?error=Ongeldige+herstellink`);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.redirect(`${origin}${BASE}/login?error=Supabase+niet+geconfigureerd`);
  }

  const cookieStore = await cookies();
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const destination  =
    type === "recovery" ? `${origin}${BASE}/reset-wachtwoord` : `${origin}${BASE}`;
  const response = NextResponse.redirect(destination);

  const supabase = createServerClient(url, key, {
    cookieOptions: createSupabaseCookieOptions(host),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet, responseHeaders) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, withHostOnlyCookieOptions(options));
        });
        Object.entries(responseHeaders).forEach(([header, value]) =>
          response.headers.set(header, value),
        );
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}${BASE}/login?error=Resetlink+verlopen+of+ongeldig.+Vraag+opnieuw+aan.`,
    );
  }

  return response;
}
