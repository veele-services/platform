import type {
  WebsitePublicationSnapshot,
  WebsiteRichTextDocument,
  WebsiteSeo,
} from "@workspace/website-core";
import React, { type ReactElement } from "react";

type PublicationPage = WebsitePublicationSnapshot["pages"][number];
type PublicationPost = WebsitePublicationSnapshot["blog"]["posts"][number];

export type WebsiteStructuredDataRoute =
  | { kind: "page"; page: PublicationPage }
  | { kind: "blog_post"; post: PublicationPost }
  | {
      kind: "blog_category";
      path: string;
      title: string;
    }
  | {
      kind: "blog_tag";
      path: string;
      title: string;
    };

const ORGANIZATION_SCHEMA_TYPES = {
  organization: "Organization",
  local_business: "LocalBusiness",
  home_and_construction_business: "HomeAndConstructionBusiness",
  professional_service: "ProfessionalService",
} as const;

export function websiteCanonicalUrl(
  snapshot: WebsitePublicationSnapshot,
  seo: WebsiteSeo | null,
  routePath: string,
): string {
  return `https://${snapshot.canonicalHostname}${seo?.canonicalPath ?? routePath}`;
}

export function websiteSocialImageUrl(
  snapshot: WebsitePublicationSnapshot,
  seo: WebsiteSeo | null,
): string | null {
  return seo?.socialImageUrl ?? snapshot.defaultSeo.socialImageUrl;
}

function richTextPlainText(document: WebsiteRichTextDocument): string {
  const fragments: string[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (record.type === "text" && typeof record.text === "string") {
      fragments.push(record.text);
    }
    if (Array.isArray(record.content)) visit(record.content);
  };
  visit(document.content);
  return fragments.join(" ").replace(/\s+/gu, " ").trim();
}

function answerPlainText(value: string | WebsiteRichTextDocument): string {
  return typeof value === "string" ? value : richTextPlainText(value);
}

function routeIdentity(route: WebsiteStructuredDataRoute): {
  path: string;
  title: string;
} {
  if (route.kind === "page") {
    return { path: route.page.path, title: route.page.title };
  }
  if (route.kind === "blog_post") {
    return { path: route.post.path, title: route.post.title };
  }
  return { path: route.path, title: route.title };
}

function breadcrumbItems(
  snapshot: WebsitePublicationSnapshot,
  route: WebsiteStructuredDataRoute,
): Array<Record<string, unknown>> {
  const baseUrl = `https://${snapshot.canonicalHostname}`;
  const current = routeIdentity(route);
  const crumbs = [
    {
      name:
        snapshot.pages.find(
          (page) => page.locale === snapshot.defaultLocale && page.path === "/",
        )?.title ?? "Home",
      path: "/",
    },
  ];
  if (current.path.startsWith("/blog/") && current.path !== "/blog") {
    crumbs.push({ name: "Blog", path: "/blog" });
  }
  if (current.path !== "/") {
    crumbs.push({ name: current.title, path: current.path });
  }
  return crumbs.map((crumb, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: crumb.name,
    item: `${baseUrl}${crumb.path}`,
  }));
}

function organizationNode(
  snapshot: WebsitePublicationSnapshot,
): Record<string, unknown> {
  const baseUrl = `https://${snapshot.canonicalHostname}`;
  const contact = snapshot.contact;
  const type =
    ORGANIZATION_SCHEMA_TYPES[
      snapshot.seoSettings.structuredData.organizationType
    ];
  const node: Record<string, unknown> = {
    "@type": type,
    "@id": `${baseUrl}/#organization`,
    name: contact.companyName,
    url: baseUrl,
    description: snapshot.defaultSeo.description,
  };
  if (contact.email) node.email = contact.email;
  if (contact.phone) node.telephone = contact.phone;
  if (contact.openingHours.length > 0) {
    node.openingHours = contact.openingHours;
  }
  if (snapshot.socialLinks.length > 0) {
    node.sameAs = snapshot.socialLinks.map((link) => link.url);
  }
  if (contact.street && contact.postalCode && contact.city) {
    node.address = {
      "@type": "PostalAddress",
      streetAddress: contact.street,
      postalCode: contact.postalCode,
      addressLocality: contact.city,
      addressCountry: contact.countryCode,
    };
  }
  const socialImage = snapshot.defaultSeo.socialImageUrl;
  if (socialImage) node.image = socialImage;
  return node;
}

function pageSpecificNodes(
  snapshot: WebsitePublicationSnapshot,
  route: WebsiteStructuredDataRoute,
): Array<Record<string, unknown>> {
  const baseUrl = `https://${snapshot.canonicalHostname}`;
  const nodes: Array<Record<string, unknown>> = [];
  if (route.kind === "blog_post") {
    const canonical = websiteCanonicalUrl(
      snapshot,
      route.post.seo,
      route.post.path,
    );
    const article: Record<string, unknown> = {
      "@type": "Article",
      "@id": `${canonical}#article`,
      headline: route.post.title,
      description: route.post.seo.description,
      mainEntityOfPage: canonical,
      publisher: { "@id": `${baseUrl}/#organization` },
      dateModified: route.post.updatedAt,
    };
    if (route.post.publishedAt) {
      article.datePublished = route.post.publishedAt;
    }
    const image = websiteSocialImageUrl(snapshot, route.post.seo);
    if (image) article.image = [image];
    nodes.push(article);
  }

  if (route.kind === "page") {
    const faqQuestions = route.page.sections.flatMap((section) => {
      if (
        section.type !== "faq" ||
        !section.visible ||
        !section.content.schemaEligible
      ) {
        return [];
      }
      return section.content.items.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: answerPlainText(item.answer),
        },
      }));
    });
    if (faqQuestions.length > 0) {
      nodes.push({
        "@type": "FAQPage",
        "@id": `${websiteCanonicalUrl(snapshot, route.page.seo, route.page.path)}#faq`,
        mainEntity: faqQuestions,
      });
    }

    if (route.page.pageType === "service") {
      const services = route.page.sections.flatMap((section) =>
        section.type === "services_grid" && section.visible
          ? section.content.services
          : [],
      );
      for (const service of services) {
        nodes.push({
          "@type": "Service",
          name: service.title,
          description: service.description,
          url: websiteCanonicalUrl(snapshot, route.page.seo, route.page.path),
          provider: { "@id": `${baseUrl}/#organization` },
        });
      }
    }
  }
  return nodes;
}

export function buildWebsiteStructuredData(
  snapshot: WebsitePublicationSnapshot,
  route: WebsiteStructuredDataRoute,
): Record<string, unknown> | null {
  if (!snapshot.seoSettings.structuredData.enabled) return null;
  const current = routeIdentity(route);
  const canonical =
    route.kind === "page"
      ? websiteCanonicalUrl(snapshot, route.page.seo, route.page.path)
      : route.kind === "blog_post"
        ? websiteCanonicalUrl(snapshot, route.post.seo, route.post.path)
        : `https://${snapshot.canonicalHostname}${current.path}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      organizationNode(snapshot),
      {
        "@type": "BreadcrumbList",
        "@id": `${canonical}#breadcrumbs`,
        itemListElement: breadcrumbItems(snapshot, route),
      },
      ...pageSpecificNodes(snapshot, route),
    ],
  };
}

export function safeJsonLd(value: Record<string, unknown>): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

export function WebsiteStructuredData({
  snapshot,
  route,
  nonce,
}: {
  snapshot: WebsitePublicationSnapshot;
  route: WebsiteStructuredDataRoute;
  nonce?: string;
}): ReactElement | null {
  const data = buildWebsiteStructuredData(snapshot, route);
  if (!data) return null;
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: safeJsonLd(data) }}
    />
  );
}
