import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { scanTicketBytes, type ScanResult, TICKET_FILE_LIMIT } from "@/lib/tickets/scan";

export type ScannedFile = { bytes: Uint8Array; mime: string; sha256: string };
type State = { id: string; version: string; size: number; mime: string; sha256: string | null };
const buckets = new Set(["branding", "reports", "signatures", "invoices", "personnel-documents", "customer-documents", "object-documents", "commercial-documents"]);
const mimes = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const unavailable = () => new Error("Bestand niet beschikbaar of veiligheidscontrole niet voltooid. Probeer later opnieuw.");

function location(bucket: string, path: string) {
  if (!buckets.has(bucket) || !path || /[\\%?#\u0000-\u001f\u007f]/.test(path) || path.split("/").some(p => !p || p === "." || p === "..")) throw unavailable();
}
function shape(bytes: Uint8Array, mime: string) {
  if (!bytes.length || bytes.length > TICKET_FILE_LIMIT) throw new Error("Bestandscontrole ondersteunt maximaal 10 MB. Het oorspronkelijke bestand blijft bewaard; vraag de beheerder om hulp.");
  if (!mimes.has(mime)) throw new Error("Gebruik PDF, PNG, JPG of WebP.");
  const b = Buffer.from(bytes);
  const valid = mime === "application/pdf" ? b.subarray(0, 5).toString() === "%PDF-"
    : mime === "image/png" ? b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : mime === "image/jpeg" ? b[0] === 255 && b[1] === 216 && b[2] === 255
    : b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP";
  if (!valid) throw new Error("Het bestand komt niet overeen met het opgegeven bestandsformaat.");
}
export async function scanFileBytes(bytes: Uint8Array, mime: string): Promise<ScanResult> {
  shape(bytes, mime);
  const scan = await scanTicketBytes(bytes);
  if (scan.status !== "clean") throw new Error("Het bestand is geweigerd door de veiligheidscontrole. Gebruik een veilig bestand.");
  return scan;
}
async function state(admin: ReturnType<typeof createAdminClient>, bucket: string, path: string): Promise<State | null> {
  const result = await admin.rpc("file_scan_state", { target_bucket: bucket, target_path: path });
  if (result.error) throw unavailable();
  return result.data as State | null;
}
async function attest(admin: ReturnType<typeof createAdminClient>, bucket: string, path: string, current: State, bytes: Uint8Array, mime: string, scan: ScanResult) {
  const result = await admin.rpc("file_scan_attest", { target_bucket: bucket, target_path: path, expected_id: current.id, expected_version: current.version,
    proof: { sha256: digest(bytes), size: bytes.length, mime, engine: scan.engine, databaseVersion: scan.databaseVersion, databaseAt: scan.databaseAt } });
  if (result.error) throw unavailable();
}

/** Internal primitive: caller MUST authorize the source before and after I/O.
 * No historical exemption: old bytes are lazily scanned, never rewritten.
 * Even an existing receipt is checked against bytes, not a caller's optional SHA. */
export async function readScannedFile(bucket: string, path: string, expectedHash?: string | null, admin = createAdminClient()): Promise<ScannedFile | null> {
  location(bucket, path);
  const before = await state(admin, bucket, path);
  if (!before) return null;
  if (before.size > TICKET_FILE_LIMIT) throw new Error("Dit bestaande bestand is groter dan de scanlimiet van 10 MB. Het blijft bewaard; vraag de beheerder om hulp.");
  const file = await admin.storage.from(bucket).download(path);
  if (file.error || !file.data) throw unavailable();
  const bytes = new Uint8Array(await file.data.arrayBuffer()), sha256 = digest(bytes);
  shape(bytes, before.mime);
  if (bytes.length !== before.size || (expectedHash && sha256 !== expectedHash) || (before.sha256 && sha256 !== before.sha256)) throw new Error("Bestandscontrole mislukt");
  const scan = before.sha256 ? null : await scanFileBytes(bytes, before.mime);
  const after = await state(admin, bucket, path);
  if (!after || after.id !== before.id || after.version !== before.version || after.size !== before.size || after.mime !== before.mime) throw unavailable();
  if (scan) await attest(admin, bucket, path, before, bytes, before.mime, scan);
  return { bytes, mime: before.mime, sha256 };
}

/** Server-only writer. Paths are immutable, and retries verify the actual
 * stored bytes before trusting a receipt. Revocation during scanning fails. */
export async function publishScannedFile(input: { bucket: string; path: string; bytes: Uint8Array; mime: string; authorize: () => Promise<void> }, admin = createAdminClient()) {
  const { bucket, path, bytes, mime, authorize } = input;
  location(bucket, path);
  await authorize();
  const scan = await scanFileBytes(bytes, mime);
  await authorize();
  const result = await admin.storage.from(bucket).upload(path, bytes, { contentType: mime, upsert: false, cacheControl: "0" });
  // Only an actual conflict is a retry; network/storage errors are not success.
  if (result.error && String(result.error.statusCode) !== "409") throw unavailable();
  const current = await state(admin, bucket, path);
  if (!current) throw unavailable();
  const stored = await admin.storage.from(bucket).download(path);
  if (stored.error || !stored.data || digest(new Uint8Array(await stored.data.arrayBuffer())) !== digest(bytes) || current.mime !== mime || current.size !== bytes.length) throw new Error("Deze bestandspoging hoort bij andere inhoud. Kies het bestand opnieuw.");
  await authorize();
  await attest(admin, bucket, path, current, bytes, mime, scan);
  return { sha256: digest(bytes), scan };
}

export async function uploadScannedFile(db: SupabaseClient<Database>, bucket: string, path: string, bytes: Uint8Array, mime: string, visitRequest?: string) {
  return publishScannedFile({ bucket, path, bytes, mime, authorize: async () => {
    const access = await db.rpc("file_upload_allowed", { target_bucket: bucket, target_path: path, ...(visitRequest ? { visit_request: visitRequest } : {}) });
    if (access.error || access.data !== true) throw new Error("Geen actuele toegang om dit bestand op te slaan.");
  } });
}
