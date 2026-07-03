import { db } from "@workspace/db";
import {
  sectorsTable,
  tenantSectorSettingsTable,
  tenantSectorsTable,
  type TenantSectorPolicyMode,
} from "@workspace/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import { requireCurrentTenantId } from "@/lib/auth/tenant";

export type TenantSectorOption = {
  id: string;
  name: string;
  description: string | null;
  isEnabled: boolean;
};

export type TenantSectorPolicy = {
  tenantId: string;
  mode: TenantSectorPolicyMode;
  maxSectors: number | null;
  defaultSectorId: string | null;
  enforceSectorScope: boolean;
};

async function enabledTenantSectorIds(tenantId: string): Promise<string[]> {
  const rows = await db
    .select({ sectorId: tenantSectorsTable.sectorId })
    .from(tenantSectorsTable)
    .innerJoin(sectorsTable, eq(tenantSectorsTable.sectorId, sectorsTable.id))
    .where(
      and(
        eq(tenantSectorsTable.tenantId, tenantId),
        eq(tenantSectorsTable.isEnabled, true),
        eq(sectorsTable.isActive, true),
      ),
    )
    .orderBy(asc(tenantSectorsTable.createdAt));

  return rows.map((row) => row.sectorId);
}

export async function listTenantSectorOptions(tenantId?: string): Promise<TenantSectorOption[]> {
  const resolvedTenantId = tenantId ?? (await requireCurrentTenantId());

  const rows = await db
    .select({
      id: sectorsTable.id,
      name: sectorsTable.name,
      description: sectorsTable.description,
      isEnabled: tenantSectorsTable.isEnabled,
    })
    .from(tenantSectorsTable)
    .innerJoin(sectorsTable, eq(tenantSectorsTable.sectorId, sectorsTable.id))
    .where(
      and(
        eq(tenantSectorsTable.tenantId, resolvedTenantId),
        eq(sectorsTable.isActive, true),
      ),
    )
    .orderBy(asc(sectorsTable.name));

  return rows;
}

export async function listEnabledTenantSectorOptions(tenantId?: string): Promise<TenantSectorOption[]> {
  const options = await listTenantSectorOptions(tenantId);
  return options.filter((sector) => sector.isEnabled);
}

export async function getTenantSectorPolicy(tenantId?: string): Promise<TenantSectorPolicy> {
  const resolvedTenantId = tenantId ?? (await requireCurrentTenantId());
  const [settings] = await db
    .select({
      mode: tenantSectorSettingsTable.mode,
      maxSectors: tenantSectorSettingsTable.maxSectors,
      defaultSectorId: tenantSectorSettingsTable.defaultSectorId,
      enforceSectorScope: tenantSectorSettingsTable.enforceSectorScope,
    })
    .from(tenantSectorSettingsTable)
    .where(eq(tenantSectorSettingsTable.tenantId, resolvedTenantId))
    .limit(1);

  if (settings) {
    return {
      tenantId: resolvedTenantId,
      mode: settings.mode,
      maxSectors: settings.maxSectors,
      defaultSectorId: settings.defaultSectorId,
      enforceSectorScope: settings.enforceSectorScope,
    };
  }

  const enabledSectorIds = await enabledTenantSectorIds(resolvedTenantId);
  return {
    tenantId: resolvedTenantId,
    mode: enabledSectorIds.length === 1 ? "single" : "multi",
    maxSectors: enabledSectorIds.length === 1 ? 1 : null,
    defaultSectorId: enabledSectorIds.length === 1 ? enabledSectorIds[0] ?? null : null,
    enforceSectorScope: true,
  };
}

export async function resolveTenantSectorForWrite(
  tenantId: string,
  sectorId: string | null | undefined,
  context: string,
): Promise<string | null> {
  if (sectorId) {
    await assertTenantSectorAllowed(tenantId, sectorId, context);
    return sectorId;
  }

  const policy = await getTenantSectorPolicy(tenantId);
  if (!policy.enforceSectorScope || policy.mode !== "single") return null;

  const defaultSectorId = policy.defaultSectorId ?? (await enabledTenantSectorIds(tenantId))[0] ?? null;
  if (!defaultSectorId) return null;

  await assertTenantSectorAllowed(tenantId, defaultSectorId, `${context}: default sector`);
  return defaultSectorId;
}

export async function assertTenantSectorAllowed(
  tenantId: string,
  sectorId: string | null | undefined,
  context: string,
): Promise<void> {
  if (!sectorId) return;

  const policy = await getTenantSectorPolicy(tenantId);
  if (!policy.enforceSectorScope) return;

  const [row] = await db
    .select({ sectorId: tenantSectorsTable.sectorId })
    .from(tenantSectorsTable)
    .innerJoin(sectorsTable, eq(tenantSectorsTable.sectorId, sectorsTable.id))
    .where(
      and(
        eq(tenantSectorsTable.tenantId, tenantId),
        eq(tenantSectorsTable.sectorId, sectorId),
        eq(tenantSectorsTable.isEnabled, true),
        eq(sectorsTable.isActive, true),
      ),
    )
    .limit(1);

  if (!row) {
    throw new Error(`Forbidden: sector ${sectorId} is not enabled for tenant ${tenantId} (${context})`);
  }
}

export async function assertTenantSectorsAllowed(
  tenantId: string,
  sectorIds: Array<string | null | undefined>,
  context: string,
): Promise<void> {
  const uniqueSectorIds = [...new Set(sectorIds.filter((sectorId): sectorId is string => Boolean(sectorId)))];
  if (uniqueSectorIds.length === 0) return;

  const policy = await getTenantSectorPolicy(tenantId);
  if (!policy.enforceSectorScope) return;

  const rows = await db
    .select({ sectorId: tenantSectorsTable.sectorId })
    .from(tenantSectorsTable)
    .innerJoin(sectorsTable, eq(tenantSectorsTable.sectorId, sectorsTable.id))
    .where(
      and(
        eq(tenantSectorsTable.tenantId, tenantId),
        inArray(tenantSectorsTable.sectorId, uniqueSectorIds),
        eq(tenantSectorsTable.isEnabled, true),
        eq(sectorsTable.isActive, true),
      ),
    );

  const allowed = new Set(rows.map((row) => row.sectorId));
  const denied = uniqueSectorIds.filter((sectorId) => !allowed.has(sectorId));
  if (denied.length > 0) {
    throw new Error(`Forbidden: sector(s) ${denied.join(", ")} are not enabled for tenant ${tenantId} (${context})`);
  }
}
