import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

export type TenantPageBreadcrumb = {
  label: React.ReactNode;
  href?: string;
};

export interface TenantPageHeaderProps extends Omit<
  React.HTMLAttributes<HTMLElement>,
  "title"
> {
  title: React.ReactNode;
  description?: React.ReactNode;
  breadcrumbs?: TenantPageBreadcrumb[];
  eyebrow?: React.ReactNode;
  badges?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
}

export function TenantPageHeader({
  title,
  description,
  breadcrumbs,
  eyebrow,
  badges,
  meta,
  actions,
  className,
  ...props
}: TenantPageHeaderProps) {
  return (
    <header
      className={cn(
        "border-b border-border bg-transparent px-0 pb-3 pt-0.5 sm:pb-4",
        className,
      )}
      {...props}
    >
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav
          aria-label="Breadcrumb"
          className="mb-2 flex flex-wrap items-center gap-1 text-xs text-muted-foreground"
        >
          {breadcrumbs.map((item, index) => {
            const isLast = index === breadcrumbs.length - 1;
            const content =
              item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="rounded-sm hover:text-foreground hover:underline"
                >
                  {item.label}
                </Link>
              ) : (
                <span className={cn(isLast && "font-medium text-foreground")}>
                  {item.label}
                </span>
              );

            return (
              <React.Fragment key={`${index}-${String(item.label)}`}>
                {content}
                {!isLast && (
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </React.Fragment>
            );
          })}
        </nav>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-1.5">
          {eyebrow && (
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {eyebrow}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 max-w-full break-words text-xl font-semibold leading-tight text-foreground sm:text-[22px]">
              {title}
            </h1>
            {badges}
          </div>
          {description && (
            <p className="max-w-3xl break-words text-[13px] leading-5 text-muted-foreground">
              {description}
            </p>
          )}
          {meta && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {meta}
            </div>
          )}
        </div>
        {actions && (
          <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:shrink-0">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
