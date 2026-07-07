import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import {
  createSupabaseCookieOptions,
  withHostOnlyCookieOptions,
} from "./session-cookies";

/**
 * Server-side Supabase client for Server Components and Server Actions.
 * Reads and writes session cookies via next/headers.
 *
 * Do NOT use in middleware — use createMiddlewareClient() there.
 */
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  const cookieStore = await cookies();
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");

  return createServerClient(url, key, {
    cookieOptions: createSupabaseCookieOptions(host),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, withHostOnlyCookieOptions(options)),
          );
        } catch {
          // Server Components cannot set cookies — the middleware handles refresh.
        }
      },
    },
  });
}
