import type { Metadata, Viewport } from "next";
import { CapacitorRuntimeBridge } from "@/components/CapacitorRuntimeBridge";
import { DevNav } from "@/components/DevNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fieldgrid Personeel",
  description: "Fieldgrid - personeelsapp voor uitvoerend personeel",
  manifest: "/personeel/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Fieldgrid",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#081D3A",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nl">
      <head>
        <link rel="icon" href="/personeel/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/personeel/icon-192.png" />
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
        <CapacitorRuntimeBridge />
        <DevNav current="personeel" />
        {children}
      </body>
    </html>
  );
}
