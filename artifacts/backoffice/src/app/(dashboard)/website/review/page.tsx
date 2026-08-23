import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getWebsiteOverviewAction,
  getWebsitePublicationReviewAction,
} from "@/app/actions/website";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { Badge } from "@/components/ui/badge";
import { WebsitePublicationReviewPanel } from "@/components/website/WebsitePublicationReviewPanel";
import { WebsiteTabs } from "@/components/website/WebsiteTabs";
import { TenantPageHeader, TenantPageShell } from "@/components/tenant-ui";
import { hasPermission } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Website publicatiereview" };

export default async function WebsitePublicationReviewPage() {
  const [
    canReadPages,
    canReadBlog,
    canReadSettings,
    canReadNavigation,
    canReadForms,
    canPublishPages,
    canPublishBlog,
  ] = await Promise.all([
    hasPermission("website_pages", "read"),
    hasPermission("website_blog", "read"),
    hasPermission("website_settings", "read"),
    hasPermission("website_navigation", "read"),
    hasPermission("website_forms", "read"),
    hasPermission("website_pages", "publish"),
    hasPermission("website_blog", "publish"),
  ]);
  if (!canReadPages) {
    return <ForbiddenPage resource="website_pages" action="read" />;
  }
  if (!canReadBlog) {
    return <ForbiddenPage resource="website_blog" action="read" />;
  }
  const overview = await getWebsiteOverviewAction();
  if (!overview.site) notFound();
  const review = await getWebsitePublicationReviewAction(overview.site.id);

  return (
    <TenantPageShell size="default">
      <TenantPageHeader
        title="Preview en publicatiereview"
        eyebrow="Websitebeheer"
        description="Controleer de volledige draft, maak een kortlevende preview en activeer uitsluitend een exact gereviewde immutable publicatie."
        breadcrumbs={[
          { label: "Website", href: "/website" },
          { label: "Publicatiereview" },
        ]}
        badges={
          <>
            <Badge variant="outline">Revisie {review.authoringRevision}</Badge>
            <Badge>
              {review.deliveryMode === "managed_cms"
                ? "Managed CMS"
                : "Custom blijft live"}
            </Badge>
          </>
        }
      />
      <WebsiteTabs />
      <WebsitePublicationReviewPanel
        initialReview={review}
        canPublish={canPublishPages && canPublishBlog}
        diagnosticAccess={{
          settings: canReadSettings,
          navigation: canReadNavigation,
          forms: canReadForms,
        }}
      />
    </TenantPageShell>
  );
}
