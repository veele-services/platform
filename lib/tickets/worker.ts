import "server-only";
import webpush from "web-push";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env/server";
import { sendEmail, SendGridDeliveryError } from "@/lib/providers/sendgrid";
import { NotificationDeferredError, NotificationSuppressedError, withNotificationProviderPermit } from "@/lib/notifications/provider-policy";
import { freezeEmailLogo } from "@/lib/notifications/brand-asset";
import { renderTenantEmailHtml } from "@/lib/communications/email";
import { FIELDGRID_PRIMARY, FIELDGRID_SECONDARY } from "@/lib/communications/templates";
import { tenantAppUrl } from "@/lib/tenancy/hostname";
import { ticketRpc } from "./rpc";
import { ticketPushEndpointAllowed } from "./push-validation";

const title = "Nieuwe ticketmelding";
const body = "Er staat een update klaar. Open de beveiligde omgeving om deze te bekijken. Antwoord uitsluitend in de ingelogde omgeving.";
const deliverySchema = z.object({ id: z.uuid(), tenantId: z.uuid(), channel: z.enum(["email", "push"]), recipientUserId:z.uuid(), context: z.enum(["staff", "tenant", "support", "platform"]), route: z.enum(["internal", "platform_support"]), recipient: z.email(), path: z.string().regex(/^\/(staff\/meldingen|app\/(meldingen|support)|platform\/support)\/[0-9a-f-]{36}$/), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), brand: z.object({ company: z.string(), primary: z.string().nullable(), accent: z.string().nullable(), logoPath: z.string().nullable() }), subscription: z.object({ id: z.uuid(), endpoint: z.url(), keys: z.object({ p256dh: z.string(), auth: z.string() }) }).nullable() });

export async function prepareTicketNotifications(outboxId: string) {
  return ticketRpc(createAdminClient(), "ticket_outbox_prepare", { target_event: outboxId });
}

export async function processTicketDeliveries() {
  const admin = createAdminClient();
  const claims = z.array(z.object({ id: z.uuid(), lease: z.uuid() })).parse(await ticketRpc(admin, "ticket_delivery_claim", { batch_size: 3 }));
  return processTicketDeliveryClaims(claims);
}

/** A bounded set of already leased rows. The database rechecks every lease and
 * current recipient before a provider request; IDs never grant delivery rights.
 * Also permits isolated transport verification without claiming unrelated work. */
export async function processTicketDeliveryClaims(input: Array<{ id: string; lease: string }>) {
  const claims = z.array(z.object({ id: z.uuid(), lease: z.uuid() }).strict()).max(25).parse(input);
  const admin = createAdminClient(), env = getServerEnv();
  let sent = 0, failed = 0, uncertain = 0, cancelled = 0;
  for (const claim of claims) {
    let submitted = false, channel: "email" | "push" | undefined;
    const finish = (outcome: string, providerId?: string) => ticketRpc(admin, "ticket_delivery_finish", { delivery_id: claim.id, lease_id: claim.lease, outcome, provider_id: providerId ?? null });
    try {
      // Checks live account, grants, category/record scope, event audience and
      // current channel preferences again. In-app insert is atomic in this RPC.
      const raw = await ticketRpc(admin, "ticket_delivery_begin", { delivery_id: claim.id, lease_id: claim.lease });
      if (!raw) continue;
      const delivery = deliverySchema.parse(raw); channel = delivery.channel;
      const target = delivery.context === "platform" ? new URL(delivery.path, env.APP_URL).href : tenantAppUrl(delivery.slug, delivery.path);
      if (delivery.channel === "email") {
        if (!env.SENDGRID_API_KEY || !env.SENDGRID_FROM_EMAIL) throw new Error("Mailconfiguratie ontbreekt");
        // Support is always Fieldgrid communication, never a tenant sender or
        // tenant-controlled template. Internal personnel mail is tenant branded.
        const platform = delivery.route === "platform_support";
        const brand = platform
          ? { company: "Fieldgrid", domain: new URL(env.APP_URL).hostname, primary: FIELDGRID_PRIMARY, accent: FIELDGRID_SECONDARY, senderEmail: env.SENDGRID_FROM_EMAIL }
          : { company: delivery.brand.company, domain: new URL(target).hostname, primary: delivery.brand.primary ?? FIELDGRID_PRIMARY, accent: delivery.brand.accent ?? FIELDGRID_SECONDARY, senderEmail: env.SENDGRID_FROM_EMAIL, emailLogoUrl: await freezeEmailLogo(admin,delivery.tenantId,delivery.slug,delivery.brand.logoPath) };
        const html = renderTenantEmailHtml({ brand, kind: "ticket_event", message: { subject: title, body }, targetUrl: target, allowLocalLinks: env.DEPLOY_TARGET === "local" });
        submitted = true;
        const result = await sendEmail({ to: delivery.recipient, fromEmail: env.SENDGRID_FROM_EMAIL, fromName: brand.company, subject: title, text: `${body}\n\n${target}`, html, deliveryKey: `ticket-${delivery.id}`, disableTracking: true, policy:{kind:"notification",tenantId:delivery.tenantId,type:"ticket.changed",context:delivery.context==="tenant"||delivery.context==="support"?"backoffice":delivery.context,recipientUserId:delivery.recipientUserId,sourceId:delivery.id,sourceKind:"ticket"} });
        await finish("sent", result.id); sent++;
      } else {
        if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT || !delivery.subscription) throw new Error("Pushconfiguratie ontbreekt");
        if (!ticketPushEndpointAllowed(delivery.subscription.endpoint)) throw new Error("Pushprovider niet toegestaan");
        webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
        submitted = true;
        await withNotificationProviderPermit({policy:{kind:"notification",tenantId:delivery.tenantId,type:"ticket.changed",context:delivery.context==="tenant"||delivery.context==="support"?"backoffice":delivery.context,recipientUserId:delivery.recipientUserId,sourceId:delivery.id,sourceKind:"ticket"},channel:"push",deliveryKey:`ticket-${delivery.id}`},()=>webpush.sendNotification({ endpoint: delivery.subscription!.endpoint, keys: delivery.subscription!.keys }, JSON.stringify({ title, body, target: delivery.path, tag: `ticket-${delivery.id}` }), { TTL: 3600, urgency: "normal", timeout: 15000 }));
        await finish("sent"); sent++;
      }
    } catch (error) {
      if(error instanceof NotificationDeferredError){await ticketRpc(admin,"ticket_delivery_defer",{delivery_id:claim.id,lease_id:claim.lease,retry_at:error.retryAt});continue;}
      if(error instanceof NotificationSuppressedError){await finish("cancelled");cancelled++;continue;}
      const status = error instanceof SendGridDeliveryError ? error.httpStatus : typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
      if (channel === "push" && [404, 410].includes(status)) { await finish("cancelled"); cancelled++; }
      else if (!submitted || (status >= 400 && status < 500 && status !== 408)) { await finish("failed"); failed++; }
      else { await finish("uncertain"); uncertain++; }
    }
  }
  return { claimed: claims.length, sent, failed, uncertain, cancelled };
}
