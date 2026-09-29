import "server-only";

import { randomUUID } from "node:crypto";
import type { TenantContext } from "@/lib/auth/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env/server";
import { tenantAppUrl } from "@/lib/tenancy/hostname";
import { sendEmail } from "@/lib/providers/sendgrid";
import { renderPersonnelInvitation } from "@/lib/communications/personnel-invitation";

export function requirePersonnelEmail() {
  const env = getServerEnv();
  if (!env.SENDGRID_API_KEY || !env.SENDGRID_FROM_EMAIL) throw new Error("E-mailverzending is niet ingesteld. Vraag de platformbeheerder om dit te controleren.");
  return { ...env, SENDGRID_FROM_EMAIL: env.SENDGRID_FROM_EMAIL };
}

export async function preparePersonnelAccount(email: string): Promise<{ userId: string; tokenHash: string | null }> {
  const admin = createAdminClient();
  // This generates a one-use link without sending Supabase's default email.
  const { data, error } = await admin.auth.admin.generateLink({ type: "invite", email });
  if (!error && data.user && data.properties?.hashed_token) return { userId: data.user.id, tokenHash: data.properties.hashed_token };
  // Confirmed accounts keep their credentials; never issue a password reset or
  // magic sign-in link just because an administrator adds them to another tenant.
  if (error && ["email_exists", "user_already_exists"].includes(error.code ?? "")) {
    for (let page = 1; page <= 100; page += 1) {
      const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page, perPage: 100 });
      if (listError) break;
      const existing = listed.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
      if (existing?.email_confirmed_at) return { userId: existing.id, tokenHash: null };
      if (listed.users.length < 100) break;
    }
  }
  throw new Error("De uitnodiging kon niet worden voorbereid. Probeer het opnieuw of neem contact op met je beheerder.");
}

export async function deliverPersonnelInvitation(input: {
  tenant: TenantContext;
  person: { id: string; email: string; full_name: string; employee_number: string };
  tokenHash: string | null;
}): Promise<{ warning?: string }> {
  const env = requirePersonnelEmail();
  const admin = createAdminClient();
  const { data: branding, error } = await admin.from("tenant_branding").select("primary_color,accent_color,logo_path,sender_name").eq("tenant_id", input.tenant.id).single();
  if (error) throw new Error("De huisstijl voor de uitnodiging kon niet worden opgehaald.");
  const url = new URL(tenantAppUrl(input.tenant.slug, input.tokenHash ? "/auth/invite" : "/staff"));
  if (input.tokenHash) {
    url.searchParams.set("tenant", input.tenant.slug);
    // Fragments are not sent in HTTP requests, access logs or Referer headers.
    url.hash = new URLSearchParams({ token_hash: input.tokenHash }).toString();
  }
  const mail = renderPersonnelInvitation({
    brand: {
      company: input.tenant.name, domain: new URL(tenantAppUrl(input.tenant.slug)).hostname,
      primary: branding.primary_color, accent: branding.accent_color,
      senderEmail: env.SENDGRID_FROM_EMAIL,
      emailLogoUrl: branding.logo_path ? `${env.APP_URL}/api/branding/${input.tenant.id}/email-logo` : null,
    },
    name: input.person.full_name, employeeNumber: input.person.employee_number,
    targetUrl: url.href, existingAccount: !input.tokenHash, allowLocalLinks: env.DEPLOY_TARGET === "local",
  });
  const deliveryKey = `personnel-${input.person.id}-${randomUUID()}`;
  const { error: logError } = await admin.from("mail_deliveries").insert({
    tenant_id: input.tenant.id, recipient: input.person.email, template: "personnel_invitation",
    status: "processing", attempts: 1, idempotency_key: deliveryKey,
    // Never persist the activation token or a rendered email containing it.
    render_snapshot: { subject: mail.subject, personnel_id: input.person.id },
    branding_snapshot: { primary_color: branding.primary_color, accent_color: branding.accent_color, logo_path: branding.logo_path },
  });
  if (logError) throw new Error("De uitnodiging kon niet worden geregistreerd. Probeer opnieuw.");
  let sent: { id: string };
  try {
    sent = await sendEmail({ ...mail, to: input.person.email, fromEmail: env.SENDGRID_FROM_EMAIL,
      fromName: branding.sender_name || input.tenant.name, deliveryKey, disableTracking: true });
  } catch {
    await admin.from("mail_deliveries").update({ status: "failed", last_error: "De e-mailprovider heeft de uitnodiging niet bevestigd." }).eq("tenant_id", input.tenant.id).eq("idempotency_key", deliveryKey);
    throw new Error("De uitnodigingsmail kon niet worden verstuurd. Probeer het opnieuw via ‘Meer → Uitnodiging opnieuw versturen’.");
  }
  const { error: updateError } = await admin.from("mail_deliveries").update({
    status: "sent", provider_message_id: sent.id, sent_at: new Date().toISOString(),
  }).eq("tenant_id", input.tenant.id).eq("idempotency_key", deliveryKey);
  return updateError ? { warning: "De uitnodigingsmail is verstuurd, maar de verzendstatus kon niet worden bijgewerkt." } : {};
}
