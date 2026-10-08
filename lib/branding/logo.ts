import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { readScannedFile } from "@/lib/files/scanned-storage";
import { getServerEnv } from "@/lib/env/server";
import { currentBrandingLogoPath } from "./logo-url";

export async function getBrandingLogoUrl(_client: SupabaseClient<Database>, logoPath: string | null | undefined, options: { absolute?: boolean } = {}) {
  if (!logoPath) return null;
  const tenantId = logoPath.split("/")[0];
  if (!/^[a-f0-9-]{36}$/.test(tenantId)) return null;
  try {
    const file = await readScannedFile("branding", logoPath);
    if (!file || !["image/png","image/jpeg","image/webp"].includes(file.mime) || file.bytes.length > 2 * 1024 * 1024) return null;
    // Browser UI needs same-origin URLs on tenant hosts. Exportable HTML email
    // previews explicitly request a verified absolute origin instead.
    const target = currentBrandingLogoPath(tenantId,logoPath);
    return target && options.absolute ? new URL(target, getServerEnv().APP_URL).href : target;
  } catch { return null; }
}
