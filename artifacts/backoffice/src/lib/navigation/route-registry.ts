export type FieldgridRouteScope = "tenant" | "platform";

export type TenantNavigationGroup =
  | "daily"
  | "relations"
  | "people"
  | "administration"
  | "communication"
  | "management";

export type PlatformNavigationGroup =
  | "overview"
  | "tenant-lifecycle"
  | "service"
  | "product"
  | "security-operations"
  | "platform-management";

export type FieldgridNavigationGroup =
  | TenantNavigationGroup
  | PlatformNavigationGroup;

export type FieldgridRouteIcon =
  | "activity"
  | "archive"
  | "bell"
  | "book"
  | "boxes"
  | "building"
  | "calendar"
  | "calendar-clock"
  | "clipboard"
  | "credit-card"
  | "dashboard"
  | "file-check"
  | "file-text"
  | "folder"
  | "globe"
  | "lightbulb"
  | "megaphone"
  | "package-search"
  | "rocket"
  | "settings"
  | "shield"
  | "ticket"
  | "user-cog"
  | "users";

export type RouteReleaseVisibility = "primary" | "support" | "hidden";

export type FieldgridRouteDefinition = {
  id: string;
  scope: FieldgridRouteScope;
  href: string;
  matchPrefixes?: readonly string[];
  title: string;
  breadcrumb: string;
  navGroup?: FieldgridNavigationGroup;
  icon: FieldgridRouteIcon;
  permission?: `${string}:${string}`;
  module?: string;
  helpKey?: string;
  helpDescription?: string;
  searchContext?: string;
  releaseVisibility: RouteReleaseVisibility;
  adminOnly?: boolean;
};

export type FieldgridNavigationGroupDefinition = {
  id: FieldgridNavigationGroup;
  label: string;
  scope: FieldgridRouteScope;
};

export const TENANT_NAVIGATION_GROUPS = [
  { id: "daily", label: "Dagelijkse operatie", scope: "tenant" },
  { id: "relations", label: "Relaties en locaties", scope: "tenant" },
  { id: "people", label: "Mensen en middelen", scope: "tenant" },
  { id: "administration", label: "Administratie", scope: "tenant" },
  { id: "communication", label: "Communicatie", scope: "tenant" },
  { id: "management", label: "Beheer", scope: "tenant" },
] as const satisfies readonly FieldgridNavigationGroupDefinition[];

export const PLATFORM_NAVIGATION_GROUPS = [
  { id: "overview", label: "Overzicht", scope: "platform" },
  {
    id: "tenant-lifecycle",
    label: "Tenant lifecycle",
    scope: "platform",
  },
  { id: "service", label: "Service", scope: "platform" },
  { id: "product", label: "Product", scope: "platform" },
  {
    id: "security-operations",
    label: "Security en operations",
    scope: "platform",
  },
  {
    id: "platform-management",
    label: "Platformbeheer",
    scope: "platform",
  },
] as const satisfies readonly FieldgridNavigationGroupDefinition[];

export const TENANT_ROUTES = [
  {
    id: "tenant-dashboard",
    scope: "tenant",
    href: "/",
    title: "Dashboard",
    breadcrumb: "Dashboard",
    navGroup: "daily",
    icon: "dashboard",
    permission: "dashboard:read",
    helpKey: "dashboard",
    searchContext: "dashboard",
    releaseVisibility: "primary",
  },
  {
    id: "tenant-planning",
    scope: "tenant",
    href: "/planning",
    title: "Planning",
    breadcrumb: "Planning",
    navGroup: "daily",
    icon: "calendar",
    permission: "planning:read",
    module: "planning",
    helpKey: "planning",
    helpDescription:
      "Plan werkbonnen en bekijk dag-, maand-, bord- en kaartweergaven.",
    searchContext: "planning",
    releaseVisibility: "primary",
  },
  {
    id: "tenant-assignments",
    scope: "tenant",
    href: "/assignments",
    title: "Opdrachten",
    breadcrumb: "Opdrachten",
    navGroup: "daily",
    icon: "clipboard",
    permission: "assignments:read",
    module: "assignments",
    helpKey: "assignments",
    helpDescription:
      "Beheer werkbonnen, taken, personeel, rapportage en opvolging.",
    searchContext: "assignments",
    releaseVisibility: "primary",
  },
  {
    id: "tenant-customers",
    scope: "tenant",
    href: "/customers",
    title: "Klanten",
    breadcrumb: "Klanten",
    navGroup: "relations",
    icon: "users",
    permission: "customers:read",
    module: "customers",
    helpKey: "customers",
    helpDescription:
      "Beheer klantgegevens, contacten, objecten en klantnotities.",
    searchContext: "customers",
    releaseVisibility: "primary",
  },
  {
    id: "tenant-objects",
    scope: "tenant",
    href: "/objects",
    title: "Objecten",
    breadcrumb: "Objecten",
    navGroup: "relations",
    icon: "building",
    permission: "objects:read",
    module: "objects",
    helpKey: "objects",
    searchContext: "objects",
    releaseVisibility: "primary",
  },
  {
    id: "tenant-personnel",
    scope: "tenant",
    href: "/personnel",
    title: "Personeel",
    breadcrumb: "Personeel",
    navGroup: "people",
    icon: "user-cog",
    permission: "personnel:read",
    module: "personnel",
    helpKey: "personnel",
    searchContext: "personnel",
    releaseVisibility: "primary",
  },
  {
    id: "tenant-leave",
    scope: "tenant",
    href: "/personnel/verlof",
    title: "Verlof",
    breadcrumb: "Verlof",
    navGroup: "people",
    icon: "calendar-clock",
    permission: "personnel:read",
    module: "personnel",
    helpKey: "leave",
    releaseVisibility: "primary",
  },
  {
    id: "tenant-materials",
    scope: "tenant",
    href: "/materials",
    title: "Materialen",
    breadcrumb: "Materialen",
    navGroup: "people",
    icon: "boxes",
    permission: "materials:view",
    module: "materials",
    helpKey: "materials",
    searchContext: "materials",
    releaseVisibility: "primary",
  },
  {
    id: "tenant-inventory",
    scope: "tenant",
    href: "/inventory",
    title: "Inventaris",
    breadcrumb: "Inventaris",
    navGroup: "people",
    icon: "package-search",
    permission: "inventory:view",
    module: "inventory",
    helpKey: "inventory",
    searchContext: "inventory",
    releaseVisibility: "primary",
  },
  {
    id: "tenant-quotes",
    scope: "tenant",
    href: "/quotes",
    title: "Offertes",
    breadcrumb: "Offertes",
    navGroup: "administration",
    icon: "file-check",
    permission: "quotes:read",
    module: "quotes",
    helpKey: "quotes",
    helpDescription:
      "Volg offertevoorstellen, klantgoedkeuringen, bedragen en vervaldatums.",
    searchContext: "quotes",
    releaseVisibility: "primary",
  },
  {
    id: "tenant-reports",
    scope: "tenant",
    href: "/reports",
    title: "Rapporten",
    breadcrumb: "Rapporten",
    navGroup: "administration",
    icon: "archive",
    permission: "reports:read",
    module: "reports",
    helpKey: "reports",
    searchContext: "reports",
    releaseVisibility: "primary",
  },
  {
    id: "tenant-invoices",
    scope: "tenant",
    href: "/invoices",
    title: "Facturen",
    breadcrumb: "Facturen",
    navGroup: "administration",
    icon: "file-text",
    permission: "invoices:read",
    module: "invoices",
    helpKey: "invoices",
    searchContext: "invoices",
    releaseVisibility: "primary",
  },
  {
    id: "tenant-documents",
    scope: "tenant",
    href: "/documents",
    title: "Documenten",
    breadcrumb: "Documenten",
    navGroup: "administration",
    icon: "folder",
    permission: "documents:read",
    module: "documents",
    helpKey: "documents",
    searchContext: "documents",
    releaseVisibility: "primary",
  },
  {
    id: "tenant-tickets",
    scope: "tenant",
    href: "/tickets",
    title: "Tickets",
    breadcrumb: "Tickets",
    navGroup: "communication",
    icon: "ticket",
    permission: "tickets:read",
    module: "tickets",
    helpKey: "tickets",
    searchContext: "tickets",
    releaseVisibility: "primary",
  },
  {
    id: "tenant-news",
    scope: "tenant",
    href: "/news",
    title: "Nieuws",
    breadcrumb: "Nieuws",
    navGroup: "communication",
    icon: "megaphone",
    permission: "news:read",
    module: "news",
    helpKey: "news",
    searchContext: "news",
    releaseVisibility: "primary",
  },
  {
    id: "tenant-website",
    scope: "tenant",
    href: "/website",
    title: "Website",
    breadcrumb: "Website",
    navGroup: "communication",
    icon: "globe",
    permission: "website:read",
    module: "website",
    helpKey: "website",
    searchContext: "website",
    releaseVisibility: "primary",
  },
  {
    id: "tenant-settings",
    scope: "tenant",
    href: "/settings",
    matchPrefixes: ["/settings", "/instellingen"],
    title: "Instellingen",
    breadcrumb: "Instellingen",
    navGroup: "management",
    icon: "settings",
    permission: "settings:read",
    helpKey: "settings",
    searchContext: "settings",
    releaseVisibility: "primary",
  },
  {
    id: "tenant-profile",
    scope: "tenant",
    href: "/profile",
    title: "Profiel",
    breadcrumb: "Profiel",
    icon: "user-cog",
    helpKey: "profile",
    releaseVisibility: "support",
  },
  {
    id: "tenant-help",
    scope: "tenant",
    href: "/help",
    title: "Help",
    breadcrumb: "Help",
    icon: "book",
    permission: "kb:view",
    helpKey: "help",
    searchContext: "knowledgebase",
    releaseVisibility: "support",
  },
  {
    id: "tenant-roadmap",
    scope: "tenant",
    href: "/roadmap",
    title: "Roadmap",
    breadcrumb: "Roadmap",
    icon: "lightbulb",
    permission: "roadmap:view",
    helpKey: "roadmap",
    releaseVisibility: "support",
  },
  {
    id: "tenant-releases",
    scope: "tenant",
    href: "/releases",
    title: "Wat is er nieuw?",
    breadcrumb: "Releases",
    icon: "megaphone",
    permission: "releases:view",
    helpKey: "releases",
    releaseVisibility: "support",
  },
] as const satisfies readonly FieldgridRouteDefinition[];

export const PLATFORM_ROUTES = [
  {
    id: "platform-dashboard",
    scope: "platform",
    href: "/platform",
    title: "Platformoverzicht",
    breadcrumb: "Platformbeheer",
    navGroup: "overview",
    icon: "dashboard",
    searchContext: "platform",
    releaseVisibility: "primary",
  },
  {
    id: "platform-tenants",
    scope: "platform",
    href: "/platform/tenants",
    title: "Organisaties",
    breadcrumb: "Organisaties",
    navGroup: "tenant-lifecycle",
    icon: "building",
    searchContext: "tenants",
    releaseVisibility: "primary",
    adminOnly: true,
  },
  {
    id: "platform-tenant-detail",
    scope: "platform",
    href: "/platform/tenants",
    matchPrefixes: ["/platform/tenants/"],
    title: "Organisatiedetail",
    breadcrumb: "Detail",
    icon: "building",
    searchContext: "tenants",
    releaseVisibility: "hidden",
    adminOnly: true,
  },
  {
    id: "platform-onboarding",
    scope: "platform",
    href: "/platform/onboarding",
    title: "Onboarding",
    breadcrumb: "Onboarding",
    navGroup: "tenant-lifecycle",
    icon: "rocket",
    searchContext: "onboarding",
    releaseVisibility: "primary",
    adminOnly: true,
  },
  {
    id: "platform-accelerators",
    scope: "platform",
    href: "/platform/accelerators",
    title: "Platformversnellers",
    breadcrumb: "Platformversnellers",
    navGroup: "tenant-lifecycle",
    icon: "rocket",
    releaseVisibility: "primary",
    adminOnly: true,
  },
  {
    id: "platform-subscriptions",
    scope: "platform",
    href: "/platform/subscriptions",
    title: "Abonnementen",
    breadcrumb: "Abonnementen",
    navGroup: "tenant-lifecycle",
    icon: "credit-card",
    searchContext: "subscriptions",
    releaseVisibility: "primary",
    adminOnly: true,
  },
  {
    id: "platform-tickets",
    scope: "platform",
    href: "/platform/tickets",
    title: "Servicetickets",
    breadcrumb: "Servicetickets",
    navGroup: "service",
    icon: "ticket",
    releaseVisibility: "hidden",
    adminOnly: true,
  },
  {
    id: "platform-notifications",
    scope: "platform",
    href: "/platform/notifications",
    title: "Platformmeldingen",
    breadcrumb: "Platformmeldingen",
    navGroup: "service",
    icon: "bell",
    releaseVisibility: "hidden",
    adminOnly: true,
  },
  {
    id: "platform-knowledgebase",
    scope: "platform",
    href: "/platform/knowledgebase",
    title: "Kennisbank",
    breadcrumb: "Kennisbank",
    navGroup: "product",
    icon: "book",
    searchContext: "knowledgebase",
    releaseVisibility: "primary",
    adminOnly: true,
  },
  {
    id: "platform-roadmap",
    scope: "platform",
    href: "/platform/roadmap",
    title: "Roadmap",
    breadcrumb: "Roadmap",
    navGroup: "product",
    icon: "lightbulb",
    searchContext: "roadmap",
    releaseVisibility: "primary",
    adminOnly: true,
  },
  {
    id: "platform-releases",
    scope: "platform",
    href: "/platform/releases",
    title: "Releases",
    breadcrumb: "Releases",
    navGroup: "product",
    icon: "megaphone",
    searchContext: "releases",
    releaseVisibility: "primary",
    adminOnly: true,
  },
  {
    id: "platform-security",
    scope: "platform",
    href: "/platform/security",
    title: "Beveiliging en audit",
    breadcrumb: "Beveiliging en audit",
    navGroup: "security-operations",
    icon: "shield",
    searchContext: "security",
    releaseVisibility: "primary",
    adminOnly: true,
  },
  {
    id: "platform-operations",
    scope: "platform",
    href: "/platform/operations",
    title: "Operations",
    breadcrumb: "Operations",
    navGroup: "security-operations",
    icon: "activity",
    searchContext: "operations",
    releaseVisibility: "primary",
    adminOnly: true,
  },
  {
    id: "platform-staging-smoke",
    scope: "platform",
    href: "/platform/staging-smoke",
    title: "Stagingcontrole",
    breadcrumb: "Stagingcontrole",
    navGroup: "security-operations",
    icon: "activity",
    releaseVisibility: "primary",
    adminOnly: true,
  },
  {
    id: "platform-users",
    scope: "platform",
    href: "/platform/users",
    title: "Platformgebruikers",
    breadcrumb: "Platformgebruikers",
    navGroup: "platform-management",
    icon: "users",
    searchContext: "platform-users",
    releaseVisibility: "primary",
    adminOnly: true,
  },
  {
    id: "platform-settings",
    scope: "platform",
    href: "/platform/settings",
    title: "Platforminstellingen",
    breadcrumb: "Platforminstellingen",
    navGroup: "platform-management",
    icon: "settings",
    searchContext: "platform-settings",
    releaseVisibility: "primary",
    adminOnly: true,
  },
] as const satisfies readonly FieldgridRouteDefinition[];

export const FIELDGRID_ROUTES = [
  ...TENANT_ROUTES,
  ...PLATFORM_ROUTES,
] as const satisfies readonly FieldgridRouteDefinition[];

function routePrefixes(route: FieldgridRouteDefinition): readonly string[] {
  return route.matchPrefixes ?? [route.href];
}

function prefixMatches(pathname: string, prefix: string): boolean {
  if (prefix === "/") return pathname === "/";
  if (prefix.endsWith("/")) return pathname.startsWith(prefix);
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function getFieldgridRoute(
  pathname: string,
  scope?: FieldgridRouteScope,
): FieldgridRouteDefinition | null {
  const matches = FIELDGRID_ROUTES.flatMap((route) =>
    routePrefixes(route)
      .filter((prefix) => prefixMatches(pathname, prefix))
      .map((prefix) => ({ route, specificity: prefix.length })),
  )
    .filter(({ route }) => !scope || route.scope === scope)
    .sort((a, b) => b.specificity - a.specificity);

  return matches[0]?.route ?? null;
}

export function permissionParts(
  permission: FieldgridRouteDefinition["permission"],
): { resource: string; action: string } | null {
  if (!permission) return null;
  const separator = permission.indexOf(":");
  if (separator < 1 || separator === permission.length - 1) return null;
  return {
    resource: permission.slice(0, separator),
    action: permission.slice(separator + 1),
  };
}

export function routeIsVisibleForPermissions(
  route: FieldgridRouteDefinition,
  permissions: ReadonlySet<string>,
): boolean {
  return !route.permission || permissions.has(route.permission);
}
