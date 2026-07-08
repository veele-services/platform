import type { MetadataRoute } from "next";
import { getCustomerPwaBranding, pwaDisplayName, pwaImageType } from "@/lib/pwa-branding";

export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const branding = await getCustomerPwaBranding();
  const displayName = pwaDisplayName(branding);
  const iconType = pwaImageType(branding.faviconUrl);
  const splashType = pwaImageType(branding.splashUrl);
  const manifestData: MetadataRoute.Manifest = {
    name: `${displayName} Klantportaal`,
    short_name: displayName.slice(0, 24) || "Klant",
    description: `Klantportaal voor ${displayName}`,
    start_url: "/klant",
    scope: "/klant",
    display: "standalone",
    background_color: branding.primaryColor,
    theme_color: branding.accentColor,
    orientation: "portrait",
    icons: branding.faviconUrl
      ? [
          {
            src: "/klant/api/pwa/icon?size=192",
            sizes: iconType === "image/svg+xml" ? "any" : "192x192",
            type: iconType,
            purpose: "maskable",
          },
          {
            src: "/klant/api/pwa/icon?size=512",
            sizes: iconType === "image/svg+xml" ? "any" : "512x512",
            type: iconType,
            purpose: "maskable",
          },
        ]
      : [
          {
            src: "/klant/favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "maskable",
          },
        ],
  };

  if (branding.splashUrl) {
    (manifestData as MetadataRoute.Manifest & {
      screenshots: Array<{ src: string; sizes: string; type: string; form_factor: string }>;
    }).screenshots = [
      {
        src: "/klant/api/pwa/splash",
        sizes: "1080x1920",
        type: splashType,
        form_factor: "narrow",
      },
    ];
  }

  return manifestData;
}
