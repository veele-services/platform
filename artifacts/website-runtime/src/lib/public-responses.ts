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
  const urls = resolution.snapshot.pages
    .filter(
      (page) =>
        page.locale === resolution.snapshot.defaultLocale &&
        resolution.snapshot.defaultSeo.indexable &&
        page.seo.indexable,
    )
    .map(
      (page) =>
        `<url><loc>${xmlEscape(`https://${resolution.canonicalHostname}${page.path}`)}</loc></url>`,
    )
    .join("");
  const content = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
  return new Response(content, {
    headers: websiteResponseHeaders("application/xml; charset=utf-8", {
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
