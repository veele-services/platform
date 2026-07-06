import type {
  FieldgridContentAudience,
  FieldgridContentScope,
  FieldgridContentStatus,
} from "./schema/knowledgebase";
import type { FieldgridModuleKey } from "./schema/modules";

export const FIELDGRID_CONTENT_SURFACES = [
  "platform_backoffice",
  "tenant_backoffice",
  "personnel_pwa",
  "customer_pwa",
] as const;

export type FieldgridContentSurface = (typeof FIELDGRID_CONTENT_SURFACES)[number];
export type FieldgridModuleVisibilityKey = FieldgridModuleKey | (string & {});

export type FieldgridContentVisibilityContext = {
  tenantId?: string | null;
  surface: FieldgridContentSurface;
  isPlatformAdmin?: boolean;
  audiences: readonly FieldgridContentAudience[];
  activeModuleKeys: readonly FieldgridModuleVisibilityKey[];
  permissionKeys: readonly string[];
};

export type FieldgridContentVisibilityTarget = {
  scope?: FieldgridContentScope | "global" | "tenant" | null;
  tenantId?: string | null;
  status?: FieldgridContentStatus | "published" | string | null;
  archivedAt?: Date | string | null;
  audienceKeys?: readonly FieldgridContentAudience[];
  moduleKeys?: readonly FieldgridModuleVisibilityKey[];
  requiredModuleKeys?: readonly FieldgridModuleVisibilityKey[];
  permissionKeys?: readonly string[];
};

export const DEFAULT_AUDIENCES_BY_SURFACE: Record<FieldgridContentSurface, readonly FieldgridContentAudience[]> = {
  platform_backoffice: ["platform_admin", "support"],
  tenant_backoffice: ["tenant_admin", "tenant_management", "tenant_planning", "tenant_administration"],
  personnel_pwa: ["tenant_personnel"],
  customer_pwa: ["tenant_customer"],
};

function hasIntersection<T extends string>(left: readonly T[], right: readonly T[]): boolean {
  if (left.length === 0 || right.length === 0) return false;
  const values = new Set(left);
  return right.some((value) => values.has(value));
}

function includesAll<T extends string>(available: readonly T[], required: readonly T[]): boolean {
  if (required.length === 0) return true;
  const values = new Set(available);
  return required.every((value) => values.has(value));
}

export function audiencesForSurface(surface: FieldgridContentSurface): readonly FieldgridContentAudience[] {
  return DEFAULT_AUDIENCES_BY_SURFACE[surface];
}

export function normalizeVisibilityContext(
  context: FieldgridContentVisibilityContext,
): FieldgridContentVisibilityContext {
  return {
    ...context,
    audiences: [...new Set([...audiencesForSurface(context.surface), ...context.audiences])],
    activeModuleKeys: [...new Set(context.activeModuleKeys)],
    permissionKeys: [...new Set(context.permissionKeys)],
  };
}

export function isPublishedVisibilityTarget(target: FieldgridContentVisibilityTarget): boolean {
  return target.status === "published" && !target.archivedAt;
}

export function matchesTenantScope(
  context: FieldgridContentVisibilityContext,
  target: FieldgridContentVisibilityTarget,
): boolean {
  if (context.isPlatformAdmin) return true;

  if (target.scope === "platform_global" || target.scope === "global" || !target.scope) {
    return true;
  }

  if (target.scope === "tenant") {
    return Boolean(context.tenantId && target.tenantId === context.tenantId);
  }

  return false;
}

export function matchesAudienceScope(
  context: FieldgridContentVisibilityContext,
  target: FieldgridContentVisibilityTarget,
): boolean {
  if (context.isPlatformAdmin) return true;
  if (!target.audienceKeys || target.audienceKeys.length === 0) return true;
  return hasIntersection(context.audiences, target.audienceKeys);
}

export function matchesModuleScope(
  context: FieldgridContentVisibilityContext,
  target: FieldgridContentVisibilityTarget,
): boolean {
  if (context.isPlatformAdmin) return true;

  const moduleKeys = target.moduleKeys ?? [];
  const requiredModuleKeys = target.requiredModuleKeys ?? [];

  if (!includesAll(context.activeModuleKeys, requiredModuleKeys)) return false;
  if (moduleKeys.length === 0) return true;

  return hasIntersection(context.activeModuleKeys, moduleKeys);
}

export function matchesPermissionScope(
  context: FieldgridContentVisibilityContext,
  target: FieldgridContentVisibilityTarget,
): boolean {
  if (context.isPlatformAdmin) return true;
  if (!target.permissionKeys || target.permissionKeys.length === 0) return true;
  return includesAll(context.permissionKeys, target.permissionKeys);
}

export function canReadPublishedContent(
  context: FieldgridContentVisibilityContext,
  target: FieldgridContentVisibilityTarget,
): boolean {
  const normalized = normalizeVisibilityContext(context);

  return (
    isPublishedVisibilityTarget(target) &&
    matchesTenantScope(normalized, target) &&
    matchesAudienceScope(normalized, target) &&
    matchesModuleScope(normalized, target) &&
    matchesPermissionScope(normalized, target)
  );
}

export function canPreviewContent(
  context: FieldgridContentVisibilityContext,
  target: FieldgridContentVisibilityTarget,
): boolean {
  if (!context.isPlatformAdmin) return false;
  return matchesTenantScope(context, target);
}
