import type { NextConfig } from "next";

const replitDevOrigins: string[] = process.env.REPLIT_DOMAINS
  ? process.env.REPLIT_DOMAINS.split(",").map((d) => d.trim())
  : [];

const nextConfig: NextConfig = {
  basePath: "/personeel",
  poweredByHeader: false,
  compress: true,
  async redirects() {
    return [
      {
        // Health-check / root redirect (no basePath prefix applied here since basePath is '/personeel')
        // External path '/' hits the server before basePath routing, so we handle it explicitly.
        source: "/",
        destination: "/personeel",
        basePath: false,
        permanent: false,
      },
    ];
  },
  ...(process.env.NODE_ENV !== "production" &&
    replitDevOrigins.length > 0 && {
      allowedDevOrigins: replitDevOrigins,
    }),
};

export default nextConfig;
