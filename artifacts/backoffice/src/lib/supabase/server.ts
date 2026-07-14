import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import {
  createSupabaseCookieOptions,
  withHostOnlyCookieOptions,
} from "./session-cookies";

type E2eUser = { id: string; email?: string; app_metadata: Record<string, unknown>; user_metadata: Record<string, unknown> };

const E2E_AUTH_COOKIE = "fieldgrid_e2e_user_id";
const E2E_EMAILS: Record<string, string> = {
  "20000000-0000-4000-8000-000000000001": "platform-owner@runtime.fieldgrid.test",
  "20000000-0000-4000-8000-000000000002": "platform-admin@runtime.fieldgrid.test",
  "20000000-0000-4000-8000-000000000101": "owner@tenant-a.runtime.fieldgrid.test",
  "20000000-0000-4000-8000-000000000102": "admin@tenant-a.runtime.fieldgrid.test",
  "20000000-0000-4000-8000-000000000103": "planner@tenant-a.runtime.fieldgrid.test",
  "20000000-0000-4000-8000-000000000104": "personnel@tenant-a.runtime.fieldgrid.test",
  "20000000-0000-4000-8000-000000000105": "customer@tenant-a.runtime.fieldgrid.test",
  "20000000-0000-4000-8000-000000000202": "admin@tenant-b.runtime.fieldgrid.test",
  "20000000-0000-4000-8000-000000000204": "personnel@tenant-b.runtime.fieldgrid.test",
  "20000000-0000-4000-8000-000000000205": "customer@tenant-b.runtime.fieldgrid.test",
  "20000000-0000-4000-8000-000000000401": "owner@suspended.runtime.fieldgrid.test",
};

function assertE2eAuthEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.FIELDGRID_E2E_AUTH_ENABLED === "true";
}

function e2eUser(userId: string | undefined): E2eUser | null {
  if (!assertE2eAuthEnabled() || !userId || !(userId in E2E_EMAILS)) return null;
  return { id: userId, email: E2E_EMAILS[userId], app_metadata: { provider: "fieldgrid-e2e" }, user_metadata: { fixture: true } };
}

function e2eSupabaseClient(userId: string | undefined): any {
  const user = e2eUser(userId);
  if (!user) return null;
  return { auth: { async getUser() { return { data: { user }, error: null }; } } };
}


/**
 * Server-side Supabase client for Server Components and Server Actions.
 * Reads and writes session cookies via next/headers.
 *
 * Do NOT use in middleware — use createMiddlewareClient() there.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const e2eClient = e2eSupabaseClient(cookieStore.get(E2E_AUTH_COOKIE)?.value);
  if (e2eClient) return e2eClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

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
  const e2eUserId = cookieHeaderToPairs(request.headers.get("cookie")).find((cookie) => cookie.name === E2E_AUTH_COOKIE)?.value;
  const e2eClient = e2eSupabaseClient(e2eUserId);
  if (e2eClient) return e2eClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");

  return createServerClient(url, key, {
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
}
