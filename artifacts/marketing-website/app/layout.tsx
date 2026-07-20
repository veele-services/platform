import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import {
  absoluteUrl,
  serializeJsonLd,
  SITE_DESCRIPTION,
  SITE_NAME,
  siteUrl,
} from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: SITE_NAME,
  title: {
    default: "Veele Services | Schoonmaak, beveiliging en facilitair",
    template: "%s",
  },
  description: SITE_DESCRIPTION,
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
  referrer: "origin-when-cross-origin",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: "website",
    locale: "nl_NL",
    url: absoluteUrl("/"),
    siteName: SITE_NAME,
    title: "Veele Services | Schoonmaak, beveiliging en facilitair",
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary",
    title: "Veele Services | Schoonmaak, beveiliging en facilitair",
    description: SITE_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light",
  themeColor: "#071b2f",
};

const globalStructuredData = serializeJsonLd({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${absoluteUrl("/")}#organization`,
      name: SITE_NAME,
      url: absoluteUrl("/"),
      description: SITE_DESCRIPTION,
    },
    {
      "@type": "WebSite",
      "@id": `${absoluteUrl("/")}#website`,
      url: absoluteUrl("/"),
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      inLanguage: "nl-NL",
      publisher: { "@id": `${absoluteUrl("/")}#organization` },
    },
  ],
});

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl">
      <body>
        <a
          href="#main-content"
          className="fixed left-4 top-4 z-[100] -translate-y-24 rounded-xl bg-[var(--aqua)] px-4 py-3 text-sm font-bold text-brand-navy shadow-xl transition-transform focus:translate-y-0"
        >
          Ga naar de hoofdinhoud
        </a>
        <SiteHeader />
        <main id="main-content" tabIndex={-1}>{children}</main>
        <SiteFooter />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: globalStructuredData }}
        />
      </body>
    </html>
  );
}
