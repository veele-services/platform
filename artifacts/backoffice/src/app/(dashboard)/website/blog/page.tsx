import type { Metadata } from "next";
import Link from "next/link";
import { FileText, PencilLine, Plus } from "lucide-react";
import { getWebsiteBlogAction } from "@/app/actions/website";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { WebsiteBlogTaxonomyEditor } from "@/components/website/WebsiteBlogTaxonomyEditor";
import { WebsiteTabs } from "@/components/website/WebsiteTabs";
import { TenantPageHeader, TenantPageShell } from "@/components/tenant-ui";
import { hasPermission } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Websiteblog" };

export default async function WebsiteBlogPage() {
  const [canRead, canWrite] = await Promise.all([
    hasPermission("website_blog", "read"),
    hasPermission("website_blog", "write"),
  ]);
  if (!canRead) {
    return <ForbiddenPage resource="website_blog" action="read" />;
  }
  const view = await getWebsiteBlogAction();

  return (
    <TenantPageShell>
      <TenantPageHeader
        title="Blog"
        description="Beheer veilige TipTap-content, categorieën en tags. Publicatie is altijd expliciet en wordt daarna nog opgenomen in een immutable websitepublicatie."
        breadcrumbs={[
          { label: "Website", href: "/website" },
          { label: "Blog" },
        ]}
        actions={
          view && canWrite ? (
            <Link
              href="/website/blog/new"
              className={cn(buttonVariants({ variant: "default" }))}
            >
              <Plus className="mr-2 h-4 w-4" />
              Nieuw bericht
            </Link>
          ) : null
        }
      />
      <WebsiteTabs />

      {!view ? (
        <section className="veele-card">
          <h2 className="font-semibold text-slate-950">Nog geen website</h2>
          <p className="mt-2 text-sm text-slate-600">
            Initialiseer eerst de beheerde website.
          </p>
        </section>
      ) : (
        <>
          {view.deliveryMode === "custom_nextjs" ? (
            <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
              Blogcontent blijft bewerkbaar, maar is niet live zolang Custom
              Next.js actief is. De custom website beheert zijn eigen blog.
            </section>
          ) : null}
          {!view.hasBlogIndex ? (
            <section className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              Maak en publiceer eerst een pagina van type Blogoverzicht op
              <code className="mx-1">/blog</code>. Zonder die pagina blokkeert
              de publicatiecompiler blogroutes.
            </section>
          ) : null}

          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                Berichten
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {view.posts.length} bericht
                {view.posts.length === 1 ? "" : "en"} · geen geplande
                publicaties.
              </p>
            </div>
            {view.posts.length === 0 ? (
              <div className="veele-card flex flex-col items-center py-10 text-center">
                <FileText className="h-9 w-9 text-slate-400" />
                <h3 className="mt-3 font-semibold text-slate-900">
                  Nog geen blogberichten
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Maak een concept en publiceer het pas wanneer de inhoud gereed
                  is.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                {view.posts.map((post) => (
                  <Link
                    key={post.id}
                    href={`/website/blog/${post.id}`}
                    className="grid gap-2 border-b border-slate-100 px-4 py-4 last:border-b-0 hover:bg-slate-50 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto_auto] md:items-center md:gap-4"
                  >
                    <div>
                      <p className="font-medium text-slate-950">{post.title}</p>
                      <p className="mt-1 line-clamp-1 text-xs text-slate-500">
                        {post.excerpt}
                      </p>
                    </div>
                    <code className="truncate text-sm text-slate-600">
                      {post.path}
                    </code>
                    <Badge
                      variant={
                        post.status === "published" ? "default" : "outline"
                      }
                    >
                      {post.status === "draft"
                        ? "Concept"
                        : post.status === "published"
                          ? "Publiceerbaar"
                          : "Gearchiveerd"}
                    </Badge>
                    <PencilLine className="h-4 w-4 text-slate-400" />
                  </Link>
                ))}
              </div>
            )}
          </section>

          <WebsiteBlogTaxonomyEditor
            siteId={view.siteId}
            siteAuthoringRevision={view.authoringRevision}
            defaultLocale={view.defaultLocale}
            categories={view.categories}
            tags={view.tags}
            canWrite={canWrite}
          />
        </>
      )}
    </TenantPageShell>
  );
}
