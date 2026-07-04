"use server";

import { db } from "@workspace/db";
import {
  auditLogTable,
  personnelQualificationsTable,
  personnelTable,
  qualificationItemsTable,
  roleQualificationsTable,
  rolesTable,
  sectorsTable,
  taskCodeQualificationsTable,
  taskCodesTable,
  type QualificationType,
} from "@workspace/db";
import { and, asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";
import { requireCurrentTenantId } from "@/lib/auth/tenant";
import type { ActionResult } from "./customers";

export type { ActionResult };

export type QualificationItemRow = {
  id: string;
  type: QualificationType;
  code: string;
  name: string;
  description: string | null;
  sectorId: string | null;
  sectorName: string | null;
  validityMonths: number | null;
  isActive: boolean;
};

export type QualificationLinkRow = {
  id: string;
  qualificationId: string;
  qualificationType: QualificationType;
  qualificationName: string;
  qualificationCode: string;
  targetId: string;
  targetLabel: string;
  secondaryLabel: string | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
  expiryStatus?: "valid" | "expiring" | "expired" | "none";
  required?: boolean;
};

export type QualificationOption = {
  id: string;
  label: string;
  type: QualificationType;
};

export type QualificationManagementData = {
  items: QualificationItemRow[];
  personnel: { id: string; label: string; roleName: string | null; sectorName: string | null }[];
  roles: { id: string; name: string }[];
  sectors: { id: string; name: string }[];
  taskCodes: { id: string; label: string; sectorName: string | null }[];
  personnelLinks: QualificationLinkRow[];
  roleLinks: QualificationLinkRow[];
  taskCodeLinks: QualificationLinkRow[];
  expiringCount: number;
  expiredCount: number;
};

const qualificationTypeSchema = z.enum(["certificate", "diploma", "knowledge"]);

const itemInputSchema = z.object({
  type: qualificationTypeSchema,
  code: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  sectorId: z.string().uuid().optional().or(z.literal("")),
  validityMonths: z.number().int().min(1).max(240).nullable().optional(),
  isActive: z.boolean().optional(),
});

const personnelLinkInputSchema = z.object({
  personnelId: z.string().uuid(),
  qualificationId: z.string().uuid(),
  issuedAt: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  expiresAt: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional(),
});

const roleLinkInputSchema = z.object({
  roleId: z.string().uuid(),
  qualificationId: z.string().uuid(),
  required: z.boolean().optional(),
});

const taskCodeLinkInputSchema = z.object({
  taskCodeId: z.string().uuid(),
  qualificationId: z.string().uuid(),
  required: z.boolean().optional(),
});

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === "23505";
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "_");
}

function expiryStatus(expiresAt: string | null | undefined): QualificationLinkRow["expiryStatus"] {
  if (!expiresAt) return "none";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(`${expiresAt}T00:00:00`);
  if (expiry < today) return "expired";
  const soon = new Date(today);
  soon.setDate(soon.getDate() + 60);
  return expiry <= soon ? "expiring" : "valid";
}

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function audit(action: string, resourceId: string | null, metadata: Record<string, unknown>) {
  const userId = await currentUserId();
  if (!userId) return;
  const tenantId = await requireCurrentTenantId().catch(() => null);
  if (!tenantId) return;
  await db.insert(auditLogTable).values({
    tenantId,
    userId,
    action,
    resource: "qualifications",
    resourceId,
    metadata,
  });
}

async function syncPersonnelLegacyFields(personnelId: string) {
  const rows = await db
    .select({
      type: qualificationItemsTable.type,
      name: qualificationItemsTable.name,
      expiresAt: personnelQualificationsTable.expiresAt,
    })
    .from(personnelQualificationsTable)
    .innerJoin(
      qualificationItemsTable,
      eq(personnelQualificationsTable.qualificationId, qualificationItemsTable.id),
    )
    .where(eq(personnelQualificationsTable.personnelId, personnelId))
    .orderBy(asc(qualificationItemsTable.name));

  await db
    .update(personnelTable)
    .set({
      certificates: rows
        .filter((row) => row.type === "certificate")
        .map((row) => ({
          name: row.name,
          ...(row.expiresAt ? { expires_at: row.expiresAt } : {}),
        })),
      diplomas: rows.filter((row) => row.type === "diploma").map((row) => row.name),
      knowledge: rows.filter((row) => row.type === "knowledge").map((row) => row.name),
      updatedAt: new Date(),
    })
    .where(eq(personnelTable.id, personnelId));
}

async function syncTaskCodeLegacyFields(taskCodeId: string) {
  const rows = await db
    .select({
      type: qualificationItemsTable.type,
      name: qualificationItemsTable.name,
    })
    .from(taskCodeQualificationsTable)
    .innerJoin(
      qualificationItemsTable,
      eq(taskCodeQualificationsTable.qualificationId, qualificationItemsTable.id),
    )
    .where(
      and(
        eq(taskCodeQualificationsTable.taskCodeId, taskCodeId),
        eq(taskCodeQualificationsTable.required, true),
      ),
    )
    .orderBy(asc(qualificationItemsTable.name));

  const diplomas = rows.filter((row) => row.type === "diploma").map((row) => row.name);

  await db
    .update(taskCodesTable)
    .set({
      requiredCertificates: rows
        .filter((row) => row.type === "certificate")
        .map((row) => row.name),
      requiredDiploma: diplomas[0] ?? null,
      requiredKnowledge: rows
        .filter((row) => row.type === "knowledge")
        .map((row) => row.name),
      updatedAt: new Date(),
    })
    .where(eq(taskCodesTable.id, taskCodeId));
}

export async function listQualificationManagementData(): Promise<QualificationManagementData> {
  await requirePermission("settings", "read");
  const tenantId = await requireCurrentTenantId();

  const [
    items,
    personnel,
    roles,
    sectors,
    taskCodes,
    personnelLinks,
    roleLinks,
    taskCodeLinks,
  ] = await Promise.all([
    db
      .select({
        id: qualificationItemsTable.id,
        type: qualificationItemsTable.type,
        code: qualificationItemsTable.code,
        name: qualificationItemsTable.name,
        description: qualificationItemsTable.description,
        sectorId: qualificationItemsTable.sectorId,
        sectorName: sectorsTable.name,
        validityMonths: qualificationItemsTable.validityMonths,
        isActive: qualificationItemsTable.isActive,
      })
      .from(qualificationItemsTable)
      .leftJoin(sectorsTable, eq(qualificationItemsTable.sectorId, sectorsTable.id))
      .where(eq(qualificationItemsTable.tenantId, tenantId))
      .orderBy(asc(qualificationItemsTable.type), asc(qualificationItemsTable.name)),
    db
      .select({
        id: personnelTable.id,
        firstName: personnelTable.firstName,
        lastName: personnelTable.lastName,
        roleName: rolesTable.name,
        sectorName: sectorsTable.name,
      })
      .from(personnelTable)
      .leftJoin(rolesTable, eq(personnelTable.roleId, rolesTable.id))
      .leftJoin(sectorsTable, eq(personnelTable.sectorId, sectorsTable.id))
      .where(and(eq(personnelTable.tenantId, tenantId), eq(personnelTable.isActive, true)))
      .orderBy(asc(personnelTable.lastName), asc(personnelTable.firstName)),
    db.select({ id: rolesTable.id, name: rolesTable.name }).from(rolesTable).orderBy(asc(rolesTable.name)),
    db
      .select({ id: sectorsTable.id, name: sectorsTable.name })
      .from(sectorsTable)
      .where(eq(sectorsTable.isActive, true))
      .orderBy(asc(sectorsTable.name)),
    db
      .select({
        id: taskCodesTable.id,
        code: taskCodesTable.code,
        name: taskCodesTable.name,
        sectorName: sectorsTable.name,
      })
      .from(taskCodesTable)
      .leftJoin(sectorsTable, eq(taskCodesTable.sectorId, sectorsTable.id))
      .where(and(eq(taskCodesTable.tenantId, tenantId), eq(taskCodesTable.isActive, true)))
      .orderBy(asc(taskCodesTable.code)),
    db
      .select({
        id: personnelQualificationsTable.id,
        qualificationId: qualificationItemsTable.id,
        qualificationType: qualificationItemsTable.type,
        qualificationName: qualificationItemsTable.name,
        qualificationCode: qualificationItemsTable.code,
        personnelId: personnelTable.id,
        firstName: personnelTable.firstName,
        lastName: personnelTable.lastName,
        roleName: rolesTable.name,
        issuedAt: personnelQualificationsTable.issuedAt,
        expiresAt: personnelQualificationsTable.expiresAt,
      })
      .from(personnelQualificationsTable)
      .innerJoin(qualificationItemsTable, eq(personnelQualificationsTable.qualificationId, qualificationItemsTable.id))
      .innerJoin(personnelTable, eq(personnelQualificationsTable.personnelId, personnelTable.id))
      .leftJoin(rolesTable, eq(personnelTable.roleId, rolesTable.id))
      .where(eq(personnelQualificationsTable.tenantId, tenantId))
      .orderBy(asc(personnelTable.lastName), asc(qualificationItemsTable.name)),
    db
      .select({
        id: roleQualificationsTable.id,
        qualificationId: qualificationItemsTable.id,
        qualificationType: qualificationItemsTable.type,
        qualificationName: qualificationItemsTable.name,
        qualificationCode: qualificationItemsTable.code,
        roleId: rolesTable.id,
        roleName: rolesTable.name,
        required: roleQualificationsTable.required,
      })
      .from(roleQualificationsTable)
      .innerJoin(qualificationItemsTable, eq(roleQualificationsTable.qualificationId, qualificationItemsTable.id))
      .innerJoin(rolesTable, eq(roleQualificationsTable.roleId, rolesTable.id))
      .where(eq(roleQualificationsTable.tenantId, tenantId))
      .orderBy(asc(rolesTable.name), asc(qualificationItemsTable.name)),
    db
      .select({
        id: taskCodeQualificationsTable.id,
        qualificationId: qualificationItemsTable.id,
        qualificationType: qualificationItemsTable.type,
        qualificationName: qualificationItemsTable.name,
        qualificationCode: qualificationItemsTable.code,
        taskCodeId: taskCodesTable.id,
        taskCodeCode: taskCodesTable.code,
        taskCodeName: taskCodesTable.name,
        required: taskCodeQualificationsTable.required,
      })
      .from(taskCodeQualificationsTable)
      .innerJoin(qualificationItemsTable, eq(taskCodeQualificationsTable.qualificationId, qualificationItemsTable.id))
      .innerJoin(taskCodesTable, eq(taskCodeQualificationsTable.taskCodeId, taskCodesTable.id))
      .where(eq(taskCodeQualificationsTable.tenantId, tenantId))
      .orderBy(asc(taskCodesTable.code), asc(qualificationItemsTable.name)),
  ]);

  const mappedPersonnelLinks: QualificationLinkRow[] = personnelLinks.map((row) => {
    const status = expiryStatus(row.expiresAt);
    return {
      id: row.id,
      qualificationId: row.qualificationId,
      qualificationType: row.qualificationType,
      qualificationName: row.qualificationName,
      qualificationCode: row.qualificationCode,
      targetId: row.personnelId,
      targetLabel: `${row.firstName} ${row.lastName}`.trim(),
      secondaryLabel: row.roleName,
      issuedAt: row.issuedAt,
      expiresAt: row.expiresAt,
      expiryStatus: status,
    };
  });

  return {
    items,
    personnel: personnel.map((row) => ({
      id: row.id,
      label: `${row.firstName} ${row.lastName}`.trim(),
      roleName: row.roleName,
      sectorName: row.sectorName,
    })),
    roles,
    sectors,
    taskCodes: taskCodes.map((row) => ({
      id: row.id,
      label: `${row.code} - ${row.name}`,
      sectorName: row.sectorName,
    })),
    personnelLinks: mappedPersonnelLinks,
    roleLinks: roleLinks.map((row) => ({
      id: row.id,
      qualificationId: row.qualificationId,
      qualificationType: row.qualificationType,
      qualificationName: row.qualificationName,
      qualificationCode: row.qualificationCode,
      targetId: row.roleId,
      targetLabel: row.roleName,
      secondaryLabel: null,
      required: row.required,
    })),
    taskCodeLinks: taskCodeLinks.map((row) => ({
      id: row.id,
      qualificationId: row.qualificationId,
      qualificationType: row.qualificationType,
      qualificationName: row.qualificationName,
      qualificationCode: row.qualificationCode,
      targetId: row.taskCodeId,
      targetLabel: `${row.taskCodeCode} - ${row.taskCodeName}`,
      secondaryLabel: null,
      required: row.required,
    })),
    expiringCount: mappedPersonnelLinks.filter((row) => row.expiryStatus === "expiring").length,
    expiredCount: mappedPersonnelLinks.filter((row) => row.expiryStatus === "expired").length,
  };
}

export async function listPersonnelQualifications(personnelId: string): Promise<QualificationLinkRow[]> {
  await requirePermission("personnel", "read");
  const tenantId = await requireCurrentTenantId();

  const rows = await db
    .select({
      id: personnelQualificationsTable.id,
      qualificationId: qualificationItemsTable.id,
      qualificationType: qualificationItemsTable.type,
      qualificationName: qualificationItemsTable.name,
      qualificationCode: qualificationItemsTable.code,
      issuedAt: personnelQualificationsTable.issuedAt,
      expiresAt: personnelQualificationsTable.expiresAt,
    })
    .from(personnelQualificationsTable)
    .innerJoin(qualificationItemsTable, eq(personnelQualificationsTable.qualificationId, qualificationItemsTable.id))
    .where(and(eq(personnelQualificationsTable.tenantId, tenantId), eq(personnelQualificationsTable.personnelId, personnelId)))
    .orderBy(asc(qualificationItemsTable.type), asc(qualificationItemsTable.name));

  return rows.map((row) => ({
    id: row.id,
    qualificationId: row.qualificationId,
    qualificationType: row.qualificationType,
    qualificationName: row.qualificationName,
    qualificationCode: row.qualificationCode,
    targetId: personnelId,
    targetLabel: "",
    secondaryLabel: null,
    issuedAt: row.issuedAt,
    expiresAt: row.expiresAt,
    expiryStatus: expiryStatus(row.expiresAt),
  }));
}

export async function createQualificationItem(data: unknown): Promise<ActionResult<{ id: string }>> {
  await requirePermission("settings", "write");
  const parsed = itemInputSchema.safeParse(data);
  if (!parsed.success) return { success: false, message: "Controleer de kwalificatiegegevens." };
  const tenantId = await requireCurrentTenantId();

  try {
    const [created] = await db
      .insert(qualificationItemsTable)
      .values({
        tenantId,
        type: parsed.data.type,
        code: normalizeCode(parsed.data.code),
        name: parsed.data.name.trim(),
        description: parsed.data.description?.trim() || null,
        sectorId: parsed.data.sectorId || null,
        validityMonths: parsed.data.validityMonths ?? null,
        isActive: parsed.data.isActive ?? true,
      })
      .returning({ id: qualificationItemsTable.id });
    await audit("create_qualification", created!.id, parsed.data);
    revalidatePath("/instellingen/kwalificaties");
    return { success: true, data: { id: created!.id } };
  } catch (err) {
    if (isUniqueViolation(err)) return { success: false, message: "Deze kwalificatiecode bestaat al." };
    return { success: false, message: "Kwalificatie aanmaken mislukt." };
  }
}

export async function setQualificationStatus(id: string, isActive: boolean): Promise<ActionResult> {
  await requirePermission("settings", "write");
  const tenantId = await requireCurrentTenantId();
  await db
    .update(qualificationItemsTable)
    .set({ isActive, updatedAt: new Date() })
    .where(and(eq(qualificationItemsTable.id, id), eq(qualificationItemsTable.tenantId, tenantId)));
  await audit(isActive ? "activate_qualification" : "deactivate_qualification", id, {});
  revalidatePath("/instellingen/kwalificaties");
  return { success: true };
}

export async function deleteQualificationItem(id: string): Promise<ActionResult> {
  await requirePermission("settings", "write");
  const tenantId = await requireCurrentTenantId();
  try {
    await db
      .delete(qualificationItemsTable)
      .where(and(eq(qualificationItemsTable.id, id), eq(qualificationItemsTable.tenantId, tenantId)));
    await audit("delete_qualification", id, {});
    revalidatePath("/instellingen/kwalificaties");
    return { success: true };
  } catch {
    return { success: false, message: "Kwalificatie verwijderen mislukt. Controleer bestaande koppelingen." };
  }
}

export async function upsertPersonnelQualification(data: unknown): Promise<ActionResult> {
  await requirePermission("personnel", "write");
  const parsed = personnelLinkInputSchema.safeParse(data);
  if (!parsed.success) return { success: false, message: "Controleer de personeelskoppeling." };
  const tenantId = await requireCurrentTenantId();

  const [person] = await db
    .select({ tenantId: personnelTable.tenantId })
    .from(personnelTable)
    .where(and(eq(personnelTable.id, parsed.data.personnelId), eq(personnelTable.tenantId, tenantId)))
    .limit(1);
  if (!person) return { success: false, message: "Medewerker niet gevonden." };

  await db
    .insert(personnelQualificationsTable)
    .values({
      tenantId,
      personnelId: parsed.data.personnelId,
      qualificationId: parsed.data.qualificationId,
      issuedAt: parsed.data.issuedAt || null,
      expiresAt: parsed.data.expiresAt || null,
      notes: parsed.data.notes?.trim() || null,
    })
    .onConflictDoUpdate({
      target: [
        personnelQualificationsTable.personnelId,
        personnelQualificationsTable.qualificationId,
      ],
      set: {
        issuedAt: parsed.data.issuedAt || null,
        expiresAt: parsed.data.expiresAt || null,
        notes: parsed.data.notes?.trim() || null,
        updatedAt: new Date(),
      },
    });

  await syncPersonnelLegacyFields(parsed.data.personnelId);
  await audit("upsert_personnel_qualification", parsed.data.personnelId, parsed.data);
  revalidatePath("/instellingen/kwalificaties");
  revalidatePath(`/personnel/${parsed.data.personnelId}`);
  return { success: true };
}

export async function removePersonnelQualification(id: string): Promise<ActionResult> {
  await requirePermission("personnel", "write");
  const tenantId = await requireCurrentTenantId();
  const [row] = await db
    .select({ personnelId: personnelQualificationsTable.personnelId })
    .from(personnelQualificationsTable)
    .where(and(eq(personnelQualificationsTable.id, id), eq(personnelQualificationsTable.tenantId, tenantId)))
    .limit(1);
  if (!row) return { success: false, message: "Koppeling niet gevonden." };
  await db
    .delete(personnelQualificationsTable)
    .where(and(eq(personnelQualificationsTable.id, id), eq(personnelQualificationsTable.tenantId, tenantId)));
  await syncPersonnelLegacyFields(row.personnelId);
  await audit("remove_personnel_qualification", row.personnelId, { linkId: id });
  revalidatePath("/instellingen/kwalificaties");
  revalidatePath(`/personnel/${row.personnelId}`);
  return { success: true };
}

export async function upsertRoleQualification(data: unknown): Promise<ActionResult> {
  await requirePermission("settings", "write");
  const parsed = roleLinkInputSchema.safeParse(data);
  if (!parsed.success) return { success: false, message: "Controleer de functiekoppeling." };
  const tenantId = await requireCurrentTenantId();

  await db
    .insert(roleQualificationsTable)
    .values({
      tenantId,
      roleId: parsed.data.roleId,
      qualificationId: parsed.data.qualificationId,
      required: parsed.data.required ?? true,
    })
    .onConflictDoUpdate({
      target: [roleQualificationsTable.roleId, roleQualificationsTable.qualificationId],
      set: { required: parsed.data.required ?? true },
    });
  await audit("upsert_role_qualification", parsed.data.roleId, parsed.data);
  revalidatePath("/instellingen/kwalificaties");
  return { success: true };
}

export async function removeRoleQualification(id: string): Promise<ActionResult> {
  await requirePermission("settings", "write");
  const tenantId = await requireCurrentTenantId();
  await db
    .delete(roleQualificationsTable)
    .where(and(eq(roleQualificationsTable.id, id), eq(roleQualificationsTable.tenantId, tenantId)));
  await audit("remove_role_qualification", id, {});
  revalidatePath("/instellingen/kwalificaties");
  return { success: true };
}

export async function upsertTaskCodeQualification(data: unknown): Promise<ActionResult> {
  await requirePermission("task_codes", "write");
  const parsed = taskCodeLinkInputSchema.safeParse(data);
  if (!parsed.success) return { success: false, message: "Controleer de taakcodekoppeling." };
  const tenantId = await requireCurrentTenantId();

  await db.transaction(async (tx) => {
    await tx
      .insert(taskCodeQualificationsTable)
      .values({
        tenantId,
        taskCodeId: parsed.data.taskCodeId,
        qualificationId: parsed.data.qualificationId,
        required: parsed.data.required ?? true,
      })
      .onConflictDoUpdate({
        target: [
          taskCodeQualificationsTable.taskCodeId,
          taskCodeQualificationsTable.qualificationId,
        ],
        set: { required: parsed.data.required ?? true },
      });
  });
  await syncTaskCodeLegacyFields(parsed.data.taskCodeId);
  await audit("upsert_task_code_qualification", parsed.data.taskCodeId, parsed.data);
  revalidatePath("/instellingen/kwalificaties");
  revalidatePath("/settings/task-codes");
  return { success: true };
}

export async function removeTaskCodeQualification(id: string): Promise<ActionResult> {
  await requirePermission("task_codes", "write");
  const tenantId = await requireCurrentTenantId();
  const [row] = await db
    .select({ taskCodeId: taskCodeQualificationsTable.taskCodeId })
    .from(taskCodeQualificationsTable)
    .where(and(eq(taskCodeQualificationsTable.id, id), eq(taskCodeQualificationsTable.tenantId, tenantId)))
    .limit(1);
  if (!row) return { success: false, message: "Koppeling niet gevonden." };
  await db
    .delete(taskCodeQualificationsTable)
    .where(and(eq(taskCodeQualificationsTable.id, id), eq(taskCodeQualificationsTable.tenantId, tenantId)));
  await syncTaskCodeLegacyFields(row.taskCodeId);
  await audit("remove_task_code_qualification", row.taskCodeId, { linkId: id });
  revalidatePath("/instellingen/kwalificaties");
  revalidatePath("/settings/task-codes");
  return { success: true };
}
