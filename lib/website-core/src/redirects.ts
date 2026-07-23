import { z } from "zod/v4";

export const WEBSITE_REDIRECT_STATUS_CODES = [301, 302, 308] as const;

const RESERVED_WEBSITE_PATH = /^\/(?:api|_next|health|preview|assets)(?:\/|$)/u;

export const websiteLocaleSchema = z.string().regex(/^[a-z]{2}-[A-Z]{2}$/u);

export const websiteCanonicalPathSchema = z
  .string()
  .trim()
  .max(500)
  .regex(/^\/(?:[a-z0-9_-]+(?:\/[a-z0-9_-]+)*)?$/u)
  .refine(
    (value) => !RESERVED_WEBSITE_PATH.test(value),
    "Dit pad is gereserveerd",
  );

export const websiteRedirectSourcePathSchema =
  websiteCanonicalPathSchema.refine(
    (value) => value !== "/",
    "De homepage kan geen redirectbron zijn",
  );

export const websiteRedirectExternalUrlSchema = z
  .string()
  .trim()
  .url()
  .max(2_048)
  .superRefine((value, context) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return;
    }
    if (url.protocol !== "https:" || url.username || url.password) {
      context.addIssue({
        code: "custom",
        message:
          "Alleen HTTPS-links zonder gebruikersnaam of wachtwoord zijn toegestaan",
      });
    }
  });

export const websiteRedirectStatusCodeSchema = z.union([
  z.literal(301),
  z.literal(302),
  z.literal(308),
]);

export const websiteRedirectDraftItemSchema = z
  .object({
    id: z.string().uuid(),
    locale: websiteLocaleSchema,
    sourcePath: websiteRedirectSourcePathSchema,
    destinationType: z.enum(["path", "external"]),
    destination: z.string().trim().min(1).max(2_048),
    statusCode: websiteRedirectStatusCodeSchema,
    isActive: z.boolean(),
  })
  .strict()
  .superRefine((redirect, context) => {
    const destination =
      redirect.destinationType === "path"
        ? websiteCanonicalPathSchema.safeParse(redirect.destination)
        : websiteRedirectExternalUrlSchema.safeParse(redirect.destination);
    if (!destination.success) {
      for (const issue of destination.error.issues) {
        context.addIssue({
          code: "custom",
          path: ["destination", ...issue.path],
          message: issue.message,
        });
      }
    }
    if (
      redirect.destinationType === "path" &&
      redirect.destination === redirect.sourcePath
    ) {
      context.addIssue({
        code: "custom",
        path: ["destination"],
        message: "Een redirect kan niet naar zichzelf verwijzen",
      });
    }
  });

export const websiteRedirectDraftSchema = z
  .array(websiteRedirectDraftItemSchema)
  .max(1_000)
  .superRefine((redirects, context) => {
    const ids = new Set<string>();
    const sources = new Set<string>();
    for (const [index, redirect] of redirects.entries()) {
      if (ids.has(redirect.id)) {
        context.addIssue({
          code: "custom",
          path: [index, "id"],
          message: "Redirect-ID's moeten uniek zijn",
        });
      }
      ids.add(redirect.id);

      const sourceKey = websiteRouteKey(redirect.locale, redirect.sourcePath);
      if (sources.has(sourceKey)) {
        context.addIssue({
          code: "custom",
          path: [index, "sourcePath"],
          message: "Een redirectbron moet per taal uniek zijn",
        });
      }
      sources.add(sourceKey);
    }

    const activeSources = new Set(
      redirects
        .filter((redirect) => redirect.isActive)
        .map((redirect) =>
          websiteRouteKey(redirect.locale, redirect.sourcePath),
        ),
    );
    for (const [index, redirect] of redirects.entries()) {
      if (
        redirect.isActive &&
        redirect.destinationType === "path" &&
        activeSources.has(
          websiteRouteKey(redirect.locale, redirect.destination),
        )
      ) {
        context.addIssue({
          code: "custom",
          path: [index, "destination"],
          message:
            "Redirectketens en -lussen zijn niet toegestaan; verwijs direct naar de eindpagina",
        });
      }
    }
  });

export const websitePathChangeDecisionSchema = z.enum([
  "create_redirect",
  "no_redirect",
]);

export function websiteRouteKey(locale: string, path: string): string {
  return `${locale}:${path}`;
}

export type WebsiteRedirectDraftItem = z.infer<
  typeof websiteRedirectDraftItemSchema
>;
export type WebsiteRedirectStatusCode = z.infer<
  typeof websiteRedirectStatusCodeSchema
>;
export type WebsitePathChangeDecision = z.infer<
  typeof websitePathChangeDecisionSchema
>;
