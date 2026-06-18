import type { NextConfig } from "next";

const replitDevOrigins: string[] = process.env.REPLIT_DOMAINS
  ? process.env.REPLIT_DOMAINS.split(",").map((d) => d.trim())
  : [];

const nextConfig: NextConfig = {
  basePath: "/klant",
  poweredByHeader: false,
  compress: true,
  ...(process.env.NODE_ENV !== "production" &&
    replitDevOrigins.length > 0 && {
      allowedDevOrigins: replitDevOrigins,
    }),
};

export default nextConfig;
