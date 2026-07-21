"use server";

import { randomUUID } from "node:crypto";
import {
  assignmentChecklistEvidenceTable,
  assignmentChecklistsTable,
  assignmentPersonnelTable,
  assignmentsTable,
  db,
  personnelTable,
  type ChecklistTemplateSnapshot,
} from "@workspace/db";
import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentPersonnelPortalTenantId } from "@/lib/auth/tenant";
import {
  ASSIGNMENT_MEDIA_BUCKET,
  buildChecklistEvidencePath,
  isChecklistEvidencePath,
  validateAssignmentMediaDescriptor,
} from "@/lib/uploads/assignment-media";
import { personnelWorkOrderIsSigned, SIGNED_WORK_ORDER_LOCK_MESSAGE } from "@/lib/work-order-lock";

export type PreparedChecklistEvidenceUpload = {
  storagePath: string;
  signedUrl: string;
  token: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  operationKey: string;
};

async function getChecklistAccess(assignmentId: string, checklistId: string) {
  const supabase = await createClient();
  const [{ data: { user } }, tenantId] = await Promise.all([
    supabase.auth.getUser(),
    requireCurrentPersonnelPortalTenantId(),
  ]);
  if (!user || !tenantId) return null;
  const [row] = await db.select({
    personnelId: personnelTable.id,
    assignmentStatus: assignmentsTable.status,
    customerSignatureDataUrl: assignmentsTable.customerSignatureDataUrl,
    customerSignedAt: assignmentsTable.customerSignedAt,
    checklistStatus: assignmentChecklistsTable.status,
    snapshot: assignmentChecklistsTable.templateSnapshot,
  }).from(assignmentPersonnelTable)
    .innerJoin(personnelTable, and(
      eq(personnelTable.id, assignmentPersonnelTable.personnelId),
      eq(personnelTable.tenantId, tenantId),
      eq(personnelTable.userId, user.id),
    ))
    .innerJoin(assignmentsTable, and(
      eq(assignmentsTable.id, assignmentPersonnelTable.assignmentId),
      eq(assignmentsTable.tenantId, tenantId),
    ))
    .innerJoin(assignmentChecklistsTable, and(
      eq(assignmentChecklistsTable.id, checklistId),
      eq(assignmentChecklistsTable.assignmentId, assignmentId),
      eq(assignmentChecklistsTable.tenantId, tenantId),
    ))
    .where(and(
      eq(assignmentPersonnelTable.assignmentId, assignmentId),
      eq(assignmentPersonnelTable.status, "assigned"),
    )).limit(1);
  if (!row) return null;
  return { ...row, tenantId, userId: user.id };
}

function snapshotContainsItem(snapshot: ChecklistTemplateSnapshot, itemId: string) {
  return snapshot.sections.some((section) => section.items.some((item) => item.id === itemId));
}

async function uploadedObjectExists(storagePath: string): Promise<boolean> {
  const parts = storagePath.split("/");
  const fileName = parts.pop();
  const prefix = parts.join("/");
  if (!fileName || !prefix) return false;
  const { data, error } = await createAdminClient().storage.from(ASSIGNMENT_MEDIA_BUCKET).list(prefix, { limit: 20, search: fileName });
  return !error && Boolean(data?.some((item) => item.name === fileName));
}

export async function prepareChecklistEvidenceUpload(input: {
  assignmentId: string;
  checklistId: string;
  itemId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}): Promise<{ success: true; upload: PreparedChecklistEvidenceUpload } | { success: false; error: string }> {
  const access = await getChecklistAccess(input.assignmentId, input.checklistId);
  if (!access) return { success: false, error: "Checklist niet gevonden of niet aan jou toegewezen." };
  if (personnelWorkOrderIsSigned(access)) return { success: false, error: SIGNED_WORK_ORDER_LOCK_MESSAGE };
  if (access.checklistStatus !== "active") return { success: false, error: "Deze checklist is afgesloten voor bewijs." };
  if (!snapshotContainsItem(access.snapshot, input.itemId)) return { success: false, error: "Checklistitem bestaat niet in deze versie." };
  const validation = validateAssignmentMediaDescriptor(input, { allowVideos: false });
  if (!validation.valid) return { success: false, error: validation.error };
  const operationKey = randomUUID();
  const storagePath = buildChecklistEvidencePath(access.tenantId, input.assignmentId, input.checklistId, input.itemId, validation.fileName, operationKey);
  const { data, error } = await createAdminClient().storage.from(ASSIGNMENT_MEDIA_BUCKET).createSignedUploadUrl(storagePath);
  if (error || !data) return { success: false, error: "Upload voorbereiden mislukt." };
  return { success: true, upload: { storagePath, signedUrl: data.signedUrl, token: data.token, fileName: validation.fileName, mimeType: validation.mimeType, fileSize: validation.fileSize, operationKey } };
}

export async function confirmChecklistEvidenceUpload(input: {
  assignmentId: string;
  checklistId: string;
  itemId: string;
  kind: "photo" | "signature";
  storagePath: string;
  operationKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}): Promise<{ success: true; evidenceId: string } | { success: false; error: string }> {
  const access = await getChecklistAccess(input.assignmentId, input.checklistId);
  if (!access) return { success: false, error: "Checklist niet gevonden of niet aan jou toegewezen." };
  if (personnelWorkOrderIsSigned(access)) return { success: false, error: SIGNED_WORK_ORDER_LOCK_MESSAGE };
  if (access.checklistStatus !== "active") return { success: false, error: "Deze checklist is afgesloten voor bewijs." };
  if (!snapshotContainsItem(access.snapshot, input.itemId)) return { success: false, error: "Checklistitem bestaat niet in deze versie." };
  if (!isChecklistEvidencePath(access.tenantId, input.assignmentId, input.checklistId, input.itemId, input.storagePath)) return { success: false, error: "Uploadpad hoort niet bij dit checklistitem." };
  if (!(await uploadedObjectExists(input.storagePath))) return { success: false, error: "Bestand is nog niet correct geüpload." };
  const [evidenceCount] = await db.select({ count: count() }).from(assignmentChecklistEvidenceTable).where(and(
    eq(assignmentChecklistEvidenceTable.tenantId, access.tenantId),
    eq(assignmentChecklistEvidenceTable.assignmentChecklistId, input.checklistId),
    eq(assignmentChecklistEvidenceTable.snapshotItemId, input.itemId),
  ));
  if (Number(evidenceCount?.count ?? 0) >= 20) return { success: false, error: "Maximaal 20 bewijsbestanden per checklistitem." };
  const [created] = await db.insert(assignmentChecklistEvidenceTable).values({
    tenantId: access.tenantId,
    assignmentChecklistId: input.checklistId,
    snapshotItemId: input.itemId,
    kind: input.kind,
    storagePath: input.storagePath,
    metadata: { fileName: input.fileName, mimeType: input.mimeType, fileSize: input.fileSize },
    operationKey: input.operationKey,
    uploadedBy: access.userId,
  }).onConflictDoNothing().returning({ id: assignmentChecklistEvidenceTable.id });
  if (!created) {
    const [replay] = await db.select({ id: assignmentChecklistEvidenceTable.id }).from(assignmentChecklistEvidenceTable).where(and(
      eq(assignmentChecklistEvidenceTable.tenantId, access.tenantId),
      eq(assignmentChecklistEvidenceTable.operationKey, input.operationKey),
    )).limit(1);
    if (!replay) return { success: false, error: "Bewijs opslaan mislukt." };
    return { success: true, evidenceId: replay.id };
  }
  revalidatePath(`/opdrachten/${input.assignmentId}`);
  revalidatePath(`/opdrachten/${input.assignmentId}/afronden`);
  return { success: true, evidenceId: created.id };
}
