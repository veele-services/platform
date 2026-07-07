import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export const platformThemeSettingsTable = pgTable(
  "platform_theme_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    singletonKey: boolean("singleton_key").notNull().default(true),
    brandName: varchar("brand_name", { length: 120 }).notNull().default("Fieldgrid"),
    logoUrl: text("logo_url"),
    logoStoragePath: text("logo_storage_path"),
    faviconUrl: text("favicon_url"),
    faviconStoragePath: text("favicon_storage_path"),
    primaryColor: varchar("primary_color", { length: 20 }).notNull().default("#081D3A"),
    secondaryColor: varchar("secondary_color", { length: 20 }).notNull().default("#133D6B"),
    accentColor: varchar("accent_color", { length: 20 }).notNull().default("#00B7B3"),
    backgroundColor: varchar("background_color", { length: 20 }).notNull().default("#F8FAFC"),
    surfaceColor: varchar("surface_color", { length: 20 }).notNull().default("#FFFFFF"),
    textColor: varchar("text_color", { length: 20 }).notNull().default("#081D3A"),
    mutedColor: varchar("muted_color", { length: 20 }).notNull().default("#64748B"),
    fontFamily: varchar("font_family", { length: 60 }).notNull().default("inter"),
    headingFontFamily: varchar("heading_font_family", { length: 60 }).notNull().default("poppins"),
    borderRadius: varchar("border_radius", { length: 20 }).notNull().default("md"),
    density: varchar("density", { length: 20 }).notNull().default("comfortable"),
    emailFooterText: text("email_footer_text")
      .notNull()
      .default("Dit is een automatisch bericht van Fieldgrid. U ontvangt dit bericht omdat u betrokken bent bij een aanvraag, opdracht, rapportage, factuur of portaalmelding."),
    emailSignature: text("email_signature").notNull().default("Met vriendelijke groet,\nFieldgrid"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid("updated_by"),
  },
  (table) => [
    uniqueIndex("platform_theme_settings_singleton_idx").on(table.singletonKey),
  ],
);

export const tenantThemeSettingsTable = pgTable(
  "tenant_theme_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    useCustomTheme: boolean("use_custom_theme").notNull().default(false),
    brandName: varchar("brand_name", { length: 120 }),
    logoUrl: text("logo_url"),
    logoStoragePath: text("logo_storage_path"),
    faviconUrl: text("favicon_url"),
    faviconStoragePath: text("favicon_storage_path"),
    primaryColor: varchar("primary_color", { length: 20 }),
    secondaryColor: varchar("secondary_color", { length: 20 }),
    accentColor: varchar("accent_color", { length: 20 }),
    backgroundColor: varchar("background_color", { length: 20 }),
    surfaceColor: varchar("surface_color", { length: 20 }),
    textColor: varchar("text_color", { length: 20 }),
    mutedColor: varchar("muted_color", { length: 20 }),
    fontFamily: varchar("font_family", { length: 60 }),
    headingFontFamily: varchar("heading_font_family", { length: 60 }),
    borderRadius: varchar("border_radius", { length: 20 }),
    density: varchar("density", { length: 20 }),
    emailFooterText: text("email_footer_text"),
    emailSignature: text("email_signature"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid("updated_by"),
  },
  (table) => [
    uniqueIndex("tenant_theme_settings_tenant_idx").on(table.tenantId),
    index("tenant_theme_settings_enabled_idx").on(table.useCustomTheme),
  ],
);

export type PlatformThemeSettings = typeof platformThemeSettingsTable.$inferSelect;
export type TenantThemeSettings = typeof tenantThemeSettingsTable.$inferSelect;
