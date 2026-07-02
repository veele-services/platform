import {
  getTenantPlanCapabilitiesForTenant,
  type TenantPlanCapabilities,
} from "@workspace/db";
import { requireCurrentTenantId } from "@/lib/auth/tenant";

export type { TenantPlanCapabilities };

/**
 * Central tenant plan/module gate for features that are not available in every plan.
 */
export async function getTenantPlanCapabilities(): Promise<TenantPlanCapabilities> {
  const tenantId = await requireCurrentTenantId();
  return getTenantPlanCapabilitiesForTenant(tenantId);
}
