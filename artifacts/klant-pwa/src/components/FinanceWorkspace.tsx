import type { ReactNode } from "react";

type FinanceTone = "neutral" | "accent" | "success" | "warning" | "danger";

type FinanceSummaryItem = {
  label: string;
  value: string;
  description: string;
  icon: ReactNode;
  tone?: FinanceTone;
};

const toneStyles: Record<
  FinanceTone,
  { bg: string; color: string; border: string }
> = {
  neutral: {
    bg: "var(--color-muted)",
    color: "var(--color-secondary)",
    border: "var(--color-border)",
  },
  accent: {
    bg: "rgba(0,183,179,0.10)",
    color: "var(--color-accent-accessible)",
    border: "rgba(0,183,179,0.22)",
  },
  success: {
    bg: "rgba(16,185,129,0.10)",
    color: "var(--color-success)",
    border: "rgba(16,185,129,0.22)",
  },
  warning: {
    bg: "rgba(245,158,11,0.12)",
    color: "var(--color-warning)",
    border: "rgba(245,158,11,0.24)",
  },
  danger: {
    bg: "rgba(239,68,68,0.10)",
    color: "var(--color-destructive)",
    border: "rgba(239,68,68,0.22)",
  },
};

export function FinanceSummaryStrip({
  items,
}: {
  items: FinanceSummaryItem[];
}) {
  return (
    <section
      className="grid gap-2 rounded-xl border bg-white p-2 sm:grid-cols-2 xl:grid-cols-4"
      style={{ borderColor: "var(--color-border)" }}
    >
      {items.map((item) => {
        const tone = toneStyles[item.tone ?? "neutral"];
        return (
          <article
            key={item.label}
            className="min-w-0 rounded-lg border px-3 py-2.5"
            style={{ borderColor: tone.border, backgroundColor: "#FFFFFF" }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p
                  className="truncate text-[11px] font-semibold uppercase"
                  style={{ color: "var(--color-muted-fg)" }}
                >
                  {item.label}
                </p>
                <p
                  className="mt-1 truncate text-lg font-semibold leading-tight"
                  style={{ color: "var(--color-primary)" }}
                >
                  {item.value}
                </p>
              </div>
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: tone.bg, color: tone.color }}
              >
                {item.icon}
              </span>
            </div>
            <p
              className="mt-2 line-clamp-2 text-xs font-semibold leading-5"
              style={{ color: "var(--color-secondary)" }}
            >
              {item.description}
            </p>
          </article>
        );
      })}
    </section>
  );
}

export function FinanceSectionHeader({
  icon,
  title,
  subtitle,
  action,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--color-accent)_10%,white)] text-[var(--color-accent-accessible)]">
          {icon}
        </span>
        <div className="min-w-0">
          <h2
            className="text-base font-semibold"
            style={{ color: "var(--color-primary)" }}
          >
            {title}
          </h2>
          <p
            className="text-sm font-semibold"
            style={{ color: "var(--color-secondary)" }}
          >
            {subtitle}
          </p>
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function FinanceActionPanel({
  eyebrow,
  title,
  description,
  tone = "accent",
  action,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  tone?: FinanceTone;
  action?: ReactNode;
  children: ReactNode;
}) {
  const style = toneStyles[tone];

  return (
    <section
      className="rounded-xl border bg-white p-4"
      style={{ borderColor: style.border }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p
            className="text-[11px] font-medium uppercase"
            style={{ color: style.color }}
          >
            {eyebrow}
          </p>
          <h2
            className="mt-1 text-base font-semibold"
            style={{ color: "var(--color-primary)" }}
          >
            {title}
          </h2>
          <p
            className="mt-1 text-sm font-semibold leading-6"
            style={{ color: "var(--color-secondary)" }}
          >
            {description}
          </p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
