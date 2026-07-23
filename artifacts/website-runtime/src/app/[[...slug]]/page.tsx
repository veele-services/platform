import { ManagedWebsiteView } from "@/lib/render-document";
import {
  loadManagedWebsitePageContext,
  pathnameFromSlug,
} from "@/lib/runtime-context";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

type PageProps = { params: Promise<{ slug?: string[] }> };

async function contextForRequest(props: PageProps) {
  const [requestHeaders, params] = await Promise.all([headers(), props.params]);
  return loadManagedWebsitePageContext(
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

  const { page, resolution } = context;
  const canonical = `https://${resolution.canonicalHostname}${page.path}`;
  const indexable =
    resolution.snapshot.defaultSeo.indexable && page.seo.indexable;
  return {
    title: page.seo.title,
    description: page.seo.description,
    alternates: { canonical },
    robots: { index: indexable, follow: indexable },
    openGraph: {
      type: "website",
      title: page.seo.title,
      description: page.seo.description,
      url: canonical,
    },
  };
}

export default async function ManagedWebsitePage(props: PageProps) {
  const context = await contextForRequest(props);
  if (!context) notFound();
  return (
    <ManagedWebsiteView
      snapshot={context.resolution.snapshot}
      page={context.page}
      deliveryRevision={context.resolution.deliveryRevision}
    />
  );
}
