import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { getBreadcrumbs, type SitePage } from "@/lib/site";

export function Breadcrumbs({ page }: { page: SitePage }) {
  if (page.slug === "/") return null;
  const items = getBreadcrumbs(page);

  return (
    <nav className="border-b border-[var(--line)] bg-white" aria-label="Kruimelpad">
      <ol className="container-shell flex min-h-14 items-center gap-2 overflow-x-auto py-3 text-xs text-slate-500">
        {items.map((item, index) => {
          const current = index === items.length - 1;
          return (
            <li key={item.href} className="flex shrink-0 items-center gap-2">
              {index > 0 && <ChevronRight aria-hidden="true" className="size-3 text-slate-300" />}
              {current ? (
                <span aria-current="page" className="max-w-52 truncate font-semibold text-brand-navy-900">{item.name}</span>
              ) : (
                <Link className="inline-flex items-center gap-1.5 rounded-sm transition-colors hover:text-brand-aqua-deep" href={item.href}>
                  {index === 0 && <Home aria-hidden="true" className="size-3" />}{item.name}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
