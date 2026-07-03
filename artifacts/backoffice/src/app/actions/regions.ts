"use server";

import { db } from "@workspace/db";
import {
  assignmentRequiredRegionsTable,
  assignmentsTable,
  objectRegionsTable,
  objectsTable,
  personnelRegionsTable,
  personnelTable,
  tenantRegionsTable,
} from "@workspace/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { requireCurrentTenantId } from "@/lib/auth/tenant";
import type { ActionResult } from "./customers";

export type RegionOption = {
  id: string;
  name: string;
};

function normalizeRegionName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function cleanRegionNames(values: readonly string[] | undefined): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];

  for (const value of values ?? []) {
    const name = value.trim().replace(/\s+/g, " ");
    const normalized = normalizeRegionName(name);
    if (!name || seen.has(normalized)) continue;
    seen.add(normalized);
    cleaned.push(name.slice(0, 120));
  }

  return cleaned;
}

async function canReadRegions(): Promise<boolean> {
  const checks = await Promise.all([
    hasPermission("personnel", "read"),
    hasPermission("objects", "read"),
    hasPermission("assignments", "read"),
  ]);
  return checks.some(Boolean);
}

export async function listRegionOptions(): Promise<RegionOption[]> {
  if (!(await canReadRegions())) return [];
  const tenantId = await requireCurrentTenantId();

  return db
    .select({ id: tenantRegionsTable.id, name: tenantRegionsTable.name })
    .from(tenantRegionsTable)
    .where(and(eq(tenantRegionsTable.tenantId, tenantId), eq(tenantRegionsTable.isActive, true)))
    .orderBy(asc(tenantRegionsTable.sortOrder), asc(tenantRegionsTable.name));
}

async function ensureTenantRegions(
  tenantId: string,
  values: readonly string[] | undefined,
): Promise<RegionOption[]> {
  const names = cleanRegionNames(values);
  if (!names.length) return [];

  const normalizedNames = names.map(normalizeRegionName);
  const existingRows = await db
    .select({ id: tenantRegionsTable.id, name: tenantRegionsTable.name, normalizedName: tenantRegionsTable.normalizedName })
    .from(tenantRegionsTable)
    .where(
      and(
        eq(tenantRegionsTable.tenantId, tenantId),
        inArray(tenantRegionsTable.normalizedName, normalizedNames),
      ),
    );

  const existingByNormalized = new Map(existingRows.map((row) => [row.normalizedName, row]));
  const missing = names.filter((name) => !existingByNormalized.has(normalizeRegionName(name)));

  if (missing.length) {
    await db
      .insert(tenantRegionsTable)
      .values(
        missing.map((name) => ({
          tenantId,
          name,
          normalizedName: normalizeRegionName(name),
          source: "manual" as const,
        })),
      )
      .onConflictDoNothing();
  }

  const rows = await db
    .select({ id: tenantRegionsTable.id, name: tenantRegionsTable.name, normalizedName: tenantRegionsTable.normalizedName })
    .from(tenantRegionsTable)
    .where(
      and(
        eq(tenantRegionsTable.tenantId, tenantId),
        inArray(tenantRegionsTable.normalizedName, normalizedNames),
      ),
    );

  const byNormalized = new Map(rows.map((row) => [row.normalizedName, row]));
  return names.flatMap((name) => {
    const row = byNormalized.get(normalizeRegionName(name));
    return row ? [{ id: row.id, name: row.name }] : [];
  });
}

export async function getPersonnelRegionNames(personnelId: string): Promise<string[]> {
  await requirePermission("personnel", "read");
  const tenantId = await requireCurrentTenantId();

  const rows = await db
    .select({ name: tenantRegionsTable.name, isPrimary: personnelRegionsTable.isPrimary })
    .from(personnelRegionsTable)
    .innerJoin(tenantRegionsTable, eq(personnelRegionsTable.tenantRegionId, tenantRegionsTable.id))
    .where(and(eq(personnelRegionsTable.personnelId, personnelId), eq(personnelRegionsTable.tenantId, tenantId)))
    .orderBy(asc(personnelRegionsTable.isPrimary), asc(tenantRegionsTable.name));

  if (rows.length) {
    return rows
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.name.localeCompare(b.name, "nl"))
      .map((row) => row.name);
  }

  const [person] = await db
    .select({ region: personnelTable.region, preferredRegions: personnelTable.preferredRegions })
    .from(personnelTable)
    .where(and(eq(personnelTable.id, personnelId), eq(personnelTable.tenantId, tenantId)))
    .limit(1);

  return cleanRegionNames([person?.region ?? "", ...((person?.preferredRegions as string[] | null) ?? [])]);
}

export async function syncPersonnelRegions(
  personnelId: string,
  regionNames: string[],
): Promise<ActionResult> {
  await requirePermission("personnel", "write");
  const tenantId = await requireCurrentTenantId();
  const names = cleanRegionNames(regionNames);

  const [person] = await db
    .select({ id: personnelTable.id })
    .from(personnelTable)
    .where(and(eq(personnelTable.id, personnelId), eq(personnelTable.tenantId, tenantId)))
    .limit(1);

  if (!person) return { success: false, message: "Medewerker niet gevonden binnen deze tenant." };

  const regions = await ensureTenantRegions(tenantId, names);

  await db
    .delete(personnelRegionsTable)
    .where(and(eq(personnelRegionsTable.personnelId, personnelId), eq(personnelRegionsTable.tenantId, tenantId)));

  if (regions.length) {
    await db.insert(personnelRegionsTable).values(
      regions.map((region, index) => ({
        tenantId,
        personnelId,
        tenantRegionId: region.id,
        isPrimary: index === 0,
        source: "manual" as const,
      })),
    );
  }

  await db
    .update(personnelTable)
    .set({
      region: names[0] ?? null,
      preferredRegions: names.slice(1),
      updatedAt: new Date(),
    })
    .where(and(eq(personnelTable.id, personnelId), eq(personnelTable.tenantId, tenantId)));

  revalidatePath("/personnel");
  revalidatePath(`/personnel/${personnelId}`);
  return { success: true };
}

export async function getObjectRegionNames(objectId: string): Promise<string[]> {
  await requirePermission("objects", "read");
  const tenantId = await requireCurrentTenantId();

  const rows = await db
    .select({ name: tenantRegionsTable.name })
    .from(objectRegionsTable)
    .innerJoin(tenantRegionsTable, eq(objectRegionsTable.tenantRegionId, tenantRegionsTable.id))
    .where(and(eq(objectRegionsTable.objectId, objectId), eq(objectRegionsTable.tenantId, tenantId)))
    .orderBy(asc(tenantRegionsTable.name));

  return rows.map((row) => row.name);
}

export async function syncObjectRegions(
  objectId: string,
  regionNames: string[],
): Promise<ActionResult> {
  await requirePermission("objects", "write");
  const tenantId = await requireCurrentTenantId();
  const names = cleanRegionNames(regionNames);

  const [object] = await db
    .select({ id: objectsTable.id })
    .from(objectsTable)
    .where(and(eq(objectsTable.id, objectId), eq(objectsTable.tenantId, tenantId)))
    .limit(1);

  if (!object) return { success: false, message: "Object niet gevonden binnen deze tenant." };

  const regions = await ensureTenantRegions(tenantId, names);

  await db
    .delete(objectRegionsTable)
    .where(and(eq(objectRegionsTable.objectId, objectId), eq(objectRegionsTable.tenantId, tenantId)));

  if (regions.length) {
    await db.insert(objectRegionsTable).values(
      regions.map((region) => ({
        tenantId,
        objectId,
        tenantRegionId: region.id,
        source: "manual" as const,
      })),
    );
  }

  revalidatePath("/objects");
  revalidatePath(`/objects/${objectId}`);
  return { success: true };
}

export async function getAssignmentRegionNames(assignmentId: string): Promise<string[]> {
  await requirePermission("assignments", "read");
  const tenantId = await requireCurrentTenantId();

  const rows = await db
    .select({ name: tenantRegionsTable.name, sortOrder: assignmentRequiredRegionsTable.sortOrder })
    .from(assignmentRequiredRegionsTable)
    .innerJoin(tenantRegionsTable, eq(assignmentRequiredRegionsTable.tenantRegionId, tenantRegionsTable.id))
    .where(and(eq(assignmentRequiredRegionsTable.assignmentId, assignmentId), eq(assignmentRequiredRegionsTable.tenantId, tenantId)))
    .orderBy(asc(assignmentRequiredRegionsTable.sortOrder), asc(tenantRegionsTable.name));

  if (rows.length) return rows.map((row) => row.name);

  const [assignment] = await db
    .select({ requiredRegion: assignmentsTable.requiredRegion })
    .from(assignmentsTable)
    .where(and(eq(assignmentsTable.id, assignmentId), eq(assignmentsTable.tenantId, tenantId)))
    .limit(1);

  return cleanRegionNames([assignment?.requiredRegion ?? ""]);
}

export async function syncAssignmentRequiredRegions(
  assignmentId: string,
  regionNames: string[],
): Promise<ActionResult> {
  await requirePermission("assignments", "write");
  const tenantId = await requireCurrentTenantId();
  const names = cleanRegionNames(regionNames);

  const [assignment] = await db
    .select({ id: assignmentsTable.id })
    .from(assignmentsTable)
    .where(and(eq(assignmentsTable.id, assignmentId), eq(assignmentsTable.tenantId, tenantId)))
    .limit(1);

  if (!assignment) return { success: false, message: "Opdracht niet gevonden binnen deze tenant." };

  const regions = await ensureTenantRegions(tenantId, names);

  await db
    .delete(assignmentRequiredRegionsTable)
    .where(and(eq(assignmentRequiredRegionsTable.assignmentId, assignmentId), eq(assignmentRequiredRegionsTable.tenantId, tenantId)));

  if (regions.length) {
    await db.insert(assignmentRequiredRegionsTable).values(
      regions.map((region, index) => ({
        tenantId,
        assignmentId,
        tenantRegionId: region.id,
        source: "manual" as const,
        sortOrder: index,
      })),
    );
  }

  await db
    .update(assignmentsTable)
    .set({ requiredRegion: names[0] ?? null, updatedAt: new Date() })
    .where(and(eq(assignmentsTable.id, assignmentId), eq(assignmentsTable.tenantId, tenantId)));

  revalidatePath("/assignments");
  revalidatePath(`/assignments/${assignmentId}`);
  revalidatePath("/planning");
  return { success: true };
}
