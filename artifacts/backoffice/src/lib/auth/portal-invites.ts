import type { User } from "@supabase/supabase-js";
import {
  generateInternalAuthPassword,
  issueCredentialRecoveryChallenge,
  markCredentialRecoveryDelivery,
  resolveCredentialRecoveryOrigin,
  type CredentialRecoverySurface,
} from "@workspace/db";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildAccountActivationEmail, sendEmailWithResult } from "@/lib/email";

export type PortalInviteType = "customer" | "personnel" | "tenant-admin" | "platform-admin";
function isEmailExistsError(error: { code?: string; message?: string } | null): boolean {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "email_exists" ||
    message.includes("already registered") ||
    message.includes("already been registered") ||
    message.includes("already exists");
}

export async function findAuthUserByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<User | null> {
  const normalized = email.toLowerCase();

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });

    if (error) {
      throw new Error(error.message ?? "Supabase gebruiker zoeken mislukt.");
    }

    const found = data.users.find((user) => user.email?.toLowerCase() === normalized);
    if (found) return found;
    if (data.users.length < 1000) return null;
  }

  return null;
}

function activationAppMetadata(existing: Record<string, unknown> | null | undefined, portal: PortalInviteType): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    ...(existing ?? {}),
    portal,
    credential_activation_pending: true,
  };
  delete metadata["force_password_change"];
  delete metadata["temporary_password_issued_at"];
  delete metadata["temporary_password_expires_at"];
  delete metadata["temporary_password_kind"];
  return metadata;
}

function surfaceForPortal(portal: PortalInviteType): CredentialRecoverySurface {
  if (portal === "customer") return "customer-portal";
  if (portal === "personnel") return "personnel-portal";
  if (portal === "tenant-admin") return "tenant-backoffice";
  return "platform-admin";
}

function trustedActivationOrigin(activationUrl: string): string {
  const configuredOrigin = new URL(activationUrl).origin;
  const allowedOrigins = (process.env["FIELDGRID_RECOVERY_ALLOWED_ORIGINS"] ?? configuredOrigin)
    .split(",").map((value) => value.trim()).filter(Boolean);
  return resolveCredentialRecoveryOrigin({
    configuredOrigin,
    allowedOrigins,
    allowHttpLocalhost: process.env.NODE_ENV !== "production",
  });
}

export async function provisionPortalUserForActivation(opts: {
  email: string;
  fullName: string;
  portal: PortalInviteType;
  tenantId: string | null;
  portalName: string;
  activationUrl: string;
  actorUserId?: string | null;
  allowExistingActive?: boolean;
}): Promise<{ user: User; created: boolean; challengeId: string; expiresAt: Date }> {
  const admin = createAdminClient();
  const email = opts.email.trim().toLowerCase();
  const surface = surfaceForPortal(opts.portal);
  if ((surface === "platform-admin") !== (opts.tenantId === null)) {
    throw new Error("Ongeldige tenantbinding voor accountactivatie.");
  }
  const userMetadata = { full_name: opts.fullName, name: opts.fullName };
  const { data: createdData, error: createError } = await admin.auth.admin.createUser({
    email,
    password: generateInternalAuthPassword(),
    email_confirm: true,
    app_metadata: activationAppMetadata(null, opts.portal),
    user_metadata: userMetadata,
  });

  let user: User;
  let created = false;
  if (!createError && createdData.user) {
    user = createdData.user;
    created = true;
  } else {
    if (!isEmailExistsError(createError)) {
      throw new Error(createError?.message ?? "Portaalgebruiker aanmaken mislukt.");
    }
    const existingUser = await findAuthUserByEmail(admin, email);
    if (!existingUser) {
      throw new Error("Het bestaande auth-account kon niet veilig worden opgehaald.");
    }
    const existingPortal = existingUser.app_metadata?.portal;
    if (existingPortal && existingPortal !== opts.portal && !opts.allowExistingActive) {
      throw new Error("Dit e-mailadres is al gekoppeld aan een ander portaalaccount.");
    }
    const hasSignedIn = Boolean((existingUser as User & { last_sign_in_at?: string | null }).last_sign_in_at);
    const activationPending = existingUser.app_metadata?.credential_activation_pending === true;
    if (!opts.allowExistingActive && hasSignedIn && !activationPending) {
      throw new Error("Er bestaat al een actief account voor dit e-mailadres. Gebruik wachtwoordherstel.");
    }
    const { data: updatedData, error: updateError } = await admin.auth.admin.updateUserById(existingUser.id, {
      app_metadata: activationAppMetadata(existingUser.app_metadata, opts.portal),
      user_metadata: { ...(existingUser.user_metadata ?? {}), ...userMetadata },
    });
    if (updateError || !updatedData.user) {
      throw new Error(updateError?.message ?? "Portaalgebruiker bijwerken mislukt.");
    }
    user = updatedData.user;
  }

  const challenge = await issueCredentialRecoveryChallenge({
    surface,
    purpose: "activation",
    tenantId: opts.tenantId,
    accountIdentifier: email,
    subjectUserId: user.id,
    redirectOrigin: trustedActivationOrigin(opts.activationUrl),
    actorUserId: opts.actorUserId ?? null,
    networkSignal: opts.actorUserId ? `actor:${opts.actorUserId}` : "backoffice-issued",
    clientSignal: "account-activation",
  });
  if (challenge.status !== "issued" || !challenge.challengeId || !challenge.code || !challenge.expiresAt) {
    throw new Error("Er is recent al een activatiemail verstuurd. Probeer het later opnieuw.");
  }

  const { subject, html } = buildAccountActivationEmail({
    recipientName: opts.fullName || email,
    portalName: opts.portalName,
    activationUrl: opts.activationUrl,
    code: challenge.code,
  });
  const sent = await sendEmailWithResult({
    to: email,
    subject,
    html,
    tenantId: opts.tenantId,
    purpose: `${surface}_account_activation`,
  });
  await markCredentialRecoveryDelivery(challenge.challengeId, sent.success);
  if (!sent.success) throw new Error(sent.error ?? "Activatiemail versturen mislukt.");

  return { user, created, challengeId: challenge.challengeId, expiresAt: challenge.expiresAt };
}
