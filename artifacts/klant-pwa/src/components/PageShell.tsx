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
      <div className="mx-auto w-full max-w-7xl space-y-5 md:px-2 md:py-2">
        <header className="hidden items-end justify-between gap-4 md:flex">
          <div>
            <h1 className="text-[30px] font-black leading-tight" style={{ color: "var(--color-primary)" }}>
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-1 text-sm font-medium" style={{ color: "var(--color-secondary)" }}>
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
