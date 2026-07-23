import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getWebsitePageAction } from "@/app/actions/website";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { Badge } from "@/components/ui/badge";
import { WebsitePageForm } from "@/components/website/WebsitePageForm";
import { WebsiteTabs } from "@/components/website/WebsiteTabs";
import { TenantPageHeader, TenantPageShell } from "@/components/tenant-ui";
import { hasPermission } from "@/lib/auth/permissions";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    if (!(await hasPermission("website_pages", "read"))) {
      return { title: "Toegang geweigerd" };
    }
    const page = await getWebsitePageAction(id);
    return { title: page?.title ?? "Websitepagina" };
  } catch {
    return { title: "Websitepagina" };
  }
}

export default async function WebsitePageEditor({ params }: Props) {
  const [canRead, canWrite] = await Promise.all([
    hasPermission("website_pages", "read"),
    hasPermission("website_pages", "write"),
  ]);
  if (!canRead) {
    return <ForbiddenPage resource="website_pages" action="read" />;
  }
  const { id } = await params;
  const page = await getWebsitePageAction(id);
  if (!page) notFound();

  return (
    <TenantPageShell size="default">
      <TenantPageHeader
        title={page.title}
        description="Bewerk pagina- en SEO-metadata. Opslaan wijzigt alleen het concept."
        breadcrumbs={[
          { label: "Website", href: "/website" },
          { label: "Pagina's", href: "/website/pages" },
          { label: page.title },
        ]}
        badges={
          <>
            <Badge variant="outline">
              {page.status === "draft"
                ? "Concept"
                : page.status === "published"
                  ? "Gepubliceerd"
                  : "Gearchiveerd"}
            </Badge>
            <Badge variant="outline">Revisie {page.authoringRevision}</Badge>
          </>
        }
      />
      <WebsiteTabs />

      <WebsitePageForm
        siteId={page.siteId}
        siteAuthoringRevision={page.siteAuthoringRevision}
        canWrite={canWrite}
        page={{
          id: page.id,
          title: page.title,
          navigationLabel: page.navigationLabel,
          locale: page.locale,
          slug: page.slug,
          path: page.path,
          pageType: page.pageType,
          isHomepage: page.isHomepage,
          seo: page.seo,
          authoringRevision: page.authoringRevision,
        }}
      />

      <section className="veele-card">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-slate-950">Secties</h2>
            <p className="mt-1 text-sm text-slate-600">
              {page.sectionCount === 0
                ? "Deze pagina heeft nog geen secties."
                : `${page.sectionCount} schema-gevalideerde sectie${page.sectionCount === 1 ? "" : "s"}.`}
            </p>
          </div>
          <Badge variant="outline">Volgende Phase 3-increment</Badge>
        </div>
        {page.sections.length > 0 && (
          <ol className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {page.sections.map((section) => (
              <li
                key={section.id}
                className="flex items-center justify-between gap-3 px-3 py-3 text-sm"
              >
                <span className="font-medium text-slate-800">
                  {section.position + 1}.{" "}
                  {section.sectionKey.replaceAll("_", " ")}
                </span>
                <span className="text-xs text-slate-500">
                  {section.variantKey} ·{" "}
                  {section.isVisible ? "zichtbaar" : "verborgen"}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </TenantPageShell>
  );
}
