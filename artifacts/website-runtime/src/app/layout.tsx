import { loadManagedWebsiteResolution } from "@/lib/runtime-context";
import { headers } from "next/headers";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const requestHeaders = await headers();
  const resolution = await loadManagedWebsiteResolution(
    requestHeaders.get("host") ?? "",
  );
  const locale =
    resolution.status === "ready" ? resolution.snapshot.defaultLocale : "nl";
  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  );
}
