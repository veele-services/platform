import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getWebsitePageAction } from "@/app/actions/website";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { Badge } from "@/components/ui/badge";
import { WebsitePageForm } from "@/components/website/WebsitePageForm";
import { WebsiteSectionCanvas } from "@/components/website/WebsiteSectionCanvas";
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
        description="Bewerk metadata en contentsecties. Opslaan wijzigt alleen het concept."
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
        key={`page-${page.siteAuthoringRevision}-${page.authoringRevision}`}
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
      <WebsiteSectionCanvas
        key={`sections-${page.siteAuthoringRevision}-${page.authoringRevision}`}
        siteId={page.siteId}
        pageId={page.id}
        siteAuthoringRevision={page.siteAuthoringRevision}
        pageAuthoringRevision={page.authoringRevision}
        sections={page.sections}
        canWrite={canWrite}
      />
    </TenantPageShell>
  );
}
