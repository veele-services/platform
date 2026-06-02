import {
  pgTable,
  uuid,
  timestamp,
  primaryKey,
} from "drizzle-orm/pg-core";
import { objectsTable } from "./objects";
import { personnelTable } from "./personnel";

export const objectPersonnelTable = pgTable(
  "object_personnel",
  {
    objectId:    uuid("object_id").notNull().references(() => objectsTable.id,    { onDelete: "cascade" }),
    personnelId: uuid("personnel_id").notNull().references(() => personnelTable.id, { onDelete: "cascade" }),
    linkedAt:    timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.objectId, t.personnelId] })],
);
