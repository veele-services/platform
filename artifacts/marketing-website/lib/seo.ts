import type { Metadata } from "next";
import {
  absoluteUrl,
  getBreadcrumbs,
  getPageTemplate,
  getPublicDescription,
  getPublicTitle,
  isIndexablePage,
  serializeJsonLd,
  SITE_NAME,
  stripMarkup,
  type SitePage,
} from "@/lib/site";

export function metadataForPage(page: SitePage): Metadata {
  const title = getPublicTitle(page);
  const description = getPublicDescription(page);
  const canonical = absoluteUrl(page.slug);
  const indexable = isIndexablePage(page);

  return {
    title,
    description,
    alternates: {
      canonical,
      languages: { "nl-NL": canonical },
    },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: SITE_NAME,
      locale: "nl_NL",
      type: "website",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
    robots: {
      index: indexable,
      follow: true,
      googleBot: {
        index: indexable,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
  };
}

function schemaTypeFor(page: SitePage) {
  const template = getPageTemplate(page);

  if (page.slug === "/over-ons") return "AboutPage";
  if (page.slug === "/contact") return "ContactPage";
  if (["services-overview", "sectors-overview", "editorial"].includes(template)) {
    return "CollectionPage";
  }
  return "WebPage";
}

export function structuredDataForPage(page: SitePage) {
  const url = absoluteUrl(page.slug);
  const description = getPublicDescription(page);
  const breadcrumbs = getBreadcrumbs(page);
  const template = getPageTemplate(page);
  const hasServiceSchema = ["service-detail", "services-overview", "sector-detail", "local"].includes(
    template,
  );
  const serviceId = `${url}#service`;
  const faqId = `${url}#faq`;
  const graph: Record<string, unknown>[] = [
    {
      "@type": schemaTypeFor(page),
      "@id": `${url}#webpage`,
      url,
      name: getPublicTitle(page),
      description,
      inLanguage: "nl-NL",
      isPartOf: { "@id": `${absoluteUrl("/")}#website` },
      breadcrumb: { "@id": `${url}#breadcrumb` },
      ...(hasServiceSchema ? { mainEntity: { "@id": serviceId } } : {}),
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${url}#breadcrumb`,
      itemListElement: breadcrumbs.map((breadcrumb, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: breadcrumb.name,
        item: absoluteUrl(breadcrumb.href),
      })),
    },
  ];

  if (hasServiceSchema) {
    graph.push({
      "@type": "Service",
      "@id": serviceId,
      name: page.name,
      description,
      url,
      provider: { "@id": `${absoluteUrl("/")}#organization` },
    });
  }

  if (page.faqs.length > 0) {
    graph.push({
      "@type": "FAQPage",
      "@id": faqId,
      mainEntity: page.faqs.map(([question, answer]) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: {
          "@type": "Answer",
          text: stripMarkup(answer),
        },
      })),
    });
  }

  return serializeJsonLd({
    "@context": "https://schema.org",
    "@graph": graph,
  });
}
