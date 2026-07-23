import {
  ManagedWebsiteBlogArchiveView,
  ManagedWebsiteBlogPostView,
  ManagedWebsiteView,
} from "@/lib/render-document";
import {
  loadManagedWebsiteRouteContext,
  pathnameFromSlug,
} from "@/lib/runtime-context";
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
    const canonical = `https://${resolution.canonicalHostname}${context.page.path}`;
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
      },
    };
  }
  if (context.kind === "blog_post") {
    const canonical = `https://${resolution.canonicalHostname}${context.post.path}`;
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
  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: indexable, follow: indexable },
    openGraph: { type: "website", title, description, url: canonical },
  };
}

export default async function ManagedWebsitePage(props: PageProps) {
  const context = await contextForRequest(props);
  if (!context) notFound();
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
      <ManagedWebsiteView
        snapshot={context.resolution.snapshot}
        page={context.page}
        deliveryRevision={context.resolution.deliveryRevision}
        formState={formState}
        submissionId={randomUUID()}
      />
    );
  }
  if (context.kind === "blog_post") {
    return (
      <ManagedWebsiteBlogPostView
        snapshot={context.resolution.snapshot}
        post={context.post}
        deliveryRevision={context.resolution.deliveryRevision}
      />
    );
  }
  if (context.kind === "blog_category") {
    return (
      <ManagedWebsiteBlogArchiveView
        snapshot={context.resolution.snapshot}
        title={context.category.name}
        description={context.category.description}
        posts={context.posts}
        deliveryRevision={context.resolution.deliveryRevision}
      />
    );
  }
  return (
    <ManagedWebsiteBlogArchiveView
      snapshot={context.resolution.snapshot}
      title={`Tag: ${context.tag.name}`}
      posts={context.posts}
      deliveryRevision={context.resolution.deliveryRevision}
    />
  );
}
