import type { ReactNode } from "react";
import Link from "next/link";

type PlatformRouteStateProps = {
  eyebrow?: string;
  title: string;
  description: string;
  action?: {
    href: string;
    label: string;
  };
  children?: ReactNode;
};

export function PlatformRouteState({ eyebrow = "Fieldgrid platform", title, description, action, children }: PlatformRouteStateProps) {
  return (
    <main className="min-h-full bg-slate-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-5 rounded border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <p className="text-sm font-medium text-slate-500">{eyebrow}</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
        </div>
        {children}
        {action && (
          <div>
            <Link
              href={action.href}
              className="inline-flex rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              {action.label}
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
