const DEFAULT_HELP_BASE_URL = "https://fieldgrid.nl";

function normalizedBaseUrl(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return DEFAULT_HELP_BASE_URL;
  return trimmed.replace(/\/+$/, "");
}

export function fieldgridHelpBaseUrl(): string {
  return normalizedBaseUrl(
    process.env["FIELDGRID_HELP_URL"] ??
      process.env["NEXT_PUBLIC_FIELDGRID_HELP_URL"] ??
      process.env["FIELDGRID_ROOT_URL"] ??
      process.env["NEXT_PUBLIC_FIELDGRID_ROOT_URL"],
  );
}

export function normalizeKnowledgebaseTenantCode(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function knowledgebaseSupportPath(tenantCode: string, articleSlug: string): string {
  const normalizedTenantCode = normalizeKnowledgebaseTenantCode(tenantCode);
  const normalizedArticleSlug = articleSlug.trim();
  return `/h/${encodeURIComponent(normalizedTenantCode)}/${encodeURIComponent(normalizedArticleSlug)}`;
}

export function knowledgebaseSupportUrl(tenantCode: string, articleSlug: string): string {
  return `${fieldgridHelpBaseUrl()}${knowledgebaseSupportPath(tenantCode, articleSlug)}`;
}

export function knowledgebaseSupportUrlTemplate(articleSlug: string): string {
  return `${fieldgridHelpBaseUrl()}/h/{tenant-code}/${encodeURIComponent(articleSlug.trim())}`;
}
