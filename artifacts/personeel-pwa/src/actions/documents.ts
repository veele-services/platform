"use server";

import { db } from "@workspace/db";
import { documentsTable, personnelTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PersonnelDocument = {
  id:        string;
  name:      string;
  filename:  string;
  mimeType:  string;
  sizeBytes: number;
  createdAt: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getPersonnelId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [row] = await db
    .select({ id: personnelTable.id })
    .from(personnelTable)
    .where(and(eq(personnelTable.userId, user.id), eq(personnelTable.isActive, true)))
    .limit(1);

  return row?.id ?? null;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Returns all documents linked to the logged-in employee's personnel record.
 * Uses service-role Drizzle client — scoped by entity_type='personnel' and
 * entity_id=personnelId (no RLS bypass needed beyond the personnel id check).
 */
export async function getMyDocuments(): Promise<PersonnelDocument[]> {
  const personnelId = await getPersonnelId();
  if (!personnelId) return [];

  const rows = await db
    .select({
      id:        documentsTable.id,
      name:      documentsTable.name,
      filename:  documentsTable.filename,
      mimeType:  documentsTable.mimeType,
      sizeBytes: documentsTable.sizeBytes,
      createdAt: documentsTable.createdAt,
    })
    .from(documentsTable)
    .where(
      and(
        eq(documentsTable.entityType, "personnel"),
        eq(documentsTable.entityId, personnelId),
      ),
    )
    .orderBy(desc(documentsTable.createdAt));

  return rows.map((r) => ({
    id:        r.id,
    name:      r.name,
    filename:  r.filename,
    mimeType:  r.mimeType,
    sizeBytes: r.sizeBytes,
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * Generates a 60-second signed download URL for a personnel document.
 * Validates that the document belongs to the caller's personnel record
 * before issuing the signed URL.
 */
export async function getMyDocumentDownloadUrl(
  documentId: string,
): Promise<{ success: true; url: string } | { success: false; message: string }> {
  const personnelId = await getPersonnelId();
  if (!personnelId) return { success: false, message: "Niet geauthenticeerd." };

  const [doc] = await db
    .select({ storagePath: documentsTable.storagePath })
    .from(documentsTable)
    .where(
      and(
        eq(documentsTable.id, documentId),
        eq(documentsTable.entityType, "personnel"),
        eq(documentsTable.entityId, personnelId),
      ),
    )
    .limit(1);

  if (!doc) return { success: false, message: "Document niet gevonden." };

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from("documents")
    .createSignedUrl(doc.storagePath, 60);

  if (error || !data?.signedUrl) {
    return { success: false, message: "Download-link aanmaken mislukt." };
  }

  return { success: true, url: data.signedUrl };
}
