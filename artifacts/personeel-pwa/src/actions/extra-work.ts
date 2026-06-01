"use server";

import { db } from "@workspace/db";
import {
  assignmentExtraWorkTable,
  assignmentPhotosTable,
  assignmentPersonnelTable,
  personnelTable,
  taskCodesTable,
} from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ExtraWorkPhoto = {
  id:         string;
  storagePath: string;
  signedUrl:  string | null;
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
  id:    string;
  code:  string;
  name:  string;
  price: string | null;
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

async function generateSignedUrl(storagePath: string): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin.storage
      .from("assignment-photos")
      .createSignedUrl(storagePath, 3600); // 1 hour
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

// ─── Queries ───────────────────────────────────────────────────────────────────

export async function getActiveTaskCodes(): Promise<TaskCodeOption[]> {
  const rows = await db
    .select({
      id:    taskCodesTable.id,
      code:  taskCodesTable.code,
      name:  taskCodesTable.name,
      price: taskCodesTable.price,
    })
    .from(taskCodesTable)
    .where(eq(taskCodesTable.isActive, true))
    .orderBy(asc(taskCodesTable.code));

  return rows.map((r) => ({
    id:    r.id,
    code:  r.code,
    name:  r.name,
    price: r.price ?? null,
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

  // Generate signed URLs for each photo
  const photosWithUrls = await Promise.all(
    allPhotos.map(async (p) => ({
      id:         p.id,
      storagePath: p.storagePath,
      extraWorkId: p.extraWorkId,
      signedUrl:  await generateSignedUrl(p.storagePath),
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

export type AddExtraWorkInput = {
  taskCodeId?:   string | null;
  taskCodeName?: string | null;
  description:   string;
  hours?:        string | null;
  price?:        string | null;
};

export async function addExtraWork(
  assignmentId: string,
  input: AddExtraWorkInput,
): Promise<{ success: boolean; id?: string; error?: string }> {
  const auth = await getAuthAndPersonnel();
  if (!auth) return { success: false, error: "Niet ingelogd" };

  const linked = await isLinked(auth.personnelId, assignmentId);
  if (!linked) return { success: false, error: "Niet gekoppeld aan deze opdracht" };

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
  return { success: true, id: row.id };
}

export async function deleteExtraWork(
  id: string,
  assignmentId: string,
): Promise<{ success: boolean; error?: string }> {
  const auth = await getAuthAndPersonnel();
  if (!auth) return { success: false, error: "Niet ingelogd" };

  // Verify ownership
  const [item] = await db
    .select({ createdBy: assignmentExtraWorkTable.createdBy })
    .from(assignmentExtraWorkTable)
    .where(eq(assignmentExtraWorkTable.id, id))
    .limit(1);

  if (!item) return { success: false, error: "Niet gevonden" };
  if (item.createdBy !== auth.userId) return { success: false, error: "Geen toegang" };

  // Get photos to delete from storage
  const photos = await db
    .select({ storagePath: assignmentPhotosTable.storagePath })
    .from(assignmentPhotosTable)
    .where(eq(assignmentPhotosTable.extraWorkId, id));

  // Delete from storage (fire-and-forget — DB cascades on delete)
  if (photos.length > 0) {
    const admin = createAdminClient();
    await admin.storage.from("assignment-photos").remove(photos.map((p) => p.storagePath));
  }

  await db.delete(assignmentExtraWorkTable).where(eq(assignmentExtraWorkTable.id, id));

  revalidatePath(`/opdrachten/${assignmentId}`);
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
  photoId:     string,
  storagePath: string,
  assignmentId: string,
): Promise<{ success: boolean; error?: string }> {
  const auth = await getAuthAndPersonnel();
  if (!auth) return { success: false, error: "Niet ingelogd" };

  // Verify ownership
  const [photo] = await db
    .select({ uploadedBy: assignmentPhotosTable.uploadedBy })
    .from(assignmentPhotosTable)
    .where(eq(assignmentPhotosTable.id, photoId))
    .limit(1);

  if (!photo) return { success: false, error: "Foto niet gevonden" };
  if (photo.uploadedBy !== auth.userId) return { success: false, error: "Geen toegang" };

  // Delete from storage
  const admin = createAdminClient();
  await admin.storage.from("assignment-photos").remove([storagePath]);

  // Delete from DB
  await db.delete(assignmentPhotosTable).where(eq(assignmentPhotosTable.id, photoId));

  revalidatePath(`/opdrachten/${assignmentId}`);
  return { success: true };
}
