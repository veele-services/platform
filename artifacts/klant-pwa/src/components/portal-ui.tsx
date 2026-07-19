import Link from "next/link";
import { Search } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { MobilePageShell } from "./MobilePageShell";

type PortalTone = "neutral" | "accent" | "success" | "warning" | "danger";

type PortalStatus = {
  label: string;
  tone?: PortalTone;
};

type PortalAction = {
  label: string;
  href: string;
};

type PortalFilter = {
  label: string;
  href: string;
};

const toneStyles: Record<PortalTone, CSSProperties> = {
  neutral: {
    backgroundColor: "rgba(100,116,139,0.10)",
    color: "var(--color-secondary)",
  },
  accent: {
    backgroundColor: "rgba(0,183,179,0.10)",
    color: "var(--color-accent-accessible)",
  },
  success: {
    backgroundColor: "rgba(16,185,129,0.10)",
    color: "var(--color-success)",
  },
  warning: {
    backgroundColor: "rgba(245,158,11,0.12)",
    color: "#92400E",
  },
  danger: {
    backgroundColor: "rgba(239,68,68,0.10)",
    color: "var(--color-destructive)",
  },
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function PortalPageShell({
  title,
  subtitle,
  eyebrow = "Klantportaal",
  context,
  status,
  primaryAction,
  actions,
  children,
  size = "wide",
  className,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  context?: ReactNode;
  status?: PortalStatus;
  primaryAction?: PortalAction;
  actions?: ReactNode;
  children: ReactNode;
  size?: "default" | "wide";
  className?: string;
}) {
  return (
    <MobilePageShell title={title} subtitle={subtitle}>
      <div
        className={cx(
          "mx-auto w-full space-y-5 md:px-1 md:py-1 xl:space-y-6",
          size === "wide" ? "max-w-[1500px]" : "max-w-6xl",
          className,
        )}
      >
        <PortalPageHeader
          title={title}
          subtitle={subtitle}
          eyebrow={eyebrow}
          context={context}
          status={status}
          primaryAction={primaryAction}
          actions={actions}
          className="hidden md:flex"
        />
        {children}
      </div>
    </MobilePageShell>
  );
}

export function PortalPageHeader({
  title,
  subtitle,
  eyebrow = "Klantportaal",
  context,
  status,
  primaryAction,
  actions,
  className,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  context?: ReactNode;
  status?: PortalStatus;
  primaryAction?: PortalAction;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cx(
        "items-start justify-between gap-5 rounded-2xl border bg-white px-6 py-5 shadow-sm",
        className,
      )}
      style={{ borderColor: "var(--color-border)" }}
    >
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <p
            className="text-[11px] font-black uppercase"
            style={{ color: "var(--color-accent-accessible)" }}
          >
            {eyebrow}
          </p>
          {status ? <PortalStatusBadge status={status} /> : null}
          {context ? (
            <span
              className="text-xs font-semibold"
              style={{ color: "var(--color-muted-fg)" }}
            >
              {context}
            </span>
          ) : null}
        </div>
        <h1
          className="text-[28px] font-black leading-tight xl:text-[32px]"
          style={{ color: "var(--color-primary)" }}
        >
          {title}
        </h1>
        {subtitle ? (
          <p
            className="mt-1 max-w-3xl text-sm font-semibold leading-6"
            style={{ color: "var(--color-secondary)" }}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
      {(primaryAction || actions) ? (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {actions}
          {primaryAction ? (
            <Link
              href={primaryAction.href}
              className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-black text-white shadow-sm transition-opacity hover:opacity-90"
              style={{ backgroundColor: "var(--color-accent-accessible)" }}
            >
              {primaryAction.label}
            </Link>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}

export function PortalToolbar({
  children,
  actions,
  resultLabel,
  activeFilters,
  className,
}: {
  children?: ReactNode;
  actions?: ReactNode;
  resultLabel?: string;
  activeFilters?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx("rounded-2xl border bg-white p-3 shadow-sm", className)}
      style={{ borderColor: "var(--color-border)" }}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          {children}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {resultLabel ? (
            <span
              className="rounded-xl px-3 py-2 text-xs font-black"
              style={{
                backgroundColor: "var(--color-muted)",
                color: "var(--color-secondary)",
              }}
            >
              {resultLabel}
            </span>
          ) : null}
          {actions}
        </div>
      </div>
      {activeFilters ? <div className="mt-3">{activeFilters}</div> : null}
    </section>
  );
}

export function PortalToolbarSearch({
  name = "q",
  defaultValue,
  placeholder = "Zoeken",
  className,
}: {
  name?: string;
  defaultValue?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={cx("relative min-w-0 flex-1 sm:max-w-sm", className)}>
      <span className="sr-only">{placeholder}</span>
      <Search
        size={16}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
        style={{ color: "var(--color-muted-fg)" }}
      />
      <input
        type="search"
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="h-10 w-full rounded-xl border bg-white py-2 pl-9 pr-3 text-sm font-semibold outline-none transition-shadow focus:shadow-[0_0_0_3px_rgba(0,183,179,0.14)]"
        style={{
          borderColor: "var(--color-border)",
          color: "var(--color-primary)",
        }}
      />
    </label>
  );
}

export function PortalToolbarSelect({
  name,
  defaultValue,
  label,
  children,
  className,
}: {
  name: string;
  defaultValue?: string;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx("min-w-0 sm:w-48", className)}>
      <span className="sr-only">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="h-10 w-full rounded-xl border bg-white px-3 text-sm font-black outline-none transition-shadow focus:shadow-[0_0_0_3px_rgba(0,183,179,0.14)]"
        style={{
          borderColor: "var(--color-border)",
          color: "var(--color-primary)",
        }}
      >
        {children}
      </select>
    </label>
  );
}

export function PortalActiveFilterChips({
  filters,
  clearHref = "?",
}: {
  filters: PortalFilter[];
  clearHref?: string;
}) {
  if (filters.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className="text-xs font-black"
        style={{ color: "var(--color-muted-fg)" }}
      >
        Actieve filters
      </span>
      {filters.map((filter) => (
        <Link
          key={`${filter.label}-${filter.href}`}
          href={filter.href}
          className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-black transition-colors hover:bg-slate-50"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-primary)",
          }}
        >
          {filter.label}
          <span aria-hidden="true" style={{ color: "var(--color-muted-fg)" }}>
            x
          </span>
        </Link>
      ))}
      <Link
        href={clearHref}
        className="text-xs font-black"
        style={{ color: "var(--color-accent)" }}
      >
        Wis alles
      </Link>
    </div>
  );
}

export type PortalDataColumn<TItem> = {
  key: string;
  header: ReactNode;
  render: (item: TItem) => ReactNode;
  className?: string;
  cellClassName?: string;
  align?: "left" | "right";
};

export function PortalDataList<TItem>({
  items,
  columns,
  getItemKey,
  renderMobileCard,
  emptyState,
  tableLabel,
  className,
}: {
  items: TItem[];
  columns: Array<PortalDataColumn<TItem>>;
  getItemKey: (item: TItem) => string;
  renderMobileCard: (item: TItem) => ReactNode;
  emptyState: {
    icon?: ReactNode;
    title: string;
    description?: string;
    action?: ReactNode;
  };
  tableLabel: string;
  className?: string;
}) {
  if (items.length === 0) {
    return (
      <PortalEmptyState
        icon={emptyState.icon}
        title={emptyState.title}
        description={emptyState.description}
        action={emptyState.action}
      />
    );
  }

  return (
    <section className={cx("space-y-3", className)}>
      <div
        className="hidden overflow-x-auto rounded-2xl border bg-white shadow-sm md:block"
        style={{ borderColor: "var(--color-border)" }}
      >
        <table className="min-w-full text-left" aria-label={tableLabel}>
          <thead>
            <tr
              className="border-b text-xs font-black uppercase"
              style={{
                borderColor: "var(--color-border)",
                color: "var(--color-secondary)",
              }}
            >
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cx(
                    "whitespace-nowrap px-5 py-3",
                    column.align === "right" && "text-right",
                    column.className,
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody
            className="divide-y"
            style={{ borderColor: "var(--color-border)" }}
          >
            {items.map((item) => (
              <tr key={getItemKey(item)} className="align-middle">
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cx(
                      "px-5 py-4 text-sm",
                      column.align === "right" && "text-right",
                      column.cellClassName,
                    )}
                  >
                    {column.render(item)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 md:hidden">
        {items.map((item) => (
          <div key={getItemKey(item)}>{renderMobileCard(item)}</div>
        ))}
      </div>
    </section>
  );
}

function PortalStatusBadge({ status }: { status: PortalStatus }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-black"
      style={toneStyles[status.tone ?? "neutral"]}
    >
      {status.label}
    </span>
  );
}

function PortalEmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div
      className="rounded-2xl border bg-white p-8 text-center shadow-sm"
      style={{ borderColor: "var(--color-border)" }}
    >
      {icon ? <div className="mb-3 flex justify-center">{icon}</div> : null}
      <p className="text-sm font-black" style={{ color: "var(--color-primary)" }}>
        {title}
      </p>
      {description ? (
        <p
          className="mx-auto mt-1 max-w-md text-xs font-semibold leading-5"
          style={{ color: "var(--color-secondary)" }}
        >
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
