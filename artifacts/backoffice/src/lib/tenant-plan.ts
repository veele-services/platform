import { requireCurrentTenantId } from "@/lib/auth/tenant";

const CUSTOM_ROLE_PLANS = new Set(["pro", "professional", "enterprise", "platform"]);

export type TenantPlanCapabilities = {
  tenantId: string;
  plan: string;
  customRoles: boolean;
};

/**
 * Central tenant plan/module gate for features that are not available in every plan.
 *
 * The current product schema does not yet expose tenant subscriptions, so this
 * reads the configured tenant plan. Keeping the check in one helper makes it easy
 * to swap to a database-backed tenant plan later without changing actions/views.
 */
export async function getTenantPlanCapabilities(): Promise<TenantPlanCapabilities> {
  const tenantId = await requireCurrentTenantId();
  const plan = (process.env.TENANT_PLAN ?? process.env.NEXT_PUBLIC_TENANT_PLAN ?? "basic").toLowerCase();

  return {
    tenantId,
    plan,
    customRoles: CUSTOM_ROLE_PLANS.has(plan),
  };
}
