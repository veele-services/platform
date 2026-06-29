"use server";

import { db } from "@workspace/db";
import { customersTable, documentsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { getMyCustomerIdentity } from "./customer";
import { createAdminClient } from "@/lib/supabase/admin";

export type CustomerDocument = {
  id:        string;
  name:      string;
  filename:  string;
  mimeType:  string;
  sizeBytes: number;
  createdAt: string;
};

export async function getMyDocuments(): Promise<CustomerDocument[]> {
  const identity = await getMyCustomerIdentity();
  if (!identity) return [];

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
    .innerJoin(customersTable, eq(customersTable.id, documentsTable.entityId))
    .where(
      and(
        eq(documentsTable.entityType, "customer"),
        eq(documentsTable.entityId, identity.customerId),
        eq(customersTable.tenantId, identity.tenantId),
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

export async function getDocumentDownloadUrl(
  documentId: string,
): Promise<{ success: true; url: string } | { success: false; message: string }> {
  const identity = await getMyCustomerIdentity();
  if (!identity) return { success: false, message: "Niet geauthenticeerd." };

  const [doc] = await db
    .select({ storagePath: documentsTable.storagePath })
    .from(documentsTable)
    .innerJoin(customersTable, eq(customersTable.id, documentsTable.entityId))
    .where(
      and(
        eq(documentsTable.id, documentId),
        eq(documentsTable.entityType, "customer"),
        eq(documentsTable.entityId, identity.customerId),
        eq(customersTable.tenantId, identity.tenantId),
      ),
    )
    .limit(1);

  if (!doc) return { success: false, message: "Document niet gevonden." };

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from("documents")
    .createSignedUrl(doc.storagePath, 3600);

  if (error || !data?.signedUrl) {
    return { success: false, message: "Download-link aanmaken mislukt." };
  }

  return { success: true, url: data.signedUrl };
}
