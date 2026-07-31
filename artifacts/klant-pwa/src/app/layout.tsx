import type { Metadata, Viewport } from "next";
import { DevNav } from "@/components/DevNav";
import { OfflineContentNavigation } from "@/components/OfflineContentNavigation";
import { PwaSplashScreen } from "@/components/PwaSplashScreen";
import { getCustomerPwaBranding } from "@/lib/pwa-branding";
import "./globals.css";
import type { ReactNode } from "react";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/600.css";
import "@fontsource/roboto/700.css";

export const metadata: Metadata = {
  title: "Klantportaal",
  description: "Portaal voor klanten",
  manifest: "/klant/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Klantportaal",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#081D3A",
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const branding = await getCustomerPwaBranding().catch(() => null);
  const splashUrl = branding?.splashUrl ?? null;
  const splashBackgroundColor = branding?.primaryColor ?? "#081D3A";

  return (
    <html lang="nl">
      <head>
        <link rel="icon" href="/klant/api/pwa/icon?size=192" sizes="any" />
        <link rel="apple-touch-icon" href="/klant/api/pwa/icon?size=192" />
        {splashUrl ? (
          <link rel="apple-touch-startup-image" href="/klant/api/pwa/splash" />
        ) : null}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/klant/sw.js');
                });
              }
            `,
          }}
        />
      </head>
      <body>
        <PwaSplashScreen
          splashUrl={splashUrl}
          backgroundColor={splashBackgroundColor}
        />
        <OfflineContentNavigation />
        <DevNav current="klant" />
        {children}
      </body>
    </html>
  );
}
