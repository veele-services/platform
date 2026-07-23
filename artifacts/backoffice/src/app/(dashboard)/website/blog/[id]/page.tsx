import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getWebsiteBlogAction,
  getWebsiteBlogPostAction,
} from "@/app/actions/website";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { Badge } from "@/components/ui/badge";
import { WebsiteBlogPostEditor } from "@/components/website/WebsiteBlogPostEditor";
import { WebsiteTabs } from "@/components/website/WebsiteTabs";
import { TenantPageHeader, TenantPageShell } from "@/components/tenant-ui";
import { hasPermission } from "@/lib/auth/permissions";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    if (!(await hasPermission("website_blog", "read"))) {
      return { title: "Toegang geweigerd" };
    }
    const post = await getWebsiteBlogPostAction(id);
    return { title: post?.title ?? "Blogbericht" };
  } catch {
    return { title: "Blogbericht" };
  }
}

export default async function WebsiteBlogPostPage({ params }: Props) {
  const [canRead, canWrite, canPublish] = await Promise.all([
    hasPermission("website_blog", "read"),
    hasPermission("website_blog", "write"),
    hasPermission("website_blog", "publish"),
  ]);
  if (!canRead) {
    return <ForbiddenPage resource="website_blog" action="read" />;
  }
  const { id } = await params;
  const [view, post] = await Promise.all([
    getWebsiteBlogAction(),
    getWebsiteBlogPostAction(id),
  ]);
  if (!view || !post) notFound();

  return (
    <TenantPageShell>
      <TenantPageHeader
        title={post.title}
        description="Opslaan maakt de inhoud concept. Expliciet publiceren maakt het bericht kandidaat voor de volgende immutable websitepublicatie."
        breadcrumbs={[
          { label: "Website", href: "/website" },
          { label: "Blog", href: "/website/blog" },
          { label: post.title },
        ]}
        badges={
          <>
            <Badge variant="outline">
              {post.status === "draft"
                ? "Concept"
                : post.status === "published"
                  ? "Publiceerbaar"
                  : "Gearchiveerd"}
            </Badge>
            <Badge variant="outline">Revisie {post.authoringRevision}</Badge>
          </>
        }
      />
      <WebsiteTabs />
      <WebsiteBlogPostEditor
        key={`${post.siteAuthoringRevision}-${post.authoringRevision}`}
        siteId={post.siteId}
        siteAuthoringRevision={post.siteAuthoringRevision}
        defaultLocale={view.defaultLocale}
        categories={view.categories}
        tags={view.tags}
        post={post}
        canWrite={canWrite && post.status !== "archived"}
        canPublish={canPublish}
      />
    </TenantPageShell>
  );
}
