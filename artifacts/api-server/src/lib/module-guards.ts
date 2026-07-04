import {
  isTenantModuleEnabled,
  type FieldgridModuleKey,
} from "@workspace/db";

export type ModuleJobGuardResult =
  | { allowed: true; tenantId: string; moduleKey: FieldgridModuleKey }
  | { allowed: false; tenantId: string | null; moduleKey: FieldgridModuleKey; reason: "missing_tenant" | "module_disabled" };

export async function requireJobTenantModule(
  tenantId: string | null | undefined,
  moduleKey: FieldgridModuleKey,
): Promise<ModuleJobGuardResult> {
  if (!tenantId) {
    return { allowed: false, tenantId: null, moduleKey, reason: "missing_tenant" };
  }

  if (await isTenantModuleEnabled(tenantId, moduleKey)) {
    return { allowed: true, tenantId, moduleKey };
  }

  return { allowed: false, tenantId, moduleKey, reason: "module_disabled" };
}
