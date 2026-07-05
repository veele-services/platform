import * as React from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface TenantToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
  search?: React.ReactNode;
  filters?: React.ReactNode;
  actions?: React.ReactNode;
  activeFilters?: React.ReactNode;
}

export function TenantToolbar({
  search,
  filters,
  actions,
  activeFilters,
  className,
  children,
  ...props
}: TenantToolbarProps) {
  return (
    <div className={cn("rounded-lg border border-border bg-card p-3 shadow-card", className)} {...props}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          {search}
          {filters}
          {children}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {activeFilters && <div className="mt-3 border-t border-border pt-3">{activeFilters}</div>}
    </div>
  );
}

export interface TenantToolbarSearchProps extends Omit<React.ComponentProps<typeof Input>, "type"> {
  wrapperClassName?: string;
}

export function TenantToolbarSearch({
  className,
  wrapperClassName,
  placeholder = "Zoeken",
  ...props
}: TenantToolbarSearchProps) {
  return (
    <div className={cn("relative min-w-0 flex-1 sm:max-w-sm", wrapperClassName)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input className={cn("pl-9", className)} placeholder={placeholder} type="search" {...props} />
    </div>
  );
}

export type TenantActiveFilter = {
  id: string;
  label: React.ReactNode;
  value?: React.ReactNode;
  href?: string;
  onRemove?: () => void;
};

export interface TenantActiveFiltersProps extends React.HTMLAttributes<HTMLDivElement> {
  filters: TenantActiveFilter[];
  clearAll?: React.ReactNode;
  emptyLabel?: React.ReactNode;
}

export function TenantActiveFilters({
  filters,
  clearAll,
  emptyLabel = "Geen actieve filters",
  className,
  ...props
}: TenantActiveFiltersProps) {
  if (filters.length === 0) {
    return (
      <div className={cn("text-xs text-muted-foreground", className)} {...props}>
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)} {...props}>
      {filters.map((filter) => {
        const label = (
          <>
            <span className="font-medium">{filter.label}</span>
            {filter.value && <span className="text-muted-foreground">{filter.value}</span>}
          </>
        );

        return (
          <Badge key={filter.id} variant="outline" className="gap-1.5 bg-white">
            {filter.href ? (
              <Link href={filter.href} className="inline-flex items-center gap-1.5">
                {label}
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1.5">{label}</span>
            )}
            {filter.onRemove && (
              <button
                type="button"
                onClick={filter.onRemove}
                className="rounded-sm text-muted-foreground hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <X className="h-3 w-3" />
                <span className="sr-only">Filter verwijderen</span>
              </button>
            )}
          </Badge>
        );
      })}
      {clearAll && (
        <Button type="button" variant="ghost" size="sm" asChild={typeof clearAll !== "string"}>
          {typeof clearAll === "string" ? <span>{clearAll}</span> : clearAll}
        </Button>
      )}
    </div>
  );
}
