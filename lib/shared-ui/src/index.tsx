import * as React from "react";
import { cn } from "./utils";
import { statusLabels, statusTones, type StatusTone } from "./status";

export { cn, statusLabels, statusTones, type StatusTone };
export {
  SelectAdapter,
  type SelectAdapterChangeEvent,
} from "./radix-adapters/select-adapter";
export {
  CheckboxAdapter,
  type CheckboxAdapterChangeEvent,
} from "./radix-adapters/checkbox-adapter";
export { RadioGroup, RadioGroupItem } from "./radix-adapters/radio-group";
export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "./radix-adapters/modal";

export function SkipLink({
  href = "#main-content",
  children = "Direct naar hoofdinhoud",
}: {
  href?: string;
  children?: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-3 focus:text-foreground focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring"
    >
      {children}
    </a>
  );
}

export function PageContainer({
  children,
  className,
  size = "wide",
  as: Comp = "main",
  id = "main-content",
}: {
  children: React.ReactNode;
  className?: string;
  size?: "narrow" | "default" | "wide" | "full";
  as?: React.ElementType;
  id?: string;
}) {
  const sizes = {
    narrow: "max-w-3xl",
    default: "max-w-5xl",
    wide: "max-w-7xl",
    full: "max-w-none",
  };
  return (
    <Comp
      id={id}
      className={cn(
        "mx-auto w-full px-4 py-4 sm:px-6 sm:py-6 lg:px-8 motion-reduce:scroll-auto",
        sizes[size],
        className,
      )}
    >
      {children}
    </Comp>
  );
}

export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        {eyebrow ? (
          <p className="text-sm font-medium text-muted-foreground">{eyebrow}</p>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex min-h-11 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  );
}

export function SectionHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex min-h-11 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

export function FilterBar({
  children,
  summary,
  className,
}: {
  children: React.ReactNode;
  summary?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label="Filters"
      className={cn(
        "flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      {summary ? (
        <p className="text-sm text-muted-foreground">{summary}</p>
      ) : null}
      <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
        {children}
      </div>
    </section>
  );
}

export function StatusBadge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: StatusTone;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      data-status-tone={tone}
      className={cn(
        "inline-flex min-h-6 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        statusTones[tone],
        className,
      )}
    >
      {children ?? statusLabels[tone]}
    </span>
  );
}

export function MetricCard({
  label,
  value,
  description,
  tone = "neutral",
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  description?: React.ReactNode;
  tone?: StatusTone;
}) {
  return (
    <article className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
      {description ? (
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      ) : null}
      <span className="sr-only">Status: {statusLabels[tone]}</span>
    </article>
  );
}

export function DataTableShell({
  caption,
  children,
  className,
}: {
  caption: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-x-auto rounded-lg border border-border bg-card",
        className,
      )}
    >
      <table className="w-full min-w-[42rem] border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function MobileCardList<T>({
  items,
  empty,
  renderItem,
  label,
}: {
  items: T[];
  empty: React.ReactNode;
  renderItem: (item: T, index: number) => React.ReactNode;
  label: string;
}) {
  if (!items.length) return <>{empty}</>;
  return (
    <ul aria-label={label} className="grid gap-3 md:hidden">
      {items.map((item, index) => (
        <li
          key={index}
          className="rounded-lg border border-border bg-card p-4 shadow-sm"
        >
          {renderItem(item, index)}
        </li>
      ))}
    </ul>
  );
}

export function EmptyState({
  title = "Geen resultaten",
  description,
  action,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {description ? (
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
export function ErrorState({
  title = "Er is iets misgegaan",
  description,
  action,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-status-danger/30 bg-status-danger/10 p-4"
    >
      <h2 className="font-semibold text-status-danger-foreground">{title}</h2>
      {description ? (
        <p className="mt-1 text-sm text-status-danger-foreground/90">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
export function LoadingSkeleton({
  label = "Laden",
  rows = 3,
}: {
  label?: string;
  rows?: number;
}) {
  return (
    <div
      role="status"
      aria-label={label}
      className="space-y-3 motion-reduce:animate-none"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-10 animate-pulse rounded-md bg-muted motion-reduce:animate-none"
        />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function FormField({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  children: React.ReactElement<{
    id?: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
  }>;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {React.cloneElement(children, {
        id,
        "aria-describedby":
          [hintId, errorId].filter(Boolean).join(" ") || undefined,
        "aria-invalid": Boolean(error),
      })}
      {hint ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          id={errorId}
          className="text-sm font-medium text-status-danger-foreground"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Timeline({
  children,
  label = "Tijdlijn",
}: {
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <ol aria-label={label} className="space-y-4 border-l border-border pl-4">
      {children}
    </ol>
  );
}
export function TimelineItem({
  title,
  meta,
  children,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <li className="relative">
      <span
        aria-hidden="true"
        className="absolute -left-[1.35rem] top-1.5 size-2 rounded-full bg-primary"
      />
      <p className="font-medium text-foreground">{title}</p>
      {meta ? <p className="text-sm text-muted-foreground">{meta}</p> : null}
      {children ? (
        <div className="mt-2 text-sm text-muted-foreground">{children}</div>
      ) : null}
    </li>
  );
}
export function MetadataRow({
  items,
}: {
  items: Array<{ label: string; value: React.ReactNode }>;
}) {
  return (
    <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-muted-foreground">{item.label}</dt>
          <dd className="font-medium text-foreground">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
export function InlineFeedback({
  tone = "success",
  children,
}: {
  tone?: "success" | "danger" | "warning" | "info";
  children: React.ReactNode;
}) {
  return (
    <p
      role={tone === "danger" ? "alert" : "status"}
      className={cn("rounded-md border px-3 py-2 text-sm", statusTones[tone])}
    >
      {children}
    </p>
  );
}
export function ToastRegion({ children }: { children?: React.ReactNode }) {
  return (
    <div
      aria-live="polite"
      aria-relevant="additions text"
      className="fixed inset-x-4 top-4 z-50 flex flex-col gap-2 sm:left-auto sm:w-96"
    >
      {children}
    </div>
  );
}
export function IconOnlyButton({
  label,
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
