import type { ReactNode } from "react";

export function MobilePageShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-[calc(100vh-4.2rem)] w-full min-w-0 overflow-x-hidden bg-[var(--color-muted)] md:min-h-0 md:bg-transparent">
      <section className="min-w-0 bg-[var(--color-primary)] px-4 pb-8 pt-4 md:bg-transparent md:px-0 md:pb-5 md:pt-0">
        <h1 className="max-w-full break-words text-2xl font-semibold leading-tight text-white md:text-[26px] md:text-[var(--color-primary)]">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 max-w-3xl text-sm font-normal text-white/70 md:text-[var(--color-secondary)]">
            {subtitle}
          </p>
        ) : null}
      </section>

      <section className="-mt-5 min-h-[calc(100vh-14rem)] min-w-0 overflow-x-hidden rounded-t-2xl bg-[var(--color-muted)] px-3.5 pb-[calc(6.4rem+var(--safe-bottom))] pt-4 md:mt-0 md:min-h-0 md:rounded-none md:px-0 md:pb-0 md:pt-0">
        <div className="mx-auto w-full min-w-0 max-w-xl space-y-3 md:max-w-5xl xl:max-w-6xl">
          {children}
        </div>
      </section>
    </div>
  );
}
