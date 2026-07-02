import {
  isTenantModuleEnabled,
  requireTenantModule,
  type FieldgridModuleKey,
} from "@workspace/db";
import { requireCurrentTenantId } from "@/lib/auth/tenant";

type BackofficeModuleKey = FieldgridModuleKey | (string & {});

export async function requireCurrentTenantModule(moduleKey: BackofficeModuleKey): Promise<string> {
  const tenantId = await requireCurrentTenantId();
  await requireTenantModule(tenantId, moduleKey);
  return tenantId;
}

export async function isCurrentTenantModuleEnabled(moduleKey: BackofficeModuleKey): Promise<boolean> {
  const tenantId = await requireCurrentTenantId();
  return isTenantModuleEnabled(tenantId, moduleKey);
}
