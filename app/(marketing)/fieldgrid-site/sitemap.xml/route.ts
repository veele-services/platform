import { headers } from "next/headers";
import { HOST_KIND_HEADER } from "@/lib/tenancy/hostname";
import { FIELDGRID_MARKETING_ORIGIN } from "@/lib/marketing/fieldgrid/routes";
import { sectors, products } from "@/lib/marketing/fieldgrid/content";

export async function GET() {
  if ((await headers()).get(HOST_KIND_HEADER) !== "marketing") return new Response(null, { status: 404 });
  const paths = ["/", "/branches", ...sectors.map(s => `/branches/${s.slug}`), "/platform", ...products.map(p => `/platform/${p.slug}`), "/werkwijze", "/over", "/demo", "/proberen", "/afspraak", "/privacy"];
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(path => `<url><loc>${FIELDGRID_MARKETING_ORIGIN}${path}</loc></url>`).join("")}</urlset>`;
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "no-store", ...(process.env.DEPLOY_TARGET !== "production" ? { "x-robots-tag": "noindex, nofollow" } : {}) } });
}
