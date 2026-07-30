"use server";

import {
  activatePlatformWebsiteDeployment,
  approvePlatformWebsiteDeployment,
  bindPrimaryTenantDomainToWebsite,
  checkPlatformWebsiteDeploymentHealth,
  createInitialWebsiteSettings,
  getPlatformWebsiteDelivery,
  getWebsiteAdminOverview,
  initializeManagedWebsite,
  registerPlatformWebsiteDeployment,
  rollbackPlatformWebsiteDelivery,
} from "@workspace/db";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth/platform";

function required(formData: FormData, name: string): string {
  const value = String(formData.get(name) ?? "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function optional(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? "").trim();
  return value || null;
}

function numberValue(formData: FormData, name: string): number {
  const value = Number(required(formData, name));
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function revalidateTenant(tenantId: string): void {
  revalidatePath(`/platform/tenants/${tenantId}`);
}

export async function getPlatformWebsiteDeliveryAction(tenantId: string) {
  await requirePlatformAdmin();
  return getPlatformWebsiteDelivery(tenantId);
}

export type PlatformWebsiteInitializationResult = {
  success: boolean;
  message: string;
};

const PRIMARY_DOMAIN_UNAVAILABLE_CODE = "P0002";
const PRIMARY_DOMAIN_UNAVAILABLE_MESSAGE =
  "exactly one active or verified primary tenant domain is required";

function isPrimaryDomainUnavailable(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === PRIMARY_DOMAIN_UNAVAILABLE_CODE &&
    error.message.includes(PRIMARY_DOMAIN_UNAVAILABLE_MESSAGE)
  );
}

function platformErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Onbekende fout bij het koppelen van het primaire tenantdomein.";
}

function platformDeploymentRegistrationErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message === "Custom website route is not operator-approved") {
    return "Deze custom kandidaat is niet meer actueel. Herlaad de pagina en gebruik uitsluitend de getoonde kandidaat.";
  }
  if (message === "Custom website deployment host does not match the site") {
    return "Het kandidaatdomein komt niet overeen met het gekoppelde primaire tenantdomein.";
  }
  if (message === "Phase 9 deployment registration is staging-only") {
    return "Custom kandidaatregistratie is op dit moment uitsluitend toegestaan voor een stagingdomein.";
  }
  if (message === "Custom website deployment release identity conflict") {
    return "Deze release is al met andere routegegevens geregistreerd. Gebruik de bestaande deployment of laat de operatorconfiguratie controleren.";
  }
  return "De custom kandidaat kon niet worden geregistreerd. Herlaad de pagina en probeer het opnieuw met de actuele getoonde kandidaat.";
}

async function bindTrustedPrimaryDomain(input: {
  tenantId: string;
  siteId: string;
  authoringRevision: number;
  actorUserId: string;
}): Promise<string> {
  const binding = await bindPrimaryTenantDomainToWebsite({
    tenantId: input.tenantId,
    siteId: input.siteId,
    expectedAuthoringRevision: input.authoringRevision,
    actorUserId: input.actorUserId,
    reason: "Platformbeheer koppelt het geverifieerde primaire tenantdomein.",
  });
  return binding.hostname;
}

export async function initializePlatformManagedWebsiteAction(
  formData: FormData,
): Promise<PlatformWebsiteInitializationResult> {
  try {
    const actor = await requirePlatformAdmin();
    const tenantId = required(formData, "tenantId");
    const current = await getWebsiteAdminOverview(tenantId);

    if (current.site) {
      revalidateTenant(tenantId);
      return {
        success: true,
        message: "De managed website was al geïnitialiseerd.",
      };
    }

    let initialized: Awaited<ReturnType<typeof initializeManagedWebsite>>;
    try {
      initialized = await initializeManagedWebsite({
        tenantId,
        actorUserId: actor.userId,
        templateKey: "trust_conversion",
        settings: createInitialWebsiteSettings(current.tenantName),
      });
    } catch (error) {
      const afterFailure = await getWebsiteAdminOverview(tenantId);
      if (!afterFailure.site) throw error;
      initialized = {
        siteId: afterFailure.site.id,
        authoringRevision: afterFailure.site.authoringRevision,
      };
    }

    let domainMessage = " Koppel daarna een geverifieerd primair tenantdomein.";
    try {
      const hostname = await bindTrustedPrimaryDomain({
        tenantId,
        siteId: initialized.siteId,
        authoringRevision: initialized.authoringRevision,
        actorUserId: actor.userId,
      });
      domainMessage = ` Primair domein ${hostname} is veilig gekoppeld.`;
    } catch (error) {
      // Site initialization remains useful and is intentionally not rolled
      // back when domain verification has not completed yet.
      if (!isPrimaryDomainUnavailable(error)) {
        revalidateTenant(tenantId);
        return {
          success: false,
          message:
            "De managed website is als concept aangemaakt, maar het primaire " +
            "tenantdomein kon niet worden gekoppeld. Er is niets gepubliceerd. " +
            `Details: ${platformErrorMessage(error)}`,
        };
      }
    }

    revalidateTenant(tenantId);
    return {
      success: true,
      message: `De managed website is als concept aangemaakt.${domainMessage} Er is niets gepubliceerd.`,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "De managed website kon niet worden geïnitialiseerd.",
    };
  }
}

export async function bindPlatformPrimaryWebsiteDomainAction(
  formData: FormData,
): Promise<PlatformWebsiteInitializationResult> {
  try {
    const actor = await requirePlatformAdmin();
    const tenantId = required(formData, "tenantId");
    const current = await getWebsiteAdminOverview(tenantId);
    if (!current.site) {
      throw new Error("Initialiseer eerst de managed website.");
    }
    if (current.site.canonicalHostname) {
      return {
        success: true,
        message: `Primair domein ${current.site.canonicalHostname} was al gekoppeld.`,
      };
    }

    const hostname = await bindTrustedPrimaryDomain({
      tenantId,
      siteId: current.site.id,
      authoringRevision: current.site.authoringRevision,
      actorUserId: actor.userId,
    });
    revalidateTenant(tenantId);
    return {
      success: true,
      message: `Primair domein ${hostname} is gekoppeld. Er is niets gepubliceerd.`,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Het primaire tenantdomein kon niet worden gekoppeld.",
    };
  }
}

export async function registerPlatformWebsiteDeploymentAction(
  formData: FormData,
): Promise<PlatformWebsiteInitializationResult> {
  try {
    const actor = await requirePlatformAdmin();
    const tenantId = required(formData, "tenantId");
    const deployment = await registerPlatformWebsiteDeployment({
      tenantId,
      siteId: required(formData, "siteId"),
      providerKey: required(formData, "providerKey"),
      routeKey: required(formData, "routeKey"),
      releaseId: required(formData, "releaseId"),
      expectedHost: required(formData, "expectedHost"),
      healthPath: required(formData, "healthPath"),
      actorUserId: actor.userId,
      changeReference: required(formData, "changeReference"),
    });
    revalidateTenant(tenantId);
    return {
      success: true,
      message: deployment.created
        ? "De exacte custom kandidaat is geregistreerd. Voer nu de healthcontrole uit."
        : "Deze exacte custom kandidaat was al geregistreerd. De bestaande deployment is hieronder hersteld.",
    };
  } catch (error) {
    return {
      success: false,
      message: platformDeploymentRegistrationErrorMessage(error),
    };
  }
}

export async function checkPlatformWebsiteDeploymentHealthAction(
  formData: FormData,
): Promise<void> {
  const actor = await requirePlatformAdmin();
  const tenantId = required(formData, "tenantId");
  await checkPlatformWebsiteDeploymentHealth({
    tenantId,
    siteId: required(formData, "siteId"),
    deploymentId: required(formData, "deploymentId"),
    actorUserId: actor.userId,
    changeReference: required(formData, "changeReference"),
    reason: "Run the strict staging health preflight for this deployment.",
  });
  revalidateTenant(tenantId);
}

export async function approvePlatformWebsiteDeploymentAction(
  formData: FormData,
): Promise<void> {
  const actor = await requirePlatformAdmin();
  const tenantId = required(formData, "tenantId");
  await approvePlatformWebsiteDeployment({
    tenantId,
    siteId: required(formData, "siteId"),
    deploymentId: required(formData, "deploymentId"),
    actorUserId: actor.userId,
    changeReference: required(formData, "changeReference"),
    reason: "Approve the exact healthy staging deployment identity.",
  });
  revalidateTenant(tenantId);
}

export async function activatePlatformWebsiteDeploymentAction(
  formData: FormData,
): Promise<void> {
  const actor = await requirePlatformAdmin();
  const tenantId = required(formData, "tenantId");
  await activatePlatformWebsiteDeployment({
    tenantId,
    siteId: required(formData, "siteId"),
    deploymentId: required(formData, "deploymentId"),
    expectedDeliveryRevision: numberValue(formData, "expectedDeliveryRevision"),
    expectedMode: required(formData, "expectedMode") as
      | "managed_cms"
      | "custom_nextjs",
    expectedTargetId: optional(formData, "expectedTargetId"),
    actorUserId: actor.userId,
    changeReference: required(formData, "changeReference"),
    reason: required(formData, "reason"),
  });
  revalidateTenant(tenantId);
}

export async function rollbackPlatformWebsiteDeliveryAction(
  formData: FormData,
): Promise<void> {
  const actor = await requirePlatformAdmin();
  const tenantId = required(formData, "tenantId");
  await rollbackPlatformWebsiteDelivery({
    tenantId,
    siteId: required(formData, "siteId"),
    expectedDeliveryRevision: numberValue(formData, "expectedDeliveryRevision"),
    expectedMode: required(formData, "expectedMode") as
      | "managed_cms"
      | "custom_nextjs",
    expectedTargetId: optional(formData, "expectedTargetId"),
    actorUserId: actor.userId,
    changeReference: required(formData, "changeReference"),
    reason: required(formData, "reason"),
  });
  revalidateTenant(tenantId);
}
