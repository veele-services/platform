import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import { readScannedFile } from "@/lib/files/scanned-storage";
import { BRANDING_LOGO_MAX_BYTES, BRANDING_LOGO_MAX_PIXELS, rejectLogoAnimation, validateLogoMetadata } from "@/lib/branding/validation";
import { getStaffPwaSource, type StaffPwaSource } from "./staff";
import { staffPwaAssetSize } from "./presentation";

let activeRenders = 0;
const MAX_ACTIVE_RENDERS = 4;
export class StaffPwaBusyError extends Error {}

function sameSource(before: StaffPwaSource, after: StaffPwaSource) {
  return before.tenantId === after.tenantId && before.logoPath === after.logoPath
    && JSON.stringify(before.identity) === JSON.stringify(after.identity);
}

function initialsImage(source: StaffPwaSource) {
  const initials = source.identity.name.split(/\s+/).map(word => word[0]).slice(0, 2).join("").toLocaleUpperCase("nl-NL");
  const escaped = initials.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!));
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" rx="64" fill="${source.identity.themeColor}"/><text x="256" y="278" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="192" font-weight="700" fill="white">${escaped}</text></svg>`);
}

/** Rasterize a bounded current presentation asset; never fetch a supplied URL.
 * Live host, active tenant, entitlement and immutable logo path are rechecked
 * after Storage/scanner/decoder I/O and before public bytes leave this helper. */
export async function renderStaffPwaImage(asset: string): Promise<Uint8Array | null> {
  const size = staffPwaAssetSize(asset);
  if (!size) return null;
  if (activeRenders >= MAX_ACTIVE_RENDERS) throw new StaffPwaBusyError("Probeer later opnieuw");
  activeRenders++;
  try {
    return await renderImage(size);
  } finally {
    activeRenders--;
  }
}

async function renderImage(size: NonNullable<ReturnType<typeof staffPwaAssetSize>>): Promise<Uint8Array | null> {
  const source = await getStaffPwaSource();
  let logo: Uint8Array;
  if (source.identity.whiteLabel && source.logoPath) {
    const file = await readScannedFile("branding", source.logoPath, undefined, createAdminClient());
    if (!file || file.bytes.length > BRANDING_LOGO_MAX_BYTES || !["image/png", "image/jpeg", "image/webp"].includes(file.mime)) return null;
    rejectLogoAnimation(file.bytes, file.mime);
    validateLogoMetadata(await sharp(file.bytes, { limitInputPixels: BRANDING_LOGO_MAX_PIXELS }).metadata(), file.mime);
    logo = file.bytes;
  } else if (source.identity.whiteLabel) {
    logo = initialsImage(source);
  } else {
    // Fixed repository asset only; no browser-selected path or arbitrary fetch.
    logo = await readFile(join(process.cwd(), "public", "branding", size.kind === "splash" ? "fieldgrid-logo.svg" : "fieldgrid-icon.svg"));
  }
  const edge = Math.min(size.width, size.height);
  // A square tenant logo also fits entirely inside the central 80% safe circle:
  // 56% / sqrt(2) < 40%. Never crop a supplied logo into an Android mask.
  const width = Math.round(edge * (size.kind === "maskable" ? 0.56 : size.kind === "splash" ? 0.48 : 0.80));
  const height = Math.round(edge * (size.kind === "splash" ? 0.24 : size.kind === "maskable" ? 0.56 : 0.80));
  const resized = await sharp(logo, { limitInputPixels: BRANDING_LOGO_MAX_PIXELS })
    .resize(width, height, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer();
  const bytes = await sharp({ create: { width: size.width, height: size.height, channels: 4, background: size.kind === "splash" ? source.identity.backgroundColor : "#ffffff" } })
    .composite([{ input: resized, gravity: "centre" }]).png().toBuffer();
  const current = await getStaffPwaSource();
  if (!sameSource(source, current)) return null;
  return new Uint8Array(bytes);
}
