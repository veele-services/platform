import { loadWebsitePreviewSession } from "@workspace/db";
import {
  hashWebsitePreviewToken,
  verifyWebsitePreviewToken,
} from "@workspace/website-core/preview-token";
import {
  ManagedWebsiteBlogArchiveView,
  ManagedWebsiteBlogPostView,
  ManagedWebsiteView,
} from "@workspace/shared-ui/website-renderer";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasPermission } from "@/lib/auth/permissions";
import {
  getCurrentBackofficeUser,
  requireCurrentTenantId,
} from "@/lib/auth/tenant";
import { backofficePath } from "@/lib/backoffice-paths";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Websitepreview",
  robots: { index: false, follow: false, nocache: true },
};

type Props = {
  params: Promise<{ token: string; slug?: string[] }>;
};

function previewPath(slug: string[] | undefined): string {
  return slug?.length ? `/${slug.join("/")}` : "/";
}

function previewSigningSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is niet ingesteld");
  return secret;
}

export default async function WebsitePreviewPage({ params }: Props) {
  const [{ token, slug }, user, tenantId, canReadPages, canReadBlog] =
    await Promise.all([
      params,
      getCurrentBackofficeUser(),
      requireCurrentTenantId(),
      hasPermission("website_pages", "read"),
      hasPermission("website_blog", "read"),
    ]);
  if (
    !user ||
    !canReadPages ||
    !canReadBlog ||
    !verifyWebsitePreviewToken(token, previewSigningSecret())
  ) {
    notFound();
  }

  const preview = await loadWebsitePreviewSession({
    tenantId,
    actorUserId: user.id,
    tokenHash: hashWebsitePreviewToken(token),
  });
  if (!preview) notFound();

  const pathname = previewPath(slug);
  const page = preview.snapshot.pages.find(
    (candidate) =>
      candidate.locale === preview.snapshot.defaultLocale &&
      candidate.path === pathname,
  );
  const previewRoot = backofficePath(`/website-preview/${token}`);
  const locale = preview.snapshot.defaultLocale;
  const blogPosts = preview.snapshot.blog.posts.filter(
    (post) => post.locale === locale,
  );
  const post = blogPosts.find((candidate) => candidate.path === pathname);
  const category = preview.snapshot.blog.categories.find(
    (candidate) => candidate.locale === locale && candidate.path === pathname,
  );
  const tag = preview.snapshot.blog.tags.find(
    (candidate) => candidate.locale === locale && candidate.path === pathname,
  );
  if (!page && !post && !category && !tag) notFound();

  const content = page ? (
    <ManagedWebsiteView
      snapshot={preview.snapshot}
      page={page}
      deliveryRevision={preview.snapshot.deliveryRevision}
      internalPathPrefix={previewRoot}
      includePreviewBlogPosts
    />
  ) : post ? (
    <ManagedWebsiteBlogPostView
      snapshot={preview.snapshot}
      post={post}
      deliveryRevision={preview.snapshot.deliveryRevision}
      internalPathPrefix={previewRoot}
    />
  ) : category ? (
    <ManagedWebsiteBlogArchiveView
      snapshot={preview.snapshot}
      title={category.name}
      description={category.description}
      posts={blogPosts.filter(
        (candidate) => candidate.categoryId === category.id,
      )}
      deliveryRevision={preview.snapshot.deliveryRevision}
      internalPathPrefix={previewRoot}
    />
  ) : tag ? (
    <ManagedWebsiteBlogArchiveView
      snapshot={preview.snapshot}
      title={`Tag: ${tag.name}`}
      posts={blogPosts.filter((candidate) => candidate.tagIds.includes(tag.id))}
      deliveryRevision={preview.snapshot.deliveryRevision}
      internalPathPrefix={previewRoot}
    />
  ) : null;
  return (
    <>
      <aside
        aria-label="Previewstatus"
        className="sticky top-0 z-[100] flex flex-wrap items-center justify-between gap-3 border-b border-amber-300 bg-amber-100 px-4 py-3 text-sm text-amber-950 shadow-sm"
      >
        <div>
          <strong>Conceptpreview</strong>
          <span className="ml-2">
            revisie {preview.sourceRevision} · verloopt om{" "}
            {new Intl.DateTimeFormat("nl-NL", {
              hour: "2-digit",
              minute: "2-digit",
            }).format(new Date(preview.expiresAt))}
          </span>
        </div>
        <a
          className="font-semibold underline underline-offset-4"
          href={backofficePath("/website/review")}
        >
          Terug naar publicatiereview
        </a>
      </aside>
      {content}
    </>
  );
}
