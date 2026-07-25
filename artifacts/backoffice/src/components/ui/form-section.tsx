import * as React from "react";

import { cn } from "@/lib/utils";

function FormSection({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  const titleId = React.useId();
  const descriptionId = React.useId();

  return (
    <section
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className={cn(
        "space-y-4 rounded-lg border border-border bg-card p-4 shadow-card sm:p-5",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id={titleId} className="text-base font-semibold text-foreground">
            {title}
          </h2>
          {description ? (
            <p
              id={descriptionId}
              className="mt-1 max-w-3xl text-sm text-muted-foreground"
            >
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
      <div className={cn("min-w-0", contentClassName)}>{children}</div>
    </section>
  );
}

export { FormSection };
