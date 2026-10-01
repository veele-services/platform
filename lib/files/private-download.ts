import "server-only";
import { createHash } from "node:crypto";
import { readScannedFile } from "@/lib/files/scanned-storage";

export const privateFileHeaders = {
  "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox",
};
export type PrivateFile = {
  bucket: string; path: string; scope: string[]; name: string; mime: string;
  sha256?: string | null;
};
const buckets = new Set(["personnel-documents", "customer-documents", "object-documents", "commercial-documents", "reports", "signatures", "invoices"]);
/** Exact canonical namespace, including the authorized parent, not just tenant.
 * Never normalize a suspicious path into another resource. Keep legacy filenames. */
export function assertPrivateFile(file: PrivateFile) {
  if (!file || !buckets.has(file.bucket) || typeof file.path !== "string" || !Array.isArray(file.scope) || file.scope.length < 2) throw new Error("Document niet beschikbaar");
  const parts = file.path.split("/");
  if (/[\\%?#\u0000-\u001f\u007f]/.test(file.path) || parts.length !== file.scope.length + 1 || parts.some(p => !p || p === "." || p === "..") || file.scope.some((p, i) => !p || parts[i] !== p)) throw new Error("Document niet beschikbaar");
  if (file.sha256 != null && !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error("Document niet beschikbaar");
}
export function samePrivateFile(a: PrivateFile, b: PrivateFile) {
  assertPrivateFile(b);
  return a.bucket === b.bucket && a.path === b.path && a.sha256 === b.sha256 && JSON.stringify(a.scope) === JSON.stringify(b.scope);
}
export async function bufferPrivateFile(file: PrivateFile) {
  assertPrivateFile(file);
  const result = await readScannedFile(file.bucket, file.path, file.sha256);
  if (!result) throw new Error("Document niet beschikbaar");
  const bytes = result.bytes;
  if (file.sha256 && createHash("sha256").update(bytes).digest("hex") !== file.sha256) throw new Error("Bestandscontrole mislukt");
  return bytes;
}
/** Resolver must repeat the actual source authorization, never a cached DTO or
 * just getUser(). Revocation/visibility/path changes during I/O fail closed. */
export async function authorizedFileResponse(resolve: () => Promise<PrivateFile>, disposition: "inline" | "attachment" = "attachment") {
  const file = await resolve();
  const bytes = await bufferPrivateFile(file);
  if (!samePrivateFile(file, await resolve())) throw new Error("Document niet beschikbaar");
  return new Response(new Uint8Array(bytes), { headers: {
    ...privateFileHeaders, "Content-Type": file.mime || "application/octet-stream", "Content-Length": String(bytes.length),
    "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(file.name || "document")}`,
  } });
}
