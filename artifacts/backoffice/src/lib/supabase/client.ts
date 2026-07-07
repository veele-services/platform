"use client";

import { createBrowserClient } from "@supabase/ssr";
import { createSupabaseCookieOptions } from "./session-cookies";

/**
 * Browser-side Supabase client.
 * Use in Client Components only — never import in Server Components or middleware.
 */
export function createClient() {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  const host = typeof window === "undefined" ? null : window.location.host;

  return createBrowserClient(url, key, {
    cookieOptions: createSupabaseCookieOptions(host),
  });
}
