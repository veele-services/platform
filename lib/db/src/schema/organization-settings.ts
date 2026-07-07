import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const organizationSettingsTable = pgTable("organization_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
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
  planningWorkdayStart: varchar("planning_workday_start", { length: 5 })
    .notNull()
    .default("08:00"),
  planningTimeSlotMinutes: integer("planning_time_slot_minutes")
    .notNull()
    .default(90),
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
  emailTransport: varchar("email_transport", { length: 20 })
    .notNull()
    .default("platform"),
  emailApiProvider: varchar("email_api_provider", { length: 40 })
    .notNull()
    .default("resend"),
  emailApiKeyEncrypted: text("email_api_key_encrypted"),
  emailApiSendingDomain: varchar("email_api_sending_domain", { length: 255 }),
  emailApiKeyUpdatedAt: timestamp("email_api_key_updated_at", { withTimezone: true }),
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
  kbTenantAuthoringEnabled: boolean("kb_tenant_authoring_enabled")
    .notNull()
    .default(false),
  roadmapPersonnelRequestsEnabled: boolean("roadmap_personnel_requests_enabled")
    .notNull()
    .default(false),
  roadmapCustomerRequestsEnabled: boolean("roadmap_customer_requests_enabled")
    .notNull()
    .default(false),

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
    planningWorkdayStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().default("08:00"),
    planningTimeSlotMinutes: z.number().int().min(15).max(240).optional().default(90),
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
    emailTransport: z.enum(["platform", "smtp", "api"]).optional(),
    emailApiProvider: z.enum(["resend"]).optional(),
    emailApiKeyEncrypted: z.string().nullable().optional(),
    emailApiSendingDomain: z.string().max(255).nullable().optional(),
    emailApiKeyUpdatedAt: z.date().nullable().optional(),
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
    kbTenantAuthoringEnabled: z.boolean().optional(),
    roadmapPersonnelRequestsEnabled: z.boolean().optional(),
    roadmapCustomerRequestsEnabled: z.boolean().optional(),
  });

export type OrganizationSettings =
  typeof organizationSettingsTable.$inferSelect;
export type UpdateOrganizationSettings = z.infer<
  typeof updateOrganizationSettingsSchema
>;
