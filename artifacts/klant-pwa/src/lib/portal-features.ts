import { isTenantModuleEnabled, type FieldgridModuleKey } from "@workspace/db";
import { redirect } from "next/navigation";
import { requireCurrentCustomerPortalTenantId } from "./auth/tenant";

export type CustomerPortalFeatureFlags = {
  documents: boolean;
  finance: boolean;
  reporting: boolean;
  knowledgebase: boolean;
  releases: boolean;
};

const MODULE_KEYS = {
  documents: "documents",
  finance: "finance",
  reporting: "reporting",
  knowledgebase: "knowledgebase",
  releases: "releases",
} satisfies Record<keyof CustomerPortalFeatureFlags, FieldgridModuleKey>;

export async function getCustomerPortalFeatureFlags(
  tenantId?: string,
): Promise<CustomerPortalFeatureFlags> {
  const resolvedTenantId =
    tenantId ?? (await requireCurrentCustomerPortalTenantId());
  if (!resolvedTenantId) {
    return {
      documents: false,
      finance: false,
      reporting: false,
      knowledgebase: false,
      releases: false,
    };
  }

  const entries = await Promise.all(
    Object.entries(MODULE_KEYS).map(async ([key, moduleKey]) => [
      key,
      await isTenantModuleEnabled(resolvedTenantId, moduleKey),
    ]),
  );
  return Object.fromEntries(entries) as CustomerPortalFeatureFlags;
}

export async function requireCustomerPortalFeature(
  feature: keyof CustomerPortalFeatureFlags,
  fallback = "/",
): Promise<void> {
  const flags = await getCustomerPortalFeatureFlags();
  if (!flags[feature]) redirect(fallback);
}
