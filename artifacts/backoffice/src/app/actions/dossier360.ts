"use server";

import {
  db,
  dossierProfilesTable,
  dossierTasksTable,
  type DossierStatus,
  type DossierSubjectType,
} from "@workspace/db";
import { and, count, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";

import { requirePermission } from "@/lib/auth/permissions";
import { requireCurrentTenantId } from "@/lib/auth/tenant";

const dossierSubjectSchema = z.discriminatedUnion("subjectType", [
  z.object({ subjectType: z.literal("personnel"), subjectId: z.string().uuid() }),
  z.object({ subjectType: z.literal("customer"), subjectId: z.string().uuid() }),
  z.object({ subjectType: z.literal("object"), subjectId: z.string().uuid() }),
]);

const subjectPermission: Record<DossierSubjectType, string> = {
  personnel: "personnel",
  customer: "customers",
  object: "objects",
};

export type DossierSummary = {
  id: string;
  dossierNumber: string;
  status: DossierStatus;
  managerAssigned: boolean;
  lastReviewedAt: string | null;
  openTaskCount: number;
  retentionPolicyKey: string | null;
  scheduledDeletionAt: string | null;
  legalHold: boolean;
  recordVersion: number;
};

/**
 * Reads common dossier metadata only. Subject data remains canonical in its
 * own domain table and every lookup is scoped by the current tenant.
 */
export async function getDossierSummary(input: {
  subjectType: DossierSubjectType;
  subjectId: string;
}): Promise<DossierSummary | null> {
  const parsed = dossierSubjectSchema.safeParse(input);
  if (!parsed.success) return null;

  await requirePermission(subjectPermission[parsed.data.subjectType], "read");
  const tenantId = await requireCurrentTenantId();
  const subjectPredicate = parsed.data.subjectType === "personnel"
    ? eq(dossierProfilesTable.personnelId, parsed.data.subjectId)
    : parsed.data.subjectType === "customer"
      ? eq(dossierProfilesTable.customerId, parsed.data.subjectId)
      : eq(dossierProfilesTable.objectId, parsed.data.subjectId);

  const [profile] = await db
    .select({
      id: dossierProfilesTable.id,
      dossierNumber: dossierProfilesTable.dossierNumber,
      status: dossierProfilesTable.status,
      managerUserId: dossierProfilesTable.managerUserId,
      lastReviewedAt: dossierProfilesTable.lastReviewedAt,
      retentionPolicyKey: dossierProfilesTable.retentionPolicyKey,
      scheduledDeletionAt: dossierProfilesTable.scheduledDeletionAt,
      legalHoldAt: dossierProfilesTable.legalHoldAt,
      recordVersion: dossierProfilesTable.recordVersion,
    })
    .from(dossierProfilesTable)
    .where(and(
      eq(dossierProfilesTable.tenantId, tenantId),
      eq(dossierProfilesTable.subjectType, parsed.data.subjectType),
      subjectPredicate,
    ))
    .limit(1);

  if (!profile) return null;

  const [taskCount] = await db
    .select({ value: count() })
    .from(dossierTasksTable)
    .where(and(
      eq(dossierTasksTable.tenantId, tenantId),
      eq(dossierTasksTable.dossierProfileId, profile.id),
      inArray(dossierTasksTable.status, ["open", "in_progress"]),
    ));

  return {
    id: profile.id,
    dossierNumber: profile.dossierNumber,
    status: profile.status,
    managerAssigned: Boolean(profile.managerUserId),
    lastReviewedAt: profile.lastReviewedAt?.toISOString() ?? null,
    openTaskCount: Number(taskCount?.value ?? 0),
    retentionPolicyKey: profile.retentionPolicyKey,
    scheduledDeletionAt: profile.scheduledDeletionAt?.toISOString() ?? null,
    legalHold: Boolean(profile.legalHoldAt),
    recordVersion: profile.recordVersion,
  };
}
