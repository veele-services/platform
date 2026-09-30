import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./personnel-dossier.css";
import "./planboard.css";
import "./object-360.css";

export const metadata: Metadata = {
  title: { default: "Fieldgrid", template: "%s · Fieldgrid" },
  description: "Planning, uitvoering, rapportage en facturatie in één werkplatform.",
  applicationName: "Fieldgrid",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#222c35",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl" data-scroll-behavior="smooth">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
