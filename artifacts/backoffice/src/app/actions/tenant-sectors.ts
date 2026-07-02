"use server";

import { db } from "@workspace/db";
import { sectorsTable, tenantSectorsTable } from "@workspace/db";
import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/permissions";
import { requireCurrentTenantId } from "@/lib/auth/tenant";
import { listTenantSectorOptions, type TenantSectorOption } from "@/lib/tenant-sectors";
import type { ActionResult } from "./customers";

export type TenantSectorManagementRow = TenantSectorOption & {
  globallyActive: boolean;
};

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

  await db
    .insert(tenantSectorsTable)
    .values({ tenantId, sectorId, isEnabled: enabled })
    .onConflictDoUpdate({
      target: [tenantSectorsTable.tenantId, tenantSectorsTable.sectorId],
      set: { isEnabled: enabled, updatedAt: new Date() },
    });

  revalidatePath("/instellingen/sectoren");
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

  return {
    success: true,
    message:
      "Controleer eerst bestaande klanten, objecten, personeel en taakcodes voordat u deze sector uitschakelt.",
  };
}
