"use server";

import { db } from "@workspace/db";
import {
  assignmentExtraWorkTable,
  assignmentPhotosTable,
  assignmentPersonnelTable,
  assignmentsTable,
  personnelTable,
  taskCodesTable,
} from "@workspace/db";
import { eq, and, asc, count } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

// ─── Constants ─────────────────────────────────────────────────────────────────

/**
 * Statuses in which extra-work and photos are no longer mutable.
 * Mutations attempted after these statuses are rejected server-side.
 */
const LOCKED_STATUSES = new Set([
  "report_submitted",
  "report_approved",
  "invoice_ready",
  "invoiced",
  "paid",
  "closed",
]);

const MAX_PHOTOS_PER_ITEM = 5;

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ExtraWorkPhoto = {
  id:          string;
  storagePath: string;
  signedUrl:   string | null;
};

export type ExtraWorkItem = {
  id:           string;
  taskCodeId:   string | null;
  taskCodeName: string | null;
  description:  string;
  hours:        string | null;
  price:        string | null;
  createdBy:    string;
  photos:       ExtraWorkPhoto[];
};

export type TaskCodeOption = {
  id:              string;
  code:            string;
  name:            string;
  price:           string | null;
  durationMinutes: number | null;
};

export type ExtraWorkInput = {
  taskCodeId?:   string | null;
  taskCodeName?: string | null;
  description:   string;
  hours?:        string | null;
  price?:        string | null;
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function getAuthAndPersonnel(): Promise<{ userId: string; personnelId: string } | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [row] = await db
    .select({ id: personnelTable.id })
    .from(personnelTable)
    .where(eq(personnelTable.userId, user.id))
    .limit(1);

  if (!row) return null;
  return { userId: user.id, personnelId: row.id };
}

async function isLinked(personnelId: string, assignmentId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: assignmentPersonnelTable.id })
    .from(assignmentPersonnelTable)
    .where(
      and(
        eq(assignmentPersonnelTable.personnelId, personnelId),
        eq(assignmentPersonnelTable.assignmentId, assignmentId),
        eq(assignmentPersonnelTable.status, "assigned"),
      ),
    )
    .limit(1);
  return !!row;
}

/**
 * Returns false when the assignment status prevents further edits.
 * This is the server-side enforcement of the "locked after report submission" rule.
 */
async function isAssignmentEditable(assignmentId: string): Promise<boolean> {
  const [row] = await db
    .select({ status: assignmentsTable.status })
    .from(assignmentsTable)
    .where(eq(assignmentsTable.id, assignmentId))
    .limit(1);
  if (!row) return false;
  return !LOCKED_STATUSES.has(row.status);
}

async function generateSignedUrl(storagePath: string): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin.storage
      .from("assignment-photos")
      .createSignedUrl(storagePath, 3600); // 1 hour validity
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

// ─── Queries ───────────────────────────────────────────────────────────────────

export async function getActiveTaskCodes(): Promise<TaskCodeOption[]> {
  const rows = await db
    .select({
      id:              taskCodesTable.id,
      code:            taskCodesTable.code,
      name:            taskCodesTable.name,
      price:           taskCodesTable.price,
      durationMinutes: taskCodesTable.durationMinutes,
    })
    .from(taskCodesTable)
    .where(eq(taskCodesTable.isActive, true))
    .orderBy(asc(taskCodesTable.code));

  return rows.map((r) => ({
    id:              r.id,
    code:            r.code,
    name:            r.name,
    price:           r.price ?? null,
    durationMinutes: r.durationMinutes ?? null,
  }));
}

export async function getExtraWorkForAssignment(assignmentId: string): Promise<ExtraWorkItem[]> {
  const auth = await getAuthAndPersonnel();
  if (!auth) return [];

  const linked = await isLinked(auth.personnelId, assignmentId);
  if (!linked) return [];

  const items = await db
    .select()
    .from(assignmentExtraWorkTable)
    .where(eq(assignmentExtraWorkTable.assignmentId, assignmentId))
    .orderBy(asc(assignmentExtraWorkTable.createdAt));

  if (items.length === 0) return [];

  const allPhotos = await db
    .select()
    .from(assignmentPhotosTable)
    .where(eq(assignmentPhotosTable.assignmentId, assignmentId))
    .orderBy(asc(assignmentPhotosTable.createdAt));

  // Generate signed URLs for each photo (parallel)
  const photosWithUrls = await Promise.all(
    allPhotos.map(async (p) => ({
      id:          p.id,
      storagePath: p.storagePath,
      extraWorkId: p.extraWorkId,
      signedUrl:   await generateSignedUrl(p.storagePath),
    })),
  );

  return items.map((item) => ({
    id:           item.id,
    taskCodeId:   item.taskCodeId,
    taskCodeName: item.taskCodeName ?? null,
    description:  item.description,
    hours:        item.hours ?? null,
    price:        item.price ?? null,
    createdBy:    item.createdBy,
    photos:       photosWithUrls
      .filter((p) => p.extraWorkId === item.id)
      .map((p) => ({ id: p.id, storagePath: p.storagePath, signedUrl: p.signedUrl })),
  }));
}

// ─── Mutations ─────────────────────────────────────────────────────────────────

export async function addExtraWork(
  assignmentId: string,
  input: ExtraWorkInput,
): Promise<{ success: boolean; id?: string; error?: string }> {
  const auth = await getAuthAndPersonnel();
  if (!auth) return { success: false, error: "Niet ingelogd" };

  const linked = await isLinked(auth.personnelId, assignmentId);
  if (!linked) return { success: false, error: "Niet gekoppeld aan deze opdracht" };

  const editable = await isAssignmentEditable(assignmentId);
  if (!editable) return { success: false, error: "De opdracht is afgesloten voor verdere wijzigingen" };

  const description = input.description.trim();
  if (!description) return { success: false, error: "Omschrijving is verplicht" };

  const [row] = await db
    .insert(assignmentExtraWorkTable)
    .values({
      assignmentId,
      taskCodeId:   input.taskCodeId ?? null,
      taskCodeName: input.taskCodeName ?? null,
      description,
      hours:        input.hours?.trim() || null,
      price:        input.price?.trim() || null,
      createdBy:    auth.userId,
    })
    .returning({ id: assignmentExtraWorkTable.id });

  if (!row) return { success: false, error: "Toevoegen mislukt" };

  revalidatePath(`/opdrachten/${assignmentId}`);
  revalidatePath(`/opdrachten/${assignmentId}/meerwerk`);
  return { success: true, id: row.id };
}

export async function updateExtraWork(
  id: string,
  assignmentId: string,
  input: ExtraWorkInput,
): Promise<{ success: boolean; error?: string }> {
  const auth = await getAuthAndPersonnel();
  if (!auth) return { success: false, error: "Niet ingelogd" };

  // Verify ownership
  const [item] = await db
    .select({ createdBy: assignmentExtraWorkTable.createdBy, assignmentId: assignmentExtraWorkTable.assignmentId })
    .from(assignmentExtraWorkTable)
    .where(eq(assignmentExtraWorkTable.id, id))
    .limit(1);

  if (!item) return { success: false, error: "Niet gevonden" };
  if (item.createdBy !== auth.userId) return { success: false, error: "Geen toegang" };

  // Verify the item belongs to the claimed assignmentId (IDOR protection)
  if (item.assignmentId !== assignmentId) return { success: false, error: "Niet gevonden" };

  // Re-check current assignment linkage (personnel may have been unlinked after initial edit)
  const linked = await isLinked(auth.personnelId, assignmentId);
  if (!linked) return { success: false, error: "Niet gekoppeld aan deze opdracht" };

  const editable = await isAssignmentEditable(assignmentId);
  if (!editable) return { success: false, error: "De opdracht is afgesloten voor verdere wijzigingen" };

  const description = input.description.trim();
  if (!description) return { success: false, error: "Omschrijving is verplicht" };

  await db
    .update(assignmentExtraWorkTable)
    .set({
      taskCodeId:   input.taskCodeId ?? null,
      taskCodeName: input.taskCodeName ?? null,
      description,
      hours:        input.hours?.trim() || null,
      price:        input.price?.trim() || null,
    })
    .where(eq(assignmentExtraWorkTable.id, id));

  revalidatePath(`/opdrachten/${assignmentId}`);
  revalidatePath(`/opdrachten/${assignmentId}/meerwerk`);
  return { success: true };
}

export async function deleteExtraWork(
  id: string,
  assignmentId: string,
): Promise<{ success: boolean; error?: string }> {
  const auth = await getAuthAndPersonnel();
  if (!auth) return { success: false, error: "Niet ingelogd" };

  // Verify ownership and assignment membership
  const [item] = await db
    .select({ createdBy: assignmentExtraWorkTable.createdBy, assignmentId: assignmentExtraWorkTable.assignmentId })
    .from(assignmentExtraWorkTable)
    .where(eq(assignmentExtraWorkTable.id, id))
    .limit(1);

  if (!item) return { success: false, error: "Niet gevonden" };
  if (item.createdBy !== auth.userId) return { success: false, error: "Geen toegang" };
  if (item.assignmentId !== assignmentId) return { success: false, error: "Niet gevonden" };

  // Re-check current assignment linkage (personnel may have been unlinked after initial edit)
  const linked = await isLinked(auth.personnelId, assignmentId);
  if (!linked) return { success: false, error: "Niet gekoppeld aan deze opdracht" };

  const editable = await isAssignmentEditable(assignmentId);
  if (!editable) return { success: false, error: "De opdracht is afgesloten voor verdere wijzigingen" };

  // Fetch photos linked to this extra-work item before deleting
  const photos = await db
    .select({ storagePath: assignmentPhotosTable.storagePath })
    .from(assignmentPhotosTable)
    .where(eq(assignmentPhotosTable.extraWorkId, id));

  if (photos.length > 0) {
    // Remove from storage
    const admin = createAdminClient();
    await admin.storage.from("assignment-photos").remove(photos.map((p) => p.storagePath));
    // Explicitly delete photo DB rows — FK is ON DELETE SET NULL, NOT CASCADE,
    // so rows are NOT automatically removed when the extra-work item is deleted.
    await db.delete(assignmentPhotosTable).where(eq(assignmentPhotosTable.extraWorkId, id));
  }

  await db.delete(assignmentExtraWorkTable).where(eq(assignmentExtraWorkTable.id, id));

  revalidatePath(`/opdrachten/${assignmentId}`);
  revalidatePath(`/opdrachten/${assignmentId}/meerwerk`);
  return { success: true };
}

export async function savePhotoPath(
  assignmentId: string,
  extraWorkId:  string,
  storagePath:  string,
): Promise<{ success: boolean; photoId?: string; error?: string }> {
  const auth = await getAuthAndPersonnel();
  if (!auth) return { success: false, error: "Niet ingelogd" };

  const linked = await isLinked(auth.personnelId, assignmentId);
  if (!linked) return { success: false, error: "Niet gekoppeld aan deze opdracht" };

  const editable = await isAssignmentEditable(assignmentId);
  if (!editable) return { success: false, error: "De opdracht is afgesloten voor verdere wijzigingen" };

  // Verify extraWorkId belongs to this assignmentId (IDOR / path traversal protection)
  const [ew] = await db
    .select({ id: assignmentExtraWorkTable.id })
    .from(assignmentExtraWorkTable)
    .where(
      and(
        eq(assignmentExtraWorkTable.id, extraWorkId),
        eq(assignmentExtraWorkTable.assignmentId, assignmentId),
      ),
    )
    .limit(1);
  if (!ew) return { success: false, error: "Meerwerk-item niet gevonden" };

  // Enforce max 5 photos per extra-work item (server-side)
  const [photoCount] = await db
    .select({ cnt: count() })
    .from(assignmentPhotosTable)
    .where(eq(assignmentPhotosTable.extraWorkId, extraWorkId));

  if ((photoCount?.cnt ?? 0) >= MAX_PHOTOS_PER_ITEM) {
    return { success: false, error: `Maximaal ${MAX_PHOTOS_PER_ITEM} foto's per meerwerk-item toegestaan` };
  }

  const [row] = await db
    .insert(assignmentPhotosTable)
    .values({
      assignmentId,
      extraWorkId,
      storagePath,
      uploadedBy: auth.userId,
    })
    .returning({ id: assignmentPhotosTable.id });

  if (!row) return { success: false, error: "Opslaan mislukt" };

  revalidatePath(`/opdrachten/${assignmentId}`);
  return { success: true, photoId: row.id };
}

export async function deletePhoto(
  photoId:      string,
  assignmentId: string,
): Promise<{ success: boolean; error?: string }> {
  const auth = await getAuthAndPersonnel();
  if (!auth) return { success: false, error: "Niet ingelogd" };

  // Load the canonical storagePath from DB — never trust a client-supplied path.
  // This prevents an authenticated user from deleting arbitrary storage objects
  // by passing a crafted storagePath while holding a valid photoId.
  const [photo] = await db
    .select({
      uploadedBy:  assignmentPhotosTable.uploadedBy,
      assignmentId: assignmentPhotosTable.assignmentId,
      storagePath: assignmentPhotosTable.storagePath,
    })
    .from(assignmentPhotosTable)
    .where(eq(assignmentPhotosTable.id, photoId))
    .limit(1);

  if (!photo) return { success: false, error: "Foto niet gevonden" };
  if (photo.uploadedBy !== auth.userId) return { success: false, error: "Geen toegang" };
  // Verify the photo belongs to the claimed assignmentId (IDOR protection)
  if (photo.assignmentId !== assignmentId) return { success: false, error: "Foto niet gevonden" };

  // Re-check current assignment linkage
  const linked = await isLinked(auth.personnelId, assignmentId);
  if (!linked) return { success: false, error: "Niet gekoppeld aan deze opdracht" };

  const editable = await isAssignmentEditable(assignmentId);
  if (!editable) return { success: false, error: "De opdracht is afgesloten voor verdere wijzigingen" };

  // Delete from storage using DB-backed storagePath only
  const admin = createAdminClient();
  await admin.storage.from("assignment-photos").remove([photo.storagePath]);

  await db.delete(assignmentPhotosTable).where(eq(assignmentPhotosTable.id, photoId));

  revalidatePath(`/opdrachten/${assignmentId}`);
  return { success: true };
}
