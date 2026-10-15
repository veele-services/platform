import { headers } from "next/headers";
import { HOST_KIND_HEADER } from "@/lib/tenancy/hostname";
import { FIELDGRID_MARKETING_ORIGIN } from "@/lib/marketing/fieldgrid/routes";

export async function GET() {
  if ((await headers()).get(HOST_KIND_HEADER) !== "marketing") return new Response(null, { status: 404 });
  const indexable = process.env.DEPLOY_TARGET === "production";
  return new Response(`User-agent: *\n${indexable ? "Allow: /\nDisallow: /api/\nDisallow: /fieldgrid-site/" : "Disallow: /"}\nSitemap: ${FIELDGRID_MARKETING_ORIGIN}/sitemap.xml\n`, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
