import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { objectsTable } from "./objects";

export const objectContactsTable = pgTable("object_contacts", {
  id:        uuid("id").primaryKey().defaultRandom(),
  objectId:  uuid("object_id").notNull().references(() => objectsTable.id, { onDelete: "cascade" }),

  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName:  varchar("last_name",  { length: 100 }).notNull(),
  function:  varchar("function",   { length: 100 }),
  phone:     varchar("phone",      { length: 50 }),
  email:     varchar("email",      { length: 255 }),
  isPrimary: boolean("is_primary").notNull().default(false),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertObjectContactSchema = createInsertSchema(objectContactsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectObjectContactSchema = createSelectSchema(objectContactsTable);
export const updateObjectContactSchema  = insertObjectContactSchema.partial();

export type InsertObjectContact = z.infer<typeof insertObjectContactSchema>;
export type UpdateObjectContact = z.infer<typeof updateObjectContactSchema>;
export type ObjectContact       = z.infer<typeof selectObjectContactSchema>;
