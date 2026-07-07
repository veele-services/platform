import {
  boolean,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export const tenantEmailTemplateOverridesTable = pgTable(
  "tenant_email_template_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    templateKey: varchar("template_key", { length: 120 }).notNull(),
    isEnabled: boolean("is_enabled").notNull().default(true),
    subjectTemplate: text("subject_template"),
    preheaderTemplate: text("preheader_template"),
    headlineTemplate: text("headline_template"),
    introTemplate: text("intro_template"),
    ctaLabelTemplate: text("cta_label_template"),
    ctaUrlTemplate: text("cta_url_template"),
    footerNoteTemplate: text("footer_note_template"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid("updated_by"),
  },
  (table) => ({
    tenantTemplateIdx: uniqueIndex("tenant_email_template_overrides_tenant_template_idx").on(
      table.tenantId,
      table.templateKey,
    ),
  }),
);

export type TenantEmailTemplateOverride = typeof tenantEmailTemplateOverridesTable.$inferSelect;
export type NewTenantEmailTemplateOverride = typeof tenantEmailTemplateOverridesTable.$inferInsert;
