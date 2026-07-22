import {
  resolveManagedWebsiteByHost,
  type ManagedWebsiteResolution,
} from "@workspace/db/website-public-runtime";
import { cache } from "react";
import { requestPathOwner } from "./request";

type ReadyWebsite = Extract<ManagedWebsiteResolution, { status: "ready" }>;
type PublicationPage = ReadyWebsite["snapshot"]["pages"][number];

export type ManagedWebsitePageContext = {
  resolution: ReadyWebsite;
  page: PublicationPage;
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

export function pathnameFromSlug(slug: string[] | undefined): string {
  return slug?.length ? `/${slug.join("/")}` : "/";
}
