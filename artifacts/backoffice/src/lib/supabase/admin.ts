import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — use only in server actions / route handlers.
 * Never expose this client or the service-role key to the browser.
 *
 * Requires:
 *   NEXT_PUBLIC_SUPABASE_URL        — public project URL (already used by SSR client)
 *   SUPABASE_SERVICE_ROLE_KEY       — secret service role key (server-only)
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase admin is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createSupabaseClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
