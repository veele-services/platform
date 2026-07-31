import { isTenantModuleEnabled, type FieldgridModuleKey } from "@workspace/db";
import { redirect } from "next/navigation";
import { requireCurrentCustomerPortalTenantId } from "./auth/tenant";

export type CustomerPortalFeatureFlags = {
  documents: boolean;
  finance: boolean;
  reporting: boolean;
  notifications: boolean;
  knowledgebase: boolean;
  releases: boolean;
};

const MODULE_KEYS = {
  documents: "documents",
  finance: "finance",
  reporting: "reporting",
  notifications: "notifications",
  knowledgebase: "knowledgebase",
  releases: "releases",
} satisfies Record<keyof CustomerPortalFeatureFlags, FieldgridModuleKey>;

const CUSTOMER_PORTAL_BASE_PATH = "/klant";

function withCustomerPortalBasePath(path: string): string {
  const localPath = path.startsWith("/") ? path : `/${path}`;
  if (
    localPath === CUSTOMER_PORTAL_BASE_PATH ||
    localPath.startsWith(`${CUSTOMER_PORTAL_BASE_PATH}/`)
  ) {
    return localPath;
  }
  return localPath === "/"
    ? CUSTOMER_PORTAL_BASE_PATH
    : `${CUSTOMER_PORTAL_BASE_PATH}${localPath}`;
}

export async function isCustomerPortalFeatureEnabled(
  feature: keyof CustomerPortalFeatureFlags,
  tenantId?: string,
): Promise<boolean> {
  const resolvedTenantId =
    tenantId ?? (await requireCurrentCustomerPortalTenantId());
  if (!resolvedTenantId) return false;
  return isTenantModuleEnabled(resolvedTenantId, MODULE_KEYS[feature]);
}

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
      notifications: false,
      knowledgebase: false,
      releases: false,
    };
  }

  const entries = await Promise.all(
    Object.keys(MODULE_KEYS).map(async (key) => [
      key,
      await isCustomerPortalFeatureEnabled(
        key as keyof CustomerPortalFeatureFlags,
        resolvedTenantId,
      ),
    ]),
  );
  return Object.fromEntries(entries) as CustomerPortalFeatureFlags;
}

export async function requireCustomerPortalFeature(
  feature: keyof CustomerPortalFeatureFlags,
  fallback = "/",
): Promise<void> {
  if (!(await isCustomerPortalFeatureEnabled(feature))) {
    redirect(withCustomerPortalBasePath(fallback));
  }
}
