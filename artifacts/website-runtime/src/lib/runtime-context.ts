import {
  resolveManagedWebsiteByHost,
  type ManagedWebsiteResolution,
} from "@workspace/db/website-public-runtime";
import { cache } from "react";
import { requestPathOwner } from "./request";

type ReadyWebsite = Extract<ManagedWebsiteResolution, { status: "ready" }>;
type PublicationPage = ReadyWebsite["snapshot"]["pages"][number];
type PublicationBlogPost = ReadyWebsite["snapshot"]["blog"]["posts"][number];
type PublicationBlogCategory =
  ReadyWebsite["snapshot"]["blog"]["categories"][number];
type PublicationBlogTag = ReadyWebsite["snapshot"]["blog"]["tags"][number];

export type ManagedWebsitePageContext = {
  resolution: ReadyWebsite;
  page: PublicationPage;
};

export type ManagedWebsiteRouteContext =
  | (ManagedWebsitePageContext & { kind: "page" })
  | {
      kind: "blog_post";
      resolution: ReadyWebsite;
      post: PublicationBlogPost;
    }
  | {
      kind: "blog_category";
      resolution: ReadyWebsite;
      category: PublicationBlogCategory;
      posts: PublicationBlogPost[];
    }
  | {
      kind: "blog_tag";
      resolution: ReadyWebsite;
      tag: PublicationBlogTag;
      posts: PublicationBlogPost[];
    };

export const loadManagedWebsiteResolution = cache(
  async (host: string): Promise<ManagedWebsiteResolution> => {
    try {
      return await resolveManagedWebsiteByHost(host);
    } catch {
      return { status: "unavailable", reason: "publication_unsupported" };
    }
  },
);

export async function loadManagedWebsitePageContext(
  host: string,
  pathname: string,
): Promise<ManagedWebsitePageContext | null> {
  if (requestPathOwner(host, pathname) !== "website") return null;
  const resolution = await loadManagedWebsiteResolution(host);
  if (resolution.status !== "ready") return null;
  const page = resolution.snapshot.pages.find(
    (candidate) =>
      candidate.locale === resolution.snapshot.defaultLocale &&
      candidate.path === pathname,
  );
  return page ? { resolution, page } : null;
}

export async function loadManagedWebsiteRouteContext(
  host: string,
  pathname: string,
): Promise<ManagedWebsiteRouteContext | null> {
  if (requestPathOwner(host, pathname) !== "website") return null;
  const resolution = await loadManagedWebsiteResolution(host);
  if (resolution.status !== "ready") return null;
  const locale = resolution.snapshot.defaultLocale;
  const page = resolution.snapshot.pages.find(
    (candidate) => candidate.locale === locale && candidate.path === pathname,
  );
  if (page) return { kind: "page", resolution, page };

  const publishedPosts = resolution.snapshot.blog.posts.filter(
    (post) => post.locale === locale && post.visibility === "published",
  );
  const post = publishedPosts.find((candidate) => candidate.path === pathname);
  if (post) return { kind: "blog_post", resolution, post };
  const category = resolution.snapshot.blog.categories.find(
    (candidate) => candidate.locale === locale && candidate.path === pathname,
  );
  if (category) {
    return {
      kind: "blog_category",
      resolution,
      category,
      posts: publishedPosts.filter(
        (candidate) => candidate.categoryId === category.id,
      ),
    };
  }
  const tag = resolution.snapshot.blog.tags.find(
    (candidate) => candidate.locale === locale && candidate.path === pathname,
  );
  if (tag) {
    return {
      kind: "blog_tag",
      resolution,
      tag,
      posts: publishedPosts.filter((candidate) =>
        candidate.tagIds.includes(tag.id),
      ),
    };
  }
  return null;
}

export function pathnameFromSlug(slug: string[] | undefined): string {
  return slug?.length ? `/${slug.join("/")}` : "/";
}
