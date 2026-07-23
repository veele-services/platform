import {
  resolveManagedWebsiteByHost,
  type ManagedWebsiteResolution,
} from "@workspace/db/website-public-runtime";
import {
  neutralErrorResponse,
  notModifiedResponse,
  websiteResponseHeaders,
} from "./http";
import { requestHost } from "./request";

export type ManagedWebsiteResolver = (
  host: string,
) => Promise<ManagedWebsiteResolution>;

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function derivedEtag(etag: string, suffix: string): string {
  return etag.endsWith('"') ? `${etag.slice(0, -1)}-${suffix}"` : etag;
}

async function resolveRequest(
  request: Request,
  resolver: ManagedWebsiteResolver,
): Promise<ManagedWebsiteResolution> {
  try {
    return await resolver(requestHost(request));
  } catch {
    return { status: "unavailable", reason: "publication_unsupported" };
  }
}

export async function managedWebsiteRobotsResponse(
  request: Request,
  resolver: ManagedWebsiteResolver = resolveManagedWebsiteByHost,
): Promise<Response> {
  const resolution = await resolveRequest(request, resolver);
  if (resolution.status === "not_found") return neutralErrorResponse(404);
  if (resolution.status === "unavailable") return neutralErrorResponse(503);

  const etag = derivedEtag(resolution.etag, "robots");
  if (request.headers.get("if-none-match") === etag)
    return notModifiedResponse(etag);
  const indexable = resolution.snapshot.defaultSeo.indexable;
  const rules = indexable
    ? [
        "Allow: /",
        "Disallow: /admin",
        "Disallow: /personeel",
        "Disallow: /klant",
        "Disallow: /api",
      ]
    : ["Disallow: /"];
  const content = [
    "User-agent: *",
    ...rules,
    `Sitemap: https://${resolution.canonicalHostname}/sitemap.xml`,
    "",
  ].join("\n");
  return new Response(content, {
    headers: websiteResponseHeaders("text/plain; charset=utf-8", {
      ETag: etag,
    }),
  });
}

export async function managedWebsiteSitemapResponse(
  request: Request,
  resolver: ManagedWebsiteResolver = resolveManagedWebsiteByHost,
): Promise<Response> {
  const resolution = await resolveRequest(request, resolver);
  if (resolution.status === "not_found") return neutralErrorResponse(404);
  if (resolution.status === "unavailable") return neutralErrorResponse(503);

  const etag = derivedEtag(resolution.etag, "sitemap");
  if (request.headers.get("if-none-match") === etag)
    return notModifiedResponse(etag);
  const pageUrls = resolution.snapshot.pages
    .filter(
      (page) =>
        page.locale === resolution.snapshot.defaultLocale &&
        resolution.snapshot.defaultSeo.indexable &&
        page.seo.indexable,
    )
    .map((page) => `https://${resolution.canonicalHostname}${page.path}`);
  const publishedPosts = resolution.snapshot.blog.posts.filter(
    (post) =>
      post.locale === resolution.snapshot.defaultLocale &&
      post.visibility === "published" &&
      resolution.snapshot.defaultSeo.indexable &&
      post.seo.indexable,
  );
  const usedCategoryIds = new Set(
    publishedPosts.flatMap((post) =>
      post.categoryId ? [post.categoryId] : [],
    ),
  );
  const usedTagIds = new Set(publishedPosts.flatMap((post) => post.tagIds));
  const blogUrls = [
    ...publishedPosts.map(
      (post) => `https://${resolution.canonicalHostname}${post.path}`,
    ),
    ...resolution.snapshot.blog.categories
      .filter(
        (category) =>
          category.locale === resolution.snapshot.defaultLocale &&
          usedCategoryIds.has(category.id),
      )
      .map(
        (category) => `https://${resolution.canonicalHostname}${category.path}`,
      ),
    ...resolution.snapshot.blog.tags
      .filter(
        (tag) =>
          tag.locale === resolution.snapshot.defaultLocale &&
          usedTagIds.has(tag.id),
      )
      .map((tag) => `https://${resolution.canonicalHostname}${tag.path}`),
  ];
  const urls = [...new Set([...pageUrls, ...blogUrls])]
    .sort()
    .map((url) => `<url><loc>${xmlEscape(url)}</loc></url>`)
    .join("");
  const content = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
  return new Response(content, {
    headers: websiteResponseHeaders("application/xml; charset=utf-8", {
      ETag: etag,
    }),
  });
}

export async function managedWebsiteFeedResponse(
  request: Request,
  resolver: ManagedWebsiteResolver = resolveManagedWebsiteByHost,
): Promise<Response> {
  const resolution = await resolveRequest(request, resolver);
  if (resolution.status === "not_found") return neutralErrorResponse(404);
  if (resolution.status === "unavailable") return neutralErrorResponse(503);

  const etag = derivedEtag(resolution.etag, "feed");
  if (request.headers.get("if-none-match") === etag)
    return notModifiedResponse(etag);
  const baseUrl = `https://${resolution.canonicalHostname}`;
  const posts = resolution.snapshot.blog.posts
    .filter(
      (post) =>
        post.locale === resolution.snapshot.defaultLocale &&
        post.visibility === "published" &&
        post.publishedAt,
    )
    .sort((left, right) =>
      (right.publishedAt ?? "").localeCompare(left.publishedAt ?? ""),
    );
  const items = posts
    .map((post) => {
      const url = `${baseUrl}${post.path}`;
      return [
        "<item>",
        `<title>${xmlEscape(post.title)}</title>`,
        `<link>${xmlEscape(url)}</link>`,
        `<guid isPermaLink="true">${xmlEscape(url)}</guid>`,
        `<description>${xmlEscape(post.excerpt)}</description>`,
        `<pubDate>${new Date(post.publishedAt!).toUTCString()}</pubDate>`,
        "</item>",
      ].join("");
    })
    .join("");
  const content = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0"><channel>',
    `<title>${xmlEscape(`${resolution.snapshot.contact.companyName} blog`)}</title>`,
    `<link>${xmlEscape(`${baseUrl}/blog`)}</link>`,
    `<description>${xmlEscape(resolution.snapshot.defaultSeo.description)}</description>`,
    items,
    "</channel></rss>",
  ].join("");
  return new Response(content, {
    headers: websiteResponseHeaders("application/rss+xml; charset=utf-8", {
      ETag: etag,
    }),
  });
}

export async function managedWebsiteRedirectResponse(
  request: Request,
  resolver: ManagedWebsiteResolver = resolveManagedWebsiteByHost,
): Promise<Response | null> {
  const resolution = await resolveRequest(request, resolver);
  if (resolution.status !== "ready") return null;

  const requestUrl = new URL(request.url);
  const redirect = resolution.snapshot.redirects.find(
    (candidate) =>
      candidate.locale === resolution.snapshot.defaultLocale &&
      candidate.sourcePath === requestUrl.pathname,
  );
  if (!redirect) return null;

  const destination =
    redirect.destinationType === "path"
      ? new URL(
          `${redirect.destination}${requestUrl.search}`,
          `https://${resolution.canonicalHostname}`,
        )
      : new URL(redirect.destination);
  const headers = websiteResponseHeaders("text/plain; charset=utf-8", {
    Location: destination.toString(),
    "X-Robots-Tag": "noindex, follow",
  });
  headers.set("Cache-Control", "private, no-store");
  return new Response(null, {
    status: redirect.statusCode,
    headers,
  });
}
