"use server";

import { withTenantEmailBrand } from "@/lib/communications/tenant-email-brand";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env/server";
import { sendEmail } from "@/lib/providers/sendgrid";
import { renderTenantEmailHtml } from "@/lib/communications/email";
import { tenantAppUrl } from "@/lib/tenancy/hostname";
import { getTicketActor } from "@/lib/tickets/auth";
import { ticketRpc } from "@/lib/tickets/rpc";
import { getTicketAccess, getTicketList, getTicketDetail, getTicketOptions, getTicketSettings, queryTickets } from "@/lib/tickets/data";
import { ticketCommandPayload } from "@/lib/tickets/commands";
import { projectDetail, record, rows } from "@/lib/tickets/projection";
import { processTicketScans } from "@/lib/tickets/scan-worker";
import { ticketPaths, type TicketWorkspace, type TicketQuery, type TicketCommand, type TicketResult } from "@/lib/tickets/model";

function failure(error: unknown): { ok: false; error: string; code?: string } {
  if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message ?? "Controleer de ingevulde gegevens." };
  const e = record(error), code = typeof e.code === "string" ? e.code : "";
  if (code === "40001") return { ok: false, code, error: "Deze melding is intussen gewijzigd. Vernieuw het gesprek en controleer je wijziging; je invoer blijft bewaard." };
  if (["42900", "53300", "54000"].includes(code)) return { ok: false, code, error: "Je hebt veel aanvragen gedaan. Wacht enkele minuten en probeer opnieuw." };
  const safeMessages: Record<string, string> = {
    "Voor deze vertrouwelijke categorie is geen bevoegde intake beschikbaar": "Voor vertrouwelijke meldingen is nog geen bevoegde behandelaar ingesteld. Neem rechtstreeks contact op met je HR-contactpersoon. Je melding is niet gedeeld met een algemene afdeling.",
    "Beschrijf de oplossing": "Beschrijf eerst hoe de melding is opgelost.",
    "Beschrijf de vervolgstap": "Geef aan waarop je wacht en wat de volgende stap is.",
    "Toelichting is verplicht": "Geef een korte toelichting bij deze wijziging.",
    "Bijlage is niet vrijgegeven voor dit bericht": "Een bijlage is nog niet beschikbaar voor dit bericht. Wacht op de bestandscontrole of kies het bestand opnieuw.",
    "U kunt uw eigen ticketrechten niet uitbreiden": "Je kunt jezelf geen extra meldingsrechten geven. Laat een bevoegde beheerder deze wijziging controleren.",
    "Scope valt buiten uw delegatiebevoegdheid": "Het gekozen gegevensbereik is groter dan wat je mag toekennen. Beperk de selectie of vraag je beheerder.",
  };
  if (typeof e.message === "string" && Object.hasOwn(safeMessages, e.message)) return { ok: false, error: safeMessages[e.message] };
  // Never expose database/provider messages containing IDs, recipient addresses,
  // object paths, raw payloads or unknown function internals.
  return { ok: false, ...(code ? { code: ["42501", "23514", "22023", "23505"].includes(code) ? code : "unavailable" } : {}), error: code === "42501" ? "Je hebt hiervoor geen toegang meer. Vernieuw de pagina of neem contact op met je beheerder." : "De wijziging is niet opgeslagen. Controleer de gegevens en probeer opnieuw; je invoer blijft bewaard." };
}
function refreshTickets() {
  for (const path of Object.values(ticketPaths)) revalidatePath(path, "layout");
}
export async function loadTicketAccess(workspace: TicketWorkspace) {
  try { return { ok: true as const, data: await getTicketAccess(workspace) }; } catch (error) { return failure(error); }
}
export async function loadTicketList(workspace: TicketWorkspace, query: TicketQuery) {
  try { return { ok: true as const, data: await getTicketList(workspace, query) }; } catch (error) { return failure(error); }
}
export async function loadTicketDetail(workspace: TicketWorkspace, id: string) {
  try { return { ok: true as const, data: await getTicketDetail(workspace, id) }; } catch (error) { return failure(error); }
}
export async function loadTicketOptions(workspace: TicketWorkspace) {
  try { return { ok: true as const, data: await getTicketOptions(workspace) }; } catch (error) { return failure(error); }
}
export async function loadTicketSettings(workspace: TicketWorkspace) {
  try { return { ok: true as const, data: await getTicketSettings(workspace) }; } catch (error) { return failure(error); }
}
export async function runTicketCommand(workspace: TicketWorkspace, command: TicketCommand, input: unknown, requestId: string): Promise<TicketResult> {
  try {
    const actor = await getTicketActor(workspace), value = ticketCommandPayload(command, input);
    if (value.command === "transfer" || value.command === "create") {
      value.payload.technical_context = { environment: process.env.DEPLOY_TARGET ?? "local", release: /^[a-f0-9]{40}$/.test(process.env.RELEASE_SHA ?? "") ? process.env.RELEASE_SHA : "local" };
    }
    let raw = record(await ticketRpc(actor.db, "ticket_command", { target_tenant: actor.tenantId, actor_context: workspace, command: value.command, payload: value.payload, request_id: z.uuid().parse(requestId) }));
    if (value.command === "transfer" && z.uuid().safeParse(raw.id).success) {
      // Only immutable copy IDs from the authorized command result. The worker
      // claims each with a lease and rechecks sharing rights at finalization.
      // The existing timer recovers an interrupted copy; never label it clean.
      const copies = rows(raw.messages).flatMap(m => rows(m.attachments)).filter(f => ["pending", "error"].includes(String(f.scanState ?? f.scan_status))).slice(0, 5);
      for (const copy of copies) {
        const parsed = z.uuid().safeParse(copy.id);
        if (parsed.success) { try { await processTicketScans(parsed.data); } catch { /* Durable pending state is shown in the support conversation. */ } }
      }
      raw = record(await ticketRpc(actor.db, "ticket_query", { target_tenant: actor.tenantId, actor_context: "support", operation: "detail", payload: { ticket_id: raw.id } }));
    }
    refreshTickets();
    const candidate = raw.ticket ?? (raw.id && raw.status ? raw : null);
    if (candidate) { const detail = projectDetail(candidate, value.command === "transfer" ? "support" : workspace)!; return { ok: true, id: detail.id, version: detail.version, data: detail }; }
    return { ok: true, ...(typeof raw.ticket_id === "string" ? { id: raw.ticket_id } : {}) };
  } catch (error) { return failure(error); }
}

export async function prepareTicketResponse(workspace: TicketWorkspace, id: string, messageId: string): Promise<TicketResult<{ body: string; sourceTicketId: string }>> {
  try {
    const raw = record(await queryTickets(workspace, "response_draft", { ticket_id: z.uuid().parse(id), message_id: z.uuid().parse(messageId) }));
    return { ok: true, data: { body: z.string().max(10000).parse(raw.body), sourceTicketId: z.uuid().parse(raw.source_ticket_id) } };
  } catch (error) { return failure(error); }
}

export async function requestTicketVerification(workspace: TicketWorkspace, command: "save_grant" | "revoke_grant", input: unknown): Promise<TicketResult<{ challengeId: string; expiresAt: string }>> {
  try {
    const actor = await getTicketActor(workspace), value = ticketCommandPayload(command, input);
    delete value.payload.verification_id;
    const admin = createAdminClient();
    const call = (operation: string, payload: Record<string, unknown>) => ticketRpc(admin, "ticket_verification", { target_tenant: actor.tenantId, actor: actor.user.id, session_id: actor.sessionId, operation, input: payload });
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const challenge = record(await call("request", { action: value.command, payload: value.payload, code }));
    const challengeId = z.uuid().parse(challenge.challenge_id);
    try {
      const env = getServerEnv();
      if (!env.SENDGRID_FROM_EMAIL) throw new Error();
      const subject = "Bevestig de wijziging van meldingsrechten";
      const text = `Je verificatiecode is ${code}.\n\nJe hebt een wijziging van meldings- of supportrechten aangevraagd. Vul deze code alleen in het geopende bevestigingsscherm in, nadat je de ontvanger en het gegevensbereik hebt gecontroleerd. De code is maximaal vijf minuten geldig en werkt uitsluitend voor deze wijziging.\n\nHeb je dit niet aangevraagd? Deel de code niet en neem contact op met je beheerder.`;
      const tenant = actor.tenant;
      const targetUrl = tenant ? tenantAppUrl(tenant.slug, ticketPaths[workspace]) : `${env.APP_URL}/platform/support`;
      const html = renderTenantEmailHtml({ brand: await withTenantEmailBrand(tenant?.id ?? null, { company: tenant?.name ?? "Fieldgrid", domain: new URL(targetUrl).host, primary: tenant?.primaryColor ?? "#222C35", accent: tenant?.accentColor ?? "#41AC42", senderEmail: env.SENDGRID_FROM_EMAIL, emailLogoUrl: tenant?.logoPath ? `${env.APP_URL}/api/branding/${tenant.id}/email-logo` : null }), kind: "ticket_otp", message: { subject, body: text }, targetUrl, allowLocalLinks: env.DEPLOY_TARGET === "local" });
      await sendEmail({ fromEmail: env.SENDGRID_FROM_EMAIL, fromName: tenant?.name ?? env.SENDGRID_FROM_NAME, to: z.email().parse(challenge.email), subject, text, html, deliveryKey: `ticket-verification:${challengeId}`, disableTracking: true, policy: { kind: "security", flow: "permissions_otp", tenantId: actor.tenantId } });
      await call("delivered", { challenge_id: challengeId, delivered: true });
      return { ok: true, data: { challengeId, expiresAt: z.string().parse(challenge.expires_at) } };
    } catch {
      await call("delivered", { challenge_id: challengeId, delivered: false });
      return { ok: false, error: "De verificatiemail kon niet worden verstuurd. Er zijn geen rechten gewijzigd. Probeer later opnieuw." };
    }
  } catch (error) { return failure(error); }
}
export async function confirmTicketVerification(workspace: TicketWorkspace, challengeId: string, code: string): Promise<TicketResult<{ verificationId: string; expiresAt: string }>> {
  try {
    const actor = await getTicketActor(workspace);
    const raw = record(await ticketRpc(createAdminClient(), "ticket_verification", { target_tenant: actor.tenantId, actor: actor.user.id, session_id: actor.sessionId, operation: "confirm", input: { challenge_id: z.uuid().parse(challengeId), code: z.string().regex(/^\d{6}$/).parse(code) } }));
    return { ok: true, data: { verificationId: z.uuid().parse(raw.verification_id), expiresAt: z.string().parse(raw.expires_at) } };
  } catch { return { ok: false, error: "De code klopt niet, is verlopen of hoort niet bij deze sessie. Vraag zo nodig een nieuwe code aan." }; }
}
