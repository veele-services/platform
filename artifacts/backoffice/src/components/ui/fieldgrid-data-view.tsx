"use client";

import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Rows3,
  Trash2,
} from "lucide-react";

import { BulkActionBar } from "@/components/ui/bulk-action-bar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import {
  dataViewResultRange,
  dataViewSelectionState,
  normalizeDataViewSavedViews,
  toggleDataViewPageSelection,
  upsertDataViewSavedView,
  type DataViewDensity,
  type DataViewSavedView,
  type DataViewSortDirection,
} from "@/lib/data-view";
import { cn } from "@/lib/utils";

export type FieldgridDataViewColumn<TData> = {
  id: string;
  label: string;
  cell: (row: TData, index: number) => React.ReactNode;
  className?: string;
  headerClassName?: string;
  sortable?: boolean;
  hideable?: boolean;
  hiddenByDefault?: boolean;
};

type DataViewSelection = {
  selectedIds: ReadonlySet<string>;
  onSelectionChange: (selectedIds: Set<string>) => void;
  getRowLabel: (rowId: string) => string;
};

type DataViewSort = {
  key: string;
  direction: DataViewSortDirection;
  onChange: (key: string) => void;
};

type DataViewPagination = {
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
  onPageChange: (page: number) => void;
};

type DataViewSavedViews = {
  storageKey: string;
  currentQuery: string;
  onApplyQuery: (query: string) => void;
};

type MobileCardContext = {
  selected: boolean;
  selectionControl: React.ReactNode;
};

export type FieldgridDataViewProps<TData> = {
  rows: TData[];
  columns: FieldgridDataViewColumn<TData>[];
  getRowId: (row: TData) => string;
  caption: string;
  loading?: boolean;
  hasActiveFilters?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  filteredEmptyTitle?: string;
  filteredEmptyDescription?: string;
  emptyAction?: React.ReactNode;
  renderMobileCard?: (
    row: TData,
    index: number,
    context: MobileCardContext,
  ) => React.ReactNode;
  selection?: DataViewSelection;
  sort?: DataViewSort;
  pagination?: DataViewPagination;
  bulkActions?: (context: {
    count: number;
    selectedIds: ReadonlySet<string>;
    clear: () => void;
  }) => React.ReactNode;
  savedViews?: DataViewSavedViews;
  preferenceKey?: string;
  controls?: React.ReactNode;
  className?: string;
};

const densityClasses: Record<DataViewDensity, string> = {
  compact: "[&_td]:py-1.5 [&_th]:h-9",
  normal: "[&_td]:py-2.5 [&_th]:h-10",
  spacious: "[&_td]:py-4 [&_th]:h-12",
};

function readPreference<TValue>(
  key: string,
  fallback: TValue,
  validate: (value: unknown) => value is TValue,
): TValue {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    return validate(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writePreference(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // De tabel blijft werken wanneer browseropslag geblokkeerd of vol is.
  }
}

function isDensity(value: unknown): value is DataViewDensity {
  return value === "compact" || value === "normal" || value === "spacious";
}

function isVisibilityMap(value: unknown): value is Record<string, boolean> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function SavedViewsControl({
  config,
}: {
  config: DataViewSavedViews;
}) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [views, setViews] = React.useState<DataViewSavedView[]>([]);

  React.useEffect(() => {
    try {
      const parsed: unknown = JSON.parse(
        localStorage.getItem(config.storageKey) ?? "[]",
      );
      setViews(normalizeDataViewSavedViews(parsed));
    } catch {
      setViews([]);
    }
  }, [config.storageKey]);

  function persist(next: DataViewSavedView[]) {
    setViews(next);
    writePreference(config.storageKey, next);
  }

  function saveCurrentView(event: React.FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const next = upsertDataViewSavedView(views, {
      id:
        globalThis.crypto?.randomUUID?.() ??
        `${Date.now()}-${trimmedName.toLocaleLowerCase("nl-NL")}`,
      name: trimmedName,
      query: config.currentQuery,
      createdAt: new Date().toISOString(),
    });
    persist(next);
    setName("");
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Bookmark className="size-4" />
          <span className="hidden sm:inline">Weergaven</span>
          {views.length > 0 ? (
            <span className="text-xs text-muted-foreground">
              {views.length}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold">Opgeslagen weergaven</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Deze voorkeuren blijven alleen in deze browser bewaard.
            </p>
          </div>
          {views.length > 0 ? (
            <ul className="max-h-52 space-y-1 overflow-y-auto">
              {views.map((view) => (
                <li
                  key={view.id}
                  className="flex min-w-0 items-center gap-1 rounded-md border p-1"
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="min-w-0 flex-1 justify-start truncate"
                    onClick={() => {
                      config.onApplyQuery(view.query);
                      setOpen(false);
                    }}
                  >
                    {view.name}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-9 shrink-0"
                    aria-label={`Verwijder weergave ${view.name}`}
                    onClick={() =>
                      persist(views.filter((candidate) => candidate.id !== view.id))
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nog geen weergaven opgeslagen.
            </p>
          )}
          <form className="space-y-2" onSubmit={saveCurrentView}>
            <label
              htmlFor={`${config.storageKey}-name`}
              className="text-xs font-semibold"
            >
              Huidige filters bewaren
            </label>
            <div className="flex gap-2">
              <Input
                id={`${config.storageKey}-name`}
                value={name}
                maxLength={80}
                placeholder="Bijvoorbeeld: Inactieve objecten"
                onChange={(event) => setName(event.target.value)}
              />
              <Button type="submit" size="sm" disabled={!name.trim()}>
                Bewaar
              </Button>
            </div>
          </form>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function FieldgridDataView<TData>({
  rows,
  columns,
  getRowId,
  caption,
  loading = false,
  hasActiveFilters = false,
  emptyTitle = "Nog geen gegevens",
  emptyDescription = "Voeg het eerste item toe om te beginnen.",
  filteredEmptyTitle = "Geen resultaten",
  filteredEmptyDescription = "Pas de actieve filters aan en probeer opnieuw.",
  emptyAction,
  renderMobileCard,
  selection,
  sort,
  pagination,
  bulkActions,
  savedViews,
  preferenceKey,
  controls,
  className,
}: FieldgridDataViewProps<TData>) {
  const defaultVisibility = React.useMemo(
    () =>
      Object.fromEntries(
        columns.map((column) => [column.id, !column.hiddenByDefault]),
      ),
    [columns],
  );
  const [columnVisibility, setColumnVisibility] =
    React.useState<Record<string, boolean>>(defaultVisibility);
  const [density, setDensity] = React.useState<DataViewDensity>("normal");
  const [preferencesLoaded, setPreferencesLoaded] = React.useState(false);
  const rowIds = React.useMemo(() => rows.map(getRowId), [getRowId, rows]);
  const selectionState = selection
    ? dataViewSelectionState(rowIds, selection.selectedIds)
    : false;

  React.useEffect(() => {
    if (!preferenceKey) {
      setPreferencesLoaded(true);
      return;
    }
    setColumnVisibility(
      readPreference(
        `${preferenceKey}:columns`,
        defaultVisibility,
        isVisibilityMap,
      ),
    );
    setDensity(
      readPreference(`${preferenceKey}:density`, "normal", isDensity),
    );
    setPreferencesLoaded(true);
  }, [defaultVisibility, preferenceKey]);

  React.useEffect(() => {
    if (!preferenceKey || !preferencesLoaded) return;
    writePreference(`${preferenceKey}:columns`, columnVisibility);
    writePreference(`${preferenceKey}:density`, density);
  }, [columnVisibility, density, preferenceKey, preferencesLoaded]);

  const visibleColumns = columns.filter(
    (column) => columnVisibility[column.id] !== false,
  );
  const effectiveColumns =
    visibleColumns.length > 0 ? visibleColumns : columns.slice(0, 1);
  const hideableColumns = columns.filter((column) => column.hideable !== false);
  const range = pagination
    ? dataViewResultRange(
        pagination.page,
        pagination.pageSize,
        pagination.total,
      )
    : null;

  function rowSelectionControl(rowId: string) {
    if (!selection) return null;
    return (
      <Checkbox
        checked={selection.selectedIds.has(rowId)}
        aria-label={`Selecteer ${selection.getRowLabel(rowId)}`}
        onCheckedChange={(checked) => {
          const next = new Set(selection.selectedIds);
          if (checked === true) next.add(rowId);
          else next.delete(rowId);
          selection.onSelectionChange(next);
        }}
      />
    );
  }

  if (!loading && rows.length === 0) {
    return (
      <Empty
        className={cn(
          "border border-dashed border-border bg-card shadow-card",
          className,
        )}
      >
        <EmptyHeader>
          <EmptyTitle>
            {hasActiveFilters ? filteredEmptyTitle : emptyTitle}
          </EmptyTitle>
          <EmptyDescription>
            {hasActiveFilters
              ? filteredEmptyDescription
              : emptyDescription}
          </EmptyDescription>
        </EmptyHeader>
        {emptyAction ? <EmptyContent>{emptyAction}</EmptyContent> : null}
      </Empty>
    );
  }

  return (
    <section
      data-fieldgrid-data-view=""
      className={cn("space-y-3", className)}
      aria-busy={loading}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {loading
            ? "Resultaten laden…"
            : pagination
              ? range && range.from > 0
                ? `Resultaten ${range.from}–${range.to} van ${pagination.total}`
                : "0 resultaten"
              : `${rows.length} ${rows.length === 1 ? "resultaat" : "resultaten"}`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {controls}
          {savedViews ? <SavedViewsControl config={savedViews} /> : null}
          {hideableColumns.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  <Columns3 className="size-4" />
                  <span className="hidden sm:inline">Kolommen</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Zichtbare kolommen</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {hideableColumns.map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={columnVisibility[column.id] !== false}
                    onCheckedChange={(checked) =>
                      setColumnVisibility((current) => ({
                        ...current,
                        [column.id]: checked === true,
                      }))
                    }
                    onSelect={(event) => event.preventDefault()}
                  >
                    {column.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          <div className="hidden items-center gap-1 lg:flex">
            <Rows3 className="size-4 text-muted-foreground" aria-hidden="true" />
            <ToggleGroup
              type="single"
              value={density}
              aria-label="Rijdichtheid"
              onValueChange={(value) => {
                if (isDensity(value)) setDensity(value);
              }}
            >
              <ToggleGroupItem
                value="compact"
                size="sm"
                aria-label="Compacte rijen"
              >
                Compact
              </ToggleGroupItem>
              <ToggleGroupItem
                value="normal"
                size="sm"
                aria-label="Normale rijen"
              >
                Normaal
              </ToggleGroupItem>
              <ToggleGroupItem
                value="spacious"
                size="sm"
                aria-label="Ruime rijen"
              >
                Ruim
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
      </div>

      {selection && bulkActions && selection.selectedIds.size > 0 ? (
        <BulkActionBar count={selection.selectedIds.size}>
          {bulkActions({
            count: selection.selectedIds.size,
            selectedIds: selection.selectedIds,
            clear: () => selection.onSelectionChange(new Set()),
          })}
        </BulkActionBar>
      ) : null}

      {renderMobileCard ? (
        <div
          className="grid gap-3 md:hidden"
          role="list"
          aria-label={caption}
        >
          {loading
            ? Array.from({ length: 4 }, (_, index) => (
                <div
                  key={`mobile-skeleton-${index}`}
                  className="space-y-3 rounded-lg border bg-card p-4"
                  role="listitem"
                  aria-hidden="true"
                >
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ))
            : rows.map((row, index) => {
                const rowId = getRowId(row);
                return (
                  <div key={rowId} role="listitem">
                    {renderMobileCard(row, index, {
                      selected: selection?.selectedIds.has(rowId) ?? false,
                      selectionControl: rowSelectionControl(rowId),
                    })}
                  </div>
                );
              })}
        </div>
      ) : null}

      <div
        className={cn(
          "overflow-hidden rounded-lg border border-border bg-card shadow-card",
          renderMobileCard && "hidden md:block",
        )}
      >
        <Table className={cn("min-w-full", densityClasses[density])}>
          <TableCaption className="sr-only">{caption}</TableCaption>
          <TableHeader className="sticky top-0 z-[var(--z-sticky)] bg-muted/95 backdrop-blur">
            <TableRow className="hover:bg-muted/95">
              {selection ? (
                <TableHead className="w-12 pl-4">
                  <Checkbox
                    checked={selectionState}
                    aria-label="Selecteer alle resultaten op deze pagina"
                    onCheckedChange={(checked) =>
                      selection.onSelectionChange(
                        toggleDataViewPageSelection(
                          rowIds,
                          selection.selectedIds,
                          checked === true,
                        ),
                      )
                    }
                  />
                </TableHead>
              ) : null}
              {effectiveColumns.map((column) => {
                const activeSort = sort?.key === column.id;
                const ariaSort = activeSort
                  ? sort.direction === "asc"
                    ? "ascending"
                    : "descending"
                  : undefined;
                return (
                  <TableHead
                    key={column.id}
                    className={column.headerClassName}
                    aria-sort={ariaSort}
                  >
                    {column.sortable && sort ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="-ml-3 h-9 font-semibold"
                        onClick={() => sort.onChange(column.id)}
                        aria-label={`Sorteer op ${column.label}${
                          activeSort
                            ? sort.direction === "asc"
                              ? ", nu oplopend"
                              : ", nu aflopend"
                            : ""
                        }`}
                      >
                        {column.label}
                        {activeSort ? (
                          sort.direction === "asc" ? (
                            <ArrowUp className="size-4" />
                          ) : (
                            <ArrowDown className="size-4" />
                          )
                        ) : null}
                      </Button>
                    ) : (
                      column.label
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading
              ? Array.from({ length: 7 }, (_, rowIndex) => (
                  <TableRow key={`table-skeleton-${rowIndex}`} aria-hidden="true">
                    {selection ? (
                      <TableCell className="pl-4">
                        <Skeleton className="size-4" />
                      </TableCell>
                    ) : null}
                    {effectiveColumns.map((column, columnIndex) => (
                      <TableCell key={column.id}>
                        <Skeleton
                          className={cn(
                            "h-4",
                            columnIndex === 0 ? "w-40" : "w-24",
                          )}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : rows.map((row, index) => {
                  const rowId = getRowId(row);
                  const selected = selection?.selectedIds.has(rowId) ?? false;
                  return (
                    <TableRow key={rowId} data-state={selected ? "selected" : undefined}>
                      {selection ? (
                        <TableCell className="pl-4">
                          {rowSelectionControl(rowId)}
                        </TableCell>
                      ) : null}
                      {effectiveColumns.map((column) => (
                        <TableCell key={column.id} className={column.className}>
                          {column.cell(row, index)}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
          </TableBody>
        </Table>
      </div>

      {pagination && pagination.pageCount > 1 ? (
        <nav
          className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between"
          aria-label="Resultaatpagina’s"
        >
          <span className="text-muted-foreground">
            Pagina {pagination.page} van {pagination.pageCount}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
            >
              <ChevronLeft className="size-4" />
              Vorige
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.pageCount}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
            >
              Volgende
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </nav>
      ) : null}
    </section>
  );
}
