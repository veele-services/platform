import { randomBytes } from "node:crypto";

/**
 * Next.js reads the nonce from the request CSP and applies it to its own
 * bootstrap scripts. Tenant colours and MapLibre still use inline styles, so
 * styles remain explicitly allowed while executable inline script does not.
 */
export function createContentSecurityPolicy(
  development = process.env.NODE_ENV === "development",
  secureTransport = process.env.DEPLOY_TARGET !== "local" && (process.env.APP_URL?.startsWith("https://") ?? false),
) {
  const nonce = randomBytes(18).toString("base64");
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob: https://tiles.openfreemap.org",
    "connect-src 'self' https://tiles.openfreemap.org",
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
