import type { User } from "@supabase/supabase-js";
import {
  assertTenantDomainMatchesEnvironment,
  generateInternalAuthPassword,
  issueCredentialRecoveryChallenge,
  markCredentialRecoveryDelivery,
  PORTAL_ONBOARDING_REQUIRED_METADATA,
  PORTAL_ONBOARDING_STATUS_METADATA,
  PORTAL_ONBOARDING_VERSION,
  PORTAL_ONBOARDING_VERSION_METADATA,
  resolveCredentialRecoveryOrigin,
  resolveFieldgridDeploymentEnvironment,
  revokeCredentialRecoveryChallenges,
  type CredentialRecoverySurface,
} from "@workspace/db";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildAccountActivationEmail, sendEmailWithResult } from "@/lib/email";
import {
  BACKOFFICE_PROFILE_NAME_REQUIRED,
  getBackofficeProfileName,
  validateBackofficeProfileName,
} from "@/lib/auth/backoffice-profile";

export type PortalInviteType =
  | "customer"
  | "personnel"
  | "tenant-admin"
  | "platform-admin";

export class PortalInviteDeliveryUncertainError extends Error {
  constructor() {
    super(
      "De activatiemail is mogelijk verzonden, maar de verzendprovider gaf geen definitieve bevestiging. Verstuur niet opnieuw en neem contact op met platformbeheer.",
    );
    this.name = "PortalInviteDeliveryUncertainError";
  }
}
function isEmailExistsError(
  error: { code?: string; message?: string } | null,
): boolean {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    error?.code === "email_exists" ||
    message.includes("already registered") ||
    message.includes("already been registered") ||
    message.includes("already exists")
  );
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

    const found = data.users.find(
      (user) => user.email?.toLowerCase() === normalized,
    );
    if (found) return found;
    if (data.users.length < 1000) return null;
  }

  return null;
}

function activationAppMetadata(
  existing: Record<string, unknown> | null | undefined,
  portal: PortalInviteType,
  profileNameRequired: boolean,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    ...(existing ?? {}),
    portal,
    credential_activation_pending: true,
  };
  if (portal === "personnel" || portal === "customer") {
    metadata[PORTAL_ONBOARDING_REQUIRED_METADATA] = true;
    metadata[PORTAL_ONBOARDING_STATUS_METADATA] = "not_started";
    metadata[PORTAL_ONBOARDING_VERSION_METADATA] = PORTAL_ONBOARDING_VERSION;
  }
  if (portal === "tenant-admin" && profileNameRequired) {
    metadata[BACKOFFICE_PROFILE_NAME_REQUIRED] = true;
  } else {
    delete metadata[BACKOFFICE_PROFILE_NAME_REQUIRED];
  }
  delete metadata["force_password_change"];
  delete metadata["temporary_password_issued_at"];
  delete metadata["temporary_password_expires_at"];
  delete metadata["temporary_password_kind"];
  return metadata;
}

function activationAppMetadataPatch(
  portal: PortalInviteType,
  profileNameRequired: boolean,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    portal,
    credential_activation_pending: true,
    force_password_change: null,
    temporary_password_issued_at: null,
    temporary_password_expires_at: null,
    temporary_password_kind: null,
    [BACKOFFICE_PROFILE_NAME_REQUIRED]: profileNameRequired ? true : null,
  };
  if (portal === "personnel" || portal === "customer") {
    metadata[PORTAL_ONBOARDING_REQUIRED_METADATA] = true;
    metadata[PORTAL_ONBOARDING_STATUS_METADATA] = "not_started";
    metadata[PORTAL_ONBOARDING_VERSION_METADATA] = PORTAL_ONBOARDING_VERSION;
  }
  return metadata;
}

function surfaceForPortal(portal: PortalInviteType): CredentialRecoverySurface {
  if (portal === "customer") return "customer-portal";
  if (portal === "personnel") return "personnel-portal";
  if (portal === "tenant-admin") return "tenant-backoffice";
  return "platform-admin";
}

function trustedActivationOrigin(
  activationUrl: string,
  portal: PortalInviteType,
): string {
  const configuredOrigin = new URL(activationUrl).origin;
  const configuredAllowedOrigins = (
    process.env["FIELDGRID_RECOVERY_ALLOWED_ORIGINS"] ?? ""
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const appEnvironment = process.env.APP_ENV?.trim().toLowerCase();

  if (appEnvironment !== "staging" && appEnvironment !== "production") {
    return resolveCredentialRecoveryOrigin({
      configuredOrigin,
      allowedOrigins:
        configuredAllowedOrigins.length > 0
          ? configuredAllowedOrigins
          : [configuredOrigin],
      allowHttpLocalhost: process.env.NODE_ENV !== "production",
    });
  }

  const environment = resolveFieldgridDeploymentEnvironment(appEnvironment);
  const host = new URL(configuredOrigin).hostname;
  const expectedPlatformHost =
    environment === "staging" ? "staging.fieldgrid.nl" : "app.fieldgrid.nl";
  const isFieldgridHost =
    host === "fieldgrid.nl" || host.endsWith(".fieldgrid.nl");

  if (portal === "platform-admin") {
    if (host !== expectedPlatformHost) {
      throw new Error(
        "Platformactivatie verwijst niet naar de actieve omgeving.",
      );
    }
  } else if (isFieldgridHost) {
    assertTenantDomainMatchesEnvironment(host, environment);
  } else if (!configuredAllowedOrigins.includes(configuredOrigin)) {
    throw new Error(
      "Extern tenantdomein ontbreekt in FIELDGRID_RECOVERY_ALLOWED_ORIGINS.",
    );
  }

  return resolveCredentialRecoveryOrigin({
    configuredOrigin,
    allowedOrigins: Array.from(
      new Set([...configuredAllowedOrigins, configuredOrigin]),
    ),
    allowHttpLocalhost: false,
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
}): Promise<{
  user: User;
  created: boolean;
  challengeId: string;
  expiresAt: Date;
  finalize: () => Promise<void>;
  rollback: () => Promise<void>;
}> {
  const admin = createAdminClient();
  const email = opts.email.trim().toLowerCase();
  const surface = surfaceForPortal(opts.portal);
  if ((surface === "platform-admin") !== (opts.tenantId === null)) {
    throw new Error("Ongeldige tenantbinding voor accountactivatie.");
  }
  const redirectOrigin = trustedActivationOrigin(
    opts.activationUrl,
    opts.portal,
  );
  const requestedNameValidation = validateBackofficeProfileName(
    opts.fullName,
    email,
  );
  let profileName = requestedNameValidation.success
    ? requestedNameValidation.name
    : null;
  const userMetadata = profileName
    ? { full_name: profileName, name: profileName }
    : {};
  const { data: createdData, error: createError } =
    await admin.auth.admin.createUser({
      email,
      password: generateInternalAuthPassword(),
      email_confirm: true,
      app_metadata: activationAppMetadata(
        null,
        opts.portal,
        opts.portal === "tenant-admin" && !profileName,
      ),
      user_metadata: userMetadata,
    });

  let user: User;
  let created = false;
  let existingIdentityMutationAttempted = false;
  let existingIdentityFinalized = false;
  let pendingExistingIdentityUpdate: {
    appMetadata: Record<string, unknown>;
    userMetadata: Record<string, unknown>;
  } | null = null;
  if (!createError && createdData.user) {
    user = createdData.user;
    created = true;
  } else {
    if (!isEmailExistsError(createError)) {
      throw new Error(
        createError?.message ?? "Portaalgebruiker aanmaken mislukt.",
      );
    }
    const existingUser = await findAuthUserByEmail(admin, email);
    if (!existingUser) {
      throw new Error(
        "Het bestaande auth-account kon niet veilig worden opgehaald.",
      );
    }
    const existingPortal = existingUser.app_metadata?.portal;
    if (existingPortal && existingPortal !== opts.portal) {
      throw new Error(
        "Dit e-mailadres is al gekoppeld aan een ander portaalaccount.",
      );
    }
    const hasSignedIn = Boolean(
      (existingUser as User & { last_sign_in_at?: string | null })
        .last_sign_in_at,
    );
    const activationPending =
      existingUser.app_metadata?.credential_activation_pending === true;
    if (!opts.allowExistingActive && hasSignedIn && !activationPending) {
      throw new Error(
        "Er bestaat al een actief account voor dit e-mailadres. Gebruik wachtwoordherstel.",
      );
    }
    profileName ??= getBackofficeProfileName(existingUser);
    user = existingUser;
    pendingExistingIdentityUpdate = {
      // GoTrue merges metadata patches per key. Keep this patch minimal so a
      // later finalize cannot replay unrelated stale Auth metadata.
      appMetadata: activationAppMetadataPatch(
        opts.portal,
        opts.portal === "tenant-admin" && !profileName,
      ),
      userMetadata,
    };
  }

  let challengeId: string | null = null;
  let rolledBack = false;
  const rollback = async () => {
    if (rolledBack) return;
    const errors: string[] = [];
    let challengeRevocationFailed = false;

    if (challengeId) {
      try {
        await revokeCredentialRecoveryChallenges({
          challengeId,
          tenantId: opts.tenantId,
          surface,
          purpose: "activation",
          subjectUserId: user.id,
          actorUserId: opts.actorUserId ?? null,
          reason: "portal_invite_rolled_back",
        });
      } catch {
        challengeRevocationFailed = true;
        errors.push("activatie-intrekking");
      }
    }

    if (created || existingIdentityMutationAttempted) {
      // Supabase Auth has no compare-and-delete or compare-and-update contract.
      // Automatic reversal could therefore delete an identity adopted by a
      // concurrent successful invite or overwrite newer metadata. Keep the
      // random-password identity fail-closed, revoke its activation challenge,
      // and require an explicit read-before-write operator reconciliation.
      errors.push("auth-identiteitscontrole");
    }

    // Keep rollback retryable only while a live activation challenge may
    // remain. Auth reconciliation itself is deliberately an operator action.
    if (!challengeRevocationFailed) rolledBack = true;
    if (errors.length > 0) {
      throw new Error(
        `Uitnodiging is geweigerd, maar ${errors.join(" en ")} vereist handmatige controle.`,
      );
    }
  };

  const finalize = async () => {
    if (rolledBack) {
      throw new Error(
        "De ingetrokken portaaluitnodiging kan niet worden afgerond.",
      );
    }
    if (created || existingIdentityFinalized) return;
    if (!pendingExistingIdentityUpdate || existingIdentityMutationAttempted) {
      throw new Error(
        "De bestaande Auth-identiteit vereist handmatige controle.",
      );
    }

    // Existing identities are updated only after the caller has durably bound
    // the matching authorization surface. This keeps failed delivery and the
    // losing side of a cross-surface race from changing a working account.
    existingIdentityMutationAttempted = true;
    const { data: updatedData, error: updateError } =
      await admin.auth.admin.updateUserById(user.id, {
        app_metadata: pendingExistingIdentityUpdate.appMetadata,
        user_metadata: pendingExistingIdentityUpdate.userMetadata,
      });
    if (updateError || !updatedData.user) {
      try {
        await rollback();
      } catch (rollbackError) {
        throw rollbackError;
      }
      throw new Error(
        updateError?.message ?? "Portaalgebruiker bijwerken mislukt.",
      );
    }
    user = updatedData.user;
    existingIdentityFinalized = true;
  };

  try {
    const challenge = await issueCredentialRecoveryChallenge({
      surface,
      purpose: "activation",
      tenantId: opts.tenantId,
      accountIdentifier: email,
      subjectUserId: user.id,
      redirectOrigin,
      actorUserId: opts.actorUserId ?? null,
      networkSignal: opts.actorUserId
        ? `actor:${opts.actorUserId}`
        : "backoffice-issued",
      clientSignal: "account-activation",
    });
    if (
      challenge.status !== "issued" ||
      !challenge.challengeId ||
      !challenge.code ||
      !challenge.expiresAt
    ) {
      throw new Error(
        "Er is recent al een activatiemail verstuurd. Probeer het later opnieuw.",
      );
    }
    challengeId = challenge.challengeId;

    const { subject, html } = buildAccountActivationEmail({
      recipientName: profileName ?? email,
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
    const deliveryUncertain =
      !sent.success && sent.deliveryEffect === "unknown";
    await markCredentialRecoveryDelivery(
      challenge.challengeId,
      sent.success || deliveryUncertain,
    );
    if (deliveryUncertain) throw new PortalInviteDeliveryUncertainError();
    if (!sent.success) throw new Error("Activatiemail versturen mislukt.");

    return {
      user,
      created,
      challengeId: challenge.challengeId,
      expiresAt: challenge.expiresAt,
      finalize,
      rollback,
    };
  } catch (error) {
    try {
      await rollback();
    } catch (rollbackError) {
      throw rollbackError;
    }
    throw error;
  }
}
