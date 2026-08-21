import type { NextConfig } from "next";

const replitDevOrigins: string[] = process.env.REPLIT_DOMAINS
  ? process.env.REPLIT_DOMAINS.split(",").map((d) => d.trim())
  : [];

const nextConfig: NextConfig = {
  basePath: "/klant",
  poweredByHeader: false,
  compress: true,
  // PDFKit reads its built-in AFM fonts from its package directory at runtime.
  // Externalizing preserves those data files in the deployed pnpm install.
  serverExternalPackages: ["pdfkit"],
  ...(process.env.NODE_ENV !== "production" &&
    replitDevOrigins.length > 0 && {
      allowedDevOrigins: replitDevOrigins,
    }),
};

export default nextConfig;
