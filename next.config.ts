import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  skipTrailingSlashRedirect: true, // Proxy keeps Frame page slashes and existing application URLs.
  deploymentId: process.env.DEPLOYMENT_VERSION ?? process.env.RELEASE_SHA,
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // Rapportages accepteren maximaal vijf gecontroleerde bijlagen van 10 MB.
      // De action zelf handhaaft aantal, MIME, inhoud, scanner en opslaggrenzen.
      bodySizeLimit: "55mb",
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'" },
        ],
      },
      // Private invoice bytes may be previewed only on this tenant origin.
      // All application pages and other file routes keep the default DENY.
      ...["/api/files/invoice/:id", "/api/files/invoice-concept/:id"].map(source => ({
        source,
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        ],
      })),
      ...["/quote/:path*", "/booking/:path*", "/pay/:path*"].map(source => ({source,headers:[{key:"Referrer-Policy",value:"no-referrer"},{key:"Cache-Control",value:"private, no-store"}]})),
    ];
  },
};

export default nextConfig;
