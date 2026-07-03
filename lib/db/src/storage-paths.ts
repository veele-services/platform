const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const URL_SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:\/\//iu;

export const FIELDGRID_STORAGE_TENANT_ROOT = "tenant";

export type TenantStoragePathOptions = {
  allowLegacyTenantRoot?: boolean;
};

export function normalizeStoragePath(path: string): string | null {
  const normalized = path.trim().replace(/^\/+/, "");
  if (!normalized) return null;
  if (URL_SCHEME_PATTERN.test(normalized)) return null;
  if (normalized.includes("\\")) return null;

  const segments = normalized.split("/");
  if (segments.some((segment) => segment.trim() === "" || segment === "." || segment === "..")) {
    return null;
  }

  return segments.join("/");
}

export function isValidTenantStorageId(tenantId: string): boolean {
  return UUID_PATTERN.test(tenantId);
}

export function toSafeStorageSegment(value: string, fallback = "item"): string {
  const safe = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 120);

  return safe || fallback;
}

export function buildTenantStoragePath(tenantId: string, parts: string[]): string {
  if (!isValidTenantStorageId(tenantId)) {
    throw new Error("Invalid tenant id for storage path.");
  }

  const safeParts = parts.map((part) => toSafeStorageSegment(part)).filter(Boolean);
  return [FIELDGRID_STORAGE_TENANT_ROOT, tenantId, ...safeParts].join("/");
}

export function getTenantBoundStoragePath(
  path: string,
  tenantId: string,
  options: TenantStoragePathOptions = {},
): string | null {
  if (!isValidTenantStorageId(tenantId)) return null;

  const normalized = normalizeStoragePath(path);
  if (!normalized) return null;

  const canonicalPrefix = `${FIELDGRID_STORAGE_TENANT_ROOT}/${tenantId}/`;
  if (normalized.startsWith(canonicalPrefix)) return normalized;

  if (options.allowLegacyTenantRoot && normalized.startsWith(`${tenantId}/`)) {
    return normalized;
  }

  return null;
}

export function isCanonicalTenantStoragePath(path: string, tenantId: string): boolean {
  const normalized = normalizeStoragePath(path);
  return Boolean(
    normalized && isValidTenantStorageId(tenantId) && normalized.startsWith(`${FIELDGRID_STORAGE_TENANT_ROOT}/${tenantId}/`),
  );
}
