import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

export type TenantPageBreadcrumb = {
  label: React.ReactNode;
  href?: string;
};

export interface TenantPageHeaderProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
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
        "rounded-lg border border-border bg-card px-4 py-4 shadow-card sm:px-5 sm:py-5",
        className,
      )}
      {...props}
    >
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          {breadcrumbs.map((item, index) => {
            const isLast = index === breadcrumbs.length - 1;
            const content = item.href && !isLast ? (
              <Link href={item.href} className="rounded-sm hover:text-foreground hover:underline">
                {item.label}
              </Link>
            ) : (
              <span className={cn(isLast && "font-medium text-foreground")}>{item.label}</span>
            );

            return (
              <React.Fragment key={`${index}-${String(item.label)}`}>
                {content}
                {!isLast && <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
              </React.Fragment>
            );
          })}
        </nav>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          {eyebrow && <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{eyebrow}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 max-w-full break-words text-2xl font-semibold leading-tight text-foreground sm:text-3xl">{title}</h1>
            {badges}
          </div>
          {description && <p className="max-w-3xl break-words text-sm leading-6 text-muted-foreground">{description}</p>}
          {meta && <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">{meta}</div>}
        </div>
        {actions && <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:shrink-0">{actions}</div>}
      </div>
    </header>
  );
}
