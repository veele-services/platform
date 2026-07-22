const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "base-uri 'none'",
  "connect-src 'none'",
  "font-src 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' data: https:",
  "script-src 'none'",
  "style-src 'unsafe-inline'",
].join("; ");

export function websiteResponseHeaders(
  contentType: string,
  extra: HeadersInit = {},
): Headers {
  const headers = new Headers(extra);
  headers.set(
    "Cache-Control",
    "public, max-age=0, s-maxage=0, must-revalidate",
  );
  headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  headers.set("Content-Type", contentType);
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Vary", "Host");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  return headers;
}

export function neutralErrorResponse(status: 404 | 503): Response {
  const unavailable = status === 503;
  const title = unavailable
    ? "Website tijdelijk niet beschikbaar"
    : "Pagina niet gevonden";
  const detail = unavailable
    ? "Probeer het later opnieuw."
    : "De opgevraagde pagina bestaat niet.";
  const headers = websiteResponseHeaders("text/html; charset=utf-8");
  if (unavailable) headers.set("Retry-After", "60");
  headers.set("X-Robots-Tag", "noindex, nofollow");
  return new Response(
    `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body><main><h1>${title}</h1><p>${detail}</p></main></body></html>`,
    { status, headers },
  );
}

export function notModifiedResponse(etag: string): Response {
  return new Response(null, {
    status: 304,
    headers: websiteResponseHeaders("text/html; charset=utf-8", { ETag: etag }),
  });
}
