import type { Metadata } from "next";
import Link from "next/link";
import { getWebsiteNavigationAction } from "@/app/actions/website";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { Badge } from "@/components/ui/badge";
import { WebsiteNavigationEditor } from "@/components/website/WebsiteNavigationEditor";
import { WebsiteTabs } from "@/components/website/WebsiteTabs";
import { TenantPageHeader, TenantPageShell } from "@/components/tenant-ui";
import { hasPermission } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Websitenavigatie" };

export default async function WebsiteNavigationPage() {
  const [canRead, canWrite] = await Promise.all([
    hasPermission("website_navigation", "read"),
    hasPermission("website_navigation", "write"),
  ]);
  if (!canRead) {
    return <ForbiddenPage resource="website_navigation" action="read" />;
  }
  const view = await getWebsiteNavigationAction();

  return (
    <TenantPageShell size="default">
      <TenantPageHeader
        title="Navigatie"
        eyebrow="Websitebeheer"
        description="Beheer header-, footer- en juridische menu's als één veilig, gereviseerd concept."
        breadcrumbs={[
          { label: "Website", href: "/website" },
          { label: "Navigatie" },
        ]}
        badges={
          view ? (
            <>
              <Badge variant="outline">
                {view.items.length} onderdeel
                {view.items.length === 1 ? "" : "en"}
              </Badge>
              <Badge variant="outline">Revisie {view.authoringRevision}</Badge>
            </>
          ) : undefined
        }
      />
      <WebsiteTabs />
      {!view ? (
        <section className="veele-card">
          <h2 className="font-semibold text-slate-950">Nog geen website</h2>
          <p className="mt-2 text-sm text-slate-600">
            Initialiseer eerst een beheerde website vanuit het overzicht.
          </p>
          <Link
            href="/website"
            className="mt-4 inline-block text-sm font-medium text-cyan-700"
          >
            Naar website-overzicht →
          </Link>
        </section>
      ) : (
        <WebsiteNavigationEditor initialView={view} canWrite={canWrite} />
      )}
    </TenantPageShell>
  );
}
