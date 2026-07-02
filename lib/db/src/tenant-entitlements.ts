import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "./index";
import {
  modulesTable,
  planLimitsTable,
  planModulesTable,
  plansTable,
  tenantModulesTable,
  tenantSubscriptionsTable,
  tenantsTable,
  type FieldgridModuleKey,
  type TenantPlanKey,
} from "./schema";

const CUSTOM_ROLE_PLAN_KEYS = new Set<string>(["professional", "enterprise"]);
const ACTIVE_SUBSCRIPTION_STATUSES = ["trial", "active"] as const;

export type TenantPlanSnapshot = {
  tenantId: string;
  planId: string | null;
  plan: TenantPlanKey;
  planName: string;
  source: "subscription" | "tenant_plan_key" | "default";
};

export type TenantPlanCapabilities = {
  tenantId: string;
  plan: TenantPlanKey;
  customRoles: boolean;
};

export async function getTenantPlanSnapshot(tenantId: string): Promise<TenantPlanSnapshot> {
  const [subscription] = await db
    .select({
      planId: plansTable.id,
      plan: plansTable.key,
      planName: plansTable.name,
    })
    .from(tenantSubscriptionsTable)
    .innerJoin(plansTable, eq(tenantSubscriptionsTable.planId, plansTable.id))
    .where(
      and(
        eq(tenantSubscriptionsTable.tenantId, tenantId),
        inArray(tenantSubscriptionsTable.status, [...ACTIVE_SUBSCRIPTION_STATUSES]),
        eq(plansTable.isActive, true),
      ),
    )
    .orderBy(desc(tenantSubscriptionsTable.updatedAt), desc(tenantSubscriptionsTable.createdAt))
    .limit(1);

  if (subscription) {
    return {
      tenantId,
      planId: subscription.planId,
      plan: subscription.plan,
      planName: subscription.planName,
      source: "subscription",
    };
  }

  const [tenant] = await db
    .select({ plan: tenantsTable.planKey })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);

  const fallbackPlan = tenant?.plan ?? "starter";
  const [plan] = await db
    .select({ planId: plansTable.id, plan: plansTable.key, planName: plansTable.name })
    .from(plansTable)
    .where(and(eq(plansTable.key, fallbackPlan), eq(plansTable.isActive, true)))
    .limit(1);

  return {
    tenantId,
    planId: plan?.planId ?? null,
    plan: plan?.plan ?? fallbackPlan,
    planName: plan?.planName ?? fallbackPlan,
    source: tenant ? "tenant_plan_key" : "default",
  };
}

export async function getTenantPlanCapabilitiesForTenant(
  tenantId: string,
): Promise<TenantPlanCapabilities> {
  const snapshot = await getTenantPlanSnapshot(tenantId);
  if (!snapshot.planId) {
    return {
      tenantId,
      plan: snapshot.plan,
      customRoles: CUSTOM_ROLE_PLAN_KEYS.has(snapshot.plan),
    };
  }

  const [customRoleCapability] = await db
    .select({ isEnabled: planLimitsTable.isEnabled })
    .from(planLimitsTable)
    .where(and(eq(planLimitsTable.planId, snapshot.planId), eq(planLimitsTable.key, "custom_roles")))
    .limit(1);

  return {
    tenantId,
    plan: snapshot.plan,
    customRoles: customRoleCapability?.isEnabled ?? CUSTOM_ROLE_PLAN_KEYS.has(snapshot.plan),
  };
}

export async function isTenantModuleEnabled(
  tenantId: string,
  moduleKey: FieldgridModuleKey | (string & {}),
): Promise<boolean> {
  const [moduleRow] = await db
    .select({
      id: modulesTable.id,
      isEnabledByDefault: modulesTable.isEnabledByDefault,
    })
    .from(modulesTable)
    .where(eq(modulesTable.key, moduleKey))
    .limit(1);

  if (!moduleRow) return false;

  const [tenantOverride] = await db
    .select({ isEnabled: tenantModulesTable.isEnabled })
    .from(tenantModulesTable)
    .where(
      and(
        eq(tenantModulesTable.tenantId, tenantId),
        eq(tenantModulesTable.moduleId, moduleRow.id),
      ),
    )
    .limit(1);

  if (tenantOverride) return tenantOverride.isEnabled;

  const plan = await getTenantPlanSnapshot(tenantId);
  if (!plan.planId) return moduleRow.isEnabledByDefault;

  const [planModule] = await db
    .select({ isIncluded: planModulesTable.isIncluded })
    .from(planModulesTable)
    .where(and(eq(planModulesTable.planId, plan.planId), eq(planModulesTable.moduleId, moduleRow.id)))
    .limit(1);

  return planModule?.isIncluded ?? moduleRow.isEnabledByDefault;
}

export async function requireTenantModule(
  tenantId: string,
  moduleKey: FieldgridModuleKey | (string & {}),
): Promise<void> {
  if (await isTenantModuleEnabled(tenantId, moduleKey)) return;

  throw new Error(`Module niet beschikbaar voor deze tenant: ${moduleKey}`);
}
