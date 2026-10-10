import { z } from "zod";

export const knowledgeWorkspaces = ["platform", "backoffice", "staff", "customer"] as const;
export const knowledgeWorkspaceSchema = z.enum(knowledgeWorkspaces);
export type KnowledgeWorkspace = z.infer<typeof knowledgeWorkspaceSchema>;
export const knowledgeLabels: Record<KnowledgeWorkspace, string> = { platform: "Platformbeheer", backoffice: "Tenantbeheer", staff: "Personeel", customer: "Klanten" };
export const knowledgePaths: Record<KnowledgeWorkspace, string> = { platform: "/platform/kennisbank", backoffice: "/app/kennisbank", staff: "/staff/kennisbank", customer: "/klant/kennisbank" };
export const knowledgeSlug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120);
export const knowledgeContentSchema = z.object({
  title: z.string().trim().min(5).max(180), summary: z.string().trim().min(30).max(600),
  body: z.string().trim().min(100).max(60000), category: z.string().trim().min(2).max(80),
  tags: z.array(z.string().trim().min(2).max(60)).max(20),
  audiences: z.array(knowledgeWorkspaceSchema).min(1).max(4).refine(a => new Set(a).size === a.length),
  related: z.array(knowledgeSlug).max(12),
}).strict();
export type KnowledgeContent = z.infer<typeof knowledgeContentSchema>;
export const knowledgeCardSchema = knowledgeContentSchema.omit({ body: true, related: true }).extend({
  slug: knowledgeSlug, revision: z.number().int(), updatedAt: z.string(), publication: z.enum(["draft", "published", "archived"]),
  excerpt: z.string(), readingMinutes: z.number(),
});
export const knowledgeArticleSchema = knowledgeCardSchema.extend({ body: z.string(), related: z.array(knowledgeCardSchema),
  relatedSlugs: z.array(knowledgeSlug).optional(), history: z.array(z.object({ revision: z.number(), action: z.string(), createdAt: z.string() })).optional(),
});
export type KnowledgeArticle = z.infer<typeof knowledgeArticleSchema>;
export type KnowledgeCard = z.infer<typeof knowledgeCardSchema>;
export const knowledgeListSchema = z.object({ items: z.array(knowledgeCardSchema), total: z.number(), page: z.number(), pageSize: z.number(), categories: z.array(z.object({ name: z.string(), count: z.number() })), canManage: z.boolean() });
export type KnowledgeList = z.infer<typeof knowledgeListSchema>;
export const knowledgeQuerySchema = z.object({ search: z.string().trim().max(160).default(""), category: z.string().max(80).default(""), portal: z.union([z.literal(""), knowledgeWorkspaceSchema]).default(""), publication: z.enum(["", "draft", "published", "archived"]).default(""), page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(5).max(100).default(12) }).strict();
export const knowledgeSaveSchema = z.object({ slug: knowledgeSlug, revision: z.number().int().min(0), content: knowledgeContentSchema }).strict();
export const knowledgeCommandSchema = z.discriminatedUnion("command", [
  z.object({ command: z.literal("save"), payload: knowledgeSaveSchema }),
  z.object({ command: z.enum(["publish", "archive"]), payload: z.object({ slug: knowledgeSlug, revision: z.number().int().positive() }).strict() }),
  z.object({ command: z.literal("restore"), payload: z.object({ slug: knowledgeSlug, revision: z.number().int().positive(), sourceRevision: z.number().int().positive() }).strict() }),
]);

/** Only local article paths and ordinary HTTPS links. Never render raw HTML. */
export function safeKnowledgeHref(value: string): string | null {
  if (/^\/(?:platform|app|staff|klant)\/kennisbank(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?(?:#[a-z0-9-]+)?$/.test(value)) return value;
  if (/^#[a-z0-9-]+$/.test(value)) return value;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export function headingAnchor(title: string, position: number) { return `${position}-${title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`; }
