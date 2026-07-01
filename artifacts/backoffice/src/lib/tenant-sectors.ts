import { db } from "@workspace/db";
import { sectorsTable, tenantSectorsTable } from "@workspace/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import { requireCurrentTenantId } from "@/lib/auth/tenant";

export type TenantSectorOption = {
  id: string;
  name: string;
  description: string | null;
  isEnabled: boolean;
};

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

export async function assertTenantSectorAllowed(
  tenantId: string,
  sectorId: string | null | undefined,
  context: string,
): Promise<void> {
  if (!sectorId) return;

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
