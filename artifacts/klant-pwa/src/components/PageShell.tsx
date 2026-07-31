import type { ReactNode } from "react";
import { MobilePageShell } from "./MobilePageShell";

export function PageShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <MobilePageShell title={title} subtitle={subtitle}>
      <div className="mx-auto w-full max-w-[1280px] space-y-4 md:px-1 md:py-1">
        <header
          className="hidden items-center justify-between gap-4 border-b px-1 pb-4 md:flex"
          style={{ borderColor: "var(--color-border)" }}
        >
          <div>
            <p
              className="mb-1 text-[11px] font-medium uppercase tracking-[0.14em]"
              style={{ color: "var(--color-accent)" }}
            >
              Klantportaal
            </p>
            <h1
              className="text-[26px] font-semibold leading-tight xl:text-[30px]"
              style={{ color: "var(--color-primary)" }}
            >
              {title}
            </h1>
            {subtitle ? (
              <p
                className="mt-1 max-w-3xl text-sm leading-6"
                style={{ color: "var(--color-secondary)" }}
              >
                {subtitle}
              </p>
            ) : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </header>
        {children}
      </div>
    </MobilePageShell>
  );
}
