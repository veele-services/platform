import type { MetadataRoute } from "next";
import { getPersonnelPwaBranding, pwaDisplayName, pwaImageType } from "@/lib/pwa-branding";

export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const branding = await getPersonnelPwaBranding();
  const displayName = pwaDisplayName(branding);
  const iconType = pwaImageType(branding.faviconUrl);
  const splashType = pwaImageType(branding.splashUrl);
  const manifestData: MetadataRoute.Manifest = {
    name: `${displayName} Personeelsapp`,
    short_name: displayName.slice(0, 24) || "Personeel",
    description: `Personeelsapp voor ${displayName}`,
    start_url: "/personeel",
    scope: "/personeel",
    display: "standalone",
    background_color: branding.primaryColor,
    theme_color: branding.accentColor,
    orientation: "portrait",
    icons: branding.faviconUrl
      ? [
          {
            src: "/personeel/api/pwa/icon?size=192",
            sizes: iconType === "image/svg+xml" ? "any" : "192x192",
            type: iconType,
            purpose: "maskable",
          },
          {
            src: "/personeel/api/pwa/icon?size=512",
            sizes: iconType === "image/svg+xml" ? "any" : "512x512",
            type: iconType,
            purpose: "maskable",
          },
        ]
      : [
          {
            src: "/personeel/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "/personeel/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
  };

  if (branding.splashUrl) {
    (manifestData as MetadataRoute.Manifest & {
      screenshots: Array<{ src: string; sizes: string; type: string; form_factor: string }>;
    }).screenshots = [
      {
        src: "/personeel/api/pwa/splash",
        sizes: "1080x1920",
        type: splashType,
        form_factor: "narrow",
      },
    ];
  }

  return manifestData;
}
