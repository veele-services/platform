import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { managementRpc } from "./rpc";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env/server";
import { tenantWorkspaceUrl } from "@/lib/tenancy/workspace-url";
import type { TenantContext } from "@/lib/auth/context";
import { withTenantEmailBrand } from "@/lib/communications/tenant-email-brand";
import { renderManagementInvitation } from "@/lib/communications/management-invitation";
import { freezeEmailLogo } from "@/lib/notifications/brand-asset";
import { freezeMailSnapshot, mailFailureMessage, mailFailureOutcome } from "@/lib/notifications/mail-snapshot";
import { sendEmail } from "@/lib/providers/sendgrid";

export function requireManagementMail() {
  const env = getServerEnv();
  if (!env.SENDGRID_API_KEY || !env.SENDGRID_FROM_EMAIL) throw new Error("E-mailverzending is niet ingesteld. Vraag de platformbeheerder om dit te controleren.");
  return { ...env, SENDGRID_FROM_EMAIL: env.SENDGRID_FROM_EMAIL };
}
/** Owner authorization must already have succeeded through the authenticated
 * prepare_invite command. No password/link/reset is created for existing users. */
export async function prepareManagementAccount(email: string): Promise<string> {
  const db = createAdminClient();
  const created = await db.auth.admin.createUser({ email, email_confirm: true });
  if (!created.error && created.data.user) return created.data.user.id;
  if (created.error && ["email_exists", "user_already_exists"].includes(created.error.code ?? "")) {
    for (let page = 1; page <= 100; page += 1) {
      const listed = await db.auth.admin.listUsers({ page, perPage: 100 });
      if (listed.error) break;
      const user = listed.data.users.find(value => value.email?.toLowerCase() === email.toLowerCase());
      if (user?.email_confirmed_at && (!user.banned_until || new Date(user.banned_until).getTime() <= Date.now())) return user.id;
      if (user || listed.data.users.length < 100) break;
    }
  }
  throw new Error("Het managementaccount kon niet worden voorbereid. Controleer het e-mailadres of vraag de platformbeheerder om hulp.");
}
const invitationResult = z.object({ id: z.uuid(), userId: z.uuid(), email: z.email(), name: z.string(), role: z.string(), deliveryId: z.uuid() });
export async function deliverManagementInvitation(tenant: TenantContext, result: unknown, actorDb: SupabaseClient<Database>): Promise<{ warning?: string }> {
  const input = invitationResult.parse(result), env = requireManagementMail(), db = createAdminClient();
  const deliveryKey = `management-invitation-${input.deliveryId}`;
  const logged = await db.from("mail_deliveries").insert({ tenant_id: tenant.id, recipient: input.email, template: "management_invitation", idempotency_key: deliveryKey, status: "processing", attempts: 1, render_snapshot: { membership_id: input.id, notification_kind: "security" }, branding_snapshot: { primary_color: tenant.primaryColor, accent_color: tenant.accentColor, logo_path: tenant.logoPath } }).select("id").single();
  if (logged.error?.code === "23505") return { warning: "Deze uitnodiging is al verwerkt. Controleer de verzendregistratie voordat je opnieuw verstuurt." };
  if (logged.error || !logged.data) throw new Error("De uitnodiging kon niet worden geregistreerd.");
  let providerStarted = false;
  try {
    // Membership may have been revoked after the command and before provider I/O.
    const member = await db.from("tenant_memberships").select("id").eq("id", input.id).eq("tenant_id", tenant.id).eq("user_id", input.userId).eq("status", "active").maybeSingle();
    if (member.error || !member.data) throw new Error("Deze uitnodiging is ingetrokken; er is niets verstuurd.");
    const target = new URL(await tenantWorkspaceUrl(tenant.id, tenant.slug, "/login")); target.searchParams.set("next", "/app");
    const logo = await freezeEmailLogo(db, tenant.id, tenant.slug, tenant.logoPath);
    const brand = await withTenantEmailBrand(tenant.id, { company: tenant.name, domain: target.hostname, primary: tenant.primaryColor, accent: tenant.accentColor, senderEmail: env.SENDGRID_FROM_EMAIL, emailLogoUrl: logo });
    const mail = renderManagementInvitation({ brand, name: input.name, role: input.role, targetUrl: target.href, allowLocalLinks: env.DEPLOY_TARGET === "local" });
    const frozen = await freezeMailSnapshot(db, tenant.id, logged.data.id, { ...mail, fromEmail: env.SENDGRID_FROM_EMAIL, fromName: tenant.name, to: input.email, targetUrl: target.href, templateRevision: 1, attachmentPath: null, attachmentFilename: null });
    const allowed = await managementRpc(actorDb, "management_invitation_access", { target_tenant: tenant.id, target_member: input.id, target_user: input.userId, delivery_id: input.deliveryId, recipient: input.email });
    if (allowed !== true) throw new Error("De uitnodiging of toegang is intussen ingetrokken; er is niets verstuurd.");
    providerStarted = true;
    const sent = await sendEmail({ ...frozen, deliveryKey, disableTracking: true, policy: { kind: "security", flow: "invitation", tenantId: tenant.id } });
    const recorded = await db.from("mail_deliveries").update({ status: "sent", provider_message_id: sent.id, sent_at: new Date().toISOString() }).eq("id", logged.data.id);
    if (recorded.error) return { warning: "De uitnodiging is verzonden; de verzendregistratie kon niet worden bijgewerkt." };
    return {};
  } catch (error) {
    const outcome = providerStarted ? mailFailureOutcome(error) : "failed";
    await db.from("mail_deliveries").update({ status: outcome, last_error: providerStarted ? mailFailureMessage(outcome) : "Uitnodiging niet verstuurd; controleer toegang en e-mailhuisstijl." }).eq("id", logged.data.id);
    return { warning: providerStarted ? mailFailureMessage(outcome) : error instanceof Error ? error.message : "De uitnodiging is niet verstuurd." };
  }
}
