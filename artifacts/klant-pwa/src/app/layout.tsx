import type { Metadata, Viewport } from "next";
import { DevNav } from "@/components/DevNav";
import "./globals.css";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Fieldgrid Klantportaal",
  description: "Fieldgrid - portaal voor klanten",
  manifest: "/klant/manifest.json",
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
  children: ReactNode;
}) {
  return (
    <html lang="nl">
      <head>
        <link rel="icon" href="/klant/favicon.svg" sizes="any" />
        <link rel="apple-touch-icon" href="/klant/favicon.svg" />
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
        <DevNav current="klant" />
        {children}
      </body>
    </html>
  );
}
