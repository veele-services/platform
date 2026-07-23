import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { Hero } from "@/components/marketing/hero";
import { PageSections } from "@/components/marketing/page-sections";
import { getPage, getPageTemplate, pages, pathnameFromSegments } from "@/lib/site";
import { metadataForPage, structuredDataForPage } from "@/lib/seo";

type Props = {
  params: Promise<{ slug?: string[] }>;
};

export const dynamicParams = true;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = getPage(pathnameFromSegments(slug));

  if (!page) {
    return {
      title: "Pagina niet gevonden | Veele Services",
      robots: { index: false, follow: false },
    };
  }

  return metadataForPage(page);
}

export function generateStaticParams() {
  return pages.map((page) => ({
    slug: page.slug.split("/").filter(Boolean),
  }));
}

export default async function MarketingPage({ params }: Props) {
  const { slug } = await params;
  const pathname = pathnameFromSegments(slug);
  const page = getPage(pathname);

  if (!page) notFound();

  const template = getPageTemplate(page);

  return (
    <article data-page-group={page.group} data-page-template={template}>
      <Hero page={page} />
      <Breadcrumbs page={page} />
      <PageSections page={page} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: structuredDataForPage(page) }}
      />
    </article>
  );
}
