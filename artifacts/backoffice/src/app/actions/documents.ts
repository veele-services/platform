"use server";

import { randomUUID } from "node:crypto";
import { db } from "@workspace/db";
import {
  documentsTable,
  auditLogTable,
  assignmentsTable,
  customersTable,
  personnelTable,
  objectsTable,
  DOCUMENT_ENTITY_TYPES,
  type DocumentEntityType,
} from "@workspace/db";
import { eq, desc, and, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission, hasPermission } from "@/lib/auth/permissions";
import type { ActionResult } from "./customers";

export type { ActionResult, DocumentEntityType };
export { DOCUMENT_ENTITY_TYPES };

// ─── Types ────────────────────────────────────────────────────────────────────

export type DocumentRow = {
  id:            string;
  name:          string;
  filename:      string;
  mimeType:      string;
  sizeBytes:     number;
  entityType:    DocumentEntityType;
  entityId:      string | null;
  entityName:    string | null;
  uploadedBy:    string;
  uploaderEmail: string;
  uploaderName:  string | null;
  createdAt:     string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const BUCKET = "documents";

const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildStoragePath(
  entityType: DocumentEntityType,
  entityId: string | null,
  docId: string,
  filename: string,
): string {
  const ext = filename.includes(".") ? filename.split(".").pop()! : "bin";
  if (entityType !== "general" && entityId) {
    return `${entityType}/${entityId}/${docId}.${ext}`;
  }
  return `general/${docId}.${ext}`;
}

// ─── Entity name enrichment ───────────────────────────────────────────────────

async function enrichEntityNames(
  rows: Array<{ entityType: string; entityId: string | null }>,
): Promise<Map<string, string>> {
  // Group entity IDs by type
  const byType: Record<string, string[]> = {};
  for (const r of rows) {
    if (!r.entityId) continue;
    if (!byType[r.entityType]) byType[r.entityType] = [];
    if (!byType[r.entityType].includes(r.entityId)) {
      byType[r.entityType].push(r.entityId);
    }
  }

  const nameMap = new Map<string, string>(); // entityId → display name

  await Promise.all([
    byType["assignment"]?.length
      ? db
          .select({ id: assignmentsTable.id, title: assignmentsTable.title })
          .from(assignmentsTable)
          .where(inArray(assignmentsTable.id, byType["assignment"]))
          .then((rows) => rows.forEach((r) => nameMap.set(r.id, r.title)))
      : Promise.resolve(),

    byType["customer"]?.length
      ? db
          .select({ id: customersTable.id, name: customersTable.name })
          .from(customersTable)
          .where(inArray(customersTable.id, byType["customer"]))
          .then((rows) => rows.forEach((r) => nameMap.set(r.id, r.name)))
      : Promise.resolve(),

    byType["personnel"]?.length
      ? db
          .select({
            id:        personnelTable.id,
            firstName: personnelTable.firstName,
            lastName:  personnelTable.lastName,
          })
          .from(personnelTable)
          .where(inArray(personnelTable.id, byType["personnel"]))
          .then((rows) =>
            rows.forEach((r) =>
              nameMap.set(r.id, `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim()),
            ),
          )
      : Promise.resolve(),

    byType["object"]?.length
      ? db
          .select({ id: objectsTable.id, name: objectsTable.name })
          .from(objectsTable)
          .where(inArray(objectsTable.id, byType["object"]))
          .then((rows) => rows.forEach((r) => nameMap.set(r.id, r.name)))
      : Promise.resolve(),
  ]);

  return nameMap;
}

// ─── listDocuments ────────────────────────────────────────────────────────────

export async function listDocuments(filter?: {
  entityType?: DocumentEntityType;
  entityId?:   string;
}): Promise<DocumentRow[]> {
  const canRead = await hasPermission("documents", "read");
  if (!canRead) return [];

  const conditions = [];
  if (filter?.entityType) {
    conditions.push(eq(documentsTable.entityType, filter.entityType));
  }
  if (filter?.entityId) {
    conditions.push(eq(documentsTable.entityId, filter.entityId));
  }

  const rows = await db
    .select({
      id:         documentsTable.id,
      name:       documentsTable.name,
      filename:   documentsTable.filename,
      mimeType:   documentsTable.mimeType,
      sizeBytes:  documentsTable.sizeBytes,
      entityType: documentsTable.entityType,
      entityId:   documentsTable.entityId,
      uploadedBy: documentsTable.uploadedBy,
      createdAt:  documentsTable.createdAt,
    })
    .from(documentsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(documentsTable.createdAt));

  if (rows.length === 0) return [];

  // Parallel enrichment: entity names + uploader names
  const [entityNameMap, userMap] = await Promise.all([
    enrichEntityNames(rows),
    (async () => {
      const admin = createAdminClient();
      const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
      const map = new Map<string, { email: string; name: string | null }>();
      for (const u of data?.users ?? []) {
        const meta = u.user_metadata as { full_name?: string; name?: string } | undefined;
        map.set(u.id, {
          email: u.email ?? u.id,
          name:  (meta?.full_name ?? meta?.name) ?? null,
        });
      }
      return map;
    })(),
  ]);

  return rows.map((r) => {
    const uploader = userMap.get(r.uploadedBy);
    return {
      id:            r.id,
      name:          r.name,
      filename:      r.filename,
      mimeType:      r.mimeType,
      sizeBytes:     r.sizeBytes,
      entityType:    r.entityType as DocumentEntityType,
      entityId:      r.entityId ?? null,
      entityName:    r.entityId ? (entityNameMap.get(r.entityId) ?? null) : null,
      uploadedBy:    r.uploadedBy,
      uploaderEmail: uploader?.email ?? r.uploadedBy,
      uploaderName:  uploader?.name ?? null,
      createdAt:     r.createdAt.toISOString(),
    };
  });
}

// ─── uploadDocument ───────────────────────────────────────────────────────────

export async function uploadDocument(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("documents", "write");

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, message: "Niet geauthenticeerd." };

    const file       = formData.get("file") as File | null;
    const name       = (formData.get("name") as string | null)?.trim();
    const entityType = (formData.get("entityType") as string | null) ?? "general";
    const entityId   = (formData.get("entityId") as string | null) || null;

    // Validate inputs
    if (!file || file.size === 0) {
      return { success: false, message: "Geen bestand geselecteerd." };
    }
    if (file.size > MAX_SIZE_BYTES) {
      return { success: false, message: "Bestand is te groot (max. 20 MB)." };
    }
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return {
        success: false,
        message: "Bestandstype niet toegestaan. Gebruik PDF, Word, Excel of een afbeelding.",
      };
    }
    if (!name) {
      return { success: false, message: "Naam is verplicht." };
    }

    const safeEntityType: DocumentEntityType =
      DOCUMENT_ENTITY_TYPES.includes(entityType as DocumentEntityType)
        ? (entityType as DocumentEntityType)
        : "general";

    const docId       = randomUUID();
    const storagePath = buildStoragePath(safeEntityType, entityId, docId, file.name);

    // Upload to Supabase Storage
    const bytes = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, bytes, {
        contentType: file.type,
        upsert:      false,
      });

    if (uploadError) {
      return {
        success: false,
        message: `Upload mislukt: ${uploadError.message}`,
      };
    }

    // Insert DB record
    const [inserted] = await db
      .insert(documentsTable)
      .values({
        id:          docId,
        name,
        filename:    file.name,
        mimeType:    file.type,
        storagePath,
        sizeBytes:   file.size,
        entityType:  safeEntityType,
        entityId:    entityId,
        uploadedBy:  user.id,
      })
      .returning({ id: documentsTable.id });

    // Audit log
    await db.insert(auditLogTable).values({
      userId:     user.id,
      action:     "create",
      resource:   "documents",
      resourceId: inserted.id,
      metadata: {
        name,
        filename:   file.name,
        entityType: safeEntityType,
        entityId:   entityId ?? null,
        sizeBytes:  file.size,
      } as Record<string, unknown>,
    });

    revalidatePath("/documents");
    if (safeEntityType === "assignment" && entityId) {
      revalidatePath(`/assignments/${entityId}`);
    }

    return { success: true, data: { id: inserted.id } };
  } catch (err) {
    return {
      success: false,
      message: (err as Error).message ?? "Uploaden mislukt.",
    };
  }
}

// ─── deleteDocument ───────────────────────────────────────────────────────────

export async function deleteDocument(id: string): Promise<ActionResult> {
  try {
    await requirePermission("documents", "write");

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, message: "Niet geauthenticeerd." };

    const [doc] = await db
      .select({
        storagePath: documentsTable.storagePath,
        entityType:  documentsTable.entityType,
        entityId:    documentsTable.entityId,
        name:        documentsTable.name,
      })
      .from(documentsTable)
      .where(eq(documentsTable.id, id))
      .limit(1);

    if (!doc) return { success: false, message: "Document niet gevonden." };

    // Delete from Supabase Storage (best-effort; do not block DB delete)
    await supabase.storage.from(BUCKET).remove([doc.storagePath]);

    // Delete from DB
    await db.delete(documentsTable).where(eq(documentsTable.id, id));

    // Audit log
    await db.insert(auditLogTable).values({
      userId:     user.id,
      action:     "delete",
      resource:   "documents",
      resourceId: id,
      metadata: {
        name:       doc.name,
        entityType: doc.entityType,
        entityId:   doc.entityId ?? null,
      } as Record<string, unknown>,
    });

    revalidatePath("/documents");
    if (doc.entityType === "assignment" && doc.entityId) {
      revalidatePath(`/assignments/${doc.entityId}`);
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      message: (err as Error).message ?? "Verwijderen mislukt.",
    };
  }
}

// ─── getDocumentDownloadUrl ───────────────────────────────────────────────────

export async function getDocumentDownloadUrl(
  id: string,
): Promise<ActionResult<{ url: string; filename: string }>> {
  try {
    await requirePermission("documents", "read");

    const [doc] = await db
      .select({
        storagePath: documentsTable.storagePath,
        filename:    documentsTable.filename,
      })
      .from(documentsTable)
      .where(eq(documentsTable.id, id))
      .limit(1);

    if (!doc) return { success: false, message: "Document niet gevonden." };

    const supabase = await createClient();
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(doc.storagePath, 3600); // 1-hour TTL

    if (error || !data) {
      return { success: false, message: "Kan download-URL niet genereren." };
    }

    return { success: true, data: { url: data.signedUrl, filename: doc.filename } };
  } catch (err) {
    return {
      success: false,
      message: (err as Error).message ?? "Download mislukt.",
    };
  }
}
