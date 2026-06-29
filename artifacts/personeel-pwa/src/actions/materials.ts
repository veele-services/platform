"use server";

import { db } from "@workspace/db";
import {
  assignmentMaterialUsageTable,
  assignmentPersonnelTable,
  assignmentsTable,
  personnelTable,
} from "@workspace/db";
import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type MaterialUsageItem = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  unitLabel?: string;
  notes?: string | null;
  createdBy?: string;
};

export type MaterialUsageInput = {
  name: string;
  quantity?: string | number | null;
  unitPrice?: string | number | null;
  unitLabel?: string | null;
  notes?: string | null;
};

const LOCKED_STATUSES = new Set([
  "report_submitted",
  "report_approved",
  "invoice_ready",
  "invoiced",
  "paid",
  "closed",
]);

async function getAuthAndPersonnel(): Promise<{ userId: string; personnelId: string; tenantId: string } | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [row] = await db
    .select({ id: personnelTable.id, tenantId: personnelTable.tenantId })
    .from(personnelTable)
    .where(and(eq(personnelTable.userId, user.id), eq(personnelTable.isActive, true)))
    .limit(1);

  if (!row) return null;
  return { userId: user.id, personnelId: row.id, tenantId: row.tenantId };
}

async function assertLinkedAndEditable(
  personnelId: string,
  tenantId: string,
  assignmentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [row] = await db
    .select({ status: assignmentsTable.status })
    .from(assignmentPersonnelTable)
    .innerJoin(assignmentsTable, eq(assignmentPersonnelTable.assignmentId, assignmentsTable.id))
    .where(
      and(
        eq(assignmentPersonnelTable.personnelId, personnelId),
        eq(assignmentPersonnelTable.assignmentId, assignmentId),
        eq(assignmentPersonnelTable.status, "assigned"),
        eq(assignmentsTable.tenantId, tenantId),
      ),
    )
    .limit(1);

  if (!row) return { ok: false, error: "Niet gekoppeld aan deze opdracht" };
  if (LOCKED_STATUSES.has(row.status)) {
    return { ok: false, error: "Deze werkbon is afgesloten voor materiaalregistratie" };
  }
  return { ok: true };
}

function parsePositiveDecimal(value: string | number | null | undefined, fallback: number): string {
  if (value === null || value === undefined || value === "") return fallback.toFixed(2);
  const parsed = typeof value === "number"
    ? value
    : Number.parseFloat(String(value).replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) return fallback.toFixed(2);
  return parsed.toFixed(2);
}

function toNumber(value: string | null): number {
  if (!value) return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getMaterialUsageForAssignment(
  assignmentId: string,
): Promise<MaterialUsageItem[]> {
  const auth = await getAuthAndPersonnel();
  if (!auth) return [];

  const access = await assertLinkedAndEditable(auth.personnelId, auth.tenantId, assignmentId);
  if (!access.ok && access.error === "Niet gekoppeld aan deze opdracht") return [];

  const rows = await db
    .select({
      id:        assignmentMaterialUsageTable.id,
      name:      assignmentMaterialUsageTable.name,
      quantity:  assignmentMaterialUsageTable.quantity,
      unitPrice: assignmentMaterialUsageTable.unitPrice,
      unitLabel: assignmentMaterialUsageTable.unitLabel,
      notes:     assignmentMaterialUsageTable.notes,
      createdBy: assignmentMaterialUsageTable.createdBy,
    })
    .from(assignmentMaterialUsageTable)
    .where(eq(assignmentMaterialUsageTable.assignmentId, assignmentId))
    .orderBy(asc(assignmentMaterialUsageTable.createdAt));

  return rows.map((row) => ({
    id:        row.id,
    name:      row.name,
    quantity:  toNumber(row.quantity),
    unitPrice: toNumber(row.unitPrice),
    unitLabel: row.unitLabel ?? undefined,
    notes:     row.notes ?? null,
    createdBy: row.createdBy,
  }));
}

export async function addMaterialUsage(
  assignmentId: string,
  input: MaterialUsageInput,
): Promise<{ success: boolean; id?: string; error?: string }> {
  const auth = await getAuthAndPersonnel();
  if (!auth) return { success: false, error: "Niet ingelogd" };

  const access = await assertLinkedAndEditable(auth.personnelId, auth.tenantId, assignmentId);
  if (!access.ok) return { success: false, error: access.error };

  const name = input.name.trim();
  if (!name) return { success: false, error: "Materiaalnaam is verplicht" };

  const quantity = parsePositiveDecimal(input.quantity, 1);
  const unitPrice = parsePositiveDecimal(input.unitPrice, 0);
  const unitLabel = input.unitLabel?.trim().slice(0, 40) || null;
  const notes = input.notes?.trim() || null;

  const [row] = await db
    .insert(assignmentMaterialUsageTable)
    .values({
      assignmentId,
      name,
      quantity,
      unitPrice,
      unitLabel,
      notes,
      createdBy: auth.userId,
    })
    .returning({ id: assignmentMaterialUsageTable.id });

  if (!row) return { success: false, error: "Materiaal opslaan mislukt" };

  revalidatePath(`/opdrachten/${assignmentId}`);
  revalidatePath(`/opdrachten/${assignmentId}/materiaal`);
  return { success: true, id: row.id };
}

export async function deleteMaterialUsage(
  assignmentId: string,
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const auth = await getAuthAndPersonnel();
  if (!auth) return { success: false, error: "Niet ingelogd" };

  const access = await assertLinkedAndEditable(auth.personnelId, auth.tenantId, assignmentId);
  if (!access.ok) return { success: false, error: access.error };

  const [item] = await db
    .select({
      assignmentId: assignmentMaterialUsageTable.assignmentId,
      createdBy:    assignmentMaterialUsageTable.createdBy,
    })
    .from(assignmentMaterialUsageTable)
    .where(eq(assignmentMaterialUsageTable.id, id))
    .limit(1);

  if (!item || item.assignmentId !== assignmentId) return { success: false, error: "Materiaal niet gevonden" };
  if (item.createdBy !== auth.userId) return { success: false, error: "Geen toegang" };

  await db.delete(assignmentMaterialUsageTable).where(eq(assignmentMaterialUsageTable.id, id));

  revalidatePath(`/opdrachten/${assignmentId}`);
  revalidatePath(`/opdrachten/${assignmentId}/materiaal`);
  return { success: true };
}
