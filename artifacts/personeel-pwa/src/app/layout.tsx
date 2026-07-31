import type { Metadata, Viewport } from "next";
import { CapacitorRuntimeBridge } from "@/components/CapacitorRuntimeBridge";
import { DevNav } from "@/components/DevNav";
import { OfflineContentNavigation } from "@/components/OfflineContentNavigation";
import { PwaSplashScreen } from "@/components/PwaSplashScreen";
import { getPersonnelPwaBranding } from "@/lib/pwa-branding";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/600.css";
import "@fontsource/roboto/700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Personeelsapp",
  description: "Personeelsapp voor uitvoerend personeel",
  manifest: "/personeel/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Personeelsapp",
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
  children: React.ReactNode;
}) {
  const branding = await getPersonnelPwaBranding().catch(() => null);
  const splashUrl = branding?.splashUrl ?? null;
  const splashBackgroundColor = branding?.primaryColor ?? "#081D3A";

  return (
    <html lang="nl">
      <head>
        <link rel="icon" href="/personeel/api/pwa/icon?size=192" sizes="any" />
        <link rel="apple-touch-icon" href="/personeel/api/pwa/icon?size=192" />
        {splashUrl ? <link rel="apple-touch-startup-image" href="/personeel/api/pwa/splash" /> : null}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              var capacitorBridge = window.Capacitor;
              var isNativeCapacitor = false;
              if (capacitorBridge) {
                if (typeof capacitorBridge.isNativePlatform === 'function') {
                  isNativeCapacitor = capacitorBridge.isNativePlatform();
                } else if (typeof capacitorBridge.getPlatform === 'function') {
                  isNativeCapacitor = capacitorBridge.getPlatform() !== 'web';
                }
              }
              if (!isNativeCapacitor && 'serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/personeel/sw.js');
                });
              }
            `,
          }}
        />
      </head>
      <body>
        <PwaSplashScreen splashUrl={splashUrl} backgroundColor={splashBackgroundColor} />
        <OfflineContentNavigation />
        <CapacitorRuntimeBridge />
        <DevNav current="personeel" />
        {children}
      </body>
    </html>
  );
}
