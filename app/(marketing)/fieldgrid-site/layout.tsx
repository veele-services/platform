import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { HOST_KIND_HEADER } from "@/lib/tenancy/hostname";
import { FIELDGRID_MARKETING_ORIGIN } from "@/lib/marketing/fieldgrid/routes";
import "@/components/fieldgrid/marketing/signature.css";

export const metadata: Metadata = {
  metadataBase: new URL(FIELDGRID_MARKETING_ORIGIN),
  title: { default: "Fieldgrid | Je mensen. Je locaties. Alles verbonden.", template: "%s" },
  manifest: null,
  icons: { icon: "/fieldgrid-site-assets/branding/icon.svg", shortcut: "/fieldgrid-site-assets/branding/icon.svg", apple: [] },
  openGraph: { type: "website", locale: "nl_NL", siteName: "Fieldgrid" },
};

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  if ((await headers()).get(HOST_KIND_HEADER) !== "marketing") notFound();
  return children;
}
