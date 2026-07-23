import { loadManagedWebsiteResolution } from "@/lib/runtime-context";
import { WebsiteAnalyticsConsent } from "@/components/WebsiteAnalyticsConsent";
import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function resolutionForRequest() {
  const requestHeaders = await headers();
  return loadManagedWebsiteResolution(requestHeaders.get("host") ?? "");
}

export async function generateMetadata(): Promise<Metadata> {
  const resolution = await resolutionForRequest();
  if (resolution.status !== "ready") {
    return { robots: { index: false, follow: false } };
  }
  const verification = resolution.snapshot.seoSettings.webmasterVerification;
  return {
    metadataBase: new URL(`https://${resolution.canonicalHostname}`),
    verification: {
      google: verification.google ?? undefined,
      other: verification.bing
        ? { "msvalidate.01": verification.bing }
        : undefined,
    },
  };
}

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const resolution = await resolutionForRequest();
  const locale =
    resolution.status === "ready" ? resolution.snapshot.defaultLocale : "nl";
  return (
    <html lang={locale}>
      <body>
        {children}
        {resolution.status === "ready" ? (
          <WebsiteAnalyticsConsent analytics={resolution.snapshot.analytics} />
        ) : null}
      </body>
    </html>
  );
}
