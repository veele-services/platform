import { privateFileHeaders } from "@/lib/files/private-download";

/** Only authorized, verified PDF bytes are embeddable by their own tenant origin. */
export const invoicePdfHeaders = {
  ...privateFileHeaders,
  "X-Frame-Options":"SAMEORIGIN",
  "Content-Security-Policy":"default-src 'none'; frame-ancestors 'self'",
};
