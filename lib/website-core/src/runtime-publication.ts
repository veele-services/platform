import { z } from "zod/v4";
import {
  WEBSITE_PUBLICATION_SCHEMA_VERSION,
  websitePublicationRedirectSchema,
  websitePublicationSnapshotSchema,
  type WebsitePublicationSnapshot,
} from "./publication";
import { websiteSectionSchema } from "./sections";
import {
  websiteContactSchema,
  websiteSeoSchema,
  websiteSocialLinkSchema,
  websiteThemeSchema,
} from "./site";
import { WEBSITE_PAGE_TYPES } from "./templates";
import { websiteCanonicalPathSchema } from "./redirects";
import {
  EMPTY_WEBSITE_PUBLICATION_BLOG,
  websitePublicationBlogSchema,
} from "./blog";
import { websitePublicationFormsSchema } from "./forms";

const publicPathSchema = websiteCanonicalPathSchema;

const externalHttpsUrlSchema = z
  .string()
  .url()
  .max(2_048)
  .refine(
    (value) => new URL(value).protocol === "https:",
    "Only HTTPS navigation URLs are allowed",
  );

const runtimePageSchema = z
  .object({
    id: z.string().uuid(),
    locale: z.string().regex(/^[a-z]{2}-[A-Z]{2}$/u),
    path: publicPathSchema,
    pageType: z.enum(WEBSITE_PAGE_TYPES),
    title: z.string().trim().min(1).max(180),
    seo: websiteSeoSchema,
    sections: z.array(z.unknown()).max(100),
  })
  .strict();

const runtimeNavigationItemSchema = z
  .object({
    id: z.string().uuid(),
    label: z.string().trim().min(1).max(180),
    location: z.enum(["header", "footer_primary", "footer_legal"]),
    parentId: z.string().uuid().nullable(),
    linkType: z.enum(["page", "external", "dropdown"]),
    pageId: z.string().uuid().nullable(),
    href: z.union([publicPathSchema, externalHttpsUrlSchema]).nullable(),
    target: z.enum(["self", "blank"]),
    position: z.number().int().nonnegative(),
  })
  .strict();

const runtimePublicationEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(WEBSITE_PUBLICATION_SCHEMA_VERSION),
    siteId: z.string().uuid(),
    deliveryRevision: z.number().int().positive(),
    canonicalHostname: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/u)
      .refine((value) => value.includes(".") && !value.includes(".."))
      .max(253),
    defaultLocale: z.string().regex(/^[a-z]{2}-[A-Z]{2}$/u),
    theme: websiteThemeSchema,
    contact: websiteContactSchema,
    socialLinks: z.array(websiteSocialLinkSchema).max(8),
    defaultSeo: websiteSeoSchema,
    pages: z.array(runtimePageSchema).min(1).max(1_000),
    navigation: z.array(runtimeNavigationItemSchema).max(500),
    redirects: z.array(websitePublicationRedirectSchema).max(1_000).default([]),
    blog: websitePublicationBlogSchema.default(EMPTY_WEBSITE_PUBLICATION_BLOG),
    forms: websitePublicationFormsSchema,
  })
  .strict();

export type RuntimePublicationDiagnostic = {
  code: "invalid_envelope" | "invalid_section" | "hidden_section";
  pageId?: string;
  sectionIndex?: number;
};

export type RuntimePublicationParseResult =
  | {
      success: true;
      snapshot: WebsitePublicationSnapshot;
      diagnostics: RuntimePublicationDiagnostic[];
    }
  | {
      success: false;
      diagnostics: RuntimePublicationDiagnostic[];
    };

/**
 * Parses an immutable publication at the public trust boundary. The envelope
 * remains fail-closed, while an individual malformed or no-longer-supported
 * section is omitted without exposing its payload or taking down other pages.
 */
export function parseWebsitePublicationForRuntime(
  input: unknown,
): RuntimePublicationParseResult {
  const envelope = runtimePublicationEnvelopeSchema.safeParse(input);
  if (!envelope.success) {
    return {
      success: false,
      diagnostics: [{ code: "invalid_envelope" }],
    };
  }

  const diagnostics: RuntimePublicationDiagnostic[] = [];
  const pages = envelope.data.pages.map((page) => ({
    ...page,
    sections: page.sections.flatMap((section, sectionIndex) => {
      const parsed = websiteSectionSchema.safeParse(section);
      if (!parsed.success) {
        diagnostics.push({
          code: "invalid_section",
          pageId: page.id,
          sectionIndex,
        });
        return [];
      }
      if (!parsed.data.visible) {
        diagnostics.push({
          code: "hidden_section",
          pageId: page.id,
          sectionIndex,
        });
        return [];
      }
      return [parsed.data];
    }),
  }));

  const snapshot = websitePublicationSnapshotSchema.safeParse({
    ...envelope.data,
    pages,
  });
  if (!snapshot.success) {
    return {
      success: false,
      diagnostics: [{ code: "invalid_envelope" }, ...diagnostics],
    };
  }

  return { success: true, snapshot: snapshot.data, diagnostics };
}
