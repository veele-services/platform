import { pgTable, uuid, varchar, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type DocumentEntityType =
  | "assignment"
  | "customer"
  | "personnel"
  | "object"
  | "general";

export const DOCUMENT_ENTITY_TYPES: DocumentEntityType[] = [
  "assignment",
  "customer",
  "personnel",
  "object",
  "general",
];

export const documentsTable = pgTable("documents", {
  id:          uuid("id").primaryKey().defaultRandom(),
  name:        varchar("name", { length: 200 }).notNull(),
  filename:    varchar("filename", { length: 500 }).notNull(),
  mimeType:    varchar("mime_type", { length: 200 }).notNull(),
  storagePath: text("storage_path").notNull(),
  sizeBytes:   integer("size_bytes").notNull(),
  entityType:  varchar("entity_type", { length: 20 })
    .notNull()
    .default("general")
    .$type<DocumentEntityType>(),
  entityId:    uuid("entity_id"),
  uploadedBy:  uuid("uploaded_by").notNull(),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDocumentSchema = createInsertSchema(documentsTable).omit({
  id:        true,
  createdAt: true,
});

export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type SelectDocument = typeof documentsTable.$inferSelect;
