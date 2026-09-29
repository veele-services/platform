import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export async function getBrandingLogoUrl(client: SupabaseClient<Database>, logoPath: string | null | undefined) {
  if (!logoPath) return null;
  const { data, error } = await client.storage.from("branding").createSignedUrl(logoPath, 3600);
  return error ? null : data.signedUrl;
}
