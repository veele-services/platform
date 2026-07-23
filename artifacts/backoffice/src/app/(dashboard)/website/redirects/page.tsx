import type { Metadata } from "next";
import Link from "next/link";
import { getWebsiteRedirectsAction } from "@/app/actions/website";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { WebsiteRedirectEditor } from "@/components/website/WebsiteRedirectEditor";
import { WebsiteTabs } from "@/components/website/WebsiteTabs";
import { TenantPageHeader, TenantPageShell } from "@/components/tenant-ui";
import { hasPermission } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Website redirects" };

export default async function WebsiteRedirectsPage() {
  const [canRead, canWrite] = await Promise.all([
    hasPermission("website_navigation", "read"),
    hasPermission("website_navigation", "write"),
  ]);
  if (!canRead) {
    return <ForbiddenPage resource="website_navigation" action="read" />;
  }
  const view = await getWebsiteRedirectsAction();

  return (
    <TenantPageShell>
      <TenantPageHeader
        title="Redirects"
        description="Beheer veilige routewijzigingen voor de managed website. Publicatie blijft een aparte, expliciete stap."
        breadcrumbs={[
          { label: "Website", href: "/website" },
          { label: "Redirects" },
        ]}
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
        <>
          {view.deliveryMode === "custom_nextjs" && (
            <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
              Custom Next.js blijft live en beheert redirects in de eigen code.
              Deze managed redirects blijven alleen een niet-live concept.
            </section>
          )}
          <WebsiteRedirectEditor
            siteId={view.siteId}
            authoringRevision={view.authoringRevision}
            defaultLocale={view.defaultLocale}
            redirects={view.redirects}
            pages={view.pages}
            canWrite={canWrite}
          />
        </>
      )}
    </TenantPageShell>
  );
}
