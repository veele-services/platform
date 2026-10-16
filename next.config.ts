import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  skipTrailingSlashRedirect: true, // Proxy keeps Frame page slashes and existing application URLs.
  // Keep a loopback-origin internal rewrite internal when Next sits behind
  // Caddy; hostname authorization still uses the independently validated Host.
  skipProxyUrlNormalize: true,
  deploymentId: process.env.DEPLOYMENT_VERSION ?? process.env.RELEASE_SHA,
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    globalNotFound: true,
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
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
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
      // Only the explicit, MIME-checked staff preview may use its own origin's
      // viewer. Normal downloads and every application page retain DENY.
      {
        source: "/api/files/personnel-document/:id",
        has: [{ type: "query", key: "preview", value: "1" }],
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
      ...["/quote/:path*", "/booking/:path*", "/pay/:path*"].map(source => ({source,headers:[{key:"Referrer-Policy",value:"no-referrer"},{key:"Cache-Control",value:"private, no-store"}]})),
    ];
  },
};

export default nextConfig;
