import { createServerClient } from "@supabase/ssr";
import { FIELDGRID_E2E_AUTH_COOKIE, createFieldgridE2eSupabaseClient } from "@workspace/db/e2e-auth-adapter";
import { cookies, headers } from "next/headers";
import {
  createSupabaseCookieOptions,
  withHostOnlyCookieOptions,
} from "./session-cookies";

export async function createClient() {
  const cookieStore = await cookies();
  const e2eUserId = cookieStore.get(FIELDGRID_E2E_AUTH_COOKIE)?.value;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");

  const supabase = createServerClient(url, key, {
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
          // Server Components cannot set cookies — middleware handles refresh.
        }
      },
    },
  });

  return createFieldgridE2eSupabaseClient(e2eUserId, supabase) ?? supabase;
}
