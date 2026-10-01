import "server-only";
import { createHash } from "node:crypto";
import type { createAdminClient } from "@/lib/supabase/admin";
import { tenantAppUrl } from "@/lib/tenancy/hostname";
import { readScannedFile, publishScannedFile } from "@/lib/files/scanned-storage";

/** Logos are deliberately public branding, never dossier attachments. Copy to
 * a content-addressed asset so later logo replacement cannot rewrite old mail. */
export async function freezeEmailLogo(db: ReturnType<typeof createAdminClient>, tenantId: string, slug: string, sourcePath: string | null | undefined): Promise<string | null> {
  if (!sourcePath) return null;
  if (!sourcePath.startsWith(`${tenantId}/`) || sourcePath.includes("..")) throw new Error("De huisstijl hoort niet bij deze organisatie.");
  const source = await readScannedFile("branding", sourcePath, null, db);
  if (!source || source.bytes.length > 2 * 1024 * 1024) throw new Error("Het logo voor deze berichtversie is niet beschikbaar.");
  const ext = ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as Record<string, string>)[source.mime];
  if (!ext) throw new Error("Het logo heeft geen ondersteund bestandsformaat.");
  const bytes = source.bytes, asset = `${createHash("sha256").update(bytes).digest("hex")}.${ext}`;
  const path = `${tenantId}/notification-assets/${asset}`;
  // Internal mail processing has already authorized the recipient/source. Only
  // copy these verified public-branding bytes, never a caller-selected dossier.
  const authorize = async () => {
    const tenant = await db.from("tenants").select("id").eq("id", tenantId).eq("status", "active").maybeSingle();
    if (tenant.error || !tenant.data) throw new Error("De organisatie is niet actief.");
  };
  await authorize();
  if (!await readScannedFile("branding", path, asset.split(".")[0], db)) {
    await publishScannedFile({ bucket: "branding", path, bytes, mime: source.mime, authorize }, db);
  }
  return tenantAppUrl(slug, `/api/branding/${tenantId}/email-logo?asset=${asset}`);
}
