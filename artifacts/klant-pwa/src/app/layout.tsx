import type { Metadata, Viewport } from "next";
import { DevNav } from "@/components/DevNav";
import { OfflineContentNavigation } from "@/components/OfflineContentNavigation";
import "./globals.css";
import type { ReactNode } from "react";

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
  maximumScale: 1,
  userScalable: false,
  themeColor: "#081D3A",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="nl">
      <head>
        <link rel="icon" href="/klant/api/pwa/icon?size=192" sizes="any" />
        <link rel="apple-touch-icon" href="/klant/api/pwa/icon?size=192" />
        <link rel="apple-touch-startup-image" href="/klant/api/pwa/splash" />
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
        <OfflineContentNavigation />
        <DevNav current="klant" />
        {children}
      </body>
    </html>
  );
}
