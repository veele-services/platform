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
    <div className="min-h-[calc(100vh-4.2rem)] w-full min-w-0 overflow-x-hidden bg-[#F4F7FB] md:bg-transparent">
      <section className="min-w-0 bg-[#061F44] px-4 pb-10 pt-4 md:rounded-3xl md:bg-transparent md:px-6 md:pb-6">
        <h1 className="max-w-full break-words text-[29px] font-black leading-tight text-white md:text-3xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 max-w-full text-[15px] font-medium text-white/68">
            {subtitle}
          </p>
        ) : null}
      </section>

      <section className="-mt-7 min-h-[calc(100vh-14rem)] min-w-0 overflow-x-hidden rounded-t-[28px] bg-[#F4F7FB] px-3.5 pb-[calc(6.4rem+var(--safe-bottom))] pt-4 md:mt-0 md:min-h-0 md:rounded-3xl md:px-0 md:pb-0 md:pt-0">
        <div className="mx-auto w-full min-w-0 max-w-xl space-y-4 md:max-w-5xl xl:max-w-6xl">
          {children}
        </div>
      </section>
    </div>
  );
}
