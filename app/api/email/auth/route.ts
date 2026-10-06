import { withTenantEmailBrand } from "@/lib/communications/tenant-email-brand";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getServerEnv } from "@/lib/env/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ticketRpc } from "@/lib/tickets/rpc";
import { sendEmail, NotificationSuppressedError } from "@/lib/providers/sendgrid";
import { renderTenantEmailHtml } from "@/lib/communications/email";
import { readMailWebhookBody } from "@/lib/email-centre/request-body";
import { verifyAuthMailHook } from "@/lib/email-centre/webhook-security";
import { authMailDestination, authMailMessages, authMailPayload } from "@/lib/email-centre/auth-message";

const contextSchema = z.object({ tenant_id: z.uuid().nullable(), company: z.string(), primary: z.string(), accent: z.string(), logo: z.boolean() });
const headers = { "cache-control": "no-store" };
// Never return/log provider errors or payloads: these contain account tokens.
const failure = (status: number) => Response.json({ error: { http_code: status, message: "De accountmail is niet bevestigd. Vraag later een nieuwe code aan of neem contact op met je beheerder." } }, { status, headers });

export async function POST(request: Request) {
  const env = getServerEnv();
  if (!env.SUPABASE_SEND_EMAIL_HOOK_SECRET || !env.SENDGRID_FROM_EMAIL) return failure(503);
  let raw: Buffer;
  try { raw = await readMailWebhookBody(request, 131072); } catch { return failure(413); }
  if (!verifyAuthMailHook(raw, request.headers, env.SUPABASE_SEND_EMAIL_HOOK_SECRET)) return failure(401);
  let payload, destination;
  try {
    payload = authMailPayload.parse(JSON.parse(raw.toString("utf8")));
    destination = authMailDestination(payload.email_data.redirect_to, env.APP_URL, env.DEPLOY_TARGET);
  } catch { return failure(400); }
  const db = createAdminClient(), hookId = request.headers.get("webhook-id")!, digest = createHash("sha256").update(raw).digest("hex");
  const receipt = (operation: string) => ticketRpc(db, "email_auth_hook_receipt", { operation, hook_id: hookId, payload_hash: digest });
  let claimed = false, sendStarted = false;
  try {
    const context = contextSchema.parse(await ticketRpc(db, "email_auth_context", { target_slug: destination.slug, actor: payload.user.id, recipient: payload.user.email, action_type: payload.email_data.email_action_type }));
    const messages = authMailMessages(payload, destination.origin, context.company);
    const claim = z.object({ claimed: z.boolean(), state: z.string().optional() }).parse(await receipt("begin"));
    // Supabase requires a JSON body and Content-Type for HTTP 200 hook replies,
    // including acknowledgements of previously completed deliveries.
    if (!claim.claimed) return claim.state === "done" ? Response.json({}, { status: 200, headers }) : failure(409);
    claimed = true;
    for (const [index, message] of messages.entries()) {
      const html = renderTenantEmailHtml({
        kind: message.otp ? "auth_otp" : "auth_event", message,
        brand: await withTenantEmailBrand(context.tenant_id, { company: context.company, domain: new URL(destination.origin).host, primary: context.primary, accent: context.accent, senderEmail: env.SENDGRID_FROM_EMAIL, emailLogoUrl: context.logo ? `${env.APP_URL}/api/branding/${context.tenant_id}/email-logo` : null }),
        targetUrl: message.targetUrl, targetLabel: message.label, allowLocalLinks: env.DEPLOY_TARGET === "local",
      });
      sendStarted = true;
      await sendEmail({ fromEmail: env.SENDGRID_FROM_EMAIL, fromName: context.company, to: message.recipient, subject: message.subject,
        text: message.otp ? message.body : `${message.body}\n\n${message.targetUrl}`, html,
        deliveryKey: `auth-hook:${createHash("sha256").update(hookId).digest("hex")}:${index}`, disableTracking: true,
        policy: { kind: "security", flow: "auth_hook", tenantId: context.tenant_id },
      });
    }
    const saved = z.object({ ok: z.literal(true) }).safeParse(await receipt("done"));
    return saved.success ? Response.json({}, { status: 200, headers }) : failure(503);
  } catch (error) {
    if (claimed) {
      // Do not replay a partial two-address change or an uncertain provider send.
      // Only receipt hashes and generic outcomes persist; never OTPs or HTML.
      try { await receipt(error instanceof NotificationSuppressedError ? "blocked" : sendStarted ? "uncertain" : "failed"); } catch { /* Return failure, never claim delivery. */ }
    }
    return failure(503);
  }
}
