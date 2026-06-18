"use server";

import { db } from "@workspace/db";
import {
  auditLogTable,
  customersTable,
  objectsTable,
  personnelTable,
  sectorsTable,
  taskCodesTable,
} from "@workspace/db";
import { asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";
import type { ActionResult } from "./customers";

export type SectorOption = {
  id: string;
  name: string;
};

export type SectorRow = SectorOption & {
  description: string | null;
  isActive: boolean;
  createdAt: string;
  customersCount: number;
  objectsCount: number;
  personnelCount: number;
  taskCodesCount: number;
};

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === "23505";
}

function normalizeText(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function revalidateSectorConsumers() {
  [
    "/settings",
    "/instellingen/sectoren",
    "/customers",
    "/objects",
    "/personnel",
    "/planning",
    "/settings/task-codes",
  ].forEach((path) => revalidatePath(path));
}

export async function listActiveSectors(): Promise<SectorOption[]> {
  return db
    .select({ id: sectorsTable.id, name: sectorsTable.name })
    .from(sectorsTable)
    .where(eq(sectorsTable.isActive, true))
    .orderBy(asc(sectorsTable.name));
}

export async function listAllSectors(): Promise<SectorRow[]> {
  await requirePermission("settings", "read");

  const rows = await db
    .select({
      id: sectorsTable.id,
      name: sectorsTable.name,
      description: sectorsTable.description,
      isActive: sectorsTable.isActive,
      createdAt: sectorsTable.createdAt,
      customersCount: sql<number>`(
        SELECT count(*)::int FROM ${customersTable}
        WHERE ${customersTable.sectorId} = ${sectorsTable.id}
      )`,
      objectsCount: sql<number>`(
        SELECT count(*)::int FROM ${objectsTable}
        WHERE ${objectsTable.sectorId} = ${sectorsTable.id}
      )`,
      personnelCount: sql<number>`(
        SELECT count(*)::int FROM ${personnelTable}
        WHERE ${personnelTable.sectorId} = ${sectorsTable.id}
      )`,
      taskCodesCount: sql<number>`(
        SELECT count(*)::int FROM ${taskCodesTable}
        WHERE ${taskCodesTable.sectorId} = ${sectorsTable.id}
      )`,
    })
    .from(sectorsTable)
    .orderBy(asc(sectorsTable.name));

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    customersCount: Number(row.customersCount ?? 0),
    objectsCount: Number(row.objectsCount ?? 0),
    personnelCount: Number(row.personnelCount ?? 0),
    taskCodesCount: Number(row.taskCodesCount ?? 0),
  }));
}

export async function createSector(data: {
  name: string;
  description?: string;
}): Promise<ActionResult<{ id: string }>> {
  await requirePermission("settings", "write");

  const name = data.name.trim();
  const description = normalizeText(data.description);
  if (!name) return { success: false, message: "Naam is verplicht." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  try {
    const [created] = await db
      .insert(sectorsTable)
      .values({ name, description, isActive: true })
      .returning({ id: sectorsTable.id });

    await db.insert(auditLogTable).values({
      userId: user.id,
      action: "create",
      resource: "sectors",
      resourceId: created!.id,
      metadata: { name },
    });

    revalidateSectorConsumers();
    return { success: true, data: { id: created!.id } };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { success: false, message: "Er bestaat al een sector met deze naam." };
    }
    return { success: false, message: "Sector aanmaken mislukt." };
  }
}

export async function updateSector(
  id: string,
  data: { name?: string; description?: string; isActive?: boolean },
): Promise<ActionResult> {
  await requirePermission("settings", "write");

  const patch: {
    name?: string;
    description?: string | null;
    isActive?: boolean;
    updatedAt: Date;
  } = { updatedAt: new Date() };

  if (data.name !== undefined) {
    const name = data.name.trim();
    if (!name) return { success: false, message: "Naam is verplicht." };
    patch.name = name;
  }
  if (data.description !== undefined) patch.description = normalizeText(data.description);
  if (data.isActive !== undefined) patch.isActive = data.isActive;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  try {
    await db.update(sectorsTable).set(patch).where(eq(sectorsTable.id, id));

    await db.insert(auditLogTable).values({
      userId: user.id,
      action: "update",
      resource: "sectors",
      resourceId: id,
      metadata: data,
    });

    revalidateSectorConsumers();
    return { success: true };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { success: false, message: "Er bestaat al een sector met deze naam." };
    }
    return { success: false, message: "Sector bijwerken mislukt." };
  }
}
