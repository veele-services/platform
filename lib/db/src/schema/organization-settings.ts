import { pgTable, uuid, varchar, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const organizationSettingsTable = pgTable("organization_settings", {
  id:                 uuid("id").primaryKey().defaultRandom(),
  naam:               varchar("naam", { length: 200 }).notNull().default(""),
  adres:              text("adres"),
  kvkNummer:          varchar("kvk_nummer", { length: 20 }),
  btwNummer:          varchar("btw_nummer", { length: 30 }),
  logoUrl:            text("logo_url"),
  betaaltermijnDagen: integer("betaaltermijn_dagen").notNull().default(30),
  emailAfzender:      varchar("email_afzender", { length: 200 }),
  updatedAt:          timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy:          uuid("updated_by"),
});

export const updateOrganizationSettingsSchema = createInsertSchema(organizationSettingsTable)
  .omit({ id: true, updatedAt: true, updatedBy: true })
  .extend({
    naam:               z.string().max(200).optional().default(""),
    kvkNummer:          z.string().max(20).nullable().optional(),
    btwNummer:          z.string().max(30).nullable().optional(),
    adres:              z.string().nullable().optional(),
    logoUrl:            z.string().nullable().optional(),
    betaaltermijnDagen: z.number().int().min(1).max(365).optional().default(30),
    emailAfzender:      z.string().max(200).nullable().optional(),
  });

export type OrganizationSettings = typeof organizationSettingsTable.$inferSelect;
export type UpdateOrganizationSettings = z.infer<typeof updateOrganizationSettingsSchema>;
