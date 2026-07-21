export const BACKOFFICE_PROFILE_NAME_REQUIRED = "backoffice_profile_name_required";

type BackofficeProfileIdentity = {
  email?: string | null;
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
};

export type BackofficeProfileNameValidation =
  | { success: true; name: string }
  | { success: false; message: string };

export function normalizeBackofficeProfileName(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/gu, " ") : "";
}

export function validateBackofficeProfileName(
  value: unknown,
  email?: string | null,
): BackofficeProfileNameValidation {
  const rawName = typeof value === "string" ? value : "";
  if (/[\u0000-\u001F\u007F]/u.test(rawName)) {
    return { success: false, message: "Naam bevat ongeldige tekens." };
  }

  const name = normalizeBackofficeProfileName(rawName);
  if (name.length < 2) {
    return { success: false, message: "Volledige naam is verplicht." };
  }
  if (name.length > 120) {
    return { success: false, message: "Naam mag maximaal 120 tekens bevatten." };
  }
  if (name.includes("@") || (email && name.toLocaleLowerCase("nl-NL") === email.trim().toLocaleLowerCase("nl-NL"))) {
    return { success: false, message: "Vul uw naam in, niet uw e-mailadres." };
  }

  return { success: true, name };
}

export function getBackofficeProfileName(identity: BackofficeProfileIdentity): string | null {
  const metadataName = identity.user_metadata?.["full_name"] ?? identity.user_metadata?.["name"];
  const validation = validateBackofficeProfileName(metadataName, identity.email);
  return validation.success ? validation.name : null;
}

export function requiresBackofficeProfileName(identity: BackofficeProfileIdentity): boolean {
  const explicitlyRequired = identity.app_metadata?.[BACKOFFICE_PROFILE_NAME_REQUIRED] === true;
  const isTenantBackofficeUser = identity.app_metadata?.["portal"] === "tenant-admin";
  return explicitlyRequired || (isTenantBackofficeUser && !getBackofficeProfileName(identity));
}
