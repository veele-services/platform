export const RECENT_CONTEXT_STORAGE_KEY = "fieldgrid:recent-context";
export const RECENT_CONTEXT_EVENT = "fieldgrid:recent-context-changed";
export const MAX_RECENT_CONTEXTS = 8;

export type RecentContextKind =
  | "assignment"
  | "customer"
  | "object"
  | "planning";

export type RecentContext = {
  kind: RecentContextKind;
  href: string;
  label: string;
  detail: string;
  visitedAt: string;
};

function safeSegment(value: string | undefined): boolean {
  return Boolean(
    value &&
    value !== "new" &&
    value !== "nieuw" &&
    /^[a-zA-Z0-9_-]{6,128}$/u.test(value),
  );
}

function planningHref(searchParams: URLSearchParams): string {
  const allowed = new URLSearchParams();
  for (const key of ["day", "date", "view"]) {
    const value = searchParams.get(key);
    if (value && value.length <= 32) allowed.set(key, value);
  }
  const query = allowed.toString();
  return query ? `/planning?${query}` : "/planning";
}

export function deriveRecentContext(
  pathname: string,
  searchParams = new URLSearchParams(),
  visitedAt = new Date(),
): RecentContext | null {
  const [, resource, id] = pathname.split("/");
  const timestamp = visitedAt.toISOString();

  if (resource === "assignments" && safeSegment(id)) {
    return {
      kind: "assignment",
      href: `/assignments/${id}`,
      label: "Opdracht opnieuw openen",
      detail: "Ga verder in het laatst bekeken opdrachtdossier.",
      visitedAt: timestamp,
    };
  }
  if (resource === "customers" && safeSegment(id)) {
    return {
      kind: "customer",
      href: `/customers/${id}`,
      label: "Klantdossier opnieuw openen",
      detail: "Ga verder in het laatst bekeken klantdossier.",
      visitedAt: timestamp,
    };
  }
  if (resource === "objects" && safeSegment(id)) {
    return {
      kind: "object",
      href: `/objects/${id}`,
      label: "Object opnieuw openen",
      detail: "Ga verder bij het laatst bekeken object.",
      visitedAt: timestamp,
    };
  }
  if (pathname === "/planning") {
    return {
      kind: "planning",
      href: planningHref(searchParams),
      label: "Planning hervatten",
      detail: "Open de laatst gebruikte planningsdatum en weergave.",
      visitedAt: timestamp,
    };
  }
  return null;
}

export function mergeRecentContexts(
  current: RecentContext[],
  next: RecentContext,
): RecentContext[] {
  return [
    next,
    ...current.filter(
      (item) => item.kind !== next.kind && item.href !== next.href,
    ),
  ].slice(0, MAX_RECENT_CONTEXTS);
}

export function parseRecentContexts(value: string | null): RecentContext[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is RecentContext => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as Partial<RecentContext>;
      return (
        ["assignment", "customer", "object", "planning"].includes(
          candidate.kind ?? "",
        ) &&
        typeof candidate.href === "string" &&
        candidate.href.startsWith("/") &&
        typeof candidate.label === "string" &&
        typeof candidate.detail === "string" &&
        typeof candidate.visitedAt === "string"
      );
    });
  } catch {
    return [];
  }
}
