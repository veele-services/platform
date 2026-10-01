"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { randomInt } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env/server";
import { sendEmail } from "@/lib/providers/sendgrid";
import { tenantAppUrl } from "@/lib/tenancy/hostname";
import { renderTenantEmailHtml } from "@/lib/communications/email";
import { getNotificationActor } from "@/lib/notifications/auth";
import { notificationRpc } from "@/lib/notifications/rpc";
import { notificationCommandPayload } from "@/lib/notifications/commands";
import { getNotificationAccess, getNotificationInbox, getNotificationRecipients, getNotificationCampaign, getNotificationTemplate, getNotificationExplanation } from "@/lib/notifications/data";
import { record } from "@/lib/notifications/projection";
import { notificationPaths, type NotificationChannel, type NotificationCommand, type NotificationQuery, type NotificationWorkspace, type RecipientCriteria } from "@/lib/notifications/model";

function failure(error: unknown) {
  if (error instanceof z.ZodError) return { ok: false as const, error: error.issues[0]?.message ?? "Controleer de ingevulde gegevens." };
  const code = record(error).code;
  return { ok: false as const, code: code === "40001" ? "conflict" : code === "42501" ? "forbidden" : "unavailable", error: code === "40001" ? "Deze gegevens zijn intussen gewijzigd. Vernieuw en controleer je invoer; er is niets overschreven." : code === "42501" ? "Je hebt geen actuele toegang tot deze actie." : "De actie is niet bevestigd. Je invoer blijft bewaard; probeer later opnieuw." };
}
export async function loadNotificationAccess(workspace: NotificationWorkspace) { try { return { ok: true as const, data: await getNotificationAccess(workspace) }; } catch (error) { return failure(error); } }
export async function loadNotificationInbox(workspace: NotificationWorkspace, query: NotificationQuery) { try { return { ok: true as const, data: await getNotificationInbox(workspace, query) }; } catch (error) { return failure(error); } }
export async function loadNotificationRecipients(workspace: NotificationWorkspace, criteria: RecipientCriteria, search = "", channels?: NotificationChannel[]) { try { return { ok: true as const, data: await getNotificationRecipients(workspace, criteria, search, channels) }; } catch (error) { return failure(error); } }
export async function loadNotificationCampaign(workspace: NotificationWorkspace, id: string) { try { return { ok: true as const, data: await getNotificationCampaign(workspace, id) }; } catch (error) { return failure(error); } }
export async function loadNotificationTemplate(workspace: NotificationWorkspace, id: string) { try { return { ok: true as const, data: await getNotificationTemplate(workspace, id) }; } catch (error) { return failure(error); } }
export async function explainNotification(workspace: NotificationWorkspace, input: { typeCode?: string; criteria?: RecipientCriteria; campaignId?: string; policyId?: string }) { try { return { ok: true as const, data: await getNotificationExplanation(workspace, input) }; } catch (error) { return failure(error); } }
export async function runNotificationCommand(workspace: NotificationWorkspace, command: NotificationCommand, input: unknown, requestId: string) {
  try {
    const a = await getNotificationActor(workspace), payload = notificationCommandPayload(command, input);
    const raw = record(await notificationRpc(a.db, "notification_command", { target_tenant: a.tenantId, actor_context: workspace, command, payload, request_id: z.uuid().parse(requestId) }));
    revalidatePath(notificationPaths[workspace], "layout");
    return { ok: true as const, id: typeof raw.id === "string" ? raw.id : undefined, version: typeof raw.revision === "number" ? raw.revision : undefined, data: { activePermits: typeof raw.active_permits === "number" ? raw.active_permits : 0, stopped: raw.stopped === true } };
  } catch (error) { return failure(error); }
}
export async function requestNotificationVerification(workspace: NotificationWorkspace, command: "grant_save" | "grant_revoke", input: unknown) {
  try {
    const actor = await getNotificationActor(workspace), payload = notificationCommandPayload(command, input);
    delete payload.verification_id;
    const call = (operation: string, value: Record<string, unknown>) => notificationRpc(createAdminClient(), "notification_verification", { target_tenant: actor.tenantId, actor_context: workspace, actor: actor.user.id, session_id: actor.sessionId, operation, input: value });
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0"), challenge = record(await call("request", { action: command, payload, code })), challengeId = z.uuid().parse(challenge.challenge_id);
    try {
      const env = getServerEnv(); if (!env.SENDGRID_FROM_EMAIL) throw new Error("Unavailable");
      const subject = "Bevestig de wijziging van notificatierechten", body = `Je verificatiecode is ${code}.\n\nControleer de gebruiker, het notificatierecht en het bereik in het geopende bevestigingsscherm. Deze code is maximaal vijf minuten geldig en werkt alleen voor deze exacte wijziging in je huidige sessie.\n\nHeb je dit niet aangevraagd? Deel de code niet en neem contact op met je beheerder.`;
      const tenant = actor.tenant, targetUrl = tenant ? tenantAppUrl(tenant.slug, notificationPaths[workspace]) : `${env.APP_URL}${notificationPaths[workspace]}`;
      const html = renderTenantEmailHtml({ brand: { company: tenant?.name ?? "Fieldgrid", domain: new URL(targetUrl).host, primary: tenant?.primaryColor ?? "#222C35", accent: tenant?.accentColor ?? "#41AC42", senderEmail: env.SENDGRID_FROM_EMAIL }, kind: "ticket_otp", message: { subject, body }, targetUrl, allowLocalLinks: env.DEPLOY_TARGET === "local" });
      await sendEmail({ fromEmail: env.SENDGRID_FROM_EMAIL, fromName: tenant?.name ?? env.SENDGRID_FROM_NAME, to: z.email().parse(challenge.email), subject, text: body, html, deliveryKey: `notification-verification:${challengeId}`, disableTracking: true, policy: { kind: "security", flow: "permissions_otp", tenantId: actor.tenantId } });
      await call("delivered", { challenge_id: challengeId, delivered: true });
      return { ok: true as const, data: { challengeId, expiresAt: z.string().parse(challenge.expires_at) } };
    } catch { await call("delivered", { challenge_id: challengeId, delivered: false }); return { ok: false as const, error: "De verificatiemail kon niet worden verstuurd. Er zijn geen rechten gewijzigd." }; }
  } catch (error) { return failure(error); }
}
export async function confirmNotificationVerification(workspace: NotificationWorkspace, challengeId: string, code: string) {
  try {
    const actor = await getNotificationActor(workspace), raw = record(await notificationRpc(createAdminClient(), "notification_verification", { target_tenant: actor.tenantId, actor_context: workspace, actor: actor.user.id, session_id: actor.sessionId, operation: "confirm", input: { challenge_id: z.uuid().parse(challengeId), code: z.string().regex(/^\d{6}$/).parse(code) } }));
    return { ok: true as const, data: { verificationId: z.uuid().parse(raw.verification_id), expiresAt: z.string().parse(raw.expires_at) } };
  } catch { return { ok: false as const, error: "De code klopt niet, is verlopen of hoort niet bij deze sessie. Vraag zo nodig een nieuwe code aan." }; }
}
