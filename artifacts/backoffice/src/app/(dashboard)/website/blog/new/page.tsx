import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getWebsiteBlogAction } from "@/app/actions/website";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { WebsiteBlogPostEditor } from "@/components/website/WebsiteBlogPostEditor";
import { WebsiteTabs } from "@/components/website/WebsiteTabs";
import { TenantPageHeader, TenantPageShell } from "@/components/tenant-ui";
import { hasPermission } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Nieuw blogbericht" };

export default async function NewWebsiteBlogPostPage() {
  const [canRead, canWrite, canPublish] = await Promise.all([
    hasPermission("website_blog", "read"),
    hasPermission("website_blog", "write"),
    hasPermission("website_blog", "publish"),
  ]);
  if (!canRead) {
    return <ForbiddenPage resource="website_blog" action="read" />;
  }
  if (!canWrite) {
    return <ForbiddenPage resource="website_blog" action="write" />;
  }
  const view = await getWebsiteBlogAction();
  if (!view) notFound();

  return (
    <TenantPageShell>
      <TenantPageHeader
        title="Nieuw blogbericht"
        description="Het bericht begint als privéconcept. Er bestaat bewust geen geplande publicatie."
        breadcrumbs={[
          { label: "Website", href: "/website" },
          { label: "Blog", href: "/website/blog" },
          { label: "Nieuw bericht" },
        ]}
      />
      <WebsiteTabs />
      <WebsiteBlogPostEditor
        siteId={view.siteId}
        siteAuthoringRevision={view.authoringRevision}
        defaultLocale={view.defaultLocale}
        categories={view.categories}
        tags={view.tags}
        canWrite={canWrite}
        canPublish={canPublish}
      />
    </TenantPageShell>
  );
}
