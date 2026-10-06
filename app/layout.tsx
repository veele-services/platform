import type { Metadata, Viewport } from "next";
import { NotificationAccountBoundary } from "@/components/fieldgrid/notifications/account-boundary";
import { headers } from "next/headers";
import { browserSessionKey } from "@/lib/auth/browser-session";
import { PROTECTED_PAGE_HEADER } from "@/lib/auth/session-signal";
import {getLoginBrand} from "@/lib/auth/login-brand";
import { loadAccountGuides } from "@/lib/guides/actions";
import { AccountGuideProvider } from "@/components/fieldgrid/guides/guide";
import "./globals.css";
import "@/components/fieldgrid/customers/customer.css";
import "./personnel-dossier.css";
import "./planboard.css";
import "./object-360.css";
import "./travel.css";
import "./commercial.css";

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

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const protectedPage=(await headers()).get(PROTECTED_PAGE_HEADER)==="1";
  const [renderedSessionKey,brand,guides]=protectedPage
    ?await Promise.all([browserSessionKey(),getLoginBrand().catch(()=>null),loadAccountGuides()])
    :[null,null,null];
  return (
    <html lang="nl" data-scroll-behavior="smooth" data-account-blocked={protectedPage?"true":undefined}>
      <body suppressHydrationWarning><NotificationAccountBoundary renderedSessionKey={renderedSessionKey} brand={brand}/><AccountGuideProvider key={renderedSessionKey ?? "public"} initialDismissed={guides}>{children}</AccountGuideProvider></body>
    </html>
  );
}
