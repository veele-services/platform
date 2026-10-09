import type { Metadata, MetadataRoute } from "next";

export type StaffPwaIdentity = {
  name: string;
  shortName: string;
  whiteLabel: boolean;
  iconUrl: string;
  themeColor: string;
  backgroundColor: string;
};

export const FIELDGRID_PWA_IDENTITY: StaffPwaIdentity = {
  name: "Fieldgrid",
  shortName: "Fieldgrid",
  whiteLabel: false,
  iconUrl: "/branding/fieldgrid-icon-192.png",
  themeColor: "#222c35",
  backgroundColor: "#f3f6f9",
};

// Fixed device formats bound both decoding work and the public image surface.
// Portrait and landscape are emitted separately for iPhone and iPad.
export const APPLE_STARTUP_DEVICES = [
  [320, 568, 2], [375, 667, 2], [414, 736, 3], [375, 812, 3],
  [390, 844, 3], [393, 852, 3], [402, 874, 3], [414, 896, 2],
  [414, 896, 3], [428, 926, 3], [430, 932, 3], [440, 956, 3],
  [768, 1024, 2], [810, 1080, 2], [820, 1180, 2], [834, 1112, 2],
  [834, 1194, 2], [1024, 1366, 2],
] as const;

export function staffPwaImagePath(identity: StaffPwaIdentity, asset: string) {
  if (identity.whiteLabel) return `/staff/pwa/${asset}.png`;
  if (asset === "apple-touch") return "/branding/fieldgrid-apple-touch-icon.png";
  if (/^(icon|maskable)-(192|512)$/.test(asset)) {
    return `/branding/fieldgrid-icon-${asset.startsWith("maskable") ? "maskable-" : ""}${asset.split("-")[1]}.png`;
  }
  return `/staff/pwa/${asset}.png`;
}

export function buildStaffManifest(identity: StaffPwaIdentity): MetadataRoute.Manifest {
  return {
    id: "/staff",
    name: identity.name,
    short_name: identity.shortName,
    description: "Je personeelsapp voor planning, werkbonnen en je werkdag.",
    start_url: "/staff",
    // Shared /login and /auth/verify must remain inside the installed window.
    // Scope is presentation only: every workspace retains its own live guards.
    scope: "/",
    display: "standalone",
    background_color: identity.backgroundColor,
    theme_color: identity.themeColor,
    lang: "nl-NL",
    prefer_related_applications: false,
    icons: [192, 512].flatMap(size => [
      { src: staffPwaImagePath(identity, `icon-${size}`), sizes: `${size}x${size}`, type: "image/png", purpose: "any" as const },
      { src: staffPwaImagePath(identity, `maskable-${size}`), sizes: `${size}x${size}`, type: "image/png", purpose: "maskable" as const },
    ]),
  };
}

export function buildStaffMetadata(identity: StaffPwaIdentity): Metadata {
  return {
    applicationName: identity.name,
    manifest: "/staff/manifest.webmanifest",
    // This Next build emits the modern unprefixed capability tag. Safari's
    // documented Home Screen contract still needs the Apple-prefixed tag too.
    other: { "apple-mobile-web-app-capable": "yes" },
    icons: {
      icon: [{ url: staffPwaImagePath(identity, "icon-192"), sizes: "192x192", type: "image/png" }],
      apple: [{ url: staffPwaImagePath(identity, "apple-touch"), sizes: "180x180", type: "image/png" }],
    },
    appleWebApp: {
      capable: true,
      title: identity.shortName,
      statusBarStyle: "default",
      startupImage: APPLE_STARTUP_DEVICES.flatMap(([width, height, ratio]) => (
        ["portrait", "landscape"] as const
      ).map(orientation => ({
        url: `/staff/pwa/splash-${orientation === "portrait" ? width * ratio : height * ratio}x${orientation === "portrait" ? height * ratio : width * ratio}.png`,
        media: `(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: ${orientation})`,
      }))),
    },
  };
}

export function staffPwaAssetSize(asset: string): { width: number; height: number; kind: "icon" | "maskable" | "splash" } | null {
  if (asset === "apple-touch.png") return { width: 180, height: 180, kind: "icon" };
  const icon = /^(icon|maskable)-(192|512)\.png$/.exec(asset);
  if (icon) return { width: Number(icon[2]), height: Number(icon[2]), kind: icon[1] as "icon" | "maskable" };
  for (const [width, height, ratio] of APPLE_STARTUP_DEVICES) {
    for (const [w, h] of [[width * ratio, height * ratio], [height * ratio, width * ratio]]) {
      if (asset === `splash-${w}x${h}.png`) return { width: w, height: h, kind: "splash" };
    }
  }
  return null;
}

/** Exact public presentation exceptions, never an entire workspace prefix. */
export function isStaffPwaPresentationPath(path: string) {
  if (path === "/staff/manifest.webmanifest") return true;
  const match = /^\/staff\/pwa\/([^/]+)$/.exec(path);
  return Boolean(match && staffPwaAssetSize(match[1]));
}
