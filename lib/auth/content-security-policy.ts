import { randomBytes } from "node:crypto";

/**
 * Next.js reads the nonce from the request CSP and applies it to its own
 * bootstrap scripts. Tenant colours and MapLibre still use inline styles, so
 * styles remain explicitly allowed while executable inline script does not.
 */
export function createContentSecurityPolicy(
  development = process.env.NODE_ENV === "development",
  secureTransport = process.env.DEPLOY_TARGET !== "local" && (process.env.APP_URL?.startsWith("https://") ?? false),
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
  publicMarketing = false,
) {
  const nonce = randomBytes(18).toString("base64");
  const supabaseSources: string[] = [];
  if (supabaseUrl) {
    try {
      const origin = new URL(supabaseUrl);
      if (!origin.username && !origin.password && ["http:", "https:"].includes(origin.protocol)) {
        supabaseSources.push(origin.origin);
        origin.protocol = origin.protocol === "https:" ? "wss:" : "ws:";
        supabaseSources.push(origin.origin);
      }
    } catch {
      // An invalid public URL must not broaden the browser policy. Runtime
      // environment validation remains responsible for rejecting deployment.
    }
  }
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline'${publicMarketing ? " https://cdn.trustindex.io" : ""}`,
    "font-src 'self' data:",
    `img-src 'self' data: blob: https://tiles.openfreemap.org${publicMarketing ? " https://cdn.trustindex.io https://de-proxy.trustindex.io https://*.googleusercontent.com" : ""}`,
    `connect-src 'self' https://tiles.openfreemap.org${publicMarketing ? " https://cdn.trustindex.io https://de-proxy.trustindex.io" : ""}${supabaseSources.length ? ` ${supabaseSources.join(" ")}` : ""}`,
    "worker-src 'self' blob:",
    "frame-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(!development && secureTransport ? ["upgrade-insecure-requests"] : []),
  ];
  return { nonce, value: `${directives.join("; ")};` };
}
