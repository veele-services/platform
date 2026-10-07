import pages from "@/websites/veele-services/pages.generated.json";

export const websitePages: Readonly<Record<string, string>> = pages;
export function renderWebsite(pathname: string, origin: string, nonce: string, indexable = false) {
  const canonicalPath = pathname === "/" ? "/" : `${pathname.replace(/\/+$/, "")}/`;
  const found = websitePages[canonicalPath];
  let html = found ?? websitePages["404"];
  html = html.replaceAll("https://veele-website.invalid", origin)
    .replaceAll("/assets/", "/veele-services/assets/")
    .replace(/<script\b/g, `<script nonce="${nonce}"`);
  html = html.replace(/(<meta name="robots" content=")[^"]+/, `$1${indexable && found ? "index,follow" : "noindex,follow"}`);
  return { html, status: found ? 200 : 404 };
}

export function websiteSitemap(origin: string) {
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${Object.keys(websitePages).filter(p => p !== "404").map(p => `<url><loc>${origin}${p}</loc></url>`).join("")}</urlset>`;
}
