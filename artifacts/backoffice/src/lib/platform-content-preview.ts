import "server-only";

import {
  db,
  explainKnowledgebaseFeatureHelpVisibility,
  explainPublishedContentVisibility,
  explainReleaseVisibility,
  kbTooltipAudiencesTable,
  kbTooltipsTable,
  listEnabledKnowledgebaseModuleKeysForTenant,
  listKnowledgebaseArticlesForContext,
  listReleasesForContext,
  modulesTable,
  permissionsTable,
  tenantsTable,
  type FieldgridContentAudience,
  type FieldgridContentSurface,
  type FieldgridContentVisibilityContext,
  type ReleaseHighlightSurface,
  type ReleaseVisibilityContext,
} from "@workspace/db";
import { asc, eq, inArray } from "drizzle-orm";
import { requirePlatformAdmin } from "@/lib/auth/platform";

export const PLATFORM_PREVIEW_MODES = [
  {
    key: "platform_admin",
    label: "Platform admin",
    description: "Platformbeheer met volledige globale preview.",
  },
  {
    key: "tenant_admin",
    label: "Tenant admin",
    description: "Tenant backoffice met beheerrechten.",
  },
  {
    key: "tenant_management",
    label: "Management",
    description: "Tenant backoffice voor management/owner-context.",
  },
  {
    key: "tenant_planning",
    label: "Planning",
    description: "Tenant backoffice voor planning en operatie.",
  },
  {
    key: "tenant_administration",
    label: "Administratie",
    description: "Tenant backoffice voor finance/administratie.",
  },
  {
    key: "tenant_personnel",
    label: "Personeel",
    description: "Personeelsportaal/PWA context.",
  },
  {
    key: "tenant_customer",
    label: "Klant",
    description: "Klantenportaal/PWA context.",
  },
] as const;

export type PlatformPreviewMode = (typeof PLATFORM_PREVIEW_MODES)[number]["key"];
export type PlatformPreviewResource = "knowledgebase" | "releases" | "tooltips";

export type PlatformPreviewParams = {
  previewMode?: string | string[] | null;
  previewTenantId?: string | string[] | null;
  previewModuleKeys?: string | string[] | null;
};

export type PlatformPreviewInput = {
  mode: PlatformPreviewMode;
  tenantId: string | null;
  moduleKeys: string[];
};

export type PlatformPreviewOptions = {
  modes: typeof PLATFORM_PREVIEW_MODES;
  tenants: Array<{
    id: string;
    name: string;
    slug: string;
    status: string;
    planKey: string;
  }>;
  modules: Array<{
    key: string;
    name: string;
    description: string | null;
  }>;
};

export type PlatformPreviewItem = {
  id: string;
  title: string;
  subtitle: string | null;
  href: string | null;
  status: string;
  visible: boolean;
  reasons: string[];
  matched: string[];
  audienceKeys: string[];
  moduleKeys: string[];
};

export type PlatformPreviewSnapshot = {
  resource: PlatformPreviewResource;
  input: PlatformPreviewInput;
  label: string;
  surface: FieldgridContentSurface | ReleaseHighlightSurface;
  runtimeAudiences: string[];
  activeModuleKeys: string[];
  permissionKeys: string[];
  baseReasons: string[];
  total: number;
  visibleCount: number;
  hiddenCount: number;
  items: PlatformPreviewItem[];
};

export type PlatformContentPreviewModel = {
  options: PlatformPreviewOptions;
  snapshot: PlatformPreviewSnapshot;
};

const TENANT_BACKOFFICE_AUDIENCES: FieldgridContentAudience[] = [
  "tenant_admin",
  "tenant_management",
  "tenant_planning",
  "tenant_administration",
];

const MODE_TO_AUDIENCE: Record<PlatformPreviewMode, FieldgridContentAudience[]> = {
  platform_admin: ["platform_admin", "support"],
  tenant_admin: TENANT_BACKOFFICE_AUDIENCES,
  tenant_management: TENANT_BACKOFFICE_AUDIENCES,
  tenant_planning: TENANT_BACKOFFICE_AUDIENCES,
  tenant_administration: TENANT_BACKOFFICE_AUDIENCES,
  tenant_personnel: ["tenant_personnel"],
  tenant_customer: ["tenant_customer"],
};

const MODE_TO_SURFACE: Record<PlatformPreviewMode, FieldgridContentSurface> = {
  platform_admin: "platform_backoffice",
  tenant_admin: "tenant_backoffice",
  tenant_management: "tenant_backoffice",
  tenant_planning: "tenant_backoffice",
  tenant_administration: "tenant_backoffice",
  tenant_personnel: "personnel_pwa",
  tenant_customer: "customer_pwa",
};

const MANAGEMENT_PERMISSION_RESOURCES = new Set([
  "assignments",
  "customers",
  "dashboard",
  "documents",
  "inventory",
  "kb",
  "materials",
  "objects",
  "planning",
  "releases",
  "reports",
  "roadmap",
  "tickets",
]);

const PLANNING_PERMISSION_RESOURCES = new Set([
  "assignments",
  "customers",
  "inventory",
  "kb",
  "materials",
  "objects",
  "personnel",
  "planning",
  "releases",
  "reports",
  "roadmap",
  "tickets",
]);

const ADMINISTRATION_PERMISSION_RESOURCES = new Set([
  "customers",
  "documents",
  "finance",
  "invoices",
  "kb",
  "objects",
  "payments",
  "quotes",
  "releases",
  "reports",
  "roadmap",
  "tickets",
]);

function firstParam(value: string | string[] | null | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function arrayParam(value: string | string[] | null | undefined): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(values.map((entry) => entry.trim()).filter(Boolean))];
}

function normalizeMode(value: string | null): PlatformPreviewMode {
  return PLATFORM_PREVIEW_MODES.some((mode) => mode.key === value)
    ? value as PlatformPreviewMode
    : "tenant_admin";
}

export function parsePlatformPreviewInput(params: PlatformPreviewParams): PlatformPreviewInput {
  return {
    mode: normalizeMode(firstParam(params.previewMode)),
    tenantId: firstParam(params.previewTenantId),
    moduleKeys: arrayParam(params.previewModuleKeys),
  };
}

function modeLabel(mode: PlatformPreviewMode): string {
  return PLATFORM_PREVIEW_MODES.find((entry) => entry.key === mode)?.label ?? mode;
}

function permissionKey(resource: string, action: string): string {
  return `${resource}:${action}`;
}

function permissionResourcesForMode(mode: PlatformPreviewMode): Set<string> | null {
  if (mode === "platform_admin" || mode === "tenant_admin") return null;
  if (mode === "tenant_management") return MANAGEMENT_PERMISSION_RESOURCES;
  if (mode === "tenant_planning") return PLANNING_PERMISSION_RESOURCES;
  if (mode === "tenant_administration") return ADMINISTRATION_PERMISSION_RESOURCES;
  return new Set();
}

function permissionsForMode(mode: PlatformPreviewMode, allPermissionKeys: string[]): string[] {
  if (mode === "platform_admin" || mode === "tenant_admin") return allPermissionKeys;

  const resources = permissionResourcesForMode(mode);
  if (!resources) return allPermissionKeys;

  return allPermissionKeys.filter((key) => {
    const [resource] = key.split(":");
    return resources.has(resource);
  });
}

async function listAllPermissionKeys(): Promise<string[]> {
  const rows = await db
    .select({
      resource: permissionsTable.resource,
      action: permissionsTable.action,
    })
    .from(permissionsTable)
    .orderBy(asc(permissionsTable.resource), asc(permissionsTable.action));

  const keys = rows.map((row) => permissionKey(row.resource, row.action));
  return [...new Set([...keys, "kb:view", "releases:view"])];
}

async function getPreviewOptions(): Promise<PlatformPreviewOptions> {
  const [tenants, modules] = await Promise.all([
    db
      .select({
        id: tenantsTable.id,
        name: tenantsTable.name,
        slug: tenantsTable.slug,
        status: tenantsTable.status,
        planKey: tenantsTable.planKey,
      })
      .from(tenantsTable)
      .where(eq(tenantsTable.isActive, true))
      .orderBy(asc(tenantsTable.name)),
    db
      .select({
        key: modulesTable.key,
        name: modulesTable.name,
        description: modulesTable.description,
      })
      .from(modulesTable)
      .orderBy(asc(modulesTable.category), asc(modulesTable.name)),
  ]);

  return { modes: PLATFORM_PREVIEW_MODES, tenants, modules };
}

async function activeModulesForInput(input: PlatformPreviewInput, allModuleKeys: string[]): Promise<string[]> {
  if (input.moduleKeys.length > 0) return input.moduleKeys.filter((key) => allModuleKeys.includes(key));
  if (input.mode === "platform_admin") return allModuleKeys;
  if (input.tenantId) return listEnabledKnowledgebaseModuleKeysForTenant(input.tenantId);
  return allModuleKeys;
}

function knowledgebaseContext(input: PlatformPreviewInput, activeModuleKeys: string[], permissionKeys: string[]): FieldgridContentVisibilityContext {
  return {
    tenantId: input.tenantId,
    surface: MODE_TO_SURFACE[input.mode],
    isPlatformAdmin: input.mode === "platform_admin",
    audiences: MODE_TO_AUDIENCE[input.mode],
    activeModuleKeys,
    permissionKeys,
  };
}

function releaseContext(input: PlatformPreviewInput, activeModuleKeys: string[], permissionKeys: string[]): ReleaseVisibilityContext {
  return {
    tenantId: input.tenantId,
    surface: MODE_TO_SURFACE[input.mode],
    isPlatformAdmin: input.mode === "platform_admin",
    audiences: MODE_TO_AUDIENCE[input.mode],
    activeModuleKeys,
    permissionKeys,
  };
}

function baseAccessReasons(resource: PlatformPreviewResource, context: { activeModuleKeys: readonly string[]; permissionKeys: readonly string[]; mode: PlatformPreviewMode }): string[] {
  if (context.mode === "platform_admin") return [];

  const reasons: string[] = [];
  if ((resource === "knowledgebase" || resource === "tooltips") && !context.activeModuleKeys.includes("knowledgebase")) {
    reasons.push("Knowledgebase-module is niet actief in deze preview.");
  }
  if (resource === "knowledgebase" && !context.permissionKeys.includes("kb:view") && MODE_TO_SURFACE[context.mode] === "tenant_backoffice") {
    reasons.push("Permissie ontbreekt: kb:view.");
  }
  if (resource === "releases" && !context.activeModuleKeys.includes("releases")) {
    reasons.push("Release-module is niet actief in deze preview.");
  }
  if (resource === "releases" && !context.permissionKeys.includes("releases:view") && MODE_TO_SURFACE[context.mode] === "tenant_backoffice") {
    reasons.push("Permissie ontbreekt: releases:view.");
  }

  return reasons;
}

function sortedPreviewItems(items: PlatformPreviewItem[]): PlatformPreviewItem[] {
  return [...items].sort((left, right) => {
    if (left.visible !== right.visible) return left.visible ? -1 : 1;
    return left.title.localeCompare(right.title);
  });
}

async function buildKnowledgebaseItems(
  context: FieldgridContentVisibilityContext,
  baseReasons: string[],
): Promise<PlatformPreviewItem[]> {
  const articles = await listKnowledgebaseArticlesForContext(
    {
      surface: "platform_backoffice",
      isPlatformAdmin: true,
      audiences: ["platform_admin", "support"],
      activeModuleKeys: [],
      permissionKeys: [],
    },
    { includeArchived: true, includeUnpublished: true },
  );

  return articles.map((article) => {
    const explanation = explainPublishedContentVisibility(context, {
      scope: article.scope,
      tenantId: article.tenantId,
      status: article.status,
      archivedAt: article.archivedAt,
      audienceKeys: article.audienceKeys,
      moduleKeys: article.moduleKeys,
      requiredModuleKeys: article.requiredModuleKeys,
      permissionKeys: article.permissionKeys,
    });
    const reasons = [...baseReasons, ...explanation.reasons];
    return {
      id: article.id,
      title: article.title,
      subtitle: article.summary,
      href: `/platform/knowledgebase/articles/${article.id}`,
      status: article.status,
      visible: reasons.length === 0 && explanation.visible,
      reasons,
      matched: explanation.matched,
      audienceKeys: article.audienceKeys,
      moduleKeys: article.moduleKeys,
    };
  });
}

async function buildReleaseItems(
  context: ReleaseVisibilityContext,
  baseReasons: string[],
): Promise<PlatformPreviewItem[]> {
  const releases = await listReleasesForContext(
    {
      surface: "platform_backoffice",
      isPlatformAdmin: true,
      audiences: ["platform_admin", "support"],
      activeModuleKeys: [],
    },
    { includeArchived: true, includeUnpublished: true },
  );

  return releases.map((release) => {
    const explanation = explainReleaseVisibility(context, release, {
      requireViewPermission: context.surface === "tenant_backoffice",
    });
    const reasons = [...baseReasons, ...explanation.reasons];
    return {
      id: release.id,
      title: `${release.version} - ${release.title}`,
      subtitle: release.summary,
      href: `/platform/releases/${release.slug}`,
      status: release.status,
      visible: reasons.length === 0 && explanation.visible,
      reasons,
      matched: explanation.matched,
      audienceKeys: release.audienceKeys,
      moduleKeys: release.moduleKeys,
    };
  });
}

async function buildTooltipItems(
  context: FieldgridContentVisibilityContext,
  baseReasons: string[],
): Promise<PlatformPreviewItem[]> {
  const articles = await listKnowledgebaseArticlesForContext(
    {
      surface: "platform_backoffice",
      isPlatformAdmin: true,
      audiences: ["platform_admin", "support"],
      activeModuleKeys: [],
      permissionKeys: [],
    },
    { includeArchived: true, includeUnpublished: true },
  );
  const articleTitleById = new Map(articles.map((article) => [article.id, article.title]));

  const rows = await db
    .select({
      id: kbTooltipsTable.id,
      stableKey: kbTooltipsTable.stableKey,
      title: kbTooltipsTable.title,
      description: kbTooltipsTable.description,
      articleId: kbTooltipsTable.articleId,
      moduleKey: kbTooltipsTable.moduleKey,
      status: kbTooltipsTable.status,
    })
    .from(kbTooltipsTable)
    .orderBy(asc(kbTooltipsTable.stableKey));
  const audienceRows = rows.length
    ? await db
      .select({
        tooltipId: kbTooltipAudiencesTable.tooltipId,
        audienceKey: kbTooltipAudiencesTable.audienceKey,
      })
      .from(kbTooltipAudiencesTable)
      .where(inArray(kbTooltipAudiencesTable.tooltipId, rows.map((row) => row.id)))
    : [];
  const audienceByTooltipId = new Map<string, FieldgridContentAudience[]>();
  for (const row of audienceRows) {
    const list = audienceByTooltipId.get(row.tooltipId) ?? [];
    list.push(row.audienceKey);
    audienceByTooltipId.set(row.tooltipId, list);
  }

  return Promise.all(
    rows.map(async (tooltip) => {
      const explanation = await explainKnowledgebaseFeatureHelpVisibility(context, tooltip.stableKey, {
        moduleKey: tooltip.moduleKey,
        audience: MODE_TO_AUDIENCE_BY_SURFACE_SAFE(context)[0],
        articleHrefPrefix: "/help",
      });
      const reasons = [...baseReasons, ...explanation.reasons];
      return {
        id: tooltip.id,
        title: tooltip.title,
        subtitle: tooltip.articleId ? `Artikel: ${articleTitleById.get(tooltip.articleId) ?? tooltip.articleId}` : tooltip.description,
        href: null,
        status: tooltip.status,
        visible: reasons.length === 0 && explanation.visible,
        reasons,
        matched: explanation.matched,
        audienceKeys: audienceByTooltipId.get(tooltip.id) ?? [],
        moduleKeys: tooltip.moduleKey ? [tooltip.moduleKey] : [],
      };
    }),
  );
}

function MODE_TO_AUDIENCE_BY_SURFACE_SAFE(context: FieldgridContentVisibilityContext): FieldgridContentAudience[] {
  if (context.surface === "platform_backoffice") return ["platform_admin"];
  if (context.surface === "personnel_pwa") return ["tenant_personnel"];
  if (context.surface === "customer_pwa") return ["tenant_customer"];
  return TENANT_BACKOFFICE_AUDIENCES;
}

export async function getPlatformContentPreviewModel(
  resource: PlatformPreviewResource,
  params: PlatformPreviewParams,
): Promise<PlatformContentPreviewModel> {
  await requirePlatformAdmin();

  const input = parsePlatformPreviewInput(params);
  const [options, allPermissionKeys] = await Promise.all([
    getPreviewOptions(),
    listAllPermissionKeys(),
  ]);
  const allModuleKeys = options.modules.map((module) => module.key);
  const activeModuleKeys = await activeModulesForInput(input, allModuleKeys);
  const permissionKeys = permissionsForMode(input.mode, allPermissionKeys);
  const kbContext = knowledgebaseContext(input, activeModuleKeys, permissionKeys);
  const relContext = releaseContext(input, activeModuleKeys, permissionKeys);
  const baseReasons = baseAccessReasons(resource, { activeModuleKeys, permissionKeys, mode: input.mode });
  const items = resource === "releases"
    ? await buildReleaseItems(relContext, baseReasons)
    : resource === "tooltips"
      ? await buildTooltipItems(kbContext, baseReasons)
      : await buildKnowledgebaseItems(kbContext, baseReasons);
  const visibleCount = items.filter((item) => item.visible).length;
  const tenant = options.tenants.find((entry) => entry.id === input.tenantId);

  return {
    options,
    snapshot: {
      resource,
      input,
      label: `${modeLabel(input.mode)}${tenant ? ` bij ${tenant.name}` : ""}`,
      surface: MODE_TO_SURFACE[input.mode],
      runtimeAudiences: MODE_TO_AUDIENCE[input.mode],
      activeModuleKeys,
      permissionKeys,
      baseReasons,
      total: items.length,
      visibleCount,
      hiddenCount: items.length - visibleCount,
      items: sortedPreviewItems(items),
    },
  };
}
