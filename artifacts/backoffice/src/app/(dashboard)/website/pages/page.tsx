import type { Metadata } from "next";
import Link from "next/link";
import { FilePlus2, Home, PencilLine } from "lucide-react";
import { getWebsitePagesAction } from "@/app/actions/website";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { Badge } from "@/components/ui/badge";
import { WebsitePageForm } from "@/components/website/WebsitePageForm";
import { WebsiteTabs } from "@/components/website/WebsiteTabs";
import { TenantPageHeader, TenantPageShell } from "@/components/tenant-ui";
import { hasPermission } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Websitepagina's" };

export default async function WebsitePagesPage() {
  const [canRead, canWrite] = await Promise.all([
    hasPermission("website_pages", "read"),
    hasPermission("website_pages", "write"),
  ]);
  if (!canRead) {
    return <ForbiddenPage resource="website_pages" action="read" />;
  }

  const view = await getWebsitePagesAction();
  return (
    <TenantPageShell>
      <TenantPageHeader
        title="Websitepagina's"
        description="Beheer conceptpagina's en metadata. Een opgeslagen wijziging wordt nooit automatisch gepubliceerd."
        breadcrumbs={[
          { label: "Website", href: "/website" },
          { label: "Pagina's" },
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
              Managed CMS-wijzigingen blijven concept en worden niet live zolang
              Custom Next.js actief is.
            </section>
          )}

          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                Bestaande pagina's
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {view.pages.length} pagina{view.pages.length === 1 ? "" : "'s"}{" "}
                in {view.siteName}.
              </p>
            </div>
            {view.pages.length === 0 ? (
              <div className="veele-card flex flex-col items-center py-10 text-center">
                <FilePlus2
                  className="h-9 w-9 text-slate-400"
                  aria-hidden="true"
                />
                <h3 className="mt-3 font-semibold text-slate-900">
                  Nog geen pagina's
                </h3>
                <p className="mt-1 max-w-md text-sm text-slate-600">
                  Maak eerst een homepage. De pagina blijft concept totdat de
                  aparte publicatiestap is afgerond.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="hidden grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto_auto] gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
                  <span>Pagina</span>
                  <span>Pad</span>
                  <span>Status</span>
                  <span className="sr-only">Actie</span>
                </div>
                {view.pages.map((page) => (
                  <Link
                    key={page.id}
                    href={`/website/pages/${page.id}`}
                    className="grid gap-2 border-b border-slate-100 px-4 py-4 transition-colors last:border-b-0 hover:bg-slate-50 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto_auto] md:items-center md:gap-4"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {page.isHomepage && (
                          <Home
                            className="h-4 w-4 text-cyan-700"
                            aria-label="Homepage"
                          />
                        )}
                        <span className="truncate font-medium text-slate-950">
                          {page.title}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {page.sectionCount} sectie
                        {page.sectionCount === 1 ? "" : "s"} · revisie{" "}
                        {page.authoringRevision}
                      </p>
                    </div>
                    <code className="truncate text-sm text-slate-600">
                      {page.path}
                    </code>
                    <Badge
                      variant={
                        page.status === "published" ? "default" : "outline"
                      }
                    >
                      {page.status === "draft"
                        ? "Concept"
                        : page.status === "published"
                          ? "Gepubliceerd"
                          : "Gearchiveerd"}
                    </Badge>
                    <PencilLine
                      className="h-4 w-4 text-slate-400"
                      aria-hidden="true"
                    />
                  </Link>
                ))}
              </div>
            )}
          </section>

          {canWrite && (
            <section className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">
                  Nieuwe pagina
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Paden zijn uniek binnen de website en gereserveerde
                  runtime-paden worden geweigerd.
                </p>
              </div>
              <WebsitePageForm
                siteId={view.siteId}
                siteAuthoringRevision={view.authoringRevision}
                canWrite
                allowHomepageCreation={
                  !view.pages.some(
                    (page) => page.isHomepage && page.status !== "archived",
                  )
                }
              />
            </section>
          )}
        </>
      )}
    </TenantPageShell>
  );
}
