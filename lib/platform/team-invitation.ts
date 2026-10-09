import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getServerEnv } from "@/lib/env/server";
import { renderTenantEmailHtml } from "@/lib/communications/email";
import { ticketRpc } from "@/lib/tickets/rpc";
import { sendEmail } from "@/lib/providers/sendgrid";
import { mailFailureMessage, mailFailureOutcome } from "@/lib/notifications/mail-snapshot";
import type { createClient } from "@/lib/supabase/server";

const invitation = z.object({ userId: z.uuid(), name: z.string(), email: z.email(), version: z.number().int().positive(), deliveryId: z.uuid() });
/** Rendering precedes a fresh, atomic, recipient/revision-bound provider claim.
 * A second attempt cannot claim the same invitation, including after a timeout. */
export async function deliverSupportInvitation(db: Awaited<ReturnType<typeof createClient>>, raw: unknown): Promise<{ warning?: string }> {
  const input = invitation.parse(raw), env = getServerEnv();
  if (!env.SENDGRID_API_KEY || !env.SENDGRID_FROM_EMAIL) throw new Error("E-mailverzending is niet ingesteld.");
  const url = new URL("/login", env.APP_URL); url.searchParams.set("next", "/platform/support");
  const subject = "Uitnodiging voor Fieldgrid-support";
  const body = `Hallo ${input.name},\n\nJe bent uitgenodigd als supportmedewerker bij Fieldgrid. Open het inlogscherm en vul dit e-mailadres in. Je ontvangt een eenmalige inlogcode; een wachtwoord is niet nodig.\n\nJe kunt gedeelde supportvragen lezen, beantwoorden, intern bespreken en afhandelen binnen het toegewezen bereik. Heb je deze uitnodiging niet verwacht? Neem contact op met Fieldgrid.`;
  const html = renderTenantEmailHtml({ kind: "auth_event", brand: { company: "Fieldgrid", domain: url.hostname, primary: "#222C35", accent: "#41AC42", senderEmail: env.SENDGRID_FROM_EMAIL }, message: { subject, body }, targetUrl: url.href, targetLabel: "Supportdesk openen", allowLocalLinks: env.DEPLOY_TARGET === "local" });
  const claimed = z.object({ allowed: z.boolean(), email: z.email().optional() }).parse(await ticketRpc(db, "platform_team_command", { command: "claim_delivery", input: { deliveryId: input.deliveryId }, request_id: randomUUID() }));
  if (!claimed.allowed || claimed.email !== input.email) return { warning: "Deze uitnodiging is al verwerkt of de toegang is gewijzigd. Er is niets opnieuw verstuurd." };
  let outcome: "sent" | "failed" | "uncertain" | "suppressed" = "sent", warning: string | undefined;
  try {
    await sendEmail({ fromEmail: env.SENDGRID_FROM_EMAIL, fromName: "Fieldgrid", to: input.email, subject, text: `${body}\n\n${url.href}`, html, deliveryKey: `platform-support-invitation-${input.deliveryId}`, disableTracking: true, policy: { kind: "security", flow: "invitation", tenantId: null } });
  } catch (error) { outcome = mailFailureOutcome(error); warning = mailFailureMessage(outcome); }
  try { await ticketRpc(db, "platform_team_command", { command: "finish_delivery", input: { deliveryId: input.deliveryId, status: outcome }, request_id: randomUUID() }); }
  catch { return { warning: "De verzendregistratie kon niet worden bijgewerkt. Controleer de provider voordat je opnieuw uitnodigt." }; }
  return warning ? { warning } : {};
}
