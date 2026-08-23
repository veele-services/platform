"use server";

import { db } from "@workspace/db";
import {
  assignmentsTable,
  customersTable,
  documentsTable,
  objectsTable,
  getTenantBoundStoragePath,
  type DocumentEntityType,
} from "@workspace/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getMyCustomerIdentity } from "./customer";
import { createAdminClient } from "@/lib/supabase/admin";

type CustomerVisibleDocumentEntityType = Extract<
  DocumentEntityType,
  "customer" | "object" | "assignment"
>;

export type CustomerDocument = {
  id: string;
  name: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  entityType: CustomerVisibleDocumentEntityType;
  entityId: string | null;
  entityLabel: string;
  objectId: string | null;
  objectName: string | null;
  assignmentId: string | null;
  assignmentCode: string | null;
  assignmentTitle: string | null;
  createdAt: string;
};

type DocumentRow = {
  id: string;
  name: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  entityType: CustomerVisibleDocumentEntityType;
  entityId: string | null;
  entityLabel: string;
  objectId: string | null;
  objectName: string | null;
  assignmentId: string | null;
  assignmentCode: string | null;
  assignmentTitle: string | null;
  createdAt: Date;
};

function mapDocument(row: DocumentRow): CustomerDocument {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getMyDocuments(): Promise<CustomerDocument[]> {
  const identity = await getMyCustomerIdentity();
  if (!identity) return [];

  const [customerDocuments, objectDocuments, assignmentDocuments] =
    await Promise.all([
      db
        .select({
          id: documentsTable.id,
          name: documentsTable.name,
          filename: documentsTable.filename,
          mimeType: documentsTable.mimeType,
          sizeBytes: documentsTable.sizeBytes,
          entityType: documentsTable.entityType,
          entityId: documentsTable.entityId,
          entityLabel: customersTable.name,
          objectId: sql<string | null>`null`,
          objectName: sql<string | null>`null`,
          assignmentId: sql<string | null>`null`,
          assignmentCode: sql<string | null>`null`,
          assignmentTitle: sql<string | null>`null`,
          createdAt: documentsTable.createdAt,
        })
        .from(documentsTable)
        .innerJoin(
          customersTable,
          eq(customersTable.id, documentsTable.entityId),
        )
        .where(
          and(
            eq(documentsTable.entityType, "customer"),
            eq(documentsTable.entityId, identity.customerId),
            eq(documentsTable.tenantId, identity.tenantId),
            eq(customersTable.tenantId, identity.tenantId),
          ),
        )
        .orderBy(desc(documentsTable.createdAt)),
      db
        .select({
          id: documentsTable.id,
          name: documentsTable.name,
          filename: documentsTable.filename,
          mimeType: documentsTable.mimeType,
          sizeBytes: documentsTable.sizeBytes,
          entityType: documentsTable.entityType,
          entityId: documentsTable.entityId,
          entityLabel: objectsTable.name,
          objectId: objectsTable.id,
          objectName: objectsTable.name,
          assignmentId: sql<string | null>`null`,
          assignmentCode: sql<string | null>`null`,
          assignmentTitle: sql<string | null>`null`,
          createdAt: documentsTable.createdAt,
        })
        .from(documentsTable)
        .innerJoin(objectsTable, eq(objectsTable.id, documentsTable.entityId))
        .where(
          and(
            eq(documentsTable.entityType, "object"),
            eq(documentsTable.tenantId, identity.tenantId),
            eq(objectsTable.customerId, identity.customerId),
            eq(objectsTable.tenantId, identity.tenantId),
          ),
        )
        .orderBy(desc(documentsTable.createdAt)),
      db
        .select({
          id: documentsTable.id,
          name: documentsTable.name,
          filename: documentsTable.filename,
          mimeType: documentsTable.mimeType,
          sizeBytes: documentsTable.sizeBytes,
          entityType: documentsTable.entityType,
          entityId: documentsTable.entityId,
          entityLabel: assignmentsTable.title,
          objectId: objectsTable.id,
          objectName: objectsTable.name,
          assignmentId: assignmentsTable.id,
          assignmentCode: assignmentsTable.code,
          assignmentTitle: assignmentsTable.title,
          createdAt: documentsTable.createdAt,
        })
        .from(documentsTable)
        .innerJoin(
          assignmentsTable,
          eq(assignmentsTable.id, documentsTable.entityId),
        )
        .leftJoin(objectsTable, eq(assignmentsTable.objectId, objectsTable.id))
        .where(
          and(
            eq(documentsTable.entityType, "assignment"),
            eq(documentsTable.tenantId, identity.tenantId),
            eq(assignmentsTable.customerId, identity.customerId),
            eq(assignmentsTable.tenantId, identity.tenantId),
          ),
        )
        .orderBy(desc(documentsTable.createdAt)),
    ]);

  return [...customerDocuments, ...objectDocuments, ...assignmentDocuments]
    .filter(
      (row): row is DocumentRow =>
        row.entityType === "customer" ||
        row.entityType === "object" ||
        row.entityType === "assignment",
    )
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map(mapDocument);
}

async function canAccessDocumentEntity(input: {
  entityType: DocumentEntityType;
  entityId: string | null;
  tenantId: string;
  customerId: string;
}) {
  const { entityType, entityId, tenantId, customerId } = input;
  if (!entityId) return false;

  if (entityType === "customer") {
    const [row] = await db
      .select({ id: customersTable.id })
      .from(customersTable)
      .where(
        and(
          eq(customersTable.id, entityId),
          eq(customersTable.id, customerId),
          eq(customersTable.tenantId, tenantId),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  if (entityType === "object") {
    const [row] = await db
      .select({ id: objectsTable.id })
      .from(objectsTable)
      .where(
        and(
          eq(objectsTable.id, entityId),
          eq(objectsTable.customerId, customerId),
          eq(objectsTable.tenantId, tenantId),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  if (entityType === "assignment") {
    const [row] = await db
      .select({ id: assignmentsTable.id })
      .from(assignmentsTable)
      .where(
        and(
          eq(assignmentsTable.id, entityId),
          eq(assignmentsTable.customerId, customerId),
          eq(assignmentsTable.tenantId, tenantId),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  return false;
}

export async function getDocumentDownloadUrl(
  documentId: string,
): Promise<
  { success: true; url: string } | { success: false; message: string }
> {
  const identity = await getMyCustomerIdentity();
  if (!identity) return { success: false, message: "Niet geauthenticeerd." };

  const [doc] = await db
    .select({
      storagePath: documentsTable.storagePath,
      entityType: documentsTable.entityType,
      entityId: documentsTable.entityId,
    })
    .from(documentsTable)
    .where(
      and(
        eq(documentsTable.id, documentId),
        eq(documentsTable.tenantId, identity.tenantId),
        inArray(documentsTable.entityType, [
          "customer",
          "object",
          "assignment",
        ]),
      ),
    )
    .limit(1);

  if (!doc) return { success: false, message: "Document niet gevonden." };

  const allowed = await canAccessDocumentEntity({
    entityType: doc.entityType,
    entityId: doc.entityId,
    tenantId: identity.tenantId,
    customerId: identity.customerId,
  });

  if (!allowed) return { success: false, message: "Document niet gevonden." };

  const storagePath = getTenantBoundStoragePath(
    doc.storagePath,
    identity.tenantId,
    {
      allowLegacyTenantRoot: true,
    },
  );
  if (!storagePath) {
    return {
      success: false,
      message:
        "Deze download-link is niet meer beschikbaar. Vraag via Support om een nieuwe link.",
    };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from("documents")
    .createSignedUrl(storagePath, 3600);

  if (error || !data?.signedUrl) {
    return {
      success: false,
      message:
        "Deze download-link is verlopen of tijdelijk niet beschikbaar. Probeer opnieuw of neem contact op met Support.",
    };
  }

  return { success: true, url: data.signedUrl };
}
