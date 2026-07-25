import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { cn } from "@/lib/utils";

export type TenantDetailMetaItem = {
  label: React.ReactNode;
  value: React.ReactNode;
};

export interface TenantDetailHeaderProps extends Omit<
  React.HTMLAttributes<HTMLElement>,
  "title"
> {
  backHref: string;
  backLabel: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  badges?: React.ReactNode;
  meta?: TenantDetailMetaItem[];
  actions?: React.ReactNode;
  summary?: React.ReactNode;
}

export function TenantDetailHeader({
  backHref,
  backLabel,
  title,
  description,
  badges,
  meta,
  actions,
  summary,
  className,
  ...props
}: TenantDetailHeaderProps) {
  return (
    <header
      className={cn(
        "rounded-lg border border-border bg-card px-4 py-4 shadow-card sm:px-5 sm:py-5",
        className,
      )}
      {...props}
    >
      <Link
        href={backHref}
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {backLabel}
      </Link>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 max-w-full break-words text-2xl font-semibold leading-tight text-foreground sm:text-3xl">
              {title}
            </h1>
            {badges}
          </div>
          {description && (
            <p className="max-w-3xl break-words text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          )}
          {meta && meta.length > 0 && (
            <dl className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
              {meta.map((item, index) => (
                <div
                  key={index}
                  className="min-w-0 max-w-full flex-wrap items-center gap-1.5 sm:flex"
                >
                  <dt className="font-medium text-muted-foreground">
                    {item.label}
                  </dt>
                  <dd className="break-words text-foreground">{item.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        {actions && (
          <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:shrink-0">
            {actions}
          </div>
        )}
      </div>

      {summary && <div className="mt-5">{summary}</div>}
    </header>
  );
}

export interface TenantDetailLayoutProps extends React.HTMLAttributes<HTMLDivElement> {
  aside?: React.ReactNode;
}

export function TenantDetailLayout({
  aside,
  className,
  children,
  ...props
}: TenantDetailLayoutProps) {
  return (
    <div
      className={cn(
        aside
          ? "grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_390px]"
          : "flex flex-col gap-6",
        className,
      )}
      {...props}
    >
      <div className="min-w-0">{children}</div>
      {aside}
    </div>
  );
}

export interface TenantDetailActionPanelProps extends Omit<
  React.HTMLAttributes<HTMLElement>,
  "title"
> {
  title?: React.ReactNode;
  description?: React.ReactNode;
}

export function TenantDetailActionPanel({
  title = "Acties",
  description,
  className,
  children,
  ...props
}: TenantDetailActionPanelProps) {
  return (
    <aside
      className={cn(
        "flex flex-col gap-4 xl:sticky xl:top-24 xl:self-start",
        className,
      )}
      {...props}
    >
      {(title || description) && (
        <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-card">
          {title && (
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          )}
          {description && (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      )}
      {children}
    </aside>
  );
}
