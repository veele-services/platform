import type {Metadata,Viewport} from "next";
import { NotificationAccountBoundary } from "@/components/fieldgrid/notifications/account-boundary";
import { SessionBrandProvider } from "@/components/fieldgrid/session-loading";
import { headers } from "next/headers";
import { browserSessionKey } from "@/lib/auth/browser-session";
import { PROTECTED_PAGE_HEADER } from "@/lib/auth/session-signal";
import {getLoginBrand} from "@/lib/auth/login-brand";
import { loadAccountGuides } from "@/lib/guides/actions";
import { AccountGuideProvider } from "@/components/fieldgrid/guides/guide";
import { StaffPwaBrowserEvents } from "@/components/fieldgrid/staff/pwa-browser-events";
import "./globals.css";
import "@/components/fieldgrid/customers/customer.css";
import "./personnel-dossier.css";
import "./planboard.css";
import "./object-360.css";
import "./travel.css";
import "./commercial.css";
import "@/components/fieldgrid/backoffice-portal.css";
import "@/components/fieldgrid/shell-chrome.css";
import "@/components/fieldgrid/content-tabs.css";
import "@/components/fieldgrid/heading-help-tip.css";
import "./dashboard-system.css";
// Match the source cascade: CRM precedes the shared platform declarations.
// Route-local imports otherwise win after navigation and change field spacing.
import "@/components/fieldgrid/crm/shared-presentation.css";
import "@/components/fieldgrid/crm/crm.css";
import "@/components/fieldgrid/management-cockpit/presentation.css";
import "@/components/fieldgrid/management-cockpit/presentation-adapters.css";
// Portal presentation has one cascade: native integrations first, immutable
// supplied declarations next, then the small native component bridges.
import "./staff/staff.css";
import "./staff/workspace-overlays.css";
import "@/components/fieldgrid/staff/portal-consistency.css";
import "@/components/fieldgrid/customer-portal/customer-portal.css";
import "@/components/fieldgrid/customer-portal/consistency.css";
import "@/components/fieldgrid/portals/source-presentation.css";
import "@/components/fieldgrid/portals/native-adapters.css";

export const metadata: Metadata = {
  title: { default: "Fieldgrid", template: "%s · Fieldgrid" },
  description: "Planning, uitvoering, rapportage en facturatie in één werkplatform.",
  applicationName: "Fieldgrid",
  manifest: "/manifest.webmanifest",
  icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }], apple: [{ url: "/branding/fieldgrid-apple-touch-icon.png", sizes: "180x180", type: "image/png" }] },
};

export const viewport: Viewport = {
  themeColor: "#222c35",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({children}:{children:React.ReactNode}) {
  const protectedPage=(await headers()).get(PROTECTED_PAGE_HEADER)==="1";
  const [renderedSessionKey,brand,guides]=protectedPage
    ?await Promise.all([browserSessionKey(),getLoginBrand().catch(()=>null),loadAccountGuides()])
    :[null,null,null];
  return (
    <html lang="nl" data-scroll-behavior="smooth" data-account-blocked={protectedPage?"true":undefined}>
      <body suppressHydrationWarning><StaffPwaBrowserEvents/><NotificationAccountBoundary renderedSessionKey={renderedSessionKey} brand={brand}/><SessionBrandProvider brand={brand}><AccountGuideProvider key={renderedSessionKey ?? "public"} initialDismissed={guides}>{children}</AccountGuideProvider></SessionBrandProvider></body>
    </html>
  );
}
