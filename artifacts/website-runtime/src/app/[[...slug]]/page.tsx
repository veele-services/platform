import {
  ManagedWebsiteBlogArchiveView,
  ManagedWebsiteBlogPostView,
  ManagedWebsiteView,
} from "@/lib/render-document";
import {
  loadManagedWebsiteRouteContext,
  pathnameFromSlug,
} from "@/lib/runtime-context";
import {
  WebsiteStructuredData,
  websiteCanonicalUrl,
  websiteSocialImageUrl,
} from "@/lib/seo";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

type PageProps = {
  params: Promise<{ slug?: string[] }>;
  searchParams?: Promise<{ formulier?: string | string[] }>;
};

async function contextForRequest(props: PageProps) {
  const [requestHeaders, params] = await Promise.all([headers(), props.params]);
  return loadManagedWebsiteRouteContext(
    requestHeaders.get("host") ?? "",
    pathnameFromSlug(params.slug),
  );
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const context = await contextForRequest(props);
  if (!context) {
    return {
      title: "Pagina niet gevonden",
      robots: { index: false, follow: false },
    };
  }

  const { resolution } = context;
  if (context.kind === "page") {
    const canonical = websiteCanonicalUrl(
      resolution.snapshot,
      context.page.seo,
      context.page.path,
    );
    const socialImage = websiteSocialImageUrl(
      resolution.snapshot,
      context.page.seo,
    );
    const indexable =
      resolution.snapshot.defaultSeo.indexable && context.page.seo.indexable;
    return {
      title: context.page.seo.title,
      description: context.page.seo.description,
      alternates: { canonical },
      robots: { index: indexable, follow: indexable },
      openGraph: {
        type: "website",
        title: context.page.seo.title,
        description: context.page.seo.description,
        url: canonical,
        images: socialImage
          ? [{ url: socialImage, alt: context.page.seo.title }]
          : undefined,
      },
      twitter: {
        card: socialImage ? "summary_large_image" : "summary",
        title: context.page.seo.title,
        description: context.page.seo.description,
        images: socialImage ? [socialImage] : undefined,
      },
    };
  }
  if (context.kind === "blog_post") {
    const canonical = websiteCanonicalUrl(
      resolution.snapshot,
      context.post.seo,
      context.post.path,
    );
    const socialImage = websiteSocialImageUrl(
      resolution.snapshot,
      context.post.seo,
    );
    const indexable =
      resolution.snapshot.defaultSeo.indexable && context.post.seo.indexable;
    return {
      title: context.post.seo.title,
      description: context.post.seo.description,
      alternates: { canonical },
      robots: { index: indexable, follow: indexable },
      openGraph: {
        type: "article",
        title: context.post.seo.title,
        description: context.post.seo.description,
        url: canonical,
        publishedTime: context.post.publishedAt ?? undefined,
        modifiedTime: context.post.updatedAt,
        images: socialImage
          ? [{ url: socialImage, alt: context.post.seo.title }]
          : undefined,
      },
      twitter: {
        card: socialImage ? "summary_large_image" : "summary",
        title: context.post.seo.title,
        description: context.post.seo.description,
        images: socialImage ? [socialImage] : undefined,
      },
    };
  }
  const archive =
    context.kind === "blog_category" ? context.category : context.tag;
  const canonical = `https://${resolution.canonicalHostname}${archive.path}`;
  const title =
    context.kind === "blog_category"
      ? `${context.category.name} | Blog`
      : `Tag: ${context.tag.name} | Blog`;
  const description =
    context.kind === "blog_category"
      ? (context.category.description ??
        `Blogberichten in de categorie ${context.category.name}.`)
      : `Blogberichten met de tag ${context.tag.name}.`;
  const indexable = resolution.snapshot.defaultSeo.indexable;
  const socialImage = websiteSocialImageUrl(resolution.snapshot, null);
  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: indexable, follow: indexable },
    openGraph: {
      type: "website",
      title,
      description,
      url: canonical,
      images: socialImage ? [{ url: socialImage, alt: title }] : undefined,
    },
    twitter: {
      card: socialImage ? "summary_large_image" : "summary",
      title,
      description,
      images: socialImage ? [socialImage] : undefined,
    },
  };
}

export default async function ManagedWebsitePage(props: PageProps) {
  const [context, requestHeaders] = await Promise.all([
    contextForRequest(props),
    headers(),
  ]);
  if (!context) notFound();
  const nonce = requestHeaders.get("x-nonce") ?? undefined;
  if (context.kind === "page") {
    const query = props.searchParams ? await props.searchParams : {};
    const rawFormState = Array.isArray(query.formulier)
      ? query.formulier[0]
      : query.formulier;
    const formState =
      rawFormState === "verzonden" ||
      rawFormState === "fout" ||
      rawFormState === "later"
        ? rawFormState
        : undefined;
    return (
      <>
        <WebsiteStructuredData
          snapshot={context.resolution.snapshot}
          route={{ kind: "page", page: context.page }}
          nonce={nonce}
        />
        <ManagedWebsiteView
          snapshot={context.resolution.snapshot}
          page={context.page}
          deliveryRevision={context.resolution.deliveryRevision}
          formState={formState}
          submissionId={randomUUID()}
        />
      </>
    );
  }
  if (context.kind === "blog_post") {
    return (
      <>
        <WebsiteStructuredData
          snapshot={context.resolution.snapshot}
          route={{ kind: "blog_post", post: context.post }}
          nonce={nonce}
        />
        <ManagedWebsiteBlogPostView
          snapshot={context.resolution.snapshot}
          post={context.post}
          deliveryRevision={context.resolution.deliveryRevision}
        />
      </>
    );
  }
  if (context.kind === "blog_category") {
    return (
      <>
        <WebsiteStructuredData
          snapshot={context.resolution.snapshot}
          route={{
            kind: "blog_category",
            path: context.category.path,
            title: context.category.name,
          }}
          nonce={nonce}
        />
        <ManagedWebsiteBlogArchiveView
          snapshot={context.resolution.snapshot}
          title={context.category.name}
          description={context.category.description}
          posts={context.posts}
          deliveryRevision={context.resolution.deliveryRevision}
        />
      </>
    );
  }
  return (
    <>
      <WebsiteStructuredData
        snapshot={context.resolution.snapshot}
        route={{
          kind: "blog_tag",
          path: context.tag.path,
          title: `Tag: ${context.tag.name}`,
        }}
        nonce={nonce}
      />
      <ManagedWebsiteBlogArchiveView
        snapshot={context.resolution.snapshot}
        title={`Tag: ${context.tag.name}`}
        posts={context.posts}
        deliveryRevision={context.resolution.deliveryRevision}
      />
    </>
  );
}
