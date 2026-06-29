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
      <div className="mx-auto w-full max-w-[1500px] space-y-5 md:px-1 md:py-1 xl:space-y-6">
        <header
          className="hidden items-center justify-between gap-5 rounded-[22px] border bg-white px-6 py-5 shadow-sm md:flex"
          style={{ borderColor: "var(--color-border)" }}
        >
          <div>
            <p
              className="mb-1 text-[11px] font-black uppercase tracking-[0.18em]"
              style={{ color: "var(--color-accent)" }}
            >
              Klantportaal
            </p>
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
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </header>
        {children}
      </div>
    </MobilePageShell>
  );
}
