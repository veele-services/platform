import { createServerClient } from "@supabase/ssr";
import { createFieldgridE2EAuthClient, createFieldgridE2EFetch } from "@workspace/db/e2e-auth-adapter";
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

  const supabase = createServerClient(url, key, {
    global: process.env.FIELDGRID_E2E_AUTH_ENABLED === "true" ? { fetch: createFieldgridE2EFetch({ cookies: cookieStore, headers: requestHeaders }) } : undefined,
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

  if (process.env.FIELDGRID_E2E_AUTH_ENABLED === "true") {
    return createFieldgridE2EAuthClient(supabase, { cookies: cookieStore, headers: requestHeaders });
  }

  return supabase;
}

function cookieHeaderToPairs(cookieHeader: string | null): Array<{ name: string; value: string }> {
  if (!cookieHeader) return [];

  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separatorIndex = part.indexOf("=");
      if (separatorIndex === -1) {
        return { name: part, value: "" };
      }

      return {
        name: part.slice(0, separatorIndex).trim(),
        value: part.slice(separatorIndex + 1),
      };
    })
    .filter((cookie) => cookie.name.length > 0);
}

/**
 * Route Handler Supabase client for read-only API endpoints.
 *
 * `next/headers` is reliable in Server Components and Server Actions, but
 * smoke/export Route Handlers also receive the concrete Request. Reading the
 * cookie header directly keeps host-keyed auth working for JSON endpoints that
 * are exercised outside browser navigation.
 */
export function createClientFromRequest(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");

  const supabase = createServerClient(url, key, {
    global: process.env.FIELDGRID_E2E_AUTH_ENABLED === "true" ? { fetch: createFieldgridE2EFetch({ headers: request.headers }) } : undefined,
    cookieOptions: createSupabaseCookieOptions(host),
    cookies: {
      getAll() {
        return cookieHeaderToPairs(request.headers.get("cookie"));
      },
      setAll() {
        // Read-only route handlers cannot mutate the caller's cookie jar here.
      },
    },
  });

  if (process.env.FIELDGRID_E2E_AUTH_ENABLED === "true") {
    return createFieldgridE2EAuthClient(supabase, { headers: request.headers });
  }

  return supabase;
}
