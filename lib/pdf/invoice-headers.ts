import { privateFilePreviewHeaders } from "@/lib/files/private-download";

/** Only authorized, verified PDF bytes are embeddable by their own tenant origin. */
export const invoicePdfHeaders = privateFilePreviewHeaders;
