import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { ticketRpc } from "./rpc";
import { scanTicketBytes } from "./scan";
import { ticketHash, validateTicketFile } from "./files-validation";

const claimSchema = z.array(z.object({ id: z.uuid(), tenantId: z.uuid(), path: z.string(), mime: z.string(), size: z.number(), sha256: z.string().nullable(), lease: z.uuid(), copy: z.boolean(), source: z.object({ path: z.string(), sha256: z.string() }).nullable() }));
export async function processTicketScans(targetFile?: string) {
  const admin = createAdminClient();
  const claims = claimSchema.parse(await ticketRpc(admin, "ticket_scan_claim", { batch_size: targetFile ? 1 : 2, target_file: targetFile ?? null }));
  let clean = 0, rejected = 0, failed = 0;
  for (const claim of claims) {
    try {
      if (claim.copy && !claim.source) throw new Error("Kopiebron niet beschikbaar");
      const source = claim.copy ? claim.source! : { path: claim.path, sha256: claim.sha256 };
      const downloaded = await admin.storage.from("ticket-files").download(source.path);
      if (downloaded.error || !downloaded.data) throw new Error("Upload ontbreekt");
      const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
      if (bytes.length !== claim.size || ticketHash(bytes) !== source.sha256) throw new Error("Upload gewijzigd");
      let scan = await scanTicketBytes(bytes);
      if (scan.status === "rejected") {
        await ticketRpc(admin, "ticket_scan_finish", { file_id: claim.id, lease_id: claim.lease, outcome: "rejected" }); rejected++; continue;
      }
      let normalized: Buffer;
      try { const validated = await validateTicketFile(bytes, claim.mime); normalized = claim.copy ? Buffer.from(bytes) : validated; }
      catch { await ticketRpc(admin, "ticket_scan_finish", { file_id: claim.id, lease_id: claim.lease, outcome: "rejected" }); rejected++; continue; }
      const hash = ticketHash(normalized);
      // Released bytes, including rewritten images, have their own scan proof.
      if (hash !== source.sha256) scan = await scanTicketBytes(normalized);
      if (scan.status === "rejected") { await ticketRpc(admin, "ticket_scan_finish", { file_id: claim.id, lease_id: claim.lease, outcome: "rejected" }); rejected++; continue; }
      const path = `${claim.tenantId}/released/${claim.id}/${hash}`;
      const stored = await admin.storage.from("ticket-files").upload(path, normalized, { contentType: claim.mime, upsert: false });
      if (stored.error) {
        const existing = await admin.storage.from("ticket-files").download(path);
        if (existing.error || !existing.data || ticketHash(new Uint8Array(await existing.data.arrayBuffer())) !== hash) throw new Error("Vrijgavebestand niet opgeslagen");
      }
      const finished = await ticketRpc(admin, "ticket_scan_finish", { file_id: claim.id, lease_id: claim.lease, outcome: "clean", result: { ...scan, sha256: hash, size: normalized.length } });
      if (finished) clean++;
    } catch {
      await ticketRpc(admin, "ticket_scan_finish", { file_id: claim.id, lease_id: claim.lease, outcome: "error" }); failed++;
    }
  }
  return { claimed: claims.length, clean, rejected, failed };
}
export async function cleanupTicketUploads() {
  const admin = createAdminClient();
  const files = z.array(z.object({ id: z.uuid(), prefix: z.string(), paths: z.array(z.string().nullable()) })).parse(await ticketRpc(admin, "ticket_file_cleanup", { batch_size: 25 }));
  let removed = 0;
  for (const file of files) {
    const listed = await admin.storage.from("ticket-files").list(file.prefix, { limit: 100 });
    if (listed.error) throw new Error("Verlopen ticketuploads konden niet worden gecontroleerd");
    const paths = [...new Set([...file.paths.filter((path): path is string => path !== null), ...listed.data.filter(item => item.id && /^[a-f0-9]{64}$/.test(item.name)).map(item => `${file.prefix}/${item.name}`)])];
    if (!paths.length) { await ticketRpc(admin, "ticket_file_cleanup_done", { file_id: file.id }); continue; }
    const result = await admin.storage.from("ticket-files").remove(paths);
    if (result.error) throw new Error("Verlopen ticketuploads konden niet worden opgeruimd");
    await ticketRpc(admin, "ticket_file_cleanup_done", { file_id: file.id });
    removed += result.data.length;
  }
  return removed;
}
