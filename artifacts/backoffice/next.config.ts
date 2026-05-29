import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  compress: true,
  // Allow all dev origins for Replit proxy
  ...(process.env.NODE_ENV !== "production" && {
    allowedDevOrigins: ["*"],
  }),
};

export default nextConfig;
