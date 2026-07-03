"use server";

import { db } from "@workspace/db";
import {
  customersTable,
  objectsTable,
  personnelTable,
  sectorsTable,
  taskCodesTable,
  tenantSectorSettingsTable,
  tenantSectorsTable,
  type TenantSectorPolicyMode,
} from "@workspace/db";
import { and, asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/permissions";
import { requireCurrentTenantId } from "@/lib/auth/tenant";
import {
  getTenantSectorPolicy,
  listTenantSectorOptions,
  type TenantSectorOption,
  type TenantSectorPolicy,
} from "@/lib/tenant-sectors";
import type { ActionResult } from "./customers";

export type TenantSectorManagementRow = TenantSectorOption & {
  globallyActive: boolean;
};

export type TenantSectorSettingsInput = {
  mode: TenantSectorPolicyMode;
  maxSectors?: number | null;
  defaultSectorId?: string | null;
  enforceSectorScope?: boolean;
};

type SectorUsage = {
  customersCount: number;
  objectsCount: number;
  personnelCount: number;
  taskCodesCount: number;
};

function revalidateTenantSectorSettings() {
  [
    "/instellingen/sectoren",
    "/customers",
    "/objects",
    "/personnel",
    "/planning",
    "/settings/task-codes",
  ].forEach((path) => revalidatePath(path));
}

async function countTenantSectorUsage(tenantId: string, sectorId: string): Promise<SectorUsage> {
  const [usage] = await db
    .select({
      customersCount: sql<number>`(
        SELECT count(*)::int FROM ${customersTable}
        WHERE ${customersTable.tenantId} = ${tenantId}::uuid
          AND ${customersTable.sectorId} = ${sectorId}::uuid
      )`,
      objectsCount: sql<number>`(
        SELECT count(*)::int FROM ${objectsTable}
        WHERE ${objectsTable.tenantId} = ${tenantId}::uuid
          AND ${objectsTable.sectorId} = ${sectorId}::uuid
      )`,
      personnelCount: sql<number>`(
        SELECT count(*)::int FROM ${personnelTable}
        WHERE ${personnelTable.tenantId} = ${tenantId}::uuid
          AND ${personnelTable.sectorId} = ${sectorId}::uuid
      )`,
      taskCodesCount: sql<number>`(
        SELECT count(*)::int FROM ${taskCodesTable}
        WHERE ${taskCodesTable.tenantId} = ${tenantId}::uuid
          AND ${taskCodesTable.sectorId} = ${sectorId}::uuid
      )`,
    })
    .from(tenantSectorsTable)
    .where(
      and(
        eq(tenantSectorsTable.tenantId, tenantId),
        eq(tenantSectorsTable.sectorId, sectorId),
      ),
    )
    .limit(1);

  return {
    customersCount: Number(usage?.customersCount ?? 0),
    objectsCount: Number(usage?.objectsCount ?? 0),
    personnelCount: Number(usage?.personnelCount ?? 0),
    taskCodesCount: Number(usage?.taskCodesCount ?? 0),
  };
}

function usageTotal(usage: SectorUsage): number {
  return usage.customersCount + usage.objectsCount + usage.personnelCount + usage.taskCodesCount;
}

function usageMessage(usage: SectorUsage): string {
  const parts = [
    usage.customersCount > 0 ? `${usage.customersCount} klant${usage.customersCount === 1 ? "" : "en"}` : null,
    usage.objectsCount > 0 ? `${usage.objectsCount} object${usage.objectsCount === 1 ? "" : "en"}` : null,
    usage.personnelCount > 0 ? `${usage.personnelCount} medewerker${usage.personnelCount === 1 ? "" : "s"}` : null,
    usage.taskCodesCount > 0 ? `${usage.taskCodesCount} taakcode${usage.taskCodesCount === 1 ? "" : "s"}` : null,
  ].filter(Boolean);

  return parts.join(", ");
}

export async function listTenantSectorsForSettings(): Promise<TenantSectorManagementRow[]> {
  await requirePermission("settings", "read");
  const tenantId = await requireCurrentTenantId();
  const enabled = await listTenantSectorOptions(tenantId);
  const enabledById = new Map(enabled.map((sector) => [sector.id, sector]));

  const allSectors = await db
    .select({
      id: sectorsTable.id,
      name: sectorsTable.name,
      description: sectorsTable.description,
      globallyActive: sectorsTable.isActive,
    })
    .from(sectorsTable)
    .orderBy(asc(sectorsTable.name));

  return allSectors.map((sector) => ({
    id: sector.id,
    name: sector.name,
    description: sector.description,
    isEnabled: enabledById.get(sector.id)?.isEnabled ?? false,
    globallyActive: sector.globallyActive,
  }));
}

export async function getTenantSectorSettingsForSettings(): Promise<TenantSectorPolicy> {
  await requirePermission("settings", "read");
  const tenantId = await requireCurrentTenantId();
  return getTenantSectorPolicy(tenantId);
}

export async function updateTenantSectorSettings(
  input: TenantSectorSettingsInput,
): Promise<ActionResult> {
  await requirePermission("settings", "write");
  const tenantId = await requireCurrentTenantId();

  const mode = input.mode === "single" ? "single" : "multi";
  const maxSectors = mode === "single" ? 1 : input.maxSectors ?? null;
  const defaultSectorId = input.defaultSectorId || null;
  const enforceSectorScope = input.enforceSectorScope ?? true;

  if (maxSectors !== null && maxSectors < 1) {
    return { success: false, message: "Maximum aantal sectoren moet minimaal 1 zijn." };
  }

  if (defaultSectorId) {
    const [defaultSector] = await db
      .select({ sectorId: tenantSectorsTable.sectorId })
      .from(tenantSectorsTable)
      .innerJoin(sectorsTable, eq(tenantSectorsTable.sectorId, sectorsTable.id))
      .where(
        and(
          eq(tenantSectorsTable.tenantId, tenantId),
          eq(tenantSectorsTable.sectorId, defaultSectorId),
          eq(tenantSectorsTable.isEnabled, true),
          eq(sectorsTable.isActive, true),
        ),
      )
      .limit(1);

    if (!defaultSector) {
      return { success: false, message: "Defaultsector moet actief zijn voor deze tenant." };
    }
  }

  if (mode === "single") {
    const enabledRows = await db
      .select({ sectorId: tenantSectorsTable.sectorId })
      .from(tenantSectorsTable)
      .where(
        and(
          eq(tenantSectorsTable.tenantId, tenantId),
          eq(tenantSectorsTable.isEnabled, true),
        ),
      );

    if (enabledRows.length > 1) {
      return {
        success: false,
        message: "Single-sector modus kan pas aan als maximaal een sector actief is.",
      };
    }
  }

  await db
    .insert(tenantSectorSettingsTable)
    .values({ tenantId, mode, maxSectors, defaultSectorId, enforceSectorScope })
    .onConflictDoUpdate({
      target: tenantSectorSettingsTable.tenantId,
      set: { mode, maxSectors, defaultSectorId, enforceSectorScope, updatedAt: new Date() },
    });

  revalidateTenantSectorSettings();
  return { success: true };
}

export async function setTenantSectorEnabled(
  sectorId: string,
  enabled: boolean,
): Promise<ActionResult> {
  await requirePermission("settings", "write");
  const tenantId = await requireCurrentTenantId();

  const [sector] = await db
    .select({ id: sectorsTable.id, isActive: sectorsTable.isActive })
    .from(sectorsTable)
    .where(eq(sectorsTable.id, sectorId))
    .limit(1);

  if (!sector) return { success: false, message: "Sector niet gevonden." };
  if (!sector.isActive && enabled) {
    return { success: false, message: "Inactieve globale sector kan niet worden ingeschakeld." };
  }

  if (!enabled) {
    const canDisable = await assertTenantSectorCanBeDisabled(sectorId);
    if (!canDisable.success) return canDisable;
  }

  try {
    await db
      .insert(tenantSectorsTable)
      .values({ tenantId, sectorId, isEnabled: enabled })
      .onConflictDoUpdate({
        target: [tenantSectorsTable.tenantId, tenantSectorsTable.sectorId],
        set: { isEnabled: enabled, updatedAt: new Date() },
      });
  } catch (error) {
    if ((error as { code?: string })?.code === "23514") {
      return { success: false, message: "Sectorbeleid staat deze wijziging niet toe." };
    }
    throw error;
  }

  revalidateTenantSectorSettings();
  return { success: true };
}

export async function assertTenantSectorCanBeDisabled(sectorId: string): Promise<ActionResult> {
  await requirePermission("settings", "write");
  const tenantId = await requireCurrentTenantId();

  const [row] = await db
    .select({ sectorId: tenantSectorsTable.sectorId })
    .from(tenantSectorsTable)
    .where(
      and(
        eq(tenantSectorsTable.tenantId, tenantId),
        eq(tenantSectorsTable.sectorId, sectorId),
        eq(tenantSectorsTable.isEnabled, true),
      ),
    )
    .limit(1);

  if (!row) return { success: true };

  const policy = await getTenantSectorPolicy(tenantId);
  if (policy.defaultSectorId === sectorId) {
    return {
      success: false,
      message: "Deze sector is ingesteld als defaultsector. Kies eerst een andere defaultsector.",
    };
  }

  const usage = await countTenantSectorUsage(tenantId, sectorId);
  if (usageTotal(usage) > 0) {
    return {
      success: false,
      message: `Deze sector is nog in gebruik door ${usageMessage(usage)}. Verplaats deze records voordat je de sector uitschakelt.`,
    };
  }

  return { success: true };
}
