import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { readScannedFile } from "@/lib/files/scanned-storage";
import { getServerEnv } from "@/lib/env/server";
import { currentBrandingLogoPath } from "./logo-url";

export async function getBrandingLogoUrl(_client: SupabaseClient<Database>, logoPath: string | null | undefined) {
  if (!logoPath) return null;
  const tenantId = logoPath.split("/")[0];
  if (!/^[a-f0-9-]{36}$/.test(tenantId)) return null;
  try {
    const file = await readScannedFile("branding", logoPath);
    if (!file || !["image/png","image/jpeg","image/webp"].includes(file.mime) || file.bytes.length > 2 * 1024 * 1024) return null;
    // Absolute origin also works in sandboxed email previews; never accept an
    // arbitrary Host header as the sender's public branding origin.
    const target=currentBrandingLogoPath(tenantId,logoPath);
    return target?new URL(target, getServerEnv().APP_URL).href:null;
  } catch { return null; }
}
