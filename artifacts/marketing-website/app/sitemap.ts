import type { MetadataRoute } from "next";
import {
  absoluteUrl,
  getPageTemplate,
  isIndexablePage,
  pages,
} from "@/lib/site";

function priorityFor(pathname: string) {
  if (pathname === "/") return 1;
  if (["/diensten", "/schoonmaak", "/beveiliging", "/facilitair", "/oplossingen"].includes(pathname)) {
    return 0.9;
  }
  if (["/contact", "/offerte"].includes(pathname)) return 0.8;
  return 0.7;
}

export default function sitemap(): MetadataRoute.Sitemap {
  return pages.filter(isIndexablePage).map((page) => {
    const template = getPageTemplate(page);
    const changeFrequency = ["home", "editorial"].includes(template) ? "weekly" : "monthly";

    return {
      url: absoluteUrl(page.slug),
      changeFrequency,
      priority: priorityFor(page.slug),
    };
  });
}
