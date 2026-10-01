import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTicketActor } from "./auth";
import { ticketWorkspaceSchema } from "./model";
import { ticketRpc } from "./rpc";
import { readTicketBody, ticketFileName, ticketHash, TICKET_FILE_MIMES } from "./files-validation";
import { TICKET_FILE_LIMIT } from "./scan";
import { processTicketScans } from "./scan-worker";

export const ticketFileHeaders = { "cache-control": "private, no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "content-security-policy": "default-src 'none'; sandbox" };
const fileSchema = z.object({ id: z.uuid(), name: z.string(), mime: z.string(), size: z.number(), status: z.string(), scanState: z.string(), createdAt: z.string() });
const assetSchema = fileSchema.extend({ tenantId: z.uuid(), path: z.string(), sha256: z.string().nullable() });
const uploadStatus = (file: z.infer<typeof fileSchema>) => ({ ...file, status: file.scanState });
const initSchema = z.object({ workspace: ticketWorkspaceSchema, tenantId: z.uuid().optional(), categoryId: z.uuid(), ticketId: z.uuid().optional(), audience: z.enum(["reporter", "tenant", "platform"]), draftId: z.uuid(), requestId: z.uuid(), name: z.string().min(1).max(500), mime: z.enum(TICKET_FILE_MIMES), size: z.number().int().min(1).max(TICKET_FILE_LIMIT) }).strict();

export function ticketUploadOrigin(request: Request) {
  const origin = request.headers.get("origin"), host = request.headers.get("host");
  if (!origin || !host) throw new Error("Ongeldige uploadomgeving");
  const parsed = new URL(origin);
  if (parsed.host !== host || (!['localhost', '127.0.0.1'].includes(parsed.hostname) && parsed.protocol !== 'https:')) throw new Error("Ongeldige uploadomgeving");
}
export async function initializeTicketFile(request: Request) {
  ticketUploadOrigin(request);
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Uploadverzoek ontbreekt");
  let total = 0; const chunks: Uint8Array[] = [];
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; total += value.length; if (total > 8192) { await reader.cancel(); throw new Error("Uploadverzoek te groot"); } chunks.push(value); } } finally { reader.releaseLock(); }
  const input = initSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  const actor = await getTicketActor(input.workspace);
  if (actor.tenantId && input.tenantId && input.tenantId !== actor.tenantId) throw new Error("Geen toegang");
  const tenantId = actor.tenantId ?? input.tenantId;
  if (!tenantId) throw new Error("Organisatie ontbreekt");
  const file = fileSchema.parse(await ticketRpc(actor.db, "ticket_file_command", { target_tenant: tenantId, actor_context: input.workspace, command: "init", input: { ...input, name: ticketFileName(input.name) }, request_id: input.requestId }));
  return { file: uploadStatus(file), uploadUrl: `/api/tickets/files/${file.id}?workspace=${input.workspace}&tenantId=${tenantId}` };
}
async function fileActor(request: Request, id: string, command: string) {
  const url = new URL(request.url), workspace = ticketWorkspaceSchema.parse(url.searchParams.get("workspace"));
  const actor = await getTicketActor(workspace);
  const hint = z.uuid().nullable().parse(url.searchParams.get("tenantId"));
  if (actor.tenantId && hint && actor.tenantId !== hint) throw new Error("Geen toegang");
  const args = { target_tenant: actor.tenantId ?? hint, actor_context: workspace, command, input: { id: z.uuid().parse(id) } };
  return { actor, args, data: await ticketRpc(actor.db, "ticket_file_command", args) };
}
export async function uploadTicketFile(request: Request, id: string) {
  ticketUploadOrigin(request);
  const { actor, data } = await fileActor(request, id, "upload_context"), file = assetSchema.parse(data);
  if (request.headers.get("content-type")?.split(";")[0] !== file.mime) throw new Error("Bestandstype gewijzigd");
  const bytes = await readTicketBody(request, file.size), hash = ticketHash(bytes);
  if (file.sha256 && file.sha256 !== hash) throw new Error("Dit uploadverzoek bevat al een ander bestand");
  const admin = createAdminClient();
  const result = await admin.storage.from("ticket-files").upload(file.path, bytes, { contentType: file.mime, upsert: false });
  if (result.error) {
    // Immutable path. A retried upload is accepted only for the identical bytes.
    const existing = await admin.storage.from("ticket-files").download(file.path);
    if (existing.error || !existing.data || ticketHash(new Uint8Array(await existing.data.arrayBuffer())) !== hash) throw new Error("Bestand kon niet worden opgeslagen");
  }
  const finalized = fileSchema.parse(await ticketRpc(admin, "ticket_file_server_finalize", { file_id: file.id, actor_id: actor.user.id, session_id: actor.sessionId, content_hash: hash }));
  // Same leased scan pipeline as the timer, bounded to this authorized file.
  // Scanner failure remains an explicit non-clean state, never upload success.
  if (finalized.status === "pending") await processTicketScans(file.id);
  return uploadStatus(fileSchema.parse(await ticketRpc(actor.db, "ticket_file_command", { target_tenant: file.tenantId, actor_context: actor.workspace, command: "status", input: { id: file.id } })));
}
export async function discardTicketFile(request: Request, id: string) {
  ticketUploadOrigin(request);
  await fileActor(request, id, "discard");
}
export async function ticketFileResponse(request: Request, id: string) {
  const status = new URL(request.url).searchParams.get("status") === "1";
  const { actor, args, data } = await fileActor(request, id, status ? "status" : "download");
  if (status) return Response.json({ ok: true, file: uploadStatus(fileSchema.parse(data)) }, { headers: ticketFileHeaders });
  const file = assetSchema.parse(data), admin = createAdminClient();
  const result = await admin.storage.from("ticket-files").download(file.path);
  if (result.error || !result.data) throw new Error("Bestand niet beschikbaar");
  const bytes = new Uint8Array(await result.data.arrayBuffer());
  if (ticketHash(bytes) !== file.sha256) throw new Error("Bestandscontrole mislukt");
  // Recheck after storage I/O: revocation or redaction is not a reusable URL.
  const current = assetSchema.parse(await ticketRpc(actor.db, "ticket_file_command", args));
  if (current.sha256 !== file.sha256 || current.path !== file.path) throw new Error("Bestand niet beschikbaar");
  return new Response(bytes, { headers: { ...ticketFileHeaders, "content-type": file.mime, "content-length": String(bytes.length), "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(ticketFileName(file.name))}` } });
}
