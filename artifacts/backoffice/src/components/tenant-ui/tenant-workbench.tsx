import * as React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

type WorkbenchTone = "neutral" | "success" | "warning" | "danger" | "info";

const toneClass: Record<WorkbenchTone, string> = {
  neutral: "border-border bg-card text-foreground",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  danger: "border-red-200 bg-red-50 text-red-900",
  info: "border-sky-200 bg-sky-50 text-sky-900",
};

export interface TenantCommandBarProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  search?: React.ReactNode;
  filters?: React.ReactNode;
  actions?: React.ReactNode;
  activeFilters?: React.ReactNode;
}

export function TenantCommandBar({
  title,
  description,
  search,
  filters,
  actions,
  activeFilters,
  className,
  children,
  ...props
}: TenantCommandBarProps) {
  return (
    <div className={cn("rounded-lg border border-border bg-card p-3 shadow-card", className)} {...props}>
      {(title || description || actions) && (
        <div className="mb-3 flex flex-col gap-3 border-b border-border pb-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-1">
            {title && <h2 className="text-sm font-semibold text-foreground">{title}</h2>}
            {description && <p className="max-w-3xl text-xs leading-5 text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          {search}
          {filters}
          {children}
        </div>
      </div>
      {activeFilters && <div className="mt-3 border-t border-border pt-3">{activeFilters}</div>}
    </div>
  );
}

export type TenantConflictStripItem = {
  label: React.ReactNode;
  value: React.ReactNode;
  description?: React.ReactNode;
  tone?: WorkbenchTone;
  href?: string;
};

export interface TenantConflictStripProps extends React.HTMLAttributes<HTMLDivElement> {
  items: TenantConflictStripItem[];
}

export function TenantConflictStrip({
  items,
  className,
  ...props
}: TenantConflictStripProps) {
  if (items.length === 0) return null;

  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-4", className)} {...props}>
      {items.map((item, index) => {
        const tone = item.tone ?? "neutral";
        const content = (
          <div className={cn("h-full rounded-lg border px-4 py-3 shadow-card", toneClass[tone])}>
            <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{item.label}</p>
            <p className="mt-2 text-2xl font-semibold leading-none">{item.value}</p>
            {item.description && <p className="mt-1 text-xs leading-5 opacity-75">{item.description}</p>}
          </div>
        );

        return item.href ? (
          <Link key={index} href={item.href} className="block transition hover:-translate-y-0.5 hover:shadow-md">
            {content}
          </Link>
        ) : (
          <div key={index}>{content}</div>
        );
      })}
    </div>
  );
}

export interface TenantWorkbenchLayoutProps extends React.HTMLAttributes<HTMLDivElement> {
  aside?: React.ReactNode;
  asidePosition?: "right" | "left";
}

export function TenantWorkbenchLayout({
  aside,
  asidePosition = "right",
  className,
  children,
  ...props
}: TenantWorkbenchLayoutProps) {
  const asideNode = aside ? <div className="min-w-0">{aside}</div> : null;
  const mainNode = <div className="min-w-0">{children}</div>;

  return (
    <div
      className={cn(
        aside ? "grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_390px]" : "grid gap-4",
        className,
      )}
      {...props}
    >
      {asidePosition === "left" && asideNode}
      {mainNode}
      {asidePosition === "right" && asideNode}
    </div>
  );
}

export interface TenantWorkbenchPanelProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}

export function TenantWorkbenchPanel({
  title,
  description,
  actions,
  className,
  children,
  ...props
}: TenantWorkbenchPanelProps) {
  return (
    <section className={cn("rounded-lg border border-border bg-card shadow-card", className)} {...props}>
      {(title || description || actions) && (
        <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            {title && <h2 className="text-sm font-semibold text-foreground">{title}</h2>}
            {description && <p className="max-w-2xl text-xs leading-5 text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
