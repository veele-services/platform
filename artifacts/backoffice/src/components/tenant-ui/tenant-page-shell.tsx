import * as React from "react";

import { cn } from "@/lib/utils";

type TenantPageShellSize = "narrow" | "default" | "wide";

const shellSizeClass: Record<TenantPageShellSize, string> = {
  narrow: "max-w-5xl",
  default: "max-w-[1400px]",
  wide: "max-w-[1600px]",
};

export interface TenantPageShellProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: TenantPageShellSize;
}

export function TenantPageShell({
  className,
  size = "wide",
  ...props
}: TenantPageShellProps) {
  return (
    <div
      className={cn(
        "platform-page mx-auto flex w-full flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8",
        shellSizeClass[size],
        className,
      )}
      {...props}
    />
  );
}

export interface TenantPageSectionProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}

export function TenantPageSection({
  title,
  description,
  actions,
  className,
  children,
  ...props
}: TenantPageSectionProps) {
  return (
    <section className={cn("flex flex-col gap-4", className)} {...props}>
      {(title || description || actions) && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            {title && <h2 className="text-lg font-semibold leading-7 text-foreground">{title}</h2>}
            {description && <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
