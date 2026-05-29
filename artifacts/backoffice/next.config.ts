import type { NextConfig } from "next";

// Hostname and PORT are configured via CLI flags in package.json scripts:
//   dev:   next dev   -H 127.0.0.1 -p $PORT
//   start: next start -H 127.0.0.1 -p $PORT
// PORT is always injected by the workflow via [services.env] in artifact.toml.

const replitDevOrigins = process.env.REPLIT_DOMAINS
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
