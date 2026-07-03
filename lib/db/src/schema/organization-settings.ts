import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { DEFAULT_TENANT_ID, tenantsTable } from "./tenants";

export const organizationSettingsTable = pgTable("organization_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .default(sql`'${sql.raw(DEFAULT_TENANT_ID)}'::uuid`)
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  naam: varchar("naam", { length: 200 }).notNull().default(""),
  adres: text("adres"),
  kvkNummer: varchar("kvk_nummer", { length: 20 }),
  btwNummer: varchar("btw_nummer", { length: 30 }),
  logoUrl: text("logo_url"),
  betaaltermijnDagen: integer("betaaltermijn_dagen").notNull().default(30),
  availabilityAdvanceDays: integer("availability_advance_days")
    .notNull()
    .default(60),
  emailAfzender: varchar("email_afzender", { length: 200 }),
  smtpEnabled: boolean("smtp_enabled").notNull().default(false),
  smtpHost: varchar("smtp_host", { length: 255 }),
  smtpPort: integer("smtp_port"),
  smtpEncryption: varchar("smtp_encryption", { length: 20 })
    .notNull()
    .default("starttls"),
  smtpUsername: varchar("smtp_username", { length: 255 }),
  smtpPassword: text("smtp_password"),
  smtpFromName: varchar("smtp_from_name", { length: 200 }),
  smtpFromEmail: varchar("smtp_from_email", { length: 255 }),
  smtpReplyTo: varchar("smtp_reply_to", { length: 255 }),
  emailTemplateBrandColor: varchar("email_template_brand_color", { length: 20 })
    .notNull()
    .default("#081D3A"),
  emailTemplateAccentColor: varchar("email_template_accent_color", { length: 20 })
    .notNull()
    .default("#00B7B3"),
  emailTemplateFooterText: text("email_template_footer_text")
    .notNull()
    .default("Dit is een automatisch bericht van Fieldgrid. U ontvangt dit bericht omdat u betrokken bent bij een aanvraag, opdracht, rapportage, factuur of portaalmelding."),
  emailTemplateSignature: text("email_template_signature")
    .notNull()
    .default("Met vriendelijke groet,\nFieldgrid"),

  // ── Notification toggles (all default to true) ──────────────────────────────
  notifRapportGoedgekeurd: boolean("notif_rapport_goedgekeurd")
    .notNull()
    .default(true),
  notifRapportAfgekeurd: boolean("notif_rapport_afgekeurd")
    .notNull()
    .default(true),
  notifOfferteVerstuurd: boolean("notif_offerte_verstuurd")
    .notNull()
    .default(true),
  notifOfferteVerlopen: boolean("notif_offerte_verlopen")
    .notNull()
    .default(true),
  notifBetalingHerinnering: boolean("notif_betaling_herinnering")
    .notNull()
    .default(true),
  /** Days after due date before a payment reminder is sent. */
  notifHerinneringDagen: integer("notif_herinnering_dagen")
    .notNull()
    .default(7),

  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedBy: uuid("updated_by"),
});

export const updateOrganizationSettingsSchema = createInsertSchema(
  organizationSettingsTable,
)
  .omit({ id: true, tenantId: true, updatedAt: true, updatedBy: true })
  .extend({
    naam: z.string().max(200).optional().default(""),
    kvkNummer: z.string().max(20).nullable().optional(),
    btwNummer: z.string().max(30).nullable().optional(),
    adres: z.string().nullable().optional(),
    logoUrl: z.string().nullable().optional(),
    betaaltermijnDagen: z.number().int().min(1).max(365).optional().default(30),
    availabilityAdvanceDays: z
      .number()
      .int()
      .min(7)
      .max(365)
      .optional()
      .default(60),
    emailAfzender: z.string().max(200).nullable().optional(),
    smtpEnabled: z.boolean().optional(),
    smtpHost: z.string().max(255).nullable().optional(),
    smtpPort: z.number().int().min(1).max(65535).nullable().optional(),
    smtpEncryption: z.enum(["none", "starttls", "tls"]).optional(),
    smtpUsername: z.string().max(255).nullable().optional(),
    smtpPassword: z.string().nullable().optional(),
    smtpFromName: z.string().max(200).nullable().optional(),
    smtpFromEmail: z.string().max(255).nullable().optional(),
    smtpReplyTo: z.string().max(255).nullable().optional(),
    emailTemplateBrandColor: z.string().max(20).optional(),
    emailTemplateAccentColor: z.string().max(20).optional(),
    emailTemplateFooterText: z.string().max(2000).optional(),
    emailTemplateSignature: z.string().max(2000).optional(),
    notifRapportGoedgekeurd: z.boolean().optional(),
    notifRapportAfgekeurd: z.boolean().optional(),
    notifOfferteVerstuurd: z.boolean().optional(),
    notifOfferteVerlopen: z.boolean().optional(),
    notifBetalingHerinnering: z.boolean().optional(),
    notifHerinneringDagen: z.number().int().min(1).max(90).optional(),
  });

export type OrganizationSettings =
  typeof organizationSettingsTable.$inferSelect;
export type UpdateOrganizationSettings = z.infer<
  typeof updateOrganizationSettingsSchema
>;
