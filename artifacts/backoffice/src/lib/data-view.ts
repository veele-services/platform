export type DataViewSortDirection = "asc" | "desc";
export type DataViewDensity = "compact" | "normal" | "spacious";

export type DataViewSavedView = {
  id: string;
  name: string;
  query: string;
  createdAt: string;
};

export function nextDataViewSort(
  currentKey: string,
  currentDirection: DataViewSortDirection,
  nextKey: string,
): { key: string; direction: DataViewSortDirection } {
  return {
    key: nextKey,
    direction:
      currentKey === nextKey && currentDirection === "asc" ? "desc" : "asc",
  };
}

export function dataViewSelectionState(
  rowIds: readonly string[],
  selectedIds: ReadonlySet<string>,
): boolean | "indeterminate" {
  if (rowIds.length === 0) return false;
  const selectedCount = rowIds.filter((id) => selectedIds.has(id)).length;
  if (selectedCount === 0) return false;
  if (selectedCount === rowIds.length) return true;
  return "indeterminate";
}

export function toggleDataViewPageSelection(
  rowIds: readonly string[],
  selectedIds: ReadonlySet<string>,
  checked: boolean,
): Set<string> {
  const next = new Set(selectedIds);
  for (const id of rowIds) {
    if (checked) next.add(id);
    else next.delete(id);
  }
  return next;
}

export function normalizeDataViewSavedViews(
  value: unknown,
): DataViewSavedView[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (candidate): candidate is DataViewSavedView =>
        Boolean(candidate) &&
        typeof candidate === "object" &&
        typeof candidate.id === "string" &&
        typeof candidate.name === "string" &&
        candidate.name.trim().length > 0 &&
        typeof candidate.query === "string" &&
        typeof candidate.createdAt === "string",
    )
    .map((candidate) => ({
      ...candidate,
      name: candidate.name.trim().slice(0, 80),
      query: candidate.query.replace(/^\?/, ""),
    }))
    .slice(0, 20);
}

export function upsertDataViewSavedView(
  views: readonly DataViewSavedView[],
  next: DataViewSavedView,
): DataViewSavedView[] {
  const normalizedName = next.name.trim().slice(0, 80);
  if (!normalizedName) return [...views];

  return normalizeDataViewSavedViews([
    {
      ...next,
      name: normalizedName,
      query: next.query.replace(/^\?/, ""),
    },
    ...views.filter(
      (view) => view.name.trim().toLocaleLowerCase("nl-NL") !==
        normalizedName.toLocaleLowerCase("nl-NL"),
    ),
  ]);
}

export function dataViewResultRange(
  page: number,
  pageSize: number,
  total: number,
): { from: number; to: number } {
  if (total <= 0) return { from: 0, to: 0 };
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, pageSize);
  return {
    from: Math.min((safePage - 1) * safePageSize + 1, total),
    to: Math.min(safePage * safePageSize, total),
  };
}
