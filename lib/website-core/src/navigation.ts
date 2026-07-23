import { z } from "zod/v4";

export const WEBSITE_NAVIGATION_LOCATIONS = [
  "header",
  "footer_primary",
  "footer_legal",
] as const;

export const WEBSITE_NAVIGATION_LINK_TYPES = [
  "page",
  "external",
  "dropdown",
] as const;

export const WEBSITE_NAVIGATION_TARGETS = ["self", "blank"] as const;

const navigationIdSchema = z.string().uuid();

export const websiteExternalNavigationHrefSchema = z
  .string()
  .trim()
  .url("Vul een geldige URL in")
  .max(2_048)
  .superRefine((value, context) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return;
    }
    if (url.protocol !== "https:") {
      context.addIssue({
        code: "custom",
        message: "Externe navigatie moet HTTPS gebruiken",
      });
    }
    if (url.username || url.password) {
      context.addIssue({
        code: "custom",
        message: "Externe navigatie mag geen gebruikersgegevens bevatten",
      });
    }
  });

export const websiteNavigationDraftItemSchema = z
  .object({
    id: navigationIdSchema,
    label: z.string().trim().min(1).max(180),
    location: z.enum(WEBSITE_NAVIGATION_LOCATIONS),
    parentId: navigationIdSchema.nullable(),
    pageId: navigationIdSchema.nullable(),
    linkType: z.enum(WEBSITE_NAVIGATION_LINK_TYPES),
    href: z.string().trim().max(2_048).nullable(),
    target: z.enum(WEBSITE_NAVIGATION_TARGETS),
    isVisible: z.boolean(),
  })
  .strict()
  .superRefine((item, context) => {
    if (
      item.linkType === "page" &&
      (!item.pageId || item.href !== null || item.target !== "self")
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Een interne link vereist één pagina, geen vrije URL en opent in hetzelfde venster",
        path: ["pageId"],
      });
    }
    if (item.linkType === "external") {
      if (item.pageId || !item.href) {
        context.addIssue({
          code: "custom",
          message: "Een externe link vereist één HTTPS-URL en geen pagina",
          path: ["href"],
        });
      } else {
        const parsed = websiteExternalNavigationHrefSchema.safeParse(item.href);
        if (!parsed.success) {
          for (const issue of parsed.error.issues) {
            context.addIssue({
              code: "custom",
              message: issue.message,
              path: ["href", ...issue.path],
            });
          }
        }
      }
    }
    if (
      item.linkType === "dropdown" &&
      (item.parentId ||
        item.pageId ||
        item.href !== null ||
        item.target !== "self")
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Een menugroep staat op het hoogste niveau en heeft geen bestemming",
        path: ["linkType"],
      });
    }
  });

function destinationIdentity(
  item: z.infer<typeof websiteNavigationDraftItemSchema>,
): string | null {
  if (item.linkType === "page") return `page:${item.pageId}`;
  if (item.linkType === "external" && item.href) {
    try {
      return `external:${new URL(item.href).toString()}`;
    } catch {
      return null;
    }
  }
  return null;
}

export const websiteNavigationDraftSchema = z
  .array(websiteNavigationDraftItemSchema)
  .max(500)
  .superRefine((items, context) => {
    const byId = new Map<string, (typeof items)[number]>();
    const siblingLabels = new Set<string>();
    const siblingDestinations = new Set<string>();
    const locationCounts = new Map<string, number>();

    for (const [index, item] of items.entries()) {
      if (byId.has(item.id)) {
        context.addIssue({
          code: "custom",
          message: "Navigatie-ID komt dubbel voor",
          path: [index, "id"],
        });
      }
      byId.set(item.id, item);

      const count = (locationCounts.get(item.location) ?? 0) + 1;
      locationCounts.set(item.location, count);
      if (count > 500) {
        context.addIssue({
          code: "custom",
          message: "Een menu mag maximaal 500 onderdelen bevatten",
          path: [index, "location"],
        });
      }

      const siblingKey = `${item.location}:${item.parentId ?? "root"}`;
      const labelKey = `${siblingKey}:${item.label.toLocaleLowerCase("nl-NL")}`;
      if (siblingLabels.has(labelKey)) {
        context.addIssue({
          code: "custom",
          message: "Labels binnen hetzelfde menuniveau moeten uniek zijn",
          path: [index, "label"],
        });
      }
      siblingLabels.add(labelKey);

      const destination = destinationIdentity(item);
      if (destination) {
        const destinationKey = `${siblingKey}:${destination}`;
        if (siblingDestinations.has(destinationKey)) {
          context.addIssue({
            code: "custom",
            message:
              "Dezelfde bestemming mag binnen één menuniveau maar één keer voorkomen",
            path: [index, item.linkType === "page" ? "pageId" : "href"],
          });
        }
        siblingDestinations.add(destinationKey);
      }
    }

    for (const [index, item] of items.entries()) {
      if (!item.parentId) continue;
      const parent = byId.get(item.parentId);
      if (!parent) {
        context.addIssue({
          code: "custom",
          message: "Bovenliggend menuonderdeel bestaat niet",
          path: [index, "parentId"],
        });
        continue;
      }
      if (parent.location !== item.location) {
        context.addIssue({
          code: "custom",
          message: "Bovenliggend onderdeel moet in hetzelfde menu staan",
          path: [index, "parentId"],
        });
      }
      if (parent.parentId) {
        context.addIssue({
          code: "custom",
          message: "Navigatie ondersteunt maximaal twee niveaus",
          path: [index, "parentId"],
        });
      }
      if (item.linkType === "dropdown") {
        context.addIssue({
          code: "custom",
          message: "Een submenu kan niet opnieuw een menugroep zijn",
          path: [index, "linkType"],
        });
      }
      if (item.isVisible && !parent.isVisible) {
        context.addIssue({
          code: "custom",
          message: "Een zichtbaar submenu vereist een zichtbaar hoofdonderdeel",
          path: [index, "isVisible"],
        });
      }
    }
  });

export type WebsiteNavigationDraftItem = z.infer<
  typeof websiteNavigationDraftItemSchema
>;

export function positionWebsiteNavigationItems(
  rawItems: z.input<typeof websiteNavigationDraftSchema>,
): Array<WebsiteNavigationDraftItem & { position: number }> {
  const items = websiteNavigationDraftSchema.parse(rawItems);
  return WEBSITE_NAVIGATION_LOCATIONS.flatMap((location) => {
    const roots = items.filter(
      (item) => item.location === location && !item.parentId,
    );
    return roots
      .flatMap((root) => [
        root,
        ...items.filter(
          (item) => item.location === location && item.parentId === root.id,
        ),
      ])
      .map((item, position) => ({ ...item, position }));
  });
}
