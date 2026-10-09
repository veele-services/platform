import { z } from "zod";
export const productWorkspaces = [
  "platform",
  "backoffice",
  "staff",
  "customer",
] as const;
export const productWorkspaceSchema = z.enum(productWorkspaces);
export type ProductWorkspace = z.infer<typeof productWorkspaceSchema>;
export const progressLabels = {
  research: "In onderzoek",
  planned: "Gepland",
  development: "In ontwikkeling",
  testing: "In test",
  released: "Uitgebracht",
  paused: "Gepauzeerd",
} as const;
export const ideaLabels = {
  draft: "Concept",
  received: "Ontvangen",
  review: "In beoordeling",
  information: "Aanvulling gevraagd",
  followup: "In opvolging",
  parked: "Geparkeerd",
  rejected: "Afgewezen",
  closed: "Afgesloten",
} as const;
export const publicationLabels = {
  draft: "Concept",
  published: "Gepubliceerd",
  archived: "Gearchiveerd",
} as const;
export const changeLabels = {
  new: "Nieuw",
  improved: "Verbeterd",
  fixed: "Opgelost",
} as const;
export const groupLabels = {
  management: "Management",
  staff: "Personeel",
  customer: "Klanten",
} as const;
const progress = z.enum([
  "research",
  "planned",
  "development",
  "testing",
  "released",
  "paused",
]);
const category = z.string().trim().min(1).max(80);
const title = z.string().trim().min(2).max(180);
const selection = {
  scope: z.enum(["internal", "all", "selected"]),
  tenants: z.array(z.uuid()).max(1000),
};
export const audienceSchema = z
  .object({
    ...selection,
    groups: z.array(z.enum(["management", "staff", "customer"])).max(3),
  })
  .strict()
  .superRefine((a, c) => {
    if (
      a.scope === "internal"
        ? a.tenants.length || a.groups.length
        : !a.groups.length ||
          (a.scope === "selected" ? !a.tenants.length : a.tenants.length)
    )
      c.addIssue({
        code: "custom",
        message: "Kies een complete, niet-lege doelgroep.",
      });
  });
export type ProductAudience = z.infer<typeof audienceSchema>;
export const internalAudience: ProductAudience = {
  scope: "internal",
  tenants: [],
  groups: [],
};
export const availabilityInputSchema = z
  .array(
    z
      .object({
        ...selection,
        environment: z.enum(["staging", "production"]),
        phased: z.boolean(),
      })
      .strict()
      .superRefine((a, c) => {
        if (a.scope === "selected" ? !a.tenants.length : a.tenants.length)
          c.addIssue({
            code: "custom",
            message: "Selecteer de beschikbare organisaties.",
          });
      }),
  )
  .max(2)
  .refine(
    (a) => new Set(a.map((v) => v.environment)).size === a.length,
    "Een registratie per omgeving.",
  );
export type AvailabilityInput = z.infer<typeof availabilityInputSchema>;
const availability = z.object({ staging: z.string(), production: z.string() });
export const productFileSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  mime: z.string(),
  size: z.number(),
});
const notes = z
  .array(z.object({ id: z.uuid(), body: z.string(), createdAt: z.string() }))
  .optional();
const audit = z
  .array(
    z.object({
      actor_id: z.uuid(),
      action: z.string(),
      detail: z.unknown(),
      created_at: z.string(),
    }),
  )
  .optional();
export const roadmapSchema = z.object({
  id: z.uuid(),
  title,
  summary: z.string(),
  body: z.string(),
  category,
  progress,
  planning: z.string(),
  revision: z.number(),
  publishedAt: z.string().nullable(),
  availability,
  publication: z.enum(["draft", "published", "archived"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  responsible: z.uuid().nullable().optional(),
  audience: audienceSchema.optional(),
  availabilityInput: availabilityInputSchema.optional(),
  updatedAt: z.string().optional(),
  notes,
  audit,
  linkedReleases: z
    .array(
      z.object({
        id: z.uuid(),
        title: z.string(),
        version: z.string(),
        changeTitle: z.string(),
      }),
    )
    .nullable()
    .optional(),
  linkedIdeas: z
    .array(
      z.object({ id: z.uuid(), title: z.string(), tenantName: z.string() }),
    )
    .nullable()
    .optional(),
});
export type RoadmapItem = z.infer<typeof roadmapSchema>;
export const releaseChangeSchema = z.object({
  id: z.uuid(),
  title,
  body: z.string(),
  kind: z.enum(["new", "improved", "fixed"]),
  category,
  position: z.number(),
  revision: z.number(),
  roadmap: roadmapSchema.nullable(),
  availability,
  files: z.array(productFileSchema),
  roadmapId: z.uuid().nullable().optional(),
  audience: audienceSchema.nullable().optional(),
  availabilityInput: availabilityInputSchema.optional(),
});
export type ReleaseChange = z.infer<typeof releaseChangeSchema>;
export const releaseSchema = z.object({
  id: z.uuid(),
  version: z.string(),
  title,
  intro: z.string(),
  publishedAt: z.string().nullable(),
  revision: z.number(),
  changes: z.array(releaseChangeSchema),
  publication: z.enum(["draft", "published", "archived"]).optional(),
  audience: audienceSchema.optional(),
  updatedAt: z.string().optional(),
  notes,
  audit,
  linkedIdeas: z.null().optional(),
});
export type ProductRelease = z.infer<typeof releaseSchema>;
export const ideaSchema = z.object({
  id: z.uuid(),
  title,
  category,
  problem: z.string(),
  suggestion: z.string(),
  benefit: z.string(),
  state: z.enum([
    "draft",
    "received",
    "review",
    "information",
    "followup",
    "parked",
    "rejected",
    "closed",
  ]),
  decision: z.string(),
  revision: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  roadmap: roadmapSchema.nullable(),
  files: z.array(productFileSchema),
  history: z.array(
    z.object({
      id: z.uuid(),
      state: z.enum([
        "draft",
        "received",
        "review",
        "information",
        "followup",
        "parked",
        "rejected",
        "closed",
      ]),
      createdAt: z.string(),
    }),
  ),
  messages: z.array(
    z.object({
      id: z.uuid(),
      body: z.string(),
      from: z.string(),
      createdAt: z.string(),
    }),
  ),
  tenantId: z.uuid().optional(),
  tenantName: z.string().optional(),
  createdBy: z.uuid().optional(),
  roadmapId: z.uuid().nullable().optional(),
  notes,
  audit,
  linkedIdeas: z.null().optional(),
});
export type ProductIdea = z.infer<typeof ideaSchema>;
export type ProductItem = ProductIdea | RoadmapItem | ProductRelease;
export type ProductSection = "ideas" | "roadmap" | "releases";
export const productListSchema = z.object({
  items: z.array(z.union([ideaSchema, roadmapSchema, releaseSchema])),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type ProductList = z.infer<typeof productListSchema>;
export const productOptionsSchema = z.object({
  tenants: z.array(z.object({ id: z.uuid(), name: z.string() })),
  owners: z.array(z.object({ id: z.uuid(), name: z.string() })),
});
export type ProductOptions = z.infer<typeof productOptionsSchema>;
export const querySchema = z
  .object({
    phase: z.enum(["", "planned", "development"]).default(""),
    search: z.string().max(160).default(""),
    status: z.string().max(30).default(""),
    category: z.string().max(80).default(""),
    publication: z.string().max(20).default(""),
    priority: z.string().max(20).default(""),
    scope: z.string().max(20).default(""),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(10).max(100).default(25),
  })
  .strict();
const reference = { id: z.uuid(), revision: z.number().int().min(1) };
const optionalReference = {
  id: z.uuid().optional(),
  revision: z.number().int().min(0).default(0),
};
export const roadmapInputSchema = z
  .object({
    ...optionalReference,
    title,
    summary: z.string().trim().min(1).max(600),
    body: z.string().max(20000),
    category,
    progress,
    priority: z.enum(["low", "normal", "high", "urgent"]),
    responsible: z.uuid().nullable(),
    planning: z.string().max(160),
    audience: audienceSchema,
    availability: availabilityInputSchema,
  })
  .strict();
const operations = [
  z.object({
    command: z.literal("submit_idea"),
    payload: z
      .object({
        title,
        category,
        problem: z.string().trim().min(10).max(20000),
        suggestion: z.string().max(12000),
        benefit: z.string().max(8000),
      })
      .strict(),
  }),
  z.object({
    command: z.enum(["save_roadmap", "convert_idea"]),
    payload: roadmapInputSchema,
  }),
  z.object({
    command: z.literal("save_release"),
    payload: z
      .object({
        ...optionalReference,
        version: z.string().trim().min(1).max(80),
        title,
        intro: z.string().max(4000),
        audience: audienceSchema,
      })
      .strict(),
  }),
  z.object({
    command: z.literal("save_change"),
    payload: z
      .object({
        id: z.uuid().optional(),
        revision: z.number().int().min(1),
        releaseId: z.uuid(),
        title,
        body: z.string().trim().min(1).max(20000),
        kind: z.enum(["new", "improved", "fixed"]),
        category,
        roadmapId: z.uuid().nullable(),
        audience: audienceSchema.nullable(),
        availability: availabilityInputSchema,
      })
      .strict(),
  }),
  z.object({
    command: z.literal("reorder_changes"),
    payload: z
      .object({
        releaseId: z.uuid(),
        revision: z.number().int().min(1),
        ids: z.array(z.uuid()).max(100),
      })
      .strict(),
  }),
  z.object({
    command: z.enum(["publish", "announce", "archive"]),
    payload: z
      .object({
        ...reference,
        kind: z.enum(["roadmap", "release"]),
        checked: z.boolean().default(false),
        inform: z.boolean().default(false),
      })
      .strict(),
  }),
  z.object({
    command: z.literal("idea_state"),
    payload: z
      .object({
        ...reference,
        state: z.enum([
          "review",
          "information",
          "followup",
          "parked",
          "rejected",
          "closed",
        ]),
        decision: z.string().max(8000),
      })
      .strict(),
  }),
  z.object({
    command: z.literal("idea_link"),
    payload: z.object({ ...reference, roadmapId: z.uuid() }).strict(),
  }),
  z.object({
    command: z.literal("reply"),
    payload: z
      .object({ ...reference, body: z.string().trim().min(1).max(12000) })
      .strict(),
  }),
  z.object({
    command: z.literal("note"),
    payload: z
      .object({
        id: z.uuid(),
        kind: z.enum(["idea", "roadmap", "release"]),
        body: z.string().trim().min(1).max(12000),
      })
      .strict(),
  }),
] as const;
export const productCommandSchema = z
  .object({
    workspace: productWorkspaceSchema,
    requestId: z.uuid(),
    operation: z.discriminatedUnion("command", operations),
  })
  .strict();
export type ProductOperation = z.infer<
  typeof productCommandSchema
>["operation"];
export type ProductActorSnapshot = {
  workspace: ProductWorkspace;
  actorKey: string;
  environment: "staging" | "production" | "local";
  access: {
    canManage: boolean;
    canSubmit: boolean;
  };
  options: ProductOptions;
  initial: {
    ideas: ProductList | null;
    roadmap: ProductList;
    releases: ProductList;
  };
};
export function audienceSummary(
  a: ProductAudience,
  tenants: ProductOptions["tenants"],
) {
  if (a.scope === "internal") return "Alleen intern bij Fieldgrid";
  return `Zichtbaar voor ${a.groups.map((g) => groupLabels[g]).join(" en ")} van ${a.scope === "all" ? "alle organisaties" : a.tenants.map((id) => tenants.find((t) => t.id === id)?.name ?? "geselecteerde organisatie").join(", ")}`;
}
