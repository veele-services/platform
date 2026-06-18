import type { NextConfig } from "next";

/**
 * Host/port binding for Next.js (App Router, Next 15+)
 *
 * Next.js does not expose a `hostname` or `port` option inside next.config.ts —
 * these are CLI-only flags (https://nextjs.org/docs/app/api-reference/cli/next).
 * Per this repo's convention, binding is declared in package.json scripts:
 *
 *   "dev"  : next dev   -H 127.0.0.1 -p $PORT
 *   "start": next start -H 127.0.0.1 -p $PORT
 *
 * PORT is always injected at runtime by the workflow via artifact.toml
 * [services.env] PORT = "22138" — it is NEVER hardcoded here.
 *
 * Replit proxy allowed origins: the proxy connects to localhost (127.0.0.1) so
 * 127.0.0.1 binding is sufficient. allowedDevOrigins narrows which external
 * origins may reach the dev server; we use the REPLIT_DOMAINS env var for this.
 */

const replitDevOrigins: string[] = process.env.REPLIT_DOMAINS
  ? process.env.REPLIT_DOMAINS.split(",").map((d) => d.trim())
  : [];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  compress: true,
  ...(process.env.NODE_ENV !== "production" &&
    replitDevOrigins.length > 0 && {
      allowedDevOrigins: replitDevOrigins,
    }),
};

export default nextConfig;
