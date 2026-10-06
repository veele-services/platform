import { withTenantEmailBrand } from "@/lib/communications/tenant-email-brand";
import "server-only";

import { randomUUID } from "node:crypto";
import type { TenantContext } from "@/lib/auth/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env/server";
import { tenantAppUrl } from "@/lib/tenancy/hostname";
import { sendEmail } from "@/lib/providers/sendgrid";
import { renderPersonnelInvitation } from "@/lib/communications/personnel-invitation";
import { freezeMailSnapshot, mailFailureOutcome, mailFailureMessage } from "@/lib/notifications/mail-snapshot";
import { resolveMailTemplate, renderNotificationMailText } from "@/lib/notifications/mail-template";
import { freezeEmailLogo } from "@/lib/notifications/brand-asset";
import { deferNotificationMail } from "@/lib/notifications/deferred-mail";
import { renderTenantEmailHtml } from "@/lib/communications/email";

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
  person: { id: string; userId: string; email: string; full_name: string; employee_number: string };
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
  let mail = renderPersonnelInvitation({
    brand: await withTenantEmailBrand(input.tenant.id, {
      company: input.tenant.name, domain: new URL(tenantAppUrl(input.tenant.slug)).hostname,
      primary: branding.primary_color, accent: branding.accent_color,
      senderEmail: env.SENDGRID_FROM_EMAIL,
      emailLogoUrl: branding.logo_path ? `${env.APP_URL}/api/branding/${input.tenant.id}/email-logo` : null,
    }),
    name: input.person.full_name, employeeNumber: input.person.employee_number,
    targetUrl: url.href, existingAccount: !input.tokenHash, allowLocalLinks: env.DEPLOY_TARGET === "local",
  });
  const deliveryKey = `personnel-${input.person.id}-${randomUUID()}`;
  const { data: delivery, error: logError } = await admin.from("mail_deliveries").insert({
    tenant_id: input.tenant.id, recipient: input.person.email, template: "personnel_invitation",
    status: "processing", attempts: 1, idempotency_key: deliveryKey,
    // Never persist the activation token or a rendered email containing it.
    render_snapshot: { subject: mail.subject, personnel_id: input.person.id, notification_kind:input.tokenHash?"security":"notification" },
    branding_snapshot: { primary_color: branding.primary_color, accent_color: branding.accent_color, logo_path: branding.logo_path },
  }).select("id").single();
  if (logError) throw new Error("De uitnodiging kon niet worden geregistreerd. Probeer opnieuw.");
  let sent: { id: string };
  let providerStarted=false;
  try {
    if (!input.tokenHash) {
      const template=await resolveMailTemplate(admin,input.tenant.id,"personnel.invitation","staff");
      const values={bedrijfsnaam:input.tenant.name,medewerkernaam:input.person.full_name,personeelsnummer:input.person.employee_number};
      const subject=renderNotificationMailText(template.title,template.variables,values),body=renderNotificationMailText(template.body,template.variables,values);
      const logo=await freezeEmailLogo(admin,input.tenant.id,input.tenant.slug,branding.logo_path);
      const html=renderTenantEmailHtml({kind:"personnel_invitation",existingAccount:true,brand:await withTenantEmailBrand(input.tenant.id, {company:input.tenant.name,domain:new URL(tenantAppUrl(input.tenant.slug)).hostname,primary:branding.primary_color,accent:branding.accent_color,senderEmail:env.SENDGRID_FROM_EMAIL,emailLogoUrl:logo}),message:{subject,body},targetUrl:url.href,targetLabel:template.cta_label,allowLocalLinks:env.DEPLOY_TARGET==="local"});
      const frozen=await freezeMailSnapshot(admin,input.tenant.id,delivery!.id,{fromEmail:env.SENDGRID_FROM_EMAIL,fromName:branding.sender_name||input.tenant.name,to:input.person.email,subject,text:`${body}\n\n${url.href}`,html,targetUrl:url.href,templateRevision:template.revision,templateVersionId:template.version_id,templateBaseVersionId:template.base_version_id,attachmentPath:null,attachmentFilename:null});
      mail={subject:frozen.subject,text:frozen.text,html:frozen.html};
    }
    providerStarted=true;sent = await sendEmail({ ...mail, to: input.person.email, fromEmail: env.SENDGRID_FROM_EMAIL,
      fromName: branding.sender_name || input.tenant.name, deliveryKey, disableTracking: true,
      policy: input.tokenHash
        ? { kind: "security", flow: "invitation", tenantId: input.tenant.id }
        : { kind: "notification", tenantId: input.tenant.id, type: "personnel.invitation", context: "staff", recipientUserId: input.person.userId, sourceId: delivery!.id } });
  } catch (cause) {
    if (!input.tokenHash && await deferNotificationMail(cause,input.tenant.id,delivery!.id,"personnel.invitation","staff")) {
      return {warning:"De uitnodigingsmail staat klaar en wordt na de persoonlijke rusttijden verzonden. Het personeelsaccount is gekoppeld."};
    }
    const status = providerStarted?mailFailureOutcome(cause):"failed";
    const failure=providerStarted?mailFailureMessage(status):"De uitnodiging kon niet worden voorbereid; er is nog geen verzending gestart.";
    await admin.from("mail_deliveries").update({ status, last_error: failure }).eq("tenant_id", input.tenant.id).eq("idempotency_key", deliveryKey).eq("status", "processing");
    throw new Error(failure);
  }
  const { error: updateError } = await admin.from("mail_deliveries").update({
    status: "sent", provider_message_id: sent.id, sent_at: new Date().toISOString(),
  }).eq("tenant_id", input.tenant.id).eq("idempotency_key", deliveryKey);
  return updateError ? { warning: "De uitnodigingsmail is verstuurd, maar de verzendstatus kon niet worden bijgewerkt." } : {};
}
