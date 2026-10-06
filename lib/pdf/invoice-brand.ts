import "server-only";
import { readScannedFile } from "@/lib/files/scanned-storage";

/** Only a scanned logo in the authorized tenant's immutable branding namespace. */
export async function invoiceLogo(tenantId: string, branding: Record<string, unknown>) {
  const path = branding.logo_path;
  if (typeof path !== "string" || !path.startsWith(`${tenantId}/`) || /[\\%?#\u0000-\u001f]/.test(path) || path.split("/").length !== 2 || path.split("/").some(part => !part || part === "." || part === "..")) return undefined;
  const file = await readScannedFile("branding", path);
  if (!file || file.bytes.length > 2 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(file.mime)) return undefined;
  return file.bytes;
}
